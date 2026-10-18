import * as THREE from './player-rig/vendor/three.module.js';
import {GPUAlphaBounds} from './boss-rig/gpu-alpha-bounds.js';
import {compareNativeComposite} from './qa-native-composite.js';
import {compareBulletBroadphase} from './qa-bullet-broadphase.js';
import {createNativeFrameProfile} from './qa-native-frame-profile.js';

const state=renderer=>({target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),level:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()).toArray(),scissor:renderer.getScissor(new THREE.Vector4()).toArray(),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear});
const sameState=(a,b)=>a.target===b.target&&a.face===b.face&&a.level===b.level&&a.scissorTest===b.scissorTest&&a.autoClear===b.autoClear&&JSON.stringify([a.viewport,a.scissor])===JSON.stringify([b.viewport,b.scissor]);
const differences=(a,b)=>{let different=0,maxDelta=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)different++;maxDelta=Math.max(maxDelta,d);}return {different,maxDelta};};
const percentile=(values,p)=>values.sort((a,b)=>a-b)[Math.floor(values.length*p)]??0;
function stageSummary(samples,label){const values=samples.map(s=>s.stages[label]?.cpuMs||0);return {medianCpuMs:percentile([...values],.5),p95CpuMs:percentile([...values],.95),maxCpuMs:Math.max(0,...values)};}

export async function compareGPUAlphaWarmup(renderer,canvas,{beforeScenario=async()=>{},onProgress=()=>{},onImage=()=>{}}={}){
 const rig=renderer.liveEnemies;if(!rig)throw Error('warmup-native-rig-not-ready');
 const flags=['exactGPUAlphaBounds','verifyExactGPUAlphaBounds','minGPUAlphaCells','gpuPoseBounds','directAlphaReadback','cropNativeComposite','batchInkComposite'],prior=Object.fromEntries(flags.map(k=>[k,rig[k]])),qualityWarmups=[],reports=[];
 let profile=null,finalGame;
 try{
  const original=await compareNativeComposite(renderer,{mode:'gpuAlpha',beforePass:async({type,enabled,jobs})=>{
   if(!enabled)return;onProgress({phase:'quality',type});
   const width=Math.min(4,jobs.length)*256,height=Math.ceil(jobs.length/4)*256,glRenderer=rig.renderer,before=rig.readSurface(width,height).pixels.slice(),saved=state(glRenderer),programsBefore=glRenderer.info.programs.length;
   rig.gpuAlphaBounds??=new GPUAlphaBounds();const readsBefore=rig.gpuAlphaBounds.reads,started=performance.now(),ready=await rig.gpuAlphaBounds.warmup(glRenderer,width,height,jobs.length),warmupMs=performance.now()-started;
   const restored=sameState(saved,state(glRenderer)),after=rig.readSurface(width,height).pixels;
   qualityWarmups.push({type,ready,warmupMs,stateRestored:restored,programsBefore,programsAfter:glRenderer.info.programs.length,readsDuringPreparation:rig.gpuAlphaBounds.reads-readsBefore,bytesRead:rig.gpuAlphaBounds.bytesRead,extraAlphaRawBytes:rig.gpuAlphaBounds.rawBytes,...differences(before,after)});
   if(!ready||!restored)throw Error('warmup-quality-preparation-failed');
  },onImage:(type,src)=>onImage({phase:'quality',type,src})});
  Object.assign(rig,{exactGPUAlphaBounds:true,verifyExactGPUAlphaBounds:false,minGPUAlphaCells:12,gpuPoseBounds:false,directAlphaReadback:false,cropNativeComposite:false,batchInkComposite:false});
  rig.releaseUnused(['enemy-walker']);if(!await rig.load('enemy-walker'))throw Error('warmup-walker-not-ready');
  for(const [count,weapon]of [[60,'shotgun'],[180,'nailgun']]){
   await beforeScenario({count,weapon});const extraPasses=[];let preparation,preparedHelper,preparedRows,gpuBefore=0;
   const result=await compareBulletBroadphase(renderer,canvas,{count,weapon,legacyBulletComparison:false,
    onPass:async force=>{
     profile?.stop();rig.exactGPUAlphaBounds=true;rig.verifyExactGPUAlphaBounds=false;rig.releaseExactGPUAlpha();rig.gpuAlphaStats={frames:0,verified:0,mismatches:0,fallbacks:0,bytesRead:0};rig.gpuAlphaBounds??=new GPUAlphaBounds();preparedHelper=null;preparedRows=null;
     const saved=state(rig.renderer),programsBefore=rig.renderer.info.programs.length,started=performance.now();
     const ready=!force?await rig.gpuAlphaBounds.warmup(rig.renderer,1024,768,12,{idleLeaseMs:15000}):false;
     preparation={enabled:!force,ready,warmupMs:performance.now()-started,stateRestored:sameState(saved,state(rig.renderer)),programsBefore,programsAfter:rig.renderer.info.programs.length,extraAlphaRawBytes:rig.gpuAlphaBounds.rawBytes,idleLeaseMs:!force?15000:0};
     if(!force&&!ready)throw Error('warmup-combat-preparation-failed');
     if(!force){preparedHelper=rig.gpuAlphaBounds;preparedRows=preparedHelper.rowMaterial;}
     profile=createNativeFrameProfile(rig);
    },
    onProgress:force=>onProgress({phase:'combat',count,weapon,warmed:!force}),
    onFrameStart:meta=>{gpuBefore=rig.gpuAlphaStats.frames;profile.beginFrame({...meta,warmReadyBefore:!!rig.gpuAlphaBounds?.warmReady,warmLeaseBefore:rig.gpuAlphaBounds?.retainWarmupResources()||false,programsBefore:rig.renderer.info.programs.length});},
    onFrameEnd:meta=>profile.endFrame({...meta,gpuCells:rig.gpuAlphaStats.frames-gpuBefore,warmupSurvived:!!(preparedHelper&&rig.gpuAlphaBounds===preparedHelper&&rig.gpuAlphaBounds.rowMaterial===preparedRows&&rig.gpuAlphaBounds.warmReady),programsAfter:rig.renderer.info.programs.length,extraAlphaRawBytes:rig.gpuAlphaBounds?.rawBytes||0,liveSelected:renderer.liveEnemySelection?.size||0}),
    onImage:(force,src)=>{
     const samples=profile.samples,first=samples.find(s=>s.gpuCells>0),steady=samples.filter(s=>s.gpuCells>0&&s.frame!==first?.frame),stopped=profile.stop();profile=null;
     extraPasses.push({preparation,firstGPUFrame:first,steadyGPUFrames:steady.length,steadyGPUStages:Object.fromEntries(['gpuAlpha.rowsSubmit','gpuAlpha.boundsSubmit','gpuAlpha.readPixels','gpuColour.surface'].map(label=>[label,stageSummary(steady,label)])),warmupProfiles:samples.filter(s=>s.warmup),unmeasuredHooks:stopped.unmeasured,gpuStats:{...rig.gpuAlphaStats}});
     onImage({phase:'combat',count,weapon,warmed:!force,src});
    }
   });
   finalGame=result.game;result.report.passes.forEach((p,i)=>Object.assign(p,extraPasses[i]));reports.push(result.report);
  }
  return {game:finalGame,report:{qualityWarmups,original,reports,note:'Compile-only API preparation before combat versus unprepared GPU candidate, repeated A/B/A. Both combat arms keep exact GPU-alpha min12 and normal game rules. An explicit bounded15s idle lease retains prepared resources only until their first successful read or expiry; lease survival is recorded. Preparation wall time is reported separately, not removed from total work. Original56 poses verify pixels/bounds/metadata; API-ready alone is not shader success. Instrumented fixed1/60-per-render batch8 call wall times, not presented FPS/GPU execution or full product-loop timing. GPU candidate remains OFF by default.'}};
 }finally{profile?.stop();Object.assign(rig,prior);if(!prior.exactGPUAlphaBounds)rig.releaseExactGPUAlpha();}
}
