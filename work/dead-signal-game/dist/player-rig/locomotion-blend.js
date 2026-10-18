import {Quaternion} from './vendor/three.module.js';
// Mix existing imported bone transforms, never replacement geometry or clips.
export class LocomotionBlend {
  constructor(sampler){this.sampler=sampler;this.time=null;this.move=0;this.run=0;this.bones=sampler.restTransforms.filter(entry=>entry.object.isBone).map(entry=>entry.object);}
  snapshot(){return this.bones.map(bone=>({position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()}));}
  restore(source){this.bones.forEach((bone,index)=>{bone.position.copy(source[index].position);bone.quaternion.copy(source[index].quaternion);bone.scale.copy(source[index].scale);});}
  mix(source,weight){this.bones.forEach((bone,index)=>{bone.position.lerp(source[index].position,weight);bone.quaternion.slerp(source[index].quaternion,weight);bone.scale.lerp(source[index].scale,weight);});}
  sample(pose,time){
    const dt=this.time===null||time<this.time?0:Math.min(.1,time-this.time),ease=1-Math.exp(-dt*18);
    this.move+=(Number(pose.moving)-this.move)*ease;
    this.run+=(Number(pose.gait==='run')-this.run)*ease;
    if(!pose.moving&&this.move<.001)this.move=0;
    if(pose.moving&&this.move>.999)this.move=1;
    if(this.run<.001)this.run=0;if(this.run>.999)this.run=1;
    const clips=this.sampler.clips;
    this.sampler.sample(0,pose.phase*clips[0].duration);
    if(this.run>0){
      const walk=this.run<1?this.snapshot():null;
      this.sampler.sample(1,pose.phase*clips[1].duration);
      if(walk)this.mix(walk,1-this.run);
    }
    if(this.move<1){
      const moving=this.move>0?this.snapshot():null;
      this.sampler.sample(2,(time%clips[2].duration+clips[2].duration)%clips[2].duration);
      if(moving)this.mix(moving,this.move);
    }
    this.sampler.updateSkinPose();this.time=time;
    return {moveWeight:this.move,runWeight:this.run};
  }
}

export function applyAuthoredUpperAction(blend,clipIndex,reference,progress,{time=0,duration=.12}={}){
  if(clipIndex===null&&(!blend.upperAction||(blend.upperAction.key===null&&!blend.upperAction.transition)))return {clipIndex:null,transitionWeight:0,maxAngle:0};
  const sampler=blend.sampler,base=blend.snapshot(),motion=sampler.motion.position.clone();
  const upper=blend.upperBones??=blend.bones.map((bone,index)=>({bone,index})).filter(({bone})=>['Spine','Spine01','Spine02','Head'].includes(bone.name));
  const clamp=t=>Math.max(0,Math.min(1,t)),smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
  let deltas=upper.map(()=>new Quaternion());
  if(clipIndex!==null){
    sampler.sample(clipIndex,clamp(progress)*sampler.clips[clipIndex].duration);
    const pose=blend.snapshot();
    // Imported attack ends with a small residual spine bend. Release that bend
    // over the final35ms instead of dropping it when the countdown reaches zero.
    const release=smooth((1-clamp(progress))*duration/.035);
    deltas=upper.map(({index})=>new Quaternion().slerp(reference[index].quaternion.clone().invert().multiply(pose[index].quaternion).normalize(),release));
  }
  blend.restore(base);sampler.motion.position.copy(motion);
  let state=blend.upperAction;
  if(!state||time<state.time)state={key:null,deltas:upper.map(()=>new Quaternion()),time};
  // A delayed render must not resurrect a hit pose from an old frame after
  // the real action has already ended. Sample the current countdown directly.
  if(time-state.time>.1)state={key:clipIndex,deltas,time};
  if(state.key!==clipIndex)state.transition={from:state.deltas.map(delta=>delta.clone()),start:time,duration:clipIndex===4?.012:.035};
  let transitionWeight=0;
  if(state.transition){
    transitionWeight=1-smooth((time-state.transition.start)/state.transition.duration);
    deltas.forEach((delta,index)=>delta.slerp(state.transition.from[index],transitionWeight));
    if(!transitionWeight)delete state.transition;
  }
  upper.forEach(({bone},index)=>bone.quaternion.multiply(deltas[index]).normalize());
  Object.assign(state,{key:clipIndex,deltas,time});blend.upperAction=state;
  sampler.updateSkinPose();
  return {clipIndex,transitionWeight,maxAngle:Math.max(0,...deltas.map(delta=>new Quaternion().angleTo(delta)))};
}
