// Messages: WhatsApp comments / follow-ups with attachments, and the internal memo designer.
import * as A from './analysis.js';
import { PROJECT, VERSION } from './config.js';
import { esc } from './charts.js';
import { T, hex, clean } from './theme.js';
import { newDoc, band, frame, PG, CW } from './render-pdf.js';
import { fileIndex } from './scanner.js';
import { getProfile, POSITIONS } from './workspace.js';
import { getFull } from './photos.js';

export const TYPES=[
  ['Monitoring','Monitoring','Please continue to monitor and report back.'],
  ['Observation','Observation','Observation noted on site:'],
  ['Action needed','ACTION NEEDED','Please take action on the following and confirm once done:'],
  ['Follow-up','Follow-up','Follow-up on the earlier matter:'],
  ['General','Note','']];
const PRI=['Normal','High','Urgent'];
const MIME={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const mime=(n)=>MIME[(n.split('.').pop()||'').toLowerCase()]||'application/octet-stream';
const kb=(n)=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' KB';

export function openPdf(report){
  const f=fileIndex.get(report.path);
  if(!f){ alert('The PDF file is not available in memory. Reconnect the reports folder and try again.'); return; }
  const url=URL.createObjectURL(f); window.open(url,'_blank'); setTimeout(()=>URL.revokeObjectURL(url),120000);
}
function download(name,blob){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); }
async function copy(t){ try{ await navigator.clipboard.writeText(t); return true; }catch(_){ return false; } }

// Send text (+ files) to WhatsApp. Web pages cannot hand a file to WhatsApp directly:
// 1) phones / some desktops: the system share sheet carries the file, 2) otherwise the file is downloaded and attached manually.
export async function sendWhatsApp({text,files=[],phone=''}){
  const fl=files.map(f=>new File([f.blob],f.name,{type:f.blob.type||mime(f.name)}));
  if(fl.length && navigator.canShare && navigator.canShare({files:fl})){
    try{ await navigator.share({files:fl,text}); return {mode:'shared',msg:'Shared. Choose WhatsApp in the share sheet.'}; }catch(e){ if(e&&e.name==='AbortError') return {mode:'cancelled',msg:'Cancelled.'}; }
  }
  const num=(phone||'').replace(/\D/g,'');
  const url=`https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  if(files.length){ files.forEach((f,i)=>setTimeout(()=>download(f.name,f.blob),i*350)); const ok=await copy(text);
    window.open(url,'_blank');
    return {mode:'manual',msg:`WhatsApp opened. This browser cannot pass files to WhatsApp, so ${files.length>1?files.length+' files were':'the file was'} downloaded: in WhatsApp press the paperclip, choose Document, and select ${files.length>1?'them':'it'} from your Downloads folder. ${ok?'The message text is also copied (paste with Ctrl+V if it is empty).':''}`}; }
  window.open(url,'_blank'); return {mode:'text',msg:'WhatsApp opened with your message.'};
}

export function makeMessages(ctx){
  const { S, $, drawer, closeDrawer, saveLS, refLink, wireCommon, openReport, ISS } = ctx;
  const P=()=>({...PROJECT,...(S.settings.project||{})});
  const me=()=>{ const g=S.settings.signoff||{}, p=getProfile(); const pos=(POSITIONS.find(x=>x[0]===p.position)||[])[1]||''; return {name:p.name||g.preparedName||'',title:p.title||(p.name?pos:'')||g.preparedTitle||''}; };
  const log=()=>ISS.list().filter(e=>e.kind==='Message');
  const addLog=(e)=>ISS.add({...e,kind:'Message'});

  function buildText(f){
    const t=TYPES.find(x=>x[0]===f.type)||TYPES[4]; const p=P(); const m=me();
    const L=[]; L.push(`*${t[1].toUpperCase()}${f.priority&&f.priority!=='Normal'?' – '+f.priority.toUpperCase():''}*  |  ${p.subtitle||p.title}`);
    if(f.ref) L.push(`Ref: ${f.ref}`); if(f.location) L.push(`Location: ${f.location}`); if(f.date) L.push(`Date: ${A.fmtDate(f.date)}`); if(f.due) L.push(`Reply / action by: ${A.fmtDate(f.due)}`);
    L.push('',(f.body||'').trim()); L.push('');
    L.push(`— ${m.name||'SiteBoard user'}${m.title?', '+m.title:''}${p.consultant?' ('+p.consultant+')':''}`); L.push('_Sent via SiteBoard_');
    return L.join('\n').replace(/\n{3,}/g,'\n\n');
  }

  // ---------------------------------------------------------------- compose drawer
  function compose(pre={}){
    const f={type:pre.type||'General',priority:pre.priority||'Normal',ref:pre.ref||'',location:pre.location||'',date:pre.date||'',due:pre.due||'',body:pre.body||'',phone:S.settings.waTo||''};
    if(!pre.body){ const t=TYPES.find(x=>x[0]===f.type); f.body=t?t[2]:''; }
    const att=(pre.attach||[]).map(a=>({...a})); const photos=pre.photos||[]; const usePh=new Set(); const pdfRep=pre.pdf||null; let usePdf=false;
    const draw=()=>{
      drawer(`<h3>${esc(pre.title||'Message via WhatsApp')}</h3><p class="sub">Write the message, add attachments, then send. The text uses WhatsApp formatting (bold, line breaks).</p>
      <div class="frm"><label class="fld">Type<select id="mt">${TYPES.map(([k])=>`<option ${f.type===k?'selected':''}>${k}</option>`).join('')}</select></label>
      <label class="fld">Priority<select id="mp">${PRI.map(k=>`<option ${f.priority===k?'selected':''}>${k}</option>`).join('')}</select></label>
      <label class="fld">Reference<input id="mr" value="${esc(f.ref)}" placeholder="report / structure / RFI"></label>
      <label class="fld">Location<input id="ml" value="${esc(f.location)}" placeholder="CH / structure"></label>
      <label class="fld">Date of site matter<input type="date" id="md" value="${f.date}"></label>
      <label class="fld">Reply / action by<input type="date" id="mu" value="${f.due}"></label></div>
      <label class="fld" style="margin-top:10px">Your comment<textarea id="mb" rows="5" style="width:100%" placeholder="Write the comment, instruction or question…">${esc(f.body)}</textarea></label>
      <div style="margin-top:10px"><b>Attachments</b>
        ${photos.map((p,i)=>`<label style="display:block;margin:4px 0"><input type="checkbox" data-ph="${i}" ${usePh.has(i)?'checked':''}> Photo ${String(p.item.no).padStart(2,'0')} – ${esc(p.item.activity)} (full resolution)</label>`).join('')}
        ${pdfRep?`<label style="display:block;margin:4px 0"><input type="checkbox" id="mpdf" ${usePdf?'checked':''}> The original SDR report PDF (${esc(pdfRep.ref)})</label>`:''}
        ${att.map((a,i)=>`<div class="sub" style="margin:4px 0">${esc(a.name)} · ${kb(a.blob.size)} <button class="btn sm" data-rm="${i}">Remove</button></div>`).join('')}
        <input type="file" id="mf" multiple style="display:none"><button class="btn sm" id="mfb" style="margin-top:6px">Add file…</button></div>
      <label class="fld" style="margin-top:10px">WhatsApp number (optional – leave empty to pick a contact or group in WhatsApp)<input id="mn" value="${esc(f.phone)}" placeholder="601XXXXXXXX (country code, no +)"></label>
      <label class="fld" style="margin-top:10px">Final message (editable)<textarea id="mx" rows="9" style="width:100%;font-family:var(--mono,monospace);font-size:12.5px">${esc(buildText(f))}</textarea></label>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center"><button class="btn pri" id="ms">Send via WhatsApp</button><button class="btn" id="mcp">Copy text</button><span class="sub" id="mmsg" style="margin:0;flex:1 1 220px"></span></div>`);
      const sync=(rebuild=true)=>{ f.type=$('#mt').value; f.priority=$('#mp').value; f.ref=$('#mr').value; f.location=$('#ml').value; f.date=$('#md').value; f.due=$('#mu').value; f.body=$('#mb').value; f.phone=$('#mn').value; if(rebuild&&!manual) $('#mx').value=buildText(f); };
      let manual=false; $('#mx').oninput=()=>{ manual=true; };
      for(const id of ['#mr','#ml','#md','#mu','#mb','#mp']){ $(id).oninput=$(id).onchange=()=>sync(); }
      $('#mn').oninput=()=>{ f.phone=$('#mn').value; };
      $('#mt').onchange=()=>{ const prev=TYPES.find(x=>x[0]===f.type), nt=TYPES.find(x=>x[0]===$('#mt').value); if(!$('#mb').value.trim()||$('#mb').value===(prev&&prev[2])) $('#mb').value=nt[2]; sync(); };
      document.querySelectorAll('#drawer [data-ph]').forEach(c=>c.onchange=()=>{ c.checked?usePh.add(+c.dataset.ph):usePh.delete(+c.dataset.ph); });
      const pc=$('#mpdf'); if(pc) pc.onchange=()=>{ usePdf=pc.checked; };
      document.querySelectorAll('#drawer [data-rm]').forEach(b=>b.onclick=()=>{ sync(false); att.splice(+b.dataset.rm,1); draw(); });
      $('#mfb').onclick=()=>$('#mf').click();
      $('#mf').onchange=(e)=>{ sync(false); for(const fl of e.target.files) att.push({name:fl.name,blob:fl}); draw(); };
      $('#mcp').onclick=async()=>{ $('#mmsg').textContent=(await copy($('#mx').value))?'Copied.':'Could not copy – select the text and press Ctrl+C.'; };
      $('#ms').onclick=async()=>{
        sync(false); const btn=$('#ms'); btn.disabled=true; const msg=$('#mmsg'); const files=att.map(a=>({name:a.name,blob:a.blob}));
        try{
          for(const i of usePh){ const p=photos[i]; msg.textContent='Preparing photo…'; const m=await getFull(p.report,[p.item]); const v=m.get(p.item.no);
            if(v&&v.url){ const b=await (await fetch(v.url)).blob(); files.push({name:`${p.report.ref}_photo${String(p.item.no).padStart(2,'0')}.jpg`,blob:b}); } }
          if(usePdf&&pdfRep){ const fl=fileIndex.get(pdfRep.path); if(fl) files.push({name:pdfRep.path.split('/').pop(),blob:fl}); }
          S.settings.waTo=f.phone; saveLS();
          const r=await sendWhatsApp({text:$('#mx').value,files,phone:f.phone}); msg.textContent=r.msg;
          if(r.mode!=='cancelled'&&pre.memo) await ISS.record({kind:'Memo',no:pre.memo.no,subject:pre.memo.subject,to:pre.memo.to,type:'WhatsApp'},{name:files[0].name,blob:files[0].blob}); else if(r.mode!=='cancelled') addLog({kind:'message',type:f.type,priority:f.priority,subject:pre.subject||f.ref||f.location||f.body.slice(0,60),to:f.phone||'(chosen in WhatsApp)',files:files.map(x=>x.name),text:$('#mx').value});
        }catch(e){ console.error(e); msg.textContent='Could not send: '+e.message; }
        btn.disabled=false; };
    };
    draw();
  }

  function composeForItem(report,item){
    const p=item; compose({title:'Comment on report item',type:'Observation',ref:`${report.ref} · #${String(p.no).padStart(2,'0')}`,location:[p.location==='-'?'':p.location,p.structure].filter(Boolean).join(' · '),date:report.date,
      body:`${p.activity}${p.status?' ('+p.status+')':''}\n${p.remarks?'Site remark: '+p.remarks+'\n':''}\nComment: `,photos:p.photo?[{report,item}]:[],pdf:report});
  }
  function composeForReport(report){
    compose({title:'Comment on report',type:'General',ref:report.ref,date:report.date,body:`Report by ${report.reporter}${report.role?' ('+report.role+')':''}, ${A.fmtDate(report.date,true)}, ${report.items.length} items.\n\nComment: `,pdf:report});
  }

  // ---------------------------------------------------------------- memo
  function memoDefaults(){ const m=me();
    return {no:ISS.nextMemoNo(),date:A.iso(new Date()),to:'All site personnel',from:`${m.name}${m.title?', '+m.title:''}`,cc:'',subject:'',kind:'For information',body:'',actions:'',att:[]}; }

  async function renderMemo(m){
    const doc=await newDoc(); const p=P();
    band(doc,{line1:'Internal memorandum',line2:p.team||p.consultant||'',logo:p.logo,h:36});
    let y=50;
    // kind chip
    const col=m.kind==='Urgent'?'#B2271B':m.kind==='For action'?T.accent:T.navy; doc.setFillColor(...hex(col)); doc.roundedRect(PG.w-PG.mr-34,43,34,7,1.2,1.2,'F'); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(255); doc.text(clean(m.kind.toUpperCase()),PG.w-PG.mr-17,47.7,{align:'center'});
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(...hex(T.navy)); doc.text('MEMO',PG.ml,y); y+=3;
    const rows=[['Memo no.',m.no],['Date',A.fmtDate(m.date)],['To',m.to],['From',m.from]]; if(m.cc) rows.push(['Cc',m.cc]);
    doc.autoTable({startY:y+2,body:rows.map(r=>r.map(clean)),theme:'plain',margin:{left:PG.ml,right:PG.mr},styles:{fontSize:10,cellPadding:{top:1,bottom:1,left:0,right:3},textColor:hex(T.ink)},columnStyles:{0:{cellWidth:28,textColor:hex(T.muted),fontStyle:'bold'}}});
    y=doc.lastAutoTable.finalY+3; doc.setDrawColor(...hex(T.accent)); doc.setLineWidth(0.7); doc.line(PG.ml,y,PG.w-PG.mr,y); y+=8;
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...hex(T.navy)); const sl=doc.splitTextToSize(clean('Subject: '+m.subject),CW); doc.text(sl,PG.ml,y); y+=sl.length*6+3;
    const room=(h)=>{ if(y+h>PG.h-17){ doc.addPage(); y=PG.mt; } };
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...hex(T.ink));
    for(const raw of m.body.split('\n')){
      const line=raw.replace(/\s+$/,''); if(!line.trim()){ y+=2.2; continue; }
      const b=/^\s*[-•*]\s+/.test(line), num=line.match(/^\s*(\d+[.)])\s+/);
      const txt=clean(line.replace(/^\s*[-•*]\s+/,'').replace(/^\s*\d+[.)]\s+/,'')); const ind=(b||num)?6:0; const ls=doc.splitTextToSize(txt,CW-ind);
      room(ls.length*4.6+1);
      if(b){ doc.setFillColor(...hex(T.accent)); doc.circle(PG.ml+2,y-1.2,0.8,'F'); } if(num) { doc.setFont('helvetica','bold'); doc.text(num[1],PG.ml,y); doc.setFont('helvetica','normal'); }
      ls.forEach((l,i)=>{ doc.text(l,PG.ml+ind,y); y+=4.6; }); y+=1; }
    const acts=(m.actions||'').split('\n').map(s=>s.trim()).filter(Boolean).map(s=>s.split('|').map(x=>x.trim()));
    if(acts.length){ room(24); y+=3; doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...hex(T.accent)); doc.text('ACTION REQUIRED',PG.ml,y); y+=2;
      doc.autoTable({startY:y,head:[['No.','Action','By whom','When']],body:acts.map((a,i)=>[String(i+1),clean(a[0]||''),clean(a[1]||''),clean(a[2]||'')]),theme:'grid',margin:{left:PG.ml,right:PG.mr,top:PG.mt,bottom:PG.mb},styles:{fontSize:9,cellPadding:1.2,lineColor:hex(T.line),lineWidth:0.15},headStyles:{fillColor:hex(T.navy),textColor:255},columnStyles:{0:{cellWidth:10},2:{cellWidth:34},3:{cellWidth:28}},rowPageBreak:'avoid'}); y=doc.lastAutoTable.finalY+4; }
    if(m.att.length){ room(14); y+=2; doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(...hex(T.navy)); doc.text('Attachments',PG.ml,y); y+=4.5; doc.setFont('helvetica','normal'); doc.setTextColor(...hex(T.ink)); for(const a of m.att){ room(5); doc.text(clean('• '+a.name),PG.ml+2,y); y+=4.5; } }
    room(19); y+=4; doc.setDrawColor(...hex(T.ink)); doc.setLineWidth(0.3); doc.line(PG.ml,y+7,PG.ml+60,y+7); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...hex(T.ink)); doc.text(clean(m.from.split(',')[0]||''),PG.ml,y+11.5);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...hex(T.muted)); doc.text(clean(m.from.split(',').slice(1).join(',').trim()),PG.ml,y+15.5);
    frame(doc,{left:`${p.title} — Internal memo`,right:m.no,footLeft:`Generated by SiteBoard v${VERSION} · ${A.fmtDate(m.date)}`,skipFirst:false,noHeaderFirst:true});
    doc.setProperties({title:`${m.no} ${m.subject}`,creator:'SiteBoard'});
    return {blob:doc.output('blob'),name:`${m.no.replace(/[\\/]/g,'-')} ${m.subject.replace(/[\\/:*?"<>|]+/g,'').slice(0,60)}.pdf`.trim(),pages:doc.getNumberOfPages()};
  }
  function memoText(m){
    const p=P(); const L=['*INTERNAL MEMO*','━━━━━━━━━━━━━━━━',`*${m.subject}*`,`Ref: ${m.no}  |  ${A.fmtDate(m.date)}`,`To: ${m.to}`]; if(m.cc) L.push(`Cc: ${m.cc}`); if(m.kind!=='For information') L.push(`Status: *${m.kind.toUpperCase()}*`);
    L.push('━━━━━━━━━━━━━━━━','');
    for(const raw of m.body.split('\n')){ const t=raw.trim(); L.push(/^[-*•]\s+/.test(t)?'• '+t.replace(/^[-*•]\s+/,''):t); }
    const acts=(m.actions||'').split('\n').map(s=>s.trim()).filter(Boolean).map(s=>s.split('|').map(x=>x.trim()));
    if(acts.length){ L.push('','*Action required*'); acts.forEach((a,i)=>L.push(`${i+1}. ${a[0]||''}${a[1]?' – '+a[1]:''}${a[2]?' ('+a[2]+')':''}`)); }
    L.push('','━━━━━━━━━━━━━━━━',`${m.from}`,`_${p.consultant||p.team||'WP12'}_`); if(m.att.length||true) L.push('_Full memo attached (PDF)._');
    return L.join('\n').replace(/\n{3,}/g,'\n\n');
  }

  const useNo=(no)=>ISS.useNo(no);
  // ---------------------------------------------------------------- Messages tab
  function vMessages(v){
    const M=S.memo=S.memo||memoDefaults();
    v.innerHTML=`<div class="grid g2"><div class="card"><h2>WhatsApp message</h2><div class="sub">Comment on a report, raise an observation, ask for action or follow up. Attach a file, a photo or the report. Start from a report item (Report files, Photos, Observations) to fill the details automatically.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${TYPES.map(([k])=>`<button class="btn" data-q="${k}">${k}</button>`).join('')}</div>
      <p class="sub" style="margin-top:14px">Tip: on a phone the file goes straight into WhatsApp. On a computer WhatsApp cannot receive files from a web page, so SiteBoard downloads the file and opens WhatsApp for you to attach it with the paperclip.</p></div>
     <div class="card"><h2>Internal memo</h2><div class="sub">Design a memo for the team: it becomes a formatted A4 PDF and a WhatsApp announcement.</div>
      <div class="frm"><label class="fld">Memo no.<input data-m="no" value="${esc(M.no)}"></label><label class="fld">Date<input type="date" data-m="date" value="${M.date}"></label>
       <label class="fld">To<input data-m="to" value="${esc(M.to)}"></label><label class="fld">From<input data-m="from" value="${esc(M.from)}"></label>
       <label class="fld">Cc<input data-m="cc" value="${esc(M.cc)}"></label><label class="fld">Status<select data-m="kind">${['For information','For action','Urgent'].map(k=>`<option ${M.kind===k?'selected':''}>${k}</option>`).join('')}</select></label></div>
      <label class="fld" style="margin-top:8px">Subject<input data-m="subject" value="${esc(M.subject)}" style="width:100%"></label>
      <label class="fld" style="margin-top:8px">Memo text <span class="sub">(start a line with “-” for a bullet)</span><textarea data-m="body" rows="8" style="width:100%">${esc(M.body)}</textarea></label>
      <label class="fld" style="margin-top:8px">Actions <span class="sub">(one per line: action | by whom | when)</span><textarea data-m="actions" rows="3" style="width:100%">${esc(M.actions)}</textarea></label>
      <div style="margin-top:8px"><b>Attachments</b> <span class="sub">(sent together with the memo)</span>${M.att.map((a,i)=>`<div class="sub" style="margin:3px 0">${esc(a.name)} · ${kb(a.blob.size)} <button class="btn sm" data-rm="${i}">Remove</button></div>`).join('')}<br><input type="file" id="memoF" multiple style="display:none"><button class="btn sm" id="memoFb">Add file…</button></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center"><button class="btn pri" id="memoPrev">Preview memo</button><button class="btn" id="memoDl">Download PDF</button><button class="btn" id="memoWa">Send via WhatsApp…</button><button class="btn" id="memoNew">New memo</button><span class="sub" id="memoMsg" style="margin:0"></span></div>
      <div id="memoView"></div></div></div>
     <div class="card" style="margin-top:12px"><h2>Recent messages</h2><div class="sub">The latest messages sent. The full list, with memos and reports, is in the <b>Issued register</b>.</div>
      <div class="scroll"><table class="t"><thead><tr><th>When</th><th>Type</th><th>Subject / reference</th><th>To</th><th>Files</th><th></th></tr></thead><tbody>
      ${log().slice(0,12).map(e=>`<tr><td>${new Date(e.t).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td><td>${esc(e.type||e.kind)}${e.priority&&e.priority!=='Normal'?` <span class="badge warn">${esc(e.priority)}</span>`:''}</td><td>${esc(e.subject||'')}</td><td>${esc(e.to||'')}</td><td>${(e.files||[]).map(esc).join('<br>')||'–'}</td><td><button class="btn sm" data-re="${e.id}">Resend…</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">Nothing sent yet.</td></tr>'}</tbody></table></div></div>`;
    v.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>compose({type:b.dataset.q,title:b.dataset.q+' – WhatsApp message'}));
    v.querySelectorAll('[data-m]').forEach(i=>i.oninput=i.onchange=()=>{ M[i.dataset.m]=i.value; });
    v.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{ M.att.splice(+b.dataset.rm,1); vMessages(v); });
    $('#memoFb').onclick=()=>$('#memoF').click(); $('#memoF').onchange=(e)=>{ for(const f of e.target.files) M.att.push({name:f.name,blob:f}); vMessages(v); };
    v.querySelectorAll('[data-re]').forEach(b=>b.onclick=()=>{ const e=log().find(x=>x.id===b.dataset.re); compose({title:'Resend message',type:e.type||'General',body:(e.text||'').split('\n').slice(2).join('\n').replace(/\n— [\s\S]*$/,'').trim()}); });
    const need=()=>{ if(!M.subject.trim()||!M.body.trim()){ $('#memoMsg').textContent='Enter a subject and the memo text first.'; return false; } return true; };
    const make=async()=>{ if(!need()) return null; $('#memoMsg').textContent='Building memo…'; const r=await renderMemo(M); S.memoOut&&URL.revokeObjectURL(S.memoOut.url); S.memoOut={...r,url:URL.createObjectURL(r.blob)}; $('#memoMsg').textContent=`${r.pages} page${r.pages>1?'s':''}`; return S.memoOut; };
    $('#memoNew').onclick=()=>{ S.memo=null; vMessages(v); };
    $('#memoPrev').onclick=async()=>{ try{ const o=await make(); if(o) $('#memoView').innerHTML=`<iframe class="pdfv" title="Memo preview" src="${o.url}#view=FitH"></iframe><div class="sub"><a href="${o.url}" target="_blank" rel="noopener">Open in new tab</a> if the preview is blank.</div>`; }catch(e){ console.error(e); $('#memoMsg').textContent='Could not build memo: '+e.message; } };
    $('#memoDl').onclick=async()=>{ try{ const o=await make(); if(o){ download(o.name,o.blob); useNo(M.no); const dup=ISS.noTaken(M.no); await ISS.record({kind:'Memo',no:M.no,subject:M.subject,to:M.to,type:'PDF'},{name:o.name,blob:o.blob}); $('#memoMsg').textContent=dup?'Saved again in the register (same number).':'Saved in the Issued register.'; } }catch(e){ $('#memoMsg').textContent='Could not build memo: '+e.message; } };
    $('#memoWa').onclick=async()=>{ try{ const o=await make(); if(!o) return;
      compose({title:'Send memo via WhatsApp',type:'General',subject:'Memo: '+M.subject,attach:[{name:o.name,blob:o.blob},...M.att],memo:M,body:'',_text:memoText(M)}); 
      // override the composed text with the formatted announcement
      setTimeout(()=>{ const x=$('#mx'); if(x){ x.value=memoText(M); x.dispatchEvent(new Event('input')); } const b=$('#mb'); if(b) b.closest('label').style.display='none'; const sel=['#mt','#mp','#mr','#ml','#md','#mu']; sel.forEach(s=>{ const e=$(s); if(e) e.closest('label').style.display='none'; }); },0);
      useNo(M.no);
    }catch(e){ $('#memoMsg').textContent='Could not build memo: '+e.message; } };
  }
  const attachToMemo=(f)=>{ const M=S.memo=S.memo||memoDefaults(); M.att.push({name:f.name,blob:f.blob}); };
  return { compose, composeForItem, composeForReport, vMessages, openPdf, logSent:addLog, attachToMemo };
}
