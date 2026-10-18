import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,circleRect} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {getBoss} from '../dist/campaign.js';
import {MAX_BOSS_HAZARDS,MAX_HOSTILE_PROJECTILES} from '../dist/boss-combat.js';

function fresh(missionId='mission-01',role='mid'){
  const game=new Game({seed:21013,missionId,stageDuration:1e9});game.enemies=[];game.world.obstacles=[];game.world.decor=[];game.navigation=new Navigation(game.world);game.spawnClock=1e9;
  game.player.x=1000;game.player.y=900;game.player.invul=9999;
  let boss=game.spawnMissionBoss('mid');assert.ok(boss);
  if(role==='final'){game.damageEnemy(boss,boss.hp);boss=game.spawnMissionBoss('final');assert.ok(boss);}
  game.move(boss,1200-boss.x,900-boss.y);boss.skillCd=0;game.drainEvents();return{game,boss,catalog:getBoss(boss.bossKey)};
}
function advance(game,seconds){let remaining=seconds;while(remaining>1e-9&&game.state==='playing'){const dt=Math.min(.05,remaining);game.tick(dt);remaining-=dt;}}
function until(game,predicate,seconds=8){for(let i=0;i<seconds/.01&&!predicate()&&game.state==='playing';i++)game.tick(.01);assert.ok(predicate(),'The real simulation must reach the expected skill phase');}
const capture=game=>JSON.stringify({checkpoint:game.snapshot(),random:game.random.getState(),visual:game.visualRandom.getState(),particles:game.particles,texts:game.texts,links:game.links,events:game.events,shake:game.shake,flash:game.flash});

test('a charge warns before damage, locks its direction, and a final boss really performs its second warned charge',()=>{
  const{game,boss}=fresh();game.tick(.01);assert.equal(boss.attackState,'windup');assert.equal(game.bossHazards.length,1);
  const warning={...game.bossHazards[0]};assert.equal(warning.kind,'charge');assert.equal(warning.phase,'warning');assert.equal(warning.width,boss.r*2);assert.equal(warning.damage,0);
  const hp=game.player.hp,origin={x:boss.x,y:boss.y};advance(game,.3);assert.equal(game.player.hp,hp);assert.equal(boss.x,origin.x);assert.equal(boss.y,origin.y);
  game.move(game.player,300,0);until(game,()=>boss.attackState==='recover');assert.ok(boss.x<1000,'The warning locks a leftward charge instead of tracking the moved player');assert.equal(game.player.hp,hp);
  const final=fresh('mission-01','final');final.game.tick(.01);until(final.game,()=>final.boss.attackState==='recover',5);
  assert.equal(final.game.events.filter(event=>event.type==='bosswarn').length,2);assert.equal(final.game.events.filter(event=>event.type==='bossskill').length,2);
  assert.equal(final.boss.skillRepeats,0);assert.ok(final.game.snapshot());
});

test('charge movement respects physical walls and its configured impact damage respects dodge invulnerability',()=>{
  const blocked=fresh(),wall={id:++blocked.game.id,x:1100,y:850,w:10,h:100,kind:'building',hp:Infinity,maxHp:Infinity,destroyed:false};
  blocked.game.world.obstacles.push(wall);blocked.game.navigation.invalidate();blocked.game.tick(.01);until(blocked.game,()=>blocked.boss.attackState==='recover');
  assert.ok(blocked.boss.x>=wall.x+wall.w+blocked.boss.r);assert.equal(circleRect(blocked.boss.x,blocked.boss.y,blocked.boss.r,wall),false);
  const hit=fresh();hit.game.player.invul=0;hit.game.tick(.01);until(hit.game,()=>hit.game.player.hp<100);
  assert.equal(100-hit.game.player.hp,Math.ceil(hit.catalog.skill.damage*hit.game.campaignScale.damage));
  const dodge=fresh();dodge.game.tick(.01);until(dodge.game,()=>dodge.boss.attackState==='charge');dodge.game.dash(0,-1);advance(dodge.game,.35);
  assert.equal(dodge.game.player.hp,100);assert.ok(dodge.game.player.y<900);assert.ok(dodge.game.player.dashCd>0);
});

test('summoning uses its warned circle, distinct middle/final populations and a bounded living summon limit',()=>{
  for(const role of ['mid','final']){
    const{game,boss,catalog}=fresh('mission-03',role),spawn=game.spawnEnemy.bind(game),positions=[];
    game.spawnEnemy=(...args)=>{const enemy=spawn(...args);if(enemy)positions.push({id:enemy.id,x:enemy.x,y:enemy.y,type:enemy.type});return enemy;};
    game.tick(.01);const warning={...game.bossHazards[0]};assert.equal(warning.shape,'circle');assert.equal(warning.r,catalog.skill.radius);
    until(game,()=>game.events.some(event=>event.type==='bossskill'));const summoned=game.enemies.filter(enemy=>enemy.summonedBy===boss.id);
    assert.equal(summoned.length,catalog.skill.count);
    for(const enemy of positions){assert.ok(Math.hypot(enemy.x-warning.x,enemy.y-warning.y)<=warning.r);assert.ok(Math.hypot(enemy.x-game.player.x,enemy.y-game.player.y)>160);}
    assert.ok(summoned.some(enemy=>enemy.type==='walker'));assert.equal(summoned.some(enemy=>enemy.type==='runner'),role==='final');
    for(let cycle=0;cycle<4;cycle++){boss.attackState='walk';boss.skillCd=0;game.tick(.01);until(game,()=>boss.attackState==='recover');}
    assert.ok(game.enemies.filter(enemy=>enemy.summonedBy===boss.id).length<=12);assert.ok(game.enemies.length<=210);assert.ok(game.snapshot());
  }
});

test('spit warning precedes swept projectile damage, creates real pools and final fan rays match their shots',()=>{
  const{game,boss,catalog}=fresh('mission-04');game.player.invul=0;game.tick(.01);
  assert.equal(game.hostileProjectiles.length,0);assert.equal(game.bossHazards[0].shape,'line');assert.equal(game.player.hp,100);
  until(game,()=>game.hostileProjectiles.length>0);assert.equal(game.player.hp,100);const shot=game.hostileProjectiles[0];
  assert.equal(shot.r,catalog.skill.radius);assert.equal(shot.puddleRadius,catalog.skill.puddleRadius);assert.ok(game.snapshot());
  until(game,()=>game.player.hp<100);assert.equal(100-game.player.hp,Math.ceil(catalog.skill.damage*game.campaignScale.damage));
  const pool=game.bossHazards.find(item=>item.phase==='active');assert.ok(pool);assert.equal(pool.r,catalog.skill.puddleRadius);assert.equal(pool.damage,Math.ceil(catalog.skill.puddleDamage*game.campaignScale.damage));
  game.player.invul=0;const hp=game.player.hp;game.tick(.01);assert.ok(game.player.hp<hp,'The landed contamination must apply actual continuing damage');assert.ok(game.snapshot());
  const final=fresh('mission-04','final');final.game.tick(.01);const rays=final.game.bossHazards.map(item=>({...item}));assert.equal(rays.length,3);
  until(final.game,()=>final.game.hostileProjectiles.length===3);
  for(let i=0;i<3;i++){
    const ray=rays[i],projectile=final.game.hostileProjectiles[i],angle=Math.atan2(ray.targetY-ray.y,ray.targetX-ray.x);
    assert.ok(Math.abs(Math.atan2(projectile.vy,projectile.vx)-angle)<1e-8,'Every warned fan ray must use its actual projectile direction');
  }
});

test('walls stop hostile shots and contamination cannot damage a survivor behind the wall',()=>{
  const{game}=fresh('mission-04'),wall={id:++game.id,x:1100,y:600,w:10,h:600,kind:'building',hp:Infinity,maxHp:Infinity,destroyed:false};
  game.world.obstacles.push(wall);game.navigation.invalidate();game.player.invul=0;game.tick(.01);until(game,()=>game.bossHazards.some(item=>item.phase==='active'));
  const pool=game.bossHazards.find(item=>item.phase==='active');assert.ok(pool.x>=1110);assert.equal(game.hostileProjectiles.length,0);assert.equal(game.player.hp,100);
  game.move(game.player,65,0);assert.ok(Math.hypot(game.player.x-pool.x,game.player.y-pool.y)<pool.r+game.player.r);advance(game,.8);assert.equal(game.player.hp,100,'Nearby contamination must honor the intervening wall');
});

test('live attack phases, projectiles and pools freeze during pause or upgrade and their saved clocks resume exactly',()=>{
  for(const missionId of ['mission-01','mission-03','mission-04']){
    const{game,catalog}=fresh(missionId);game.tick(.01);const raw=game.snapshot();assert.ok(raw);const copy=Game.restore(raw,{resumePlaying:true});assert.ok(copy);
    advance(game,catalog.skill.windup+.04);advance(copy,catalog.skill.windup+.04);assert.deepEqual(copy.snapshot(),game.snapshot(),'Restored telegraphs must preserve aim, phase, summons and both RNG progress');
  }
  const{game}=fresh('mission-04');game.tick(.01);until(game,()=>game.hostileProjectiles.length>0);game.pause();const paused=capture(game);
  for(let i=0;i<20;i++)game.tick(.05);assert.equal(capture(game),paused);
  game.resume();game.gainXP(game.player.xpNext);game.tick(0);assert.equal(game.state,'upgrade');assert.ok(game.hostileProjectiles.length);
  const upgrade=capture(game);for(let i=0;i<20;i++)game.tick(.05);assert.equal(capture(game),upgrade);
  const restored=Game.restore(game.snapshot());assert.ok(restored);assert.equal(restored.state,'upgrade');assert.deepEqual(restored.hostileProjectiles,game.hostileProjectiles);assert.deepEqual(restored.choices.map(choice=>choice.id),game.choices.map(choice=>choice.id));
  assert.equal(restored.chooseUpgrade(restored.choices[0].id),true);const life=restored.hostileProjectiles[0].life;restored.tick(.05);assert.ok(restored.hostileProjectiles[0].life<life);
});

test('boss death purges its warned and active attacks, and lethal projectiles cannot repeat damage after a terminal tick',()=>{
  for(const phase of ['warning','projectile','pool']){
    const{game,boss}=fresh('mission-04');game.tick(.01);
    if(phase==='projectile')until(game,()=>game.hostileProjectiles.length>0);
    if(phase==='pool')until(game,()=>game.bossHazards.some(item=>item.phase==='active'));
    game.damageEnemy(boss,boss.hp);assert.equal(game.midBossDefeated,true);assert.equal(game.hostileProjectiles.length,0);assert.equal(game.bossHazards.length,0);
    game.player.invul=0;const hp=game.player.hp;advance(game,.5);assert.equal(game.player.hp,hp);assert.ok(game.snapshot());
  }
  const{game}=fresh('mission-04','final');game.player.invul=0;game.hurtPlayer(95);game.tick(.01);until(game,()=>game.state==='dead');
  assert.equal(game.player.hp,0);assert.equal(game.hostileProjectiles.length,0);assert.equal(game.bossHazards.length,0);assert.equal(game.events.filter(event=>event.type==='end').length,1);
  const terminal=JSON.stringify({result:game.result,time:game.time,player:game.player,events:game.events,particles:game.particles,texts:game.texts,random:game.random.getState(),visual:game.visualRandom.getState()});
  for(let i=0;i<100;i++)game.tick(.05);
  assert.equal(JSON.stringify({result:game.result,time:game.time,player:game.player,events:game.events,particles:game.particles,texts:game.texts,random:game.random.getState(),visual:game.visualRandom.getState()}),terminal);
});

test('sustained hit stun cannot push a boss cooldown outside the checkpoint contract',()=>{
  const{game,boss}=fresh();for(let i=0;i<30;i++){game.damageEnemy(boss,.1,{x:0,y:0});game.tick(.05);assert.ok(game.snapshot());}
  assert.equal(boss.skillCd,0);assert.equal(boss.attackState,'walk');advance(game,.1);assert.equal(boss.attackState,'windup');
  assert.ok(game.bossHazards.length<=MAX_BOSS_HAZARDS);assert.ok(game.hostileProjectiles.length<=MAX_HOSTILE_PROJECTILES);
});
