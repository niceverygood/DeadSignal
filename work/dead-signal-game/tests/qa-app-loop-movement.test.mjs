import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js?v=0.29.0';
import {advanceSimulation} from '../dist/simulation.js';
import {createQAStorage} from '../dist/qa-storage.js';
import {createMovementProfile} from '../dist/qa-movement-profile.js';

// Actual installer and Game, with cheap native/cost/DOM services. These are
// observer transparency checks, not browser, GPU or performance measurements.
const appURL=new URL('../dist/qa-app-loop.js',import.meta.url);
const beforeURL=new URL('../../../qa/movement-cost-20261018/qa-app-loop-before-movement.txt',import.meta.url);
const before=await readFile(beforeURL,'utf8'),current=await readFile(appURL,'utf8');
const beforeSHA='4c0480b58c3df48d8081f92a88a5427a266560441b7e0c49fbc92780f9811931';
let sequence=0;
const address=(suffix='')=>new URL('http://localhost:8851/index.html?qa&qa-memory&qa-loop=1'+suffix);
const memory=query=>createQAStorage(query,()=>{throw Error('persistent storage is forbidden');});
const state=game=>structuredClone({snapshot:game.snapshot(),random:game.random.getState(),visualRandom:game.visualRandom.getState(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash});

function fakeDocument(){
 const elements=new Map(),calls=[];
 for(const id of ['qa-loop-start','qa-loop-stop','qa-loop-status','qa-loop-report','qa-loop-proof'])elements.set('#'+id,{textContent:'',src:'',listeners:new Map(),addEventListener(name,fn){this.listeners.set(name,fn);},click(){return this.listeners.get('click')?.();}});
 const panel={style:{},querySelector:id=>elements.get(id)};
 return {calls,elements,document:{createElement(tag){calls.push(['create',tag]);assert.equal(tag,'aside');return panel;},body:{append(node){calls.push(['append']);assert.equal(node,panel);}}}};
}
function gameLoop(){
 const game=new Game({seed:774,missionId:'mission-01',weapon:'nailgun'}),context={game,screen:null,accumulator:0,lastFrame:0,hidden:false,focused:true,visibility:'visible',hudClock:0,saveClock:0};
 const calls={ticks:0,events:[],renders:[]},receiver={},token={returnIdentity:true};let simulation=advanceSimulation;
 const renderer={liveEnemies:null,canvas:{toDataURL(){return 'data:image/mock;base64,proof';}},render(view,now){calls.renders.push([view.time,now]);return token;}};
 const binding={name:'simulation',get:()=>simulation,set:fn=>{simulation=fn;}},method={object:renderer,key:'render',name:'render'},originalRender=renderer.render;
 const frame=function(now,argument){assert.equal(this,receiver);assert.equal(argument,token);const delta=context.lastFrame?Math.min(.12,(now-context.lastFrame)/1000):0;context.lastFrame=now;context.accumulator+=delta;
  const result=simulation(game,{fireMode:'manual',shoot:true,aimX:game.player.x+350,aimY:game.player.y-250,moveX:.25,moveY:0},context.accumulator);context.accumulator=result.accumulator;
  calls.events.push(...structuredClone(game.drainEvents()));context.saveClock+=delta;context.hudClock+=delta;return renderer.render(game,now);
 };
 return {game,context,calls,receiver,token,renderer,frame,binding,method,originalRender,originalSimulation:advanceSimulation};
}
function assertRestored(loop){
 assert.equal(loop.binding.get(),loop.originalSimulation);assert.equal(loop.renderer.render,loop.originalRender);
 for(const key of ['tick','drainEvents','move','blocked'])assert.equal(Object.hasOwn(loop.game,key),false,key+' instance wrapper restored');
}
async function harness({original=false,realMovement=false}={},run){
 const log=[],factoryCalls=[],profiles=[],dom=fakeDocument(),loop=gameLoop();let clock=0,clockCalls=0;
 const profile=name=>{const value={name,samples:[],current:null,stopped:false,beginFrame(meta){log.push(name+'.begin');this.current={...meta};},endFrame(){log.push(name+'.end');this.samples.push(this.current);this.current=null;},stop(){log.push(name+'.stop');this.stopped=true;return {samples:this.samples,unmeasured:[],note:'test service'};}};profiles.push(value);return value;};
 const services={createNativeFrameProfile(rig){factoryCalls.push(['native',rig]);return profile('native');},createFrameCostProfile(options){factoryCalls.push(['cost',options]);return profile('cost');},createMovementProfile(options){factoryCalls.push(['movement',options]);if(realMovement)return createMovementProfile(options);const value=profile('movement');return {...value,beginFrame:meta=>value.beginFrame(meta),endFrame:()=>value.endFrame(),stop(){return {...value.stop(),mode:options.mode};}};}};
 const key='__deadSignalAppMovementServices'+sequence++;globalThis[key]=services;
 const shim='const services=globalThis['+JSON.stringify(key)+'];export const {createNativeFrameProfile,createFrameCostProfile,createMovementProfile}=services;';
 const shimURL='data:text/javascript;base64,'+Buffer.from(shim).toString('base64');
 const source=(original?before:current).replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_match,_quote,path)=>'from '+JSON.stringify(['./qa-native-frame-profile.js','./qa-frame-cost-profile.js','./qa-movement-profile.js'].includes(path)?shimURL:new URL(path,appURL).href));
 let module;try{module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}finally{delete globalThis[key];}
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'performance');Object.defineProperty(globalThis,'performance',{configurable:true,value:{now(){clockCalls++;return clock+=.125;}}});
 try{return await run({module,log,factoryCalls,profiles,dom,loop,get clockCalls(){return clockCalls;}});}
 finally{if(descriptor)Object.defineProperty(globalThis,'performance',descriptor);else delete globalThis.performance;}
}
function install(env,location=address(),storage=memory(location.searchParams)){
 const read=()=>env.loop.context;env.read=read;
 return env.module.installAppLoopQA({document:env.dom.document,location,query:location.searchParams,storage,read,bindings:[env.loop.binding],methods:[env.loop.method],renderer:env.loop.renderer,fixture:{seed:774,source:'normal Game'}});
}
function exercise(env,location=address()){
 const installed=install(env,location);assert.ok(installed);const wrapped=installed.wrapFrame(env.loop.frame);
 assert.equal(env.factoryCalls.length,0,'installing the QA panel does not attach observers');
 env.dom.elements.get('#qa-loop-start').click();assert.equal(installed.probe.active,true);
 for(const now of [1000,2000,3000])assert.equal(wrapped.call(env.loop.receiver,now,env.loop.token),env.loop.token);
 env.dom.elements.get('#qa-loop-stop').click();assertRestored(env.loop);
 const report=installed.probe.report;assert.equal(report.callbacks,3);assert.ok(report.tickSchedule.length>=14&&report.tickSchedule.length<=15);assert.equal(report.samples[1].rawDeltaMs,1000);assert.equal(report.samples[1].clampedDeltaMs,120);assert.equal(report.samples[1].discardedWallMs,880);
 assert.deepEqual(report.eventStream,env.loop.calls.events);assert.equal(report.finalSnapshot.state,'playing');assert.deepEqual(report.finalSnapshot,env.loop.game.snapshot());
 assert.equal(env.dom.elements.get('#qa-loop-report').textContent,JSON.stringify(report,null,2));assert.equal(env.dom.elements.get('#qa-loop-proof').src,'data:image/mock;base64,proof');
 return {report,state:state(env.loop.game),calls:structuredClone(env.loop.calls),clockCalls:env.clockCalls,log:[...env.log]};
}

test('movement mode parsing accepts only the explicit counts and wall values',async()=>{
 await harness({},async({module})=>{
  assert.equal(module.appLoopMovementMode(undefined),null);
  for(const value of ['counts','wall'])assert.equal(module.appLoopMovementMode(new URLSearchParams({'qa-loop-movement':value})),value);
  for(const value of ['','0','1','true','Counts','WALL','off','unknown'])assert.equal(module.appLoopMovementMode(new URLSearchParams({'qa-loop-movement':value})),null);
  assert.equal(module.appLoopMovementMode(new URLSearchParams()),null);
 });
});

test('protected origins and unbranded storage reject before DOM, read or any observer factory',async()=>{
 await harness({},async env=>{
  const trap={get getItem(){throw Error('persistent read');},get setItem(){throw Error('persistent write');}},allowed=address('&qa-loop-movement=wall'),storage=memory(allowed.searchParams);
  const document={get createElement(){throw Error('DOM before guard');}},read=()=>{throw Error('Game read before guard');};
  for(const location of [new URL('http://localhost:8806/?qa&qa-memory&qa-loop=1&qa-loop-movement=wall'),new URL('http://example.com:8851/?qa&qa-memory&qa-loop=1&qa-loop-movement=counts'),new URL('https://localhost:8851/?qa&qa-memory&qa-loop=1&qa-loop-movement=counts'),new URL('http://localhost:8851/?qa&qa-loop=1&qa-loop-movement=wall'),new URL('http://localhost:8851/?qa&qa-memory&qa-loop-movement=wall')])assert.equal(env.module.installAppLoopQA({document,location,query:location.searchParams,storage,read}),null);
  assert.equal(env.module.installAppLoopQA({document,location:allowed,query:allowed.searchParams,storage:trap,read}),null);assert.deepEqual(env.factoryCalls,[]);assert.deepEqual(env.dom.calls,[]);
 });
});

test('absent or unknown movement mode preserves the full original report, clock calls and Game behavior',async()=>{
 assert.equal(createHash('sha256').update(before).digest('hex'),beforeSHA,'independent original installer evidence');
 for(const suffix of ['', '&qa-loop-cost=1','&qa-loop-cost=1&qa-loop-movement=unknown']){
  const location=address(suffix),baseline=await harness({original:true},env=>exercise(env,location)),candidate=await harness({},env=>exercise(env,location));
  assert.deepEqual(candidate,baseline,suffix);assert.equal(Object.hasOwn(candidate.report,'movement'),false);assert.ok(!candidate.log.some(entry=>entry.startsWith('movement.')));
 }
});

test('enabled movement lifecycle composes with native and cost without supplying extra ticks, events or renders',async()=>{
 const baseline=await harness({original:true},env=>exercise(env,address('&qa-loop-cost=1')));
 for(const mode of ['counts','wall'])await harness({},env=>{
  const result=exercise(env,address('&qa-loop-cost=1&qa-loop-movement='+mode)),movementCalls=env.factoryCalls.filter(([name])=>name==='movement');assert.equal(movementCalls.length,1);assert.equal(movementCalls[0][1].read,env.read);assert.equal(movementCalls[0][1].mode,mode);
  assert.deepEqual(result.state,baseline.state);assert.deepEqual(result.calls,baseline.calls);assert.equal(result.clockCalls,baseline.clockCalls,'service orchestration adds no clock reads itself');
  assert.deepEqual(result.log,[...Array.from({length:3},()=>['native.begin','cost.begin','movement.begin','movement.end','cost.end','native.end']).flat(),'native.stop','cost.stop','movement.stop']);
  assert.equal(result.report.movement.mode,mode);assert.deepEqual(result.report.movement.samples,[{callback:0},{callback:1},{callback:2}]);
  const withoutMovement={...result.report};delete withoutMovement.movement;assert.deepEqual(withoutMovement,baseline.report,'the optional field is the only report change with controlled services');
 });
});

test('the actual movement helper observes normal clamped Game calls and restores only its own instance methods',async()=>{
 const baseline=await harness({original:true},env=>exercise(env));
 const counts=await harness({realMovement:true},env=>exercise(env,address('&qa-loop-movement=counts')));
 const wall=await harness({realMovement:true},env=>exercise(env,address('&qa-loop-movement=wall')));
 for(const result of [counts,wall]){assert.deepEqual(result.state,baseline.state);assert.deepEqual(result.calls,baseline.calls);assert.deepEqual(result.report.tickSchedule,baseline.report.tickSchedule);assert.deepEqual(result.report.eventStream,baseline.report.eventStream);assert.equal(result.report.movement.samples.length,3);assert.deepEqual(result.report.movement.unmeasured,[]);}
 assert.equal(counts.clockCalls,baseline.clockCalls,'counts performs zero timer reads');
 const stages=counts.report.movement.samples.flatMap(sample=>Object.entries(sample.stages));assert.ok(stages.some(([name,entry])=>name==='move.player'&&entry.calls>0));assert.ok(stages.some(([name,entry])=>name==='move.nonplayer'&&entry.calls>0));assert.ok(stages.some(([name,entry])=>name==='blocked.nonplayer'&&entry.calls>0));
 assert.ok(stages.every(([_name,entry])=>entry.wallMs===null&&entry.thrownCalls===0));
 const wallStages=wall.report.movement.samples.flatMap(sample=>Object.entries(sample.stages)),calls=wallStages.reduce((n,[_name,entry])=>n+entry.calls,0);assert.ok(wallStages.every(([_name,entry])=>Number.isFinite(entry.wallMs)&&entry.wallMs>=0));assert.equal(wall.clockCalls-counts.clockCalls,calls*2,'wall mode only times original movement/blocking invocations');
 assert.deepEqual(wallStages.map(([name,entry])=>[name,entry.calls,entry.thrownCalls]),stages.map(([name,entry])=>[name,entry.calls,entry.thrownCalls]));
});

test('an original frame exception keeps its identity while every composed observer stops and restores',async()=>{
 await harness({realMovement:true},env=>{
  const installed=install(env,address('&qa-loop-cost=1&qa-loop-movement=counts')),failure=new Error('original frame failure');env.dom.elements.get('#qa-loop-start').click();
  const wrapped=installed.wrapFrame(function(now){assert.equal(this,env.loop.receiver);env.loop.game.move(env.loop.game.player,1,0);throw failure;});
  assert.throws(()=>wrapped.call(env.loop.receiver,1000),error=>error===failure);assert.equal(installed.probe.active,false);assertRestored(env.loop);
  const report=installed.probe.report;assert.equal(report.reason,'frame-error');assert.equal(report.samples[0].error,failure.message);assert.equal(report.movement.samples.length,1);assert.equal(report.movement.samples[0].stages['move.player'].calls,1);assert.equal(report.tickSchedule.length,0);assert.deepEqual(env.log,['native.begin','cost.begin','cost.end','native.end','native.stop','cost.stop']);
 });
});
