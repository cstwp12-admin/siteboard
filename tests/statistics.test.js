import {mapStatisticsSvg} from '../js/map-statistics.js';
import {snapshotData,matrixPages,makeSnapshot} from '../js/snapshot.js';
import {CAT_ORDER} from '../js/config.js';
import {setProjectConfig} from '../js/project.js';
import {setAll} from '../js/analysis.js';
import {rasterize,loadPdfLibs} from '../js/theme.js';
import {addImagePages} from '../js/share-layout.js';
const results=[];const assert=(ok,msg)=>{if(!ok)throw Error(msg);results.push('PASS '+msg);};
const names=['AMIR BIN ABOT','Adwen Abit','Azrelin Bin Matawak','Callixtus lawrence','Kayow Rhino','Matthew Ginsu','Mohd Rendy','Wences O'];
const fixture=n=>({photos:260,all:Array(260),reps:Array(80),reporters:Array.from({length:n},(_,i)=>names[i%8]+(n>8?' — Resident Engineer for regional work package '+(i+1):'')),structures:['B1','B2','B3','C11','C17','C18','C28','C32'],bad:1,rain:8,cats:CAT_ORDER.map((c,i)=>[c,104-i*10]),cov:{pct:.7,bins:[{from:62700,to:62800,n:1,cat:CAT_ORDER[0]}]}});
const scope={project:{consultant:'PY KONSEP PERUNDING SDN BHD',subtitle:'Membina Jalan Dari Sarang Ke Temuno (WP12)'},from:'2026-10-09',to:'2026-10-29',start:62700,end:77500};
try{
  for(const n of [8,20]){
    const d=fixture(n),svg=mapStatisticsSvg(d,n===20?{...scope,project:{consultant:scope.project.consultant.repeat(4),subtitle:scope.project.subtitle.repeat(5)}}:scope);const host=document.createElement('div');host.innerHTML=svg;document.querySelector('#cards').append(host);const root=host.querySelector('svg'),vb=root.viewBox.baseVal;
    assert([...root.querySelectorAll('text')].every(t=>{const b=t.getBBox();return b.x>=0&&b.x+b.width<=vb.width+.5&&b.y>=0&&b.y+b.height<=vb.height;}),`${n} reporter names and every text line remain inside the card`);
    assert(CAT_ORDER.every(c=>[...root.querySelectorAll('text')].some(t=>t.textContent===c)),`all nine categories appear with ${n} reporters`);
    const readable=[...root.querySelectorAll('text')].map(t=>t.textContent).join(' ').replace(/\s+/g,' ');assert(d.reporters.every(name=>readable.includes(name)),`all ${n} reporter names remain present`);
    const quality=[...root.querySelectorAll('text')].find(t=>t.textContent==='Data quality').getBBox(),coverage=[...root.querySelectorAll('text')].find(t=>t.textContent==='100 m chainage coverage').getBBox();assert(coverage.y>quality.y+quality.height+20,'coverage follows the expanded content');
    const img=await rasterize(svg,1); const {jsPDF}=await loadPdfLibs(),doc=new jsPDF({orientation:'landscape'});await addImagePages(doc,img);assert(doc.output('blob').size>1000,'statistics PDF builds from the rendered image');
  }
  const date='2026-01-01',last='2026-04-30',settings={roster:[],expected:{},daysOff:[],daysOn:[],project:{}};
  const item={no:1,activity:'Earthworks',acts:['Earthworks'],ch1:1000,ch2:1000,remarks:'',structure:''};
  const reports=[{date,ref:'TEST-1',code:'A',reporter:'Alpha',role:'IOW',items:[item]},{date:last,ref:'TEST-2',code:'A',reporter:'Alpha',role:'IOW',items:[item]}];setAll(reports);
  const d=snapshotData(reports,{from:date,to:last},settings,last),pages=matrixPages(d);
  assert(d.days.length===120&&d.reps.length===2&&d.from===date,'full 120-day selection retains early and late reports');
  assert(pages.length===4&&pages.flatMap(p=>p.days).join()===d.days.join(),'matrix pages cover every selected day once');
  assert(pages.reduce((n,p)=>n+p.mx.exp,0)===d.mx.exp&&pages.reduce((n,p)=>n+p.mx.got,0)===d.mx.got,'page compliance totals reconcile with the complete period');
  const cfg={chFrom:1000,chTo:3000,zones:[{name:'Test zone',from:1000,to:3000}]};setProjectConfig(cfg);
  const snap=makeSnapshot({S:{reports,settings},resolveRange:()=>({from:date,to:last})});
  const overview=await snap.build('overview');assert(overview.text.includes('of 2.00 km')&&!overview.text.includes('14.81'),'overview caption uses the active 2 km project');
  assert(overview.text.includes('Reports received: 2')&&overview.text.includes('1 Jan 2026 – 30 Apr 2026'),'overview dates and report count agree');
  const matrix=await snap.build('matrix');assert(matrix.images.length===4,'matrix preview prepares all four pages');
  const cv=document.createElement('canvas');cv.width=500;cv.height=250;const g=cv.getContext('2d');g.fillStyle='#eef1f3';g.fillRect(0,0,500,250);const mapBlob=await new Promise(r=>cv.toBlob(r,'image/png')),provider={snapshotForShare:async()=>({cv,blob:mapBlob,text:'Map test'})};snap.setMapProvider(provider);
  const combined=await snap.build('matrix-map');assert(combined.images.length===5,'long matrix plus map includes four matrices and one map');
  const short=makeSnapshot({S:{reports,settings},resolveRange:()=>({from:date,to:'2026-01-31'})});short.setMapProvider(provider);assert((await short.build('matrix-map')).images.length===1,'short matrix plus map remains a single combined image');
  const pdf=await snap.pdfOf(matrix,'matrix');const bytes=new Uint8Array(await pdf.arrayBuffer());const {getDocument,GlobalWorkerOptions}=await import('../vendor/pdf.min.mjs');GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.mjs';const parsed=await getDocument({data:bytes}).promise;assert(parsed.numPages>=5,'matrix PDF contains all four matrices and its complete description');await parsed.destroy();
  const empty=mapStatisticsSvg({...fixture(0),cats:[],structures:[]},scope);assert(empty.includes('None in this selection')&&empty.includes('No activities'),'empty selection remains readable');
  document.body.dataset.status='pass';document.querySelector('#status').textContent=`PASS — ${results.length} checks`;
}catch(e){document.body.dataset.status='fail';document.querySelector('#status').textContent='FAIL';results.push(e.stack);}
finally{setProjectConfig(null);document.querySelector('#out').textContent=results.join('\n');}
