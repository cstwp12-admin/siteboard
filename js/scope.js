// One item-level selection contract for statistics, photographs and focused reports.
import * as A from './analysis.js';
import {structuresList,matchStructures} from './structures.js';

export const recordKey=(report,item)=>report.ref+'#'+item.no;
export function chainageValue(value){
  if(value==null||String(value).trim()==='')return null;
  const s=String(value).trim(),m=/^(?:CH\s*)?(\d+)\s*\+\s*(\d{3})$/i.exec(s);
  const n=m?+m[1]*1000+ +m[2]:/^\d+(?:\.\d+)?$/.test(s)?+s:NaN;
  if(!Number.isFinite(n))throw Error('Use chainage such as 68+500 or a distance in metres.');
  return n;
}
const arr=v=>Array.isArray(v)?v.filter(Boolean):v?[v]:[];
const dateOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&A.iso(A.fromIso(s))===s;
export function normalizeScope(raw={}){
  const s={...raw};
  for(const k of ['from','to'])if(s[k]&&!dateOK(s[k]))throw Error('Choose a valid '+k+' date.');
  if(s.from&&s.to&&s.from>s.to)throw Error('The start date must be on or before the end date.');
  if(s.from&&s.to&&(A.fromIso(s.to)-A.fromIso(s.from))/86400000>3660)throw Error('Choose a reporting period of ten years or less.');
  s.chFrom=chainageValue(s.chFrom);s.chTo=chainageValue(s.chTo);
  if(s.chFrom!=null&&s.chTo!=null&&s.chFrom>s.chTo)throw Error('The start chainage must be on or before the end chainage.');
  for(const k of ['reporters','teams','categories','structures','zones'])s[k]=arr(s[k]);
  s.text=String(s.text||'').trim().toLowerCase();s.side=String(s.side||'').toUpperCase();
  if(s.keys!=null&&!Array.isArray(s.keys))throw Error('Selected record identifiers must be a list.');
  return s;
}
export function selectRecords(reports,raw={},settings={}){
  const s=normalizeScope(raw),keys=s.keys?new Set(s.keys):null;let linked=null;
  if(s.structures.length){linked=new Map();const map=matchStructures(reports,structuresList(settings),settings);for(const id of s.structures)for(const r of map.get(id)?.recs||[]){const key=recordKey(r.report,r.item);const tags=linked.get(key)||[];tags.push({id,how:r.how,amb:!!r.amb});linked.set(key,tags);}}
  const out=[],seen=new Set();
  for(const r of reports){
    if(s.from&&r.date<s.from||s.to&&r.date>s.to||s.reporters.length&&!s.reporters.includes(r.code)||s.teams.length&&!s.teams.includes(r.team))continue;
    for(const it of r.items){
      const key=recordKey(r,it);if(seen.has(key)||keys&&!keys.has(key)||linked&&!linked.has(key))continue;
      const zone=A.zoneForItem(it);if(s.zones.length&&!s.zones.includes(zone))continue;
      const lo=it.ch1==null?null:Math.min(+it.ch1,+(it.ch2??it.ch1)),hi=lo==null?null:Math.max(+it.ch1,+(it.ch2??it.ch1));
      if((s.chFrom!=null||s.chTo!=null)&&(lo==null||(s.chFrom!=null&&hi<s.chFrom)||(s.chTo!=null&&lo>s.chTo)))continue;
      if(s.side&&String(it.side||'').toUpperCase()!==s.side)continue;
      const state=settings.observations?.[key]?.s||'open';
      const observation=/observ/i.test(it.status||'');const remark=!!String(it.remarks||'').trim();
      if(s.observation==='status'&&!observation||s.observation==='remarks'&&!remark||s.observation==='any'&&!observation&&!remark)continue;
      if(['open','monitor','closed'].includes(s.observation)&&(!(observation||remark)||state!==s.observation))continue;
      if(s.text&&![it.activity,it.location,it.place,it.structure,it.bq,it.rfi,it.remarks,r.ref,r.reporter].join(' ').toLowerCase().includes(s.text))continue;
      const acts=(it.acts?.length?it.acts:[it.activity||'']).filter(a=>!s.categories.length||s.categories.includes(A.categorize(a)));
      if(!acts.length)continue;
      seen.add(key);out.push({key,report:r,item:it,date:r.date,zone,acts,categories:[...new Set(acts.map(A.categorize))],links:linked?.get(key)||[]});
    }
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date)||a.report.ref.localeCompare(b.report.ref)||a.item.no-b.item.no);
}
export function scopeSummary(raw={}){
  const s=normalizeScope(raw),parts=[];
  if(s.from||s.to)parts.push(`${s.from||'earliest'} to ${s.to||'latest'}`);
  for(const [k,label] of [['teams','Teams'],['reporters','Reporters'],['categories','Categories'],['zones','Zones'],['structures','Structures']])if(s[k].length)parts.push(label+': '+s[k].join(', '));
  if(s.chFrom!=null||s.chTo!=null)parts.push('CH '+(s.chFrom==null?'start':A.fmtCh(s.chFrom))+' to '+(s.chTo==null?'end':A.fmtCh(s.chTo)));
  if(s.side)parts.push(s.side);if(s.observation)parts.push('Observation filter: '+s.observation);if(s.text)parts.push('Text: '+s.text);
  if(s.keys)parts.push(s.keys.length+' explicitly selected records');return parts.join(' · ')||'All records';
}
export function recordCounts(records){return {reports:new Set(records.map(x=>x.report.ref)).size,items:records.length,photos:records.filter(x=>x.item.photo).length,activities:records.reduce((n,r)=>n+r.acts.length,0)};}
export function categoryCounts(records){return A.count(records.flatMap(r=>r.categories),x=>x);}
