import * as pdfjs from '../vendor/pdf.min.mjs';
import { extractPages, parseReport, decodeEmbedded, applyEmbedded } from '../js/parser.js';

pdfjs.GlobalWorkerOptions.workerSrc='../vendor/pdf.worker.min.mjs';
const q=new URLSearchParams(location.search), src=q.get('src')||'../../../../WP12_CST_WEEKLY_REPORT/CST_Daily_Reports/2026-10/';
const expectedFiles=+(q.get('expectFiles')||0), expectedItems=+(q.get('expectItems')||0);
const status=document.querySelector('#status'), out=document.querySelector('#out');
try{
  const index=await fetch(src); if(!index.ok) throw new Error(`Report folder returned HTTP ${index.status}`);
  const html=await index.text(), dom=new DOMParser().parseFromString(html,'text/html');
  const through=(q.get('through')||'').replace(/-/g,'');
  const urls=[...dom.querySelectorAll('a[href]')].map(a=>new URL(a.getAttribute('href'),new URL(src,location.href))).filter(u=>{if(!/\.pdf$/i.test(u.pathname))return false;const date=(decodeURIComponent(u.pathname).match(/-(\d{8})-\d/)||[])[1];return !through||(date&&date<=through);});
  if(!urls.length) throw new Error('No PDF links were found in the report folder');
  const reports=[],errors=[];
  for(let i=0;i<urls.length;i++){
    const u=urls[i]; status.textContent=`Reading ${i+1}/${urls.length}: ${decodeURIComponent(u.pathname.split('/').at(-1))}`;
    try{
      const res=await fetch(u), data=new Uint8Array(await res.arrayBuffer()), doc=await pdfjs.getDocument({data,isEvalSupported:false}).promise;
      const pages=await extractPages(doc), name=decodeURIComponent(u.pathname.split('/').at(-1));
      const r=parseReport(pages,{name,path:name,size:data.byteLength,mtime:0});
      let emb=null; try{ const md=await doc.getMetadata(); emb=await decodeEmbedded(md&&md.info&&md.info.Keywords); }catch(_){ }
      if(emb) applyEmbedded(r,emb); else r.source='layout'; reports.push(r);
    }catch(e){ errors.push({file:decodeURIComponent(u.pathname.split('/').at(-1)),error:e.message}); }
  }
  const summary={files:urls.length,parsed:reports.length,errors,items:reports.reduce((n,r)=>n+r.items.length,0),photos:reports.reduce((n,r)=>n+r.items.filter(i=>i.photo).length,0),warnings:reports.reduce((n,r)=>n+r.warnings.length,0),sources:Object.fromEntries(['layout','embedded'].map(k=>[k,reports.filter(r=>r.source===k).length])),versions:Object.fromEntries([...new Set(reports.map(r=>r.version||'(older)'))].sort().map(k=>[k,reports.filter(r=>(r.version||'(older)')===k).length]))};
  const pass=!errors.length&&(!expectedFiles||summary.files===expectedFiles)&&(!expectedItems||summary.items===expectedItems);
  document.body.dataset.status=pass?'pass':'fail'; status.className=pass?'pass':'fail'; status.textContent=pass?'PASS':'FAIL'; out.textContent=JSON.stringify(summary,null,2);
}catch(e){ document.body.dataset.status='fail'; status.className='fail'; status.textContent='FAIL'; out.textContent=e.stack; }
