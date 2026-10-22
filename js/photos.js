import { pdfjsLib, fileIndex } from './scanner.js';
import { dbGet, dbPut } from './db.js';
const mem = new Map();
const key=(r,no)=>'v3#'+r.ref+'#'+no+'#'+r.size+'-'+r.mtime;

export async function getPhoto(report, item, opts={}){
  const k=key(report,item.no);
  if(mem.has(k)) return mem.get(k);
  const hit=await dbGet('photos',k); if(hit){ mem.set(k,hit); return hit; }
  await extractReport(report);
  return mem.get(k)||null;
}
const inflight=new Map();
let active=0; const waiters=[];
const acquire=async()=>{ if(active<2){ active++; return; } await new Promise(r=>waiters.push(r)); active++; };
const release=()=>{ active--; const n=waiters.shift(); if(n) n(); };
export function extractReport(report){
  const id=report.path;
  if(inflight.has(id)) return inflight.get(id);
  const p=(async()=>{
    await acquire(); try{
    const file=fileIndex.get(report.path); if(!file) return;
    const doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const byPage=new Map();
    for(const it of report.items){ if(!it.photo) continue; if(!byPage.has(it.photo.page)) byPage.set(it.photo.page,[]); byPage.get(it.photo.page).push(it); }
    for(const [pn,its] of byPage){
      const todo=its.filter(it=>!mem.has(key(report,it.no))); if(!todo.length) continue;
      const pg=await doc.getPage(pn); const S=1.7; const vp=pg.getViewport({scale:S});
      const cv=document.createElement('canvas'); cv.width=Math.ceil(vp.width); cv.height=Math.ceil(vp.height);
      const ctx=cv.getContext('2d',{willReadFrequently:false}); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
      await pg.render({canvasContext:ctx,viewport:vp}).promise;
      for(const it of todo){
        const ph=it.photo, H=vp.height/S;
        const I=2, sx=(ph.x+I)*S, sy=(H-(ph.yb+ph.h)+I)*S, sw=(ph.w-2*I)*S, sh=(ph.h-2*I)*S;
        const c2=document.createElement('canvas'); c2.width=Math.round(sw); c2.height=Math.round(sh);
        c2.getContext('2d').drawImage(cv,sx,sy,sw,sh,0,0,c2.width,c2.height);
        const url=trim(c2).toDataURL('image/jpeg',0.82);
        const k=key(report,it.no); mem.set(k,url); dbPut('photos',k,url);
      }
      cv.width=cv.height=1;
    }
    await doc.destroy();
    } finally { release(); }
  })().finally(()=>inflight.delete(id));
  inflight.set(id,p); return p;
}

// Remove the uniform padding bars the report generator adds around non-square photos.
function trim(cv){
  const w=cv.width,h=cv.height,ctx=cv.getContext('2d'); const d=ctx.getImageData(0,0,w,h).data;
  const px=(x,y)=>{const i=(y*w+x)*4;return [d[i],d[i+1],d[i+2]];};
  const nr=(a,c)=>Math.abs(a[0]-c[0])<10&&Math.abs(a[1]-c[1])<10&&Math.abs(a[2]-c[2])<10;
  const rowBar=(y)=>{ const c=px(2,y); for(let x=2;x<w-2;x+=3) if(!nr(px(x,y),c)) return false; return true; };
  const y0=Math.floor(h*.3), y1=Math.floor(h*.7);
  const colBar=(x)=>{ const c=px(x,y0); for(let y=y0;y<y1;y+=3) if(!nr(px(x,y),c)) return false; return true; };
  let t=0,b=h-1,l=0,r=w-1;
  while(t<h/2 && rowBar(t)) t++; while(b>h/2 && rowBar(b)) b--; while(l<w/2 && colBar(l)) l++; while(r>w/2 && colBar(r)) r--;
  t=Math.min(t+1,h/2); b=Math.max(b-1,h/2); l=Math.min(l+1,w/2); r=Math.max(r-1,w/2);
  if(t<3&&l<3&&b>h-4&&r>w-4) return cv;
  const o=document.createElement('canvas'); o.width=r-l+1; o.height=b-t+1; o.getContext('2d').drawImage(cv,l,t,o.width,o.height,0,0,o.width,o.height); return o;
}

// Larger render of one photo for the lightbox (not cached)
export async function getPhotoLarge(report,item,scale=3){
  const file=fileIndex.get(report.path); if(!file||!item.photo) return null;
  await acquire(); try{
    const doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const pg=await doc.getPage(item.photo.page); const vp=pg.getViewport({scale});
    const cv=document.createElement('canvas'); cv.width=Math.ceil(vp.width); cv.height=Math.ceil(vp.height);
    const ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
    await pg.render({canvasContext:ctx,viewport:vp}).promise;
    const ph=item.photo,H=vp.height/scale,I=2;
    const c2=document.createElement('canvas'); c2.width=Math.round((ph.w-2*I)*scale); c2.height=Math.round((ph.h-2*I)*scale);
    c2.getContext('2d').drawImage(cv,(ph.x+I)*scale,(H-(ph.yb+ph.h)+I)*scale,c2.width,c2.height,0,0,c2.width,c2.height);
    await doc.destroy(); return trim(c2).toDataURL('image/jpeg',0.9);
  } finally { release(); }
}
