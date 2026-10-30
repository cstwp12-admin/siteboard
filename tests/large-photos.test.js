import {photoBatches,photoReader} from '../js/photo-jobs.js';
import {focusedModel,photoCaption} from '../js/focused-model.js';
import {selectRecords} from '../js/scope.js';
import {renderPdf} from '../js/render-pdf.js';
import {renderDocx} from '../js/render-docx.js';
import {pdfjsLib} from '../js/scanner.js';
const lines=[],out=document.querySelector('#out'),status=document.querySelector('#status');
function check(ok,label){if(!ok)throw Error(label);lines.push('PASS '+label);out.textContent=lines.join('\n');}
function image(n){const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d');x.fillStyle=`hsl(${n*17%360} 45% 55%)`;x.fillRect(0,0,640,480);x.font='bold 70px Arial';x.fillStyle='white';x.fillText('Photo '+n,70,260);return {url:c.toDataURL('image/jpeg',.85),w:640,h:480};}
function entries(bytes){const v=new DataView(bytes.buffer);let end=bytes.length-22;while(end>=0&&v.getUint32(end,true)!==0x06054b50)end--;let pos=v.getUint32(end+16,true),list=[];for(let n=0;n<v.getUint16(end+10,true);n++){const len=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true);list.push({name:new TextDecoder().decode(bytes.slice(pos+46,pos+46+len)),size:v.getUint32(pos+20,true),offset:v.getUint32(pos+42,true),method:v.getUint16(pos+10,true)});pos+=46+len+extra+comment;}return list;}
async function xml(blob){const bytes=new Uint8Array(await blob.arrayBuffer()),list=entries(bytes),e=list.find(x=>x.name==='word/document.xml'),v=new DataView(bytes.buffer),start=e.offset+30+v.getUint16(e.offset+26,true)+v.getUint16(e.offset+28,true),data=bytes.slice(start,start+e.size);return {text:e.method===0?new TextDecoder().decode(data):await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text(),list};}
try{
  for(const n of [50,100,200]){
    status.textContent=`Testing ${n} photos…`;
    const report={ref:'LARGE-'+n,date:'2026-10-29',code:'TEST',reporter:'Fixture',team:'CST',items:Array.from({length:n},(_,i)=>({no:i+1,photo:{page:1},activity:'Excavation',acts:['Excavation'],location:'Test site',remarks:'',status:'Ongoing',structure:''}))};
    const records=selectRecords([report],{},{}),batches=photoBatches(records);
    check(batches.flatMap(b=>b.records).map(r=>r.key).join('|')===records.map(r=>r.key).join('|'),`${n}: sharing batches retain every photo exactly once in order`);
    check(photoCaption(batches.at(-1).records.at(-1),n-1).includes(`*Photo ${n}*`),`${n}: global caption numbering continues through final batch`);
    const images=new Map(report.items.map(it=>[it.no,image(it.no)]));let largest=0,requests=0;
    const load=async(r,items)=>{largest=Math.max(largest,items.length);requests++;return new Map(items.map(it=>[it.no,images.get(it.no)]));};
    const model=focusedModel(records,{}, {project:{title:'Large report fixture'},signoff:{}},{sections:['photos']});
    let ticks=0;const timer=setInterval(()=>ticks++,1);const pdf=await renderPdf(model,{getFull:load,strictPhotos:true});clearInterval(timer);
    const doc=await pdfjsLib.getDocument({data:new Uint8Array(await pdf.blob.arrayBuffer())}).promise;let text='';for(let p=1;p<=doc.numPages;p++)text+=(await(await doc.getPage(p)).getTextContent()).items.map(x=>x.str).join(' ')+' ';await doc.destroy();
    check((text.match(/Photo \d+ /g)||[]).length===n&&text.includes(`Photo ${n}`),`${n}: generated PDF contains every numbered photo caption`);
    check(largest<=8&&requests<=Math.ceil(n/8)&&ticks>0,`${n}: PDF loads bounded chunks and yields to the UI`);
    requests=0;const word=await renderDocx(model,{getFull:load,strictPhotos:true}),w=await xml(word.blob);
    check((w.text.match(/Photo \d+ /g)||[]).length===n&&w.text.includes(`Photo ${n}`),`${n}: Word document contains every numbered photo caption`);
    check(w.list.filter(x=>/^word\/media\//.test(x.name)&&!x.name.endsWith('/')).length===n,`${n}: Word package embeds all ${n} distinct photographs`);
    check(requests<=Math.ceil(n/8),`${n}: Word loads bounded chunks`);
    const controller=new AbortController();let cancelled=false;
    try{await renderPdf(model,{getFull:load,strictPhotos:true,signal:controller.signal,onProgress:t=>{if(+(t.match(/^Placing photos… (\d+)/)?.[1]||0)>=n/2)controller.abort();}});}catch(e){cancelled=e.name==='AbortError';}
    check(cancelled,`${n}: cancelled PDF is rejected rather than published`);
    const wordController=new AbortController();cancelled=false;try{await renderDocx(model,{getFull:load,strictPhotos:true,signal:wordController.signal,onProgress:t=>{if(+(t.match(/^Placing photos… (\d+)/)?.[1]||0)>=n/2)wordController.abort();}});}catch(e){cancelled=e.name==='AbortError';}check(cancelled,`${n}: cancelled Word document is rejected rather than published`);
  }
  const report={ref:'MISSING',items:[{no:1}]},reader=photoReader([{report,item:report.items[0]}],async()=>new Map());let missing=false;try{await reader(report,report.items);}catch(e){missing=e.message.includes('MISSING #1');}check(missing,'Missing photo identifies its exact source and blocks incomplete output');
  document.body.dataset.status='pass';status.textContent=`PASS — ${lines.length} checks`;
}catch(e){document.body.dataset.status='fail';status.textContent='FAIL';out.textContent+='\n'+e.stack;}
