import {WEAPONS} from './engine.js?v=0.29.0';

// The engine expands bullet obstacles by 3px, including square corners and
// tangencies. Navigation's rounded radius check alone does not include these.
const SHOT_CLEARANCE=3;
function touchesShotLine(from,to,rect){
  let low=0,high=1;
  for(const axis of ['x','y']){
    const start=from[axis],delta=to[axis]-start;
    const min=rect[axis]-SHOT_CLEARANCE,max=rect[axis]+rect[axis==='x'?'w':'h']+SHOT_CLEARANCE;
    if(Math.abs(delta)<1e-9){if(start<min||start>max)return false;}
    else{
      let first=(min-start)/delta,last=(max-start)/delta;
      if(first>last)[first,last]=[last,first];
      low=Math.max(low,first);high=Math.min(high,last);if(low>high)return false;
    }
  }
  return true;
}

/** Convert the selected control mode to an input without advancing combat. */
export function firingIntent(game,{mode='manual',aimX,aimY,shoot=false,aimAssist=false}={}){
  const player=game?.player;
  const x=Number.isFinite(player?.x)?player.x:0,y=Number.isFinite(player?.y)?player.y:0;
  const angle=Number.isFinite(player?.angle)?player.angle:0;
  const intent={
    aimX:Number.isFinite(aimX)?aimX:x+Math.cos(angle)*200,
    aimY:Number.isFinite(aimY)?aimY:y+Math.sin(angle)*200,
    shoot:false,targetId:null
  };
  if(game?.state!=='playing'||!player)return intent;
  const automatic=mode==='auto';
  if(!automatic)intent.shoot=shoot===true;
  if(!automatic&&aimAssist!==true)return intent;
  const weapon=Object.hasOwn(WEAPONS,player.weapon)?WEAPONS[player.weapon]:null;
  if(!weapon||typeof game.navigation?.lineOfSight!=='function')return intent;
  let target=null,nearest=Infinity;
  for(const enemy of game.enemies||[]){
    if(enemy.dead||!(enemy.hp>0)||!Number.isFinite(enemy.x)||!Number.isFinite(enemy.y)||!Number.isFinite(enemy.r)||enemy.r<0)continue;
    const dx=enemy.x-x,dy=enemy.y-y,distance=dx*dx+dy*dy;
    const reach=weapon.speed*weapon.life+24+enemy.r;
    if(distance>reach*reach||distance>=nearest)continue;
    if(!game.navigation.lineOfSight(player,enemy,SHOT_CLEARANCE))continue;
    if(game.world?.obstacles?.some(rect=>!rect.destroyed&&touchesShotLine(player,enemy,rect)))continue;
    target=enemy;nearest=distance;
  }
  if(target){intent.aimX=target.x;intent.aimY=target.y;intent.targetId=target.id;intent.shoot=automatic||intent.shoot;}
  return intent;
}
