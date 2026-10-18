import test from 'node:test';import assert from 'node:assert/strict';import {Bone} from '../dist/player-rig/vendor/three.module.js';import {captureBonePose,cloneBonePose} from '../dist/boss-rig/pose-buffer.js';
test('persistent native pose buffers retain exact transforms while reuse removes per-frame bone allocations',()=>{
 const bones=[new Bone(),new Bone()];bones[0].position.set(1,2,3);const pose=captureBonePose(bones),first=pose[0].position;for(let frame=0;frame<128;frame++){bones[0].position.set(frame,frame*2,frame*3);bones[1].quaternion.setFromAxisAngle({x:0,y:1,z:0},frame/128);assert.equal(captureBonePose(bones,pose),pose);assert.equal(pose[0].position,first);assert.deepEqual(pose[0].position.toArray(),bones[0].position.toArray());assert.deepEqual(pose[1].quaternion.toArray(),bones[1].quaternion.toArray());}
});
test('a frozen transition remains independent when the next native pose reuses its buffers',()=>{
 const bones=[new Bone()],pose=captureBonePose(bones),transition=cloneBonePose(pose);const frozen=JSON.stringify(transition);bones[0].position.set(4,5,6);bones[0].scale.set(2,2,2);captureBonePose(bones,pose);assert.equal(JSON.stringify(transition),frozen);assert.notDeepEqual(pose[0].position.toArray(),transition[0].position.toArray());assert.notEqual(pose[0].quaternion,transition[0].quaternion);
});
