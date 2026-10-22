// Default structure list (bridges, culverts, junction culverts, RS walls) copied from the SDR app's setup.json.
// Replace it from Settings -> "Import SDR setup.json" when the project list changes. Chainages are drawing chainages (indicative).
import { DEFAULT_STRUCTURES } from './sdr-defaults.js';
export { DEFAULT_STRUCTURES, DEFAULT_ACTMAP } from './sdr-defaults.js';

import { OTHER, IDLE } from './config.js';
import { zoneOf, categorize, structureCodes } from './analysis.js';
export const GROUPS=['Bridge','Culvert','Junction culvert','Reinforced soil wall'];

export function structuresList(settings){
  const s=settings&&settings.setup&&settings.setup.structures; const ov=(settings&&settings.structOverride)||{};
  return (Array.isArray(s)&&s.length? s : DEFAULT_STRUCTURES).map(x=>{ const o=ov[x.id]; const ch=o&&typeof o.ch==='number'?o.ch:x.ch; return {...x,ch,chDrawing:x.ch,moved:ch!==x.ch,note:(o&&o.note)||'',zone:zoneOf(ch)}; });
}

// Parse an SDR setup.json into the pieces SiteBoard uses
export function importSetup(json){
  if(!json||!Array.isArray(json.structures)||!json.structures.length) throw new Error('No structures found in this file');
  const st=json.structures.filter(x=>x&&x.id&&typeof x.ch==='number').map(x=>({id:String(x.id),grp:x.grp||'Culvert',name:x.name||x.id,ch:x.ch,...(x.side?{side:x.side}:{})}));
  if(!st.length) throw new Error('Structure entries have no chainage');
  // SDR activity list -> SiteBoard category (used to classify photos by the exact SDR activity name)
  const CMAP={GEN:'Earthworks',EW:'Earthworks',GT:'Ground treatment',DR:'Drainage & culverts',PV:'Pavement & roadworks',BR:'Piling & structures',RF:'Pavement & roadworks',ES:'Slope protection',TM:OTHER,SH:OTHER,TS:'Survey & QA/QC',QC:'Survey & QA/QC',WX:IDLE.id};
  const actMap={}; for(const a of (Array.isArray(json.activities)?json.activities:[])){ const c=CMAP[a.cat]; if(!c) continue; for(const n of [a.en,a.bm]) if(n) actMap[String(n).toLowerCase().replace(/\s+/g,' ').trim()]=c; }
  return { structures:st, actMap, importedAt:Date.now(), version:json.version||'' };
}

// ---- matching -------------------------------------------------------------------------------
// 1) manual assignment  2) structure code written in the report  3) description (type, size, river name) + nearest chainage.
// Drawing chainages are indicative; structures can be moved/offset on site, so the chainage fallback uses a wide limit,
// picks the nearest structure of the right type and flags close calls as ambiguous. Actual chainages can be set per structure.
const LIM={ 'Bridge':250, 'Reinforced soil wall':120, 'Culvert':150, 'Junction culvert':100 };
export function describe(it){
  const t=((it.activity||'')+' '+(it.structure||'')+' '+(it.location||'')+' '+(it.place||'')).toLowerCase();
  let grp=null;
  if(/junction|\bjc\s?\d/.test(t)) grp='Junction culvert';
  else if(/\brsw|reinforced soil|rs wall|retaining wall|\bmse\b/.test(t)) grp='Reinforced soil wall';
  else if(/culvert|headwall|wing ?wall/.test(t)) grp='Culvert';
  else if(/bridge|abutment|\bpier\b|bored pil|pile cap|approach slab|girder|sonic|\bpit\b|\bmlt\b|pdt/.test(t)) grp='Bridge';
  const shape=/\bbox\b/.test(t)?'box':/\bpipe|\bdia\b|\brcp\b/.test(t)?'pipe':'';
  let size=''; const m1=t.match(/(\d+(?:\.\d+)?)\s*m?\s*(?:dia|ø)/), m2=t.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
  if(m1) size=m1[1]; else if(m2) size=m2[1]+'x'+m2[2];
  const rv=(t.match(/sg\.?\s*([a-z]+)/)||[])[1]||'';
  return { grp, shape, size, rv, side:(it.side||'').toUpperCase(), text:t };
}
const shapeOf=(n)=>/\bbox\b/i.test(n)?'box':/pipe|dia\./i.test(n)?'pipe':'';
const sizeOf=(n)=>{ const a=n.match(/(\d+(?:\.\d+)?)m dia/), b=n.match(/Box\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i); return a?a[1]:b?b[1]+'x'+b[2]:''; };

export function matchStructures(reports, structures, settings){
  const assign=(settings&&settings.structAssign)||{};
  const by=new Map(structures.map(s=>[s.id,{s,recs:[],near:0}])); const unmatched=[];
  const add=(id,r,it,how,extra={})=>{ by.get(id).recs.push({report:r,item:it,date:r.date,how,...extra}); };
  for(const r of reports) for(const it of r.items){
    const act=(it.acts&&it.acts[0])||it.activity;
    if(categorize(act)===IDLE.id) continue;
    const key=r.ref+'#'+it.no; const a=assign[key];
    if(a){ if(a!=='-'&&by.has(a)) add(a,r,it,'manual'); continue; }
    const codes=[...new Set((structureCodes(it.structure)||[]).concat(structureCodes(it.activity)||[]).concat(structureCodes(it.location)||[]))].filter(c=>by.has(c));
    if(codes.length){ for(const c of codes) add(c,r,it,'code'); continue; }
    const d=describe(it); if(!d.grp) continue;
    const c1=it.ch1, c2=it.ch2==null?it.ch1:it.ch2;
    if(c1==null){ unmatched.push({r,it,d,why:'no chainage'}); continue; }
    const lim=LIM[d.grp]; const cands=[];
    for(const e of by.values()){ const s=e.s; if(s.grp!==d.grp) continue;
      const nm=s.name; const sh=shapeOf(nm); if(d.shape&&sh&&d.shape!==sh) continue;
      const dist=s.ch<c1?c1-s.ch:s.ch>c2?s.ch-c2:0; if(dist>lim) continue;
      let sc=dist; const sz=sizeOf(nm); if(d.size&&sz&&d.size!==sz) sc+=60;
      if(d.rv&&nm.toLowerCase().includes(d.rv)) sc-=100;
      if(d.side&&s.side&&(d.side==='LHS'||d.side==='RHS')&&d.side!==s.side) sc+=40;
      cands.push({s,sc,dist}); }
    cands.sort((x,y)=>x.sc-y.sc);
    if(!cands.length){ unmatched.push({r,it,d,why:'no '+d.grp.toLowerCase()+' within '+lim+' m'}); continue; }
    const amb=cands.length>1&&cands[1].sc-cands[0].sc<25;
    add(cands[0].s.id,r,it,'chainage',{amb,dist:cands[0].dist,alt:amb?cands[1].s.id:''});
  }
  for(const e of by.values()){ e.recs.sort((a,b)=>b.date.localeCompare(a.date)||b.item.no-a.item.no);
    const o=e.recs.find(x=>x.item.ch1!=null&&(x.how==='code'||x.how==='manual')); e.obs=(o&&(e.s.grp==='Culvert'||e.s.grp==='Junction culvert'))?o.item.ch1:null; }
  by.unmatched=unmatched; return by;
}
