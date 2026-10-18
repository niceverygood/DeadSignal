import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, UPGRADES } from '../dist/engine.js';
import { Navigation } from '../dist/navigation.js';

function fresh(options={}) {
  const game=new Game({seed:19341,stageDuration:120,...options});
  game.enemies=[];game.spawnClock=1e9;game.drainEvents();
  return game;
}
function ticks(game,count,input={},dt=1/60) {
  for(let i=0;i<count;i++)game.tick(dt,input);
}
function encoded(game) {
  const raw=game.snapshot();assert.ok(raw,'A valid live run must produce a checkpoint');
  return JSON.stringify(raw);
}
function restored(game,options) {
  const result=Game.restore(encoded(game),options);
  assert.ok(result instanceof Game);return result;
}
function toSupply(game) {
  for(let i=0;i<300&&!game.stageBossSpawned;i++)game.tick(1/60);
  const gatekeeper=game.enemies.find(e=>e.gatekeeper);
  assert.ok(gatekeeper);game.damageEnemy(gatekeeper,gatekeeper.hp+1);
  assert.equal(game.state,'supply');
}
function clearNavigation(game) {
  game.navigation=new Navigation(game.world);
  for(const enemy of game.enemies)for(const key of Object.keys(enemy))if(key.startsWith('nav'))delete enemy[key];
}

test('a live checkpoint restores paused with cooldowns, reload, fire, lure, and no replayed audio',()=>{
  const game=fresh();game.spawnEnemy('walker',0,{x:1430,y:930});
  game.tick(.05,{shoot:true,dash:true,moveX:1,aimX:1430,aimY:930,lure:true,molotov:true,targetX:1340,targetY:980});
  game.reload();
  const savedPlayer={...game.player},savedAlarm={...game.alarm},copy=restored(game);
  assert.equal(copy.state,'paused');assert.deepEqual(copy.player,savedPlayer);
  assert.deepEqual(copy.alarm,savedAlarm);assert.deepEqual(copy.fires,game.fires);assert.deepEqual(copy.lure,game.lure);
  assert.ok(copy.player.reloadTime>0&&copy.player.dashTime>0&&copy.player.fireTime>0);
  assert.deepEqual(copy.drainEvents(),[]);assert.deepEqual(copy.particles,[]);assert.deepEqual(copy.texts,[]);assert.deepEqual(copy.links,[]);
  const paused=encoded(copy);ticks(copy,200,{shoot:true,moveX:1,dash:true,molotov:true,lure:true});
  assert.equal(encoded(copy),paused,'Loading must not immediately advance combat');
  copy.resume();copy.tick(.05);assert.ok(copy.time>game.time);assert.ok(copy.player.reloadTime<savedPlayer.reloadTime);
});

test('snapshot is a deep copy and neither capture nor restore consumes either RNG stream',()=>{
  const game=fresh();const before=game.random.getState(),visual=game.visualRandom.getState();
  const raw=game.snapshot();assert.ok(raw);assert.equal(game.random.getState(),before);assert.equal(game.visualRandom.getState(),visual);
  const copy=Game.restore(raw,{resumePlaying:true});assert.ok(copy);
  assert.deepEqual(Array.from({length:20},()=>copy.random()),Array.from({length:20},()=>game.random()));
  assert.deepEqual(Array.from({length:20},()=>copy.visualRandom()),Array.from({length:20},()=>game.visualRandom()));
  const originalX=game.player.x,originalLabel=game.world.obstacles[0].label;
  raw.player.x+=50;raw.world.obstacles[0].label='changed';
  assert.equal(game.player.x,originalX);assert.equal(copy.player.x,originalX);
  assert.equal(game.world.obstacles[0].label,originalLabel);assert.equal(copy.world.obstacles[0].label,originalLabel);
  copy.world.obstacles[0].destroyed=true;assert.equal(game.world.obstacles[0].destroyed,false);
});

test('RNG state setters reject corruption without changing the next random value',()=>{
  const game=fresh(),state=game.random.getState();
  for(const invalid of [-1,2**32,1.5,NaN,Infinity,'42',null])assert.equal(game.random.setState(invalid),false);
  assert.equal(game.random.getState(),state);
  const next=game.random();assert.equal(game.random.setState(state),true);assert.equal(game.random(),next);
  assert.equal(game.random.setState(0xFFFFFFFF),true);assert.ok(Number.isFinite(game.random()));
  assert.ok(game.random.getState()>=0&&game.random.getState()<=0xFFFFFFFF);
});

test('a piercing bullet remembers its earlier hit after JSON round trip',()=>{
  const game=fresh({weapon:'nailgun'}),first=game.spawnEnemy('walker',0,{x:1360,y:930}),second=game.spawnEnemy('walker',0,{x:1380,y:930});
  game.player.x=1300;game.upgrades.pierce=1;game.tick(.037,{shoot:true,aimX:1600,aimY:930});
  assert.equal(game.bullets.length,1);assert.equal(game.bullets[0].hits.has(first.id),true);
  const firstHp=first.hp,secondHp=second.hp,copy=restored(game);
  assert.ok(copy.bullets[0].hits instanceof Set);assert.equal(copy.bullets[0].hits.has(first.id),true);
  copy.resume();copy.tick(.004);
  assert.equal(copy.enemies.find(e=>e.id===first.id).hp,firstHp,'An already-hit enemy must not take damage again');
  assert.ok(copy.enemies.find(e=>e.id===second.id).hp<secondHp,'The next enemy must still receive the piercing shot');
});

test('shots and fire thrown outside the map edge remain valid resumable combat',()=>{
  const game=fresh({weapon:'nailgun'});game.player.x=49;game.player.y=1000;
  ticks(game,6,{shoot:true,aimX:-1000,aimY:1000});
  assert.ok(game.bullets.some(b=>b.x<0),'An outward shot should fly beyond the city boundary');
  assert.equal(game.throwFire(-1000,1000),true);assert.equal(game.fires.length,0);assert.ok(game.throwables[0].targetX<0);game.updateMolotovs(1);assert.ok(game.fires[0].x<0);
  game.pause();const copy=restored(game);
  assert.deepEqual(copy.fires,game.fires);assert.deepEqual(copy.bullets,game.bullets);
  copy.resume();copy.tick(.05);
  assert.ok(copy.snapshot(),'Continuing those effects must remain saveable');
});

test('city metadata, Infinity health, destroyed props, and labels round trip without sentinel collisions',()=>{
  const game=fresh({seed:0xFFFFFFFF});game.world.obstacles[0].label='Infinity';
  const car=game.world.obstacles.find(o=>o.kind==='car');game.explode(car.x+car.w/2,car.y+car.h/2,170,200,false);
  assert.equal(car.destroyed,true);
  const raw=game.snapshot();assert.ok(raw);assert.equal(raw.world.obstacles[0].hp,'Infinity');
  assert.equal(typeof raw.world.seed,'number');const copy=Game.restore(JSON.stringify(raw));assert.ok(copy);
  assert.deepEqual(copy.world,game.world);assert.equal(copy.world.obstacles[0].label,'Infinity');
  assert.equal(copy.world.obstacles[0].hp,Infinity);assert.equal(copy.world.obstacles.find(o=>o.id===car.id).destroyed,true);
  assert.deepEqual(copy.world.roads,game.world.roads);assert.deepEqual(copy.world.decor,game.world.decor);
  assert.equal(copy.blocked(car.x+car.w/2,car.y+car.h/2,14),game.blocked(car.x+car.w/2,car.y+car.h/2,14));
  game.advanceStage();game.advanceStage();assert.ok(game.world.seed>0xFFFFFFFF);
  assert.equal(restored(game).world.seed,game.world.seed,'City seeds may exceed uint32 even though RNG states cannot');
});

test('navigation caches are omitted and restore creates navigation over the restored city',()=>{
  const game=fresh(),enemy=game.spawnEnemy('walker',0,{x:1370,y:930});game.tick(.05);
  assert.equal(enemy.navTarget,game.player);
  const raw=game.snapshot();assert.ok(raw);
  assert.equal(Object.keys(raw.enemies[0]).some(key=>key.startsWith('nav')),false);
  const copy=Game.restore(raw);assert.ok(copy.navigation instanceof Navigation);assert.equal(copy.navigation.world,copy.world);
  assert.equal(copy.enemies[0].navTarget,undefined);
  copy.resume();copy.tick(.05);assert.equal(copy.enemies[0].navTarget,copy.player);
});

test('a restored gatekeeper still clears the district and keeps queued shop choices in the supply flow',()=>{
  const game=fresh({stageDuration:1});toSupply(game);game.parts=90;
  assert.equal(game.buyMod(),true);game.gainXP(game.player.xpNext);
  const copy=restored(game);assert.equal(copy.state,'upgrade');assert.equal(copy.returnToSupply,true);assert.equal(copy.pendingLevels,2);
  assert.ok(copy.choices.every(choice=>UPGRADES.includes(choice)),'Choice IDs must reconnect to canonical definitions');
  assert.equal(copy.parts,60);while(copy.state==='upgrade')assert.equal(copy.chooseUpgrade(copy.choices[0].id),true);
  copy.finishSupplyUpgrade();assert.equal(copy.state,'supply');assert.equal(copy.buyMod(),false);assert.equal(copy.parts,60);

  const beforeClear=fresh({stageDuration:1});for(let i=0;i<100&&!beforeClear.stageBossSpawned;i++)beforeClear.tick(1/60);
  const active=restored(beforeClear);active.resume();const gatekeeper=active.enemies.find(e=>e.gatekeeper);assert.ok(gatekeeper);
  active.damageEnemy(gatekeeper,gatekeeper.hp+1);assert.equal(active.state,'supply');assert.equal(active.world.exit.open,true);
});

test('route and hospital event screens retain choices and cannot pay their rewards twice',()=>{
  const game=fresh({stageDuration:1});toSupply(game);game.leaveSupply();
  const route=restored(game);assert.equal(route.state,'route');assert.equal(route.chooseRoute('hospital'),true);
  for(let i=0;i<100&&route.state!=='event';i++)route.tick(1/60);
  assert.equal(route.state,'event');route.player.hp=60;
  const event=restored(route);assert.equal(event.state,'event');assert.equal(event.eventSeen,true);
  assert.equal(event.chooseEvent(true),true);assert.equal(event.player.hp,95);
  const enemyCount=event.enemies.length;assert.equal(event.chooseEvent(true),false);assert.equal(event.player.hp,95);assert.equal(event.enemies.length,enemyCount);
});

test('collector attack phases survive restore and boss keeps the live enemy reference',()=>{
  for(const phase of ['windup','charge','recover']){
    const game=fresh();game.advanceStage();game.advanceStage();game.enemies=[];game.spawnClock=1e9;
    const boss=game.spawnEnemy('collector',0,{x:1430,y:930});game.stageBossSpawned=true;
    boss.attackState=phase;boss.attackTime=.03;boss.targetX=game.player.x;boss.targetY=game.player.y;boss.skillCd=3;
    const copy=restored(game);assert.equal(copy.boss,copy.enemies.find(e=>e.type==='collector'));
    assert.equal(copy.boss.attackState,phase);assert.equal(copy.boss.attackTime,.03);
    copy.resume();copy.tick(.05);
    assert.equal(copy.boss.attackState,{windup:'charge',charge:'recover',recover:'walk'}[phase]);
    assert.equal(copy.boss,copy.enemies.find(e=>e.type==='collector'));
  }
});

test('signed idle timers and inactive stale alarm IDs are valid checkpoint data',()=>{
  const game=fresh(),walker=game.spawnEnemy('walker',0,{x:1800,y:600});game.player.invul=100;
  ticks(game,540);assert.ok(walker.skillCd<0);
  walker.burn=-.01;walker.attackTime=-.02;game.comboTime=-.01;
  game.alarm.cooldown=0;game.startAlarm();const elite=game.enemies.find(e=>e.id===game.alarm.eliteId);assert.ok(elite);
  game.damageEnemy(elite,elite.hp+1);assert.equal(game.alarm.active,false);
  const copy=restored(game);assert.equal(copy.alarm.eliteId,elite.id);assert.equal(copy.enemies.some(e=>e.id===elite.id),false);
  const restoredWalker=copy.enemies.find(e=>e.id===walker.id);assert.ok(restoredWalker.skillCd<0);assert.equal(restoredWalker.burn,-.01);assert.equal(restoredWalker.attackTime,-.02);
});

test('supply preserves a cleared gate and an active orphan alarm until the next district',()=>{
  const game=fresh({stageDuration:1});for(let i=0;i<100&&!game.stageBossSpawned;i++)game.tick(1/60);
  game.alarm.cooldown=0;game.startAlarm();assert.equal(game.alarm.active,true);
  const eliteId=game.alarm.eliteId,gatekeeper=game.enemies.find(e=>e.gatekeeper);game.damageEnemy(gatekeeper,gatekeeper.hp+1);
  assert.equal(game.state,'supply');assert.equal(game.enemies.length,0);
  const copy=restored(game);assert.equal(copy.alarm.active,true);assert.equal(copy.alarm.eliteId,eliteId);
  copy.leaveSupply();copy.chooseRoute('police');assert.equal(copy.stage,1);assert.equal(copy.alarm.active,false);
});

test('a stage clear before pickup cleanup can save more than four hundred fifty pickups',()=>{
  const game=fresh({stageDuration:1});for(let i=0;i<100&&!game.stageBossSpawned;i++)game.tick(1/60);
  const gatekeeper=game.enemies.find(e=>e.gatekeeper);
  for(let i=0;i<455;i++){const enemy=game.spawnEnemy('walker',0,{x:1370,y:930});game.damageEnemy(enemy,enemy.hp+1);}
  game.damageEnemy(gatekeeper,gatekeeper.hp+1);assert.equal(game.state,'supply');assert.ok(game.pickups.length>450);
  const copy=restored(game);assert.equal(copy.pickups.length,game.pickups.length);assert.equal(copy.kills,game.kills);assert.equal(copy.corpses.length,70);
});

test('restored gameplay and future rolls match the original when transient navigation caches are reset',()=>{
  const game=fresh({weapon:'nailgun'});game.player.invul=100;
  game.spawnEnemy('walker',0,{x:1370,y:930});game.spawnEnemy('runner',0,{x:1430,y:990});
  ticks(game,12,{moveY:.25,shoot:true,aimX:1430,aimY:990});
  const copy=restored(game,{resumePlaying:true});clearNavigation(game);clearNavigation(copy);
  for(let frame=0;frame<120;frame++){
    const input={moveX:.4,moveY:.1,shoot:true,aimX:1430,aimY:990};game.tick(1/60,input);copy.tick(1/60,input);
  }
  assert.equal(encoded(copy),encoded(game));
  assert.deepEqual(Array.from({length:10},()=>copy.random()),Array.from({length:10},()=>game.random()));
});

test('menu and terminal runs do not create resumable checkpoints',()=>{
  for(const state of ['menu','loadout','settings','dead','victory']){const game=fresh();game.state=state;assert.equal(game.snapshot(),null);}
  const paused=fresh();paused.pause();assert.equal(restored(paused,{resumePlaying:true}).state,'paused');
  const ended=fresh();ended.end(false);assert.equal(ended.snapshot(),null);
});

test('corrupt, oversized, unsupported, and nonfinite snapshots return null without throwing',()=>{
  const game=fresh();game.spawnEnemy('walker',0,{x:1370,y:930});game.shoot();
  const baseline=game.snapshot();assert.ok(baseline);
  const cases=[undefined,null,false,42,[],{},'{',encoded(game).slice(0,-1),' '.repeat(600001)];
  const changed=change=>{const raw=JSON.parse(JSON.stringify(baseline));change(raw);cases.push(raw);};
  changed(raw=>raw.version=2);changed(raw=>raw.state='loading');changed(raw=>raw.player.hp=NaN);changed(raw=>raw.player.invul=Infinity);
  changed(raw=>raw.player.weapon='unknown');changed(raw=>raw.world.width=1e9);changed(raw=>raw.world.obstacles[0].hp={$number:'Infinity'});
  changed(raw=>raw.world.seed='Infinity');changed(raw=>raw.enemies[0].type='unknown');changed(raw=>raw.enemies[0].id=raw.world.obstacles[0].id);
  changed(raw=>raw.id=1);changed(raw=>raw.bullets[0].hits=[raw.id+1]);changed(raw=>raw.state='upgrade');
  changed(raw=>raw.world.decor=Array.from({length:257},()=>({x:100,y:100,kind:'rubble',seed:.5})));
  changed(raw=>raw.enemies=Array.from({length:211},(_,i)=>({...raw.enemies[0],id:++raw.id})));
  changed(raw=>raw.world.obstacles.find(o=>o.kind==='car').hp='Infinity');
  const cyclic={};cyclic.self=cyclic;cases.push(cyclic);
  cases.push(Object.defineProperty({},'version',{enumerable:true,get(){throw new Error('Corrupt getter');}}));
  for(const raw of cases)assert.doesNotThrow(()=>assert.equal(Game.restore(raw),null));
  assert.equal(Game.restore(baseline,null)?.state,'paused');
  assert.equal(Game.restore(baseline,{resumePlaying:'true'})?.state,'paused');
  game.player.hp=NaN;assert.doesNotThrow(()=>assert.equal(game.snapshot(),null));
});

test('duplicate, invalid-rank, or missing upgrade choices cannot create a broken selection screen',()=>{
  const game=fresh();game.gainXP(game.player.xpNext);game.tick(0);const baseline=game.snapshot();assert.ok(baseline);
  for(const change of [raw=>raw.choices=[],raw=>raw.choices=[raw.choices[0],raw.choices[0]],raw=>raw.choices=['not-an-upgrade'],raw=>raw.pendingLevels=0,raw=>{const id=raw.choices[0];raw.upgrades[id]=Number.MAX_SAFE_INTEGER+1;}]){
    const raw=JSON.parse(JSON.stringify(baseline));change(raw);assert.equal(Game.restore(raw),null);
  }
});
