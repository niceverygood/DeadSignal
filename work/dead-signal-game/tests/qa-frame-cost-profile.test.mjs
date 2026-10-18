import test from 'node:test';
import assert from 'node:assert/strict';
import {Navigation} from '../dist/navigation.js';
import {ProductionArt} from '../dist/production-art.js';
import {createFrameCostProfile,FRAME_COST_PROFILE_NOTE} from '../dist/qa-frame-cost-profile.js';

const descriptors=object=>Object.getOwnPropertyDescriptors(object);
function assertMethodsRestored(object,before,label){
 assert.deepEqual(Reflect.ownKeys(object),Reflect.ownKeys(before),label+' leaves no instance shadows');
 for(const [key,descriptor] of Object.entries(before))if(typeof descriptor.value==='function'||!('value'in descriptor))assert.deepEqual(Object.getOwnPropertyDescriptor(object,key),descriptor,label+' restores '+key);
}
function fixture(){
 const calls=[],result=Object.freeze({pixels:'original-256-pixels',placement:'unchanged'}),world={width:240,height:240,obstacles:[]},navigation=new Navigation(world);
 const record=(name,receiver,args)=>calls.push({name,receiver,args});
 const game={navigation,value:0,
  updateMolotovs(...args){record('molotovs',this,args);this.value++;return result;},
  updateBullets(...args){record('bullets',this,args);return result;},
  updateEnemies(...args){record('enemies',this,args);this.navigation._sync();const grid=this.navigation._grid(18),from={x:72,y:72},target={x:168,y:168};this.navigation._nearest(from,grid);this.navigation._field(grid,target,0);this.navigation.direction(from,target,18);this.navigation._approachBlocked(from,target,18);return result;},
  updatePickups(...args){record('pickups',this,args);return result;},
  updateEffects(...args){record('effects',this,args);return result;},
  spawnEnemy(...args){record('spawn',this,args);return result;},
  shoot(...args){record('shoot',this,args);return result;}
 };
 const gl={render(...args){record('playerGL',this,args);return result;}},bodyContext={getImageData(...args){record('bodyRead',this,args);return result;}};
 const player={renderer:gl,bodyContext,frame(...args){record('playerFrame',this,args);return this.rasterFrame(...args);},rasterFrame(...args){record('rasterFrame',this,args);this.renderer.render('original-scene','original-camera');this.bodyContext.getImageData(0,0,256,256);this.renderer.render('original-scene','original-camera');return result;}};
 const renderer={livePlayer:player,floor:null,
  makeFloor(...args){record('makeFloor',this,args);this.floor??={originalFloor:true};return result;},
  nativePlayerFrame(...args){record('nativePlayer',this,args);return this.livePlayer.frame(...args);},
  drawPlayer(...args){record('drawPlayer',this,args);return this.nativePlayerFrame(...args);},
  drawObstacle(...args){record('drawObstacle',this,args);return result;},
  drawDecor(...args){record('drawDecor',this,args);return result;},
  prepareNativeEnemyBatch(...args){record('enemyBatch',this,args);return result;},
  drawMinimap(...args){record('minimap',this,args);return result;},
  drawEnemy(...args){record('drawEnemy',this,args);return this.drawNativeEnemy(...args);},
  drawNativeEnemy(...args){record('drawNativeEnemy',this,args);return this.nativeEnemyFrame(...args);},
  nativeEnemyFrame(...args){record('nativeEnemy',this,args);return result;},
  nativeCorpseFrame(...args){record('nativeCorpse',this,args);return result;},
  drawCorpse(...args){record('drawCorpse',this,args);return result;},
  drawParticle(...args){record('drawParticle',this,args);return result;}
 };
 function frame(){for(const key of ['updateMolotovs','updateBullets','updateEnemies','updatePickups','updateEffects','spawnEnemy','shoot'])assert.equal(game[key](.05,'original-input'),result);renderer.prepareNativeEnemyBatch(game);renderer.makeFloor(game);renderer.drawObstacle('context','obstacle',game);renderer.drawDecor('context','decor',0,game);assert.equal(renderer.drawPlayer('context','actor',game),result);renderer.drawMinimap('context',game);for(const key of ['drawEnemy','nativeCorpseFrame','drawCorpse','drawParticle'])assert.equal(renderer[key]('context','original-actor',game),result);return result;}
 return{calls,result,game,navigation,world,renderer,player,gl,bodyContext,frame};
}
const simplified=calls=>calls.map(({name,args})=>({name,args:args.map(value=>typeof value==='object'?'object':value)}));

test('instance-only observation preserves original outputs and calls, records real Navigation cold work and existing player reads without initiating any work',()=>{
 const baseline=fixture();baseline.frame();baseline.frame();const expected=simplified(baseline.calls);
 const f=fixture(),objects=[f.renderer,f.game,f.navigation,f.player,f.gl,f.bodyContext],before=objects.map(descriptors),navPrototype=descriptors(Navigation.prototype);let time=0,reads=0;
 const p=createFrameCostProfile({renderer:f.renderer,read(){reads++;return{game:f.game};},now:()=>time+=.125});
 assert.equal(reads,0);assert.deepEqual(f.calls,[]);assert.deepEqual(descriptors(Navigation.prototype),navPrototype,'no prototype hooks');
 p.beginFrame({callback:0});assert.equal(f.frame(),f.result);const first=p.endFrame({path:'actual-original-calls'});
 p.beginFrame({callback:1});f.frame();const second=p.endFrame();
 assert.equal(reads,2);assert.deepEqual(simplified(f.calls),expected);assert.equal(f.game.value,baseline.game.value);assert.equal(f.navigation.revision,baseline.navigation.revision);
 assert.deepEqual([...f.navigation.grids.keys()],[...baseline.navigation.grids.keys()]);
 assert.deepEqual([...f.navigation.grids.get(18).fields.keys()],[...baseline.navigation.grids.get(18).fields.keys()]);
 assert.equal(first.path,'actual-original-calls');assert.equal(first.observations.gameFirstObserved,true);assert.equal(first.observations.navigationFirstObserved,true);assert.equal(first.observations.navigationEmptyAtBegin,true);
 assert.equal(second.observations.gameFirstObserved,false);assert.equal(second.observations.navigationEmptyAtBegin,false);
 assert.equal(first.stages['navigation._grid'].coldCalls,1);assert.equal(second.stages['navigation._grid'].coldCalls,0);
 for(const key of ['direction','_sync','_grid','_field','_nearest','_approachBlocked'])assert.ok(first.stages['navigation.'+key].calls>0,key);
 assert.equal(first.stages['navigation._sync'].revisionChanges,0);assert.equal(first.stages['renderer.makeFloor'].identityChanges,1);assert.equal(second.stages['renderer.makeFloor'].identityChanges,0);
 assert.equal(first.stages['player.glSubmit'].calls,2);assert.equal(first.stages['player.bodyReadPixels'].calls,1);
 for(const key of ['frame','rasterFrame'])assert.equal(first.stages['player.'+key].calls,1);
 for(const key of ['drawEnemy','nativeEnemyFrame','drawNativeEnemy','nativeCorpseFrame','drawCorpse','drawParticle'])assert.equal(first.stages['renderer.'+key].calls,1,key+' existing call observed');
 assert.ok(first.stages['simulation.updateEnemies'].cpuMs>first.stages['navigation._grid'].cpuMs,'inclusive stage times remain independent');
 assert.equal(first.resourcesBefore.floorId,null);assert.equal(first.resourcesAfter.floorId,second.resourcesAfter.floorId);assert.equal(first.resourcesAfter.navigation.grids[0].fields,1);assert.equal(first.resourcesAfter.navigation.grids.length,1);
 f.world.obstacles.push({x:190,y:190,w:10,h:10,destroyed:true});p.beginFrame({callback:2});f.navigation._sync();const revised=p.endFrame();assert.equal(revised.stages['navigation._sync'].revisionChanges,1);assert.equal(revised.resourcesAfter.navigation.gridCount,0);
 const stopped=p.stop();assert.equal(stopped.samples,p.samples);assert.equal(stopped.samples.length,3);assert.match(stopped.note,/CPU call wall time/);assert.match(stopped.note,/must not be summed/);assert.match(FRAME_COST_PROFILE_NOTE,/observer overhead/);
 objects.forEach((object,i)=>assertMethodsRestored(object,before[i],i+' exact method descriptors'));assert.deepEqual(descriptors(Navigation.prototype),navPrototype);assert.equal(p.stop(),stopped);assert.equal(p.beginFrame(),null);assert.equal(p.endFrame(),null);
});

test('this/arguments/return, promise and thrown identities survive broken clocks and readonly methods; disabled mode never reads any owner or clock',()=>{
 const marker=Error('original'),value={},promise=Promise.resolve(value),seen=[],prototype={drawPlayer(...args){seen.push({receiver:this,args});if(args[0]==='throw')throw marker;return args[0]==='promise'?promise:value;}},renderer=Object.create(prototype);
 Object.defineProperty(renderer,'drawObstacle',{value(){return value;},writable:false,configurable:false,enumerable:false});
 let getterCalls=0;Object.defineProperty(renderer,'drawDecor',{get(){getterCalls++;return()=>value;},configurable:true});
 const before=descriptors(renderer),p=createFrameCostProfile({renderer,read:()=>({}),now(){throw Error('clock unavailable');}}),receiver={foreign:true};
 assert.equal(getterCalls,0,'accessor methods are not invoked by installation');p.beginFrame();assert.equal(renderer.drawPlayer.call(receiver,'value',7),value);assert.equal(renderer.drawPlayer('promise'),promise);assert.throws(()=>renderer.drawPlayer('throw'),error=>error===marker);assert.equal(renderer.drawObstacle(),value);const frame=p.endFrame();
 assert.equal(frame.stages['renderer.drawPlayer'].calls,3);assert.equal(frame.stages['renderer.drawPlayer'].cpuMs,0);assert.equal(frame.frameCpuMs,0);assert.equal(seen[0].receiver,receiver);assert.deepEqual(seen[0].args,['value',7]);assert.ok(p.unmeasured.includes('renderer.drawObstacle'));assert.ok(p.unmeasured.includes('renderer.drawDecor'));p.stop();assert.deepEqual(descriptors(renderer),before);assert.equal(Object.hasOwn(renderer,'drawPlayer'),false);
 const hostile=new Proxy({}, {get(){throw Error('disabled owner access');},getOwnPropertyDescriptor(){throw Error('disabled descriptor access');}});
 const disabled=createFrameCostProfile({renderer:hostile,read(){throw Error('disabled read');},now(){throw Error('disabled clock');},enabled:false});assert.equal(disabled.beginFrame(hostile),null);assert.equal(disabled.endFrame(hostile),null);assert.deepEqual(disabled.stop().samples,[]);assert.deepEqual(disabled.unmeasured,[]);
});

test('overlap restoration works in either order, owner replacement releases prior hooks and external method replacement is preserved',()=>{
 for(const order of [[0,1],[1,0]]){
  const f=fixture(),before=descriptors(f.renderer);let time=0;const profiles=[0,1].map(()=>createFrameCostProfile({renderer:f.renderer,read:()=>({game:f.game}),now:()=>++time}));
  for(const p of profiles)p.beginFrame();f.renderer.drawPlayer();for(const p of profiles)assert.equal(p.endFrame().stages['player.glSubmit'].calls,2);
  profiles[order[0]].stop();const remaining=profiles[order[1]];remaining.beginFrame();f.renderer.drawPlayer();assert.equal(remaining.endFrame().stages['player.frame'].calls,1);remaining.stop();assert.deepEqual(descriptors(f.renderer),before);
 }
 const a=fixture(),b=fixture(),beforeA=[a.game,a.navigation,a.player,a.gl,a.bodyContext].map(descriptors);let active=a.game,time=0;
 const p=createFrameCostProfile({renderer:a.renderer,read:()=>({game:active}),now:()=>++time});p.beginFrame();a.frame();const first=p.endFrame();
 active=b.game;a.renderer.livePlayer=b.player;p.beginFrame();b.game.updateEnemies();a.renderer.drawPlayer();const next=p.endFrame();
 [a.game,a.navigation,a.player,a.gl,a.bodyContext].forEach((object,i)=>assertMethodsRestored(object,beforeA[i],'old owner restored '+i));
 assert.notEqual(first.resourcesBefore.gameId,next.resourcesBefore.gameId);assert.notEqual(first.resourcesBefore.navigation.id,next.resourcesBefore.navigation.id);assert.notEqual(first.resourcesBefore.playerId,next.resourcesBefore.playerId);assert.equal(next.observations.gameFirstObserved,true);
 const external=function(){return'external';};a.renderer.makeFloor=external;p.stop();assert.equal(a.renderer.makeFloor,external);
});

test('lazy existing player surfaces are attached at first use, navigation replacement and bounded cache snapshots are observational only',()=>{
 const f=fixture(),nextNav=new Navigation({width:240,height:240,obstacles:[]}),firstNav=f.navigation,navBefore=descriptors(firstNav);let time=0;
 f.renderer.livePlayer=null;
 const p=createFrameCostProfile({renderer:f.renderer,read:()=>({game:f.game}),now:()=>++time});p.beginFrame();f.renderer.livePlayer=f.player;f.renderer.drawPlayer();f.game.navigation=nextNav;f.game.updateEnemies();p.endFrame();
 assert.deepEqual(descriptors(firstNav),navBefore,'old nav methods restored on replacement');assert.equal(p.samples[0].stages['player.bodyReadPixels'].calls,1);assert.equal(p.samples[0].resourcesAfter.navigation.id!==p.samples[0].resourcesBefore.navigation.id,true);
 // Snapshot reads only keys and field counts, never arrays, pixels or getContext.
 for(let i=0;i<10;i++)nextNav.grids.set(30+i,{fields:new Map([['original',{}]])});const keys=[...nextNav.grids.keys()];p.beginFrame();const sample=p.endFrame();assert.equal(sample.resourcesBefore.navigation.gridCount,11);assert.equal(sample.resourcesBefore.navigation.grids.length,8);assert.equal(sample.resourcesBefore.navigation.truncated,true);assert.deepEqual([...nextNav.grids.keys()],keys);p.stop();
});

test('actual ProductionArt sprite calls are scoped once to the innermost renderer category and conservatively split into native/baked/unknown without Canvas hooks',()=>{
 let clock=0;const calls=[],art=Object.create(ProductionArt.prototype),artBefore=descriptors(art),prototypeBefore=descriptors(ProductionArt.prototype),context={globalAlpha:1,imageSmoothingEnabled:false,imageSmoothingQuality:'low',save(){calls.push('save');},restore(){calls.push('restore');},drawImage(...args){calls.push(args);clock+=5;}};
 const selected=(id,metadata)=>({id,metadata,image:{original:true},frame:{rect:{x:0,y:0,width:256,height:256}},placement:{x:1,y:2,width:32,height:48}}),baked=selected('registered-walker',{format:'meshy-iso-sprite-atlas'}),native=selected('registered-walker',{format:'meshy-iso-sprite-atlas',liveRig:true}),player=selected('survivor-original-live-rig',{format:'meshy-iso-sprite-atlas'}),unknown=selected('unrecognized-selection',{});
 native.nestedPlayer=true;const renderer={productionArt:art,drawEnemy(c,s){clock++;if(s.boss)return this.drawCampaignBoss(c,s);const value=this.drawNativeEnemy(c,s);this.productionArt.drawFrame(c,s);return value;},drawNativeEnemy(c,s){const value=this.productionArt.drawFrame(c,s);if(s.nestedPlayer)this.drawPlayer(c,player);return value;},drawCampaignBoss(c,s){return this.productionArt.drawFrame(c,s);},drawNativeCorpse(c,s){return this.productionArt.drawFrame(c,s);},drawPlayer(c,s){return this.productionArt.drawFrame(c,s);},drawObstacle(c,s){return this.productionArt.drawFrame(c,s);},drawDecor(c,s){return this.productionArt.drawFrame(c,s);}},rendererBefore=descriptors(renderer),canvasBefore=descriptors(context),p=createFrameCostProfile({renderer,read:()=>({}),now:()=>clock});
 try{assert.deepEqual(calls,[]);p.beginFrame();assert.equal(renderer.drawEnemy(context,native),true);assert.equal(renderer.drawEnemy(context,baked),true);assert.equal(renderer.drawEnemy(context,{...native,nestedPlayer:false,boss:true}),true);assert.equal(renderer.drawNativeCorpse(context,baked),true);assert.equal(renderer.drawPlayer(context,player),true);assert.equal(renderer.drawObstacle(context,baked),true);assert.equal(renderer.drawDecor(context,unknown),true);assert.equal(art.drawFrame(context,native),true,'unscoped portrait/other draws are forwarded but excluded');const frame=p.endFrame();
  assert.equal(frame.stages['production.drawFrame'].calls,10);assert.equal(frame.stages['production.drawFrame'].cpuMs,50);assert.deepEqual(frame.stages['production.drawFrame.enemy'],{calls:4,cpuMs:20,nativeCalls:2,bakedCalls:2,unknownCalls:0,thrownCalls:0,falseReturns:0});assert.deepEqual(frame.stages['production.drawFrame.enemy.native'],{calls:2,cpuMs:10});assert.deepEqual(frame.stages['production.drawFrame.enemy.baked'],{calls:2,cpuMs:10});assert.equal(frame.stages['production.drawFrame.boss.native'].calls,1);assert.equal(frame.stages['production.drawFrame.corpse.baked'].calls,1);assert.equal(frame.stages['production.drawFrame.player.native'].calls,2,'a nested player scope restores the prior enemy category');assert.equal(frame.stages['production.drawFrame.obstacle.baked'].calls,1);assert.equal(frame.stages['production.drawFrame.decor.unknown'].calls,1);assert.equal(frame.stages['production.drawFrame'].cpuMs+frame.stages['renderer.drawEnemy'].cpuMs>frame.frameCpuMs,true,'sprite and containing renderer times overlap');assert.equal(calls.filter(Array.isArray).length,11,'no Canvas work beyond the eleven original draw calls');assert.equal(frame.observations.productionArtFirstObserved,true);assert.ok(frame.resourcesBefore.productionArtId);assert.match(p.note,/calls are not unique actors/);
 }finally{p.stop();}
 assert.deepEqual(descriptors(art),artBefore);assert.deepEqual(descriptors(ProductionArt.prototype),prototypeBefore);assertMethodsRestored(renderer,rendererBefore,'renderer scopes');assertMethodsRestored(context,canvasBefore,'Canvas remains unhooked');
});

test('scoped sprite observation preserves original this/args/return/Promise/throw identities and restores category after errors without invoking metadata getters',()=>{
 const marker=Error('original sprite failure'),result={},promise=Promise.resolve(result),calls=[];let metadataReads=0;const art={drawFrame(...args){calls.push({receiver:this,args});if(args[1]===marker)throw marker;if(args[1]===promise)return promise;return args[1]===false?false:result;}},before=descriptors(art),renderer={productionArt:art,drawEnemy(...args){return this.productionArt.drawFrame(...args);},drawPlayer(...args){return this.productionArt.drawFrame(...args);}},p=createFrameCostProfile({renderer,read:()=>({}),now(){throw Error('clock failed');}}),selection={id:'unknown',get metadata(){metadataReads++;throw Error('observation must not invoke selection getters');}},context={},alpha={alpha:.5},foreign={originalReceiver:true};
 try{p.beginFrame();assert.equal(renderer.drawEnemy(context,selection,alpha),result);assert.equal(renderer.drawEnemy(context,promise),promise);assert.throws(()=>renderer.drawEnemy(context,marker),error=>error===marker);assert.equal(renderer.drawEnemy(context,false),false);assert.equal(art.drawFrame.call(foreign,context,selection,alpha),result);assert.equal(renderer.drawPlayer(context,selection),result);const frame=p.endFrame();assert.equal(metadataReads,0);assert.deepEqual(calls[0],{receiver:art,args:[context,selection,alpha]});assert.equal(calls[4].receiver,foreign);assert.equal(calls.length,6);assert.equal(frame.stages['production.drawFrame'].calls,5);assert.equal(frame.stages['production.drawFrame.enemy'].calls,4);assert.equal(frame.stages['production.drawFrame.enemy'].unknownCalls,4);assert.equal(frame.stages['production.drawFrame.enemy'].thrownCalls,1);assert.equal(frame.stages['production.drawFrame.enemy'].falseReturns,1);assert.equal(frame.stages['production.drawFrame.player'].calls,1);assert.equal(frame.stages['production.drawFrame'].cpuMs,0);assert.equal(frame.frameCpuMs,0);}finally{p.stop();}assert.deepEqual(descriptors(art),before);
});

test('overlapping sprite observers restore replaced ProductionArt owners independently and preserve external replacement descriptors',()=>{
 for(const order of [[0,1],[1,0]]){const calls=[],makeArt=label=>Object.create({drawFrame(...args){calls.push({label,receiver:this,args});return label;}}),old=makeArt('old'),next=makeArt('next'),oldBefore=descriptors(old),nextBefore=descriptors(next),renderer={productionArt:old,drawEnemy(...args){return this.productionArt.drawFrame(...args);}},profiles=[0,1].map(()=>createFrameCostProfile({renderer,read:()=>({}),now:()=>0})),selection={id:'registered',metadata:{format:'meshy-iso-sprite-atlas'}};
  try{profiles.forEach(p=>p.beginFrame());assert.equal(renderer.drawEnemy('context',selection),'old');for(const p of profiles)assert.equal(p.endFrame().stages['production.drawFrame.enemy.baked'].calls,1);assert.equal(calls.length,1,'overlapping observers execute the original sprite draw exactly once');profiles[order[0]].stop();const remaining=profiles[order[1]];remaining.beginFrame();assert.equal(renderer.drawEnemy('context',selection),'old');renderer.productionArt=next;assert.equal(renderer.drawEnemy('context',selection),'next');const frame=remaining.endFrame();assert.equal(frame.stages['production.drawFrame.enemy.baked'].calls,2);assert.notEqual(frame.resourcesBefore.productionArtId,frame.resourcesAfter.productionArtId);assert.deepEqual(descriptors(old),oldBefore,'the retired owner is restored as soon as its instance changes');const external=()=> 'external',externalDescriptor={value:external,writable:false,configurable:true,enumerable:true};Object.defineProperty(next,'drawFrame',externalDescriptor);remaining.stop();assert.deepEqual(Object.getOwnPropertyDescriptor(next,'drawFrame'),externalDescriptor);assert.equal(calls.length,3);assert.equal(Object.hasOwn(old,'drawFrame'),false);assert.deepEqual(Reflect.ownKeys(nextBefore),[]);}finally{profiles.forEach(p=>p.stop());}
 }
});
