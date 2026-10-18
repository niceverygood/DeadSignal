import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBulletBroadphase} from '../dist/qa-bullet-broadphase.js';

// This lightweight surface exercises real Game.tick/checkpoint/RNG/events and
// the QA scheduler contract. It never executes browser painting or GPU work.
async function environment(run){
 const descriptors=new Map(['document','requestAnimationFrame','performance'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const calls=[],document={hidden:false,createElement(tag){assert.equal(tag,'canvas');return canvasMock();}};
 let clock=0,rafClock=1000,rafCount=0;
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});
 Object.defineProperty(globalThis,'performance',{configurable:true,writable:true,value:{now(){return clock+=.125;}}});
 Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,writable:true,value:callback=>{rafCount++;calls.push({kind:'raf',number:rafCount});queueMicrotask(()=>{rafClock+=1000/60;callback(rafClock);});return rafCount;}});
 const canvas=canvasMock(),games=[],images=[],draws=[],passEvents=[];
 const renderer={dpr:1.5,cameraReady:true,lastNow:12345,render(game,command,now){
  draws.push({game,command,now,lastNow:this.lastNow,cameraReady:this.cameraReady});calls.push({kind:'draw',game});
  this.cameraReady=true;this.lastNow=now;canvas.pixels.set([game.player.ammo,Math.ceil(game.player.hp),game.kills,255]);
 }};
 const onPass=(force,game)=>{
  games.push(game);const events=[];passEvents.push(events);const drain=game.drainEvents;
  game.drainEvents=function(){const result=drain.call(this);events.push(...structuredClone(result));return result;};
 };
 try{return await run({document,canvas,renderer,calls,games,images,draws,passEvents,onPass,get rafCount(){return rafCount;}});}
 finally{for(const [key,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}
function canvasMock(){
 const canvas={width:20,height:12,pixels:new Uint8ClampedArray(4),toDataURL(){return 'data:image/mock;base64,'+Buffer.from(this.pixels).toString('base64');}};
 const context={clearRect(){canvas.pixels.fill(0);},drawImage(source){canvas.pixels.set(source.pixels);},getImageData(){return {data:new Uint8ClampedArray(canvas.pixels)};}};
 canvas.getContext=kind=>{assert.equal(kind,'2d');return context;};return canvas;
}
const finalState=game=>({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash,random:game.random.getState(),visualRandom:game.visualRandom.getState()});
const cleaned=games=>{for(const game of games)assert.equal(Object.hasOwn(game,'updateBullets'),false,'temporary profiler must not shadow the original bullet method');};

test('rAF pacing awaits every real tick and preserves before/after metadata and profiles without changing simulation time',async()=>{
 await environment(async env=>{
  const starts=[],ends=[];
  const {report,game}=await compareBulletBroadphase(env.renderer,env.canvas,{count:60,frames:12,framePacing:'raf',legacyBulletComparison:false,onPass:env.onPass,
   onImage:(force,src)=>env.images.push({force,src}),
   onFrameStart(meta,current){starts.push({...meta,game:current});assert.equal(env.calls.at(-1).kind,'raf','each frame starts after its own rAF');env.calls.push({kind:'start'});},
   onFrameEnd(meta,current){ends.push({...meta,game:current});assert.equal(env.calls.at(-1).kind,'draw');return {calls:1,tag:meta.frame};},
  });
  assert.equal(env.rafCount,36);assert.equal(env.draws.length,36);assert.equal(starts.length,36);assert.equal(ends.length,36);assert.equal(env.images.length,3);
  assert.equal(report.framePacing,'raf');assert.equal(report.identicalCombatState,true);assert.equal(report.identicalEvents,true);
  assert.deepEqual(report.pixels,[{force:false,different:0,maxDelta:0},{force:true,different:0,maxDelta:0}]);
  for(let pass=0;pass<3;pass++){
   const result=report.passes[pass];assert.equal(result.renderedFrames,12);assert.equal(result.fixedTicks,12);assert.equal(result.frames,2);assert.ok(Math.abs(result.simulationSeconds-.2)<1e-12);assert.equal(result.cameraLastNowReset,true);assert.equal(result.renderTimeSource,'game.time');assert.deepEqual(result.canvas,{width:20,height:12,dpr:1.5});
   assert.ok(result.wallSeconds>0);assert.ok(result.summary.eventMs.median>0);assert.ok(Math.abs(result.summary.rafIntervalMs.median-1000/60)<1e-10);
   for(let frame=0;frame<12;frame++){
    const start=starts[pass*12+frame],end=ends[pass*12+frame];assert.equal(start.frame,frame);assert.equal(start.game,env.games[pass]);assert.equal(end.game,start.game);assert.equal(start.force,[true,false,true][pass]);assert.equal(start.warmup,frame<10);assert.equal(start.framePacing,'raf');assert.equal(start.hidden,false);assert.ok(Number.isFinite(start.rafTimestamp));assert.ok(start.rafWaitMs>0);assert.ok(end.callbackCpuMs>0);
    assert.equal(start.rafIntervalMs===null,frame===0);assert.equal(start.frameStartIntervalMs===null,frame===0);
    if(frame>0){assert.ok(Math.abs(start.rafIntervalMs-1000/60)<1e-10);assert.ok(start.frameStartIntervalMs>0);}
   }
   assert.deepEqual(result.samples.map(sample=>sample.nativeProfile),[{calls:1,tag:10},{calls:1,tag:11}]);
   const firstDraw=env.draws[pass*12];assert.equal(firstDraw.lastNow,null);assert.equal(firstDraw.cameraReady,false);
   for(let frame=0;frame<12;frame++)assert.ok(Math.abs(env.draws[pass*12+frame].now-(frame+1)/60)<1e-12,'render time advances by the deterministic simulation step');
  }
  assert.equal(game.forceBulletNarrowPhase,false);assert.equal(game.bulletBoundsMode,'rect');assert.equal(game.bulletCollisionStats,null);cleaned(env.games);
 });
});

test('60 and 180 normal enemies retain identical checkpoints, both RNG streams and event order across rAF and historical batch8 pacing',async()=>{
 for(const count of [60,180]){
  const variants=[];
  for(const framePacing of [undefined,'raf'])await environment(async env=>{
   const starts=[];const options={count,weapon:count===180?'nailgun':'shotgun',frames:32,legacyBulletComparison:false,onPass:env.onPass,onFrameStart:meta=>starts.push(meta)};
   if(framePacing!==undefined)options.framePacing=framePacing;
   const result=await compareBulletBroadphase(env.renderer,env.canvas,options),{report}=result;
   assert.equal(report.framePacing,framePacing??'batch8');assert.equal(report.identicalCombatState,true);assert.equal(report.identicalEvents,true);assert.equal(env.rafCount,framePacing==='raf'?96:12);assert.equal(env.draws.length,96);assert.equal(starts.length,96);cleaned(env.games);
   assert.deepEqual(env.passEvents[1],env.passEvents[0]);assert.deepEqual(env.passEvents[2],env.passEvents[0]);assert.ok(env.passEvents[0].length>0,'ordinary shooting produces real events');
   for(const pass of report.passes){assert.equal(pass.initialEnemies,count);assert.equal(pass.fixedTicks,32);assert.equal(pass.frames,22);assert.ok(Math.abs(pass.simulationSeconds-32/60)<1e-12);assert.equal(pass.cameraLastNowReset,framePacing==='raf');}
   if(framePacing===undefined){assert.equal(env.draws[0].lastNow,12345);assert.equal(env.draws[32].lastNow,env.games[0].time);for(const meta of starts){assert.equal(meta.rafTimestamp,null);assert.equal(meta.rafIntervalMs,null);assert.equal(meta.rafWaitMs,null);}}
   variants.push({state:finalState(result.game),events:env.passEvents});
  });
  assert.deepEqual(variants[1],variants[0],'pacing alone cannot advance HP, combat, RNG, particles, checkpoint or event order for '+count+' actors');
 }
});

test('invalid pacing rejects before spawning, callbacks or DOM allocation',async()=>{
 await environment(async env=>{
  let entered=0;env.document.createElement=()=>{entered++;throw Error('invalid pacing must not allocate');};
  await assert.rejects(compareBulletBroadphase(env.renderer,env.canvas,{framePacing:'interval',onPass(){entered++;},onFrameStart(){entered++;}}),/dense-frame-pacing-invalid/);
  assert.equal(entered,0);assert.equal(env.rafCount,0);assert.equal(env.draws.length,0);
 });
});

test('hidden rAF fixture rejects without advancing combat and restores its temporary bullet wrapper',async()=>{
 await environment(async env=>{
  env.document.hidden=true;let starts=0,ends=0;
  await assert.rejects(compareBulletBroadphase(env.renderer,env.canvas,{count:60,frames:12,framePacing:'raf',onPass:env.onPass,onFrameStart(){starts++;},onFrameEnd(){ends++;}}),/dense-raf-tab-hidden/);
  assert.equal(starts,0);assert.equal(ends,0);assert.equal(env.rafCount,0);assert.equal(env.draws.length,0);assert.equal(env.games.length,1);assert.equal(env.games[0].time,0);cleaned(env.games);
 });
 await environment(async env=>{
  let starts=0,ends=0;
  await assert.rejects(compareBulletBroadphase(env.renderer,env.canvas,{count:60,frames:12,framePacing:'raf',onPass:env.onPass,onFrameStart(){starts++;},onFrameEnd(){ends++;env.document.hidden=true;}}),/dense-raf-tab-hidden/);
  assert.equal(starts,1);assert.equal(ends,1);assert.equal(env.rafCount,1);assert.equal(env.draws.length,1);assert.equal(env.games[0].time,1/60);cleaned(env.games);
 });
});

test('tick/render/end failures run frame cleanup once and restore the original bullet method',async()=>{
 for(const stage of ['tick','render','end'])await environment(async env=>{
  let starts=0,ends=0;
  if(stage==='render')env.renderer.render=()=>{throw Error('fixture-render-failure');};
  await assert.rejects(compareBulletBroadphase(env.renderer,env.canvas,{count:60,frames:12,framePacing:'raf',onPass(force,game){env.onPass(force,game);if(stage==='tick')game.tick=()=>{throw Error('fixture-tick-failure');};},onFrameStart(){starts++;},onFrameEnd(meta){ends++;assert.equal(meta.frame,0);assert.ok(meta.callbackCpuMs>0);if(stage==='end')throw Error('fixture-end-failure');}}),new RegExp('fixture-'+stage+'-failure'));
  assert.equal(starts,1);assert.equal(ends,1);assert.equal(env.rafCount,1);assert.equal(env.games.length,1);cleaned(env.games);
 });
});

test('profile hooks fail safely and a tab hidden while awaiting rAF never starts a tick',async()=>{
 for(const stage of ['progress','start'])await environment(async env=>{
  let starts=0,ends=0;
  await assert.rejects(compareBulletBroadphase(env.renderer,env.canvas,{count:60,frames:12,framePacing:'raf',onPass:env.onPass,
   onProgress(){if(stage==='progress')throw Error('fixture-progress-failure');},
   onFrameStart(){starts++;throw Error('fixture-start-failure');},
   onFrameEnd(){ends++;},
  }),new RegExp('fixture-'+stage+'-failure'));
  assert.equal(starts,stage==='start'?1:0);assert.equal(ends,stage==='start'?1:0);assert.equal(env.draws.length,0);assert.equal(env.games[0].time,0);cleaned(env.games);
 });
 await environment(async env=>{
  const originalRAF=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=callback=>originalRAF(timestamp=>{env.document.hidden=true;callback(timestamp);});
  let starts=0,ends=0;
  await assert.rejects(compareBulletBroadphase(env.renderer,env.canvas,{count:60,frames:12,framePacing:'raf',onPass:env.onPass,onFrameStart(){starts++;},onFrameEnd(){ends++;}}),/dense-raf-tab-hidden/);
  assert.equal(env.rafCount,1);assert.equal(starts,0);assert.equal(ends,0);assert.equal(env.draws.length,0);assert.equal(env.games[0].time,0);cleaned(env.games);
 });
});

test('asynchronous pass preparation gates every tick/render and a rejected preparation leaves the checkpoint and bullet method untouched',async()=>{
 await environment(async env=>{
  const preparations=[],ready=new WeakSet();let ticks=0;
  const render=env.renderer.render;env.renderer.render=function(game,...args){assert.equal(ready.has(game),true,'render waits for this pass preparation');return render.call(this,game,...args);};
  const pending=compareBulletBroadphase(env.renderer,env.canvas,{count:60,frames:12,framePacing:'raf',legacyBulletComparison:false,
   async onPass(force,game){
    env.onPass(force,game);const before=structuredClone(finalState(game)),tick=game.tick;
    game.tick=function(...args){assert.equal(ready.has(this),true,'tick waits for this pass preparation');ticks++;return tick.apply(this,args);};
    let release;const gate=new Promise(resolve=>{release=resolve;});preparations.push({game,before,release});await gate;ready.add(game);
   },
  });
  for(let pass=0;pass<3;pass++){
   await new Promise(setImmediate);assert.equal(preparations.length,pass+1);const preparation=preparations[pass];
   assert.equal(preparation.game.time,0);assert.deepEqual(finalState(preparation.game),preparation.before,'waiting cannot alter HP, checkpoint, effects or either RNG');
   assert.equal(ticks,pass*12);assert.equal(env.draws.length,pass*12);assert.equal(env.rafCount,pass*12,'even the first rAF is requested after preparation');assert.equal(Object.hasOwn(preparation.game,'updateBullets'),false,'bullet instrumentation starts after preparation');
   preparation.release();
  }
  const {report}=await pending;assert.equal(ticks,36);assert.equal(env.draws.length,36);assert.equal(report.identicalCombatState,true);assert.equal(report.identicalEvents,true);assert.deepEqual(env.passEvents[1],env.passEvents[0]);assert.deepEqual(env.passEvents[2],env.passEvents[0]);cleaned(env.games);
 });
 await environment(async env=>{
  let before;await assert.rejects(compareBulletBroadphase(env.renderer,env.canvas,{count:60,frames:12,framePacing:'raf',async onPass(force,game){env.onPass(force,game);before=structuredClone(finalState(game));await Promise.resolve();throw Error('fixture-async-preparation-rejected');}}),/fixture-async-preparation-rejected/);
  assert.equal(env.games.length,1);assert.equal(env.rafCount,0);assert.equal(env.draws.length,0);assert.deepEqual(finalState(env.games[0]),before);cleaned(env.games);
 });
});
