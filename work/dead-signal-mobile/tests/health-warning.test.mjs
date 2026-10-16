import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {LOW_HEALTH_THRESHOLD,isCriticalHealth} from '../dist/health-warning.js';

function capture(game){
  return JSON.stringify({checkpoint:game.snapshot(),player:game.player,random:game.random.getState(),visual:game.visualRandom.getState(),particles:game.particles,texts:game.texts,links:game.links,events:game.events,shake:game.shake,flash:game.flash});
}

test('critical health uses the inclusive raw fraction rather than rounded or fixed HP',()=>{
  assert.equal(LOW_HEALTH_THRESHOLD,.30);
  // 37.2 / 124 is slightly above .30 in IEEE-754; retain raw comparison.
  for(const [hp,maxHp,expected] of [[30,100,true],[30.00001,100,false],[29.99999,100,true],[.3,1,true],[.300001,1,false],[32.4,108,true],[32.40001,108,false],[37.199999999999996,124,true],[37.2,124,false],[37.20001,124,false],[54,180,true],[54.00001,180,false],[31,124,true],[31,100,false],[100,100,false]]){
    const player=Object.freeze({hp,maxHp});assert.equal(isCriticalHealth(player),expected,`${hp}/${maxHp}`);
    assert.deepEqual(player,{hp,maxHp});
  }
});

test('missing, dead and nonfinite combat values cannot trigger a warning',()=>{
  for(const player of [undefined,null,{},[],{hp:30},{maxHp:100},
    ...[0,-1,NaN,Infinity,-Infinity,'30',null,undefined].map(hp=>({hp,maxHp:100})),
    ...[0,-1,NaN,Infinity,-Infinity,'100',null,undefined].map(maxHp=>({hp:1,maxHp}))]){
    assert.equal(isCriticalHealth(player),false,JSON.stringify(player));
  }
});

test('real damage crosses the threshold and an offered health upgrade clears it with the new maximum',()=>{
  const game=new Game({seed:15043});game.player.invul=0;
  assert.equal(isCriticalHealth(game.player),false);game.hurtPlayer(70);
  assert.equal(game.player.hp,30);assert.equal(game.player.maxHp,100);assert.equal(isCriticalHealth(game.player),true);
  assert.ok(game.events.some(event=>event.type==='hurt'));assert.ok(game.snapshot());
  game.gainXP(game.player.xpNext);game.showUpgrade();assert.equal(game.state,'upgrade');
  assert.ok(game.choices.some(choice=>choice.id==='health'),'The seeded operation must offer actual emergency treatment');
  assert.equal(isCriticalHealth(game.player),true,'The pure ratio remains critical while the choice screen controls visibility');
  assert.equal(game.chooseUpgrade('health'),true);assert.equal(game.player.hp,60);assert.equal(game.player.maxHp,120);
  assert.equal(game.state,'playing');assert.equal(isCriticalHealth(game.player),false);
});

test('district clearance and the actual supply purchase recover a critical survivor',()=>{
  const game=new Game({seed:6142,stageDuration:.1});game.enemies=[];game.spawnClock=1e9;game.parts=8;game.player.invul=0;
  game.hurtPlayer(70);for(let i=0;i<3;i++)game.tick(.05);
  const gatekeeper=game.enemies.find(enemy=>enemy.gatekeeper);assert.ok(gatekeeper);
  game.damageEnemy(gatekeeper,gatekeeper.hp);assert.equal(game.state,'supply');assert.equal(game.parts,20);
  assert.equal(isCriticalHealth(game.player),true);assert.ok(game.snapshot());
  assert.equal(game.buyHeal(),true);assert.equal(game.player.hp,75);assert.equal(game.parts,0);
  assert.equal(isCriticalHealth(game.player),false);assert.equal(game.buyHeal(),false);
  assert.equal(game.events.filter(event=>event.type==='heal').length,1);
});

test('trained critical health survives restore and repeated queries leave both RNG streams and effects untouched',()=>{
  const game=new Game({seed:15043,training:{armor:3,magazine:0}});game.player.invul=0;game.hurtPlayer(87);
  assert.equal(game.player.hp,37);assert.equal(game.player.maxHp,124);assert.equal(isCriticalHealth(game.player),true);
  const saved=game.snapshot();assert.ok(saved);const restored=Game.restore(saved);assert.ok(restored);
  assert.equal(restored.state,'paused');assert.equal(restored.player.hp,37);assert.equal(restored.player.maxHp,124);
  assert.equal(isCriticalHealth(restored.player),true,'Visibility belongs to the renderer, not the saved health calculation');
  Object.freeze(game.player);const before=capture(game);
  for(let i=0;i<1000;i++)assert.equal(isCriticalHealth(game.player),true);
  assert.equal(capture(game),before);
  restored.resume();restored.gainXP(restored.player.xpNext);restored.showUpgrade();assert.equal(restored.chooseUpgrade('health'),true);
  assert.equal(restored.player.hp,67);assert.equal(restored.player.maxHp,144);assert.equal(isCriticalHealth(restored.player),false);
});

test('a real fatal hit ends the living-health warning without altering the terminal result',()=>{
  const game=new Game({seed:137});game.player.invul=0;game.hurtPlayer(70);assert.equal(isCriticalHealth(game.player),true);
  game.player.invul=0;game.hurtPlayer(30);assert.equal(game.state,'dead');assert.equal(game.player.hp,0);
  const before=JSON.stringify({result:game.result,player:game.player,events:game.events,random:game.random.getState(),visual:game.visualRandom.getState()});
  for(let i=0;i<20;i++)assert.equal(isCriticalHealth(game.player),false);
  assert.equal(JSON.stringify({result:game.result,player:game.player,events:game.events,random:game.random.getState(),visual:game.visualRandom.getState()}),before);
});
