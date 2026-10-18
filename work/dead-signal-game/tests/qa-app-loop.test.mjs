import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {FIXED_STEP,advanceSimulation} from '../dist/simulation.js';
import {ActorInterpolation} from '../dist/actor-interpolation.js';
import {createQAStorage,isQAMemoryStorage} from '../dist/qa-storage.js';
import {loadProfile,saveProfile,PROFILE_KEY} from '../dist/storage.js';
import {allowAppLoopQA,seedAppLoopQA,AppLoopProbe} from '../dist/qa-app-loop.js';

const url=path=>new URL(path??'http://localhost:8851/index.html?qa=1&qa-memory=app-loop&qa-loop=1');
const contextURL=path=>{const location=url(path);return {location,query:location.searchParams};};
const memory=query=>createQAStorage(query??contextURL().query,()=>{throw Error('persistent storage must not be used');});
const state=game=>structuredClone({snapshot:game.snapshot(),random:game.random.getState(),visualRandom:game.visualRandom.getState(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash});

test('app-loop QA requires the exact loopback origin, flags and genuine Map storage without accessing persistent storage',()=>{
 const allowed=contextURL(),storage=memory(allowed.query);assert.equal(isQAMemoryStorage(storage),true);
 for(const host of ['localhost','127.0.0.1','[::1]']){const location=url(`http://${host}:8851/index.html?qa&qa-memory&qa-loop=1`);assert.equal(allowAppLoopQA(location,location.searchParams,storage),true);}
 let persistentAccess=0;const trap={get getItem(){persistentAccess++;throw Error('outside guard read');},get setItem(){persistentAccess++;throw Error('outside guard write');}};
 assert.equal(isQAMemoryStorage(trap),false);assert.equal(allowAppLoopQA(allowed.location,allowed.query,trap),false);assert.equal(allowAppLoopQA(allowed.location,allowed.query,undefined),false);
 const profile=loadProfile(storage),before=structuredClone(profile);
 for(const path of ['http://localhost:8806/index.html?qa&qa-memory&qa-loop=1','http://127.0.0.1:8852/?qa&qa-memory&qa-loop=1','https://localhost:8851/?qa&qa-memory&qa-loop=1','http://localhost.evil.example:8851/?qa&qa-memory&qa-loop=1','http://game.example:8851/?qa&qa-memory&qa-loop=1','http://localhost:8851/?qa-memory&qa-loop=1','http://localhost:8851/?qa&qa-loop=1','http://localhost:8851/?qa&qa-memory','http://localhost:8851/?qa&qa-memory&qa-loop=0']){
  const candidate=contextURL(path);assert.equal(allowAppLoopQA(candidate.location,candidate.query,storage),false,path);assert.equal(seedAppLoopQA(profile,storage,candidate),null,path);assert.deepEqual(profile,before);
 }
 assert.equal(seedAppLoopQA(profile,trap,allowed),null);assert.equal(persistentAccess,0);
 const qaOnly=createQAStorage(new URLSearchParams('qa=1'),()=>{persistentAccess++;return trap;});assert.equal(isQAMemoryStorage(qaOnly),false);assert.equal(allowAppLoopQA(allowed.location,allowed.query,qaOnly),false);assert.equal(persistentAccess,0);
 assert.equal(isQAMemoryStorage(createQAStorage(new URLSearchParams())),false);
});

test('memory dense checkpoints preserve the five normal initial actors, player rules and live spawning across allowed densities',()=>{
 for(const [count,weapon]of [[60,'shotgun'],[180,'nailgun']]){
  const info=contextURL(`http://localhost:8851/index.html?qa&qa-memory&qa-loop=1&qa-loop-count=${count}`),storage=memory(info.query),profile=loadProfile(storage);
  const normal=new Game({seed:774,missionId:'mission-01',weapon,training:profile.training,equipment:profile.equipment}),original=normal.snapshot();assert.ok(original);
  const training=structuredClone(profile.training),equipment=structuredClone(profile.equipment),metadata=seedAppLoopQA(profile,storage,info);assert.ok(metadata);assert.ok(profile.activeRun);
  const restored=Game.restore(profile.activeRun.game,{resumePlaying:true});assert.ok(restored);const saved=restored.snapshot();assert.equal(saved.enemies.length,count);assert.deepEqual(saved.enemies.slice(0,5),original.enemies);assert.deepEqual(saved.player,original.player);assert.equal(saved.spawnClock,original.spawnClock);assert.equal(saved.spawnClock,1.5);assert.equal(saved.seed,774);assert.equal(saved.missionId,'mission-01');assert.equal(saved.player.weapon,weapon);assert.deepEqual(profile.training,training);assert.deepEqual(profile.equipment,equipment);
  for(const enemy of restored.enemies){assert.equal(enemy.hp,enemy.maxHp);assert.ok(Number.isFinite(enemy.speed)&&enemy.speed>0);assert.equal(restored.blocked(enemy.x,enemy.y,enemy.r),false);}
  assert.deepEqual(loadProfile(storage).activeRun,profile.activeRun);assert.ok(storage.getItem(PROFILE_KEY));
  const paused=Game.restore(profile.activeRun.game);assert.equal(paused.state,'paused','the original continue/resume flow remains required');
  const before=restored.enemies.length;for(let i=0;i<100;i++)restored.tick(FIXED_STEP,{shoot:false,moveX:0,moveY:0});assert.ok(restored.enemies.length>before,'the fixture retains normal timed spawning');
 }
 const info=contextURL(),storage=memory(info.query),profile=loadProfile(storage);assert.ok(seedAppLoopQA(profile,storage,info));assert.equal(profile.activeRun.game.enemies.length,180);
});

test('invalid density never seeds or saves a partial memory checkpoint',()=>{
 for(const count of ['0','1','59','61','181','1000000','NaN','60.5','']){
  const info=contextURL(`http://localhost:8851/?qa&qa-memory&qa-loop=1&qa-loop-count=${count}`),storage=memory(info.query),profile=loadProfile(storage),before=structuredClone(profile);
  assert.equal(seedAppLoopQA(profile,storage,info),null,count);assert.deepEqual(profile,before);assert.equal(storage.getItem(PROFILE_KEY),null);
 }
});

// A faithful fixed-step/catch-up caller with cheap UI/audio/render services.
// This proves observer transparency with the actual Game and interpolation;
// it is not a browser, GPU, wall-clock performance or presented-FPS benchmark.
function loopHarness(){
 const game=new Game({seed:774,missionId:'mission-01',weapon:'nailgun'}),storage=memory(),profile=loadProfile(storage),interpolation=new ActorInterpolation();
 const context={game,screen:null,accumulator:0,lastFrame:0,hidden:false,focused:true,visibility:'visible',hudClock:0,saveClock:0};
 const calls={events:[],audio:[],renders:[],hud:0,checkpoints:0},audio={play(type,event){calls.audio.push([type,structuredClone(event)]);return 'scheduled';}},renderer={render(view,command,now){calls.renders.push({time:view.time,player:{x:view.player.x,y:view.player.y},now,command:{...command}});return 'drawn';}};
 let simulation=advanceSimulation;
 let processEvents=function(){for(const event of context.game.drainEvents()){calls.events.push(structuredClone(event));audio.play(event.type,event);}};
 let checkpoint=function(){context.saveClock=0;profile.activeRun={version:1,id:'qa-app-loop-fixture',savedAt:0,game:context.game.snapshot(),selection:{route:'hospital'}};calls.checkpoints++;return saveProfile(profile,storage);};
 let updateHUD=function(){calls.hud++;return context.game.player.hp;};
 const bindings=[{name:'simulation',get:()=>simulation,set:fn=>{simulation=fn;}},{name:'events.process',get:()=>processEvents,set:fn=>{processEvents=fn;}},{name:'checkpoint',get:()=>checkpoint,set:fn=>{checkpoint=fn;}},{name:'hud',get:()=>updateHUD,set:fn=>{updateHUD=fn;}}];
 const methods=[{object:interpolation,key:'capture',name:'interpolation.capture'},{object:interpolation,key:'sample',name:'interpolation.sample'},{object:renderer,key:'render',name:'render'},{object:audio,key:'play',name:'audio.play',kind:'audio'},{object:storage,key:'setItem',name:'storage.setItem',kind:'storage'}];
 const originalMethods=methods.map(spec=>({spec,own:Object.getOwnPropertyDescriptor(spec.object,spec.key),value:spec.object[spec.key]})),originalBindings=bindings.map(spec=>spec.get());
 const receiver={tag:'frame receiver'},token={original:true};
 const frame=function(now,argument){assert.equal(this,receiver);assert.equal(argument,token);const delta=context.lastFrame?Math.min(.12,(now-context.lastFrame)/1000):0;context.lastFrame=now;context.accumulator+=delta;
  const command={fireMode:'manual',shoot:true,aimX:context.game.player.x+350,aimY:context.game.player.y-250,moveX:0,moveY:0};
  const advanced=simulation(context.game,command,context.accumulator,{interpolator:interpolation});context.accumulator=advanced.accumulator;processEvents();context.saveClock+=delta;if(context.game.state==='playing'&&context.saveClock>=3)checkpoint();
  renderer.render(interpolation.sample(context.game,context.accumulator/FIXED_STEP,FIXED_STEP),advanced.command,now/1000);context.hudClock+=delta;if(context.hudClock>.08){context.hudClock=0;updateHUD();}return argument;
 };
 return {context,calls,game,storage,bindings,methods,originalMethods,originalBindings,receiver,token,frame};
}
function assertRestored(harness){
 for(const {spec,own,value}of harness.originalMethods){assert.equal(spec.object[spec.key],value);assert.deepEqual(Object.getOwnPropertyDescriptor(spec.object,spec.key),own);}
 for(let i=0;i<harness.bindings.length;i++)assert.equal(harness.bindings[i].get(),harness.originalBindings[i]);
 assert.equal(Object.hasOwn(harness.context.game,'tick'),false);assert.equal(Object.hasOwn(harness.context.game,'drainEvents'),false);
}

test('real one-second callback catch-up, interpolation, events, audio and autosave remain identical with the product-loop observer',()=>{
 const baseline=loopHarness(),observed=loopHarness(),schedule=Array.from({length:40},(_,i)=>(i+1)*1000);let clock=0,stops=0;
 const probe=new AppLoopProbe({read:()=>observed.context,bindings:observed.bindings,methods:observed.methods,now:()=>clock+=.125,limit:40,maxCallbacks:120,onStop(){stops++;}}),wrapped=probe.wrapFrame(observed.frame);
 assert.equal(probe.start(),true);
 for(const now of schedule){assert.equal(baseline.frame.call(baseline.receiver,now,baseline.token),baseline.token);assert.equal(wrapped.call(observed.receiver,now,observed.token),observed.token);}
 const report=probe.stop('test-complete');assert.equal(stops,1);assert.equal(report.samples.length,40);assert.ok(report.initialSnapshot);assert.ok(report.finalSnapshot);assert.deepEqual(report.finalSnapshot,observed.game.snapshot());
 assert.deepEqual(state(observed.game),state(baseline.game));assert.deepEqual(observed.calls,baseline.calls);assert.equal(observed.storage.getItem(PROFILE_KEY),baseline.storage.getItem(PROFILE_KEY));assert.ok(observed.calls.events.length>0);assert.equal(observed.calls.checkpoints,1,'clamped simulation/save clock reaches the original three-second autosave');
 assert.ok(report.samples.slice(1).every(sample=>sample.rawDeltaMs===1000&&Math.abs(sample.clampedDeltaMs-120)<1e-9&&Math.abs(sample.discardedWallMs-880)<1e-9));assert.ok(report.samples.slice(1).every(sample=>sample.tickCount===7||sample.tickCount===8));
 const totalTicks=report.samples.reduce((sum,sample)=>sum+sample.tickCount,0);assert.equal(report.tickSchedule.length,totalTicks);assert.ok(totalTicks>275&&totalTicks<285);assert.deepEqual(report.eventStream,observed.calls.events);assert.equal(report.samples.reduce((sum,sample)=>sum+sample.eventCount,0),observed.calls.events.length);assert.equal(report.samples.reduce((sum,sample)=>sum+sample.audioCalls,0),observed.calls.audio.length);assert.equal(report.samples.reduce((sum,sample)=>sum+sample.storageWrites,0),1);
 assert.ok(report.samples.some(sample=>sample.stages.checkpoint?.calls===1));assert.ok(report.samples.every(sample=>sample.frameCpuMs>=0));assertRestored(observed);
});

test('the frame wrapper preserves pass-through return/throw and methods are restored even after an observed stage throws',()=>{
 const harness=loopHarness();let clock=0;const probe=new AppLoopProbe({read:()=>harness.context,bindings:harness.bindings,methods:harness.methods,now:()=>clock+=.1,limit:10});
 const marker={},receiver={};let got;
 const pass=probe.wrapFrame(function(...args){got={self:this,args};return marker;});assert.equal(pass.call(receiver,11,12),marker);assert.deepEqual(got,{self:receiver,args:[11,12]});assert.equal(probe.start(),true);
 const failure=new Error('original frame failure'),thrower=probe.wrapFrame(function(){harness.bindings[0].get()(harness.game,{shoot:false},FIXED_STEP,{interpolator:null});throw failure;});assert.throws(()=>thrower.call(receiver,1000),error=>error===failure);
 const report=probe.stop('error-reviewed');assert.ok(report.samples.length>=1);assert.ok(report.samples.at(-1).stages.simulation?.calls>=1);assertRestored(harness);
});

test('external replacements survive stop and a new Game releases the previous instance wrappers',()=>{
 const harness=loopHarness(),oldGame=harness.game;let clock=0;const probe=new AppLoopProbe({read:()=>harness.context,bindings:harness.bindings,methods:harness.methods,now:()=>clock+=.1,limit:10}),wrapped=probe.wrapFrame(harness.frame);assert.equal(probe.start(),true);
 wrapped.call(harness.receiver,1000,harness.token);const next=new Game({seed:775,missionId:'mission-01'});harness.context.game=next;wrapped.call(harness.receiver,2000,harness.token);assert.equal(Object.hasOwn(oldGame,'tick'),false);assert.equal(Object.hasOwn(oldGame,'drainEvents'),false);
 const externalBinding=()=>17,externalMethod=()=>19;harness.bindings[1].set(externalBinding);harness.methods[0].object[harness.methods[0].key]=externalMethod;probe.stop('replaced');assert.equal(harness.bindings[1].get(),externalBinding);assert.equal(harness.methods[0].object[harness.methods[0].key],externalMethod);assert.equal(Object.hasOwn(next,'tick'),false);assert.equal(Object.hasOwn(next,'drainEvents'),false);
});

test('start requires an uncovered playing state and sample/callback limits stop once without mutating gameplay',()=>{
 const harness=loopHarness();let clock=0,stops=0;const probe=new AppLoopProbe({read:()=>harness.context,bindings:harness.bindings,methods:harness.methods,now:()=>clock+=.1,limit:2,maxCallbacks:3,onStop(){stops++;}});
 harness.context.screen='settings';assert.equal(probe.start(),false);assertRestored(harness);harness.context.screen=null;harness.game.pause();assert.equal(probe.start(),false);assertRestored(harness);harness.game.resume();const initial=state(harness.game);assert.equal(probe.start(),true);
 const wrapped=probe.wrapFrame(()=>42);assert.equal(wrapped(1000),42);assert.equal(wrapped(2000),42);assert.equal(wrapped(3000),42);const report=probe.stop('again');assert.equal(report.samples.length,2);assert.equal(stops,1);assertRestored(harness);
 assert.deepEqual(state(harness.game),initial);
 const hidden=loopHarness();let callbackStops=0;const bounded=new AppLoopProbe({read:()=>hidden.context,bindings:hidden.bindings,methods:hidden.methods,now:()=>clock+=.1,limit:2,maxCallbacks:3,onStop(){callbackStops++;}});assert.equal(bounded.start(),true);hidden.context.hidden=true;const noWork=bounded.wrapFrame(()=>21);for(let i=0;i<4;i++)assert.equal(noWork(1000+i*1000),21);const boundedReport=bounded.stop('again');assert.equal(boundedReport.callbacks,3);assert.equal(boundedReport.playingFrames,0);assert.equal(boundedReport.reason,'callback-limit');assert.equal(callbackStops,1);assertRestored(hidden);
});

test('a failing stop observer cannot replace the original frame return value',()=>{
 const harness=loopHarness(),marker={returnIdentity:true},initial=state(harness.game);let clock=0,stops=0;
 const probe=new AppLoopProbe({read:()=>harness.context,bindings:harness.bindings,methods:harness.methods,now:()=>clock+=.1,limit:1,onStop(){stops++;throw Error('stop observer failure');}});
 const frame=probe.wrapFrame(function(argument){assert.equal(this,harness.receiver);assert.equal(argument,1000);return marker;});assert.equal(probe.start(),true);assert.equal(frame.call(harness.receiver,1000),marker);
 const report=probe.stop('already-stopped');assert.equal(report.observerError,'stop observer failure');assert.equal(report.reason,'playing-limit');assert.equal(report.samples.length,1);assert.equal(stops,1);assert.deepEqual(state(harness.game),initial);assertRestored(harness);
});

test('a failing stop observer cannot replace the original thrown frame error',()=>{
 const harness=loopHarness(),failure=new Error('original frame identity'),initial=state(harness.game);let clock=0,stops=0;
 const probe=new AppLoopProbe({read:()=>harness.context,bindings:harness.bindings,methods:harness.methods,now:()=>clock+=.1,limit:10,onStop(){stops++;throw Error('secondary observer failure');}});
 const frame=probe.wrapFrame(()=>{throw failure;});assert.equal(probe.start(),true);assert.throws(()=>frame(1000),error=>error===failure);
 const report=probe.stop('already-stopped');assert.equal(report.observerError,'secondary observer failure');assert.equal(report.reason,'frame-error');assert.equal(report.samples[0].error,failure.message);assert.equal(stops,1);assert.deepEqual(state(harness.game),initial);assertRestored(harness);
});
