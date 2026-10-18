import {Matrix4,Quaternion,Vector3} from './vendor/three.module.js';
import {captureBonePose,blendBonePose} from '../boss-rig/pose-buffer.js';

const transform=object=>({position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()});
function binding(object,hand){
 object.updateWorldMatrix(true,true);const inverse=hand.getWorldQuaternion(new Quaternion()).normalize().invert();
 return {object,from:transform(object),offset:object.getWorldPosition(new Vector3()).sub(hand.getWorldPosition(new Vector3())).applyQuaternion(inverse),rotation:inverse.clone().multiply(object.getWorldQuaternion(new Quaternion()).normalize()),scale:object.getWorldScale(new Vector3())};
}
function follow(item,hand,first){
 if(first){item.object.position.copy(item.from.position);item.object.quaternion.copy(item.from.quaternion);item.object.scale.copy(item.from.scale);}
 else{
  // Follow the wrist rigidly: inherited skeletal shear/scale must never stretch
  // the original gun or bottle during the imported collapse animation.
  const rotation=hand.getWorldQuaternion(new Quaternion()).normalize(),position=item.offset.clone().applyQuaternion(rotation).add(hand.getWorldPosition(new Vector3()));
  const world=new Matrix4().compose(position,rotation.multiply(item.rotation),item.scale);item.object.parent?.updateWorldMatrix(true,false);
  const matrix=new Matrix4().copy(item.object.parent?.matrixWorld||new Matrix4()).invert().multiply(world);matrix.decompose(item.object.position,item.object.quaternion,item.object.scale);
 }
 item.object.updateWorldMatrix(true,true);
}

// Capture the actual last visible imported pose, including aim/reload/throw IK.
// The existing native weapon follows its wrist during collapse, with no mesh,
// scale fitting, gameplay clock or saved actor fields introduced.
export function beginPlayerDeath(model,weapon,bones,{heldBottle=null}={}){
 model.sampler.updateSkinPose();const hand=model.root.getObjectByName('RightHand');if(!hand)throw Error('original-player-death-hand-missing');
 return {bones,pose:captureBonePose(bones),motion:model.motion.position.clone(),yaw:model.subject.quaternion.clone(),weapon:binding(weapon.root,hand),weaponVisible:weapon.root.visible,bottle:heldBottle?binding(heldBottle,hand):null};
}
export function samplePlayerDeath(model,state,elapsed,index=5){
 // The player can die with a90-degree upper-body aim or a raised throwing arm.
 // Give those larger pose changes160ms to settle into the authored collapse.
 const age=Math.max(0,Number.isFinite(elapsed)?elapsed:0),t=Math.min(1,age/.16),weight=1-t*t*(3-2*t);
 model.subject.quaternion.copy(state.yaw);
 model.sampler.sample(index,Math.min(age,model.sampler.clips[index].duration),{removeRootMotion:true,once:true});
 if(weight===1){
  // Exact endpoint copies also retain the tiny imported/IK quaternion rounding
  // present in the last real pose; interpolating at1 would normalize it again.
  state.bones.forEach((bone,i)=>{const from=state.pose[i];bone.position.copy(from.position);bone.quaternion.copy(from.quaternion);bone.scale.copy(from.scale);});model.motion.position.copy(state.motion);
 }else if(weight>0){blendBonePose(state.bones,state.pose,weight);model.motion.position.lerp(state.motion,weight);}
 model.sampler.updateSkinPose();
 const hand=model.root.getObjectByName('RightHand');follow(state.weapon,hand,age===0);if(state.bottle)follow(state.bottle,hand,age===0);
 return {age,bridgeWeight:weight,finished:age>=model.sampler.clips[index].duration};
}
