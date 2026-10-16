import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WEAPONS } from '../dist/engine.js';

function fresh(options={}){
  const game=new Game({seed:5261,...options});game.enemies=[];game.spawnClock=1e9;game.drainEvents();return game;
}
function advance(game,seconds){for(let i=0;i<Math.ceil(seconds/.05);i++)game.tick(.05);}
function chooseUntilHealth(game,rank){
  for(let choices=0;choices<64&&(game.upgrades.health||0)<rank;choices++){
    game.gainXP(game.player.xpNext);game.tick(0);assert.equal(game.state,'upgrade');
    const health=game.choices.find(choice=>choice.id==='health');
    assert.equal(game.chooseUpgrade(health?.id??game.choices[0].id),true);
  }
  assert.equal(game.upgrades.health,rank);
}

test('every armor and magazine rank starts either weapon at the trained capacity',()=>{
  const health=[100,108,116,124],ammo={shotgun:[6,7,8,9],nailgun:[24,27,30,33]};
  for(const weapon of ['shotgun','nailgun'])for(let armor=0;armor<=3;armor++)for(let magazine=0;magazine<=3;magazine++){
    const game=fresh({weapon,training:{armor,magazine}});
    assert.equal(game.player.maxHp,health[armor]);assert.equal(game.player.hp,health[armor]);
    assert.equal(game.player.maxAmmo,ammo[weapon][magazine]);assert.equal(game.player.ammo,ammo[weapon][magazine]);
  }
});

test('invalid ranks fall back independently without removing a valid other training bonus',()=>{
  for(const weapon of ['shotgun','nailgun']){
    const base=weapon==='shotgun'?6:24,bonus=weapon==='shotgun'?2:6;
    for(const invalid of [-1,4,1.5,NaN,Infinity,'3',null,undefined,true]){
      const invalidArmor=fresh({weapon,training:{armor:invalid,magazine:2}});
      assert.equal(invalidArmor.player.maxHp,100);assert.equal(invalidArmor.player.maxAmmo,base+bonus);
      const invalidMagazine=fresh({weapon,training:{armor:2,magazine:invalid}});
      assert.equal(invalidMagazine.player.maxHp,116);assert.equal(invalidMagazine.player.maxAmmo,base);
    }
    for(const invalid of [undefined,null,true,12,'training',[],{}]){
      const game=fresh({weapon,training:invalid});assert.equal(game.player.maxHp,100);assert.equal(game.player.maxAmmo,base);
    }
  }
});

test('training changes neither global weapon constants nor an unrelated new operation',()=>{
  const before=JSON.stringify(WEAPONS),training={armor:3,magazine:3};
  for(const weapon of ['shotgun','nailgun']){
    const game=fresh({weapon,training});game.shoot();game.player.maxHp+=20;game.player.ammo=0;game.reload();advance(game,2);
  }
  assert.equal(JSON.stringify(WEAPONS),before);assert.deepEqual(training,{armor:3,magazine:3});
  const normal=fresh();assert.equal(normal.player.maxHp,100);assert.equal(normal.player.maxAmmo,6);
  const defaultWeapon=fresh({weapon:'not-a-weapon',training});assert.equal(defaultWeapon.player.weapon,'shotgun');assert.equal(defaultWeapon.player.maxAmmo,9);
  for(const inheritedKey of ['__proto__','constructor','toString'])assert.equal(fresh({weapon:inheritedKey,training}).player.weapon,'shotgun');
});

test('permanent armor composes with all three health upgrades and retains their healing behavior',()=>{
  const game=fresh({training:{armor:3,magazine:0}});
  game.player.invul=0;game.hurtPlayer(60);assert.equal(game.player.hp,64);
  chooseUntilHealth(game,3);
  assert.equal(game.player.maxHp,184);assert.equal(game.player.hp,154,'Each health upgrade must still heal thirty');
  game.gainXP(game.player.xpNext);game.tick(0);assert.equal(game.state,'upgrade');
  assert.equal(game.choices.some(choice=>choice.id==='health'),false,'Health upgrades must still stop at rank three');
  assert.equal(game.player.maxHp,184);
});

test('trained magazines refill after normal reload and district entry while upgraded health stays intact',()=>{
  for(const weapon of ['shotgun','nailgun']){
    const game=fresh({weapon,training:{armor:2,magazine:3}}),capacity=weapon==='shotgun'?9:33;
    chooseUntilHealth(game,3);const maxHp=game.player.maxHp;
    game.shoot();assert.ok(game.player.ammo<capacity);game.reload();advance(game,3);
    assert.equal(game.player.ammo,capacity);assert.equal(game.player.maxAmmo,capacity);assert.equal(game.player.maxHp,maxHp);
    game.player.hp=maxHp-20;game.player.ammo=0;game.reload();assert.ok(game.player.reloadTime>0);
    game.advanceStage();assert.equal(game.player.ammo,capacity);assert.equal(game.player.maxAmmo,capacity);assert.equal(game.player.reloadTime,0);
    assert.equal(game.player.maxHp,maxHp);assert.equal(game.player.hp,maxHp-20,'Entering a district must not reset trained or upgraded health');
  }
});

test('saved player stats resume unchanged even after the next operation buys higher training',()=>{
  for(const weapon of ['shotgun','nailgun']){
    const training={armor:1,magazine:1},game=fresh({weapon,training}),oldCapacity=weapon==='shotgun'?7:27;
    game.player.invul=0;game.hurtPlayer(14);game.shoot();
    const savedPlayer={...game.player},raw=game.snapshot();assert.ok(raw);
    training.armor=3;training.magazine=3;const next=fresh({weapon,training});
    assert.equal(next.player.hp,124);assert.equal(next.player.maxAmmo,weapon==='shotgun'?9:33);
    const copy=Game.restore(JSON.stringify(raw));assert.ok(copy);assert.equal(copy.state,'paused');assert.deepEqual(copy.player,savedPlayer);
    assert.equal(copy.player.maxHp,108);assert.equal(copy.player.maxAmmo,oldCapacity);assert.equal(copy.player.hp,94);
    copy.resume();copy.reload();advance(copy,3);assert.equal(copy.player.ammo,oldCapacity);
    copy.advanceStage();assert.equal(copy.player.maxAmmo,oldCapacity);assert.equal(copy.player.ammo,oldCapacity);assert.equal(copy.player.maxHp,108);
    assert.equal(Game.restore(copy.snapshot()).player.maxAmmo,oldCapacity);
  }
});

test('trained health plus run health upgrades survive checkpoint restore without a second bonus',()=>{
  const game=fresh({training:{armor:3,magazine:3}});chooseUntilHealth(game,3);
  assert.equal(game.player.maxHp,184);const copy=Game.restore(game.snapshot());assert.ok(copy);
  assert.equal(copy.player.maxHp,184);assert.equal(copy.player.hp,game.player.hp);assert.equal(copy.player.maxAmmo,9);assert.equal(copy.upgrades.health,3);
  const again=Game.restore(copy.snapshot());assert.ok(again);assert.equal(again.player.maxHp,184);assert.equal(again.player.maxAmmo,9);
});
