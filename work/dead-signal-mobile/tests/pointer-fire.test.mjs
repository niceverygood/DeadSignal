import test from 'node:test';
import assert from 'node:assert/strict';
import {bindPointerFire} from '../dist/pointer-fire.js';
import {Game} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {advanceSimulation} from '../dist/simulation.js';

class PointerCanvas extends EventTarget{
  captures=new Set();operations=[];captureFailure=null;onRelease=null;
  emit(type,values={}){
    const event=Object.assign(new Event(type),{pointerId:7,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:1300,clientY:900,...values});
    if(type==='lostpointercapture')this.captures.delete(event.pointerId);
    this.dispatchEvent(event);return event;
  }
  setPointerCapture(id){
    this.operations.push({type:'capture',id});if(this.captureFailure==='before')throw new Error('Unavailable pointer');
    this.captures.add(id);if(this.captureFailure==='after')throw new Error('Capture interrupted');
  }
  hasPointerCapture(id){return this.captures.has(id);}
  releasePointerCapture(id){
    this.operations.push({type:'release',id});this.onRelease?.(id);this.captures.delete(id);
    // Synchronous loss deliberately exercises the strongest release ordering.
    this.emit('lostpointercapture',{pointerId:id,buttons:0});
  }
}
function controls(playing=true){
  const canvas=new PointerCanvas(),pointer={shoot:false,shootId:null,x:15,y:25,known:false};
  const impulses={fireOnce:false,dash:true,lure:false,molotov:true,reload:false},starts=[];
  const cancel=bindPointerFire(canvas,{pointer,impulses,isPlaying:()=>playing,onStart:event=>{starts.push(event);pointer.x=event.clientX;pointer.y=event.clientY;pointer.known=true;}});
  return{canvas,pointer,impulses,starts,cancel,setPlaying:value=>{playing=value;}};
}
function otherControls(pointer,impulses){
  return{x:pointer.x,y:pointer.y,known:pointer.known,dash:impulses.dash,lure:impulses.lure,molotov:impulses.molotov,reload:impulses.reload};
}
function fresh(weapon){
  const game=new Game({seed:8913,weapon,stageDuration:1e9});game.upgrades.haste=3;
  game.enemies=[];game.world.obstacles=[];game.navigation=new Navigation(game.world);game.spawnClock=1e9;
  game.player.x=1000;game.player.y=900;const target=game.spawnEnemy('walker',0,{x:1300,y:900});assert.ok(target);target.speed=0;
  game.drainEvents();return{game,target};
}
function frame(pointer,impulses,fireMode='manual'){
  return{fireMode,aimX:pointer.x,aimY:pointer.y,shoot:pointer.shoot||impulses.fireOnce,heldShoot:pointer.shoot,fireOnce:impulses.fireOnce,moveX:0,moveY:0,targetX:pointer.x,targetY:pointer.y};
}
function step(game,control,seconds,mode='manual'){
  const result=advanceSimulation(game,frame(control.pointer,control.impulses,mode),seconds);
  if(result.consumed)control.impulses.fireOnce=false;return result;
}
const shots=game=>game.events.filter(event=>event.type==='shot');

test('only a playing left mouse or pen press starts once, updates aim and captures its own pointer',()=>{
  const control=controls(false),{canvas,pointer,impulses,starts}=control,before=JSON.stringify({pointer,impulses});
  canvas.emit('pointerdown');assert.equal(JSON.stringify({pointer,impulses}),before);assert.equal(starts.length,0);
  control.setPlaying(true);
  for(const values of [{pointerType:'touch'},{button:1},{button:2},{button:-1}])canvas.emit('pointerdown',values);
  assert.equal(JSON.stringify({pointer,impulses}),before);assert.equal(canvas.operations.length,0);
  for(const pointerType of ['mouse','pen']){
    const ready=controls(),event=ready.canvas.emit('pointerdown',{pointerType,pointerId:13,clientX:444,clientY:555});
    assert.deepEqual(ready.starts,[event]);assert.equal(ready.pointer.shoot,true);assert.equal(ready.pointer.shootId,13);assert.equal(ready.impulses.fireOnce,true);
    assert.deepEqual(otherControls(ready.pointer,ready.impulses),{x:444,y:555,known:true,dash:true,lure:false,molotov:true,reload:false});
    assert.equal(ready.canvas.hasPointerCapture(13),true);assert.deepEqual(ready.canvas.operations,[{type:'capture',id:13}]);
  }
});

test('duplicate presses and a second pointer cannot alter an owned shot or its pending pulse',()=>{
  const{canvas,pointer,impulses,starts}=controls();canvas.emit('pointerdown');
  const before=JSON.stringify({pointer,impulses});Object.freeze(pointer);Object.freeze(impulses);
  for(const pointerId of [7,99])canvas.emit('pointerdown',{pointerId,clientX:999,clientY:999});
  for(const type of ['pointerup','pointercancel','lostpointercapture','pointermove'])canvas.emit(type,{pointerId:99,buttons:0});
  assert.equal(JSON.stringify({pointer,impulses}),before);assert.equal(starts.length,1);assert.equal(canvas.hasPointerCapture(7),true);
  assert.deepEqual(canvas.operations,[{type:'capture',id:7}]);
});

test('normal release and a left release in a right-button chord clear ownership before natural capture loss and keep the tap',()=>{
  for(const ending of ['pointerup','pointermove']){
    const{canvas,pointer,impulses}=controls();canvas.emit('pointerdown');const other=otherControls(pointer,impulses);
    canvas.onRelease=id=>{assert.equal(id,7);assert.equal(pointer.shoot,false);assert.equal(pointer.shootId,null);assert.equal(impulses.fireOnce,true);};
    canvas.emit('pointermove',{buttons:3});assert.equal(pointer.shoot,true,'Adding the right button must keep a held left shot');
    canvas.emit(ending,{buttons:2,button:0});assert.equal(pointer.shoot,false);assert.equal(pointer.shootId,null);assert.equal(impulses.fireOnce,true);
    assert.equal(canvas.hasPointerCapture(7),false);assert.deepEqual(otherControls(pointer,impulses),other);
    const before=JSON.stringify({pointer,impulses});Object.freeze(pointer);Object.freeze(impulses);
    canvas.emit('lostpointercapture',{buttons:0});canvas.emit('pointerup',{buttons:0});assert.equal(JSON.stringify({pointer,impulses}),before);
  }
});

test('cancellation or unexpected capture loss clears the pulse and later events are inert',()=>{
  for(const type of ['pointercancel','lostpointercapture']){
    const{canvas,pointer,impulses}=controls();canvas.emit('pointerdown');const other=otherControls(pointer,impulses);
    canvas.emit(type,{buttons:0});assert.equal(pointer.shoot,false);assert.equal(pointer.shootId,null);assert.equal(impulses.fireOnce,false);
    assert.equal(canvas.hasPointerCapture(7),false);assert.deepEqual(otherControls(pointer,impulses),other);
    const before=JSON.stringify({pointer,impulses});Object.freeze(pointer);Object.freeze(impulses);
    for(const late of ['pointercancel','lostpointercapture','pointerup','pointermove'])canvas.emit(late,{buttons:0});
    assert.equal(JSON.stringify({pointer,impulses}),before);
  }
});

test('explicit cancellation releases only the owned capture, preserves other controls and leaves bindings usable',()=>{
  const control=controls(),{canvas,pointer,impulses,cancel}=control;canvas.emit('pointerdown');canvas.captures.add(91);
  const other=otherControls(pointer,impulses);cancel();
  assert.equal(pointer.shoot,false);assert.equal(pointer.shootId,null);assert.equal(impulses.fireOnce,false);assert.deepEqual(otherControls(pointer,impulses),other);
  assert.equal(canvas.hasPointerCapture(7),false);assert.equal(canvas.hasPointerCapture(91),true);
  cancel();canvas.emit('pointerdown',{pointerId:12});assert.equal(pointer.shootId,12);assert.equal(pointer.shoot,true);
  canvas.emit('pointerup',{pointerId:12});assert.equal(impulses.fireOnce,true);cancel();assert.equal(impulses.fireOnce,false,'A menu or mode reset also discards an already released tap');
  assert.equal(control.starts.length,2);
});

test('capture failure cancels the pending press even if capture partially succeeded, while preserving located aim',()=>{
  for(const failure of ['before','after']){
    const{canvas,pointer,impulses,starts}=controls();canvas.captureFailure=failure;canvas.emit('pointerdown');
    assert.equal(starts.length,1);assert.equal(pointer.shoot,false);assert.equal(pointer.shootId,null);assert.equal(impulses.fireOnce,false);
    assert.equal(canvas.hasPointerCapture(7),false);assert.equal(pointer.known,true);assert.equal(pointer.x,1300);assert.equal(pointer.y,900);
    assert.equal(impulses.dash,true);assert.equal(impulses.molotov,true);
    canvas.captureFailure=null;canvas.emit('pointerdown',{pointerId:8});assert.equal(pointer.shootId,8);assert.equal(canvas.hasPointerCapture(8),true);
  }
});

test('a short click or chord release between ticks produces exactly one real shot for either weapon',()=>{
  for(const weapon of ['shotgun','nailgun'])for(const ending of ['pointerup','pointermove']){
    const{game}=fresh(weapon),control=controls(),ammo=game.player.ammo;control.canvas.emit('pointerdown');
    control.canvas.emit(ending,{buttons:2});const result=step(game,control,.12);
    assert.equal(result.consumed,true);assert.equal(shots(game).length,1);assert.equal(shots(game)[0].weapon,weapon);assert.equal(game.player.ammo,ammo-1);
    step(game,control,.5);assert.equal(shots(game).length,1,'The released click must not resume firing on the next frame');assert.equal(game.player.ammo,ammo-1);
  }
});

test('a captured held press retains either weapon fire rate and stops without another shot after release',()=>{
  for(const weapon of ['shotgun','nailgun']){
    const{game}=fresh(weapon),baseline=fresh(weapon).game,control=controls(),ammo=game.player.ammo;
    control.canvas.emit('pointerdown');step(game,control,.7);
    advanceSimulation(baseline,{fireMode:'manual',aimX:1300,aimY:900,shoot:true,heldShoot:true,fireOnce:false,moveX:0,moveY:0},.7);
    const count=shots(game).length;assert.ok(count>=3,'A held press must fire repeatedly');assert.equal(count,shots(baseline).length);assert.equal(game.player.ammo,ammo-count);
    control.canvas.emit('pointerup');step(game,control,.3);assert.equal(shots(game).length,count);assert.equal(game.player.ammo,ammo-count);
  }
});

test('cancelled, reset or uncaptured pending presses spend no real ammo or firing RNG',()=>{
  for(const weapon of ['shotgun','nailgun'])for(const ending of ['pointercancel','lostpointercapture','reset','capture-failure']){
    const{game}=fresh(weapon),control=controls(),ammo=game.player.ammo,random=game.random.getState(),visual=game.visualRandom.getState();
    if(ending==='capture-failure')control.canvas.captureFailure='after';control.canvas.emit('pointerdown');
    if(ending==='reset')control.cancel();else if(ending!=='capture-failure')control.canvas.emit(ending,{buttons:0});
    step(game,control,.12);assert.equal(shots(game).length,0);assert.equal(game.player.ammo,ammo);
    assert.equal(game.random.getState(),random);assert.equal(game.visualRandom.getState(),visual);
  }
});

test('automatic combat ignores pointer cancellation but still freezes fire when the game pauses',()=>{
  for(const weapon of ['shotgun','nailgun']){
    const{game,target}=fresh(weapon),control=controls(),ammo=game.player.ammo;control.canvas.emit('pointerdown');control.canvas.emit('pointercancel');
    const result=step(game,control,.12,'auto'),count=weapon==='nailgun'?2:1;
    assert.equal(shots(game).length,count);assert.equal(game.player.ammo,ammo-count);assert.equal(result.command.targetId,target.id);assert.equal(result.command.shoot,true);
    game.pause();control.setPlaying(false);control.canvas.emit('pointerdown',{pointerId:8});assert.equal(control.pointer.shoot,false);
    const pausedAmmo=game.player.ammo,paused=step(game,control,.12,'auto');assert.equal(paused.command.shoot,false);assert.equal(paused.command.targetId,null);assert.equal(game.player.ammo,pausedAmmo);
  }
});

test('pointer fire binds only to the supplied EventTarget without ambient window or document access',()=>{
  const names=['window','document'],descriptors=names.map(name=>Object.getOwnPropertyDescriptor(globalThis,name));
  try{
    for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,get(){throw new Error(`Unexpected ${name} access`);}});
    const control=controls();control.canvas.emit('pointerdown');control.canvas.emit('pointerup');control.cancel();assert.equal(control.pointer.shoot,false);
  }finally{
    names.forEach((name,i)=>{if(descriptors[i])Object.defineProperty(globalThis,name,descriptors[i]);else delete globalThis[name];});
  }
});
