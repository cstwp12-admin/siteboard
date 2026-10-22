import { CATS, OTHER, IDLE, RAIN_RE, DEFAULTS } from './config.js';
import { ALIGN, zoneOf, fmtCh } from './parser.js';

export const iso=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
export const fromIso=(s)=>{ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
export const addDays=(s,n)=>{ const d=fromIso(s); d.setDate(d.getDate()+n); return iso(d); };
export const dow=(s)=>fromIso(s).getDay();
export const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const fmtDate=(s,withDow=false)=>{ if(!s) return ''; const d=fromIso(s); return (withDow?DOW[d.getDay()]+', ':'')+d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear(); };
export const fmtShort=(s)=>{ const d=fromIso(s); return d.getDate()+' '+MON[d.getMonth()]; };
export function dateRange(a,b){ const out=[]; for(let d=a; d<=b; d=addDays(d,1)) out.push(d); return out; }
export function isoWeek(s){ const d=fromIso(s); d.setHours(0,0,0,0); d.setDate(d.getDate()+3-((d.getDay()+6)%7)); const w1=new Date(d.getFullYear(),0,4); return { year:d.getFullYear(), week:1+Math.round(((d-w1)/864e5-3+((w1.getDay()+6)%7))/7) }; }
export function mondayOf(s){ const d=dow(s); return addDays(s, -((d+6)%7)); }

let ACTMAP={};
export function setActivityMap(m){ ACTMAP=m||{}; }
export function categorize(act){
  const k=ACTMAP[String(act||'').toLowerCase().replace(/\s+/g,' ').trim()]; if(k) return k;
  if(IDLE.re.test(act)) return IDLE.id;
  for(const c of CATS) if(c.re.test(act)) return c.id;
  return OTHER;
}
export const normAct=(a)=>a.replace(/\s+/g,' ').trim();

// Flatten reports to one row per (item x sub-activity)
export function flatten(reports){
  const rows=[];
  for(const r of reports) for(const it of r.items){
    const acts=it.acts&&it.acts.length?it.acts:[it.activity];
    for(const a of acts){
      rows.push({ date:r.date, ref:r.ref, code:r.code, reporter:r.reporter, role:r.role, report:r, item:it,
        act:normAct(a), cat:categorize(a), status:it.statusBase||'', pct:it.pct, bq:it.bq, loc:it.location,
        ch1:it.ch1, ch2:it.ch2, zone:it.zone||'', structure:it.structure, rfi:it.rfi, remarks:it.remarks });
    }
  }
  return rows;
}
export const works=(rows)=>rows.filter(r=>r.cat!==IDLE.id);
export function count(rows,fn){ const m=new Map(); for(const r of rows){ const k=fn(r); if(k==null||k==='') continue; m.set(k,(m.get(k)||0)+1); } return [...m.entries()].sort((a,b)=>b[1]-a[1]); }

export function people(reports, settings){
  const m=new Map();
  for(const r of reports){ const k=r.code; const p=m.get(k)||{code:k,name:r.reporter,role:r.role,count:0,last:''}; p.count++; if(r.date>=p.last){p.last=r.date;p.name=r.reporter;p.role=r.role||p.role;} m.set(k,p); }
  for(const c of (settings.roster||[])){ if(!m.has(c.code)) m.set(c.code,{count:0,last:'',...c}); else Object.assign(m.get(c.code), {name:c.name||m.get(c.code).name, role:c.role||m.get(c.code).role}); }
  const list=[...m.values()];
  for(const p of list){ const o=(settings.expected||{})[p.code]; p.expected = o!=null ? o : (settings.expectedRoles||DEFAULTS.expectedRoles).includes(p.role); }
  return list.sort((a,b)=>(b.expected-a.expected)||a.code.localeCompare(b.code));
}
export const isWorkDay=(d,settings)=>{ const off=(settings.daysOff||[]); if(off.includes(d)) return false; const extra=(settings.daysOn||[]); if(extra.includes(d)) return true; return DEFAULTS.workDays.includes(dow(d)); };

let FIRST=new Map();
export function setAll(reports){ FIRST=new Map(); for(const r of reports){ const f=FIRST.get(r.code); if(!f||r.date<f) FIRST.set(r.code,r.date); } }
export function matrix(reports, days, settings, today){
  const ppl=people(reports,settings);
  const cell=new Map();
  for(const r of reports){ const k=r.code+'|'+r.date; (cell.get(k)||cell.set(k,[]).get(k)).push(r); }
  let exp=0, got=0;
  const rows=ppl.map(p=>{
    let e=0,g=0,tot=0;
    const cells=days.map(d=>{
      const rs=cell.get(p.code+'|'+d)||[]; const work=isWorkDay(d,settings); const past=d<=today && (!FIRST.get(p.code)||d>=FIRST.get(p.code));
      tot+=rs.length;
      if(p.expected&&work&&past){ e++; if(rs.length) g++; }
      return { d, rs, work, past };
    });
    exp+=e; got+=g; return { p, cells, e, g, tot };
  });
  return { rows, exp, got, rate: exp? got/exp : null };
}

export function weatherDays(reports){
  const m=new Map();
  for(const r of reports){ const w=m.get(r.date)||{date:r.date,am:new Set(),pm:new Set(),rain:false,zones:[]}; if(r.weatherAM) w.am.add(r.weatherAM); if(r.weatherPM) w.pm.add(r.weatherPM);
    if(RAIN_RE.test(r.weatherAM)||RAIN_RE.test(r.weatherPM)) w.rain=true; m.set(r.date,w); }
  return [...m.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function rfiList(rows){
  const m=new Map();
  for(const r of rows){ if(!r.rfi) continue;
    for(const no of r.rfi.split(/[,;]\s*|\s{2,}/).map(s=>s.trim()).filter(Boolean)){
      const e=m.get(no)||{rfi:no,dates:new Set(),acts:new Set(),locs:new Set(),by:new Set(),n:0}; e.dates.add(r.date); e.acts.add(r.act); if(r.loc&&r.loc!=='-') e.locs.add(r.loc); e.by.add(r.reporter); e.n++; m.set(no,e); } }
  return [...m.values()].sort((a,b)=>[...a.dates].sort()[0].localeCompare([...b.dates].sort()[0]));
}
export function structureCodes(str){ return (str||'').match(/\b(?:B\d+|C\d+|JC\d+|RSW\d+)\b/g)||[]; }

// 100 m bins along the alignment
export const BIN=100;
export function binsFor(rows){
  const n=Math.ceil((ALIGN.end-ALIGN.start)/BIN); const bins=Array.from({length:n},()=>({n:0,cats:{}}));
  for(const r of rows){ if(r.ch1==null) continue; const a=Math.max(r.ch1,ALIGN.start), b=Math.min(Math.max(r.ch2,r.ch1),ALIGN.end);
    const i0=Math.floor((a-ALIGN.start)/BIN), i1=Math.min(n-1,Math.floor((b-ALIGN.start)/BIN)); if(i0<0||i0>=n) continue;
    for(let i=i0;i<=Math.min(i1,i0+40);i++){ bins[i].n++; bins[i].cats[r.cat]=(bins[i].cats[r.cat]||0)+1; } }
  return bins;
}
export function coveredLength(bins){ return bins.filter(b=>b.n>0).length*BIN; }
export function mergeLocs(list,max=6){
  const u=[...new Set(list)].filter(Boolean); const s=u.slice(0,max).join('; ');
  return u.length>max? s+' (+'+(u.length-max)+' more)' : s;
}
export { zoneOf, fmtCh, ALIGN };

export const obsKey=(r)=>r.ref+'#'+r.no;
// Items that need follow-up: status Observation, or any remark written
export function observations(reports){
  const out=[];
  for(const r of reports) for(const it of r.items){
    if(!it.remarks && categorize(it.activity)===IDLE.id) continue;
    if(/observ/i.test(it.status||'')||it.remarks) out.push({key:r.ref+'#'+it.no,date:r.date,report:r,item:it});
  }
  return out.sort((a,b)=>b.date.localeCompare(a.date)||a.item.no-b.item.no);
}
export function missingFor(reports,settings,date){
  const ppl=people(reports,settings); const got=new Set(reports.filter(r=>r.date===date).map(r=>r.code));
  return ppl.filter(p=>p.expected && !got.has(p.code) && (!FIRST.get(p.code)||date>=FIRST.get(p.code)));
}
