import test from 'node:test';
import assert from 'node:assert/strict';
import {ActorInterpolation} from '../dist/actor-interpolation.js';
import {advanceSimulation,FIXED_STEP} from '../dist/simulation.js';
import {Game} from '../dist/engine.js';

const lists=['enemies','bullets','hostileProjectiles','particles','pickups','corpses','throwables'];
const captured=['x','y','angle','time','elapsed','height','fallElapsed','attackTime','attackState','hitFlash','attackCd','reloadTime','skillCd','life','recoil'];
const turn=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));

// Independent pre-pooling implementation. Keep its allocations and arithmetic
// so the optimized class is checked against the actual old render behavior.
class OriginalActorInterpolation {
  constructor(){this.previous=new WeakMap();this.proxies=new WeakMap();this.game=null;this.view=null;this.lastTime=null;}
  capture(game){
    if(this.game!==game){this.game=game;this.previous=new WeakMap();this.proxies=new WeakMap();this.view=Object.create(game);}
    for(const actor of [game.player,...lists.flatMap(name=>game[name]||[])])if(actor&&Number.isFinite(actor.x)&&Number.isFinite(actor.y))
      this.previous.set(actor,{x:actor.x,y:actor.y,angle:actor.angle,time:game.time,elapsed:actor.elapsed,height:actor.height,fallElapsed:actor.fallElapsed,attackTime:actor.attackTime,attackState:actor.attackState,hitFlash:actor.hitFlash,attackCd:actor.attackCd,reloadTime:actor.reloadTime,skillCd:actor.skillCd,life:actor.life,recoil:actor.recoil});
    this.lastTime=game.time;this.priorFlash=game.flash;
    this.priorExpedition=game.expedition?{id:game.expedition.id,step:game.expedition.step,hold:game.expedition.hold,prepHold:game.expedition.prepHold,time:game.time}:null;
  }
  sample(game,alpha,step){
    if(this.game!==game||!this.view)return game;
    const playing=game.state==='playing',fraction=playing?Math.max(0,Math.min(1,alpha)):1;
    const actorView=actor=>{
      if(!actor||!Number.isFinite(actor.x)||!Number.isFinite(actor.y))return actor;
      let proxy=this.proxies.get(actor);if(!proxy){proxy=Object.create(actor);this.proxies.set(actor,proxy);}
      const prior=this.previous.get(actor),continuous=prior&&game.time>=prior.time&&game.time-prior.time<=step*1.01&&Math.hypot(actor.x-prior.x,actor.y-prior.y)<100;
      const amount=continuous?fraction:1;
      proxy.x=prior?prior.x+(actor.x-prior.x)*amount:actor.x;proxy.y=prior?prior.y+(actor.y-prior.y)*amount:actor.y;
      const exact=actor===game.player||actor.type==='shield'||['windup','charge'].includes(actor.attackState);
      proxy.angle=continuous&&!exact&&Number.isFinite(prior.angle)&&Number.isFinite(actor.angle)?prior.angle+turn(prior.angle,actor.angle)*amount:actor.angle;
      for(const field of ['elapsed','height','attackTime','hitFlash','attackCd','reloadTime','skillCd','fallElapsed','life','recoil']){const before=prior?.[field],after=actor[field];const sameState=(field!=='attackTime'||prior?.attackState===actor.attackState)&&(!['life','recoil','hitFlash','attackCd','reloadTime','skillCd'].includes(field)||after<=before&&before-after<=step*1.01);proxy[field]=continuous&&sameState&&Number.isFinite(before)&&Number.isFinite(after)&&Math.abs(after-before)<=step*(field==='height'?800:200)?before+(after-before)*amount:after;}
      return proxy;
    };
    this.view.player=actorView(game.player);
    for(const name of lists)this.view[name]=(game[name]||[]).map(actorView);
    this.view.time=playing&&this.lastTime!==null&&game.time-this.lastTime<=step*1.01?this.lastTime+(game.time-this.lastTime)*fraction:game.time;
    this.view.flash=playing&&Number.isFinite(this.priorFlash)&&game.flash<=this.priorFlash&&this.priorFlash-game.flash<=step*1.01&&game.time-this.lastTime<=step*1.01?this.priorFlash+(game.flash-this.priorFlash)*fraction:game.flash;
    if(game.expedition){
      if(this.expeditionSource!==game.expedition){this.expeditionSource=game.expedition;this.expeditionProxy=Object.create(game.expedition);}
      const prior=this.priorExpedition,current=game.expedition;
      const continuous=prior&&prior.id===current.id&&prior.step===current.step&&game.time-prior.time<=step*1.01&&Math.abs(current.hold-prior.hold)<=step*1.01;
      this.expeditionProxy.hold=continuous?prior.hold+(current.hold-prior.hold)*fraction:current.hold;
      if(Number.isFinite(current.prepHold))this.expeditionProxy.prepHold=continuous&&Number.isFinite(prior?.prepHold)&&Math.abs(current.prepHold-prior.prepHold)<=step*1.01?prior.prepHold+(current.prepHold-prior.prepHold)*fraction:current.prepHold;
      this.view.expedition=this.expeditionProxy;
    }else this.view.expedition=game.expedition;
    return this.view;
  }
}

const actor=n=>({id:n,x:100+n,y:200+n,angle:Math.PI*2-.1,elapsed:.2,height:12,fallElapsed:.1,attackTime:.5,attackState:'walk',hitFlash:.12,attackCd:.9,reloadTime:1,skillCd:9,life:2,recoil:.12});
function fixture(){const game={player:actor(0),time:20,flash:.2,state:'playing',expedition:{id:'test',step:1,hold:.3,prepHold:.5}};for(let n=0;n<lists.length;n++)game[lists[n]]=[actor(n+1)];return game;}
const actors=game=>[game.player,...lists.flatMap(name=>game[name]||[])];
function mutate(game){
  game.time+=FIXED_STEP;game.flash-=FIXED_STEP;game.expedition.hold+=FIXED_STEP;game.expedition.prepHold-=FIXED_STEP;
  for(const current of actors(game)){current.x+=.7;current.y-=.2;current.angle=.1;current.elapsed+=FIXED_STEP;current.height+=.1;current.fallElapsed+=FIXED_STEP;for(const key of ['attackTime','hitFlash','attackCd','reloadTime','skillCd','life','recoil'])current[key]-=FIXED_STEP;}
}
function assertCapture(actual,oracle,game){for(const current of actors(game))if(current&&Number.isFinite(current.x)&&Number.isFinite(current.y)){assert.deepEqual(Object.keys(actual.previous.get(current)),captured);assert.deepEqual(actual.previous.get(current),oracle.previous.get(current));}}
const renderActor=a=>a&&({id:a.id,type:a.type,...Object.fromEntries(captured.filter(key=>key!=='time').map(key=>[key,a[key]]))});
function renderView(view){return {player:renderActor(view.player),...Object.fromEntries(lists.map(name=>[name,(view[name]||[]).map(renderActor)])),time:view.time,flash:view.flash,expedition:view.expedition?{...view.expedition,hold:view.expedition.hold,prepHold:view.expedition.prepHold}:view.expedition};}
function assertViews(actual,oracle,game){for(const alpha of [0,.1,.5,.9,1,-1,2,NaN])assert.deepEqual(renderView(actual.sample(game,alpha,FIXED_STEP)),renderView(oracle.sample(game,alpha,FIXED_STEP)));}

test('all seven actor pools preserve every captured value and exact original subframe arithmetic',()=>{
  const game=fixture(),pooled=new ActorInterpolation(),oracle=new OriginalActorInterpolation();
  assert.equal(pooled.reuseCapture,true);assert.equal(pooled.captureStats,null);
  for(let tick=0;tick<12;tick++){pooled.capture(game);oracle.capture(game);assertCapture(pooled,oracle,game);mutate(game);assertViews(pooled,oracle,game);}
  const before=structuredClone(game);assertViews(pooled,oracle,game);assert.deepEqual(game,before);
});

test('capture records are reused only for the same actor, with exact creation and capture statistics',()=>{
  const game=fixture(),pooled=new ActorInterpolation();pooled.captureStats={created:0,reused:0,captures:0};pooled.capture(game);
  const records=new Map(actors(game).map(current=>[current,pooled.previous.get(current)]));
  for(let tick=0;tick<7;tick++){mutate(game);pooled.capture(game);for(const [current,record]of records)assert.equal(pooled.previous.get(current),record);}
  assert.deepEqual(pooled.captureStats,{created:8,reused:56,captures:8});
  const removed=game.particles.shift(),replacement=actor(200);game.particles.push(replacement);pooled.capture(game);
  assert.equal(pooled.previous.get(removed),records.get(removed));assert.notEqual(pooled.previous.get(replacement),records.get(removed));
  assert.deepEqual(pooled.captureStats,{created:9,reused:63,captures:9});
  assert.ok(pooled.previous instanceof WeakMap);assert.ok(pooled.proxies instanceof WeakMap);
  for(const record of records.values()){assert.deepEqual(Object.keys(record),captured);assert.equal(Object.values(record).some(value=>value&&typeof value==='object'),false,'records must not retain their source actors');}
});

test('QA baseline retains the old fresh-record path and can switch without replacing render proxies',()=>{
  const game=fixture(),pooled=new ActorInterpolation(),oracle=new OriginalActorInterpolation();pooled.reuseCapture=false;pooled.captureStats={created:0,reused:0,captures:0};
  pooled.capture(game);oracle.capture(game);const record=pooled.previous.get(game.player),view=pooled.sample(game,.5,FIXED_STEP),proxy=view.player,oldList=view.enemies;
  mutate(game);pooled.capture(game);oracle.capture(game);assert.notEqual(pooled.previous.get(game.player),record);assertCapture(pooled,oracle,game);assertViews(pooled,oracle,game);
  assert.equal(pooled.view,view);assert.equal(pooled.sample(game,.5,FIXED_STEP).player,proxy);assert.notEqual(view.enemies,oldList,'original sample allocates new list arrays');
  assert.deepEqual(pooled.captureStats,{created:16,reused:0,captures:2});
  pooled.reuseCapture=true;const second=pooled.previous.get(game.player);mutate(game);pooled.capture(game);oracle.capture(game);assert.equal(pooled.previous.get(game.player),second);assert.equal(pooled.sample(game,.5,FIXED_STEP).player,proxy);assertViews(pooled,oracle,game);
  assert.deepEqual(pooled.captureStats,{created:16,reused:8,captures:3});
});

test('game replacement drops both WeakMaps and views while the same game preserves proxy identity',()=>{
  const pooled=new ActorInterpolation(),first=fixture(),second=fixture();pooled.capture(first);const map=pooled.previous,proxies=pooled.proxies,view=pooled.sample(first,.5,FIXED_STEP),proxy=view.player;
  pooled.capture(first);assert.equal(pooled.previous,map);assert.equal(pooled.proxies,proxies);assert.equal(pooled.sample(first,.1,FIXED_STEP).player,proxy);
  assert.equal(pooled.sample(second,.5,FIXED_STEP),second);pooled.capture(second);assert.notEqual(pooled.previous,map);assert.notEqual(pooled.proxies,proxies);assert.notEqual(pooled.view,view);
  assert.equal(pooled.previous.get(first.player),undefined);assert.equal(pooled.proxies.get(first.player),undefined);assert.equal(Object.getPrototypeOf(pooled.view),second);assert.equal(pooled.sample(first,.5,FIXED_STEP),first);
  const nextProxy=pooled.sample(second,.5,FIXED_STEP).player;assert.notEqual(nextProxy,proxy);assert.equal(Object.getPrototypeOf(nextProxy),second.player);
});

test('attack transitions, exact warning angles, damage onset, dying effects, pause and teleport match the old class',()=>{
  const game=fixture(),pooled=new ActorInterpolation(),oracle=new OriginalActorInterpolation();
  for(const attackState of ['walk','windup','charge','recover','walk']){
    pooled.capture(game);oracle.capture(game);mutate(game);game.enemies[0].attackState=attackState;game.enemies[0].attackTime=.95;game.enemies[0].hitFlash=.12;game.player.recoil=.12;game.flash=.35;game.bullets[0].life=0;game.particles[0].life=0;game.corpses[0].type='shield';assertViews(pooled,oracle,game);
  }
  for(const state of ['paused','upgrade','dead','playing']){game.state=state;assertViews(pooled,oracle,game);}
  game.player.x+=1000;game.enemies[0].y-=1000;assertViews(pooled,oracle,game);
  game.time-=2;assertViews(pooled,oracle,game);game.time+=3;assertViews(pooled,oracle,game);
  game.expedition={id:'next',step:0,hold:2};assertViews(pooled,oracle,game);game.expedition=null;assertViews(pooled,oracle,game);
});

test('invalid positions, missing optional values and actors shared across pools retain the original behavior',()=>{
  const game=fixture(),pooled=new ActorInterpolation(),oracle=new OriginalActorInterpolation();game.enemies.push(null,{x:NaN,y:2},{x:3,y:Infinity},{x:5,y:6});game.bullets.push(game.player);game.particles=[];game.pickups=null;delete game.corpses;
  pooled.captureStats={created:0,reused:0,captures:0};pooled.capture(game);oracle.capture(game);assertCapture(pooled,oracle,game);assertViews(pooled,oracle,game);
  assert.equal(pooled.captureStats.created,6);assert.equal(pooled.captureStats.reused,1,'duplicate actor updates the same weak record');
  const optional=game.enemies.at(-1),record=pooled.previous.get(optional);optional.x+=1;game.time+=FIXED_STEP;pooled.capture(game);oracle.capture(game);assert.equal(pooled.previous.get(optional),record);assertCapture(pooled,oracle,game);assertViews(pooled,oracle,game);
});

test('real Game catch-up ticks keep checkpoints, random streams, attacks, damage and removal identical',()=>{
  const a=new Game({seed:774}),b=new Game({seed:774}),pooled=new ActorInterpolation(),oracle=new OriginalActorInterpolation();
  for(const game of [a,b]){game.spawnClock=1e9;game.player.invul=100;const boss=game.spawnEnemy('collector',300);boss.skillCd=0;const contact=game.spawnEnemy('walker',300);Object.assign(contact,{x:game.player.x+20,y:game.player.y,speed:0,attackCd:0,burn:1,burnTick:0});game.throwFire(game.player.x+150,game.player.y);game.drainEvents();}
  pooled.captureStats={created:0,reused:0,captures:0};
  for(let frame=0;frame<16;frame++){
    const command={moveX:frame<8?1:0,moveY:frame>=8?1:0,aimX:a.player.x+300,aimY:a.player.y,shoot:true,fireMode:'manual',dash:frame===1};
    const old=advanceSimulation(a,command,FIXED_STEP*7.5,{interpolator:oracle}),next=advanceSimulation(b,command,FIXED_STEP*7.5,{interpolator:pooled});assert.deepEqual(next,old);
    assert.deepEqual(b.snapshot(),a.snapshot());assert.deepEqual(b.events,a.events);assert.equal(b.random.getState(),a.random.getState());assert.equal(b.visualRandom.getState(),a.visualRandom.getState());
    const before=b.snapshot(),events=structuredClone(b.events),random=b.random.getState(),visual=b.visualRandom.getState();
    for(const alpha of [0,.25,.5,.75,1])assert.deepEqual(renderView(pooled.sample(b,alpha,FIXED_STEP)),renderView(oracle.sample(a,alpha,FIXED_STEP)));
    assert.deepEqual(b.snapshot(),before);assert.deepEqual(b.events,events);assert.equal(b.random.getState(),random);assert.equal(b.visualRandom.getState(),visual);
  }
  assert.equal(pooled.captureStats.captures,112);assert.ok(pooled.captureStats.reused>pooled.captureStats.created*5);assert.ok(a.events.some(event=>event.type==='bosswarn'));assert.ok(a.events.some(event=>event.type==='shot'));assert.ok(a.events.some(event=>event.type==='kill'));
});
