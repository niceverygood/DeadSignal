import test from 'node:test';
import assert from 'node:assert/strict';
import {hitLayerWeight} from '../dist/boss-rig/hit-layer.js';
test('native recoil loads quickly without first-frame or release pose jumps',()=>{
 assert.equal(hitLayerWeight(.12),0);assert.equal(hitLayerWeight(0),0);
 assert.ok(hitLayerWeight(.108)>.77,'full recoil within12ms');
 assert.ok(hitLayerWeight(.11999)<.000002,'continuous onset');
 assert.ok(hitLayerWeight(.00001)<.000002,'continuous release');
 for(let i=0;i<=1200;i++){const w=hitLayerWeight(i/10000);assert.ok(Number.isFinite(w)&&w>=0&&w<=.8);}
 assert.equal(hitLayerWeight(-1),0);assert.equal(hitLayerWeight(1),0);
});
