const q=new URLSearchParams(location.search), src=q.get('src')||'../../../../WP12_CST_WEEKLY_REPORT/CST_Daily_Reports/2026-10/';
const expected=+(q.get('expectFiles')||0), status=document.querySelector('#status'), out=document.querySelector('#out'), frame=document.querySelector('#app');
const pause=(n)=>new Promise(r=>setTimeout(r,n));
try{
  await new Promise((res,rej)=>{ frame.onload=res; setTimeout(()=>rej(new Error('SiteBoard did not start')),15000); });
  const w=frame.contentWindow, faults=[]; w.addEventListener('error',e=>faults.push(e.message)); w.addEventListener('unhandledrejection',e=>faults.push(String(e.reason&&e.reason.message||e.reason)));
  for(let i=0;i<100&&!w.__wp12;i++) await pause(50); if(!w.__wp12) throw new Error('SiteBoard test API was not available');
  const index=await fetch(src); if(!index.ok) throw new Error(`Report folder returned HTTP ${index.status}`); const html=await index.text(), dom=new DOMParser().parseFromString(html,'text/html');
  const urls=[...dom.querySelectorAll('a[href]')].map(a=>new URL(a.getAttribute('href'),new URL(src,location.href))).filter(u=>/\.pdf$/i.test(u.pathname));
  if(expected&&urls.length!==expected) throw new Error(`Expected ${expected} PDFs, found ${urls.length}`);
  const files=[]; for(let i=0;i<urls.length;i++){ status.textContent=`Loading report ${i+1}/${urls.length}…`; const u=urls[i], b=await (await fetch(u)).blob(); files.push(new File([b],decodeURIComponent(u.pathname.split('/').at(-1)),{type:'application/pdf',lastModified:0})); }
  await w.__wp12.fromFiles(files); if(w.__wp12.S.reports.length!==urls.length) throw new Error(`Dashboard contains ${w.__wp12.S.reports.length} of ${urls.length} reports`);
  const tabs=['today','overview','subs','acts','chain','struct','gal','map','rfi','obs','gen','msg','reg','reports','guide','set'], checked=[]; let mapStatus='';
  for(const name of tabs){ status.textContent=`Opening ${name}…`; w.__wp12.S.tab=name; w.__wp12.render(); await pause(name==='map'?800:60); const view=w.document.querySelector('#view'); if(!view||!view.textContent.trim()) throw new Error(`${name} rendered an empty view`); if(name==='map') mapStatus=w.document.querySelector('#mpSt')?.textContent||''; checked.push(name); }
  if(faults.length) throw new Error('Page errors: '+[...new Set(faults)].join('; '));
  const result={reports:w.__wp12.S.reports.length,items:w.__wp12.S.reports.reduce((n,r)=>n+r.items.length,0),views:checked,mapStatus,errors:faults}; document.body.dataset.status='pass'; status.className='pass'; status.textContent='PASS'; out.textContent=JSON.stringify(result,null,2);
}catch(e){ document.body.dataset.status='fail'; status.className='fail'; status.textContent='FAIL'; out.textContent=e.stack; }
