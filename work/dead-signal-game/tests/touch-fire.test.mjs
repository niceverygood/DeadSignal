import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {advanceSimulation} from '../dist/simulation.js';
import {endTouchFire} from '../dist/touch-fire.js';

function fresh(weapon='nailgun'){
  const game=new Game({seed:8913,weapon,stageDuration:1e9});game.upgrades.haste=3;
  game.enemies=[];game.world.obstacles=[];game.navigation=new Navigation(game.world);game.spawnClock=1e9;
  game.player.x=1000;game.player.y=900;
  const target=game.spawnEnemy('walker',0,{x:1300,y:900});assert.ok(target);target.speed=0;
  game.drainEvents();return{game,target};
}
function gesture(){
  return{touch:{shoot:true,shootId:22,id:11,x:.25,y:-.5},impulses:{fireOnce:true,dash:true,lure:false,molotov:false,reload:false}};
}
function frame(touch,impulses,fireMode='manual'){
  return{fireMode,aimX:1300,aimY:900,shoot:touch.shoot||impulses.fireOnce,heldShoot:touch.shoot,fireOnce:impulses.fireOnce,moveX:0,moveY:0,targetX:1300,targetY:900};
}
const shots=game=>game.events.filter(event=>event.type==='shot');
function unchangedOtherControls(touch,impulses){
  assert.equal(touch.id,11);assert.equal(touch.x,.25);assert.equal(touch.y,-.5);
  assert.equal(impulses.dash,true);assert.equal(impulses.lure,false);assert.equal(impulses.molotov,false);assert.equal(impulses.reload,false);
}

test('a normal short touch release preserves one pending shot for either weapon',()=>{
  for(const weapon of ['shotgun','nailgun']){
    const{game}=fresh(weapon),{touch,impulses}=gesture(),ammo=game.player.ammo;
    assert.equal(endTouchFire(touch,impulses,{type:'pointerup',pointerId:22}),true);
    assert.equal(touch.shoot,false);assert.equal(touch.shootId,null);assert.equal(impulses.fireOnce,true);unchangedOtherControls(touch,impulses);
    const result=advanceSimulation(game,frame(touch,impulses),.12);
    assert.equal(result.consumed,true);assert.equal(shots(game).length,1);assert.equal(shots(game)[0].weapon,weapon);assert.equal(game.player.ammo,ammo-1);
  }
});

test('matching cancellation or unexpected capture loss before a tick discards the pulse and spends no ammo',()=>{
  for(const type of ['pointercancel','lostpointercapture'])for(const weapon of ['shotgun','nailgun']){
    const{game}=fresh(weapon),{touch,impulses}=gesture(),ammo=game.player.ammo;
    const random=game.random.getState(),visual=game.visualRandom.getState();
    assert.equal(endTouchFire(touch,impulses,{type,pointerId:22}),true);
    assert.equal(touch.shoot,false);assert.equal(touch.shootId,null);assert.equal(impulses.fireOnce,false);unchangedOtherControls(touch,impulses);
    advanceSimulation(game,frame(touch,impulses),.12);
    assert.equal(shots(game).length,0);assert.equal(game.player.ammo,ammo);
    assert.equal(game.random.getState(),random);assert.equal(game.visualRandom.getState(),visual);
  }
});

test('natural pointerup followed by lost capture still delivers its queued short tap',()=>{
  const{game}=fresh(),{touch,impulses}=gesture();
  assert.equal(endTouchFire(touch,impulses,{type:'pointerup',pointerId:22}),true);
  const released={...touch},pending={...impulses};
  assert.equal(endTouchFire(touch,impulses,{type:'lostpointercapture',pointerId:22}),false);
  assert.deepEqual(touch,released);assert.deepEqual(impulses,pending);assert.equal(impulses.fireOnce,true);
  advanceSimulation(game,frame(touch,impulses),.12);assert.equal(shots(game).length,1);assert.equal(game.player.ammo,23);
});

test('a different finger cannot end the active shooting pointer or clear its pending pulse',()=>{
  const{game}=fresh(),{touch,impulses}=gesture(),beforeTouch={...touch},beforeImpulses={...impulses};
  Object.freeze(touch);Object.freeze(impulses);
  for(const pointerId of [11,33])for(const type of ['pointerup','pointercancel','lostpointercapture']){
    assert.equal(endTouchFire(touch,impulses,{type,pointerId}),false);assert.deepEqual(touch,beforeTouch);assert.deepEqual(impulses,beforeImpulses);
  }
  advanceSimulation(game,frame(touch,impulses),.12);
  assert.equal(shots(game).length,2,'The owning pointer remains held and keeps its normal hasted fire rate');assert.equal(game.player.ammo,22);
});

test('repeat cancellation and late events are inert after a gesture has already ended',()=>{
  const{game}=fresh(),{touch,impulses}=gesture();
  assert.equal(endTouchFire(touch,impulses,{type:'pointercancel',pointerId:22}),true);
  const ended={...touch},cleared={...impulses};Object.freeze(touch);Object.freeze(impulses);
  for(const type of ['pointercancel','lostpointercapture','pointerup']){
    assert.equal(endTouchFire(touch,impulses,{type,pointerId:22}),false);assert.deepEqual(touch,ended);assert.deepEqual(impulses,cleared);
  }
  advanceSimulation(game,frame(touch,impulses),.12);assert.equal(shots(game).length,0);assert.equal(game.player.ammo,24);
});

test('automatic firing remains independent of a cancelled touch gesture when a valid enemy remains',()=>{
  for(const type of ['pointercancel','lostpointercapture']){
    const{game,target}=fresh(),{touch,impulses}=gesture();
    assert.equal(endTouchFire(touch,impulses,{type,pointerId:22}),true);assert.equal(touch.shoot,false);assert.equal(impulses.fireOnce,false);
    const result=advanceSimulation(game,frame(touch,impulses,'auto'),.12);
    assert.equal(shots(game).length,2);assert.equal(game.player.ammo,22);assert.equal(result.command.shoot,true);assert.equal(result.command.targetId,target.id);
  }
});
