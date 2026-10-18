import {Game} from '../dist/engine.js';
import {createHash} from 'node:crypto';
// Matches the existing twenty-minute fixture. Only this isolated QA game grants
// invulnerability and chooses upgrades; no browser storage or player run is used.
const game=new Game({seed:774,weapon:'nailgun',stageDuration:1e9});
const start=performance.now(),cpuStart=process.cpuUsage(),hash=createHash('sha256');
for(let tick=0;tick<24000;tick++){
  if(game.state==='upgrade')game.chooseUpgrade(game.choices[0].id);
  game.player.invul=1;
  const enemy=game.enemies.find(item=>!item.dead),direction=tick/300;
  game.tick(.05,{moveX:Math.cos(direction),moveY:Math.sin(direction),aimX:enemy?.x??1200,aimY:enemy?.y??930,shoot:true,dash:tick%80===0,lure:tick%250===0,molotov:tick%350===0});
  // Check both serialized gameplay state and cosmetic/event state every tick.
  hash.update(JSON.stringify([game.player,game.enemies.map(e=>({...e,navTarget:undefined})),game.bullets.map(b=>({...b,hits:[...b.hits]})),game.particles,game.drainEvents(),game.random.getState()]));
  if(tick%1000===0)hash.update(JSON.stringify(game.snapshot()));
}
const cpu=process.cpuUsage(cpuStart);
console.log(JSON.stringify({digest:hash.digest('hex'),wallMs:performance.now()-start,cpuMs:(cpu.user+cpu.system)/1000,kills:game.kills,time:game.time}));
