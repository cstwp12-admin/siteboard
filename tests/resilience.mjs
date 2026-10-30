// Run: node tests/resilience.mjs (no dependencies).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {createBackup,parseBackup,restoreBackup} from '../js/backup.js';
let count=0;function test(name,fn){fn();console.log('PASS '+name);count++;}
class Storage{
  data=new Map();calls=0;failAt=-1;
  getItem(k){return this.data.get(k)??null;}
  setItem(k,v){if(++this.calls===this.failAt)throw Error('quota');this.data.set(k,v);}
  removeItem(k){this.data.delete(k);}
}
const s=new Storage();s.setItem('wp12dash.ws',JSON.stringify({active:'w1',list:[{id:'w1',name:'Project A'},{id:'w2',name:'Project B'}]}));
s.setItem('wp12dash.v1',JSON.stringify({issued:[{id:'memo1',text:'Full memo body',no:'SB/2026/040'}],memoSeq:{'SB/2026/':40},observations:{a:{status:'open'}},setup:{projectCode:'A'}}));
s.setItem('wp12dash.v1.w2',JSON.stringify({issued:[],project:{title:'B'}}));s.setItem('wp12dash.profile','{"name":"Example"}');
const backup=createBackup(s), before=JSON.stringify([...s.data]);
test('All workspaces exported with full memo text/counters',()=>{assert.equal(backup.workspaces.length,2);assert.equal(backup.workspaces[0].settings.issued[0].text,'Full memo body');assert.equal(backup.workspaces[0].settings.memoSeq['SB/2026/'],40);});
test('JSON round trip retains every setting',()=>assert.deepEqual(parseBackup(JSON.stringify(backup)),backup));
test('Legacy default expectedRoles=null is retained',()=>assert.equal(parseBackup(JSON.stringify({...backup,workspaces:[{name:'Legacy',settings:{expectedRoles:null}}]})).workspaces[0].settings.expectedRoles,null));
test('Corrupted JSON rejected',()=>assert.throws(()=>parseBackup('{')));
test('Future schema rejected',()=>assert.throws(()=>parseBackup(JSON.stringify({...backup,schema:2}))));
test('Wrong application rejected',()=>assert.throws(()=>parseBackup(JSON.stringify({...backup,format:'Other'}))));
test('Prototype properties rejected',()=>assert.throws(()=>parseBackup('{"format":"SiteBoard-settings-backup","schema":1,"workspaces":[],"__proto__":{}}')));
test('Malformed register rejected',()=>assert.throws(()=>restoreBackup({...backup,workspaces:[{name:'Bad',settings:{issued:'invalid'}}]},{storage:s})));
test('Validation failures leave storage untouched',()=>assert.equal(JSON.stringify([...s.data]),before));
const added=restoreBackup(backup,{storage:s,token:'test'});
test('Restore retains active workspace and existing data',()=>{assert.equal(JSON.parse(s.getItem('wp12dash.ws')).active,'w1');assert.equal(s.getItem('wp12dash.v1'),JSON.parse(before).find(x=>x[0]==='wp12dash.v1')[1]);});
test('Restored workspace preserves register and numbering',()=>assert.deepEqual(JSON.parse(s.getItem('wp12dash.v1.'+added[0].id)),backup.workspaces[0].settings));
test('Repeated restore cannot collide',()=>{const again=restoreBackup(backup,{storage:s,token:'test'});assert.notEqual(again[0].id,added[0].id);});
test('Profile is retained by default',()=>{s.setItem('wp12dash.profile','{"name":"Current"}');restoreBackup(backup,{storage:s});assert.equal(JSON.parse(s.getItem('wp12dash.profile')).name,'Current');});
test('Profile can be explicitly restored',()=>{restoreBackup(backup,{storage:s,restoreProfile:true});assert.equal(JSON.parse(s.getItem('wp12dash.profile')).name,'Example');});
test('Quota failure rolls back partial restore',()=>{const snapshot=[...s.data];s.failAt=s.calls+2;assert.throws(()=>restoreBackup(backup,{storage:s,token:'quota'}));assert.deepEqual([...s.data],snapshot);});
const listeners={}, cacheStore=new Map(), deleted=[];
const root='https://example.test/project/siteboard/';
const cache={async addAll(reqs){for(const r of reqs)cacheStore.set(r.url,{url:r.url,cached:true});},async match(r){return cacheStore.get(typeof r==='string'?r:r.url);}};
const self={registration:{scope:root},location:{origin:'https://example.test'},clients:{async claim(){}},addEventListener(k,f){listeners[k]=f;},skipWaiting(){self.skipped=true;}};
vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),{self,URL,Request,Set,caches:{async open(){return cache;},async keys(){return ['unrelated', 'siteboard-shell:'+root+':old'];},async delete(k){deleted.push(k);}},fetch:async()=>{throw Error('offline');}});
let promise;listeners.install({waitUntil(p){promise=p;}});await promise;
test('Offline shell contains entry point, all modules and vendor PDF worker',()=>{for(const p of ['index.html','js/backup.js','vendor/pdf.worker.min.mjs','manifest.webmanifest'])assert.ok(cacheStore.has(root+p),p);});
test('Reports, tests and settings are excluded from offline cache',()=>assert.ok(![...cacheStore.keys()].some(x=>/\.pdf$|tests\/|siteboard-settings/.test(x))));
listeners.activate({waitUntil(p){promise=p;}});await promise;
test('Activation only removes old caches for this application scope',()=>assert.deepEqual(deleted,['siteboard-shell:'+root+':old']));
async function request(url,mode='navigate',method='GET'){let response;listeners.fetch({request:{url,mode,method},respondWith(p){response=p;}});return response?await response:undefined;}
const home=await request(root+'?launch=1');test('Subdirectory home loads cached shell when network is offline',()=>assert.equal(home.url,root+'index.html'));
const module=await request(root+'js/app.js','cors');test('Module loads from cache while offline',()=>assert.equal(module.cached,true));
for(const [url,mode,method] of [[root+'reports/private.pdf','navigate','GET'],['https://tiles.example/a','cors','GET'],[root+'js/app.js','cors','POST']]){const result=await request(url,mode,method);test('Unrelated request is not intercepted: '+url,()=>assert.equal(result,undefined));}
test('New worker waits until explicit update request',()=>{assert.equal(self.skipped,undefined);listeners.message({data:{type:'ACTIVATE_UPDATE'}});assert.equal(self.skipped,true);});
console.log(`${count} resilience checks passed`);
