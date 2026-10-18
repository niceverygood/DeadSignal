import {cloneBonePose} from './pose-buffer.js';
export class RigPoseHistory{
 constructor(limit=16){this.limit=limit;this.records=new Map();this.epoch=null;}
 selectEpoch(epoch){if(this.epoch!==epoch){this.epoch=epoch;this.records.clear();}return !!epoch;}
 remember(epoch,actor,time,state,angle){if(!this.selectEpoch(epoch)||!Number.isFinite(actor.id)||actor.dead||!(actor.hp>0))return;for(const [id,r]of this.records)if(time-r.time>.2)this.records.delete(id);this.records.delete(actor.id);const record={pose:state.pose,motion:state.motion,key:state.key,angle,time,x:actor.x,y:actor.y};this.records.set(actor.id,record);while(this.records.size>this.limit)this.records.delete(this.records.keys().next().value);return record;}
 takeDeath(epoch,actor,time,age){if(!this.selectEpoch(epoch)||!(age>=0&&age<=.12))return null;const r=this.records.get(actor.seed);if(!r||time<r.time||time-r.time>.15||Math.hypot(actor.x-r.x,actor.y-r.y)>32)return null;this.records.delete(actor.seed);return {key:r.key,pose:cloneBonePose(r.pose),deathStart:age,deathAngle:r.angle,deathMotion:r.motion?.clone(),deathGrounding:r.groundingHeight||0};}
}
export function deathBridgeWeight(state,age){if(!Number.isFinite(state?.deathStart))return 0;const t=Math.max(0,Math.min(1,(age-state.deathStart)/.075));return 1-t*t*(3-2*t);}
export function deathBridgeFacing(state,angle,age){if(!Number.isFinite(state?.deathStart))return angle;return state.deathAngle+Math.atan2(Math.sin(angle-state.deathAngle),Math.cos(angle-state.deathAngle))*(1-deathBridgeWeight(state,age));}