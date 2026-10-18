import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game,UPGRADES,WEAPONS} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {EQUIPMENT} from '../dist/equipment.js';
import {effectivePlayerSpeed} from '../dist/player-movement.js?v=0.29.0';
import {
 getUpgradeValue,getUpgradeDisplay,getUpgradeCharacterStats,getBulletDamage,
 getPelletCount,getFireInterval,getReloadDuration,getShockTargets,
 getShockDamageMultiplier,getVolatileDamage,getStoredMoveSpeed,getMagnetRange
} from '../dist/upgrade-model.js';
import oldCampaign from './fixtures/campaign-v017-equipmentless.json' with {type:'json'};
import oldLegacy from './fixtures/legacy-v016-checkpoint.json' with {type:'json'};

// The full pre-change engine, including its own original constants/formulas,
// is the low-rank oracle. Only relative import locations are rebased.
const beforeURL=new URL('../../../qa/upgrade-status-20261018/engine-before-unbounded-upgrades.txt',import.meta.url);
const before=await readFile(beforeURL);
assert.equal(createHash('sha256').update(before).digest('hex'),'3551287930debc315d25fd6ef9c5c51e0bf41af98f22f872ea485e5a6888df79');
const engineURL=new URL('../dist/engine.js',import.meta.url);
const originalSource=before.toString('utf8').replace(/from\s*(['"])(\.[^'"]+)\1/g,(_all,quote,specifier)=>`from ${quote}${new URL(specifier,engineURL).href}${quote}`);
const original=await import(`data:text/javascript;base64,${Buffer.from(originalSource).toString('base64')}`);

function loadout(entries){
 const items={},equipped={weapon:null,armor:null,utility:null};
 for(const [id,rank] of entries){items[id]=rank;equipped[EQUIPMENT.find(item=>item.id===id).slot]=id;}
 return {chips:20000,items,equipped,testChipsClaimed:true};
}
const rapid=()=>loadout([['storm-magazine',5],['quarantine-armor',5],['survival-core',5]]);
function arena(Class=Game,options={}){
 const game=new Class({seed:19341,missionId:'mission-01',stageDuration:1e9,...options});
 // A controlled clear arena uses real Navigation, spawn validation and AI.
 // No health, invulnerability, velocity or collision method is replaced.
 game.enemies=[];game.spawnClock=1e9;game.world.obstacles=[];game.world.decor=[];
 game.navigation=new Navigation(game.world);game.player.x=1000;game.player.y=900;
 game.alarm.count=2;game.drainEvents();return game;
}
function choose(game,id){
 const definition=UPGRADES.find(upgrade=>upgrade.id===id);assert.ok(definition);
 game.pendingLevels=1;game.state='upgrade';game.choices=[definition];
 assert.equal(game.chooseUpgrade(id),true);assert.equal(game.pendingLevels,0);
 assert.equal(game.state,'playing');
}
function rankAll(game,rank){
 for(const definition of UPGRADES){
  for(let previous=game.upgrades[definition.id]||0;previous<rank;previous++)choose(game,definition.id);
 }
 game.drainEvents();
}
function checkpoint(game){const value=game.snapshot();assert.ok(value,'the actual live run must remain a valid checkpoint');return value;}
function capture(game){
 return JSON.stringify({checkpoint:checkpoint(game),events:game.events,particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash,random:game.random.getState(),visual:game.visualRandom.getState()});
}
function clone(value){return JSON.parse(JSON.stringify(value));}
function resumeChoices(game){while(game.state==='upgrade')assert.equal(game.chooseUpgrade(game.choices[0].id),true);}

test('original constants, every early rank and seeded real combat stay exact against the frozen full engine',()=>{
 assert.deepEqual(WEAPONS,original.WEAPONS);assert.deepEqual(UPGRADES,original.UPGRADES);
 for(const weapon of ['shotgun','nailgun'])for(const legacyRanks of [false,true]){
  const options={weapon,seed:774,equipment:rapid(),training:{armor:3,magazine:3}};
  const old=arena(original.Game,options),current=arena(Game,options);
  for(const game of [old,current]){
   if(legacyRanks)for(const definition of UPGRADES)for(let rank=0;rank<definition.max;rank++)choose(game,definition.id);
   for(let index=0;index<7;index++){
    const enemy=game.spawnEnemy(index===6?'shield':'walker',0,{x:1390+index*32,y:850+(index%3)*28});
    assert.ok(enemy);enemy.speed=0;
   }
   game.drainEvents();
  }
  assert.equal(capture(current),capture(old));
  for(let frame=0;frame<120;frame++){
   const input={shoot:true,aimX:1550,aimY:900,moveY:frame<12?-1:0,dash:frame===1,reload:frame===80};
   if(frame===45)Object.assign(input,{molotov:true,targetX:1800,targetY:1400});
   if(frame===85)Object.assign(input,{lure:true,targetX:1000,targetY:1250});
   old.tick(1/120,input);current.tick(1/120,input);
   assert.equal(capture(current),capture(old),`${weapon}/legacy=${legacyRanks}/frame=${frame}`);
  }
  assert.ok(current.events.some(event=>event.type==='shot'));
  assert.ok(current.events.some(event=>event.type==='hit'));
  assert.ok(current.events.some(event=>event.type==='fire-throw'));
 }
 for(const id of ['health','speed']){
  const old=arena(original.Game),current=arena();
  for(let rank=1;rank<=3;rank++){
   choose(old,id);choose(current,id);assert.equal(capture(current),capture(old));
  }
 }
 // All original eligible pools and RNG order are identical before any old cap.
 for(const seed of [9,181803]){
  const old=arena(original.Game,{seed}),current=arena(Game,{seed});
  old.pendingLevels=current.pendingLevels=1;old.showUpgrade();current.showUpgrade();
  assert.equal(capture(current),capture(old));
 }
});

test('each skill can be selected 1000 times and an all-old-caps or high-rank queued choice restores intact',()=>{
 const game=arena();rankAll(game,1000);
 for(const definition of UPGRADES)assert.equal(game.upgrades[definition.id],1000);
 assert.ok(game.player.maxHp>160);assert.ok(game.player.hp>160);assert.ok(game.player.speed>214*1.36);
 for(const rank of ['legacy',100,1000]){
  const raw=checkpoint(game);
  for(const definition of UPGRADES)raw.upgrades[definition.id]=rank==='legacy'?definition.max:rank;
  raw.state='upgrade';raw.pendingLevels=3;raw.choices=['pierce','haste','health'];
  const copy=Game.restore(raw,{resumePlaying:true});assert.ok(copy);
  assert.equal(copy.state,'upgrade');assert.deepEqual(copy.choices.map(choice=>choice.id),raw.choices);
  assert.equal(copy.pendingLevels,3);assert.deepEqual(copy.upgrades,raw.upgrades);
  const previous=copy.upgrades.pierce;assert.equal(copy.chooseUpgrade('pierce'),true);
  assert.equal(copy.upgrades.pierce,previous+1);assert.equal(copy.pendingLevels,2);
  assert.equal(copy.state,'upgrade');assert.equal(copy.choices.length,3);
  assert.equal(new Set(copy.choices.map(choice=>choice.id)).size,3);checkpoint(copy);
 }
 game.pendingLevels=1;game.showUpgrade();assert.equal(game.choices.length,3);
 const offered=game.choices[0].id;assert.equal(game.chooseUpgrade(offered),true);
 assert.equal(game.upgrades[offered],1001);checkpoint(game);
});

test('levels and queued choices continue beyond former save limits without XP overflow or partial writes',()=>{
 const game=arena();game.player.level=9999;game.player.xp=0;game.player.xpNext=1e12;
 game.gainXP(3e12);assert.equal(game.player.level,10002);assert.equal(game.pendingLevels,3);
 assert.equal(game.player.xp,0);assert.equal(game.player.xpNext,1e12);
 game.tick(0);assert.equal(game.state,'upgrade');const first=checkpoint(game);
 assert.ok(Game.restore(first));resumeChoices(game);
 game.gainXP(9e15);assert.equal(game.player.level,19002);assert.equal(game.pendingLevels,9000);
 assert.equal(game.player.xpNext,1e12);assert.equal(game.player.xp,0);game.tick(0);
 const high=checkpoint(game),restored=Game.restore(high);assert.ok(restored);
 assert.equal(restored.player.level,19002);assert.equal(restored.pendingLevels,9000);
 const stable=JSON.stringify({player:game.player,pending:game.pendingLevels,rng:game.random.getState(),visual:game.visualRandom.getState()});
 for(const invalid of [-1,NaN,Infinity,-Infinity,Number.MAX_VALUE,'10',null]){
  game.gainXP(invalid);assert.equal(JSON.stringify({player:game.player,pending:game.pendingLevels,rng:game.random.getState(),visual:game.visualRandom.getState()}),stable);
 }
 game.state='playing';game.choices=[];game.pendingLevels=0;game.player.level=Number.MAX_SAFE_INTEGER;
 const precision=JSON.stringify(game.player);game.gainXP(1e12);
 assert.equal(JSON.stringify(game.player),precision);assert.equal(game.pendingLevels,0);
});

test('high ranks grant actual finite benefits and the shared current/next UI model reads the real weapon numbers',()=>{
 for(const weapon of ['shotgun','nailgun']){
  const game=arena(Game,{weapon,equipment:rapid()});rankAll(game,100);
  const lower={damage:getBulletDamage(game),interval:getFireInterval(game),reload:getReloadDuration(game),speed:game.player.speed,maxHp:game.player.maxHp,magnet:getMagnetRange(game),shock:getShockDamageMultiplier(game.upgrades),volatile:getVolatileDamage(game.upgrades),fire:getUpgradeValue(game.upgrades,'fire')};
  rankAll(game,1000);
  assert.ok(getBulletDamage(game)>lower.damage);assert.ok(getFireInterval(game)<lower.interval);
  assert.ok(getReloadDuration(game)<lower.reload);assert.ok(game.player.speed>lower.speed);
  assert.ok(game.player.maxHp>lower.maxHp);assert.ok(getMagnetRange(game)>lower.magnet);
  assert.ok(getShockDamageMultiplier(game.upgrades)>lower.shock);assert.ok(getVolatileDamage(game.upgrades)>lower.volatile);
  assert.ok(getUpgradeValue(game.upgrades,'fire')>lower.fire);
  for(const id of ['reload','shock','volatile','knockback']){
   const before=getUpgradeValue({...game.upgrades,[id]:100},id);assert.ok(getUpgradeValue(game.upgrades,id)>before);
  }
  assert.equal(getPelletCount(game),weapon==='shotgun'?16:6);assert.equal(getUpgradeValue(game.upgrades,'pierce'),7);
  assert.equal(getShockTargets(game.upgrades),8);
  const before=capture(game),stats=getUpgradeCharacterStats(game);
  for(const value of Object.values(stats))assert.ok(Number.isFinite(value));
  assert.equal(stats.moveSpeed,effectivePlayerSpeed(game.player));assert.equal(stats.fireInterval,getFireInterval(game));
  for(const definition of UPGRADES){
   const display=getUpgradeDisplay(game,definition.id);assert.equal(display.rank,1000);assert.equal(display.nextRank,1001);
   assert.ok(display.currentEffects.length);assert.ok(display.nextEffects.length);
   assert.match(display.summary,/단계 제한 없음/);assert.doesNotMatch(JSON.stringify(display),/1000\s*\/\s*[238]/);
   assert.notDeepEqual(display.nextEffects,display.currentEffects,`${definition.id} must disclose a real next benefit`);
  }
  assert.equal(capture(game),before,'status reads must not tick, mutate or consume either RNG stream');
  game.shoot();assert.equal(game.bullets.length,stats.pellets);
  for(const bullet of game.bullets)assert.equal(bullet.damage,stats.bulletDamage);
  assert.equal(game.player.fireTime,stats.fireInterval);game.reload();assert.equal(game.player.reloadTime,stats.reloadDuration);
 }
});

test('actual maximum-rate fire retains bounded projectiles and finite resumable state at ranks 100, 1000 and safe precision edge',t=>{
 const maxima=[];
 for(const weapon of ['shotgun','nailgun'])for(const rank of [100,1000,Number.MAX_SAFE_INTEGER]){
  const game=arena(Game,{weapon,equipment:rapid(),training:{armor:3,magazine:3}});
  for(const definition of UPGRADES)game.upgrades[definition.id]=rank;
  game.player.speed=getStoredMoveSpeed(rank,game.equipmentStats.movement);
  let maximum=0,shots=0;
  for(let frame=0;frame<960;frame++){
   const before=game.events.length;game.tick(1/120,{shoot:true,aimX:2300,aimY:900});
   shots+=game.events.slice(before).filter(event=>event.type==='shot').length;
   maximum=Math.max(maximum,game.bullets.length);assert.ok(game.bullets.length<=300);assert.ok(game.particles.length<=850);
   assert.equal(game.state,'playing');
   for(const key of ['fireTime','reloadTime','speed'])assert.ok(Number.isFinite(game.player[key])&&game.player[key]>=0);
   if(frame%120===0)checkpoint(game);
  }
  assert.ok(shots>10);assert.ok(maximum>0);assert.ok(game.events.some(event=>event.type==='loaded'));
  assert.ok(getFireInterval(game)>0);assert.ok(getReloadDuration(game)>0);
  assert.equal(getPelletCount(game),weapon==='shotgun'?16:6);
  for(const bullet of game.bullets){assert.ok(bullet.pierce<=7);assert.ok(bullet.hits.size<=8);assert.ok(Number.isFinite(bullet.damage));}
  assert.ok(Game.restore(checkpoint(game)));maxima.push({weapon,rank,maximum,shots});
 }
 t.diagnostic(JSON.stringify(maxima));
});

test('rank-1000 shots, chained hits and Molotov run with 180 real enemies while existing count limits and checkpoints hold',t=>{
 const game=arena(Game,{weapon:'nailgun',equipment:rapid()});rankAll(game,1000);
 for(let index=0;index<180;index++)assert.ok(game.spawnEnemy('walker',0,{x:1320+(index%15)*26,y:715+Math.floor(index/15)*28}));
 const originalChain=game.chain;let chains=0,largestChain=0,maxParticles=0,maxBullets=0;
 game.chain=function(...args){const before=this.links.length;const result=Reflect.apply(originalChain,this,args);const added=this.links.length-before;largestChain=Math.max(largestChain,added);if(added)chains++;assert.ok(added<=8);return result;};
 // Exercise the real seeded proc/nearest-target chain before rank-1000
 // projectile damage and volatile fire remove its neighbours. This is an
 // explicit low-damage public-action probe, not a claim about a bullet hit.
 for(let attempt=0;attempt<20&&chains===0;attempt++)game.chain(game.enemies[0],.1);
 assert.ok(chains>0);assert.equal(largestChain,8);
 assert.equal(game.throwFire(1500,950),true);
 for(let frame=0;frame<240;frame++){
  game.tick(1/120,{shoot:true,aimX:1450,aimY:900});resumeChoices(game);
  assert.equal(game.state,'playing');assert.ok(game.enemies.length<=210);assert.ok(game.particles.length<=850);assert.ok(game.bullets.length<=300);
  maxParticles=Math.max(maxParticles,game.particles.length);maxBullets=Math.max(maxBullets,game.bullets.length);
  if(frame%30===0)checkpoint(game);
 }
 assert.ok(game.events.some(event=>event.type==='fire'));assert.ok(game.events.some(event=>event.type==='hit'));
 assert.ok(game.kills>0);assert.ok(chains>0);assert.ok(largestChain>0);assert.ok(Game.restore(checkpoint(game)));
 t.diagnostic(JSON.stringify({chains,largestChain,kills:game.kills,maxParticles,maxBullets}));
});

test('legacy saves remain valid and unbounded ranks do not weaken corruption or structural-count validation',()=>{
 for(const fixture of [oldCampaign,oldLegacy]){
  const old=original.Game.restore(clone(fixture)),current=Game.restore(clone(fixture));assert.ok(old);assert.ok(current);
  assert.deepEqual(current.snapshot(),old.snapshot());
 }
 const game=arena(Game,{weapon:'nailgun'});game.upgrades.pierce=1000;game.shoot();
 const valid=checkpoint(game);assert.equal(valid.bullets[0].pierce,7);assert.ok(Game.restore(valid));
 for(const rank of [0,-1,.5,Number.MAX_SAFE_INTEGER+1,NaN,Infinity,'1000',null]){
  const raw=clone(valid);raw.upgrades.damage=rank;assert.equal(Game.restore(raw),null,`rank ${String(rank)} must be rejected`);
 }
 for(const mutate of [
  raw=>{raw.upgrades.unknown=1;},raw=>{raw.bullets[0].pierce=8;},
  raw=>{raw.bullets[0].hits=Array.from({length:9},(_,index)=>index+1);},
  raw=>{raw.pendingLevels=-1;},raw=>{raw.pendingLevels=.5;},
  raw=>{raw.player.level=Number.MAX_SAFE_INTEGER+1;},
  raw=>{raw.state='upgrade';raw.pendingLevels=1;raw.choices=['damage','damage'];},
  raw=>{raw.state='upgrade';raw.pendingLevels=1;raw.choices=['unknown'];},
  raw=>{raw.bullets=Array.from({length:301},()=>clone(raw.bullets[0]));}
 ]){const raw=clone(valid);mutate(raw);assert.equal(Game.restore(raw),null);}
 const high=clone(valid);high.upgrades.damage=1000;high.state='upgrade';high.pendingLevels=1000;high.choices=['damage','pierce','haste'];
 assert.ok(Game.restore(high));
});

test('safe-precision saturation preserves owned skills and saved queues without dead cards, unsafe ranks or replayed RNG',()=>{
 const game=arena();game.upgrades.damage=Number.MAX_SAFE_INTEGER;
 const display=getUpgradeDisplay(game,'damage');assert.equal(display.rank,Number.MAX_SAFE_INTEGER);
 assert.equal(display.nextRank,null);assert.deepEqual(display.nextEffects,[]);assert.ok(display.currentEffects.length);
 const rank=game.upgrades.damage;game.state='upgrade';game.pendingLevels=1;game.choices=[UPGRADES.find(item=>item.id==='damage')];
 assert.equal(game.chooseUpgrade('damage'),false);assert.equal(game.upgrades.damage,rank);assert.equal(game.pendingLevels,1);
 game.showUpgrade();assert.ok(game.choices.length>0);assert.ok(game.choices.every(item=>item.id!=='damage'));
 const raw=checkpoint(game);raw.pendingLevels=4;raw.choices=['damage','pierce','haste'];
 const copy=Game.restore(raw);assert.ok(copy);assert.deepEqual(copy.choices.map(item=>item.id),['pierce','haste']);
 assert.equal(copy.pendingLevels,4);assert.equal(copy.random.getState(),raw.randomState);
 assert.equal(copy.visualRandom.getState(),raw.visualRandomState);assert.deepEqual(copy.events,[]);checkpoint(copy);
 const dead=clone(raw);for(const id of ['damage','health','haste'])dead.upgrades[id]=Number.MAX_SAFE_INTEGER;
 dead.choices=['damage','health','haste'];const regenerated=Game.restore(dead);assert.ok(regenerated);
 assert.deepEqual(regenerated.choices.map(item=>item.id),['pierce','reload','knockback']);
 assert.equal(regenerated.pendingLevels,4);assert.equal(regenerated.random.getState(),dead.randomState);
 assert.equal(regenerated.visualRandom.getState(),dead.visualRandomState);assert.deepEqual(regenerated.events,[]);checkpoint(regenerated);
 for(const definition of UPGRADES)dead.upgrades[definition.id]=Number.MAX_SAFE_INTEGER;
 for(const resumePlaying of [false,true]){
  const full=Game.restore(dead,{resumePlaying});assert.ok(full);
  assert.equal(full.state,resumePlaying?'playing':'paused');assert.deepEqual(full.choices,[]);assert.equal(full.pendingLevels,0);
  assert.deepEqual(full.upgrades,dead.upgrades);assert.equal(full.random.getState(),dead.randomState);
  assert.deepEqual(full.events,[]);checkpoint(full);
  for(const definition of UPGRADES){const owned=getUpgradeDisplay(full,definition.id);assert.equal(owned.nextRank,null);assert.deepEqual(owned.nextEffects,[]);}
 }
 const full=Game.restore(dead,{resumePlaying:true}),beforeRNG=full.random.getState();
 full.state='upgrade';full.pendingLevels=9;full.choices=[UPGRADES[0]];full.showUpgrade();
 assert.equal(full.state,'playing');assert.equal(full.pendingLevels,0);assert.deepEqual(full.choices,[]);
 assert.equal(full.random.getState(),beforeRNG);assert.deepEqual(full.events,[]);
 const supply=arena(Game,{missionId:null,stageDuration:.01});supply.tick(.02);
 const gatekeeper=supply.enemies.find(enemy=>enemy.gatekeeper);assert.ok(gatekeeper);supply.damageEnemy(gatekeeper,gatekeeper.hp+1);
 assert.equal(supply.state,'supply');for(const definition of UPGRADES)supply.upgrades[definition.id]=Number.MAX_SAFE_INTEGER;
 supply.parts=100;const supplyRNG=supply.random.getState();assert.equal(supply.buyMod(),false);
 assert.equal(supply.parts,100);assert.equal(supply.state,'supply');assert.equal(supply.random.getState(),supplyRNG);
 const oldDeadSupply=checkpoint(supply);oldDeadSupply.state='upgrade';oldDeadSupply.returnToSupply=true;
 oldDeadSupply.pendingLevels=1;oldDeadSupply.choices=['damage'];const restoredSupply=Game.restore(oldDeadSupply);
 assert.ok(restoredSupply);assert.equal(restoredSupply.state,'supply');assert.equal(restoredSupply.returnToSupply,false);
 assert.equal(restoredSupply.pendingLevels,0);assert.deepEqual(restoredSupply.choices,[]);assert.equal(restoredSupply.parts,100);
 assert.equal(restoredSupply.random.getState(),oldDeadSupply.randomState);assert.deepEqual(restoredSupply.events,[]);checkpoint(restoredSupply);
});
