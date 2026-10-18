import {getBoss} from './campaign.js?v=0.29.0';

export const ADDITIONAL_BOSS_SKILLS=Object.freeze(['slam','shield','leap','beam','fire','mine','pull','spread','storm']);
export const BOSS_PATTERN_COLORS=Object.freeze({slam:'#d89c68',shield:'#9abbd4',leap:'#d9a06f',beam:'#abcafa',fire:'#f0a565',mine:'#d5cc87',pull:'#c9a5df',spread:'#b5c76c',storm:'#9dcfea'});
const MAX_HAZARDS=48,MAX_PROJECTILES=120,TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const number=(n,fallback,min,max)=>Number.isFinite(n)?clamp(n,min,max):fallback;
const count=(n,fallback,max=9)=>Math.round(number(n,fallback,1,max));
const damage=(game,e,skill)=>Number.isFinite(skill.damage)?Math.ceil(skill.damage*(game.campaignScale?.damage??1)):e.damage;
const owner=(game,id)=>game.enemies.find(e=>e.id===id&&!e.dead&&e.hp>0&&e.bossKey);
const clearWarnings=(game,e)=>{game.bossHazards=game.bossHazards.filter(h=>h.ownerId!==e.id||h.phase!=='warning');};
const trim=(items,max)=>{if(items.length>max)items.splice(0,items.length-max);};
const aim=(e,p)=>Math.atan2(p.y-e.y,p.x-e.x);
const point=(game,x,y,r=0)=>({x:clamp(x,35+r,game.world.width-35-r),y:clamp(y,35+r,game.world.height-35-r)});

function rectHit(ax,ay,bx,by,o,pad){
  let low=0,high=1;
  for(const[start,delta,min,max]of[[ax,bx-ax,o.x-pad,o.x+o.w+pad],[ay,by-ay,o.y-pad,o.y+o.h+pad]]){
    if(Math.abs(delta)<1e-9){if(start<min||start>max)return null;}
    else{let first=(min-start)/delta,last=(max-start)/delta;if(first>last)[first,last]=[last,first];low=Math.max(low,first);high=Math.min(high,last);if(low>high)return null;}
  }
  return low;
}
function sight(game,a,b,r=0){
  if(game.navigation?.lineOfSight)return game.navigation.lineOfSight(a,b,r);
  return !game.world.obstacles.some(o=>!o.destroyed&&rectHit(a.x,a.y,b.x,b.y,o,r)!==null);
}
function clippedLine(game,e,angle,range,width){
  const end={x:e.x+Math.cos(angle)*range,y:e.y+Math.sin(angle)*range};
  let fraction=1;
  for(const[start,delta,min,max]of[[e.x,end.x-e.x,35+width/2,game.world.width-35-width/2],[e.y,end.y-e.y,35+width/2,game.world.height-35-width/2]]){
    if(delta>0&&start+delta>max)fraction=Math.min(fraction,(max-start)/delta);
    else if(delta<0&&start+delta<min)fraction=Math.min(fraction,(min-start)/delta);
  }
  for(const obstacle of game.world.obstacles){
    if(obstacle.destroyed)continue;
    const hit=rectHit(e.x,e.y,end.x,end.y,obstacle,width/2);
    if(hit!==null)fraction=Math.min(fraction,Math.max(0,hit-1e-6));
  }
  return{x:e.x,y:e.y,targetX:e.x+(end.x-e.x)*fraction,targetY:e.y+(end.y-e.y)*fraction};
}
function legalTarget(game,e,p,range,r=e.r){
  const angle=aim(e,p),length=Math.min(range,Math.hypot(p.x-e.x,p.y-e.y));
  const target=point(game,e.x+Math.cos(angle)*length,e.y+Math.sin(angle)*length,r);
  if(!game.blocked(target.x,target.y,r)&&sight(game,e,target,r))return target;
  let low=0,high=1;
  for(let i=0;i<25;i++){
    const t=(low+high)/2,next={x:e.x+(target.x-e.x)*t,y:e.y+(target.y-e.y)*t};
    if(!game.blocked(next.x,next.y,r)&&sight(game,e,next,r))low=t;else high=t;
  }
  return{x:e.x+(target.x-e.x)*low,y:e.y+(target.y-e.y)*low};
}
function circlePoint(game,e,x,y){return legalTarget(game,e,point(game,x,y),1800,2);}
function hazard(game,e,skill,shape,geometry,windup,activeDuration,extra={}){
  const h={id:++game.id,ownerId:e.id,kind:skill.kind,shape,
    x:geometry.x,y:geometry.y,targetX:geometry.targetX??geometry.x,targetY:geometry.targetY??geometry.y,
    r:geometry.r??1,width:geometry.width??1,time:windup,duration:windup,phase:'warning',
    damage:damage(game,e,skill),color:BOSS_PATTERN_COLORS[skill.kind],activeDuration,innerR:0,force:0,tickClock:0,...extra};
  game.bossHazards.push(h);trim(game.bossHazards,MAX_HAZARDS);return h;
}
function circle(game,e,skill,centre,r,windup,activeDuration,extra={}){
  return hazard(game,e,skill,'circle',{x:centre.x,y:centre.y,r},windup,activeDuration,extra);
}

export function warnAdditionalBoss(game,e,boss){
  const skill=boss.skill,kind=skill.kind;if(!ADDITIONAL_BOSS_SKILLS.includes(kind))return false;
  clearWarnings(game,e);
  const windup=number(skill.windup,.9,.2,5),p=game.player,angle=aim(e,p);
  e.attackState='windup';e.attackTime=windup;e.skillCd=number(skill.cooldown,6,1,60);e.angle=angle;
  const target=legalTarget(game,e,p,number(skill.range,kind==='leap'?310:450,50,1200),kind==='leap'?e.r:2);
  e.targetX=target.x;e.targetY=target.y;
  if(kind==='slam'){
    const radius=number(skill.radius,150,40,280);
    circle(game,e,skill,target,radius,windup,.18);
    if(count(skill.count,1,2)>1)circle(game,e,skill,target,radius+80,windup+.45,.18,{innerR:radius});
  }else if(kind==='shield'){
    circle(game,e,skill,e,e.r+25,windup,number(skill.guardDuration??skill.duration,3,.3,5),{damage:0});
  }else if(kind==='leap'){
    // Landing is triggered by actual movement, so a stunned or obstructed jump
    // never explodes at a location the actor has not reached.
    circle(game,e,skill,target,number(skill.radius,100,40,200),windup+number(skill.duration,.5,.2,2)+.15,0);
  }else if(kind==='beam'||kind==='spread'||kind==='pull'&&boss.role==='mid'){
    const beams=kind==='beam'?count(skill.count,1,3):kind==='spread'?count(skill.count,5):1;
    const spread=number(skill.spread,0,0,Math.PI),width=kind==='spread'?number(skill.radius,10,3,30)*2:number(skill.width,kind==='beam'?34:38,8,160);
    const range=kind==='spread'?number(skill.projectileSpeed,235,50,900)*number(skill.duration,2.8,.2,5):number(skill.range,kind==='beam'?670:440,50,1200);
    for(let i=0;i<beams;i++){
      const direction=angle+(beams===1?0:(i/(beams-1)-.5)*spread),line=clippedLine(game,e,direction,range,width);
      const delay=kind==='beam'?i*.4:0,active=kind==='spread'?0:number(skill.duration,kind==='beam'?.3:.65,.1,5);
      hazard(game,e,skill,'line',{...line,width,r:width/2},windup+delay,active,{force:kind==='pull'?number(skill.force,210,50,400):0});
    }
  }else if(kind==='fire'){
    const total=count(skill.count,2,5),radius=number(skill.radius,100,40,180),length=Math.hypot(target.x-e.x,target.y-e.y);
    for(let i=0;i<total;i++){
      const t=(i+1)/total,centre=circlePoint(game,e,e.x+Math.cos(angle)*length*t,e.y+Math.sin(angle)*length*t);
      circle(game,e,skill,centre,radius,windup,number(skill.duration,4.5,.5,8));
    }
  }else if(kind==='mine'){
    const total=count(skill.count,2,6),radius=number(skill.radius,115,40,180),ring=number(skill.ringRadius,90,60,350);
    for(let i=0;i<total;i++){
      const direction=boss.role==='final'?angle+i/total*TAU:angle+Math.PI/2+(i?Math.PI:0);
      const centre=circlePoint(game,e,target.x+Math.cos(direction)*ring,target.y+Math.sin(direction)*ring);
      circle(game,e,skill,centre,radius,windup+number(skill.duration,2.1,.5,4),.18);
    }
  }else if(kind==='pull'){
    e.targetX=e.x;e.targetY=e.y;
    circle(game,e,skill,e,number(skill.radius,280,80,350),windup,number(skill.duration,1.1,.3,3),{force:number(skill.force,250,50,400)});
  }else if(kind==='storm'){
    const total=count(skill.count,3,8),radius=number(skill.radius,100,40,180),rotation=game.random()*TAU;
    const spacing=total===1?0:Math.max(.2,(number(skill.duration,1.5,.5,4)-.18)/(total-1));
    for(let i=0;i<total;i++){
      const direction=rotation+(i-1)/Math.max(1,total-1)*TAU,d=i===0?0:radius*1.55;
      const centre=circlePoint(game,e,target.x+Math.cos(direction)*d,target.y+Math.sin(direction)*d);
      circle(game,e,skill,centre,radius,windup+i*spacing,.18);
    }
  }
  game.emit('bosswarn',{bossKey:e.bossKey,role:e.bossRole,kind});return true;
}

export function resolveAdditionalBoss(game,e,boss){
  const skill=boss.skill,kind=skill.kind;if(!ADDITIONAL_BOSS_SKILLS.includes(kind))return false;
  if(kind==='shield'||kind==='leap'||kind==='pull'){
    e.attackState='charge';e.attackTime=number(kind==='shield'?skill.guardDuration??skill.duration:skill.duration,kind==='shield'?3:kind==='leap'?.5:1.1,.2,5);
  }else{
    e.attackState='recover';e.attackTime=number(skill.recovery,1,.1,5);
    if(kind==='spread'){
      const angle=Math.atan2(e.targetY-e.y,e.targetX-e.x),total=count(skill.count,5),spread=number(skill.spread,1.3,0,Math.PI);
      const speed=number(skill.projectileSpeed,235,50,900),r=number(skill.radius,10,3,30),life=number(skill.duration,2.8,.2,5);
      clearWarnings(game,e);
      for(let i=0;i<total;i++){
        const direction=angle+(total===1?0:(i/(total-1)-.5)*spread);
        game.hostileProjectiles.push({id:++game.id,ownerId:e.id,kind,x:e.x,y:e.y,px:e.x,py:e.y,vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed,r,life,maxLife:life,damage:damage(game,e,skill),color:BOSS_PATTERN_COLORS.spread});
      }
      trim(game.hostileProjectiles,MAX_PROJECTILES);
    }
  }
  game.emit('bossskill',{bossKey:e.bossKey,role:e.bossRole,kind});return true;
}

// Busy attacks own movement; ordinary walking stays with the engine navigation.
export function updateAdditionalBoss(game,e,boss,dt){
  if(!ADDITIONAL_BOSS_SKILLS.includes(boss.skill.kind))return false;
  if(game.state!=='playing'||e.dead)return true;
  const skill=boss.skill,kind=skill.kind;
  if(e.stun>0&&e.attackState==='windup')return true;
  if(e.attackState==='windup'){
    e.attackTime=Math.max(0,e.attackTime-dt);if(e.attackTime===0)resolveAdditionalBoss(game,e,boss);return true;
  }
  if(e.attackState==='charge'){
    if(kind==='leap'){
      const remaining=Math.max(dt,e.attackTime),fraction=Math.min(1,dt/remaining);
      game.move(e,(e.targetX-e.x)*fraction,(e.targetY-e.y)*fraction);
    }else if(kind==='shield'){
      game.move(e,Math.cos(e.angle)*e.speed*.35*dt,Math.sin(e.angle)*e.speed*.35*dt);
    }
    e.attackTime=Math.max(0,e.attackTime-dt);
    if(e.attackTime===0){
      if(kind==='leap')for(const h of game.bossHazards){
        if(h.ownerId!==e.id||h.kind!=='leap'||h.phase!=='warning')continue;
        if(Math.hypot(e.x-h.x,e.y-h.y)<=1){h.phase='active';h.time=.18;h.duration=.18;h.activeDuration=.18;}
        else h.time=0;
      }
      if(kind==='leap'&&e.skillRepeats>0){e.skillRepeats--;warnAdditionalBoss(game,e,boss);}
      else{e.attackState='recover';e.attackTime=number(skill.recovery,1,.1,5);}
    }
    return true;
  }
  if(e.attackState==='recover'){
    e.attackTime=Math.max(0,e.attackTime-dt);
    if(e.attackTime===0){
      if(kind==='spread'&&e.skillRepeats>0){e.skillRepeats--;warnAdditionalBoss(game,e,boss);}
      else e.attackState='walk';
    }
    return true;
  }
  if(e.stun>0)return true;
  if(e.skillCd<=0){
    e.skillRepeats=kind==='leap'?count(skill.count,1,3)-1:kind==='spread'?count(skill.waves,1,3)-1:0;
    warnAdditionalBoss(game,e,boss);return true;
  }
  return false;
}

function segmentDistanceSquared(p,h){
  const dx=h.targetX-h.x,dy=h.targetY-h.y,length=dx*dx+dy*dy;
  const t=length?clamp(((p.x-h.x)*dx+(p.y-h.y)*dy)/length,0,1):0;
  return(p.x-h.x-dx*t)**2+(p.y-h.y-dy*t)**2;
}
function inside(p,h){
  if(h.shape==='line')return segmentDistanceSquared(p,h)<=(h.width/2+p.r)**2;
  const d=Math.hypot(p.x-h.x,p.y-h.y),inner=h.innerR||0;
  return d<=h.r+p.r&&(inner===0||d+p.r>=inner);
}
function hazardSight(game,h,p){
  if(h.shape==='circle')return sight(game,h,p,0);
  // Beams are already clipped to the first wall. A line pull additionally
  // requires an unobstructed chain from its source to the player.
  return h.kind!=='pull'||sight(game,h,p,0);
}

export function updateBossHazards(game,dt){
  if(game.state==='dead'||game.state==='victory'){game.bossHazards=[];game.hostileProjectiles=[];return;}
  if(game.state!=='playing')return;
  const surviving=[];
  for(const h of game.bossHazards){
    const e=owner(game,h.ownerId);if(!e)continue;
    if(h.kind==='shield'&&h.phase==='active'){h.x=e.x;h.y=e.y;h.targetX=e.x;h.targetY=e.y;}
    if(h.phase==='warning'&&e.attackState==='windup'&&e.stun>0){surviving.push(h);continue;}
    h.time-=dt;
    if(h.phase==='warning'&&h.time<=0){
      if(e.attackState==='windup'&&e.attackTime>0){h.time=Number.EPSILON;surviving.push(h);continue;}
      if(!(h.activeDuration>0))continue;
      h.phase='active';h.time+=h.activeDuration;h.duration=h.activeDuration;
    }
    if(h.phase==='active'){
      h.tickClock=Math.max(0,(h.tickClock||0)-dt);
      const p=game.player,hit=inside(p,h)&&hazardSight(game,h,p);
      if(hit&&h.force>0){
        const dx=e.x-p.x,dy=e.y-p.y,length=Math.hypot(dx,dy)||1;
        const step=Math.min(Math.max(0,length-e.r-p.r),h.force*dt);
        game.move(p,dx/length*step,dy/length*step);
      }
      const canHurt=h.kind!=='pull'||h.time<=.2;
      if(hit&&h.damage>0&&canHurt&&h.tickClock===0&&!(p.invul>0)){
        h.tickClock=h.kind==='spit'?.8:h.kind==='fire'?.65:1;
        game.hurtPlayer(h.damage,h);
        if(game.state!=='playing')break;
      }
    }
    if(h.time>0)surviving.push(h);
  }
  if(game.state==='dead'||game.state==='victory'){game.bossHazards=[];game.hostileProjectiles=[];}
  else game.bossHazards=surviving;
}

export function bossDamageMultiplier(game,e,from){
  const boss=getBoss(e.bossKey);
  if(!boss||boss.skill.kind!=='shield'||e.attackState!=='charge'||e.attackTime<=0||!from)return 1;
  const dx=from.x-e.x,dy=from.y-e.y,length=Math.hypot(dx,dy);if(!length)return 1;
  const arc=number(boss.skill.arc,1.9,.5,Math.PI),dot=(dx*Math.cos(e.angle)+dy*Math.sin(e.angle))/length;
  return dot>=Math.cos(arc/2)?number(boss.skill.shieldReduction??boss.skill.reduction,.2,.05,1):1;
}
