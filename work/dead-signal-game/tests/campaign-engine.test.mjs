import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {getMission,getBoss,missionScaling,MISSIONS} from '../dist/campaign.js';
import legacyCheckpoint from './fixtures/legacy-v016-checkpoint.json' with {type:'json'};

function fresh(missionId='mission-01',options={}){
  const game=new Game({seed:7331,missionId,...options});game.enemies=[];game.spawnClock=1e9;game.player.invul=9999;game.drainEvents();return game;
}
function atTime(game,time){game.time=time;game.stageTime=time;game.tick(0);}
function kill(game,enemy){game.damageEnemy(enemy,enemy.hp);}

test('all twelve missions have independent worlds and resume their trained player in the same mission',()=>{
  for(const mission of MISSIONS){
    const game=fresh(mission.id,{training:{armor:2,magazine:2}});
    assert.equal(game.stage,0);assert.equal(game.missionId,mission.id);assert.equal(game.missionIndex,mission.index);
    assert.equal(game.world.theme,mission.theme);assert.equal(game.world.missionId,mission.id);assert.equal(game.world.missionIndex,mission.index);
    assert.equal(game.player.hp,116);assert.equal(game.player.maxHp,116);assert.equal(game.player.maxAmmo,8);
    const raw=game.snapshot();assert.ok(raw);assert.equal(raw.version,2);const copy=Game.restore(raw);assert.ok(copy);
    assert.equal(copy.state,'paused');assert.equal(copy.missionId,mission.id);assert.equal(copy.player.maxHp,116);assert.deepEqual(copy.world,game.world);
  }
  assert.equal(fresh('mission-01').stageDuration,120);assert.equal(fresh('mission-01',{mode:'standard'}).stageDuration,180);
  assert.equal(new Game({seed:1}).stageDuration,120);assert.equal(new Game({seed:1,mode:'standard'}).stageDuration,300);
});

test('each mission requires a live middle boss before its final boss and ends only after both actual kills',()=>{
  for(const mission of MISSIONS){
    const game=fresh(mission.id,{stageDuration:100});atTime(game,34.999);assert.equal(game.boss,null);assert.equal(game.midBossSpawned,false);
    atTime(game,35);const mid=game.boss;assert.ok(mid);assert.equal(mid.bossKey,mission.midBoss);assert.equal(mid.bossRole,'mid');
    assert.equal(mid.type,'elite');assert.equal(mid.r,getBoss(mission.midBoss).stats.r);assert.equal(game.world.exit.open,false);
    atTime(game,95);assert.equal(game.boss,mid);assert.equal(game.finalBossSpawned,false);assert.equal(game.spawnMissionBoss('final'),null);
    kill(game,mid);assert.equal(game.midBossDefeated,true);assert.equal(game.boss,null);assert.equal(game.state,'playing');assert.equal(game.world.exit.open,false);
    assert.deepEqual(game.defeatedBossIds,[mission.midBoss]);game.tick(0);const final=game.boss;assert.ok(final);assert.equal(final.bossKey,mission.finalBoss);assert.equal(final.bossRole,'final');
    assert.equal(final.type,'collector');assert.equal(final.r,getBoss(mission.finalBoss).stats.r);assert.ok(game.snapshot());
    kill(game,final);assert.equal(game.state,'victory');assert.equal(game.stage,0);assert.equal(game.result.won,true);
    assert.equal(game.result.missionId,mission.id);assert.equal(game.result.midBossDefeated,true);assert.deepEqual(game.result.defeatedBossIds,[mission.midBoss,mission.finalBoss]);
    assert.deepEqual(game.events.filter(event=>event.type==='bossdefeat').map(event=>({bossKey:event.bossKey,role:event.role})),[{bossKey:mission.midBoss,role:'mid'},{bossKey:mission.finalBoss,role:'final'}]);
    assert.equal(game.events.filter(event=>event.type==='boss').length,2);assert.equal(game.events.filter(event=>event.type==='end').length,1);
    const result=JSON.stringify(game.result),hp=game.player.hp;game.tick(.05);kill(game,final);assert.equal(JSON.stringify(game.result),result);assert.equal(game.player.hp,hp);
  }
});

test('a middle boss killed early does not spawn the final before the seventy-five-percent clock',()=>{
  const game=fresh('mission-01',{stageDuration:100});atTime(game,35);kill(game,game.boss);
  atTime(game,74.999);assert.equal(game.finalBossSpawned,false);assert.equal(game.boss,null);
  const saved=game.snapshot();assert.ok(saved);const copy=Game.restore(saved,{resumePlaying:true});assert.ok(copy);atTime(copy,75);
  assert.equal(copy.finalBossSpawned,true);assert.equal(copy.boss.bossRole,'final');assert.equal(copy.midBossDefeated,true);
});

test('failed mandatory spawns leave their flag unset and retry after an enemy slot becomes free',()=>{
  const game=fresh();for(let i=0;i<210;i++)assert.ok(game.spawnEnemy('elite',450));
  assert.equal(game.spawnMissionBoss('mid'),null);assert.equal(game.midBossSpawned,false);assert.equal(game.boss,null);
  game.enemies.pop();const boss=game.spawnMissionBoss('mid');assert.ok(boss);assert.equal(game.midBossSpawned,true);
  assert.equal(game.enemies.length,210);assert.equal(game.spawnMissionBoss('mid'),null);assert.ok(game.snapshot());
});

test('normal pools and boss stats apply the mission difficulty without altering global types or the legacy operation',()=>{
  const stats=[];
  for(const mission of MISSIONS){
    const game=fresh(mission.id),scale=missionScaling(mission.index),normal=game.spawnEnemy('walker',400);
    assert.equal(normal.maxHp,42*scale.hp);assert.equal(normal.damage,9*scale.damage);assert.equal(normal.speed,65*scale.speed);
    const boss=game.spawnMissionBoss('mid'),catalog=getBoss(mission.midBoss);
    assert.equal(boss.maxHp,Math.ceil(catalog.stats.hp*scale.hp));assert.equal(boss.damage,Math.ceil(catalog.stats.damage*scale.damage));assert.equal(boss.speed,catalog.stats.speed*scale.speed);
    stats.push({hp:boss.maxHp,damage:boss.damage});
    for(let i=0;i<100;i++){const type=game.missionEnemyType();assert.ok(mission.enemyPool.some(entry=>entry.type===type));}
  }
  for(let i=1;i<stats.length;i++){assert.ok(stats[i].hp>stats[i-1].hp);assert.ok(stats[i].damage>stats[i-1].damage);}
  const legacy=fresh(null);assert.equal(legacy.missionId,null);const normal=legacy.spawnEnemy('walker',400);
  assert.equal(normal.hp,42);assert.equal(normal.damage,9);assert.equal(normal.speed,65);
});

test('the existing version-one checkpoint restores byte-for-byte without campaign activation',()=>{
  // Keep the historical 214-speed fixture unchanged. Balance tuning changes
  // future displacement, but loading must preserve every existing saved value.
  const original=JSON.stringify(legacyCheckpoint),copy=Game.restore(legacyCheckpoint,{resumePlaying:true});assert.ok(copy);assert.deepEqual(copy.snapshot(),legacyCheckpoint);
  assert.equal(JSON.stringify(legacyCheckpoint),original);assert.equal(copy.snapshot().version,1);assert.equal(copy.player.speed,214);
  assert.equal(copy.missionId,null);assert.equal(copy.midBossDefeated,false);assert.deepEqual(copy.bossHazards,[]);assert.deepEqual(copy.hostileProjectiles,[]);
  assert.equal(new Game({seed:1,missionId:'mission-99'}).missionId,null);
  assert.equal(Game.restore({...legacyCheckpoint,version:2}),null,'A version-two checkpoint must name a known mission');
});

test('the tuned version-one operation retains deterministic live replay across a mid-movement checkpoint',()=>{
  const game=new Game({seed:323727,mode:'standard',weapon:'nailgun'});game.player.invul=9999;
  const advance=(g,i)=>{
    g.tick(.05,{shoot:true,moveX:i<70?1:-1,moveY:i<100?.25:-.5,aimX:1550,aimY:960,lure:i===12,targetX:1420,targetY:910});
    if(g.state==='upgrade')g.chooseUpgrade(g.choices[0].id);
  };
  for(let i=0;i<75;i++)advance(game,i);
  const mid=game.snapshot();assert.ok(mid);assert.equal(mid.version,1);assert.equal(mid.player.speed,214);
  const copy=Game.restore(JSON.stringify(mid),{resumePlaying:true});assert.ok(copy);assert.deepEqual(copy.snapshot(),mid);
  // Navigation caches have never been serialized. Compare with both cold,
  // exactly as the existing deterministic checkpoint contract requires.
  for(const g of [game,copy]){g.navigation=new Navigation(g.world);for(const enemy of g.enemies)for(const key of Object.keys(enemy))if(key.startsWith('nav'))delete enemy[key];}
  for(let i=75;i<150;i++){advance(game,i);advance(copy,i);}
  assert.deepEqual(copy.snapshot(),game.snapshot());assert.equal(copy.missionId,null);assert.equal(copy.random.getState(),game.random.getState());assert.equal(copy.visualRandom.getState(),game.visualRandom.getState());
});

test('mission progression, active boss reference and maximum seed survive version-two restore',()=>{
  const game=fresh('mission-12',{seed:0xFFFFFFFF,stageDuration:100});atTime(game,35);const mid=game.boss;
  const raw=game.snapshot();assert.ok(raw);assert.equal(raw.world.seed,0xFFFFFFFF+11);const copy=Game.restore(JSON.stringify(raw));assert.ok(copy);
  assert.equal(copy.boss,copy.enemies.find(enemy=>enemy.id===mid.id));assert.equal(copy.boss.bossKey,mid.bossKey);assert.equal(copy.boss.r,mid.r);
  assert.equal(copy.random.getState(),game.random.getState());assert.equal(copy.visualRandom.getState(),game.visualRandom.getState());
  assert.deepEqual(copy.defeatedBossIds,[]);assert.equal(copy.midBossSpawned,true);assert.equal(copy.finalBossSpawned,false);
});

test('corrupt version-two progress, catalog roles, skill timers and unbounded effect queues are rejected without throwing',()=>{
  const game=fresh('mission-01');game.spawnMissionBoss('mid');game.boss.skillCd=0;game.tick(.01);const raw=game.snapshot();assert.ok(raw);assert.equal(raw.bossHazards.length,1);
  const changes=[data=>data.version=3,data=>data.missionId='mission-99',data=>data.missionIndex=11,data=>data.world.missionId='mission-02',data=>data.midBossSpawned=false,data=>data.midBossDefeated=true,data=>data.finalBossSpawned=true,
    data=>data.bossId=null,data=>data.enemies.find(enemy=>enemy.bossKey).bossKey='boss-02-mid',data=>data.enemies.find(enemy=>enemy.bossKey).bossRole='final',data=>data.enemies.find(enemy=>enemy.bossKey).r++,
    data=>data.enemies.find(enemy=>enemy.bossKey).skillCd=Infinity,data=>data.enemies.find(enemy=>enemy.bossKey).attackTime=100,data=>data.enemies.find(enemy=>enemy.bossKey).skillRepeats=99,
    data=>data.bossHazards[0].ownerId=999999,data=>data.bossHazards[0].time=Infinity,data=>data.bossHazards[0].targetX=3000,data=>data.bossHazards=Array.from({length:49},()=>({...data.bossHazards[0]})),
    data=>data.hostileProjectiles=Array(121).fill({}),data=>data.defeatedBossIds=['boss-02-mid']];
  for(const change of changes){const data=structuredClone(raw);change(data);assert.doesNotThrow(()=>assert.equal(Game.restore(data),null));}
});

test('all twenty-four bosses retain strict checkpoints through actual warnings, running attacks, hazards and projectiles',()=>{
  for(const mission of MISSIONS)for(const role of ['mid','final']){
    const game=fresh(mission.id,{stageDuration:1e9});let boss=game.spawnMissionBoss('mid');assert.ok(boss);
    if(role==='final'){kill(game,boss);boss=game.spawnMissionBoss('final');assert.ok(boss);}
    boss.skillCd=0;game.drainEvents();game.tick(.01);assert.equal(boss.attackState,'windup');assert.ok(game.bossHazards.length,`${boss.bossKey} must show its actual warning`);
    const check=()=>{
      const raw=game.snapshot();assert.ok(raw,`${boss.bossKey}/${boss.attackState} must remain saveable`);
      const random=game.random.getState(),visual=game.visualRandom.getState(),copy=Game.restore(raw,{resumePlaying:true});assert.ok(copy);
      assert.deepEqual(copy.snapshot(),raw,`${boss.bossKey}: all attack and progression fields must round-trip`);
      assert.equal(copy.boss,copy.enemies.find(enemy=>enemy.id===raw.bossId));assert.equal(copy.random.getState(),random);assert.equal(copy.visualRandom.getState(),visual);
      assert.equal(game.random.getState(),random);assert.equal(game.visualRandom.getState(),visual);return raw;
    };
    check();let cast=false;
    for(let i=0;i<120;i++){
      game.tick(.05);const firstCast=game.events.some(event=>event.type==='bossskill');
      if(i%10===0||firstCast&&!cast)check();cast||=firstCast;
      assert.ok(game.enemies.length<=210);assert.ok(game.bossHazards.length<=48);assert.ok(game.hostileProjectiles.length<=120);
    }
    assert.equal(cast,true,`${boss.bossKey} must execute its real catalog skill`);
    const raw=check();game.pause();const paused=JSON.stringify(game.snapshot());for(let i=0;i<10;i++)game.tick(.05);
    assert.equal(JSON.stringify(game.snapshot()),paused);assert.equal(game.snapshot().randomState,raw.randomState);
  }
});

test('additional hazard fields and hostile projectile payloads reject invalid or incoherent saved data',()=>{
  const mine=fresh('mission-09');mine.spawnMissionBoss('mid');mine.boss.skillCd=0;mine.tick(.01);const raw=mine.snapshot();assert.ok(raw);assert.ok(raw.bossHazards[0].activeDuration>0);
  for(const change of [h=>h.phase='unknown',h=>h.shape='cone',h=>h.r=401,h=>h.duration=9,h=>h.damage=NaN,h=>h.color='#ffffff',h=>h.activeDuration=9,h=>h.innerR=h.r+1,h=>h.force=401,h=>h.tickClock=Infinity]){
    const corrupt=structuredClone(raw);change(corrupt.bossHazards[0]);assert.equal(Game.restore(corrupt),null);
  }
  for(const missionId of ['mission-04','mission-11']){
    const game=fresh(missionId);game.spawnMissionBoss('mid');game.boss.skillCd=0;for(let i=0;i<100&&!game.hostileProjectiles.length;i++)game.tick(.01);
    assert.ok(game.hostileProjectiles.length);const saved=game.snapshot();assert.ok(saved);assert.ok(Game.restore(saved));
    for(const change of [shot=>shot.ownerId=99999,shot=>shot.kind=missionId==='mission-04'?'spread':'spit',shot=>shot.life=shot.maxLife+1,shot=>shot.vx=901,shot=>shot.damage=Infinity,shot=>shot.x=-51]){
      const corrupt=structuredClone(saved);change(corrupt.hostileProjectiles[0]);assert.equal(Game.restore(corrupt),null);
    }
    if(missionId==='mission-04')for(const change of [shot=>delete shot.puddleRadius,shot=>shot.puddleDuration=9,shot=>shot.puddleDamage=NaN]){
      const corrupt=structuredClone(saved);change(corrupt.hostileProjectiles[0]);assert.equal(Game.restore(corrupt),null);
    }
  }
});
