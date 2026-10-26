// Workspaces (one per reports folder / team) and the user profile. Everything is kept in this browser; the shared parts of a
// workspace (project, team, memo series, register) travel with the reports folder in siteboard-settings.json.
const WSK='wp12dash.ws', PROK='wp12dash.profile';
const rd=(k,d)=>{ try{ return JSON.parse(localStorage.getItem(k))||d; }catch(_){ return d; } };
const wr=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(_){} };
function load(){ const w=rd(WSK,null); if(w&&w.list&&w.list.length) return w; return { active:'w1', list:[{id:'w1',name:'My reports folder',created:Date.now(),last:Date.now()}] }; }
let W=load();
export const wsAll=()=>W.list.slice().sort((a,b)=>(b.last||0)-(a.last||0));
export const wsActive=()=>W.list.find(x=>x.id===W.active)||W.list[0];
// the first workspace keeps the original storage names, so nothing is lost when upgrading
export const lsKey=(id=wsActive().id)=>id==='w1'?'wp12dash.v1':'wp12dash.v1.'+id;
export const dbName=(id=wsActive().id)=>id==='w1'?'wp12-site-dash':'wp12-site-dash-'+id;
const save=()=>wr(WSK,W);
export function wsTouch(name){ const a=wsActive(); a.last=Date.now(); if(name&&name!==a.name) a.name=name; save(); }
export function wsRename(id,name){ const w=W.list.find(x=>x.id===id); if(w&&name.trim()){ w.name=name.trim(); save(); } }
export function wsAdd(name){ const id='w'+Date.now().toString(36); W.list.push({id,name:(name||'New workspace').trim(),created:Date.now(),last:Date.now()}); W.active=id; save(); return id; }
export function wsSwitch(id){ if(!W.list.some(x=>x.id===id)) return; W.active=id; const w=wsActive(); w.last=Date.now(); save(); location.reload(); }
export function wsRemove(id){ if(W.list.length<2) return false; try{ indexedDB.deleteDatabase(dbName(id)); localStorage.removeItem(lsKey(id)); }catch(_){}
  W.list=W.list.filter(x=>x.id!==id); if(W.active===id) W.active=W.list[0].id; save(); return true; }
if(!localStorage.getItem(WSK)) save();

// ---- profile (the person using this browser)
export const POSITIONS=[['RE','Resident Engineer',true],['ARE','Assistant Resident Engineer',true],['IOW','Inspector of Works',false],['SOR','SO Representative',true],['WPC','Contractor representative',false],['PM','Project Manager',true],['OTH','Other',false]];
export const TEAMS=['CST','WPC','SOR','Contractor','Employer'];
export const ORGS=['Supervision consultant','Contractor','Employer / client','Other'];
export const getProfile=()=>({name:'',position:'',title:'',showAdmin:false,...rd(PROK,{})});
export const setProfile=(p)=>wr(PROK,p);
export function isAdmin(){ const p=getProfile(); if(!p.position) return true; if(p.showAdmin) return true; const d=POSITIONS.find(x=>x[0]===p.position); return !!(d&&d[2]); }
