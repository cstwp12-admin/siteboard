import * as A from './analysis.js';
let loading;
export function loadXLSX(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  return loading||(loading=new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=new URL('../vendor/xlsx.mini.min.js',import.meta.url).href; s.onload=()=>res(window.XLSX); s.onerror=()=>rej(new Error('Could not load Excel library')); document.head.appendChild(s); }));
}
const widths=(rows)=>rows[0].map((_,i)=>({wch:Math.min(60,Math.max(8,...rows.slice(0,200).map(r=>String(r[i]??'').length))+2)}));
function sheet(X,rows){ const ws=X.utils.aoa_to_sheet(rows); ws['!cols']=widths(rows); if(rows.length>1) ws['!autofilter']={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:rows.length-1,c:rows[0].length-1}})}; ws['!freeze']={xSplit:0,ySplit:1}; return ws; }

// ctx: {rows (flattened), days, mx (matrix), rfi, wx, obs, obsState, from, to, name}
export async function exportWorkbook(ctx){
  const X=await loadXLSX(); const wb=X.utils.book_new();
  const act=[['Date','Report ref.','Reported by','Role','Team','Zone','Activity','Category','BQ / QC ref.','Location','CH from','CH to','Side','Structure / element','Layer / place','Status','Progress %','RFI','Time','Remarks']];
  for(const r of ctx.rows){ const it=r.item; act.push([r.date,r.ref,r.reporter,r.role,r.report.team,r.zone,r.act,r.cat,r.bq,r.loc==='-'?'':r.loc,r.ch1!=null?A.fmtCh(r.ch1):'',r.ch2!=null?A.fmtCh(r.ch2):'',it.side||'',r.structure,[it.layer,it.place].filter(Boolean).join(' / '),r.status,r.pct??'',r.rfi,it.time||'',r.remarks]); }
  X.utils.book_append_sheet(wb,sheet(X,act),'Activities');
  const sub=[['Personnel','Role','Expected daily',...ctx.days.map(d=>d.slice(5)),'Reports','Days submitted','Days expected']];
  for(const r of ctx.mx.rows){ sub.push([r.p.name,r.p.role,r.p.expected?'Yes':'No',...r.cells.map(c=>c.rs.length||(c.ex?'NOT NEEDED':(r.p.expected&&c.work&&c.past?'NO REPORT':''))),r.tot,r.g,r.e]); }
  X.utils.book_append_sheet(wb,sheet(X,sub),'Submissions');
  const rf=[['RFI','First date','Dates','Activity','Location','Items']];
  for(const e of ctx.rfi){ const ds=[...e.dates].sort(); rf.push([e.rfi,ds[0],ds.join(', '),[...e.acts].join('; '),[...e.locs].join('; '),e.n]); }
  X.utils.book_append_sheet(wb,sheet(X,rf.length>1?rf:[...rf,['','','','','','']]),'RFI');
  const wx=[['Date','AM','PM','Rain']]; for(const w of ctx.wx) wx.push([w.date,[...w.am].join(' / '),[...w.pm].join(' / '),w.rain?'Yes':'']);
  X.utils.book_append_sheet(wb,sheet(X,wx),'Weather');
  const ob=[['Date','Report ref.','Activity','Location','Status in report','Remarks','Follow-up','Follow-up note']];
  for(const o of ctx.obs){ const st=ctx.obsState[o.key]||{}; ob.push([o.date,o.report.ref,o.item.activity,o.item.location,o.item.status,o.item.remarks,st.s||'open',st.n||'']); }
  X.utils.book_append_sheet(wb,sheet(X,ob),'Observations');
  X.writeFile(wb,`SiteBoard_${ctx.from}_to_${ctx.to}.xlsx`);
}
