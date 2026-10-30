// Map: load the project KMZ/KML (alignment, chainage, points of interest) and plot the inspections / photos along it.
// Everything stays in the browser. Basemap tiles (OpenStreetMap / Esri) are the only network use.
import * as A from './analysis.js';
import { PROJECT, CAT_COLORS, VERSION } from './config.js';
import { esc } from './charts.js';
const catColor=(c)=>(CAT_COLORS[c]||CAT_COLORS.Other)[0];
import { T, hex, clean, ensureScript, loadPdfLibs, rasterize } from './theme.js';
import { dbGet, dbPut, dbDel } from './db.js';
import { loadInto } from './photos.js';
import { sendWhatsApp } from './messages.js';
import { getProjectConfig } from './project.js';
import { mapStatisticsSvg } from './map-statistics.js';
import { addImagePages } from './share-layout.js';

// ------------------------------------------------------------------ KMZ / KML
async function inflateRaw(u8){ const ds=new DecompressionStream('deflate-raw'); const w=ds.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
export async function kmlFromBuffer(buf,name){
  const u8=new Uint8Array(buf);
  if(!(u8[0]===0x50&&u8[1]===0x4b)) return new TextDecoder().decode(u8);           // plain KML
  const dv=new DataView(buf); let e=u8.length-22; while(e>=0&&dv.getUint32(e,true)!==0x06054b50) e--;
  if(e<0) throw new Error('This does not look like a KMZ file.');
  const n=dv.getUint16(e+10,true); let p=dv.getUint32(e+16,true); const list=[];
  if(n===0xffff||p===0xffffffff) throw new Error('ZIP64 KMZ is not supported. Export the alignment as plain KML and try again.');
  for(let i=0;i<n;i++){ if(dv.getUint32(p,true)!==0x02014b50) break;
    const flags=dv.getUint16(p+8,true), method=dv.getUint16(p+10,true), cs=dv.getUint32(p+20,true), nl=dv.getUint16(p+28,true), el=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true), lho=dv.getUint32(p+42,true);
    list.push({name:new TextDecoder().decode(u8.slice(p+46,p+46+nl)),flags,method,cs,lho}); p+=46+nl+el+cl; }
  const kmls=list.filter(f=>/\.kml$/i.test(f.name)); if(!kmls.length) throw new Error('No .kml found inside the KMZ.');
  const f=kmls.find(k=>/(^|\/)doc\.kml$/i.test(k.name))||kmls[0];
  if(f.flags&1) throw new Error('Encrypted KMZ is not supported. Export the alignment as plain KML and try again.');
  if(f.method!==0&&f.method!==8) throw new Error(`KMZ compression method ${f.method} is not supported. Export the alignment as plain KML and try again.`);
  if(f.lho===0xffffffff||f.cs===0xffffffff||f.lho+30>u8.length) throw new Error('This KMZ uses unsupported ZIP64 data. Export the alignment as plain KML and try again.');
  const nl2=dv.getUint16(f.lho+26,true), el2=dv.getUint16(f.lho+28,true); const start=f.lho+30+nl2+el2; const data=u8.slice(start,start+f.cs);
  if(start+f.cs>u8.length) throw new Error('The KMZ is incomplete or damaged. Export the alignment as plain KML and try again.');
  return new TextDecoder().decode(f.method===0?data:await inflateRaw(data));
}
const coordsOf=(txt)=>String(txt||'').trim().split(/\s+/).map(s=>s.split(',').map(Number)).filter(a=>a.length>=2&&isFinite(a[0])&&isFinite(a[1])).map(a=>[a[1],a[0]]);
function ctxOf(el){ const out=[]; for(let n=el.parentNode;n&&n.nodeType===1;n=n.parentNode){ if(/^(Document|Folder)$/.test(n.localName)){ for(const c of n.children) if(c.localName==='name'){ out.push(c.textContent.trim()); break; } } } return out.join(' / '); }
export function parseKml(text){
  const dom=new DOMParser().parseFromString(text,'text/xml'); if(dom.getElementsByTagName('parsererror').length) throw new Error('The KML could not be read.');
  const out={chain:[],lines:[],poi:[],row:[]}; const all=[];
  for(const pm of dom.getElementsByTagName('Placemark')){
    const name=(()=>{ for(const c of pm.children) if(c.localName==='name') return c.textContent.trim(); return ''; })(); const ctx=ctxOf(pm);
    const pt=pm.getElementsByTagName('Point')[0], ls=pm.getElementsByTagName('LineString');
    if(pt){ const c=coordsOf(pt.getElementsByTagName('coordinates')[0].textContent)[0]; if(!c) continue;
      if(/chainage/i.test(ctx)&&/^\d+(\.\d+)?$/.test(name)) out.chain.push({ch:+name,lat:c[0],lon:c[1]});
      else if(/point of interest|poi/i.test(ctx)) out.poi.push({name,lat:c[0],lon:c[1]}); }
    for(const l of ls){ const c=coordsOf(l.getElementsByTagName('coordinates')[0].textContent); if(c.length<2) continue;
      if(/(^|\/|\s)ROW\b/i.test(ctx)) out.row.push(c); else all.push({c,ctx}); }
  }
  const cl=all.filter(x=>/centrel/i.test(x.ctx)); const pool=cl.length?cl:all;
  const best=pool.sort((a,b)=>b.c.length-a.c.length)[0]; out.line=best&&best.c.length>=10?best.c:null;
  out.chain.sort((a,b)=>a.ch-b.ch);
  return out;
}

// ------------------------------------------------------------------ geometry (local metres)
const R=6371000, rad=Math.PI/180;
export function makeGeo(k){
  if(!k||!k.line) return null; const L=k.line; const lat0=L[0][0]; const kx=Math.cos(lat0*rad)*111320, ky=110574;
  const xy=L.map(([la,lo])=>[lo*kx,la*ky]); const d=[0]; for(let i=1;i<xy.length;i++) d.push(d[i-1]+Math.hypot(xy[i][0]-xy[i-1][0],xy[i][1]-xy[i-1][1]));
  const nearest=(lat,lon)=>{ const x=lon*kx,y=lat*ky; let bi=0,bd=1e18,bt=0,bx=0,by=0; for(let i=0;i<xy.length-1;i++){ const [x1,y1]=xy[i],[x2,y2]=xy[i+1]; const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy||1; let t=((x-x1)*dx+(y-y1)*dy)/l2; t=Math.max(0,Math.min(1,t)); const px=x1+t*dx,py=y1+t*dy,dd=(x-px)**2+(y-py)**2; if(dd<bd){ bd=dd; bi=i; bt=t; bx=px; by=py; } } return {s:d[bi]+bt*(d[bi+1]-d[bi]),distance:Math.sqrt(bd),ll:[by/ky,bx/kx]}; };
  let ctl=(k.chain||[]).map(c=>({ch:c.ch,s:nearest(c.lat,c.lon).s})).sort((a,b)=>a.ch-b.ch);
  const fwd=[]; for(const c of ctl){ if(!fwd.length||c.s>fwd.at(-1).s) fwd.push(c); } ctl=fwd;       // keep monotonic
  if(ctl.length<2){ const a=A.ALIGN||{}; const c0=a.start??62700, c1=a.end??77508; ctl=[{ch:c0,s:0},{ch:c1,s:d.at(-1)}]; }
  else if(k.range){ ctl[0].ch=k.range[0]; ctl.at(-1).ch=k.range[1]; }
  const chToS=(ch)=>{ let i=0; if(ch<=ctl[0].ch) i=0; else if(ch>=ctl.at(-1).ch) i=ctl.length-2; else { while(ctl[i+1].ch<ch) i++; } const a=ctl[i],b=ctl[i+1]; const s=a.s+(ch-a.ch)*(b.s-a.s)/((b.ch-a.ch)||1); return Math.max(0,Math.min(d.at(-1),s)); };
  const sToCh=(s)=>{ let i=0; if(s<=ctl[0].s) i=0; else if(s>=ctl.at(-1).s) i=ctl.length-2; else { while(ctl[i+1].s<s) i++; } const a=ctl[i],b=ctl[i+1]; return a.ch+(s-a.s)*(b.ch-a.ch)/((b.s-a.s)||1); };
  const at=(s,off=0)=>{ let lo=0,hi=d.length-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(d[m]<=s) lo=m; else hi=m; } const t=(s-d[lo])/((d[hi]-d[lo])||1); const x=xy[lo][0]+t*(xy[hi][0]-xy[lo][0]), y=xy[lo][1]+t*(xy[hi][1]-xy[lo][1]);
    if(!off) return [y/ky,x/kx]; const dx=xy[hi][0]-xy[lo][0],dy=xy[hi][1]-xy[lo][1],l=Math.hypot(dx,dy)||1; return [(y+off*dx/l)/ky,(x-off*dy/l)/kx]; };   // +off = left of travel (LHS)
  const segment=(s1,s2)=>{ const out=[at(s1)]; for(let i=0;i<d.length;i++) if(d[i]>s1&&d[i]<s2) out.push([L[i][0],L[i][1]]); out.push(at(s2)); return out; };
  const project=(lat,lon)=>{ const q=nearest(lat,lon); q.ch=sToCh(q.s); return q; };
  return { L, total:d.at(-1), chMin:ctl[0].ch, chMax:ctl.at(-1).ch, chToS, sToCh, at, segment, project, posOfCh:(ch,side)=>at(chToS(ch),/^LHS$/i.test(side||'')?10:/^RHS$/i.test(side||'')?-10:0) };
}

// ------------------------------------------------------------------ map module
const BASE={
  osm:{name:'Streets (OpenStreetMap)',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',att:'© OpenStreetMap contributors',max:19},
  sat:{name:'Satellite (Esri)',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',att:'Imagery © Esri, Maxar, Earthstar Geographics',max:19},
  none:{name:'No basemap (plain)',url:null,att:'',max:19}
};
const kmGrid=(g,a,b,step)=>{ const out=[]; for(let ch=Math.ceil(a/step)*step; ch<=b; ch+=step) out.push(ch); return out; };
const fmtCh=(ch)=>`${Math.floor(ch/1000)}+${String(Math.round(ch%1000)).padStart(3,'0')}`;
const dist=(a,b)=>{ const dl=(b[0]-a[0])*110574, dn=(b[1]-a[1])*111320*Math.cos(a[0]*rad); return Math.hypot(dl,dn); };
const validGps=(g)=>g&&isFinite(+g.lat)&&isFinite(+g.lon)&&Math.abs(+g.lat)<=90&&Math.abs(+g.lon)<=180&&!(+g.lat===0&&+g.lon===0);
const xml=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const canvasBlob=(cv,type='image/png',quality)=>new Promise((res,rej)=>{ try{ cv.toBlob(b=>b?res(b):rej(new Error('The browser returned an empty image.')),type,quality); }catch(e){ rej(e); } });

export function makeMap(ctx){
  const { S, $, drawer, resolveRange, inRange, MS, openReport, saveLS, render, openEvidence } = ctx;
  const P=()=>({...PROJECT,...(S.settings.project||{})});
  const M={ kmz:null, project:null, geo:null, map:null, layers:{}, base:'osm', show:{line:true,chain:true,poi:true,row:false,pins:true,coverage:false,gpsWarnings:true}, cat:'', who:'', view:null, groups:[], stat:{}, loaded:false, chFrom:null, chTo:null, dragMode:false, dragStart:null, snapshot:null, pendingMatrix:false };
  const kmzKey=()=>`kmz:${(S.settings.ws&&S.settings.ws.id)||'default'}`;
  const status=()=>M.kmz?`${M.kmz.name} · ${M.project?'setup centreline active · ':''}${M.kmz.chain.length} KMZ chainage marks · ${M.kmz.poi.length} points of interest`:M.project?`${M.project.name} · ${(M.geo.total/1000).toFixed(1)} km alignment · ${M.project.chain.length} chainage points`:'No map alignment loaded';
  function projectGeometry(){ const c=getProjectConfig(), pts=c.centreline||[]; if(pts.length<2) return null; return {name:`${c.projectCode} setup.json centreline`,line:pts.map(p=>[p[1],p[0]]),chain:pts.map(p=>({ch:p[2],lat:p[1],lon:p[0]})),poi:[],row:[],range:[c.chFrom,c.chTo]}; }
  function useProjectGeometry(force=false){ M.project=projectGeometry(); M.geo=makeGeo(M.project||M.kmz); if(force){ M.chFrom=null; M.chTo=null; } setDefaultRange(force); }

  async function ensureLeaflet(){ if(window.L) return; if(!document.querySelector('link[data-lf]')){ const l=document.createElement('link'); l.rel='stylesheet'; l.href='vendor/leaflet/leaflet.css'; l.dataset.lf='1'; document.head.appendChild(l); } await ensureScript('vendor/leaflet/leaflet.js'); }
  async function restore(){ if(M.loaded) return; M.loaded=true; try{ let k=await dbGet('meta',kmzKey()); if(!k){ k=await dbGet('meta','kmz'); if(k) await dbPut('meta',kmzKey(),k); } if(k&&k.data){ M.kmz=k.data; M.kmz.name=k.name||'KMZ'; } useProjectGeometry(); }catch(_){ useProjectGeometry(); } }
  async function loadFile(f){
    return loadKmlText(await kmlFromBuffer(await f.arrayBuffer(),f.name),f.name);
  }
  async function loadKmlText(text,name='alignment.kml',persist=true){ const k=parseKml(text); if(!k.line&&!k.chain.length&&!k.poi.length) throw new Error('No alignment, chainage or points found in this file.'); k.name=name; M.kmz=k; useProjectGeometry(true); if(persist) await dbPut('meta',kmzKey(),{name,data:k,saved:Date.now()}); return status(); }
  function setDefaultRange(force=false){ if(!M.geo) return; if(force||M.chFrom==null) M.chFrom=Math.round(M.geo.chMin); if(force||M.chTo==null) M.chTo=Math.round(M.geo.chMax); }

  // ---- what to plot
  const itemChain=(it)=>{ if(it.ch1!=null) return [(+it.ch1+ +(it.ch2??it.ch1))/2,+it.ch1,+(it.ch2??it.ch1)]; if(M.geo&&validGps(it.gps)){ const q=M.geo.project(+it.gps.lat,+it.gps.lon); return [q.ch,q.ch,q.ch]; } return [null,null,null]; };
  const inChainRange=(it)=>{ if(M.chFrom==null||M.chTo==null) return true; const [,a,b]=itemChain(it), full=!M.geo||(M.chFrom<=M.geo.chMin+1&&M.chTo>=M.geo.chMax-1); return a==null?full:Math.max(a,M.chFrom)<=Math.min(b,M.chTo); };
  function selectedItems(){
    const reps=inRange(), out=[]; const g=M.geo;
    for(const r of reps) for(const it of r.items){
      const cat=A.categorize((it.acts&&it.acts[0])||it.activity); if(M.cat&&cat!==M.cat) continue; if(M.who&&r.code!==M.who) continue;
      if(!inChainRange(it)) continue;
      let ll=null,how='';
      if(validGps(it.gps)){ ll=[+it.gps.lat,+it.gps.lon]; how='GPS'; }
      else if(g&&it.ch1!=null){ ll=g.posOfCh((it.ch1+it.ch2)/2,it.side); how='chainage'; }
      const stated=it.ch1!=null?(+it.ch1+ +(it.ch2??it.ch1))/2:null; const projected=(g&&validGps(it.gps))?g.project(+it.gps.lat,+it.gps.lon):null;
      const mismatch=(g&&validGps(it.gps)&&stated!=null)?dist(ll,g.posOfCh(stated,it.side)):null;
      out.push({r,it,cat,ll,how,date:r.date,stated,projected,mismatch});
    }
    return out;
  }
  function points(){
    const all=selectedItems(), out=all.filter(p=>p.ll); const gps=out.filter(p=>p.how==='GPS').length, ch=out.filter(p=>p.how==='chainage').length, none=all.length-out.length;
    M.stat={items:all.length,placed:out.length,gps,ch,none,reports:new Set(all.map(p=>p.r.ref)).size,mismatch:all.filter(p=>p.mismatch!=null&&p.mismatch>250).length};
    return out;
  }
  function coverageData(list=selectedItems()){
    if(!M.geo) return {bins:[],covered:0,total:0,pct:0}; const a=Math.max(M.geo.chMin,M.chFrom??M.geo.chMin), b=Math.min(M.geo.chMax,M.chTo??M.geo.chMax); const start=Math.floor(a/100)*100, bins=[];
    for(let x=start;x<b;x+=100){ const lo=Math.max(x,a),hi=Math.min(x+100,b); if(hi<=lo) continue; const cats={}; let n=0; for(const p of list){ const [,p1,p2]=itemChain(p.it); if(p1==null||Math.max(p1,lo)>Math.min(p2,hi)) continue; n++; cats[p.cat]=(cats[p.cat]||0)+1; } const cat=Object.entries(cats).sort((u,v)=>v[1]-u[1])[0]?.[0]||''; bins.push({from:lo,to:hi,n,cat}); }
    const covered=bins.filter(x=>x.n).reduce((n,x)=>n+x.to-x.from,0), total=Math.max(0,b-a); return {bins,covered,total,pct:total?covered/total:0};
  }
  function group(pts,radius){
    const gs=[]; for(const p of pts){ let g=gs.find(x=>dist(x.ll,p.ll)<=radius); if(!g){ g={ll:p.ll,items:[]}; gs.push(g); } g.items.push(p); }
    for(const g of gs){ const c=new Map(); for(const p of g.items) c.set(p.cat,(c.get(p.cat)||0)+1); g.cat=[...c.entries()].sort((a,b)=>b[1]-a[1])[0][0]; }
    return gs;
  }
  const radiusAt=(map)=>{ const z=map.getZoom(); return Math.max(4,156543*Math.cos(map.getCenter().lat*rad)/Math.pow(2,z)*14); };   // ~14 px

  // ---- Leaflet drawing
  function pinHtml(g){ const col=catColor(g.cat); const n=g.items.length; return `<div style="width:22px;height:22px;border-radius:50%;background:${col};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);color:#fff;font:700 11px/18px Barlow,Arial,sans-serif;text-align:center">${n>1?n:''}</div>`; }
  function popup(g){
    const box=document.createElement('div'); box.style.cssText='width:260px;max-height:340px;overflow:auto'; const items=g.items.slice().sort((a,b)=>b.date.localeCompare(a.date)||a.r.ref.localeCompare(b.r.ref)||a.it.no-b.it.no);
    for(const p of items.slice(0,15)){ const d=document.createElement('div'); d.style.cssText='margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid #e3e8eb';
      d.innerHTML=`${p.it.photo?'<img alt="" style="width:100%;border-radius:6px;background:#e6e8ea;min-height:60px;display:block">':''}<div style="font-size:12.5px;margin-top:4px"><b>${String(p.it.no).padStart(2,'0')} ${esc(p.it.activity)}</b><br>${esc(A.fmtDate(p.date))} · ${esc(p.r.reporter||'')}<br>${esc(p.it.location||'')}${p.it.structure?' · '+esc(p.it.structure):''}<br><span style="color:#59636b">${esc(p.cat)} · located by ${p.how}</span>${p.mismatch>250?`<br><span style="color:#b2271b;font-weight:600">GPS is ${Math.round(p.mismatch)} m from the stated chainage</span>`:''}</div><div style="margin-top:5px;display:flex;gap:6px"><button class="btn sm" data-o>Open report</button><button class="btn sm" data-c>Comment…</button></div>`;
      d.querySelector('[data-o]').onclick=()=>openReport(p.r.ref); d.querySelector('[data-c]').onclick=()=>MS.composeForItem(p.r,p.it);
      const im=d.querySelector('img'); if(im) loadInto(im,p.r,p.it); box.appendChild(d); }
    if(items.length>15){ const m=document.createElement('div'); m.className='sub'; m.textContent=`+ ${items.length-15} more at this spot – zoom in or narrow the period.`; box.appendChild(m); }
    return box;
  }
  function redraw(){
    const map=M.map, L=window.L; if(!map) return; const ls=M.layers; for(const k of Object.keys(ls)){ ls[k].remove(); delete ls[k]; }
    const g=M.geo, k=M.kmz;
    if(M.show.row&&k&&k.row.length) ls.row=L.featureGroup(k.row.map(c=>L.polyline(c,{color:'#8a6d3b',weight:1,opacity:.7,interactive:false}))).addTo(map);
    if(M.show.line&&g){ ls.line=L.featureGroup([L.polyline(g.L,{color:'#fff',weight:7,opacity:.9,interactive:false}),L.polyline(g.L,{color:T.navy,weight:3.5,opacity:.95,interactive:false})]).addTo(map); }
    if(g&&M.chFrom!=null&&M.chTo!=null&&(M.chFrom>g.chMin+1||M.chTo<g.chMax-1)) ls.selection=L.polyline(g.segment(g.chToS(M.chFrom),g.chToS(M.chTo)),{color:T.accent2,weight:10,opacity:.2,interactive:false}).addTo(map);
    if(M.show.coverage&&g){ const f=L.featureGroup(); for(const b of coverageData().bins.filter(x=>x.n)){ const seg=g.segment(g.chToS(b.from),g.chToS(b.to)); f.addLayer(L.polyline(seg,{color:catColor(b.cat),weight:9,opacity:.78,interactive:false})); } ls.coverage=f.addTo(map); }
    if(M.show.chain&&g){ const step=map.getZoom()>=15?100:map.getZoom()>=13?500:1000; const f=L.featureGroup(); for(const ch of kmGrid(g,g.chMin,g.chMax,step)){ const p=g.at(g.chToS(ch)); f.addLayer(L.marker(p,{interactive:false,icon:L.divIcon({className:'',iconSize:[0,0],html:`<div style="transform:translate(-50%,-50%);background:#fff;border:1px solid ${T.navy};border-radius:3px;padding:0 4px;font:600 10.5px IBM Plex Mono,monospace;color:${T.navy};white-space:nowrap">${fmtCh(ch)}</div>`})})); } ls.chain=f.addTo(map); }
    if(M.show.poi&&k&&k.poi.length){ const f=L.featureGroup(); for(const q of k.poi) f.addLayer(L.marker([q.lat,q.lon],{icon:L.divIcon({className:'',iconSize:[0,0],html:`<div style="transform:translate(-4px,-4px);display:flex;gap:4px;align-items:center;white-space:nowrap"><span style="width:9px;height:9px;background:#7b2cbf;border:1.5px solid #fff;transform:rotate(45deg);display:block"></span>${map.getZoom()>=14?`<span style="font:600 11px Barlow,Arial,sans-serif;color:#3b1a5a;text-shadow:0 0 3px #fff,0 0 3px #fff">${esc(q.name)}</span>`:''}</div>`})})); ls.poi=f.addTo(map); }
    if(M.show.pins){ const pts=points(); M.groups=group(pts,radiusAt(map)); const f=L.featureGroup(); for(const gr of M.groups){ const m=L.marker(gr.ll,{icon:L.divIcon({className:'',iconSize:[22,22],iconAnchor:[11,11],html:pinHtml(gr)})}); m.bindPopup(()=>popup(gr),{maxWidth:290,minWidth:270}); f.addLayer(m); } ls.pins=f.addTo(map); if(M.show.gpsWarnings){ const bad=pts.filter(p=>p.mismatch>250); if(bad.length) ls.gpsWarnings=L.featureGroup(bad.map(p=>L.circleMarker(p.ll,{radius:15,color:'#b2271b',weight:2,fill:false,interactive:false,dashArray:'4 3'}))).addTo(map); } }
    else { points(); M.groups=[]; }
    info();
  }
  function info(){ const e=$('#mpInfo'); if(!e) return; const s=M.stat, cov=coverageData(); e.innerHTML=`<b>${s.placed}</b> of ${s.items} items placed on the map from ${s.reports} reports (${s.gps} by GPS, ${s.ch} by chainage)${s.none?` · <span style="color:var(--bad,#b2271b)">${s.none} not placed</span> ${M.geo?'(no chainage or GPS in the report)':'(load the KMZ so chainage can be placed)'}`:''}${s.mismatch?` · <span style="color:var(--bad,#b2271b)">${s.mismatch} GPS/chainage check${s.mismatch===1?'':'s'} over 250 m</span>`:''}${cov.total?` · ${Math.round(cov.pct*100)}% of selected chainage covered`:''}.`; }
  function setBase(key){
    M.base=key; const map=M.map,L=window.L; if(M.baseLayer) M.baseLayer.remove(); const b=BASE[key];
    const pane=map.getContainer(); pane.style.background=b.url?'#dfe5e8':'#eef1f3';
    M.baseLayer=b.url?L.tileLayer(b.url,{maxZoom:b.max,crossOrigin:true,attribution:b.att}).addTo(map):null; if(M.baseLayer) M.baseLayer.bringToBack();
  }
  function fitLine(){ if(M.geo) M.map.fitBounds(L_bounds(M.geo.L),{padding:[20,20]}); }
  const L_bounds=(pts)=>window.L.latLngBounds(pts);
  function fitPins(){ const pts=M.groups.map(g=>g.ll); if(pts.length) M.map.fitBounds(L_bounds(pts),{padding:[40,40],maxZoom:17}); else fitLine(); }

  // ---------------------------------------------------------------- view
  async function vMap(v){
    await restore();
    setDefaultRange();
    const reps=inRange(); const cats=[...new Set(S.reports.flatMap(r=>r.items.map(it=>A.categorize((it.acts&&it.acts[0])||it.activity))))].sort(); const people=[...new Map(S.reports.map(r=>[r.code,r.reporter])).entries()];
    const sel=(arr,cur,all)=>`<option value="">${all}</option>`+arr.map(x=>{ const [a,b]=Array.isArray(x)?x:[x,x]; return `<option value="${esc(a)}" ${cur===a?'selected':''}>${esc(b)}</option>`; }).join('');
    const chk=(id,key,l)=>`<label style="display:inline-flex;gap:4px;align-items:center;margin-right:10px"><input type="checkbox" id="${id}" ${M.show[key]?'checked':''}>${l}</label>`;
     v.innerHTML=`<div class="card"><h2>Site map</h2><div class="sub">Inspections and photos plotted along the active project alignment. Items with GPS in the report are placed by GPS; others by chainage. An imported SDR setup centreline is used automatically; an optional KMZ/KML adds ROW and points of interest, and supplies the alignment when the setup has none.</div>
     <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0"><button class="btn pri" id="mpK">${M.kmz?'Replace KMZ…':'Load KMZ / KML…'}</button><input type="file" id="mpF" accept=".kmz,.kml" style="display:none">${M.kmz?'<button class="btn" id="mpFg">Forget KMZ</button>':''}<span class="sub" id="mpSt" style="margin:0">${esc(status())}</span></div>
     <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><label class="fld" style="margin:0">Basemap<select id="mpB">${Object.entries(BASE).map(([k,b])=>`<option value="${k}" ${M.base===k?'selected':''}>${b.name}</option>`).join('')}</select></label>
      <label class="fld" style="margin:0">Category<select id="mpC">${sel(cats,M.cat,'All categories')}</select></label><label class="fld" style="margin:0">Reported by<select id="mpW">${sel(people,M.who,'Everyone')}</select></label>
      <label class="fld" style="margin:0">From CH<input id="mpCF" value="${M.chFrom!=null?fmtCh(M.chFrom):''}" placeholder="${fmtCh(A.ALIGN.start)}" style="width:92px"></label><label class="fld" style="margin:0">To CH<input id="mpCT" value="${M.chTo!=null?fmtCh(M.chTo):''}" placeholder="${fmtCh(A.ALIGN.end)}" style="width:92px"></label><button class="btn sm" id="mpDr">Drag range on map</button>
      <span style="flex:1"></span><button class="btn sm" id="mpFl">Zoom to alignment</button><button class="btn sm" id="mpFp">Zoom to photos</button><button class="btn pri" id="mpSts">Map statistics…</button><button class="btn" id="mpSn">Snap map…</button></div>
     <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:8px"><label class="fld" style="margin:0;min-width:220px">Find chainage or structure<input id="mpQ" list="mpStructs" placeholder="e.g. 68+500 or B12"><datalist id="mpStructs">${[...new Set(S.reports.flatMap(r=>r.items.flatMap(it=>A.structureCodes(it.structure))))].sort().map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label><button class="btn sm" id="mpFind">Find</button><button class="btn sm" id="mpExG">Export GeoJSON</button><button class="btn sm" id="mpExK">Export KML</button><button class="btn sm" id="mpMx">Share matrix + map…</button><span class="sub" id="mpFindMsg" style="margin:0"></span></div>
     <div style="margin-bottom:8px;font-size:13px">${chk('mpL','line','Alignment')}${chk('mpH','chain','Chainage')}${chk('mpP','poi','Points of interest')}${chk('mpR','row','ROW boundary')}${chk('mpI','pins','Inspections / photos')}${chk('mpCv','coverage','100 m coverage')}${chk('mpGw','gpsWarnings','GPS checks')}</div>
     <div id="mpMap" style="position:relative;z-index:0;isolation:isolate;height:600px;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#dfe5e8"></div><div class="sub" id="mpInfo" style="margin-top:8px"></div>
     <div id="mpLg" style="margin-top:4px;font-size:12.5px"></div>${navigator.onLine===false?'<p class="sub">You appear to be offline: the basemap needs internet, the alignment and pins still show.</p>':''}</div>`;
    $('#mpK').onclick=()=>$('#mpF').click();
    if(openEvidence){const tools=document.createElement('div');tools.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:10px 0';tools.innerHTML='<button class="btn" id="mpScopedStats">Share filtered statistics…</button><button class="btn" id="mpScopedReport">Report for this range…</button>';$('#mpMap').before(tools);const scope=()=>({...resolveRange(),categories:M.cat?[M.cat]:[],reporters:M.who?[M.who]:[],chFrom:M.chFrom,chTo:M.chTo});$('#mpScopedStats').onclick=()=>openEvidence({kind:'statistics',scope:scope(),title:'Selected map range'});$('#mpScopedReport').onclick=()=>openEvidence({kind:'report',scope:scope(),title:'Works in selected map range'});}
    $('#mpF').onchange=async(e)=>{ const f=e.target.files[0]; if(!f) return; $('#mpSt').textContent='Reading '+f.name+'…'; try{ await loadFile(f); M.view=null; render(); }catch(er){ $('#mpSt').textContent='Could not read the file: '+er.message; } };
    const fg=$('#mpFg'); if(fg) fg.onclick=async()=>{ await dbDel('meta',kmzKey()); M.kmz=null; M.view=null; useProjectGeometry(true); render(); };
    try{ await ensureLeaflet(); }catch(e){ $('#mpMap').innerHTML='<p class="sub" style="padding:20px">The map library could not be loaded ('+esc(e.message)+').</p>'; return; }
    if(M.map){ try{ M.map.remove(); }catch(_){} M.map=null; M.layers={}; }
    const L=window.L; const map=M.map=L.map('mpMap',{zoomControl:true,preferCanvas:false,zoomSnap:.5});
    map.attributionControl.setPrefix(false);
    const c0=M.geo?M.geo.at(M.geo.total/2):[6.625,116.585];
    if(M.view) map.setView(M.view.c,M.view.z); else if(M.geo) fitLine(); else map.setView(c0,12);
    setBase(M.base); redraw(); if(!M.view&&!M.geo&&M.groups.length) fitPins();
    map.on('moveend',()=>{ M.view={c:map.getCenter(),z:map.getZoom()}; }); map.on('zoomend',()=>{ redraw(); legend(); });
    $('#mpB').onchange=(e)=>setBase(e.target.value);
    $('#mpC').onchange=(e)=>{ M.cat=e.target.value; redraw(); legend(); }; $('#mpW').onchange=(e)=>{ M.who=e.target.value; redraw(); legend(); };
    for(const [id,key] of [['#mpL','line'],['#mpH','chain'],['#mpP','poi'],['#mpR','row'],['#mpI','pins'],['#mpCv','coverage'],['#mpGw','gpsWarnings']]) $(id).onchange=(e)=>{ M.show[key]=e.target.checked; redraw(); };
    const applyCh=()=>{ const parse=(x)=>{ const m=/^(?:CH\s*)?(\d+)\s*\+\s*(\d{1,3})$/i.exec(x.trim()); return m?+m[1]*1000+ +m[2]:null; }; let a=parse($('#mpCF').value),b=parse($('#mpCT').value); if(a==null||b==null){ $('#mpFindMsg').textContent='Use chainage such as 68+500.'; return; } if(a>b) [a,b]=[b,a]; M.chFrom=Math.max(M.geo?.chMin??a,a); M.chTo=Math.min(M.geo?.chMax??b,b); $('#mpCF').value=fmtCh(M.chFrom); $('#mpCT').value=fmtCh(M.chTo); $('#mpFindMsg').textContent=''; redraw(); };
    $('#mpCF').onchange=applyCh; $('#mpCT').onchange=applyCh;
    $('#mpFl').onclick=fitLine; $('#mpFp').onclick=fitPins; $('#mpSn').onclick=openSnap; $('#mpSts').onclick=openStats; $('#mpFind').onclick=findPlace; $('#mpQ').onkeydown=e=>{ if(e.key==='Enter') findPlace(); };
    $('#mpDr').onclick=()=>{ if(!M.geo){ $('#mpFindMsg').textContent='Import a setup centreline or load a KMZ before selecting a range.'; return; } M.dragMode=!M.dragMode; $('#mpDr').classList.toggle('pri',M.dragMode); $('#mpDr').textContent=M.dragMode?'Drag along the alignment…':'Drag range on map'; map.dragging[M.dragMode?'disable':'enable'](); };
    $('#mpExG').onclick=()=>exportPins('geojson'); $('#mpExK').onclick=()=>exportPins('kml'); $('#mpMx').onclick=openMatrixMap;
    map.on('mousedown',e=>{ if(!M.dragMode||!M.geo) return; M.dragStart=M.geo.project(e.latlng.lat,e.latlng.lng).ch; });
    map.on('mousemove',e=>{ if(M.dragStart==null||!M.dragMode) return; const b=M.geo.project(e.latlng.lat,e.latlng.lng).ch; M.chFrom=Math.round(Math.min(M.dragStart,b)); M.chTo=Math.round(Math.max(M.dragStart,b)); $('#mpCF').value=fmtCh(M.chFrom); $('#mpCT').value=fmtCh(M.chTo); redraw(); });
    map.on('mouseup',()=>{ if(M.dragStart==null) return; M.dragStart=null; M.dragMode=false; map.dragging.enable(); $('#mpDr').classList.remove('pri'); $('#mpDr').textContent='Drag range on map'; });
    function legend(){ const used=[...new Set(M.groups.flatMap(g=>g.items.map(p=>p.cat)))]; const lg=$('#mpLg'); if(lg) lg.innerHTML=used.map(c=>`<span style="display:inline-flex;gap:5px;align-items:center;margin-right:12px"><i style="width:11px;height:11px;border-radius:50%;background:${catColor(c)};display:inline-block"></i>${esc(c)}</span>`).join(''); }
    legend();
    setTimeout(()=>map.invalidateSize(),60);
    if(M.pendingMatrix){ M.pendingMatrix=false; setTimeout(()=>openMatrixMap(),120); }
  }

  // ---------------------------------------------------------------- map v2 tools
  function findPlace(){
    const q=($('#mpQ')?.value||'').trim(), msg=$('#mpFindMsg'); if(!q) return;
    const cm=/^(?:CH\s*)?(\d+)\s*\+\s*(\d{1,3})$/i.exec(q);
    if(cm){ if(!M.geo){ msg.textContent='Import a setup centreline or load a KMZ before searching chainage.'; return; } const ch=+cm[1]*1000+ +cm[2]; if(ch<M.geo.chMin||ch>M.geo.chMax){ msg.textContent=`CH ${fmtCh(ch)} is outside this alignment.`; return; } M.map.setView(M.geo.posOfCh(ch),16); msg.textContent=`Showing CH ${fmtCh(ch)}.`; return; }
    const available=selectedItems().filter(p=>p.ll), ql=q.toLowerCase(); let hits=available.filter(p=>A.structureCodes(p.it.structure).some(c=>c.toLowerCase()===ql)); if(!hits.length) hits=available.filter(p=>(p.it.structure||'').toLowerCase().includes(ql));
    if(!hits.length){ msg.textContent=`No mapped structure matches “${q}” in this period.`; return; }
    M.map.fitBounds(L_bounds(hits.map(p=>p.ll)),{padding:[60,60],maxZoom:17}); msg.textContent=`${hits.length} item${hits.length===1?'':'s'} at ${q}.`;
  }
  function exportPins(kind){
    const pts=points(), {from,to}=resolveRange(), p=P(); if(!pts.length){ const m=$('#mpFindMsg'); if(m) m.textContent='No mapped items to export for these filters.'; return; }
    const prop=x=>({report:x.r.ref,date:x.date,reporter:x.r.reporter,code:x.r.code,item:x.it.no,activity:x.it.activity,category:x.cat,location:x.it.location||'',structure:x.it.structure||'',locatedBy:x.how,gpsChainageDifferenceMetres:x.mismatch==null?null:Math.round(x.mismatch)});
    let text,name,type;
    if(kind==='geojson'){
      text=JSON.stringify({type:'FeatureCollection',name:`SiteBoard ${from} to ${to}`,features:pts.map(x=>({type:'Feature',geometry:{type:'Point',coordinates:[x.ll[1],x.ll[0]]},properties:prop(x)}))},null,2); name=`SiteBoard pins ${from} to ${to}.geojson`; type='application/geo+json';
    } else {
      const rows=pts.map(x=>{ const z=prop(x); return `<Placemark><name>${xml(x.r.ref+' #'+x.it.no)}</name><description>${xml(`${x.it.activity}\n${x.it.location||''}\n${x.r.reporter||''}`)}</description><ExtendedData>${Object.entries(z).map(([k,v])=>`<Data name="${xml(k)}"><value>${xml(v==null?'':v)}</value></Data>`).join('')}</ExtendedData><Point><coordinates>${x.ll[1]},${x.ll[0]},0</coordinates></Point></Placemark>`; }).join('');
      text=`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(p.subtitle||p.title)} · ${from} to ${to}</name>${rows}</Document></kml>`; name=`SiteBoard pins ${from} to ${to}.kml`; type='application/vnd.google-earth.kml+xml';
    }
    const blob=new Blob([text],{type}); save(name,blob); if(S.ISS) S.ISS.record({kind:'Export',type:kind==='geojson'?'GeoJSON':'KML',subject:name,to:'(downloaded)'},{name,blob});
  }
  function statsData(){
    const all=selectedItems(), located=all.filter(x=>x.ll), cov=coverageData(all), reps=[...new Set(all.map(x=>x.r.ref))], structures=[...new Set(all.flatMap(x=>A.structureCodes(x.it.structure)))].sort(), reporters=[...new Set(all.map(x=>x.r.reporter||x.r.code).filter(Boolean))].sort(), wx=A.weatherDays([...new Map(all.map(x=>[x.r.ref,x.r])).values()]);
    return {all,located,cov,reps,structures,reporters,wx,cats:A.count(all,x=>x.cat),photos:all.filter(x=>x.it.photo).length,rain:wx.filter(x=>x.rain).length,bad:all.filter(x=>x.mismatch>250).length};
  }
  function statsSvg(d){ return mapStatisticsSvg(d,{project:P(),...resolveRange(),start:M.chFrom??M.geo?.chMin,end:M.chTo??M.geo?.chMax}); }
  function statsText(d){ const p=P(),{from,to}=resolveRange(); return [`*MAP STATISTICS*  |  ${p.subtitle||p.title}`,`Period: ${A.fmtDate(from)} – ${A.fmtDate(to)}`,`Range: CH ${fmtCh(M.chFrom)} – CH ${fmtCh(M.chTo)}`,`Photos / items: ${d.photos} / ${d.all.length} from ${d.reps.length} reports`,`Coverage: ${Math.round(d.cov.pct*100)}% (${(d.cov.covered/1000).toFixed(1)} of ${(d.cov.total/1000).toFixed(1)} km)`,`Reporters: ${d.reporters.length} · Structures worked: ${d.structures.length} · Rain days: ${d.rain}`,d.bad?`GPS/chainage checks over 250 m: ${d.bad}`:'No GPS/chainage checks over 250 m','','Infographic attached.'].join('\n'); }
  async function openStats(){
    if(!M.geo){ drawer('<h3>Map statistics</h3><p class="sub">Load the project KMZ/KML first so chainage coverage can be calculated.</p>'); return; }
    drawer('<h3>Map statistics</h3><p class="sub" id="msMsg">Preparing infographic…</p>'); const d=statsData(); let img,blob; try{ img=await rasterize(statsSvg(d),2); blob=await (await fetch(img.url)).blob(); }catch(e){ $('#msMsg').textContent='Could not prepare the infographic: '+e.message; return; }
    const nm=`SiteBoard map statistics ${resolveRange().from} to ${resolveRange().to}`, text=statsText(d), file={name:nm+'.png',blob};
    drawer(`<h3>Map statistics</h3><p class="sub">Uses the period at the top of the page and CH ${fmtCh(M.chFrom)} – ${fmtCh(M.chTo)}. Category and reporter filters are applied.</p><img src="${img.url}" alt="Map statistics" style="width:100%;border:1px solid var(--line);border-radius:8px;background:#fff"><label class="fld" style="margin-top:10px">Description (editable)<textarea id="msT" rows="8" style="width:100%;font-family:var(--mono,monospace);font-size:12.5px">${esc(text)}</textarea></label><label class="fld" style="margin-top:8px">WhatsApp number (optional)<input id="msN" value="${esc(S.settings.waTo||'')}" placeholder="601XXXXXXXX"></label><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn pri" id="msW">Send via WhatsApp</button><button class="btn" id="msM">Attach to memo</button><button class="btn" id="msP">Download image</button><button class="btn" id="msF">Download PDF</button><button class="btn" id="msC">Copy image</button><span class="sub" id="msMsg"></span></div>`);
    $('#msP').onclick=()=>{ save(file.name,file.blob); S.ISS.record({kind:'Share',type:'Map statistics',subject:nm,to:'(downloaded)'},file); };
    $('#msF').onclick=async()=>{ try{ const {jsPDF}=await loadPdfLibs(),doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true}); await addImagePages(doc,img); doc.setProperties({title:nm,creator:'SiteBoard v'+VERSION}); const pb=doc.output('blob'); save(nm+'.pdf',pb); S.ISS.record({kind:'Share',type:'Map statistics',subject:nm,to:'(downloaded)'},{name:nm+'.pdf',blob:pb}); }catch(e){ $('#msMsg').textContent='Could not build PDF: '+e.message; } };
    $('#msC').onclick=async()=>{ try{ await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]); $('#msMsg').textContent='Image copied.'; }catch(_){ $('#msMsg').textContent='This browser cannot copy images. Use Download image.'; } };
    $('#msM').onclick=()=>{ MS.attachToMemo(file); S.tab='msg'; render(); };
    $('#msW').onclick=async()=>{ const b=$('#msW'); b.disabled=true; const num=$('#msN').value; S.settings.waTo=num; saveLS(); try{ const res=await sendWhatsApp({text:$('#msT').value,files:[file],phone:num}); $('#msMsg').textContent=res.msg; if(res.mode!=='cancelled') S.ISS.record({kind:'Share',type:'Map statistics',subject:nm,to:num||'(chosen in WhatsApp)'},file); }catch(e){ $('#msMsg').textContent='Could not send: '+e.message; } b.disabled=false; };
  }
  function setSnapshot(api){ M.snapshot=api; }
  function applyProjectConfig(){ useProjectGeometry(true); M.view=null; }
  function openMatrixMap(){ if(!M.snapshot) return; if(!M.map||!M.map.getContainer().isConnected){ M.pendingMatrix=true; S.tab='map'; render(); return; } M.snapshot.open('matrix-map'); }

  // ---------------------------------------------------------------- snap
  const wait=(img)=>new Promise(res=>{ if(img.complete) res(); else { img.onload=img.onerror=()=>res(); } });
  async function snapCanvas(scale=2){
    const map=M.map; const cont=map.getContainer(); const W=cont.clientWidth,H=cont.clientHeight; const top=46,foot=26;
    const cv=document.createElement('canvas'); cv.width=W*scale; cv.height=(H+top+foot)*scale; const g=cv.getContext('2d'); g.scale(scale,scale);
    g.fillStyle=M.base==='none'?'#eef1f3':'#dfe5e8'; g.fillRect(0,0,W,H+top+foot);
    const cr=cont.getBoundingClientRect(); g.save(); g.translate(0,top); g.beginPath(); g.rect(0,0,W,H); g.clip();
    let tiled=true; const imgs=[...cont.querySelectorAll('img.leaflet-tile')]; for(const im of imgs){ await wait(im); if(!im.naturalWidth) continue; const r=im.getBoundingClientRect(); try{ g.drawImage(im,r.left-cr.left,r.top-cr.top,r.width,r.height); }catch(_){ tiled=false; } }
    const P2=(ll)=>{ const q=map.latLngToContainerPoint(ll); return [q.x,q.y]; };
    const poly=(pts,col,w,al=1)=>{ if(pts.length<2) return; g.beginPath(); pts.forEach((p,i)=>{ const q=P2(p); i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]); }); g.strokeStyle=col; g.lineWidth=w; g.globalAlpha=al; g.lineJoin='round'; g.stroke(); g.globalAlpha=1; };
    const kz=M.kmz, geo=M.geo;
    if(M.show.row&&kz) for(const c of kz.row) poly(c,'#8a6d3b',1,.7);
    if(M.show.line&&geo){ poly(geo.L,'#fff',7,.9); poly(geo.L,T.navy,3.5); }
    if(geo&&M.chFrom!=null&&M.chTo!=null&&(M.chFrom>geo.chMin+1||M.chTo<geo.chMax-1)) poly(geo.segment(geo.chToS(M.chFrom),geo.chToS(M.chTo)),T.accent2,10,.2);
    if(M.show.coverage&&geo) for(const b of coverageData().bins.filter(x=>x.n)) poly(geo.segment(geo.chToS(b.from),geo.chToS(b.to)),catColor(b.cat),9,.78);
    g.font='600 10.5px IBM Plex Mono, monospace'; g.textBaseline='middle';
    if(M.show.chain&&geo){ const z=map.getZoom(); const step=z>=15?100:z>=13?500:1000; for(const ch of kmGrid(geo,geo.chMin,geo.chMax,step)){ const [x,y]=P2(geo.at(geo.chToS(ch))); if(x<-40||y<-20||x>W+40||y>H+20) continue; const t=fmtCh(ch),w=g.measureText(t).width+8; g.fillStyle='#fff'; g.strokeStyle=T.navy; g.lineWidth=1; g.beginPath(); g.rect(x-w/2,y-8,w,16); g.fill(); g.stroke(); g.fillStyle=T.navy; g.textAlign='center'; g.fillText(t,x,y+.5); } }
    if(M.show.poi&&kz){ g.font='600 11px Barlow, Arial, sans-serif'; g.textAlign='left'; for(const q of kz.poi){ const [x,y]=P2([q.lat,q.lon]); if(x<-100||y<-20||x>W+100||y>H+20) continue; g.save(); g.translate(x,y); g.rotate(Math.PI/4); g.fillStyle='#7b2cbf'; g.strokeStyle='#fff'; g.lineWidth=1.5; g.fillRect(-4.5,-4.5,9,9); g.strokeRect(-4.5,-4.5,9,9); g.restore(); if(map.getZoom()>=14){ g.lineWidth=3; g.strokeStyle='#fff'; g.strokeText(q.name,x+9,y); g.fillStyle='#3b1a5a'; g.fillText(q.name,x+9,y); } } }
    if(M.show.pins) for(const gr of M.groups){ const [x,y]=P2(gr.ll); if(x<-12||y<-12||x>W+12||y>H+12) continue; g.beginPath(); g.arc(x,y,11,0,7); g.fillStyle=catColor(gr.cat); g.fill(); g.lineWidth=2; g.strokeStyle='#fff'; g.stroke(); if(gr.items.length>1){ g.fillStyle='#fff'; g.font='700 11px Barlow, Arial, sans-serif'; g.textAlign='center'; g.fillText(gr.items.length,x,y+.5); } }
    if(M.show.gpsWarnings) for(const p of points().filter(x=>x.mismatch>250)){ const [x,y]=P2(p.ll); g.beginPath(); g.arc(x,y,15,0,7); g.strokeStyle='#b2271b'; g.lineWidth=2; g.setLineDash([4,3]); g.stroke(); g.setLineDash([]); }
    // legend
    const used=[...new Set(M.groups.flatMap(x=>x.items.map(p=>p.cat)))]; if(used.length&&M.show.pins){ g.font='12px Barlow, Arial, sans-serif'; const lw=Math.max(...used.map(c=>g.measureText(c).width))+34, lh=used.length*18+10; g.fillStyle='rgba(255,255,255,.92)'; g.fillRect(10,H-lh-10,lw,lh); g.strokeStyle='#cfd8dd'; g.lineWidth=1; g.strokeRect(10,H-lh-10,lw,lh); used.forEach((c,i)=>{ g.beginPath(); g.arc(24,H-lh-10+14+i*18,5,0,7); g.fillStyle=catColor(c); g.fill(); g.fillStyle=T.ink; g.textAlign='left'; g.fillText(c,36,H-lh-10+14+i*18+.5); }); }
    // scale bar
    { const y=H-14, p1=map.containerPointToLatLng([W-150,y]), p2=map.containerPointToLatLng([W-50,y]); const m=dist([p1.lat,p1.lng],[p2.lat,p2.lng]); const nice=[10,20,50,100,200,500,1000,2000,5000].filter(n=>n<=m).pop()||10; const px=100*nice/m; g.fillStyle='rgba(255,255,255,.85)'; g.fillRect(W-px-62,H-30,px+52,22); g.strokeStyle=T.ink; g.lineWidth=2; g.beginPath(); g.moveTo(W-px-52,H-16); g.lineTo(W-px-52,H-12); g.lineTo(W-52,H-12); g.lineTo(W-52,H-16); g.stroke(); g.fillStyle=T.ink; g.font='11px Barlow, Arial, sans-serif'; g.textAlign='left'; g.fillText(nice>=1000?nice/1000+' km':nice+' m',W-px-48,H-20); }
    g.restore();
    // header / footer
    const p=P(); g.fillStyle=T.navy; g.fillRect(0,0,W,top-4); g.fillStyle=T.accent2; g.fillRect(0,top-4,W,4);
    const {from,to}=resolveRange(); g.textBaseline='alphabetic'; g.textAlign='left'; g.fillStyle='#F2B79B'; g.font='700 10px Barlow, Arial, sans-serif'; g.fillText((p.consultant||'SITEBOARD').toUpperCase(),14,15);
    g.fillStyle='#fff'; g.font='700 15px Barlow, Arial, sans-serif'; g.fillText('Site photo map',14,34); g.textAlign='right'; g.font='12px Barlow, Arial, sans-serif'; g.fillText(p.subtitle||p.title||'',W-14,16); g.fillStyle='#C9D3DA'; g.fillText(`${A.fmtDate(from)} – ${A.fmtDate(to)}`,W-14,34);
    g.fillStyle='#fff'; g.fillRect(0,top+H,W,foot); g.fillStyle='#97A5AF'; g.font='10px Barlow, Arial, sans-serif'; g.textAlign='left'; g.fillText(`Generated by SiteBoard v${VERSION} · ${A.fmtDate(A.iso(new Date()))}`,12,top+H+16);
    g.textAlign='right'; g.fillText(BASE[M.base].att,W-12,top+H+16);
    return {cv,tiled};
  }
  function summary(){
    const b=M.map.getBounds(); const vis=M.groups.filter(x=>b.contains(x.ll)); const items=vis.flatMap(x=>x.items); const p=P(); const {from,to}=resolveRange();
    const chs=items.filter(x=>x.it.ch1!=null); const cats=A.count(items,x=>x.cat).slice(0,5).map(([c,n])=>`${c} ${n}`).join(', ');
    const L=[`*SITE PHOTO MAP*  |  ${p.subtitle||p.title}`,`Period: ${A.fmtDate(from)} – ${A.fmtDate(to)}`,`Shown: ${items.length} inspection photo${items.length!==1?'s':''} from ${new Set(items.map(x=>x.r.ref)).size} report${new Set(items.map(x=>x.r.ref)).size!==1?'s':''}`];
    if(chs.length) L.push(`Chainage shown: CH ${fmtCh(M.chFrom??Math.min(...chs.map(x=>x.it.ch1)))} – CH ${fmtCh(M.chTo??Math.max(...chs.map(x=>x.it.ch2)))}`);
    if(cats) L.push(`By category: ${cats}`); if(M.cat) L.push(`Filter: ${M.cat}`); L.push('','Map image attached.'); return L.join('\n');
  }
  async function openSnap(){
    drawer(`<h3>Snap map</h3><p class="sub" id="mnMsg">Preparing the picture…</p>`);
    let r; try{ r=await snapCanvas(2); r.blob=await new Promise((res,rej)=>{ try{ r.cv.toBlob(b=>b?res(b):rej(new Error('empty')),'image/png'); }catch(e){ rej(e); } }); }
    catch(e){ // tiles blocked by the browser (tainted canvas): redo without the basemap
      try{ const keep=M.baseLayer; if(keep) keep.remove(); await new Promise(r=>setTimeout(r,80)); r=await snapCanvas(2); r.blob=await new Promise(res=>r.cv.toBlob(res,'image/png')); r.noTiles=true; if(keep) keep.addTo(M.map); }
      catch(e2){ $('#mnMsg').textContent='Could not prepare the picture: '+e2.message; return; } }
    const url=URL.createObjectURL(r.blob); const nm=`SiteBoard map ${resolveRange().from} to ${resolveRange().to}`; const text=summary();
    drawer(`<h3>Snap map</h3><p class="sub" id="mnMsg">${r.noTiles?'The browser blocked the basemap for the picture, so it has the alignment and pins only. ':''}The picture shows what is on the screen now. Pan, zoom or change the layers, then snap again.</p>
     <img src="${url}" alt="Map" style="width:100%;border:1px solid var(--line);border-radius:8px;background:#fff">
     <label class="fld" style="margin-top:10px">Description (editable)<textarea id="mnT" rows="7" style="width:100%;font-family:var(--mono,monospace);font-size:12.5px">${esc(text)}</textarea></label>
     <label class="fld" style="margin-top:8px">WhatsApp number (optional)<input id="mnN" value="${esc(S.settings.waTo||'')}" placeholder="601XXXXXXXX (empty = choose in WhatsApp)"></label>
     <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center"><button class="btn pri" id="mnW">Send via WhatsApp</button><button class="btn" id="mnWm">Use in a WhatsApp message…</button><button class="btn" id="mnM">Attach to memo</button><button class="btn" id="mnP">Download image</button><button class="btn" id="mnF">Download PDF</button><button class="btn" id="mnC">Copy image</button></div>`);
    const file={name:nm+'.png',blob:r.blob};
    $('#mnP').onclick=()=>{ save(file.name,r.blob); S.ISS.record({kind:'Share',type:'Map',subject:nm,to:'(downloaded)'},file); };
    $('#mnF').onclick=async()=>{ try{ const {jsPDF}=await loadPdfLibs(); const doc=new jsPDF({orientation:r.cv.width>=r.cv.height?'landscape':'portrait',unit:'mm',format:'a4',compress:true}); const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(); const lines=doc.splitTextToSize(clean($('#mnT').value.replace(/\*/g,'')),W-24); const th=Math.min(lines.length,7)*3.6+4; let w=W-16,h=w*r.cv.height/r.cv.width; if(h>H-th-16){ h=H-th-16; w=h*r.cv.width/r.cv.height; } doc.addImage(r.cv.toDataURL('image/jpeg',.92),'JPEG',(W-w)/2,8,w,h,undefined,'FAST'); doc.setFontSize(8.5); doc.setTextColor(...hex(T.ink)); doc.text(lines.slice(0,7),12,8+h+6); doc.setProperties({title:nm,creator:'SiteBoard v'+VERSION}); save(nm+'.pdf',doc.output('blob')); }catch(e){ $('#mnMsg').textContent='Could not build PDF: '+e.message; } };
    $('#mnC').onclick=async()=>{ try{ await navigator.clipboard.write([new ClipboardItem({'image/png':r.blob})]); $('#mnMsg').textContent='Image copied. Paste it into WhatsApp or a document with Ctrl+V.'; }catch(_){ $('#mnMsg').textContent='This browser cannot copy images. Use Download image.'; } };
    $('#mnM').onclick=()=>{ MS.attachToMemo(file); S.tab='msg'; render(); };
    $('#mnWm').onclick=()=>MS.compose({title:'WhatsApp message with map',type:'General',subject:'Site map',body:$('#mnT').value.replace(/\n\nMap image attached\.$/,''),attach:[file]});
    $('#mnW').onclick=async()=>{ const b=$('#mnW'); b.disabled=true; const num=$('#mnN').value; S.settings.waTo=num; saveLS();
      try{ const res=await sendWhatsApp({text:$('#mnT').value,files:[file],phone:num}); $('#mnMsg').textContent=res.msg; if(res.mode!=='cancelled') S.ISS.record({kind:'Share',type:'Map',subject:nm,to:num||'(chosen in WhatsApp)'},file); }catch(e){ $('#mnMsg').textContent='Could not send: '+e.message; } b.disabled=false; };
  }
  async function snapshotForShare(){
    if(!M.map||!M.map.getContainer().isConnected) throw new Error('Open the Map tab before creating a matrix + map share.');
    let r; try{ r=await snapCanvas(2); r.blob=await canvasBlob(r.cv); }
    catch(e){ const keep=M.baseLayer; if(keep) keep.remove(); try{ await new Promise(res=>setTimeout(res,80)); r=await snapCanvas(2); r.blob=await canvasBlob(r.cv); r.noTiles=true; } finally { if(keep) keep.addTo(M.map); } }
    return {...r,text:summary()};
  }
  const save=(name,blob)=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); };
  return { vMap, openSnap, openMatrixMap, snapshotForShare, setSnapshot, loadKmlText, applyProjectConfig };
}
