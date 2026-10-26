import { PROJECT, CAT_ORDER, DEFAULTS, CATS, VERSION, CREDIT } from './config.js';
import * as A from './analysis.js';
import { esc, cssCatVars, catColor, legend, hbar, dayColumns, strip } from './charts.js';
import { dbGet, dbPut, dbAll, dbClear } from './db.js';
import { sync, listHandle, listFileObjects, fileIndex } from './scanner.js';
import { makeFeatures } from './features.js';
import { exportWorkbook } from './export.js';
import { getPhoto, getFull, extractReport, loadInto } from './photos.js';
import { makeGallery } from './gallery.js';
import { makeToday } from './today.js';
import { makeMessages } from './messages.js';
import { makeSnapshot } from './snapshot.js';
import { makeMap } from './map.js';
import { makeIssued, DEFAULT_TPL } from './issued.js';
import { importSetup, structuresList, DEFAULT_ACTMAP } from './structures.js';
import { periodFor, defaultNo } from './report.js';
import { buildModel, fileBase } from './model.js';
import { renderPdf } from './render-pdf.js';
import { renderDocx } from './render-docx.js';

const $=(s,r=document)=>r.querySelector(s);
const today=()=>A.iso(new Date());
document.head.insertAdjacentHTML('beforeend',`<style>${cssCatVars()}</style>`);

// ------------------------------------------------------------------ state
import { wsActive, wsAll, wsTouch, wsAdd, wsSwitch, wsRename, wsRemove, lsKey, getProfile, setProfile, isAdmin, POSITIONS, TEAMS, ORGS } from './workspace.js';
const LS=lsKey();
const loadLS=()=>{ try{ return JSON.parse(localStorage.getItem(LS))||{}; }catch(_){ return {}; } };
const saveLS=()=>{ try{ localStorage.setItem(LS,JSON.stringify(S.settings)); }catch(_){} };
const S={ reportsAll:[], allParsed:[], entries:[], reports:[], errors:[], dirHandle:null, lastSig:'', tab:'today', settings:Object.assign({roster:[],expected:{},daysOff:[],daysOn:[],project:{},signoff:{},theme:'',team:'',expectedRoles:null,observations:{},ws:{},sharedAt:0},loadLS()),
  range:{preset:'all',from:'',to:''}, status:{kind:'idle',text:'No folder connected',busy:false,at:null}, fallbackMode:false,
  gen:{type:'weekly',anchor:'',form:{},cands:[],sel:new Set(),loaded:false}, act:{q:'',cat:'',status:'',all:false} };
const SDR_URL='https://cstwp12-admin.github.io/wp12-sdr/';
const loadQR=()=>window.qrcode?Promise.resolve(window.qrcode):new Promise((res,rej)=>{ const sc=document.createElement('script'); sc.src='vendor/qrcode.js'; sc.onload=()=>res(window.qrcode); sc.onerror=rej; document.head.appendChild(sc); });
import { HAS_FS, fsNotice } from './browser.js';

// ------------------------------------------------------------------ range
function bounds(){ const ds=S.reports.map(r=>r.date).sort(); return { min:ds[0]||today(), max:ds.at(-1)||today() }; }
function resolveRange(){
  const t=today(), b=bounds(), p=S.range.preset; let from=b.min,to=b.max;
  if(p==='7') { to=t>b.max?t:b.max; from=A.addDays(to,-6); }
  else if(p==='30'){ to=t>b.max?t:b.max; from=A.addDays(to,-29); }
  else if(p==='thisweek'){ from=A.mondayOf(t); to=A.addDays(from,6); }
  else if(p==='lastweek'){ from=A.addDays(A.mondayOf(t),-7); to=A.addDays(from,6); }
  else if(p==='thismonth'){ const r=periodFor('monthly',t); from=r.from; to=r.to; }
  else if(p==='lastmonth'){ const r=periodFor('monthly',A.addDays(periodFor('monthly',t).from,-1)); from=r.from; to=r.to; }
  else if(p==='custom'){ from=S.range.from||b.min; to=S.range.to||b.max; }
  if(from>to) [from,to]=[to,from];
  return {from,to};
}
const inRange=()=>{ const {from,to}=resolveRange(); return S.reports.filter(r=>r.date>=from&&r.date<=to); };

// ------------------------------------------------------------------ folder / sync
function setStatus(kind,text,busy=false){ S.status={kind,text,busy,at:new Date()}; renderTop(); }
function applyTeam(){ const teams=[...new Set(S.reportsAll.map(r=>r.team).filter(Boolean))]; if(S.settings.team && !teams.includes(S.settings.team)) S.settings.team=''; S.reports=S.settings.team? S.reportsAll.filter(r=>r.team===S.settings.team) : S.reportsAll; A.setAll(S.reports); }
async function runSync(entries){
  setStatus('warn','Reading reports…',true);
  const t0=performance.now();
  const res=await sync(entries,(d,t)=>{ const p=$('#prog i'); if(p) p.style.width=Math.round(100*d/Math.max(t,1))+'%'; setStatus('warn',`Reading reports… ${d}/${t}`,true); });
  S.reportsAll=res.reports; S.allParsed=res.all; S.entries=entries; S.errors=res.errors; await F.loadShared(); applyTeam();
  S.lastSig=sigOf(entries);
  setStatus(res.errors.length?'warn':'ok',`${res.reports.length} reports · updated ${new Date().toLocaleTimeString()}`);
  render();
}
const sigOf=(entries)=>entries.map(e=>e.path+'|'+e.file.size+'|'+e.file.lastModified).sort().join('\n');
async function connect(){
  try{
    const h=await window.showDirectoryPicker({id:'wp12-reports',mode:'read'});
    S.dirHandle=h; await dbPut('meta','dir',h); await refresh(true);
  }catch(e){ if(e.name!=='AbortError') setStatus('bad','Could not open folder: '+e.message); }
}
async function reconnect(){
  const h=S.dirHandle; if(!h) return connect();
  const p=await h.requestPermission({mode:'read'}); if(p==='granted') await refresh(true); else setStatus('bad','Permission to read the folder was not granted');
}
async function refresh(force=false){
  if(!S.dirHandle||S.status.busy) return;
  try{
    const entries=await listHandle(S.dirHandle);
    if(!force && sigOf(entries)===S.lastSig) return;
    await runSync(entries);
  }catch(e){ setStatus('bad','Cannot read folder ('+(e.name||'error')+'). Click “Reconnect folder”.'); S.needPerm=true; renderTop(); }
}
async function fromFiles(files){
  S.fallbackMode=true; S.dirHandle=null;
  const entries=listFileObjects(files); if(!entries.length){ setStatus('bad','No PDF files found'); return; }
  await runSync(entries);
}
async function boot(){
  { const ses=S.settings.session; if(ses){ if(ses.tab&&TABS.some(t=>t[0]===ses.tab)) S.tab=ses.tab; if(ses.range&&ses.range.preset) S.range=ses.range; } wsTouch(); ISS.migrate(); ISS.logSession(); }
  // cached reports first, so the dashboard is instant
  const cached=await dbAll('reports'); const {dedupe}=await import('./scanner.js');
  if(cached.length){ S.reportsAll=dedupe(cached.map(([,v])=>v.report).filter(Boolean)); applyTeam(); setStatus('warn','Showing saved data — reconnect folder to refresh'); }
  render();
  if(HAS_FS){
    const h=await dbGet('meta','dir');
    if(h){ S.dirHandle=h; try{ const q=await h.queryPermission({mode:'read'}); if(q==='granted') await refresh(true); else { S.needPerm=true; renderTop(); } }catch(_){ S.needPerm=true; renderTop(); } }
  }
  setInterval(()=>{ if(!document.hidden && S.dirHandle && !S.needPerm) refresh(); }, DEFAULTS.pollSeconds*1000);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden && S.dirHandle && !S.needPerm) refresh(); });
}

// ------------------------------------------------------------------ top bar
function renderTop(){
  const st=S.status; const h=$('#stat');
  const needsBtn = HAS_FS ? (S.dirHandle&&S.needPerm ? `<button class="btn pri" id="bRecon">Reconnect folder</button>` : `<button class="btn ${S.dirHandle?'':'pri'}" id="bConn">${S.dirHandle?'Change folder':'Connect reports folder'}</button>`)
    : `<label class="btn pri" style="cursor:pointer">Select reports folder<input type="file" id="fFolder" webkitdirectory multiple hidden></label>`;
  h.innerHTML=`<span class="chip ${st.kind}"><i></i>${esc(st.text)}</span>${needsBtn}${S.dirHandle?'<button class="btn" id="bRef" title="Rescan folder now">Rescan</button>':''}`;
  $('#prog').style.visibility=st.busy?'visible':'hidden';
  $('#bConn')&&($('#bConn').onclick=connect); $('#bRecon')&&($('#bRecon').onclick=()=>{S.needPerm=false;reconnect();}); $('#bRef')&&($('#bRef').onclick=()=>refresh(true));
  $('#fFolder')&&($('#fFolder').onchange=(e)=>fromFiles(e.target.files));
}
async function exportExcel(){
  const reps=inRange(), {from,to}=resolveRange(); let days=A.dateRange(from,to); if(days.length>93) days=days.slice(-93);
  const btn=$('#rxl'); if(btn){ btn.disabled=true; btn.textContent='Preparing…'; }
  try{ const rows=A.flatten(reps); await exportWorkbook({rows,days,mx:A.matrix(reps,days,S.settings,today()),rfi:A.rfiList(rows),wx:A.weatherDays(reps),obs:A.observations(S.reports),obsState:S.settings.observations||{},from,to}); }
  catch(e){ alert('Export failed: '+e.message); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Export Excel'; } }
}
function renderFilters(){
  const {from,to}=resolveRange(); const p=S.range.preset; const teams=[...new Set(S.reportsAll.map(r=>r.team).filter(Boolean))];
  const opts=[['all','All reports'],['7','Last 7 days'],['30','Last 30 days'],['thisweek','This week'],['lastweek','Last week'],['thismonth','This month'],['lastmonth','Last month'],['custom','Custom…']];
  $('#filters').innerHTML=`<span>Period</span><select id="rp">${opts.map(([v,l])=>`<option value="${v}" ${v===p?'selected':''}>${l}</option>`).join('')}</select>
   <input type="date" id="rf" value="${from}"><span>to</span><input type="date" id="rt" value="${to}"><span>${A.fmtDate(from)} – ${A.fmtDate(to)}</span><span class="sp"></span>${teams.length>1?`<span>Team</span><select id="rtm"><option value="">All</option>${teams.map(t=>`<option ${S.settings.team===t?'selected':''}>${esc(t)}</option>`).join('')}</select>`:''}<button class="btn sm" id="rxl" title="Download an Excel workbook for the period">Export Excel</button>`;
  $('#rtm')&&($('#rtm').onchange=(e)=>{ S.settings.team=e.target.value; saveLS(); applyTeam(); render(); });
  $('#rxl').onclick=exportExcel;
  $('#rp').onchange=(e)=>{ S.range.preset=e.target.value; render(); };
  $('#rf').onchange=(e)=>{ S.range={preset:'custom',from:e.target.value,to:resolveRange().to}; render(); };
  $('#rt').onchange=(e)=>{ S.range={preset:'custom',from:resolveRange().from,to:e.target.value}; render(); };
}

// ------------------------------------------------------------------ views
const IC={reg:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',map:'<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',today:'<path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/><circle cx="12" cy="12" r="4"/>',overview:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',subs:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',acts:'<path d="M4 6h16M4 12h16M4 18h10"/>',chain:'<path d="M3 17l5-5 4 3 8-9"/><path d="M3 21h18"/>',struct:'<path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6"/>',gal:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 9"/>',rfi:'<path d="M7 18a4 4 0 010-8 5 5 0 019.6-1A4 4 0 0117 18z"/>',obs:'<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>',msg:'<path d="M21 12a8 8 0 01-11.6 7.1L3 21l1.9-5.8A8 8 0 1121 12z"/><path d="M8.5 11h7M8.5 14h4"/>',gen:'<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M9 14h6M9 17h4"/>',reports:'<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',guide:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2M12 17h.01"/>',set:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'};
const NAV=[['Monitor',[['today','Today'],['overview','Overview'],['subs','Submissions']]],['Site',[['acts','Activities'],['chain','Chainage & zones'],['struct','Structures'],['gal','Photos'],['map','Map'],['rfi','RFI & weather'],['obs','Observations']]],['Reports',[['gen','Generate report'],['msg','Messages & memo'],['reg','Issued register'],['reports','Report files']]],['Help',[['guide','Guide'],['set','Settings']]]];
const ADMIN_TABS=['gen','msg','reg','reports'];
const TABS=NAV.flatMap(g=>g[1]);
const navFor=()=>isAdmin()?NAV:NAV.map(([g,items])=>[g,items.filter(i=>!ADMIN_TABS.includes(i[0]))]).filter(([g,items])=>items.length);
function render(){
  A.setActivityMap((S.settings.setup&&S.settings.setup.actMap)||DEFAULT_ACTMAP);
  $('#tabs').innerHTML=navFor().map(([g,items])=>`<div class="grp">${g}</div>`+items.map(([k,l])=>`<button data-t="${k}" class="${S.tab===k?'on':''}"><svg viewBox="0 0 24 24">${IC[k]||''}</svg>${l}</button>`).join('')).join('');
  $('#tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.tab=b.dataset.t;document.body.classList.remove('nav-open');render();window.scrollTo(0,0);});
  if(!isAdmin()&&ADMIN_TABS.includes(S.tab)) S.tab='today';
  const P0={...PROJECT,...S.settings.project}; $('#proj').textContent=P0.chainage||P0.subtitle||'Site daily reports';
  { const w=S.settings.ws||{}, pr=getProfile(); const c=$('#wsChip'); if(c){ c.innerHTML=`<b>${esc(w.team||'Set up workspace')}</b>${w.code?' · '+esc(w.code):''}<span>${esc(pr.name?pr.name+(pr.position?' · '+pr.position:''):'Set your profile')}</span>`; c.onclick=openWorkspaces; } }
  { const ss=JSON.stringify({tab:S.tab,range:S.range}); if(ss!==S._ss){ S._ss=ss; S.settings.session={tab:S.tab,range:S.range}; saveLS(); } }
  $('#ptitle').textContent=(TABS.find(t=>t[0]===S.tab)||[])[1]||'';
  { const ds=S.reports.map(r=>r.date).sort(); $('#pmeta').textContent=ds.length?`${S.reports.length} reports · ${A.fmtShort(ds[0])} – ${A.fmtDate(ds.at(-1))}${S.status.at?' · updated '+new Date(S.status.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}`:'No reports loaded'; }
  renderTop(); renderFilters();
  $('#filters').style.display = ['set','gen','msg','reports','guide','obs','gal','struct','today'].includes(S.tab)?'none':'flex';
  const v=$('#view'); if(S.tab==='gen') drawPreview(); else { $('#paperWrap').style.display='none'; }
  if(!S.reports.length && S.tab!=='set'){ v.innerHTML=emptyView(); wireDrop(); return; }
  ({overview:vOverview,subs:vSubs,acts:vActs,chain:vChain,rfi:vRfi,reports:vReports,gen:vGen,msg:MS.vMessages,reg:ISS.vRegister,set:vSet,obs:F.vObs,guide:F.vGuide,gal:GL.vGallery,map:MP.vMap,struct:GL.vStructures,today:TD.vToday}[S.tab])(v);
  wireCommon(v);
}
function emptyView(){
  return `<div class="card" style="max-width:860px"><h2>Welcome to SiteBoard</h2><p class="sub">Three steps to see your site reports. Report files stay on your computer; the page only reads them.</p>
   <ol style="line-height:1.7;padding-left:20px"><li><b>Prepare the folder.</b> The folder on this computer that holds the SDR PDF reports (sub-folders are fine).</li><li><b>Connect it.</b> Press the button below and choose the folder, then Allow.</li><li><b>Check the health card.</b> Open <i>Report files</i> to see how many reports were read, duplicates, and whether the folder needs tidying.</li></ol>
   <div id="drop" class="drop">${HAS_FS?'<button class="btn pri" id="bConn2">Connect reports folder</button><p>Chrome, Edge or Brave (with folder access enabled) on a computer. The folder is remembered; next time press Reconnect once.</p>':'<p>This browser cannot keep a folder connection. Use “Select reports folder” above, or drop PDF files here.</p>'}<p>…or drag &amp; drop PDF files here</p></div>${fsNotice()}</div>`;
}
function wireDrop(){
  const b=$('#bConn2'); if(b) b.onclick=connect; const d=$('#drop'); if(!d) return;
  d.ondragover=(e)=>{e.preventDefault();d.classList.add('over');}; d.ondragleave=()=>d.classList.remove('over');
  d.ondrop=async(e)=>{ e.preventDefault(); d.classList.remove('over'); const fs=[...e.dataTransfer.files]; if(fs.length) fromFiles(fs); };
}
function wireCommon(root){
  root.querySelectorAll('[data-ref]').forEach(el=>el.onclick=()=>openReport(el.dataset.ref));
}
const pct=(x)=>x==null?'–':Math.round(x*100)+'%';
function kpi(label,val,note='',cls=''){ return `<div class="card kpi ${cls}"><div class="l">${label}</div><div class="v">${val}</div><div class="n">${note}</div></div>`; }
const refLink=(r)=>`<span class="lnk" data-ref="${esc(r.ref)}">${esc(r.ref)}</span>`;

function vOverview(v){
  const reps=inRange(), allRows=A.flatten(reps), rows=A.works(allRows), {from,to}=resolveRange();
  const t=today(); const toE=to>t?t:to; const days=A.dateRange(from,to);
  const mx=A.matrix(reps,days,S.settings,t);
  const wx=A.weatherDays(reps); const rain=wx.filter(w=>w.rain).length;
  const bins=A.binsFor(rows); const rfi=A.rfiList(rows);
  const wdays=days.filter(d=>A.isWorkDay(d,S.settings)&&d<=t);
  const covered=new Set(reps.map(r=>r.date)); const wc=wdays.filter(d=>covered.has(d)).length;
  const dayData=new Map(); for(const r of rows){ const d=dayData.get(r.date)||{}; d[r.cat]=(d[r.cat]||0)+1; dayData.set(r.date,d); }
  const used=CAT_ORDER.filter(c=>rows.some(r=>r.cat===c));
  // alerts
  let alerts=''; const ydays=[t, A.addDays(t,-1)].filter(d=>A.isWorkDay(d,S.settings));
  const latest=A.matrix(S.reports.filter(r=>ydays.includes(r.date)),ydays,S.settings,t);
  const missing=[]; for(const row of latest.rows) for(const c of row.cells) if(row.p.expected&&c.work&&c.past&&!c.rs.length&&!c.ex&&c.d<t) missing.push(`${row.p.name} (${A.fmtShort(c.d)})`);
  if(missing.length) alerts+=`<div class="alert warn"><b>No report yet:</b> ${esc(missing.join(', '))}</div>`;
  const warns=reps.filter(r=>r.warnings.length); if(warns.length||S.errors.length) alerts+=`<div class="alert bad">${S.errors.length?S.errors.length+' file(s) could not be read. ':''}${warns.length?warns.length+' report(s) have parsing warnings. ':''}<span class="lnk" onclick="document.querySelector('[data-t=reports]').click()">Review in “Report files”</span></div>`;
  const recent=reps.slice().sort((a,b)=>b.mtime-a.mtime).slice(0,8);
  v.innerHTML=`${alerts}<div style="margin-bottom:10px"><button class="btn pri" id="bShareOv">Share / save overview…</button></div>
  <div class="grid g6">
   ${kpi('Reports received',reps.length,`${new Set(reps.map(r=>r.code)).size} personnel`)}
   ${kpi('Work items photographed',rows.length,`${new Set(rows.map(r=>r.act.toLowerCase())).size} distinct activities`)}
   ${kpi('Reporting compliance',pct(mx.rate),mx.exp?`${mx.got} of ${mx.exp} expected daily reports`:'no expected reports',mx.rate==null?'':mx.rate>=.9?'good':mx.rate>=.7?'warn':'bad')}
   ${kpi('Days covered',`${wc}<span style="font-size:16px;color:var(--muted)"> / ${wdays.length}</span>`,'working days with ≥1 report')}
   ${kpi('Alignment covered',(A.coveredLength(bins)/1000).toFixed(1)+' km',`of 14.81 km (100 m bins)`)}
   ${kpi('Rain days',rain,`${rfi.length} RFI referenced`)}
  </div>
  <div class="grid g2" style="margin-top:12px">
   <div class="card" style="grid-column:1/-1"><h2>Work items photographed per day</h2><div class="sub">By activity category</div>${dayColumns(days,dayData,used,{w:1100,h:210})}${legend(used)}</div>
   <div class="card"><h2>By category</h2><div class="sub">Work items in period</div>${hbar(A.count(rows,r=>r.cat).map(([c,n])=>({label:c,value:n,color:catColor(c)})),{w:420,labelW:150})}</div>
   <div class="card"><h2>Latest files received</h2><div class="sub">By file date</div><table class="t"><thead><tr><th>Report</th><th>Reporter</th><th class="num">Items</th></tr></thead><tbody>${recent.map(r=>`<tr><td>${refLink(r)}<br><span class="badge">${A.fmtShort(r.date)}</span></td><td>${esc(r.reporter)} <span class="badge">${esc(r.role)}</span></td><td class="num">${r.items.length}</td></tr>`).join('')}</tbody></table></div>
   <div class="card" style="grid-column:1/-1"><h2>Where works were photographed</h2><div class="sub">CH 62+700 – 77+508 · dominant category per 100 m</div>${strip(bins,{w:1100})}</div>
  </div>`;
  $('#bShareOv').onclick=()=>SN.open('overview');
}

function vSubs(v){
  const {from,to}=resolveRange(); const reps=inRange(); const t=today();
  let days=A.dateRange(from,to); let note='';
  if(days.length>62){ days=days.slice(-62); note=' (showing last 62 days)'; }
  const mx=A.matrix(S.reports.filter(r=>r.date>=days[0]&&r.date<=days.at(-1)),days,S.settings,t);
  v.innerHTML=`<div class="card"><h2>Submission matrix${note}</h2><div class="sub">One row per person, one column per day. Click a day heading to mark it as a non-working day (holiday / rain stop). Click a red ✕ to mark that person's day as <b>no report needed</b> (office work, leave, off site…); it is then not counted against compliance. Tick “expected” for people who must report every working day. Overall compliance: <b>${pct(mx.rate)}</b></div><div style="margin:0 0 10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="bMiss">Reminder message…</button><button class="btn pri" id="bShareMx">Share / save matrix…</button><button class="btn" id="bShareMxMap">Share matrix + map…</button></div>
  <div class="scroll"><table class="mx"><thead><tr><th class="who">Personnel</th>${days.map(d=>`<th data-d="${d}" class="${A.isWorkDay(d,S.settings)?'':'off'}" title="${A.fmtDate(d,true)}">${A.fromIso(d).getDate()}<br><span style="font-size:10px">${A.DOW[A.dow(d)].slice(0,2)}</span></th>`).join('')}<th style="cursor:default">Done</th></tr></thead>
  <tbody>${mx.rows.map(r=>`<tr><td class="who"><label><input type="checkbox" data-exp="${esc(r.p.code)}" ${r.p.expected?'checked':''} title="Expected to report every working day"> <b>${esc(r.p.name)}</b></label> <span class="badge">${esc(r.p.role||r.p.code)}</span></td>
   ${r.cells.map(c=>{ const n=c.rs.length; let cls='c',txt=''; if(n){cls+=' yes';txt=n;} else if(!c.work){cls+=' off';txt='·';} else if(!c.past){cls+=' fut';} else if(c.ex){cls+=' off ex';txt='–';} else if(r.p.expected){cls+=' miss';txt='✕';}
     return `<td class="${cls}" ${n?`data-cell="${esc(r.p.code)}|${c.d}"`:(c.ex||cls.includes('miss'))?`data-nr="${esc(r.p.code)}|${c.d}|${esc(r.p.name)}" style="cursor:pointer"`:''} title="${esc(r.p.name)} · ${A.fmtDate(c.d,true)}${c.ex?' · No report needed: '+esc(c.ex.r):(cls.includes('miss')?' · No report – click if none was needed':'')}">${txt}</td>`; }).join('')}
   <td class="tot">${r.p.expected?`${r.g}/${r.e} days`:`${r.tot} report${r.tot!==1?'s':''}`}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td class="who" style="text-align:right">Reports per day</td>${days.map(d=>`<td>${S.reports.filter(r=>r.date===d).length||''}</td>`).join('')}<td></td></tr></tfoot></table></div>
  <div class="mx-leg"><span><span class="sw" style="background:var(--ok-bg)"></span>Report received (number = reports that day)</span><span><span class="sw" style="background:var(--bad-bg)"></span>No report – expected person, working day</span><span><span class="sw" style="background:var(--panel2)">–</span>No report needed (office work, leave…)</span><span><span class="sw" style="background:var(--panel2)"></span>Not expected / blank</span></div></div>`;
  $('#bMiss').onclick=F.openMissing; $('#bShareMx').onclick=()=>SN.open('matrix'); $('#bShareMxMap').onclick=()=>MP.openMatrixMap();
  v.querySelectorAll('th[data-d]').forEach(th=>th.onclick=()=>{ const d=th.dataset.d, off=S.settings.daysOff, on=S.settings.daysOn;
    if(A.isWorkDay(d,S.settings)){ if(DEFAULTS.workDays.includes(A.dow(d))) off.push(d); else { const i=on.indexOf(d); if(i>=0) on.splice(i,1); } }
    else { const i=off.indexOf(d); if(i>=0) off.splice(i,1); else on.push(d); }
    saveLS(); render(); });
  v.querySelectorAll('[data-exp]').forEach(cb=>cb.onchange=()=>{ S.settings.expected[cb.dataset.exp]=cb.checked; saveLS(); render(); });
  v.querySelectorAll('[data-nr]').forEach(td=>td.onclick=()=>{ const [c,d,n]=td.dataset.nr.split('|'); noReport(c,d,n); });
  v.querySelectorAll('[data-cell]').forEach(td=>td.onclick=()=>{ const [c,d]=td.dataset.cell.split('|'); const rs=S.reports.filter(r=>r.code===c&&r.date===d); openList(`${rs[0].reporter} · ${A.fmtDate(d,true)}`, rs); });
}

const NR_REASONS=['Office work / paperwork','Leave','Off site / meeting','Site not accessible','Not required','Other'];
function noReport(code,date,name){
  const cur=(S.settings.excuse||{})[code+'|'+date];
  drawer(`<h3>No report needed?</h3><p class="sub">${esc(name)} · ${A.fmtDate(date,true)}. Mark this day if no report was due (for example office work). It is then left out of the compliance count and the reminder message.</p>
   <label class="fld">Reason<select id="nrR">${NR_REASONS.map(r=>`<option ${cur&&cur.r===r?'selected':''}>${r}</option>`).join('')}</select></label>
   <div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="nrS">Save</button>${cur?'<button class="btn" id="nrX">Remove mark</button>':''}</div>`);
  $('#nrS').onclick=()=>{ S.settings.excuse=S.settings.excuse||{}; S.settings.excuse[code+'|'+date]={r:$('#nrR').value,t:Date.now()}; saveLS(); closeDrawer(); render(); };
  const x=$('#nrX'); if(x) x.onclick=()=>{ S.settings.excuse[code+'|'+date]=undefined; delete S.settings.excuse[code+'|'+date]; saveLS(); closeDrawer(); render(); };
}

function vActs(v){
  const reps=inRange(); let rows=A.flatten(reps); const f=S.act;
  const cats=CAT_ORDER; const sts=[...new Set(rows.map(r=>r.status).filter(Boolean))].sort();
  if(f.cat) rows=rows.filter(r=>r.cat===f.cat); if(f.status) rows=rows.filter(r=>r.status===f.status);
  if(f.q){ const q=f.q.toLowerCase(); rows=rows.filter(r=>[r.act,r.bq,r.loc,r.structure,r.rfi,r.remarks,r.reporter].join(' ').toLowerCase().includes(q)); }
  const by=new Map(); for(const r of rows){ const k=r.act.toLowerCase(); (by.get(k)||by.set(k,[]).get(k)).push(r); }
  const groups=[...by.values()].sort((a,b)=>b.length-a.length);
  const reg=rows.slice().sort((a,b)=>b.date.localeCompare(a.date)||a.item.no-b.item.no);
  v.innerHTML=`<div class="card"><h2>Activities</h2><div class="sub">Compound entries such as “A + B” are counted as separate activities. Category rules can be edited in js/config.js.</div>
   <div class="frm" style="margin-bottom:10px"><label class="fld">Search<input id="aq" value="${esc(f.q)}" placeholder="activity, BQ ref, location, remark…"></label>
   <label class="fld">Category<select id="ac"><option value="">All</option>${cats.map(c=>`<option ${f.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
   <label class="fld">Status<select id="as"><option value="">All</option>${sts.map(c=>`<option ${f.status===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label></div>
   <div class="scroll"><table class="t"><thead><tr><th>Activity</th><th>Category</th><th>BQ / QC ref.</th><th class="num">Items</th><th class="num">Days</th><th>Zones</th><th>Latest status</th></tr></thead><tbody>
   ${groups.map(g=>{ const last=g.slice().sort((a,b)=>a.date.localeCompare(b.date)).at(-1); return `<tr><td>${esc(g[0].act)}</td><td><span class="lg"><i style="background:${catColor(g[0].cat)}"></i>${esc(g[0].cat)}</span></td><td>${esc([...new Set(g.map(r=>r.bq).filter(Boolean))].slice(0,3).join('; '))||'–'}</td><td class="num">${g.length}</td><td class="num">${new Set(g.map(r=>r.date)).size}</td><td>${esc([...new Set(g.map(r=>r.zone.replace('Zone ','Z')).filter(Boolean))].sort().join(', '))||'–'}</td><td>${esc(last.status||'–')}${last.pct!=null?' · '+last.pct+'%':''} <span class="badge">${A.fmtShort(last.date)}</span></td></tr>`; }).join('')||'<tr><td colspan="7" class="empty">No matching activities.</td></tr>'}</tbody></table></div></div>
   <div class="card" style="margin-top:12px"><h2>Activity register</h2><div class="sub">${reg.length} records${reg.length>400?' (showing latest 400)':''}</div><div class="scroll"><table class="t"><thead><tr><th>Date</th><th>By</th><th>Activity</th><th>BQ ref.</th><th>Location</th><th>Structure / element</th><th>Status</th><th>RFI</th><th>Remarks</th><th>Report</th></tr></thead><tbody>
   ${reg.slice(0,400).map(r=>`<tr><td>${A.fmtShort(r.date)}</td><td>${esc(r.code)}</td><td>${esc(r.act)}</td><td>${esc(r.bq)||'–'}</td><td>${esc(r.loc==='-'?'':r.loc)||'–'}</td><td>${esc(r.structure)||'–'}</td><td>${esc(r.status)}${r.pct!=null?' '+r.pct+'%':''}</td><td>${esc(r.rfi)||'–'}</td><td>${esc(r.remarks)}</td><td>${refLink(r.report)}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#aq').oninput=(e)=>{ f.q=e.target.value; clearTimeout(vActs.t); vActs.t=setTimeout(()=>{ const p=e.target.selectionStart; render(); const el=$('#aq'); el.focus(); el.setSelectionRange(p,p); },250); };
  $('#ac').onchange=(e)=>{ f.cat=e.target.value; render(); }; $('#as').onchange=(e)=>{ f.status=e.target.value; render(); };
}

function vChain(v){
  const reps=inRange(), rows=A.flatten(reps), bins=A.binsFor(rows);
  const used=CAT_ORDER.filter(c=>rows.some(r=>r.cat===c));
  const zr=A.ALIGN.zones.map(z=>z.id);
  const sc=new Map(); for(const r of rows) for(const code of A.structureCodes(r.structure)){ const e=sc.get(code)||{n:0,acts:new Set(),last:'',refs:new Set()}; e.n++; e.acts.add(r.act); if(r.date>e.last) e.last=r.date; sc.set(code,e); }
  const noch=rows.filter(r=>r.ch1==null).length;
  v.innerHTML=`<div class="card"><h2>Alignment heat strip</h2><div class="sub">Each 100 m cell is coloured by its most frequent activity category; stronger colour = more records. Hover for detail.</div>${strip(bins,{w:1100,h:80})}${legend(used)}</div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h2>Zone × category</h2><div class="sub">Work items per zone (zone derived from chainage)</div><div class="scroll"><table class="t"><thead><tr><th>Zone</th>${used.map(c=>`<th class="num">${esc(c.split(' ')[0])}</th>`).join('')}<th class="num">Total</th><th class="num">Active km</th></tr></thead><tbody>
   ${zr.map((z,i)=>{ const zrows=rows.filter(r=>r.zone===z); const zb=bins.slice(Math.floor((A.ALIGN.zones[i].from-A.ALIGN.start)/A.BIN),Math.ceil((A.ALIGN.zones[i].to-A.ALIGN.start)/A.BIN)); return `<tr><td><b>${z}</b></td>${used.map(c=>`<td class="num">${zrows.filter(r=>r.cat===c).length||'–'}</td>`).join('')}<td class="num"><b>${zrows.length}</b></td><td class="num">${(A.coveredLength(zb)/1000).toFixed(1)} / ${((A.ALIGN.zones[i].to-A.ALIGN.zones[i].from)/1000).toFixed(2)}</td></tr>`; }).join('')}
   </tbody></table></div>${noch?`<p class="sub" style="margin-top:8px">${noch} record(s) have no chainage (e.g. stock yard, “–”) and are not on the strip.</p>`:''}</div>
  <div class="card"><h2>Structures referenced</h2><div class="sub">Bridges (B), culverts (C), junction culverts (JC), RS walls (RSW) named in the structure field</div><div class="scroll"><table class="t"><thead><tr><th>Structure</th><th class="num">Items</th><th>Activities</th><th>Last</th></tr></thead><tbody>
   ${[...sc.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).map(([k,e])=>`<tr><td><b>${k}</b></td><td class="num">${e.n}</td><td>${esc([...e.acts].slice(0,3).join('; '))}</td><td>${A.fmtShort(e.last)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">None in this period.</td></tr>'}</tbody></table></div></div></div>`;
}

function vRfi(v){
  const reps=inRange(), rows=A.flatten(reps), rf=A.rfiList(rows), wx=A.weatherDays(reps);
  v.innerHTML=`<div class="grid g2"><div class="card"><h2>RFI references</h2><div class="sub">RFIs quoted in the RFI column of the daily reports</div><div class="scroll"><table class="t"><thead><tr><th>RFI</th><th>Dates</th><th>Activity / location</th><th class="num">Items</th></tr></thead><tbody>
   ${rf.map(e=>`<tr><td><b>${esc(e.rfi)}</b></td><td>${[...e.dates].sort().map(A.fmtShort).join(', ')}</td><td>${esc([...e.acts].join('; '))}<br><span class="badge">${esc([...e.locs].join('; '))||'no location'}</span></td><td class="num">${e.n}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">No RFI referenced in this period.</td></tr>'}</tbody></table></div></div>
  <div class="card"><h2>Weather log</h2><div class="sub">As entered in each report · rain on <b>${wx.filter(w=>w.rain).length}</b> of ${wx.length} days</div><div class="scroll"><table class="t"><thead><tr><th>Date</th><th>AM</th><th>PM</th><th></th></tr></thead><tbody>
   ${wx.map(w=>`<tr><td>${A.fmtDate(w.date,true)}</td><td>${esc([...w.am].join(' / '))||'–'}</td><td>${esc([...w.pm].join(' / '))||'–'}</td><td>${w.rain?'<span class="badge warn">Rain</span>':''}</td></tr>`).join('')}</tbody></table></div></div></div>`;
}

function vReports(v){
  const reps=S.reports.slice().sort((a,b)=>b.date.localeCompare(a.date)||a.code.localeCompare(b.code));
  v.innerHTML=`${F.healthCard()}<div class="card"><h2>Report files</h2><div class="sub">${reps.length} reports parsed from the folder · generator versions: ${esc([...new Set(reps.map(r=>r.version).filter(Boolean))].join(', '))||'–'}. Click a reference to see the parsed data and photos.</div>
  ${S.errors.length?`<div class="alert bad"><b>Could not read:</b><br>${S.errors.map(e=>esc(e.path)+' — '+esc(e.error)).join('<br>')}</div>`:''}
  <div class="scroll"><table class="t"><thead><tr><th>Date</th><th>Reference</th><th>Reported by</th><th>Zone</th><th>Weather</th><th class="num">Items</th><th class="num">Pages</th><th>Notes</th></tr></thead><tbody>
  ${reps.map(r=>`<tr><td>${A.fmtDate(r.date)}</td><td>${refLink(r)}</td><td>${esc(r.reporter)} <span class="badge">${esc(r.role)}</span></td><td>${esc(r.zoneLabel)}</td><td>${esc(r.weatherAM)}${r.weatherPM?' / '+esc(r.weatherPM):''}</td><td class="num">${r.items.length}</td><td class="num">${r.pages}</td><td>${r.warnings.map(w=>`<span class="badge warn">${esc(w)}</span>`).join(' ')}${r.dupes&&r.dupes.length?`<span class="badge" title="${esc(r.dupes.join(', '))}">duplicate file ignored</span>`:''}</td></tr>`).join('')}</tbody></table></div></div>`;
  F.wireHealth(v);
}

// ------------------------------------------------------------------ report generator
function vGen(v){
  const g=S.gen; if(!g.anchor){ const b=bounds(); g.anchor=b.max; }
  const sig=S.settings.signoff, f=g.form;
  const per=periodFor(g.type,g.anchor); if(!f.no||f.autoNo!==g.type+per.from){ f.no=defaultNo(g.type,per.from); f.autoNo=g.type+per.from; }
  const rcount=S.reports.filter(r=>r.date>=per.from&&r.date<=per.to).length;
  v.innerHTML=`<div class="card"><h2>Generate weekly / monthly report</h2><div class="sub">Pick the period, review the photos, then build the report. <b>Build report</b> creates the A4 PDF directly (fixed margins, page numbers, full-resolution photos). Download it as PDF or Word, or send it by WhatsApp.</div>
   <div class="frm">
    <label class="fld">Report type<select id="gt"><option value="weekly" ${g.type==='weekly'?'selected':''}>Weekly (Mon–Sun)</option><option value="monthly" ${g.type==='monthly'?'selected':''}>Monthly</option></select></label>
    <label class="fld">${g.type==='weekly'?'Any date in the week':'Any date in the month'}<input type="date" id="ga" value="${g.anchor}"></label>
    <label class="fld">Period<input value="${A.fmtDate(per.from)} – ${A.fmtDate(per.to)}  (${rcount} reports)" disabled></label>
    <label class="fld">Report no.<input id="gn" value="${esc(f.no)}"></label>
    <label class="fld">Report title (optional)<input id="gtl" value="${esc(f.title||'')}" placeholder="${g.type==='weekly'?'WEEKLY SITE PROGRESS REPORT':'MONTHLY SITE PROGRESS REPORT'}"></label>
    <label class="fld">Photos per day (auto-select)<input type="number" id="gm" min="0" max="12" value="${f.maxPerDay??4}"></label>
   </div>
   <div class="frm" style="margin-top:10px">
    <label class="fld" style="grid-column:1/-1">Matters for attention (appears in Summary)<textarea id="gx" rows="3">${esc(f.extra||'')}</textarea></label>
    <label class="fld" style="grid-column:1/-1">Planned works for next ${g.type==='weekly'?'week':'month'}<textarea id="gp" rows="3">${esc(f.next||'')}</textarea></label>
    <label class="fld" style="grid-column:1/-1">Other remarks<textarea id="gr" rows="2">${esc(f.remarks||'')}</textarea></label>
   </div>
   <div class="frm" style="margin-top:10px">
    <label class="fld">Prepared by<input id="sp1" value="${esc(sig.preparedName||'')}"></label><label class="fld">Designation<input id="sp2" value="${esc(sig.preparedTitle||'')}"></label>
    <label class="fld">Checked by<input id="sc1" value="${esc(sig.checkedName||'')}"></label><label class="fld">Designation<input id="sc2" value="${esc(sig.checkedTitle||'')}"></label>
    <label class="fld">Reviewed / approved by<input id="sa1" value="${esc(sig.approvedName||'')}"></label><label class="fld">Designation<input id="sa2" value="${esc(sig.approvedTitle||'')}"></label>
   </div>
   <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;align-items:center"><button class="btn" id="gPh">Choose photos…</button><button class="btn pri" id="gBuild">Build report</button><span id="gMsg" class="sub" style="margin:0"></span></div>
   <div id="gGrid"></div></div>`;
  const bind=(id,fn)=>{ const e=$(id); e.onchange=e.oninput=()=>fn(e.value); };
  $('#gt').onchange=(e)=>{ g.type=e.target.value; g.loaded=false; clearOut(); render(); };
  $('#ga').onchange=(e)=>{ g.anchor=e.target.value||g.anchor; g.loaded=false; clearOut(); render(); };
  bind('#gn',x=>f.no=x); bind('#gtl',x=>f.title=x); bind('#gx',x=>f.extra=x); bind('#gp',x=>f.next=x); bind('#gr',x=>f.remarks=x); bind('#gm',x=>{f.maxPerDay=+x;g.loaded=false;});
  const sg=(id,k)=>bind(id,x=>{ sig[k]=x; saveLS(); }); sg('#sp1','preparedName');sg('#sp2','preparedTitle');sg('#sc1','checkedName');sg('#sc2','checkedTitle');sg('#sa1','approvedName');sg('#sa2','approvedTitle');
  $('#gPh').onclick=()=>choosePhotos(); $('#gBuild').onclick=build; 
  if(g.loaded && $('#gGrid')) drawGrid();
}
function candidates(per){
  const out=[]; const reps=S.reports.filter(r=>r.date>=per.from&&r.date<=per.to);
  for(const r of reps) for(const it of r.items) if(it.photo) out.push({report:r,item:it,key:r.ref+'#'+it.no});
  return out.sort((a,b)=>a.report.date.localeCompare(b.report.date)||a.report.code.localeCompare(b.report.code)||a.item.no-b.item.no);
}
function autoSelect(cands,maxPerDay){
  const sel=new Set(); const byDay=new Map(); for(const c of cands) (byDay.get(c.report.date)||byDay.set(c.report.date,[]).get(c.report.date)).push(c);
  for(const list of byDay.values()){
    const seen=new Set(); const rank=list.slice().sort((a,b)=>(!!b.item.remarks-!!a.item.remarks)||(a.report.code.localeCompare(b.report.code))||a.item.no-b.item.no);
    const pick=[]; for(const c of rank){ const k=A.categorize(c.item.activity)+'|'+c.report.code; if(!seen.has(k)){ seen.add(k); pick.push(c); } }
    for(const c of rank) if(pick.length<maxPerDay && !pick.includes(c)) pick.push(c);
    pick.slice(0,maxPerDay).forEach(c=>sel.add(c.key));
  }
  return sel;
}
async function choosePhotos(){
  const g=S.gen, per=periodFor(g.type,g.anchor); g.cands=candidates(per);
  if(!g.loaded){ g.sel=autoSelect(g.cands,g.form.maxPerDay??4); g.loaded=true; }
  drawGrid(); await loadThumbs();
}
function drawGrid(){
  const g=S.gen; $('#gGrid').innerHTML=`<div class="sub" style="margin-top:14px">${g.cands.length} photos available · <b id="selN">${g.sel.size}</b> selected <button class="btn sm" id="selAll">Select all</button> <button class="btn sm" id="selNone">Clear</button></div><div class="progress" id="gprog"><i></i></div><div class="ph-grid">${g.cands.map(c=>`<div class="ph ${g.sel.has(c.key)?'sel':''}" data-k="${esc(c.key)}"><img alt="" data-k="${esc(c.key)}"><div class="cap"><b>${A.fmtShort(c.report.date)}</b> · ${esc(c.report.code)} #${c.item.no}<br>${esc(c.item.activity)}<br><span style="color:var(--muted)">${esc(c.item.location)}</span></div><label class="pick"><input type="checkbox" ${g.sel.has(c.key)?'checked':''}> Include</label></div>`).join('')}</div>`;
  $('#gGrid').querySelectorAll('.ph').forEach(el=>el.querySelector('input').onchange=(e)=>{ e.target.checked?g.sel.add(el.dataset.k):g.sel.delete(el.dataset.k); el.classList.toggle('sel',e.target.checked); $('#selN').textContent=g.sel.size; });
  $('#selAll').onclick=()=>{ g.cands.forEach(c=>g.sel.add(c.key)); drawGrid(); loadThumbs(); }; $('#selNone').onclick=()=>{ g.sel.clear(); drawGrid(); loadThumbs(); };
}
async function loadThumbs(){
  const g=S.gen; const imgs=[...document.querySelectorAll('#gGrid img[data-k]')]; let n=0;
  for(const img of imgs){ const c=g.cands.find(x=>x.key===img.dataset.k); if(!c) continue;
    try{ const u=await getPhoto(c.report,c.item); if(u) img.src=u; }catch(_){}
    n++; const p=$('#gprog i'); if(p) p.style.width=Math.round(100*n/imgs.length)+'%'; if(S.tab!=='gen') return; }
}
function genModel(){
  const g=S.gen, per=periodFor(g.type,g.anchor);
  if(!g.loaded){ g.cands=candidates(per); g.sel=autoSelect(g.cands,g.form.maxPerDay??4); g.loaded=true; }
  const photos=g.cands.filter(c=>g.sel.has(c.key));
  return buildModel({type:g.type,from:per.from,to:per.to,all:S.reports,settings:S.settings,form:g.form,photos});
}
const opts=(msg)=>({getFull,onProgress:(t)=>{ msg.textContent=t; }});
function setOut(kind,res){ const g=S.gen; g.out=g.out||{}; if(g.out[kind]&&g.out[kind].url) URL.revokeObjectURL(g.out[kind].url); g.out[kind]={...res,url:URL.createObjectURL(res.blob)}; }
function saveBlob(o){ const a=document.createElement('a'); a.href=o.url; a.download=o.name; document.body.appendChild(a); a.click(); a.remove(); }
async function build(){
  const g=S.gen; const msg=$('#gMsg'); $('#gBuild').disabled=true;
  try{
    msg.textContent='Preparing report…'; const model=genModel(); g.model=model;
    const res=await renderPdf(model,opts(msg)); setOut('pdf',res);
    drawPreview(); msg.textContent=`Built ${res.pages} pages · ${(res.blob.size/1048576).toFixed(1)} MB`;
  }catch(e){ console.error(e); msg.textContent='Could not build the report: '+e.message; }
  $('#gBuild').disabled=false;
}
function drawPreview(){
  const g=S.gen, o=g.out&&g.out.pdf; const w=$('#paperWrap'); if(!o){ w.innerHTML=''; w.style.display='none'; return; }
  w.style.display='block';
  w.innerHTML=`<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b>Report preview</b><span class="sp"></span><button class="btn pri" id="dlPdf">Download PDF</button><button class="btn" id="dlDocx">Download Word</button><button class="btn" id="opPdf">Open in new tab</button><button class="btn" id="waPdf">Send via WhatsApp…</button></div>
   <div class="sub" style="margin:6px 0">${esc(o.name)}</div><iframe class="pdfv" title="Report preview" src="${o.url}#view=FitH"></iframe><div class="sub" id="pvNote">If the preview stays blank in your browser, use “Open in new tab”.</div></div>`;
  $('#dlPdf').onclick=()=>{ saveBlob(o); ISS.record({kind:'Report',no:g.model.no||'',subject:g.model.title+' ('+g.model.period+')',type:'PDF'},{name:o.name,blob:o.blob}); }; $('#opPdf').onclick=()=>window.open(o.url,'_blank');
  $('#dlDocx').onclick=async(e)=>{ const b=e.target; b.disabled=true; b.textContent='Building Word…'; try{ if(!g.out.docx){ const res=await renderDocx(g.model,opts($('#pvNote'))); setOut('docx',res); } saveBlob(g.out.docx); ISS.record({kind:'Report',no:g.model.no||'',subject:g.model.title+' ('+g.model.period+')',type:'Word'},{name:g.out.docx.name,blob:g.out.docx.blob}); }catch(er){ console.error(er); $('#pvNote').textContent='Word export failed: '+er.message; } b.disabled=false; b.textContent='Download Word'; };
  $('#waPdf').onclick=()=>MS.compose({type:'Report',attach:[{name:o.name,blob:o.blob}],text:`${g.model.no} ${g.model.title}\n${g.model.period}`});
}
function clearOut(){ const g=S.gen; for(const k of Object.keys(g.out||{})) URL.revokeObjectURL(g.out[k].url); g.out=null; g.model=null; }

// ------------------------------------------------------------------ settings
function vSet(v){
  const P={...PROJECT,...S.settings.project}; const ppl=A.people(S.reports,S.settings); const roles=[...new Set(['IOW','ARE','RE',...ppl.map(p=>p.role).filter(Boolean)])];
  const W=S.settings.ws||{}, PR=getProfile(); const dr=(W.team&&PR.name)?'':'<div class="alert" style="margin-bottom:12px">Set the workspace team and your profile below. They decide the memo numbers, who is shown as the sender and which tools you see.</div>';
  v.innerHTML=`${dr}<div class="grid g2"><div class="card"><h2>Workspace</h2><div class="sub">This reports folder. Shared with the team through <b>Save settings to folder</b>.</div><div class="frm">
   <label class="fld" style="grid-column:1/-1">Workspace name<input id="wsName" value="${esc(wsActive().name)}"></label>
   <label class="fld">Team<input data-ws="team" list="wsTeams" value="${esc(W.team||'')}" placeholder="CST, WPC, SOR…"><datalist id="wsTeams">${TEAMS.map(t=>`<option>${t}</option>`).join('')}</datalist></label>
   <label class="fld">Project code<input data-ws="code" value="${esc(W.code||'')}" placeholder="WP12"></label>
   <label class="fld" style="grid-column:1/-1">Organisation type<select data-ws="org"><option value="">–</option>${ORGS.map(o=>`<option ${W.org===o?'selected':''}>${o}</option>`).join('')}</select></label>
   <label class="fld" style="grid-column:1/-1">Issuing office (shown on memos)<input data-ws="office" value="${esc(W.office||'')}" placeholder="e.g. Resident Engineer Team WP12"></label></div></div>
   <div class="card"><h2>My profile</h2><div class="sub">Saved in this browser only. SiteBoard has no passwords: the profile sets your name, your position and what you see.</div><div class="frm">
   <label class="fld" style="grid-column:1/-1">Name<input id="prN" value="${esc(PR.name)}"></label>
   <label class="fld">Position<select id="prP"><option value="">–</option>${POSITIONS.map(([k,l])=>`<option value="${k}" ${PR.position===k?'selected':''}>${k} – ${l}</option>`).join('')}</select></label>
   <label class="fld">Title on memos<input id="prT" value="${esc(PR.title)}" placeholder="${esc((POSITIONS.find(x=>x[0]===PR.position)||[])[1]||'Resident Engineer')}"></label>
   ${PR.position&&!(POSITIONS.find(x=>x[0]===PR.position)||[])[2]?`<label style="grid-column:1/-1"><input type="checkbox" id="prA" ${PR.showAdmin?'checked':''}> Show administrator tools (reports, messages, register)</label>`:''}</div>
   <p class="sub" style="margin-top:8px">${isAdmin()?'Administrator view: all tools are shown.':'Member view: report-making and messaging tools are hidden.'}</p></div>
   <div class="card"><h2>Project details (used on reports)</h2><div class="sub">Saved in this browser. Use “Save settings to folder” below to share with the team.</div><div class="frm">
   ${[['title','Project title'],['subtitle','Sub-title'],['chainage','Section of works'],['consultant','Consultant'],['contractor','Contractor'],['team','Team']].map(([k,l])=>`<label class="fld" style="grid-column:1/-1">${l}<input data-p="${k}" value="${esc(P[k])}"></label>`).join('')}</div></div>
   <div class="card"><h2>Personnel roster</h2><div class="sub">Detected from the report reference code. Tick “expected” for people who must submit every working day. The role comes from the report (IOW / ARE).</div><table class="t"><thead><tr><th>Code</th><th>Name</th><th>Role</th><th>Expected</th><th class="num">Reports</th></tr></thead><tbody>
   ${ppl.map(p=>`<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.role)}</td><td><input type="checkbox" data-e="${esc(p.code)}" ${p.expected?'checked':''}></td><td class="num">${p.count}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Connect a folder first.</td></tr>'}</tbody></table></div>
   <div class="card"><h2>Appearance & data</h2><div class="frm"><label class="fld">Theme<select id="th"><option value="">Follow system</option><option value="light" ${S.settings.theme==='light'?'selected':''}>Light</option><option value="dark" ${S.settings.theme==='dark'?'selected':''}>Dark</option></select></label></div>
   <p class="sub" style="margin-top:12px">Parsed reports and photo thumbnails are cached in this browser to make loading fast. Clearing the cache forces a full re-read of the folder.</p><button class="btn" id="clr">Clear cached data</button>
   <h2 style="margin-top:16px">Links & QR codes</h2><div class="sub">Share the two apps with the team: scan to open on a phone.</div><div style="display:flex;gap:18px;flex-wrap:wrap"><div style="text-align:center"><div id="qrA"></div><div class="sub">SiteBoard (view)</div></div><div style="text-align:center"><div id="qrB"></div><div class="sub">SDR report app</div></div></div>
   <h2 style="margin-top:16px">Report cover logo</h2><div class="sub">Optional. A small logo shown on the cover of weekly and monthly reports.</div>${P.logo?`<img src="${P.logo}" alt="" style="height:40px;background:#fff;border:1px solid var(--line);padding:3px;margin-right:8px">`:''}<input type="file" id="lgF" accept="image/*" style="display:none"><button class="btn" id="lgB">Choose logo</button> ${P.logo?'<button class="btn" id="lgX">Remove</button>':''}
   <h2 style="margin-top:16px">Structure list</h2><div class="sub">${structuresList(S.settings).length} structures in use (${S.settings.setup?'imported from SDR setup.json':'built-in default'}). To update, import the <code>setup.json</code> from the SDR app.</div><input type="file" id="stF" accept=".json" style="display:none"><button class="btn" id="stB">Import SDR setup.json</button> <span class="sub" id="stM"></span>
   <h2 style="margin-top:16px">Memo numbering</h2><div class="sub">Template for this workspace. Tokens: <code>{TEAM}</code> <code>{ROLE}</code> <code>{PROJ}</code> <code>{YEAR}</code> <code>{NNN}</code>. The running number continues per series and is kept in the register.</div><label class="fld">Template<input id="mtpl" value="${esc(S.settings.memoTpl||ISS.tpl())}"></label><div class="sub">Next number: <code id="mnext">${esc(ISS.nextMemoNo())}</code> <button class="btn sm" id="mtplR">Use default</button></div>
   <h2 style="margin-top:16px">About</h2><div class="sub">SiteBoard v${VERSION} · ${CREDIT}. Free, runs in your browser; reports never leave your computer.<br>Licence: <a href="LICENSE" target="_blank" rel="noopener">MIT</a> · Third-party software: <a href="THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">notices and licences</a> (pdf.js, jsPDF, docx, SheetJS, qrcode-generator, Barlow / IBM Plex fonts).</div>
   <h2 style="margin-top:16px">Reporting rules</h2><div class="sub">Roles that must report every working day (others report as required).</div><div style="display:flex;gap:14px;flex-wrap:wrap">${roles.map(r=>`<label><input type="checkbox" data-role="${esc(r)}" ${(S.settings.expectedRoles||DEFAULTS.expectedRoles).includes(r)?'checked':''}> ${esc(r)}</label>`).join('')}</div>
   <h2 style="margin-top:16px">Share with team</h2><div class="sub">Project details, reporting rules, non-working days and observation follow-up are saved in <code>siteboard-settings.json</code> in the report folder.</div><button class="btn" id="svShared">Save settings to folder</button> <span id="svMsg" class="sub"></span>
   <p class="sub" style="margin-top:12px">Non-working days you marked: ${S.settings.daysOff.length+S.settings.daysOn.length} <button class="btn sm" id="clrd">Reset</button></p></div></div>`;
  v.querySelectorAll('[data-p]').forEach(i=>i.oninput=()=>{ S.settings.project[i.dataset.p]=i.value; saveLS(); });
  v.querySelectorAll('[data-e]').forEach(i=>i.onchange=()=>{ S.settings.expected[i.dataset.e]=i.checked; saveLS(); });
  v.querySelectorAll('[data-role]').forEach(i=>i.onchange=()=>{ const cur=new Set(S.settings.expectedRoles||DEFAULTS.expectedRoles); i.checked?cur.add(i.dataset.role):cur.delete(i.dataset.role); S.settings.expectedRoles=[...cur]; saveLS(); render(); });
  $('#svShared').onclick=async()=>{ $('#svMsg').textContent='…'; $('#svMsg').textContent=await F.saveShared(); };
  loadQR().then((qr)=>{ const mk=(id,u)=>{ const q=qr(0,'M'); q.addData(u); q.make(); $(id).innerHTML=q.createSvgTag({cellSize:4,margin:2,scalable:false}); }; mk('#qrA',location.origin+location.pathname); mk('#qrB',SDR_URL); }).catch(()=>{});
  $('#lgB').onclick=()=>$('#lgF').click(); $('#lgX')&&($('#lgX').onclick=()=>{ S.settings.project.logo=''; saveLS(); render(); });
  $('#lgF').onchange=(e)=>{ const f=e.target.files[0]; if(!f) return; const im=new Image(); im.onload=()=>{ const k=Math.min(1,160/im.height); const c=document.createElement('canvas'); c.width=Math.round(im.width*k); c.height=Math.round(im.height*k); c.getContext('2d').drawImage(im,0,0,c.width,c.height); S.settings.project.logo=c.toDataURL('image/png'); saveLS(); render(); }; im.src=URL.createObjectURL(f); };
  $('#stB').onclick=()=>$('#stF').click();
  $('#stF').onchange=async(e)=>{ const f=e.target.files[0]; if(!f) return; try{ S.settings.setup=importSetup(JSON.parse(await f.text())); A.setActivityMap(S.settings.setup.actMap||DEFAULT_ACTMAP); saveLS(); render(); $('#stM').textContent='Imported '+S.settings.setup.structures.length+' structures. Use “Save settings to folder” to share.'; }catch(err){ $('#stM').textContent='Could not import: '+err.message; } };
  $('#mtpl').onchange=(e)=>{ const t=e.target.value.trim(); S.settings.memoTpl=t&&t.includes('{NNN}')?t:''; if(t&&!t.includes('{NNN}')) alert('The template must contain {NNN}, the running number.'); S.memo=null; saveLS(); render(); };
  $('#mtplR').onclick=()=>{ S.settings.memoTpl=''; S.memo=null; saveLS(); render(); };
  $('#wsName').onchange=(e)=>{ wsRename(wsActive().id,e.target.value); render(); };
  v.querySelectorAll('[data-ws]').forEach(i=>i.onchange=()=>{ S.settings.ws=S.settings.ws||{}; S.settings.ws[i.dataset.ws]=i.value.trim(); S.memo=null; saveLS(); render(); });
  { const sp=()=>{ const p=getProfile(); setProfile({...p,name:$('#prN').value.trim(),position:$('#prP').value,title:$('#prT').value.trim(),showAdmin:$('#prA')?$('#prA').checked:p.showAdmin}); S.memo=null; render(); };
    ['#prN','#prP','#prT'].forEach(k=>$(k).onchange=sp); const pa=$('#prA'); if(pa) pa.onchange=sp; }
  $('#th').onchange=(e)=>{ S.settings.theme=e.target.value; applyTheme(); saveLS(); };
  $('#clr').onclick=async()=>{ await dbClear('reports'); await dbClear('photos'); S.lastSig=''; if(S.dirHandle) await refresh(true); else { S.reports=[]; render(); } };
  $('#clrd').onclick=()=>{ S.settings.daysOff=[]; S.settings.daysOn=[]; saveLS(); render(); };
}
function applyTheme(){ const t=S.settings.theme; if(t) document.documentElement.dataset.theme=t; else delete document.documentElement.dataset.theme; }

// ------------------------------------------------------------------ drawer
function drawer(html){ $('#drawer').innerHTML=`<div style="display:flex;justify-content:flex-end"><button class="btn sm" id="dx">Close ✕</button></div>${html}`; $('#drawer').style.display='block'; $('#dbg').style.display='block'; $('#dx').onclick=closeDrawer; $('#drawer').scrollTop=0; }
function closeDrawer(){ $('#drawer').style.display='none'; $('#dbg').style.display='none'; }
function openList(title,rs){ drawer(`<h3>${esc(title)}</h3><table class="t"><tbody>${rs.map(r=>`<tr><td>${refLink(r)}</td><td>${r.items.length} items</td></tr>`).join('')}</tbody></table>`); wireCommon($('#drawer')); }
async function openReport(ref){
  const r=S.reports.find(x=>x.ref===ref); if(!r) return;
  drawer(`<h3>${esc(r.ref)}</h3><p class="sub">${A.fmtDate(r.date,true)} · ${esc(r.reporter)}, ${esc(r.role)} · ${esc(r.zoneLabel)} · Weather: ${esc(r.weatherRaw)} · ${r.pages} pages · generator v${esc(r.version)}<br>File: ${esc(r.path)}</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button class="btn" id="orPdf">Open PDF</button><button class="btn pri" id="orCm">Comment / send via WhatsApp</button></div>${r.warnings.map(w=>`<div class="alert warn">${esc(w)}</div>`).join('')}
   <div class="ph-grid">${r.items.map(it=>`<div class="ph"><img alt="" data-n="${it.no}"><div class="cap"><b>${String(it.no).padStart(2,'0')} ${esc(it.activity)}</b> ${it.time?'· '+esc(it.time):''}<br>${esc(it.bq)}${it.bq?' · ':''}${esc(it.location)}${it.structure?' · '+esc(it.structure):''}<br>${esc(it.status)}${it.rfi?' · RFI '+esc(it.rfi):''}${it.remarks?'<br><i>'+esc(it.remarks)+'</i>':''}<br><button class="btn sm" data-cm="${it.no}" style="margin-top:4px">Comment…</button></div></div>`).join('')}</div>`);
  $('#orPdf').onclick=()=>MS.openPdf(r); $('#orCm').onclick=()=>MS.composeForReport(r);
  document.querySelectorAll('#drawer [data-cm]').forEach(b=>b.onclick=()=>MS.composeForItem(r,r.items.find(i=>i.no==b.dataset.cm)));
  for(const it of r.items){ const img=$(`#drawer img[data-n="${it.no}"]`); if(!img) continue; loadInto(img,r,it); }
}

// ------------------------------------------------------------------ workspaces
function openWorkspaces(){
  const act=wsActive(); const w=S.settings.ws||{};
  drawer(`<h3>Workspace</h3><p class="sub">A workspace is one reports folder: for example your CST folder, or the WPC folder you monitor. Each keeps its own project details, team, memo numbering and register. Switching reloads SiteBoard.</p>
   <table class="t"><tbody>${wsAll().map(x=>`<tr><td><b>${esc(x.name)}</b>${x.id===act.id?' <span class="badge ok">open</span>':''}<div class="sub" style="margin:0">Last used ${new Date(x.last||x.created).toLocaleDateString('en-GB')}</div></td><td style="text-align:right;white-space:nowrap">${x.id===act.id?'':`<button class="btn sm" data-sw="${x.id}">Switch</button> `}<button class="btn sm" data-rn="${x.id}">Rename</button> ${wsAll().length>1&&x.id!==act.id?`<button class="btn sm" data-rm="${x.id}">Remove</button>`:''}</td></tr>`).join('')}</tbody></table>
   <div class="frm" style="margin-top:12px"><label class="fld" style="grid-column:1/-1">New workspace name<input id="wsN" placeholder="e.g. WPC daily reports"></label></div><button class="btn pri" id="wsAdd" style="margin-top:8px">Create and connect its folder</button>
   <p class="sub" style="margin-top:12px">After switching, press <b>Connect folder</b> and choose that team's reports folder. Set the team and your profile in Settings.</p>`);
  document.querySelectorAll('#drawer [data-sw]').forEach(b=>b.onclick=()=>wsSwitch(b.dataset.sw));
  document.querySelectorAll('#drawer [data-rn]').forEach(b=>b.onclick=()=>{ const n=prompt('Workspace name',wsAll().find(x=>x.id===b.dataset.rn).name); if(n){ wsRename(b.dataset.rn,n); openWorkspaces(); render(); } });
  document.querySelectorAll('#drawer [data-rm]').forEach(b=>b.onclick=()=>{ if(confirm('Remove this workspace from this browser? The reports folder itself is not touched.')){ wsRemove(b.dataset.rm); openWorkspaces(); } });
  $('#wsAdd').onclick=()=>{ const id=wsAdd($('#wsN').value||'New workspace'); wsSwitch(id); };
}

// ------------------------------------------------------------------ tooltip
const tip=$('#tip');
document.addEventListener('mousemove',(e)=>{ const t=e.target.closest&&e.target.closest('[data-tip]'); if(!t){ tip.style.display='none'; return; }
  tip.textContent=t.getAttribute('data-tip'); tip.style.display='block'; const w=tip.offsetWidth, h=tip.offsetHeight;
  tip.style.left=Math.min(innerWidth-w-8,e.clientX+14)+'px'; tip.style.top=Math.min(innerHeight-h-8,e.clientY+14)+'px'; });
$('#dbg').onclick=closeDrawer;
window.addEventListener('beforeprint',()=>closeDrawer());
const GL=makeGallery({S,$,drawer,wireCommon,refLink,resolveRange,openReport,saveLS,render});
const TD=makeToday({S,$,GL});
const ISS=makeIssued({S,$,drawer,saveLS,render}); S.ISS=ISS;
const MS=makeMessages({S,$,drawer,closeDrawer,saveLS,refLink,wireCommon,openReport,ISS}); S.MS=MS;
const MP=makeMap({S,$,drawer,resolveRange,inRange,MS,openReport,saveLS,render});
const SN=makeSnapshot({S,$,drawer,resolveRange,inRange,MS,saveLS});
MP.setSnapshot(SN); SN.setMapProvider(MP);
const F=makeFeatures({S,$,render,drawer,closeDrawer,refLink,wireCommon,saveLS,refresh});
$('#gs').oninput=(e)=>{ clearTimeout(F._t); F._t=setTimeout(()=>F.openSearch(e.target.value),250); };
window.__wp12={S,render,fromFiles,F,MP,SN,applyTeam,refresh};
A.setActivityMap((S.settings.setup&&S.settings.setup.actMap)||DEFAULT_ACTMAP);
$('#menu').onclick=()=>document.body.classList.toggle('nav-open'); $('#navbg').onclick=()=>document.body.classList.remove('nav-open');
$('#thm').onclick=()=>{ const dark=document.documentElement.dataset.theme?document.documentElement.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches; S.settings.theme=dark?'light':'dark'; applyTheme(); saveLS(); };
$('#verTag').textContent=`v${VERSION}`;
applyTheme(); boot();
