import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {Game,WEAPONS} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {firingIntent} from '../dist/firing.js';
import {FIXED_STEP,advanceSimulation} from '../dist/simulation.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} should match ${expected}`);
const command=(extra={})=>({fireMode:'auto',aimX:900,aimY:600,shoot:false,targetId:null,moveX:0,moveY:0,targetX:1320,targetY:980,dash:false,lure:false,molotov:false,reload:false,fireOnce:false,...extra});
const backlog=count=>FIXED_STEP*count+1e-6;
function fresh(){
  const game=new Game({seed:8801,weapon:'nailgun',stageDuration:1e9});
  game.enemies=[];game.world.obstacles=[];game.navigation=new Navigation(game.world);game.spawnClock=1e9;
  game.player.x=1000;game.player.y=900;game.drainEvents();return game;
}
function spawn(game,x,y,type='walker'){
  const enemy=game.spawnEnemy(type,0,{x,y});assert.ok(enemy);assert.equal(enemy.x,x);assert.equal(enemy.y,y);enemy.speed=0;return enemy;
}
function observe(game,after){
  const tick=game.tick.bind(game),calls=[];
  game.tick=(dt,input)=>{calls.push({dt,input:{...input}});tick(dt,input);after?.(calls.length,input);};
  return calls;
}
function incomingShot(withReplacement=true){
  const game=fresh(),a=spawn(game,1160,900),b=withReplacement?spawn(game,1200,1100):null;
  a.hp=15;game.player.angle=0;game.shoot();for(let i=0;i<6;i++)game.tick(FIXED_STEP,{aimX:a.x,aimY:a.y});
  assert.equal(a.dead,false);return{game,a,b};
}
const capture=game=>JSON.stringify({checkpoint:game.snapshot(),particles:game.particles,texts:game.texts,links:game.links,events:game.events,shake:game.shake,flash:game.flash});

test('a slow frame redirects the next normal shot after its old target dies without changing ammo or fire rate',()=>{
  assert.equal(FIXED_STEP,1/60);const weapons=JSON.stringify(WEAPONS);
  const stale=incomingShot(),fixed=incomingShot(),raw=Object.freeze(command({aimX:1300,aimY:900}));
  const cached={...raw,...firingIntent(stale.game,{mode:'auto',aimX:raw.aimX,aimY:raw.aimY})};
  for(let i=0;i<8;i++)stale.game.tick(FIXED_STEP,cached);
  const calls=observe(fixed.game),result=advanceSimulation(fixed.game,raw,backlog(8));
  assert.equal(calls.length,8);assert.deepEqual(calls.map(call=>call.input.targetId),[fixed.a.id,fixed.a.id,...Array(6).fill(fixed.b.id)]);
  assert.equal(result.command.targetId,fixed.b.id);near(fixed.game.player.angle,Math.PI/4);near(stale.game.player.angle,0);
  assert.equal(fixed.game.player.ammo,stale.game.player.ammo);assert.equal(fixed.game.player.ammo,21);
  assert.equal(fixed.game.events.filter(event=>event.type==='shot').length,3);assert.equal(stale.game.events.filter(event=>event.type==='shot').length,3);
  near(fixed.game.time,stale.game.time);near(result.accumulator,1e-6);assert.equal(result.consumed,true);
  for(const sample of [fixed,stale]){
    const angle=sample.game.player.angle;
    for(let i=0;i<20;i++)sample.game.tick(FIXED_STEP,{aimX:sample.game.player.x+Math.cos(angle)*200,aimY:sample.game.player.y+Math.sin(angle)*200});
  }
  assert.equal(fixed.b.hp,27,'The existing fifteen-damage bullet must hit the replacement target');assert.equal(stale.b.hp,42);
  assert.equal(JSON.stringify(WEAPONS),weapons);assert.deepEqual(raw,command({aimX:1300,aimY:900}));
});

test('every automatic step and its render command use the enemy latest physical position',()=>{
  const game=fresh(),enemy=spawn(game,1300,1100,'runner');enemy.speed=131;
  const positions=[],calls=observe(game,()=>positions.push({x:enemy.x,y:enemy.y}));
  const result=advanceSimulation(game,command(),backlog(4));assert.equal(calls.length,4);
  assert.ok(Math.hypot(positions[0].x-1300,positions[0].y-1100)>.1);
  for(let i=1;i<calls.length;i++){near(calls[i].input.aimX,positions[i-1].x);near(calls[i].input.aimY,positions[i-1].y);}
  near(result.command.aimX,enemy.x);near(result.command.aimY,enemy.y);assert.equal(result.command.targetId,enemy.id);
  for(const call of calls){assert.equal(call.input.targetX,1320);assert.equal(call.input.targetY,980);}
});

test('automatic fire stops within the same frame when a target leaves range or loses its shot line',()=>{
  for(const change of ['range','wall']){
    const game=fresh(),enemy=spawn(game,1200,900);
    const calls=observe(game,count=>{if(count!==1)return;
      if(change==='range')game.move(enemy,900,0);
      else game.world.obstacles.push({id:++game.id,x:1110,y:850,w:35,h:100,kind:'fence',hp:Infinity,maxHp:Infinity,destroyed:false});
    });
    const raw=command(),result=advanceSimulation(game,raw,backlog(8));
    assert.equal(calls.length,8);assert.equal(calls[0].input.shoot,true);
    for(const call of calls.slice(1)){assert.equal(call.input.shoot,false);assert.equal(call.input.targetId,null);}
    assert.equal(game.player.ammo,23,'Losing the target must not waste the next ready shot');
    assert.equal(result.command.shoot,false);assert.equal(result.command.targetId,null);assert.equal(result.command.aimX,raw.aimX);assert.equal(result.command.aimY,raw.aimY);
  }
});

test('manual pointer and touch-assisted frame commands remain fixed and mode changes do not carry old aim',()=>{
  for(const shoot of [false,true]){
    const game=fresh(),enemy=spawn(game,1300,900),raw=Object.freeze(command({fireMode:'manual',aimX:832,aimY:450,shoot,targetId:777}));
    const calls=observe(game,()=>game.move(enemy,0,3)),result=advanceSimulation(game,raw,backlog(8));
    for(const call of calls){assert.equal(call.input.aimX,832);assert.equal(call.input.aimY,450);assert.equal(call.input.shoot,shoot);assert.equal(call.input.targetId,777);}
    assert.equal(result.command,raw,'A resolved manual frame command should remain untouched');
    const automatic=advanceSimulation(game,command(),0).command;assert.equal(automatic.targetId,enemy.id);
    assert.equal(automatic.aimX,enemy.x);assert.equal(automatic.aimY,enemy.y);assert.notEqual(automatic.aimY,raw.aimY);
    assert.equal(advanceSimulation(game,raw,0).command,raw);
  }
});

test('a short manual click fires once during a slow hasted frame while held or legacy controls keep normal rapid fire',()=>{
  for(const [heldShoot,expectedShots] of [[false,1],[true,2],[undefined,2]]){
    const game=fresh();game.upgrades.haste=3;spawn(game,1300,900);
    const held=heldShoot===undefined?{}:{heldShoot},raw=Object.freeze(command({fireMode:'manual',aimX:1300,aimY:900,shoot:true,fireOnce:true,...held})),calls=observe(game);
    const result=advanceSimulation(game,raw,.12);
    assert.equal(calls.length,7);assert.equal(result.consumed,true);
    assert.equal(game.events.filter(event=>event.type==='shot').length,expectedShots);
    assert.equal(game.player.ammo,24-expectedShots);
    if(heldShoot===false)assert.deepEqual(calls.map(call=>call.input.shoot),[true,false,false,false,false,false,false]);
    else assert.ok(calls.every(call=>call.input.shoot===true),'Holding fire, or an older command without heldShoot metadata, must preserve the existing fire rate');
    assert.equal(raw.fireOnce,true);assert.equal(raw.shoot,true);assert.equal(result.command,raw);
  }
});

test('automatic rapid fire is unaffected by a released pointer or a fireOnce impulse',()=>{
  for(const fireOnce of [false,true]){
    const game=fresh();game.upgrades.haste=3;const enemy=spawn(game,1300,900);
    const raw=Object.freeze(command({heldShoot:false,fireOnce})),calls=observe(game),result=advanceSimulation(game,raw,.12);
    assert.equal(calls.length,7);assert.ok(calls.every(call=>call.input.shoot===true&&call.input.targetId===enemy.id));
    assert.equal(game.events.filter(event=>event.type==='shot').length,2);assert.equal(game.player.ammo,22);
    assert.equal(result.command.shoot,true);assert.equal(result.command.targetId,enemy.id);assert.equal(raw.shoot,false);
  }
});

test('a disabled screen suppresses firing in either mode while preserving movement and ground targets',()=>{
  for(const fireMode of ['auto','manual']){
    const game=fresh();spawn(game,1300,900);const raw=Object.freeze(command({fireMode,shoot:true,targetId:123,moveX:.2,moveY:.1}));
    const rng=game.random.getState(),visual=game.visualRandom.getState(),calls=observe(game),result=advanceSimulation(game,raw,backlog(3),{firingEnabled:false});
    for(const call of calls){assert.equal(call.input.shoot,false);assert.equal(call.input.targetId,null);assert.equal(call.input.moveX,.2);assert.equal(call.input.moveY,.1);assert.equal(call.input.targetX,1320);assert.equal(call.input.targetY,980);}
    assert.equal(game.player.ammo,24);assert.equal(game.events.some(event=>event.type==='shot'),false);
    assert.equal(result.command.shoot,false);assert.equal(result.command.targetId,null);assert.equal(raw.shoot,true);assert.equal(raw.targetId,123);
    assert.equal(game.random.getState(),rng);assert.equal(game.visualRandom.getState(),visual);
  }
});

test('dash, lure, fire and reload impulses reach only the first consumed step',()=>{
  const game=fresh();game.player.ammo=23;
  const raw=Object.freeze(command({fireMode:'manual',moveX:1,dash:true,lure:true,molotov:true,reload:true,fireOnce:true})),calls=observe(game);
  advanceSimulation(game,raw,backlog(6));assert.equal(calls.length,6);
  for(const key of ['dash','lure','molotov','reload'])assert.deepEqual(calls.map(call=>call.input[key]),[true,false,false,false,false,false]);
  for(const call of calls){assert.equal(call.dt,FIXED_STEP);assert.equal(call.input.moveX,1);assert.equal(call.input.targetX,raw.targetX);assert.equal(call.input.targetY,raw.targetY);}
  for(const type of ['lure','fire-throw','reload'])assert.equal(game.events.filter(event=>event.type===type).length,1);
  assert.ok(game.player.dashTime>0);assert.ok(game.player.x>1000);assert.equal(game.fires.length,0);assert.equal(game.throwables.length,1);assert.ok(game.lure);
  assert.equal(raw.dash,true);assert.equal(raw.lure,true);assert.equal(raw.molotov,true);assert.equal(raw.reload,true);
});

test('substep frames preserve pending impulses and RNG and carry their remainder into the next frame',()=>{
  for(const fireMode of ['auto','manual']){
    const game=fresh();spawn(game,1300,900);const raw=Object.freeze(command({fireMode,shoot:true,dash:true,lure:true,molotov:true,reload:true})),calls=observe(game);
    const before=capture(game),result=advanceSimulation(game,raw,FIXED_STEP*.5);
    assert.equal(result.consumed,false);assert.equal(result.accumulator,FIXED_STEP*.5);assert.equal(calls.length,0);assert.equal(capture(game),before);
    for(const key of ['dash','lure','molotov','reload'])assert.equal(result.command[key],true);
  }
  const game=fresh(),calls=observe(game),raw=command({fireMode:'manual'}),first=advanceSimulation(game,raw,FIXED_STEP*.5);
  const next=advanceSimulation(game,raw,first.accumulator+FIXED_STEP*.6);
  assert.equal(next.consumed,true);assert.equal(calls.length,1);near(next.accumulator,FIXED_STEP*.1);near(game.time,FIXED_STEP);
});

test('the poststep render command drops a target killed in the final tick and its resolve does not advance combat',()=>{
  const{game,a}=incomingShot(false),raw=command({targetId:a.id});let lastState;
  const calls=observe(game,()=>{lastState=capture(game);}),result=advanceSimulation(game,raw,backlog(2));
  assert.equal(calls.length,2);assert.equal(a.dead,true);assert.equal(game.state,'playing');
  assert.equal(result.command.targetId,null);assert.equal(result.command.shoot,false);assert.equal(result.command.aimX,raw.aimX);assert.equal(result.command.aimY,raw.aimY);
  assert.equal(capture(game),lastState,'Poststep target resolution must not consume RNG, effects or another game step');
});

test('an upgrade opened during catch-up disables later automatic shots and existing paused or result states remain frozen',()=>{
  const game=fresh();spawn(game,1300,900);game.gainXP(game.player.xpNext);
  const calls=observe(game),result=advanceSimulation(game,command(),backlog(8));
  assert.equal(game.state,'upgrade');assert.equal(game.choices.length,3);near(game.time,FIXED_STEP);assert.equal(game.player.ammo,23);
  assert.equal(calls[0].input.shoot,true);for(const call of calls.slice(1)){assert.equal(call.input.shoot,false);assert.equal(call.input.targetId,null);}
  assert.equal(result.command.shoot,false);assert.equal(result.command.targetId,null);
  for(const state of ['paused','upgrade','supply','route','event','dead','victory']){
    const stopped=fresh();spawn(stopped,1300,900);stopped.state=state;
    const before=JSON.stringify({time:stopped.time,player:stopped.player,enemies:stopped.enemies,events:stopped.events,random:stopped.random.getState(),visual:stopped.visualRandom.getState()});
    const done=advanceSimulation(stopped,command(),backlog(3));assert.equal(done.command.shoot,false);assert.equal(done.command.targetId,null);
    assert.equal(JSON.stringify({time:stopped.time,player:stopped.player,enemies:stopped.enemies,events:stopped.events,random:stopped.random.getState(),visual:stopped.visualRandom.getState()}),before);
  }
});

test('automatic intent refresh stays bounded in a short 210-target diagnostic without running engine physics',t=>{
  let ticks=0,rays=0;
  const game={state:'playing',player:{x:1000,y:900,weapon:'nailgun',angle:0},enemies:Array.from({length:210},(_,i)=>({id:i+1,x:1100+i*3,y:900,r:14,hp:42,dead:false})).reverse(),world:{obstacles:[]},navigation:{lineOfSight(){rays++;return true;}},tick(dt,input){assert.equal(dt,FIXED_STEP);assert.equal(input.targetId,1);assert.equal(input.shoot,true);ticks++;}};
  const raw=Object.freeze(command()),cpuStart=process.cpuUsage(),start=performance.now();
  for(let i=0;i<60;i++){
    const result=advanceSimulation(game,raw,backlog(2));assert.equal(result.consumed,true);assert.equal(result.command.targetId,1);
  }
  const wall=performance.now()-start,cpu=process.cpuUsage(cpuStart),cpuMs=(cpu.user+cpu.system)/1000;
  t.diagnostic(`Auto refresh: 210 targets, ${ticks} ticks + 60 render resolves, CPU=${cpuMs.toFixed(2)}ms, wall=${wall.toFixed(2)}ms, rays=${rays} (no engine physics)`);
  assert.equal(ticks,120);assert.ok(rays>=120);assert.equal(game.enemies.length,210);
});
