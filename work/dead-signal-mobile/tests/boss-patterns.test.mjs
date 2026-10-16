import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {MISSIONS,getBoss} from '../dist/campaign.js';
import {updateBossEffects} from '../dist/boss-combat.js';
import {ADDITIONAL_BOSS_SKILLS,BOSS_PATTERN_COLORS,warnAdditionalBoss,resolveAdditionalBoss,updateAdditionalBoss,updateBossHazards,bossDamageMultiplier} from '../dist/boss-patterns.js';

// These are explicit empty-floor unit fixtures. They use real Game spawns,
// collision movement, damage and checkpoints; the city route tests cover maps.
function fixture(kind,role='mid',seed=18541){
  const mission=MISSIONS.find(m=>getBoss(m.midBoss).skill.kind===kind);
  const game=new Game({seed,missionId:mission.id,stageDuration:1e6});
  game.world={...game.world,obstacles:[],decor:[],roads:[]};game.navigation=new Navigation(game.world);
  game.enemies=[];game.spawnClock=1e9;
  if(role==='final'){
    const mid=game.spawnMissionBoss('mid');game.damageEnemy(mid,mid.hp);game.enemies=game.enemies.filter(e=>!e.dead);
    game.pendingLevels=0;game.choices=[];
  }
  const e=game.spawnMissionBoss(role);assert.ok(e);
  game.move(e,900-e.x,930-e.y);e.skillCd=0;e.stun=0;e.vx=0;e.vy=0;
  game.player.maxHp=10000;game.player.hp=10000;game.player.invul=0;
  game.drainEvents();return{game,e,boss:getBoss(e.bossKey)};
}
function advance(f,seconds,{effects=true,projectiles=false}={}){
  for(let elapsed=0;elapsed<seconds-1e-8;){
    const dt=Math.min(.05,seconds-elapsed);f.game.player.invul=Math.max(0,f.game.player.invul-dt);
    f.e.skillCd-=dt;f.e.stun=Math.max(0,f.e.stun-dt);
    updateAdditionalBoss(f.game,f.e,f.boss,dt);
    if(projectiles)updateBossEffects(f.game,dt);else if(effects)updateBossHazards(f.game,dt);
    elapsed+=dt;
  }
}
function geometry(h){return{x:h.x,y:h.y,targetX:h.targetX,targetY:h.targetY,r:h.r,width:h.width,shape:h.shape,innerR:h.innerR||0};}
function movePlayer(game,p){game.move(game.player,p.x-game.player.x,p.y-game.player.y);assert.equal(game.blocked(game.player.x,game.player.y,game.player.r),false);}

test('nine additional skill families cover both roles with genuine warning geometry before harm',()=>{
  assert.equal(ADDITIONAL_BOSS_SKILLS.length,9);assert.equal(Object.isFrozen(ADDITIONAL_BOSS_SKILLS),true);
  let bosses=0;
  for(const kind of ADDITIONAL_BOSS_SKILLS)for(const role of ['mid','final']){
    const f=fixture(kind,role),hp=f.game.player.hp;
    assert.equal(updateAdditionalBoss(f.game,f.e,f.boss,0),true);
    assert.equal(f.e.attackState,'windup');assert.ok(f.game.bossHazards.length);
    for(const h of f.game.bossHazards){
      assert.equal(h.phase,'warning');assert.equal(h.kind,kind);assert.equal(h.ownerId,f.e.id);assert.equal(h.color,BOSS_PATTERN_COLORS[kind]);
      assert.ok(h.time>0&&h.time<=8);assert.ok(h.r>0&&h.r<=400);assert.ok(h.innerR>=0&&h.innerR<=h.r);
    }
    updateBossHazards(f.game,.05);assert.equal(f.game.player.hp,hp);bosses++;
  }
  assert.equal(bosses,18);
});

test('warning and active area/line geometry remain identical for every damaging hazard family',()=>{
  for(const kind of ['slam','beam','fire','mine','pull','storm'])for(const role of ['mid','final']){
    const f=fixture(kind,role);warnAdditionalBoss(f.game,f.e,f.boss);
    const before=new Map(f.game.bossHazards.map(h=>[h.id,geometry(h)]));resolveAdditionalBoss(f.game,f.e,f.boss);
    for(const h of f.game.bossHazards)h.time=.01;
    updateBossHazards(f.game,.02);
    assert.ok(f.game.bossHazards.length,`${kind}/${role}`);
    for(const h of f.game.bossHazards){assert.equal(h.phase,'active');assert.deepEqual(geometry(h),before.get(h.id));}
  }
});

test('final slam has a real second annulus, with a safe centre and damaging outer ring',()=>{
  const f=fixture('slam','final');warnAdditionalBoss(f.game,f.e,f.boss);
  assert.equal(f.game.bossHazards.length,2);const ring=f.game.bossHazards[1];
  assert.ok(ring.innerR>0);assert.equal(ring.innerR,f.boss.skill.radius);assert.ok(ring.time>f.game.bossHazards[0].time);
  f.game.bossHazards=[ring];resolveAdditionalBoss(f.game,f.e,f.boss);ring.time=.01;
  movePlayer(f.game,ring);const hp=f.game.player.hp;updateBossHazards(f.game,.02);assert.equal(f.game.player.hp,hp);
  movePlayer(f.game,{x:ring.x+(ring.r+ring.innerR)/2,y:ring.y});f.game.player.invul=0;updateBossHazards(f.game,.01);
  assert.ok(f.game.player.hp<hp);
});

test('shield protects only its facing arc while the actual guard is active',()=>{
  for(const role of ['mid','final']){
    const f=fixture('shield',role);warnAdditionalBoss(f.game,f.e,f.boss);resolveAdditionalBoss(f.game,f.e,f.boss);f.e.angle=0;
    assert.equal(bossDamageMultiplier(f.game,f.e,{x:f.e.x+100,y:f.e.y}),f.boss.skill.reduction);
    assert.equal(bossDamageMultiplier(f.game,f.e,{x:f.e.x-100,y:f.e.y}),1);
    assert.equal(bossDamageMultiplier(f.game,f.e,{x:f.e.x,y:f.e.y+100}),1);
    assert.equal(bossDamageMultiplier(f.game,f.e,null),1);
    const hp=f.e.hp;f.game.damageEnemy(f.e,100,null,{x:f.e.x+100,y:f.e.y});assert.ok(Math.abs(hp-f.e.hp-100*f.boss.skill.reduction)<1e-7);
    f.e.attackState='recover';assert.equal(bossDamageMultiplier(f.game,f.e,{x:f.e.x+100,y:f.e.y}),1);
  }
});

test('both leap roles land legally through Game.move and detonate only their announced landing circles',()=>{
  for(const role of ['mid','final']){
    const f=fixture('leap',role);warnAdditionalBoss(f.game,f.e,f.boss);const landing=f.game.bossHazards[0],expected=geometry(landing),hp=f.game.player.hp;
    advance(f,f.boss.skill.windup+f.boss.skill.duration+.05);
    assert.equal(f.game.blocked(f.e.x,f.e.y,f.e.r),false);assert.ok(Math.hypot(f.e.x-expected.x,f.e.y-expected.y)<1);
    assert.ok(f.game.player.hp<hp);assert.deepEqual(geometry(landing),expected);
    const w=fixture('leap',role);w.game.world.obstacles=[{id:++w.game.id,x:1100,y:500,w:8,h:900,kind:'fence',hp:Infinity,maxHp:Infinity,destroyed:false}];w.game.navigation=new Navigation(w.game.world);
    warnAdditionalBoss(w.game,w.e,w.boss);assert.ok(w.e.targetX<=1100-w.e.r+.01);const healthy=w.game.player.hp;
    advance(w,w.boss.skill.windup+w.boss.skill.duration+.05);assert.ok(w.e.x<=1100-w.e.r+.01);
    assert.equal(w.game.player.hp,healthy,'A landing cannot hurt through the fence');
  }
});

test('a new obstruction cancels a leap impact instead of creating unannounced damage',()=>{
  const f=fixture('leap');warnAdditionalBoss(f.game,f.e,f.boss);const hp=f.game.player.hp;
  f.game.world.obstacles=[{id:++f.game.id,x:1080,y:500,w:10,h:900,kind:'fence',destroyed:false}];f.game.navigation=new Navigation(f.game.world);
  advance(f,f.boss.skill.windup+f.boss.skill.duration+.2);
  assert.ok(f.e.x<1080);assert.equal(f.game.player.hp,hp);assert.equal(f.game.bossHazards.length,0);
});

test('beam warnings stop at walls and their actual damage obeys the exact clipped line',()=>{
  for(const role of ['mid','final']){
    const f=fixture('beam',role);movePlayer(f.game,{x:1400,y:930});
    f.game.world.obstacles=[{id:++f.game.id,x:1200,y:300,w:50,h:1200,kind:'building',destroyed:false}];f.game.navigation=new Navigation(f.game.world);
    warnAdditionalBoss(f.game,f.e,f.boss);for(const h of f.game.bossHazards)assert.ok(h.targetX<1200);
    const hp=f.game.player.hp;advance(f,f.boss.skill.windup+1);assert.equal(f.game.player.hp,hp);
    const open=fixture('beam',role);warnAdditionalBoss(open.game,open.e,open.boss);const h=open.game.bossHazards[0];
    movePlayer(open.game,{x:(h.x+h.targetX)/2,y:(h.y+h.targetY)/2});const before=open.game.player.hp;
    advance(open,open.boss.skill.windup+.05);assert.ok(open.game.player.hp<before);
  }
});

test('fire persists for its catalog duration and applies separated repeated damage ticks',()=>{
  const f=fixture('fire');warnAdditionalBoss(f.game,f.e,f.boss);const h=f.game.bossHazards.at(-1);movePlayer(f.game,h);
  advance(f,f.boss.skill.windup+.1);assert.equal(h.phase,'active');const first=f.game.player.hp;
  assert.ok(first<10000);advance(f,1.5);assert.ok(f.game.player.hp<first);
  assert.ok(f.game.events.filter(e=>e.type==='hurt').length>=3);assert.ok(f.game.bossHazards.some(h=>h.phase==='active'));
  f.e.skillCd=999;advance(f,f.boss.skill.duration+1);assert.equal(f.game.bossHazards.length,0);
});

test('mine circles remain harmless until their individual fuse expires',()=>{
  for(const role of ['mid','final']){
    const f=fixture('mine',role);warnAdditionalBoss(f.game,f.e,f.boss);const h=f.game.bossHazards[0];movePlayer(f.game,h);
    const hp=f.game.player.hp;advance(f,f.boss.skill.windup+f.boss.skill.duration-.1);assert.equal(f.game.player.hp,hp);
    assert.ok(f.game.bossHazards.every(h=>h.phase==='warning'));advance(f,.2);assert.ok(f.game.player.hp<hp);
    advance(f,.3);assert.equal(f.game.bossHazards.length,0);
  }
});

test('pull moves the player through collision-aware movement and deals its closing impact later',()=>{
  for(const role of ['mid','final']){
    const f=fixture('pull',role);if(role==='final')movePlayer(f.game,{x:f.e.x+230,y:f.e.y});
    warnAdditionalBoss(f.game,f.e,f.boss);const before={x:f.game.player.x,y:f.game.player.y,hp:f.game.player.hp};
    advance(f,f.boss.skill.windup+.1);assert.ok(f.game.player.x<before.x);assert.equal(f.game.player.hp,before.hp);
    advance(f,f.boss.skill.duration);assert.ok(f.game.player.hp<before.hp);assert.equal(f.game.blocked(f.game.player.x,f.game.player.y,f.game.player.r),false);
    const w=fixture('pull',role);if(role==='final')movePlayer(w.game,{x:w.e.x+230,y:w.e.y});
    w.game.world.obstacles=[{id:++w.game.id,x:1080,y:500,w:8,h:900,kind:'fence',destroyed:false}];w.game.navigation=new Navigation(w.game.world);
    warnAdditionalBoss(w.game,w.e,w.boss);const x=w.game.player.x,hp=w.game.player.hp;advance(w,w.boss.skill.windup+w.boss.skill.duration+.2);
    assert.equal(w.game.player.x,x);assert.equal(w.game.player.hp,hp,'A chain or suction cannot act across a wall');
  }
});

test('spread creates real fan projectiles and the final boss fires its second independently warned wave',()=>{
  for(const role of ['mid','final']){
    const f=fixture('spread',role);updateAdditionalBoss(f.game,f.e,f.boss,0);
    advance(f,f.boss.skill.windup+.05,{effects:false});assert.equal(f.game.hostileProjectiles.length,f.boss.skill.count);
    const angles=f.game.hostileProjectiles.map(p=>Math.atan2(p.vy,p.vx));for(let i=1;i<angles.length;i++)assert.ok(angles[i]>angles[i-1]);
    assert.ok(Math.abs(angles.at(-1)-angles[0]-f.boss.skill.spread)<1e-7);
    assert.ok(f.game.hostileProjectiles.every(p=>p.kind==='spread'&&p.r===f.boss.skill.radius&&p.damage>0));
    if(role==='final'){
      advance(f,f.boss.skill.recovery+.1,{effects:false});assert.equal(f.e.attackState,'windup');assert.equal(f.e.skillRepeats,0);assert.equal(f.game.bossHazards.length,9);
      advance(f,f.boss.skill.windup+.05,{effects:false});assert.equal(f.game.hostileProjectiles.length,18);
      assert.equal(f.game.events.filter(e=>e.type==='bossskill').length,2);
    }
  }
});

test('spread projectile sweeps hit players on an open lane and stop at solid walls',()=>{
  const f=fixture('spread');warnAdditionalBoss(f.game,f.e,f.boss);resolveAdditionalBoss(f.game,f.e,f.boss);
  const hp=f.game.player.hp;for(let i=0;i<32;i++){f.game.player.invul=Math.max(0,f.game.player.invul-.05);updateBossEffects(f.game,.05);}assert.ok(f.game.player.hp<hp);
  const w=fixture('spread');w.game.world.obstacles=[{id:++w.game.id,x:1080,y:500,w:8,h:900,kind:'fence',destroyed:false}];w.game.navigation=new Navigation(w.game.world);
  warnAdditionalBoss(w.game,w.e,w.boss);resolveAdditionalBoss(w.game,w.e,w.boss);const healthy=w.game.player.hp;
  for(let i=0;i<70;i++)updateBossEffects(w.game,.05);assert.equal(w.game.player.hp,healthy);assert.equal(w.game.hostileProjectiles.length,0);
});

test('storm uses deterministic saved RNG and genuinely staggered lightning circles',()=>{
  for(const role of ['mid','final']){
    const first=fixture('storm',role,33742),second=fixture('storm',role,33742);
    warnAdditionalBoss(first.game,first.e,first.boss);warnAdditionalBoss(second.game,second.e,second.boss);
    assert.deepEqual(first.game.bossHazards,second.game.bossHazards);assert.equal(first.game.random.getState(),second.game.random.getState());
    assert.equal(first.game.bossHazards.length,first.boss.skill.count);
    const times=first.game.bossHazards.map(h=>h.time);for(let i=1;i<times.length;i++)assert.ok(times[i]>times[i-1]);
    const hp=first.game.player.hp;advance(first,first.boss.skill.windup-.1);assert.equal(first.game.player.hp,hp);
    advance(first,.2);assert.ok(first.game.player.hp<hp);assert.ok(first.game.bossHazards.some(h=>h.phase==='warning'));
    assert.equal(first.game.bossHazards.filter(h=>h.phase==='active').length,1);
  }
});

test('paused attacks freeze, stunned warnings wait, dead owners purge and terminal hazards cannot keep hurting',()=>{
  const f=fixture('fire');warnAdditionalBoss(f.game,f.e,f.boss);const raw=JSON.stringify(f.game.bossHazards),time=f.e.attackTime;
  f.game.state='paused';advance(f,.5);assert.equal(JSON.stringify(f.game.bossHazards),raw);assert.equal(f.e.attackTime,time);
  f.game.state='playing';f.e.stun=5;advance(f,.4);assert.equal(JSON.stringify(f.game.bossHazards),raw);assert.equal(f.e.attackTime,time);
  f.e.stun=0;advance(f,f.boss.skill.windup+.1);assert.ok(f.game.bossHazards.some(h=>h.phase==='active'));
  f.game.killEnemy(f.e);assert.equal(f.game.bossHazards.length,0);assert.equal(f.game.hostileProjectiles.length,0);
  const end=fixture('fire');warnAdditionalBoss(end.game,end.e,end.boss);end.game.state='dead';const hp=end.game.player.hp;
  updateBossHazards(end.game,10);assert.equal(end.game.player.hp,hp);assert.deepEqual(end.game.bossHazards,[]);assert.deepEqual(end.game.hostileProjectiles,[]);
});

test('hazard and projectile queues stay within caps even under repeated casts',()=>{
  const fire=fixture('fire','final');movePlayer(fire.game,{x:2100,y:1500});
  for(let i=0;i<30;i++){
    warnAdditionalBoss(fire.game,fire.e,fire.boss);resolveAdditionalBoss(fire.game,fire.e,fire.boss);
    for(const h of fire.game.bossHazards)if(h.phase==='warning')h.time=.001;
    updateBossHazards(fire.game,.002);assert.ok(fire.game.bossHazards.length<=48);
  }
  assert.equal(fire.game.bossHazards.length,48);
  const fan=fixture('spread','final');for(let i=0;i<30;i++){warnAdditionalBoss(fan.game,fan.e,fan.boss);resolveAdditionalBoss(fan.game,fan.e,fan.boss);assert.ok(fan.game.hostileProjectiles.length<=120);}
  assert.equal(fan.game.hostileProjectiles.length,120);
});

test('all eighteen bosses resume warning and active combat through strict actual checkpoints',()=>{
  for(const kind of ADDITIONAL_BOSS_SKILLS)for(const role of ['mid','final']){
    const f=fixture(kind,role);updateAdditionalBoss(f.game,f.e,f.boss,0);
    const warning=f.game.snapshot();assert.ok(warning,`${kind}/${role} warning snapshot`);
    const copy=Game.restore(warning,{resumePlaying:true});assert.ok(copy,`${kind}/${role} warning restore`);assert.deepEqual(copy.snapshot(),warning);
    advance(f,f.boss.skill.windup+.1);
    const active=f.game.snapshot();assert.ok(active,`${kind}/${role} active snapshot`);
    const resumed=Game.restore(active,{resumePlaying:true});assert.ok(resumed,`${kind}/${role} active restore`);assert.deepEqual(resumed.snapshot(),active);
  }
});

test('full Game.tick dispatches all eighteen additional bosses into their actual patterns',()=>{
  for(const kind of ADDITIONAL_BOSS_SKILLS)for(const role of ['mid','final']){
    const f=fixture(kind,role);f.game.player.invul=9999;f.game.tick(.05);
    assert.equal(f.e.attackState,'windup',`${kind}/${role}`);assert.ok(f.game.bossHazards.length);
    for(let i=0;i<120;i++)f.game.tick(.05);
    assert.ok(f.game.events.some(e=>e.type==='bossskill'&&e.kind===kind));assert.equal(f.game.blocked(f.e.x,f.e.y,f.e.r),false);
  }
});
