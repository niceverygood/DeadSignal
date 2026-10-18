import {getBoss} from '../campaign.js?v=0.29.0';

const DEG=Math.PI/180,MAX_ANGLE=40*DEG,SHOULDER=20*DEG,FOREARM=10*DEG,TORSO=3*DEG;
const caches=new WeakMap(),finite=Number.isFinite,clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{const p=clamp(value);return p*p*(3-2*p);};
function diagnostics(supported,kind=''){
 return {supported,active:false,kind,pose:'',progress:0,shoulderRaise:0,forearmRaise:0,torsoPitch:0,maxCombinedAngle:0,appliedBones:0,cappedBones:0};
}
const unsupported={supported:false,diagnostics:diagnostics(false),apply(){return this.diagnostics;}};

// Input must be the fresh authored pose from AnimationSampler.sample, before
// the existing hit layer, transition/history and updateSkinPose. No clocks or
// gameplay references are used. Replaying the same fresh sample is deterministic;
// every application requires a fresh sample. This is not an anatomical IK solver.
class BossActionLayer{
 constructor(entries,kind){this.entries=entries;this.kind=kind;this.supported=true;this.diagnostics=diagnostics(true,kind);}
 apply(pose,_options){
  const d=this.diagnostics;d.active=false;d.pose='';d.progress=0;d.shoulderRaise=0;d.forearmRaise=0;d.torsoPitch=0;d.maxCombinedAngle=0;d.appliedBones=0;d.cappedBones=0;
  if(!pose||(pose.name!=='windup'&&pose.name!=='attack')||!finite(pose.progress))return d;
  const p=clamp(pose.progress),kind=this.kind;
  let raise,torso;
  const immediate=kind!=='charge'&&kind!=='dash'&&kind!=='shield'&&kind!=='leap'&&kind!=='summon'&&kind!=='pull';
  const impact=kind==='slam'?-.4:-.25;
  if(pose.name==='windup'){
   if(immediate){
    // These original skills resolve when the warning reaches zero. Finish the
    // stroke during that warning, so visible contact is not delayed into recovery.
    const lift=ease(p/.72),strike=ease((p-.72)/.28);
    raise=lift*(1-strike)+impact*strike;torso=-TORSO*lift*(1-strike)+TORSO*strike;
   }else{raise=ease(p);torso=-TORSO*raise;}
  }
  else if(kind==='charge'||kind==='dash'||kind==='shield'){
   // A travelling/guarding body braces; it does not pretend to strike repeatedly.
   raise=1-ease((p-.35)/.65);torso=-TORSO*raise;
  }else if(kind==='leap'){
   // The original leap damages on arrival at the end of its active countdown.
   // Its landing pose then returns through the existing live recovery transition.
   const drop=ease((p-.58)/.42),follow=1;
   raise=(1-drop)-.4*drop*follow;torso=-TORSO*(1-drop)+TORSO*drop*follow;
  }else if(kind==='summon'||kind==='pull'){
   const open=1-ease(p),pulse=Math.sin(Math.PI*p);
   raise=open;torso=-TORSO*open+2*DEG*pulse*pulse;
  }else{
   // The release/impact already happened at the warning boundary. This is
   // its gradual follow-through, not a second delayed visual strike.
   const follow=1-ease(p);raise=impact*follow;torso=TORSO*follow;
  }
  d.active=true;d.pose=pose.name;d.progress=p;d.shoulderRaise=SHOULDER*raise;d.forearmRaise=FOREARM*raise;d.torsoPitch=torso;
  for(let i=0;i<this.entries.length;i++){
   const entry=this.entries[i],q=entry.bone.quaternion;
   let x=q.x,y=q.y,z=q.z,w=q.w;
   if(!finite(x)||!finite(y)||!finite(z)||!finite(w))continue;
   // Inverse-rest * original: only the original local-X articulation gets
   // at most another half of its angle; original Y/Z components remain inputs.
   let dx=entry.rw*x-entry.rx*w-entry.ry*z+entry.rz*y;
   let dy=entry.rw*y+entry.rx*z-entry.ry*w-entry.rz*x;
   let dz=entry.rw*z-entry.rx*y+entry.ry*x-entry.rz*w;
   let dw=entry.rw*w+entry.rx*x+entry.ry*y+entry.rz*z;
   if(dw<0){dx=-dx;dy=-dy;dz=-dz;dw=-dw;}
   const extraX=entry.role==='torso'?torso:.5*(2*Math.atan2(dx,dw));
   const extraZ=entry.role==='torso'?0:entry.side*entry.weight*(entry.role==='arm'?SHOULDER:FOREARM)*raise;
   let c=Math.cos(extraX*.5),s=Math.sin(extraX*.5);
   let nx=x*c+w*s,ny=y*c+z*s,nz=z*c-y*s,nw=w*c-x*s;
   c=Math.cos(extraZ*.5);s=Math.sin(extraZ*.5);
   x=nx*c+ny*s;y=ny*c-nx*s;z=nz*c+nw*s;w=nw*c-nz*s;
   const length=Math.hypot(x,y,z,w);if(!(length>0)||!finite(length))continue;
   x/=length;y/=length;z/=length;w/=length;
   dx=entry.rw*x-entry.rx*w-entry.ry*z+entry.rz*y;
   dy=entry.rw*y+entry.rx*z-entry.ry*w-entry.rz*x;
   dz=entry.rw*z-entry.rx*y+entry.ry*x-entry.rz*w;
   dw=entry.rw*w+entry.rx*x+entry.ry*y+entry.rz*z;
   if(dw<0){dx=-dx;dy=-dy;dz=-dz;dw=-dw;}
   let angle=2*Math.acos(Math.max(-1,Math.min(1,dw)));
   if(angle>MAX_ANGLE){
    const axisLength=Math.hypot(dx,dy,dz);if(!(axisLength>0))continue;
    const k=Math.sin(MAX_ANGLE*.5)/axisLength;dx*=k;dy*=k;dz*=k;dw=Math.cos(MAX_ANGLE*.5);
    x=entry.rw*dx+entry.rx*dw+entry.ry*dz-entry.rz*dy;
    y=entry.rw*dy-entry.rx*dz+entry.ry*dw+entry.rz*dx;
    z=entry.rw*dz+entry.rx*dy-entry.ry*dx+entry.rz*dw;
    w=entry.rw*dw-entry.rx*dx-entry.ry*dy-entry.rz*dz;
    angle=MAX_ANGLE;d.cappedBones++;
   }
   q.set(x,y,z,w);d.appliedBones++;if(angle>d.maxCombinedAngle)d.maxCombinedAngle=angle;
  }
  return d;
 }
}

export function createBossActionLayer(sampler,key){
 const boss=typeof key==='string'?getBoss(key):null;
 // The custom DS axes below belong to the original final-boss rig only.
 // Humanoid middle-boss axes and unregistered/custom actors are never guessed.
 if(!boss||boss.role!=='final'||!sampler||typeof sampler!=='object')return unsupported;
 let byKey=caches.get(sampler);if(byKey?.has(key))return byKey.get(key);
 const rest=sampler.restTransforms;if(!Array.isArray(rest))return unsupported;
 const entries=[],arms=new Set(),forearms=new Set();let thorax=0,valid=true;
 for(let i=0;i<rest.length;i++){
  const saved=rest[i],bone=saved?.object;if(!bone?.isBone)continue;
  const match=/^DS_(Arm|Forearm)_([0-2])_(-1|1)$/.exec(bone.name);
  const role=bone.name==='DS_Thorax'?'torso':match?(match[1]==='Arm'?'arm':'forearm'):null;
  if(!role)continue;
  const q=saved.quaternion,live=bone.quaternion;
  if(!q||!live||typeof live.set!=='function'||![q.x,q.y,q.z,q.w].every(finite)){valid=false;break;}
  const length=Math.hypot(q.x,q.y,q.z,q.w);if(!(length>0)||!finite(length)){valid=false;break;}
  if(role==='torso')thorax++;else{const set=role==='arm'?arms:forearms,name=match[2]+'_'+match[3];if(set.has(name)){valid=false;break;}set.add(name);}
  entries.push({bone,role,side:match?Number(match[3]):0,weight:match?1-Number(match[2])*.12:1,rx:q.x/length,ry:q.y/length,rz:q.z/length,rw:q.w/length});
 }
 if(!valid||thorax!==1||![4,6].includes(arms.size)||forearms.size!==arms.size||[...arms].some(name=>{const [pair,side]=name.split('_');return !forearms.has(name)||!arms.has(pair+'_'+(-Number(side)));}))return unsupported;
 const layer=new BossActionLayer(entries,boss.skill.kind);
 if(!byKey){byKey=new Map();caches.set(sampler,byKey);}byKey.set(key,layer);
 return layer;
}
