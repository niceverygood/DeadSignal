import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {BOSS_CATALOG,getBoss} from '../dist/campaign.js';
import {MAX_BOSS_HAZARDS,MAX_HOSTILE_PROJECTILES} from '../dist/boss-combat.js';

const originalURL=new URL('../../../qa/boss-motion-20261018/engine-before-boss-hit.txt',import.meta.url);
const engineURL=new URL('../dist/engine.js',import.meta.url),originalBytes=readFileSync(originalURL);
assert.equal(createHash('sha256').update(originalBytes).digest('hex'),'4fa744ce8b245b8bcc5219214c881cbb73354bcfeed4357ac83929e714862b43','independently preserved full engine before the boss-hit policy');
const originalSource=originalBytes.toString('utf8').replace(/(from\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,(_all,prefix,specifier,suffix)=>prefix+new URL(specifier,engineURL).href+suffix);
const {Game:OriginalGame}=await import('data:text/javascript;base64,'+Buffer.from(originalSource).toString('base64'));
const DT=1/60,manual={shoot:false,fireMode:'manual',moveX:0,moveY:0};

// Empty, valid combat space isolates the hit policy from map layout. The
// optional invulnerability is confined to long catalogue/restore fixtures;
// the real sustained-nailgun reproduction below uses ordinary HP and invul0.
function fresh(Class=Game,catalog=getBoss('boss-01-final'),{safe=false,weapon='nailgun'}={}){
 const game=new Class({seed:774,missionId:catalog.missionId,weapon,stageDuration:1e9});
 game.enemies=[];game.world.obstacles=[];game.world.decor=[];game.navigation=new Navigation(game.world);game.spawnClock=1e9;
 game.player.x=1000;game.player.y=900;game.player.invul=safe?9999:0;
 let boss=game.spawnMissionBoss('mid');assert.ok(boss);
 if(catalog.role==='final'){game.damageEnemy(boss,boss.hp);boss=game.spawnMissionBoss('final');assert.ok(boss);}
 game.move(boss,1400-boss.x,900-boss.y);game.drainEvents();assert.equal(boss.bossKey,catalog.id);assert.ok(game.snapshot());
 return {game,boss};
}
function observe(game){
 const snapshot=game.snapshot();assert.ok(snapshot,'normal live checkpoint remains valid');
 return {snapshot,random:game.random.getState(),visualRandom:game.visualRandom.getState(),particles:structuredClone(game.particles),texts:structuredClone(game.texts),links:structuredClone(game.links),events:structuredClone(game.events),shake:game.shake,flash:game.flash};
}
function policyFieldsRemoved(value,bossId){
 const copy=structuredClone(value),boss=copy.snapshot.enemies.find(enemy=>enemy.id===bossId);assert.ok(boss);
 delete boss.vx;delete boss.vy;delete boss.stun;return copy;
}
function hit(game,boss,damage=.1){game.damageEnemy(boss,damage,{x:45,y:-12},{x:game.player.x,y:game.player.y});}

test('all24 campaign bosses retain damage, flash, impact particles, events and both RNGs from the full original; only ordinary impulse/stun refresh changes',()=>{
 assert.equal(BOSS_CATALOG.length,24);
 for(const catalog of BOSS_CATALOG){
  const old=fresh(OriginalGame,catalog),next=fresh(Game,catalog);
  for(const fixture of [old,next])Object.assign(fixture.boss,{vx:13.25,vy:-7.5,stun:.21});
  const hp=next.boss.hp;hit(old.game,old.boss);hit(next.game,next.boss);
  assert.deepEqual(policyFieldsRemoved(observe(next.game),next.boss.id),policyFieldsRemoved(observe(old.game),old.boss.id),catalog.id+' complete damage/effect oracle');
  assert.equal(next.boss.hp,old.boss.hp);assert.ok(next.boss.hp<hp);assert.equal(next.boss.hitFlash,.12);
  assert.deepEqual([next.boss.vx,next.boss.vy,next.boss.stun],[13.25,-7.5,.21],catalog.id+' explicit pre-existing state is retained');
  assert.deepEqual([old.boss.vx,old.boss.vy,old.boss.stun],[58.25,-19.5,.09],catalog.id+' original refresh is independently reproduced');
  assert.equal(next.game.events.at(-1).type,'hit');assert.equal(next.game.events.at(-1).weapon,'nailgun');
  assert.ok(next.game.particles.some(p=>p.kind==='weapon-impact'&&p.targetId===next.boss.id));
  assert.ok(next.game.particles.some(p=>p.kind==='blood'||p.kind==='spark'));
 }
});

function sustainedNailgun(Class){
 const {game,boss}=fresh(Class);game.move(boss,1200-boss.x,900-boss.y);boss.skillCd=0;game.upgrades.haste=2;
 const hp=boss.hp,origin={x:boss.x,y:boss.y},hitTicks=[],events=[];let firstHitAttackTime=null,minStunAfterFirst=Infinity,impactFrames=0;
 for(let frame=0;frame<110;frame++){
  assert.equal(game.state,'playing','ordinaryHP sustained-fire fixture remains alive');
  game.tick(DT,{...manual,shoot:true,aimX:boss.x,aimY:boss.y});
  const emitted=game.drainEvents();events.push(...emitted);
  if(emitted.some(event=>event.type==='hit')){hitTicks.push(frame);firstHitAttackTime??=boss.attackTime;}
  if(hitTicks.length)minStunAfterFirst=Math.min(minStunAfterFirst,boss.stun);
  if(game.particles.some(p=>p.kind==='weapon-impact'&&p.targetId===boss.id))impactFrames++;
  assert.ok(game.snapshot());
 }
 return {game,boss,hp,origin,hitTicks,events,firstHitAttackTime,minStunAfterFirst,impactFrames};
}
test('real60Hz haste2 nailgun reproduces the original five-tick permanent hit lock; normal bossHP candidate warns, attacks and moves while retaining impacts',()=>{
 const old=sustainedNailgun(OriginalGame),next=sustainedNailgun(Game);
 assert.ok(old.hitTicks.length>=18,'real original bullet collisions occur throughout the first magazine');
 assert.ok(old.hitTicks.slice(1).every((frame,index)=>frame-old.hitTicks[index]===5),'five60Hz ticks are shorter than original .09s hit stun');
 assert.ok(old.minStunAfterFirst>0);assert.equal(old.boss.attackState,'windup');assert.equal(old.boss.attackTime,old.firstHitAttackTime);
 assert.deepEqual({x:old.boss.x,y:old.boss.y},old.origin);assert.equal(old.events.some(event=>event.type==='bossskill'),false);
 assert.ok(next.hitTicks.length>=10);assert.ok(next.boss.hp<next.hp);assert.equal(next.boss.stun,0);
 assert.ok(next.events.some(event=>event.type==='bosswarn'));assert.ok(next.events.some(event=>event.type==='bossskill'));
 assert.ok(Math.hypot(next.boss.x-next.origin.x,next.boss.y-next.origin.y)>20,'actual charge movement is no longer locked by bullets');
 for(const result of [old,next]){assert.ok(result.impactFrames>20);assert.ok(result.events.filter(event=>event.type==='hit').every(event=>event.weapon==='nailgun'&&!event.lethal));assert.equal(result.game.player.maxHp,100);assert.ok(result.game.player.hp>0);assert.ok(result.game.player.invul<=.7,'no survival invulnerability fixture is used here');}
});

test('all24 bosses walk and complete real skills under repeated low damage, with bounded hazards and exact restored same-schedule checkpoints/RNG/events',()=>{
 for(const catalog of BOSS_CATALOG){
  const seed=fresh(Game,catalog,{safe:true});seed.boss.skillCd=.35;
  const snapshot=seed.game.snapshot(),a=Game.restore(snapshot,{resumePlaying:true}),b=Game.restore(snapshot,{resumePlaying:true});assert.ok(a&&b);
  const origin={x:a.boss.x,y:a.boss.y},events=[];let walkingDistance=0,warningClock=null,progressedWarning=false;
  for(let frame=0;frame<192;frame++){
   if(frame%5===0){hit(a,a.boss);hit(b,b.boss);}
   a.tick(DT,manual);b.tick(DT,manual);
   const ae=a.drainEvents(),be=b.drainEvents();assert.deepEqual(ae,be,catalog.id+' event sequence frame'+frame);events.push(...ae);
   assert.equal(a.state,'playing');assert.equal(a.boss.stun,0);assert.equal(a.boss.vx,0);assert.equal(a.boss.vy,0);
   if(frame===15)walkingDistance=Math.hypot(a.boss.x-origin.x,a.boss.y-origin.y);
   if(a.boss.attackState==='windup'){if(warningClock===null)warningClock=a.boss.attackTime;else if(a.boss.attackTime<warningClock)progressedWarning=true;}
   assert.ok(a.boss.skillCd>=0&&a.boss.skillCd<=60);assert.ok(a.bossHazards.length<=MAX_BOSS_HAZARDS);assert.ok(a.hostileProjectiles.length<=MAX_HOSTILE_PROJECTILES);
   const ac=a.snapshot(),bc=b.snapshot();assert.ok(ac&&bc,catalog.id+' live checkpoint frame'+frame);assert.deepEqual(ac,bc,catalog.id+' exact checkpoint frame'+frame);
   if(frame%24===0||frame===191)assert.deepEqual(observe(a),observe(b),catalog.id+' full effects/RNG frame'+frame);
  }
  assert.ok(walkingDistance>1,catalog.id+' walks before its real warning');assert.ok(progressedWarning,catalog.id+' warning countdown progresses despite repeated hits');
  assert.ok(events.some(event=>event.type==='bosswarn'&&event.bossKey===catalog.id));assert.ok(events.some(event=>event.type==='bossskill'&&event.bossKey===catalog.id),catalog.id+' real skill resolves');
  assert.equal(events.filter(event=>event.type==='hit').length,39,catalog.id+' every deliberate hit remains observable');
 }
});

test('explicit stun is neither shortened nor refreshed by ordinary boss hits, survives mid-warning restore, and continues to stop the original windup',()=>{
 for(const catalog of BOSS_CATALOG){
  const fixture=fresh(Game,catalog,{safe:true});fixture.boss.skillCd=0;fixture.game.tick(DT,manual);assert.equal(fixture.boss.attackState,'windup');
  fixture.boss.stun=.21;fixture.boss.vx=17;fixture.boss.vy=-9;
  const saved=fixture.game.snapshot(),a=Game.restore(saved,{resumePlaying:true}),b=Game.restore(saved,{resumePlaying:true});assert.ok(a&&b);
  const beforeTime=a.boss.attackTime,position=[a.boss.x,a.boss.y];
  for(let frame=0;frame<32;frame++){
   if(frame%5===0){const stun=a.boss.stun;hit(a,a.boss);hit(b,b.boss);assert.equal(a.boss.stun,stun,catalog.id+' does not reset a real stun');}
   const vx=a.boss.vx,vy=a.boss.vy;a.tick(DT,manual);b.tick(DT,manual);
   assert.equal(a.boss.vx,vx*Math.exp(-DT*9),catalog.id+' busy-path impulse decays exactly once');assert.equal(a.boss.vy,vy*Math.exp(-DT*9));
   if(frame<11){assert.equal(a.boss.attackTime,beforeTime);assert.deepEqual([a.boss.x,a.boss.y],position);}
   assert.deepEqual(observe(a),observe(b),catalog.id+' restore preserves stun/attack/effect schedule frame'+frame);
  }
  assert.equal(a.boss.stun,0);assert.ok(a.boss.attackTime<beforeTime,'real warning resumes once explicit stun ends');
 }
});

test('walking bosses keep the full original impulse movement and one common-path decay; busy bosses decay a saved impulse once without moving it',()=>{
 for(const catalog of BOSS_CATALOG){
  const old=fresh(OriginalGame,catalog,{safe:true}),next=fresh(Game,catalog,{safe:true});
  for(const fixture of [old,next])Object.assign(fixture.boss,{skillCd:4,vx:17.25,vy:-9.5});
  old.game.tick(DT,manual);next.game.tick(DT,manual);
  assert.deepEqual(observe(next.game),observe(old.game),catalog.id+' original common walking path');
  assert.equal(next.boss.vx,17.25*Math.exp(-DT*9));assert.equal(next.boss.vy,-9.5*Math.exp(-DT*9));
  for(const fixture of [old,next]){fixture.boss.skillCd=0;fixture.game.tick(DT,manual);Object.assign(fixture.boss,{vx:17.25,vy:-9.5});}
  const position=[next.boss.x,next.boss.y];old.game.tick(DT,manual);next.game.tick(DT,manual);
  assert.equal(old.boss.vx,17.25);assert.equal(old.boss.vy,-9.5,'the independently saved engine skipped busy-path decay');
  assert.equal(next.boss.vx,17.25*Math.exp(-DT*9));assert.equal(next.boss.vy,-9.5*Math.exp(-DT*9));assert.deepEqual([next.boss.x,next.boss.y],position);
  assert.deepEqual(policyFieldsRemoved(observe(next.game),next.boss.id),policyFieldsRemoved(observe(old.game),old.boss.id),catalog.id+' busy phase only changes saved impulse decay');
 }
});

test('all seven noncampaign enemy types retain exact original hit-stun, knockback, walls, real bullets, events, effects, checkpoints and both RNG traces',()=>{
 for(const type of ['walker','runner','shield','screamer','gas','elite','collector']){
  const make=Class=>{const game=new Class({seed:774,weapon:'nailgun',stageDuration:1e9});game.enemies=[];game.world.obstacles=[];game.world.decor=[];game.navigation=new Navigation(game.world);game.spawnClock=1e9;game.player.x=1000;game.player.y=900;
   game.world.obstacles.push({id:++game.id,x:1110,y:850,w:20,h:100,kind:'building',hp:Infinity,maxHp:Infinity,destroyed:false});game.navigation.invalidate();
   const enemy=game.spawnEnemy(type,260,{x:1260,y:900});assert.ok(enemy);enemy.skillCd=.15;game.drainEvents();assert.ok(game.snapshot());return{game,enemy};};
  const old=make(OriginalGame),next=make(Game);let wallHits=0;
  for(let frame=0;frame<96;frame++){
   if(frame%5===0){hit(old.game,old.enemy);hit(next.game,next.enemy);assert.equal(next.enemy.stun,.09);assert.equal(next.enemy.vx,old.enemy.vx);assert.equal(next.enemy.vy,old.enemy.vy);}
   const input={...manual,shoot:true,aimX:1260,aimY:900};old.game.tick(DT,input);next.game.tick(DT,input);
   assert.deepEqual(observe(next.game),observe(old.game),type+' full original trace frame'+frame);
   const ae=old.game.drainEvents(),be=next.game.drainEvents();assert.deepEqual(be,ae);wallHits+=be.filter(event=>event.type==='wall-hit').length;
  }
  assert.ok(wallHits>0,type+' actual bullet/wall collision exercised');
 }
});
