// Issued register: everything sent or produced (memos, messages, reports, shared pictures), plus memo numbering and the session log.
// Entries live in the settings (shared through siteboard-settings.json); the files are saved in <reports folder>/_SiteBoard/Issued/<year>/.
import { esc } from './charts.js';
import { getProfile, POSITIONS, wsActive } from './workspace.js';

export const DEFAULT_TPL='SB/{TEAM}/{ROLE}/MEMO/{YEAR}/{NNN}';
const KINDS=['Memo','Message','Report','Share'];
const when=(t)=>new Date(t).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const safe=(s)=>String(s||'').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim();

export function makeIssued(ctx){
  const { S, $, drawer, saveLS, render } = ctx;
  const L=()=>S.settings;
  const list=()=>L().issued=L().issued||[];
  const who=()=>{ const p=getProfile(); return p.name?`${p.name}${p.position?' ('+p.position+')':''}`:''; };
  const wsx=()=>L().ws||{};

  // keep older "sent messages" in the register
  function migrate(){ if(L().msgLog&&L().msgLog.length){ const have=new Set(list().map(e=>e.id)); for(const e of L().msgLog) if(!have.has(e.id)) list().push({...e,kind:'Message'}); L().msgLog=[]; list().sort((a,b)=>b.t-a.t); saveLS(); } }

  function add(e){
    const kind=KINDS.includes(e.kind)?e.kind:(String(e.kind).toLowerCase()==='message'?'Message':'Message');
    const rec={id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),t:Date.now(),by:who(),...e,kind};
    if(kind==='Memo'&&rec.no){ const old=list().find(x=>x.kind==='Memo'&&x.no===rec.no); if(old){ Object.assign(old,rec,{id:old.id,first:old.first||old.t}); saveLS(); return old; } }
    list().unshift(rec); L().issued=list().slice(0,800); saveLS(); return rec;
  }

  // ---- files in the reports folder
  async function exists(d,n){ try{ await d.getFileHandle(n); return true; }catch(_){ return false; } }
  async function saveFile(name,blob){
    const h=S.dirHandle; if(!h||!blob) return '';
    try{ let p=await h.queryPermission({mode:'readwrite'}); if(p!=='granted') p=await h.requestPermission({mode:'readwrite'}); if(p!=='granted') return '';
      const y=String(new Date().getFullYear()); let d=await h.getDirectoryHandle('_SiteBoard',{create:true}); d=await d.getDirectoryHandle('Issued',{create:true}); d=await d.getDirectoryHandle(y,{create:true});
      let n=safe(name)||'file', i=1; while(await exists(d,n)){ i++; n=safe(name).replace(/(\.[^.]+)$/,`-${i}$1`); if(i>50) break; }
      const fh=await d.getFileHandle(n,{create:true}); const w=await fh.createWritable(); await w.write(blob); await w.close(); return `_SiteBoard/Issued/${y}/${n}`;
    }catch(e){ console.warn('Could not save the issued file',e); return ''; }
  }
  async function record(e,file){ let path=''; if(file&&file.blob) path=await saveFile(file.name,file.blob); return add({...e,file:path,files:e.files||(file?[file.name]:[])}); }
  async function openFile(path){
    try{ let d=S.dirHandle; const parts=path.split('/'); for(const p of parts.slice(0,-1)) d=await d.getDirectoryHandle(p); const f=await (await d.getFileHandle(parts.at(-1))).getFile(); window.open(URL.createObjectURL(f),'_blank'); }
    catch(e){ alert('The file could not be opened. Reconnect the reports folder and try again.'); } }

  // ---- memo numbering: template per workspace, number continues per series
  const tpl=()=>{ const t=L().memoTpl; if(t) return t; if(wsx().team) return DEFAULT_TPL; return (L().memoPrefix||'SB/INT/MEMO').replace(/\/+$/,'')+'/{YEAR}/{NNN}'; };
  function fill(t,nnn,year=new Date().getFullYear()){
    const p=getProfile(); const w=wsx();
    return t.replace(/\{TEAM\}/g,(w.team||'INT').toUpperCase().replace(/[^A-Z0-9]/g,'')).replace(/\{ROLE\}/g,(p.position||'GEN').toUpperCase()).replace(/\{PROJ\}/g,(w.code||'').toUpperCase().replace(/\s+/g,''))
      .replace(/\{YEAR\}/g,year).replace(/\{NNN\}/g,nnn).replace(/\/{2,}/g,'/').replace(/^\/|\/$/g,'');
  }
  const seriesOf=(no)=>{ const m=String(no||'').match(/^(.*\/)(\d+)\s*$/); return m?{key:m[1],n:+m[2]}:null; };
  function nextMemoNo(){
    const y=new Date().getFullYear(); const key=fill(tpl(),'0').replace(/0$/,''); let max=(L().memoSeq&&L().memoSeq[key])||0;
    if(L().memoSeq&&L().memoSeq[String(y)]&&!L().memoTpl&&!wsx().team) max=Math.max(max,L().memoSeq[String(y)]);   // series started before v0.7
    for(const e of list()) if(e.kind==='Memo'){ const s=seriesOf(e.no); if(s&&s.key===key) max=Math.max(max,s.n); }
    return fill(tpl(),String(max+1).padStart(3,'0'));
  }
  function useNo(no){ const s=seriesOf(no); if(!s) return; L().memoSeq=L().memoSeq||{}; L().memoSeq[s.key]=Math.max(L().memoSeq[s.key]||0,s.n); saveLS(); }
  const noTaken=(no)=>list().some(e=>e.kind==='Memo'&&e.no===no);

  // ---- session log (who opened SiteBoard, when)
  function logSession(){ const by=who(); const ss=L().sessions=L().sessions||[]; const last=ss.find(s=>s.by===by); if(last&&Date.now()-last.t<30*60*1000) return;
    ss.unshift({t:Date.now(),by,pos:getProfile().position||'',ws:wsActive().name}); L().sessions=ss.slice(0,200); saveLS(); }

  // ---- register view
  const F={kind:'',q:'',sess:false};
  const csv=(rows)=>'﻿'+rows.map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  function vRegister(v){
    migrate(); const all=list();
    const q=F.q.toLowerCase(); const rows=all.filter(e=>(!F.kind||e.kind===F.kind)&&(!q||[e.no,e.subject,e.to,e.by,e.type].join(' ').toLowerCase().includes(q)));
    const sess=(L().sessions||[]).slice(0,40);
    v.innerHTML=`<div class="card"><h2>Issued register</h2><div class="sub">Memos, messages, reports and shared pictures issued from SiteBoard. Files are kept in <code>_SiteBoard/Issued/&lt;year&gt;</code> inside the reports folder (allow saving once per visit). The list is shared with the team through <b>Save settings to folder</b>.</div>
     <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0"><label class="fld" style="margin:0">Type<select id="rgK"><option value="">All</option>${KINDS.map(k=>`<option ${F.kind===k?'selected':''}>${k}</option>`).join('')}</select></label>
      <input id="rgQ" placeholder="Search number, subject, recipient…" value="${esc(F.q)}" style="flex:1 1 220px"><button class="btn" id="rgCsv">Download list (CSV)</button><button class="btn" id="rgAllow">Allow saving to folder</button><span class="sub" id="rgMsg" style="margin:0"></span></div>
     <div class="scroll"><table class="t"><thead><tr><th>When</th><th>Type</th><th>No.</th><th>Subject</th><th>To</th><th>By</th><th>File</th><th></th></tr></thead><tbody>
     ${rows.slice(0,300).map(e=>`<tr><td>${when(e.t)}</td><td><span class="badge">${esc(e.kind)}</span>${e.priority&&e.priority!=='Normal'?` <span class="badge warn">${esc(e.priority)}</span>`:''}</td><td>${esc(e.no||'')}</td><td>${esc(e.subject||'')}</td><td>${esc(e.to||'')}</td><td>${esc(e.by||'')}</td>
       <td>${e.file?`<button class="btn sm" data-of="${esc(e.file)}">Open</button>`:esc((e.files||[]).join(', '))}</td><td>${e.text?`<button class="btn sm" data-re="${e.id}">Resend</button>`:''}</td></tr>`).join('')||'<tr><td colspan="8" class="empty">Nothing issued yet.</td></tr>'}</tbody></table></div>
     ${rows.length>300?`<div class="sub">Showing the latest 300 of ${rows.length}.</div>`:''}</div>
     <div class="card" style="margin-top:12px"><h2>Session log</h2><div class="sub">Who opened SiteBoard on this workspace and when (one line per 30 minutes per person).</div>
      <div class="scroll"><table class="t"><thead><tr><th>When</th><th>User</th><th>Workspace</th></tr></thead><tbody>${sess.map(s=>`<tr><td>${when(s.t)}</td><td>${esc(s.by||'(profile not set)')}</td><td>${esc(s.ws||'')}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">No sessions yet.</td></tr>'}</tbody></table></div></div>`;
    $('#rgK').onchange=(e)=>{ F.kind=e.target.value; vRegister(v); };
    $('#rgQ').oninput=(e)=>{ F.q=e.target.value; clearTimeout(F._t); F._t=setTimeout(()=>{ vRegister(v); const i=$('#rgQ'); i.focus(); i.setSelectionRange(F.q.length,F.q.length); },300); };
    $('#rgCsv').onclick=()=>{ const b=new Blob([csv([['When','Type','No.','Subject','To','By','File'],...rows.map(e=>[when(e.t),e.kind,e.no||'',e.subject||'',e.to||'',e.by||'',e.file||(e.files||[]).join('; ')])])],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='SiteBoard issued register.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); };
    $('#rgAllow').onclick=async()=>{ if(!S.dirHandle){ $('#rgMsg').textContent='Connect the reports folder first.'; return; } try{ const p=await S.dirHandle.requestPermission({mode:'readwrite'}); $('#rgMsg').textContent=p==='granted'?'Saving to the folder is allowed for this visit.':'Permission was not granted.'; }catch(e){ $('#rgMsg').textContent='Could not ask for permission: '+e.message; } };
    v.querySelectorAll('[data-of]').forEach(b=>b.onclick=()=>openFile(b.dataset.of));
    v.querySelectorAll('[data-re]').forEach(b=>b.onclick=()=>{ const e=all.find(x=>x.id===b.dataset.re); S.MS.compose({title:'Resend message',type:e.type||'General',body:(e.text||'').split('\n').slice(2).join('\n').replace(/\n— [\s\S]*$/,'').trim()}); });
  }
  return { add, record, saveFile, openFile, list, nextMemoNo, useNo, noTaken, tpl, fill, logSession, vRegister, migrate };
}
