import {compareBulletBroadphase} from './qa-bullet-broadphase.js';
import {createNativeFrameProfile} from './qa-native-frame-profile.js';

const percentile=(values,p)=>values.sort((a,b)=>a-b)[Math.floor(values.length*p)]??0;
function summarizeProfiles(samples){
 const steady=samples.filter(s=>!s.warmup),labels=[...new Set(steady.flatMap(s=>Object.keys(s.stages||{})))];
 return labels.map(label=>{const costs=steady.map(s=>s.stages[label]?.cpuMs||0);return {label,medianCpuMs:percentile([...costs],.5),p95CpuMs:percentile([...costs],.95),maxCpuMs:Math.max(0,...costs),meanCalls:steady.reduce((n,s)=>n+(s.stages[label]?.calls||0),0)/(steady.length||1)};}).sort((a,b)=>b.p95CpuMs-a.p95CpuMs);
}

// Local QA only. The product loop and all original character assets stay intact.
export async function comparePacedNativeCombat(renderer,canvas,{beforeScenario=async()=>{},onProgress=()=>{},onImage=()=>{},frames=110}={}){
 const rig=renderer.liveEnemies;if(!rig)throw Error('native-profile-rig-not-ready');
 const flags=['exactGPUAlphaBounds','verifyExactGPUAlphaBounds','minGPUAlphaCells','gpuPoseBounds','verifyPoseBounds','directAlphaReadback','verifyAlphaReadback','cropNativeComposite','batchInkComposite'];
 const prior=Object.fromEntries(flags.map(k=>[k,rig[k]])),reports=[];let profile=null,finalGame;
 try{
  Object.assign(rig,{exactGPUAlphaBounds:false,verifyExactGPUAlphaBounds:false,minGPUAlphaCells:12,gpuPoseBounds:false,verifyPoseBounds:false,directAlphaReadback:false,verifyAlphaReadback:false,cropNativeComposite:false,batchInkComposite:false});
  rig.releaseUnused(['enemy-walker']);if(!await rig.load('enemy-walker'))throw Error('native-profile-walker-not-ready');
  for(const framePacing of ['batch8','raf'])for(const [count,weapon]of [[60,'shotgun'],[180,'nailgun']]){
   await beforeScenario({framePacing,count,weapon});const profilePasses=[];let gpuFramesBefore=0;
   const result=await compareBulletBroadphase(renderer,canvas,{count,weapon,frames,framePacing,legacyBulletComparison:false,
    onPass:force=>{profile?.stop();rig.exactGPUAlphaBounds=!force;rig.verifyExactGPUAlphaBounds=false;rig.gpuAlphaStats={frames:0,verified:0,mismatches:0,fallbacks:0,bytesRead:0};profile=createNativeFrameProfile(rig);},
    onProgress:force=>onProgress({framePacing,count,weapon,gpuEnabled:!force}),
    onFrameStart:(meta,current)=>{gpuFramesBefore=rig.gpuAlphaStats.frames;profile.beginFrame({...meta,enemies:current.enemies.length,alphaResourceBytesBefore:rig.gpuAlphaBounds?.rawBytes||0,gpuCopyBytesBefore:rig.gpuRaw?rig.gpuRaw.width*rig.gpuRaw.height*4:0});},
    onFrameEnd:meta=>profile.endFrame({...meta,liveSelected:renderer.liveEnemySelection?.size||0,freshCorpsesSelected:renderer.liveCorpseSelection?.size||0,liveRendered:renderer.enemyLiveFrames||0,gpuCells:rig.gpuAlphaStats.frames-gpuFramesBefore,lastRigBatchReadbacks:rig.lastBatchReadbacks,atlasWidth:rig.renderer.domElement.width,atlasHeight:rig.renderer.domElement.height,alphaResourceBytes:rig.gpuAlphaBounds?.rawBytes||0,gpuCopyBytes:rig.gpuRaw?rig.gpuRaw.width*rig.gpuRaw.height*4:0}),
    onImage:(force,src)=>{const samples=profile.samples,stopped=profile.stop();profile=null;profilePasses.push({force,stages:summarizeProfiles(samples),warmupProfiles:samples.filter(s=>s.warmup),unmeasuredHooks:stopped.unmeasured,gpuStats:{...rig.gpuAlphaStats},extraAlphaRawBytes:rig.gpuAlphaBounds?.rawBytes||0,gpuCopyRawBytes:rig.gpuRaw?rig.gpuRaw.width*rig.gpuRaw.height*4:0});onImage({framePacing,count,weapon,gpuEnabled:!force,src});}
   });
   finalGame=result.game;result.report.passes.forEach((pass,i)=>Object.assign(pass,profilePasses[i]));reports.push(result.report);
  }
  const interactiveCadenceObserved=reports.filter(r=>r.framePacing==='raf').every(r=>r.passes.every(p=>p.summary.rafIntervalMs.median<=50));
  return {game:finalGame,report:{framesPerPass:frames,warmupFrames:10,minGPUAlphaCells:12,interactiveCadenceObserved,cadenceNote:interactiveCadenceObserved?'rAF callback median<=50ms; this still does not establish presented FPS.':'rAF callback median>50ms in at least one pass; scheduling is unsuitable for general interactive-play FPS claims. Preserve all timing samples.',profiling:'QA-only inclusive CPU call wall times; nested stages overlap and must not be summed. No extra GPU synchronization or timer queries. Wrappers are removed after each pass.',environment:{physicalCanvas:{width:canvas.width,height:canvas.height},rendererDpr:renderer.dpr,devicePixelRatio:window.devicePixelRatio,visibility:document.visibilityState},reports}};
 }finally{profile?.stop();Object.assign(rig,prior);if(!prior.exactGPUAlphaBounds)rig.releaseExactGPUAlpha();}
}
