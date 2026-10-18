import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {Game} from '../dist/engine.js';
import {createQAStorage} from '../dist/qa-storage.js';
import {nativeLaunchKeys} from '../dist/native-launch-plan.js';

// Exercise the actual QA orchestrator with controlled preparation/renderer
// services and the actual Game. No shader, GLB, GPU, image or timing validation
// is claimed by this orchestration test; existing actual quality QA is delegated.
let moduleNumber=0;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const locationFor=address=>new URL(address??'http://localhost:8851/?qa&qa-memory');
const ownerKeys=['liveEnemies','liveEnemiesPromise','liveEnemiesLoading','nativeLaunchReport'];
const ownerState=renderer=>Object.fromEntries(ownerKeys.map(key=>[key,Object.getOwnPropertyDescriptor(renderer,key)]));
const gameState=game=>{const snapshot=game.snapshot();assert.ok(snapshot);return structuredClone({snapshot,events:game.events,particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash,random:game.random.getState(),visualRandom:game.visualRandom.getState()});};
function noReferences(value,forbidden,seen=new Set()){if(value===null||typeof value!=='object')return;assert.equal(forbidden.has(value),false,'report retains no owned rig, helper, handle, Game or renderer');if(seen.has(value))return;seen.add(value);for(const child of Object.values(value))noReferences(child,forbidden,seen);}
async function until(predicate){for(let n=0;n<60&&!predicate();n++)await turn();assert.ok(predicate(),'expected asynchronous phase was reached');}

async function environment(mode,run){
 const source=await readFile(new URL('../dist/qa-gpu-alpha-preupload.js',import.meta.url),'utf8'),events=[],rigs=[],handles=[],gpuHelpers=[],profiles=[],prepareCalls=[],compareCalls=[],qualityCalls=[],images=[],activeProfiles=new Map(),prepareGate=deferred(),warmGate=deferred(),imageGate=deferred(),renderFailure=Error('controlled-combat-render'),cleanupFailure=Error('controlled-renderer-cleanup'),restoreFailure=Error('controlled-owner-restore');
 const location=locationFor(),query=location.searchParams,storage=createQAStorage(query,()=>{assert.fail('persistent storage is forbidden');}),prior={originalProductRig:true},priorPromise=Promise.resolve(prior),priorReport={originalProductPreparation:true};
 let foreignDescriptors=null,restoreAttempts=0;
 const canvas={width:640,height:360,dataset:{},toDataURL:()=> 'data:image/png;base64,controlled'},baseRenderer={productionArt:{original:true},render(game){
  const rig=this.liveEnemies;assert.ok(rig&&rig!==prior);assert.equal(rig.adopted,true,'combat can draw only after candidate ownership transfer');events.push(['combat-render',rig.number]);if(mode==='render-throw'||mode==='render-cleanup-throw')throw renderFailure;this.liveEnemySelection=new Set(game.enemies.slice(0,12));if(mode==='native-none')return;rig.renderer.info.render.frame++;
  const profile=activeProfiles.get(rig);if(profile?.current)profile.current.stages['native.glSubmit']={calls:1,cpuMs:.25};
  if(rig.exactGPUAlphaBounds&&mode!=='gpu-unused'){rig.gpuAlphaStats.frames+=12;rig.gpuAlphaStats.bytesRead=48;if(rig.gpuAlphaBounds){rig.gpuAlphaBounds.reads++;rig.gpuAlphaBounds.bytesRead=48;}if(profile?.current)for(const key of ['gpuAlpha.readPixels','gpuAlpha.rowsSubmit','gpuAlpha.boundsSubmit','gpuColour.surface'])profile.current.stages[key]={calls:1,cpuMs:.125};}
  if(mode==='rig-error')rig.error='controlled-native-error';
  if(mode==='foreign-render'&&!foreignDescriptors){const foreign={foreignProductRig:true},promise=Promise.resolve(foreign);for(const [key,value]of [['liveEnemies',foreign],['liveEnemiesPromise',promise],['liveEnemiesLoading',false]])Object.defineProperty(this,key,{value,writable:false,configurable:true,enumerable:true});foreignDescriptors=ownerState(this);}
  if(mode==='samevalue-descriptor'&&!foreignDescriptors){const descriptor=Object.getOwnPropertyDescriptor(this,'liveEnemies');Object.defineProperty(this,'liveEnemies',{...descriptor,writable:false,enumerable:!descriptor.enumerable});foreignDescriptors={liveEnemies:Object.getOwnPropertyDescriptor(this,'liveEnemies')};}
 }};
 const renderer=mode==='restore-throw'?new Proxy(baseRenderer,{defineProperty(target,key,descriptor){if(key==='liveEnemies'&&descriptor.value===prior&&Object.hasOwn(target,key)&&Object.getOwnPropertyDescriptor(target,key).value!==prior){restoreAttempts++;throw restoreFailure;}return Reflect.defineProperty(target,key,descriptor);}}):baseRenderer;
 Object.defineProperties(renderer,{liveEnemies:{value:prior,writable:true,configurable:true,enumerable:false},liveEnemiesPromise:{value:priorPromise,writable:true,configurable:true,enumerable:true},liveEnemiesLoading:{value:false,writable:true,configurable:true,enumerable:false},nativeLaunchReport:{value:priorReport,writable:true,configurable:true,enumerable:true}});
 const beforeOwner=ownerState(renderer),beforePrototype=Object.getOwnPropertyDescriptors(Game.prototype);
 class LiveBossRigFixture{
  constructor(options){assert.deepEqual(options,{size:256,registryFile:'enemy-registry.json'});this.number=rigs.length;this.size=256;this.models=new Map();this.pending=new Map();this.error='';this.exactGPUAlphaBounds=false;this.verifyExactGPUAlphaBounds=false;this.minGPUAlphaCells=12;this.gpuPoseBounds=false;this.directAlphaReadback=false;this.cropNativeComposite=false;this.batchInkComposite=false;this.gpuAlphaStats={frames:0,verified:0,mismatches:0,fallbacks:0,bytesRead:0};this.releases=0;this.disposals=0;this.losses=0;this.adopted=false;this.scene=new THREE.Scene();this.camera=new THREE.Camera();const owner=this;
   const gl={isContextLost:()=>false},viewport=new THREE.Vector4(0,0,1024,768),scissor=new THREE.Vector4(0,0,1024,768);this.renderer={domElement:{width:1024,height:768},info:{programs:[],render:{frame:0},memory:{textures:0}},autoClear:true,getContext:()=>gl,getRenderTarget:()=>null,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,getViewport:value=>value.copy(viewport),getScissor:value=>value.copy(scissor),getScissorTest:()=>false,dispose(){owner.disposals++;events.push(['renderer-dispose',owner.number]);if(mode==='render-cleanup-throw'&&owner.adopted&&!owner.quality)throw cleanupFailure;},forceContextLoss(){owner.losses++;events.push(['context-loss',owner.number]);}};rigs.push(this);events.push(['construct',this.number]);
  }
  async load(key){events.push(['model-load',this.number,key]);this.models.set(key,{subject:new THREE.Group()});return true;}
  releaseUnused(keys){assert.deepEqual(keys,[]);this.releases++;this.models.clear();this.gpuAlphaBounds?.dispose();events.push(['release',this.number]);}
  releaseExactGPUAlpha(){this.gpuAlphaBounds?.dispose();}
 }
 class GPUAlphaBoundsFixture{
  constructor(){this.reads=0;this.bytesRead=0;this.rawBytes=0;this.lastError='';this.disposeCalls=0;this.disposed=false;gpuHelpers.push(this);}
  async warmup(glRenderer,width,height,count,options={}){this.owner=glRenderer;const rig=rigs.find(value=>value.renderer===glRenderer);assert.ok(rig);if(rig.quality){assert.equal(rig.adopted,true);assert.deepEqual([width,height,count],[1024,512,8]);}else{assert.equal(rig.adopted,false,'reduction compilation precedes adoption');assert.equal(glRenderer.info.render.frame,0,'preparation uses a never-drawn candidate');assert.deepEqual([width,height,count],[1024,768,12]);}assert.equal(options.idleLeaseMs,15000);events.push(['gpu-warmup',rig.number]);if(!rig.quality&&mode==='warm-throw')throw Error('controlled-gpu-warmup');if(!rig.quality&&mode==='warm-false')return false;if(!rig.quality&&mode==='warm-deferred')await warmGate.promise;if(options.signal?.aborted||this.disposed)return false;this.rawBytes=(width*height+count*256+count)*4;this.rowMaterial={ownedRows:true};this.warmReady={readsAtWarmup:this.reads};events.push(['gpu-ready',rig.number]);return true;}
  retainWarmupResources(){return !this.disposed&&!!this.warmReady&&this.reads===0;}
  dispose(){this.disposeCalls++;this.disposed=true;this.rawBytes=0;this.bytesRead=0;this.warmReady=null;}
 }
 const retire=rig=>{if(!rig||rig.retired)return;rig.retired=true;rig.releaseUnused([]);rig.renderer.dispose();rig.renderer.forceContextLoss();};
 async function prepareNativeEnemyLaunch(keys,options={}){
  const rig=new LiveBossRigFixture({size:256,registryFile:'enemy-registry.json'});prepareCalls.push({keys:[...keys],options,rig});events.push(['prepare-start',rig.number,[...keys]]);
  const report={keys:[...keys],textureUpload:{submitted:true,stateNormalized:true,error:'',textures:keys.map((key,index)=>({uuid:key+'-original',width:4096,height:4096,version:1,sourceVersion:1,index}))},shaders:keys.map(key=>({key,ready:true})),prepared:true,error:''};
  const handle={rig,report,adoptCalls:0,disposeCalls:0,readyCalls:0,disposed:false,adopted:false,isReady(){this.readyCalls++;events.push(['ready-check',rig.number]);return !this.disposed&&!options.signal?.aborted&&mode!=='stale'&&!(mode==='stale-after-warmup'&&rig.gpuAlphaBounds?.warmReady);},adopt(){this.adoptCalls++;events.push(['adopt',rig.number]);if(mode==='adopt-null')return null;if(!this.isReady())return null;this.adopted=rig.adopted=true;return rig;},dispose(){this.disposeCalls++;if(this.disposed)return;this.disposed=true;events.push(['handle-dispose',rig.number]);if(!this.adopted)retire(rig);}};handles.push(handle);
  if(mode==='prepare-deferred')await prepareGate.promise;
  if(mode==='prepare-throw'){retire(rig);throw Error('controlled-native-prepare');}
  if(mode==='prepare-null'){retire(rig);return null;}
  if(options.signal?.aborted){handle.dispose();return null;}
  for(const key of keys){await rig.load(key);}events.push(['union-upload',rig.number,[...keys]]);rig.renderer.info.memory.textures=keys.length;for(const key of keys){events.push(['shader-ready',rig.number,key]);rig.renderer.info.programs.push({originalShader:key});}events.push(['prepare-ready',rig.number]);return handle;
 }
 function createNativeFrameProfile(rig){const profile={samples:[],current:null,stopped:false,beginFrame(meta){this.current={...meta,stages:{}};return this.current;},endFrame(meta){if(!this.current)return null;const sample={...this.current,...meta};this.current=null;this.samples.push(sample);return sample;},stop(){this.stopped=true;this.current=null;activeProfiles.delete(rig);return{samples:this.samples,unmeasured:[],note:'controlled call-wall profile'};}};profiles.push(profile);activeProfiles.set(rig,profile);return profile;}
 const qualityReports=['walker','runner','shield','screamer','gas','elite','collector'].map(type=>({type,poses:8,mode:'gpuAlpha',comparisons:[{enabled:true,different:0,maxDelta:0,geometrySame:true,animationSame:true},{enabled:false,different:0,maxDelta:0,geometrySame:true,animationSame:true}],memory:[false,true,false].map(enabled=>({enabled,outputsPrivate:true,gpuAlphaStats:{frames:enabled?8:0,mismatches:0,fallbacks:0}}))}));
 async function compareNativeComposite(main,options){qualityCalls.push(options);assert.equal(main,renderer);assert.equal(options.mode,'gpuAlpha');assert.notEqual(main.liveEnemies,prior);const rig=main.liveEnemies;rig.quality=true;events.push(['quality',rig.number]);if(mode==='quality-throw')throw Error('controlled-original-quality');
  if(mode==='quality-deferred'){const load=prepareGate.promise.then(()=>{rig.models.set('enemy-late-original-type',{subject:new THREE.Group()});events.push(['late-model',rig.number]);});rig.pending.set('enemy-late-original-type',load);await load;rig.pending.delete('enemy-late-original-type');}
  for(const item of qualityReports){rig.models.clear();await rig.load('enemy-'+item.type);for(const enabled of [false,true,false]){rig.exactGPUAlphaBounds=enabled;rig.verifyExactGPUAlphaBounds=enabled;rig.minGPUAlphaCells=1;await options.beforePass?.({type:item.type,enabled,jobs:Array.from({length:8},()=>({originalPose:true}))});rig.renderer.info.render.frame++;if(enabled&&rig.gpuAlphaBounds){rig.gpuAlphaBounds.reads++;rig.gpuAlphaBounds.bytesRead=32;}}await options.onImage?.(item.type,canvas.toDataURL());}
  rig.exactGPUAlphaBounds=false;rig.verifyExactGPUAlphaBounds=false;rig.minGPUAlphaCells=12;rig.releaseExactGPUAlpha();return qualityReports;
 }
 async function compareBulletBroadphase(main,target,options){
  compareCalls.push(options);assert.equal(main,renderer);assert.equal(target,canvas);assert.equal(options.legacyBulletComparison,false);assert.equal(Object.hasOwn(options,'input'),false,'normal fixed combat input is delegated unchanged');assert.equal(options.frames,110,'the existing 110-frame workload is not shortened');assert.equal(options.framePacing,'batch8');
  const initial=new Game({seed:774,missionId:'mission-01',weapon:options.weapon});for(const type of ['runner','gas','shield','walker','walker','walker','walker'])assert.ok(initial.spawnEnemy(type,450));const checkpoint=initial.snapshot();assert.ok(checkpoint);const expectedKeys=nativeLaunchKeys({game:initial});assert.ok(expectedKeys.length>=2&&expectedKeys.length<=3);const passes=[],states=[],eventStreams=[];let game;
  for(const force of [true,false,true]){
   game=Game.restore(checkpoint,{resumePlaying:true});assert.ok(game);const control=Game.restore(checkpoint,{resumePlaying:true}),before=gameState(game);await options.onPass(force,game);assert.deepEqual(gameState(game),before,'preparation never ticks or changes the actual Game');const prep=prepareCalls.at(-1);assert.deepEqual(prep.keys,expectedKeys);assert.equal(main.liveEnemies,prep.rig);assert.equal(prep.rig.adopted,true);options.onProgress?.(force);const drained=[],normal=[];
   for(let frame=0;frame<110;frame++){const meta={frame,force,warmup:frame<10,callbackCpuMs:.5};options.onFrameStart?.(meta,game);const input={moveX:.3,moveY:.2,shoot:true,fireMode:'manual',aimX:1400,aimY:930};if(game.state==='upgrade'){assert.equal(control.state,'upgrade');const id=game.choices[0].id;game.chooseUpgrade(id);control.chooseUpgrade(id);}control.tick(1/60,input);game.tick(1/60,input);normal.push(...control.drainEvents());drained.push(...game.drainEvents());try{main.render(game);}finally{options.onFrameEnd?.(meta,game);}}
   assert.deepEqual(gameState(game),gameState(control));assert.deepEqual(drained,normal);eventStreams.push(drained);states.push(gameState(game));await options.onImage?.(force,target.toDataURL());passes.push({force,frames:100,renderedFrames:110,fixedTicks:110,wallSeconds:.125,normalWorkloadDelegated:true});
  }
  assert.deepEqual(states[1],states[0]);assert.deepEqual(states[2],states[0]);assert.deepEqual(eventStreams[1],eventStreams[0]);assert.deepEqual(eventStreams[2],eventStreams[0]);return{game,report:{count:options.count,weapon:options.weapon,passes,pixels:[{different:0,maxDelta:0},{different:0,maxDelta:0}],identicalCombatState:true,identicalEvents:true}};
 }
 const key=Symbol.for('dead-signal-gpu-alpha-preupload-test-'+moduleNumber++),services={LiveBossRig:LiveBossRigFixture,GPUAlphaBounds:GPUAlphaBoundsFixture,prepareNativeEnemyLaunch,compareNativeComposite,compareBulletBroadphase,createNativeFrameProfile};globalThis[key]=services;
 const shim='const services=globalThis[Symbol.for('+JSON.stringify(Symbol.keyFor(key))+')];export const {LiveBossRig,GPUAlphaBounds,prepareNativeEnemyLaunch,compareNativeComposite,compareBulletBroadphase,createNativeFrameProfile}=services;',shimURL='data:text/javascript;base64,'+Buffer.from(shim).toString('base64'),moduleURL=new URL('../dist/qa-gpu-alpha-preupload.js',import.meta.url);
 const shimPaths=new Set(['./boss-rig/live-boss.js','./boss-rig/gpu-alpha-bounds.js','./boss-rig/native-launch-preparation.js','./qa-native-composite.js','./qa-bullet-broadphase.js','./qa-native-frame-profile.js']);
 const imported=source.replace(/(from\s*|import\()(['"])(\.\/?[^'"]+)\2/g,(match,prefix,quote,specifier)=>prefix+JSON.stringify(shimPaths.has(specifier)?shimURL:new URL(specifier,moduleURL).href));
 const globals=new Map(['document','performance','requestAnimationFrame'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));let domCalls=0,now=0;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false,visibilityState:'visible',createElement(){domCalls++;assert.fail('the orchestrator must delegate quality/canvas operations');}}});Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now+=.125}});Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:callback=>{queueMicrotask(()=>callback(0));return 1;}});
 try{const module=await import('data:text/javascript;base64,'+Buffer.from(imported).toString('base64'));return await run({compare:module.compareGPUAlphaPreupload,renderer,canvas,storage,location,query,prior,beforeOwner,events,rigs,handles,gpuHelpers,profiles,prepareCalls,compareCalls,qualityCalls,qualityReports,images,prepareGate,warmGate,imageGate,renderFailure,cleanupFailure,restoreFailure,get foreignDescriptors(){return foreignDescriptors;},get restoreAttempts(){return restoreAttempts;},get domCalls(){return domCalls;}});}
 finally{prepareGate.resolve();warmGate.resolve();imageGate.resolve();delete globalThis[key];for(const [name,descriptor]of globals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}assert.deepEqual(Object.getOwnPropertyDescriptors(Game.prototype),beforePrototype);}
}
function cleaned(env,{foreign=false}={}){
 if(!foreign)assert.deepEqual(ownerState(env.renderer),env.beforeOwner,'all prior owner property descriptors are restored exactly');
 for(const rig of env.rigs){assert.equal(rig.disposals,1,'each owned context is disposed once');assert.equal(rig.losses,1,'each owned context is lost once');assert.ok(rig.releases>=1);assert.equal(rig.models.size,0);}
 assert.ok(env.profiles.every(profile=>profile.stopped));assert.ok(env.gpuHelpers.every(helper=>helper.rawBytes===0));assert.equal(env.domCalls,0);
}

test('fresh CPU/GPU/CPU combat arms share original union preupload and shaders before optional draw-free GPU warmup and adoption',async()=>{
 await environment('normal',async env=>{
  const result=await env.compare(env.renderer,env.canvas,{storage:env.storage,location:env.location,query:env.query,onImage:image=>env.images.push(image)});assert.ok(result.game?.snapshot());assert.equal(env.qualityCalls.length,1);assert.equal(env.compareCalls.length,2);assert.deepEqual(env.compareCalls.map(options=>[options.count,options.weapon]),[[60,'shotgun'],[180,'nailgun']]);assert.equal(env.prepareCalls.length,7);assert.equal(env.handles.length,7);assert.equal(env.rigs.length,7,'one independent original quality rig and six fresh combat rigs');assert.equal(env.gpuHelpers.length,3,'one separate quality helper and the two combat B helpers');assert.equal(result.report.original56,env.qualityReports,'existing 7x8 quality output is preserved without rewriting its comparisons');assert.equal(result.report.qualityWarmups.length,7);assert.ok(result.report.qualityWarmups.every(value=>value.ready&&value.stateRestored&&value.readsDuringPreparation===0));assert.deepEqual(env.prepareCalls[0].keys,['enemy-walker']);
  for(let i=1;i<env.prepareCalls.length;i++){
   const {rig,keys}=env.prepareCalls[i];assert.ok(keys.length<=3);assert.equal(new Set(keys).size,keys.length);assert.equal(env.handles[i].adoptCalls,1);assert.ok(env.handles[i].readyCalls>=2);const index=name=>env.events.findIndex(event=>event[0]===name&&event[1]===rig.number);assert.ok(index('union-upload')>=0);assert.ok(index('union-upload')<index('shader-ready'));assert.ok(index('shader-ready')<index('adopt'));assert.ok(index('adopt')<index('combat-render'));if((i-1)%3===1){assert.ok(index('prepare-ready')<index('gpu-warmup'));assert.ok(index('gpu-ready')<index('adopt'));}else assert.equal(index('gpu-warmup'),-1);
  }
  for(const scenario of result.report.reports){assert.deepEqual(scenario.passes.map(pass=>pass.gpuEnabled),[false,true,false]);assert.equal(scenario.identicalCombatState,true);assert.equal(scenario.identicalEvents,true);assert.ok(scenario.pixels.every(value=>value.different===0&&value.maxDelta===0));for(const pass of scenario.passes){assert.equal(pass.observedFrames,110);assert.equal(pass.nativeGlSubmitCalls,110);assert.equal(pass.all110CallbackCost.sumMs,55);assert.equal(pass.steadyCallbackCost.sumMs,50);assert.equal(pass.preparation.commonOriginalTextureAndShaderPreparation,true);assert.ok(pass.preparation.keys.length<=3);assert.equal(pass.preparation.native.textureUpload.submitted,true);assert.ok(pass.preparation.native.shaders.every(shader=>shader.ready));assert.equal(pass.preparation.alphaWarmupEnabled,pass.gpuEnabled);assert.equal(pass.preparation.alphaIdleLeaseMs,pass.gpuEnabled?15000:0);assert.equal(pass.gpuUsedCells,pass.gpuEnabled?1320:0);assert.equal(pass.gpuReads,pass.gpuEnabled?110:0);assert.equal(pass.gpuReadBytes,pass.gpuEnabled?5280:0);assert.equal(pass.gpuReadPixelsCalls,pass.gpuEnabled?110:0);assert.equal(pass.gpuRequestedReadBytes,pass.gpuEnabled?5280:0);assert.equal(pass.startupPlusPassWallMs,pass.preparation.totalPreparationMs+125);assert.equal(pass.startupPlusAll110CallbackMs,pass.preparation.totalPreparationMs+55);}}
  assert.equal(result.report.cleanup.complete,true);assert.equal(result.report.cleanup.ownedRigCount,7);assert.equal(result.report.cleanup.retiredRigCount,7);assert.equal(result.report.cleanup.handleDisposals,7);assert.equal(result.report.cleanup.ownerDescriptorsRestored,true);assert.deepEqual(result.report.cleanup.errors,[]);assert.ok(result.report.cleanup.retired.every(entry=>entry.modelsRemaining===0&&entry.helperRawBytesAfterRelease===0));noReferences(result.report,new Set([...env.rigs,...env.handles,...env.gpuHelpers,result.game,env.renderer,env.prior]));const reportText=JSON.stringify(result.report);assert.match(reportText,/preupload|texture/i);assert.match(reportText,/not.*FPS|not presented|not.*GPU execution/i);cleaned(env);
 });
});

test('protected origins and nonbranded memory storage reject before model, shader, GPU, canvas or combat service access',async()=>{
 await environment('normal',async env=>{
  for(const address of ['http://localhost:8806/?qa&qa-memory','http://localhost:8852/?qa&qa-memory','https://localhost:8851/?qa&qa-memory','http://localhost.evil.example:8851/?qa&qa-memory','http://example.com:8851/?qa&qa-memory','http://localhost:8851/?qa','http://localhost:8851/?qa-memory']){const location=locationFor(address);await assert.rejects(env.compare(env.renderer,env.canvas,{storage:env.storage,location,query:location.searchParams}));}
  let storageIO=0;const fake={get getItem(){storageIO++;throw Error('persistent access');},get setItem(){storageIO++;throw Error('persistent access');}};for(const storage of [undefined,{},fake])await assert.rejects(env.compare(env.renderer,env.canvas,{storage,location:env.location,query:env.query}));assert.equal(storageIO,0);assert.deepEqual(env.events,[]);assert.deepEqual(env.rigs,[]);assert.deepEqual(env.gpuHelpers,[]);assert.deepEqual(env.prepareCalls,[]);assert.deepEqual(env.qualityCalls,[]);assert.deepEqual(env.compareCalls,[]);cleaned(env);
 });
});

test('quality/preparation/warmup/readiness/adoption/render failures dispose every owned context and restore prior pointers',async()=>{
 for(const mode of ['quality-throw','prepare-null','prepare-throw','warm-false','warm-throw','stale','stale-after-warmup','adopt-null','render-throw','native-none','gpu-unused','rig-error'])await environment(mode,async env=>{
  await assert.rejects(env.compare(env.renderer,env.canvas,{storage:env.storage,location:env.location,query:env.query}),undefined,mode);if(['prepare-null','prepare-throw','stale','adopt-null'].includes(mode))assert.equal(env.events.some(event=>event[0]==='combat-render'),false);if(['warm-false','warm-throw','stale-after-warmup'].includes(mode)){const failed=env.handles.at(-1);assert.equal(failed.adoptCalls,0,'failed GPU candidate is never adopted');}cleaned(env);
 });
});

test('aborting a pending preparation or GPU warmup settles promptly and late completion never adopts or leaks its owned candidate',async()=>{
 for(const mode of ['prepare-deferred','warm-deferred','quality-deferred'])await environment(mode,async env=>{
  const controller=new AbortController(),pending=env.compare(env.renderer,env.canvas,{storage:env.storage,location:env.location,query:env.query,signal:controller.signal});let outcome;pending.then(value=>{outcome={value};},error=>{outcome={error};});await until(()=>mode==='prepare-deferred'?env.prepareCalls.length>0:mode==='quality-deferred'?env.rigs.some(rig=>rig.pending.size>0):env.rigs.some(rig=>!rig.quality&&rig.gpuAlphaBounds));const current=env.handles.at(-1),adoptCalls=current.adoptCalls;assert.equal(adoptCalls,mode==='quality-deferred'?1:0);controller.abort();await until(()=>outcome!==undefined);assert.ok(outcome.error,'cancelled comparison rejects');assert.equal(current.adoptCalls,adoptCalls);assert.deepEqual(ownerState(env.renderer),env.beforeOwner);env.prepareGate.resolve();env.warmGate.resolve();await turn();await turn();assert.equal(current.adoptCalls,adoptCalls,'late work cannot transfer ownership again');if(mode==='quality-deferred'){assert.ok(env.events.some(event=>event[0]==='late-model'));assert.ok(outcome.error.cleanup.retired.some(entry=>entry.lateReleasesScheduled===1&&entry.lateReleasesSettled===1));assert.ok(current.rig.releases>=2,'late original CPU models are released after the context was retired');}cleaned(env);
 });
});

test('foreign owner/promise replacements during pending preparation remain untouched while only the QA candidate is cleaned',async()=>{
 await environment('prepare-deferred',async env=>{
  const controller=new AbortController(),pending=env.compare(env.renderer,env.canvas,{storage:env.storage,location:env.location,query:env.query,signal:controller.signal});pending.catch(()=>{});await until(()=>env.prepareCalls.length===1);const foreign={foreignProductRig:true},promise=Promise.resolve(foreign),foreignRigDescriptor={value:foreign,writable:false,enumerable:true,configurable:true},foreignPromiseDescriptor={value:promise,writable:false,enumerable:false,configurable:true};Object.defineProperty(env.renderer,'liveEnemies',foreignRigDescriptor);Object.defineProperty(env.renderer,'liveEnemiesPromise',foreignPromiseDescriptor);env.prepareGate.resolve();await assert.rejects(pending);assert.deepEqual(Object.getOwnPropertyDescriptor(env.renderer,'liveEnemies'),foreignRigDescriptor);assert.deepEqual(Object.getOwnPropertyDescriptor(env.renderer,'liveEnemiesPromise'),foreignPromiseDescriptor);assert.equal(env.handles[0].adoptCalls,0);cleaned(env,{foreign:true});
 });
});

test('foreign replacements after adoption and same-value descriptor attribute changes are preserved exactly',async()=>{
 for(const mode of ['foreign-render','samevalue-descriptor'])await environment(mode,async env=>{
  let failure;try{await env.compare(env.renderer,env.canvas,{storage:env.storage,location:env.location,query:env.query});assert.fail('a changed external owner must end the comparison');}catch(error){failure=error;}
  assert.match(failure.message,/owner-changed/);assert.ok(env.foreignDescriptors);for(const [key,descriptor]of Object.entries(env.foreignDescriptors))assert.deepEqual(Object.getOwnPropertyDescriptor(env.renderer,key),descriptor,key+' external descriptor is preserved');assert.equal(failure.cleanup.externalReplacementPreserved,true);assert.equal(failure.cleanup.complete,false);cleaned(env,{foreign:true});
 });
});

test('restoration failure cannot return a valid report, and cleanup failure cannot replace an original rendering error',async()=>{
 await environment('restore-throw',async env=>{
  let failure;try{await env.compare(env.renderer,env.canvas,{storage:env.storage,location:env.location,query:env.query});assert.fail('owner restoration failure cannot report success');}catch(error){failure=error;}
  assert.match(failure.message,/cleanup-failed/);assert.ok(env.restoreAttempts>0);assert.equal(failure.cleanup.complete,false);assert.ok(failure.cleanup.errors.some(item=>item.where==='owner.restore.liveEnemies'&&item.error===env.restoreFailure.message));for(const key of ['liveEnemiesPromise','liveEnemiesLoading','nativeLaunchReport'])assert.deepEqual(Object.getOwnPropertyDescriptor(env.renderer,key),env.beforeOwner[key]);cleaned(env,{foreign:true});
 });
 await environment('render-cleanup-throw',async env=>{
  await assert.rejects(env.compare(env.renderer,env.canvas,{storage:env.storage,location:env.location,query:env.query}),error=>{assert.equal(error,env.renderFailure,'the first original rendering error identity is preserved');assert.ok(error.cleanup.errors.some(item=>item.where==='renderer.dispose'&&item.error===env.cleanupFailure.message));assert.equal(error.cleanup.ownerDescriptorsRestored,true);assert.equal(error.cleanup.complete,false);return true;});cleaned(env);
 });
});

test('async image rejection propagates once and aborting a started callback prevents later adoption without an unhandled late rejection',async()=>{
 const unhandled=[],onUnhandled=reason=>unhandled.push(reason);process.on('unhandledRejection',onUnhandled);
 try{
  await environment('normal',async env=>{
   const marker=Error('async-image-failure');await assert.rejects(env.compare(env.renderer,env.canvas,{storage:env.storage,location:env.location,query:env.query,async onImage(){throw marker;}}),error=>error===marker);await turn();await turn();cleaned(env);
  });
  await environment('normal',async env=>{
   const controller=new AbortController(),late=Error('late-image-callback-rejection');let callbacks=0,outcome;
   const pending=env.compare(env.renderer,env.canvas,{storage:env.storage,location:env.location,query:env.query,signal:controller.signal,onImage(){callbacks++;return env.imageGate.promise;}});pending.then(value=>{outcome={value};},error=>{outcome={error};});await until(()=>callbacks===1);const adopted=env.handles.reduce((sum,handle)=>sum+handle.adoptCalls,0);controller.abort();await until(()=>!!outcome);assert.ok(outcome.error);env.imageGate.reject(late);await turn();await turn();assert.equal(callbacks,1,'no further queued callback starts after cancellation');assert.equal(env.handles.reduce((sum,handle)=>sum+handle.adoptCalls,0),adopted,'a started caller callback is not forcibly cancelled, but late work cannot adopt');cleaned(env);
  });
  assert.deepEqual(unhandled,[]);
 }finally{process.removeListener('unhandledRejection',onUnhandled);}
});
