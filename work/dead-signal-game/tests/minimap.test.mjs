import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {screenVectorToWorld} from '../dist/projection.js';
import {makeMinimapProjection,layoutKey} from '../dist/minimap.js';

const near=(actual,expected,message='')=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-8,`${message}: ${actual} should match ${expected}`);
function city(stage,route='hospital'){
  const game=new Game({seed:6731,route});for(let i=0;i<stage;i++)game.advanceStage();return game.world;
}
function inViewport(point,viewport){
  assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
  assert.ok(point.x>=viewport.x+viewport.padding-1e-8&&point.x<=viewport.x+viewport.width-viewport.padding+1e-8);
  assert.ok(point.y>=viewport.y+viewport.padding-1e-8&&point.y<=viewport.y+viewport.height-viewport.padding+1e-8);
}

test('every district and map aspect ratio fits its complete diamond into the available panel',()=>{
  const worlds=[city(0),city(1,'hospital'),city(1,'police'),city(2),{width:960,height:720},{width:720,height:960},{width:720,height:720}];
  const layouts=[{x:26,y:164,width:178,height:124,padding:10},{x:7,y:97,width:140,height:105,padding:7},{x:0,y:0,width:300,height:110,padding:12}];
  for(const world of worlds)for(const layout of layouts){
    const map=makeMinimapProjection(world,layout),v=map.viewport;
    const corners=[[0,0],[world.width,0],[world.width,world.height],[0,world.height]].map(([x,y])=>map.project(x,y));
    assert.deepEqual(map.corners,corners);for(const corner of corners)inViewport(corner,v);
    for(const obstacle of world.obstacles||[])for(const point of [[obstacle.x,obstacle.y],[obstacle.x+obstacle.w,obstacle.y+obstacle.h]])inViewport(map.project(...point),v);
    const center=map.project(world.width/2,world.height/2);near(center.x,v.x+v.width/2);near(center.y,v.y+v.height/2);
    near(map.bounds.x,Math.min(...corners.map(p=>p.x)));near(map.bounds.y,Math.min(...corners.map(p=>p.y)));
    near(map.bounds.width,Math.max(...corners.map(p=>p.x))-map.bounds.x);near(map.bounds.height,Math.max(...corners.map(p=>p.y))-map.bounds.y);
    assert.ok(map.scale>0);assert.ok(Math.abs(map.bounds.width-(v.width-v.padding*2))<1e-8||Math.abs(map.bounds.height-(v.height-v.padding*2))<1e-8,'The map should use all available space on its limiting axis');
    const origin=map.project(0,0),east=map.project(1,0),south=map.project(0,1);
    near(Math.hypot(east.x-origin.x,east.y-origin.y),map.scale);near(Math.hypot(south.x-origin.x,south.y-origin.y),map.scale);
  }
});

test('all eight WASD directions and the player arrow agree with movement on the main screen',()=>{
  const world=city(0),map=makeMinimapProjection(world,{x:30,y:160,width:178,height:124,padding:10});
  const origin=map.project(1200,930);
  for(const [key,x,y] of [['W',0,-1],['D',1,0],['S',0,1],['A',-1,0],['WD',1,-1],['DS',1,1],['SA',-1,1],['AW',-1,-1]]){
    const direction=screenVectorToWorld(x,y),next=map.project(1200+direction.x*100,930+direction.y*100);
    const dx=next.x-origin.x,dy=next.y-origin.y,length=Math.hypot(dx,dy),desired=Math.hypot(x,y);
    near(dx/length,x/desired,`${key} position x`);near(dy/length,y/desired,`${key} position y`);
    const angle=map.heading(Math.atan2(direction.y,direction.x));
    near(Math.cos(angle),x/desired,`${key} arrow x`);near(Math.sin(angle),y/desired,`${key} arrow y`);
  }
});

test('world east and south retain their thirty-degree ground axes under different panel shapes',()=>{
  for(const layout of [{width:178,height:124},{width:300,height:90},{width:110,height:250}]){
    const map=makeMinimapProjection({width:2400,height:1800},layout);
    near(map.heading(0),Math.PI/6);near(map.heading(Math.PI/2),Math.PI*5/6);
    near(Math.cos(map.heading(0)),Math.cos(map.heading(Math.PI*2)));
    near(Math.sin(map.heading(Math.PI/2)),Math.sin(map.heading(Math.PI*5/2)));
  }
});

test('projection and terrain identity leave the world, options and both RNG streams untouched',()=>{
  const game=new Game({seed:6731}),options=Object.freeze({x:26,y:164,width:178,height:124,padding:10});
  const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}};
  const before=JSON.stringify(game.snapshot());assert.notEqual(before,'null');freeze(game.world);
  const map=makeMinimapProjection(game.world,options),key=layoutKey(game.world);
  for(let i=0;i<100;i++){
    assert.equal(layoutKey(game.world),key);map.project(i*20,i*15);map.heading(i*.1);
  }
  assert.equal(JSON.stringify(game.snapshot()),before);
  assert.deepEqual(options,{x:26,y:164,width:178,height:124,padding:10});
});

test('terrain cache identity changes on destruction or layout edits but ignores combat and exit state',()=>{
  const game=new Game({seed:6731}),world=game.world,car=world.obstacles.find(o=>o.kind==='car'),road=world.roads[0];
  const key=layoutKey(world);car.hp-=15;game.player.x+=20;world.exit.open=true;
  assert.equal(layoutKey(world),key,'Damage, actors and the dynamic exit marker must not rebuild the terrain');
  for(const [field,value] of [['id',car.id+1000],['x',car.x+1],['y',car.y+1],['w',car.w+1],['h',car.h+1],['kind','fence'],['destroyed',true]]){
    const old=car[field];car[field]=value;assert.notEqual(layoutKey(world),key,`${field} must invalidate terrain`);car[field]=old;
  }
  road.w++;assert.notEqual(layoutKey(world),key);road.w--;
  const oldTheme=world.theme;world.theme='station';assert.notEqual(layoutKey(world),key);world.theme=oldTheme;
  world.width++;assert.notEqual(layoutKey(world),key);world.width--;
  assert.equal(layoutKey(world),key);
  world.obstacles.push({...car,id:9999});assert.notEqual(layoutKey(world),key);world.obstacles.pop();assert.equal(layoutKey(world),key);
});

test('small panels and absent or malformed optional dimensions still yield finite usable coordinates',()=>{
  for(const options of [undefined,null,{width:.5,height:.75,padding:100},{x:NaN,y:Infinity,width:NaN,height:0,padding:-10}]){
    const map=makeMinimapProjection({width:2400,height:1800},options);
    assert.ok(Number.isFinite(map.scale)&&map.scale>0);
    for(const point of map.corners)inViewport(point,map.viewport);
    const fallback=map.project(NaN,undefined);assert.ok(Number.isFinite(fallback.x)&&Number.isFinite(fallback.y));
    assert.ok(Number.isFinite(map.heading(NaN)));
  }
  const absent=makeMinimapProjection();assert.ok(absent.corners.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});
