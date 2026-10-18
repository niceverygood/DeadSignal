import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js?v=0.29.0';
import {createQAStorage} from '../dist/qa-storage.js';

// Real normal Game fixtures, .12 catch-up simulation, interpolation and event
// drains stay in use. Original loading/native/observer/Canvas services are
// controlled fixtures; no native image, GPU, FPS or performance proof follows.
const moduleURL=new URL('../dist/qa-image-decode-combat.js',import.meta.url),ids=['enemy-walker-locomotion-hq32','enemy-walker-rig-motion'];
const state=game=>structuredClone({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,random:game.random.getState(),visualRandom:game.visualRandom.getState()});
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){for(let n=0;n<60&&!predicate();n++)await turn();assert.ok(predicate(),'controlled asynchronous preparation entered');}
let serial=0;
async function environment(behavior,run){
 const source=await readFile(moduleURL,'utf8'),descriptorKeys=['document','requestAnimationFrame','performance'],globals=new Map(descriptorKeys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),symbol=Symbol.for('image-decode-combat-'+serial++),artworks=[],handles=[],decodes=[],profiles=[],nativeProfiles=[],renders=[],reads=[],images=[],beforeCalls=[],prepareGate=deferred(),marker=Error('original render marker');let clock=0,currentProfile=null,currentNative=null,rafCalls=0,firstReadAt=null;
 const location=new URL('http://localhost:8851/?qa&qa-memory'),query=location.searchParams,storage=createQAStorage(query,()=>assert.fail('persistent storage'));for(const key of ['getItem','setItem','removeItem'])storage[key]=()=>assert.fail('supplied storage is a brand gate only');
 const metadata=id=>({id,atlas:{width:4,height:4},animation:{clips:{idle:{start:0,count:1},hit:{start:1,count:1}}},projection:{subjectHeight:1,pixelsPerWorld:1},frames:Array.from({length:8},(_,index)=>({index,rect:{x:0,y:0,width:4,height:4},footPivot:{x:2,y:3},alphaBounds:{x:0,y:0,width:4,height:4},outlineBounds:{x:0,y:0,width:4,height:4}}))});
 const originalMetadata=new Map(ids.map(id=>[id,metadata(id)]));
 function surface(label='read',pixels=new Uint8ClampedArray(64)){
  const canvas={label,width:4,height:4,pixels:new Uint8ClampedArray(pixels),toDataURL(){return'data:image/mock;base64,'+Buffer.from(this.pixels).toString('base64');}};
  canvas.getContext=kind=>{assert.equal(kind,'2d');return{clearRect(){canvas.pixels=new Uint8ClampedArray(canvas.width*canvas.height*4);},drawImage(image){assert.equal(renders.length%40,0,'no pixel/quality/prime draw before the arm finishes forty measured renders');firstReadAt??=renders.length;reads.push({renderCount:renders.length,image});canvas.pixels.set(image.pixels);},getImageData(){return{data:new Uint8ClampedArray(canvas.pixels)};}};};return canvas;
 }
 function image(id){const result=surface(id,new Uint8ClampedArray(createHash('sha256').update(id).digest()));result.naturalWidth=4;result.naturalHeight=4;return result;}
 function record(id){return{status:'ready',image:image(id),metadata:structuredClone(originalMetadata.get(id)??metadata(id)),bodyAlpha:null,promise:Promise.resolve(true),controller:null};}
 class ArtFixture{
  constructor(options){Object.assign(this,options);this.records=new Map();artworks.push(this);}
  get(id){const r=this.records.get(id);return r?.status==='ready'?r:null;}
  isReady(id){return!!this.get(id);}
  load(id){assert.ok(ids.includes(id),'only two walker records may be loaded freshly');assert.equal(this.onChange,null);const r=record(id);this.records.set(id,r);return r.promise;}
  loadBodyAlpha(){assert.fail('no fresh body-alpha work in controlled normal fixture');}
  frame(id,options){const r=this.get(id),index=Math.floor((options.angle??0)*2)%8;return{id,image:r.image,metadata:r.metadata,frame:r.metadata.frames[index],placement:{x:options.foot.x-2,y:options.foot.y-3,width:4,height:4,depth:options.foot.y}};}
  releaseUnusedAssets(keep){assert.deepEqual(keep,[]);for(const [id,r]of this.records){assert.ok(ids.includes(id),'borrowed record must detach before release');r.controller?.abort();r.status='released';r.metadata=r.image=r.bodyAlpha=null;this.records.delete(id);}}
 }
 const originalArt=new ArtFixture({manifest:{assets:Object.fromEntries([...ids,'borrowed-player'].map(id=>[id,{}]))},baseURL:new URL('http://localhost:8851/assets/production/'),fetchImpl(){},ImageCtor:function OriginalImage(){},timeoutMs:15000,onChange(){assert.fail('fresh art must not notify main UI');},forceLegacyMetadataParse:false});for(const id of [...ids,'borrowed-player'])originalArt.records.set(id,record(id));const originalRecords=new Map([...originalArt.records].map(([id,r])=>[id,{record:r,descriptors:Object.getOwnPropertyDescriptors(r)}]));
 const originalRig={originalProduct:true,models:new Map([['preserved',{}]])},canvas=surface('main');
 const renderer={productionArt:originalArt,liveEnemies:originalRig,liveEnemiesPromise:Promise.resolve(originalRig),liveEnemiesLoading:false,dpr:1,cameraReady:true,lastNow:99,render(view,command,time){
  assert.notEqual(Object.getPrototypeOf(view),Game.prototype,'no unmeasured authoritative Game renderer prime');const rig=this.liveEnemies,art=this.productionArt;assert.notEqual(rig,originalRig);assert.notEqual(art,originalArt);assert.equal(rig.exactGPUAlphaBounds,false);assert.equal(rig.minGPUAlphaCells,12);assert.equal(art.records.get('borrowed-player'),originalArt.records.get('borrowed-player'));assert.equal(art.onChange,null);
  const arm=handles.indexOf(handles.find(handle=>handle.rig===rig)),frame=renders.filter(row=>row.arm===arm).length;assert.ok(frame<40);if(frame===0){assert.equal(rig.renderer.info.render.frame,0);assert.equal(this.cameraReady,false);assert.equal(this.lastNow,null);}
  if(behavior==='foreign-art-throw'){const descriptor=Object.getOwnPropertyDescriptor(this,'productionArt');Object.defineProperty(this,'productionArt',{...descriptor,writable:false,enumerable:!descriptor.enumerable});throw marker;}
  if(behavior==='render-throw')throw marker;
  this.liveEnemySelection=new Set(view.enemies.slice(0,12));rig.renderer.info.render.frame++;currentNative.current.stages['native.glSubmit']={calls:1,cpuMs:.25};currentProfile.current.stages['renderer.drawEnemy']={calls:view.enemies.length,cpuMs:.5};
  const input={time,command,player:[view.player.x,view.player.y,view.player.hp],enemies:view.enemies.map(e=>[e.id,e.x,e.y,e.angle,e.hitFlash]),particles:view.particles.map(p=>[p.x,p.y,p.life]),corpses:view.corpses.map(c=>[c.x,c.y,c.time])};const digest=createHash('sha256').update(JSON.stringify(input)).digest();canvas.pixels.set(digest);canvas.pixels.set(digest,32);renders.push({arm,frame,time,input:structuredClone(input)});this.cameraReady=true;this.lastNow=time;
 }};
 const owners=Object.fromEntries(['productionArt','liveEnemies','liveEnemiesPromise','liveEnemiesLoading'].map(key=>[key,Object.getOwnPropertyDescriptor(renderer,key)]));
 async function prepareNativeEnemyLaunch(keys,options){
  assert.ok(keys.length>0&&keys.length<=3);assert.ok(keys.every(key=>key.startsWith('enemy-')));assert.equal(options.timeoutMs,15000);const rig={size:256,models:new Map(keys.map(key=>[key,{}])),pending:new Map(),error:'',lost:false,releaseCalls:0,disposeCalls:0,lossCalls:0,releaseUnused(keep){assert.deepEqual(keep,[]);this.releaseCalls++;this.models.clear();},renderer:{info:{render:{frame:0}},getContext:()=>({isContextLost:()=>false}),dispose(){rig.disposeCalls++;},forceContextLoss(){rig.lossCalls++;}}};let adopted=false,disposed=false;
  const handle={rig,keys:[...keys],report:{prepared:true,textureUpload:{submitted:true,stateNormalized:true,error:''},shaders:keys.map(key=>({key,ready:true}))},adoptCalls:0,disposeCalls:0,isReady(){return !disposed&&!adopted&&behavior!=='not-ready';},adopt(){this.adoptCalls++;adopted=true;return rig;},dispose(){this.disposeCalls++;if(disposed||adopted)return;disposed=true;rig.releaseUnused([]);rig.renderer.dispose();rig.renderer.forceContextLoss();}};handles.push(handle);if(behavior==='pending')await prepareGate.promise;return handle;
 }
 async function prepareOriginalImageDecode(art,requested,options){assert.deepEqual(requested,ids);assert.equal(options.timeoutMs,15000);assert.equal(options.ownerCurrent(),true);assert.equal(renders.length%40,0);assert.equal(artworks.includes(art),true);decodes.push({art,requested:[...requested],at:renders.length});if(behavior==='decode-abort')await prepareGate.promise;const ready=behavior!=='decode-fallback';return{ready,status:ready?'ready':'fallback',error:ready?'':'unsupported',elapsedMs:2,attempted:ready?2:0,completed:ready?2:0,entries:ids.map(id=>({id,width:4,height:4,rawRGBAestimate:64,attempted:ready,ready,status:ready?'ready':'fallback',error:ready?'':'unsupported',elapsedMs:1})),totalRawEstimate:128,note:'controlled readiness only'};}
 function observer(list,nativeMode){const result={samples:[],current:null,unmeasured:[],stopped:false,beginFrame(meta){assert.equal(this.current,null);return this.current={...meta,stages:{}};},endFrame(){const frame=this.current;assert.ok(frame);this.current=null;this.samples.push(frame);return frame;},stop(){this.stopped=true;this.current=null;return{samples:this.samples,unmeasured:[],enabled:true,note:'controlled observer'};}};list.push(result);if(nativeMode)currentNative=result;else currentProfile=result;return result;}
 globalThis[symbol]={ProductionArt:ArtFixture,prepareNativeEnemyLaunch,prepareOriginalImageDecode,createFrameCostProfile:()=>observer(profiles,false),createNativeFrameProfile:()=>observer(nativeProfiles,true)};
 const shimURL='data:text/javascript;base64,'+Buffer.from('export const {ProductionArt,prepareNativeEnemyLaunch,prepareOriginalImageDecode,createFrameCostProfile,createNativeFrameProfile}=globalThis[Symbol.for('+JSON.stringify(Symbol.keyFor(symbol))+')];').toString('base64');
 const substituted=new Set(['./production-art.js?v=0.29.0','./boss-rig/native-launch-preparation.js','./qa-image-decode-preparation.js','./qa-frame-cost-profile.js','./qa-native-frame-profile.js']);
 const rewritten=source.replace(/(from\s*)(['"])(\.\/[^'"]+)\2/g,(match,prefix,quote,specifier)=>prefix+JSON.stringify(substituted.has(specifier)?shimURL:new URL(specifier,moduleURL).href));
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(name){assert.equal(name,'canvas');return surface();}}});Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock+=.125}});Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:callback=>{rafCalls++;queueMicrotask(()=>callback(clock));}});
 try{const module=await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'));return await run({module,renderer,canvas,originalArt,originalRig,originalRecords,owners,handles,artworks,decodes,profiles,nativeProfiles,renders,reads,images,beforeCalls,prepareGate,marker,options:{location,query,storage,beforeScenario:async info=>{assert.equal(renderer.productionArt,originalArt);assert.equal(renderer.liveEnemies,originalRig);beforeCalls.push(info);},onImage:info=>{assert.equal(renders.length,240,'PNG/UI callbacks flush only after all six cost arms');images.push(info);}},get firstReadAt(){return firstReadAt;},get rafCalls(){return rafCalls;}});}
 finally{prepareGate.resolve();delete globalThis[symbol];for(const [key,descriptor]of globals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}for(const [id,before]of originalRecords){assert.equal(originalArt.records.get(id),before.record);assert.deepEqual(Object.getOwnPropertyDescriptors(before.record),before.descriptors,'borrowed original record fields remain exact');}assert.equal(originalRig.models.size,1);}
}
const assertRestored=env=>{for(const [key,descriptor]of Object.entries(env.owners))assert.deepEqual(Object.getOwnPropertyDescriptor(env.renderer,key),descriptor);assert.ok(env.profiles.every(profile=>profile.stopped));assert.ok(env.nativeProfiles.every(profile=>profile.stopped));for(const art of env.artworks.slice(1))assert.equal(art.records.size,0);for(const handle of env.handles){assert.equal(handle.rig.models.size,0);assert.equal(handle.rig.disposeCalls,1);assert.equal(handle.rig.lossCalls,1);}};

test('normal60/180 CPU/decode/CPU arms include the first of forty .12 renders, preserve real combat/RNG/events/motion, and release only owned images/native rigs',async()=>{
 const observer=await readFile(new URL('../dist/qa-frame-cost-profile.js',import.meta.url));assert.equal(createHash('sha256').update(observer).digest('hex'),'3b2f3774d703f84952c501f85b001d169e6fbbda024d407478bd989539026cce','original cost observer stays pinned for this experiment');
 await environment('normal',async env=>{
  const {game,report}=await env.module.compareImageDecodeCombat(env.renderer,env.canvas,env.options);assert.ok(game.snapshot());assert.equal(report.cleanup.complete,true);assert.deepEqual(env.beforeCalls,[{count:60,weapon:'shotgun'},{count:180,weapon:'nailgun'}]);assert.equal(env.handles.length,6);assert.equal(env.artworks.length,7);assert.equal(env.decodes.length,2);assert.equal(env.firstReadAt,40);assert.equal(env.renders.length,240);assert.equal(env.rafCalls,30);assert.equal(env.images.length,6);assert.deepEqual(env.decodes.map(row=>row.at),[40,160]);
  for(const result of report.reports){assert.equal(result.identicalCombatState,true);assert.equal(result.identicalEvents,true);assert.equal(result.identicalActorMotion,true);assert.equal(result.identicalUpgradeChoices,true);assert.deepEqual(result.candidateVsFirst,{different:0,maxDelta:0});assert.deepEqual(result.repeatedCPU,{different:0,maxDelta:0});assert.deepEqual(result.passes.map(pass=>pass.decode),[false,true,false]);assert.deepEqual(result.passes.map(pass=>pass.successfulCandidate),[false,true,false]);for(const pass of result.passes){assert.equal(pass.allSamples.length,40);assert.equal(pass.firstFrame,pass.allSamples[0]);assert.equal(pass.native.samples.length,40);assert.ok(pass.time>4.7&&pass.time<5);assert.equal(pass.nativePreparation.sourceFrameBeforeFirstRender,0);assert.equal(pass.nativePreparation.gpuEnabled,false);assert.equal(pass.startupPlusFirstMs,pass.preparationMs+pass.firstFrame.combinedMs);assert.equal(pass.startupPlusAll40CallMs,pass.preparationMs+pass.all40Summary.combinedMs.sumMs);assert.equal(pass.sourceQuality.length,2);for(const quality of pass.sourceQuality){assert.equal(quality.metadataSame,true);assert.equal(quality.framePlacementActionSelectionsSame,true);assert.equal(quality.sampledCrops.length,8);assert.ok(quality.sampledCrops.every(crop=>crop.different===0));}}}
  assertRestored(env);
 });
});

test('unsupported explicit decode remains a visible unsuccessful candidate while original normal combat still matches',async()=>{
 await environment('decode-fallback',async env=>{const {report}=await env.module.compareImageDecodeCombat(env.renderer,env.canvas,env.options);for(const density of report.reports){assert.equal(density.passes[1].successfulCandidate,false);assert.equal(density.passes[1].decodePreparation.status,'fallback');assert.equal(density.passes[1].decodePreparation.error,'unsupported');assert.equal(density.identicalCombatState,true);}assert.equal(report.cleanup.complete,true);assertRestored(env);});
});

test('origin/brand/pre-abort guards have zero owner/service IO; pending preparation abort and external same-value descriptor changes preserve original owners',async()=>{
 await environment('pending',async env=>{
  const hostile=new Proxy({}, {get(){assert.fail('guarded owner getter');},getOwnPropertyDescriptor(){assert.fail('guarded owner descriptor');}});
  for(const options of [{...env.options,location:new URL('http://localhost:8806/?qa&qa-memory')},{...env.options,storage:{}},{...env.options,query:new URLSearchParams('qa')}])await assert.rejects(env.module.compareImageDecodeCombat(hostile,env.canvas,options),/memory-origin-required/);
  const pre=new AbortController();pre.abort();await assert.rejects(env.module.compareImageDecodeCombat(hostile,env.canvas,{...env.options,signal:pre.signal}),/aborted/);assert.equal(env.handles.length,0);assert.equal(env.artworks.length,1);
  const controller=new AbortController(),operation=env.module.compareImageDecodeCombat(env.renderer,env.canvas,{...env.options,signal:controller.signal});await until(()=>env.handles.length===1);controller.abort();await assert.rejects(operation,/aborted/);env.prepareGate.resolve();await turn();assert.equal(env.handles[0].disposeCalls,1);assertRestored(env);
 });
 await environment('pending',async env=>{
  const operation=env.module.compareImageDecodeCombat(env.renderer,env.canvas,env.options);await until(()=>env.handles.length===1);const foreign={...env.owners.liveEnemies,writable:false};Object.defineProperty(env.renderer,'liveEnemies',foreign);env.prepareGate.resolve();const error=await operation.then(()=>assert.fail('stale owner accepted'),error=>error);assert.match(error.message,/owner-changed/);assert.deepEqual(Object.getOwnPropertyDescriptor(env.renderer,'liveEnemies'),foreign);assert.equal(error.cleanup.externalReplacementPreserved,true);assert.equal(env.handles[0].disposeCalls,1);for(const key of ['productionArt','liveEnemiesPromise','liveEnemiesLoading'])assert.deepEqual(Object.getOwnPropertyDescriptor(env.renderer,key),env.owners[key]);
 });
});

test('original render error identity and not-ready preparation clean owned resources without pixel prewarming or original mutations',async()=>{
 for(const behavior of ['render-throw','not-ready'])await environment(behavior,async env=>{const error=await env.module.compareImageDecodeCombat(env.renderer,env.canvas,env.options).then(()=>assert.fail('controlled failure succeeded'),error=>error);if(behavior==='render-throw')assert.equal(error,env.marker);else assert.match(error.message,/native-original-preparation-required/);assert.equal(env.reads.length,0);assert.equal(env.images.length,0);assertRestored(env);});
});

test('same-value external art descriptor ownership preserves every current record and original throw identity during cleanup',async()=>{
 await environment('foreign-art-throw',async env=>{
  const error=await env.module.compareImageDecodeCombat(env.renderer,env.canvas,env.options).then(()=>assert.fail('original render throw lost'),error=>error);
  assert.equal(error,env.marker);const retained=env.artworks[1],descriptor=Object.getOwnPropertyDescriptor(env.renderer,'productionArt');
  assert.equal(descriptor.value,retained);assert.equal(descriptor.writable,false);assert.equal(descriptor.enumerable,!env.owners.productionArt.enumerable);
  assert.equal(retained.records.size,3);for(const id of ids){const record=retained.records.get(id);assert.equal(record.status,'ready');assert.ok(record.image);assert.ok(record.metadata);}
  assert.equal(retained.records.get('borrowed-player'),env.originalRecords.get('borrowed-player').record);
  assert.equal(error.cleanup.complete,false);assert.equal(error.cleanup.externalReplacementPreserved,true);assert.equal(error.cleanup.releasedArts,0);assert.equal(error.cleanup.arms[0].currentArtPreserved,true);assert.equal(error.cleanup.arms[0].ownedRecordsRemaining,3);assert.ok(error.cleanup.errors.some(row=>row.error==='image-decode-current-product-art-preserved'));
  for(const key of ['liveEnemies','liveEnemiesPromise','liveEnemiesLoading'])assert.deepEqual(Object.getOwnPropertyDescriptor(env.renderer,key),env.owners[key]);
  assert.equal(env.handles[0].rig.models.size,0);assert.equal(env.handles[0].rig.disposeCalls,1);assert.equal(env.handles[0].rig.lossCalls,1);assert.equal(env.reads.length,0);
 });
});
