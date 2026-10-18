import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js?v=0.29.0';
import {getBoss} from '../dist/campaign.js?v=0.29.0';
import {createQAStorage} from '../dist/qa-storage.js';
import {createOwnedCleanupTracker} from '../dist/qa-owned-cleanup-tracker.js';
import {allowBoss02FightQA,createBoss02FightFixture,createBoss02FightRun,installBoss02FightQA} from '../dist/qa-boss02-fight.js';

// One real original Game fixture plus controlled lifecycle/protocol doubles.
// Fake GL counters/PNG strings are not native rendering or pixel evidence.
const KEY='boss-02-final',PROFILE='boss02-fold-v1';
const address=mode=>new URL('http://localhost:8851/boss02-fight-qa.html?qa=1&qa-memory=fight-test&qa-boss02-fight='+mode);
function gate(mode='original'){const location=address(mode),query=location.searchParams;return{location,query,storage:createQAStorage(query,()=>assert.fail('persistent storage'))};}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function flush(){for(let i=0;i<40;i++)await Promise.resolve();}
function frozen(value){if(value===null||typeof value!=='object')return;assert.equal(Object.isFrozen(value),true);for(const child of Object.values(value))frozen(child);}

test('exact original/fold HTTP8851+qa=1+genuine-memory gates precede canvas, document, callbacks and constructors',()=>{
 for(const change of['origin','protocol','host','qa','qa-empty','memory','mode','forged']){
  const options=gate();if(change==='origin')options.location.port='8806';if(change==='protocol')options.location.protocol='https:';if(change==='host')options.location.hostname='example.com';if(change==='qa')options.query.set('qa','0');if(change==='qa-empty')options.query.set('qa','');if(change==='memory')options.query.delete('qa-memory');if(change==='mode')options.query.set('qa-boss02-fight','candidate');if(change==='forged')options.storage=new Map();
  let reads=0;for(const key of['canvas','document','testDeps','input','onProgress','onCapture','eventTarget'])Object.defineProperty(options,key,{get(){reads++;assert.fail('gate before IO');}});
  assert.equal(allowBoss02FightQA(options.location,options.query,options.storage),false);assert.equal(createBoss02FightRun(options),null);assert.equal(installBoss02FightQA(options),null);assert.equal(reads,0,change);
 }
 for(const mode of['original','fold']){const options=gate(mode);assert.equal(allowBoss02FightQA(options.location,options.query,options.storage),true);}
});

test('actual mission02 checkpoint keeps normal HP/AI roster/spawning/stage duration and skill7, with a validated520 original-world corridor',()=>{
 const original=new Game({seed:774,missionId:'mission-02',weapon:'nailgun'}),fixture=createBoss02FightFixture(),{game,boss,proof}=fixture,catalog=getBoss(KEY);
 assert.equal(game.missionId,'mission-02');assert.equal(game.player.weapon,'nailgun');assert.equal(game.stageDuration,original.stageDuration);assert.equal(game.spawnClock,original.spawnClock);assert.equal(game.enemies.length,original.enemies.length+1);assert.deepEqual(game.enemies.slice(0,original.enemies.length),original.enemies);assert.deepEqual(game.world,original.world);
 for(const key of['hp','maxHp','invul','ammo','maxAmmo','speed'])assert.equal(game.player[key],original.player[key],key+' unchanged');assert.equal(boss.skillCd,7);assert.equal(boss.skillCd,catalog.skill.cooldown);assert.equal(boss.attackState,'walk');assert.equal(boss.attackTime,0);assert.equal(boss.stun,0);assert.equal(game.time,0);assert.equal(game.stageTime,0);
 assert.equal(proof.positions.distance,520);assert.ok(Math.abs(Math.hypot(boss.x-game.player.x,boss.y-game.player.y)-520)<1e-9);for(let i=0;i<=18;i++)assert.equal(game.blocked(game.player.x+(boss.x-game.player.x)*i/18,game.player.y+(boss.y-game.player.y)*i/18,boss.r+3),false);
 assert.equal(game.midBossDefeated,true);assert.equal(game.midBossSpawned,true);assert.deepEqual(game.defeatedBossIds,[game.mission.midBoss]);assert.ok(fixture.snapshot);assert.equal(game.state,'playing');assert.equal(game.player.hp,proof.playerBefore.hp);assert.equal(proof.bossInitialSkillCd,7);
});

function controlled(config={}){
 let time=0,next=0;const timers=new Map(),rafs=new Map(),events=[],owners=[],constructorOptions=[],captures=[],stats={ticks:0,renders:0,disposed:0,lost:0,geometry:0};
 const waiting=deferred();let sourceVersion=0,stopping=false;
 const eventTarget={listeners:new Map(),addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);},removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);},emit(type){for(const fn of [...(this.listeners.get(type)??[])])fn();}};
 const setTimer=(callback,delay)=>{const id=++next;timers.set(id,{callback,at:time+delay,delay});return id;},clearTimer=id=>timers.delete(id);
 function advance(ms){time+=ms;for(const[id,timer]of[...timers])if(timer.at<=time){timers.delete(id);timer.callback();}}
 function surface(width=512,height=512){return{width,height,dataset:{},getContext(){return{};},toDataURL(){return'data:image/png;base64,CONTROLLED';}};}
 const canvas=surface(960,640),body=surface(),manifest={assets:{},bosses:{[KEY]:{walk:'walk',actions:'actions'}}};
 class FakeGame{
  constructor(options){constructorOptions.push(options);this.player={x:1200,y:930,r:14,hp:100,maxHp:100,invul:0,ammo:30,maxAmmo:30,speed:128,weapon:'nailgun'};this.enemies=[{id:1,type:'walker',x:2000,y:1500,dead:false}];this.world={width:2400,height:1800,obstacles:[]};this.mission={midBoss:'boss-02-mid',finalBoss:KEY};this.missionId='mission-02';this.stageDuration=120;this.spawnClock=2;this.state='playing';this.time=0;this.events=[];this.bossHazards=[];this.random=Object.assign(()=>.5,{getState:()=>774});this.visualRandom=Object.assign(()=>.5,{getState:()=>123});}
  blocked(){return config.noCorridor===true;}
  spawnMissionBoss(){this.boss={id:2,bossKey:KEY,x:0,y:0,r:49,hp:1000,maxHp:1000,angle:0,attackState:'walk',attackTime:0,skillCd:7,hitFlash:0,dead:false};this.enemies.push(this.boss);this.events.push({type:'boss',bossKey:KEY});return this.boss;}
  snapshot(){return{state:this.state,time:this.time,player:{...this.player},enemies:this.enemies.map(actor=>({...actor}))};}
  tick(dt,command){stats.ticks++;this.time+=dt;if(this.time>=7&&this.boss.attackState==='walk'){this.boss.attackState='windup';this.boss.attackTime=1.2;this.events.push({type:'bosswarn',bossKey:KEY});}else if(this.boss.attackState==='windup'){this.boss.attackTime=Math.max(0,this.boss.attackTime-dt);if(this.boss.attackTime<=1e-8){this.boss.attackState='recover';this.boss.attackTime=1.6;this.events.push({type:'bossskill',bossKey:KEY});}}else if(this.boss.attackState==='recover')this.boss.attackTime-=dt;if(command.shoot)this.player.ammo--;if(this.time>=9)this.state='paused';}
  drainEvents(){const list=this.events;this.events=[];return list;}
 }
 function model(){const geometry={attributes:{position:{array:new Float32Array([1,2,3])}},dispose(){stats.geometry++;}},material={map:null,alphaMap:null,dispose(){}},mesh={geometry,material},root={traverse(visit){visit(mesh);}};return{root,states:new WeakMap(),actionLayer:{profile:PROFILE},geometry};}
 class Rig{
  constructor(options){constructorOptions.push(options);this.size=512;this.models=new Map();this.pending=new Map();this.frames=new WeakMap();this.bossActionLayerEnabled=false;this.registry=Promise.resolve({});this.renderer={domElement:surface(),info:{render:{frame:0}},dispose(){assert.equal(stopping,true,'input stopped before owned retirement');stats.disposed++;},forceContextLoss(){stats.lost++;}};this.scene={clear(){}};this.framePool={slots:[]};owners.push(this);}
  frame(key,actor,at){const model=this.models.get(key),clip=actor.attackState==='windup'?'windup':actor.attackState==='recover'?'attack':'walk',old=model.states.get(actor),state={key:clip};if(old?.key!==clip&&old)state.transition={start:at,duration:.075};else if(old?.transition&&at-old.transition.start<.075)state.transition=old.transition;model.states.set(actor,state);this.renderer.info.render.frame++;this.diagnostics={key,clip,sample:1,sampleDensity:32,continuousSampling:true,bossActionsEnabled:this.bossActionLayerEnabled,bossActionsActive:this.bossActionLayerEnabled,bossActionsBones:this.bossActionLayerEnabled?9:0,bossActionsMaxRadians:this.bossActionLayerEnabled?.3:0};const selected={image:body,metadata:{liveRig:true}};this.frames.set(actor,{selected});return selected;}
 }
 class Art{constructor(options){this.manifest=options.manifest;this.records=new Map();}releaseUnusedAssets(){this.records.clear();}}
 class Renderer{
  constructor(canvas,options){this.canvas=canvas;this.productionArt=options.productionArt;this.nativeActorFrames=new WeakMap();this.textureStatus='ready';this.asphaltImage={};this.fireArt={load:()=>Promise.resolve(true)};this.explosionArt={load:()=>Promise.resolve(true)};}
  render(view){stats.renders++;const actor=view.enemies.find(e=>e.bossKey===KEY);if(config.offscreenAction&&actor.attackState!=='walk')return;const selected=this.liveBoss.frame(KEY,actor,view.time,{},{});this.nativeActorFrames.set(actor,selected);}
 }
 class Interpolation{constructor(){this.copies=new WeakMap();}capture(){}sample(game){return{...game,enemies:game.enemies.map(actor=>{let value=this.copies.get(actor);if(!value){value={};this.copies.set(actor,value);}return Object.assign(value,actor);})};}}
 const testDeps={Game:FakeGame,Renderer,ProductionArt:Art,LiveBossRig:Rig,Cache:{enabled:false},manifest,ActorInterpolation:Interpolation,
  productionLaunchPlan(){return{assetIds:[],bossKeys:[KEY]};},async preloadLaunchPlan(renderer){const rig=renderer.liveBoss;if(config.deferredLoad){const promise=waiting.promise.then(ready=>{if(ready)rig.models.set(KEY,model());return ready;});rig.pending.set(KEY,promise);return promise;}rig.models.set(KEY,model());return true;},
  requestFrame(callback){const id=++next;rafs.set(id,callback);return id;},cancelFrame(id){rafs.delete(id);},now:()=>time,setTimer,clearTimer,
  createOwnedCleanupTracker(options){return createOwnedCleanupTracker({...options,now:()=>time,setTimer,clearTimer});},
 };
 const options={...gate(config.mode??'original'),canvas,document:{},eventTarget,testDeps,input:()=>({moveX:0,moveY:0,shoot:false}),onStopping(){stopping=true;events.push('input-stopped');},onCapture(info){captures.push(info);},onProgress(info){if(config.onProgress)config.onProgress(info,owners[0]);}};
 const run=createBoss02FightRun(options);
 async function frame(ms=50){advance(ms);const next=rafs.entries().next().value;if(next){rafs.delete(next[0]);next[1](time);}await flush();}
 return{run,options,owners,constructorOptions,canvas,body,captures,stats,timers,rafs,events,waiting,eventTarget,advance,frame,get sourceVersion(){return sourceVersion;}};
}

test('controlled normal/fold lifecycle uses original fixedstep calls and exact event ticks, observes the rendered copy75ms bridge, then detaches and retires once',async()=>{
 for(const mode of['original','fold']){
  const f=controlled({mode}),pending=f.run.start();assert.equal(f.run.start(),pending,'one fresh page has one job');await flush();assert.equal(f.constructorOptions[0].seed,774);assert.equal(f.constructorOptions[0].missionId,'mission-02');assert.equal(Object.hasOwn(f.constructorOptions[0],'stageDuration'),false);
  assert.deepEqual(f.constructorOptions[1],mode==='fold'?{size:512,bossActionProfile:PROFILE}:{size:512});
  for(let i=0;i<190&&f.rafs.size;i++)await f.frame();const result=await pending,report=result.report;assert.equal(report.injected,true);assert.equal(report.complete,true);assert.equal(report.reason,'normal-paused');assert.equal(report.preparation.timeoutMs,60000);assert.equal(report.limits.realMilliseconds,300000);assert.equal(report.limits.cleanupMilliseconds,15000);assert.equal(report.cleanup.complete,true);assert.equal(report.cleanup.resourcesReleased,true);assert.equal(report.cleanup.methodsRestored,true);assert.equal(report.cleanup.flagRestored,true);
  assert.ok(report.ticks.every(t=>t.dt===1/60&&t.command.shoot===false&&t.command.fireMode==='manual'));const skill=report.ticks.find(t=>t.emittedEvents.some(e=>e.type==='bossskill'));assert.ok(skill);assert.equal(skill.attackState,'recover');assert.ok(report.evidence.nativeWindupFrames>0&&report.evidence.nativeAttackFrames>0&&report.evidence.firstSkillNativeAttack);const first=report.frames.find(frame=>frame.events.some(e=>e.type==='bossskill'));assert.equal(first.native.stateKey,'attack');assert.equal(first.native.transition.duration,.075);assert.equal(first.native.previousRendered.clip,'windup');assert.equal(first.native.diagnostic.bossActionsEnabled,mode==='fold');
  assert.equal(f.stats.disposed,1);assert.equal(f.stats.lost,1);assert.equal(f.stats.geometry,1);assert.equal(f.owners[0].models.size,0);assert.equal(f.owners[0].bossActionLayerEnabled,false);assert.equal(Object.hasOwn(f.owners[0],'frame'),false);assert.equal(f.canvas.width,0);assert.equal(f.body.width,0);assert.equal(f.rafs.size,0);assert.equal(f.timers.size,0);assert.ok(f.captures.length<=3);frozen(report);const saved=JSON.stringify(report);f.run.stop();assert.equal(JSON.stringify(report),saved);assert.equal(f.run.snapshot(),report);
 }
});

test('one earlier walking native frame cannot certify an offscreen warning/impact as a complete fight observation',async()=>{
 const f=controlled({offscreenAction:true}),pending=f.run.start();await flush();for(let i=0;i<190&&f.rafs.size;i++)await f.frame();const report=(await pending).report;assert.equal(report.cleanup.complete,true);assert.ok(report.evidence.nativeFrames>0);assert.ok(report.evidence.bossWarnings>0&&report.evidence.bossSkills>0);assert.equal(report.evidence.nativeWindupFrames,0);assert.equal(report.evidence.nativeAttackFrames,0);assert.equal(report.evidence.firstSkillNativeAttack,false);assert.equal(report.complete,false);
});

test('whole preparation60s and final cleanup15s are separate, unresolved late models fail immutably and still retire after settlement',async()=>{
 const f=controlled({deferredLoad:true}),pending=f.run.start();await flush();assert.ok([...f.timers.values()].some(t=>t.delay===60000));f.advance(60001);await flush();assert.ok([...f.timers.values()].some(t=>t.delay===15000));f.advance(15001);await flush();const report=(await pending).report;assert.equal(report.complete,false);assert.match(report.error,/load-timeout/);assert.equal(report.cleanup.complete,false);assert.equal(report.cleanup.drain.timedOut,true);assert.ok(report.cleanup.drain.active>0);const saved=JSON.stringify(report);frozen(report);f.waiting.resolve(true);await flush();assert.equal(f.owners[0].models.size,0);assert.equal(f.owners[0].pending.size,0);assert.equal(f.stats.geometry,1);assert.equal(f.stats.disposed,1);assert.equal(f.stats.lost,1);assert.equal(JSON.stringify(report),saved);assert.equal(f.rafs.size,0);
});

test('manual stop during a progress callback cannot schedule another frame and preserves a foreign method replacement with failed restoration proof',async()=>{
 let f;const foreign=function foreignFrame(){return null;};f=controlled({onProgress(_info,rig){Object.defineProperty(rig,'frame',{value:foreign,writable:true,configurable:true,enumerable:false});f.run.stop();}});const pending=f.run.start();await flush();await f.frame();const report=(await pending).report;assert.equal(report.complete,false);assert.equal(report.reason,'manual-stop');assert.equal(report.cleanup.methodsRestored,false);assert.ok(report.cleanup.errors.some(e=>e.where==='method.restore'));assert.equal(f.owners[0].frame,foreign);assert.equal(f.rafs.size,0);assert.equal(f.stats.renders,1);assert.equal(f.stats.disposed,1);assert.equal(f.stats.lost,1);
});
