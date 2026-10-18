import test from 'node:test';import assert from 'node:assert/strict';import {LiveBossRig} from '../dist/boss-rig/live-boss.js';
function fixture(){
 const rig=Object.create(LiveBossRig.prototype),gpu={},cpu={},pixels=new Uint8ClampedArray(4*2*4).fill(255),calls={gpu:0,cpu:0,finished:[]};
 Object.assign(rig,{gpuPoseBounds:true,verifyPoseBounds:false,boundsStats:{samples:0,misses:0,maxExtraPixels:0,maxAreaRatio:0,gpuFrames:0,fallbacks:0},lastBatchReadbacks:0,renderer:{setScissorTest(){}},
  batch:{width:4,height:2,items:[0,2].map(offsetX=>({SIZE:2,offsetX,offsetY:0,poseBounds:{x:0,y:0,width:2,height:2}}))},
  gpuSurface(){calls.gpu++;return gpu;},readSurface(){calls.cpu++;return {source:cpu,pixels};},finishFrame(...args){calls.finished.push(args);}});
 return {rig,gpu,cpu,pixels,calls};
}
test('proven native bounds copy every original cell without requesting CPU pixels',()=>{
 const {rig,gpu,calls}=fixture();rig.endBatch();assert.equal(rig.batch,null);assert.equal(calls.gpu,1);assert.equal(calls.cpu,0);assert.equal(rig.lastBatchReadbacks,0);assert.equal(rig.boundsStats.gpuFrames,2);
 assert.equal(calls.finished.length,2);for(const [item,source,pixels,,,,bounds]of calls.finished){assert.equal(source,gpu);assert.equal(pixels,null);assert.equal(bounds,item.poseBounds);}
});
test('one unsupported pose retains exact legacy alpha bounds for the entire native batch',()=>{
 for(const disabled of [true,false]){const {rig,cpu,pixels,calls}=fixture();if(disabled)rig.gpuPoseBounds=false;else rig.batch.items[1].poseBounds=null;
  rig.endBatch();assert.equal(calls.gpu,0);assert.equal(calls.cpu,1);assert.equal(rig.lastBatchReadbacks,1);for(const [,source,data,,,,bounds]of calls.finished){assert.equal(source,cpu);assert.equal(data,pixels);assert.equal(bounds,undefined);}
 }
});
test('explicit QA verification adds a real alpha read without replacing the GPU copied artwork',()=>{
 const {rig,gpu,calls}=fixture();rig.verifyPoseBounds=true;rig.endBatch();assert.equal(calls.gpu,1);assert.equal(calls.cpu,1);assert.equal(rig.lastBatchReadbacks,1);assert.equal(rig.boundsStats.samples,2);assert.equal(rig.boundsStats.misses,0);assert.equal(rig.boundsStats.maxAreaRatio,1);assert.ok(calls.finished.every(args=>args[1]===gpu));
});
