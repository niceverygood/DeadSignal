import * as THREE from './player-rig/vendor/three.module.js';
import {isQAMemoryStorage} from './qa-storage.js';
import {nativeLaunchKeys} from './native-launch-plan.js';
import {prepareNativeEnemyLaunch} from './boss-rig/native-launch-preparation.js';
import {GPUAlphaBounds} from './boss-rig/gpu-alpha-bounds.js';
import {compareNativeComposite} from './qa-native-composite.js';
import {compareBulletBroadphase} from './qa-bullet-broadphase.js';
import {createNativeFrameProfile} from './qa-native-frame-profile.js';

const active=new WeakSet(),fields=['liveEnemies','liveEnemiesPromise','liveEnemiesLoading'];
const state=renderer=>({target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),level:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()).toArray(),scissor:renderer.getScissor(new THREE.Vector4()).toArray(),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear});
const sameState=(a,b)=>a.target===b.target&&a.face===b.face&&a.level===b.level&&a.scissorTest===b.scissorTest&&a.autoClear===b.autoClear&&JSON.stringify([a.viewport,a.scissor])===JSON.stringify([b.viewport,b.scissor]);
const percentile=(values,p)=>values.sort((a,b)=>a-b)[Math.floor(values.length*p)]??0;
const summary=values=>{values=values.filter(Number.isFinite);return{medianMs:percentile([...values],.5),p95Ms:percentile([...values],.95),maxMs:Math.max(0,...values),sumMs:values.reduce((sum,value)=>sum+value,0)};};
const stageSummary=(samples,label)=>summary(samples.map(sample=>sample.stages[label]?.cpuMs||0));
const programCount=rig=>rig.renderer.info?.programs?.length??0;
const objectLike=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const sameDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));

export function allowGPUAlphaPreupload(location,query,storage){
 return location?.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&location.port==='8851'&&query?.has('qa')&&query.has('qa-memory')&&isQAMemoryStorage(storage);
}

// Standalone QA only. The memory-store brand is a gate; this experiment makes
// no storage calls and does not verify the actual app's persistence or loop.
export async function compareGPUAlphaPreupload(renderer,canvas,{storage,location=globalThis.location,query=new URLSearchParams(location?.search??''),signal,beforeScenario=async()=>{},onProgress=()=>{},onImage=()=>{}}={}){
 if(!allowGPUAlphaPreupload(location,query,storage))throw Error('gpu-alpha-preupload-qa-only');
 if(!renderer||active.has(renderer))throw Error('gpu-alpha-preupload-already-active');
 if(signal?.aborted)throw Error('gpu-alpha-preupload-aborted');
 const saved=new Map(),expected=new Map();
 for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(renderer,key);if(descriptor&&!('value'in descriptor))throw Error('gpu-alpha-preupload-data-owner-required');saved.set(key,descriptor);expected.set(key,descriptor);}
 const originalRig=expected.get('liveEnemies')?.value;if(!originalRig)throw Error('gpu-alpha-preupload-original-rig-required');
 const controller=new AbortController(),retired=new WeakSet(),disposedHandles=new WeakSet(),qualityWarmups=[],reports=[],cleanup={ownedRigCount:0,retiredRigCount:0,handleDisposals:0,errors:[],retired:[],ownerDescriptorsRestored:false,externalReplacementPreserved:false};
 let rig=null,handle=null,profile=null,finished=false,completed=false,rejectCancelled,finalGame,imageQueue=Promise.resolve();
 const cancellation=new Promise((resolve,reject)=>{rejectCancelled=reject;});
 // A later abort still has a rejection handler even between awaited phases.
 cancellation.catch(()=>{});
 const current=()=>fields.every(key=>sameDescriptor(Object.getOwnPropertyDescriptor(renderer,key),expected.get(key)));
 const check=()=>{if(finished||controller.signal.aborted||signal?.aborted)throw Error('gpu-alpha-preupload-aborted');if(cleanup.errors.length)throw Error('gpu-alpha-preupload-cleanup-failed');if(!current())throw Error('gpu-alpha-preupload-owner-changed');};
 const wait=promise=>Promise.race([Promise.resolve(promise),cancellation]);
 const cleanupError=(where,error)=>{let message;try{message=error?.message;}catch{}cleanup.errors.push({where,error:typeof message==='string'?message:'cleanup-failed'});};
 const disposeHandle=candidate=>{if(!objectLike(candidate)||candidate.rig===originalRig||disposedHandles.has(candidate))return;disposedHandles.add(candidate);cleanup.handleDisposals++;try{candidate.dispose();}catch(error){cleanupError('handle.dispose',error);}};
 const retire=owned=>{
  if(!objectLike(owned)||owned===originalRig||retired.has(owned))return;retired.add(owned);cleanup.retiredRigCount++;
  const entry={index:cleanup.retiredRigCount,modelsRemaining:null,helperRawBytesAfterRelease:null,lateReleasesScheduled:0,lateReleasesSettled:0};cleanup.retired.push(entry);
  let pending=[];try{pending=[...(owned.pending?.values?.()||[])];}catch(error){cleanupError('pending.values',error);}
  try{owned.releaseUnused([]);}catch(error){cleanupError('releaseUnused',error);}
  try{owned.releaseExactGPUAlpha?.();}catch(error){cleanupError('releaseExactGPUAlpha',error);}
  try{owned.renderer?.dispose();}catch(error){cleanupError('renderer.dispose',error);}
  try{owned.renderer?.forceContextLoss();}catch(error){cleanupError('renderer.forceContextLoss',error);}
  entry.modelsRemaining=owned.models?.size??null;entry.helperRawBytesAfterRelease=owned.gpuAlphaBounds?.rawBytes??0;entry.lateReleasesScheduled=pending.length;
  // Original GLTF requests cannot be cancelled. Their late CPU models belong
  // only to this retired QA rig and must never be adopted by a later arm.
  for(const promise of pending)Promise.resolve(promise).then(()=>{try{owned.releaseUnused([]);}catch(error){cleanupError('late.releaseUnused',error);}entry.lateReleasesSettled++;entry.modelsRemaining=owned.models?.size??null;entry.helperRawBytesAfterRelease=owned.gpuAlphaBounds?.rawBytes??0;},()=>{entry.lateReleasesSettled++;});
 };
 function restoreOwners(){
  for(const key of fields){
   try{const descriptor=Object.getOwnPropertyDescriptor(renderer,key);if(sameDescriptor(descriptor,expected.get(key))){const before=saved.get(key);if(before)Object.defineProperty(renderer,key,before);else if(!delete renderer[key])throw Error('owner-delete-failed');expected.set(key,before);}else if(!sameDescriptor(descriptor,saved.get(key)))cleanup.externalReplacementPreserved=true;}catch(error){cleanupError('owner.restore.'+key,error);}
  }
 }
 function releaseArm(){
  try{profile?.stop();}catch(error){cleanupError('profile.stop',error);}profile=null;
  restoreOwners();const owned=rig;rig=null;disposeHandle(handle);handle=null;retire(owned);
 }
 const abort=()=>{if(finished||controller.signal.aborted)return;controller.abort();releaseArm();rejectCancelled(Error('gpu-alpha-preupload-aborted'));};
 const queueImage=value=>{
  imageQueue=imageQueue.then(()=>{check();return onImage(value);});
  imageQueue.catch(()=>{});return imageQueue;
 };
 function assign(owned){
  check();
  for(const [key,value]of [['liveEnemies',owned],['liveEnemiesPromise',Promise.resolve(owned)],['liveEnemiesLoading',true]]){
   const descriptor=Object.getOwnPropertyDescriptor(renderer,key);
   const next=descriptor?{...descriptor,value}:{value,writable:true,configurable:true,enumerable:true};Object.defineProperty(renderer,key,next);expected.set(key,Object.getOwnPropertyDescriptor(renderer,key));
  }
 }
 function flags(owned,enabled){
  Object.assign(owned,{exactGPUAlphaBounds:enabled,verifyExactGPUAlphaBounds:false,minGPUAlphaCells:12,gpuPoseBounds:false,verifyPoseBounds:false,directAlphaReadback:false,verifyAlphaReadback:false,cropNativeComposite:false,batchInkComposite:false});
  owned.gpuAlphaStats={frames:0,verified:0,mismatches:0,fallbacks:0,bytesRead:0};
 }
 function checkRig(){check();if(rig&&(rig.lost||rig.error||rig.renderer.getContext().isContextLost?.()))throw Error('gpu-alpha-preupload-native-context-or-model-error');}
 async function prepare(keys,enabled){
  check();if(!Array.isArray(keys)||!keys.length||keys.length>3)throw Error('gpu-alpha-preupload-bounded-roster-required');
  const started=performance.now(),pending=Promise.resolve(prepareNativeEnemyLaunch(keys,{signal:controller.signal,timeoutMs:15000}));
  pending.then(candidate=>{if(finished||controller.signal.aborted)disposeHandle(candidate);},()=>{});
  handle=await wait(pending);check();
  if(!objectLike(handle)||!objectLike(handle.rig)||handle.rig===originalRig||retired.has(handle.rig))throw Error('gpu-alpha-preupload-candidate-not-ready');
  const owned=handle.rig,nativeMs=performance.now()-started;flags(owned,enabled);
  const before=state(owned.renderer),programsBefore=programCount(owned);let alphaWarmupMs=0,alphaReady=false;
  if(enabled){
   owned.gpuAlphaBounds??=new GPUAlphaBounds();const warmStarted=performance.now();
   alphaReady=await wait(owned.gpuAlphaBounds.warmup(owned.renderer,1024,768,12,{signal:controller.signal,timeoutMs:15000,idleLeaseMs:15000}));alphaWarmupMs=performance.now()-warmStarted;check();
   if(!alphaReady)throw Error('gpu-alpha-preupload-alpha-warmup-failed');
  }
  const restored=sameState(before,state(owned.renderer));
  if(!restored||!handle.isReady())throw Error('gpu-alpha-preupload-prepared-candidate-stale');
  check();const adopted=handle.adopt();if(adopted!==owned)throw Error('gpu-alpha-preupload-adoption-failed');
  rig=owned;cleanup.ownedRigCount++;assign(owned);
  return{keys:[...keys],native:handle.report,commonOriginalTextureAndShaderPreparation:true,nativePreparationMs:nativeMs,alphaWarmupEnabled:enabled,alphaReady,alphaWarmupMs,totalPreparationMs:performance.now()-started,stateRestored:restored,programsBeforeAlphaWarmup:programsBefore,programsAfterAlphaWarmup:programCount(owned),alphaIdleLeaseMs:enabled?15000:0,extraAlphaRawBytes:owned.gpuAlphaBounds?.rawBytes||0};
 }
 active.add(renderer);
 try{
  signal?.addEventListener?.('abort',abort,{once:true});
  if(signal?.aborted)abort();check();
  // Separate correctness fixture: one fresh owned rig, initially prepared for
  // walker only, then the existing helper individually loads seven types. It
  // is not the bounded/common preupload combat cost fixture below.
  const qualityPreparation=await prepare(['enemy-walker'],false);
  const original56=await wait(compareNativeComposite(renderer,{mode:'gpuAlpha',beforePass:async({type,enabled,jobs})=>{
   check();await wait(imageQueue);check();if(!enabled)return;
   onProgress({phase:'quality',type});
   const width=Math.min(4,jobs.length)*256,height=Math.ceil(jobs.length/4)*256,savedState=state(rig.renderer),programsBefore=programCount(rig);
   rig.gpuAlphaBounds??=new GPUAlphaBounds();const readsBefore=rig.gpuAlphaBounds.reads,started=performance.now();
   const ready=await wait(rig.gpuAlphaBounds.warmup(rig.renderer,width,height,jobs.length,{signal:controller.signal,timeoutMs:15000,idleLeaseMs:15000}));check();
   const restored=sameState(savedState,state(rig.renderer));qualityWarmups.push({type,ready,warmupMs:performance.now()-started,stateRestored:restored,programsBefore,programsAfter:programCount(rig),readsDuringPreparation:rig.gpuAlphaBounds.reads-readsBefore,extraAlphaRawBytes:rig.gpuAlphaBounds.rawBytes});
   if(!ready||!restored)throw Error('gpu-alpha-preupload-quality-warmup-failed');
  },onImage:(type,src)=>queueImage({phase:'quality',type,src})}));
  await wait(imageQueue);check();releaseArm();check();
  for(const [count,weapon]of [[60,'shotgun'],[180,'nailgun']]){
   await wait(beforeScenario({count,weapon}));check();
   const extraPasses=[];let preparation,gpuBefore=0,readsBefore=0,preparedHelper,preparedRows;
   const result=await wait(compareBulletBroadphase(renderer,canvas,{count,weapon,frames:110,framePacing:'batch8',legacyBulletComparison:false,
    onPass:async(force,game)=>{
     await wait(imageQueue);check();releaseArm();check();
     preparation=await prepare(nativeLaunchKeys({game}),!force);check();
     preparedHelper=!force?rig.gpuAlphaBounds:null;preparedRows=preparedHelper?.rowMaterial;
     profile=createNativeFrameProfile(rig);
    },
    onProgress:force=>{check();onProgress({phase:'combat',count,weapon,gpuEnabled:!force});},
    onFrameStart:meta=>{
     checkRig();gpuBefore=rig.gpuAlphaStats.frames;readsBefore=rig.gpuAlphaBounds?.reads||0;
     profile.beginFrame({...meta,gpuEnabled:rig.exactGPUAlphaBounds,warmReadyBefore:!!rig.gpuAlphaBounds?.warmReady,warmLeaseBefore:rig.gpuAlphaBounds?.retainWarmupResources()||false,programsBefore:programCount(rig)});
    },
    onFrameEnd:meta=>{
     if(!profile||!rig)return null;
     checkRig();
     const reads=(rig.gpuAlphaBounds?.reads||0)-readsBefore;
     const frame=profile.endFrame({...meta,gpuCells:rig.gpuAlphaStats.frames-gpuBefore,gpuReads:reads,gpuReadBytes:reads*12*4,gpuFallbacks:rig.gpuAlphaStats.fallbacks,rigError:rig.error||'',rigLost:!!rig.lost,warmupSurvived:!!(preparedHelper&&rig.gpuAlphaBounds===preparedHelper&&rig.gpuAlphaBounds.rowMaterial===preparedRows&&rig.gpuAlphaBounds.warmReady),programsAfter:programCount(rig),extraAlphaRawBytes:rig.gpuAlphaBounds?.rawBytes||0,liveSelected:renderer.liveEnemySelection?.size||0});
     frame.gpuReadPixelsCalls=frame.stages['gpuAlpha.readPixels']?.calls||0;frame.gpuRequestedReadBytes=frame.gpuReadPixelsCalls*12*4;return frame;
    },
    // The combat helper does not await this callback. Keep collection strictly
    // synchronous; queue the caller's possibly async image work and await it
    // before another pass starts and before this service returns.
    onImage:(force,src)=>{
     check();const samples=profile.samples,first=samples.find(sample=>sample.gpuCells>0),steady=samples.filter(sample=>sample.frame>=10),gpuSteady=steady.filter(sample=>sample.gpuCells>0),stopped=profile.stop();profile=null;
     const nativeGlSubmitCalls=samples.reduce((sum,sample)=>sum+(sample.stages['native.glSubmit']?.calls||0),0),gpuUsedCells=samples.reduce((sum,sample)=>sum+sample.gpuCells,0),gpuReads=samples.reduce((sum,sample)=>sum+sample.gpuReads,0);
     if(samples.length!==110||!nativeGlSubmitCalls||!samples.some(sample=>sample.liveSelected>0)||!force&&(!gpuUsedCells||!gpuReads)||force&&(gpuUsedCells||gpuReads))throw Error('gpu-alpha-preupload-original-native-or-gpu-not-used');
     extraPasses.push({gpuEnabled:!force,preparation,firstFrame:samples[0]??null,firstGPUFrame:first??null,observedFrames:samples.length,nativeGlSubmitCalls,all110CallbackCost:summary(samples.map(sample=>sample.callbackCpuMs)),steadyCallbackCost:summary(steady.map(sample=>sample.callbackCpuMs)),gpuUsedCells,gpuReads,gpuReadBytes:samples.reduce((sum,sample)=>sum+sample.gpuReadBytes,0),gpuReadPixelsCalls:samples.reduce((sum,sample)=>sum+sample.gpuReadPixelsCalls,0),gpuRequestedReadBytes:samples.reduce((sum,sample)=>sum+sample.gpuRequestedReadBytes,0),gpuSteadyFrames:gpuSteady.length,steadyGPUStages:Object.fromEntries(['gpuAlpha.rowsSubmit','gpuAlpha.boundsSubmit','gpuAlpha.readPixels','gpuColour.surface'].map(label=>[label,stageSummary(gpuSteady,label)])),warmupProfiles:samples.filter(sample=>sample.warmup),unmeasuredHooks:stopped.unmeasured,gpuStats:{...rig.gpuAlphaStats}});
     queueImage({phase:'combat',count,weapon,gpuEnabled:!force,src});
    }
   }));
   await wait(imageQueue);check();
   if(extraPasses.length!==3)throw Error('gpu-alpha-preupload-three-arms-required');
   result.report.passes.forEach((pass,index)=>{Object.assign(pass,extraPasses[index]);pass.startupPlusPassWallMs=pass.preparation.totalPreparationMs+pass.wallSeconds*1000;pass.startupPlusAll110CallbackMs=pass.preparation.totalPreparationMs+pass.all110CallbackCost.sumMs;});
   reports.push(result.report);finalGame=result.game;releaseArm();check();
  }
  completed=true;return{game:finalGame,report:{cleanup,qualityPreparation,qualityWarmups,original56,reports,note:'QA-only fresh-owned CPU alpha / exact GPU min12 / CPU alpha A/B/A, each combat arm shares bounded original-model texture union upload and original-material shader API preparation before drawing. Only B additionally prepares the two alpha shaders with a15s idle lease; verify=false in combat. gpuStats.frames and gpuUsedCells count cells, not presented frames; min12 makes each successful alpha read48 bytes. Startup, first frame, all110 callbacks and100 steady callbacks are reported separately, including startup totals. Original7-type×8-pose correctness is a separate fresh fixture whose helper individually loads types after initial walker preparation; it retains verify=true/min1 original RGBA, geometry, animation and private-image checks. All combat uses original Game seed774, fixed1/60 ticks, normal offered upgrades,110 renders and existing state/RNG/event/pixel comparisons. Native12/256 and boss512 remain unchanged; pose bounds, crop, direct readback and batch ink stay OFF. Instrumented fixed-workload call wall times and shader API readiness are not GPU completion, presented FPS, total heap or actual app-loop performance. A genuine memory-store brand gates execution only: no storage API is called and actual app persistence is not tested. The original renderer rig is never disposed; all experimental rigs are retired and original owner descriptors restored unless externally replaced.'}};
 }catch(error){try{if(objectLike(error))Object.defineProperty(error,'cleanup',{value:cleanup,enumerable:true});}catch{}throw error;}
 finally{
  finished=true;try{signal?.removeEventListener?.('abort',abort);}catch{}
  try{controller.abort();}catch{}releaseArm();active.delete(renderer);
  cleanup.ownerDescriptorsRestored=fields.every(key=>sameDescriptor(Object.getOwnPropertyDescriptor(renderer,key),saved.get(key)));
  cleanup.complete=cleanup.errors.length===0&&cleanup.ownedRigCount===cleanup.retiredRigCount&&cleanup.retired.every(entry=>entry.modelsRemaining===0&&entry.helperRawBytesAfterRelease===0)&&cleanup.ownerDescriptorsRestored;
  if(completed&&!cleanup.complete){const error=Error('gpu-alpha-preupload-cleanup-failed');error.cleanup=cleanup;throw error;}
 }
}
