// Active project geometry. The built-in WP12 profile keeps older workspaces working;
// a validated SDR setup.json can replace it without changing report or cache formats.

export const PROJECT_SCHEMA=1;
export const DEFAULT_PROJECT_CONFIG={
  schema:PROJECT_SCHEMA, source:'built-in', projectCode:'WP12',
  projectTitle:'PROJEK LEBUHRAYA PAN BORNEO SABAH FASA 1B', setupVersion:7,
  chFrom:62700, chTo:77508,
  zones:[
    {id:'Zone 1',name:'Zone 1',from:62700,to:64800},
    {id:'Zone 2',name:'Zone 2',from:64800,to:68800},
    {id:'Zone 3',name:'Zone 3',from:68800,to:72350},
    {id:'Zone 4',name:'Zone 4',from:72350,to:77508}
  ],
  sections:{CST:{list:[
    {name:'CST-S1',from:62700,to:65660},{name:'CST-S2',from:65660,to:68620},
    {name:'CST-S3',from:68620,to:71580},{name:'CST-S4',from:71580,to:74540},
    {name:'CST-S5',from:74540,to:77508}
  ],struct:'CST structures'}},
  centreline:[], importedAt:0
};

const copy=(x)=>JSON.parse(JSON.stringify(x));
let ACTIVE=copy(DEFAULT_PROJECT_CONFIG);

// Kept as one stable object because charts and existing modules import it directly.
export const ALIGN={start:ACTIVE.chFrom,end:ACTIVE.chTo,zones:ACTIVE.zones.map(z=>({...z}))};

const num=(v)=>{ const n=Number(v); return Number.isFinite(n)?n:null; };
const text=(v)=>String(v??'').trim();

function normalZones(raw,start,end){
  if(!Array.isArray(raw)||!raw.length) throw new Error('No project zones found in this setup');
  const out=raw.map((z,i)=>{
    const from=num(z&&z.from), to=num(z&&z.to), name=text(z&&(z.name||z.id))||`Zone ${i+1}`;
    if(from==null||to==null||from>=to) throw new Error(`Zone ${i+1} has an invalid chainage range`);
    if(from<start||to>end) throw new Error(`${name} is outside the project chainage range`);
    return {id:name,name,from,to};
  }).sort((a,b)=>a.from-b.from||a.to-b.to);
  if(Math.abs(out[0].from-start)>.01||Math.abs(out.at(-1).to-end)>.01) throw new Error('Project zones must cover the full project chainage range');
  for(let i=1;i<out.length;i++){
    if(out[i].from<out[i-1].to) throw new Error(`${out[i].name} overlaps ${out[i-1].name}`);
    if(out[i].from>out[i-1].to) throw new Error(`There is a chainage gap between ${out[i-1].name} and ${out[i].name}`);
  }
  return out;
}

function normalCentreline(raw,start,end){
  if(raw==null) return [];
  if(!Array.isArray(raw)) throw new Error('Project centreline must be a list of coordinates');
  const pts=[];
  for(const p of raw){
    if(!Array.isArray(p)||p.length<3) continue;
    const lon=num(p[0]),lat=num(p[1]),ch=num(p[2]);
    if(lon==null||lat==null||ch==null||Math.abs(lon)>180||Math.abs(lat)>90) continue;
    if(ch<start-100||ch>end+100) continue;
    pts.push([lon,lat,ch]);
  }
  pts.sort((a,b)=>a[2]-b[2]);
  const out=[]; for(const p of pts) if(!out.length||p[2]>out.at(-1)[2]) out.push(p);
  if(raw.length&&out.length<2) throw new Error('Project centreline has fewer than two valid points');
  return out;
}

function normalSections(raw,start,end){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return {};
  const out={};
  for(const [key,val] of Object.entries(raw)){
    const list=(Array.isArray(val)?val:Array.isArray(val&&val.list)?val.list:[]).map(x=>({name:text(x&&x.name),from:num(x&&x.from),to:num(x&&x.to)}))
      .filter(x=>x.name&&x.from!=null&&x.to!=null&&x.from<x.to&&x.from>=start&&x.to<=end);
    if(list.length) out[key]={list,struct:text(val&&val.struct)};
  }
  return out;
}

export function normalizeProjectGeometry(json){
  if(!json||typeof json!=='object'||Array.isArray(json)) throw new Error('The setup file is not a JSON object');
  const chFrom=num(json.chFrom),chTo=num(json.chTo);
  if(chFrom==null||chTo==null||chFrom>=chTo) throw new Error('Project start and end chainages are missing or invalid');
  if(chTo-chFrom>1000000) throw new Error('Project chainage range is unexpectedly large');
  const zones=normalZones(json.zones,chFrom,chTo), centreline=normalCentreline(json.centreline,chFrom,chTo);
  return {
    schema:PROJECT_SCHEMA, source:'sdr-setup', projectCode:text(json.projectCode)||'Project',
    projectTitle:text(json.projectTitle), contractNo:text(json.contractNo), setupVersion:json.version??'',
    chFrom,chTo,zones,sections:normalSections(json.sections,chFrom,chTo),centreline,
    importedAt:Date.now()
  };
}

function validStored(setup){
  try{
    if(!setup||setup.chFrom==null||setup.chTo==null||!Array.isArray(setup.zones)) return null;
    const g=normalizeProjectGeometry(setup); g.importedAt=Number(setup.importedAt)||0; g.source=setup.source||'sdr-setup';
    g.setupVersion=setup.setupVersion??setup.version??''; return g;
  }catch(_){ return null; }
}

export function setProjectConfig(setup){
  ACTIVE=validStored(setup)||copy(DEFAULT_PROJECT_CONFIG);
  ALIGN.start=ACTIVE.chFrom; ALIGN.end=ACTIVE.chTo; ALIGN.zones=ACTIVE.zones.map(z=>({...z}));
  return ACTIVE;
}
export const getProjectConfig=()=>ACTIVE;
export const hasImportedGeometry=(setup)=>!!validStored(setup);
export const geometrySignature=(cfg=ACTIVE)=>JSON.stringify([cfg.chFrom,cfg.chTo,cfg.zones,cfg.centreline||[]]);
export function zoneOf(ch){
  if(ch==null||!Number.isFinite(+ch)) return '';
  for(const z of ALIGN.zones) if(+ch>=z.from&&+ch<=z.to) return z.id;
  return '';
}
export function zoneForItem(it){
  if(!it||it.ch1==null) return '';
  const b=it.ch2==null?it.ch1:it.ch2; return zoneOf((+it.ch1+ +b)/2);
}
export function chainageLabel(cfg=ACTIVE){
  const f=(n)=>`${Math.floor(n/1000)}+${String(Math.round(n%1000)).padStart(3,'0')}`;
  return `CH ${f(cfg.chFrom)} – CH ${f(cfg.chTo)} (${((cfg.chTo-cfg.chFrom)/1000).toFixed(2)} km)`;
}
