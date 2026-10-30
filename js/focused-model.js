import * as A from './analysis.js';
import {PROJECT} from './config.js';
import {recordCounts,scopeSummary,categoryCounts} from './scope.js';

export const CAPTION_FIELDS=[['date','Date / time'],['reporter','Reporter'],['activity','Activity'],['location','Location / chainage / side'],['structure','Structure'],['bq','BQ'],['rfi','RFI'],['layer','Layer / element'],['status','Status / reported progress'],['remarks','Remarks'],['source','Source reference']];
export function captionRows(record,fields=CAPTION_FIELDS.map(x=>x[0])){
  const r=record.report,it=record.item;
  const values={date:A.fmtDate(r.date)+(it.time?' '+it.time:''),reporter:[r.reporter,r.role].filter(Boolean).join(', '),activity:record.acts.join(' + '),location:[it.location,it.place].filter(Boolean).join(' · '),structure:[it.structure,...(record.links||[]).map(l=>l.id+' ('+l.how+(l.amb?', ambiguous':'')+')')].filter(Boolean).join(' · '),bq:it.bq,rfi:it.rfi,layer:[it.layer,it.el].filter(Boolean).join(' / '),status:[it.status,it.pct!=null?it.pct+'%':''].filter(Boolean).join(' · '),remarks:it.remarks,source:r.ref+' #'+it.no};
  return CAPTION_FIELDS.filter(([k])=>fields.includes(k)).map(([k,label])=>[label,String(values[k]||'—')]);
}
export function photoCaption(record,index,fields){return [`*Photo ${index+1}*`,...captionRows(record,fields).map(([k,v])=>`${k}: ${v}`)].join('\n');}
export function focusedModel(records,scope,settings,{title='Focused works report',sections=['summary','records','observations','weather','photos'],photoKeys=null,fields}={}){
  if(!records.length)throw Error('No records match this scope. Change the filters before generating.');
  const chronological=records.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key)),n=recordCounts(records),from=scope.from||chronological[0].date,to=scope.to||chronological.at(-1).date,blocks=[];
  const project={...PROJECT,...settings.project},signoff={...settings.signoff};
  const model={type:'focused',from,to,no:'SB-SCOPE-'+from.replace(/-/g,''),title,period:A.fmtDate(from)+' – '+A.fmtDate(to),project,signoff,issued:A.fmtDate(A.iso(new Date())),blocks,photos:[],sign:[['Prepared by',signoff.preparedName,signoff.preparedTitle],['Checked by',signoff.checkedName,signoff.checkedTitle],['Reviewed / Approved by',signoff.approvedName,signoff.approvedTitle]]};
  blocks.push({t:'h2',x:'Selected scope'},{t:'p',x:scopeSummary(scope)},{t:'note',x:'Activity and status are as reported in SDR. Photograph counts do not measure completed quantities or physical progress.'});
  if(sections.includes('summary'))blocks.push({t:'h2',x:'Summary'},{t:'kpi',items:[[n.items,'Unique items'],[n.photos,'Photos'],[n.reports,'Source reports'],[n.activities,'Sub-activities']]},{t:'table',head:['Category','Items'],rows:categoryCounts(records).map(([c,n])=>[c,String(n)]),num:[1]},{t:'note',x:'A compound item may appear in more than one category; category totals are not additive.'});
  if(sections.includes('records')){
    blocks.push({t:'h2',x:'Chronological work records'},{t:'table',head:['Date','Activity','Location / structure','Reported status','Source'],rows:chronological.map(r=>[A.fmtDate(r.date),r.acts.join(' + '),[r.item.location,r.item.structure,...r.links.map(l=>l.id+' ('+l.how+(l.amb?', ambiguous':'')+')')].filter(Boolean).join(' · '),r.item.status||'—',r.report.ref+' #'+r.item.no]),widths:[.12,.25,.25,.15,.23]});
  }
  if(sections.includes('observations')){const obs=records.filter(r=>r.item.remarks||/observ/i.test(r.item.status||''));blocks.push({t:'h2',x:'Observations and follow-up'},{t:'table',head:['Source','Remarks','Follow-up state'],rows:obs.map(r=>[r.report.ref+' #'+r.item.no,r.item.remarks||r.item.status,settings.observations?.[r.key]?.s||'open']),widths:[.25,.55,.2]});}
  if(sections.includes('weather')){const reports=[...new Map(records.map(r=>[r.report.ref,r.report])).values()];blocks.push({t:'h2',x:'Weather in selected source reports'},{t:'note',x:'Recorded weather is context; these records alone do not establish work disruption or delay.'},{t:'table',head:['Date','AM','PM'],rows:A.weatherDays(reports).map(w=>[A.fmtDate(w.date),[...w.am].join(' / ')||'—',[...w.pm].join(' / ')||'—'])});}
  if(sections.includes('photos')){
    const keys=photoKeys?new Set(photoKeys):null;
    model.photos=records.filter(r=>r.item.photo&&(!keys||keys.has(r.key))).map((r,i)=>({report:r.report,item:r.item,no:i+1,cap:`Photo ${i+1} — ${r.acts.join(' + ')}`,sub:captionRows(r,fields).filter(([k])=>!['Activity','Remarks','Source reference'].includes(k)).map(([k,v])=>k+': '+v).join('\n'),rem:r.item.remarks||'',by:r.report.ref+' #'+r.item.no}));
  }
  return model;
}
