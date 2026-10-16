import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {Game,WEAPONS} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {firingIntent} from '../dist/firing.js';

function fresh(weapon='shotgun'){
  const game=new Game({seed:8801,weapon,stageDuration:1e9});
  game.enemies=[];game.spawnClock=1e9;game.world.obstacles=[];
  game.navigation=new Navigation(game.world);game.player.x=1000;game.player.y=900;
  game.drainEvents();return game;
}
function enemy(game,x,y,type='walker'){
  const target=game.spawnEnemy(type,0,{x,y});assert.ok(target);
  assert.equal(target.x,x);assert.equal(target.y,y);target.speed=0;return target;
}
const pointer={aimX:900,aimY:600,shoot:false};
const auto=game=>firingIntent(game,{mode:'auto',...pointer});
const obstacle=kind=>({id:500,x:1110,y:850,w:35,h:100,kind,hp:Infinity,maxHp:Infinity,destroyed:false});

test('automatic firing works without a pointer and selects the nearest living clear target',()=>{
  const game=fresh(),far=enemy(game,1350,900),near=enemy(game,1210,900);
  const dead=enemy(game,1180,900),zeroHp=enemy(game,1160,900);dead.dead=true;zeroHp.hp=0;
  assert.deepEqual(firingIntent(game,{mode:'auto'}),{aimX:near.x,aimY:near.y,shoot:true,targetId:near.id});
  near.dead=true;assert.equal(auto(game).targetId,far.id);
  far.dead=true;const none=auto(game);
  assert.deepEqual(none,{...pointer,targetId:null});
  const withoutPointer=firingIntent(game,{mode:'auto'});
  assert.equal(withoutPointer.shoot,false);assert.equal(withoutPointer.targetId,null);
  assert.ok(Number.isFinite(withoutPointer.aimX)&&Number.isFinite(withoutPointer.aimY));
});

test('each weapon includes its muzzle offset and target body at the exact range boundary',()=>{
  for(const weapon of ['shotgun','nailgun'])for(const type of ['walker','collector']){
    const game=fresh(weapon),target=enemy(game,1300,900,type),w=WEAPONS[weapon];
    const reach=w.speed*w.life+24+target.r;target.x=game.player.x+reach;
    assert.equal(auto(game).targetId,target.id,`${weapon}/${type} should include the exact reachable boundary`);
    target.x+=.001;assert.equal(auto(game).shoot,false,`${weapon}/${type} must not select a target beyond its projectile reach`);
    target.x-=.002;assert.equal(auto(game).shoot,true);
  }
});

test('buildings, cars, barrels and fences block automatic aim until destroyed',()=>{
  for(const kind of ['building','car','barrel','fence']){
    const game=fresh(),target=enemy(game,1300,900),wall=obstacle(kind);
    game.world.obstacles.push(wall);
    assert.equal(auto(game).targetId,null,`${kind} must block the shot line`);assert.equal(auto(game).shoot,false);
    wall.destroyed=true;
    assert.equal(auto(game).targetId,target.id,`A destroyed ${kind} should no longer hide the target`);
  }
});

test('a closer blocked zombie does not prevent selecting a farther visible zombie',()=>{
  const game=fresh(),blocked=enemy(game,1200,900),visible=enemy(game,1320,1110);
  game.world.obstacles.push(obstacle('fence'));
  assert.equal(game.navigation.lineOfSight(game.player,blocked,0),false);
  assert.equal(game.navigation.lineOfSight(game.player,visible,0),true);
  assert.deepEqual(auto(game),{aimX:visible.x,aimY:visible.y,shoot:true,targetId:visible.id});
});

test('automatic aim respects inclusive 3px wall edges and the bullet collider square corner',()=>{
  for(const gap of [0,1,2.999,3,3.001,4]){
    const game=fresh(),target=enemy(game,1300,900);
    game.player.y=target.y=950+gap;game.world.obstacles.push(obstacle('building'));
    assert.equal(auto(game).shoot,gap>3,`A ${gap}px edge gap must agree with the actual bullet clearance`);
  }
  for(const offset of [-195,-193]){
    const game=fresh(),target=enemy(game,1300,1100);
    game.player.y=game.player.x+offset;target.y=target.x+offset;
    game.world.obstacles.push({id:500,x:1100,y:800,w:100,h:100,kind:'building',destroyed:false});
    assert.equal(game.navigation.lineOfSight(game.player,target,3),true,'Both diagonals are outside the rounded navigation corner');
    assert.equal(auto(game).shoot,offset===-193,'A diagonal touching the padded square corner must still be excluded');
  }
});

test('desktop manual mode keeps pointer aim and fires only while its button is pressed',()=>{
  const game=fresh();enemy(game,1300,900);
  for(const shoot of [false,true]){
    assert.deepEqual(firingIntent(game,{mode:'manual',aimX:830,aimY:450,shoot,autoAim:true}),{aimX:830,aimY:450,shoot,targetId:null});
  }
  const capacity=game.player.ammo;
  game.tick(.05,firingIntent(game,{mode:'manual',...pointer}));assert.equal(game.player.ammo,capacity);
  game.tick(.05,firingIntent(game,{mode:'manual',...pointer,shoot:true}));assert.equal(game.player.ammo,capacity-1);
});

test('touch manual aim assistance changes aim but never supplies an unpressed fire button',()=>{
  const game=fresh(),target=enemy(game,1300,900);
  for(const shoot of [false,true]){
    assert.deepEqual(firingIntent(game,{mode:'manual',...pointer,aimAssist:true,shoot}),{aimX:target.x,aimY:target.y,shoot,targetId:target.id});
  }
  const capacity=game.player.ammo;
  for(let i=0;i<12;i++)game.tick(.05,firingIntent(game,{mode:'manual',...pointer,aimAssist:true}));
  assert.equal(game.player.ammo,capacity);assert.equal(game.events.some(event=>event.type==='shot'),false);
  game.world.obstacles.push(obstacle('building'));
  assert.deepEqual(firingIntent(game,{mode:'manual',...pointer,aimAssist:true,shoot:true}),{...pointer,shoot:true,targetId:null});
});

test('automatic fire delegates ammo, damage and continued firing after reload to the engine',()=>{
  for(const weapon of ['shotgun','nailgun']){
    const game=fresh(weapon),target=enemy(game,1300,900,'elite');target.hp=target.maxHp=5000;
    game.player.ammo=1;game.tick(.01,auto(game));
    assert.equal(game.player.ammo,0);assert.ok(game.player.reloadTime>0);
    assert.equal(game.events.filter(event=>event.type==='shot').length,1);
    for(let i=0;i<100&&game.events.filter(event=>event.type==='shot').length<2;i++)game.tick(.05,auto(game));
    const shots=game.events.filter(event=>event.type==='shot');
    assert.equal(shots.length,2);assert.equal(game.player.ammo,game.player.maxAmmo-1);
    assert.ok(target.hp<target.maxHp,'The normal projectile path must still deal damage');
    assert.ok(shots.every(event=>event.weapon===weapon));
    assert.ok(game.events.findIndex(event=>event.type==='loaded')<game.events.lastIndexOf(shots[1]),'The second automatic shot follows a completed normal reload');
  }
});

test('switching from automatic to manual mode stops unpressed shots after the cooldown',()=>{
  const game=fresh(),target=enemy(game,1300,900,'elite');target.hp=target.maxHp=5000;
  game.tick(.01,auto(game));const remaining=game.player.ammo;
  for(let i=0;i<20;i++)game.tick(.05,firingIntent(game,{mode:'manual',...pointer}));
  assert.equal(game.player.ammo,remaining);assert.equal(game.events.filter(event=>event.type==='shot').length,1);
  game.tick(.05,auto(game));assert.equal(game.player.ammo,remaining-1);
});

test('paused, choice, menu and result states suppress both modes without advancing the run',()=>{
  for(const state of ['paused','upgrade','supply','route','event','menu','dead','victory'])for(const mode of ['auto','manual']){
    const game=fresh();enemy(game,1300,900);game.state=state;
    const before=JSON.stringify({player:game.player,enemies:game.enemies,time:game.time,events:game.events});
    const intent=firingIntent(game,{mode,...pointer,shoot:true,aimAssist:true});
    assert.deepEqual(intent,{...pointer,shoot:false,targetId:null},`${state}/${mode} must be inert`);
    game.tick(.05,intent);
    assert.equal(JSON.stringify({player:game.player,enemies:game.enemies,time:game.time,events:game.events}),before);
  }
});

test('selecting a firing intent is read-only for actors, checkpoints, RNG and effect queues',()=>{
  const game=fresh();enemy(game,1300,900);game.shoot();
  const options={mode:'auto',...pointer},original={...options};
  const capture=()=>JSON.stringify({checkpoint:game.snapshot(),particles:game.particles,events:game.events,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash});
  assert.ok(game.snapshot());const before=capture();
  Object.freeze(game.player);for(const target of game.enemies)Object.freeze(target);Object.freeze(game.enemies);Object.freeze(options);
  for(let i=0;i<100;i++){
    assert.equal(firingIntent(game,options).shoot,true);
    assert.equal(firingIntent(game,{mode:'manual',...pointer,aimAssist:true}).shoot,false);
  }
  assert.equal(capture(),before);assert.deepEqual(options,original);
});

test('sixty seconds of representative automatic combat keeps normal entity bounds',t=>{
  const game=new Game({seed:774,weapon:'nailgun',stageDuration:1e9});game.player.invul=1e9;
  const cpuStart=process.cpuUsage(),start=performance.now();let shots=0;
  for(let i=0;i<1200;i++){
    const heading=i*.009;
    game.tick(.05,{...firingIntent(game,{mode:'auto'}),moveX:Math.cos(heading),moveY:Math.sin(heading),dash:i%70===0});
    while(game.state==='upgrade')assert.equal(game.chooseUpgrade(game.choices[0].id),true);
    shots+=game.drainEvents().filter(event=>event.type==='shot').length;
    assert.ok(game.enemies.length<=210&&game.particles.length<=850);
    assert.ok(Number.isFinite(game.player.angle));assert.ok(game.player.ammo>=0&&game.player.ammo<=game.player.maxAmmo);
  }
  const wall=performance.now()-start,cpu=process.cpuUsage(cpuStart),cpuMs=(cpu.user+cpu.system)/1000;
  t.diagnostic(`Automatic combat 60s: CPU=${cpuMs.toFixed(2)}ms, wall=${wall.toFixed(2)}ms, shots=${shots}, kills=${game.kills}, enemies=${game.enemies.length}`);
  assert.ok(Math.abs(game.time-60)<1e-8);assert.ok(shots>10&&game.kills>0,'The sample must exercise real firing and damage');
});
