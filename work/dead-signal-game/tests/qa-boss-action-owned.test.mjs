import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compareBossActionLayerOwned} from '../dist/qa-boss-action-owned.js';
import {createOwnedCleanupTracker} from '../dist/qa-owned-cleanup-tracker.js';
import {createQAStorage} from '../dist/qa-storage.js';

// Controlled loader/resources only. These tests deliberately stop before the
// original visual sample loop: they prove cancellation/ownership/retirement,
// never actual GL frames, original-asset pixels or natural boss movement.
const folder=new URL('../../../qa/boss-action-owned-cleanup-20261018/',import.meta.url);
const originals={};
for(const[name,bytes,sha]of[
 ['legacy-helper-before.txt',28833,'d4cfac4014b8cdb968e785cae64965d6430c417c7b4cd6b7d2ef948ac9c44fb7'],
 ['action-layer-before.txt',6701,'1f5e80093788c91c8e1ada85ee18c5930c518781f66c6473f2b816a0a86e0e1b'],
 ['live-boss-before.txt',22579,'c9c9b93cc20dad6b63bcbcda7997ced15883b810f8fe674d3384fee502290cfa'],
]){const value=await readFile(new URL(name,folder));assert.equal(value.length,bytes);assert.equal(createHash('sha256').update(value).digest('hex'),sha);originals[name]=value.toString('utf8');}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function flush(){for(let index=0;index<32;index++)await Promise.resolve();}
function clock(){let time=100,id=0;const timers=new Map(),scheduled=[],cleared=[];return{now:()=>time,setTimer(callback,delay){const handle=++id;timers.set(handle,{callback,at:time+delay});scheduled.push(delay);return handle;},clearTimer(handle){cleared.push(handle);timers.delete(handle);},advance(ms){time+=ms;for(const[handle,timer]of[...timers])if(timer.at<=time){timers.delete(handle);timer.callback();}},timers,scheduled,cleared};}
const address=()=>new URL('http://localhost:8851/qa-player-rig.html?qa=1&qa-memory=boss-owned-tests&qa-boss-owned-cleanup=1');
function gate(url=address()){return{location:url,query:url.searchParams,storage:createQAStorage(url.searchParams,()=>assert.fail('persistent storage forbidden'))};}
function outcome(promise){return promise.then(value=>({value}),error=>({error,threw:true}));}
function attached(result){const report=result.error?.bossActionLayerQA??result.error?.report??result.value?.report;assert.ok(report,'the original Error carries a finalized primitive report');return report;}
function deepFrozen(value,seen=new Set()){if(value===null||typeof value!=='object')return;assert.equal(Object.isFrozen(value),true);if(seen.has(value))return;seen.add(value);for(const child of Object.values(value))deepFrozen(child,seen);}
function noRefs(value,forbidden,seen=new Set()){if(value===null||typeof value!=='object')return;assert.equal(forbidden.has(value),false,'report must not retain a source/resource/Promise/Error');if(seen.has(value))return;seen.add(value);assert.ok(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype);for(const d of Object.values(Object.getOwnPropertyDescriptors(value))){assert.ok('value'in d);noRefs(d.value,forbidden,seen);}}

function fixture(config={}){
 const pending=deferred(),child=deferred(),timer=clock(),events=[],rigs=[],arts=[],canvases=[],channels=[],models=[],flags={childAdded:false};
 const primary=Object.hasOwn(config,'primary')?config.primary:Error('controlled original load failure'),disposeMarker=Error('controlled geometry disposal failure');
 const counts={renders:0,mainCalls:0,contextDispose:0,contextLoss:0,geometry:0,material:0,texture:0,bitmap:0,skeleton:0,childGeometry:0};
 function canvas(kind='owned'){
  const value={width:512,height:512,kind},context={canvas:value,clearRect(){assert.fail('unexpected quality draw');},drawImage(){assert.fail('unexpected quality draw');},getImageData(){assert.fail('unexpected quality read');}};
  value.getContext=()=>context;value.toDataURL=()=>{assert.fail('unexpected quality export');};canvases.push(value);return value;
 }
 function model(key,isChild=false){
  const image={width:32,height:32,close(){counts.bitmap++;events.push('bitmap:'+key);}},texture={isTexture:true,source:{data:image},dispose(){counts.texture++;events.push('texture:'+key);}};
  const geometry={dispose(){if(isChild)counts.childGeometry++;else counts.geometry++;events.push('geometry:'+key);
   if(config.discoverChild&&!isChild&&!flags.childAdded){flags.childAdded=true;const promise=child.promise.then(value=>{if(value)rigs[0].models.set('late-child',model('late-child',true));return value;});rigs[0].pending.set('late-child',promise);}
   if(config.disposeThrows&&!isChild)throw disposeMarker;
  }};
  const material={map:texture,normalMap:texture,dispose(){counts.material++;events.push('material:'+key);}},skeleton={dispose(){counts.skeleton++;events.push('skeleton:'+key);}},mesh={geometry,material,skeleton};
  const root={traverse(visit){visit(this);visit(mesh);}};
  const value={root,subject:root,sampler:{skins:[]}};models.push({value,mesh,image,texture,geometry,material,skeleton});return value;
 }
 const manifest={bosses:{'boss-02-final':{walk:'original-walk',actions:'original-actions'}},assets:{'original-walk':{},'original-actions':{}}};
 const protectedSurface={width:777,height:555},protectedPoolSurface={width:333,height:222},protectedMainSurface={width:960,height:640},protectedModel={original:true};
 const protectedRig={models:new Map([['protected',protectedModel]]),pending:new Map(),framePool:{slots:[{image:protectedPoolSurface,canvas:protectedPoolSurface,body:protectedPoolSurface,owner:{protected:true}}]},raw:protectedSurface,ink:protectedSurface,renderer:{domElement:protectedSurface,dispose(){counts.mainCalls++;assert.fail('main renderer disposed');},forceContextLoss(){counts.mainCalls++;assert.fail('main renderer context lost');}},releaseUnused(){counts.mainCalls++;assert.fail('main model released');}};
 const mainArt={manifest,baseURL:new URL('http://localhost:8851/assets/production/'),fetchImpl:()=>assert.fail('main art fetch'),ImageCtor:null,timeoutMs:15000,records:new Map([['protected',{image:protectedSurface,metadata:{original:true}}]])};
 const main={productionArt:mainArt,liveBoss:protectedRig,liveBossPromise:Promise.resolve(protectedRig),liveEnemies:protectedRig,liveEnemiesPromise:Promise.resolve(protectedRig),liveEnemiesLoading:false,canvas:protectedMainSurface,ctx:{canvas:protectedMainSurface}};
 const before={main:Object.getOwnPropertyDescriptors(main),art:Object.getOwnPropertyDescriptors(mainArt),records:[...mainArt.records],models:[...protectedRig.models],slots:[...protectedRig.framePool.slots],slot:Object.getOwnPropertyDescriptors(protectedRig.framePool.slots[0]),surface:Object.getOwnPropertyDescriptors(protectedSurface),poolSurface:Object.getOwnPropertyDescriptors(protectedPoolSurface),mainSurface:Object.getOwnPropertyDescriptors(protectedMainSurface)};
 class Art{
  constructor(options){Object.assign(this,options);this.records=config.aliasArtRecords?mainArt.records:new Map();arts.push(this);}
  load(id){const ready=config.artFalse!==true,promise=Promise.resolve(ready);this.records.set(id,{status:ready?'ready':'failed',image:canvas('atlas'),metadata:{original:true},promise});return promise;}
  releaseUnusedAssets(ids){const keep=new Set(ids);for(const[id,record]of this.records)if(!keep.has(id)){if(record.image){record.image.width=0;record.image.height=0;}this.records.delete(id);}}
 }
 class Rig{
  constructor(){if(config.aliasProtected)return protectedRig;this.size=512;this.models=new Map();this.pending=new Map();this.bossActionLayerEnabled=false;this.lost=false;this.error='';this.raw=canvas('raw');this.ink=canvas('ink');this.gpuRaw=canvas('gpuRaw');this.framePool={slots:[{image:canvas('slot-image'),canvas:canvas('slot-canvas'),body:canvas('slot-body'),owner:{owned:true}}]};if(config.aliasPoolSurface)this.framePool.slots[0].image=protectedPoolSurface;if(config.aliasPool)this.framePool=protectedRig.framePool;this.renderer={domElement:canvas('gl'),info:{render:{frame:0}},dispose(){counts.contextDispose++;events.push('context.dispose');},forceContextLoss(){counts.contextLoss++;events.push('context.loss');}};this.scene={clear(){events.push('scene.clear');}};rigs.push(this);if(config.constructorThrows)throw primary;}
  load(key){const promise=pending.promise.then(value=>{if(value===true)this.models.set(key,model(key));return value;});this.pending.set(key,promise);events.push('load:'+key);if(config.loadThrows)throw primary;return promise;}
  releaseUnused(keys){const keep=new Set(keys);for(const[key,value]of this.models)if(!keep.has(key)){value.subject.traverse(object=>{object.geometry?.dispose();for(const m of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){m.map?.dispose();m.map?.source?.data?.close?.();m.dispose();}object.skeleton?.dispose?.();});this.models.delete(key);this.pending.delete(key);}}
  releaseExactGPUAlpha(){events.push('alpha.release');}
 }
 class Renderer{nativeEnemyFrame(){counts.renders++;assert.fail('lifecycle fixture must never enter quality rendering');}}
 class Channel{constructor(){this.port1={onmessage:null,closed:false,close(){this.closed=true;}};this.port2={closed:false,close(){this.closed=true;},postMessage:()=>queueMicrotask(()=>this.port1.onmessage?.({data:0}))};channels.push(this);}}
 let tracker;
 const testDeps={Renderer,ProductionArt:Art,LiveBossRig:Rig,Cache:{enabled:false},MessageChannel:Channel,
  ownedCleanupTestOptions:{now:timer.now,setTimer:timer.setTimer,clearTimer:timer.clearTimer,timeoutMs:50,maxEntries:256},
  loadWaitTestOptions:{timeoutMs:50,setTimer:timer.setTimer,clearTimer:timer.clearTimer},
  createOwnedCleanupTracker(options){tracker=createOwnedCleanupTracker(options);if(config.registrationThrows)return{follow(){throw Error('controlled tracker registration failure');},wait:tracker.wait,snapshot:tracker.snapshot};return tracker;},
 };
 const controller=new AbortController(),document={createElement(name){assert.equal(name,'canvas');return config.aliasMainCanvas?protectedMainSurface:canvas('adapter');}};
 const options={...gate(),document,testDeps,signal:controller.signal,bossKeys:['boss-02-final']};
 function mainUnchanged(){assert.deepEqual(Object.getOwnPropertyDescriptors(main),before.main);assert.deepEqual(Object.getOwnPropertyDescriptors(mainArt),before.art);assert.deepEqual([...mainArt.records],before.records);assert.deepEqual([...protectedRig.models],before.models);assert.deepEqual(protectedRig.framePool.slots,before.slots);assert.deepEqual(Object.getOwnPropertyDescriptors(protectedRig.framePool.slots[0]),before.slot);assert.deepEqual(Object.getOwnPropertyDescriptors(protectedSurface),before.surface);assert.deepEqual(Object.getOwnPropertyDescriptors(protectedPoolSurface),before.poolSurface);assert.deepEqual(Object.getOwnPropertyDescriptors(protectedMainSurface),before.mainSurface);assert.equal(counts.mainCalls,0);}
 function released(){for(const c of canvases)assert.ok(c.width===0&&c.height===0,'owned '+c.kind+' surface is retired');for(const channel of channels)assert.ok(channel.port1.closed&&channel.port2.closed);}
 return{main,mainArt,protectedRig,protectedSurface,pending,child,timer,events,rigs,arts,models,counts,options,controller,primary,disposeMarker,mainUnchanged,released,get tracker(){return tracker;}};
}

test('exact opt-in and genuine memory gate precede main owner, DOM and dependency reads',async()=>{
 for(const url of[new URL('http://localhost:8806/?qa&qa-memory=x&qa-boss-owned-cleanup=1'),new URL('https://localhost:8851/?qa&qa-memory=x&qa-boss-owned-cleanup=1'),new URL('http://example.com:8851/?qa&qa-memory=x&qa-boss-owned-cleanup=1'),new URL('http://localhost:8851/?qa&qa-memory=x'),new URL('http://localhost:8851/?qa-memory=x&qa-boss-owned-cleanup=1')]){
  let reads=0;const poison=()=>{reads++;throw Error('before gate');},opts={...gate(url)};for(const key of['document','testDeps','signal','bossKeys'])Object.defineProperty(opts,key,{get:poison});const main=new Proxy({},{get:poison,getOwnPropertyDescriptor:poison});
  const result=await compareBossActionLayerOwned(main,opts);assert.equal(result.report.available,false);assert.equal(result.report.complete,false);assert.equal(reads,0);
 }
 let reads=0;const url=address(),opts={location:url,query:url.searchParams,storage:new Map()};Object.defineProperty(opts,'testDeps',{get(){reads++;assert.fail('forged store reached deps');}});assert.equal((await compareBossActionLayerOwned({},opts)).report.available,false);assert.equal(reads,0);
});

test('abort before an unsettled original model arrives waits for its late retirement exactly once and preserves every main owner',async()=>{
 const f=fixture(),run=outcome(compareBossActionLayerOwned(f.main,f.options));await flush();assert.equal(f.rigs.length,1);assert.equal(f.rigs[0].pending.size,1);f.controller.abort();await flush();assert.equal(f.counts.contextDispose,1);assert.equal(f.counts.contextLoss,1);assert.equal(f.rigs[0].models.size,0);assert.ok(f.tracker.snapshot().active>0);
 f.pending.resolve(true);const result=await run;assert.equal(result.threw,true);assert.match(result.error.message,/aborted/);const report=attached(result);assert.equal(report.complete,false);assert.equal(report.injected,true);assert.equal(report.cleanup.complete,true);assert.equal(report.cleanup.ownedDrain.success,true);assert.equal(report.cleanup.ownedDrain.active,0);assert.equal(f.rigs[0].models.size,0);assert.equal(f.rigs[0].pending.size,0);for(const key of['geometry','material','texture','bitmap','skeleton','contextDispose','contextLoss'])assert.equal(f.counts[key],1,key+' retired once despite shared texture/root traversal');assert.equal(f.counts.renders,0);f.mainUnchanged();f.released();deepFrozen(report);noRefs(report,new Set([f.main,f.mainArt,f.protectedRig,f.protectedSurface,f.pending.promise,f.rigs[0],f.primary]));
});

test('load false leaves no retained pending entry and retains the original failure instead of claiming a visual run',async()=>{
 const f=fixture(),run=outcome(compareBossActionLayerOwned(f.main,f.options));await flush();f.pending.resolve(false);const result=await run;assert.equal(result.threw,true);assert.match(result.error.message,/original-model-not-ready/);const report=attached(result);assert.equal(report.complete,false);assert.equal(report.reports.length,0);assert.equal(report.cleanup.complete,true);assert.equal(report.cleanup.ownedDrain.success,true);assert.equal(f.rigs[0].models.size,0);assert.equal(f.rigs[0].pending.size,0);assert.equal(f.counts.geometry,0);assert.equal(f.counts.contextDispose,1);assert.equal(f.counts.contextLoss,1);f.mainUnchanged();f.released();
});

test('a geometry retirement that discovers another original pending Promise keeps the drain active until the new model retires',async()=>{
 const f=fixture({discoverChild:true}),run=outcome(compareBossActionLayerOwned(f.main,f.options));let ended=false;run.then(()=>{ended=true;});await flush();f.controller.abort();await flush();f.pending.resolve(true);await flush();assert.equal(f.counts.geometry,1);assert.equal(f.rigs[0].pending.has('late-child'),true);assert.equal(ended,false,'new follower prevents a premature successful cleanup');assert.ok(f.tracker.snapshot().active>0);f.child.resolve(true);const result=await run,report=attached(result);assert.equal(report.cleanup.complete,true);assert.equal(report.cleanup.ownedDrain.success,true);assert.equal(report.cleanup.ownedDrain.scheduled,report.cleanup.ownedDrain.completed);assert.equal(f.counts.childGeometry,1);assert.equal(f.rigs[0].models.size,0);assert.equal(f.rigs[0].pending.size,0);assert.equal(f.counts.contextDispose,1);assert.equal(f.counts.contextLoss,1);f.mainUnchanged();f.released();
});

test('one cleanup deadline freezes incomplete evidence while a later original model still retires without rewriting the report or primary error',async()=>{
 const marker=Error('original synchronous load failure'),f=fixture({loadThrows:true,primary:marker}),run=outcome(compareBossActionLayerOwned(f.main,f.options));await flush();assert.ok(f.tracker.snapshot().active>0);f.timer.advance(51);const result=await run;assert.equal(result.error,marker);const report=attached(result),saved=JSON.stringify(report);assert.equal(report.complete,false);assert.equal(report.cleanup.complete,false);assert.equal(report.cleanup.ownedDrain.timedOut,true);assert.ok(report.cleanup.ownedDrain.active>0);assert.ok(report.cleanup.ownedDrain.pending.length>0);deepFrozen(report);f.pending.resolve(true);await flush();assert.equal(f.counts.geometry,1);assert.equal(f.counts.contextDispose,1);assert.equal(f.counts.contextLoss,1);assert.equal(f.rigs[0].models.size,0);assert.equal(f.rigs[0].pending.size,0);assert.equal(JSON.stringify(report),saved);assert.equal(marker.bossActionLayerQA,report);f.mainUnchanged();f.released();
});

test('disposal and registration failures are honest, preserve the primary failure and independently attempt all remaining resource cleanup',async()=>{
 const f=fixture({disposeThrows:true}),run=outcome(compareBossActionLayerOwned(f.main,f.options));await flush();f.controller.abort();await flush();f.pending.resolve(true);const result=await run,report=attached(result);assert.match(result.error.message,/aborted/);assert.equal(report.cleanup.complete,false);assert.ok(report.cleanup.errors.length>0);assert.equal(f.counts.geometry,1);for(const key of['material','texture','bitmap','skeleton','contextDispose','contextLoss'])assert.equal(f.counts[key],1,key+' not skipped after geometry throw');assert.equal(f.rigs[0].models.size,0);assert.equal(f.rigs[0].pending.size,0);f.mainUnchanged();f.released();
 const marker=Error('primary retained during registration failure'),g=fixture({registrationThrows:true,loadThrows:true,primary:marker}),running=outcome(compareBossActionLayerOwned(g.main,g.options));await flush();g.pending.resolve(true);const failed=await running;await flush();const proof=attached(failed);assert.equal(failed.error,marker);assert.equal(proof.cleanup.complete,false);assert.ok(proof.cleanup.errors.some(item=>/follow|register/i.test(item.where??'')));assert.equal(g.counts.geometry,1);assert.equal(g.rigs[0].models.size,0);assert.equal(g.rigs[0].pending.size,0);g.mainUnchanged();g.released();deepFrozen(proof);
 for(const primary of[null,0,undefined]){const h=fixture({loadThrows:true,primary}),pending=outcome(compareBossActionLayerOwned(h.main,h.options));await flush();h.pending.resolve(false);const result=await pending;assert.equal(result.threw,true);assert.equal(result.error,primary,'even a falsy original throw keeps its exact identity');assert.equal(h.rigs[0].pending.size,0);h.mainUnchanged();h.released();}
});

test('a constructor returning the caller protected rig cannot release its original model, frame pool or surface',async()=>{
 const f=fixture({aliasProtected:true}),result=await outcome(compareBossActionLayerOwned(f.main,f.options));assert.equal(result.threw,true);const report=attached(result);assert.equal(report.complete,false);assert.equal(report.cleanup.complete,false);assert.equal(f.rigs.length,0);assert.equal(f.counts.mainCalls,0);assert.equal(f.counts.renders,0);assert.equal(f.protectedRig.models.size,1);f.mainUnchanged();deepFrozen(report);
});

test('borrowed main canvases, frame-pool surfaces, slot ownership and atlas record maps stay protected independently',async()=>{
 for(const config of[{aliasPoolSurface:true},{aliasPool:true},{aliasArtRecords:true},{aliasMainCanvas:true}]){
  const f=fixture(config),run=outcome(compareBossActionLayerOwned(f.main,f.options));await flush();f.controller.abort();await flush();f.pending.resolve(false);const result=await run,report=attached(result);assert.equal(result.threw,true);assert.equal(report.complete,false);if(!config.aliasMainCanvas)assert.equal(report.cleanup.complete,false,'foreign pool and art aliases are never certified as complete ownership');else assert.match(result.error.message,/owned-canvas-required/);assert.equal(f.counts.renders,0);f.mainUnchanged();deepFrozen(report);
 }
});

test('the historical phase, geometry, pixel, hand-travel and native rendering oracle changes only at the declared lifecycle sites',async()=>{
 const source=await readFile(new URL('../dist/qa-boss-action-owned.js',import.meta.url),'utf8'),original=originals['legacy-helper-before.txt'];
 const section=(text,start,end)=>{const first=text.indexOf(start),last=text.indexOf(end,first);assert.ok(first>=0&&last>first,'unique original source section exists');return text.slice(first,last);};
 assert.equal(section(source,'const active=','function allowedOwned('),section(original,'const active=','export function allowBossActionLayerQA('),'all thresholds, poses and geometry/alpha/hand calculations remain the full original source');
 const begin='for(const [bossIndex,boss]of finals.entries()){',end="check();need(reports.every(boss=>boss.unclipped)";
 let loop=section(source,begin,end);
 for(const[changed,before]of[
  ['releaseModelsExcept(new Set([boss.id]));releaseArtExcept(ids);','rig.releaseUnused([boss.id]);art.releaseUnusedAssets(ids);'],
  ["waitOwned(art.load(id),'atlas',id)",'wait(art.load(id))'],
  ["waitOwned(rig.load(boss.id),'model',boss.id)",'wait(rig.load(boss.id))'],
  ["sheet=document.createElement('canvas');need(!protectedResources.has(sheet),'owned-sheet-required');ownedSurfaces.add(sheet);","sheet=document.createElement('canvas');"],
  ["    need(!protectedResources.has(selected.image),'owned-native-surface-required');ownedSurfaces.add(selected.image);"+(loop.includes('\r\n')?'\r\n':'\n'),''],
  ["}finally{attempt('flag.restore',()=>{if(sameDescriptor(descriptor(rig,'bossActionLayerEnabled'),flagExpected))Object.defineProperty(rig,'bossActionLayerEnabled',flagBefore);});attempt('sheet.close',()=>{if(sheet){if(protectedResources.has(sheet))throw Error('boss-action-owned-protected-sheet');sheet.width=sheet.height=1;}});sheet=null;}","}finally{if(sameDescriptor(descriptor(rig,'bossActionLayerEnabled'),flagExpected))Object.defineProperty(rig,'bossActionLayerEnabled',flagBefore);if(sheet)sheet.width=sheet.height=1;sheet=null;}"],
 ]){assert.equal(loop.split(changed).length,2,'exactly one declared lifecycle replacement: '+changed);loop=loop.replace(changed,before);}
 assert.equal(loop,section(original,begin,end),'every render call, frame/phase fixture, visual assertion and quality threshold remains byte exact');
 const {undoFoldLayer,undoFoldLive}=await import('../../../qa/boss02-fold-profile-20261018/undo-fold-runtime.mjs');
 for(const[name,path]of[['legacy-helper-before.txt','../dist/qa-boss-action-layer.js'],['action-layer-before.txt','../dist/boss-rig/boss-action-layer.js'],['live-boss-before.txt','../dist/boss-rig/live-boss.js']]){
  let current=await readFile(new URL(path,import.meta.url),'utf8');if(name==='action-layer-before.txt')current=undoFoldLayer(current);else if(name==='live-boss-before.txt')current=undoFoldLive(current);
  assert.equal(current,originals[name],'the whole original source is exact outside the declared dormant fold profile: '+name);
 }
});
