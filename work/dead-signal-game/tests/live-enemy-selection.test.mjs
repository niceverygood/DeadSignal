import test from 'node:test';import assert from 'node:assert/strict';import {selectLiveEnemies,selectLiveCorpses} from '../dist/live-enemy-selection.js';import {Game} from '../dist/engine.js';
test('final guardian, active attacks and impacts retain live slots ahead of near walkers regardless of draw order',()=>{
 const boss={id:40,x:400,y:0,type:'collector'},attack={id:30,x:250,y:0,attackState:'windup'},hit={id:20,x:200,y:0,hitFlash:.1},walk={id:10,x:1,y:0};const game={player:{x:0,y:0},boss,enemies:[walk,hit,attack,boss]};const before=JSON.stringify(game);assert.deepEqual([...selectLiveEnemies(game,3)],[boss,attack,hit]);game.enemies.reverse();assert.deepEqual([...selectLiveEnemies(game,3)],[boss,attack,hit]);game.enemies.reverse();assert.equal(JSON.stringify(game),before);
});
test('invisible, dead and separately rendered catalog bosses do not waste crowd slots',()=>{
 const es=[{id:1,x:1,y:0,dead:true},{id:2,x:1,y:0,bossKey:'boss-01-mid'},{id:3,x:1,y:0},{id:4,x:2,y:0},{id:5,x:500,y:0}];const g={player:{x:0,y:0},enemies:es};assert.deepEqual([...selectLiveEnemies(g,12,{visible:e=>e.id!==3})],[es[3]]);assert.equal(selectLiveEnemies(g,0).size,0);
});
test('actual crowd selection is bounded and never changes saved physics or RNG',()=>{
 const g=new Game({seed:774});for(let i=0;i<60;i++)g.spawnEnemy('walker',150);const before=JSON.stringify(g.snapshot()),rng=g.random.getState();const s=selectLiveEnemies(g,12,{radius:1000});assert.equal(s.size,12);assert.equal(JSON.stringify(g.snapshot()),before);assert.equal(g.random.getState(),rng);
});

test('fresh final guardian death is prioritized while old bodies and catalog boss corpses stay outside the crowd budget',()=>{
 const near={type:'walker',x:1,y:0,time:11.8,duration:12,seed:1},boss={type:'collector',x:300,y:0,time:11.8,duration:12,seed:2},old={type:'walker',x:0,y:0,time:9,duration:12,seed:3},catalog={...boss,bossKey:'boss-01-final'};const g={player:{x:0,y:0},corpses:[near,old,catalog,boss]};const before=JSON.stringify(g);assert.deepEqual([...selectLiveCorpses(g,1)],[boss]);assert.deepEqual([...selectLiveCorpses(g,2)],[boss,near]);assert.equal(JSON.stringify(g),before);
});
