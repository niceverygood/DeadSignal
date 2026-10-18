import {Game} from '../work/dead-signal-game/dist/engine.js';
import {newBulletStats} from '../work/dead-signal-game/dist/qa-bullet-broadphase.js';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';

const play=(game,tick)=>{
 if(game.state==='upgrade')game.chooseUpgrade(game.choices[0].id);
 game.player.invul=1; // Same explicit20-minute CPU stress fixture as engine.test.
 const enemy=game.enemies.find(item=>!item.dead),direction=tick/300;
 game.tick(.05,{moveX:Math.cos(direction),moveY:Math.sin(direction),aimX:enemy?.x??1200,aimY:enemy?.y??930,shoot:true,dash:tick%80===0,lure:tick%250===0,molotov:tick%350===0});game.drainEvents();
};
const mode=process.argv.includes('--circles')?'all':'rect';
const create=force=>{const game=new Game({seed:774,weapon:'nailgun',stageDuration:1e9});game.forceBulletNarrowPhase=force;game.bulletBoundsMode=mode;return game;};
const warm=create(false);for(let tick=0;tick<1000;tick++)play(warm,tick);
const passes=[],states=[];
for(const force of [true,false,true]){
 const game=create(force);game.bulletCollisionStats=newBulletStats();const update=game.updateBullets;let bulletMs=0;
 game.updateBullets=function(...args){const start=performance.now();try{return update.apply(this,args);}finally{bulletMs+=performance.now()-start;}};
 const start=performance.now(),cpuStart=process.cpuUsage();
 for(let tick=0;tick<24000;tick++)play(game,tick);
 const wallMs=performance.now()-start,cpu=process.cpuUsage(cpuStart),cpuMs=(cpu.user+cpu.system)/1000;
 delete game.updateBullets;const snapshot=game.snapshot();if(!snapshot)throw Error('invalid-final-stress-snapshot');
 passes.push({force,ticks:24000,seconds:game.time,wallMs,cpuMs,bulletMs,stats:game.bulletCollisionStats,enemies:game.enemies.length,kills:game.kills});
 states.push(JSON.stringify({snapshot,particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash,random:game.random.getState(),visualRandom:game.visualRandom.getState()}));
 console.log(JSON.stringify(passes.at(-1)));
}
const result={node:process.version,mode,passes,identicalCombatState:states.every(s=>s===states[0]),note:'Headless full20-minute real spawning/AI/bullets/upgrade/RNG workload with explicit invulnerability stress fixture. Legacy baseline includes original rectangle arrays; rect mode filters only obstacles. Original CPU test threshold is not altered. Process CPU and call wall time are not browser FPS/GPU time or measured memory.'};
const file=new URL('../qa/dense-combat-20261018/bullet-'+mode+'-headless.json',import.meta.url);await writeFile(file,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({identicalCombatState:result.identicalCombatState}));
