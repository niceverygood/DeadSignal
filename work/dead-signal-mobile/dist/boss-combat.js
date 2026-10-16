import {getBoss} from './campaign.js?v=0.26.0';
import {ADDITIONAL_BOSS_SKILLS,updateAdditionalBoss,updateBossHazards} from './boss-patterns.js?v=0.26.0';

export const MAX_BOSS_HAZARDS=48;
export const MAX_HOSTILE_PROJECTILES=120;
export const IMPLEMENTED_BOSS_SKILLS=Object.freeze(['charge','summon','spit',...ADDITIONAL_BOSS_SKILLS]);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const value=(n,fallback,min,max)=>Number.isFinite(n)?clamp(n,min,max):fallback;
function rayEndpoint(game,x,y,angle,range,r){
  const dx=Math.cos(angle),dy=Math.sin(angle),margin=35+r;let length=range;
  if(dx>1e-9)length=Math.min(length,(game.world.width-margin-x)/dx);else if(dx< -1e-9)length=Math.min(length,(margin-x)/dx);
  if(dy>1e-9)length=Math.min(length,(game.world.height-margin-y)/dy);else if(dy< -1e-9)length=Math.min(length,(margin-y)/dy);
  length=Math.max(0,length);return{x:x+dx*length,y:y+dy*length};
}
const collisionRect=(ax,ay,bx,by,o,pad)=>{
  let low=0,high=1;
  for(const [start,delta,min,max] of [[ax,bx-ax,o.x-pad,o.x+o.w+pad],[ay,by-ay,o.y-pad,o.y+o.h+pad]]){
    if(Math.abs(delta)<1e-9){if(start<min||start>max)return null;}
    else{let a=(min-start)/delta,b=(max-start)/delta;if(a>b)[a,b]=[b,a];low=Math.max(low,a);high=Math.min(high,b);if(low>high)return null;}
  }
  return low;
};
const collisionCircle=(ax,ay,bx,by,x,y,r)=>{
  const dx=bx-ax,dy=by-ay,fx=ax-x,fy=ay-y,a=dx*dx+dy*dy,c=fx*fx+fy*fy-r*r;
  if(c<=0)return 0;if(a===0)return null;
  const b=2*(fx*dx+fy*dy),disc=b*b-4*a*c;if(disc<0)return null;
  const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;
};
const ownerAlive=(game,id)=>game.enemies.some(enemy=>enemy.id===id&&!enemy.dead&&enemy.hp>0&&enemy.bossKey);
function hazard(game,e,kind,shape,x,y,targetX,targetY,r,width,time,color){
  game.bossHazards.push({id:++game.id,ownerId:e.id,kind,shape,x,y,targetX,targetY,r,width,time,duration:time,phase:'warning',damage:0,color});
  if(game.bossHazards.length>MAX_BOSS_HAZARDS)game.bossHazards.splice(0,game.bossHazards.length-MAX_BOSS_HAZARDS);
}
export function clearBossEffects(game,ownerId){
  game.bossHazards=game.bossHazards.filter(item=>item.ownerId!==ownerId);
  game.hostileProjectiles=game.hostileProjectiles.filter(item=>item.ownerId!==ownerId);
}
function warn(game,e,boss){
  const skill=boss.skill,kind=skill.kind,windup=value(skill.windup,.9,.2,5),p=game.player;
  e.attackState='windup';e.attackTime=windup;e.skillCd=value(skill.cooldown,6,1,60);
  if(kind==='summon'){
    const radius=value(skill.radius,120,40,240),dx=e.x-p.x,dy=e.y-p.y,length=Math.hypot(dx,dy)||1,offset=length<250?220:0;
    e.targetX=clamp(e.x+dx/length*offset,35+radius,game.world.width-35-radius);
    e.targetY=clamp(e.y+dy/length*offset,35+radius,game.world.height-35-radius);
    hazard(game,e,kind,'circle',e.targetX,e.targetY,e.targetX,e.targetY,radius,1,windup,'#d6a04d');
  }else{
    const dx=p.x-e.x,dy=p.y-e.y,aim=Math.hypot(dx,dy)>1e-9?Math.atan2(dy,dx):e.angle;
    const duration=value(skill.duration,kind==='charge'?.75:2.4,.2,5),speed=value(kind==='charge'?skill.speed:skill.projectileSpeed,kind==='charge'?520:260,50,900);
    const range=value(skill.range,speed*duration,50,1800),r=kind==='charge'?e.r:value(skill.radius,9,3,30);
    const target=rayEndpoint(game,e.x,e.y,aim,range,r);e.targetX=target.x;e.targetY=target.y;
    const count=kind==='spit'?Math.round(value(skill.count,1,1,7)):1,spread=value(skill.spread,0,0,Math.PI),angle=Math.atan2(e.targetY-e.y,e.targetX-e.x);
    for(let i=0;i<count;i++){
      const direction=angle+(count===1?0:(i/(count-1)-.5)*spread),end=rayEndpoint(game,e.x,e.y,direction,range,r);
      hazard(game,e,kind,'line',e.x,e.y,end.x,end.y,r,r*2,windup,kind==='charge'?'#e6865d':'#94b86e');
    }
  }
  game.emit('bosswarn',{bossKey:e.bossKey,role:e.bossRole,kind});
}
function resolve(game,e,boss){
  const skill=boss.skill,kind=skill.kind;game.bossHazards=game.bossHazards.filter(item=>item.ownerId!==e.id||item.phase!=='warning');
  const damage=Number.isFinite(skill.damage)?Math.ceil(skill.damage*(game.campaignScale?.damage??1)):e.damage;
  if(kind==='charge'){
    e.attackState='charge';e.attackTime=value(skill.duration,.75,.2,5);e.angle=Math.atan2(e.targetY-e.y,e.targetX-e.x);
  }else{
    e.attackState='recover';e.attackTime=value(skill.recovery,.8,.1,5);
    if(kind==='summon'){
      const radius=value(skill.radius,120,40,240),limit=Math.round(value(skill.maxSummons,12,1,24));
      const count=Math.min(Math.round(value(skill.count,3,1,6)),Math.max(0,limit-game.enemies.filter(enemy=>!enemy.dead&&enemy.summonedBy===e.id).length));
      for(let i=0;i<count;i++)for(let attempt=0;attempt<12;attempt++){
        const angle=game.random()*Math.PI*2,d=radius*(.25+.75*game.random()),x=e.targetX+Math.cos(angle)*d,y=e.targetY+Math.sin(angle)*d,type=skill.summonType==='runner'&&i%2?'runner':'walker',r=type==='runner'?12:14;
        if(Math.hypot(x-game.player.x,y-game.player.y)<=160||game.blocked(x,y,r+2))continue;
        const summoned=game.spawnEnemy(type,0,{x,y});if(summoned)summoned.summonedBy=e.id;break;
      }
    }else if(kind==='spit'){
      const angle=Math.atan2(e.targetY-e.y,e.targetX-e.x),speed=value(skill.projectileSpeed,260,50,900),r=value(skill.radius,9,3,30),life=value(skill.duration,2.4,.2,5),count=Math.round(value(skill.count,1,1,7)),spread=value(skill.spread,0,0,Math.PI);
      for(let i=0;i<count;i++){
        const direction=angle+(count===1?0:(i/(count-1)-.5)*spread);
        const puddleRadius=value(skill.puddleRadius,e.bossRole==='final'?90:75,20,160),puddleDuration=value(skill.puddleDuration,e.bossRole==='final'?4.5:3.5,.2,8),puddleDamage=Number.isFinite(skill.puddleDamage)?Math.ceil(skill.puddleDamage*(game.campaignScale?.damage??1)):Math.ceil(damage*.5);
        game.hostileProjectiles.push({id:++game.id,ownerId:e.id,kind,x:e.x,y:e.y,px:e.x,py:e.y,vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed,r,life,maxLife:life,damage,color:'#94b86e',puddleRadius,puddleDuration,puddleDamage});
      }
      if(game.hostileProjectiles.length>MAX_HOSTILE_PROJECTILES)game.hostileProjectiles.splice(0,game.hostileProjectiles.length-MAX_HOSTILE_PROJECTILES);
    }
  }
  game.emit('bossskill',{bossKey:e.bossKey,role:e.bossRole,kind});
}

// True means this skill owns movement during its warning, attack or recovery.
// Walking bosses use the engine's existing navigation and contact collision.
export function updateCampaignBoss(game,e,dt){
  if(game.state!=='playing'||e.dead)return true;
  e.skillCd=Math.max(0,e.skillCd);
  const boss=getBoss(e.bossKey);if(!boss)return false;
  if(!['charge','summon','spit'].includes(boss.skill.kind))return updateAdditionalBoss(game,e,boss,dt);
  if(e.stun>0)return true;
  if(e.attackState==='windup'){
    e.attackTime-=dt;if(e.attackTime<=0)resolve(game,e,boss);return true;
  }
  if(e.attackState==='charge'){
    const x=e.x,y=e.y,speed=value(boss.skill.speed,520,50,900);game.move(e,Math.cos(e.angle)*speed*dt,Math.sin(e.angle)*speed*dt);
    const damage=Number.isFinite(boss.skill.damage)?Math.ceil(boss.skill.damage*(game.campaignScale?.damage??1)):e.damage;
    if(collisionCircle(x,y,e.x,e.y,game.player.x,game.player.y,e.r+game.player.r)!==null)game.hurtPlayer(damage);
    if(game.state!=='playing')return true;
    e.attackTime-=dt;if(e.attackTime<=0){if(e.skillRepeats>0){e.skillRepeats--;warn(game,e,boss);}else{e.attackState='recover';e.attackTime=value(boss.skill.recovery,1,.1,5);}}return true;
  }
  if(e.attackState==='recover'){
    e.attackTime-=dt;if(e.attackTime<=0){e.attackState='walk';e.attackTime=0;}return true;
  }
  if(e.skillCd<=0){e.skillRepeats=boss.skill.kind==='charge'?Math.max(0,Math.round(value(boss.skill.count,1,1,3))-1):0;warn(game,e,boss);return true;}return false;
}

export function updateBossEffects(game,dt){
  if(game.state!=='playing')return;
  updateBossHazards(game,dt);if(game.state!=='playing')return;
  for(const shot of game.hostileProjectiles){
    if(game.state!=='playing')break;if(!ownerAlive(game,shot.ownerId)){shot.life=0;continue;}
    shot.px=shot.x;shot.py=shot.y;const step=Math.min(dt,shot.life),x=shot.x+shot.vx*step,y=shot.y+shot.vy*step;let wall=Infinity;
    for(const obstacle of game.world.obstacles){if(obstacle.destroyed)continue;const t=collisionRect(shot.x,shot.y,x,y,obstacle,shot.r);if(t!==null)wall=Math.min(wall,t);}
    const player=game.player,hit=collisionCircle(shot.x,shot.y,x,y,player.x,player.y,player.r+shot.r);
    shot.life-=step;
    if(hit!==null&&hit<wall){shot.x+=(x-shot.x)*hit;shot.y+=(y-shot.y)*hit;shot.life=0;game.hurtPlayer(shot.damage);}
    else if(wall!==Infinity){shot.x+=(x-shot.x)*wall;shot.y+=(y-shot.y)*wall;shot.life=0;}
    else{shot.x=x;shot.y=y;if(x<35+shot.r||y<35+shot.r||x>game.world.width-35-shot.r||y>game.world.height-35-shot.r)shot.life=0;}
    if(game.state==='playing'&&shot.life<=0&&shot.kind==='spit'){
      const px=clamp(shot.x,35,game.world.width-35),py=clamp(shot.y,35,game.world.height-35);
      game.bossHazards.push({id:++game.id,ownerId:shot.ownerId,kind:'spit',shape:'circle',x:px,y:py,targetX:px,targetY:py,r:shot.puddleRadius,width:1,time:shot.puddleDuration,duration:shot.puddleDuration,phase:'active',damage:shot.puddleDamage,color:shot.color,tickClock:0});
      if(game.bossHazards.length>MAX_BOSS_HAZARDS)game.bossHazards.splice(0,game.bossHazards.length-MAX_BOSS_HAZARDS);
    }
  }
  game.hostileProjectiles=game.hostileProjectiles.filter(shot=>shot.life>0);
}
