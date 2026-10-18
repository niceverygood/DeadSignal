import test from 'node:test';import assert from 'node:assert/strict';import {RigFramePool} from '../dist/boss-rig/frame-pool.js';
test('thousands of changing crowd actors use a fixed12 image surfaces and stale ownership cannot leak a different character',()=>{
 let made=0;const pool=new RigFramePool(()=>({image:{id:made++},context:{}}));pool.reserve(12);const a={},b={},slot=pool.claim(0,a),cache={pool:slot};assert.equal(pool.valid(cache,a),true);pool.claim(0,b);assert.equal(pool.valid(cache,a),false);assert.equal(pool.valid(cache,b),true);
 for(let i=0;i<2000;i++)pool.claim(i%12,{id:i});assert.equal(made,12);assert.equal(pool.slots.length,12);assert.equal(new Set(pool.slots.map(s=>s.image)).size,12);
});
test('unpooled hero/boss/death images remain valid and reserving a smaller batch never reallocates surfaces',()=>{
 let count=0;const pool=new RigFramePool(()=>({image:{id:count++}}));pool.reserve(12);const first=pool.slots[0].image;pool.reserve(4);assert.equal(pool.slots[0].image,first);assert.equal(count,12);assert.equal(pool.valid({image:{}},{}),true);
});
