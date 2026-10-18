import {Game} from './engine.js?v=0.29.0';
import {ActorInterpolation} from './actor-interpolation.js';
import {advanceSimulation,FIXED_STEP} from './simulation.js?v=0.29.0';
import {createQAStorage} from './qa-storage.js';
import {loadProfile} from './storage.js?v=0.29.0';
import {seedAppLoopQA,allowAppLoopQA} from './qa-app-loop.js';
const percentile=(values,p)=>values.sort((a,b)=>a-b)[Math.floor(values.length*p)]??0;
const state=g=>JSON.stringify({snapshot:g.snapshot(),particles:g.particles,texts:g.texts,links:g.links,shake:g.shake,flash:g.flash,random:g.random.getState(),visualRandom:g.visualRandom.getState()});
export async function compareInterpolationPool(renderer,canvas,{location,query,beforeScenario=async()=>{},onProgress=()=>{},onImage=()=>{}}={}){
 const storage=createQAStorage(query);if(!allowAppLoopQA(location,query,storage))throw Error('interpolation-pool-memory-origin-required');
 const profile=loadProfile(storage),fixture=seedAppLoopQA(profile,storage,{location,query});if(!fixture)throw Error('interpolation-pool-fixture-invalid');
 const snapshot=profile.activeRun.game,passes=[],states=[],streams=[],pixels=[],preview=Game.restore(snapshot,{resumePlaying:true});await beforeScenario(preview);let finalGame;
 // Production NPCs load on demand. Await every normal fixture/spawn type so
 // the first reference pass cannot compare baked fallback with later live rigs.
 const rig=renderer.liveEnemies??await renderer.liveEnemiesPromise,nativeReadyKeys=rig?[...new Set([...snapshot.enemies.map(e=>'enemy-'+e.type),...(preview.mission?.enemyPool??[]).map(e=>'enemy-'+e.type)])]:[];
 if(rig&&!(await Promise.all(nativeReadyKeys.map(key=>rig.load(key)))).every(Boolean))throw Error('interpolation-pool-original-native-not-ready');
 for(const reuse of [false,true,false]){
  const game=Game.restore(snapshot,{resumePlaying:true});if(!game)throw Error('interpolation-pool-checkpoint-invalid');
  const interpolation=new ActorInterpolation();interpolation.reuseCapture=reuse;interpolation.captureStats={created:0,reused:0,captures:0};renderer.cameraReady=false;
  const samples=[],events=[],capture=interpolation.capture;let accumulator=0,captureMs=0;
  interpolation.capture=function(...args){const started=performance.now();try{return capture.apply(this,args);}finally{captureMs+=performance.now()-started;}};
  try{onProgress(reuse);for(let frame=0;frame<40;frame++){
   if(game.state==='upgrade')game.chooseUpgrade(game.choices[0].id);if(game.state!=='playing')throw Error('interpolation-pool-combat-ended-'+frame);
   const before={...interpolation.captureStats},start=performance.now();captureMs=0;accumulator+=.12;
   const advanced=advanceSimulation(game,{moveX:0,moveY:0,shoot:false,fireMode:'auto',aimX:game.player.x+300,aimY:game.player.y},accumulator,{interpolator:interpolation});accumulator=advanced.accumulator;const advanceMs=performance.now()-start;
   events.push(...game.drainEvents());const sampleStart=performance.now(),view=interpolation.sample(game,accumulator/FIXED_STEP,FIXED_STEP),sampleMs=performance.now()-sampleStart;
   const renderStart=performance.now();renderer.render(view,advanced.command,game.time);const renderMs=performance.now()-renderStart,combinedMs=performance.now()-start;
   if(frame>=10)samples.push({frame,captureMs,advanceMs,sampleMs,renderMs,combinedMs,nativeSelected:renderer.liveEnemySelection?.size||0,stats:Object.fromEntries(Object.keys(before).map(k=>[k,interpolation.captureStats[k]-before[k]]))});
   if(frame%8===0)await new Promise(requestAnimationFrame);
  }}finally{delete interpolation.capture;}
  const read=document.createElement('canvas');read.width=canvas.width;read.height=canvas.height;const c=read.getContext('2d',{willReadFrequently:true});c.drawImage(canvas,0,0);pixels.push(c.getImageData(0,0,read.width,read.height).data);onImage(reuse,canvas.toDataURL());
  const summary=Object.fromEntries(['captureMs','advanceMs','sampleMs','renderMs','combinedMs'].map(k=>[k,{median:percentile(samples.map(s=>s[k]),.5),p95:percentile(samples.map(s=>s[k]),.95),max:Math.max(...samples.map(s=>s[k]))}]));
  passes.push({reuse,samples,summary,stats:{...interpolation.captureStats},timedStats:Object.fromEntries(Object.keys(interpolation.captureStats).map(k=>[k,samples.reduce((n,s)=>n+s.stats[k],0)])),time:game.time,hp:game.player.hp,kills:game.kills,enemies:game.enemies.length,canvas:{width:canvas.width,height:canvas.height,dpr:renderer.dpr}});states.push(state(game));streams.push(JSON.stringify(events));finalGame=game;
 }
 const differences=pixels.slice(1).map((data,i)=>{let different=0,maxDelta=0;for(let n=0;n<data.length;n++){const d=Math.abs(data[n]-pixels[0][n]);if(d)different++;maxDelta=Math.max(maxDelta,d);}return {reuse:passes[i+1].reuse,different,maxDelta};});
 const candidateVsRepeatedLegacy={different:0,maxDelta:0};for(let n=0;n<pixels[1].length;n++){const d=Math.abs(pixels[1][n]-pixels[2][n]);if(d)candidateVsRepeatedLegacy.different++;candidateVsRepeatedLegacy.maxDelta=Math.max(candidateVsRepeatedLegacy.maxDelta,d);}
 return {game:finalGame,report:{fixture,nativeReadyKeys,passes,differences,candidateVsRepeatedLegacy,identicalCombatState:states.every(s=>s===states[0]),identicalEvents:streams.every(s=>s===streams[0]),note:'Normal60/180 fixture and Game/automatic target/HP/AI/spawning/offered upgrades. All fixture/normal spawn native types are ready before the first reference pass. Legacy fresh record capture → pooled capture → legacy, fixed.12s catch-up per render through actual advanceSimulation and ActorInterpolation.sample. 40renders/10warmup excluded/30timed; batch8 yields only. CPU call wall includes instrumentation, not presented FPS/full app loop/audio/HUD/save. Record creation/reuse counts are exact source allocations, not measured heap/RAM. Source models/rigs/resolution/interpolated positions/physics/save remain unchanged.'}};
}
