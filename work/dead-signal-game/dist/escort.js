// The payload position is derived from saved objective progress. It has no
// independent timer or disposable renderer state that could diverge on resume.
export function escortPoint(target,elapsed){
 const path=target.path;let total=0;for(let i=1;i<path.length;i++)total+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);
 let left=total*Math.max(0,Math.min(1,elapsed/target.duration));
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.y-a.y);
  if(left<=length||i===path.length-1){
   const t=length?Math.min(1,left/length):0,heading=Math.atan2(b.y-a.y,b.x-a.x),blend=Math.min(48,length/2);
   let angle=heading;const smooth=n=>n*n*(3-2*n),turn=(from,to,n)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*n;
   // Ease the native atlas heading on both sides of a corner. Position and
   // saved progress retain the exact clear polyline; no physics interpolation.
   if(i===1&&Number.isFinite(target.entryAngle)&&left<blend)angle=turn(target.entryAngle,heading,smooth(left/blend));
   else if(i>1&&left<blend){const prior=path[i-2];angle=turn(Math.atan2(a.y-prior.y,a.x-prior.x),heading,.5+.5*smooth(left/blend));}
   else if(i<path.length-1&&length-left<blend){const next=path[i+1];angle=turn(heading,Math.atan2(next.y-b.y,next.x-b.x),.5*smooth(1-(length-left)/blend));}
   return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle};
  }left-=length;
 }
 return {...path[0],angle:0};
}
export const TRANSPORT_WIDTH=58,TRANSPORT_LENGTH=112;
export function transportBody(point){return {x:point.x-TRANSPORT_WIDTH/2,y:point.y-TRANSPORT_LENGTH/2,w:TRANSPORT_WIDTH,h:TRANSPORT_LENGTH};}
export function touchesTransport(x,y,r,body){
 if(r<=0||x+r<=body.x||x-r>=body.x+body.w||y+r<=body.y||y-r>=body.y+body.h)return false;
 const dx=x-Math.max(body.x,Math.min(body.x+body.w,x)),dy=y-Math.max(body.y,Math.min(body.y+body.h,y));return dx*dx+dy*dy<r*r;
}
export function transportRayBlocked(from,to,body,pad=0){
 let low=0,high=1;
 for(let axis=0;axis<2;axis++){
  const start=axis===0?from.x:from.y,delta=axis===0?to.x-from.x:to.y-from.y,min=(axis===0?body.x:body.y)-pad,max=min+(axis===0?body.w:body.h)+pad*2;
  if(Math.abs(delta)<1e-9){if(start<min||start>max)return false;}
  else{let a=(min-start)/delta,b=(max-start)/delta;if(a>b)[a,b]=[b,a];low=Math.max(low,a);high=Math.min(high,b);if(low>high)return false;}
 }return true;
}
export function escortBlockReason(game,target,dt=1/60){
 const radius=target.clearance||80;
 for(const e of game.enemies||[])if(!e.dead&&Math.hypot(e.x-target.x,e.y-target.y)<radius+e.r)return 'enemy';
 // Sweep the derived body forward before committing progress. The payload stops
 // rather than pushing anyone into a wall, even for a large QA update interval.
 const end=Math.min(target.duration,game.expedition.hold+dt),steps=Math.max(1,Math.ceil((end-game.expedition.hold)/.1));
 for(let i=1;i<=steps;i++){
  const body=transportBody(escortPoint(target,game.expedition.hold+(end-game.expedition.hold)*i/steps));
  if(touchesTransport(game.player.x,game.player.y,game.player.r,body))return 'player';
  for(const e of game.enemies||[])if(!e.dead&&touchesTransport(e.x,e.y,e.r,body))return 'enemy';
  for(const o of game.world.obstacles||[])if(!o.destroyed&&body.x<o.x+o.w&&body.x+body.w>o.x&&body.y<o.y+o.h&&body.y+body.h>o.y)return 'obstacle';
 }return null;
}
export const escortBlocked=(game,target,dt)=>!!escortBlockReason(game,target,dt);

// Local detours preserve the static flow field and its exact clearance proofs.
// Only the current moving body is considered here; grids never rebuild per tick.
export function avoidTransport(sight,from,target,radius,direction,body){
 if(!body||!direction.x&&!direction.y)return direction;
 const reach=Math.min(Math.hypot(target.x-from.x,target.y-from.y),Math.max(90,Math.hypot(body.x+body.w/2-from.x,body.y+body.h/2-from.y)+Math.hypot(body.w,body.h)/2+radius+8)),ahead={x:from.x+direction.x*reach,y:from.y+direction.y*reach};
 if(!transportRayBlocked(from,ahead,body,radius))return direction;
 const left=body.x-radius-4,right=body.x+body.w+radius+4,top=body.y-radius-4,bottom=body.y+body.h+radius+4;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const insideTarget=target.x>=body.x&&target.x<=body.x+body.w&&target.y>=body.y&&target.y<=body.y+body.h;
 const points=[{x:left,y:top},{x:left,y:bottom},{x:right,y:top},{x:right,y:bottom}];
 if(!insideTarget){const margin=112;points.push({x:left,y:top-margin},{x:right,y:top-margin},{x:left,y:bottom+margin},{x:right,y:bottom+margin},
  {x:left-margin,y:top},{x:left-margin,y:bottom},{x:right+margin,y:top},{x:right+margin,y:bottom},
  {x:left-margin,y:top-margin},{x:right+margin,y:top-margin},{x:left-margin,y:bottom+margin},{x:right+margin,y:bottom+margin});}
 if(insideTarget)points.push({x:left,y:clamp(from.y,top,bottom)},{x:right,y:clamp(from.y,top,bottom)},
  {x:clamp(from.x,left,right),y:top},{x:clamp(from.x,left,right),y:bottom});
 const costs=points.map(point=>{
  const remaining=Math.hypot(target.x-point.x,target.y-point.y);
  if(insideTarget)return remaining;
  return !transportRayBlocked(point,target,body,radius)&&sight(point,target,radius)?remaining:Infinity;
 });
 const next=new Int32Array(points.length).fill(-1);
 // A corner visibility graph (plus wide-body bypasses) avoids a local minimum
 // when a static generator/wall prevents passing along that side of the car.
 if(!insideTarget){const visited=new Set();for(let pass=0;pass<points.length;pass++){
  let best=-1;for(let i=0;i<points.length;i++)if(!visited.has(i)&&(best<0||costs[i]<costs[best]))best=i;
  if(best<0||!Number.isFinite(costs[best]))break;visited.add(best);
  for(let i=0;i<points.length;i++)if(!visited.has(i)&&!transportRayBlocked(points[i],points[best],body,radius)&&sight(points[i],points[best],radius)){
   const candidate=Math.hypot(points[i].x-points[best].x,points[i].y-points[best].y)+costs[best];if(candidate<costs[i]){costs[i]=candidate;next[i]=best;}
  }
 }}
 let chosen=null,chosenIndex=-1,cost=Infinity;
 for(let i=0;i<points.length;i++){const point=points[i];
  const distance=Math.hypot(point.x-from.x,point.y-from.y);if(transportRayBlocked(from,point,body,radius)||!sight(from,point,radius))continue;
  if(insideTarget&&distance<6)return {x:0,y:0};
  if(distance<.5)continue;
  const candidate=distance+costs[i]+(!insideTarget&&distance<8?16:0);
  if(candidate<cost){cost=candidate;chosen=point;chosenIndex=i;}
 }
 if(!chosen)return {x:0,y:0};const length=Math.hypot(chosen.x-from.x,chosen.y-from.y),waypoints=[];
 for(let i=chosenIndex,guard=0;i>=0&&guard++<points.length;i=next[i])waypoints.push(points[i]);
 return {x:(chosen.x-from.x)/length,y:(chosen.y-from.y)/length,waypoints};
}
export function attachTransportNavigation(nav,game,bodyFor){
 const direction=nav.direction.bind(nav),sight=nav.lineOfSight.bind(nav),plans=new WeakMap();
 nav.direction=(from,target,radius=18)=>{
  radius=Number.isFinite(radius)?Math.max(0,radius):18;const base=direction(from,target,radius),body=bodyFor(game);if(!body||!from||!target||!Number.isFinite(from.x)||!Number.isFinite(from.y)||!Number.isFinite(target.x)||!Number.isFinite(target.y))return base;
  let plan=plans.get(from);
  if(plan&&plan.radius===radius&&plan.revision===nav.revision&&Math.hypot(body.x-plan.bodyX,body.y-plan.bodyY)<12&&Math.hypot(target.x-plan.targetX,target.y-plan.targetY)<40){
   while(plan.points.length&&Math.hypot(plan.points[0].x-from.x,plan.points[0].y-from.y)<6)plan.points.shift();
   const point=plan.points[0];if(point&&!transportRayBlocked(from,point,body,radius)&&sight(from,point,radius)){const length=Math.hypot(point.x-from.x,point.y-from.y);return {x:(point.x-from.x)/length,y:(point.y-from.y)/length};}
  }
  plans.delete(from);const result=avoidTransport(sight,from,target,radius,base,body);
  if(result.waypoints)plans.set(from,{points:result.waypoints,radius,revision:nav.revision,bodyX:body.x,bodyY:body.y,targetX:target.x,targetY:target.y});
  return {x:result.x,y:result.y};
 };
 nav.lineOfSight=(from,target,radius=18,options)=>{if(!sight(from,target,radius,options))return false;const body=bodyFor(game);return !body||!transportRayBlocked(from,target,body,radius);};
 return nav;
}
export function recoverTransportOverlap(game,bodyFor){
 const body=bodyFor(game);if(!body)return true;
 for(const actor of [game.player,...game.enemies]){
  if(!touchesTransport(actor.x,actor.y,actor.r,body))continue;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),gap=actor.r+1;
  const points=[{x:body.x-gap,y:clamp(actor.y,body.y,body.y+body.h)},{x:body.x+body.w+gap,y:clamp(actor.y,body.y,body.y+body.h)},
   {x:clamp(actor.x,body.x,body.x+body.w),y:body.y-gap},{x:clamp(actor.x,body.x,body.x+body.w),y:body.y+body.h+gap}];
  points.sort((a,b)=>Math.hypot(a.x-actor.x,a.y-actor.y)-Math.hypot(b.x-actor.x,b.y-actor.y));
  const safe=points.find(p=>!game.blocked(p.x,p.y,actor.r));if(!safe)return false;
  actor.x=safe.x;actor.y=safe.y;
 }return true;
}
