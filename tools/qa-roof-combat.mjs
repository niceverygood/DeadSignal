// Headless QA only: actual Game ticks/skills/upgrades; no user storage or cheats.
import {Game} from '../work/dead-signal-game/dist/engine.js';
import {ROOF_EXPEDITION,expeditionTarget} from '../work/dead-signal-game/dist/expedition.js';
import {firingIntent} from '../work/dead-signal-game/dist/firing.js';
const results=[];
for(const seed of [774,775,776]){
 const g=new Game({seed,expeditionId:ROOF_EXPEDITION.id,weapon:'shotgun'});let ticks=0,restorable=true;
 while(!g.result&&ticks++<120*60){
  if(g.state==='upgrade'){const order=['damage','pellets','haste','knockback','fire','health','shock','reload'];g.chooseUpgrade([...g.choices].sort((a,b)=>(order.indexOf(a.id)<0?99:order.indexOf(a.id))-(order.indexOf(b.id)<0?99:order.indexOf(b.id)))[0].id);continue;}
  if(g.state!=='playing')break;
  const target=expeditionTarget(g);if(!target)break;
  const p=g.player,near=Math.hypot(p.x-target.x,p.y-target.y)<35;
  const orbit={x:target.x+Math.cos(g.time*.6)*85,y:target.y+Math.sin(g.time*.6)*65};
  const goal=target.kind==='defend'&&Math.hypot(p.x-target.x,p.y-target.y)<160?orbit:target;
  let d=target.kind!=='defend'&&near?{x:0,y:0}:g.navigation.direction(p,goal,p.r);
  let enemy=null,distance=Infinity;for(const e of g.enemies){const n=Math.hypot(e.x-p.x,e.y-p.y);if(!e.dead&&n<distance){distance=n;enemy=e;}}
  const aim=firingIntent(g,{mode:'auto',aimX:p.x+200,aimY:p.y});
  g.tick(1/60,{moveX:d.x,moveY:d.y,...aim,fireMode:'auto',interact:near,molotov:!!enemy&&distance<220&&p.molotovCd<=0,targetX:enemy?.x??p.x,targetY:enemy?.y??p.y,dash:distance<45&&p.dashCd<=0});
  g.drainEvents();if(!g.result&&ticks%180===0)restorable&&=!!g.snapshot();
 }
 results.push({seed,state:g.state,time:g.time,hp:g.player.hp,kills:g.kills,step:g.expedition.step,hold:g.expedition.hold,upgrades:g.upgrades,restorable,player:{x:g.player.x,y:g.player.y}});
}
process.stdout.write(JSON.stringify(results,null,2)+'\n');
