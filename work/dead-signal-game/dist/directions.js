import {getBoss} from './campaign.js?v=0.29.0';
const finitePoint=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
const alive=enemy=>enemy&&!enemy.dead&&Number.isFinite(enemy.hp)&&enemy.hp>0&&finitePoint(enemy)&&Number.isInteger(enemy.id)&&enemy.id>0;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;

/** Mandatory objectives lead the one optional alarm objective, without copies. */
export function objectiveTargets(game){
  if(game?.state!=='playing')return[];
  const enemies=Array.isArray(game.enemies)?game.enemies:[],targets=[];
  const campaignBoss=game.missionId?enemies.find(enemy=>alive(enemy)&&getBoss(enemy.bossKey)):null;
  const mandatory=campaignBoss||(game.stage===2
    ?enemies.find(enemy=>alive(enemy)&&enemy.type==='collector')
    :[0,1].includes(game.stage)?enemies.find(enemy=>alive(enemy)&&enemy.gatekeeper&&enemy.type==='elite'):null);
  if(mandatory){const boss=getBoss(mandatory.bossKey);targets.push({enemy:mandatory,kind:boss?(boss.role==='final'?'collector':'gatekeeper'):game.stage===2?'collector':'gatekeeper',label:boss?boss.name:game.stage===2?'수집가':'봉쇄 정예'});}
  if(game.alarm?.active===true){
    const alarm=enemies.find(enemy=>alive(enemy)&&enemy.type==='elite'&&enemy.id===game.alarm.eliteId);
    if(alarm&&alarm.id!==mandatory?.id)targets.push({enemy:alarm,kind:'alarm',label:'경보 정예'});
  }
  return targets;
}

function rayExit(origin,dx,dy,bounds){
  let near=0,far=Infinity;
  for(const [start,direction,min,max] of [[origin.x,dx,bounds.left,bounds.right],[origin.y,dy,bounds.top,bounds.bottom]]){
    if(direction===0){if(start<min||start>max)return null;}
    else{
      let first=(min-start)/direction,last=(max-start)/direction;
      if(first>last)[first,last]=[last,first];
      near=Math.max(near,first);far=Math.min(far,last);
      if(near>far)return null;
    }
  }
  return Number.isFinite(far)?far:null;
}

/** Keep an offscreen target's direction on a HUD-safe edge in screen pixels. */
export function edgePosition(playerScreen,targetScreen,viewportWidth,viewportHeight,safeRect){
  if(!finitePoint(playerScreen)||!finitePoint(targetScreen)||!Number.isFinite(viewportWidth)||!Number.isFinite(viewportHeight)||viewportWidth<=0||viewportHeight<=0)return null;
  if(targetScreen.x>=0&&targetScreen.x<=viewportWidth&&targetScreen.y>=0&&targetScreen.y<=viewportHeight)return null;
  const vx=targetScreen.x-playerScreen.x,vy=targetScreen.y-playerScreen.y,strength=Math.max(Math.abs(vx),Math.abs(vy));
  if(!Number.isFinite(strength)||strength===0)return null;
  const dx=vx/strength,dy=vy/strength;
  const x=finite(safeRect?.x,0),y=finite(safeRect?.y,0),w=finite(safeRect?.width,viewportWidth),h=finite(safeRect?.height,viewportHeight);
  const bounds={left:clamp(Math.min(x,x+w),0,viewportWidth),right:clamp(Math.max(x,x+w),0,viewportWidth),top:clamp(Math.min(y,y+h),0,viewportHeight),bottom:clamp(Math.max(y,y+h),0,viewportHeight)};
  let origin=playerScreen,distance=rayExit(origin,dx,dy,bounds);
  // When an external player ray misses the box, preserve its direction from
  // the nearest safe origin rather than producing an unbounded coordinate.
  if(distance===null){origin={x:clamp(playerScreen.x,bounds.left,bounds.right),y:clamp(playerScreen.y,bounds.top,bounds.bottom)};distance=rayExit(origin,dx,dy,bounds);}
  if(distance===null)return null;
  return{x:clamp(origin.x+dx*distance,bounds.left,bounds.right),y:clamp(origin.y+dy*distance,bounds.top,bounds.bottom),angle:Math.atan2(vy,vx)};
}
