import * as A from './analysis.js';
import {PROJECT,VERSION} from './config.js';
import {esc,dayColumns} from './charts.js';
import {normalizeScope,selectRecords,recordCounts,scopeSummary,categoryCounts} from './scope.js';
import {scopeControls,readScope} from './scope-controls.js';
import {focusedModel,CAPTION_FIELDS,photoCaption} from './focused-model.js';
import {photoSheet} from './photo-sheet.js';
import {getFull} from './photos.js';
import {mapStatisticsSvg} from './map-statistics.js';
import {rasterize,loadPdfLibs,T} from './theme.js';
import {addImagePages,textBlock,svgEscape} from './share-layout.js';
import {renderPdf} from './render-pdf.js';
import {renderDocx} from './render-docx.js';
import {sendWhatsApp} from './messages.js';
import {photoBatches,photoReader,checkJob,yieldJob} from './photo-jobs.js';

export function selectionStatistics(records,raw){
  const s=normalizeScope(raw),clamp=n=>Math.max(A.ALIGN.start,Math.min(A.ALIGN.end,n)),a=clamp(s.chFrom??A.ALIGN.start),b=clamp(s.chTo??A.ALIGN.end),bins=[];
  if(b>a)for(let x=Math.floor(a/100)*100;x<b;x+=100){const from=Math.max(a,x),to=Math.min(b,x+100),hits=records.filter(r=>{const p=r.item;if(p.ch1==null)return false;const lo=Math.min(p.ch1,p.ch2??p.ch1),hi=Math.max(p.ch1,p.ch2??p.ch1);return lo===hi?lo>=from&&(lo<to||to===b&&lo===b):Math.max(lo,from)<Math.min(hi,to);});bins.push({from,to,n:hits.length,cat:categoryCounts(hits)[0]?.[0]||''});}
  const covered=bins.filter(b=>b.n).reduce((n,b)=>n+b.to-b.from,0),total=Math.max(0,b-a),reports=[...new Map(records.map(r=>[r.report.ref,r.report])).values()],counts=recordCounts(records);
  return {all:records,reps:reports,photos:counts.photos,reporters:[...new Map(records.map(r=>[r.report.code,r.report.reporter||r.report.code])).values()],structures:[...new Set(records.flatMap(r=>[...A.structureCodes(r.item.structure),...r.links.map(l=>l.id)]))].sort(),cats:categoryCounts(records),bad:0,qualityText:`${records.filter(r=>r.item.ch1==null).length} items without chainage. GPS checks: see Map.`,rain:A.weatherDays(reports).filter(d=>d.rain).length,cov:{bins,covered,total,pct:total?covered/total:0},start:a,end:b};
}
const SECTION_OPTIONS={statistics:[['metrics','Key figures'],['categories','Categories'],['coverage','Chainage coverage'],['reporters','Reporter names'],['structures','Structures'],['quality','Data checks'],['daily','Daily chart']],report:[['summary','Summary'],['records','Chronological records'],['observations','Observations / follow-up'],['weather','Weather context'],['photos','Photographic record']]};
const DEFAULT_FIELDS=CAPTION_FIELDS.map(x=>x[0]);
const save=(file)=>{const a=document.createElement('a');a.href=URL.createObjectURL(file.blob);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);};

export function makeEvidence(ctx){
  const {S,$,render,saveLS,resolveRange}=ctx;
  const E={kind:'statistics',scope:null,title:'Selected works',records:[],photoKeys:new Set(),order:[],output:null,busy:false,job:0,batchIndex:0,controller:null};
  const prefs=()=>S.settings.sharePrefs||(S.settings.sharePrefs={});
  function sections(){return prefs()[E.kind+'Sections']||SECTION_OPTIONS[E.kind]?.map(x=>x[0])||[];}
  function fields(){return prefs().captionFields||DEFAULT_FIELDS;}
  function invalidate(){if(E.output?.previewURL)URL.revokeObjectURL(E.output.previewURL);E.output=null;const o=$('#evOutput');if(o)o.innerHTML='';}
  function open({kind='statistics',scope={},title='Selected works'}={}){
    E.controller?.abort();E.job++;E.busy=false;E.batchIndex=0;E.kind=kind;E.scope={...resolveRange(),...scope};E.title=title;E.order=[];E.photoKeys=new Set();E.initialized=false;invalidate();S.tab='share';render();
  }
  function apply(root){
    E.scope=readScope(root,E.scope,'ev');E.title=$('#evTitle').value.trim().slice(0,120)||'Selected works';
    E.records=selectRecords(S.reports,E.scope,S.settings);
    // Keep an explicit photo subset across filter changes; select all on first use.
    if(!E.initialized){E.photoKeys=new Set(E.records.filter(r=>r.item.photo).map(r=>r.key));E.initialized=true;}
    const allKeys=new Set(E.records.map(r=>r.key));E.order=E.order.filter(k=>allKeys.has(k));for(const r of E.records)if(!E.order.includes(r.key))E.order.push(r.key);
    if(E.scope.keys)E.scope.keys=E.scope.keys.slice();invalidate();drawRecords();
  }
  function ordered(){const by=new Map(E.records.map(r=>[r.key,r]));const order=E.order.map(k=>by.get(k)).filter(Boolean);return $('#evSort')?.value==='newest'?order.slice().sort((a,b)=>b.date.localeCompare(a.date)||a.key.localeCompare(b.key)):order;}
  function drawRecords(){
    const n=recordCounts(E.records);$('#evCounts').textContent=`${n.items} unique items · ${n.photos} photographs · ${n.reports} source reports · ${n.activities} sub-activities`;
    $('#evScopeLabel').textContent=scopeSummary(E.scope);
    const picked=ordered().filter(r=>r.item.photo&&E.photoKeys.has(r.key)),batches=photoBatches(picked);E.batchIndex=Math.min(E.batchIndex,Math.max(0,batches.length-1));
    $('#evBatchControls').innerHTML=E.kind==='photos'?`<label class="fld">Sharing batch<select id="evBatch">${batches.map((b,i)=>`<option value="${i}" ${i===E.batchIndex?'selected':''}>Batch ${i+1} of ${batches.length}: photos ${b.start+1}–${b.end} of ${b.total}</option>`).join('')}</select></label><p class="sub">All ${picked.length} selected photos are retained. Prepare each batch separately; numbering continues across batches. A focused PDF/Word report includes all selected photos in one document.</p>`:`<p class="sub">${picked.length} photos selected. Reports include every selected photo; large documents take longer and use more memory. You can cancel preparation.</p>`;
    if($('#evBatch'))$('#evBatch').onchange=e=>{E.batchIndex=+e.target.value;invalidate();};
    $('#evRecords').innerHTML=`<div class="scroll" style="max-height:420px"><table class="t"><thead><tr><th>Photo</th><th>Date / source</th><th>Activity</th><th>Location / structure</th><th>Order</th></tr></thead><tbody>${ordered().map((r,i)=>`<tr><td>${r.item.photo?`<label><input type="checkbox" data-ev-photo="${esc(r.key)}" ${E.photoKeys.has(r.key)?'checked':''}> Include</label>`:'No photo'}</td><td>${esc(A.fmtDate(r.date))}<br>${esc(r.report.ref)} #${r.item.no}</td><td>${esc(r.acts.join(' + '))}<br>${esc(r.item.status||'')}</td><td>${esc([r.item.location,r.item.structure].filter(Boolean).join(' · '))}${r.links.map(l=>`<br><span class="sub">${esc(l.id)}: ${esc(l.how)}${l.amb?' (ambiguous)':''}</span>`).join('')}</td><td><button class="btn sm" data-ev-move="${i}" data-dir="-1" aria-label="Move record up">↑</button><button class="btn sm" data-ev-move="${i}" data-dir="1" aria-label="Move record down">↓</button></td></tr>`).join('')||'<tr><td colspan="5">No records match. Change the filters.</td></tr>'}</tbody></table></div>`;
    $('#evRecords').querySelectorAll('[data-ev-photo]').forEach(c=>c.onchange=()=>{c.checked?E.photoKeys.add(c.dataset.evPhoto):E.photoKeys.delete(c.dataset.evPhoto);E.batchIndex=0;invalidate();drawRecords();});
    $('#evRecords').querySelectorAll('[data-ev-move]').forEach(b=>b.onclick=()=>{const list=ordered(),i=+b.dataset.evMove,j=i+ +b.dataset.dir;if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];E.order=list.map(r=>r.key);$('#evSort').value='manual';invalidate();drawRecords();});
  }
  function vEvidence(v){
    E.controller?.abort();E.job++;E.busy=false;E.scope=E.scope||resolveRange();
    v.innerHTML=`<div class="card"><h2>Share &amp; focused report</h2><p class="sub">Select the evidence once, review the matching records, then prepare statistics, captioned photos or a focused PDF/Word report. Category filters select sub-activities; totals identify unique source items.</p>
    <div class="frm"><label class="fld">Output<select id="evKind">${[['statistics','Statistics / overview'],['photos','Photos with captions'],['report','Focused work report']].map(([k,v])=>`<option value="${k}" ${E.kind===k?'selected':''}>${v}</option>`).join('')}</select></label><label class="fld">Title<input id="evTitle" value="${esc(E.title)}"></label><label class="fld">Quick scope<select id="evPreset"><option value="">Custom</option><option value="Earthworks">Earthworks</option><option value="Drainage &amp; culverts">Drainage &amp; culverts</option><option value="Piling &amp; structures">Structures</option><option value="Other">Other works</option><option value="observations">Observations and remarks</option></select></label></div>
    ${E.scope.keys?`<p class="alert">Working with ${E.scope.keys.length} explicitly selected source items. Other filters narrow this selection. <button class="btn sm" id="evUnlock">Use all source items instead</button></p>`:''}
    <details ${E.scope.keys?'':'open'}><summary>Scope filters</summary>${scopeControls(S.reports,S.settings,E.scope,'ev')}</details>
    <button class="btn" id="evApply">Apply filters</button><p class="sub" id="evScopeLabel"></p><b id="evCounts"></b>
    <div class="frm" style="margin-top:14px"><label class="fld">Photo order<select id="evSort"><option value="manual">Chronological / manual</option><option value="newest">Newest first</option></select></label>${E.kind==='photos'?`<label class="fld">Photo format<select id="evPhotoFormat">${[['table','SDR-style tabular photo sheets'],['card','Captioned photo cards'],['original','Original photos + numbered captions']].map(([k,v])=>`<option value="${k}" ${prefs().photoFormat===k?'selected':''}>${v}</option>`).join('')}</select></label>`:''}</div>
    ${E.kind!=='photos'?`<fieldset><legend>Sections to include</legend>${SECTION_OPTIONS[E.kind].map(([k,l])=>`<label style="display:inline-block;margin:8px"><input type="checkbox" data-ev-section="${k}" ${sections().includes(k)?'checked':''}> ${l}</label>`).join('')}</fieldset>`:''}
    ${E.kind!=='statistics'?`<details><summary>Caption fields</summary>${CAPTION_FIELDS.map(([k,l])=>`<label style="display:inline-block;margin:8px"><input type="checkbox" data-ev-field="${k}" ${fields().includes(k)?'checked':''}> ${l}</label>`).join('')}</details>`:''}
    <p class="sub">Photo checkboxes affect the photographic output only. Focused report statistics still use every matching item. Reports have no fixed photo-count cap. Photo sharing uses numbered batches of up to 20 photos.</p><div id="evBatchControls"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button class="btn sm" id="evSelectPhotos">Include all matching photos</button><button class="btn sm" id="evClearPhotos">Exclude all photos</button></div><div id="evRecords"></div>
    <button class="btn pri" id="evBuild" style="margin-top:14px">Prepare preview</button> <button class="btn" id="evCancel" hidden>Cancel preparation</button> <span class="sub" role="status" id="evMessage"></span><div id="evOutput"></div></div>`;
    invalidate();apply(v);
    $('#evKind').onchange=e=>{E.kind=e.target.value;try{apply(v);}catch(_){}render();};
    $('#evApply').onclick=()=>{try{apply(v);$('#evMessage').textContent='Filters applied.';}catch(e){$('#evMessage').textContent=e.message;}};
    $('#evUnlock')&&($('#evUnlock').onclick=()=>{delete E.scope.keys;render();});
    $('#evPreset').onchange=e=>{const value=e.target.value;if(value==='observations'){E.scope.observation='any';E.scope.categories=[];}else{E.scope.categories=value?[value]:[];E.scope.observation='';}E.title=value==='observations'?'Observations and remarks':value||'Selected works';render();};
    const change=()=>{invalidate();$('#evMessage').textContent='Selection changed. Prepare a new preview before exporting.';};
    v.querySelectorAll('.scope-controls input,.scope-controls select,#evTitle').forEach(el=>el.onchange=change);
    $('#evSort').onchange=()=>{invalidate();drawRecords();};
    v.querySelectorAll('[data-ev-section]').forEach(el=>el.onchange=()=>{prefs()[E.kind+'Sections']=[...v.querySelectorAll('[data-ev-section]:checked')].map(x=>x.dataset.evSection);saveLS();change();});
    v.querySelectorAll('[data-ev-field]').forEach(el=>el.onchange=()=>{prefs().captionFields=[...v.querySelectorAll('[data-ev-field]:checked')].map(x=>x.dataset.evField);saveLS();change();});
    $('#evPhotoFormat')&&($('#evPhotoFormat').onchange=e=>{prefs().photoFormat=e.target.value;saveLS();change();});
    $('#evSelectPhotos').onclick=()=>{E.photoKeys=new Set(E.records.filter(r=>r.item.photo).map(r=>r.key));invalidate();drawRecords();};$('#evClearPhotos').onclick=()=>{E.photoKeys.clear();invalidate();drawRecords();};
    $('#evBuild').onclick=()=>prepare(v);
    $('#evCancel').onclick=()=>{E.controller?.abort();$('#evMessage').textContent='Cancelling after the current processing step…';};
  }
  async function prepare(v){
    if(E.busy)return;E.busy=true;const job=++E.job,button=$('#evBuild'),msg=$('#evMessage'),controller=E.controller=new AbortController(),signal=controller.signal;button.disabled=true;const say=t=>{if(E.job!==job||S.tab!=='share')controller.abort();checkJob(signal);msg.textContent=t;};
    try{
      apply(v);if(!E.records.length)throw Error('No records match this scope.');const records=ordered(),counts=recordCounts(records),allPicked=records.filter(r=>r.item.photo&&E.photoKeys.has(r.key)),batches=photoBatches(allPicked),batch=E.kind==='photos'?batches[E.batchIndex]:null,picked=batch?.records||allPicked,section=sections(),fmt=$('#evPhotoFormat')?.value||'table';
      if(E.kind==='photos'&&!picked.length)throw Error('Include at least one photo to share.');
      if(E.kind!=='photos'&&!section.length)throw Error('Choose at least one output section.');
      v.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);
      $('#evCancel').hidden=false;$('#evCancel').disabled=false;await yieldJob(signal);
      const name=E.title.replace(/[\\/:*?"<>|]/g,'').trim()+' '+(E.scope.from||records.map(r=>r.date).sort()[0])+' to '+(E.scope.to||records.map(r=>r.date).sort().at(-1));
      let text=[E.title,scopeSummary(E.scope),`${counts.items} unique items · ${counts.photos} available photos · ${counts.reports} source reports`, 'Categories may overlap for compound activities.'].join('\n');const output={name:batch?`${name} batch ${E.batchIndex+1} of ${batches.length}`:name,images:[],files:[],text,model:null,pdf:null,captionFields:fields().slice(),batch:batch?{index:E.batchIndex,count:batches.length,start:batch.start,end:batch.end,total:batch.total}:null};
      if(E.kind==='statistics'){
        const d=selectionStatistics(records,E.scope),svg=mapStatisticsSvg(d,{project:{...PROJECT,...S.settings.project},from:E.scope.from||records.map(r=>r.date).sort()[0],to:E.scope.to||records.map(r=>r.date).sort().at(-1),start:d.start,end:d.end,sections:section,selection:E.title+' · '+scopeSummary(E.scope),heading:'Selected works overview'});
        if(section.some(k=>k!=='daily')){const img=await rasterize(svg,2);output.images.push({img,blob:await (await fetch(img.url)).blob()});}
        if(section.includes('daily')){const from=E.scope.from||records.map(r=>r.date).sort()[0],to=E.scope.to||records.map(r=>r.date).sort().at(-1),days=A.dateRange(from,to);const data=new Map();for(const r of records){const day=data.get(r.date)||{};for(const c of r.categories)day[c]=(day[c]||0)+1;data.set(r.date,day);}
          for(let i=0;i<days.length;i+=31){const part=days.slice(i,i+31),chart=dayColumns(part,data,d.cats.map(c=>c[0]),{w:1100,h:230});const head=textBlock(E.title+' · '+part[0]+' to '+part.at(-1),{x:24,y:25,width:1050,size:17,weight:'bold'});const legend=textBlock(d.cats.map(c=>c[0]).join(' · '),{x:24,y:322,width:1100,size:11,lineHeight:16});const daily=`<svg viewBox="0 0 1148 ${370+legend.height}" width="100%"><rect width="1148" height="${370+legend.height}" fill="#fff"/>${head.svg}<svg x="24" y="70" width="1100" height="230" viewBox="0 0 1100 230">${chart.replace(/<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</svg>${legend.svg}<text x="24" y="${347+legend.height}" font-size="12">Category item counts; a compound item may appear in multiple categories.</text></svg>`;const img=await rasterize(daily,2);output.images.push({img,blob:await(await fetch(img.url)).blob()});}
        }
        if(section.includes('coverage'))output.text+=`\nChainage coverage: ${(d.cov.covered/1000).toFixed(2)} of ${(d.cov.total/1000).toFixed(2)} km (100 m bins).`;
        output.text+='\nRain days in selected source reports: '+d.rain+'. Recorded weather does not establish delay.';
      }else if(E.kind==='photos'){
        const read=photoReader(picked,getFull,{signal,onProgress:say});output.text=`Batch ${E.batchIndex+1} of ${batches.length} · photos ${batch.start+1}–${batch.end} of ${batch.total}\n\n`+picked.map((r,i)=>photoCaption(r,batch.start+i,fields())).join('\n\n');
        try{for(let i=0;i<picked.length;i++){say(`Preparing photo ${batch.start+i+1} of ${allPicked.length}…`);await yieldJob(signal);const r=picked[i],im=(await read(r.report,[r.item])).get(r.item.no);if(fmt==='original'){const blob=await(await fetch(im.url)).blob();output.files.push({name:`Photo ${String(batch.start+i+1).padStart(4,'0')} ${r.report.ref.replace(/[\\/:*?"<>|]/g,'-')}_photo${r.item.no}.jpg`,blob});output.images.push({img:{url:im.url,w:im.w,h:im.h},blob,original:true});}else output.images.push(...await photoSheet(r,im,batch.start+i,{fields:fields(),table:fmt==='table'}));}}finally{read.clear();}
        if(fmt==='original')output.originalRecords=picked;
      }else{
        const activePhotos=section.includes('photos')?picked:[];
        output.model=focusedModel(records,E.scope,S.settings,{title:E.title,sections:section,photoKeys:activePhotos.map(r=>r.key),fields:fields()});
        output.photoProvider=getFull;output.pdf=await renderPdf(output.model,{getFull,onProgress:say,signal,strictPhotos:true});output.files=[{name:output.pdf.name,blob:output.pdf.blob}];
      }
      if(!output.files.length)output.files=output.images.map((p,i)=>({name:`${output.name} page ${i+1}.png`,blob:p.blob}));
      checkJob(signal);if(E.job!==job||S.tab!=='share')return;E.output=output;drawOutput();say('Preview ready. Review the scope, records and captions before sharing.');
    }catch(e){if(E.job===job)msg.textContent=e.message||String(e);}finally{if(E.job===job){E.busy=false;if(button.isConnected){v.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=false);button.disabled=false;$('#evCancel').hidden=true;}}}
  }
  function recordExport(file,destination='(downloaded)',subject=file.name){S.ISS?.record({kind:'Share',type:'Selected evidence',subject,to:destination},file);}
  async function pdfForOutput({signal,onProgress}={}){const out=E.output;checkJob(signal);if(out.pdf)return out.pdf;const {jsPDF}=await loadPdfLibs(),doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});let page=0;for(let i=0;i<out.images.length;i++){onProgress?.(`Preparing PDF photo/page ${i+1} of ${out.images.length}…`);await yieldJob(signal);const pages=out.originalRecords?await photoSheet(out.originalRecords[i],out.images[i].img,(out.batch?.start||0)+i,{fields:out.captionFields,table:true}):[out.images[i]];for(const p of pages){if(page++)doc.addPage();await addImagePages(doc,p.img,{minWidth:180});}}await yieldJob(signal);if(E.output!==out)throw Error('Selection changed. Prepare a new preview.');out.pdf={name:out.name+'.pdf',blob:doc.output('blob')};return out.pdf;}
  async function exportJob(out,task){
    if(E.busy)return;E.busy=true;const job=++E.job,controller=E.controller=new AbortController(),signal=controller.signal,v=$('#view'),cancel=$('#evCancel'),message=$('#evShareStatus');
    const say=t=>{if(E.job!==job||E.output!==out||S.tab!=='share')controller.abort();checkJob(signal);message.textContent=t;};
    v.querySelectorAll('input,select,textarea,button').forEach(e=>e.disabled=true);cancel.hidden=false;cancel.disabled=false;
    try{const file=await task({signal,onProgress:say});say('File ready.');await yieldJob(signal);save(file);recordExport(file);}
    catch(e){if(E.job===job)message.textContent=e.message||String(e);}
    finally{if(E.job===job){E.busy=false;if(cancel.isConnected){v.querySelectorAll('input,select,textarea,button').forEach(e=>e.disabled=false);cancel.hidden=true;}}}
  }
  function drawOutput(){
    const out=E.output,root=$('#evOutput');if(!out||!root)return;root.innerHTML=`<h3>Prepared output</h3><p class="sub">${out.files.length} files prepared. Every caption identifies its source. Original photo sharing keeps numbered captions in this message.</p>${out.images.map((p,i)=>`<p>Page / photo ${i+1}</p><img src="${p.img.url}" alt="Prepared evidence ${i+1}" style="width:100%;max-height:1000px;object-fit:contain;background:#fff;border:1px solid var(--line)">`).join('')}${out.model?`<p>${esc(out.pdf.name)} · ${out.pdf.pages} PDF pages</p><iframe title="Focused report preview" class="pdfv" id="evPDF"></iframe>`:''}<label class="fld">Editable message<textarea id="evCaption" rows="8">${esc(out.text)}</textarea></label><label class="fld">WhatsApp number (optional)<input id="evPhone" value="${esc(S.settings.waTo||'')}"></label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" id="evDownload">Download files</button><button class="btn" id="evPDFDownload">Download PDF</button>${out.model?'<button class="btn" id="evWord">Download Word</button>':''}<button class="btn" id="evCopy">Copy captions</button><button class="btn pri" id="evWhatsApp">Share via WhatsApp</button></div><p class="sub" id="evShareStatus" role="status"></p>`;
    if(out.model){out.previewURL=URL.createObjectURL(out.pdf.blob);$('#evPDF').src=out.previewURL;}
    const parts=photoBatches(out.files),controls=document.createElement('div');controls.className='frm';controls.innerHTML=`<p class="sub">${out.batch?`Photo batch ${out.batch.index+1} of ${out.batch.count}: photos ${out.batch.start+1}–${out.batch.end} of ${out.batch.total}. `:''}${out.batch&&out.batch.count>1?'Choose another batch above or use the next-batch button. ':''}PDF download includes the entire prepared output.</p>${parts.length>1?`<label class="fld">Attachment part for individual downloads / WhatsApp<select id="evAttachments">${parts.map((p,i)=>`<option value="${i}">Part ${i+1} of ${parts.length}: files ${p.start+1}–${p.end} of ${p.total}</option>`).join('')}</select></label>`:''}${out.batch&&out.batch.index+1<out.batch.count?'<button class="btn" id="evNextBatch">Prepare next photo batch</button>':''}`;root.prepend(controls);
    const part=()=>parts[+($('#evAttachments')?.value||0)],attachments=()=>part().records;
    $('#evNextBatch')&&($('#evNextBatch').onclick=()=>{E.batchIndex=out.batch.index+1;$('#evBatch').value=E.batchIndex;prepare($('#view'));});
    $('#evDownload').onclick=()=>attachments().forEach((f,i)=>setTimeout(()=>{if(E.output===out){save(f);recordExport(f);}},i*350));
    $('#evPDFDownload').onclick=()=>exportJob(out,options=>pdfForOutput(options));
    $('#evWord')&&($('#evWord').onclick=()=>exportJob(out,options=>renderDocx(out.model,{getFull:out.photoProvider,...options,strictPhotos:true})));
    $('#evCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('#evCaption').value);$('#evShareStatus').textContent='Captions copied.';}catch(_) {$('#evShareStatus').textContent='Select and copy the caption text manually.';}};
    $('#evWhatsApp').onclick=async()=>{const b=$('#evWhatsApp'),files=attachments(),p=part(),status=$('#evShareStatus'),text=(parts.length>1?`Attachment part ${+($('#evAttachments')?.value||0)+1} of ${parts.length} · files ${p.start+1}–${p.end}\n\n`:'')+$('#evCaption').value;b.disabled=true;try{S.settings.waTo=$('#evPhone').value;saveLS();const res=await sendWhatsApp({text,files,phone:S.settings.waTo});status.textContent=res.msg+' Delivery is not verified by SiteBoard.';if(res.mode!=='cancelled')for(const f of files)recordExport(f,res.mode==='manual'?'(prepared for manual WhatsApp attachment)':'(passed to system share)');}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};
  }
  return {open,vEvidence,state:E,pdfForOutput};
}
