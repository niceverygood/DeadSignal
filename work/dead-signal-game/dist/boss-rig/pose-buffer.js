export function captureBonePose(bones,target=null){
 if(!target||target.length!==bones.length)return bones.map(bone=>({position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()}));
 bones.forEach((bone,i)=>{target[i].position.copy(bone.position);target[i].quaternion.copy(bone.quaternion);target[i].scale.copy(bone.scale);});return target;
}
export const cloneBonePose=pose=>pose.map(t=>({position:t.position.clone(),quaternion:t.quaternion.clone(),scale:t.scale.clone()}));

export function blendBonePose(bones,pose,weight){for(let i=0;i<bones.length;i++){bones[i].position.lerp(pose[i].position,weight);bones[i].quaternion.slerp(pose[i].quaternion,weight);bones[i].scale.lerp(pose[i].scale,weight);}}
