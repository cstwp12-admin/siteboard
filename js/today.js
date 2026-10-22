// "Today" view: what a site team member or the RE wants to see first thing
import * as A from './analysis.js';
import { esc, catColor } from './charts.js';
import { getPhoto } from './photos.js';
import { CAT_ORDER, IDLE } from './config.js';

export function makeToday(ctx){
  const {S,$,GL}=ctx;
  function vToday(v){
    const t=A.iso(new Date()); const last=S.reports.map(r=>r.date).sort().at(-1);
    const d=last&&last<=t?last:t; const isToday=d===t;
    const reps=S.reports.filter(r=>r.date===d); const prevD=(()=>{ const ds=[...new Set(S.reports.map(r=>r.date))].filter(x=>x<d).sort(); return ds.at(-1); })();
    const rows=A.works(A.flatten(reps)); const prevRows=prevD?A.works(A.flatten(S.reports.filter(r=>r.date===prevD))):[];
    const mx=A.matrix(S.reports.filter(r=>r.date===d),[d],S.settings,t);
    const exp=mx.rows.filter(r=>r.p.expected); const got=exp.filter(r=>r.cells[0].rs.length);
    const miss=exp.filter(r=>!r.cells[0].rs.length&&A.isWorkDay(d,S.settings));
    const wx=A.weatherDays(reps)[0];
    const cats=CAT_ORDER.filter(c=>c!==IDLE.id&&rows.some(r=>r.cat===c));
    const photos=reps.flatMap(r=>r.items.filter(it=>it.photo&&(it.acts&&it.acts[0]||it.activity)).map(it=>({r,it,date:d,cat:A.categorize((it.acts&&it.acts[0])||it.activity),codes:A.structureCodes(it.structure)})));
    const sts=GL.structuresList(S.settings); const M=GL.matchStructures(reps,sts,S.settings); const act=sts.filter(s=>M.get(s.id).recs.length);
    const open=A.observations(S.reports).filter(o=>!((S.settings.observations||{})[o.key]||{}).s||(S.settings.observations[o.key].s!=='closed')).length;
    const kp=(l,val,n,c='')=>`<div class="card kpi ${c}"><div class="l">${l}</div><div class="v">${val}</div><div class="n">${n}</div></div>`;
    v.innerHTML=`<div class="hero"><div><div class="hero-d">${esc(A.fmtDate(d,true))}</div><div class="hero-s">${isToday?'Today':'Latest reports'}${wx?' · '+esc([...wx.am][0]||'')+(wx.pm.size?' / '+esc([...wx.pm][0]):''):''}${wx&&wx.rain?' · <b style="color:var(--warn)">rain</b>':''}</div></div></div>
    <div class="grid g6">${kp('Reports in',reps.length,`${new Set(reps.map(r=>r.code)).size} people`)}${kp('Daily reporters',exp.length?got.length+' / '+exp.length:'–',miss.length?'missing: '+esc(miss.map(m=>m.p.name).join(', ')):(exp.length?'all in':'none expected'),miss.length?'bad':exp.length?'good':'')}${kp('Work items',rows.length,prevD?`${prevRows.length} on ${esc(A.fmtShort(prevD))}`:'')}${kp('Structures worked',act.length,act.slice(0,8).map(s=>esc(s.id)).join(', ')||'none matched')}${kp('Open observations',open,'follow-up list')}</div>
    <div class="grid g2" style="margin-top:12px"><div class="card"><h2>What was done</h2><div class="sub">Work items by category</div>${cats.map(c=>{ const rs=rows.filter(r=>r.cat===c); const names=[...new Set(rs.map(r=>r.act))]; return `<div style="margin:8px 0"><span class="sw" style="background:${catColor(c)}"></span><b>${esc(c)}</b> <span class="sub">${rs.length} item${rs.length===1?'':'s'}</span><div class="sub" style="margin:2px 0 0 17px">${esc(names.slice(0,6).join(' · '))}${names.length>6?' …':''}</div></div>`; }).join('')||'<p class="empty">No work recorded.</p>'}</div>
    <div class="card"><h2>Reporting</h2><div class="sub">Expected daily reporters first</div>${mx.rows.map(r=>`<div style="display:flex;gap:8px;align-items:center;padding:3px 0"><span class="badge ${r.cells[0].rs.length?'ok':r.p.expected?'warn':''}">${r.cells[0].rs.length?'in':r.p.expected?'missing':'—'}</span>${esc(r.p.name)} <span class="sub">${esc(r.p.role||'')}</span></div>`).join('')||'<p class="empty">No reports.</p>'}</div></div>
    ${photos.length?`<div class="card" style="margin-top:12px"><h2>Photos</h2><div class="sub">${photos.length} from ${esc(A.fmtShort(d))}. Tap one to enlarge.</div><div class="strip-ph" id="tp">${photos.slice(0,18).map((p,i)=>`<img alt="" data-i="${i}">`).join('')}</div></div>`:''}`;
    const list=photos.slice(0,18);
    v.querySelectorAll('#tp img').forEach(im=>{ const p=list[+im.dataset.i]; getPhoto(p.r,p.it).then(u=>{ if(u) im.src=u; }).catch(()=>{}); im.onclick=()=>GL.lightbox(+im.dataset.i,list); });
  }
  return { vToday };
}
