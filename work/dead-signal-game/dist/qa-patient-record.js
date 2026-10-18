import {Game} from './engine.js';
import {PATIENT_RECORD_EXPEDITION,expeditionTarget} from './expedition.js';
// Uses normal input, navigation, combat and offered upgrades; no storage.
export async function runPatientRecordQA({seed=774,isolated=true,onBoundary=()=>{}}={}){
 let game=new Game({seed,expeditionId:PATIENT_RECORD_EXPEDITION.id}),ticks=0,defenseRestored=false,relayRestored=false;
 const milestones=[];
 while(!game.result&&ticks++<24000){
  if(game.state==='upgrade'){game.chooseUpgrade((game.choices.find(c=>c.id==='health')||game.choices[0]).id);continue;}if(game.state!=='playing')break;
  if(isolated){game.enemies=game.enemies.filter(e=>e.gatekeeper||e.id===game.alarm.eliteId);game.spawnClock=1e9;}
  const t=expeditionTarget(game),p=game.player;if(!t)break;
  const goal=t.kind==='escort'?{x:t.x-85,y:t.y}:t,near=Math.hypot(p.x-goal.x,p.y-goal.y)<25;
  const enemy=game.enemies.filter(e=>!e.dead).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0],distance=enemy?Math.hypot(enemy.x-p.x,enemy.y-p.y):Infinity;
  let d=near?{x:0,y:0}:game.navigation.direction(p,goal,p.r);
  if(distance<65)d={x:(p.x-enemy.x)/Math.max(1,distance),y:(p.y-enemy.y)/Math.max(1,distance)};
  const step=game.expedition.step;game.tick(1/60,{moveX:d.x,moveY:d.y,interact:near,fireMode:'manual',shoot:!!enemy,aimX:enemy?.x??p.x+200,aimY:enemy?.y??p.y,molotov:distance<220&&p.molotovCd<=0,lure:distance<130&&p.lureCd<=0,targetX:enemy?.x??p.x,targetY:enemy?.y??p.y,dash:distance<55&&p.dashCd<=0});game.drainEvents();
  if((!defenseRestored&&game.expedition.step===2||!relayRestored&&game.expedition.step===5)&&game.expedition.hold>=(game.expedition.step===2?12:9)){const r=Game.restore(game.snapshot(),{resumePlaying:true});if(!r)throw Error('patient-record-progress-restore');if(game.expedition.step===2)defenseRestored=true;else relayRestored=true;game=r;}
  if(game.expedition.step!==step){milestones.push({step:game.expedition.step,time:game.time,hp:game.player.hp});await onBoundary(game);}
 }
 return {game,report:{seed,isolated,time:game.time,hp:game.player.hp,result:game.result,defenseRestored,relayRestored,milestones}};
}
