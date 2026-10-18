import {Vector3,Quaternion} from './vendor/three.module.js';
import {solveArm} from './weapon-pose.js';
const point=bone=>bone.getWorldPosition(new Vector3());
const contact=(side,phase,run)=>run?(side==='Left'?phase>=12/32&&phase<=16/32:phase>=26/32&&phase<=31/32)
  :(side==='Left'?phase>=10/32&&phase<=25/32:(phase>=2/32&&phase<=10/32)||(phase>=27/32&&phase<=31/32));

// These stance windows come from the original measured clips. Running flight
// is left untouched. Bounded ankle IK uses the actual imported leg lengths.
export class FootPlanting {
  constructor(){this.actors=new WeakMap();}
  apply(actor,pose,time,model,weights){
    let state=this.actors.get(actor);
    if(!state||time<state.time||Math.abs(Math.atan2(Math.sin(pose.lowerAngle-state.angle),Math.cos(pose.lowerAngle-state.angle)))>.35){state={anchors:{},time,angle:pose.lowerAngle};this.actors.set(actor,state);}
    const stable=pose.moving&&weights.moveWeight>.9&&(weights.runWeight<.05||weights.runWeight>.95)&&!actor.dashTime;
    let planted=0,maxCorrection=0;
    for(const side of ['Left','Right']){
      const upper=model.root.getObjectByName(side+'UpLeg'),leg=model.root.getObjectByName(side+'Leg'),foot=model.root.getObjectByName(side+'Foot');
      if(!upper||!leg||!foot)continue;
      if(!stable||!contact(side,pose.phase,pose.gait==='run')){delete state.anchors[side];continue;}
      const ankle=point(foot);
      state.anchors[side]??=new Vector3(ankle.x+actor.x,ankle.y,ankle.z+actor.y);
      const target=state.anchors[side].clone().sub(new Vector3(actor.x,0,actor.y));
      const correction=ankle.distanceTo(target);
      if(correction>3){delete state.anchors[side];continue;}
      const orientation=foot.getWorldQuaternion(new Quaternion());
      const knee=point(leg),hip=point(upper),axis=target.clone().sub(hip).normalize();
      const pole=knee.sub(hip);pole.addScaledVector(axis,-pole.dot(axis));
      if(pole.lengthSq()<1e-8)pole.set(Math.cos(pose.lowerAngle),.1,Math.sin(pose.lowerAngle));
      solveArm(upper,leg,foot,target,pole.normalize());
      foot.quaternion.copy(foot.parent.getWorldQuaternion(new Quaternion()).invert().multiply(orientation));
      foot.updateWorldMatrix(true,true);planted++;maxCorrection=Math.max(maxCorrection,correction);
    }
    state.time=time;state.angle=pose.lowerAngle;model.sampler.updateSkinPose();
    return {plantedFeet:planted,maxFootCorrection:maxCorrection};
  }
}
