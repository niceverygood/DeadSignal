import {Game} from './engine.js';
import {HAIFA_TRANSFER_EXPEDITION,expeditionTarget} from './expedition.js';
// Uses normal input, navigation, combat and offered upgrades; no storage.
export async function runHaifaTransferQA({seed=774,isolated=true,onBoundary=()=>{}}={}){
 let game=new Game({seed,expeditionId:HAIFA_TRANSFER_EXPEDITION.id}),ticks=0,firstRestored=false,secondRestored=false;
 const milestones=[];
 while(!game.result&&ticks++<24000){
  if(game.state==='upgrade'){game.chooseUpgrade((game.choices.find(c=>c.id==='health')||game.choices[0]).id);continue;}if(game.state!=='playing')break;
  if(isolated){game.enemies=game.enemies.filter(e=>e.gatekeeper||e.id===game.alarm.eliteId);game.spawnClock=1e9;}
  const t=expeditionTarget(game),p=game.player;if(!t)break;
  const blocker=t.kind==='breach'?game.world.obstacles.find(o=>o.x===1610&&o.y===1010&&!o.destroyed):null;
  const goal=blocker?{x:1530,y:900}:t.kind==='escort'?{x:t.x-85,y:t.y}:t,near=Math.hypot(p.x-goal.x,p.y-goal.y)<25;
  const enemy=game.enemies.filter(e=>!e.dead).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0],distance=enemy?Math.hypot(enemy.x-p.x,enemy.y-p.y):Infinity;
  let d=near?{x:0,y:0}:game.navigation.direction(p,goal,p.r);
  if(distance<65)d={x:(p.x-enemy.x)/Math.max(1,distance),y:(p.y-enemy.y)/Math.max(1,distance)};
  const step=game.expedition.step;game.tick(1/60,{moveX:d.x,moveY:d.y,interact:near,fireMode:'manual',shoot:!!enemy||!!blocker,aimX:enemy?.x??(blocker?blocker.x+blocker.w/2:p.x+200),aimY:enemy?.y??(blocker?blocker.y+blocker.h/2:p.y),molotov:distance<220&&p.molotovCd<=0,lure:distance<130&&p.lureCd<=0,targetX:enemy?.x??p.x,targetY:enemy?.y??p.y,dash:distance<55&&p.dashCd<=0});game.drainEvents();
  if((!firstRestored&&game.expedition.step===1||!secondRestored&&game.expedition.step===7)&&game.expedition.hold>=(game.expedition.step===1?12:9)){const r=Game.restore(game.snapshot(),{resumePlaying:true});if(!r)throw Error('haifa-transfer-progress-restore');if(game.expedition.step===1)firstRestored=true;else secondRestored=true;game=r;}
  if(game.expedition.step!==step){milestones.push({step:game.expedition.step,time:game.time,hp:game.player.hp});await onBoundary(game);}
 }
 return {game,report:{seed,isolated,time:game.time,hp:game.player.hp,result:game.result,firstRestored,secondRestored,carDestroyed:game.world.obstacles.find(o=>o.x===1610&&o.y===1010)?.destroyed,milestones}};
}
