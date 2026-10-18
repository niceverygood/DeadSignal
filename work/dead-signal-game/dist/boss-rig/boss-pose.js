import {nativeActionSelection} from '../native-action-animation.js?v=0.29.0';
const TAU=Math.PI*2;
export function bossClipIndices(config,animations){
  return Object.fromEntries(Object.keys(config.clips).map(name=>{
    const index=name==='walk'?animations.findIndex(clip=>clip.name===config.walkName):animations.findIndex(clip=>clip.name.toLowerCase()===`ds_${name}`);
    if(index<0)throw new Error(`original-boss-${name}-clip-missing`);
    return [name,index];
  }));
}
export function bossPose(config,animations,indices,actor,time,locomotion={},options={}){
  const selected=nativeActionSelection({animation:{clips:config.clips}},actor,{...options,pose:options.pose||locomotion.pose||'idle',phase:locomotion.phase||0,simulationTime:time});
  let name=selected?.clip||'idle';
  const walkingHit=name==='hit'&&locomotion.pose==='walk'&&!locomotion.knocked;
  const actionHit=['windup','attack'].includes(name)&&actor.hitFlash>0;
  const hitLayer=walkingHit||actionHit;
  if(walkingHit)name='walk';
  const hasMoveWeight=Number.isFinite(locomotion.moveWeight),weight=hasMoveWeight?Math.max(0,Math.min(1,locomotion.moveWeight)):null;
  const locomotionMix=hasMoveWeight&&!locomotion.knocked&&!locomotion.actionFacing&&['idle','walk'].includes(name)?{weight:weight<.005?0:weight>.995?1:weight,idleIndex:indices.idle,idleTime:((time%animations[indices.idle].duration)+animations[indices.idle].duration)%animations[indices.idle].duration}:null;
  if(locomotionMix)name=locomotionMix.weight>0?'walk':'idle';
  const index=indices[name],clip=animations[index],span=config.clips[name],count=config.sampleDensity[name];
  const phase=((locomotion.phase||0)%TAU+TAU)%TAU/TAU;
  const progress=name==='walk'?phase:span.loop?((time%clip.duration)+clip.duration)%clip.duration/clip.duration:Math.max(0,Math.min(1,(selected?.timeSeconds||0)/span.duration));
  return {name,index,time:progress*clip.duration,locomotionMix,hasMoveWeight,hitLayer:hitLayer?{index:indices.hit,time:Math.max(0,Math.min(1,actionHit?1-actor.hitFlash/.12:(selected?.timeSeconds||0)/config.clips.hit.duration))*animations[indices.hit].duration,scale:actionHit?(name==='windup'?.16:.28):1,torsoOnly:actionHit}:null,loop:span.loop,progress,count,sample:Math.min(count-1,Math.floor(progress*(span.loop?count:count-1)+1e-9)),
    angle:Number.isFinite(locomotion.angle)?locomotion.angle:actor.angle||0};
}
