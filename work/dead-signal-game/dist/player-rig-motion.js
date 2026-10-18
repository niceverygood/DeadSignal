import {PLAYER_WALK_CYCLE_DISTANCE,PLAYER_RUN_CYCLE_DISTANCE,PLAYER_RUN_THRESHOLD} from './player-locomotion.js';

const TAU=Math.PI*2;
export const signedAngle=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));

// Render-only state. Original actor fields and checkpoint phases are untouched.
export class PlayerRigMotion {
  constructor(){this.actors=new WeakMap();}
  select(actor,time){
    const previous=this.actors.get(actor),aim=Number.isFinite(actor.angle)?actor.angle:0;
    if(previous&&time===previous.time)return previous.pose;
    const dt=previous?time-previous.time:0;
    const dx=dt>0?actor.x-previous.x:0,dy=dt>0?actor.y-previous.y:0;
    const distance=Math.hypot(dx,dy),moving=distance>.001&&dt>0&&dt<.5;
    const speed=moving?distance/dt:0,travel=moving?Math.atan2(dy,dx):aim;
    // Choose forward/backward travel so the torso never twists beyond 90deg.
    // Keep the previous branch near sideways to avoid a 180deg hip flip when
    // auto-aim crosses the exact perpendicular while running along a wall.
    const alignment=Math.cos(travel-aim);
    const reverse=moving&&(Math.abs(alignment)<.12?!!previous?.pose.reverse:alignment<0);
    const lowerAngle=moving?signedAngle(travel+(reverse?Math.PI:0)):dt>0&&previous?previous.pose.lowerAngle+signedAngle(aim-previous.pose.lowerAngle)*(1-Math.exp(-dt*12)):aim;
    const cycleDistance=speed>=PLAYER_RUN_THRESHOLD?PLAYER_RUN_CYCLE_DISTANCE:PLAYER_WALK_CYCLE_DISTANCE;
    const phase=dt>0?(previous?.pose.phase||0):0;
    const next=moving?phase+(reverse?-1:1)*distance/cycleDistance:phase;
    const pose=Object.freeze({moving,speed,reverse,lowerAngle,aimAngle:aim,
      upperTwist:signedAngle(aim-lowerAngle),phase:((next%1)+1)%1,
      gait:speed>=PLAYER_RUN_THRESHOLD?'run':'walk',cycleDistance});
    this.actors.set(actor,{x:actor.x,y:actor.y,time,pose});
    return pose;
  }
}
