import { CAT_ORDER, PROJECT } from './config.js';
import * as A from './analysis.js';
import { esc } from './charts.js';

const nf=(n)=>Number(n).toLocaleString('en-GB');
const dash=(s)=>s&&s!=='-'?esc(s):'–';

export function periodFor(type, anchor){
  if(type==='weekly'){ const f=A.mondayOf(anchor); return { from:f, to:A.addDays(f,6) }; }
  const d=A.fromIso(anchor); const f=A.iso(new Date(d.getFullYear(),d.getMonth(),1)); const t=A.iso(new Date(d.getFullYear(),d.getMonth()+1,0)); return { from:f, to:t };
}
export function defaultNo(type, from){
  if(type==='weekly'){ const w=A.isoWeek(from); return `CST-WSR-${w.year}-W${String(w.week).padStart(2,'0')}`; }
  const [y,m]=from.split('-'); return `CST-MSR-${y}-${m}`;
}

export function narrative(type, ctx){
  const { reports, rows, days, wdays, mx, wx, bins } = ctx;
  if(!reports.length) return 'No site daily photo reports were received for this period.';
  const people=new Set(reports.map(r=>r.code)).size;
  const cats=A.count(rows,r=>r.cat).filter(c=>c[0]!=='Other').slice(0,3).map(c=>c[0].toLowerCase());
  const zones=[...new Set(rows.map(r=>r.zone).filter(Boolean))].sort();
  const rain=wx.filter(w=>w.rain).length;
  const rf=A.rfiList(rows).length;
  let s=`During the ${type==='weekly'?'week':'month'} of ${A.fmtDate(ctx.from)} to ${A.fmtDate(ctx.to)}, ${reports.length} site daily photo report${reports.length>1?'s were':' was'} received from ${people} site personnel, covering ${wdays} working day${wdays>1?'s':''}. `;
  s+=`A total of ${rows.length} work item${rows.length>1?'s were':' was'} photographed`+(zones.length?` across ${zones.join(', ')}`:'')+(cats.length?`, mainly ${cats.join(', ')}`:'')+'. ';
  if(bins) s+=`Photographed works covered approximately ${nf((A.coveredLength(bins)/1000).toFixed(1))} km of the alignment (100 m resolution). `;
  if(rf) s+=`${rf} RFI reference${rf>1?'s were':' was'} recorded. `;
  if(ctx.idle) s+=`No site activity was reported on ${ctx.idle} day${ctx.idle>1?'s':''}. `;
  s+=rain? `Rain was recorded on ${rain} day${rain>1?'s':''}.` : 'No rain was recorded in the reports.';
  if(mx.rate!=null) s+=` Reporting compliance for expected personnel was ${Math.round(mx.rate*100)}% (${mx.got} of ${mx.exp} expected daily reports).`;
  return s;
}

