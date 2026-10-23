// Share / save the submission matrix and the overview as an image or PDF, with a WhatsApp description.
import * as A from './analysis.js';
import { PROJECT, CAT_ORDER, CAT_COLORS, VERSION } from './config.js';
import { esc, setPrint, catColor, dayColumns, hbar, strip } from './charts.js';
import { T, hex, clean, rasterize, loadPdfLibs } from './theme.js';
import { sendWhatsApp } from './messages.js';

const X=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct=(x)=>x==null?'–':Math.round(x*100)+'%';
const nest=(svg,x,y,w)=>{ const m=svg.match(/<svg viewBox="0 0 ([\d.]+) ([\d.]+)" width="100%"/); const vw=+m[1], vh=+m[2], h=w*vh/vw;
  return {h, s:svg.replace(/<svg viewBox="[^"]+" width="100%"/,`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}"`)}; };

export function makeSnapshot(ctx){
  const { S, $, drawer, resolveRange, inRange, MS } = ctx;
  const P=()=>({...PROJECT,...(S.settings.project||{})});
  const today=()=>A.iso(new Date());

  function header(w,title,sub){
    const p=P();
    return `<rect width="${w}" height="64" fill="${T.navy}"/><rect y="64" width="${w}" height="4" fill="${T.accent2}"/>
     <text x="24" y="28" font-size="12" font-weight="700" fill="#F2B79B" letter-spacing="1.5">${X((p.consultant||'SITEBOARD').toUpperCase())}</text>
     <text x="24" y="50" font-size="17" font-weight="700" fill="#fff">${X(title)}</text>
     <text x="${w-24}" y="30" font-size="12" fill="#fff" text-anchor="end">${X(p.subtitle||p.title)}</text><text x="${w-24}" y="50" font-size="12" fill="#C9D3DA" text-anchor="end">${X(sub)}</text>`;
  }
  function data(){
    const {from,to}=resolveRange(); const t=today(); const reps=inRange();
    let days=A.dateRange(from,to); if(days.length>62) days=days.slice(-62);
    const mx=A.matrix(S.reports.filter(r=>r.date>=days[0]&&r.date<=days.at(-1)),days,S.settings,t);
    return {from:days[0],to:days.at(-1),t,reps,days,mx};
  }

  // ---------------------------------------------------------------- matrix image
  function matrixSvg(d){
    const {days,mx}=d; const cw=days.length<=16?36:days.length<=31?27:16, rh=26, nameW=230, totW=96; const W=nameW+days.length*cw+totW+48;
    const top=68+60; const rows=mx.rows; const H=top+(rows.length+2)*rh+70;
    let s=`<svg viewBox="0 0 ${W} ${H}" width="100%"><rect width="${W}" height="${H}" fill="#fff"/>`+header(W,'Submission matrix',`${A.fmtDate(d.from)} – ${A.fmtDate(d.to)}`);
    s+=`<text x="24" y="96" font-size="13" fill="${T.muted}">Overall compliance</text><text x="160" y="97" font-size="20" font-weight="700" fill="${mx.rate==null?T.ink:mx.rate>=.9?'#1b7f4b':mx.rate>=.7?'#b36b00':'#c23a2e'}">${pct(mx.rate)}</text><text x="220" y="96" font-size="13" fill="${T.muted}">${mx.exp?`${mx.got} of ${mx.exp} expected daily reports`:'no expected reports'}</text>`;
    const x0=24+nameW;
    days.forEach((dd,i)=>{ const x=x0+i*cw; const off=!A.isWorkDay(dd,S.settings);
      s+=`<text x="${x+cw/2}" y="${top-14}" font-size="${cw<20?9:11}" text-anchor="middle" fill="${off?'#97A5AF':T.ink}" font-weight="600">${A.fromIso(dd).getDate()}</text><text x="${x+cw/2}" y="${top-3}" font-size="9" text-anchor="middle" fill="${T.muted}">${A.DOW[A.dow(dd)].slice(0,2)}</text>`; });
    s+=`<text x="${x0+days.length*cw+8}" y="${top-5}" font-size="11" font-weight="600" fill="${T.muted}">Done</text><text x="24" y="${top-5}" font-size="11" font-weight="600" fill="${T.muted}">Personnel</text>`;
    rows.forEach((r,ri)=>{ const y=top+ri*rh; if(ri%2) s+=`<rect x="24" y="${y}" width="${W-48}" height="${rh}" fill="#FAFBFC"/>`;
      s+=`<text x="26" y="${y+17}" font-size="12.5" font-weight="600" fill="${T.ink}">${X((r.p.name||'').slice(0,26))}</text><text x="${24+nameW-8}" y="${y+17}" font-size="10" text-anchor="end" fill="${T.muted}">${X(r.p.role||r.p.code)}${r.p.expected?'':' *'}</text>`;
      r.cells.forEach((c,i)=>{ const n=c.rs.length; const x=x0+i*cw+1.5; let fill=null, txt='', col=T.ink;
        if(n){ fill='#E3F3EA'; txt=n; col='#1b7f4b'; } else if(!c.work){ fill='#EEF1F3'; } else if(!c.past){ } else if(c.ex){ fill='#EEF1F3'; txt='-'; col='#97A5AF'; } else if(r.p.expected){ fill='#FBE4E1'; txt='x'; col='#B2271B'; }
        if(fill) s+=`<rect x="${x}" y="${y+2}" width="${cw-3}" height="${rh-4}" rx="3" fill="${fill}"/>`;
        if(txt!=='') s+=`<text x="${x+(cw-3)/2}" y="${y+17}" font-size="12" font-weight="700" text-anchor="middle" fill="${col}">${txt}</text>`; });
      s+=`<text x="${x0+days.length*cw+8}" y="${y+17}" font-size="11.5" fill="${T.ink}">${r.p.expected?`${r.g}/${r.e} days`:`${r.tot} report${r.tot!==1?'s':''}`}</text>`; });
    const yf=top+rows.length*rh; s+=`<line x1="24" x2="${W-24}" y1="${yf+3}" y2="${yf+3}" stroke="${T.line}"/><text x="${24+nameW-8}" y="${yf+19}" font-size="11" text-anchor="end" fill="${T.muted}">Reports per day</text>`;
    days.forEach((dd,i)=>{ const n=S.reports.filter(r=>r.date===dd).length; if(n) s+=`<text x="${x0+i*cw+cw/2}" y="${yf+19}" font-size="11" text-anchor="middle" fill="${T.ink}">${n}</text>`; });
    const ly=yf+rh+24; const leg=[['#E3F3EA','Report received (number = reports that day)'],['#FBE4E1','No report: expected person, working day (x)'],['#EEF1F3','Non-working day / no report needed (-)'],['#fff','* not expected to report daily']];
    let lx=24; leg.forEach(([c,t])=>{ s+=`<rect x="${lx}" y="${ly-10}" width="12" height="12" rx="2" fill="${c}" stroke="${T.line}"/><text x="${lx+17}" y="${ly}" font-size="11" fill="${T.muted}">${X(t)}</text>`; lx+=t.length*5.6+44; });
    s+=`<text x="24" y="${H-12}" font-size="10" fill="#97A5AF">Generated by SiteBoard v${VERSION} · ${X(A.fmtDate(today()))}</text>`;
    return s+'</svg>';
  }
  function matrixText(d){
    const {mx,days}=d; const p=P(); const miss=[];
    for(const r of mx.rows){ if(!r.p.expected) continue; const md=r.cells.filter(c=>c.work&&c.past&&!c.rs.length&&!c.ex).map(c=>A.fmtShort(c.d)); if(md.length) miss.push([r.p.name,md]); }
    const L=[`*SUBMISSION MATRIX*  |  ${p.subtitle||p.title}`,`Period: ${A.fmtDate(d.from)} – ${A.fmtDate(d.to)}`,`Compliance: *${pct(mx.rate)}*${mx.exp?` (${mx.got} of ${mx.exp} expected daily reports)`:''}`,`Reports received: ${S.reports.filter(r=>r.date>=d.from&&r.date<=d.to).length} from ${mx.rows.length} personnel`];
    if(miss.length){ L.push('','*No report received (expected, working days):*'); miss.slice(0,12).forEach(([n,ds])=>L.push(`• ${n}: ${ds.length} day${ds.length>1?'s':''} (${ds.slice(0,6).join(', ')}${ds.length>6?', …':''})`)); if(miss.length>12) L.push(`… and ${miss.length-12} more`); L.push('','If a report was due please submit it; if none was needed (office work, leave), let the report admin know.'); }
    else L.push('','All expected reports were received for this period.');
    L.push('','Image attached.'); return L.join('\n');
  }

  // ---------------------------------------------------------------- overview image
  function overviewSvg(d){
    setPrint(true);
    try{
      const {reps,days,mx,t}=d; const rows=A.works(A.flatten(reps)); const wx=A.weatherDays(reps); const bins=A.binsFor(rows); const rfi=A.rfiList(rows);
      const wdays=days.filter(x=>A.isWorkDay(x,S.settings)&&x<=t); const cov=new Set(reps.map(r=>r.date)); const wc=wdays.filter(x=>cov.has(x)).length;
      const dayData=new Map(); for(const r of rows){ const q=dayData.get(r.date)||{}; q[r.cat]=(q[r.cat]||0)+1; dayData.set(r.date,q); }
      const used=CAT_ORDER.filter(c=>rows.some(r=>r.cat===c)); const W=1100+48;
      const kp=[[reps.length,'Reports received'],[rows.length,'Work items photographed'],[pct(mx.rate),'Reporting compliance'],[`${wc} / ${wdays.length}`,'Working days with a report'],[(A.coveredLength(bins)/1000).toFixed(1)+' km','Alignment covered'],[wx.filter(w=>w.rain).length,'Rain days']];
      let y=96, s=''; const kw=(W-48-5*10)/6;
      kp.forEach(([v,l],i)=>{ const x=24+i*(kw+10); s+=`<rect x="${x}" y="${y}" width="${kw}" height="64" rx="8" fill="${T.bg}" stroke="${T.line}"/><rect x="${x}" y="${y}" width="4" height="64" fill="${T.accent2}"/><text x="${x+16}" y="${y+30}" font-size="24" font-weight="700" fill="${T.navy}">${X(v)}</text><text x="${x+16}" y="${y+51}" font-size="11" fill="${T.muted}">${X(l)}</text>`; });
      y+=84; s+=`<text x="24" y="${y}" font-size="14" font-weight="700" fill="${T.navy}">Work items photographed per day</text>`; y+=8;
      let n=nest(dayColumns(days,dayData,used,{w:1100,h:210}),24,y,W-48); s+=n.s; y+=n.h+6;
      let lx=24; used.forEach(c=>{ const w=c.length*6+34; if(lx+w>W-24){ lx=24; y+=18; } s+=`<rect x="${lx}" y="${y}" width="11" height="11" rx="2" fill="${(CAT_COLORS[c]||CAT_COLORS.Other)[0]}"/><text x="${lx+16}" y="${y+10}" font-size="11" fill="${T.muted}">${X(c)}</text>`; lx+=w; });
      y+=34; s+=`<text x="24" y="${y}" font-size="14" font-weight="700" fill="${T.navy}">Work items by category</text>`; y+=8;
      n=nest(hbar(A.count(rows,r=>r.cat).map(([c,k])=>({label:c,value:k,color:catColor(c)})),{w:640,labelW:170}),24,y,640); s+=n.s; y+=n.h+18;
      s+=`<text x="24" y="${y}" font-size="14" font-weight="700" fill="${T.navy}">Where works were photographed</text>`; y+=6;
      n=nest(strip(bins,{w:1100}),24,y,W-48); s+=n.s; y+=n.h+30;
      s+=`<text x="24" y="${y}" font-size="10" fill="#97A5AF">Generated by SiteBoard v${VERSION} · ${X(A.fmtDate(today()))}</text>`; const H=y+16;
      return {svg:`<svg viewBox="0 0 ${W} ${H}" width="100%"><rect width="${W}" height="${H}" fill="#fff"/>`+header(W,'Overview',`${A.fmtDate(d.from)} – ${A.fmtDate(d.to)}`)+s+'</svg>', rows, wx, bins, rfi, wc, wdays};
    } finally { setPrint(false); }
  }
  function overviewText(d,o){
    const p=P(); const cats=A.count(o.rows,r=>r.cat).slice(0,4).map(([c,n])=>`${c} ${n}`).join(', ');
    const L=[`*SITE OVERVIEW*  |  ${p.subtitle||p.title}`,`Period: ${A.fmtDate(d.from)} – ${A.fmtDate(d.to)}`,`Reports received: ${d.reps.length} from ${new Set(d.reps.map(r=>r.code)).size} personnel (${o.wc} of ${o.wdays.length} working days covered)`,`Reporting compliance: *${pct(d.mx.rate)}*${d.mx.exp?` (${d.mx.got} of ${d.mx.exp})`:''}`,`Work items photographed: ${o.rows.length}${cats?' – '+cats:''}`,`Alignment covered: ${(A.coveredLength(o.bins)/1000).toFixed(1)} km of 14.81 km`,`Rain days: ${o.wx.filter(w=>w.rain).length}${o.rfi.length?` · RFI referenced: ${o.rfi.length}`:''}`,'','Image attached.'];
    return L.join('\n');
  }

  // ---------------------------------------------------------------- output
  async function build(kind){
    const d=data(); let svg,text;
    if(kind==='overview'){ const o=overviewSvg(d); svg=o.svg; text=overviewText(d,o); } else { svg=matrixSvg(d); text=matrixText(d); }
    const img=await rasterize(svg,2); const blob=await (await fetch(img.url)).blob();
    const nm=`SiteBoard ${kind==='overview'?'overview':'matrix'} ${d.from} to ${d.to}`;
    return {d,img,blob,text,nm};
  }
  async function pdfOf(r,kind){
    const {jsPDF}=await loadPdfLibs(); const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true}); const W=297,H=210;
    const lines=doc.splitTextToSize(clean(r.text.replace(/\*/g,'').replace(/_/g,'')),W-24);
    const th=Math.min(lines.length,9)*3.6+4; const maxH=H-12-th-8; let w=W-20, h=w*r.img.h/r.img.w; if(h>maxH){ h=maxH; w=h*r.img.w/r.img.h; }
    doc.addImage(r.img.url,'PNG',(W-w)/2,8,w,h,undefined,'FAST');
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...hex(T.ink)); doc.text(lines.slice(0,9),12,8+h+7);
    doc.setFontSize(7.5); doc.setTextColor(...hex(T.muted)); doc.text(clean(`Generated by SiteBoard v${VERSION} · ${A.fmtDate(today())}`),12,H-6); doc.setProperties({title:r.nm,creator:'SiteBoard v'+VERSION});
    return doc.output('blob');
  }
  const save=(name,blob)=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); };

  async function open(kind='matrix'){
    drawer(`<h3>Share / save</h3><p class="sub" id="snMsg">Preparing preview…</p>`);
    let r; try{ r=await build(kind); }catch(e){ console.error(e); $('#snMsg').textContent='Could not prepare the image: '+e.message; return; }
    const phone=S.settings.waTo||'';
    drawer(`<h3>Share / save</h3><div class="frm"><label class="fld">Content<select id="snK"><option value="matrix" ${kind==='matrix'?'selected':''}>Submission matrix</option><option value="overview" ${kind==='overview'?'selected':''}>Overview</option></select></label></div>
     <p class="sub">Uses the period chosen at the top of the page (${A.fmtDate(r.d.from)} – ${A.fmtDate(r.d.to)}).</p>
     <img src="${r.img.url}" alt="Preview" style="width:100%;border:1px solid var(--line);border-radius:8px;background:#fff">
     <label class="fld" style="margin-top:10px">Description for WhatsApp (editable)<textarea id="snT" rows="9" style="width:100%;font-family:var(--mono,monospace);font-size:12.5px">${esc(r.text)}</textarea></label>
     <label class="fld" style="margin-top:8px">WhatsApp number (optional)<input id="snN" value="${esc(phone)}" placeholder="601XXXXXXXX (empty = choose in WhatsApp)"></label>
     <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center"><button class="btn pri" id="snW">Send via WhatsApp</button><button class="btn" id="snP">Download image</button><button class="btn" id="snF">Download PDF</button><button class="btn" id="snC">Copy image</button><span class="sub" id="snMsg" style="margin:0;flex:1 1 200px"></span></div>`);
    $('#snK').onchange=(e)=>open(e.target.value);
    $('#snP').onclick=()=>save(r.nm+'.png',r.blob);
    $('#snF').onclick=async()=>{ try{ save(r.nm+'.pdf',await pdfOf(r,kind)); }catch(e){ $('#snMsg').textContent='Could not build PDF: '+e.message; } };
    $('#snC').onclick=async()=>{ try{ await navigator.clipboard.write([new ClipboardItem({'image/png':r.blob})]); $('#snMsg').textContent='Image copied. Paste it into WhatsApp with Ctrl+V.'; }catch(_){ $('#snMsg').textContent='This browser cannot copy images. Use Download image.'; } };
    $('#snW').onclick=async()=>{ const b=$('#snW'); b.disabled=true; const num=$('#snN').value; S.settings.waTo=num; ctx.saveLS();
      try{ const res=await sendWhatsApp({text:$('#snT').value,files:[{name:r.nm+'.png',blob:r.blob}],phone:num}); $('#snMsg').textContent=res.msg;
        if(res.mode!=='cancelled') MS.logSent({kind:'message',type:kind==='overview'?'Overview':'Matrix',subject:`${r.nm}`,to:num||'(chosen in WhatsApp)',files:[r.nm+'.png'],text:$('#snT').value}); }catch(e){ $('#snMsg').textContent='Could not send: '+e.message; }
      b.disabled=false; };
  }
  return { open };
}
