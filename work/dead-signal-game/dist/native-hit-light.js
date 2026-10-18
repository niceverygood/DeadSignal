import {project} from './projection.js';
export function collectHitLights(particles,target=new Map()){
 target.clear();for(const p of particles||[])if(p.kind==='weapon-impact'&&p.targetId!=null&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.life>0&&p.maxLife-p.life<=.12)target.set(p.targetId,p);return target;
}
// Draw the actual native pixels again, restricted to the real collision point.
// No coloured substitute silhouette, new damage event or persistent actor field.
export function drawNativeHitLight(c,native,remaining,impact,draw){
 if(!native||!Number.isFinite(remaining)||remaining<=0)return false;
 const t=Math.max(0,Math.min(1,remaining/.12));c.save();c.globalCompositeOperation='screen';c.globalAlpha*=t*(impact?.targetId!=null?.22:.82);const drawn=draw(c,native);c.restore();
 if(impact?.targetId==null)return drawn;
 const q=project(impact.x,impact.y,Number.isFinite(impact.z)?impact.z:22),d=project(impact.x+Math.cos(impact.angle||0),impact.y+Math.sin(impact.angle||0));const origin=project(impact.x,impact.y);const angle=Math.atan2(d.y-origin.y,d.x-origin.x),radius=impact.weapon==='shotgun'?13:8;
 const flash=Math.max(0,1-(.12-remaining)/.075);if(!flash)return drawn;
 c.save();c.beginPath();c.ellipse(q.x,q.y,radius,radius*.72,angle,0,Math.PI*2);c.clip();c.globalCompositeOperation='screen';c.globalAlpha*=flash*flash*.68;draw(c,native);c.restore();return drawn;
}
