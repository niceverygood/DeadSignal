import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,WEAPONS} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {equipmentStats,EQUIPMENT} from '../dist/equipment.js';
import {advanceSimulation} from '../dist/simulation.js';
import oldCampaign from './fixtures/campaign-v017-equipmentless.json' with {type:'json'};
import oldLegacy from './fixtures/legacy-v016-checkpoint.json' with {type:'json'};

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} should equal ${b}`);
function loadout(entries){
  const items={},equipped={weapon:null,armor:null,utility:null};
  for(const [id,rank] of entries){items[id]=rank;equipped[EQUIPMENT.find(item=>item.id===id).slot]=id;}
  return{chips:20000,items,equipped,testChipsClaimed:true};
}
const legendary=()=>loadout([['blackout-rounds',5],['quarantine-armor',5],['survival-core',5]]);
function fresh(options={}){
  const game=new Game({seed:28131,missionId:'mission-01',weapon:'nailgun',stageDuration:1e9,...options});game.enemies=[];game.spawnClock=1e9;game.world.obstacles=[];game.world.decor=[];game.navigation=new Navigation(game.world);
  game.player.x=1000;game.player.y=900;game.player.invul=0;game.drainEvents();return game;
}
function advance(game,seconds,input={}){let remaining=seconds;while(remaining>1e-9&&game.state==='playing'){const dt=Math.min(.05,remaining);game.tick(dt,input);remaining-=dt;}}
function upgradeUntil(game,id,rank){
  for(let i=0;i<80&&(game.upgrades[id]||0)<rank;i++){
    if(game.state==='playing'){game.gainXP(game.player.xpNext);game.tick(0);}
    assert.equal(game.state,'upgrade');assert.equal(game.chooseUpgrade(game.choices.find(choice=>choice.id===id)?.id??game.choices[0].id),true);
  }
  assert.equal(game.upgrades[id],rank);
  while(game.state==='upgrade')game.chooseUpgrade(game.choices[0].id);
}
const shots=game=>game.events.filter(event=>event.type==='shot').length;

test('all thirty equipped ranks produce their disclosed effects in actual combat, movement, growth or recovery',()=>{
  const damage=[21.75,28.5,35.25,42,48.75],quarantineDamage=[95,89,84,78,73],barrierDamage=[91,82,73,64,55],revives=[1,1,2,2,3],heal=[45,47,49,51,53];
  for(const item of EQUIPMENT)for(let rank=1;rank<=5;rank++){
    const gear=loadout([[item.id,rank]]),before=JSON.stringify(gear),game=fresh({equipment:gear});
    assert.equal(JSON.stringify(gear),before);assert.ok(Object.isFrozen(game.equipmentStats));assert.ok(Object.isFrozen(game.equipmentStats.ammoBonus));
    assert.ok(game.snapshot());assert.equal(game.snapshot().remainingRevives,game.remainingRevives);
    if(item.id==='blackout-rounds'){
      const target=game.spawnEnemy('elite',0,{x:1200,y:900});assert.ok(target);target.speed=0;const hp=target.hp;
      game.player.angle=0;game.shoot();advance(game,.23);close(hp-target.hp,damage[rank-1]);assert.equal(game.player.ammo,23);
    }else if(item.id==='storm-magazine'){
      assert.equal(game.player.maxAmmo,24+rank*6);game.shoot();close(game.player.fireTime,.105/(1+.16*rank));
      game.reload();close(game.player.reloadTime,1.1/(1+.16*rank));advance(game,1.2);assert.equal(game.player.ammo,game.player.maxAmmo);
    }else if(item.id==='quarantine-armor'||item.id==='barrier-field'){
      const quarantine=item.id==='quarantine-armor';assert.equal(game.player.maxHp,100+rank*(quarantine?45:30));
      const hp=game.player.hp;game.hurtPlayer(100);assert.equal(hp-game.player.hp,(quarantine?quarantineDamage:barrierDamage)[rank-1]);assert.equal(game.state,'playing');
    }else if(item.id==='survival-core'){
      assert.equal(game.remainingRevives,revives[rank-1]);game.hurtPlayer(10000);assert.equal(game.state,'playing');assert.equal(game.player.hp,heal[rank-1]);assert.equal(game.remainingRevives,revives[rank-1]-1);assert.equal(game.player.invul,2);
    }else{
      const x=game.player.x;game.tick(.05,{moveX:1,moveY:0});close(game.player.x-x,128*(1+.04*rank)*.05);
      game.gainXP(8);close(game.player.xp,8*(1+.15*rank));
      const pickup={id:++game.id,x:game.player.x+100,y:game.player.y,type:'xp',value:4};game.pickups.push(pickup);const original=pickup.x;game.tick(.05);
      assert.ok(pickup.x<original);assert.ok(game.player.maxHp<=10000);assert.ok(game.player.maxAmmo<=120);
    }
    assert.ok(game.snapshot(),`${item.id}/${rank} must remain saveable after its actual effect`);
  }
});

test('unowned, unequipped, malformed or cross-slot inventory cannot grant effects or consume gameplay RNG',()=>{
  const bare=fresh(),neutral=equipmentStats(null),random=bare.random.getState(),visual=bare.visualRandom.getState();
  for(const gear of [null,true,[],{},
    {items:{'blackout-rounds':5},equipped:{armor:'blackout-rounds'}},
    {items:{'blackout-rounds':6},equipped:{weapon:'blackout-rounds'}},
    {items:{'blackout-rounds':5},equipped:{weapon:null}},
    {items:{},equipped:{weapon:'blackout-rounds',armor:'quarantine-armor',utility:'survival-core'}}]){
    const game=fresh({equipment:gear});assert.deepEqual(game.equipmentStats,neutral);assert.equal(game.player.hp,100);assert.equal(game.player.maxAmmo,24);assert.equal(game.remainingRevives,0);
    assert.equal(game.random.getState(),random);assert.equal(game.visualRandom.getState(),visual);
  }
});

test('training and run upgrades compose once with armor, magazines and movement without altering weapon constants',()=>{
  const constants=JSON.stringify(WEAPONS),gear=loadout([['storm-magazine',5],['quarantine-armor',5],['magnetic-recovery',5]]);
  for(const weapon of ['shotgun','nailgun']){
    const game=fresh({weapon,equipment:gear,training:{armor:3,magazine:3}}),capacity=weapon==='shotgun'?19:63;
    assert.equal(game.player.hp,349);assert.equal(game.player.maxHp,349);assert.equal(game.player.maxAmmo,capacity);assert.equal(game.player.ammo,capacity);
    game.hurtPlayer(100);const injured=game.player.hp;upgradeUntil(game,'health',3);assert.equal(game.player.maxHp,409);assert.ok(game.player.hp>=injured+90);
    upgradeUntil(game,'speed',3);close(game.player.speed,214*1.36*1.2);
    game.shoot();game.reload();advance(game,2);assert.equal(game.player.ammo,capacity);assert.equal(game.player.maxHp,409);assert.ok(game.snapshot());
  }
  assert.equal(JSON.stringify(WEAPONS),constants);
});

test('bullet damage, pellet count and haste combine with only the selected weapon equipment',()=>{
  const gear=loadout([['blackout-rounds',5]]);
  for(const weapon of ['shotgun','nailgun']){
    const game=fresh({weapon,equipment:gear});game.upgrades.damage=4;game.upgrades.pellets=2;game.upgrades.haste=3;game.shoot();
    assert.equal(game.bullets.length,weapon==='shotgun'?10:3);for(const bullet of game.bullets)close(bullet.damage,97.5);
    close(game.player.fireTime,WEAPONS[weapon].delay/1.45);assert.equal(game.player.ammo,WEAPONS[weapon].ammo-1);
  }
  const bothOwned=loadout([['blackout-rounds',5],['storm-magazine',5]]),selected=fresh({equipment:bothOwned});selected.shoot();
  assert.equal(selected.equipmentStats.damage,1);assert.equal(selected.equipmentStats.fireRate,1.8);assert.equal(selected.bullets[0].damage,15);
});

test('enhanced fire and reload rates produce equal fixed-step results at thirty and sixty rendering frames per second',()=>{
  const simulate=(fps,equipped)=>{
    const game=fresh({training:{magazine:3},...(equipped?{equipment:loadout([['storm-magazine',5]])}:{})});game.upgrades.haste=3;let accumulator=0;
    for(let i=0;i<fps;i++){const result=advanceSimulation(game,{fireMode:'manual',aimX:2000,aimY:900,shoot:true,heldShoot:true,fireOnce:false,moveX:0,moveY:0},accumulator+1/fps);accumulator=result.accumulator;}
    return game;
  };
  for(const equipped of [false,true]){
    const thirty=simulate(30,equipped),sixty=simulate(60,equipped);assert.deepEqual(thirty.snapshot(),sixty.snapshot());assert.equal(shots(thirty),equipped?20:12);
    assert.equal(thirty.player.ammo,(equipped?63:33)-shots(thirty));
  }
  for(const weapon of ['shotgun','nailgun']){
    const bare=fresh({weapon}),gear=fresh({weapon,equipment:loadout([['storm-magazine',5]])});bare.upgrades.haste=gear.upgrades.haste=3;
    bare.shoot();gear.shoot();bare.reload();gear.reload();advance(bare,weapon==='shotgun'?.55:.45);advance(gear,weapon==='shotgun'?.55:.45);
    assert.equal(gear.player.reloadTime,0);assert.equal(gear.player.ammo,gear.player.maxAmmo);assert.ok(bare.player.reloadTime>0);assert.equal(bare.player.ammo,bare.player.maxAmmo-1);
  }
});

test('XP amplification occurs exactly once for collection and overflow while added magnet reach leaves distant bare pickups still',()=>{
  const bare=fresh(),gear=fresh({equipment:loadout([['magnetic-recovery',5]])});
  for(const game of [bare,gear])game.pickups.push({id:++game.id,x:1200,y:900,type:'xp',value:8});
  const still=bare.pickups[0].x;advance(bare,.6);advance(gear,.6);
  assert.equal(bare.pickups[0].x,still);assert.equal(bare.player.xp,0);assert.equal(gear.pickups.length,0);close(gear.player.xp,14);
  gear.pickups=Array.from({length:451},()=>({id:++gear.id,x:1800,y:900,type:'xp',value:4}));gear.updatePickups(0);
  assert.equal(gear.pickups.length,450);close(gear.player.xp,21,'Overflow must also use the central multiplier once');
  gear.upgrades.magnet=3;const pickup={id:++gear.id,x:gear.player.x+450,y:900,type:'xp',value:1};gear.pickups=[pickup];gear.updatePickups(.05);assert.ok(pickup.x<gear.player.x+450,'Gear reach composes with the normal magnet upgrade');
});

test('a lethal hit consumes one core charge, preserves position, protects for two seconds and ends once after exhaustion',()=>{
  const game=fresh({equipment:loadout([['survival-core',5]])}),position={x:game.player.x,y:game.player.y};
  for(let remaining=2;remaining>=0;remaining--){
    game.player.invul=0;game.hurtPlayer(10000);assert.equal(game.remainingRevives,remaining);assert.equal(game.player.hp,53);assert.equal(game.player.invul,2);assert.equal(game.state,'playing');
    assert.deepEqual({x:game.player.x,y:game.player.y},position);
    const event=game.events.filter(event=>event.type==='revive').at(-1);assert.deepEqual(event,{type:'revive',remaining,hp:53,maxHp:100});
    for(let i=0;i<10;i++)game.hurtPlayer(10000);assert.equal(game.remainingRevives,remaining);assert.equal(game.player.hp,53);
    advance(game,1.95);assert.ok(game.player.invul>0);game.hurtPlayer(10000);assert.equal(game.remainingRevives,remaining);
    advance(game,.1);assert.equal(game.player.invul,0);assert.ok(game.snapshot());
  }
  game.hurtPlayer(10000);assert.equal(game.state,'dead');assert.equal(game.player.hp,0);assert.equal(game.remainingRevives,0);
  assert.equal(game.events.filter(event=>event.type==='revive').length,3);assert.equal(game.events.filter(event=>event.type==='end').length,1);
  const ended=JSON.stringify({result:game.result,player:game.player,remaining:game.remainingRevives,events:game.events});for(let i=0;i<10;i++)game.tick(.05);
  assert.equal(JSON.stringify({result:game.result,player:game.player,remaining:game.remainingRevives,events:game.events}),ended);
});

test('two lethal enemy contacts in the same actual tick consume one charge and preserve the live checkpoint',()=>{
  const game=fresh({equipment:loadout([['survival-core',5]])});
  for(const offset of [-20,20]){const enemy=game.spawnEnemy('walker',0,{x:1200,y:900});assert.ok(enemy);game.move(enemy,game.player.x+offset-enemy.x,game.player.y-enemy.y);enemy.speed=0;enemy.damage=1000;}
  game.tick(.01);assert.equal(game.state,'playing');assert.equal(game.remainingRevives,2);assert.equal(game.player.hp,53);
  assert.equal(game.events.filter(event=>event.type==='revive').length,1);assert.equal(game.events.filter(event=>event.type==='end').length,0);assert.ok(game.snapshot());
});

test('saved equipment and consumed charges remain frozen when the inventory is upgraded, switched or unloaded before restore',()=>{
  const gear=loadout([['blackout-rounds',1],['quarantine-armor',1],['survival-core',1]]),game=fresh({equipment:gear,training:{armor:1,magazine:1}});
  game.hurtPlayer(1000);game.shoot();game.pause();const saved=game.snapshot();assert.ok(saved);assert.equal(saved.remainingRevives,0);assert.equal(saved.player.maxHp,153);assert.equal(saved.player.hp,69);
  const oldStats=JSON.parse(JSON.stringify(game.equipmentStats)),player={...game.player};assert.equal(Object.hasOwn(saved,'equipment'),false);assert.equal(Object.hasOwn(saved.equipmentStats,'items'),false);assert.equal(Object.hasOwn(saved.equipmentStats,'chips'),false);
  gear.items['blackout-rounds']=5;gear.items['storm-magazine']=5;gear.items['quarantine-armor']=5;gear.items['survival-core']=5;gear.equipped.weapon='storm-magazine';
  const next=fresh({equipment:gear,training:{armor:1,magazine:1}});assert.equal(next.player.maxHp,333);assert.equal(next.player.maxAmmo,57);assert.equal(next.remainingRevives,3);
  const copy=Game.restore(saved);assert.ok(copy);assert.equal(copy.state,'paused');assert.deepEqual(copy.player,player);assert.deepEqual(copy.equipmentStats,oldStats);assert.equal(copy.remainingRevives,0);
  assert.ok(Object.isFrozen(copy.equipmentStats));assert.ok(Object.isFrozen(copy.equipmentStats.ammoBonus));
  const paused=JSON.stringify(copy.snapshot());for(let i=0;i<10;i++)copy.tick(.05);assert.equal(JSON.stringify(copy.snapshot()),paused);
  saved.equipmentStats.damage=3.25;assert.deepEqual(copy.equipmentStats,oldStats,'A restored run cannot retain references to caller data');
  copy.resume();copy.player.invul=0;copy.hurtPlayer(1000);assert.equal(copy.state,'dead','Buying three future charges cannot refill the saved exhausted core');
});

test('a version-seventeen mission with no equipment fields resumes unchanged with neutral effects and zero charges',()=>{
  const copy=Game.restore(oldCampaign,{equipment:legendary()});assert.ok(copy);assert.deepEqual(copy.snapshot(),oldCampaign);
  assert.deepEqual(copy.equipmentStats,equipmentStats(null));assert.equal(copy.remainingRevives,0);assert.equal(copy.player.hp,88.55);assert.equal(copy.player.maxHp,116);assert.equal(copy.player.maxAmmo,27);
  copy.resume();assert.equal(Object.hasOwn(copy.snapshot(),'equipmentStats'),false);assert.equal(Object.hasOwn(copy.snapshot(),'remainingRevives'),false);
});

test('legacy mode ignores equipment in tuned gameplay and restores old version-one checkpoints byte-for-byte',()=>{
  const equipped=new Game({seed:323727,mode:'standard',weapon:'nailgun',equipment:legendary()}),bare=new Game({seed:323727,mode:'standard',weapon:'nailgun'});
  for(const game of [equipped,bare]){
    game.player.invul=9999;
    for(let i=0;i<150;i++){
      game.tick(.05,{shoot:true,moveX:i<70?1:-1,moveY:i<100?.25:-.5,aimX:1550,aimY:960,lure:i===12,targetX:1420,targetY:910});
      if(game.state==='upgrade')game.chooseUpgrade(game.choices[0].id);
    }
  }
  // The tuned displacement intentionally changes future combat from v0.16.
  // Equipment must still have no effect outside campaign missions.
  assert.deepEqual(equipped.snapshot(),bare.snapshot());assert.equal(equipped.remainingRevives,0);assert.deepEqual(equipped.equipmentStats,equipmentStats(null));
  const restored=Game.restore(oldLegacy,{resumePlaying:true,equipment:legendary()});assert.ok(restored);assert.deepEqual(restored.snapshot(),oldLegacy);assert.equal(restored.remainingRevives,0);
});

test('incomplete equipment pairs, impossible derived combinations and invalid remaining charges cannot restore',()=>{
  const game=fresh({equipment:legendary()}),raw=game.snapshot();assert.ok(raw);
  const changes=[data=>delete data.equipmentStats,data=>delete data.remainingRevives,data=>data.remainingRevives=-1,data=>data.remainingRevives=4,data=>data.remainingRevives=.5,
    data=>data.equipmentStats.damage=3.26,data=>data.equipmentStats.fireRate=1.8,data=>data.equipmentStats.mitigation=.45,data=>data.equipmentStats.reviveHeal=.51,data=>data.equipmentStats.movement=1.2,
    data=>data.equipmentStats.ammoBonus.nailgun=30,data=>data.equipmentStats.ammoBonus.extra=1,data=>data.equipmentStats.extra=1,data=>data.equipmentStats.hpBonus=Infinity];
  for(const change of changes){const corrupt=structuredClone(raw);change(corrupt);assert.doesNotThrow(()=>assert.equal(Game.restore(corrupt),null));}
});

test('unused core charges and revival protection freeze through paused and queued upgrade checkpoints',()=>{
  const game=fresh({equipment:loadout([['survival-core',5]])});game.hurtPlayer(10000);assert.equal(game.remainingRevives,2);game.pause();
  const paused=JSON.stringify(game.snapshot());for(let i=0;i<10;i++){game.tick(.05);game.hurtPlayer(10000);}
  assert.equal(JSON.stringify(game.snapshot()),paused);assert.equal(game.player.invul,2);
  game.resume();game.gainXP(game.player.xpNext);game.tick(0);assert.equal(game.state,'upgrade');const upgrade=game.snapshot();assert.ok(upgrade);assert.equal(upgrade.remainingRevives,2);
  for(let i=0;i<10;i++)game.tick(.05);assert.deepEqual(game.snapshot(),upgrade);
  const copy=Game.restore(upgrade);assert.ok(copy);assert.equal(copy.remainingRevives,2);assert.equal(copy.player.invul,2);assert.deepEqual(copy.choices.map(choice=>choice.id),game.choices.map(choice=>choice.id));
  copy.chooseUpgrade(copy.choices[0].id);copy.tick(.05);close(copy.player.invul,1.95);assert.equal(copy.remainingRevives,2);
});

test('three controlled real middle-and-final boss battles improve with the fixed legendary loadout',t=>{
  const run=(missionId,equipped)=>{
    const game=new Game({seed:181803,missionId,weapon:'nailgun',stageDuration:4,training:{armor:3,magazine:3},...(equipped?{equipment:legendary()}:{})});
    // Isolate each real catalog boss pair in the same open practice arena.
    // Damage, skill timing, shield, projectiles, XP and death all stay live.
    game.enemies=[];game.spawnClock=1e9;game.world.obstacles=[];game.world.decor=[];game.navigation=new Navigation(game.world);game.player.x=1000;game.player.y=900;game.alarm.count=2;
    const positioned=new Set();
    for(let i=0;i<2400&&!game.result;i++){
      if(game.state==='upgrade'){const choice=['damage','haste','health'].map(id=>game.choices.find(upgrade=>upgrade.id===id)).find(Boolean)||game.choices[0];game.chooseUpgrade(choice.id);continue;}
      const boss=game.boss;if(boss&&!positioned.has(boss.id)){game.move(boss,game.player.x+240-boss.x,game.player.y-boss.y);positioned.add(boss.id);}
      game.tick(.05,{shoot:!!boss,aimX:boss?.x??game.player.x+240,aimY:boss?.y??game.player.y,moveX:0,moveY:0});
    }
    assert.ok(game.result,'The bounded battle must end through real damage');
    return{won:game.result.won,time:game.time,shots:shots(game),hp:game.player.hp,revives:game.events.filter(event=>event.type==='revive').length,defeated:game.defeatedBossIds,mid:game.midBossDefeated};
  };
  for(const missionId of ['mission-01','mission-05','mission-12']){
    const bare=run(missionId,false),equipped=run(missionId,true);
    assert.equal(equipped.won,true);assert.equal(equipped.mid,true);assert.equal(equipped.defeated.length,2);
    assert.ok(equipped.shots<bare.shots);assert.ok(equipped.time<bare.time);assert.ok(equipped.hp>bare.hp);
    t.diagnostic(`${missionId} practice arena: bare=${bare.won?'win':'loss'} ${bare.time.toFixed(2)}s/${bare.shots} shots/${bare.hp} HP; equipped=win ${equipped.time.toFixed(2)}s/${equipped.shots} shots/${equipped.hp} HP`);
  }
});
