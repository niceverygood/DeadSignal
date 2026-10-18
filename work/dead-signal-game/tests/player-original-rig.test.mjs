import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GLTFLoader} from '../dist/player-rig/vendor/GLTFLoader.js';
import {AnimationSampler} from '../dist/player-rig/animation.js';
import {applyWeaponReadyPose} from '../dist/player-rig/weapon-pose.js';
import {loadNativeWeapon,weaponGripOffsets,attachAtPose} from '../dist/player-rig/weapon-attachment.js';
import {applyUpperBodyAim} from '../dist/player-rig/live-player.js';
import {LocomotionBlend} from '../dist/player-rig/locomotion-blend.js';
import {FootPlanting} from '../dist/player-rig/foot-planting.js';

test('actual original GLB keeps feet/hips unchanged while both native weapons follow independent spine aim',async()=>{
  const loader=new GLTFLoader();
  // Numeric bone/mesh test: only browser QA decodes original texture pixels.
  loader.register(()=>({name:'numeric-texture-placeholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const parse=async name=>{const bytes=await readFile(new URL(`../../meshy-sprite-baker/models/${name}`,import.meta.url));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
  const gltf=await parse('survivor-v2-run.glb'),root=gltf.scene;
  const bounds=new THREE.Box3().setFromObject(root,true),center=bounds.getCenter(new THREE.Vector3()),scale=44/(bounds.max.y-bounds.min.y);
  const normalization=new THREE.Group(),motion=new THREE.Group(),subject=new THREE.Group();
  normalization.scale.setScalar(scale);normalization.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
  normalization.add(root);motion.add(normalization);subject.add(motion);
  const sampler=new AnimationSampler({root,subject,motion,clips:gltf.animations,subjectHeight:44});
  for(const name of ['shotgun','nailgun']){
    const metadata=JSON.parse(await readFile(new URL(`../dist/assets/production/survivor-${name}-run-hq32-packed/metadata.json`,import.meta.url),'utf8'));
    const weapon=loadNativeWeapon(await parse(`weapon-${name}.glb`),metadata.nativeWeapon.config),offsets=weaponGripOffsets(weapon);
    for(let sample=0;sample<8;sample++)for(const twist of [-Math.PI/2,-Math.PI/4,0,Math.PI/4,Math.PI/2]){
      sampler.sample(0,gltf.animations[0].duration*sample/8);
      const boneNames=['Hips','LeftFoot','RightFoot','LeftToeBase','RightToeBase'];
      const positions=boneNames.map(name=>root.getObjectByName(name).getWorldPosition(new THREE.Vector3()));
      const pose=applyWeaponReadyPose({root,subject,supportOffset:offsets.supportOffset});assert.equal(pose.supported,true);
      applyUpperBodyAim(root,twist);sampler.updateSkinPose();
      boneNames.forEach((name,index)=>assert.ok(root.getObjectByName(name).getWorldPosition(new THREE.Vector3()).distanceTo(positions[index])<1e-6));
      const attachment=attachAtPose(weapon,{subject,rightHand:root.getObjectByName('RightHand'),leftHand:root.getObjectByName('LeftHand'),aimDirection:[-Math.sin(twist),0,Math.cos(twist)]});
      assert.ok(attachment.gripError<1e-5);assert.ok(attachment.supportError<1e-4,`${name} support=${attachment.supportError}`);assert.ok(attachment.aimErrorDegrees<1e-5);
    }
    weapon.root.removeFromParent();
  }
});

test('original idle/walk/run transitions stay finite and stance IK holds an actual planted ankle without stretching',async()=>{
  const loader=new GLTFLoader();loader.register(()=>({name:'numeric-texture-placeholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const bytes=await readFile(new URL('../../meshy-sprite-baker/models/survivor-rig-motion.glb',import.meta.url));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const root=gltf.scene,bounds=new THREE.Box3().setFromObject(root,true),center=bounds.getCenter(new THREE.Vector3()),scale=44/(bounds.max.y-bounds.min.y);
  const normalization=new THREE.Group(),motion=new THREE.Group(),subject=new THREE.Group();normalization.scale.setScalar(scale);normalization.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);normalization.add(root);motion.add(normalization);subject.add(motion);
  const clips=['walking','running','DS_Idle'].map(name=>gltf.animations.find(clip=>clip.name.includes(name)));
  const sampler=new AnimationSampler({root,subject,motion,clips,subjectHeight:44}),blend=new LocomotionBlend(sampler),model={root,sampler};
  const idle={moving:false,gait:'walk',phase:.4},running={moving:true,gait:'run',phase:.4};blend.sample(idle,0);
  const start=root.getObjectByName('LeftFoot').quaternion.clone();const weights=blend.sample(running,1/60);
  assert.ok(weights.moveWeight>0&&weights.moveWeight<1);assert.ok(weights.runWeight>0&&weights.runWeight<1);
  assert.ok(start.angleTo(root.getObjectByName('LeftFoot').quaternion)<.5);
  for(let i=2;i<=60;i++)blend.sample({...running,phase:(.4+i/60)%1},i/60);
  assert.equal(blend.run,1);assert.equal(blend.move,1);
  const actor={x:0,y:0},plant=new FootPlanting(),pose={moving:true,gait:'run',lowerAngle:Math.PI/2,phase:13/32};
  sampler.sample(1,clips[1].duration*pose.phase);plant.apply(actor,pose,2,model,{moveWeight:1,runWeight:1});
  const foot=root.getObjectByName('LeftFoot'),anchor=foot.getWorldPosition(new THREE.Vector3());
  pose.phase=14/32;actor.y=84.94224/32;sampler.sample(1,clips[1].duration*pose.phase);
  const result=plant.apply(actor,pose,2+1/48,model,{moveWeight:1,runWeight:1});
  assert.ok(result.maxFootCorrection<=3);assert.ok(result.plantedFeet>0);
  assert.ok(foot.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(actor.x,0,actor.y)).distanceTo(anchor)<.01);
  pose.phase=20/32;sampler.sample(1,clips[1].duration*pose.phase);const airborne=foot.getWorldPosition(new THREE.Vector3());
  assert.equal(plant.apply(actor,pose,2.1,model,{moveWeight:1,runWeight:1}).plantedFeet,0);
  assert.ok(foot.getWorldPosition(new THREE.Vector3()).distanceTo(airborne)<1e-8);
});
