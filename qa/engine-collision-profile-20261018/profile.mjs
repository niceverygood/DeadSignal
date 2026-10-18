import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game} from '../../work/dead-signal-game/dist/engine.js';
const game=new Game({seed:774,weapon:'nailgun',stageDuration:1e9});
const maxima={enemies:0,particles:0,pickups:0,corpses:0};
const cpuStart=process.cpuUsage(),started=performance.now();
for(let tick=0;tick<24000;tick++){
 if(game.state==='upgrade')game.chooseUpgrade(game.choices[0].id);
 game.player.invul=1;const enemy=game.enemies.find(item=>!item.dead),direction=tick/300;
 game.tick(.05,{moveX:Math.cos(direction),moveY:Math.sin(direction),aimX:enemy?.x??1200,aimY:enemy?.y??930,shoot:true,dash:tick%80===0,lure:tick%250===0,molotov:tick%350===0});
 game.drainEvents();for(const key of Object.keys(maxima))maxima[key]=Math.max(maxima[key],game[key].length);
}
const wallMs=performance.now()-started,cpu=process.cpuUsage(cpuStart),state=JSON.stringify({snapshot:game.snapshot(),particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash,random:game.random.getState(),visualRandom:game.visualRandom.getState()});
const report={seed:774,ticks:24000,dt:.05,simulatedSeconds:1200,fixture:'Existing20minute headless stress invulnerability/autopilot; diagnostic CPUprofile adds overhead, not normal180 browser or adoption cost evidence.',wallMs,cpuMs:(cpu.user+cpu.system)/1000,maxima,final:{time:game.time,kills:game.kills,state:game.state,random:game.random.getState(),visualRandom:game.visualRandom.getState()},stateSha256:createHash('sha256').update(state).digest('hex')};
await writeFile(new URL('./profile-run.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
