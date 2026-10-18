import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js?v=0.29.0';
import {ActorInterpolation} from '../dist/actor-interpolation.js';
import {FIXED_STEP} from '../dist/simulation.js?v=0.29.0';
import {compareInterpolationPool} from '../dist/qa-interpolation-pool.js';

const actorLists=['enemies','bullets','hostileProjectiles','particles','pickups','corpses','throwables'];
const fields=['id','x','y','angle','elapsed','height','attackTime','hitFlash','attackCd','reloadTime','skillCd','fallElapsed','life','recoil'];
const actorView=actor=>Object.fromEntries(fields.map(field=>[field,actor[field]]));
const drawView=view=>({time:view.time,flash:view.flash,player:actorView(view.player),...Object.fromEntries(actorLists.map(name=>[name,(view[name]||[]).map(actorView)]))});
const combatState=game=>structuredClone({snapshot:game.snapshot(),random:game.random.getState(),visualRandom:game.visualRandom.getState(),particles:game.particles,texts:game.texts,links:game.links,events:game.events,flash:game.flash,shake:game.shake});
const context=(count=180)=>{const location=new URL(`http://localhost:8851/qa-player-rig.html?qa&qa-memory=pool&qa-loop=1&qa-loop-count=${count}`);return {location,query:location.searchParams};};
function surface(){
 const canvas={width:4,height:4,pixels:new Uint8ClampedArray(64),toDataURL(){return 'data:image/mock;base64,'+Buffer.from(this.pixels).toString('base64');}};
 canvas.getContext=kind=>{assert.equal(kind,'2d');return {drawImage(source){canvas.pixels.set(source.pixels);},getImageData(){return {data:new Uint8ClampedArray(canvas.pixels)};}};};return canvas;
}
async function environment(run){
 const saved=new Map(['document','requestAnimationFrame','performance','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),captureDescriptor=Object.getOwnPropertyDescriptor(ActorInterpolation.prototype,'capture'),drainDescriptor=Object.getOwnPropertyDescriptor(Game.prototype,'drainEvents');
 const records=new Map(),order=[],eventStreams=new Map(),canvas=surface(),draws=[],images=[];let clock=0,rafCalls=0,domCalls=0,persistentAccess=0;
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock+=.125}});
 Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:callback=>{rafCalls++;queueMicrotask(()=>callback(rafCalls*1000/60));return rafCalls;}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(tag){domCalls++;assert.equal(tag,'canvas');return surface();}}});
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){persistentAccess++;throw Error('user storage cannot be accessed');}});
 Object.defineProperty(ActorInterpolation.prototype,'capture',{...captureDescriptor,value:function(game){
  let record=records.get(this);if(!record){record={interpolation:this,game,seen:new WeakSet(),created:0,reused:0,fresh:0,captures:0,playingCaptures:0,frameStats:[],pending:{created:0,reused:0,captures:0}};records.set(this,record);order.push(record);}
  record.captures++;record.pending.captures++;if(game.state==='playing')record.playingCaptures++;
  for(const actor of [game.player,...actorLists.flatMap(name=>game[name]||[])])if(actor&&Number.isFinite(actor.x)&&Number.isFinite(actor.y)){
   record.fresh++;const key=record.seen.has(actor)?'reused':'created';record[key]++;record.pending[key]++;record.seen.add(actor);
  }
  return captureDescriptor.value.call(this,game);
 }});
 Object.defineProperty(Game.prototype,'drainEvents',{...drainDescriptor,value:function(){const events=drainDescriptor.value.call(this);let stream=eventStreams.get(this);if(!stream)eventStreams.set(this,stream=[]);stream.push(...structuredClone(events));return events;}});
 // The pixels encode the complete interpolated render input. This verifies the
 // QA readback/comparison protocol and exact poses, not actual browser artwork.
 const renderer={dpr:1.5,cameraReady:true,render(view,command,now){
  const record=order.at(-1);assert.ok(record);assert.equal(Object.getPrototypeOf(view),record.game);const image=drawView(view);draws.push({game:record.game,view:structuredClone(image),command:structuredClone(command),now,cameraReady:this.cameraReady});this.cameraReady=true;
  record.frameStats.push(record.pending);record.pending={created:0,reused:0,captures:0};const bytes=createHash('sha256').update(JSON.stringify(image)).digest();canvas.pixels.set(bytes);canvas.pixels.set(bytes,32);
 }};
 try{return await run({canvas,renderer,records,order,eventStreams,draws,images,get rafCalls(){return rafCalls;},get domCalls(){return domCalls;},get persistentAccess(){return persistentAccess;}});}
 finally{Object.defineProperty(ActorInterpolation.prototype,'capture',captureDescriptor);Object.defineProperty(Game.prototype,'drainEvents',drainDescriptor);for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('normal 60/180 actors retain exact state, events and interpolated render inputs across fresh/pooled/fresh .12-second catch-up',async()=>{
 for(const count of [60,180])await environment(async env=>{
  const progress=[],scenario=[];const {game,report}=await compareInterpolationPool(env.renderer,env.canvas,{...context(count),beforeScenario:async current=>{scenario.push(combatState(current));},onProgress:reuse=>progress.push(reuse),onImage:(reuse,src)=>env.images.push({reuse,src})});
  assert.equal(report.fixture.count,count);assert.equal(report.fixture.baseEnemies,5);assert.equal(report.fixture.spawnClock,1.5);assert.equal(scenario.length,1);assert.equal(scenario[0].snapshot.enemies.length,count);assert.equal(env.persistentAccess,0);
  assert.deepEqual(progress,[false,true,false]);assert.equal(env.draws.length,120);assert.equal(env.images.length,3);assert.equal(env.rafCalls,15);assert.equal(env.domCalls,3);assert.equal(env.order.length,3);
  assert.equal(report.identicalCombatState,true);assert.equal(report.identicalEvents,true);assert.deepEqual(report.differences,[{reuse:true,different:0,maxDelta:0},{reuse:false,different:0,maxDelta:0}]);
  const views=env.order.map(record=>env.draws.filter(draw=>draw.game===record.game).map(({view,command,now})=>({view,command,now})));
  assert.deepEqual(views[1],views[0]);assert.deepEqual(views[2],views[0]);assert.deepEqual(combatState(env.order[1].game),combatState(env.order[0].game));assert.deepEqual(combatState(env.order[2].game),combatState(env.order[0].game));assert.equal(game,env.order[2].game);
  assert.deepEqual(env.eventStreams.get(env.order[1].game),env.eventStreams.get(env.order[0].game));assert.deepEqual(env.eventStreams.get(env.order[2].game),env.eventStreams.get(env.order[0].game));assert.ok(env.eventStreams.get(game).some(event=>event.type==='shot'),'actual auto aiming/firing emits normal events');
  let accumulator=0,expectedCaptures=0;const perFrame=[];for(let frame=0;frame<40;frame++){accumulator+=.12;let captures=0;while(accumulator>=FIXED_STEP){accumulator-=FIXED_STEP;captures++;}perFrame.push(captures);expectedCaptures+=captures;}
  for(let pass=0;pass<3;pass++){
   const actual=report.passes[pass],oracle=env.order[pass],reuse=pass===1;assert.equal(actual.reuse,reuse);assert.equal(actual.stats.captures,expectedCaptures);assert.equal(oracle.captures,expectedCaptures);assert.deepEqual(oracle.frameStats.map(frame=>frame.captures),perFrame);assert.equal(actual.samples.length,30);assert.deepEqual(actual.samples.map(sample=>sample.frame),Array.from({length:30},(_,i)=>i+10));
   const expected=reuse?{created:oracle.created,reused:oracle.reused,captures:oracle.captures}:{created:oracle.fresh,reused:0,captures:oracle.captures};assert.deepEqual(actual.stats,expected);
   const timed=oracle.frameStats.slice(10).reduce((total,frame)=>{total.created+=reuse?frame.created:frame.created+frame.reused;total.reused+=reuse?frame.reused:0;total.captures+=frame.captures;return total;},{created:0,reused:0,captures:0});assert.deepEqual(actual.timedStats,timed);
   assert.ok(Math.abs(actual.time-oracle.playingCaptures*FIXED_STEP)<1e-10,'original upgrade-state tick guards can prevent advancement within a catch-up batch');assert.equal(env.draws[pass*40].cameraReady,false);assert.equal(Object.hasOwn(oracle.interpolation,'capture'),false,'QA capture timing wrapper is removed');
  }
  assert.ok(report.passes[1].stats.created<report.passes[0].stats.created/10,'observed source record creation is materially reduced without skipping captures');assert.ok(report.passes[1].stats.reused>0);
 });
});

test('non-memory flags, invalid densities and every non-QA origin reject before scenario/render/storage work',async()=>{
 await environment(async env=>{
  let scenarios=0;for(const address of ['http://localhost:8806/?qa&qa-memory&qa-loop=1','http://localhost:8852/?qa&qa-memory&qa-loop=1','https://localhost:8851/?qa&qa-memory&qa-loop=1','http://example.com:8851/?qa&qa-memory&qa-loop=1','http://localhost:8851/?qa&qa-loop=1','http://localhost:8851/?qa-memory&qa-loop=1','http://localhost:8851/?qa&qa-memory&qa-loop=0','http://localhost:8851/?qa&qa-memory&qa-loop=1&qa-loop-count=61']){
   const location=new URL(address);await assert.rejects(compareInterpolationPool(env.renderer,env.canvas,{location,query:location.searchParams,beforeScenario(){scenarios++;}}),/interpolation-pool-(memory-origin-required|fixture-invalid)/);
  }
  assert.equal(scenarios,0);assert.equal(env.records.size,0);assert.equal(env.draws.length,0);assert.equal(env.rafCalls,0);assert.equal(env.domCalls,0);assert.equal(env.persistentAccess,0);
 });
});

test('a real capture followed by a render failure releases the temporary capture wrapper and preserves the original exception',async()=>{
 await environment(async env=>{
  const failure=new Error('render-service-failure');env.renderer.render=()=>{throw failure;};await assert.rejects(compareInterpolationPool(env.renderer,env.canvas,context(60)),error=>error===failure);
  assert.equal(env.order.length,1);assert.ok(env.order[0].captures>0);assert.equal(Object.hasOwn(env.order[0].interpolation,'capture'),false);assert.equal(env.rafCalls,0);assert.equal(env.domCalls,0);assert.equal(env.persistentAccess,0);
 });
});

test('every original fixture and normal-spawn rig resolves before the first reference pass starts, including an on-demand rig promise',async()=>{
 await environment(async env=>{
  const loadCalls=[],loads=[];let resolveRig,expectedKeys,progress=0,scenarioCount=0;
  env.renderer.liveEnemiesPromise=new Promise(resolve=>{resolveRig=resolve;});
  env.renderer.liveEnemySelection=new Set(Array.from({length:12},(_,i)=>i));
  const pending=compareInterpolationPool(env.renderer,env.canvas,{...context(60),beforeScenario:async preview=>{scenarioCount++;expectedKeys=[...new Set([...preview.enemies.map(enemy=>'enemy-'+enemy.type),...preview.mission.enemyPool.map(enemy=>'enemy-'+enemy.type)])];},onProgress(){progress++;assert.ok(loads.every(load=>load.done),'all originals must be ready before any A/B/A pass');}});
  await new Promise(setImmediate);assert.equal(scenarioCount,1);assert.equal(loadCalls.length,0);assert.equal(progress,0);assert.equal(env.draws.length,0);assert.equal(env.records.size,0);assert.equal(env.rafCalls,0);
  resolveRig({load(key){loadCalls.push(key);let resolve;const promise=new Promise(done=>{resolve=done;});loads.push({key,done:false,resolve(){this.done=true;resolve(true);}});return promise;}});
  await new Promise(setImmediate);assert.deepEqual(loadCalls,expectedKeys);assert.ok(expectedKeys.includes('enemy-runner')&&expectedKeys.includes('enemy-gas'),'future mission spawn types are included');assert.equal(progress,0);assert.equal(env.draws.length,0);assert.equal(env.records.size,0);
  for(const load of loads.slice(0,-1))load.resolve();await new Promise(setImmediate);assert.equal(progress,0);assert.equal(env.draws.length,0);assert.equal(env.rafCalls,0,'one still-loading native original blocks all measured work');
  loads.at(-1).resolve();const {report}=await pending;assert.equal(progress,3);assert.equal(env.draws.length,120);assert.deepEqual(report.nativeReadyKeys,expectedKeys);assert.ok(report.passes.every(pass=>pass.samples.every(sample=>sample.nativeSelected===12)));assert.equal(report.identicalCombatState,true);assert.equal(report.identicalEvents,true);assert.equal(env.persistentAccess,0);
 });
});

test('an unavailable or rejected original rig fails before capture, progress, rendering or image comparison',async()=>{
 for(const reject of [false,true])await environment(async env=>{
  const failure=new Error('original-rig-load-rejected'),keys=[];let progress=0;
  env.renderer.liveEnemies={load(key){keys.push(key);return reject?Promise.reject(failure):Promise.resolve(key!=='enemy-runner');}};
  await assert.rejects(compareInterpolationPool(env.renderer,env.canvas,{...context(60),onProgress(){progress++;}}),reject?error=>error===failure:/interpolation-pool-original-native-not-ready/);
  assert.ok(keys.includes('enemy-runner'));assert.equal(progress,0);assert.equal(env.records.size,0);assert.equal(env.draws.length,0);assert.equal(env.domCalls,0);assert.equal(env.rafCalls,0);assert.equal(env.persistentAccess,0);
 });
});
