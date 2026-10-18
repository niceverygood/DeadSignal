// Untimed actual Game proof, separate from the original 24000-tick CPU arm.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadModules,PINNED_SOURCES,captureGame,validateOutputPath,qualify} from './blocked-obstacle-oracle.mjs';
import {Navigation} from '../../work/dead-signal-game/dist/navigation.js';

function populate(Game,count,seed){
 const game=new Game({seed,weapon:seed===774?'nailgun':'shotgun',stageDuration:1e9});assert.ok(game.navigation instanceof Navigation);const initialEnemies=game.enemies.length,spawnClock=game.spawnClock,world=game.world;assert.ok(initialEnemies>0);assert.ok(game.spawnEnemy('collector',500));const types=['walker','runner','shield','screamer','gas','elite'];for(let index=0;game.enemies.length<count;index++)assert.ok(game.spawnEnemy(types[index%types.length],500));assert.equal(game.enemies.length,count);assert.equal(game.spawnClock,spawnClock);assert.equal(game.world,world);assert.ok(game.snapshot());return{game,initialEnemies,spawnClock};
}
function navigationState(nav){return{revision:nav.revision,active:nav.active,grids:[...nav.grids].map(([radius,grid])=>[radius,{radius:grid.radius,cell:grid.cell,cols:grid.cols,rows:grid.rows,size:grid.size,clear:[...grid.clear],edges:[...grid.edges],components:[...grid.components],fields:[...grid.fields].map(([key,field])=>[key,{goal:field.goal,...(field.distances?{distances:[...field.distances],next:[...field.next]}:{})}])}])};}
function observeIdentity(game,identities){for(const actor of game.enemies){if(identities.has(actor.id))assert.equal(actor,identities.get(actor.id),'live original actor identity remains stable');else identities.set(actor.id,actor);}}
export async function verifyGames(out){
 out=validateOutputPath(out);const report={tool:'qa-blocked-obstacle-untimed-full-game',passed:false,status:'preflight',sourceSHA:null,expectedSHA:PINNED_SOURCES,comparisons:0,cases:[],errors:[],note:'Two independent full original/candidate engine modules; only the SHA-certified blocked final obstacle some implementation differs. All dependencies and the original production grid helper are shared and unchanged. The complete candidate must invert byte-exactly to the frozen original with only its private intrinsic declarations and final blocked obstacle loop changed. Normal Array/Math/Reflect intrinsics are required; built-in TypeError text/stack is outside the protocol claim. Six real city-world cases retain normal constructor roster, obstacles, collision, HP/AI, spawn clock and valid checkpoints; normal spawnEnemy fills60/180/210 including all seven types. No teleport, fake arena, damage/invulnerability boost, observer or storage call is used.360 actual fixed ticks compare complete checkpoint/runtime/physical positions/effects, events and both RNG streams, with original first-offered upgrades. Actor identity and final Navigation fields are also checked. All inspection is outside the independent stress timing. This is neither a full-suite pass nor CPU/FPS/memory/visual-quality evidence.'};
 try{
  const modules=await loadModules(),O=modules.original.Game,C=modules.candidate.Game;report.sourceSHA=modules.sources.hashes;
  for(const seed of [774,19253])for(const count of [60,180,210]){
   const a=populate(O,count,seed),b=populate(C,count,seed),oldIdentities=new Map(),newIdentities=new Map();assert.deepEqual(captureGame(b.game),captureGame(a.game),`initial seed${seed}/count${count}`);report.comparisons++;let selected=0,playedTicks=0;
   for(let frame=0;frame<360;frame++){
    if(a.game.state==='upgrade'){assert.deepEqual(b.game.choices.map(choice=>choice.id),a.game.choices.map(choice=>choice.id));const id=a.game.choices[0].id;assert.equal(a.game.chooseUpgrade(id),true);assert.equal(b.game.chooseUpgrade(id),true);selected++;}
    const enemy=a.game.enemies.find(item=>!item.dead),direction=frame/110,input={moveX:Math.cos(direction),moveY:Math.sin(direction),aimX:enemy?.x??1200,aimY:enemy?.y??930,shoot:true,dash:frame%80===0,lure:frame===12,molotov:frame===45,targetX:enemy?.x??1350,targetY:enemy?.y??930};if(a.game.state==='playing')playedTicks++;
    a.game.tick(1/60,input);b.game.tick(1/60,input);assert.deepEqual(captureGame(b.game),captureGame(a.game),`seed${seed}/count${count}/frame${frame}`);report.comparisons++;assert.deepEqual(b.game.drainEvents(),a.game.drainEvents());observeIdentity(a.game,oldIdentities);observeIdentity(b.game,newIdentities);
    for(const game of [a.game,b.game]){const stats=modules.stats(game);assert.equal(stats.retainedActors,0);assert.ok(stats.retainedBuckets<=256);}
   }
   assert.deepEqual(navigationState(b.game.navigation),navigationState(a.game.navigation),'final collision-clearance, flow fields and LRU order');const aStats=modules.stats(a.game),bStats=modules.stats(b.game);assert.deepEqual(bStats,aStats,'unchanged helper allocation/lifetime protocol');assert.ok(aStats.acquisitions>0);
   report.cases.push({seed,count,initialEnemies:a.initialEnemies,originalSpawnClock:a.spawnClock,frames:360,playedTicks,selectedUpgrades:selected,final:{state:a.game.state,time:a.game.time,hp:a.game.player.hp,kills:a.game.kills,enemies:a.game.enemies.length,level:a.game.player.level,random:a.game.random.getState(),visualRandom:a.game.visualRandom.getState()},identicalSnapshots:true,identicalRuntime:true,identicalCollisionAndNavigation:true,identicalEvents:true,identicalRandom:true,identicalHelperProtocol:true,helper:{acquisitions:aStats.acquisitions,mapsCreated:aStats.mapsCreated,retainedActors:aStats.retainedActors,retainedBuckets:aStats.retainedBuckets}});
  }
  assert.equal(report.comparisons,2166);assert.equal(report.cases.length,6);report.passed=true;report.status='passed-full-game-equivalence';
 }catch(error){report.status='failed-full-game-equivalence';report.errors.push(qualify(error));}
 await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const args=process.argv.slice(2);assert.equal(args.length,2);assert.equal(args[0],'--out');const report=await verifyGames(args[1]);process.stdout.write(JSON.stringify({passed:report.passed,comparisons:report.comparisons,cases:report.cases.length,out:path.resolve(args[1])})+'\n');if(!report.passed)process.exitCode=1;}catch(error){process.stderr.write(JSON.stringify({status:'report-not-written',error:qualify(error)})+'\n');process.exitCode=1;}}
