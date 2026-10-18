import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {createMovementProfile} from '../dist/qa-movement-profile.js';

const descriptors=object=>Object.getOwnPropertyDescriptors(object);
const stage=(sample,name)=>sample.stages[name]??{calls:0,thrownCalls:0,wallMs:sample.mode==='wall'?0:null};
const sumCalls=sample=>Object.values(sample.stages).reduce((sum,value)=>sum+value.calls,0);
function noReferences(value,forbidden,seen=new Set()){
 if(value===null||typeof value!=='object')return;
 assert.equal(forbidden.has(value),false,'report retains no Game, actor, argument or result reference');
 if(seen.has(value))return;seen.add(value);
 for(const child of Object.values(value))noReferences(child,forbidden,seen);
}
function fixture(){
 const seen=[],player={kind:'player',x:4,y:6,r:2},npc={kind:'npc',x:10,y:20,r:3},result={originalResult:true},failure=Error('original movement failure');
 const prototype={
  move(entity,dx,dy,argument){
   seen.push({name:'move',receiver:this,args:[entity,dx,dy,argument]});
   if(argument==='throw')throw failure;
   this.blocked(entity.x+dx,entity.y+dy,entity.r,argument);
   if(argument==='mismatched')game.blocked.call(foreign,7,8,9,argument);
   return result;
  },
  blocked(...args){seen.push({name:'blocked',receiver:this,args});return false;}
 };
 const game=Object.create(prototype);Object.assign(game,{player});
 const foreign={player:{kind:'foreign player',x:5,y:7,r:4},blocked:null};
 return{game,player,npc,result,failure,seen,foreign,prototype};
}

test('counts and explicit wall modes classify only actual move/blocked calls and restore nested receiver scopes',()=>{
 for(const mode of ['counts','wall']){
  const f=fixture(),before=descriptors(f.game),prototypeBefore=descriptors(f.prototype);let clockCalls=0;
  const p=createMovementProfile({read:()=>({game:f.game}),mode,now:()=>++clockCalls});
  try{
   assert.deepEqual(f.seen,[],'creating an observer never moves or tests a collision');
   p.beginFrame({callback:9});f.foreign.blocked=f.game.blocked;
   assert.equal(f.game.move(f.player,1,2,'player'),f.result);
   assert.equal(f.game.move(f.npc,3,4,'npc'),f.result);
   assert.equal(f.game.move.call(f.foreign,f.foreign.player,5,6,'foreign'),f.result);
   assert.equal(f.game.move(f.npc,7,8,'mismatched'),f.result);
   assert.equal(f.game.blocked(1,2,3,'outside'),false);
   assert.equal(f.game.blocked.call(f.foreign,4,5,6,'outside foreign'),false);
   const sample=p.endFrame({path:'original-calls'});
   assert.equal(sample.callback,9);assert.equal(sample.path,'original-calls');assert.equal(sample.mode,mode);
   for(const [name,calls]of Object.entries({'move.player':1,'move.nonplayer':2,'move.foreign':1,'blocked.player':1,'blocked.nonplayer':2,'blocked.foreign':1,'blocked.outside':3})){
    assert.equal(stage(sample,name).calls,calls,name);assert.equal(stage(sample,name).thrownCalls,0);
    if(mode==='counts')assert.equal(stage(sample,name).wallMs,null);else assert.ok(stage(sample,name).wallMs>=calls);
   }
   assert.equal(f.seen.length,11,'exactly four original moves and seven original collision tests');
   assert.equal(f.seen[4].receiver,f.foreign);assert.equal(f.seen[5].receiver,f.foreign);
   if(mode==='counts')assert.equal(clockCalls,0,'counts calls no clock, including frame boundaries');
   else{assert.equal(clockCalls,sumCalls(sample)*2);assert.ok(stage(sample,'move.player').wallMs>stage(sample,'blocked.player').wallMs,'containing call wall time includes the nested call');}
   noReferences(sample,new Set([f.game,f.player,f.npc,f.foreign,f.result]));
  }finally{p.stop();}
  assert.deepEqual(descriptors(f.game),before);assert.deepEqual(descriptors(f.prototype),prototypeBefore);
 }
});

test('recursive scopes, custom original apply, arbitrary receivers, promise/result and thrown identities are transparent',()=>{
 const player={},npc={},result={},promise=Promise.resolve(result),failure=Error('original custom apply'),seen=[];
 const originalMove=function(){assert.fail('the original function custom apply must remain authoritative');};
 originalMove.apply=function(receiver,args){seen.push({name:'move.apply',receiver,args});if(args[1]==='throw')throw failure;if(args[1]==='promise')return promise;return result;};
 const originalBlocked=function(){assert.fail('blocked custom apply must remain authoritative');};
 originalBlocked.apply=function(receiver,args){seen.push({name:'blocked.apply',receiver,args});if(args[0]==='throw')throw failure;return args[0]==='promise'?promise:result;};
 const game={player,move:originalMove,blocked:originalBlocked},before=descriptors(game),foreign={},argument={get value(){assert.fail('observer must not inspect arguments');}};
 const p=createMovementProfile({read:()=>({game}),mode:'wall',now:()=>0});
 try{
  p.beginFrame();assert.equal(game.move.call(foreign,argument,'value',7),result);assert.equal(game.move(player,'promise'),promise);
  assert.throws(()=>game.move(npc,'throw'),error=>error===failure);
  assert.equal(game.blocked.call(foreign,argument,8,9),result);assert.equal(game.blocked('promise'),promise);assert.throws(()=>game.blocked('throw'),error=>error===failure);
  const sample=p.endFrame();assert.equal(stage(sample,'move.foreign').calls,1);assert.equal(stage(sample,'move.player').calls,1);assert.equal(stage(sample,'move.nonplayer').thrownCalls,1);assert.equal(stage(sample,'blocked.outside').calls,3);assert.equal(stage(sample,'blocked.outside').thrownCalls,1);
  assert.equal(seen.length,6);assert.equal(seen[0].receiver,foreign);assert.equal(seen[0].args[0],argument);assert.equal(seen[0].args[1],'value');assert.equal(seen[0].args[2],7);assert.equal(seen[3].receiver,foreign);assert.equal(seen[3].args[0],argument);
 }finally{p.stop();}assert.deepEqual(descriptors(game),before);
 const nested={player,move(entity,depth){this.blocked('before');if(depth)this.move(entity===player?npc:player,depth-1);this.blocked('after');return result;},blocked(){return false;}},nestedBefore=descriptors(nested),recursive=createMovementProfile({read:()=>({game:nested}),mode:'counts'});
 try{recursive.beginFrame();assert.equal(nested.move(player,2),result);assert.equal(nested.blocked('outside'),false);const sample=recursive.endFrame();assert.equal(stage(sample,'move.player').calls,2);assert.equal(stage(sample,'move.nonplayer').calls,1);assert.equal(stage(sample,'blocked.player').calls,4);assert.equal(stage(sample,'blocked.nonplayer').calls,2);assert.equal(stage(sample,'blocked.outside').calls,1);}finally{recursive.stop();}assert.deepEqual(descriptors(nested),nestedBefore);
});

test('disabled mode has no owner/clock/metadata IO; metadata is primitive data only and the 120-frame cap stops and restores exactly',()=>{
 const hostile=new Proxy({}, {get(){assert.fail('disabled property access');},getOwnPropertyDescriptor(){assert.fail('disabled descriptor access');},ownKeys(){assert.fail('disabled key access');}});
 const disabled=createMovementProfile({enabled:false,read(){assert.fail('disabled read');},now(){assert.fail('disabled clock');},mode:'wall'});
 assert.equal(disabled.beginFrame(hostile),null);assert.equal(disabled.endFrame(hostile),null);assert.deepEqual(disabled.stop().samples,[]);assert.deepEqual(disabled.unmeasured,[]);assert.equal(disabled.stop(),disabled.stop());
 const f=fixture(),before=descriptors(f.game);let reads=0,clocks=0,getters=0;
 const p=createMovementProfile({read(){reads++;return{game:f.game};},now(){clocks++;throw Error('counts must not time');},mode:'unrecognized',limit:10000});
 const meta={callback:0,boolean:true,text:'actual',nil:null,notFinite:Infinity,big:1n,object:f.game,fn(){},frameIndex:999,mode:'wall',stages:f.game};
 Object.defineProperty(meta,'getter',{enumerable:true,get(){getters++;throw Error('metadata accessor');}});
 assert.equal(reads,0);
 for(let i=0;i<120;i++){p.beginFrame({callback:i});f.game.move(f.player,0,0);const sample=p.endFrame(i===0?meta:{callback:i});assert.equal(sample.frameIndex,i);assert.equal(sample.mode,'counts');if(i===0){assert.equal(sample.boolean,true);assert.equal(sample.text,'actual');assert.equal(sample.nil,null);for(const key of ['notFinite','big','object','fn','getter'])assert.equal(Object.hasOwn(sample,key),false);assert.notEqual(sample.stages,f.game);}}
 assert.equal(p.samples.length,120);assert.equal(p.beginFrame(),null);assert.equal(p.endFrame(),null);assert.equal(reads,120);assert.equal(clocks,0);assert.equal(getters,0);assert.deepEqual(descriptors(f.game),before);assert.equal(p.stop(),p.stop());
 for(const limit of [1,2]){const bounded=createMovementProfile({read:()=>({game:f.game}),limit});for(let i=0;i<limit;i++){bounded.beginFrame();bounded.endFrame();}assert.equal(bounded.samples.length,limit);assert.equal(bounded.beginFrame(),null);bounded.stop();assert.deepEqual(descriptors(f.game),before);}
 const lifecycle=createMovementProfile({read:()=>({game:f.game})});assert.equal(lifecycle.endFrame(),null);const active=lifecycle.beginFrame({callback:1});assert.ok(active);assert.equal(lifecycle.beginFrame({callback:2}),null);f.game.move(f.player,0,0);const finished=lifecycle.endFrame({ended:true});assert.equal(finished,active);assert.equal(finished.callback,1);assert.equal(finished.ended,true);assert.equal(lifecycle.endFrame(),null);lifecycle.beginFrame();lifecycle.stop();assert.equal(lifecycle.samples.length,1,'stop discards an unfinished frame');assert.deepEqual(descriptors(f.game),before);assert.match(lifecycle.note,/wall time/);assert.match(lifecycle.note,/must not be summed/);assert.match(lifecycle.note,/must not be named separation/);
});

test('overlapping observers restore in either order, replace owners only at frame boundaries and preserve external method descriptors',()=>{
 for(const order of [[0,1],[1,0]]){
  const f=fixture(),before=descriptors(f.game),profiles=[0,1].map(()=>createMovementProfile({read:()=>({game:f.game}),mode:'counts'}));
  try{profiles.forEach(p=>p.beginFrame());f.game.move(f.player,1,2);for(const p of profiles)assert.equal(stage(p.endFrame(),'blocked.player').calls,1);assert.equal(f.seen.length,2,'overlap calls each original exactly once');profiles[order[0]].stop();const remaining=profiles[order[1]];remaining.beginFrame();f.game.move(f.npc,3,4);assert.equal(stage(remaining.endFrame(),'blocked.nonplayer').calls,1);remaining.stop();assert.deepEqual(descriptors(f.game),before);}finally{profiles.forEach(p=>p.stop());}
 }
 const a=fixture(),b=fixture(),beforeA=descriptors(a.game),beforeB=descriptors(b.game);let active=a.game;
 const p=createMovementProfile({read:()=>({game:active}),mode:'counts'});
 try{p.beginFrame();a.game.move(a.player,1,1);p.endFrame();active=b.game;p.beginFrame();assert.deepEqual(descriptors(a.game),beforeA);a.game.move(a.player,2,2);b.game.move(b.player,3,3);assert.equal(stage(p.endFrame(),'move.player').calls,1);const external=function(){return'external';},externalDescriptor={value:external,configurable:true,enumerable:false,writable:false};Object.defineProperty(b.game,'move',externalDescriptor);p.stop();assert.deepEqual(Object.getOwnPropertyDescriptor(b.game,'move'),externalDescriptor);assert.deepEqual(Object.getOwnPropertyDescriptor(b.game,'blocked'),beforeB.blocked);}finally{p.stop();}
 let getterCalls=0;const readonly={player:{}};Object.defineProperty(readonly,'move',{get(){getterCalls++;return()=>1;},enumerable:true,configurable:true});Object.defineProperty(readonly,'blocked',{value:()=>false,enumerable:false,writable:false,configurable:false});const beforeReadonly=descriptors(readonly),guarded=createMovementProfile({read:()=>({game:readonly}),mode:'counts'});
 try{guarded.beginFrame();assert.equal(getterCalls,0);assert.equal(readonly.blocked(),false);assert.equal(Object.keys(guarded.endFrame().stages).length,0);assert.ok(guarded.unmeasured.length>=2);}finally{guarded.stop();}assert.deepEqual(descriptors(readonly),beforeReadonly);assert.equal(getterCalls,0);
});

test('clock/read errors, reentrant calls and stopping inside a clock cannot replace original outcomes or leave hooks',()=>{
 const f=fixture(),before=descriptors(f.game);let readThrows=false,clockCalls=0;
 const p=createMovementProfile({read(){if(readThrows)throw Error('read unavailable');return{game:f.game};},mode:'wall',now(){clockCalls++;if(clockCalls%2)throw Error('clock unavailable');return Infinity;}});
 try{p.beginFrame();assert.equal(f.game.move(f.player,1,2),f.result);assert.throws(()=>f.game.move(f.npc,0,0,'throw'),error=>error===f.failure);const sample=p.endFrame();assert.equal(stage(sample,'move.player').wallMs,0);assert.equal(stage(sample,'blocked.player').wallMs,0);assert.equal(stage(sample,'move.nonplayer').thrownCalls,1);assert.equal(p.unmeasured.filter(label=>label==='clock').length,1);readThrows=true;p.beginFrame();assert.equal(f.game.move(f.player,0,0),f.result);p.endFrame();}finally{p.stop();}assert.deepEqual(descriptors(f.game),before);
 for(const action of ['reenter','stop']){
  const g=fixture(),original=descriptors(g.game);let clock=0,armed=false,profile;
  profile=createMovementProfile({read:()=>({game:g.game}),mode:'wall',now(){if(armed){armed=false;if(action==='reenter')assert.equal(g.game.move(g.npc,0,0),g.result);else profile.stop();}return++clock;}});
  try{profile.beginFrame();armed=true;assert.equal(g.game.move(g.player,1,2),g.result);const sample=profile.endFrame();if(action==='reenter'){assert.equal(stage(sample,'move.player').calls,1);assert.equal(stage(sample,'move.nonplayer').calls,1);assert.equal(stage(sample,'blocked.player').calls,1);assert.equal(stage(sample,'blocked.nonplayer').calls,1);}assert.equal(g.seen.length,action==='reenter'?4:2);}finally{profile.stop();}assert.deepEqual(descriptors(g.game),original);
 }
 const cancelled=fixture(),cancelledBefore=descriptors(cancelled.game);let cancelledProfile;
 cancelledProfile=createMovementProfile({read(){cancelledProfile.stop();return{game:cancelled.game};}});assert.equal(cancelledProfile.beginFrame(),null);assert.deepEqual(descriptors(cancelled.game),cancelledBefore,'read-time stop cannot install late hooks');assert.deepEqual(cancelledProfile.samples,[]);
 const replacement=fixture(),replacementBefore=descriptors(replacement.game);let reentrant,reads=0;
 reentrant=createMovementProfile({read(){if(++reads===1){reentrant.endFrame({cancelled:true});reentrant.beginFrame({replacement:true});return{game:f.game};}return{game:replacement.game};}});
 try{reentrant.beginFrame();replacement.game.move(replacement.player,0,0);const next=reentrant.endFrame();assert.equal(next.replacement,true);assert.equal(stage(next,'move.player').calls,1);assert.deepEqual(descriptors(f.game),before,'late outer read cannot replace a newer owner');}finally{reentrant.stop();}assert.deepEqual(descriptors(replacement.game),replacementBefore);
});

function runtimeState(game){
 const snapshot=game.snapshot();assert.ok(snapshot,'fixture must produce a real valid checkpoint');
 const data={};for(const [key,descriptor]of Object.entries(descriptors(game)))if('value'in descriptor&&typeof descriptor.value!=='function')data[key]=descriptor.value;
 return structuredClone({snapshot,data,random:game.random.getState(),visualRandom:game.visualRandom.getState()});
}

test('real original Game ticks preserve checkpoints, navigation/runtime, events and both RNGs in counts and wall modes',()=>{
 const prototypeBefore=descriptors(Game.prototype);
 for(const [seed,weapon]of [[774,'nailgun'],[4168,'shotgun']])for(const mode of ['counts','wall']){
  const baseline=new Game({seed,weapon}),observed=new Game({seed,weapon}),before=descriptors(observed),initialRandom=observed.random.getState(),initialVisual=observed.visualRandom.getState();
  assert.deepEqual(runtimeState(observed),runtimeState(baseline));let clocks=0;
  const p=createMovementProfile({read:()=>({game:observed}),mode,now:()=>++clocks}),baselineEvents=[],observedEvents=[];
  try{
   for(let i=0;i<40;i++){
    const command=Object.freeze({moveX:i%12<6?.3:-.3,moveY:.15,shoot:i%3===0,aimX:baseline.player.x+350,aimY:baseline.player.y-180,dash:i===0,lure:i===6,molotov:i===10});
    p.beginFrame({callback:i});baseline.tick(.05,command);observed.tick(.05,command);const sample=p.endFrame();assert.ok(stage(sample,'move.player').calls>0);assert.ok(stage(sample,'move.nonplayer').calls>0);
    if(i%8===7){baselineEvents.push(...baseline.drainEvents());observedEvents.push(...observed.drainEvents());assert.deepEqual(runtimeState(observed),runtimeState(baseline));}
   }
   baselineEvents.push(...baseline.drainEvents());observedEvents.push(...observed.drainEvents());assert.deepEqual(observedEvents,baselineEvents);assert.ok(observedEvents.length>0);assert.deepEqual(runtimeState(observed),runtimeState(baseline));assert.equal(observed.state,'playing');assert.equal(p.samples.length,40);
   assert.notEqual(observed.random.getState(),initialRandom);assert.notEqual(observed.visualRandom.getState(),initialVisual);assert.equal(clocks,mode==='counts'?0:p.samples.reduce((sum,sample)=>sum+sumCalls(sample)*2,0));noReferences(p.samples,new Set([observed,observed.player,...observed.enemies,observed.navigation,observed.world]));
  }finally{p.stop();}
  for(const key of ['move','blocked'])assert.deepEqual(Object.getOwnPropertyDescriptor(observed,key),before[key]);assert.deepEqual(descriptors(Game.prototype),prototypeBefore);
 }
});

test('enabled is normalized with plain truthiness without retaining or coercing flags, and default boolean reports match the frozen whole-module oracle',async()=>{
 const game=new Game({seed:774,weapon:'nailgun'}),gameBefore=descriptors(game),checkpoint=game.snapshot();assert.ok(checkpoint);
 let coercions=0;
 const hostile=Object.create(null);
 for(const key of [Symbol.toPrimitive,'valueOf','toString'])Object.defineProperty(hostile,key,{get(){coercions++;throw Error('enabled must never read coercion methods');},configurable:true});
 const callable=function(){assert.fail('enabled function must never be called');};
 const truthy=[game,hostile,callable,{},[],new Boolean(false),'false','0',1,-1,Infinity,1n,Symbol('enabled')];
 for(const enabled of [...truthy,undefined]){
  let reads=0,clocks=0;
  const profile=createMovementProfile({enabled,mode:'wall',read(){reads++;return{game};},now:()=>++clocks});
  try{assert.ok(profile.beginFrame({actual:true}));game.move(game.player,0,0);const frame=profile.endFrame();assert.equal(stage(frame,'move.player').calls,1);assert.equal(stage(frame,'blocked.player').calls,1);const report=profile.stop();assert.equal(report.enabled,true,'objects are truthy, including Boolean(false); undefined uses the true default');assert.equal(reads,1);assert.equal(clocks,4);noReferences(report,new Set([enabled,game,game.player,game.navigation,game.world]));assert.equal(coercions,0);}finally{profile.stop();}
  assert.deepEqual(descriptors(game),gameBefore);assert.deepEqual(game.snapshot(),checkpoint);
 }
 for(const enabled of [false,null,0,-0,NaN,'',0n]){
  let reads=0,clocks=0,metadataReads=0;
  const metadata={get ignored(){metadataReads++;throw Error('disabled metadata');}};
  const profile=createMovementProfile({enabled,mode:'wall',read(){reads++;return{game};},now(){clocks++;throw Error('disabled clock');}});
  assert.equal(profile.beginFrame(metadata),null);assert.equal(profile.endFrame(metadata),null);const report=profile.stop();assert.equal(report.enabled,false);assert.deepEqual(report.samples,[]);assert.deepEqual(report.unmeasured,[]);assert.equal(reads,0);assert.equal(clocks,0);assert.equal(metadataReads,0);noReferences(report,new Set([game,game.player,game.navigation,game.world,metadata]));assert.deepEqual(descriptors(game),gameBefore);
 }
 assert.equal(coercions,0);
 const beforeBytes=await readFile(new URL('../../../qa/movement-cost-20261018/movement-profile-before-flag-normalization.txt',import.meta.url));
 assert.equal(beforeBytes.byteLength,7919);assert.equal(createHash('sha256').update(beforeBytes).digest('hex'),'22c97e18eebb5590c2e5c97e63269163f55156898804d3b5b5bbb2d813bcba7f');
 const original=await import('data:text/javascript;base64,'+beforeBytes.toString('base64'));
 function run(factory,enabled){
  const f=fixture(),before=descriptors(f.game);let reads=0,clocks=0,metadataReads=0;
  const options={read(){reads++;return{game:f.game};},mode:'wall',now:()=>++clocks};if(enabled!=='default')options.enabled=enabled;
  const profile=factory(options),meta={callback:7,get ignored(){metadataReads++;throw Error('metadata access');}};
  try{profile.beginFrame(meta);assert.equal(f.game.move(f.player,1,2),f.result);assert.equal(f.game.move(f.npc,3,4),f.result);assert.equal(f.game.blocked(1,2,3),false);assert.throws(()=>f.game.move(f.npc,0,0,'throw'),error=>error===f.failure);profile.endFrame({completed:true});const report=profile.stop();assert.deepEqual(descriptors(f.game),before);assert.equal(metadataReads,0);return{report,reads,clocks,trace:f.seen.map(({name,receiver,args})=>({name,receiver:receiver===f.game?'owner':'foreign',args:args.map(value=>value===f.player?'player':value===f.npc?'npc':value)}))};}finally{profile.stop();}
 }
 for(const enabled of ['default',true,false])assert.deepEqual(run(createMovementProfile,enabled),run(original.createMovementProfile,enabled),'full-module original trace/report remains exact for '+enabled);
});
