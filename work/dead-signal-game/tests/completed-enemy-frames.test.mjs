import test from 'node:test';import assert from 'node:assert/strict';
import {CompletedEnemyFrames} from '../dist/completed-enemy-frames.js';
const source=()=>({settledDeath:true,image:{width:256,height:256,pixels:[1,2,3,4]},metadata:{liveRig:true,animation:{name:'DS_Death',samples:96,loop:false}},frame:{sample:95,angle:.3}});
const createImage=()=>{const image={};image.getContext=()=>({drawImage:src=>{image.pixels=src.pixels.slice();}});return image;};

test('finished original enemy frame owns a private copy when the live atlas is overwritten, without corpse writes',()=>{
 const cache=new CompletedEnemyFrames({createImage}),corpse={seed:1,time:10,angle:.3},world={},live=source(),before=JSON.stringify(corpse);cache.observe(world,[corpse]);const completed=cache.remember(corpse,live,42);assert.notEqual(completed.image,live.image);assert.equal(completed.completedNativeDeath,true);assert.deepEqual(completed.image.pixels,live.image.pixels);
 live.image.pixels.fill(99);assert.deepEqual(cache.get(corpse,42).image.pixels,[1,2,3,4],'another actor reusing the source slot cannot change the corpse');assert.equal(cache.remember(corpse,live,42),completed,'repeat render does not allocate another copy');assert.equal(JSON.stringify(corpse),before);assert.equal(completed.frame,live.frame,'original source frame/angle metadata is retained');
});
test('finished-image cache stays at twelve256px bodies and releases missing, expired or restored-world corpses',()=>{
 const cache=new CompletedEnemyFrames({limit:999,createImage}),world={},corpses=Array.from({length:14},(_,seed)=>({seed,time:10,angle:0}));cache.observe(world,corpses);
 for(const corpse of corpses.slice(0,12))cache.remember(corpse,source(),42);cache.get(corpses[0],42);cache.remember(corpses[12],source(),42);assert.equal(cache.entries.size,12);assert.ok(cache.get(corpses[0],42));assert.equal(cache.get(corpses[1],42),null,'least recently visible image is evicted');assert.ok([...cache.entries.values()].reduce((n,e)=>n+e.selected.image.width*e.selected.image.height*4,0)<=3*1024*1024);
 corpses[0].time=0;cache.observe(world,[corpses[0],corpses[12]]);assert.equal(cache.entries.size,1);cache.observe({},[corpses[12]]);assert.equal(cache.entries.size,0,'restored/new world cannot inherit old corpse references');
});
test('unfinished transitions, baked frames, bosses and oversized surfaces are not frozen, and pose/size changes invalidate',()=>{
 let allocations=0;const cache=new CompletedEnemyFrames({createImage:()=>{allocations++;return createImage();}}),corpse={time:10,angle:0};
 for(const changed of [{settledDeath:false},{metadata:{liveRig:false,animation:{name:'DS_Death',samples:96,loop:false}}},{frame:{sample:94}},{image:{width:512,height:512}}])assert.equal(cache.remember(corpse,{...source(),...changed},42),null);
 assert.equal(cache.remember({...corpse,bossKey:'boss-01-mid'},source(),64),null);assert.equal(allocations,0);
 cache.remember(corpse,source(),42);corpse.angle=.4;assert.equal(cache.get(corpse,42),null);cache.remember(corpse,source(),42);assert.equal(cache.get(corpse,44),null);
});
