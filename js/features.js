import * as A from './analysis.js';
import { esc } from './charts.js';
import { PROJECT, DEFAULTS } from './config.js';
import { SETTINGS_FILE, readSettingsFile, writeSettingsFile, tidyPlan, tidyApply } from './scanner.js';

export function makeFeatures(x){
  const { S, $, render, drawer, closeDrawer, refLink, wireCommon, saveLS, refresh } = x;
  const today=()=>A.iso(new Date());

  // ------------------------------------------------------------ shared settings (file in the report folder)
  const union=(a=[],b=[])=>[...new Set([...(a||[]),...(b||[])])].sort();
  function mergeShared(sh){
    const L=S.settings; if(!sh||(L.sharedAt||0)>=(sh.savedAt||0)) return false;
    for(const k of ['project','signoff']){ const loc={}; for(const [kk,v] of Object.entries(L[k]||{})) if(v) loc[kk]=v; L[k]={...(sh[k]||{}),...loc}; }
    L.expected={...(sh.expected||{}),...(L.expected||{})};
    if(!L.expectedRoles && sh.expectedRoles) L.expectedRoles=sh.expectedRoles;
    L.daysOff=union(L.daysOff,sh.daysOff); L.daysOn=union(L.daysOn,sh.daysOn);
    L.observations=L.observations||{};
    for(const [k,v] of Object.entries(sh.observations||{})) if(!L.observations[k]||(v.t||0)>(L.observations[k].t||0)) L.observations[k]=v;
    if(sh.setup&&(!L.setup||(sh.setup.importedAt||0)>(L.setup.importedAt||0))) L.setup=sh.setup;
    L.structOverride={...(sh.structOverride||{}),...(L.structOverride||{})}; L.structAssign={...(sh.structAssign||{}),...(L.structAssign||{})};
    L.sharedAt=sh.savedAt; saveLS(); return true;
  }
  async function loadShared(){ if(!S.dirHandle) return; const sh=await readSettingsFile(S.dirHandle); if(sh) mergeShared(sh); }
  function sharedObject(){ const L=S.settings; return { app:'SiteBoard', savedAt:Date.now(), project:L.project||{}, signoff:L.signoff||{}, expected:L.expected||{}, expectedRoles:L.expectedRoles||null, daysOff:L.daysOff||[], daysOn:L.daysOn||[], observations:L.observations||{}, setup:L.setup||null, structOverride:L.structOverride||{}, structAssign:L.structAssign||{} }; }
  async function saveShared(){
    const obj=sharedObject();
    try{
      if(S.dirHandle){ const p=await S.dirHandle.requestPermission({mode:'readwrite'}); if(p!=='granted') throw new Error('write permission not granted'); await writeSettingsFile(S.dirHandle,obj); S.settings.sharedAt=obj.savedAt; saveLS(); return 'Saved '+SETTINGS_FILE+' in the report folder. Teammates get it automatically.'; }
    }catch(e){ /* fall through to download */ }
    const b=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=SETTINGS_FILE; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    return 'Downloaded '+SETTINGS_FILE+'. Put it in the root of the report folder to share the settings with the team.';
  }

  // ------------------------------------------------------------ observations
  const OBS_STATES=[['open','Open'],['monitor','Monitoring'],['closed','Closed']];
  function vObs(v){
    const all=A.observations(S.reports); const st=S.settings.observations=S.settings.observations||{};
    const f=S.obsFilter||'active'; const q=(S.obsQ||'').toLowerCase();
    const stateOf=(k)=>(st[k]&&st[k].s)||'open';
    let list=all.filter(o=>f==='all'||(f==='active'?stateOf(o.key)!=='closed':stateOf(o.key)===f));
    if(q) list=list.filter(o=>[o.item.activity,o.item.location,o.item.remarks,o.item.structure,o.report.reporter].join(' ').toLowerCase().includes(q));
    const cnt=(s)=>all.filter(o=>stateOf(o.key)===s).length;
    v.innerHTML=`<div class="card"><h2>Observation follow-up</h2><div class="sub">Every report item marked “Observation”, or with a remark, is listed here regardless of the period filter. Set a follow-up state and a short note; it is saved in this browser and can be shared with the team from Settings.</div>
    <div class="grid g6" style="margin-bottom:12px"><div class="card kpi"><div class="l">Open</div><div class="v">${cnt('open')}</div></div><div class="card kpi"><div class="l">Monitoring</div><div class="v">${cnt('monitor')}</div></div><div class="card kpi"><div class="l">Closed</div><div class="v">${cnt('closed')}</div></div></div>
    <div class="frm" style="margin-bottom:10px"><label class="fld">Show<select id="of">${[['active','Open + monitoring'],['open','Open'],['monitor','Monitoring'],['closed','Closed'],['all','All']].map(([k,l])=>`<option value="${k}" ${f===k?'selected':''}>${l}</option>`).join('')}</select></label><label class="fld">Search<input id="oq" value="${esc(S.obsQ||'')}" placeholder="activity, location, remark…"></label></div>
    <div class="scroll"><table class="t"><thead><tr><th>Date</th><th>Location</th><th>Activity</th><th>Remark</th><th>Follow-up</th><th>Note</th><th>Report</th></tr></thead><tbody>
    ${list.map(o=>{ const s=st[o.key]||{}; return `<tr><td>${A.fmtShort(o.date)}</td><td>${esc(o.item.location==='-'?'':o.item.location)||'–'}</td><td>${esc(o.item.activity)}<br><span class="badge">${esc(o.item.status||'')}</span></td><td>${esc(o.item.remarks)||'–'}</td>
    <td><select data-os="${esc(o.key)}">${OBS_STATES.map(([k,l])=>`<option value="${k}" ${stateOf(o.key)===k?'selected':''}>${l}</option>`).join('')}</select></td><td><input data-on="${esc(o.key)}" value="${esc(s.n||'')}" placeholder="note" style="width:100%;min-width:140px;border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:3px 6px"></td><td>${refLink(o.report)}</td></tr>`; }).join('')||'<tr><td colspan="7" class="empty">Nothing to follow up.</td></tr>'}</tbody></table></div></div>`;
    $('#of').onchange=(e)=>{ S.obsFilter=e.target.value; render(); };
    $('#oq').oninput=(e)=>{ S.obsQ=e.target.value; clearTimeout(vObs.t); vObs.t=setTimeout(()=>{ const p=e.target.selectionStart; render(); const el=$('#oq'); el.focus(); el.setSelectionRange(p,p); },250); };
    v.querySelectorAll('[data-os]').forEach(sel=>sel.onchange=()=>{ const k=sel.dataset.os; st[k]={...(st[k]||{}),s:sel.value,t:Date.now()}; saveLS(); render(); });
    v.querySelectorAll('[data-on]').forEach(inp=>inp.onchange=()=>{ const k=inp.dataset.on; st[k]={...(st[k]||{s:'open'}),n:inp.value,t:Date.now()}; saveLS(); });
  }

  // ------------------------------------------------------------ missing-report message
  function missingText(date,lang,names){
    const d=A.fmtDate(date,true);
    if(lang==='bm'){
      const dm=A.fromIso(date); const hari=['Ahad','Isnin','Selasa','Rabu','Khamis','Jumaat','Sabtu'][dm.getDay()];
      const ds=`${hari}, ${dm.getDate()} ${['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis'][dm.getMonth()]} ${dm.getFullYear()}`;
      return names.length? `Peringatan: Laporan Foto Harian Tapak (SDR) bagi ${ds} belum diterima daripada:\n${names.map(n=>'- '+n).join('\n')}\n\nSila hantar melalui aplikasi SDR. Terima kasih.` : `Semua laporan yang dijangka bagi ${ds} telah diterima. Terima kasih.`;
    }
    return names.length? `Reminder: the Site Daily Photo Report (SDR) for ${d} has not been received from:\n${names.map(n=>'- '+n).join('\n')}\n\nPlease submit it through the SDR app. Thank you.` : `All expected reports for ${d} have been received. Thank you.`;
  }
  function openMissing(){
    let date=S.msgDate||(()=>{ let d=today(); for(let i=0;i<7&&!A.isWorkDay(d,S.settings);i++) d=A.addDays(d,-1); return d; })();
    const lang=S.msgLang||'en';
    const miss=A.missingFor(S.reports,S.settings,date); const text=S.msgText&&S.msgFor===date+lang? S.msgText : missingText(date,lang,miss.map(p=>p.name));
    drawer(`<h3>Missing-report message</h3><p class="sub">Lists expected reporters (${esc((S.settings.expectedRoles||DEFAULTS.expectedRoles).join(', '))}) with no report on the chosen day. Edit the text, copy it, and paste it into your WhatsApp group.</p>
      <div class="frm"><label class="fld">Report date<input type="date" id="md" value="${date}"></label><label class="fld">Language<select id="ml"><option value="en" ${lang==='en'?'selected':''}>English</option><option value="bm" ${lang==='bm'?'selected':''}>Bahasa Malaysia</option></select></label></div>
      <label class="fld" style="margin-top:10px">Message<textarea id="mt" rows="9" style="width:100%">${esc(text)}</textarea></label>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn pri" id="mc">Copy message</button><a class="btn" id="mw" target="_blank" rel="noopener">Open in WhatsApp</a><span id="mm" class="sub" style="margin:0;align-self:center"></span></div>`);
    const upd=()=>{ $('#mw').href='https://wa.me/?text='+encodeURIComponent($('#mt').value); };
    $('#md').onchange=(e)=>{ S.msgDate=e.target.value; S.msgText=''; openMissing(); };
    $('#ml').onchange=(e)=>{ S.msgLang=e.target.value; S.msgText=''; openMissing(); };
    $('#mt').oninput=(e)=>{ S.msgText=e.target.value; S.msgFor=date+lang; upd(); }; upd();
    $('#mc').onclick=async()=>{ try{ await navigator.clipboard.writeText($('#mt').value); $('#mm').textContent='Copied.'; }catch(_){ $('#mt').select(); document.execCommand('copy'); $('#mm').textContent='Copied.'; } };
  }

  // ------------------------------------------------------------ global search
  function openSearch(q){
    q=(q||'').trim().toLowerCase(); if(q.length<2){ closeDrawer(); return; }
    const rows=A.flatten(S.reports).filter(r=>[r.act,r.bq,r.loc,r.structure,r.rfi,r.remarks,r.reporter,r.ref,r.item.place||'',r.item.layer||''].join(' ').toLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date));
    drawer(`<h3>Search: “${esc(q)}”</h3><p class="sub">${rows.length} result${rows.length!==1?'s':''} across all reports${rows.length>200?' (showing 200)':''}.</p><table class="t"><thead><tr><th>Date</th><th>Activity</th><th>Location</th><th>Remark</th><th>Report</th></tr></thead><tbody>${rows.slice(0,200).map(r=>`<tr><td>${A.fmtShort(r.date)}</td><td>${esc(r.act)}</td><td>${esc(r.loc==='-'?'':r.loc)||'–'}${r.structure?'<br><span class="badge">'+esc(r.structure)+'</span>':''}</td><td>${esc(r.remarks)||'–'}</td><td>${refLink(r.report)}</td></tr>`).join('')}</tbody></table>`);
    wireCommon($('#drawer'));
  }

  // ------------------------------------------------------------ folder health + tidy
  function health(){
    const parsed=S.allParsed||[]; const entries=S.entries||[];
    const plan=S.dirHandle? tidyPlan(entries,parsed) : [];
    const moves=plan.filter(p=>p.kind==='move'), dups=plan.filter(p=>p.kind==='duplicate');
    const dates=S.reportsAll.map(r=>r.date).sort(); const teams=[...new Set(S.reportsAll.map(r=>r.team).filter(Boolean))];
    const old=S.reportsAll.filter(r=>r.source!=='embedded').length;
    return { files:entries.length, parsed:parsed.length, unique:S.reportsAll.length, errors:S.errors.length, plan, moves, dups, first:dates[0], last:dates.at(-1), teams, embedded:S.reportsAll.length-old, legacy:old };
  }
  function healthCard(){
    const h=health();
    return `<div class="card" style="margin-bottom:12px"><h2>Folder health</h2><div class="sub">Check after connecting a folder. Everything here is read-only until you press Tidy.</div>
    <div class="grid g6"><div class="card kpi"><div class="l">PDF files found</div><div class="v">${h.files}</div></div><div class="card kpi ${h.errors?'bad':'good'}"><div class="l">Read successfully</div><div class="v">${h.parsed}</div><div class="n">${h.errors?h.errors+' could not be read':'no read errors'}</div></div><div class="card kpi"><div class="l">Unique reports</div><div class="v">${h.unique}</div><div class="n">${h.parsed-h.unique} duplicate file(s)</div></div><div class="card kpi"><div class="l">Dates</div><div class="v" style="font-size:18px">${h.first?A.fmtShort(h.first)+' – '+A.fmtShort(h.last):'–'}</div><div class="n">teams: ${esc(h.teams.join(', ')||'–')}</div></div><div class="card kpi"><div class="l">Exact data in PDF</div><div class="v">${h.embedded}<span style="font-size:16px;color:var(--muted)"> / ${h.unique}</span></div><div class="n">${h.legacy} older report(s) read from layout</div></div></div>
    ${S.dirHandle?`<div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn ${h.plan.length?'pri':''}" id="tidyBtn" ${h.plan.length?'':'disabled'}>Tidy folder…</button><span class="sub" style="margin:0">${h.plan.length?`${h.moves.length} file(s) to move into YYYY-MM folders, ${h.dups.length} duplicate(s) to move to _duplicates`:'Folder is already tidy.'}</span></div>`:'<p class="sub" style="margin-top:10px">Tidy needs a connected folder (Chrome / Edge).</p>'}</div>`;
  }
  function openTidy(){
    const h=health(); const plan=h.plan;
    drawer(`<h3>Tidy folder</h3><p class="sub">Files are moved into <b>YYYY-MM</b> folders by report date. Duplicates (same report reference) go to <b>_duplicates</b>. Nothing is renamed or overwritten; a file is removed from its old place only after the copy is verified. The browser will ask for write permission.</p>
    <div class="scroll" style="max-height:50vh"><table class="t"><thead><tr><th>Action</th><th>From</th><th>To</th></tr></thead><tbody>${plan.map(p=>`<tr><td>${p.kind==='move'?'Move':'Duplicate'}</td><td>${esc(p.from)}</td><td>${esc(p.to)}</td></tr>`).join('')}</tbody></table></div>
    <div style="display:flex;gap:8px;margin-top:12px;align-items:center"><button class="btn pri" id="tgo">Move ${plan.length} file(s)</button><span id="tmsg" class="sub" style="margin:0"></span></div>`);
    $('#tgo').onclick=async()=>{
      const msg=$('#tmsg'); try{
        const p=await S.dirHandle.requestPermission({mode:'readwrite'}); if(p!=='granted'){ msg.textContent='Write permission was not granted.'; return; }
        $('#tgo').disabled=true; const res=await tidyApply(S.dirHandle,plan,(d,t)=>{ msg.textContent=`Working… ${d}/${t}`; });
        msg.textContent=`Done: ${res.done.length} moved`+(res.failed.length?`, ${res.failed.length} failed (${res.failed[0].error})`:'')+'.';
        await refresh(true);
      }catch(e){ msg.textContent='Could not tidy: '+e.message; }
    };
  }
  function wireHealth(root){ const b=root.querySelector('#tidyBtn'); if(b) b.onclick=openTidy; }

  // ------------------------------------------------------------ guide
  function vGuide(v){
    v.innerHTML=`<div class="card" style="max-width:860px"><h2>SiteBoard team guide</h2><div class="sub">One page for everyone who uses the dashboard.</div>
    <h3>1. Who does what</h3><ul><li><b>IOWs</b> make the Site Daily Photo Report in the SDR app every working day and send the PDF to the report admin.</li><li><b>REs and AREs</b> report as required.</li><li><b>Report admin</b> (Resident Engineer) saves each PDF into the shared Google Drive folder. Nobody else changes files in that folder.</li></ul>
    <h3>2. Filing rules</h3><ul><li>Keep the file name exactly as the SDR app creates it, e.g. <code>WP12-CST-MAT-20261016-1_SDR.pdf</code>. Never rename or edit the PDF.</li><li>Save into the current month folder, e.g. <code>2026-10</code>. If unsure, drop the file anywhere in the folder and press <b>Tidy folder</b> in <i>Report files</i>.</li><li>A corrected report is generated again in the app, with the next number (<code>-2</code>). The old file stays.</li><li>Folders starting with <code>_</code> or <code>.</code> are ignored by the dashboard.</li></ul>
    <h3>3. Opening the dashboard (every team member)</h3><ol><li>Use <b>Chrome or Edge on a computer</b>. Phones can view but cannot connect a folder.</li><li>Install <b>Google Drive for desktop</b>, open its preferences and choose <b>Mirror files</b> so the folder is fully on your PC. Right-click the shared folder and make sure it is available offline.</li><li>Open the SiteBoard link and press <b>Connect reports folder</b>. Choose the shared Drive folder (for example <code>G:\\My Drive\\WP12\\CST_Daily_Reports</code>). Press <b>Allow</b>.</li><li>Keep the tab open: it checks the folder every ${DEFAULTS.pollSeconds} seconds. Next time, press <b>Reconnect folder</b> once.</li></ol>
    <h3>4. Daily routine for the report admin</h3><ol><li>Check <b>Overview</b> and <b>Submissions</b> for missing reports.</li><li>Use <b>Missing-report message</b> (Submissions) to remind IOWs on WhatsApp.</li><li>Review <b>Observations</b>: set each to Open, Monitoring or Closed and add a note.</li><li>At week end and month end use <b>Generate report</b>.</li></ol>
    <h3>5. Sharing settings with the team</h3><p>Project details, who must report daily, non-working days and observation follow-up are stored in your browser. In <i>Settings</i> press <b>Save settings to folder</b>; the file <code>siteboard-settings.json</code> then reaches every teammate through Google Drive and is read automatically.</p>
    <h3>6. Photos, structures and Today</h3><ul><li><b>Today</b> shows the latest report day: who reported, work done, structures worked, photos.</li><li><b>Photos</b>: filter by date, reporter, activity, structure, zone, chainage or text; click to enlarge (arrow keys). “Prepare all thumbnails” makes it instant next time.</li><li><b>Structures</b>: matched by the code in the report, otherwise by description and the nearest chainage — marked (ch.). Culverts are moved on site, so open a structure to set its actual chainage, and assign any unmatched work in the list under the table. Save settings to folder to share the corrections.</li><li>Settings → Import SDR setup.json updates the structure and activity lists.</li></ul>
    <h3>7. If something looks wrong</h3><ul><li>Open <i>Report files</i>: it lists files that could not be read, mismatches and duplicates.</li><li>A report shows “not received” but was sent? Check it is in the folder and that Google Drive has finished syncing.</li><li>Reports made by SDR v1.2.6 or later carry exact data inside the PDF; older ones are read from the page layout and may need a check.</li></ul></div>`;
  }
  return { loadShared, saveShared, mergeShared, vObs, openMissing, openSearch, healthCard, wireHealth, vGuide, OBS_STATES };
}
