// Headless QA only: actual Game ticks/skills/upgrades; no user storage or cheats.
import {Game} from '../work/dead-signal-game/dist/engine.js';
import {SEA_EXPEDITION,expeditionTarget} from '../work/dead-signal-game/dist/expedition.js';
import {firingIntent} from '../work/dead-signal-game/dist/firing.js';
const results=[];
for(const seed of [774,775,776]){
 const g=new Game({seed,expeditionId:SEA_EXPEDITION.id,weapon:'shotgun'});let ticks=0,restorable=true;
 while(!g.result&&ticks++<180*60){
  if(g.state==='upgrade'){const order=g.player.hp<70?['health','damage','pellets','haste','knockback','fire','shock','reload']:['damage','pellets','haste','knockback','fire','health','shock','reload'];g.chooseUpgrade([...g.choices].sort((a,b)=>(order.indexOf(a.id)<0?99:order.indexOf(a.id))-(order.indexOf(b.id)<0?99:order.indexOf(b.id)))[0].id);continue;}
  if(g.state!=='playing')break;
  const target=expeditionTarget(g);if(!target)break;
  const p=g.player,near=Math.hypot(p.x-target.x,p.y-target.y)<target.radius-1;
  const orbit={x:target.x+Math.cos(g.time*.6)*85,y:target.y+Math.sin(g.time*.6)*65};
  const goal=target.kind==='escort'?{x:target.x+105,y:target.y+90}:['defend','relay'].includes(target.kind)&&Math.hypot(p.x-target.x,p.y-target.y)<160?orbit:target;
  let d=!['defend','escort','relay'].includes(target.kind)&&near?{x:0,y:0}:g.navigation.direction(p,goal,p.r);
  let enemy=null,distance=Infinity;for(const e of g.enemies){const n=Math.hypot(e.x-p.x,e.y-p.y);if(!e.dead&&n<distance){distance=n;enemy=e;}}
  if(target.kind==='escort'&&distance<60&&enemy){d={x:(p.x-enemy.x)/Math.max(1,distance),y:(p.y-enemy.y)/Math.max(1,distance)};}
  const aim=firingIntent(g,{mode:'auto',aimX:p.x+200,aimY:p.y});
  g.tick(1/60,{moveX:d.x,moveY:d.y,...aim,fireMode:'auto',interact:near,lure:!!enemy&&distance<100&&p.lureCd<=0,molotov:!!enemy&&distance<220&&p.molotovCd<=0,targetX:enemy?.x??p.x,targetY:enemy?.y??p.y,dash:distance<45&&p.dashCd<=0});
  g.drainEvents();if(!g.result&&ticks%180===0)restorable&&=!!g.snapshot();
 }
 results.push({seed,state:g.state,time:g.time,hp:g.player.hp,kills:g.kills,step:g.expedition.step,hold:g.expedition.hold,upgrades:g.upgrades,restorable,player:{x:g.player.x,y:g.player.y}});
}
process.stdout.write(JSON.stringify(results,null,2)+'\n');
