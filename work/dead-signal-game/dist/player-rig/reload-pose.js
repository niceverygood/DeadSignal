import {RELOAD_STAGES} from '../reload-stages.js';
import {Vector3} from './vendor/three.module.js';
import {solveArm} from './weapon-pose.js';
const smooth=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
export function applyReloadPose(root,{weapon,remaining,duration,angle=0}){
 if(!(remaining>0)||!(duration>0))return null;
 const upper=root.getObjectByName('LeftArm'),forearm=root.getObjectByName('LeftForeArm'),hand=root.getObjectByName('LeftHand'),right=root.getObjectByName('RightHand'),hips=root.getObjectByName('Hips');
 if(!upper||!forearm||!hand||!right||!hips)return null;
 const progress=Math.max(0,Math.min(1,1-remaining/duration)),rest=hand.getWorldPosition(new Vector3()),grip=right.getWorldPosition(new Vector3()),hip=hips.getWorldPosition(new Vector3());
 const forward=new Vector3(Math.cos(angle),0,Math.sin(angle)),side=upper.getWorldPosition(new Vector3()).sub(right.getWorldPosition(new Vector3()));side.y=0;side.normalize();
 const belt=hip.addScaledVector(side,4).addScaledVector(forward,2).add(new Vector3(0,3,0)),load=grip.clone().lerp(rest,.35).add(new Vector3(0,-2,0));
 const points=[[0,rest],...(RELOAD_STAGES[weapon]||[]).map(s=>[s.progress,s.kind==='retrieve'?belt:s.kind==='rack'?load.clone().add(new Vector3(0,1.5,0)):load]),[1,rest]];
 let index=1;while(index<points.length-1&&progress>points[index][0])index++;const [start,a]=points[index-1],[end,b]=points[index],target=a.clone().lerp(b,smooth((progress-start)/(end-start)));
 const solved=solveArm(upper,forearm,hand,target,side.clone().add(new Vector3(0,-.7,0)).normalize());
 return solved?{progress,phase:progress<.25?'reach':progress<.75?'load':'return',supportReleased:true,handError:solved.actual.distanceTo(solved.target),clamped:solved.clamped}:null;
}
