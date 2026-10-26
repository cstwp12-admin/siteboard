// Phase 3: photo gallery + structure status board
import * as A from './analysis.js';
import { CAT_ORDER } from './config.js';
import { esc, catColor } from './charts.js';
import { getPhoto, getPhotoLarge, extractReport, loadInto } from './photos.js';
import { structuresList, matchStructures, GROUPS } from './structures.js';
import { fmtCh } from './parser.js';

export function makeGallery(ctx){
  const {S,$,drawer,wireCommon,refLink,resolveRange,openReport,saveLS,render}=ctx;
  const G={ from:'', to:'', who:'', cat:'', struct:'', zone:'', ch1:'', ch2:'', q:'', rem:false, shown:60, init:false, list:[] };
  const SB={ grp:'', state:'', zone:'', q:'' };
  const chNum=(s)=>{ s=String(s||'').trim(); if(!s) return null; const m=s.match(/^(\d+)\s*[+]\s*(\d+)$/); if(m) return +m[1]*1000+ +m[2]; const n=parseFloat(s); return isNaN(n)?null:(n<1000?n*1000:n); };
  const catOf=(it)=>A.categorize((it.acts&&it.acts[0])||it.activity);
  const opt=(arr,cur,all)=>`<option value="">${all}</option>`+arr.map(x=>{ const [v,l]=Array.isArray(x)?x:[x,x]; return `<option value="${esc(v)}" ${cur===v?'selected':''}>${esc(l)}</option>`; }).join('');

  function allPhotos(){
    const out=[]; for(const r of S.reports) for(const it of r.items){ if(!it.photo||(it.activity===''&&!it.photo)) continue; out.push({r,it,date:r.date,cat:catOf(it),zone:A.zoneForItem(it),codes:A.structureCodes(it.structure)||[]}); }
    out.sort((a,b)=>b.date.localeCompare(a.date)||a.r.ref.localeCompare(b.r.ref)||a.it.no-b.it.no); return out;
  }
  function filtered(all){
    const c1=chNum(G.ch1), c2=chNum(G.ch2), q=G.q.toLowerCase().trim();
    return all.filter(p=>{
      if(G.from&&p.date<G.from) return false; if(G.to&&p.date>G.to) return false;
      if(G.who&&p.r.code!==G.who) return false; if(G.cat&&p.cat!==G.cat) return false;
      if(G.zone&&p.zone!==G.zone) return false;
      if(G.struct&&!p.codes.includes(G.struct)) return false;
      if(c1!=null&&(p.it.ch2==null||p.it.ch2<c1)) return false; if(c2!=null&&(p.it.ch1==null||p.it.ch1>c2)) return false;
      if(G.rem&&!(p.it.remarks||'').trim()) return false;
      if(q&&!(p.it.activity+' '+p.it.location+' '+p.it.structure+' '+p.it.bq+' '+p.it.remarks+' '+p.r.reporter+' '+p.r.ref).toLowerCase().includes(q)) return false;
      return true; });
  }
  const capHtml=(p)=>`<b>${String(p.it.no).padStart(2,'0')} ${esc(p.it.activity)}</b><br>${esc(A.fmtShort(p.date))} · ${esc(p.r.reporter)}${p.it.location?'<br>'+esc(p.it.location):''}`;

  let io=null;
  function lazy(root){
    if(io) io.disconnect();
    io=new IntersectionObserver((es)=>{ for(const e of es) if(e.isIntersecting){ io.unobserve(e.target); const i=+e.target.dataset.i; const p=G.list[i]; if(!p) continue; loadInto(e.target,p.r,p.it); } },{rootMargin:'300px'});
    root.querySelectorAll('img[data-i]').forEach(im=>io.observe(im));
  }

  function vGallery(v){
    const all=allPhotos();
    if(!G.init){ const {from,to}=resolveRange(); G.from=from; G.to=to; G.init=true; }
    const people=[...new Map(S.reports.map(r=>[r.code,r.reporter])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
    const cats=CAT_ORDER.filter(c=>all.some(p=>p.cat===c)); const zones=[...new Set(all.map(p=>p.zone).filter(Boolean))].sort();
    const codes=[...new Set(all.flatMap(p=>p.codes))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    v.innerHTML=`<div class="card"><div class="frm" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
      <label class="fld">From<input type="date" id="gF" value="${G.from}"></label><label class="fld">To<input type="date" id="gT" value="${G.to}"></label>
      <label class="fld">Reporter<select id="gW">${opt(people.map(([c,n])=>[c,n]),G.who,'Everyone')}</select></label>
      <label class="fld">Activity category<select id="gC">${opt(cats,G.cat,'All categories')}</select></label>
      <label class="fld">Structure<select id="gS">${opt(codes,G.struct,'Any / none')}</select></label>
      <label class="fld">Zone<select id="gZ">${opt(zones,G.zone,'All zones')}</select></label>
      <label class="fld">Chainage from<input id="gC1" placeholder="e.g. 66+300" value="${esc(G.ch1)}"></label><label class="fld">Chainage to<input id="gC2" placeholder="e.g. 67+000" value="${esc(G.ch2)}"></label>
      <label class="fld">Text<input id="gQ" placeholder="activity, location, remark…" value="${esc(G.q)}"></label>
      <label class="fld" style="justify-content:end"><span><input type="checkbox" id="gR" ${G.rem?'checked':''}> With remarks only</span></label></div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><span class="sub" id="gCnt" style="margin:0"></span><span style="flex:1"></span>
      <button class="btn sm" id="gAll">Prepare all thumbnails</button><button class="btn sm" id="gX">Reset filters</button><span class="sub" id="gPg" style="margin:0"></span></div></div>
      <div class="ph-grid gal" id="gGrid" style="margin-top:12px"></div><div style="text-align:center;margin:14px"><button class="btn" id="gMore">Show more</button></div>`;
    const bind=(id,k,ev='onchange')=>{ $(id)[ev]=(e)=>{ G[k]=e.target.type==='checkbox'?e.target.checked:e.target.value; G.shown=60; draw(v,all); }; };
    bind('#gF','from'); bind('#gT','to'); bind('#gW','who'); bind('#gC','cat'); bind('#gS','struct'); bind('#gZ','zone'); bind('#gC1','ch1'); bind('#gC2','ch2'); bind('#gR','rem');
    let t; $('#gQ').oninput=(e)=>{ G.q=e.target.value; clearTimeout(t); t=setTimeout(()=>{ G.shown=60; draw(v,all); },200); };
    $('#gX').onclick=()=>{ Object.assign(G,{from:'',to:'',who:'',cat:'',struct:'',zone:'',ch1:'',ch2:'',q:'',rem:false,shown:60,init:true}); vGallery(v); };
    $('#gMore').onclick=()=>{ G.shown+=60; draw(v,all); };
    $('#gAll').onclick=()=>prefetch(all);
    draw(v,all);
  }
  function draw(v,all){
    G.list=filtered(all); const g=$('#gGrid'); const n=G.list.length, k=Math.min(n,G.shown);
    $('#gCnt').textContent=`${n} photo${n===1?'':'s'} of ${all.length}`;
    g.innerHTML=G.list.slice(0,k).map((p,i)=>`<div class="ph gp" data-o="${i}" style="cursor:pointer"><img alt="" data-i="${i}"><div class="cap">${capHtml(p)}<br><span class="badge" style="background:${catColor(p.cat)}22;color:var(--ink)">${esc(p.cat)}</span>${p.it.remarks?' <span class="badge warn">remark</span>':''}</div></div>`).join('')||'<p class="sub" style="padding:16px">No photos match these filters.</p>';
    $('#gMore').style.display=k<n?'inline-block':'none';
    g.querySelectorAll('.gp').forEach(d=>d.onclick=()=>lightbox(+d.dataset.o));
    lazy(g);
  }
  async function prefetch(all){
    const b=$('#gAll'); const todo=G.list.length?G.list:all; const reps=[...new Set(todo.map(p=>p.r))]; let done=0; b.disabled=true;
    for(const r of reps){ b.textContent=`Preparing… ${done}/${reps.length} reports`; try{ await extractReport(r); }catch(_){} done++; }
    b.textContent='Thumbnails ready ✓'; setTimeout(()=>{ b.disabled=false; b.textContent='Prepare all thumbnails'; },2500); document.querySelectorAll('img[data-i]').forEach(im=>{ const p=G.list[+im.dataset.i]; if(p&&!im.src) loadInto(im,p.r,p.it); });
  }

  // ---------------- lightbox
  let LB=null, idx=0, seq=0;
  function lightbox(i,list){
    if(list) G.list=list;
    if(!LB){ LB=document.createElement('div'); LB.id='lb'; LB.style.cssText='position:fixed;inset:0;z-index:100;background:#000d;display:none;color:#fff;font-size:13px';
      LB.innerHTML=`<div style="position:absolute;inset:0;display:flex;flex-direction:column"><div style="flex:1;display:flex;align-items:center;justify-content:center;min-height:0;position:relative;padding:12px"><img id="lbI" alt="" style="max-width:100%;max-height:100%;object-fit:contain;background:#222"><button class="btn" id="lbP" style="position:absolute;left:12px">‹</button><button class="btn" id="lbN" style="position:absolute;right:12px">›</button><button class="btn" id="lbX" style="position:absolute;right:12px;top:12px">Close ✕</button></div><div id="lbC" style="padding:10px 18px 16px;max-height:34vh;overflow:auto;background:#111;line-height:1.5"></div></div>`;
      document.body.appendChild(LB);
      LB.querySelector('#lbX').onclick=()=>LB.style.display='none'; LB.querySelector('#lbP').onclick=()=>show(idx-1); LB.querySelector('#lbN').onclick=()=>show(idx+1);
      document.addEventListener('keydown',(e)=>{ if(LB.style.display==='none') return; if(e.key==='Escape') LB.style.display='none'; if(e.key==='ArrowLeft') show(idx-1); if(e.key==='ArrowRight') show(idx+1); });
    }
    LB.style.display='block'; show(i);
  }
  async function show(i){
    if(i<0||i>=G.list.length) return; idx=i; const p=G.list[i], my=++seq, it=p.it, r=p.r;
    const img=LB.querySelector('#lbI'); img.removeAttribute('src');
    const gps=it.gps?`<a href="https://www.google.com/maps?q=${it.gps.lat},${it.gps.lon}" target="_blank" rel="noopener" style="color:#9cf">Open GPS location</a>`:'';
    LB.querySelector('#lbC').innerHTML=`<b style="font-size:15px">${String(it.no).padStart(2,'0')} ${esc(it.activity)}</b> <span style="opacity:.7">· ${i+1} / ${G.list.length}</span><br>
      ${esc(A.fmtDate(p.date,true))}${it.time?' · '+esc(it.time):''} · ${esc(r.reporter)}, ${esc(r.role)} · ${esc(r.ref)}<br>
      ${it.location?'Location: '+esc(it.location)+'<br>':''}${it.ch1!=null?'Chainage: '+esc(fmtCh(it.ch1))+(it.ch2!==it.ch1&&it.ch2!=null?' – '+esc(fmtCh(it.ch2)):'')+'<br>':''}${it.structure?'Structure: '+esc(it.structure)+'<br>':''}${it.bq?'BQ: '+esc(it.bq)+' · ':''}${it.status?'Status: '+esc(it.status):''}${it.remarks?'<br>Remarks: '+esc(it.remarks):''}
      <br><span class="lnk" id="lbR" style="color:#9cf;cursor:pointer;text-decoration:underline">Open report</span> ${gps?' · '+gps:''} · <a id="lbD" download="${esc(r.ref)}_${it.no}.jpg" style="color:#9cf" href="#">Download photo</a>`;
    LB.querySelector('#lbR').onclick=()=>{ LB.style.display='none'; openReport(r.ref); };
    const u=await getPhoto(r,it).catch(()=>null); if(my!==seq) return; if(u){ img.src=u; LB.querySelector('#lbD').href=u; }
    const big=await getPhotoLarge(r,it).catch(()=>null); if(my!==seq) return; if(big){ img.src=big; LB.querySelector('#lbD').href=big; }
  }

  // ---------------- structures
  const DAYS_ACTIVE=7;
  const HOW={code:'',manual:' (assigned)',chainage:' (by chainage)'};
  function state(e,t){ if(!e.recs.length) return ['none','No record']; const d=e.recs[0].date; return A.addDays(t,-DAYS_ACTIVE)<=d ? ['act','Active ('+DAYS_ACTIVE+' d)'] : ['rec','Recorded']; }
  const mark=(x)=>x&&x.how==='chainage'?(x.amb?' <i class="sub" title="Another structure is about as close; check">(ch.?)</i>':' <i class="sub">(ch.)</i>'):x&&x.how==='manual'?' <i class="sub">(set)</i>':'';
  function vStructures(v){
    const t=A.iso(new Date()); const sts=structuresList(S.settings); const M=matchStructures(S.reports,sts,S.settings);
    const rows=sts.map(s=>{ const e=M.get(s.id); const [k,l]=state(e,t); const last=e.recs[0]; const ph=e.recs.filter(x=>x.item.photo).length; return {s,e,k,l,last,ph}; });
    const kp=(a,b,n)=>`<div class="card kpi"><div class="l">${a}</div><div class="v">${b}</div><div class="n">${n}</div></div>`;
    const cnt=(f)=>rows.filter(f).length; const un=M.unmatched;
    const zones=[...new Set(sts.map(s=>s.zone))].sort();
    v.innerHTML=`<div class="grid g6">${kp('Structures listed',rows.length,GROUPS.map(g=>cnt(r=>r.s.grp===g)+' '+g.toLowerCase()).join(' · '))}${kp('With site records',cnt(r=>r.e.recs.length),'in the reports')}${kp('Active last '+DAYS_ACTIVE+' days',cnt(r=>r.k==='act'),'photographed recently')}${kp('No record yet',cnt(r=>r.k==='none'),'none found')}${kp('Works not assigned',un.length,'structure works with no match')}</div>
    <div class="card" style="margin-top:12px"><div class="frm" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
      <label class="fld">Type<select id="sG">${opt(GROUPS,SB.grp,'All types')}</select></label>
      <label class="fld">State<select id="sS">${opt([['act','Active'],['rec','Recorded'],['none','No record']],SB.state,'All')}</select></label>
      <label class="fld">Zone<select id="sZ">${opt(zones,SB.zone,'All zones')}</select></label>
      <label class="fld">Search<input id="sQ" value="${esc(SB.q)}" placeholder="C12, Sg. Dudar…"></label></div>
      <p class="sub">Drawing chainages are indicative, so structures may be moved or offset on site. A work item is matched, in order, by: a structure code in the report; otherwise by its description (box or pipe, size, river name) and the nearest structure by chainage — marked <i>(ch.)</i>, or <i>(ch.?)</i> when another structure is almost as close. Use a structure's drawer to set its actual chainage; assign unmatched work below.</p>
      <div style="overflow:auto"><table class="t" id="sT"><thead><tr><th>Code</th><th>Description</th><th>Drawing CH</th><th>Site CH</th><th>Zone</th><th>State</th><th>Last record</th><th>Last activity</th><th>Status</th><th class="num">Records</th><th class="num">Photos</th></tr></thead><tbody></tbody></table></div></div>
    <div class="card" style="margin-top:12px"><h2>Structure works not assigned to a structure</h2><div class="sub">Work items that look like culvert, bridge or wall works but could not be matched. Choose the structure, or “Not a listed structure”.</div>
      <div style="overflow:auto;max-height:420px"><table class="t"><thead><tr><th>Date</th><th>Activity</th><th>Location</th><th>Why</th><th>Assign to</th></tr></thead><tbody>${un.slice(0,60).map((x,i)=>`<tr><td>${esc(A.fmtShort(x.r.date))}</td><td>${esc(x.it.activity)}<br><span class="sub">${esc(x.it.structure||'')}</span></td><td>${esc(x.it.location||'')}</td><td class="sub">${esc(x.why)}</td><td><select data-as="${i}"><option value="">Choose…</option>${sts.filter(s=>!x.d.grp||s.grp===x.d.grp).map(s=>`<option value="${esc(s.id)}">${esc(s.id)} · ${esc(fmtCh(s.ch))}</option>`).join('')}<option value="-">Not a listed structure</option></select></td></tr>`).join('')||'<tr><td colspan="5" class="sub">Everything is assigned.</td></tr>'}</tbody></table></div></div>`;
    v.querySelectorAll('[data-as]').forEach(sel=>sel.onchange=()=>{ if(!sel.value) return; const x=un[+sel.dataset.as]; S.settings.structAssign=S.settings.structAssign||{}; S.settings.structAssign[x.r.ref+'#'+x.it.no]=sel.value; saveLS(); render(); });
    const body=()=>{
      const q=SB.q.toLowerCase(); const rs=rows.filter(r=>(!SB.grp||r.s.grp===SB.grp)&&(!SB.state||r.k===SB.state)&&(!SB.zone||r.s.zone===SB.zone)&&(!q||(r.s.id+' '+r.s.name).toLowerCase().includes(q)));
      $('#sT tbody').innerHTML=rs.map(r=>{ const l=r.last; const cls=r.k==='act'?'ok':r.k==='rec'?'':'warn'; const ob=r.e.obs;
        const diff=ob!=null?ob-r.s.ch:null; const site=ob!=null?`${esc(fmtCh(ob))}${Math.abs(diff)>=10?` <span class="sub">(${diff>0?'+':''}${diff} m)</span>`:''}`:'–';
        return `<tr class="srow" data-id="${esc(r.s.id)}" style="cursor:pointer"><td><b>${esc(r.s.id)}</b></td><td>${esc(r.s.name)}${r.s.side?' <span class="sub">'+r.s.side+'</span>':''}</td><td>${esc(fmtCh(r.s.ch))}${r.s.moved?' <span class="badge">moved</span>':''}</td><td>${site}</td><td>${esc(r.s.zone)}</td><td><span class="badge ${cls}">${r.l}</span></td><td>${l?esc(A.fmtShort(l.date)):'–'}</td><td>${l?esc(l.item.activity)+mark(l):''}</td><td>${l?esc(l.item.status||''):''}</td><td class="num">${r.e.recs.length}</td><td class="num">${r.ph}</td></tr>`; }).join('')||'<tr><td colspan="11" class="sub">No structures match.</td></tr>';
      $('#sT').querySelectorAll('.srow').forEach(tr=>tr.onclick=()=>structDrawer(rows.find(r=>r.s.id===tr.dataset.id)));
    };
    for(const [id,k] of [['#sG','grp'],['#sS','state'],['#sZ','zone']]) $(id).onchange=(e)=>{ SB[k]=e.target.value; body(); };
    $('#sQ').oninput=(e)=>{ SB.q=e.target.value; body(); }; body();
  }
  function structDrawer(r){
    const recs=r.e.recs; const withPh=recs.filter(x=>x.item.photo);
    drawer(`<h3>${esc(r.s.id)} · ${esc(r.s.name)}</h3><p class="sub">${esc(r.s.grp)} · drawing ${esc(fmtCh(r.s.chDrawing))}${r.s.moved?' · actual '+esc(fmtCh(r.s.ch)):''} · ${esc(r.s.zone)} · ${recs.length} record(s), ${withPh.length} with photos</p>
      <div class="frm" style="grid-template-columns:1fr 2fr auto;align-items:end;margin-bottom:10px"><label class="fld">Actual chainage on site (e.g. 71+720)<input id="oC" value="${r.s.moved?esc(fmtCh(r.s.ch)):''}" placeholder="${esc(fmtCh(r.s.chDrawing))}"></label><label class="fld">Note<input id="oN" value="${esc(r.s.note)}" placeholder="e.g. relocated 45 m to suit stream"></label><span><button class="btn sm pri" id="oS">Save</button> <button class="btn sm" id="oR">Reset</button></span></div>
      <table class="t"><thead><tr><th>Date</th><th>Activity</th><th>Location</th><th>Status</th><th>Report</th></tr></thead><tbody>${recs.slice(0,40).map(x=>`<tr><td>${esc(A.fmtShort(x.date))}</td><td>${esc(x.item.activity)}${mark(x)}</td><td>${esc(x.item.location||'')}</td><td>${esc(x.item.status||'')}</td><td>${refLink(x.report)}</td></tr>`).join('')||'<tr><td colspan="5" class="sub">No records in the connected folder.</td></tr>'}</tbody></table>
      ${withPh.length?`<h3 style="margin-top:14px">Photos</h3><div class="ph-grid">${withPh.slice(0,24).map((x,i)=>`<div class="ph gp" data-k="${i}" style="cursor:pointer"><img alt="" data-k="${i}"><div class="cap">${esc(A.fmtShort(x.date))} · ${esc(x.item.activity)}</div></div>`).join('')}</div>`:''}`);
    wireCommon($('#drawer'));
    const lst=withPh.slice(0,24).map(x=>({r:x.report,it:x.item,date:x.date,cat:catOf(x.item),codes:[]}));
    $('#drawer').querySelectorAll('.gp').forEach(d=>d.onclick=()=>lightbox(+d.dataset.k,lst));
    $('#drawer').querySelectorAll('img[data-k]').forEach(im=>{ const p=lst[+im.dataset.k]; loadInto(im,p.r,p.it); });
    const ov=()=>S.settings.structOverride=S.settings.structOverride||{};
    $('#oS').onclick=()=>{ const c=chNum($('#oC').value); const n=$('#oN').value.trim(); if(c==null&&!n){ delete ov()[r.s.id]; } else ov()[r.s.id]={...(c!=null?{ch:c}:{}),note:n}; saveLS(); render(); document.getElementById('dx')&&document.getElementById('dx').click(); };
    $('#oR').onclick=()=>{ delete ov()[r.s.id]; saveLS(); render(); document.getElementById('dx')&&document.getElementById('dx').click(); };
  }
  return { vGallery, vStructures, lightbox, structuresList, matchStructures };
}
