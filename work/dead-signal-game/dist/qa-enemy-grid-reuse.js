import {Game} from './engine.js?v=0.29.0';
import {ActorInterpolation} from './actor-interpolation.js';
import {advanceSimulation,FIXED_STEP} from './simulation.js?v=0.29.0';
import {createQAStorage} from './qa-storage.js';
import {loadProfile} from './storage.js?v=0.29.0';
import {seedAppLoopQA,allowAppLoopQA} from './qa-app-loop.js';
import {enemyGridAllocationStats} from './enemy-separation-grid.js';
import {prepareNativeEnemyLaunch} from './boss-rig/native-launch-preparation.js';
import {createFrameCostProfile} from './qa-frame-cost-profile.js';
import {createNativeFrameProfile} from './qa-native-frame-profile.js';

const percentile=(values,p)=>values.sort((a,b)=>a-b)[Math.floor(values.length*p)]??0;
const state=game=>JSON.stringify({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash,random:game.random.getState(),visualRandom:game.visualRandom.getState()});
const motion=game=>JSON.stringify(game.enemies.map(e=>[e.id,e.x,e.y,e.vx,e.vy,e.angle,e.walkPhase,e.navX,e.navY,e.navTime,e.navTarget===game.player?'player':e.navTarget===game.lure?'lure':null,e.navTargetX,e.navTargetY]));
const difference=(a,b)=>{let different=0,maxDelta=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)different++;maxDelta=Math.max(maxDelta,d);}return{different,maxDelta};};
function disposeRig(rig,errors){if(!rig)return;for(const [name,operation]of [['release',()=>rig.releaseUnused([])],['dispose',()=>rig.renderer.dispose()],['context-loss',()=>rig.renderer.forceContextLoss()]])try{operation();}catch(error){errors.push({stage:name,error:error.message});}}
function minimalNativeCounter(rig){
 const renderer=rig.renderer,descriptor=Object.getOwnPropertyDescriptor(renderer,'render'),original=renderer.render;let calls=0,stopped=false;
 const wrapped=function(...args){calls++;return original.apply(this,args);};Object.defineProperty(renderer,'render',descriptor?{...descriptor,value:wrapped}:{configurable:true,writable:true,value:wrapped});
 return{beginFrame(){},endFrame(){},stop(){if(!stopped){stopped=true;if(renderer.render===wrapped){if(descriptor)Object.defineProperty(renderer,'render',descriptor);else delete renderer.render;}}return{minimal:true,calls,samples:[],note:'Counts actual original native renderer.render calls only; no native/Canvas timing wrappers or extra draws/reads are installed.'};}};
}

export async function compareEnemyGridReuse(renderer,canvas,{location,query,observeCosts=true,forceAllFresh=false,nativePreparation=false,metadataParse=false,beforeScenario=async()=>{},beforeArm=async()=>null,onProgress=()=>{},onImage=()=>{}}={}){
 const storage=createQAStorage(query);if(!allowAppLoopQA(location,query,storage))throw Error('enemy-grid-memory-origin-required');
 const profile=loadProfile(storage),fixture=seedAppLoopQA(profile,storage,{location,query});if(!fixture)throw Error('enemy-grid-fixture-invalid');
 const snapshot=profile.activeRun.game,preview=Game.restore(snapshot,{resumePlaying:true});if(!preview)throw Error('enemy-grid-preview-invalid');
 await beforeScenario(preview);
 const nativeKeys=[...new Set([...snapshot.enemies.map(e=>'enemy-'+e.type),...(preview.mission?.enemyPool??[]).filter(e=>e.weight>0).map(e=>'enemy-'+e.type)])];
 if(nativeKeys.length>3)throw Error('enemy-grid-bounded-original-roster-required');
 const priorRig=renderer.liveEnemies,priorPreparation=Object.getOwnPropertyDescriptor(renderer,'forceLegacyEnemyPreparation'),passes=[],states=[],streams=[],motions=[],pixels=[],cleanupErrors=[];
 let owned=null,observer=null,nativeObserver=null,handle=null,armPreparation=null,finalGame;
 function releaseArm(){try{armPreparation?.dispose?.();}catch(error){cleanupErrors.push({stage:'arm-preparation',error:error.message});}armPreparation=null;}
 try{
  for(const candidateArm of [false,true,false]){
   const reuse=forceAllFresh?false:candidateArm;
   onProgress({phase:'preparation',reuse});
   const game=Game.restore(snapshot,{resumePlaying:true});if(!game)throw Error('enemy-grid-checkpoint-invalid');game.forceFreshEnemyGrid=nativePreparation||metadataParse?false:!reuse;
   if(nativePreparation)renderer.forceLegacyEnemyPreparation=!reuse;
   const beforeArmState=state(game);armPreparation=await beforeArm({game,reuse});if(state(game)!==beforeArmState)throw Error('enemy-grid-arm-preparation-game-mutation');
   const preparationStart=performance.now();handle=await prepareNativeEnemyLaunch(nativeKeys);if(!handle?.isReady())throw Error('enemy-grid-original-preparation-failed');
   const preparation=handle.report;owned=handle.adopt();handle.dispose();handle=null;if(!owned)throw Error('enemy-grid-original-adoption-failed');renderer.liveEnemies=owned;
   const preparationMs=performance.now()-preparationStart,interpolation=new ActorInterpolation(),samples=[],allSamples=[],events=[],motionFrames=[],beforePrime=state(game);
   renderer.cameraReady=false;renderer.lastNow=null;renderer.render(game,{},game.time);
   if(state(game)!==beforePrime)throw Error('enemy-grid-prime-game-mutation');
   observer=createFrameCostProfile({renderer,read:()=>({game}),enabled:observeCosts});nativeObserver=observeCosts?createNativeFrameProfile(owned):minimalNativeCounter(owned);let accumulator=0;
   onProgress({phase:'combat',reuse});
   for(let frame=0;frame<40;frame++){
    if(game.state==='upgrade')game.chooseUpgrade(game.choices[0].id);if(game.state!=='playing')throw Error('enemy-grid-normal-combat-ended-'+frame);
    const allocationsBefore=enemyGridAllocationStats(game),start=performance.now(),metaBefore={frame,reuse,warmup:frame<10};observer.beginFrame(metaBefore);nativeObserver.beginFrame(metaBefore);let advanceMs,sampleMs,renderMs,combinedMs;
    try{
     accumulator+=.12;const advanced=advanceSimulation(game,{moveX:0,moveY:0,shoot:false,fireMode:'auto',aimX:game.player.x+300,aimY:game.player.y},accumulator,{interpolator:interpolation});accumulator=advanced.accumulator;advanceMs=performance.now()-start;
     events.push(...game.drainEvents());const sampleStart=performance.now(),view=interpolation.sample(game,accumulator/FIXED_STEP,FIXED_STEP);sampleMs=performance.now()-sampleStart;
     const renderStart=performance.now();renderer.render(view,advanced.command,game.time);renderMs=performance.now()-renderStart;combinedMs=performance.now()-start;
    }finally{try{nativeObserver.endFrame();}finally{observer.endFrame();}}
    const allocationsAfter=enemyGridAllocationStats(game);
    if(allocationsAfter.retainedActors!==0)throw Error('enemy-grid-actor-reference-retained');
    const meta={frame,advanceMs,sampleMs,renderMs,combinedMs,nativeSelected:renderer.liveEnemySelection?.size||0,rigError:owned.error||'',allocations:Object.fromEntries(Object.keys(allocationsBefore).filter(k=>!k.startsWith('retained')).map(k=>[k,allocationsAfter[k]-allocationsBefore[k]])),retainedActors:allocationsAfter.retainedActors,retainedBuckets:allocationsAfter.retainedBuckets};
    if(meta.rigError)throw Error(meta.rigError);allSamples.push(meta);if(frame>=10)samples.push(meta);motionFrames.push(motion(game));
    if(frame%8===0)await new Promise(requestAnimationFrame);
   }
   const costs=observer.stop();observer=null;const native=nativeObserver.stop();nativeObserver=null;if(!(observeCosts?native.samples.some(s=>s.stages?.['native.glSubmit']?.calls>0):native.calls>0)||!samples.some(s=>s.nativeSelected>0))throw Error('enemy-grid-actual-native-render-required');
   const read=document.createElement('canvas');read.width=canvas.width;read.height=canvas.height;const context=read.getContext('2d',{willReadFrequently:true});context.drawImage(canvas,0,0);pixels.push(context.getImageData(0,0,read.width,read.height).data);onImage(reuse,canvas.toDataURL());
   const summary=Object.fromEntries(['advanceMs','sampleMs','renderMs','combinedMs'].map(key=>[key,{median:percentile(samples.map(s=>s[key]),.5),p95:percentile(samples.map(s=>s[key]),.95),max:Math.max(...samples.map(s=>s[key]))}]));
   const allSummary=Object.fromEntries(['advanceMs','sampleMs','renderMs','combinedMs'].map(key=>[key,{median:percentile(allSamples.map(s=>s[key]),.5),p95:percentile(allSamples.map(s=>s[key]),.95),max:Math.max(...allSamples.map(s=>s[key]))}]));
   passes.push({reuse,candidateArm,armPreparation:armPreparation?.report??null,preparation,preparationMs,samples,allSamples,costs,native,summary,allSummary,allocations:enemyGridAllocationStats(game),timedAllocations:Object.fromEntries(Object.keys(samples[0].allocations).map(key=>[key,samples.reduce((sum,s)=>sum+s.allocations[key],0)])),hp:game.player.hp,time:game.time,kills:game.kills,enemies:game.enemies.length,canvas:{width:canvas.width,height:canvas.height,dpr:renderer.dpr}});
   states.push(state(game));streams.push(JSON.stringify(events));motions.push(JSON.stringify(motionFrames));finalGame=game;disposeRig(owned,cleanupErrors);owned=null;renderer.liveEnemies=priorRig;releaseArm();
  }
  const differences=pixels.slice(1).map((data,index)=>({reuse:passes[index+1].reuse,...difference(pixels[0],data)}));
  finalGame.forceFreshEnemyGrid=false;
  return {game:finalGame,report:{fixture,experiment:metadataParse?'owned-metadata-json':nativePreparation?'native-preparation':'enemy-grid',observeCosts,forceAllFresh,nativeKeys,passes,differences,candidateVsRepeatedLegacy:difference(pixels[1],pixels[2]),cleanupErrors,identicalCombatState:states.every(s=>s===states[0]),identicalEvents:streams.every(s=>s===streams[0]),identicalActorMotion:motions.every(s=>s===motions[0]),note:(metadataParse?'Owned metadata JSON experiment: beforeArm owns the independent original asset loader per arm. All three physics grids and renderer preparation use production defaults. ':'')+(nativePreparation?'Native preparation experiment: original eager pose/distance and no-hit callback → skip only unused work → original eager. All three Games use the default pooled separation grid. forceAllFresh means all-original preparation control in this experiment. ':'')+'8851 genuine-memory QA only. Default grid experiment: original inline fresh separation Map/buckets with source counters → pooled → original fresh; forceAllFresh is a separate all-original control. observeCosts=false removes detailed/Canvas timing observers and retains only an actual native renderer.render call counter. allSummary includes all40 frames, including warmup outliers. Same normal60/180 checkpoint, AI/HP/automatic fire/spawning/offered upgrades, fixed .12s catch-up through actual advanceSimulation and pooled interpolation, 40renders/batch8/10warm excluded. Every arm owns a new original256 NPC rig with the same bounded three-model texture/shader preparation, excluded from combat timing, and primes the actual renderer without ticks before measurement. Main player/world caches can still vary. Allocation counters count the helper source objects, not heap/GC/RAM/VRAM bytes or all JavaScript allocations. No presented FPS, GPU execution or full product HUD/audio/save claim. Stage wrappers add overhead and nested call-wall times overlap. Original rig/resolution/materials/clips/positions/private outputs remain in use.'}};
 }finally{for(const [stage,stop]of [['cost',()=>observer?.stop()],['native',()=>nativeObserver?.stop()],['handle',()=>handle?.dispose()]])try{stop();}catch(error){cleanupErrors.push({stage,error:error.message});}renderer.liveEnemies=priorRig;disposeRig(owned,cleanupErrors);releaseArm();if(nativePreparation){if(priorPreparation)Object.defineProperty(renderer,'forceLegacyEnemyPreparation',priorPreparation);else delete renderer.forceLegacyEnemyPreparation;}}
}
