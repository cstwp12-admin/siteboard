import * as pdfjsLib from '../vendor/pdf.min.mjs';
import { extractPages, parseReport, decodeEmbedded, applyEmbedded } from './parser.js';
import { dbAll, dbPut, dbDel } from './db.js';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
export { pdfjsLib };

export const fileIndex = new Map();   // path -> File (kept in memory for photo extraction)
const SIG = (f)=>f.size+'-'+f.lastModified;
const isPdf = (n)=>/\.pdf$/i.test(n);

async function walk(dir, prefix, out){
  for await (const [name, h] of dir.entries()){
    if(h.kind==='directory'){ if(!name.startsWith('.') && !name.startsWith('_')) await walk(h, prefix+name+'/', out); }
    else if(h.kind==='file' && isPdf(name)){ out.push({ path:prefix+name, name, handle:h }); }
  }
}
export async function listHandle(dirHandle){
  const out=[]; await walk(dirHandle,'',out);
  for(const e of out){ try{ e.file=await e.handle.getFile(); }catch(_){ e.file=null; } }
  return out.filter(e=>e.file);
}
export function listFileObjects(files){
  return [...files].filter(f=>isPdf(f.name)).map(f=>({ path:(f.webkitRelativePath||f.name).split('/').slice(1).join('/')||f.name, name:f.name, file:f }));
}

// entries: [{path,name,file}] -> returns {reports, changed, errors}
export async function sync(entries, onProgress=()=>{}){
  const cached = new Map(await dbAll('reports'));
  const byNameSig=new Map(); for(const [k,v] of cached) if(v&&v.report) byNameSig.set(v.report.file+'|'+v.sig,v);
  const seen = new Set(); const reports=[]; const todo=[]; const errors=[];
  for(const e of entries){
    seen.add(e.path); fileIndex.set(e.path, e.file);
    let c=cached.get(e.path);
    if(!(c && c.sig===SIG(e.file) && c.v===6 && c.report)){ c=byNameSig.get(e.name+'|'+SIG(e.file)); if(c){ c={...c,report:{...c.report,path:e.path}}; dbPut('reports',e.path,c); } }   // file moved/renamed folder: reuse parse
    if(c && c.sig===SIG(e.file) && c.v===6 && c.report) reports.push(c.report); else todo.push(e);
  }
  let done=0, changed=0;
  const worker=async()=>{
    while(todo.length){
      const e=todo.shift();
      try{
        const buf=new Uint8Array(await e.file.arrayBuffer());
        const doc=await pdfjsLib.getDocument({data:buf}).promise;
        const pages=await extractPages(doc);
        let emb=null; try{ const md=await doc.getMetadata(); emb=await decodeEmbedded(md&&md.info&&md.info.Keywords); }catch(_){}
        await doc.destroy();
        const r=parseReport(pages,{name:e.name,path:e.path,size:e.file.size,mtime:e.file.lastModified});
        if(emb) applyEmbedded(r,emb);
        reports.push(r); changed++;
        await dbPut('reports',e.path,{sig:SIG(e.file),v:6,report:r});
      }catch(err){ errors.push({path:e.path,name:e.name,error:String(err.message||err)}); }
      onProgress(++done, done+todo.length);
    }
  };
  await Promise.all([worker(),worker()]);
  for(const k of cached.keys()) if(!seen.has(k)){ await dbDel('reports',k); changed++; }
  return { all: reports.slice(), reports: dedupe(reports), changed, errors, fileCount: entries.length };
}

// Same report reference exported twice (e.g. "... (1).pdf"): keep the newest file.
export function dedupe(reports){
  const by=new Map();
  for(const r of reports){
    const k=r.ref; const p=by.get(k);
    if(!p || r.mtime>p.mtime){ r.dupes=(p?p.dupes||[]:[]).concat(p?[p.file]:[]); by.set(k,r); }
    else { p.dupes=(p.dupes||[]).concat([r.file]); }
  }
  return [...by.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.code.localeCompare(b.code)||a.seq-b.seq);
}

// ---- shared settings file kept in the report folder
export const SETTINGS_FILE='siteboard-settings.json';
export async function readSettingsFile(dir){
  try{ const h=await dir.getFileHandle(SETTINGS_FILE); const f=await h.getFile(); return JSON.parse(await f.text()); }catch(_){ return null; }
}
export async function writeSettingsFile(dir,obj){
  const h=await dir.getFileHandle(SETTINGS_FILE,{create:true}); const w=await h.createWritable(); await w.write(JSON.stringify(obj,null,2)); await w.close();
}

// ---- Tidy: file loose PDFs into YYYY-MM folders, duplicates into _duplicates (nothing is deleted except the source after a verified copy)
const MONTH_RE=/^\d{4}-\d{2}$/;
export function tidyPlan(entries, reports){
  const byPath=new Map(reports.map(r=>[r.path,r])); const keep=new Map(); // ref -> chosen path
  const plan=[];
  const refGroups=new Map();
  for(const e of entries){ const r=byPath.get(e.path); if(!r) continue; (refGroups.get(r.ref)||refGroups.set(r.ref,[]).get(r.ref)).push({e,r}); }
  for(const [ref,g] of refGroups){
    g.sort((a,b)=>b.e.file.lastModified-a.e.file.lastModified);
    g.forEach(({e,r},i)=>{
      const parts=e.path.split('/'); const name=parts.pop(); const dir=parts.join('/');
      if(i>0 && g.length>1){ if(!dir.startsWith('_duplicates')) plan.push({kind:'duplicate',from:e.path,to:'_duplicates/'+name,ref,date:r.date}); return; }
      const month=r.date.slice(0,7); const want=month;
      if(dir!==want) plan.push({kind:'move',from:e.path,to:want+'/'+name,ref,date:r.date});
    });
  }
  return plan;
}
async function dirFor(root,path,create){
  let d=root; for(const part of path.split('/').filter(Boolean)) d=await d.getDirectoryHandle(part,{create}); return d;
}
export async function tidyApply(root, plan, onProgress=()=>{}){
  const done=[], failed=[]; let n=0;
  for(const p of plan){
    try{
      const fromParts=p.from.split('/'); const fname=fromParts.pop(); const fdir=await dirFor(root,fromParts.join('/'),false);
      const toParts=p.to.split('/'); let tname=toParts.pop(); const tdir=await dirFor(root,toParts.join('/'),true);
      const srcH=await fdir.getFileHandle(fname); const src=await srcH.getFile();
      // never overwrite: pick a free name
      let final=tname, k=1; while(true){ try{ await tdir.getFileHandle(final); const dot=tname.lastIndexOf('.'); final=tname.slice(0,dot)+'_'+(k++)+tname.slice(dot); }catch(_){ break; } }
      let moved=false;
      if(typeof srcH.move==='function'){ try{ await srcH.move(tdir,final); moved=true; }catch(_){} }
      if(!moved){
        const dst=await tdir.getFileHandle(final,{create:true}); const w=await dst.createWritable(); await w.write(src); await w.close();
        const chk=await (await tdir.getFileHandle(final)).getFile();
        if(chk.size!==src.size) throw new Error('copy verification failed');
        await fdir.removeEntry(fname);
      }
      done.push(p);
    }catch(e){ failed.push({...p,error:String(e.message||e)}); }
    onProgress(++n,plan.length);
  }
  return {done,failed};
}
