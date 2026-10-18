import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installBossActionOwnedQA} from '../dist/qa-boss-action-owned-ui.js';
import {createQAStorage,isQAMemoryStorage} from '../dist/qa-storage.js';

// UI-only orchestration fixtures: no model load, Canvas, Game or GPU is run.
const url=()=>new URL('http://127.0.0.1:8851/?qa&qa-memory=boss-owned-ui&qa-boss-owned-cleanup=1');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function flush(){for(let i=0;i<6;i++)await Promise.resolve();}
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.disabled=false;this.value='';this.history=[];this._text='';}
 set textContent(value){this._text=value;this.history.push(value);}
 get textContent(){return this._text;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(name,value){this[name]=value;}
}
function fixture(overrides={}){
 const nodes=[],replacement=new Map(),listeners=new Set(),counts={storage:0,loads:0,runs:0};
 const document={body:null,createElement(tag){const node=new Element(tag);nodes.push(node);return node;},getElementById(id){return replacement.get(id)??nodes.find(node=>node.id===id)??null;},querySelector(selector){assert.equal(selector,'nav');return nav;}};
 document.body=document.createElement('body');const nav=document.createElement('nav');
 const eventTarget={addEventListener(name,fn,options){assert.equal(name,'pagehide');assert.equal(options.once,true);listeners.add(fn);},removeEventListener(name,fn){assert.equal(name,'pagehide');listeners.delete(fn);}};
 const manifest=Object.freeze({assets:Object.freeze({example:Object.freeze({metadata:'original.json'})})});
 const result={report:{available:true,complete:true,boundedOwnedCleanup:true,selectedBossKeys:['boss-02-final'],cleanup:{complete:true,ownedDrain:{success:true}}}};
 let args,caller;
 const options={document,location:url(),eventTarget,
  createStorage(query,persistent){counts.storage++;assert.equal(query.get('qa-boss-owned-cleanup'),'1');assert.throws(persistent,/boss-action-owned-persistent-storage-forbidden/);return createQAStorage(query,persistent);},
  loadModules:async()=>{counts.loads++;return{productionManifest:manifest,compareBossActionLayerOwned:async(owner,input)=>{
   counts.runs++;caller=owner;args=input;
   assert.deepEqual(Reflect.ownKeys(owner),['productionArt']);assert.deepEqual(Reflect.ownKeys(owner.productionArt),['manifest']);assert.equal(owner.productionArt.manifest,manifest);
   assert.equal(Object.isFrozen(owner),true);assert.equal(Object.isFrozen(owner.productionArt),true);
   assert.equal(input.document,document);assert.equal(isQAMemoryStorage(input.storage),true);assert.equal(input.signal.aborted,false);
   assert.deepEqual(Object.keys(input).sort(),['bossKeys','document','location','onImage','onProgress','query','signal','storage'].sort());
   assert.equal(input.bossKeys.length,1);input.onProgress({phase:'angles',angleIndex:0});
   for(let i=0;i<3;i++)input.onImage({src:'data:image/png;base64,AA==',alt:'seven-phase sheet '+i});
   return result;
  }};},...overrides};
 const handle=installBossActionOwnedQA(options);
 return{handle,options,nodes,replacement,listeners,counts,manifest,result,document,byId:id=>document.getElementById(id),get args(){return args;},get caller(){return caller;},hide(){for(const fn of [...listeners])fn();}};
}

test('standalone boss UI gates exact origin and flag before DOM/dependencies and requires genuine memory storage',async()=>{
 for(const location of[
  new URL('http://127.0.0.1:8806/?qa&qa-memory=x&qa-boss-owned-cleanup=1'),
  new URL('https://localhost:8851/?qa&qa-memory=x&qa-boss-owned-cleanup=1'),
  new URL('http://example.com:8851/?qa&qa-memory=x&qa-boss-owned-cleanup=1'),
  new URL('http://localhost:8851/?qa-memory=x&qa-boss-owned-cleanup=1'),
  new URL('http://localhost:8851/?qa&qa-boss-owned-cleanup=1'),
  new URL('http://localhost:8851/?qa&qa-memory=x'),
  new URL('http://localhost:8851/?qa&qa-memory=x&qa-boss-owned-cleanup=true'),
 ]){
  let reads=0;const options={location};for(const key of['document','eventTarget','createStorage','loadModules'])Object.defineProperty(options,key,{get(){reads++;throw Error('invalid gate before UI');}});
  assert.equal(installBossActionOwnedQA(options),null);assert.equal(reads,0);
 }
 let documentReads=0;
 const forged={location:url(),createStorage:()=>new Map()};Object.defineProperty(forged,'document',{get(){documentReads++;throw Error('brand before DOM');}});
 assert.equal(installBossActionOwnedQA(forged),null);assert.equal(documentReads,0);
 const source=await readFile(new URL('../dist/qa-boss-action-owned-ui.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/import\s.*(?:engine\.js|renderer\.js|qa-player-rig\.js)/);
 assert.doesNotMatch(source,/localStorage\.|requestAnimationFrame\s*\(|setTimeout\s*\(|\.tick\s*\(|\.render\s*\(/);
});

test('one idle click loads the original manifest lazily and runs exactly one of twelve final keys with at most one PNG',async()=>{
 const f=fixture();assert.deepEqual(f.counts,{storage:1,loads:0,runs:0});
 assert.equal(f.handle.select.id,'boss-action-owned-key');assert.equal(f.handle.select.value,'boss-02-final');
 assert.deepEqual(f.handle.select.children.map(option=>option.value),Array.from({length:12},(_,index)=>'boss-'+String(index+1).padStart(2,'0')+'-final'));
 assert.equal(f.byId('boss-action-owned-status'),f.handle.status);
 assert.match(f.nodes.find(node=>node.tagName==='SUMMARY').textContent,/실제 전투·성능 검수가 아님/);
 assert.equal(installBossActionOwnedQA(f.options),null);assert.equal(f.nodes.filter(node=>node.id==='boss-action-owned-qa').length,1);
 f.handle.button.disabled=true;await f.handle.button.onclick();f.handle.button.disabled=false;assert.equal(f.counts.loads,0);
 assert.equal(await f.handle.button.onclick(),f.result);
 assert.deepEqual(f.args.bossKeys,['boss-02-final']);assert.equal(f.caller.productionArt.manifest,f.manifest);
 assert.equal(f.byId('boss-action-owned-proof').children.length,1);assert.deepEqual(JSON.parse(f.byId('boss-action-owned-report').textContent),f.result.report);
 const proof=f.byId('boss-action-owned-proof'),details=f.nodes.find(node=>node.tagName==='DETAILS');
 assert.ok(f.document.body.children.indexOf(proof)<f.document.body.children.indexOf(details));assert.equal(details.children.includes(proof),false);
 assert.equal(proof.children[0].style.maxHeight,'1000px');assert.equal(proof.children[0].style.width,'auto');
 assert.equal(f.byId('boss-action-owned-report').history.filter(value=>value.startsWith('{')).length,1);
 assert.match(f.handle.status.textContent,/검수 완료/);assert.match(f.handle.status.textContent,/제품 채택 없음/);
 assert.equal(f.listeners.size,0);assert.equal(f.handle.button.disabled,false);assert.equal(f.handle.select.disabled,false);
 f.handle.select.value='boss-06-final';await f.handle.button.onclick();assert.deepEqual(f.args.bossKeys,['boss-06-final']);assert.equal(f.counts.runs,2);assert.equal(f.byId('boss-action-owned-proof').children.length,1);
 f.handle.select.value='all';await f.handle.button.onclick();assert.equal(f.counts.runs,2);assert.equal(JSON.parse(f.byId('boss-action-owned-report').textContent).reason,'registered-final-boss-key-required');
});

test('duplicate clicks, selection changes and UI owner replacement cannot launch a late lazy-loaded worker',async()=>{
 for(const change of['selection','owner','pagehide']){
  const modules=deferred();let loads=0,runs=0;
  const f=fixture({loadModules:()=>{loads++;return modules.promise;}}),run=f.handle.button.onclick();
  assert.equal(f.handle.button.disabled,true);assert.equal(f.handle.select.disabled,true);
  // The independent running guard also rejects external disabled-state edits.
  f.handle.button.disabled=false;await f.handle.button.onclick();assert.equal(loads,1);
  if(change==='selection')f.handle.select.value='boss-06-final';
  if(change==='owner')f.replacement.set('boss-action-owned-proof',new Element('div'));
  if(change==='pagehide')f.hide();
  modules.resolve({productionManifest:f.manifest,compareBossActionLayerOwned:async()=>{runs++;throw Error('late worker forbidden');}});
  assert.equal(await run,undefined);assert.equal(runs,0);assert.equal(f.listeners.size,0);assert.equal(f.handle.button.disabled,false);assert.equal(f.handle.select.disabled,false);
  if(change!=='pagehide')assert.equal(JSON.parse(f.nodes.find(node=>node.id==='boss-action-owned-report').textContent).reason,'qa-ui-owner-or-selection-changed');
 }
});

test('pagehide and replaced UI owners abort running work and suppress late images, progress and results',async()=>{
 for(const change of['pagehide','owner']){
  const pending=deferred();let args;
  const f=fixture({loadModules:async()=>({productionManifest:{assets:{}},compareBossActionLayerOwned:async(_,input)=>{args=input;return pending.promise;}})});
  const run=f.handle.button.onclick();await flush();assert.ok(args);assert.equal(args.signal.aborted,false);
  if(change==='pagehide')f.hide();else f.replacement.set('boss-action-owned-report',new Element('pre'));
  const status=f.handle.status.textContent;
  args.onProgress({phase:'late'});args.onImage({src:'late',alt:'must not append'});assert.equal(args.signal.aborted,true);
  pending.resolve({report:{complete:true,cleanup:{complete:true}}});assert.equal(await run,undefined);
  assert.equal(f.handle.status.textContent,status);assert.equal(f.nodes.find(node=>node.id==='boss-action-owned-proof').children.length,0);
  assert.equal(f.nodes.find(node=>node.id==='boss-action-owned-report').textContent,'');assert.equal(f.listeners.size,0);assert.equal(f.handle.button.disabled,false);
 }
});

test('raw worker failure and incomplete cleanup remain failed evidence without auto-adoption or extra attempts',async()=>{
 const raw={available:true,complete:false,selectedBossKeys:['boss-02-final'],reports:[{key:'boss-02-final',activeSamples:7}],cleanup:{complete:false,ownedDrain:{timedOut:true,pending:[{label:{key:'boss-02-final'}}]}}};
 const failure=Object.assign(Error('boss-action-layer-owned-cleanup-failed'),{bossActionLayerQA:raw,cleanup:raw.cleanup});
 const f=fixture({loadModules:async()=>({productionManifest:{assets:{}},compareBossActionLayerOwned:async()=>{throw failure;}})});
 assert.equal(await f.handle.button.onclick(),undefined);
 const shown=JSON.parse(f.byId('boss-action-owned-report').textContent);assert.equal(shown.complete,false);assert.equal(shown.error,failure.message);assert.deepEqual(shown.report,raw);assert.deepEqual(shown.cleanup,raw.cleanup);
 assert.equal(f.byId('boss-action-owned-report').history.filter(value=>value.startsWith('{')).length,1);assert.match(f.handle.status.textContent,/중단/);assert.doesNotMatch(f.handle.status.textContent,/검수 완료/);assert.equal(f.listeners.size,0);
 const incomplete={report:{available:true,complete:false,cleanup:{complete:false,errors:[{error:'source-unchanged-required'}]}}};
 const g=fixture({loadModules:async()=>({productionManifest:{assets:{}},compareBossActionLayerOwned:async()=>incomplete})});
 assert.equal(await g.handle.button.onclick(),incomplete);assert.deepEqual(JSON.parse(g.byId('boss-action-owned-report').textContent),incomplete.report);assert.match(g.handle.status.textContent,/미완료/);assert.doesNotMatch(g.handle.status.textContent,/검수 완료|제품 채택/);assert.equal(g.listeners.size,0);
});
