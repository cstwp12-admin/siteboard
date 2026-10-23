import { pdfjsLib, fileIndex } from './scanner.js';
import { dbGet, dbPut } from './db.js';
// Photos are taken from the image objects embedded in the SDR PDF (original resolution, up to ~1300 px).
// If an image cannot be matched, the page is rendered and cropped instead (fallback).
const mem = new Map();
const key=(r,no)=>'v4#'+r.ref+'#'+no+'#'+r.size+'-'+r.mtime;
export const photoErrors=new Map();           // report.path -> message of the last failure
const THUMB=640, FULL=2000;

export async function getPhoto(report, item){
  const k=key(report,item.no);
  if(mem.has(k)) return mem.get(k);
  const hit=await dbGet('photos',k); if(hit){ mem.set(k,hit); return hit; }
  await extractReport(report);
  return mem.get(k)||null;
}
const BAD='data:image/svg+xml;utf8,'+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='#e6e8ea'/><text x='200' y='145' font-family='Arial' font-size='22' text-anchor='middle' fill='#59636b'>Photo not available</text><text x='200' y='175' font-family='Arial' font-size='15' text-anchor='middle' fill='#59636b'>click to try again</text></svg>");
// Put a photo into an <img>; on failure show a placeholder that retries when clicked
export function loadInto(im,report,item){
  const fail=()=>{ im.src=BAD; im.title=(photoErrors.get(report.path)||'The photo could not be read')+' Click to try again.'; im.onclick=(e)=>{ e.stopPropagation(); e.preventDefault(); im.onclick=null; loadInto(im,report,item); }; };
  getPhoto(report,item).then(u=>{ if(u){ im.src=u; im.title=''; } else fail(); }).catch(fail);
}
const inflight=new Map();
let active=0; const waiters=[];
const acquire=async()=>{ if(active<2){ active++; return; } await new Promise(r=>waiters.push(r)); active++; };
const release=()=>{ active--; const n=waiters.shift(); if(n) n(); };

async function openDoc(report){
  const file=fileIndex.get(report.path); if(!file) throw new Error('The PDF file is not available (folder not connected, or the file was moved).');
  return pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
}
function toCanvas(o){
  if(!o) return null;
  const c=document.createElement('canvas');
  const okData=o.data&&o.width&&o.data.length>=o.width*o.height;
  if(!okData&&o.bitmap&&o.bitmap.width){ c.width=o.bitmap.width; c.height=o.bitmap.height; c.getContext('2d').drawImage(o.bitmap,0,0); return c; }
  if(o instanceof ImageBitmap&&o.width){ c.width=o.width; c.height=o.height; c.getContext('2d').drawImage(o,0,0); return c; }
  if(okData){ c.width=o.width; c.height=o.height; const ctx=c.getContext('2d'); const id=ctx.createImageData(o.width,o.height); const n=o.width*o.height;
    if(o.data.length===n*4) id.data.set(o.data); else if(o.data.length===n*3){ for(let i=0,j=0;i<n;i++){ id.data[j++]=o.data[i*3]; id.data[j++]=o.data[i*3+1]; id.data[j++]=o.data[i*3+2]; id.data[j++]=255; } }
    else if(o.data.length===n){ for(let i=0,j=0;i<n;i++){ const v=o.data[i]; id.data[j++]=v; id.data[j++]=v; id.data[j++]=v; id.data[j++]=255; } } else return null;
    ctx.putImageData(id,0,0); return c; }
  return null;
}
function scaled(c,max,q){
  const k=Math.min(1,max/Math.max(c.width,c.height)); let src=c;
  if(k<1){ src=document.createElement('canvas'); src.width=Math.round(c.width*k); src.height=Math.round(c.height*k); const x=src.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(c,0,0,src.width,src.height); }
  return { url:src.toDataURL('image/jpeg',q), w:src.width, h:src.height };
}
// Crop of the rendered page (fallback)
async function renderCrop(pg,it,scale){
  const vp=pg.getViewport({scale}); const cv=document.createElement('canvas'); cv.width=Math.ceil(vp.width); cv.height=Math.ceil(vp.height);
  const ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height); await pg.render({canvasContext:ctx,viewport:vp}).promise;
  const ph=it.photo,H=vp.height/scale,I=2; const c2=document.createElement('canvas'); c2.width=Math.round((ph.w-2*I)*scale); c2.height=Math.round((ph.h-2*I)*scale);
  c2.getContext('2d').drawImage(cv,(ph.x+I)*scale,(H-(ph.yb+ph.h)+I)*scale,c2.width,c2.height,0,0,c2.width,c2.height); cv.width=cv.height=1;
  return trim(c2);
}
// Core: pull the photos of a report. mode 'thumb' or 'full'. items: report items to fetch. Returns Map(no -> {url,w,h,native})
// Render the page once while recording every drawImage() call. pdf.js hands the decoded image (full size when the page is
// rendered large enough) to the canvas, so the recording gives the original photo and where it sits on the page.
const CAP_SCALE=4;
async function capturePage(pg){
  const vp=pg.getViewport({scale:CAP_SCALE}); const cv=document.createElement('canvas'); cv.width=Math.ceil(vp.width); cv.height=Math.ceil(vp.height);
  const real=cv.getContext('2d'); real.fillStyle='#fff'; real.fillRect(0,0,cv.width,cv.height); const caps=[];
  const ctx=new Proxy(real,{
    get(t,k){ if(k==='drawImage') return (img,...a)=>{ try{
        const w=img.width||img.displayWidth||img.codedWidth, h=img.height||img.displayHeight||img.codedHeight;
        if(w>=300&&h>=200){ const d=a.length>=8?a.slice(4):a.length>=4?a:[a[0],a[1],w,h]; const m=t.getTransform();
          const pts=[[d[0],d[1]],[d[0]+d[2],d[1]],[d[0],d[1]+d[3]],[d[0]+d[2],d[1]+d[3]]].map(([x,y])=>{ const q=m.transformPoint({x,y}); return [q.x,q.y]; });
          const xs=pts.map(q=>q[0]), ys=pts.map(q=>q[1]); const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys); if((x1-x0)*(y1-y0)<8000*CAP_SCALE*CAP_SCALE) return t.drawImage(img,...a);
          const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0);
          caps.push({canvas:c,w,h,x0,y0,x1,y1,cx:(x0+x1)/2,cy:(y0+y1)/2}); }
      }catch(e){} return t.drawImage(img,...a); };
      const v=t[k]; return typeof v==='function'?v.bind(t):v; },
    set(t,k,v){ t[k]=v; return true; } });
  await pg.render({canvasContext:ctx,viewport:vp}).promise; cv.width=cv.height=1;
  // reading order: rows top to bottom (25 px tolerance), then left to right
  caps.sort((p,q)=>Math.abs(p.cy-q.cy)>25*CAP_SCALE/2?p.cy-q.cy:p.cx-q.cx);
  return caps;
}
async function pull(report,items,mode){
  const res=new Map(); const doc=await openDoc(report); const q=mode==='full'?0.92:0.85, max=mode==='full'?FULL:THUMB;
  try{
    const pages=new Map(); const all=[];
    const withPh=report.items.filter(it=>it.photo).sort((x,y)=>x.no-y.no);
    const need=new Set(items.filter(i=>i.photo).map(i=>i.photo.page));
    // pages are captured only when needed; if the image count per report does not match the items, the page rect is used instead
    for(let pn=1;pn<=doc.numPages;pn++){ const pg=await doc.getPage(pn); pages.set(pn,pg); let caps=[]; try{ caps=await capturePage(pg); }catch(e){ console.warn('capture failed',e); } caps.forEach(c=>all.push({...c,pn})); }
    const byOrder=all.length===withPh.length;
    for(const it of items){ if(!it.photo) continue; let cand=null;
      if(byOrder) cand=all[withPh.indexOf(it)];
      else { const ph=it.photo; const H=pages.get(ph.page).view[3]; cand=all.filter(m=>m.pn===ph.page&&m.cx/CAP_SCALE>=ph.x-4&&m.cx/CAP_SCALE<=ph.x+ph.w+4&&H-m.cy/CAP_SCALE>=ph.yb-4&&H-m.cy/CAP_SCALE<=ph.yb+ph.h+4)[0]; }
      if(cand){ try{ res.set(it.no,{...scaled(cand.canvas,max,q),native:true}); }catch(e){ console.warn('native photo failed',e); } } }
    for(const it of items){ if(!it.photo||res.has(it.no)) continue; const pg0=pages.get(it.photo.page); if(!pg0) continue;
      const cv=await renderCrop(pg0,it,mode==='full'?4:2.6); res.set(it.no,{...scaled(cv,max,q),native:false}); }
  } finally { try{ await doc.destroy(); }catch(_){} }
  return res;
}
export function extractReport(report){
  const id=report.path; if(inflight.has(id)) return inflight.get(id);
  const p=(async()=>{
    await acquire(); try{
      const todo=report.items.filter(it=>it.photo&&!mem.has(key(report,it.no))); if(!todo.length) return;
      // thumbnails already in IndexedDB
      const rest=[]; for(const it of todo){ const hit=await dbGet('photos',key(report,it.no)); if(hit) mem.set(key(report,it.no),hit); else rest.push(it); }
      if(!rest.length) return;
      const m=await pull(report,rest,'thumb'); photoErrors.delete(id);
      for(const it of rest){ const g=m.get(it.no); if(g){ const k=key(report,it.no); mem.set(k,g.url); dbPut('photos',k,g.url); } }
    } catch(e){ photoErrors.set(id,String(e&&e.message||e)); console.warn('Photo extraction failed for',id,e); }
    finally { release(); }
  })().finally(()=>inflight.delete(id));
  inflight.set(id,p); return p;
}
// Full-resolution photos for one report (used by the report generator and the large view). Not cached.
export async function getFull(report,items){
  await acquire(); try{ return await pull(report,items,'full'); } finally { release(); }
}
export async function getPhotoLarge(report,item){
  const m=await getFull(report,[item]); const g=m.get(item.no); return g?g.url:null;
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
