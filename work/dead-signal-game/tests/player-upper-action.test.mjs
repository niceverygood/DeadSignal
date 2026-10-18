import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GLTFLoader} from '../dist/player-rig/vendor/GLTFLoader.js';
import {AnimationSampler} from '../dist/player-rig/animation.js';
import {LocomotionBlend,applyAuthoredUpperAction} from '../dist/player-rig/locomotion-blend.js';

async function original(){
 const loader=new GLTFLoader();loader.register(()=>({name:'numeric-texture-placeholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const b=await readFile(new URL('../../meshy-sprite-baker/models/survivor-rig-motion.glb',import.meta.url));
 const g=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),''),root=g.scene,subject=new THREE.Group(),motion=new THREE.Group();subject.add(motion);motion.add(root);
 const clips=['walking','running','DS_Idle','DS_Attack','DS_Hit'].map(n=>g.animations.find(c=>c.name.includes(n)));
 const sampler=new AnimationSampler({root,subject,motion,clips,subjectHeight:44}),blend=new LocomotionBlend(sampler),references=new Map();
 for(const i of [3,4]){sampler.sample(i,0);references.set(i,blend.snapshot());}
 return {sampler,blend,root,references};
}
const rotationEqual=(a,b)=>1-Math.abs(a.clone().normalize().dot(b.clone().normalize()))<1e-12;

test('actual original shot-to-hit transition retains first-frame torso rotation and exact moving lower-body transforms',async()=>{
 const {sampler,blend,root,references}=await original();
 const sample=()=>sampler.sample(1,sampler.clips[1].duration*.45),upper=()=>['Spine','Spine01','Spine02','Head'].map(n=>root.getObjectByName(n).quaternion.clone());
 sample();applyAuthoredUpperAction(blend,3,references.get(3),.2,{time:1,duration:.12});
 sample();const beforeLower=blend.bones.filter(b=>!['Spine','Spine01','Spine02','Head'].includes(b.name)).map(b=>[b,b.position.clone(),b.quaternion.clone(),b.scale.clone()]);
 applyAuthoredUpperAction(blend,3,references.get(3),.4,{time:1.04,duration:.12});const firing=upper();
 sample();const compensation=sampler.motion.position.clone();applyAuthoredUpperAction(blend,4,references.get(4),.4,{time:1.05,duration:.35});
 upper().forEach((q,i)=>assert.ok(rotationEqual(q,firing[i]),'impact switches clips without resetting the current torso pose'));
 assert.deepEqual(sampler.motion.position,compensation);
 for(const [bone,p,q,s]of beforeLower){assert.deepEqual(bone.position,p);assert.deepEqual(bone.scale,s);assert.ok(rotationEqual(bone.quaternion,q),'hips/legs/arms retain actual gait transforms');}
 sample();applyAuthoredUpperAction(blend,4,references.get(4),.44,{time:1.063,duration:.35});assert.ok(upper().some((q,i)=>!rotationEqual(q,firing[i])),'authored hit develops after bounded12ms handoff');
});

test('original residual attack bend releases continuously to neutral and paused redraws stay identical',async()=>{
 const {sampler,blend,root,references}=await original(),sample=()=>sampler.sample(0,.4),spine=root.getObjectByName('Spine');
 sample();applyAuthoredUpperAction(blend,3,references.get(3),.5,{time:1,duration:.12});
 sample();applyAuthoredUpperAction(blend,3,references.get(3),.8,{time:1.04,duration:.12});
 sample();applyAuthoredUpperAction(blend,3,references.get(3),1,{time:1.08,duration:.12});const end=spine.quaternion.clone();
 sample();assert.ok(rotationEqual(spine.quaternion,end),'countdown end no longer drops the imported residual bend');
 const neutral=spine.quaternion.clone();applyAuthoredUpperAction(blend,null,null,1,{time:1.09});assert.ok(rotationEqual(spine.quaternion,neutral));
 sample();const a=applyAuthoredUpperAction(blend,null,null,1,{time:1.10}),q=spine.quaternion.clone();sample();const b=applyAuthoredUpperAction(blend,null,null,1,{time:1.10});assert.deepEqual(a,b);assert.ok(rotationEqual(spine.quaternion,q));
 sample();applyAuthoredUpperAction(blend,3,references.get(3),.4,{time:2,duration:.12});
 sample();const latest=spine.quaternion.clone();const delayed=applyAuthoredUpperAction(blend,null,null,1,{time:2.2});
 assert.ok(rotationEqual(spine.quaternion,latest),'a delayed render does not resurrect an expired action');assert.equal(delayed.maxAngle,0);
});
