// Map: load the project KMZ/KML (alignment, chainage, points of interest) and plot the inspections / photos along it.
// Everything stays in the browser. Basemap tiles (OpenStreetMap / Esri) are the only network use.
import * as A from './analysis.js';
import { PROJECT, CAT_COLORS, VERSION } from './config.js';
import { esc } from './charts.js';
const catColor=(c)=>(CAT_COLORS[c]||CAT_COLORS.Other)[0];
import { T, hex, clean, ensureScript, loadPdfLibs } from './theme.js';
import { dbGet, dbPut, dbDel } from './db.js';
import { loadInto } from './photos.js';
import { sendWhatsApp } from './messages.js';

// ------------------------------------------------------------------ KMZ / KML
async function inflateRaw(u8){ const ds=new DecompressionStream('deflate-raw'); const w=ds.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
async function kmlFromBuffer(buf,name){
  const u8=new Uint8Array(buf);
  if(!(u8[0]===0x50&&u8[1]===0x4b)) return new TextDecoder().decode(u8);           // plain KML
  const dv=new DataView(buf); let e=u8.length-22; while(e>=0&&dv.getUint32(e,true)!==0x06054b50) e--;
  if(e<0) throw new Error('This does not look like a KMZ file.');
  const n=dv.getUint16(e+10,true); let p=dv.getUint32(e+16,true); const list=[];
  for(let i=0;i<n;i++){ if(dv.getUint32(p,true)!==0x02014b50) break;
    const method=dv.getUint16(p+10,true), cs=dv.getUint32(p+20,true), nl=dv.getUint16(p+28,true), el=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true), lho=dv.getUint32(p+42,true);
    list.push({name:new TextDecoder().decode(u8.slice(p+46,p+46+nl)),method,cs,lho}); p+=46+nl+el+cl; }
  const kmls=list.filter(f=>/\.kml$/i.test(f.name)); if(!kmls.length) throw new Error('No .kml found inside the KMZ.');
  const f=kmls.find(k=>/(^|\/)doc\.kml$/i.test(k.name))||kmls[0];
  const nl2=dv.getUint16(f.lho+26,true), el2=dv.getUint16(f.lho+28,true); const start=f.lho+30+nl2+el2; const data=u8.slice(start,start+f.cs);
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
function makeGeo(k){
  if(!k||!k.line) return null; const L=k.line; const lat0=L[0][0]; const kx=Math.cos(lat0*rad)*111320, ky=110574;
  const xy=L.map(([la,lo])=>[lo*kx,la*ky]); const d=[0]; for(let i=1;i<xy.length;i++) d.push(d[i-1]+Math.hypot(xy[i][0]-xy[i-1][0],xy[i][1]-xy[i-1][1]));
  const proj=(lat,lon)=>{ const x=lon*kx,y=lat*ky; let bi=0,bd=1e18,bt=0; for(let i=0;i<xy.length-1;i++){ const [x1,y1]=xy[i],[x2,y2]=xy[i+1]; const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy||1; let t=((x-x1)*dx+(y-y1)*dy)/l2; t=Math.max(0,Math.min(1,t)); const px=x1+t*dx,py=y1+t*dy,dd=(x-px)**2+(y-py)**2; if(dd<bd){ bd=dd; bi=i; bt=t; } } return d[bi]+bt*(d[bi+1]-d[bi]); };
  let ctl=(k.chain||[]).map(c=>({ch:c.ch,s:proj(c.lat,c.lon)})).sort((a,b)=>a.ch-b.ch);
  const fwd=[]; for(const c of ctl){ if(!fwd.length||c.s>fwd.at(-1).s) fwd.push(c); } ctl=fwd;       // keep monotonic
  if(ctl.length<2){ const a=A.ALIGN||{}; const c0=a.start??62700, c1=a.end??77508; ctl=[{ch:c0,s:0},{ch:c1,s:d.at(-1)}]; }
  const chToS=(ch)=>{ let i=0; if(ch<=ctl[0].ch) i=0; else if(ch>=ctl.at(-1).ch) i=ctl.length-2; else { while(ctl[i+1].ch<ch) i++; } const a=ctl[i],b=ctl[i+1]; const s=a.s+(ch-a.ch)*(b.s-a.s)/((b.ch-a.ch)||1); return Math.max(0,Math.min(d.at(-1),s)); };
  const sToCh=(s)=>{ let i=0; if(s<=ctl[0].s) i=0; else if(s>=ctl.at(-1).s) i=ctl.length-2; else { while(ctl[i+1].s<s) i++; } const a=ctl[i],b=ctl[i+1]; return a.ch+(s-a.s)*(b.ch-a.ch)/((b.s-a.s)||1); };
  const at=(s,off=0)=>{ let lo=0,hi=d.length-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(d[m]<=s) lo=m; else hi=m; } const t=(s-d[lo])/((d[hi]-d[lo])||1); const x=xy[lo][0]+t*(xy[hi][0]-xy[lo][0]), y=xy[lo][1]+t*(xy[hi][1]-xy[lo][1]);
    if(!off) return [y/ky,x/kx]; const dx=xy[hi][0]-xy[lo][0],dy=xy[hi][1]-xy[lo][1],l=Math.hypot(dx,dy)||1; return [(y+off*dx/l)/ky,(x-off*dy/l)/kx]; };   // +off = left of travel (LHS)
  const segment=(s1,s2)=>{ const out=[at(s1)]; for(let i=0;i<d.length;i++) if(d[i]>s1&&d[i]<s2) out.push([L[i][0],L[i][1]]); out.push(at(s2)); return out; };
  return { L, total:d.at(-1), chMin:ctl[0].ch, chMax:ctl.at(-1).ch, chToS, sToCh, at, segment, posOfCh:(ch,side)=>at(chToS(ch),/^LHS$/i.test(side||'')?10:/^RHS$/i.test(side||'')?-10:0) };
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

export function makeMap(ctx){
  const { S, $, drawer, resolveRange, inRange, MS, openReport, saveLS, render } = ctx;
  const P=()=>({...PROJECT,...(S.settings.project||{})});
  const M={ kmz:null, geo:null, map:null, layers:{}, base:'osm', show:{line:true,chain:true,poi:true,row:false,pins:true}, cat:'', who:'', view:null, groups:[], stat:{}, loaded:false };
  const status=()=>M.kmz?`${M.kmz.name} · ${M.kmz.line?(M.geo.total/1000).toFixed(1)+' km alignment':'no alignment line found'} · ${M.kmz.chain.length} chainage marks · ${M.kmz.poi.length} points of interest`:'No KMZ loaded';

  async function ensureLeaflet(){ if(window.L) return; if(!document.querySelector('link[data-lf]')){ const l=document.createElement('link'); l.rel='stylesheet'; l.href='vendor/leaflet/leaflet.css'; l.dataset.lf='1'; document.head.appendChild(l); } await ensureScript('vendor/leaflet/leaflet.js'); }
  async function restore(){ if(M.loaded) return; M.loaded=true; try{ const k=await dbGet('meta','kmz'); if(k&&k.data){ M.kmz=k.data; M.kmz.name=k.name||'KMZ'; M.geo=makeGeo(M.kmz); } }catch(_){} }
  async function loadFile(f){
    const text=await kmlFromBuffer(await f.arrayBuffer(),f.name); const k=parseKml(text); if(!k.line&&!k.chain.length&&!k.poi.length) throw new Error('No alignment, chainage or points found in this file.');
    k.name=f.name; M.kmz=k; M.geo=makeGeo(k); await dbPut('meta','kmz',{name:f.name,data:k,saved:Date.now()});
  }

  // ---- what to plot
  function points(){
    const reps=inRange(); const out=[]; const g=M.geo; let gps=0,ch=0,none=0;
    for(const r of reps) for(const it of r.items){
      const cat=A.categorize((it.acts&&it.acts[0])||it.activity); if(M.cat&&cat!==M.cat) continue; if(M.who&&r.code!==M.who) continue;
      let ll=null,how='';
      if(it.gps&&isFinite(it.gps.lat)&&isFinite(it.gps.lon)&&Math.abs(it.gps.lat)>1){ ll=[it.gps.lat,it.gps.lon]; how='GPS'; gps++; }
      else if(g&&it.ch1!=null){ ll=g.posOfCh((it.ch1+it.ch2)/2,it.side); how='chainage'; ch++; }
      if(!ll){ none++; continue; }
      out.push({r,it,cat,ll,how,date:r.date});
    }
    M.stat={items:out.length+none,placed:out.length,gps,ch,none,reports:reps.length};
    return out;
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
      d.innerHTML=`${p.it.photo?'<img alt="" style="width:100%;border-radius:6px;background:#e6e8ea;min-height:60px;display:block">':''}<div style="font-size:12.5px;margin-top:4px"><b>${String(p.it.no).padStart(2,'0')} ${esc(p.it.activity)}</b><br>${esc(A.fmtDate(p.date))} · ${esc(p.r.reporter||'')}<br>${esc(p.it.location||'')}${p.it.structure?' · '+esc(p.it.structure):''}<br><span style="color:#59636b">${esc(p.cat)} · located by ${p.how}</span></div><div style="margin-top:5px;display:flex;gap:6px"><button class="btn sm" data-o>Open report</button><button class="btn sm" data-c>Comment…</button></div>`;
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
    if(M.show.chain&&g){ const step=map.getZoom()>=15?100:map.getZoom()>=13?500:1000; const f=L.featureGroup(); for(const ch of kmGrid(g,g.chMin,g.chMax,step)){ const p=g.at(g.chToS(ch)); f.addLayer(L.marker(p,{interactive:false,icon:L.divIcon({className:'',iconSize:[0,0],html:`<div style="transform:translate(-50%,-50%);background:#fff;border:1px solid ${T.navy};border-radius:3px;padding:0 4px;font:600 10.5px IBM Plex Mono,monospace;color:${T.navy};white-space:nowrap">${fmtCh(ch)}</div>`})})); } ls.chain=f.addTo(map); }
    if(M.show.poi&&k&&k.poi.length){ const f=L.featureGroup(); for(const q of k.poi) f.addLayer(L.marker([q.lat,q.lon],{icon:L.divIcon({className:'',iconSize:[0,0],html:`<div style="transform:translate(-4px,-4px);display:flex;gap:4px;align-items:center;white-space:nowrap"><span style="width:9px;height:9px;background:#7b2cbf;border:1.5px solid #fff;transform:rotate(45deg);display:block"></span>${map.getZoom()>=14?`<span style="font:600 11px Barlow,Arial,sans-serif;color:#3b1a5a;text-shadow:0 0 3px #fff,0 0 3px #fff">${esc(q.name)}</span>`:''}</div>`})})); ls.poi=f.addTo(map); }
    if(M.show.pins){ M.groups=group(points(),radiusAt(map)); const f=L.featureGroup(); for(const gr of M.groups){ const m=L.marker(gr.ll,{icon:L.divIcon({className:'',iconSize:[22,22],iconAnchor:[11,11],html:pinHtml(gr)})}); m.bindPopup(()=>popup(gr),{maxWidth:290,minWidth:270}); f.addLayer(m); } ls.pins=f.addTo(map); }
    else { points(); M.groups=[]; }
    info();
  }
  function info(){ const e=$('#mpInfo'); if(!e) return; const s=M.stat; e.innerHTML=`<b>${s.placed}</b> of ${s.items} items placed on the map from ${s.reports} reports (${s.gps} by GPS, ${s.ch} by chainage)${s.none?` · <span style="color:var(--bad,#b2271b)">${s.none} not placed</span> ${M.geo?'(no chainage or GPS in the report)':'(load the KMZ so chainage can be placed)'}`:''}.`; }
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
    const reps=inRange(); const cats=[...new Set(S.reports.flatMap(r=>r.items.map(it=>A.categorize((it.acts&&it.acts[0])||it.activity))))].sort(); const people=[...new Map(S.reports.map(r=>[r.code,r.reporter])).entries()];
    const sel=(arr,cur,all)=>`<option value="">${all}</option>`+arr.map(x=>{ const [a,b]=Array.isArray(x)?x:[x,x]; return `<option value="${esc(a)}" ${cur===a?'selected':''}>${esc(b)}</option>`; }).join('');
    const chk=(id,key,l)=>`<label style="display:inline-flex;gap:4px;align-items:center;margin-right:10px"><input type="checkbox" id="${id}" ${M.show[key]?'checked':''}>${l}</label>`;
    v.innerHTML=`<div class="card"><h2>Site map</h2><div class="sub">Inspections and photos plotted along the project alignment. Items with GPS in the report are placed by GPS; others by their chainage on the KMZ alignment. The KMZ stays on this computer.</div>
     <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0"><button class="btn pri" id="mpK">${M.kmz?'Replace KMZ…':'Load KMZ / KML…'}</button><input type="file" id="mpF" accept=".kmz,.kml" style="display:none">${M.kmz?'<button class="btn" id="mpFg">Forget KMZ</button>':''}<span class="sub" id="mpSt" style="margin:0">${esc(status())}</span></div>
     <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><label class="fld" style="margin:0">Basemap<select id="mpB">${Object.entries(BASE).map(([k,b])=>`<option value="${k}" ${M.base===k?'selected':''}>${b.name}</option>`).join('')}</select></label>
      <label class="fld" style="margin:0">Category<select id="mpC">${sel(cats,M.cat,'All categories')}</select></label><label class="fld" style="margin:0">Reported by<select id="mpW">${sel(people,M.who,'Everyone')}</select></label>
      <span style="flex:1"></span><button class="btn sm" id="mpFl">Zoom to alignment</button><button class="btn sm" id="mpFp">Zoom to photos</button><button class="btn pri" id="mpSn">Snap map…</button></div>
     <div style="margin-bottom:8px;font-size:13px">${chk('mpL','line','Alignment')}${chk('mpH','chain','Chainage')}${chk('mpP','poi','Points of interest')}${chk('mpR','row','ROW boundary')}${chk('mpI','pins','Inspections / photos')}</div>
     <div id="mpMap" style="position:relative;z-index:0;isolation:isolate;height:600px;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#dfe5e8"></div><div class="sub" id="mpInfo" style="margin-top:8px"></div>
     <div id="mpLg" style="margin-top:4px;font-size:12.5px"></div>${navigator.onLine===false?'<p class="sub">You appear to be offline: the basemap needs internet, the alignment and pins still show.</p>':''}</div>`;
    $('#mpK').onclick=()=>$('#mpF').click();
    $('#mpF').onchange=async(e)=>{ const f=e.target.files[0]; if(!f) return; $('#mpSt').textContent='Reading '+f.name+'…'; try{ await loadFile(f); M.view=null; render(); }catch(er){ $('#mpSt').textContent='Could not read the file: '+er.message; } };
    const fg=$('#mpFg'); if(fg) fg.onclick=async()=>{ await dbDel('meta','kmz'); M.kmz=null; M.geo=null; M.view=null; render(); };
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
    for(const [id,key] of [['#mpL','line'],['#mpH','chain'],['#mpP','poi'],['#mpR','row'],['#mpI','pins']]) $(id).onchange=(e)=>{ M.show[key]=e.target.checked; redraw(); };
    $('#mpFl').onclick=fitLine; $('#mpFp').onclick=fitPins; $('#mpSn').onclick=openSnap;
    function legend(){ const used=[...new Set(M.groups.flatMap(g=>g.items.map(p=>p.cat)))]; const lg=$('#mpLg'); if(lg) lg.innerHTML=used.map(c=>`<span style="display:inline-flex;gap:5px;align-items:center;margin-right:12px"><i style="width:11px;height:11px;border-radius:50%;background:${catColor(c)};display:inline-block"></i>${esc(c)}</span>`).join(''); }
    legend();
    setTimeout(()=>map.invalidateSize(),60);
  }

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
    g.font='600 10.5px IBM Plex Mono, monospace'; g.textBaseline='middle';
    if(M.show.chain&&geo){ const z=map.getZoom(); const step=z>=15?100:z>=13?500:1000; for(const ch of kmGrid(geo,geo.chMin,geo.chMax,step)){ const [x,y]=P2(geo.at(geo.chToS(ch))); if(x<-40||y<-20||x>W+40||y>H+20) continue; const t=fmtCh(ch),w=g.measureText(t).width+8; g.fillStyle='#fff'; g.strokeStyle=T.navy; g.lineWidth=1; g.beginPath(); g.rect(x-w/2,y-8,w,16); g.fill(); g.stroke(); g.fillStyle=T.navy; g.textAlign='center'; g.fillText(t,x,y+.5); } }
    if(M.show.poi&&kz){ g.font='600 11px Barlow, Arial, sans-serif'; g.textAlign='left'; for(const q of kz.poi){ const [x,y]=P2([q.lat,q.lon]); if(x<-100||y<-20||x>W+100||y>H+20) continue; g.save(); g.translate(x,y); g.rotate(Math.PI/4); g.fillStyle='#7b2cbf'; g.strokeStyle='#fff'; g.lineWidth=1.5; g.fillRect(-4.5,-4.5,9,9); g.strokeRect(-4.5,-4.5,9,9); g.restore(); if(map.getZoom()>=14){ g.lineWidth=3; g.strokeStyle='#fff'; g.strokeText(q.name,x+9,y); g.fillStyle='#3b1a5a'; g.fillText(q.name,x+9,y); } } }
    if(M.show.pins) for(const gr of M.groups){ const [x,y]=P2(gr.ll); if(x<-12||y<-12||x>W+12||y>H+12) continue; g.beginPath(); g.arc(x,y,11,0,7); g.fillStyle=catColor(gr.cat); g.fill(); g.lineWidth=2; g.strokeStyle='#fff'; g.stroke(); if(gr.items.length>1){ g.fillStyle='#fff'; g.font='700 11px Barlow, Arial, sans-serif'; g.textAlign='center'; g.fillText(gr.items.length,x,y+.5); } }
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
    if(chs.length) L.push(`Chainage covered: CH ${fmtCh(Math.min(...chs.map(x=>x.it.ch1)))} – CH ${fmtCh(Math.max(...chs.map(x=>x.it.ch2)))}`);
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
    $('#mnP').onclick=()=>save(file.name,r.blob);
    $('#mnF').onclick=async()=>{ try{ const {jsPDF}=await loadPdfLibs(); const doc=new jsPDF({orientation:r.cv.width>=r.cv.height?'landscape':'portrait',unit:'mm',format:'a4',compress:true}); const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(); const lines=doc.splitTextToSize(clean($('#mnT').value.replace(/\*/g,'')),W-24); const th=Math.min(lines.length,7)*3.6+4; let w=W-16,h=w*r.cv.height/r.cv.width; if(h>H-th-16){ h=H-th-16; w=h*r.cv.width/r.cv.height; } doc.addImage(r.cv.toDataURL('image/jpeg',.92),'JPEG',(W-w)/2,8,w,h,undefined,'FAST'); doc.setFontSize(8.5); doc.setTextColor(...hex(T.ink)); doc.text(lines.slice(0,7),12,8+h+6); doc.setProperties({title:nm,creator:'SiteBoard v'+VERSION}); save(nm+'.pdf',doc.output('blob')); }catch(e){ $('#mnMsg').textContent='Could not build PDF: '+e.message; } };
    $('#mnC').onclick=async()=>{ try{ await navigator.clipboard.write([new ClipboardItem({'image/png':r.blob})]); $('#mnMsg').textContent='Image copied. Paste it into WhatsApp or a document with Ctrl+V.'; }catch(_){ $('#mnMsg').textContent='This browser cannot copy images. Use Download image.'; } };
    $('#mnM').onclick=()=>{ MS.attachToMemo(file); S.tab='msg'; render(); };
    $('#mnWm').onclick=()=>MS.compose({title:'WhatsApp message with map',type:'General',subject:'Site map',body:$('#mnT').value.replace(/\n\nMap image attached\.$/,''),attach:[file]});
    $('#mnW').onclick=async()=>{ const b=$('#mnW'); b.disabled=true; const num=$('#mnN').value; S.settings.waTo=num; saveLS();
      try{ const res=await sendWhatsApp({text:$('#mnT').value,files:[file],phone:num}); $('#mnMsg').textContent=res.msg; if(res.mode!=='cancelled') MS.logSent({kind:'message',type:'Map',subject:nm,to:num||'(chosen in WhatsApp)',files:[file.name],text:$('#mnT').value}); }catch(e){ $('#mnMsg').textContent='Could not send: '+e.message; } b.disabled=false; };
  }
  const save=(name,blob)=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); };
  return { vMap, openSnap };
}
