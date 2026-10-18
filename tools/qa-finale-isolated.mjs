import {Game} from '../work/dead-signal-game/dist/engine.js';import {FINALE_EXPEDITION,expeditionTarget} from '../work/dead-signal-game/dist/expedition.js';let game;const load=async()=>{};const renderer={liveEnemiesPromise:Promise.resolve(),liveEnemies:{load:async()=>{}}};const events=()=>game.drainEvents();
async function run(){
 game=new Game({seed:775,expeditionId:FINALE_EXPEDITION.id});game.enemies=[];game.spawnClock=1e9;await load();await renderer.liveEnemiesPromise;await renderer.liveEnemies.load('enemy-collector');let ticks=0,resumed=false,prepResumed=false;
 while(!game.result&&ticks++<12000){
  if(game.state==='upgrade'){const choice=game.choices.find(c=>c.id==='health')||game.choices[0];game.chooseUpgrade(choice.id);continue;}if(game.state!=='playing')break;
  game.enemies=game.enemies.filter(e=>e.type==='collector'||e.id===game.alarm.eliteId);game.spawnClock=1e9;const t=expeditionTarget(game);if(!t)break;const p=game.player,boss=game.enemies.find(e=>!e.dead&&e.type==='collector'),near=Math.hypot(p.x-t.x,p.y-t.y)<30;
  const goal=boss?{x:1770+Math.cos(game.time*.9)*190,y:860+Math.sin(game.time*.9)*130}:t;let d=!boss&&near?{x:0,y:0}:game.navigation.direction(p,goal,p.r);const distance=boss?Math.hypot(boss.x-p.x,boss.y-p.y):Infinity;
  if(boss&&distance<100)d={x:(p.x-boss.x)/Math.max(1,distance),y:(p.y-boss.y)/Math.max(1,distance)};
  if(boss&&['windup','charge'].includes(boss.attackState))d={x:-Math.sin(boss.angle),y:Math.cos(boss.angle)};
  const old=game.expedition.step;game.tick(1/60,{moveX:d.x,moveY:d.y,interact:near,fireMode:'manual',shoot:!!boss,aimX:boss?.x??p.x+200,aimY:boss?.y??p.y,lure:distance<140&&p.lureCd<=0,molotov:distance<220&&p.molotovCd<=0,targetX:boss?.x??p.x,targetY:boss?.y??p.y,dash:distance<110&&p.dashCd<=0});events();
  if(!prepResumed&&game.expedition.prepHold>=12&&game.expedition.prepHold<30){const restored=Game.restore(game.snapshot(),{resumePlaying:true});if(!restored)throw Error('preparation-restore');game=restored;prepResumed=true;}
  if(!resumed&&game.boss&&game.boss.hp<game.boss.maxHp*.8){const restored=Game.restore(game.snapshot(),{resumePlaying:true});if(!restored)throw Error('final-boss-restore');game=restored;resumed=true;}
  
 }
return {time:game.time,hp:game.player.hp,result:game.result,expedition:game.expedition,resumed,prepResumed};}
try{console.log(JSON.stringify(await run(),null,2));}catch(error){console.error(error,JSON.stringify({time:game.time,expedition:game.expedition,alarm:game.alarm,boss:game.boss?.hp,snapshot:!!game.snapshot()}));process.exitCode=1;}
