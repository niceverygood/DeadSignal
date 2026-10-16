import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCity} from '../dist/world.js';
import {MISSIONS} from '../dist/campaign.js';
import {Navigation} from '../dist/navigation.js';
import {Game} from '../dist/engine.js';

function makeWorld(options={}){
  let state=73419,calls=0,id=0;
  const random=()=>{calls++;state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const world=createCity({seed:73419,random,nextId:()=>++id,...options});
  return{world,calls,randomState:state,id};
}
const digest=world=>createHash('sha256').update(JSON.stringify(world)).digest('hex');
const geometry=world=>JSON.stringify({roads:world.roads,obstacles:world.obstacles.map(({x,y,w,h,kind})=>({x,y,w,h,kind}))});
// Golden hashes were captured from the unmodified v0.16 city before adding the
// optional mission branch. They include every obstacle, decor item and ID.
const LEGACY=[
  [0,'hospital','bd1953bf1b7ad3ec218988152df4aa912d11cd8b5e5a0403e4284dd91db0a9fa',29],
  [0,'police','bd1953bf1b7ad3ec218988152df4aa912d11cd8b5e5a0403e4284dd91db0a9fa',29],
  [1,'hospital','68c07bcc2c64aafc6b0c1030c81af2f72584c040daa312e6fd6a36aa1c85d659',29],
  [1,'police','e1b4c9ce9623f24f67ab448dfd0e1d969254377333f31d52d15b13be1b1985fe',29],
  [2,'hospital','40c6e1d0471a20c6f9bdf6c5db5221687b74b564c81714604810fb82b804147e',22],
  [2,'police','40c6e1d0471a20c6f9bdf6c5db5221687b74b564c81714604810fb82b804147e',22]
];

test('legacy three-stage layouts, random consumption and obstacle IDs remain exactly v0.16',()=>{
  for(const [stage,route,hash,id]of LEGACY)for(const missionId of [undefined,'unknown-mission']){
    const actual=makeWorld({stage,route,missionId});
    assert.equal(digest(actual.world),hash,`${stage}/${route}/${missionId}`);
    assert.equal(actual.calls,214);assert.equal(actual.randomState,1905422985);assert.equal(actual.id,id);
    assert.equal(Object.hasOwn(actual.world,'missionId'),false);
  }
});

test('twelve campaign cities have distinct physical layouts and use the existing render/save vocabulary',()=>{
  const shapes=new Set();
  for(const mission of MISSIONS){
    const actual=makeWorld({missionId:mission.id}),world=actual.world;
    assert.equal(world.width,2400);assert.equal(world.height,1800);
    assert.deepEqual(world.spawn,{x:1200,y:930});assert.deepEqual(world.exit,{x:1200,y:510,open:false});
    assert.equal(world.missionId,mission.id);assert.equal(world.missionIndex,mission.index);
    assert.equal(world.theme,mission.theme);assert.deepEqual(world.palette,mission.mapPalette);
    assert.equal(world.seed,73419+mission.index);assert.ok(world.obstacles.length<=128);assert.ok(world.decor.length<=256);assert.ok(world.roads.length<=32);
    shapes.add(geometry(world));
    const ids=new Set();for(const obstacle of world.obstacles){
      assert.equal(ids.has(obstacle.id),false);ids.add(obstacle.id);
      assert.ok(['building','car','barrel','fence'].includes(obstacle.kind));
      assert.ok(obstacle.x>=0&&obstacle.y>=0&&obstacle.w>0&&obstacle.h>0&&obstacle.x+obstacle.w<=2400&&obstacle.y+obstacle.h<=1800);
      assert.equal(obstacle.destroyed,false);
      assert.ok(obstacle.hp>0);assert.equal(obstacle.hp,obstacle.maxHp);
    }
    for(const item of world.decor){assert.ok(['rubble','lamp','hydrant','trash','sign'].includes(item.kind));assert.ok(item.x>=0&&item.x<=2400&&item.y>=0&&item.y<=1800);}
    for(const road of world.roads){assert.ok(['x','y'].includes(road.axis));assert.ok(road.x>=0&&road.y>=0&&road.w>0&&road.h>0&&road.x+road.w<=2400&&road.y+road.h<=1800);}
    assert.deepEqual(makeWorld({missionId:mission.id}),actual);
  }
  assert.equal(shapes.size,12);
});

function reach(world,from,target,radius){
  const navigation=new Navigation(world),actor={...from,r:radius};
  const movement={world,blocked:Game.prototype.blocked};
  assert.equal(movement.blocked(actor.x,actor.y,radius),false,`start ${JSON.stringify(from)}`);
  assert.equal(movement.blocked(target.x,target.y,radius),false,`target ${JSON.stringify(target)}`);
  for(let i=0;i<1700&&Math.hypot(actor.x-target.x,actor.y-target.y)>7;i++){
    const direction=navigation.direction(actor,target,radius);
    Game.prototype.move.call(movement,actor,direction.x*6,direction.y*6);
    assert.equal(movement.blocked(actor.x,actor.y,radius),false);
  }
  assert.ok(Math.hypot(actor.x-target.x,actor.y-target.y)<=7,`${world.missionId}, radius${radius}, ${JSON.stringify(from)} → ${JSON.stringify(target)}, ended ${JSON.stringify(actor)}`);
}

test('actual navigation and movement let the player and r49 bosses reach the exit and all combat streets',()=>{
  for(const mission of MISSIONS){
    const {world}=makeWorld({missionId:mission.id});
    for(const radius of [14,49]){
      reach(world,world.spawn,world.exit,radius);
      for(const from of [{x:600,y:930},{x:1800,y:930},{x:1200,y:1300},{x:700,y:450},{x:1700,y:450},{x:700,y:1420},{x:1700,y:1420}])reach(world,from,world.spawn,radius);
    }
  }
});
