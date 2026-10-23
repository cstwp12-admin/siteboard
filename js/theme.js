// SDR colour theme, shared by the app (CSS tokens), the PDF/Word reports and memos.
export const T = { navy:'#14212B', accent:'#B93A0A', accent2:'#D9480F', soft:'#FDEBDF', bg:'#F5F7F8', ink:'#14212B', muted:'#5B6B77', line:'#D6DDE2' };
export const hex=(h)=>{ h=h.replace('#',''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); };
// jsPDF core fonts only cover WinAnsi: map anything else to something printable
const MAP={'✕':'x','✓':'v','→':'->','←':'<-','•':'·',' ':' ',' ':' ','​':'','‑':'-','−':'-'};
export function clean(s){ return String(s??'').replace(/[^\x09\x0a\x20-\x7e -ÿ–—‘’“”•…€]/g,(c)=>MAP[c]??'?'); }
export function ensureScript(src){
  return new Promise((res,rej)=>{ if(document.querySelector(`script[data-v="${src}"]`)) return res(); const s=document.createElement('script'); s.src=src; s.dataset.v=src; s.onload=()=>res(); s.onerror=()=>rej(new Error('Could not load '+src)); document.head.appendChild(s); });
}
export async function loadPdfLibs(){
  if(!window.jspdf) await ensureScript('vendor/jspdf.umd.min.js');
  if(!(window.jspdf.jsPDF.API&&window.jspdf.jsPDF.API.autoTable)) await ensureScript('vendor/jspdf.plugin.autotable.min.js');
  return window.jspdf;
}
export async function loadDocx(){ if(!window.docx) await ensureScript('vendor/docx.iife.js'); return window.docx; }

// SVG string (from charts.js) -> PNG data URL at high resolution
export function rasterize(svg,scale=3){
  return new Promise((res,rej)=>{
    const m=svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/); if(!m) return rej(new Error('no viewBox'));
    const w=+m[1], h=+m[2];
    let s=svg.replace(/width="100%"/,`width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif"`);
    if(!/xmlns=/.test(s)) s=s.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');
    const img=new Image(); const url=URL.createObjectURL(new Blob([s],{type:'image/svg+xml'}));
    img.onload=()=>{ const c=document.createElement('canvas'); c.width=Math.round(w*scale); c.height=Math.round(h*scale); const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url); res({url:c.toDataURL('image/png'),w,h}); };
    img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error('chart render failed')); };
    img.src=url;
  });
}
