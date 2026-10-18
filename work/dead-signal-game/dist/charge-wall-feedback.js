import {getBoss} from './campaign.js';
import {drawMaterialImpact} from './weapon-impact.js';
import {project} from './projection.js';
// Presentation history only: no actor, physics, save, timer or RNG writes.
export class ChargeWallFeedback{
 constructor(){this.actors=new WeakMap();this.items=[];this.world=null;}
 observe(game,onImpact=()=>{}){
  if(this.world!==game.world){this.world=game.world;this.actors=new WeakMap();this.items=[];}
  const time=game.time||0;this.items=this.items.filter(p=>time-p.born<.45);
  for(const e of game.enemies||[]){if(e.dead||!(e.bossKey||e.type==='collector'))continue;const boss=getBoss(e.bossKey);if(boss&&boss.skill.kind!=='charge')continue;
   const old=this.actors.get(e),dt=old?time-old.time:0,speed=boss?.skill.speed||540;let struck=old?.struck||false;
   if(e.attackState!=='charge')struck=false;
   if(!struck&&old?.state==='charge'&&e.attackState==='charge'&&dt>0&&dt<=.101&&!(e.stun>0)&&!(old.stun>0)&&Math.hypot(e.x-old.x,e.y-old.y)<speed*dt*.85){
    let best=null;for(const o of game.world.obstacles||[]){if(o.destroyed)continue;const x=Math.max(o.x,Math.min(o.x+o.w,e.x)),y=Math.max(o.y,Math.min(o.y+o.h,e.y)),d=Math.hypot(x-e.x,y-e.y),ahead=(x-e.x)*Math.cos(e.angle)+(y-e.y)*Math.sin(e.angle);if(ahead>0&&d<=(e.r||30)+speed*dt+1&&(!best||d<best.d))best={x,y,d,o};}
    if(best){struck=true;const p={kind:'weapon-impact',surface:['car','barrel','fence'].includes(best.o.kind)?'metal':'concrete',weapon:'shotgun',x:best.x,y:best.y,z:Math.min(30,(e.r||30)*.7),angle:e.angle,depth:best.x===best.o.x+best.o.w||best.y===best.o.y+best.o.h?(best.o.x+best.o.w+best.o.y+best.o.h)/2+.001:(best.x+best.y)/2,born:time,maxLife:.45};this.items.push(p);if(this.items.length>12)this.items.shift();onImpact({x:p.x,y:p.y,material:p.surface,bossKey:e.bossKey});}
   }
   this.actors.set(e,{x:e.x,y:e.y,time,state:e.attackState,stun:e.stun,struck});
  }
 }
 drawItem(c,p,time){const q=project(p.x,p.y,p.z);c.save();c.translate(q.x,q.y);c.scale(1.5,1.5);c.translate(-q.x,-q.y);drawMaterialImpact(c,{...p,life:Math.max(0,p.maxLife-(time-p.born))});c.restore();}
}
