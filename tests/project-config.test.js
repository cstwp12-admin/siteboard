import { ALIGN, DEFAULT_PROJECT_CONFIG, setProjectConfig, getProjectConfig, zoneOf, zoneForItem, chainageLabel, normalizeProjectGeometry } from '../js/project.js';
import { importSetup } from '../js/structures.js';
import { makeGeo, kmlFromBuffer } from '../js/map.js';

const lines=[];
function assert(ok,msg){ if(!ok) throw new Error(msg); lines.push('✓ '+msg); }
function throws(fn,part){ let e=null; try{ fn(); }catch(x){ e=x; } assert(e&&String(e.message).includes(part),`rejects invalid data: ${part}`); }
async function asyncThrows(fn,part){ let e=null; try{ await fn(); }catch(x){ e=x; } assert(e&&String(e.message).includes(part),`rejects unsupported KMZ: ${part}`); }

try{
  setProjectConfig(null);
  assert(ALIGN.start===62700&&ALIGN.end===77508,'packaged WP12 range remains the default');
  assert(zoneOf(64800)==='Zone 1'&&zoneOf(64801)==='Zone 2','default boundary behaviour is unchanged');

  const raw={version:12,kind:'wp12-sdr-setup',projectCode:'PX1',projectTitle:'Future Project',chFrom:10000,chTo:12000,
    zones:[{name:'North',from:10000,to:11000},{name:'South',from:11000,to:12000}],
    sections:{QA:{list:[{name:'QA-1',from:10000,to:12000}],struct:'QA structures'}},
    centreline:[[116,6,10000],[116.01,6.01,11000],[116.01,6.01,11000],[116.02,6.02,11999]],
    structures:[{id:'B1',grp:'Bridge',name:'Test bridge',ch:10500}],activities:[{cat:'BR',en:'Bored piling',bm:'Cerucuk gerek'}]};
  const setup=importSetup(raw);
  assert(setup.projectCode==='PX1'&&setup.setupVersion===12,'imports project identity and setup version');
  assert(setup.structures.length===1&&Object.keys(setup.actMap).length===2,'imports structures and activity mappings');
  assert(setup.centreline.length===3,'sorts and deduplicates centreline points');
  setProjectConfig(setup);
  assert(ALIGN.start===10000&&ALIGN.end===12000&&ALIGN.zones.length===2,'activates imported project geometry');
  assert(zoneForItem({ch1:10900,ch2:11100})==='North','derives item zones from the active project at display time');
  assert(chainageLabel(getProjectConfig()).includes('10+000')&&chainageLabel(getProjectConfig()).includes('12+000'),'formats a project-specific chainage label');
  const geo=makeGeo({line:setup.centreline.map(p=>[p[1],p[0]]),chain:setup.centreline.map(p=>({ch:p[2],lat:p[1],lon:p[0]})),range:[setup.chFrom,setup.chTo]});
  assert(geo.chMin===10000&&geo.chMax===12000,'clamps small centreline endpoint differences to the configured range');
  assert((await kmlFromBuffer(new TextEncoder().encode('<kml/>').buffer,'plain.kml'))==='<kml/>','continues to accept plain KML files');
  const zip=new Uint8Array(46+7+22), dv=new DataView(zip.buffer), eocd=53; dv.setUint32(0,0x02014b50,true); dv.setUint16(10,99,true); dv.setUint16(28,7,true); zip.set(new TextEncoder().encode('doc.kml'),46); dv.setUint32(eocd,0x06054b50,true); dv.setUint16(eocd+10,1,true); dv.setUint32(eocd+16,0,true);
  await asyncThrows(()=>kmlFromBuffer(zip.buffer,'unsupported.kmz'),'compression method 99');

  throws(()=>normalizeProjectGeometry({...raw,zones:[{name:'A',from:10000,to:11100},{name:'B',from:11000,to:12000}]}),'overlaps');
  throws(()=>normalizeProjectGeometry({...raw,zones:[{name:'A',from:10000,to:10900},{name:'B',from:11000,to:12000}]}),'chainage gap');
  throws(()=>normalizeProjectGeometry({...raw,chFrom:12000,chTo:10000}),'start and end');
  setProjectConfig({structures:setup.structures,actMap:setup.actMap});
  assert(ALIGN.start===DEFAULT_PROJECT_CONFIG.chFrom,'old saved setups without geometry fall back safely');
  document.body.dataset.status='pass'; document.querySelector('#status').className='pass'; document.querySelector('#status').textContent=`PASS — ${lines.length} checks`;
}catch(e){ document.body.dataset.status='fail'; document.querySelector('#status').className='fail'; document.querySelector('#status').textContent='FAIL'; lines.push('✗ '+e.stack); }
finally{ setProjectConfig(null); document.querySelector('#out').textContent=lines.join('\n'); }
