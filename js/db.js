import { dbName } from './workspace.js';
const NAME=dbName(), VER=1;
let _db;
function open(){ return _db||(_db=new Promise((res,rej)=>{
  const r=indexedDB.open(NAME,VER);
  r.onupgradeneeded=()=>{ const d=r.result; for(const s of ['meta','reports','photos']) if(!d.objectStoreNames.contains(s)) d.createObjectStore(s); };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
})); }
async function tx(store,mode,fn){ const d=await open(); return new Promise((res,rej)=>{ const t=d.transaction(store,mode); const o=t.objectStore(store); const out=fn(o); t.oncomplete=()=>res(out instanceof IDBRequest?out.result:out); t.onerror=()=>rej(t.error); }); }
export const dbGet=(s,k)=>tx(s,'readonly',o=>o.get(k)).catch(()=>undefined);
export const dbPut=(s,k,v)=>tx(s,'readwrite',o=>{o.put(v,k)}).catch(()=>{});
export const dbDel=(s,k)=>tx(s,'readwrite',o=>{o.delete(k)}).catch(()=>{});
export async function dbAll(s){ try{ const d=await open(); return await new Promise((res,rej)=>{ const out=[]; const r=d.transaction(s,'readonly').objectStore(s).openCursor(); r.onsuccess=()=>{ const c=r.result; if(c){out.push([c.key,c.value]);c.continue();} else res(out); }; r.onerror=()=>rej(r.error); }); }catch(e){ return []; } }
export async function dbClear(s){ try{ await tx(s,'readwrite',o=>{o.clear()}); }catch(e){} }
