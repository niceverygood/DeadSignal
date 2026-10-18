// Use the authored stagger on the spine and its children; locomotion owns hips/feet.
export function upperBodyBones(bones){
 return bones.filter(bone=>{for(let p=bone;p;p=p.parent)if((p.name==='Spine'||p.name==='DS_Thorax'))return true;return false;});
}
export function hitLayerWeight(remaining){
 const t=Math.max(0,Math.min(1,remaining/.12));
 // The impact flash is immediate; the skeleton takes 12ms to load the recoil.
 // Start/end at zero with zero slope so repeated hits never snap to a
 // largely neutral first authored stagger frame.
 const rise=Math.max(0,Math.min(1,(1-t)*.12/.012));
 return .8*(rise*rise*(3-2*rise))*t*t*(3-2*t);
}
export function blendHitLayer(bones,pose,weight,{torsoOnly=false}={}){
 for(let i=0;i<bones.length;i++){const bone=bones[i],target=pose[i];
  // Keep authored striking hands and their local arm chain intact. They
  // inherit the modest torso recoil instead of blending to stagger arms.
  if(torsoOnly&&!/^(Spine\d*|Neck\d*|Head|DS_Thorax|DS_Neck|DS_Head)$/.test(bone.name))continue;
  bone.position.lerp(target.position,weight);bone.quaternion.slerp(target.quaternion,weight);bone.scale.lerp(target.scale,weight);}
}
