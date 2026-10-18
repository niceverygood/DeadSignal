import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game,distance,circleRect} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {updateCampaignBoss} from '../dist/boss-combat.js?v=0.29.0';
import {enemyGridAllocationStats} from '../dist/enemy-separation-grid.js';
import {ROOF_EXPEDITION,SEA_EXPEDITION,NORTH_EXPEDITION} from '../dist/expedition.js';
import {damageContact} from '../dist/damage-feedback.js';
import {FIXED_STEP,advanceSimulation} from '../dist/simulation.js';

// Exact original method captured before the engine edit. Portable evidence is
// inside this repository; never read another machine or substitute new source.
const oldSource=readFileSync(new URL('../../../qa/dense-combat-20261018/enemy-grid-before-updateEnemies.txt',import.meta.url),'utf8');
assert.match(oldSource,/^\s*updateEnemies\(dt\)\{/);assert.match(oldSource,/grid=new Map\(\)/);
const originalUpdateEnemies=new Function('distance','circleRect','updateCampaignBoss','"use strict";return ('+oldSource.replace(/^\s*updateEnemies/,'function updateEnemies')+');')(distance,circleRect,updateCampaignBoss);
const types=['walker','runner','shield','screamer','gas','elite'];
const targetRole=(target,g)=>target===g.player?'player':target===g.lure?'lure':target==null?target:{id:target.id,x:target.x,y:target.y};
const actorState=(actor,g)=>Object.fromEntries(Object.entries(actor).map(([key,value])=>[key,key==='navTarget'?targetRole(value,g):value]));
function state(g){
  return structuredClone({checkpoint:g.snapshot(),player:g.player,enemies:g.enemies.map(e=>actorState(e,g)),boss:g.boss?.id??null,world:g.world,time:g.time,stageTime:g.stageTime,state:g.state,random:g.random.getState(),visualRandom:g.visualRandom.getState(),id:g.id,kills:g.kills,noise:g.noise,parts:g.parts,combo:g.combo,spawnClock:g.spawnClock,events:g.events,particles:g.particles,texts:g.texts,links:g.links,corpses:g.corpses,pickups:g.pickups,fires:g.fires,throwables:g.throwables,hostileProjectiles:g.hostileProjectiles,bossHazards:g.bossHazards,lure:g.lure,shake:g.shake,flash:g.flash,expedition:g.expedition,damageContact:damageContact(g.player,g.time)});
}
function paired(make){const a=make(),b=make();a.updateEnemies=originalUpdateEnemies;return {a,b};}
function check(pair){assert.deepEqual(state(pair.b),state(pair.a));assert.equal(enemyGridAllocationStats(pair.b).retainedActors,0);assert.ok(enemyGridAllocationStats(pair.b).retainedBuckets<=256);}
function empty(options={}){const g=new Game({seed:774,weapon:'nailgun',...options});g.enemies=[];g.world.obstacles=[];g.navigation=new Navigation(g.world);g.spawnClock=1e9;return g;}
function add(g,type,x,y){const e=g.spawnEnemy(type,450);assert.ok(e);Object.assign(e,{x,y});return e;}

test('real 60/180 enemy fixed-step catch-up preserves original physical values, nav caches, damage/effects, checkpoints and both RNG streams',()=>{
  for(const [count,weapon]of [[60,'shotgun'],[180,'nailgun']]){
    const pair=paired(()=>{const g=new Game({seed:774,missionId:'mission-01',weapon});for(let n=g.enemies.length;n<count;n++)assert.ok(g.spawnEnemy(types[n%types.length],310));return g;});
    const identities=new Map(pair.b.enemies.map(e=>[e.id,e]));
    for(let frame=0;frame<8;frame++){
      const command={moveX:frame<4?.3:-.2,moveY:.1,fireMode:'manual',shoot:frame%2===0,aimX:pair.a.player.x+270,aimY:pair.a.player.y-70,molotov:frame===1,targetX:pair.a.player.x+180,targetY:pair.a.player.y};
      const old=advanceSimulation(pair.a,command,FIXED_STEP*7.5),next=advanceSimulation(pair.b,command,FIXED_STEP*7.5);assert.deepEqual(next,old);check(pair);
      for(const e of pair.b.enemies){if(identities.has(e.id))assert.equal(e,identities.get(e.id));else identities.set(e.id,e);}
    }
    const stats=enemyGridAllocationStats(pair.b);assert.ok(stats.acquisitions>0);assert.equal(stats.mapsCreated,1);assert.equal(stats.trackingArraysCreated,1);assert.equal(stats.leasesCreated,stats.acquisitions);assert.ok(stats.bucketReuses>0);
  }
});

test('all seven radii and sequentially moved live neighbors preserve exact original separation in compact and string key worlds',()=>{
  for(const compact of [true,false])for(const freshGrid of [false,true]){
    const pair=paired(()=>{const g=empty();if(!compact)g.world.width=55*32768+1;for(let n=0;n<42;n++)add(g,[...types,'collector'][n===41?6:n%6],750+(n%7)*17,650+Math.floor(n/7)*16);g.forceFreshEnemyGrid=freshGrid;return g;});
    for(let tick=0;tick<12;tick++){pair.a.updateEnemies(FIXED_STEP);pair.b.updateEnemies(FIXED_STEP);check(pair);}
    const stats=enemyGridAllocationStats(pair.b);assert.equal(stats.acquisitions,12);assert.equal(stats.mapsCreated,freshGrid?12:1);assert.equal(stats.trackingArraysCreated,freshGrid?0:1);assert.equal(stats.bucketReuses>0,!freshGrid);assert.equal(stats.retainedBuckets>0,!freshGrid);
  }
});

test('screamer same-tick spawns and real 210-cap replacement retain the original array iterator and tick-start membership semantics',()=>{
  const spawnStarts=new WeakMap(),spawnPair=paired(()=>{const g=empty();const screamer=add(g,'screamer',900,700);screamer.skillCd=0;add(g,'walker',920,710);const initial=new Map(),spawn=g.spawnEnemy;spawnStarts.set(g,initial);g.spawnEnemy=function(...args){const e=spawn.apply(this,args);if(e)initial.set(e.id,e.skillCd);return e;};return g;});
  spawnPair.a.updateEnemies(FIXED_STEP);spawnPair.b.updateEnemies(FIXED_STEP);check(spawnPair);assert.equal(spawnPair.b.enemies.length,5);assert.equal(spawnStarts.get(spawnPair.b).size,3);for(const e of spawnPair.b.enemies.slice(2))assert.ok(Object.is(e.skillCd,spawnStarts.get(spawnPair.b).get(e.id)-FIXED_STEP),'newly appended actor is updated exactly once in the same original iterator');assert.ok(spawnPair.b.events.some(e=>e.type==='scream'));
  // A synchronous contact observer requests a normal elite spawn at the cap.
  // The real spawnEnemy API replaces the public array while the original loop
  // still iterates its old array. This is a lifecycle fixture, not a new AI rule.
  const replacePair=paired(()=>{const g=empty();for(let n=0;n<210;n++)add(g,'walker',n===0?g.player.x+20:650+(n%15)*22,n===0?g.player.y:500+Math.floor(n/15)*22);let replaced=false;const hurt=g.hurtPlayer;g.hurtPlayer=function(...args){const result=hurt.apply(this,args);if(!replaced){replaced=true;assert.ok(this.spawnEnemy('elite',450));}return result;};return g;});
  const first=replacePair.b.enemies[0];replacePair.a.updateEnemies(FIXED_STEP);replacePair.b.updateEnemies(FIXED_STEP);check(replacePair);assert.equal(replacePair.b.enemies.length,210);assert.equal(replacePair.b.enemies.includes(first),false);assert.equal(replacePair.b.enemies.at(-1).type,'elite');
});

test('burn death, gas chain explosions, obstacle destruction and lure targeting preserve original effects and order',()=>{
  const pair=paired(()=>{const g=empty();const gas=add(g,'gas',950,750);g.damageEnemy(gas,gas.hp-7);Object.assign(gas,{burn:1,burnTick:0});for(let n=0;n<8;n++)add(g,types[n%types.length],970+n*14,760+(n%3)*15);g.world.obstacles.push({id:++g.id,x:930,y:730,w:22,h:45,kind:'car',hp:1,maxHp:1,destroyed:false});g.placeLure(1000,780);return g;});
  for(let tick=0;tick<6;tick++){pair.a.updateEnemies(FIXED_STEP);pair.b.updateEnemies(FIXED_STEP);check(pair);}
  assert.ok(pair.b.events.some(e=>e.type==='kill'));assert.ok(pair.b.events.some(e=>e.type==='explosion'));assert.equal(pair.b.world.obstacles[0].destroyed,true);
});

test('rooftop, water, physical transport, restored games and new stage owners preserve original movement and cache lifetime',()=>{
  for(const expedition of [ROOF_EXPEDITION,SEA_EXPEDITION,NORTH_EXPEDITION]){
    const pair=paired(()=>new Game({seed:774,weapon:'nailgun',expeditionId:expedition.id}));
    for(let tick=0;tick<8;tick++){const command={moveX:.2,moveY:0,shoot:false,fireMode:'manual'};pair.a.tick(FIXED_STEP,command);pair.b.tick(FIXED_STEP,command);check(pair);}
    const savedA=pair.a.snapshot(),savedB=pair.b.snapshot();assert.ok(savedA);assert.deepEqual(savedB,savedA);
    const a=Game.restore(savedA,{resumePlaying:true}),b=Game.restore(savedB,{resumePlaying:true});assert.ok(a&&b);a.updateEnemies=originalUpdateEnemies;
    assert.equal(enemyGridAllocationStats(b).mapsCreated,0);for(let tick=0;tick<4;tick++){a.tick(FIXED_STEP,{shoot:false});b.tick(FIXED_STEP,{shoot:false});check({a,b});}assert.equal(enemyGridAllocationStats(b).mapsCreated,1);
  }
  const pair=paired(()=>new Game({seed:774}));pair.a.updateEnemies(FIXED_STEP);pair.b.updateEnemies(FIXED_STEP);check(pair);pair.a.advanceStage();pair.b.advanceStage();check(pair);pair.a.updateEnemies(FIXED_STEP);pair.b.updateEnemies(FIXED_STEP);check(pair);assert.equal(enemyGridAllocationStats(pair.b).mapsCreated,1);
});

test('a throwing real movement stage releases every actor reference without replacing its error',()=>{
  const g=empty(),marker=new Error('original movement stage failed');add(g,'walker',800,700);g.move=()=>{throw marker;};assert.throws(()=>g.updateEnemies(FIXED_STEP),error=>error===marker);assert.equal(enemyGridAllocationStats(g).retainedActors,0);assert.equal(enemyGridAllocationStats(g).acquisitions,1);
});

test('reentrant real enemy updates use separate scratch without overwriting the outer original neighbor grid',()=>{
  const pair=paired(()=>{const g=empty();for(let n=0;n<8;n++)add(g,types[n%types.length],800+(n%4)*16,700+Math.floor(n/4)*16);const move=g.move;let nested=false;g.move=function(...args){const result=move.apply(this,args);if(!nested){nested=true;this.updateEnemies(0);}return result;};return g;});
  pair.a.updateEnemies(FIXED_STEP);pair.b.updateEnemies(FIXED_STEP);check(pair);assert.equal(enemyGridAllocationStats(pair.b).acquisitions,2);assert.equal(enemyGridAllocationStats(pair.b).mapsCreated,2);assert.equal(enemyGridAllocationStats(pair.b).trackingArraysCreated,2);
});
