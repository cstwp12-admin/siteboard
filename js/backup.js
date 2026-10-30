// Portable settings only: file handles, source PDFs and browser caches stay outside this format.
import { VERSION } from './config.js';
const CATALOG='wp12dash.ws', PROFILE='wp12dash.profile';
const key=id=>id==='w1'?'wp12dash.v1':'wp12dash.v1.'+id;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function checkTree(v,depth=0){
  if(depth>40) throw Error('Backup is nested too deeply.');
  if(v&&typeof v==='object') for(const [k,x] of Object.entries(v)){
    if(['__proto__','prototype','constructor'].includes(k)) throw Error('Unsupported property in backup.');
    checkTree(x,depth+1);
  }
}
export function validateBackup(value){
  checkTree(value);
  if(!object(value)||value.format!=='SiteBoard-settings-backup'||value.schema!==1) throw Error('Unsupported SiteBoard backup format or schema.');
  if(!Array.isArray(value.workspaces)||!value.workspaces.length||value.workspaces.length>100) throw Error('Backup must contain 1–100 workspaces.');
  for(const w of value.workspaces){
    if(!object(w)||typeof w.name!=='string'||!w.name.trim()||!object(w.settings)) throw Error('Invalid workspace settings.');
    for(const k of ['issued','msgLog','sessions','roster','daysOff','daysOn']) if(k in w.settings&&!Array.isArray(w.settings[k])) throw Error('Invalid '+k+' list.');
    for(const k of ['memoSeq','expected','observations','project','ws','signoff','structOverride','structAssign','excuse']) if(k in w.settings&&!object(w.settings[k])) throw Error('Invalid '+k+' settings.');
    if(w.settings.issued?.some(x=>!object(x))) throw Error('Invalid register entry.');
    for(const k of ['msgLog','sessions','roster']) if(w.settings[k]?.some(x=>!object(x))) throw Error('Invalid '+k+' entry.');
    for(const k of ['daysOff','daysOn','expectedRoles']) if(w.settings[k]!==undefined&&!(k==='expectedRoles'&&w.settings[k]===null)&&(!Array.isArray(w.settings[k])||w.settings[k].some(x=>typeof x!=='string'))) throw Error('Invalid '+k+' values.');
    if(Object.values(w.settings.memoSeq||{}).some(x=>!Number.isSafeInteger(x)||x<0)) throw Error('Invalid memo counter.');
  }
  if(value.profile!==undefined&&!object(value.profile)) throw Error('Invalid profile.');
  return value;
}
export function createBackup(storage=localStorage){
  const catalog=JSON.parse(storage.getItem(CATALOG)||'{"active":"w1","list":[{"id":"w1","name":"My reports folder"}]}');
  return validateBackup({format:'SiteBoard-settings-backup',schema:1,version:VERSION,createdAt:new Date().toISOString(),
    profile:JSON.parse(storage.getItem(PROFILE)||'{}'),workspaces:catalog.list.map(w=>({name:w.name,settings:JSON.parse(storage.getItem(key(w.id))||'{}')}))});
}
export function parseBackup(text){
  if(text.length>20*1024*1024) throw Error('Backup exceeds the 20 MB limit.');
  return validateBackup(JSON.parse(text));
}
export function restoreBackup(value,{storage=localStorage,restoreProfile=false,token=Date.now().toString(36)}={}){
  // Validate and prepare every write before committing. Existing workspace IDs/settings are retained.
  const data=validateBackup(value), catalog=JSON.parse(storage.getItem(CATALOG)||'{"active":"w1","list":[{"id":"w1","name":"My reports folder"}]}');
  const writes=[], added=[]; const used=new Set(catalog.list.map(w=>w.id));
  data.workspaces.forEach((w,i)=>{
    let id='wr'+token+'_'+i; while(used.has(id)||storage.getItem(key(id))!==null) id+='x'; used.add(id);
    added.push({id,name:w.name+' (restored)',created:Date.now(),last:Date.now()});
    writes.push([key(id),JSON.stringify(w.settings)]);
  });
  if(restoreProfile&&data.profile) writes.push([PROFILE,JSON.stringify(data.profile)]);
  writes.push([CATALOG,JSON.stringify({...catalog,list:[...catalog.list,...added]})]);
  const old=writes.map(([k])=>[k,storage.getItem(k)]);
  try{for(const [k,v] of writes) storage.setItem(k,v);}
  catch(err){ for(const [k,v] of old)if(v===null)storage.removeItem(k);for(const [k,v] of old)if(v!==null)storage.setItem(k,v);throw Error('Restore could not be saved. Existing settings were retained: '+err.message); }
  return added;
}
export function downloadBackup(value,name='siteboard-backup'){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function mountBackup(host){
  host.innerHTML='<h2>Backup & restore</h2><p class="sub">Download all workspace settings, full issued registers, memo counters, follow-up records and your profile. Keep a separate copy of the reports folder, issued PDFs and any imported KMZ. Restore creates separate workspaces; reconnect their source folders afterwards. Restored memo series are historical copies: use one authoritative workspace for issuing new numbers.</p><button class="btn" data-export>Download backup</button> <button class="btn" data-pick>Choose backup to restore</button><input type="file" accept=".json,application/json" data-file hidden><div data-preview></div><p class="sub" role="status" data-message></p>';
  const q=s=>host.querySelector(s), msg=q('[data-message]');
  q('[data-export]').onclick=()=>{try{downloadBackup(createBackup());msg.textContent='Backup download prepared. Keep it in a safe location.';}catch(e){msg.textContent=e.message;}};
  q('[data-pick]').onclick=()=>q('[data-file]').click();
  q('[data-file]').onchange=async e=>{
    q('[data-preview]').replaceChildren();msg.textContent=''; const f=e.target.files[0];if(!f)return;
    try{
      if(f.size>20*1024*1024)throw Error('Backup exceeds the 20 MB limit.');
      const data=parseBackup(await f.text()), preview=q('[data-preview]');
      const p=document.createElement('p');p.textContent=data.workspaces.map(w=>`${w.name}: ${(w.settings.issued||[]).length} register entries`).join(' · ');preview.append(p);
      const label=document.createElement('label'),profile=document.createElement('input');profile.type='checkbox';label.append(profile,' Also restore my profile');preview.append(label,document.createElement('br'));
      const button=document.createElement('button');button.className='btn pri';button.textContent='Restore as separate workspaces';preview.append(button);
      button.onclick=()=>{try{downloadBackup(createBackup(),'siteboard-before-restore');const added=restoreBackup(data,{restoreProfile:profile.checked});button.disabled=true;msg.textContent=`Restored ${added.length} workspace(s). A recovery backup was downloaded. Reload to see them in the workspace menu.`;const reload=document.createElement('button');reload.className='btn';reload.textContent='Reload SiteBoard';reload.onclick=()=>location.reload();preview.append(reload);}catch(err){msg.textContent=err.message;}};
    }catch(err){msg.textContent='Cannot restore: '+err.message;}
    e.target.value='';
  };
}
