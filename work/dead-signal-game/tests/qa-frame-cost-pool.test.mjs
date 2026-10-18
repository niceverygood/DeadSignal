import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const originalBytes=await readFile(new URL('../../../qa/frame-observer-20261018/frame-cost-profile-before-pool.txt',import.meta.url));
assert.equal(createHash('sha256').update(originalBytes).digest('hex'),'3b2f3774d703f84952c501f85b001d169e6fbbda024d407478bd989539026cce','the oracle is the pinned complete original observer');
const candidateBytes=await readFile(new URL('../../../qa/frame-observer-20261018/frame-cost-profile-pool-candidate.txt',import.meta.url));
assert.equal(createHash('sha256').update(candidateBytes).digest('hex'),'83926473a1962e533ca630ed7d7f9266b89bbfd136724993b818a8af49ab7584','the rejected pool candidate is pinned as a QA artifact');
const productionBytes=await readFile(new URL('../dist/qa-frame-cost-profile.js',import.meta.url));
assert.equal(productionBytes.equals(originalBytes),true,'the default observer remains byte-exact original; the pool candidate is QA-only');
const originalSource=originalBytes.toString('utf8'),candidateSource=candidateBytes.toString('utf8');
const testExports='\nexport {subscribe as __testSubscribe}; export const __testSlot=(object,key)=>methodSlots.get(object)?.get(key);\n';
const load=(source,label,extra='')=>import('data:text/javascript;base64,'+Buffer.from(source+testExports+extra+'\n// '+label).toString('base64'));
const original=await load(originalSource,'original'),candidate=await load(candidateSource,'candidate');
const RESULT=Object.freeze({originalResult:true}),PROMISE=Promise.resolve(RESULT),MARKER=Error('original-method-error'),ARG=Object.freeze({originalArgument:true});
const descriptors=object=>Object.getOwnPropertyDescriptors(object);
const baked={id:'registered-walker',metadata:{format:'meshy-iso-sprite-atlas'}},native={id:'native-walker',metadata:{liveRig:true}},unknown={id:'unknown',metadata:{}};

function fixture(count=3){
  const calls=[],rawCalls=[],names=new WeakMap();let currentGame,assignedFloor=null;
  const name=(object,label)=>(names.set(object,label),object);
  const record=(label,receiver,args)=>{rawCalls.push({label,receiver,args});calls.push([label,names.get(receiver)??'foreign',args.map(value=>names.get(value)??value)]);};
  const navigation=name({revision:0,grids:new Map(),
    _sync(...args){record('_sync',this,args);return RESULT;},
    _grid(radius){record('_grid',this,[radius]);if(!this.grids.has(radius))this.grids.set(radius,{fields:new Map()});return this.grids.get(radius);},
    _field(grid,target){record('_field',this,[grid,target]);grid.fields.set('original-target',{});return RESULT;},
    _nearest(...args){record('_nearest',this,args);return RESULT;},
    _approachBlocked(...args){record('_approachBlocked',this,args);return RESULT;},
    direction(...args){record('direction',this,args);this._sync();const grid=this._grid(14);this._nearest(ARG,grid);this._field(grid,ARG);this._approachBlocked(ARG,ARG,14);return RESULT;},
  },'navigation');
  const game=name({navigation},'game');
  for(const key of ['updateMolotovs','updateBullets','updateEnemies','updatePickups','updateEffects','spawnEnemy','shoot'])game[key]=function(...args){record(key,this,args);if(key==='updateEnemies')for(let i=0;i<count;i++)this.navigation.direction(ARG,ARG,14);return RESULT;};
  const gl=name({render(...args){record('gl.render',this,args);return RESULT;}},'gl'),body=name({getImageData(...args){record('body.getImageData',this,args);return RESULT;}},'body');
  const player=name({renderer:gl,bodyContext:body,frame(...args){record('frame',this,args);return this.rasterFrame(...args);},rasterFrame(...args){record('rasterFrame',this,args);this.renderer.render(ARG,ARG);this.bodyContext.getImageData(0,0,256,256);return RESULT;}},'player');
  const art=name({drawFrame(...args){record('drawFrame',this,args);if(args[1]===MARKER)throw MARKER;return args[1]===PROMISE?PROMISE:args[1]===false?false:RESULT;}},'art');
  const renderer=name({livePlayer:player,productionArt:art,floor:null,
    makeFloor(...args){record('makeFloor',this,args);this.floor??=name({originalFloor:true},'floor');assignedFloor??=this.floor;return RESULT;},
    nativePlayerFrame(...args){record('nativePlayerFrame',this,args);return this.livePlayer.frame(...args);},
    drawPlayer(...args){record('drawPlayer',this,args);this.nativePlayerFrame(...args);return this.productionArt.drawFrame(...args);},
    drawEnemy(...args){record('drawEnemy',this,args);this.nativeEnemyFrame(...args);return this.drawNativeEnemy(...args);},
    drawNativeEnemy(...args){record('drawNativeEnemy',this,args);return this.productionArt.drawFrame(...args);},
    nativeEnemyFrame(...args){record('nativeEnemyFrame',this,args);return RESULT;},
  },'renderer');
  for(const key of ['drawObstacle','drawDecor','drawCampaignBoss','drawNativeCorpse'])renderer[key]=function(...args){record(key,this,args);return this.productionArt.drawFrame(...args);};
  for(const key of ['prepareNativeEnemyBatch','drawMinimap','nativeCorpseFrame','drawCorpse','drawParticle'])renderer[key]=function(...args){record(key,this,args);return RESULT;};
  currentGame=game;
  return{calls,rawCalls,register:name,assignedFloor:()=>assignedFloor,renderer,game,navigation,player,art,gl,body,objects:[renderer,game,navigation,player,art,gl,body],read:()=>({game:currentGame}),setGame:next=>{currentGame=next;},
    run(){for(const key of ['updateMolotovs','updateBullets','updateEnemies','updatePickups','updateEffects','spawnEnemy','shoot'])assert.equal(game[key](.05,ARG),RESULT);
      assert.equal(renderer.makeFloor(ARG),RESULT);renderer.prepareNativeEnemyBatch(ARG);renderer.drawPlayer(ARG,native);
      for(let i=0;i<count;i++)assert.equal(renderer.drawEnemy(ARG,i%3===0?native:i%3===1?baked:unknown),RESULT);
      for(const key of ['drawObstacle','drawDecor','drawCampaignBoss','drawNativeCorpse'])renderer[key](ARG,baked);
      for(const key of ['drawMinimap','nativeCorpseFrame','drawCorpse','drawParticle'])renderer[key](ARG,ARG);
      return RESULT;},
  };
}

function dense(module,count){
  const f=fixture(count),before=f.objects.map(descriptors);let clock=0;
  const p=module.createFrameCostProfile({renderer:f.renderer,read:f.read,now:()=>clock+=.125});
  for(let frame=0;frame<3;frame++){p.beginFrame({frame});assert.equal(f.run(),RESULT);p.endFrame({path:'original-calls'});}
  const next=fixture(2);f.setGame(next.game);f.renderer.livePlayer=next.player;f.renderer.productionArt=next.art;
  p.beginFrame({frame:3});next.game.updateEnemies(.05,ARG);f.renderer.drawPlayer(ARG,native);p.endFrame();
  assert.deepEqual(descriptors(f.game),before[1]);assert.deepEqual(descriptors(f.navigation),before[2]);
  const report=p.stop();assert.equal(p.stop(),report);assert.equal(p.beginFrame(),null);assert.equal(p.endFrame(),null);
  // Owner replacements are original fixture writes, not observer shadows.
  for(const [i,object]of f.objects.entries())if(i!==0)assert.deepEqual(descriptors(object),before[i]);
  assert.equal(Object.hasOwn(f.renderer,'drawEnemy'),true);
  assert.equal(f.renderer.drawEnemy,before[0].drawEnemy.value);
  return{report,calls:f.calls,nextCalls:next.calls};
}

test('60/180 observed actor fixtures retain original exact reports, labels, nested calls, cold caches and owner identities',()=>{
  for(const count of [60,180]){
    const expected=dense(original,count),actual=dense(candidate,count);
    assert.deepEqual(actual,expected);
    assert.equal(actual.report.samples[0].stages['renderer.drawEnemy'].calls,count);
    assert.equal(actual.report.samples[0].stages['production.drawFrame.enemy'].calls,count);
    assert.equal(actual.report.samples[0].stages['navigation._grid'].coldCalls,1);
    assert.equal(actual.report.samples[1].stages['navigation._grid'].coldCalls,0);
    assert.notEqual(actual.report.samples[2].resourcesAfter.gameId,actual.report.samples[3].resourcesAfter.gameId);
  }
});

function failures(module){
  const f=fixture(),before=descriptors(f.art);let metadataReads=0,clock=0;
  const p=module.createFrameCostProfile({renderer:f.renderer,read:f.read,now(){if(++clock%3===0)throw Error('clock');return clock%5===0?NaN:clock;}});
  const selected=f.register({id:'getter-selection',get metadata(){metadataReads++;throw Error('metadata must stay unread');}},'getter-selection');
  const metadataGetter=Object.getOwnPropertyDescriptor(selected,'metadata').get;
  p.beginFrame();assert.equal(f.renderer.drawEnemy(ARG,selected),RESULT);assert.equal(f.renderer.drawEnemy(ARG,PROMISE),PROMISE);
  assert.throws(()=>f.renderer.drawEnemy(ARG,MARKER),error=>error===MARKER);assert.equal(f.renderer.drawEnemy(ARG,false),false);
  const foreign={};assert.equal(f.art.drawFrame.call(foreign,ARG,selected),RESULT);assert.equal(f.calls.at(-1)[1],'foreign');
  p.endFrame();const report=p.stop();assert.equal(metadataReads,0);assert.deepEqual(descriptors(f.art),before);
  const selectedCalls=f.rawCalls.filter(call=>call.label==='drawFrame'&&call.args[1]===selected);
  assert.equal(selectedCalls.length,2);assert.equal(selectedCalls[0].receiver,f.art);assert.equal(selectedCalls[1].receiver,foreign);
  for(const call of selectedCalls){assert.equal(call.args.length,2);assert.equal(call.args[0],ARG);assert.equal(call.args[1],selected,'the original getter-bearing argument retains exact identity');}
  assert.equal(Object.getOwnPropertyDescriptor(selected,'metadata').get,metadataGetter,'the original getter itself is unchanged and never read');
  const readonly={};Object.defineProperty(readonly,'drawObstacle',{value(){return RESULT;},configurable:false,writable:false});
  let getter=0;Object.defineProperty(readonly,'drawDecor',{get(){getter++;throw MARKER;},configurable:true});
  const d=descriptors(readonly),q=module.createFrameCostProfile({renderer:readonly,read(){throw MARKER;},now:()=>0});q.beginFrame();q.endFrame();const missing=q.stop();assert.equal(getter,0);assert.deepEqual(descriptors(readonly),d);
  const hostile=new Proxy({}, {get(){throw MARKER;},getOwnPropertyDescriptor(){throw MARKER;}}),off=module.createFrameCostProfile({renderer:hostile,enabled:false,read(){throw MARKER;},now(){throw MARKER;}});
  assert.equal(off.beginFrame(hostile),null);assert.equal(off.endFrame(hostile),null);assert.deepEqual(off.stop().samples,[]);assert.deepEqual(off.unmeasured,[]);
  return{report,missing,calls:f.calls};
}
test('original returns, Promise/throw identity, receiver/args, descriptors, missing stages and broken clocks remain exact',()=>assert.deepEqual(failures(candidate),failures(original)));

function overlapping(module,order){
  const f=fixture(4),before=f.objects.map(descriptors);let clock=0;
  const profiles=[0,1].map(index=>module.createFrameCostProfile({renderer:f.renderer,read:f.read,now:()=>clock+=.25}));
  profiles.forEach(p=>p.beginFrame());f.run();profiles.forEach(p=>p.endFrame());profiles[order[0]].stop();
  const remaining=profiles[order[1]];remaining.beginFrame();f.run();remaining.endFrame();remaining.stop();
  assert.equal(before[0].floor.value,null);assert.equal(f.renderer.floor,f.assignedFloor(),'the floor object is exactly the one assigned by the original makeFloor call');assert.equal(f.renderer.floor.originalFloor,true);
  const expectedRenderer={...before[0],floor:{...before[0].floor,value:f.assignedFloor()}};
  f.objects.forEach((object,index)=>assert.deepEqual(descriptors(object),index===0?expectedRenderer:before[index]));
  return{reports:profiles.map(p=>p.stop()),calls:f.calls};
}
test('overlapping profiles stop in either order and restore every exact owner method descriptor',()=>{
  for(const order of [[0,1],[1,0]])assert.deepEqual(overlapping(candidate,order),overlapping(original,order));
});

function dispatchCases(module){
  const trace=[],receiver={},argument={},result={};let nested=false,releaseB,releaseC;
  const method=function(value){trace.push(['original',this===receiver,value===argument]);if(!nested){nested=true;assert.equal(object.run.call(receiver,argument),result);}return result;};
  const object={run:method},before=descriptors(object);
  const listener=label=>({enter(self,args){assert.equal(self,receiver);assert.equal(args[0],argument);trace.push(['enter',label]);return label;},leave(token,value,threw,self,args){trace.push(['leave',token,value===result,threw,self===receiver,args[0]===argument]);}});
  const c=listener('C'),leaveC=c.leave;c.leave=function(...args){leaveC(...args);throw MARKER;};
  const a=listener('A');a.enter=function(self,args){trace.push(['enter','A']);releaseB?.();releaseC??=module.__testSubscribe(object,'run',c);return'A';};
  const releaseA=module.__testSubscribe(object,'run',a);releaseB=module.__testSubscribe(object,'run',listener('B'));
  const releaseThrow=module.__testSubscribe(object,'run',{enter(){trace.push(['enter-throws']);throw MARKER;},leave(){assert.fail('a failed enter must not be paired with leave');}});
  assert.equal(object.run.call(receiver,argument),result);releaseA();releaseB();releaseC();releaseThrow();assert.deepEqual(descriptors(object),before);
  object.run=function(){throw MARKER;};const throwingBefore=descriptors(object),releaseThrowingMethod=module.__testSubscribe(object,'run',listener('throwing-method'));
  assert.throws(()=>object.run.call(receiver,argument),error=>error===MARKER);releaseThrowingMethod();assert.deepEqual(descriptors(object),throwingBefore);
  const applied=function(){throw Error('must use the existing custom apply property');};
  applied.apply=function(self,args){trace.push(['custom.apply',this===applied,self===receiver,args[0]===argument]);return result;};
  object.run=applied;const customBefore=descriptors(object),release=module.__testSubscribe(object,'run',listener('custom'));
  assert.equal(object.run.call(receiver,argument),result);release();assert.deepEqual(descriptors(object),customBefore);
  const external=function(){return PROMISE;},releaseExternal=module.__testSubscribe(object,'run',listener('external'));
  Object.defineProperty(object,'run',{value:external,configurable:true,writable:false,enumerable:false});releaseExternal();
  assert.equal(object.run,external);assert.equal(Object.getOwnPropertyDescriptor(object,'run').writable,false);
  return trace;
}
test('recursive same-slot dispatch, live listener removal/addition, custom original.apply and external replacement match the original',()=>assert.deepEqual(dispatchCases(candidate),dispatchCases(original)));

function clockLifecycle(module,mode){
  const f=fixture(2);let clock=0,actionDone=false,p,nestedResult;
  const now=()=>{
    clock+=.125;
    if(clock===(mode==='recursive-leave'?.5:.25)&&!actionDone){actionDone=true;
      if(mode==='recursive'||mode==='recursive-leave')nestedResult=f.renderer.drawEnemy(ARG,baked);
      else if(mode==='rotate-frame'){p.endFrame({fromClock:true});p.beginFrame({fromClock:true});}
      else if(mode==='stop')p.stop();
      else if(mode==='throw')throw MARKER;
    }
    return clock;
  };
  p=module.createFrameCostProfile({renderer:f.renderer,read:f.read,now});const opened=p.beginFrame({originalFrame:true});
  assert.equal(f.renderer.drawEnemy(ARG,native),RESULT);p.endFrame();const report=p.stop();
  if(mode==='recursive'||mode==='recursive-leave')assert.equal(nestedResult,RESULT);
  return{opened,report,calls:f.calls};
}
test('observer-clock recursion, frame rotation, stop and throw preserve frame capture and original lifecycle reports',()=>{
  for(const mode of ['recursive','recursive-leave','rotate-frame','stop','throw'])assert.deepEqual(clockLifecycle(candidate,mode),clockLifecycle(original,mode),mode);
});

function readLifecycle(module,mode){
  const f=fixture(2);let p,clock=0,fired=false,error=null;
  const read=()=>{
    if(!fired){fired=true;
      if(mode==='recursive')assert.equal(f.renderer.drawEnemy(ARG,baked),RESULT);
      else if(mode==='rotate-frame'){p.endFrame({fromRead:true});p.beginFrame({fromRead:true});}
      else if(mode==='stop')p.stop();
      else if(mode==='throw')throw MARKER;
    }
    return{game:f.game};
  };
  p=module.createFrameCostProfile({renderer:f.renderer,read,now:()=>clock+=.125});
  try{p.beginFrame({originalFrame:true});}catch(thrown){error={name:thrown.name,message:thrown.message};}
  assert.equal(f.renderer.drawEnemy(ARG,native),RESULT);p.endFrame();return{error,report:p.stop(),calls:f.calls};
}
test('read callbacks that recurse, rotate frames, stop or throw keep the original lifecycle and error behavior',()=>{
  for(const mode of ['recursive','rotate-frame','stop','throw'])assert.deepEqual(readLifecycle(candidate,mode),readLifecycle(original,mode),mode);
});

test('QA-only factory capture proves steady reuse, bounded idle pools and clearing of every inactive reference',async()=>{
  const needle='const freeTokens=[];';assert.equal(candidateSource.split(needle).length-1,1,'the only lexical token freelist creation is explicit');
  const capturedSource='const __testFreeTokenPools=[];\n'+candidateSource.replace(needle,needle+'__testFreeTokenPools.push(freeTokens);');
  const extra=`
const __testCreated={scopes:[],records:[],tokens:[]};
const __scopeFactory=makeDispatchScope,__recordFactory=makeDispatchRecord,__tokenFactory=makeObservationToken;
makeDispatchScope=function(){const value=__scopeFactory();__testCreated.scopes.push(value);return value;};
makeDispatchRecord=function(){const value=__recordFactory();__testCreated.records.push(value);return value;};
makeObservationToken=function(){const value=__tokenFactory();__testCreated.tokens.push(value);return value;};
export {__testCreated,__testFreeTokenPools};`;
  const instrumented=await load(capturedSource,'candidate-factory-capture',extra),f=fixture(180);let clock=0;
  const p=instrumented.createFrameCostProfile({renderer:f.renderer,read:f.read,now:()=>clock+=.125});
  p.beginFrame({frame:0});f.run();p.endFrame({path:'original-calls'});
  const counts=()=>Object.fromEntries(Object.entries(instrumented.__testCreated).map(([key,values])=>[key,values.length]));
  const cold=counts();p.beginFrame({frame:1});f.run();p.endFrame({path:'original-calls'});assert.deepEqual(counts(),cold,'ordinary steady calls allocate no further dispatcher scopes, pair records or observation tokens');
  const expected=dense(candidate,180).report.samples.slice(0,2);assert.deepEqual(p.samples,expected,'factory capture itself does not change fakeclock reports');
  p.stop();
  const originalNeedles=['const entered=[];','entered.push([observer,observer.enter(this,args)]);','const token={frame:current,start:clock(),name,extra:null};'];
  for(const text of originalNeedles)assert.equal(originalSource.split(text).length-1,1,'the original allocation counter injection is exact: '+text);
  const countedOriginal='const __testCreated={scopes:[],records:[],tokens:[]};function __testPair(pair){__testCreated.records.push(pair);return pair;}\n'+originalSource
    .replace(originalNeedles[0],originalNeedles[0]+'__testCreated.scopes.push(entered);')
    .replace(originalNeedles[1],'entered.push(__testPair([observer,observer.enter(this,args)]));')
    .replace(originalNeedles[2],originalNeedles[2]+'__testCreated.tokens.push(token);');
  const old=await load(countedOriginal,'original-allocation-capture','export {__testCreated};'),oldFixture=fixture(180);let oldClock=0;
  const oldProfile=old.createFrameCostProfile({renderer:oldFixture.renderer,read:oldFixture.read,now:()=>oldClock+=.125});
  oldProfile.beginFrame({frame:0});oldFixture.run();oldProfile.endFrame({path:'original-calls'});
  const oldCold=Object.fromEntries(Object.entries(old.__testCreated).map(([key,values])=>[key,values.length]));
  oldProfile.beginFrame({frame:1});oldFixture.run();oldProfile.endFrame({path:'original-calls'});
  assert.deepEqual(oldProfile.samples,dense(original,180).report.samples.slice(0,2),'original literal allocation capture does not change reports');
  for(const [key,values]of Object.entries(old.__testCreated))assert.ok(values.length-oldCold[key]>=180,'the original allocates new '+key+' during the same steady calls');
  oldProfile.stop();
  const recursive=fixture(1),drawEnemy=recursive.renderer.drawEnemy;let recursiveDepth=0,recursiveClock=0;
  recursive.renderer.drawEnemy=function(...args){if(recursiveDepth<7){recursiveDepth++;this.drawEnemy(...args);recursiveDepth--;}return drawEnemy.apply(this,args);};
  const recursiveProfile=instrumented.createFrameCostProfile({renderer:recursive.renderer,read:recursive.read,now:()=>recursiveClock+=.125});
  recursiveProfile.beginFrame();assert.equal(recursive.renderer.drawEnemy(ARG,baked),RESULT);recursiveProfile.endFrame();recursiveProfile.stop();
  // More simultaneous subscribers/depth than either idle cap must stay correct
  // without allowing an active lease to be reused by a recursive invocation.
  let depth=0;const object={run(){if(depth<7){depth++;this.run();depth--;}return RESULT;}};
  const releases=Array.from({length:20},(_,index)=>instrumented.__testSubscribe(object,'run',{enter(){return{index};},leave(){}}));
  const slot=instrumented.__testSlot(object,'run');assert.equal(object.run(),RESULT);
  assert.ok(slot.freeScopes.length<=4);for(const scope of slot.freeScopes){assert.equal(scope.count,0);assert.ok(scope.records.length<=16);}
  releases.forEach(release=>release());assert.equal(instrumented.__testSlot(object,'run'),undefined);
  for(const scope of instrumented.__testCreated.scopes){assert.equal(scope.count,0);assert.ok(scope.records.length<=16);}
  for(const record of instrumented.__testCreated.records){assert.equal(record.observer,null);assert.equal(record.token,null);}
  for(const token of instrumented.__testCreated.tokens)for(const key of ['frame','start','name','extra'])assert.equal(token[key],null,'inactive token clears '+key);
  for(const pool of instrumented.__testFreeTokenPools)assert.ok(pool.length<=4);
});
