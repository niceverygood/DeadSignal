import {upperBodyBones,blendHitLayer,hitLayerWeight} from '../dist/boss-rig/hit-layer.js';
import {captureBonePose,blendBonePose} from '../dist/boss-rig/pose-buffer.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GLTFLoader} from '../dist/player-rig/vendor/GLTFLoader.js';
import {AnimationSampler} from '../dist/player-rig/animation.js';
import {bossClipIndices} from '../dist/boss-rig/boss-pose.js';
const registry=JSON.parse(await readFile(new URL('../dist/boss-rig/registry.json',import.meta.url)));
for(const [key,config] of Object.entries(registry.bosses))test(`${key}: unchanged original rig has distinct continuous walk/attack/hit poses`,async()=>{
const bytes=await readFile(new URL(`../dist/boss-rig/${config.file}`,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),config.sha256);
const loader=new GLTFLoader();loader.register(()=>({name:'numeric-texture-placeholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const indices=bossClipIndices(config,gltf.animations);const root=gltf.scene,subject=new THREE.Group(),motion=new THREE.Group();subject.add(motion);motion.add(root);const sampler=new AnimationSampler({root,subject,motion,clips:gltf.animations,subjectHeight:64});const bones=[];root.traverse(n=>{if(n.isBone)bones.push(n);});
for(const [name,count] of [['walk',96],['attack',64],['hit',48]]){assert.equal(config.sampleDensity[name],count);const poses=new Set();for(let i=0;i<count;i++){sampler.sample(indices[name],gltf.animations[indices[name]].duration*(i+.1)/count);poses.add(bones.map(b=>b.quaternion.toArray().map(n=>n.toFixed(6)).join(',')).join(';'));}assert.ok(poses.size>=count*.9,`${name} only ${poses.size}/${count} distinct poses`);}
const upper=upperBodyBones(bones);assert.ok(upper.length>5);const lower=bones.filter(b=>!upper.includes(b));sampler.sample(indices.hit,gltf.animations[indices.hit].duration*.35);const hit=captureBonePose(upper);sampler.sample(indices.walk,gltf.animations[indices.walk].duration*.25);const before=captureBonePose(bones),legs=captureBonePose(lower);blendHitLayer(upper,hit,hitLayerWeight(.09));assert.deepEqual(captureBonePose(lower),legs,'authored walking hips and feet stay exact');assert.ok(bones.some((b,i)=>b.quaternion.angleTo(before[i].quaternion)>.0001),'authored stagger moves the upper body');
sampler.sample(indices.attack,gltf.animations[indices.attack].duration*.3);const attacking=captureBonePose(bones);blendHitLayer(upper,hit,hitLayerWeight(.09)*.28,{torsoOnly:true});const afterAttack=captureBonePose(bones);assert.ok(bones.some((b,i)=>b.quaternion.angleTo(attacking[i].quaternion)>.0001),'authored torso reacts during retained attack');for(let j=0;j<bones.length;j++)if(!/^(Spine\d*|Neck\d*|Head|DS_Thorax|DS_Neck|DS_Head)$/.test(bones[j].name))assert.deepEqual(afterAttack[j],attacking[j],'striking arms, hands, hips and feet local poses stay exact');sampler.sample(indices.walk,gltf.animations[indices.walk].duration*.25);const walking=captureBonePose(bones);sampler.sample(indices.idle,.1);const resting=captureBonePose(bones);sampler.sample(indices.walk,gltf.animations[indices.walk].duration*.25);blendBonePose(bones,resting,.5);for(let j=0;j<bones.length;j++){assert.ok(Math.abs(bones[j].quaternion.length()-1)<1e-5,'mixed original quaternion remains normalized');assert.ok(Math.abs(bones[j].quaternion.angleTo(walking[j].quaternion)-bones[j].quaternion.angleTo(resting[j].quaternion))<1e-4,'mixed original idle/walk follows shortest arc midpoint');}
});
