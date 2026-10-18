import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireEnemyGrid,enemyGridAllocationStats} from '../dist/enemy-separation-grid.js';

// Independent exact pre-pooling construction, including key coercion, cell
// boundaries, dead actors, array order and references to the original objects.
function originalGrid(enemies,compact){
  const grid=new Map(),cell=55;
  for(const e of enemies){if(e.dead)continue;const cx=Math.floor(e.x/cell),cy=Math.floor(e.y/cell),key=compact?cx*65536+cy:cx+','+cy;let bucket=grid.get(key);if(!bucket)grid.set(key,bucket=[]);bucket.push(e);}
  return grid;
}
function exact(actual,expected){
  const a=[...actual],b=[...expected];assert.equal(a.length,b.length);
  for(let n=0;n<a.length;n++){assert.ok(Object.is(a[n][0],b[n][0]),'key and iteration order');assert.equal(a[n][1].length,b[n][1].length);for(let j=0;j<a[n][1].length;j++)assert.equal(a[n][1][j],b[n][1][j],'original actor identity and bucket order');}
}
const enemy=(id,x,y,dead=false)=>({id,x,y,dead});

test('numeric/string keys, floor boundaries and original actor insertion order match the independent construction exactly',()=>{
  for(const compact of [true,false])for(const reuse of [true,false]){
    const owner={},values=[-Infinity,-110,-55-1e-12,-55,-Number.MIN_VALUE,-0,0,55-1e-12,55,55+1e-12,110,Infinity,NaN],actors=values.flatMap((x,n)=>[enemy(n,x,values[values.length-n-1]),enemy(n+100,x,values[values.length-n-1],n%3===0)]);
    actors.push(actors[0]);const before=actors.map(a=>({...a})),lease=acquireEnemyGrid(owner,actors,compact,{reuse});
    exact(lease.grid,originalGrid(actors,compact));assert.deepEqual(actors,before);const buckets=[...lease.grid.values()];lease.release();assert.equal(lease.grid.size,0);assert.ok(buckets.every(b=>b.length===0));assert.equal(enemyGridAllocationStats(owner).retainedActors,0);
  }
});

test('one owner reuses its Map and empty bucket arrays while allocation counters are immutable copies',()=>{
  const owner={},actors=[enemy(1,100,100),enemy(2,101,101),enemy(3,300,300)],first=acquireEnemyGrid(owner,actors,true),map=first.grid,buckets=[...first.grid.values()];
  const active=enemyGridAllocationStats(owner);assert.deepEqual(active,{mapsCreated:1,bucketsCreated:2,bucketReuses:0,acquisitions:1,leasesCreated:1,trackingArraysCreated:1,retainedActors:3,retainedBuckets:0});assert.equal(Object.isFrozen(active),true);assert.throws(()=>{active.mapsCreated=10;},TypeError);
  first.release();first.release();assert.ok(buckets.every(b=>b.length===0));assert.deepEqual(enemyGridAllocationStats(owner),{mapsCreated:1,bucketsCreated:2,bucketReuses:0,acquisitions:1,leasesCreated:1,trackingArraysCreated:1,retainedActors:0,retainedBuckets:2});
  for(let n=0;n<20;n++){const lease=acquireEnemyGrid(owner,actors,n%2===0);assert.equal(lease.grid,map);assert.equal(lease.release,first.release,'release is a shared prototype method');assert.equal(Object.hasOwn(lease,'release'),false);first.release();exact(lease.grid,originalGrid(actors,n%2===0));assert.ok([...lease.grid.values()].every(bucket=>buckets.includes(bucket)));lease.release();}
  assert.deepEqual(enemyGridAllocationStats(owner),{mapsCreated:1,bucketsCreated:2,bucketReuses:40,acquisitions:21,leasesCreated:21,trackingArraysCreated:1,retainedActors:0,retainedBuckets:2});assert.equal(active.acquisitions,1,'earlier stats snapshot must not mutate');
});

test('legacy acquisitions always allocate fresh Maps/buckets and never consume or seed the reusable pool',()=>{
  const owner={},actors=[enemy(1,1,1),enemy(2,100,100)],pooled=acquireEnemyGrid(owner,actors,true),map=pooled.grid,buckets=[...map.values()];pooled.release();
  const baseline=acquireEnemyGrid(owner,actors,true,{reuse:false}),baselineMap=baseline.grid,baselineBuckets=[...baseline.grid.values()];assert.notEqual(baselineMap,map);assert.ok(baselineBuckets.every(b=>!buckets.includes(b)));exact(baseline.grid,originalGrid(actors,true));baseline.release();
  const again=acquireEnemyGrid(owner,actors,true,{reuse:false});assert.notEqual(again.grid,baselineMap);assert.ok([...again.grid.values()].every(b=>!baselineBuckets.includes(b)));again.release();
  assert.deepEqual(enemyGridAllocationStats(owner),{mapsCreated:3,bucketsCreated:6,bucketReuses:0,acquisitions:3,leasesCreated:3,trackingArraysCreated:3,retainedActors:0,retainedBuckets:2});
});

test('nested acquisitions and different owners cannot overwrite outer tick-start memberships',()=>{
  const owner={},other={},actors=[enemy(1,1,1),enemy(2,100,100)],outer=acquireEnemyGrid(owner,actors,true),before=[...outer.grid].map(([key,bucket])=>[key,[...bucket]]);
  const nested=acquireEnemyGrid(owner,[enemy(3,100,100)],true),isolated=acquireEnemyGrid(other,actors,true);assert.notEqual(nested.grid,outer.grid);assert.notEqual(isolated.grid,outer.grid);exact(outer.grid,new Map(before));assert.equal(enemyGridAllocationStats(owner).retainedActors,3);
  nested.release();exact(outer.grid,new Map(before));assert.equal(enemyGridAllocationStats(owner).retainedActors,2);assert.equal(enemyGridAllocationStats(owner).retainedBuckets,0);outer.release();isolated.release();
  assert.deepEqual(enemyGridAllocationStats(owner),{mapsCreated:2,bucketsCreated:3,bucketReuses:0,acquisitions:2,leasesCreated:2,trackingArraysCreated:2,retainedActors:0,retainedBuckets:2});assert.deepEqual(enemyGridAllocationStats(other),{mapsCreated:1,bucketsCreated:2,bucketReuses:0,acquisitions:1,leasesCreated:1,trackingArraysCreated:1,retainedActors:0,retainedBuckets:2});
});

test('actor moves, death, newly pushed spawns and array replacement preserve fixed membership with current actor references',()=>{
  const owner={},a=enemy(1,1,1),b=enemy(2,2,2),actors=[a,b],lease=acquireEnemyGrid(owner,actors,true),bucket=lease.grid.get(0);
  a.x=500;b.dead=true;const spawned=enemy(3,1,1);actors.push(spawned);const replaced=actors.filter(actor=>actor!==b);replaced.push(enemy(4,1,1));
  assert.deepEqual([...lease.grid.keys()],[0]);assert.equal(bucket[0],a);assert.equal(bucket[0].x,500);assert.equal(bucket[1],b);assert.equal(bucket[1].dead,true);assert.equal(bucket.includes(spawned),false);assert.equal(bucket.length,2);
  lease.release();const next=acquireEnemyGrid(owner,replaced,true);exact(next.grid,originalGrid(replaced,true));assert.ok([...next.grid.values()].flat().includes(spawned));assert.equal([...next.grid.values()].flat().includes(b),false);next.release();assert.equal(enemyGridAllocationStats(owner).retainedActors,0);
});

test('builder throws keep the original error and release partial actor references; caller finally can release after an update error',()=>{
  const owner={},marker=new Error('original actor getter failed'),first=enemy(1,1,1),bad={dead:false,get x(){throw marker;},y:1};
  assert.throws(()=>acquireEnemyGrid(owner,[first,bad],true),error=>error===marker);assert.deepEqual(enemyGridAllocationStats(owner),{mapsCreated:1,bucketsCreated:1,bucketReuses:0,acquisitions:1,leasesCreated:1,trackingArraysCreated:1,retainedActors:0,retainedBuckets:1});
  let bucket;assert.throws(()=>{const lease=acquireEnemyGrid(owner,[first],true);bucket=lease.grid.get(0);try{throw marker;}finally{lease.release();}},error=>error===marker);assert.equal(bucket.length,0);assert.equal(enemyGridAllocationStats(owner).retainedActors,0);
  const reads=[],readActor={get dead(){reads.push('dead');return false;},get x(){reads.push('x');return 1;},get y(){reads.push('y');return 1;}},lease=acquireEnemyGrid(owner,[readActor],true);assert.deepEqual(reads,['dead','x','y']);lease.release();assert.deepEqual(reads,['dead','x','y']);
});

test('idle buckets stay bounded and drop all actor references even after oversized custom crowds',()=>{
  const owner={},actors=Array.from({length:270},(_,id)=>enemy(id,id*165,0));
  for(let n=0;n<2;n++){const lease=acquireEnemyGrid(owner,actors,true);assert.equal(lease.grid.size,270);assert.equal(enemyGridAllocationStats(owner).retainedActors,270);lease.release();assert.equal(enemyGridAllocationStats(owner).retainedActors,0);assert.equal(enemyGridAllocationStats(owner).retainedBuckets,256);}
  assert.deepEqual(enemyGridAllocationStats(owner),{mapsCreated:1,bucketsCreated:284,bucketReuses:256,acquisitions:2,leasesCreated:2,trackingArraysCreated:1,retainedActors:0,retainedBuckets:256});
  assert.deepEqual(enemyGridAllocationStats({}),{mapsCreated:0,bucketsCreated:0,bucketReuses:0,acquisitions:0,leasesCreated:0,trackingArraysCreated:0,retainedActors:0,retainedBuckets:0});assert.throws(()=>acquireEnemyGrid(null,[],true),/owner-required/);
});
