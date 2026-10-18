import {Renderer} from './renderer.js?v=0.29.0&dense=20261018-4';
import {ProductionArt} from './production-art.js?v=0.29.0';
import {Game} from './engine.js?v=0.29.0';
import {ActorInterpolation} from './actor-interpolation.js';
import {advanceSimulation,FIXED_STEP} from './simulation.js?v=0.29.0';
import {productionLaunchPlan,preloadLaunchPlan} from './launch-gate.js';
import {isQAMemoryStorage,createQAStorage} from './qa-storage.js';
import {loadProfile} from './storage.js?v=0.29.0';
import {seedAppLoopQA} from './qa-app-loop.js';
import {installCanvasStateCandidate} from './qa-canvas-state-install.js';
import {Cache} from './player-rig/vendor/three.module.js';

const active=new WeakSet(),ARMS=Object.freeze([['A1','original'],['B','manual'],['A2','original']]);
const ATTRIBUTION_ARMS=Object.freeze([['A1','original'],['A2','original']]);
const PLAYER_PREPARATION_ARMS=Object.freeze([['A1','original'],['B','prepared'],['A2','original']]);
const PLAYER_ALPHA_ROWS_ARMS=Object.freeze([['A1','original'],['B','rows'],['A2','original']]);
const PLAYER_DEFERRED_READ_ARMS=Object.freeze([['A1','original'],['B','deferred'],['A2','original']]);
const NO_INSTALLER=Object.freeze({available:true,ownerMismatchCalls:0,falseReturns:0,bakedNpcManualCalls:0,candidateUsed:0,factoryCalls:0});
const ownData=(object,key)=>{const d=object&&Object.getOwnPropertyDescriptor(object,key);return d&&'value'in d?d.value:undefined;};
const sameDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
const sameOwn=(object,saved)=>{const current=Object.getOwnPropertyDescriptors(object);return Reflect.ownKeys(current).length===Reflect.ownKeys(saved).length&&Reflect.ownKeys(saved).every(key=>sameDescriptor(current[key],saved[key]));};
const text=error=>{try{return typeof error?.message==='string'?error.message:String(error);}catch{return'qa-canvas-combat-error';}};
const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b);return{count:values.length,medianMs:sorted[Math.floor(sorted.length*.5)]??0,p95Ms:sorted[Math.floor(sorted.length*.95)]??0,maxMs:sorted.at(-1)??0,sumMs:values.reduce((sum,n)=>sum+n,0)};};
const summarizeFrames=frames=>Object.fromEntries(['simulationMs','interpolationMs','renderMs','callbackMs'].map(key=>[key,summarize(frames.map(frame=>frame[key]))]));
const pixelDifference=(a,b)=>{if(a.length!==b.length)return{differentComponents:Math.max(a.length,b.length),maxDelta:255,dimensionsEqual:false};let differentComponents=0,maxDelta=0;for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);if(delta)differentComponents++;if(delta>maxDelta)maxDelta=delta;}return{differentComponents,maxDelta,dimensionsEqual:true};};
const json=value=>JSON.stringify(value);
function gameProof(game,events,commands){
 const snapshot=game.snapshot();if(!snapshot)throw Error('qa-canvas-combat-valid-checkpoint-required');
 return{state:json({snapshot,particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash}),events:json(events),commands:json(commands),motion:json(game.enemies.map(e=>[e.id,e.x,e.y,e.vx,e.vy,e.angle,e.walkPhase,e.navX,e.navY,e.navTime,e.navTarget===game.player?'player':e.navTarget===game.lure?'lure':null,e.navTargetX,e.navTargetY])),random:game.random.getState(),visualRandom:game.visualRandom.getState()};
}
function passedGate(location,query,storage,flag='qa-canvas-combat'){
 try{return location?.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&location.port==='8851'&&query?.has('qa')&&query.has('qa-memory')&&query.get(flag)==='1'&&isQAMemoryStorage(storage);}catch{return false;}
}

// This separate button-called harness owns every rendering context that it
// draws into. The supplied product Renderer is a read-only source of ready
// records. It never receives a method call, wrapper, pose or field assignment.
export async function compareCanvasStateCombat(mainRenderer,options={}){
 const location=options.location??globalThis.location,query=options.query??new URLSearchParams(location?.search??''),storage=options.storage;
 const originalAttribution=ownData(options,'originalAttribution')===true,playerAttribution=ownData(options,'playerAttribution')===true,playerPreparation=ownData(options,'playerPreparation')===true,playerAlphaRows=ownData(options,'playerAlphaRows')===true,playerAlphaRowsVerify=ownData(options,'playerAlphaRowsVerify')===true,playerDeferredRead=ownData(options,'playerDeferredRead')===true,playerDeferredReadVerify=ownData(options,'playerDeferredReadVerify')===true,originalReadbackProbe=ownData(options,'originalReadbackProbe')===true,boundedOwnedCleanup=ownData(options,'boundedOwnedCleanup')===true,arms=originalReadbackProbe?ATTRIBUTION_ARMS:playerDeferredRead?PLAYER_DEFERRED_READ_ARMS:playerAlphaRows?PLAYER_ALPHA_ROWS_ARMS:playerPreparation?PLAYER_PREPARATION_ARMS:originalAttribution?ATTRIBUTION_ARMS:ARMS;
 const deferredBoundedCost=boundedOwnedCleanup&&playerDeferredRead&&!playerDeferredReadVerify&&!originalReadbackProbe;
 let deferredCostFlags=true;if(deferredBoundedCost)try{deferredCostFlags=query.get('qa-player-deferred-read-verify')!=='1';}catch{deferredCostFlags=false;}
 if(boundedOwnedCleanup&&((!originalReadbackProbe&&!deferredBoundedCost)||!passedGate(location,query,storage,'qa-owned-cleanup')||!deferredCostFlags))return{report:{available:false,complete:false,reason:'8851-genuine-memory-qa-required'}};
 if(!passedGate(location,query,storage,originalReadbackProbe?'qa-original-readback':playerDeferredRead?'qa-player-deferred-read':playerAlphaRows?'qa-player-alpha-rows':playerPreparation?'qa-player-preparation':originalAttribution?'qa-render-attribution':'qa-canvas-combat')||playerAttribution&&(!originalAttribution||query.get('qa-player-attribution')!=='1')||playerPreparation&&(originalAttribution||playerAttribution)||playerAlphaRows&&(originalAttribution||playerAttribution||playerPreparation)||playerAlphaRowsVerify&&(!playerAlphaRows||query.get('qa-player-alpha-rows-verify')!=='1')||playerDeferredRead&&(originalAttribution||playerAttribution||playerPreparation||playerAlphaRows||playerAlphaRowsVerify)||playerDeferredReadVerify&&(!playerDeferredRead||query.get('qa-player-deferred-read-verify')!=='1')||originalReadbackProbe&&(originalAttribution||playerAttribution||playerPreparation||playerAlphaRows||playerAlphaRowsVerify||playerDeferredRead||playerDeferredReadVerify))return{report:{available:false,complete:false,reason:'8851-genuine-memory-qa-required'}};
 const {document=globalThis.document,signal,onProgress=()=>{},onImage=()=>{},testDeps}=options;
 const deps={Renderer,ProductionArt,Game,ActorInterpolation,advanceSimulation,FIXED_STEP,productionLaunchPlan,preloadLaunchPlan,seedAppLoopQA,loadProfile,createQAStorage,installCanvasStateCandidate,now:()=>performance.now(),yieldFrames:()=>new Promise(resolve=>requestAnimationFrame(resolve)),cache:Cache,...testDeps};
 if(!mainRenderer||typeof mainRenderer!=='object'||active.has(mainRenderer))throw Error('qa-canvas-combat-invalid-or-active-owner');
 if(signal?.aborted)throw Error('qa-canvas-combat-aborted');
 const mainDescriptors=Object.getOwnPropertyDescriptors(mainRenderer),mainArt=ownData(mainRenderer,'productionArt');
 if(!mainArt||!(ownData(mainArt,'records') instanceof Map)||!ownData(mainArt,'manifest'))throw Error('qa-canvas-combat-original-ready-art-required');
 const artDescriptors=Object.getOwnPropertyDescriptors(mainArt),records=mainArt.records,recordsBefore=[...records],recordDescriptors=new Map(recordsBefore.map(([,record])=>[record,Object.getOwnPropertyDescriptors(record)]));
 const protectedRigs=new Set(['liveEnemies','liveBoss','livePlayer'].map(key=>ownData(mainRenderer,key)).filter(Boolean));
 const protectedModels=[...protectedRigs].filter(rig=>rig.models instanceof Map).map(rig=>({rig,map:rig.models,entries:[...rig.models]}));
 const selection=ownData(mainRenderer,'liveEnemySelection'),selectionEntries=selection instanceof Set?[...selection]:null,actorFrames=ownData(mainRenderer,'nativeActorFrames');
 const frameEntries=selectionEntries&&actorFrames instanceof WeakMap?selectionEntries.map(actor=>[actor,actorFrames.get(actor)]):[];
 const protectedImages=new Set(recordsBefore.flatMap(([,record])=>[record.image,record.bodyAlpha]).filter(Boolean));
 for(const name of ['canvas','floor','minimapCanvas','nativeMaskCanvas'])if(ownData(mainRenderer,name))protectedImages.add(ownData(mainRenderer,name));
 for(const rig of protectedRigs){for(const name of ['canvas','body','ink','bottleCanvas','raw','gpuRaw'])if(ownData(rig,name))protectedImages.add(ownData(rig,name));if(rig.renderer?.domElement)protectedImages.add(rig.renderer.domElement);for(const slot of rig.framePool?.slots??[])if(slot.image)protectedImages.add(slot.image);}
 for(const [,selected]of frameEntries)if(selected?.image)protectedImages.add(selected.image);
 for(const value of ownData(mainRenderer,'completedEnemyFrames')?.entries?.values?.()??[])if(value.selected?.image)protectedImages.add(value.selected.image);
 const protectedImageDimensions=[...protectedImages].map(image=>[image,image.width,image.height]);
 const nativeMainCurrent=()=>protectedModels.every(({rig,map,entries})=>rig.models===map&&map.size===entries.length&&entries.every(([key,model])=>map.get(key)===model))&&(!selectionEntries||selection.size===selectionEntries.length&&selectionEntries.every(actor=>selection.has(actor)))&&frameEntries.every(([actor,selected])=>actorFrames.get(actor)===selected);
 const controller=new AbortController(),owned=[],images=[],baseline=[],pixelBuffers=[];
 const cleanup={ownedRenderers:0,retiredRenderers:0,ownedArts:0,releasedArts:0,hostsCreated:0,hostsRemoved:0,lateScheduled:0,lateSettled:0,uncancelableAsphaltPending:0,unprovenPlayerParallelLoads:0,errors:[],arms:[],mainOwnersUnchanged:false,mainArtUnchanged:false,mainRecordsUnchanged:false,mainNativeCachesUnchanged:false,mainSourceImagesUnchanged:false,complete:false};
 const report={available:true,complete:false,injected:testDeps!==undefined,fixture:null,passes:[],equivalence:{framesCompared:0,state:true,events:true,commands:true,motion:true,random:true,visualRandom:true,mismatches:[]},pixels:null,performance:null,cleanup,note:'8851 genuine-memory QA only. Fresh owned Renderer/Art/native player and initial max-three-model NPC preparation per original/manual/original arm. Original on-demand species loads remain enabled; actual runtime model/pending maxima are reported. Main ready records are borrowed by identity and never loaded, masked or released through a mutating path. Forty fixed .12-second catch-up callbacks include their first draw; batch-eight rAF yields are reported separately. This is a renderer combat harness without app HUD, audio or persistence, not presented FPS. Certification and lifecycle wrappers are inside render timing in every arm; no Canvas-stage, native-stage or frame-cost observer is installed. Literal per-frame checkpoint/effects/motion/commands/events and both RNG states are compared outside timers. Final whole-canvas readback and PNG export follow the measured loop. Existing twelve-state/two-selected-cell pixel QA is separate evidence, not proof for every source frame. Shared URL decode caches and the live product caches remain resident; fresh instances do not imply cold driver/URL caches. Owned native pending promises are followed through late success/failure for retirement. A failed player Promise.all can have unobservable sibling requests; that failure is explicitly cleanup-unproven rather than called complete. Timings are CPU call wall, not GPU duration or peak memory. No product optimization is adopted by this utility.'};
 if(originalReadbackProbe){report.originalReadbackProbe=true;report.qualityOnly=true;report.performance={accepted:false,adopted:false,qualityOnly:true,note:'Original-only readback investigation. Extra reads can change later context/driver state. No candidate, performance comparison, FPS or peak-memory claim.'};report.note='Explicit own-data originalReadbackProbe:true and exact qa-original-readback=1: two fresh ORIGINAL arms, no candidate installer, preparation experiment or profiler. Keep the original final whole Canvas R0 and strict AA gate. Immediately reread the unchanged main Canvas R1; stop on any difference. Only stable R1 permits reading the existing floor F followed by unchanged main R2. No added render, simulation tick, pose selection or await between these reads. Floor read may flush/materialize its backing; it does not certify pre-blit floor pixels. Postprobe PNG is separate evidence, not certified to equal primary R0. Extra reads are quality diagnostics and all timings are ineligible as optimization evidence. '+report.note;}
 if(originalAttribution){report.originalAttribution=true;report.profileOnly=true;report.note='Explicit qa-render-attribution=1 plus own-data originalAttribution:true: original A1/A2 only, with the same owned preparation, normal180 checkpoint, forty fixed callbacks, literal equivalence and strict whole-canvas AA gate. No Canvas state candidate or candidate installer is constructed. A lazily imported outer-method profiler observes original calls only; its begin/end/restoration overhead is included in callback/render wall. Inclusive and exclusive spans are distinct; never add parent and child durations. Two original arms are attribution diagnostics, not a performance-win or adoption comparison. '+report.note.replace('per original/manual/original arm','per original A1/A2 arm').replace('Certification and lifecycle wrappers are inside render timing in every arm; no Canvas-stage, native-stage or frame-cost observer is installed.','No Canvas-stage or other frame/native observer is installed alongside the attribution profiler.');}
 if(playerAttribution){report.playerAttribution=true;report.note='Additional own-data playerAttribution:true and exact qa-player-attribution=1 select player-only original-call attribution. Only existing player frame/raster, its two GL render calls and body Canvas read are observed, with the enclosing original Renderer player spans; Canvas copy/composition stays in the raster remainder. No extra draw/read/upload/prime or world/NPC/Art drawing hook. '+report.note.replace('A lazily imported outer-method profiler observes original calls only;','A lazily imported player-only profiler observes original calls only;');}
 if(playerAlphaRows){report.playerAlphaRows=true;report.playerAlphaRowsVerify=playerAlphaRowsVerify;report.note='Explicit own-data playerAlphaRows:true and qa-player-alpha-rows=1: fresh original/player-row-boundary/original owned arms. Only B scopes the unchanged original player raster body-mask read to an exact row-edge computational mask; original colour canvases, poses, weapon, NPC renderer and Game remain unchanged. One body framebuffer copy, one1x256 GPU row pass,1024 read bytes and reusable262144-byte computational mask replace the original full Canvas read; these costs, first shader use and installer reporting are inside callback wall. No prime or new shader/texture preparation. Verify mode adds a same-frame original RGBA read and exact all-row/bounds/contour checks; its timings are quality diagnostics and cannot be accepted as performance evidence. Strict whole-canvas AA/AB gates remain unchanged; previous AA failures remain unresolved. Owned resources and method restoration must pass; no automatic product adoption, FPS or peak-RAM claim. '+report.note;}
 if(playerDeferredRead){report.playerDeferredRead=true;report.playerDeferredReadVerify=playerDeferredReadVerify;report.note='Explicit own-data playerDeferredRead:true and qa-player-deferred-read=1: fresh owned unprimed original/deferred/original player arms, no GPU pass or new textures. B relocates only the original body Canvas fullRGBA read and pure bounds/core calculations to after armed GL rendering and colour Canvas composition, before metadata getters. The unchanged pre-weapon bodyCanvas snapshot supplies original RGBA and contour. This changes readback scheduling, not frame count or animation. Direct/verify and unsupported or replaced methods fall back to original and block acceptance. Successful native Canvas paths are the scope; native read failures can occur after more drawing in B, so universal exceptional side-effect ordering is not certified. All work and installer reporting stay inside callbacks. Predeclared total preparation+40callbacks+finalDrain must improve3%; first callback, steady30 median/p95/max/sum and40/41 p95/max must not regress against either original. Strict whole AA/AB/BA, literal Game and ownership cleanup remain required. Verify-only mode adds same-context original/candidate/original raster draws at each already-computed frozen pose and strict fullcolour/bodyRGBA/metadata comparison; no ticks or selection calls are added. These extra reads/draws make its timing ineligible as performance evidence; it cannot override the separate final wholeCanvas gate. No default adoption, FPS or peak-memory claim. '+report.note;}
 if(playerPreparation){report.playerPreparation=true;report.note='Explicit own-data playerPreparation:true plus exact qa-player-preparation=1: fresh owned A1(control normalization)/B(original player texture and shader preparation)/A2(control normalization), with no Canvas candidate installer or profiler. Both controls apply the same canonical state normalization, so these are new normalized baselines, not an unchanged historical cold renderer. Original full player load finishes before preparation; its frame-zero certificate is rechecked and watchers disposed before the first timed draw. Preparation, certificate finalization, first/all40 callbacks and final readback drain are reported separately and together; moving first-use cost into preparation is not called a total win. API readiness does not certify GPU completion, geometry/VAO/bone upload or readback-stall removal. No automatic product adoption. '+report.note.replace('per original/manual/original arm','per control/prepared/control arm').replace('Certification and lifecycle wrappers are inside render timing in every arm; no Canvas-stage, native-stage or frame-cost observer is installed.','No draw-stage, native-stage or frame-cost observer is installed.');}
 let finished=false,primary=null,abortReject,probeOriginalReadback=null,cleanupTracker=null;
 const followedOwners=new WeakMap();
 const aborted=new Promise((resolve,reject)=>{abortReject=reject;});aborted.catch(()=>{});
 const now=()=>{const value=deps.now();if(!Number.isFinite(value))throw Error('qa-canvas-combat-finite-clock-required');return value;};
 const cleanupError=(where,error)=>cleanup.errors.push({where,error:text(error)});
 const mainCurrent=()=>{try{return sameOwn(mainRenderer,mainDescriptors)&&sameOwn(mainArt,artDescriptors)&&mainArt.records===records&&records.size===recordsBefore.length&&recordsBefore.every(([id,record])=>records.get(id)===record&&sameOwn(record,recordDescriptors.get(record)))&&nativeMainCurrent();}catch{return false;}};
 const check=()=>{if(finished||signal?.aborted||controller.signal.aborted)throw Error('qa-canvas-combat-aborted');if(!mainCurrent())throw Error('qa-canvas-combat-main-owner-or-record-changed');};
 const abort=()=>{if(!controller.signal.aborted){controller.abort();abortReject(Error('qa-canvas-combat-aborted'));}};
 function waiting(promise,label,entry=null,timeoutMs=15000){
  const pending=Promise.resolve(promise);if(entry)entry.pending.add(pending);
  pending.then(()=>{if(entry){entry.pending.delete(pending);if(entry.closed&&!boundedOwnedCleanup){cleanup.lateSettled++;operation('late.arm',()=>retire(entry,true));}}},()=>{if(entry){entry.pending.delete(pending);if(entry.closed&&!boundedOwnedCleanup){cleanup.lateSettled++;operation('late.arm',()=>retire(entry,true));}}});
  let timer;const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('qa-canvas-combat-timeout-'+label)),timeoutMs);});
  return Promise.race([pending,aborted,timeout]).finally(()=>clearTimeout(timer));
 }
 function followOwned(promise,entry,kind,key,retireValue){
  if(!promise||typeof promise.then!=='function'||entry.followed.has(promise))return;
  entry.followed.add(promise);const owner=followedOwners.get(promise);
  const fallback=()=>{Promise.resolve(promise).then(value=>operation('late.untracked-retire',()=>retireValue(value,true)),value=>operation('late.untracked-retire',()=>retireValue(value,false)));};
  if(owner&&owner!==entry){cleanupError('late.shared-owner',Error('qa-owned-cleanup-shared-promise-owner'));fallback();return;}
  followedOwners.set(promise,entry);let accepted=false;try{accepted=cleanupTracker.follow(promise,{arm:entry.arm,kind,key:String(key)},retireValue);}catch(error){cleanupError('late.registration',error);fallback();return;}if(!accepted){cleanupError('late.untracked',Error('qa-owned-cleanup-tracker-capacity-or-registration'));fallback();}
 }
 function operation(where,fn){try{fn();}catch(error){cleanupError(where,error);}}
 function disposePlayerLaunch(entry){if(!entry.playerLaunch||entry.playerLaunchDisposeAttempted)return;entry.playerLaunchDisposeAttempted=true;entry.playerLaunch.dispose();entry.playerLaunchDisposed=true;}
 function shrink(canvas){if(protectedImages.has(canvas))throw Error('qa-canvas-combat-protected-source-image');if(canvas&&typeof canvas.width==='number'&&typeof canvas.height==='number'){canvas.width=0;canvas.height=0;}}
 function disposeOnce(entry,where,value,fn){if(!value||typeof value!=='object'||entry.disposedObjects.has(value))return;entry.disposedObjects.add(value);operation(where,fn);}
 function shrinkRig(rig,entry,kind){
  if(protectedRigs.has(rig))throw Error('qa-canvas-combat-protected-rig');
  for(const name of ['raw','ink','gpuRaw'])operation(kind+'.'+name,()=>shrink(rig[name]));
  operation(kind+'.surface',()=>shrink(rig.renderer?.domElement));
  for(const slot of rig.framePool?.slots??rig.pool?.slots??[])operation(kind+'.slot',()=>{shrink(slot.image);shrink(slot.canvas);shrink(slot.body);slot.owner=null;});
 }
 function retireRig(rig,entry,kind){
  if(!rig)return;
  if(protectedRigs.has(rig)){cleanupError(kind,Error('qa-canvas-combat-protected-rig'));return;}
  for(const [key,promise]of rig.pending instanceof Map?rig.pending:[]){
   if(!promise||typeof promise.then!=='function'||entry.followed.has(promise))continue;
   if(boundedOwnedCleanup){followOwned(promise,entry,kind,key,()=>{retireRig(rig,entry,kind);for(const [alias,value]of rig.pending instanceof Map?rig.pending:[])if(value===promise)rig.pending.delete(alias);});continue;}
   entry.followed.add(promise);cleanup.lateScheduled++;
   const settled=()=>{cleanup.lateSettled++;operation(kind+'.late-model',()=>{retireRig(rig,entry,kind);if(rig.pending?.get(key)===promise)rig.pending.delete(key);});};
   Promise.resolve(promise).then(settled,settled);
  }
  operation(kind+'.models',()=>rig.releaseUnused?.([]));operation(kind+'.alpha',()=>rig.releaseExactGPUAlpha?.());operation(kind+'.alphaReadback',()=>rig.alphaReadback?.dispose?.());
  if(!entry.contexts.has(rig)){
   entry.contexts.add(rig);operation(kind+'.dispose',()=>rig.renderer?.dispose?.());operation(kind+'.context',()=>rig.renderer?.forceContextLoss?.());
  }
  shrinkRig(rig,entry,kind);
  operation(kind+'.scene',()=>rig.scene?.clear?.());
 }
 function retirePlayer(player,entry){
  if(!player)return;if(protectedRigs.has(player)){cleanupError('player',Error('qa-canvas-combat-protected-player'));return;}
  if(!entry.prepared){
   if(player.ready!==true&&player.pending&&typeof player.pending.then==='function'&&!entry.unprovenPlayer){entry.unprovenPlayer=true;cleanup.unprovenPlayerParallelLoads++;}
   for(const promise of [player.pending,player.bottlePromise,...(player.weaponLoads?.values?.()??[])]){
    if(!promise||typeof promise.then!=='function'||entry.followed.has(promise))continue;
    if(boundedOwnedCleanup){followOwned(promise,entry,'player','pending-load',()=>retirePlayer(player,entry));continue;}
    entry.followed.add(promise);cleanup.lateScheduled++;const settled=()=>{cleanup.lateSettled++;operation('player.late-load',()=>retirePlayer(player,entry));};Promise.resolve(promise).then(settled,settled);
   }
  }
  const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  const visit=object=>{if(object.geometry)geometries.add(object.geometry);if(object.skeleton)skeletons.add(object.skeleton);for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}};
  const roots=new Set([player.bottle,...[...(player.models?.values?.()??[])].flatMap(model=>[model.root,model.subject]),...[...(player.weapons?.values?.()??[])].map(weapon=>weapon.root)].filter(Boolean));
  for(const root of roots)operation('player.traverse',()=>root.traverse?.(visit));
  for(const value of skeletons)disposeOnce(entry,'player.skeleton',value,()=>value.dispose?.());
  for(const value of geometries)disposeOnce(entry,'player.geometry',value,()=>value.dispose?.());
  for(const value of materials)disposeOnce(entry,'player.material',value,()=>value.dispose?.());
  const images=new Set();for(const value of textures){disposeOnce(entry,'player.texture',value,()=>value.dispose?.());if(value.source?.data)images.add(value.source.data);}
  for(const image of images)disposeOnce(entry,'player.bitmap',image,()=>{if(protectedImages.has(image))throw Error('qa-canvas-combat-protected-source-bitmap');image.close?.();});
  operation('player.alpha',()=>player.alphaReadback?.dispose?.());
  if(!entry.contexts.has(player)){entry.contexts.add(player);operation('player.dispose',()=>player.renderer?.dispose?.());operation('player.context',()=>player.renderer?.forceContextLoss?.());}
  for(const name of ['canvas','body','ink','bottleCanvas'])operation('player.'+name,()=>shrink(player[name]));
  operation('player.surface',()=>shrink(player.renderer?.domElement));
  operation('player.models',()=>player.models?.clear?.());operation('player.weapons',()=>player.weapons?.clear?.());operation('player.weaponLoads',()=>player.weaponLoads?.clear?.());operation('player.scene',()=>player.scene?.clear?.());player.bottle=null;
 }
 function retire(entry,late=false){
  if(!entry||entry.closed&&!late)return;const first=!entry.closed;entry.closed=true;
  if(playerPreparation)operation('playerPreparation.dispose',()=>disposePlayerLaunch(entry));
  if(first){
   if(boundedOwnedCleanup){for(const promise of entry.pending)followOwned(promise,entry,'arm','awaited-work',()=>retire(entry,true));}else cleanup.lateScheduled+=entry.pending.size;
   if(entry.playerDeferred)operation('playerDeferredRead.stop',()=>{try{entry.deferredFinal=entry.playerDeferred.stop();if(entry.pass)entry.pass.playerDeferredRead=entry.deferredFinal;if(!entry.deferredFinal?.cleanupComplete)throw Error('qa-player-deferred-read-cleanup-failed');}finally{entry.playerDeferred=null;}});
   if(entry.playerRows)operation('playerAlphaRows.stop',()=>{try{entry.playerRowsFinal=entry.playerRows.stop();if(entry.pass)entry.pass.playerAlphaRows=entry.playerRowsFinal;if(!entry.playerRowsFinal?.cleanupComplete)throw Error('qa-player-alpha-rows-cleanup-failed');}finally{entry.playerRows=null;}});
   if(entry.attribution)operation('attribution.stop',()=>{entry.attributionFinal=entry.attribution.stop();if(entry.pass)entry.pass.attribution=entry.attributionFinal;if(!entry.attributionFinal?.cleanupComplete)throw Error('qa-render-attribution-cleanup-failed');entry.attribution=null;});
   if(entry.tickExpected)operation('tick.restore',()=>{const current=Object.getOwnPropertyDescriptor(entry.game,'tick');if(!sameDescriptor(current,entry.tickExpected))throw Error('tick-external-replacement-preserved');if(entry.tickBefore)Object.defineProperty(entry.game,'tick',entry.tickBefore);else delete entry.game.tick;entry.tickExpected=null;});
   if(entry.installer)operation('installer.stop',()=>{entry.installFinal=entry.installer.stop();if(!entry.installFinal.cleanupComplete)throw Error('qa-canvas-combat-installer-cleanup-failed');entry.installer=null;});
  }
  const renderer=entry.renderer;
  if(first&&renderer?.textureStatus==='loading')cleanup.uncancelableAsphaltPending++;
  if(entry.plan?.nativeCandidate){const handle=entry.plan.nativeCandidate;const rig=handle.candidate?.rig??handle.rig;if(rig&&protectedRigs.has(rig))cleanupError('handle.dispose',Error('qa-canvas-combat-protected-handle'));else{operation('handle.dispose',()=>handle.dispose?.());if(rig){if(!handle.adopted)entry.contexts.add(rig);retireRig(rig,entry,'candidate');}}}
  if(entry.oldNative)operation('npc.old-canvases',()=>shrinkRig(entry.oldNative,entry,'npc.old'));
  if(renderer){
   retireRig(renderer.liveEnemies,entry,'npc');retireRig(renderer.liveBoss,entry,'boss');retirePlayer(renderer.livePlayer,entry);
   for(const key of entry.prepared?[]:['liveEnemiesPromise','liveBossPromise','livePlayerPromise']){
    const promise=renderer[key];if(promise&&typeof promise.then==='function'&&!entry.followed.has(promise)){
     if(boundedOwnedCleanup){followOwned(promise,entry,'renderer',key,(value,fulfilled)=>{if(fulfilled){if(key==='livePlayerPromise')retirePlayer(value,entry);else retireRig(value,entry,'late.'+key);}});continue;}
     entry.followed.add(promise);cleanup.lateScheduled++;Promise.resolve(promise).then(value=>{cleanup.lateSettled++;operation('late.'+key,()=>{if(key==='livePlayerPromise')retirePlayer(value,entry);else retireRig(value,entry,'late.'+key);});},()=>{cleanup.lateSettled++;});
    }
   }
   for(const name of ['floor','minimapCanvas','nativeMaskCanvas'])operation('renderer.'+name,()=>shrink(renderer[name]));
   for(const cache of [renderer.fireGround?.cache,renderer.fireGround?.burns])if(cache instanceof Map){for(const value of cache.values())for(const candidate of [value?.image,value?.scorch,value?.light])operation('renderer.fireGround',()=>shrink(candidate));cache.clear();}
   operation('renderer.completed',()=>{for(const value of renderer.completedEnemyFrames?.entries?.values?.()??[])operation('renderer.completed.image',()=>{const selected=value.selected;if(selected?.completedNativeDeath!==true||selected.metadata?.liveRig!==true)throw Error('qa-canvas-combat-unowned-completed-image');shrink(selected.image);});renderer.completedEnemyFrames?.entries?.clear?.();});
   operation('renderer.references',()=>{renderer.liveEnemySelection?.clear?.();renderer.liveCorpseSelection?.clear?.();renderer.floorWorld=null;renderer.onProductionChange=null;if(renderer.fireGround)renderer.fireGround.world=null;if(renderer.impactMarks){renderer.impactMarks.items=[];renderer.impactMarks.obstacles?.clear?.();renderer.impactMarks.world=null;}if(renderer.chargeWallFeedback){renderer.chargeWallFeedback.items=[];renderer.chargeWallFeedback.world=null;}});
   if(renderer.asphaltImage){renderer.asphaltImage.onload=null;renderer.asphaltImage.onerror=null;renderer.asphaltImage=null;}
  }
  if(entry.art){
   for(const [id,record]of entry.borrowed)if(entry.art.records.get(id)===record)entry.art.records.delete(id);
   operation('art.release',()=>entry.art.releaseUnusedAssets([]));
   entry.art.onChange=null;
  }
  operation('canvas.release',()=>shrink(entry.canvas));
  if(first){operation('host.remove',()=>entry.host.remove());cleanup.hostsRemoved++;if(renderer)cleanup.retiredRenderers++;if(entry.art)cleanup.releasedArts++;}
  if(!entry.pending.size&&!late)entry.released=true;
  if(first){const row={arm:entry.arm,borrowedDetached:!entry.art||[...entry.borrowed.keys()].every(id=>entry.art.records.get(id)!==entry.borrowed.get(id)),ownedRecordsRemaining:entry.art?.records?.size??0,npcModelsRemaining:renderer?.liveEnemies?.models?.size??0,bossModelsRemaining:renderer?.liveBoss?.models?.size??0,playerModelsRemaining:renderer?.livePlayer?.models?.size??0,canvasReleased:entry.canvas.width===0&&entry.canvas.height===0,installerRestored:!entry.installer&&!entry.installFinal||entry.installFinal?.cleanupComplete===true,latePending:entry.pending.size};if(originalAttribution)row.attributionRestored=!entry.attribution&&!entry.attributionFinal||entry.attributionFinal?.cleanupComplete===true;if(playerPreparation)row.playerPreparationDisposed=!entry.playerLaunch||entry.playerLaunchDisposed;if(playerAlphaRows)row.playerAlphaRowsRestored=entry.playerRowsFinal?.cleanupComplete===true;if(playerDeferredRead)row.playerDeferredReadRestored=deferredBoundedCost&&entry.deferredInstallAttempted===false||entry.deferredFinal?.cleanupComplete===true;cleanup.arms.push(row);}
  if(first){entry.borrowed.clear();entry.commands=[];entry.game=null;}
 }
 async function waitAssets(renderer){
  if(deps.waitAssets){await deps.waitAssets(renderer,{signal:controller.signal,timeoutMs:15000});return;}
  const start=now();while(renderer.textureStatus==='loading'){check();if(now()-start>=15000)throw Error('qa-canvas-combat-asphalt-timeout');await waiting(new Promise(resolve=>setTimeout(resolve,20)),'asphalt');}
  if(renderer.textureStatus!=='ready'||!renderer.asphaltImage)throw Error('qa-canvas-combat-original-asphalt-required');
  // These product modules are shared, not owned by this harness. Await their
  // existing loads; never dispose their images or global decode caches.
  for(const art of [renderer.fireArt,renderer.explosionArt])if(art?.load)await waiting(art.load(),'effect-art');
 }
 function createOwned(arm,game){
  const host=document.createElement('div'),canvas=document.createElement('canvas');
  const entry={arm,game,host,canvas,art:null,renderer:null,borrowed:new Map(),pending:new Set(),followed:new Set(),contexts:new Set(),disposedObjects:new WeakSet(),closed:false,released:false,installer:null,installFinal:null,attribution:null,attributionFinal:null,playerLaunch:null,playerLaunchDisposeAttempted:false,playerLaunchDisposed:false,preparedPlayer:null,playerLaunchReport:null,playerLaunchMs:0,pass:null,tickBefore:null,tickExpected:null,commands:[]};owned.push(entry);if(deferredBoundedCost)entry.deferredInstallAttempted=false;
  if(playerAlphaRows){entry.playerRows=null;entry.playerRowsFinal=null;entry.rowsPlayer=null;}
  if(playerDeferredRead){entry.playerDeferred=null;entry.deferredFinal=null;entry.deferredPlayer=null;}
  cleanup.hostsCreated++;host.style.cssText='position:fixed;left:-10000px;top:0;width:960px;height:640px;overflow:hidden;pointer-events:none;';canvas.style.width='960px';canvas.style.height='640px';host.appendChild(canvas);document.body.appendChild(host);
  entry.art=new deps.ProductionArt({manifest:mainArt.manifest,baseURL:mainArt.baseURL,fetchImpl:mainArt.fetchImpl,ImageCtor:mainArt.ImageCtor,timeoutMs:15000,onChange:null,forceLegacyMetadataParse:mainArt.forceLegacyMetadataParse===true});cleanup.ownedArts++;
  for(const [id,record]of recordsBefore){
   const asset=mainArt.manifest.assets?.[id];
   if(record.status==='ready'&&record.image&&record.metadata&&(!asset?.bodyAlpha||record.bodyAlphaStatus==='ready')){entry.borrowed.set(id,record);entry.art.records.set(id,record);}
  }
  const load=entry.art.load,body=entry.art.loadBodyAlpha;
  entry.art.load=function(id,...args){const record=entry.borrowed.get(id);if(record){if(this.records.get(id)!==record||record.status!=='ready')throw Error('qa-canvas-combat-borrowed-record-stale');return Promise.resolve(true);}return Reflect.apply(load,this,[id,...args]);};
  entry.art.loadBodyAlpha=function(id,...args){const record=entry.borrowed.get(id);if(record){if(this.records.get(id)!==record||record.bodyAlphaStatus!=='ready')throw Error('qa-canvas-combat-borrowed-mask-not-ready');return Promise.resolve(true);}return Reflect.apply(body,this,[id,...args]);};
  entry.renderer=new deps.Renderer(canvas,{productionArt:entry.art});cleanup.ownedRenderers++;
  return entry;
 }
 active.add(mainRenderer);
 try{
  signal?.addEventListener?.('abort',abort,{once:true});check();
  if(deps.cache?.enabled!==false)throw Error('qa-canvas-combat-independent-uncached-models-required');
  if(boundedOwnedCleanup){
   const factory=deps.createOwnedCleanupTracker??(await waiting(import('./qa-owned-cleanup-tracker.js'),'owned-cleanup-module')).createOwnedCleanupTracker;check();
   if(typeof factory!=='function')throw Error('qa-owned-cleanup-factory-required');
   cleanupTracker=factory({...deps.ownedCleanupTestOptions,timeoutMs:report.injected?(deps.ownedCleanupTestOptions?.timeoutMs??15000):15000});
   report.boundedOwnedCleanup=true;
   if(deferredBoundedCost){report.deferredBoundedCost=true;report.note='Explicit own-data playerDeferredRead:true and boundedOwnedCleanup:true, exact qa-player-deferred-read=1 and qa-owned-cleanup=1, without verify/readback-probe modes: the same original/deferred/original cost harness and strict original criteria, with one15second event-driven late-load retirement drain AFTER all preparation/callback/readback timings. Drain timing and resource resnapshot are separate and excluded from the performance numerator/denominator; native retirement callbacks may still run during later arm preparation as in the existing harness. No additional R1/floor/R2 or same-frame verification reads/draws, no profiler, new prime or extra Game tick. Complete tracked retirement and final owner/resource gates are mandatory; timeout/errors preserve a frozen failed cleanup report. Passing cost criteria is diagnostic only and does not adopt a product change or prove FPS/peak memory. '+report.note;}
   else report.note='Opt-in qa-owned-cleanup=1 plus own-data boundedOwnedCleanup:true: event-driven owned late-load retirement with one15second overall cleanup deadline outside all preparation/callback/readback timings. Original pixel and Game gates remain exact. A finalized primitive cleanup snapshot never changes after timeout; installed handlers may retire late resources best-effort. No optimization acceptance. '+report.note;
  }
  if(originalReadbackProbe){probeOriginalReadback=deps.probeOriginalReadback??(await waiting(import('./qa-canvas-readback-probe.js'),'original-readback-module')).probeOriginalReadback;check();if(typeof probeOriginalReadback!=='function')throw Error('qa-original-readback-helper-required');}
  const fixtureQuery=new URLSearchParams(query);fixtureQuery.set('qa-loop','1');fixtureQuery.set('qa-loop-count','180');
  const memory=deps.createQAStorage(fixtureQuery,()=>{throw Error('qa-canvas-combat-persistent-storage-forbidden');}),profile=deps.loadProfile(memory);
  report.fixture=deps.seedAppLoopQA(profile,memory,{location,query:fixtureQuery});
  if(!report.fixture?.snapshotValid||report.fixture.count!==180||report.fixture.weapon!=='nailgun'||!profile.activeRun?.game)throw Error('qa-canvas-combat-original-180-fixture-required');
  const checkpoint=profile.activeRun.game;
  for(const [arm,mode]of arms){
   check();onProgress({arm,phase:'preparation'});check();
   const game=deps.Game.restore(checkpoint,{resumePlaying:true});if(!game||game.state!=='playing'||game.enemies.length!==180)throw Error('qa-canvas-combat-original-checkpoint-restore-failed');
   const beforePreparation=gameProof(game,game.events,[]),preparationStart=now(),entry=createOwned(arm,game),renderer=entry.renderer,canvas=entry.canvas;
   entry.plan=deps.productionLaunchPlan({manifest:entry.art.manifest,weapon:game.player.weapon,mission:game.mission,world:game.world,nativeGame:game});
   if(!entry.plan.nativeEnemyKeys?.length||entry.plan.nativeEnemyKeys.length>3)throw Error('qa-canvas-combat-original-max-three-roster-required');
   const loadStart=now(),loaded=await waiting(deps.preloadLaunchPlan(renderer,entry.plan,{signal:controller.signal,prepareNative:true}),'original-launch',entry,originalReadbackProbe||originalAttribution||playerPreparation||playerAlphaRows||playerDeferredRead?60000:15000);check();
   const loadAndNativePreparationMs=now()-loadStart,handle=entry.plan.nativeCandidate,candidate=handle?.candidate??handle,rig=candidate?.rig;
   if(loaded!==true||!handle||typeof handle.dispose!=='function'||!rig||protectedRigs.has(rig)||rig===handle.old||handle.adopted||handle.disposed||candidate.isReady?.()!==true||candidate.report?.prepared!==true)throw Error('qa-canvas-combat-fresh-original-native-preparation-required');
   const nativePreparation=candidate.report;
   if(nativePreparation.textureUpload?.submitted!==true||nativePreparation.textureUpload.stateNormalized!==true||nativePreparation.textureUpload.error||!nativePreparation.shaders?.length||!nativePreparation.shaders.every(value=>value.ready===true))throw Error('qa-canvas-combat-common-original-texture-shader-required');
   if(rig.size!==256||rig.models?.size>3||rig.renderer?.info?.render?.frame!==0||rig.exactGPUAlphaBounds||rig.gpuPoseBounds||rig.directAlphaReadback||rig.cropNativeComposite||rig.batchInkComposite)throw Error('qa-canvas-combat-original-native-defaults-required');
   if(handle.old){if(protectedRigs.has(handle.old))throw Error('qa-canvas-combat-protected-old-native');entry.oldNative=handle.old;}
   if(renderer.adoptProductionEnemyLaunch(handle)!==true||renderer.liveEnemies!==rig)throw Error('qa-canvas-combat-owned-native-adopt-failed');
   if(handle.old)entry.contexts.add(handle.old);
   if(renderer.livePlayer?.ready!==true)throw Error('qa-canvas-combat-original-native-player-required');
   if(renderer.livePlayer.renderer?.info?.render?.frame!==0||renderer.liveBoss&&(renderer.liveBoss.size!==512||renderer.liveBoss.renderer?.info?.render?.frame!==0||renderer.liveBoss.exactGPUAlphaBounds||renderer.liveBoss.gpuPoseBounds||renderer.liveBoss.directAlphaReadback))throw Error('qa-canvas-combat-no-prime-original-player-boss-required');
   const assetsStart=now();await waitAssets(renderer);check();const assetsReadyMs=now()-assetsStart;entry.prepared=true;
   if(json(gameProof(game,game.events,[]))!==json(beforePreparation))throw Error('qa-canvas-combat-preparation-mutated-game');
   const sourceProof={borrowedRecords:entry.borrowed.size,ownedRecords:entry.art.records.size-entry.borrowed.size,readyRecords:[...entry.art.records.values()].filter(record=>record.status==='ready').length,nativeKeys:[...entry.plan.nativeEnemyKeys],nativeModels:rig.models?.size??0,nativeSize:rig.size,bossModels:renderer.liveBoss?.models?.size??0,bossSize:renderer.liveBoss?.size??null,nativeDrawsBefore:rig.renderer.info.render.frame,playerDrawsBefore:renderer.livePlayer.renderer?.info?.render?.frame??0,gpuAlphaEnabled:!!rig.exactGPUAlphaBounds,asphaltReady:renderer.textureStatus==='ready'};
   if(playerDeferredRead){
    const install=deps.installPlayerDeferredRead??(await waiting(import('./qa-player-deferred-read-install.js'),'player-deferred-read-module',entry)).installPlayerDeferredRead;check();
    if(typeof install!=='function'||protectedRigs.has(renderer.livePlayer)||renderer.livePlayer.directAlphaReadback||renderer.livePlayer.verifyAlphaReadback)throw Error('qa-player-deferred-read-owned-original-player-required');
    entry.deferredPlayer=renderer.livePlayer;if(deferredBoundedCost)entry.deferredInstallAttempted=true;entry.playerDeferred=install(entry.deferredPlayer,{enabled:mode==='deferred',verify:mode==='deferred'&&playerDeferredReadVerify});
    if(!entry.playerDeferred||typeof entry.playerDeferred.report!=='function'||typeof entry.playerDeferred.stop!=='function')throw Error('qa-player-deferred-read-valid-handle-required');
    const installed=entry.playerDeferred.report();if(installed.available!==true||installed.enabled!==(mode==='deferred')||installed.verify!==(mode==='deferred'&&playerDeferredReadVerify)||installed.used!==0||installed.fallbacks||installed.unexpectedCalls||installed.ownerMismatchCalls||!report.injected&&installed.injected||entry.deferredPlayer.renderer?.info?.render?.frame!==0)throw Error('qa-player-deferred-read-fresh-install-required');
    if(json(gameProof(game,game.events,[]))!==json(beforePreparation))throw Error('qa-player-deferred-read-install-mutated-game');
   }else if(playerAlphaRows){
    const install=deps.installPlayerAlphaRows??(await waiting(import('./qa-player-alpha-rows-install.js'),'player-alpha-rows-module',entry)).installPlayerAlphaRows;check();
    if(typeof install!=='function'||protectedRigs.has(renderer.livePlayer)||renderer.livePlayer.directAlphaReadback||renderer.livePlayer.verifyAlphaReadback)throw Error('qa-player-alpha-rows-owned-original-player-required');
    entry.rowsPlayer=renderer.livePlayer;entry.playerRows=install(entry.rowsPlayer,{enabled:mode==='rows',verify:mode==='rows'&&playerAlphaRowsVerify});
    if(!entry.playerRows||typeof entry.playerRows.report!=='function'||typeof entry.playerRows.stop!=='function')throw Error('qa-player-alpha-rows-valid-handle-required');
    const installed=entry.playerRows.report();if(installed.available!==true||installed.enabled!==(mode==='rows')||installed.used!==0||installed.fallbacks||installed.unexpectedCalls||installed.ownerMismatchCalls||entry.rowsPlayer.renderer?.info?.render?.frame!==0)throw Error('qa-player-alpha-rows-fresh-install-required');
    if(json(gameProof(game,game.events,[]))!==json(beforePreparation))throw Error('qa-player-alpha-rows-install-mutated-game');
   }else if(playerPreparation){
    const playerStart=now(),prepare=deps.prepareFreshPlayerLaunch??(await waiting(import('./qa-player-launch-preparation.js'),'player-preparation-module',entry)).prepareFreshPlayerLaunch;check();
    if(typeof prepare!=='function'||protectedRigs.has(renderer.livePlayer))throw Error('qa-player-preparation-owned-factory-required');
    entry.preparedPlayer=renderer.livePlayer;
    const pending=Promise.resolve(prepare(entry.preparedPlayer,game.player.weapon,{enabled:mode==='prepared',signal:controller.signal,now:deps.now,timeoutMs:15000}));
    // Register before the generic await/race handler: a late returned handle
    // must be disposed even when the cancelled await body never resumes.
    pending.then(handle=>{entry.playerLaunch=handle;if(entry.closed)operation('playerPreparation.late-handle',()=>disposePlayerLaunch(entry));},()=>{});
    const handle=await waiting(pending,'player-preparation',entry);check();
    if(!handle||typeof handle.isReady!=='function'||typeof handle.dispose!=='function'||renderer.livePlayer!==entry.preparedPlayer)throw Error('qa-player-preparation-valid-handle-required');
    const prepared=handle.report,enabled=mode==='prepared';
    if(prepared?.enabled!==enabled||prepared.prepared!==true||prepared.ready!==true||prepared.preserved!==true||prepared.error||prepared.textureUpload?.stateNormalized!==true||prepared.textureUpload.submitted!==enabled||!Array.isArray(prepared.shaders)||enabled&&(!prepared.textureUpload.textures?.length||prepared.shaders.length!==2||prepared.shaders[0].root!=='run'||prepared.shaders[1].root!=='weapon'||prepared.shaders.some(shader=>shader.ready!==true))||!enabled&&prepared.shaders.length!==0||entry.preparedPlayer.renderer?.info?.render?.frame!==0)throw Error('qa-player-preparation-original-apis-required');
    entry.playerLaunchReport=JSON.parse(json(prepared));entry.playerLaunchMs=now()-playerStart;
    if(json(gameProof(game,game.events,[]))!==json(beforePreparation))throw Error('qa-player-preparation-mutated-game');
   }else if(originalAttribution){
    const create=deps.createRenderAttribution??(await waiting(import('./qa-render-attribution.js'),'attribution-module',entry)).createRenderAttribution;check();
    if(typeof create!=='function')throw Error('qa-render-attribution-factory-required');
    entry.attribution=create({renderer,now:deps.now,enabled:true,limit:40,maxOutliers:32,...(playerAttribution?{playerOnly:true}:{})});
    if(!entry.attribution||['beginFrame','endFrame','report','stop'].some(key=>typeof entry.attribution[key]!=='function')||entry.attribution.report().enabled!==true)throw Error('qa-render-attribution-unavailable');
   }else if(!originalReadbackProbe){
    entry.installer=deps.installCanvasStateCandidate({renderer,mode});
    if(entry.installer?.report?.().available!==true)throw Error('qa-canvas-combat-installer-unavailable');
   }
   const tick=game.tick;entry.tickBefore=Object.getOwnPropertyDescriptor(game,'tick');
   const tracedTick=function(...args){if(this===game)entry.commands.push({dt:args[0],command:{...args[1]}});return Reflect.apply(tick,this,args);};
   Object.defineProperty(game,'tick',{value:tracedTick,writable:true,configurable:true,enumerable:false});entry.tickExpected=Object.getOwnPropertyDescriptor(game,'tick');
   const preparationMs=now()-preparationStart,samples=[],yields=[],interpolation=new deps.ActorInterpolation();let accumulator=0,previousFrameStart=null;
   const pass={arm,mode,preparation:{preparationMs,loadAndNativePreparationMs,assetsReadyMs,native:nativePreparation,source:sourceProof},firstFrame:null,all40Summary:null,steady30Summary:null,samples,installer:null,canvas:{width:canvas.width,height:canvas.height,dpr:renderer.dpr,cssWidth:renderer.width,cssHeight:renderer.height},readbackMs:0,exportMs:0,yields,finalState:null};if(originalAttribution){pass.attribution=null;pass.preparation.originalLaunchWaitLimitMs=60000;}if(playerPreparation){pass.preparation.originalLaunchWaitLimitMs=60000;pass.preparation.player=entry.playerLaunchReport;pass.preparation.playerPreparationMs=entry.playerLaunchMs;pass.preparation.playerFinalizationMs=0;pass.preparation.playerReadyBeforeFirstDraw=false;pass.preparation.playerDisposedBeforeFirstDraw=false;}entry.pass=pass;report.passes.push(pass);
   if(playerAlphaRows){pass.preparation.originalLaunchWaitLimitMs=60000;pass.playerAlphaRows=entry.playerRows.report();}
   if(playerDeferredRead){pass.preparation.originalLaunchWaitLimitMs=60000;pass.playerDeferredRead=entry.playerDeferred.report();}
   if(originalReadbackProbe){pass.qualityOnly=true;pass.preparation.originalLaunchWaitLimitMs=60000;}
   const passStart=now();
   for(let frame=0;frame<40;frame++){
    check();if(game.state!=='playing')throw Error('qa-canvas-combat-normal-run-ended-'+arm+'-'+frame);
    onProgress({arm,phase:'combat',frame});check();entry.commands=[];
    if(playerPreparation&&frame===0){
     const finalizationStart=now();
     if(renderer.livePlayer!==entry.preparedPlayer||entry.preparedPlayer.renderer?.info?.render?.frame!==0||entry.playerLaunch.isReady()!==true)throw Error('qa-player-preparation-stale-before-first-draw');
     pass.preparation.playerReadyBeforeFirstDraw=true;disposePlayerLaunch(entry);pass.preparation.playerDisposedBeforeFirstDraw=entry.playerLaunchDisposed;
     if(json(gameProof(game,game.events,[]))!==json(beforePreparation))throw Error('qa-player-preparation-finalization-mutated-game');
     pass.preparation.playerFinalizationMs=now()-finalizationStart;pass.preparation.preparationMs+=pass.preparation.playerFinalizationMs;
    }
    const beforeDeferred=playerDeferredRead?entry.playerDeferred.report():null;
    const beforeRows=playerAlphaRows?entry.playerRows.report():null;
    const before=entry.installer?entry.installer.report():NO_INSTALLER,start=now();accumulator+=.12;
    const advanced=deps.advanceSimulation(game,{moveX:0,moveY:0,shoot:false,fireMode:'auto',aimX:game.player.x+300,aimY:game.player.y},accumulator,{interpolator:interpolation});accumulator=advanced.accumulator;
    const simulationEnd=now(),events=game.drainEvents(),interpolationStart=now(),view=interpolation.sample(game,accumulator/deps.FIXED_STEP,deps.FIXED_STEP),interpolationEnd=now();
    if(originalAttribution){
     entry.attribution.beginFrame({arm,frame,first:frame===0});let renderThrew=false;
     try{renderer.render(view,advanced.command,(frame+1)*.12);}catch(error){renderThrew=true;throw error;}
     finally{try{entry.attribution.endFrame({arm,frame});}catch(error){if(renderThrew)cleanupError('attribution.endFrame',error);else throw error;}}
    }else renderer.render(view,advanced.command,(frame+1)*.12);
    const afterDeferred=playerDeferredRead?entry.playerDeferred.report():null;
    const afterRows=playerAlphaRows?entry.playerRows.report():null;
    const end=now(),after=entry.installer?entry.installer.report():NO_INSTALLER;
    const sample={frame,captureIntervalMs:previousFrameStart===null?null:start-previousFrameStart,simulationMs:simulationEnd-start,interpolationMs:interpolationEnd-interpolationStart,renderMs:end-interpolationEnd,callbackMs:end-start,tickCount:entry.commands.length,commands:entry.commands,bakedNpcManualCalls:after.bakedNpcManualCalls-before.bakedNpcManualCalls,candidateUsed:after.candidateUsed-before.candidateUsed,factoryCalls:after.factoryCalls-before.factoryCalls,nativeSelected:renderer.liveEnemySelection?.size??0,nativeRenderFrame:rig.renderer.info.render.frame,nativeModels:rig.models?.size??0,nativePending:rig.pending?.size??0,nativePendingWithoutModel:rig.pending instanceof Map?[...rig.pending.keys()].filter(key=>!rig.models.has(key)).length:0};previousFrameStart=start;samples.push(sample);
    if(after.available!==true||after.ownerMismatchCalls||after.falseReturns||rig.error||rig.lost||rig.exactGPUAlphaBounds||rig.gpuAlphaStats?.frames||rig.gpuAlphaBounds?.reads||sample.nativeSelected>12)throw Error('qa-canvas-combat-render-guard-failed');
    if(playerPreparation&&(renderer.livePlayer!==entry.preparedPlayer||!entry.preparedPlayer.ready||entry.preparedPlayer.error))throw Error('qa-player-preparation-runtime-player-error');
    if(playerAlphaRows){
     sample.playerAlphaRows={used:afterRows.used-beforeRows.used,bytesRead:afterRows.bytesRead-beforeRows.bytesRead};
     if(renderer.livePlayer!==entry.rowsPlayer||entry.rowsPlayer.ready!==true||entry.rowsPlayer.error||entry.rowsPlayer.directAlphaReadback||entry.rowsPlayer.verifyAlphaReadback||afterRows.available!==true||afterRows.fallbacks||afterRows.unexpectedCalls||afterRows.ownerMismatchCalls||mode==='rows'&&sample.playerAlphaRows.used<1||mode==='original'&&afterRows.used!==0)throw Error('qa-player-alpha-rows-runtime-guard-failed');
     if(playerAlphaRowsVerify&&mode==='rows'&&(!(afterRows.verification?.calls>=afterRows.used)||afterRows.verification.rowDifferences||afterRows.verification.boundsDifferences||afterRows.verification.contourDifferences))throw Error('qa-player-alpha-rows-same-frame-verification-failed');
    }
    if(playerDeferredRead){
     sample.playerDeferredRead={used:afterDeferred.used-beforeDeferred.used};
     if(renderer.livePlayer!==entry.deferredPlayer||entry.deferredPlayer.ready!==true||entry.deferredPlayer.error||entry.deferredPlayer.directAlphaReadback||entry.deferredPlayer.verifyAlphaReadback||afterDeferred.available!==true||afterDeferred.fallbacks||afterDeferred.unexpectedCalls||afterDeferred.ownerMismatchCalls||mode==='deferred'&&sample.playerDeferredRead.used<1||mode==='original'&&afterDeferred.used!==0)throw Error('qa-player-deferred-read-runtime-guard-failed');
     if(playerDeferredReadVerify&&mode==='deferred'&&(!(afterDeferred.verification?.calls>=afterDeferred.used)||afterDeferred.verification.passed!==true))throw Error('qa-player-deferred-read-same-context-verification-failed');
    }
    if(game.state!=='playing')throw Error('qa-canvas-combat-normal-run-ended-'+arm+'-'+frame);
    const proof=gameProof(game,events,entry.commands);
    if(arm==='A1')baseline.push(proof);else{
     report.equivalence.framesCompared++;
     for(const key of ['state','events','commands','motion','random','visualRandom'])if(proof[key]!==baseline[frame][key]){report.equivalence[key]=false;if(report.equivalence.mismatches.length<3)report.equivalence.mismatches.push({arm,frame,field:key,expected:baseline[frame][key],actual:proof[key]});}
    }
    if((frame+1)%8===0){const yieldStart=now();await waiting(deps.yieldFrames({arm,frame,signal:controller.signal}),'batch-eight-yield',entry);yields.push({afterFrame:frame,elapsedMs:now()-yieldStart});check();}
   }
   pass.passWallMs=now()-passStart;pass.firstFrame=samples[0];pass.all40Summary=summarizeFrames(samples);pass.steady30Summary=summarizeFrames(samples.slice(10));pass.installer=entry.installer?entry.installer.report():null;if(originalAttribution){pass.attribution=entry.attribution.report();if(pass.attribution.samples?.length!==40)throw Error('qa-render-attribution-forty-samples-required');}pass.runtimeNative={maxModels:Math.max(...samples.map(sample=>sample.nativeModels)),maxPending:Math.max(...samples.map(sample=>sample.nativePending)),maxPendingWithoutModel:Math.max(...samples.map(sample=>sample.nativePendingWithoutModel))};
   if(!samples.some(sample=>sample.nativeSelected>0)||rig.renderer.info.render.frame<=sourceProof.nativeDrawsBefore)throw Error('qa-canvas-combat-real-native-render-required');
   if(mode==='manual'&&!(pass.installer.bakedNpcManualCalls>0&&pass.installer.candidateUsed>0))throw Error('qa-canvas-combat-positive-baked-manual-usage-required');
   if(mode==='original'&&pass.installer&&(pass.installer.candidateUsed||pass.installer.bakedNpcManualCalls))throw Error('qa-canvas-combat-original-arm-not-original');
   if(playerAlphaRows){pass.playerAlphaRows=entry.playerRows.report();if(mode==='rows'&&!(pass.playerAlphaRows.used>=40&&pass.playerAlphaRows.bytesRead>=40*1024))throw Error('qa-player-alpha-rows-positive-usage-required');}
   if(playerDeferredRead){pass.playerDraws={before:sourceProof.playerDrawsBefore,after:renderer.livePlayer.renderer.info.render.frame};pass.playerDeferredRead=entry.playerDeferred.report();if(mode==='deferred'&&!(pass.playerDeferredRead.used>=40))throw Error('qa-player-deferred-read-positive-usage-required');}
   pass.finalState={hp:game.player.hp,kills:game.kills,enemies:game.enemies.length,time:game.time,random:game.random.getState(),visualRandom:game.visualRandom.getState(),state:game.state};
   const readStart=now(),pixels=renderer.ctx.getImageData(0,0,canvas.width,canvas.height).data;pixelBuffers.push(pixels);pass.readbackMs=now()-readStart;
   let originalReadbackFailure=null;
   if(originalReadbackProbe){
    pass.originalReadback=probeOriginalReadback(renderer,pixels,{readFloor:true,injected:report.injected});
    if(!pass.originalReadback||typeof pass.originalReadback!=='object'||!report.injected&&pass.originalReadback.injected!==false)throw Error('qa-original-readback-valid-native-report-required');
    const proofAfter=gameProof(game,[],entry.commands),proofBefore=baseline.at(-1);pass.originalReadbackGameUnchanged=['state','motion','commands','random','visualRandom'].every(key=>proofAfter[key]===proofBefore[key]);
    if(pass.originalReadback.complete!==true||pass.originalReadback.stable!==true||pass.originalReadback.error||pass.originalReadback.errors?.length||!pass.originalReadbackGameUnchanged)originalReadbackFailure=Error(!pass.originalReadbackGameUnchanged?'qa-original-readback-game-mutated':'qa-original-readback-unstable-or-incomplete');
   }
   pass.sumPlusReadbackMs=pass.all40Summary.callbackMs.sumMs+pass.readbackMs;pass.drainInclusiveSummary=summarize([...samples.map(sample=>sample.callbackMs),pass.readbackMs]);
   const exportStart=now();try{images.push({arm,src:canvas.toDataURL('image/png'),alt:(originalReadbackProbe?'180적 원본 진단 후 Canvas (primary R0 동등 미인증) ':'180적 원본 전투 Canvas ')+arm+' ('+mode+')'});}catch(error){if(originalReadbackFailure){pass.originalReadbackSecondaryError=text(error);throw originalReadbackFailure;}throw error;}pass.exportMs=now()-exportStart;
   if(originalReadbackFailure){check();try{await waiting(onImage({...images.at(-1)}),'original-readback-partial-image');}catch(error){pass.originalReadbackSecondaryError=text(error);}throw originalReadbackFailure;}
   const effectivePreparationMs=playerPreparation?pass.preparation.preparationMs:preparationMs;
   pass.preparationPlusFirstMs=effectivePreparationMs+samples[0].callbackMs;pass.preparationPlusAll40Ms=effectivePreparationMs+pass.all40Summary.callbackMs.sumMs;
   if(playerPreparation||playerAlphaRows||playerDeferredRead)pass.totalPreparationAndCombatAndReadbackMs=effectivePreparationMs+pass.sumPlusReadbackMs;
   operation('arm.retire',()=>retire(entry));pass.installer=entry.installFinal;check();
  }
  if(originalAttribution||originalReadbackProbe){
   report.pixels={originalRepeat:pixelDifference(pixelBuffers[0],pixelBuffers[1])};
   report.readbackStorage={arrays:pixelBuffers.length,bytes:pixelBuffers.reduce((sum,value)=>sum+value.byteLength,0),pngCount:images.length,note:'Two original final-canvas arrays and at most two PNG strings; raw arrays are dropped after strict AA comparison. Not a peak-memory measurement.'};
  }else{
  report.pixels={candidateVsFirst:pixelDifference(pixelBuffers[0],pixelBuffers[1]),originalRepeat:pixelDifference(pixelBuffers[0],pixelBuffers[2]),candidateVsRepeat:pixelDifference(pixelBuffers[1],pixelBuffers[2])};
  report.readbackStorage={arrays:pixelBuffers.length,bytes:pixelBuffers.reduce((sum,value)=>sum+value.byteLength,0),pngCount:images.length,note:'Three sequential final-canvas readback arrays and at most three PNG strings are retained until comparison, then raw arrays are dropped; source-pixel storage only, not a peak-memory measurement.'};
  const [a,b,a2]=report.passes,fastSum=Math.min(a.sumPlusReadbackMs,a2.sumPlusReadbackMs),improvement=fastSum?1-b.sumPlusReadbackMs/fastSum:0;
  const callbackTailsNoWorse=b.all40Summary.callbackMs.p95Ms<=Math.min(a.all40Summary.callbackMs.p95Ms,a2.all40Summary.callbackMs.p95Ms)&&b.all40Summary.callbackMs.maxMs<=Math.min(a.all40Summary.callbackMs.maxMs,a2.all40Summary.callbackMs.maxMs);
  const drainTailsNoWorse=b.drainInclusiveSummary.p95Ms<=Math.min(a.drainInclusiveSummary.p95Ms,a2.drainInclusiveSummary.p95Ms)&&b.drainInclusiveSummary.maxMs<=Math.min(a.drainInclusiveSummary.maxMs,a2.drainInclusiveSummary.maxMs),tailsNoWorse=callbackTailsNoWorse&&drainTailsNoWorse;
  report.performance={accepted:false,fasterOriginalAll40SumMs:Math.min(a.all40Summary.callbackMs.sumMs,a2.all40Summary.callbackMs.sumMs),candidateAll40SumMs:b.all40Summary.callbackMs.sumMs,fasterOriginalSumPlusReadbackMs:fastSum,candidateSumPlusReadbackMs:b.sumPlusReadbackMs,improvementFraction:improvement,callbackTailsNoWorse,drainTailsNoWorse,tailsNoWorse,requiredImprovementFraction:.03,note:'Diagnostic precriterion only: at least3% lower all40 callback sum plus final readback drain than the faster original arm; both callback40 and drain-inclusive41 p95/max may not regress against either original arm. Quality, literal equivalence, positive baked usage and cleanup must also pass. Injected tests are never accepted. No default adoption or FPS claim.'};
  if(playerPreparation){
   const fastTotal=Math.min(a.totalPreparationAndCombatAndReadbackMs,a2.totalPreparationAndCombatAndReadbackMs),totalImprovement=fastTotal?1-b.totalPreparationAndCombatAndReadbackMs/fastTotal:0,firstCallbackNoWorse=b.firstFrame.callbackMs<=Math.min(a.firstFrame.callbackMs,a2.firstFrame.callbackMs);
   report.performance={accepted:false,adopted:false,criterion:'preparation+callback40+finalReadback',fasterOriginalTotalMs:fastTotal,candidateTotalMs:b.totalPreparationAndCombatAndReadbackMs,improvementFraction:totalImprovement,fasterOriginalAll40SumMs:Math.min(a.all40Summary.callbackMs.sumMs,a2.all40Summary.callbackMs.sumMs),candidateAll40SumMs:b.all40Summary.callbackMs.sumMs,fasterOriginalSumPlusReadbackMs:fastSum,candidateSumPlusReadbackMs:b.sumPlusReadbackMs,firstCallbackNoWorse,callbackTailsNoWorse,drainTailsNoWorse,tailsNoWorse,requiredImprovementFraction:.03,note:'QA diagnostic only: preparation (including first-draw certificate disposal) plus all40 callback wall and final readback must improve at least3% over the faster normalized control; first callback and callback40/drain41 p95/max cannot regress against either control. Raw preparation/first/steady/callback/drain stay separate so a startup cost shift is not a total win. Strict pixels, literal Game equivalence and cleanup must pass. Injected tests are never accepted; product adoption is never automatic.'};
  }
  if(playerAlphaRows){
   const fastTotal=Math.min(a.totalPreparationAndCombatAndReadbackMs,a2.totalPreparationAndCombatAndReadbackMs),totalImprovement=fastTotal?1-b.totalPreparationAndCombatAndReadbackMs/fastTotal:0,firstCallbackNoWorse=b.firstFrame.callbackMs<=Math.min(a.firstFrame.callbackMs,a2.firstFrame.callbackMs);
   report.performance={accepted:false,adopted:false,qualityOnly:playerAlphaRowsVerify,criterion:'preparation+callback40+finalReadback',fasterOriginalTotalMs:fastTotal,candidateTotalMs:b.totalPreparationAndCombatAndReadbackMs,improvementFraction:totalImprovement,firstCallbackNoWorse,callbackTailsNoWorse,drainTailsNoWorse,tailsNoWorse,requiredImprovementFraction:.03,note:'Only cost mode without verification can be performance evidence. Preparation plus40 callbacks plus final drain must improve3% over the faster original; first callback and40/41 p95/max may not regress against either original. GPU row copy/render/read and computational mask work remain inside timing. Strict pixels, literal Game, actual usage with no fallbacks, method/resource cleanup and independent same-frame quality are required. No automatic adoption/FPS/peak-memory claim.'};
  }
  if(playerDeferredRead){
   const fastTotal=Math.min(a.totalPreparationAndCombatAndReadbackMs,a2.totalPreparationAndCombatAndReadbackMs),totalImprovement=fastTotal?1-b.totalPreparationAndCombatAndReadbackMs/fastTotal:0,firstCallbackNoWorse=b.firstFrame.callbackMs<=Math.min(a.firstFrame.callbackMs,a2.firstFrame.callbackMs),steady30NoWorse=['medianMs','p95Ms','maxMs','sumMs'].every(key=>b.steady30Summary.callbackMs[key]<=Math.min(a.steady30Summary.callbackMs[key],a2.steady30Summary.callbackMs[key]));
   report.performance={accepted:false,adopted:false,qualityOnly:playerDeferredReadVerify,criterion:'preparation+callback40+finalReadback and steady30',fasterOriginalTotalMs:fastTotal,candidateTotalMs:b.totalPreparationAndCombatAndReadbackMs,improvementFraction:totalImprovement,firstCallbackNoWorse,steady30NoWorse,callbackTailsNoWorse,drainTailsNoWorse,tailsNoWorse,requiredImprovementFraction:.03,note:'Predeclared before measurement: total preparation+40callbacks+finalDrain at least3% lower than fasterA; first callback and all four steady30 callback median/p95/max/sum no worse than eitherA, plus40/41 p95/max no worse. Native success-path quality, literal Game, usage without fallbacks, cleanup and strict whole AA/AB/BA are required. Same original fullRGBA read and original GL draw count remain. Single bracket is diagnostic, injected tests never accepted, no automatic adoption/FPS/memory claim.'};
  }
  }
  for(const image of images){check();await waiting(onImage({...image}),'image-callback');}check();
  if(report.equivalence.mismatches.length)throw Error('qa-canvas-combat-literal-game-equivalence-failed');
  if(Object.values(report.pixels).some(diff=>diff.differentComponents!==0||diff.maxDelta!==0||!diff.dimensionsEqual))throw Error('qa-canvas-combat-whole-canvas-pixels-differ');
 }catch(error){primary=error;report.error=text(error);}
 finally{
  finished=true;try{signal?.removeEventListener?.('abort',abort);}catch(error){cleanupError('signal.detach',error);}try{controller.abort();}catch(error){cleanupError('signal.abort',error);}
  for(const entry of owned)operation('arm.retire',()=>retire(entry));
  if(boundedOwnedCleanup){
   try{cleanup.drain=cleanupTracker?await cleanupTracker.wait():{complete:false,reason:'tracker-not-created'};if(!cleanup.drain||typeof cleanup.drain!=='object')throw Error('qa-owned-cleanup-valid-drain-report-required');}catch(error){cleanupError('late.drain',error);cleanup.drain={complete:false,reason:'wait-failed'};}
   const drain=cleanup.drain;cleanup.lateScheduled=drain.scheduled??0;cleanup.lateSettled=drain.completed??0;
   for(const entry of owned)operation('late.final-snapshot.'+entry.arm,()=>{const row=cleanup.arms.find(row=>row.arm===entry.arm),renderer=entry.renderer;if(!row)return;row.finalAfterDrain=false;
    row.ownedRecordsRemaining=entry.art?.records?.size??0;row.npcModelsRemaining=renderer?.liveEnemies?.models?.size??0;row.bossModelsRemaining=renderer?.liveBoss?.models?.size??0;row.playerModelsRemaining=renderer?.livePlayer?.models?.size??0;
    row.npcPendingRemaining=renderer?.liveEnemies?.pending?.size??0;row.bossPendingRemaining=renderer?.liveBoss?.pending?.size??0;row.playerWeaponsRemaining=renderer?.livePlayer?.weapons?.size??0;row.playerWeaponLoadsRemaining=renderer?.livePlayer?.weaponLoads?.size??0;row.latePending=entry.pending.size;
    const surfaces=[entry.canvas,...['floor','minimapCanvas','nativeMaskCanvas'].map(key=>renderer?.[key])];let allRigModels=0,allRigPending=0;
    for(const rig of entry.contexts){allRigModels+=rig.models?.size??0;allRigPending+=rig.pending instanceof Map?rig.pending.size:0;for(const key of ['raw','ink','gpuRaw','canvas','body','bottleCanvas'])surfaces.push(rig[key]);surfaces.push(rig.renderer?.domElement);for(const slot of rig.framePool?.slots??rig.pool?.slots??[])surfaces.push(slot.image,slot.canvas,slot.body);}
    row.allOwnedRigModelsRemaining=allRigModels;row.allOwnedRigPendingRemaining=allRigPending;row.nativeCanvasesReleased=surfaces.filter(value=>value&&typeof value.width==='number'&&typeof value.height==='number').every(value=>value.width===0&&value.height===0);
    row.canvasReleased=entry.canvas.width===0&&entry.canvas.height===0;row.finalAfterDrain=true;
   });
  }
  operation('main.owner-proof',()=>{cleanup.mainOwnersUnchanged=sameOwn(mainRenderer,mainDescriptors);cleanup.mainArtUnchanged=sameOwn(mainArt,artDescriptors);cleanup.mainRecordsUnchanged=mainArt.records===records&&records.size===recordsBefore.length&&recordsBefore.every(([id,record])=>records.get(id)===record&&sameOwn(record,recordDescriptors.get(record)));cleanup.mainNativeCachesUnchanged=nativeMainCurrent();cleanup.mainSourceImagesUnchanged=protectedImageDimensions.every(([image,width,height])=>Object.is(image.width,width)&&Object.is(image.height,height));});
  cleanup.complete=cleanup.errors.length===0&&cleanup.uncancelableAsphaltPending===0&&cleanup.unprovenPlayerParallelLoads===0&&cleanup.mainOwnersUnchanged&&cleanup.mainArtUnchanged&&cleanup.mainRecordsUnchanged&&cleanup.mainNativeCachesUnchanged&&cleanup.mainSourceImagesUnchanged&&cleanup.ownedRenderers===cleanup.retiredRenderers&&cleanup.ownedArts===cleanup.releasedArts&&cleanup.hostsCreated===cleanup.hostsRemoved&&cleanup.arms.every(arm=>arm.borrowedDetached&&arm.ownedRecordsRemaining===0&&arm.npcModelsRemaining===0&&arm.bossModelsRemaining===0&&arm.playerModelsRemaining===0&&arm.canvasReleased&&arm.installerRestored)&&cleanup.lateScheduled===cleanup.lateSettled;
  if(boundedOwnedCleanup)cleanup.complete=cleanup.complete&&cleanup.drain?.success===true&&cleanup.arms.every(arm=>arm.finalAfterDrain&&arm.npcPendingRemaining===0&&arm.bossPendingRemaining===0&&arm.playerWeaponsRemaining===0&&arm.playerWeaponLoadsRemaining===0&&arm.latePending===0&&arm.allOwnedRigModelsRemaining===0&&arm.allOwnedRigPendingRemaining===0&&arm.nativeCanvasesReleased);
  if(originalAttribution)cleanup.complete=cleanup.complete&&cleanup.arms.every(arm=>arm.attributionRestored===true);
  if(playerPreparation)cleanup.complete=cleanup.complete&&cleanup.arms.every(arm=>arm.playerPreparationDisposed===true);
  if(playerAlphaRows)cleanup.complete=cleanup.complete&&cleanup.arms.every(arm=>arm.playerAlphaRowsRestored===true);
  if(playerDeferredRead)cleanup.complete=cleanup.complete&&cleanup.arms.every(arm=>arm.playerDeferredReadRestored===true);
  active.delete(mainRenderer);baseline.length=0;pixelBuffers.length=0;
 }
 if(!primary&&!cleanup.complete){primary=Error('qa-canvas-combat-cleanup-failed');report.error=primary.message;}
 report.complete=!primary&&cleanup.complete&&report.passes.length===arms.length;
 if(report.performance&&!originalReadbackProbe)report.performance.accepted=!report.injected&&report.complete&&report.performance.improvementFraction>=.03&&report.performance.tailsNoWorse&&(!(playerPreparation||playerAlphaRows||playerDeferredRead)||report.performance.firstCallbackNoWorse)&&(!playerAlphaRows||!playerAlphaRowsVerify)&&(!playerDeferredRead||report.performance.steady30NoWorse&&!playerDeferredReadVerify);
 if(boundedOwnedCleanup){const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};report.cleanup=freeze(JSON.parse(JSON.stringify(cleanup)));}
 if(primary){try{Object.defineProperty(primary,'report',{value:report,configurable:true,enumerable:true});Object.defineProperty(primary,'cleanup',{value:report.cleanup,configurable:true,enumerable:true});}catch{}throw primary;}
 return{report};
}
