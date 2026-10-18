import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js?v=0.29.0';
import {ActorInterpolation} from '../dist/actor-interpolation.js';
import {advanceSimulation,FIXED_STEP} from '../dist/simulation.js?v=0.29.0';
import {productionLaunchPlan} from '../dist/launch-gate.js?v=0.29.0';
import {productionManifest} from '../dist/production-manifest.js?v=0.29.0';
import {seedAppLoopQA} from '../dist/qa-app-loop.js';
import {loadProfile} from '../dist/storage.js?v=0.29.0';
import {createQAStorage} from '../dist/qa-storage.js';
import {compareCanvasStateCombat} from '../dist/qa-canvas-state-combat.js';

// Actual Game/normal seed/density/checkpoint/interpolation/simulation run here.
// Only image/native-render readiness and the rendering/install test seam are
// controlled. Fake hash pixels prove orchestration, never native raster or FPS.
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return{promise,resolve,reject};};
const address=(query='qa&qa-memory=canvas&qa-loop=1&qa-loop-count=180&qa-canvas-combat=1')=>new URL('http://localhost:8851/qa-player-rig.html?'+query);
const gate=location=>({location,query:location.searchParams,storage:createQAStorage(location.searchParams,()=>{throw Error('persistent storage is forbidden');})});
const state=game=>structuredClone({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash,random:game.random.getState(),visualRandom:game.visualRandom.getState()});
const motion=game=>game.enemies.map(e=>[e.id,e.x,e.y,e.vx,e.vy,e.angle,e.walkPhase,e.attackState,e.attackTime,e.hitFlash,e.navX,e.navY,e.navTime]);
const rendered=view=>({time:view.time,player:[view.player.x,view.player.y,view.player.angle,view.player.recoil],enemies:view.enemies.map(e=>[e.id,e.x,e.y,e.angle,e.hitFlash]),bullets:view.bullets.map(b=>[b.id,b.x,b.y]),particles:view.particles.map(p=>[p.x,p.y,p.life])});

function environment(mode='normal'){
 const events=[],renderers=[],arts=[],rigs=[],installers=[],surfaces=[],draws=[],images=[],preloads=[],seeds=[],advances=[],ownedAssets=[],completedCopies=[],pending=deferred();let clock=0,clockMode='original',domCalls=0,yields=0,stopped=false,abortController=null;
 function surface(){
  let width=8,height=8,pixels=new Uint8ClampedArray(256);const canvas={style:{},dataset:{},toDataURL(){events.push(['export']);return'data:image/fake;base64,'+Buffer.from(pixels).toString('base64');},remove(){events.push(['remove']);}};
  Object.defineProperties(canvas,{width:{configurable:true,get:()=>width,set:value=>{width=value;pixels=new Uint8ClampedArray(Math.max(0,width*height*4));}},height:{configurable:true,get:()=>height,set:value=>{height=value;pixels=new Uint8ClampedArray(Math.max(0,width*height*4));}},pixels:{get:()=>pixels}});
  const ctx={canvas,clearRect(){pixels.fill(0);},drawImage(image){if(image.pixels)pixels.set(image.pixels.subarray(0,pixels.length));},getImageData(){events.push(['readback']);return{data:new Uint8ClampedArray(pixels)};},putImageData(image){pixels.set(image.data.subarray(0,pixels.length));},fillRect(){},fillText(){},save(){},restore(){},setTransform(){}};
  canvas.getContext=()=>ctx;surfaces.push(canvas);return canvas;
 }
 function rig(label='enemies'){
  const resource={label,size:label==='boss'?512:256,models:new Map(),pending:new Map(),lateModelsDisposed:0,error:'',lost:false,counts:{release:0,dispose:0,loss:0},releaseUnused(ids){assert.deepEqual(ids,[]);this.counts.release++;for(const model of this.models.values())model.dispose?.();this.models.clear();},load(key){if(this.pending.has(key))return this.pending.get(key);const promise=pending.promise.then(()=>{const model={originalLateModel:true,dispose(){resource.lateModelsDisposed++;}};this.models.set(key,model);this.pending.delete(key);return model;});this.pending.set(key,promise);return promise;},renderer:{info:{render:{frame:0},memory:{textures:0}},dispose(){resource.counts.dispose++;},forceContextLoss(){resource.counts.loss++;}}};rigs.push(resource);return resource;
 }
 class Art{
  constructor({manifest=productionManifest}={}){this.manifest=manifest;this.records=new Map();this.onChange=null;arts.push(this);}
  async load(id){this.records.set(id,{status:'ready',metadata:{original:true},image:{originalImage:id}});return true;}
  isReady(){return true;}status(){return'ready';}async loadBodyAlpha(){return{originalMask:true};}
  releaseUnusedAssets(ids){for(const [key]of this.records)if(!ids.includes(key))this.records.delete(key);return[];}
 }
 class MockRenderer{
  constructor(canvas,{productionArt,productionManifest:manifest}={}){
   this.canvas=canvas;this.ctx=canvas.getContext('2d');this.productionArt=productionArt??new Art({manifest});this.width=8;this.height=8;this.dpr=1;this.textureStatus='ready';this.livePlayer=rig('player');this.livePlayer.ready=true;this.liveBoss=rig('boss');this.liveEnemies=rig('initial-native');this.liveEnemiesPromise=Promise.resolve(this.liveEnemies);this.liveEnemySelection=new Set();this.cameraReady=false;this.lastNow=null;this.motionEnabled=true;this.index=renderers.length;renderers.push(this);
   const counts={geometry:0,material:0,skeleton:0,texture:0,bitmap:0},bitmap={close(){counts.bitmap++;}},texture={isTexture:true,source:{data:bitmap},dispose(){counts.texture++;}};
   const node={geometry:{dispose(){counts.geometry++;}},skeleton:{dispose(){counts.skeleton++;}},material:{map:texture,dispose(){counts.material++;}}},root={traverse(visit){visit(node);}};
   this.livePlayer.models.set('original-player-fixture',{root,subject:root});this.livePlayer.bottle=root;ownedAssets.push(counts);
   const image=surface();image.width=image.height=256;completedCopies.push(image);this.completedEnemyFrames={entries:new Map([[{}, {selected:{completedNativeDeath:true,metadata:{liveRig:true},image}}]])};
   if(mode==='render-protected-completed')this.completedEnemyFrames.entries.set({},{selected:{completedNativeDeath:true,metadata:{liveRig:true},image:mainImage}});
  }
  resize(){this.canvas.width=8;this.canvas.height=8;this.width=8;this.height=8;}
  async preloadProductionPlayer(){return true;}async preloadProductionBosses(){return true;}async preloadRooftop(){return true;}
  adoptProductionEnemyLaunch(handle){if(mode==='adopt-failure')return false;const old=this.liveEnemies,candidate=handle?.candidate??handle;if(old){old.releaseUnused([]);old.renderer.dispose();old.renderer.forceContextLoss();}this.liveEnemies=candidate?.rig??handle?.rig;this.liveEnemiesPromise=Promise.resolve(this.liveEnemies);if(handle)handle.adopted=true;return!!this.liveEnemies;}
  render(view,command,time){
   const game=Object.getPrototypeOf(view)===Game.prototype?view:Object.getPrototypeOf(view);assert.ok(game instanceof Game);const installer=this.installer;
   if(mode==='late-model-failure'){this.liveEnemies.load('enemy-elite');throw Error('controlled canvas combat render failure');}
   if(mode==='render-failure'||mode==='render-and-stop-failure'||mode==='render-protected-completed')throw Error('controlled canvas combat render failure');
   if(mode==='rig-error')this.liveEnemies.error='controlled canvas native error';
   this.liveEnemySelection=new Set(mode==='native-zero'?[]:view.enemies.slice(0,12));if(this.liveEnemies)this.liveEnemies.renderer.info.render.frame++;
   if(installer){installer.draws++;if(installer.mode==='manual'&&mode!=='manual-zero'){installer.used+=Math.max(1,view.enemies.length-12);installer.certified+=Math.max(1,view.enemies.length-12);}}
   const input=rendered(view);draws.push({renderer:this,game,state:state(game),motion:structuredClone(motion(game)),input:structuredClone(input),command:structuredClone(command),time});events.push(['render',this.index,draws.at(-1).state.snapshot.time]);
   const bytes=createHash('sha256').update(JSON.stringify(input)).digest();this.canvas.pixels.set(bytes.subarray(0,this.canvas.pixels.length));
   if(mode==='mutate-game')game.player.hp--;
   if(mode==='abort-render')abortController?.abort();
  }
 }
 function installCanvasStateCandidate({renderer,mode:installedMode}){
  clockMode=installedMode;
  const installer={renderer,mode:installedMode,used:0,certified:0,draws:0,stops:0,stopped:false,report(){return{mode:installedMode,available:true,stopped:this.stopped,certified:this.certified,candidateUsed:this.used,fallback:this.mode==='original'?this.draws:0,falseReturns:0,bakedNpcManualCalls:this.used,factoryCalls:this.draws*180,ownerMismatchCalls:0,cleanupComplete:this.stopped};},stop(){if(!this.stopped){this.stopped=true;this.stops++;if(renderer.installer===this)delete renderer.installer;}if(mode==='stop-failure'||mode==='render-and-stop-failure')throw Error('controlled canvas install stop failure');return this.report();}};renderer.installer=installer;installers.push(installer);return installer;
 }
 async function preloadLaunchPlan(renderer,plan,{signal,prepareNative}={}){
  assert.equal(prepareNative,true);preloads.push({renderer,plan,signal});events.push(['prepare',renderer.index]);
  if(mode==='deferred')await pending.promise;if(mode==='prepare-failure')return false;
  const original=mode==='protected-candidate'?mainRig:rig();if(mode!=='protected-candidate')for(const key of plan.nativeEnemyKeys??[])original.models.set(key,{originalLoaded:true});let disposed=false;
  const candidate={rig:original,report:{prepared:true,keys:plan.nativeEnemyKeys,textureUpload:{submitted:true,stateNormalized:true,error:''},shaders:plan.nativeEnemyKeys.map(key=>({key,ready:true}))},isReady:()=>!signal?.aborted,adopt:()=>original,dispose(){if(!disposed){disposed=true;original.releaseUnused([]);original.renderer.dispose();original.renderer.forceContextLoss();}}};
  plan.nativeCandidate={candidate,old:renderer.liveEnemies,adopted:false,disposed:false,dispose(){if(this.disposed)return;this.disposed=true;if(!this.adopted)candidate.dispose();}};return true;
 }
 const hosts=[],document={hidden:false,body:{appendChild(host){hosts.push(host);}},createElement(tag){domCalls++;if(tag==='div')return{style:{},appendChild(canvas){this.canvas=canvas;},remove(){events.push(['host-remove']);}};assert.equal(tag,'canvas');return surface();}};
 const mainCanvas=surface(),mainArt=new Art(),mainRig=rig('main-product'),mainRenderer={canvas:mainCanvas,ctx:mainCanvas.getContext('2d'),productionArt:mainArt,liveEnemies:mainRig,originalMarker:true};
 const mainImage={width:16,height:16,originalImage:true};mainArt.records.set('original-main-record',{status:'ready',metadata:{originalMetadata:true},image:mainImage});
 const mainBefore=Object.getOwnPropertyDescriptors(mainRenderer),artBefore=Object.getOwnPropertyDescriptors(mainArt),recordsBefore=[...mainArt.records];
 const testDeps={Renderer:MockRenderer,ProductionArt:Art,Game,ActorInterpolation,advanceSimulation(game,command,accumulator,options){const result=advanceSimulation(game,command,accumulator,options);advances.push({game,command:structuredClone(command),accumulator,firingEnabled:options?.firingEnabled,returnedAccumulator:result.accumulator,events:structuredClone(game.events)});return result;},FIXED_STEP,productionLaunchPlan,preloadLaunchPlan,seedAppLoopQA(profile,storage,options){const result=seedAppLoopQA(profile,storage,options);if(result)seeds.push(structuredClone(profile.activeRun.game));return result;},loadProfile,createQAStorage,installCanvasStateCandidate,now:()=>clock+=mode==='fake-faster-candidate'&&clockMode==='manual'?.125:.25,async yieldFrames(){yields++;events.push(['yield']);if(mode==='abort-yield')abortController?.abort();await Promise.resolve();},async waitAssets(){return true;},cache:{enabled:false}};
 return{testDeps,mainRenderer,mainBefore,artBefore,recordsBefore,mainRig,mainImage,document,events,renderers,arts,rigs,installers,surfaces,draws,images,preloads,seeds,advances,ownedAssets,completedCopies,pending,setController(value){abortController=value;},get domCalls(){return domCalls;},get yields(){return yields;}};
}
function mainUnchanged(e){assert.deepEqual(Object.getOwnPropertyDescriptors(e.mainRenderer),e.mainBefore);assert.deepEqual(Object.getOwnPropertyDescriptors(e.mainRenderer.productionArt),e.artBefore);assert.deepEqual([...e.mainRenderer.productionArt.records],e.recordsBefore);assert.deepEqual(e.mainRig.counts,{release:0,dispose:0,loss:0});assert.equal(e.mainImage.width,16);assert.equal(e.mainImage.height,16);}
function ownedImagesAndAssetsRetired(e){for(const count of e.ownedAssets)assert.deepEqual(count,{geometry:1,material:1,skeleton:1,texture:1,bitmap:1});for(const image of e.completedCopies){assert.equal(image.width,0);assert.equal(image.height,0);}}
async function failure(pending){let caught;await assert.rejects(pending,error=>{caught=error;assert.ok(error.report);assert.equal(error.report.complete,false);return true;});return caught;}

test('invalid origins, flags or fake memory storage reject before owner, document, test dependency or persistent access',async()=>{
 for(const location of [new URL('http://localhost:8806/?qa&qa-memory&qa-canvas-combat=1'),new URL('https://localhost:8851/?qa&qa-memory&qa-canvas-combat=1'),new URL('http://localhost.evil:8851/?qa&qa-memory&qa-canvas-combat=1'),address('qa&qa-memory&qa-loop=1'),address('qa&qa-canvas-combat=1')]){
  let reads=0;const options={...gate(location)};for(const key of ['document','testDeps'])Object.defineProperty(options,key,{get(){reads++;throw Error('guard must run first');}});
  const result=await compareCanvasStateCombat(new Proxy({},{get(){reads++;throw Error('owner guard');}}),options);assert.equal(result.report?.complete??result.complete,false);assert.equal(reads,0);
 }
 let reads=0;const location=address(),result=await compareCanvasStateCombat(new Proxy({},{get(){reads++;throw Error('owner guard');}}),{location,query:location.searchParams,storage:new Map(),get document(){reads++;throw Error('fake store guard');}});assert.equal(result.report?.complete??result.complete,false);assert.equal(reads,0);
});

test('normal actual180 combat advances all40 callbacks without prime and preserves full state, motion, inputs, event streams and both RNGs across A/B/A',async()=>{
 const e=environment('fake-faster-candidate'),images=[],progress=[],{report}=await compareCanvasStateCombat(e.mainRenderer,{...gate(address()),document:e.document,testDeps:e.testDeps,onProgress:entry=>progress.push(entry),onImage:async image=>{images.push(image);e.events.push(['external-image']);}});
 assert.equal(report.complete,true);assert.equal(report.fixture.count,180);assert.equal(report.fixture.baseEnemies,5);assert.equal(report.fixture.spawnClock,1.5);assert.equal(report.fixture.seed,774);assert.equal(report.fixture.weapon,'nailgun');assert.equal(report.fixture.snapshotValid,true);assert.equal(report.passes.length,3);assert.deepEqual(report.passes.map(pass=>[pass.arm,pass.mode]),[['A1','original'],['B','manual'],['A2','original']]);
 assert.equal(report.injected,true);assert.equal(report.equivalence.framesCompared,80);for(const key of ['state','events','commands','motion','random','visualRandom'])assert.equal(report.equivalence[key],true,key);assert.deepEqual(report.equivalence.mismatches,[]);assert.ok(report.performance.improvementFraction>=.03);assert.equal(report.performance.callbackTailsNoWorse,true);assert.equal(report.performance.drainTailsNoWorse,true);assert.equal(report.performance.tailsNoWorse,report.performance.callbackTailsNoWorse&&report.performance.drainTailsNoWorse);assert.equal(report.performance.accepted,false,'even faster injected clocks are never native optimization evidence');
 assert.equal(e.renderers.length,3);assert.equal(e.draws.length,120,'no unmeasured render/prime is permitted');assert.ok(e.draws.every(draw=>draw.state.snapshot.time>0));assert.equal(e.preloads.length,3);assert.equal(e.installers.length,3);
 const groups=e.renderers.map(renderer=>e.draws.filter(draw=>draw.renderer===renderer));assert.ok(groups.every(group=>group.length===40));
 for(let i=1;i<3;i++)assert.deepEqual(groups[i].map(({state,motion,input,command,time})=>({state,motion,input,command,time})),groups[0].map(({state,motion,input,command,time})=>({state,motion,input,command,time})));
 const advancementGroups=groups.map(group=>e.advances.filter(entry=>entry.game===group[0].game));assert.ok(advancementGroups.every(group=>group.length===40));
 for(let i=1;i<3;i++)assert.deepEqual(advancementGroups[i].map(({command,accumulator,returnedAccumulator,events})=>({command,accumulator,returnedAccumulator,events})),advancementGroups[0].map(({command,accumulator,returnedAccumulator,events})=>({command,accumulator,returnedAccumulator,events})));
 assert.ok(advancementGroups[0].some(entry=>entry.events.some(event=>event.type==='shot')),'real normal automatic firing must occur');
 const oracle=Game.restore(e.seeds[0],{resumePlaying:true}),interpolator=new ActorInterpolation();assert.ok(oracle);
 for(let frame=0;frame<40;frame++){const entry=advancementGroups[0][frame],result=advanceSimulation(oracle,entry.command,entry.accumulator,{firingEnabled:entry.firingEnabled,interpolator});assert.equal(result.accumulator,entry.returnedAccumulator);assert.deepEqual(oracle.drainEvents(),entry.events);assert.deepEqual(state(oracle),groups[0][frame].state,'unwrapped actual Game oracle frame '+frame);}
 assert.ok(groups[0].at(-1).state.snapshot.time>4.7);assert.ok(groups[0].some(draw=>draw.state.snapshot.bullets.length>0));assert.ok(groups[0].some(draw=>draw.state.snapshot.player.hp<draw.state.snapshot.player.maxHp||draw.state.snapshot.kills>0));
 for(const pass of report.passes){assert.equal(pass.samples.length,40);assert.deepEqual(pass.samples.map(sample=>sample.frame),Array.from({length:40},(_,i)=>i));assert.ok(pass.samples.every(sample=>sample.tickCount===7||sample.tickCount===8));assert.ok(pass.samples.every(sample=>sample.nativeSelected>0));assert.equal(pass.firstFrame.frame,0);assert.equal(pass.firstFrame.nativeRenderFrame,1);assert.equal(pass.preparation.source.nativeDrawsBefore,0);assert.equal(pass.preparation.source.playerDrawsBefore,0);assert.equal(pass.preparation.source.nativeSize,256);assert.equal(pass.preparation.source.bossSize,512);assert.equal(pass.sumPlusReadbackMs,pass.all40Summary.callbackMs.sumMs+pass.readbackMs);assert.equal(pass.drainInclusiveSummary.count,41);assert.equal(pass.drainInclusiveSummary.sumMs,pass.sumPlusReadbackMs);}
 assert.equal(report.performance.fasterOriginalSumPlusReadbackMs,Math.min(report.passes[0].sumPlusReadbackMs,report.passes[2].sumPlusReadbackMs));assert.equal(report.performance.candidateSumPlusReadbackMs,report.passes[1].sumPlusReadbackMs);assert.equal(report.readbackStorage.arrays,3);assert.equal(report.readbackStorage.pngCount,3);
 assert.equal(report.passes[0].installer.certified,0);assert.equal(report.passes[2].installer.certified,0);assert.ok(report.passes[1].installer.bakedNpcManualCalls>0);assert.ok(e.installers.every(installer=>installer.stops===1));
 const readIndices=e.events.flatMap(([name],i)=>name==='readback'?[i]:[]),lastRender=e.events.findLastIndex(([name])=>name==='render'),firstImage=e.events.findIndex(([name])=>name==='external-image');assert.deepEqual(readIndices.map(index=>e.events.slice(0,index).filter(([name])=>name==='render').length),[40,80,120],'each single readback follows its entire forty-frame arm');assert.ok(firstImage>lastRender,'external callbacks are postmeasurement');
 assert.equal(images.length,3);assert.equal(report.cleanup.complete,true);assert.equal(report.cleanup.mainSourceImagesUnchanged,true);assert.ok(report.cleanup.arms.every(arm=>arm.borrowedDetached&&arm.ownedRecordsRemaining===0&&arm.npcModelsRemaining===0&&arm.bossModelsRemaining===0&&arm.playerModelsRemaining===0&&arm.canvasReleased&&arm.installerRestored));for(const rig of e.rigs.filter(rig=>rig!==e.mainRig)){assert.equal(rig.models.size,0);assert.equal(rig.counts.dispose,1);assert.equal(rig.counts.loss,1);}ownedImagesAndAssetsRetired(e);mainUnchanged(e);
});

test('preparation finishes before any advancing render and unavailable native/manual usage cannot be certified as a comparison',async()=>{
 const e=environment('deferred'),pending=compareCanvasStateCombat(e.mainRenderer,{...gate(address()),document:e.document,testDeps:e.testDeps});await turn();assert.equal(e.preloads.length,1);assert.equal(e.draws.length,0);assert.equal(e.installers.length,0);mainUnchanged(e);e.pending.resolve();const {report}=await pending;assert.equal(report.complete,true);mainUnchanged(e);
 for(const mode of ['manual-zero','native-zero','prepare-failure','adopt-failure','protected-candidate']){const x=environment(mode),error=await failure(compareCanvasStateCombat(x.mainRenderer,{...gate(address()),document:x.document,testDeps:x.testDeps}));assert.match(error.message,/positive-baked-manual-usage|real-native-render|fresh-original-native-preparation|owned-native-adopt/);mainUnchanged(x);assert.ok(x.installers.every(installer=>installer.stops===1));if(mode==='adopt-failure')for(const rig of x.rigs.filter(rig=>rig!==x.mainRig)){assert.equal(rig.counts.dispose,1);assert.equal(rig.counts.loss,1);}}
});

test('abort, renderer failure and native failure stop owned wrappers and preserve the main renderer and sources',async()=>{
 for(const mode of ['abort-yield','abort-render','render-failure','rig-error','render-and-stop-failure','render-protected-completed']){const e=environment(mode),controller=new AbortController();e.setController(controller);const error=await failure(compareCanvasStateCombat(e.mainRenderer,{...gate(address()),document:e.document,testDeps:e.testDeps,signal:controller.signal}));assert.match(error.message,/aborted|controlled canvas combat render failure|render-guard-failed/);if(mode==='render-and-stop-failure'){assert.equal(error.message,'controlled canvas combat render failure');assert.ok(error.report.cleanup.errors.some(entry=>entry.where==='installer.stop'));}if(mode==='render-protected-completed'){assert.equal(error.message,'controlled canvas combat render failure');assert.ok(error.report.cleanup.errors.some(entry=>entry.where==='renderer.completed.image'&&entry.error==='qa-canvas-combat-protected-source-image'));assert.equal(error.report.cleanup.mainSourceImagesUnchanged,true);}assert.ok(e.installers.every(installer=>installer.stops===1));ownedImagesAndAssetsRetired(e);mainUnchanged(e);}
 const e=environment('deferred'),controller=new AbortController();e.setController(controller);const pending=compareCanvasStateCombat(e.mainRenderer,{...gate(address()),document:e.document,testDeps:e.testDeps,signal:controller.signal});await turn();controller.abort();const error=await failure(pending);assert.match(error.message,/aborted/);assert.equal(e.draws.length,0);e.pending.resolve();await turn();await turn();assert.equal(e.draws.length,0);for(const rig of e.rigs.filter(rig=>rig!==e.mainRig)){assert.equal(rig.models.size,0);assert.equal(rig.counts.dispose,1);assert.equal(rig.counts.loss,1);}ownedImagesAndAssetsRetired(e);mainUnchanged(e);
 const late=environment('late-model-failure'),lateError=await failure(compareCanvasStateCombat(late.mainRenderer,{...gate(address()),document:late.document,testDeps:late.testDeps})),native=late.renderers[0].liveEnemies;
 assert.equal(lateError.message,'controlled canvas combat render failure');assert.equal(native.pending.size,1);assert.equal(native.models.size,0);assert.equal(native.counts.dispose,1);assert.equal(native.counts.loss,1);assert.ok(lateError.cleanup.lateScheduled>lateError.cleanup.lateSettled);
 const beforeLate=state(late.advances[0].game);late.pending.resolve();await turn();await turn();assert.equal(native.pending.size,0);assert.equal(native.models.size,0);assert.equal(native.lateModelsDisposed,1);assert.equal(native.counts.dispose,1);assert.equal(native.counts.loss,1);assert.equal(lateError.cleanup.lateScheduled,lateError.cleanup.lateSettled);assert.deepEqual(state(late.advances[0].game),beforeLate);ownedImagesAndAssetsRetired(late);mainUnchanged(late);
});
