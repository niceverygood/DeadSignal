import {Game} from './engine.js?v=0.29.0';
import {COLD_CHAIN_EXPEDITION,expeditionTarget} from './expedition.js';
// Storage-free QA controller. Isolation preserves real quest/alarm elites.
export async function runColdChainQA({seed=774,isolated=true,onBoundary=()=>{}}={}){
 let game=new Game({seed,expeditionId:COLD_CHAIN_EXPEDITION.id}),ticks=0,restored=false,guardKilled=false;
 const milestones=[];
 while(!game.result&&ticks++<18000){
  if(game.state==='upgrade'){game.chooseUpgrade((game.choices.find(c=>c.id==='health')||game.choices[0]).id);continue;}if(game.state!=='playing')break;
  if(isolated){game.enemies=game.enemies.filter(e=>e.gatekeeper||e.id===game.alarm.eliteId);game.spawnClock=1e9;}
  const t=expeditionTarget(game),p=game.player;if(!t)break;
  const enemy=game.enemies.filter(e=>!e.dead).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0],distance=enemy?Math.hypot(enemy.x-p.x,enemy.y-p.y):Infinity,near=Math.hypot(p.x-t.x,p.y-t.y)<28;
  let d=near?{x:0,y:0}:game.navigation.direction(p,t,p.r);
  if(distance<65)d={x:(p.x-enemy.x)/Math.max(1,distance),y:(p.y-enemy.y)/Math.max(1,distance)};
  const step=game.expedition.step;game.tick(1/60,{moveX:d.x,moveY:d.y,interact:near,fireMode:'manual',shoot:!!enemy,aimX:enemy?.x??p.x+200,aimY:enemy?.y??p.y,molotov:distance<220&&p.molotovCd<=0,lure:distance<130&&p.lureCd<=0,targetX:enemy?.x??p.x,targetY:enemy?.y??p.y,dash:distance<55&&p.dashCd<=0});game.drainEvents();
  if(!restored&&game.expedition.step===1&&game.expedition.hold>=10){const raw=game.snapshot(),r=raw&&Game.restore(raw,{resumePlaying:true});if(!r)throw Error('cold-chain-defense-restore');game=r;restored=true;}
  if(game.expedition.step!==step){if(step===2)guardKilled=true;milestones.push({step:game.expedition.step,time:game.time,hp:game.player.hp});await onBoundary(game);}
 }
 return {game,report:{isolated,seed,time:game.time,hp:game.player.hp,result:game.result,restored,guardKilled,milestones}};
}
