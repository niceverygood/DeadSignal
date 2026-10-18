export const MOLOTOV_RELEASE=.22;
export function createMolotov(player,x,y,level=0){
  if(![x,y,player.x,player.y].every(Number.isFinite))return null;
  const distance=Math.hypot(x-player.x,y-player.y),scale=distance>310?310/distance:1;
  const targetX=player.x+(x-player.x)*scale,targetY=player.y+(y-player.y)*scale,flightDuration=.4+Math.min(distance,310)/310*.28;
  return {x:player.x,y:player.y,startX:player.x,startY:player.y,targetX,targetY,height:34,elapsed:0,release:MOLOTOV_RELEASE,flightDuration,duration:MOLOTOV_RELEASE+flightDuration,
    angle:Math.atan2(targetY-player.y,targetX-player.x),radius:95+level*18,fireDuration:5+level*1.2,released:false};
}
export const MOLOTOV_FALL_DURATION=.7;
export function beginMolotovFall(item,depth){item.elapsed=item.duration;item.fallElapsed=0;item.fallDepth=depth;item.height=0;}
export function advanceMolotovFall(item,dt){item.fallElapsed=Math.min(MOLOTOV_FALL_DURATION,item.fallElapsed+dt);item.height=-item.fallDepth*(item.fallElapsed/MOLOTOV_FALL_DURATION)**2;return item.fallElapsed>=MOLOTOV_FALL_DURATION;}
export function validMolotov(item){
  const falling=item?.fallElapsed!==undefined,vertical=falling?Number.isFinite(item.fallElapsed)&&item.fallElapsed>=0&&item.fallElapsed<MOLOTOV_FALL_DURATION&&Number.isFinite(item.fallDepth)&&item.fallDepth>=80&&item.fallDepth<=300&&item.elapsed===item.duration&&item.released===true&&Math.abs(item.height+item.fallDepth*(item.fallElapsed/MOLOTOV_FALL_DURATION)**2)<1e-7:item?.fallDepth===undefined&&item?.height>=0&&item.height<=150&&item.elapsed>=0&&item.elapsed<item.duration;
  return item&&typeof item==='object'&&[item.x,item.y,item.startX,item.startY,item.targetX,item.targetY,item.height,item.elapsed,item.release,item.flightDuration,item.duration,item.angle,item.radius,item.fireDuration].every(Number.isFinite)
    &&Math.abs(item.x)<3000&&Math.abs(item.y)<2200&&Math.abs(item.startX)<3000&&Math.abs(item.startY)<2200&&Math.abs(item.targetX)<3000&&Math.abs(item.targetY)<2200
    &&vertical&&item.release===MOLOTOV_RELEASE&&item.flightDuration>=.4&&item.flightDuration<=.68
    &&Math.abs(item.duration-item.release-item.flightDuration)<1e-7&&item.radius>=95&&item.radius<=1000&&item.fireDuration>=5&&item.fireDuration<=120&&typeof item.released==='boolean';
}
export function advanceMolotov(item,dt,player){
  item.elapsed+=dt;
  if(!item.released&&item.elapsed>=item.release){item.released=true;item.startX=player.x+Math.cos(item.angle)*12;item.startY=player.y+Math.sin(item.angle)*12;}
  if(!item.released){item.x=player.x;item.y=player.y;return false;}
  const t=Math.max(0,Math.min(1,(item.elapsed-item.release)/item.flightDuration));
  item.x=item.startX+(item.targetX-item.startX)*t;item.y=item.startY+(item.targetY-item.startY)*t;
  item.height=34*(1-t)+4*54*t*(1-t);
  return t>=1;
}
