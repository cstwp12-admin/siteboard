export function startPwa(){
  const bar=document.createElement('div');bar.className='app-status';bar.setAttribute('role','status');document.querySelector('.content').prepend(bar);
  let installEvent=null, reg=null, issue='';
  function draw(){
    bar.replaceChildren();
    const text=document.createElement('span');
    text.textContent=!navigator.onLine?'Offline · cached reports may be available; original PDFs and map tiles may need a connection.':issue||(reg?.waiting?'An update is ready. Save your current work before reloading.':reg?.active?'App shell available offline. Source PDFs and map tiles are separate.':'');
    bar.append(text);
    const action=(label,fn)=>{const b=document.createElement('button');b.className='btn sm';b.textContent=label;b.onclick=fn;bar.append(b);};
    if(reg?.waiting)action('Update & reload',()=>reg.waiting?.postMessage({type:'ACTIVATE_UPDATE'}));
    if(installEvent)action('Install SiteBoard',async()=>{await installEvent.prompt();installEvent=null;draw();});
    bar.hidden=!text.textContent&&!installEvent;
  }
  window.addEventListener('online',draw);window.addEventListener('offline',draw);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;draw();});
  window.addEventListener('appinstalled',()=>{installEvent=null;draw();});
  if('serviceWorker' in navigator&&window.isSecureContext){
    let reloading=false;const hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!reloading){reloading=true;location.reload();}});
    navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{
      reg=r;draw();r.addEventListener('updatefound',()=>{const worker=r.installing;worker?.addEventListener('statechange',draw);});
    }).catch(()=>{issue='Offline app shell unavailable. You can continue using SiteBoard online.';draw();});
  }
  draw();
}
