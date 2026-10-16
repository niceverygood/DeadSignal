import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {RenderSchedule} from '../dist/render-schedule.js';

test('a nonplaying canvas draws initially and at the inclusive hundred-millisecond boundary',()=>{
  const schedule=new RenderSchedule();
  assert.equal(schedule.shouldRender(0),true);
  for(const now of [0,1,16.6667,99.999])assert.equal(schedule.shouldRender(now),false);
  assert.equal(schedule.shouldRender(100),true);assert.equal(schedule.shouldRender(100),false);
  assert.equal(schedule.shouldRender(199.999),false);assert.equal(schedule.shouldRender(200),true);
  assert.equal(schedule.shouldRender(10000),true);assert.equal(schedule.shouldRender(10000),false,'A large time jump should draw once rather than catch up missed frames');
});

test('playing renders every visible rAF including automatic and manual input with the same scene key',()=>{
  const schedule=new RenderSchedule();
  for(const [now,mode] of [[0,'auto'],[0,'manual'],[1,'auto'],[16.6667,'manual'],[33.3333,'auto'],[34,'manual']]){
    assert.equal(schedule.shouldRender(now,{playing:true,key:'playing',mode}),true);
  }
  assert.equal(schedule.shouldRender(35,{playing:false,key:'playing'}),false,'Stopping continuous rendering should restore the idle rate');
});

test('state and screen key changes refresh immediately without waiting for an idle frame',()=>{
  const schedule=new RenderSchedule();assert.equal(schedule.shouldRender(0,{playing:true,key:'playing'}),true);
  for(const [now,key] of [[1,'paused'],[2,'settings'],[3,'paused'],[4,'upgrade'],[5,'supply'],[6,'route'],[7,'event'],[8,'dead'],[9,'menu']]){
    assert.equal(schedule.shouldRender(now,{key}),true,`${key} must refresh when entered`);
    assert.equal(schedule.shouldRender(now,{key}),false,`${key} must subsequently use the idle rate`);
  }
  assert.equal(schedule.shouldRender(10,{playing:true,key:'playing'}),true);
});

test('explicit resize or option invalidation produces one immediate refresh',()=>{
  const schedule=new RenderSchedule();assert.equal(schedule.shouldRender(0,{key:'paused'}),true);
  schedule.invalidate();schedule.invalidate();assert.equal(schedule.shouldRender(1,{key:'paused'}),true);
  assert.equal(schedule.shouldRender(2,{key:'paused'}),false);
  schedule.invalidate();assert.equal(schedule.shouldRender(3,{key:'paused'}),true);
  assert.equal(schedule.shouldRender(4,{key:'paused'}),false);assert.equal(schedule.shouldRender(103,{key:'paused'}),true);
});

test('hidden and opaque-covered canvases skip drawing even while playing and refresh immediately on reveal',()=>{
  for(const flag of ['hidden','covered']){
    const schedule=new RenderSchedule();assert.equal(schedule.shouldRender(0,{key:'paused'}),true);
    assert.equal(schedule.shouldRender(1,{playing:true,key:'paused',[flag]:true}),false);
    assert.equal(schedule.shouldRender(150,{playing:true,key:'paused',[flag]:true}),false);
    assert.equal(schedule.lastRendered,0,'Invisible frames must not advance the last drawn timestamp');
    assert.equal(schedule.shouldRender(151,{key:'paused'}),true);
    assert.equal(schedule.shouldRender(152,{key:'paused'}),false);
  }
  const schedule=new RenderSchedule();
  assert.equal(schedule.shouldRender(0,{playing:true,hidden:true,covered:true}),false);assert.equal(schedule.lastRendered,null);
  assert.equal(schedule.shouldRender(1,{playing:true,covered:true}),false);
  assert.equal(schedule.shouldRender(2,{playing:true,hidden:true}),false);
  assert.equal(schedule.shouldRender(3),true);
});

test('invalidations and scene changes survive repeated hiding and covering before the first visible frame',()=>{
  const schedule=new RenderSchedule();assert.equal(schedule.shouldRender(0,{key:'menu'}),true);
  schedule.invalidate();assert.equal(schedule.shouldRender(1,{key:'menu',covered:true}),false);
  assert.equal(schedule.shouldRender(2,{key:'settings',hidden:true}),false);
  assert.equal(schedule.shouldRender(3,{key:'paused',hidden:true,covered:true}),false);
  schedule.invalidate();assert.equal(schedule.shouldRender(4,{key:'paused',hidden:true}),false);
  assert.equal(schedule.lastRendered,0);assert.equal(schedule.shouldRender(5,{key:'paused'}),true);
  assert.equal(schedule.shouldRender(6,{key:'paused'}),false,'The pending refresh must be consumed exactly once');
});

test('a backward clock forces a fresh frame and restarts the idle interval from that frame',()=>{
  const schedule=new RenderSchedule();assert.equal(schedule.shouldRender(1000,{key:'paused'}),true);
  assert.equal(schedule.shouldRender(1010,{key:'paused'}),false);
  assert.equal(schedule.shouldRender(900,{key:'paused'}),true);assert.equal(schedule.lastRendered,900);
  assert.equal(schedule.shouldRender(900,{key:'paused'}),false);assert.equal(schedule.shouldRender(999.999,{key:'paused'}),false);
  assert.equal(schedule.shouldRender(1000,{key:'paused'}),true);
  assert.equal(schedule.shouldRender(800,{key:'paused',hidden:true}),false);assert.equal(schedule.lastRendered,1000);
  assert.equal(schedule.shouldRender(801,{key:'paused'}),true);assert.equal(schedule.shouldRender(802,{key:'paused'}),false);
});

test('invalid clocks cannot poison scene state, timestamps or a pending refresh',()=>{
  const schedule=new RenderSchedule();assert.equal(schedule.shouldRender(0,{key:'paused'}),true);
  for(const invalid of [undefined,null,NaN,Infinity,-Infinity,'100']){
    assert.equal(schedule.shouldRender(invalid,{playing:true,key:'settings'}),false);
    assert.equal(schedule.lastRendered,0);assert.equal(schedule.key,'paused');
  }
  assert.equal(schedule.shouldRender(1,{key:'settings'}),true);
  schedule.invalidate();assert.equal(schedule.shouldRender(NaN,{key:'settings'}),false);
  assert.equal(schedule.shouldRender(2,{key:'settings'}),true);assert.equal(schedule.shouldRender(3,{key:'settings'}),false);
});

test('the schedule uses only supplied time and leaves DOM, caller options, gameplay and RNG untouched',()=>{
  const game=new Game({seed:4391}),before=JSON.stringify(game.snapshot()),schedule=new RenderSchedule();assert.notEqual(before,'null');
  const options=Object.freeze({key:'paused',playing:false,hidden:false,covered:false});
  const random=Math.random,now=Date.now,descriptors=new Map(['window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    Math.random=()=>{throw new Error('Rendering schedule must not consume ambient randomness');};
    Date.now=()=>{throw new Error('Rendering schedule must use its supplied timestamp');};
    for(const key of descriptors.keys())Object.defineProperty(globalThis,key,{configurable:true,get(){throw new Error(`Rendering schedule must not access ${key}`);}});
    assert.equal(schedule.shouldRender(0,options),true);assert.equal(schedule.shouldRender(50,options),false);
    schedule.invalidate();assert.equal(schedule.shouldRender(51,options),true);assert.equal(schedule.shouldRender(52,options),false);
    assert.equal(JSON.stringify(game.snapshot()),before);
  }finally{
    Math.random=random;Date.now=now;
    for(const [key,descriptor] of descriptors)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
  assert.deepEqual(options,{key:'paused',playing:false,hidden:false,covered:false});
});
