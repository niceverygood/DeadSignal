import {Vector3,Quaternion} from './vendor/three.module.js';
import {solveArm} from './weapon-pose.js';
const ease=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
export function applyThrowPose(root,throwable){
  const upper=root.getObjectByName('RightArm'),forearm=root.getObjectByName('RightForeArm'),hand=root.getObjectByName('RightHand');
  if(!upper||!forearm||!hand)return null;
  const age=throwable.elapsed,forward=new Vector3(Math.cos(throwable.angle),0,Math.sin(throwable.angle)),side=new Vector3(-forward.z,0,forward.x);
  const shoulder=upper.getWorldPosition(new Vector3()),rest=hand.getWorldPosition(new Vector3());
  const windup=shoulder.clone().addScaledVector(forward,-4).add(new Vector3(0,12,0));
  const release=shoulder.clone().addScaledVector(forward,13).add(new Vector3(0,4,0));
  const follow=shoulder.clone().addScaledVector(forward,15).add(new Vector3(0,-4,0));
  const target=age<.12?rest.clone().lerp(windup,ease(age/.12)):age<.22?windup.clone().lerp(release,ease((age-.12)/.1)):age<.36?release.clone().lerp(follow,ease((age-.22)/.14)):follow.clone().lerp(rest,ease((age-.36)/.19));
  solveArm(upper,forearm,hand,target,side.clone().multiplyScalar(8).add(new Vector3(0,-4,0)).normalize());
  const current=hand.getWorldQuaternion(new Quaternion()),fingers=new Vector3(0,1,0).applyQuaternion(current);
  const desired=new Quaternion().setFromUnitVectors(fingers.normalize(),forward).multiply(current);
  hand.quaternion.copy(hand.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired));hand.updateWorldMatrix(true,true);
  return {position:hand.getWorldPosition(new Vector3()),quaternion:hand.getWorldQuaternion(new Quaternion())};
}
