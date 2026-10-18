import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GLTFLoader} from '../dist/player-rig/vendor/GLTFLoader.js';
import {AnimationSampler} from '../dist/player-rig/animation.js';
import {applyWeaponReadyPose} from '../dist/player-rig/weapon-pose.js';
import {applyUpperBodyAim,LivePlayerRig} from '../dist/player-rig/live-player.js';
import {loadNativeWeapon,weaponGripOffsets,attachAtPose} from '../dist/player-rig/weapon-attachment.js';
import {beginPlayerDeath,samplePlayerDeath} from '../dist/player-rig/death-pose.js';
import {playerMuzzleRecoil} from '../dist/player-rig/weapon-recoil.js';
import {applyThrowPose} from '../dist/player-rig/throw-pose.js';

async function original(){
 const loader=new GLTFLoader();loader.register(()=>({name:'numeric-texture-placeholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const parse=async name=>{const b=await readFile(new URL('../../meshy-sprite-baker/models/'+name,import.meta.url));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
 const run=await parse('survivor-v2-run.glb'),authored=await parse('survivor-rig-motion.glb'),root=run.scene,subject=new THREE.Group(),motion=new THREE.Group(),normal=new THREE.Group();
 const bounds=new THREE.Box3().setFromObject(root,true),center=bounds.getCenter(new THREE.Vector3()),scale=44/(bounds.max.y-bounds.min.y);normal.scale.setScalar(scale);normal.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);normal.add(root);motion.add(normal);subject.add(motion);
 const clips=[run.animations[0],...['DS_Idle','DS_Attack','DS_Hit','DS_Death'].map(n=>authored.animations.find(c=>c.name===n))],sampler=new AnimationSampler({root,subject,motion,clips,subjectHeight:44});
 return {parse,root,subject,motion,sampler,bones:sampler.restTransforms.filter(e=>e.object.isBone).map(e=>e.object)};
}
const point=bone=>bone.getWorldPosition(new THREE.Vector3());
test('actual original player death retains last independent aim and both native gun grips across eight headings',async()=>{
 const model=await original(),config=JSON.parse(await readFile(new URL('../dist/player-rig/weapon-config.json',import.meta.url)));
 for(const name of ['shotgun','nailgun']){
  const weapon=loadNativeWeapon(await model.parse('weapon-'+name+'.glb'),config[name]),offsets=weaponGripOffsets(weapon);
  for(let heading=0;heading<8;heading++){
   model.subject.rotation.y=heading*Math.PI/4;model.sampler.sample(0,model.sampler.clips[0].duration*.37);
   applyWeaponReadyPose({root:model.root,subject:model.subject,supportOffset:offsets.supportOffset});applyUpperBodyAim(model.root,.9);model.sampler.updateSkinPose();
   attachAtPose(weapon,{subject:model.subject,rightHand:model.root.getObjectByName('RightHand'),leftHand:model.root.getObjectByName('LeftHand'),aimDirection:[-Math.sin(.9),0,Math.cos(.9)]});
   const before=model.bones.map(b=>({p:point(b),q:b.quaternion.clone().normalize(),raw:b.quaternion.toArray()})),head=point(model.root.getObjectByName('Head')),muzzle=weapon.model.localToWorld(weapon.raw.muzzle.clone()),scale=weapon.root.getWorldScale(new THREE.Vector3()),state=beginPlayerDeath(model,weapon,model.bones);
   assert.equal(samplePlayerDeath(model,state,0,4).bridgeWeight,1);
   model.bones.forEach((b,i)=>{assert.ok(point(b).distanceTo(before[i].p)<1e-7);assert.ok(1-Math.abs(b.quaternion.clone().normalize().dot(before[i].q))<1e-12);assert.deepEqual(b.quaternion.toArray(),before[i].raw,'first endpoint retains actual source/IK rounding exactly');});
   assert.ok(weapon.model.localToWorld(weapon.raw.muzzle.clone()).distanceTo(muzzle)<1e-7);
   for(const age of [.04,.075,.2,.8,2,5]){
    const sample=samplePlayerDeath(model,state,age,4);assert.ok(sample.bridgeWeight>=0&&sample.bridgeWeight<=1);
    assert.ok(weapon.model.localToWorld(weapon.raw.grip.clone()).distanceTo(point(model.root.getObjectByName('RightHand')))<1e-6,'actual original gun remains on wrist');
    assert.ok(weapon.root.getWorldScale(new THREE.Vector3()).distanceTo(scale)<1e-6,'no weapon stretching during collapse');
    assert.ok(model.bones.every(b=>point(b).toArray().every(Number.isFinite)));
   }
   assert.ok(point(model.root.getObjectByName('Head')).y<head.y-10,'original authored collapse actually lowers the head');
   const final=point(model.root.getObjectByName('Head')),paused=samplePlayerDeath(model,state,5,4);assert.equal(paused.finished,true);assert.ok(point(model.root.getObjectByName('Head')).distanceTo(final)<1e-9);
  }
  weapon.root.removeFromParent();
 }
});

test('cold/stale or different player death keeps the existing baked fallback without inventing pose history',()=>{
 const rig=Object.create(LivePlayerRig.prototype),actor={weapon:'shotgun',hp:0,x:3,y:4};rig.models=new Map([['run',{}]]);rig.weapons=new Map([['shotgun',{}]]);
 const saved=JSON.stringify(actor);assert.equal(rig.deathFrame(actor,1,{},0),null);
 rig.last={actor,time:.5,weapon:'shotgun'};assert.equal(rig.deathFrame(actor,1,{},0),null);
 rig.last={actor:{},time:1,weapon:'shotgun'};assert.equal(rig.deathFrame(actor,1,{},0),null);assert.equal(JSON.stringify(actor),saved);
 const selected={id:'actual-finished-death-frame'};rig.last={actor,death:true,selected};rig.deathState={actor,finished:true,duration:1.12};rig.place=(frame,p)=>{assert.equal(p,actor);return frame;};
 assert.equal(rig.deathFrame(actor,1,{},2),selected,'finished end screen reuses its native pixels without another rig/GPU/alpha pass');assert.equal(JSON.stringify(actor),saved);
});

test('last-shot muzzle emission expires after lethal damage without changing the frozen saved recoil',()=>{
 const player=Object.freeze({hp:0,recoil:.11});assert.equal(playerMuzzleRecoil(player,0),.11);assert.ok(playerMuzzleRecoil(player,.05)<.061);assert.equal(playerMuzzleRecoil(player,.12),0);assert.equal(player.recoil,.11);
 assert.equal(playerMuzzleRecoil({hp:100,recoil:.11},5),.11,'live gameplay flash still uses its actual countdown');
 assert.equal(playerMuzzleRecoil({hp:100,recoil:.11},.12,true),0,'victory also releases a frozen last shot');
});

test('actual original held Molotov remains rigidly on the authored wrist during collapse',async()=>{
 const model=await original(),config=JSON.parse(await readFile(new URL('../dist/player-rig/weapon-config.json',import.meta.url))),weapon=loadNativeWeapon(await model.parse('weapon-nailgun.glb'),config.nailgun);
 model.sampler.sample(0,.3);const offsets=weaponGripOffsets(weapon);applyWeaponReadyPose({root:model.root,subject:model.subject,supportOffset:offsets.supportOffset});model.sampler.updateSkinPose();
 const held=applyThrowPose(model.root,{elapsed:.12,angle:0});model.sampler.updateSkinPose();attachAtPose(weapon,{subject:model.subject,rightHand:model.root.getObjectByName('RightHand'),aimDirection:[0,0,1]});weapon.root.visible=false;
 const asset=await model.parse('throwable-molotov.glb'),bounds=new THREE.Box3().setFromObject(asset.scene,true),center=bounds.getCenter(new THREE.Vector3()),scale=10/(bounds.max.y-bounds.min.y),normal=new THREE.Group(),bottle=new THREE.Group(),scene=new THREE.Scene();normal.scale.setScalar(scale);normal.position.copy(center).multiplyScalar(-scale);normal.add(asset.scene);bottle.add(normal);bottle.position.copy(held.position);bottle.quaternion.copy(held.quaternion);scene.add(model.subject,bottle);
 const state=beginPlayerDeath(model,weapon,model.bones,{heldBottle:bottle}),reference=point(bottle),size=bottle.getWorldScale(new THREE.Vector3());
 samplePlayerDeath(model,state,0,4);assert.ok(point(bottle).distanceTo(reference)<1e-8);assert.equal(state.weaponVisible,false);
 for(const age of [.05,.1,.5,1.3]){samplePlayerDeath(model,state,age,4);assert.ok(point(bottle).distanceTo(point(model.root.getObjectByName('RightHand')))<1e-6);assert.ok(bottle.getWorldScale(new THREE.Vector3()).distanceTo(size)<1e-6);}
});
