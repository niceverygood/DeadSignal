// Separate untimed full-Game equivalence proof. Never called by the CPU arm.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadGameArm,PINNED_SOURCES,validateOutputPath} from './bench-navigation-bfs.mjs';

function capture(game){
 return {snapshot:game.snapshot(),state:game.state,player:game.player,enemies:game.enemies,
  bullets:game.bullets.map(bullet=>({...bullet,hits:[...bullet.hits]})),world:game.world,
  particles:game.particles,corpses:game.corpses,texts:game.texts,links:game.links,
  pickups:game.pickups,fires:game.fires,throwables:game.throwables,lure:game.lure,alarm:game.alarm,
  hostileProjectiles:game.hostileProjectiles,bossHazards:game.bossHazards,
  events:game.events,random:game.random.getState(),visualRandom:game.visualRandom.getState(),
  result:game.result,time:game.time,stageTime:game.stageTime,id:game.id,kills:game.kills,parts:game.parts,
  pendingLevels:game.pendingLevels,choices:game.choices,combo:game.combo,comboTime:game.comboTime,
  noise:game.noise,shake:game.shake,flash:game.flash,spawnClock:game.spawnClock,bossId:game.boss?.id??null};
}
function populate(Game,Navigation,count,seed){
 const game=new Game({seed,weapon:seed===774?'nailgun':'shotgun',stageDuration:1e9});
 assert.ok(game.navigation instanceof Navigation,'the full engine must own the selected Navigation arm');
 const initialEnemies=game.enemies.length,spawnClock=game.spawnClock,world=game.world;
 assert.ok(initialEnemies>0);assert.ok(game.spawnEnemy('collector',500));
 const types=['walker','runner','shield','screamer','gas','elite'];
 for(let index=0;game.enemies.length<count;index++)assert.ok(game.spawnEnemy(types[index%types.length],500));
 assert.equal(game.enemies.length,count);assert.equal(game.spawnClock,spawnClock);
 assert.equal(game.world,world);assert.ok(game.snapshot());
 return {game,initialEnemies,spawnClock};
}
function coverageTracker(){return {grids:new WeakSet(),fields:new WeakSet(),counts:{distinctGrids:0,distinctBFSFields:0,maxResidentGrids:0,maxResidentFields:0}};}
function observeCoverage(navigation,tracker){
 let residentFields=0;tracker.counts.maxResidentGrids=Math.max(tracker.counts.maxResidentGrids,navigation.grids.size);
 for(const grid of navigation.grids.values()){
  if(!tracker.grids.has(grid)){tracker.grids.add(grid);tracker.counts.distinctGrids++;}
  for(const field of grid.fields.values())if(field.distances instanceof Uint16Array&&field.next instanceof Int32Array){
   residentFields++;if(!tracker.fields.has(field)){tracker.fields.add(field);tracker.counts.distinctBFSFields++;}
  }
 }
 tracker.counts.maxResidentFields=Math.max(tracker.counts.maxResidentFields,residentFields);
}
function qualify(error){return {name:typeof error?.name==='string'?error.name:typeof error,message:typeof error?.message==='string'?error.message:String(error),stack:typeof error?.stack==='string'?error.stack.slice(0,16000):null};}

export async function verifyGames(out){
 out=validateOutputPath(out);
 const report={tool:'qa-navigation-bfs-untimed-full-game',status:'preflight',passed:false,
  expectedSHA:PINNED_SOURCES,sourceSHA:null,modelSHA:null,fixtureSHA:null,navigationOriginalSHA:null,navigationCandidateSHA:null,
  comparisons:0,cases:[],errors:[],
  note:'Independent full original and candidate engine modules differ only in the Navigation import. Six normal seeded real-city cases retain original obstacles, collision, default constructor roster and automatic spawn clock, then fill to60/180/210 through normal validated spawnEnemy calls including one normal collector and six other original types. No actor teleport, HP/damage/invulnerability boosts, fake world, storage or method observers are used. Actual movement, aim, shots, dash, lure and Molotov inputs are identical. Each tick compares live checkpoint, complete actor/particle state, events and both RNG streams strictly, including terminal states if normal combat ends early. Read-only grid/field WeakSets additionally prove each case exercised real BFS construction and compare primitive coverage counts; these reads neither call Game/Navigation methods nor mutate cache order. All checkpoint/coverage verification deliberately lives outside the separate benchmark; this file makes no timing/FPS/memory claim.'};
 try{
  const original=await loadGameArm('original'),candidate=await loadGameArm('candidate');
  Object.assign(report,{sourceSHA:original.hashes.engine,modelSHA:original.hashes.model,fixtureSHA:original.hashes.fixture,navigationOriginalSHA:original.hashes.navigationOriginal,navigationCandidateSHA:original.hashes.navigationCandidate});
  for(const seed of [774,19253])for(const count of [60,180,210]){
   const a=populate(original.Game,original.Navigation,count,seed),b=populate(candidate.Game,candidate.Navigation,count,seed),aCoverage=coverageTracker(),bCoverage=coverageTracker();
   assert.deepEqual(capture(b.game),capture(a.game),`initial seed${seed}/count${count}`);report.comparisons++;
   let selected=0,playedTicks=0;
   for(let frame=0;frame<360;frame++){
    if(a.game.state==='upgrade'){
     assert.deepEqual(b.game.choices.map(choice=>choice.id),a.game.choices.map(choice=>choice.id));
     const id=a.game.choices[0].id;assert.equal(a.game.chooseUpgrade(id),true);assert.equal(b.game.chooseUpgrade(id),true);selected++;
    }
    const enemy=a.game.enemies.find(item=>!item.dead),direction=frame/110;
    const input={moveX:Math.cos(direction),moveY:Math.sin(direction),aimX:enemy?.x??1200,aimY:enemy?.y??930,shoot:true,
     dash:frame%80===0,lure:frame===12,molotov:frame===45,targetX:enemy?.x??1350,targetY:enemy?.y??930};
    if(a.game.state==='playing')playedTicks++;
    a.game.tick(1/60,input);b.game.tick(1/60,input);
    assert.deepEqual(capture(b.game),capture(a.game),`seed${seed}/count${count}/frame${frame}`);report.comparisons++;
    observeCoverage(a.game.navigation,aCoverage);observeCoverage(b.game.navigation,bCoverage);
    assert.deepEqual(bCoverage.counts,aCoverage.counts,`BFS coverage seed${seed}/count${count}/frame${frame}`);
    assert.deepEqual(b.game.drainEvents(),a.game.drainEvents());
   }
   assert.ok(aCoverage.counts.distinctGrids>0&&aCoverage.counts.distinctBFSFields>0,'the actual Game fixture must exercise grid and field BFS construction');
   report.cases.push({seed,count,initialEnemies:a.initialEnemies,originalSpawnClock:a.spawnClock,frames:360,playedTicks,selectedUpgrades:selected,
    final:{state:a.game.state,time:a.game.time,hp:a.game.player.hp,kills:a.game.kills,enemies:a.game.enemies.length,level:a.game.player.level,random:a.game.random.getState(),visualRandom:a.game.visualRandom.getState()},
    navigationCoverage:{original:aCoverage.counts,candidate:bCoverage.counts},
    identicalSnapshots:true,identicalRuntime:true,identicalEvents:true,identicalRandom:true});
  }
  report.status='passed-full-game-equivalence';report.passed=true;
 }catch(error){report.status='failed-full-game-equivalence';report.errors.push(qualify(error));}
 await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);assert.equal(args.length,2,'usage: verify-navigation-bfs-game.mjs --out <new QA report.json>');assert.equal(args[0],'--out');const report=await verifyGames(args[1]);process.stdout.write(JSON.stringify({status:report.status,comparisons:report.comparisons,cases:report.cases.length,out:path.resolve(args[1])})+'\n');if(!report.passed)process.exitCode=1;}
 catch(error){process.stderr.write(JSON.stringify({status:'report-not-written',error:qualify(error)})+'\n');process.exitCode=1;}
}
