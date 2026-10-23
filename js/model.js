// Builds a neutral report model (blocks) from parsed SDR data. The PDF and Word renderers both read this model.
import { CAT_ORDER, PROJECT } from './config.js';
import * as A from './analysis.js';
import { setPrint, catColor, dayColumns, hbar, strip, weekBars } from './charts.js';
import { narrative } from './report.js';

const dash=(s)=>s&&s!=='-'?String(s):'–';
export const TYPE_NAME={ weekly:'Weekly Site Progress Report', monthly:'Monthly Site Progress Report' };

export function fileBase(m){
  const t=m.title.replace(/\b\w/g,c=>c.toUpperCase()).replace(/\bSite\b/,'Site');
  const per = m.from.slice(0,7)===m.to.slice(0,7) ? `${A.fromIso(m.from).getDate()}-${A.fmtDate(m.to).replace(/^0/,'')}` : `${A.fmtDate(m.from)} - ${A.fmtDate(m.to)}`;
  return `${m.no} ${t} (${per})`.replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,' ').trim();
}

export function buildModel(o){
  setPrint(true);
  try{ return _build(o); } finally { setPrint(false); }
}

function _build(o){
  const { type, from, to, all, settings, form, photos }=o;
  const today=A.iso(new Date());
  const reports=all.filter(r=>r.date>=from&&r.date<=to);
  const rows=A.works(A.flatten(reports));
  const idleDays=new Set(A.flatten(reports).filter(r=>r.cat==='No site activity').map(r=>r.date)).size;
  const days=A.dateRange(from,to);
  const mx=A.matrix(reports,days,settings,today);
  const wx=A.weatherDays(reports);
  const bins=A.binsFor(rows);
  const ctx={idle:idleDays,reports,rows,days,wdays:new Set(reports.map(r=>r.date)).size,mx,wx,bins,from,to};
  const P={...PROJECT,...(settings.project||{})};
  const S={...(settings.signoff||{})};
  const periodTxt=`${A.fmtDate(from)} – ${A.fmtDate(to)}`;
  const title=form.title||TYPE_NAME[type];
  const B=[]; // blocks
  const model={ type, from, to, no:form.no||'', title, period:periodTxt, project:P, signoff:S, issued:form.issued?A.fmtDate(form.issued):A.fmtDate(today), blocks:B, photos:[] };

  // 1 summary
  B.push({t:'h2',x:'1. Summary'});
  B.push({t:'p',x:narrative(type,ctx)});
  const act=new Set(rows.map(r=>r.act)).size;
  B.push({t:'kpi',items:[[reports.length,'Reports received'],[rows.length,'Work items photographed'],[act,'Distinct activities'],[mx.rate!=null?Math.round(mx.rate*100)+'%':'–','Reporting compliance']]});
  const dayData=new Map(); for(const r of rows){ const d=dayData.get(r.date)||{}; d[r.cat]=(d[r.cat]||0)+1; dayData.set(r.date,d); }
  const usedCats=CAT_ORDER.filter(c=>rows.some(r=>r.cat===c));
  if(rows.length){ B.push({t:'h3',x:'Work items photographed per day'}); B.push({t:'chart',svg:dayColumns(days,dayData,usedCats,{w:720,h:170}),cats:usedCats}); }
  if(form.extra){ B.push({t:'h3',x:'Matters for attention'}); B.push({t:'p',x:form.extra}); }

  // 2 reporting
  B.push({t:'h2',x:'2. Site reporting status'});
  if(days.length<=31){
    const head=['Personnel',...days.map(d=>A.fromIso(d).getDate()+'\n'+A.DOW[A.dow(d)].slice(0,2)),'Total'];
    const body=[];
    for(const r of mx.rows){ if(!r.tot && !r.p.expected) continue;
      body.push([`${r.p.name} (${r.p.role||r.p.code})`,...r.cells.map(c=>{ const n=c.rs.length; const miss=!n&&r.p.expected&&c.work&&c.past; return n?{x:String(n),bg:'E3F3EA'}:miss?{x:'x',bg:'FBE4E1',fg:'B2271B'}:!c.work?{x:'',bg:'EEEEEE'}:''; }),String(r.tot)]); }
    B.push({t:'table',head,rows:body,matrix:true,center:true});
    B.push({t:'note',x:'Green = report(s) received; red x = no report from an expected person on a working day; grey = non-working day.'});
  } else B.push({t:'note',x:'Period too long to tabulate daily.'});

  // 3 works
  B.push({t:'h2',x:'3. Summary of works photographed'});
  if(!rows.length) B.push({t:'p',x:'No works recorded.'});
  else{
    B.push({t:'chart',svg:hbar(A.count(rows,r=>r.cat).map(([c,n])=>({label:c,value:n,color:catColor(c)})),{w:640,labelW:170}),cats:null});
    const body=[];
    for(const c of CAT_ORDER){
      const cr=rows.filter(r=>r.cat===c); if(!cr.length) continue;
      body.push({grp:`${c} — ${cr.length} item${cr.length>1?'s':''}`});
      const by=new Map(); for(const r of cr){ const k=r.act.toLowerCase(); (by.get(k)||by.set(k,[]).get(k)).push(r); }
      for(const g of [...by.values()].sort((a,b)=>b.length-a.length)){
        const last=g.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.item.no-b.item.no).at(-1);
        const bq=[...new Set(g.map(r=>r.bq).filter(Boolean))].join('; ');
        body.push([g[0].act,dash(bq.length>60?bq.slice(0,58)+'…':bq),A.mergeLocs(g.map(r=>r.loc==='-'?'':r.loc),5)||'–',String(g.length),String(new Set(g.map(r=>r.date)).size),`${last.status||'–'}${last.pct!=null?' ('+last.pct+'%)':''}\n${A.fmtShort(last.date)}`]);
      }
    }
    B.push({t:'table',head:['Activity','BQ / QC ref.','Location(s)','Items','Days','Latest status'],rows:body,num:[3,4],widths:[0.26,0.2,0.2,0.07,0.07,0.2]});
  }

  // 4 chainage
  B.push({t:'h2',x:'4. Progress by zone and chainage'});
  if(rows.some(r=>r.ch1!=null)){
    B.push({t:'note',x:`Location of photographed works along ${P.chainage}. Colour shows the dominant activity category per 100 m; stronger colour = more records.`});
    B.push({t:'chart',svg:strip(bins,{w:720}),cats:usedCats});
    const body=[];
    for(const z of ['Zone 1','Zone 2','Zone 3','Zone 4']){ const zr=rows.filter(r=>r.zone===z); body.push([z,...usedCats.map(c=>String(zr.filter(r=>r.cat===c).length||'–')),String(zr.length)]); }
    const nz=rows.filter(r=>!r.zone).length; if(nz) body.push(['No chainage given',...usedCats.map(c=>String(rows.filter(r=>!r.zone&&r.cat===c).length||'–')),String(nz)]);
    B.push({t:'table',head:['Zone',...usedCats,'Total'],rows:body,num:usedCats.map((_,i)=>i+1).concat([usedCats.length+1])});
    const sc=new Map(); for(const r of rows) for(const code of A.structureCodes(r.structure)){ const e=sc.get(code)||{n:0,acts:new Set(),last:''}; e.n++; e.acts.add(r.act); if(r.date>e.last) e.last=r.date; sc.set(code,e); }
    if(sc.size){ B.push({t:'h3',x:'Structures referenced'}); B.push({t:'table',head:['Structure','Items','Activities','Last'],num:[1],widths:[0.18,0.1,0.55,0.17],
      rows:[...sc.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).map(([k,e])=>[k,String(e.n),[...e.acts].slice(0,3).join('; '),A.fmtShort(e.last)])}); }
  } else B.push({t:'p',x:'No chainage-referenced works in this period.'});

  // 5 weather
  B.push({t:'h2',x:'5. Weather'});
  if(wx.length){
    B.push({t:'table',head:['Date','AM','PM','Rain'],rows:wx.map(w=>[A.fmtDate(w.date,true),[...w.am].join(' / ')||'–',[...w.pm].join(' / ')||'–',w.rain?'Yes':'–']),widths:[0.3,0.28,0.28,0.14]});
    B.push({t:'p',x:`Rain recorded on ${wx.filter(w=>w.rain).length} of ${wx.length} reported day${wx.length>1?'s':''}.`});
  } else B.push({t:'p',x:'No weather data.'});

  // 6 RFI
  const rf=A.rfiList(rows);
  B.push({t:'h2',x:'6. RFI references'});
  if(rf.length) B.push({t:'table',head:['RFI no.','Date(s)','Activity','Location','Items'],num:[4],widths:[0.16,0.22,0.3,0.24,0.08],rows:rf.map(e=>[e.rfi,[...e.dates].sort().map(A.fmtShort).join(', '),[...e.acts].join('; '),[...e.locs].join('; ')||'–',String(e.n)])});
  else B.push({t:'p',x:'No RFI referenced in the reports for this period.'});

  // 7 remarks
  const rem=rows.filter(r=>r.remarks||/observ/i.test(r.status)), remShown=rem.filter(r=>r.remarks);
  B.push({t:'h2',x:'7. Site observations and remarks'});
  if(remShown.length) B.push({t:'table',head:['Date','Location','Activity','Status','Remarks','By'],widths:[0.09,0.15,0.18,0.12,0.38,0.08],rows:remShown.map(r=>[A.fmtShort(r.date),dash(r.loc),r.act,r.status||'–',r.remarks,r.code])});
  else B.push({t:'p',x:'No remarks recorded in the reports.'});
  if(rem.length-remShown.length) B.push({t:'note',x:`${rem.length-remShown.length} further item(s) are marked “Observation” without remarks.`});

  // monthly weekly breakdown
  if(type==='monthly'){
    const weeks=[]; let ws=A.mondayOf(from);
    while(ws<=to){ const we=A.addDays(ws,6); const a=ws<from?from:ws, b=we>to?to:we; const rr=reports.filter(r=>r.date>=a&&r.date<=b); const rw=rows.filter(r=>r.date>=a&&r.date<=b);
      const m2=A.matrix(rr,A.dateRange(a,b),settings,today); weeks.push({a,b,label:'W'+String(A.isoWeek(a).week).padStart(2,'0'),reports:rr.length,items:rw.length,rain:A.weatherDays(rr).filter(w=>w.rain).length,rate:m2.rate}); ws=A.addDays(ws,7); }
    B.push({t:'h2',x:'8. Weekly breakdown'});
    B.push({t:'chart',svg:weekBars(weeks.map(w=>({label:w.label,value:w.items})),{w:640}),cats:null});
    B.push({t:'note',x:'Work items photographed per ISO week.'});
    B.push({t:'table',head:['Week','Dates','Reports','Work items','Rain days','Compliance'],num:[2,3,4,5],rows:weeks.map(w=>[w.label,`${A.fmtShort(w.a)} – ${A.fmtShort(w.b)}`,String(w.reports),String(w.items),String(w.rain),w.rate!=null?Math.round(w.rate*100)+'%':'–'])});
  }
  const nn=type==='monthly'?9:8;
  if(form.next||form.remarks){
    B.push({t:'h2',x:`${nn}. Planned works and other remarks`});
    if(form.next){ B.push({t:'h3',x:`Planned works for next ${type==='weekly'?'week':'month'}`}); B.push({t:'p',x:form.next}); }
    if(form.remarks){ B.push({t:'h3',x:'Other remarks'}); B.push({t:'p',x:form.remarks}); }
  }
  model.photos=(photos||[]).map((p,i)=>({report:p.report,item:p.item,no:i+1,
    cap:`Photo ${i+1} — ${p.item.activity}`,
    sub:`${A.fmtDate(p.report.date)}${p.item.time?' '+p.item.time:''} · ${p.item.location&&p.item.location!=='-'?p.item.location:'location n/a'}${p.item.zone?' · '+p.item.zone:''}`,
    rem:p.item.remarks||'', by:`${p.report.reporter}${p.report.role?', '+p.report.role:''} · ${p.report.ref}`}));
  model.sign=[['Prepared by',S.preparedName,S.preparedTitle],['Checked by',S.checkedName,S.checkedTitle],['Reviewed / Approved by',S.approvedName,S.approvedTitle]];
  return model;
}
