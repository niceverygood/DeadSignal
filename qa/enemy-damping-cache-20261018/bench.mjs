// QA-only real Game episodes. The root runs this file; importing it runs no Game.
import assert from 'node:assert/strict';
import {readFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const directory=new URL('./',import.meta.url),folder=fileURLToPath(directory),gameRoot=new URL('../../work/dead-signal-game/',directory),engineURL=new URL('dist/engine.js',gameRoot);
const COUNTS=[60,180,210],TICKS=200,EPISODES=8,WARMUPS=2,DT=1/60;
export const PINNED_SOURCES=Object.freeze({
 engine:'72487b352161059b5745a3e5cfc149ff71ae3f7b98c7e310b5d8b3a5345260ce',
 model:'9e066a693078ae8fd7aa01d7bbd39829598e356f8191bf9b725e483d0b88a9ce',
 navigation:'549e01276b6b670234df5c80507ef30b8f1ec1513be8477281e59b38e21367d9',
 grid:'938bed7097a7cd0db0659744bb1a18747f1ddeb943ae810633abf2fce4b21da7',
 stressFixture:'6b92a458bcdcbde255eb413e5bf8bf9f313b951f32fd08129944897ccb922df8',
 generator:'3cc8e2c8d467d0ee58e5150baffa590a167a9db7a24b38f94869fe980b6cbb8b',
});
const sha=value=>createHash('sha256').update(value).digest('hex');
const rebase=source=>source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_all,quote,specifier)=>'from '+quote+new URL(specifier,engineURL).href+quote);
const moduleURL=(source,arm)=>'data:text/javascript;base64,'+Buffer.from(rebase(source)+'\n//# sourceURL='+engineURL.href+'?qa-enemy-damping='+arm+'\n').toString('base64');
const errorInfo=error=>({name:typeof error?.name==='string'?error.name:typeof error,message:typeof error?.message==='string'?error.message:String(error),stack:typeof error?.stack==='string'?error.stack.slice(0,10000):null});
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??0;};
const summary=values=>({sum:values.reduce((sum,value)=>sum+value,0),median:percentile(values,.5),p95:percentile(values,.95),max:Math.max(0,...values)});

export function parseArgs(args){
 assert.equal(args.length,3,'usage: bench.mjs --profile|--compare --out <new report.json>');
 assert.ok(args[0]==='--profile'||args[0]==='--compare','choose one fixed mode');assert.equal(args[1],'--out');
 const out=path.resolve(args[2]),relative=path.relative(folder,out);assert.ok(relative&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'output must stay in this QA folder');assert.equal(path.extname(out).toLowerCase(),'.json');
 return{mode:args[0]==='--profile'?'profile':'compare',out};
}

export async function loadGameArms(includeCandidate=false){
 const files={engine:engineURL,model:new URL('dist/upgrade-model.js',gameRoot),navigation:new URL('dist/navigation.js',gameRoot),grid:new URL('dist/enemy-separation-grid.js',gameRoot),stressFixture:new URL('tests/engine.test.mjs',gameRoot)};
 const bytes=Object.fromEntries(await Promise.all(Object.entries(files).map(async([key,url])=>[key,await readFile(url)]))),hashes=Object.fromEntries(Object.entries(bytes).map(([key,value])=>[key,sha(value)]));
 for(const[key,value]of Object.entries(hashes))assert.equal(value,PINNED_SOURCES[key],key+' source changed');
 const before=await readFile(new URL('engine-before.txt',directory));assert.equal(before.length,59149);assert.ok(before.equals(bytes.engine),'production engine must remain the exact frozen original');
 const source=before.toString('utf8'),original=await import(moduleURL(source,'original'));
 let candidate=null,candidateSHA=null;
 if(includeCandidate){const generator=await readFile(new URL('candidate-source.mjs',directory));assert.equal(sha(generator),PINNED_SOURCES.generator);const {buildDampingCandidate}=await import('./candidate-source.mjs');const candidateSource=buildDampingCandidate(source);candidateSHA=sha(candidateSource);candidate=await import(moduleURL(candidateSource,'candidate'));hashes.generator=sha(generator);}
 return{original:original.Game,candidate:candidate?.Game??null,hashes,candidateSHA};
}

// Same legal ring spawn recipe as the existing actual app/direction QA fixture.
// Constructor roster, normal HP/AI, world, spawnClock and subsequent spawns stay.
export function createEpisode(Game,count){
 const game=new Game({seed:774,missionId:'mission-01',weapon:'nailgun'}),baseEnemies=game.enemies.length,spawnClock=game.spawnClock;
 for(let index=baseEnemies;index<count;index++){
  let at=null;for(let attempt=0;attempt<32&&!at;attempt++){const angle=(index/count+attempt/32)*Math.PI*2,radius=210+(index%5)*32,x=game.player.x+Math.cos(angle)*radius,y=game.player.y+Math.sin(angle)*radius;if(!game.blocked(x,y,16))at={x,y};}
  assert.ok(at,'legal original ring point '+index);assert.ok(game.spawnEnemy('walker',210,at),'normal spawn '+index);
 }
 assert.equal(game.enemies.length,count);assert.equal(game.spawnClock,spawnClock);assert.ok(game.snapshot(),'initial valid checkpoint');
 return{game,baseEnemies,spawnClock};
}

function commandFor(game,tick){
 const target=game.enemies.find(enemy=>!enemy.dead),angle=tick/36;
 return{moveX:Math.cos(angle),moveY:Math.sin(angle),aimX:target?.x??1200,aimY:target?.y??930,shoot:true,dash:tick%80===0,lure:tick%250===0,molotov:tick%350===0};
}
function playEpisode(game,commands,events){
 let activeTicks=0,terminalTicks=0,upgrades=0;
 for(let tick=0;tick<TICKS;tick++){
  if(game.state==='upgrade'){assert.ok(game.chooseUpgrade(game.choices[0].id));upgrades++;}
  const command=commandFor(game,tick);if(game.state==='playing')activeTicks++;else terminalTicks++;
  game.tick(DT,command);const drained=game.drainEvents();if(commands)commands[tick]=command;if(events)events[tick]=drained;
 }
 return{scheduledTicks:TICKS,activeTicks,terminalTicks,upgrades};
}
function finiteState(game){
 for(const key of ['time','stageTime','id','kills','parts','spawnClock','noise','shake','flash'])assert.ok(Number.isFinite(game[key]),'finite game.'+key);
 for(const object of [game.player,...game.enemies,...game.bullets,...game.corpses,...game.particles,...game.pickups,...game.fires,...game.texts,...game.links])for(const[key,value]of Object.entries(object))if(typeof value==='number')assert.ok(Number.isFinite(value),'finite entity.'+key);
}
function navigationProof(nav){return{revision:nav.revision,active:nav.active,grids:[...nav.grids].map(([key,grid])=>[key,{radius:grid.radius,cell:grid.cell,cols:grid.cols,rows:grid.rows,size:grid.size,clear:[...grid.clear],edges:[...grid.edges],components:[...grid.components],fields:[...grid.fields].map(([id,field])=>[id,{goal:field.goal,...(field.distances?{distances:[...field.distances],next:[...field.next]}:{})}])}])};}
function proof(game,commands,events){
 finiteState(game);
 const snapshot=game.snapshot();
 return JSON.stringify({snapshot,state:game.state,time:game.time,stageTime:game.stageTime,id:game.id,kills:game.kills,parts:game.parts,combo:game.combo,comboTime:game.comboTime,pendingLevels:game.pendingLevels,spawnClock:game.spawnClock,result:game.result,player:{...game.player},enemies:game.enemies.map(enemy=>({...enemy,navTarget:enemy.navTarget===game.player?'player':game.lure&&enemy.navTarget===game.lure?'lure':enemy.navTarget==null?null:'other'})),bullets:game.bullets.map(bullet=>({...bullet,hits:[...bullet.hits]})),corpses:game.corpses,particles:game.particles,pickups:game.pickups,texts:game.texts,links:game.links,fires:game.fires,throwables:game.throwables,lure:game.lure,hostileProjectiles:game.hostileProjectiles,bossHazards:game.bossHazards,world:game.world,shake:game.shake,flash:game.flash,events,commands,random:game.random.getState(),visualRandom:game.visualRandom.getState(),navigation:navigationProof(game.navigation)});
}

function runCount(Game,count,arm,reference){
 const warmup=[];for(let index=0;index<WARMUPS;index++){const {game}=createEpisode(Game,count);const work=playEpisode(game);finiteState(game);warmup.push({...work,state:game.state,time:game.time,hp:game.player.hp});}
 const episodes=[],proofs=[];
 for(let index=0;index<EPISODES;index++){
  const {game,baseEnemies,spawnClock}=createEpisode(Game,count),commands=new Array(TICKS),events=new Array(TICKS),cpuStart=process.cpuUsage(),start=performance.now();
  const work=playEpisode(game,commands,events),wallMs=performance.now()-start,cpu=process.cpuUsage(cpuStart),cpuMs=(cpu.user+cpu.system)/1000;
  assert.ok(Number.isFinite(wallMs)&&wallMs>=0&&Number.isFinite(cpuMs)&&cpuMs>=0);
  // No snapshot, hash, literal comparison, JSON clone or method observer in time.
  const literal=proof(game,commands,events);if(reference)assert.equal(literal,reference[index],arm+'/count'+count+'/episode'+index+' full serialized state/RNG/events/commands/navigation mismatch');proofs.push(literal);
  episodes.push({index,cpuMs,wallMs,...work,baseEnemies,initialSpawnClock:spawnClock,final:{state:game.state,time:game.time,hp:game.player.hp,kills:game.kills,enemies:game.enemies.length,level:game.player.level,random:game.random.getState(),visualRandom:game.visualRandom.getState()},eventCount:events.reduce((sum,items)=>sum+items.length,0),literalBytes:Buffer.byteLength(literal),literalSHA256:sha(literal)});
 }
 return{proofs,report:{arm,count,weapon:'nailgun',mission:'mission-01',seed:774,dt:DT,warmup,episodes,scheduledTicks:episodes.reduce((n,e)=>n+e.scheduledTicks,0),activeTicks:episodes.reduce((n,e)=>n+e.activeTicks,0),terminalTicks:episodes.reduce((n,e)=>n+e.terminalTicks,0),cpu:summary(episodes.map(e=>e.cpuMs)),wall:summary(episodes.map(e=>e.wallMs)),literalEqualToA1:reference?true:null}};
}
function acceptance(arms){
 const checks=[];for(const count of COUNTS){
  const a1=arms[0].counts.find(row=>row.count===count),b=arms[1].counts.find(row=>row.count===count),a2=arms[2].counts.find(row=>row.count===count),fasterCPU=Math.min(a1.cpu.sum,a2.cpu.sum),fasterWall=Math.min(a1.wall.sum,a2.wall.sum);
  const cpuGainPercent=(1-b.cpu.sum/fasterCPU)*100,wallGainPercent=(1-b.wall.sum/fasterWall)*100,cpuDriftPercent=(Math.max(a1.cpu.sum,a2.cpu.sum)/fasterCPU-1)*100,wallDriftPercent=(Math.max(a1.wall.sum,a2.wall.sum)/fasterWall-1)*100;
  const sufficientActiveWork=[a1,b,a2].every(a=>a.activeTicks>=EPISODES*180&&a.terminalTicks<=EPISODES*20),sameWork=sufficientActiveWork&&b.activeTicks===a1.activeTicks&&b.activeTicks===a2.activeTicks&&b.terminalTicks===a1.terminalTicks&&b.terminalTicks===a2.terminalTicks;
  const tails=[a1,a2].every(a=>b.cpu.p95<=a.cpu.p95*1.05&&b.cpu.max<=a.cpu.max*1.05&&b.wall.p95<=a.wall.p95*1.05&&b.wall.max<=a.wall.max*1.05),cpuGate=count===60?b.cpu.sum<=fasterCPU*1.05:cpuGainPercent>=5,wallGate=b.wall.sum<=fasterWall*1.05,stable=cpuDriftPercent<=10&&wallDriftPercent<=10;
  checks.push({count,cpuGainPercent,wallGainPercent,cpuDriftPercent,wallDriftPercent,sufficientActiveWork,sameWork,cpuGate,wallGate,tails,stable,passed:sameWork&&cpuGate&&wallGate&&tails&&stable});
 }
 return{passed:checks.every(c=>c.passed),inconclusive:checks.some(c=>!c.stable),checks,productAdopted:false,original20MinuteCPUBudgetMs:15000,note:'A/B/A diagnostic gate only. Both180/210 require>=5% CPU gain against faster A;60 CPU and all wall/tails allow at most5% regression;>10% A drift is inconclusive. Every arm requires>=1440 active ticks and<=160 terminal ticks per count. Tails are eight200-tick episode windows, not frame percentiles. This does not replace the unchanged original24000-tick/15000ms CPU test.'};
}

export async function runBenchmark({mode,out}){
 assert.ok(mode==='profile'||mode==='compare');const parsed=parseArgs([mode==='profile'?'--profile':'--compare','--out',out]);
 // Reserve before reading source, importing the engine, warming or running Game.
 const file=await open(parsed.out,'wx');
 const report={tool:'enemy-damping-real-game',mode,status:'preflight',complete:false,sourceSHA:null,candidateSHA:null,conditions:{counts:mode==='profile'?[180]:COUNTS,seed:774,mission:'mission-01',weapon:'nailgun',normalHP:true,normalAI:true,dt:DT,ticksPerEpisode:TICKS,warmupEpisodesPerCount:WARMUPS,timedEpisodesPerCount:EPISODES},arms:[],acceptance:null,errors:[],profile:{requested:mode==='profile',v8CPUProfileFlag:process.execArgv.some(arg=>arg==='--cpu-prof'||arg.startsWith('--cpu-prof=')),includesStartupSetupWarmupAndProof:true},note:'Same-process fixed A1/B/A2, fresh normal Game episode per window. Fixture/setup and snapshot/full literal state+RNG+events+command/navigation proof/hash/compare are outside timers. The original event-drain arrays and already-created commands are retained in preallocated200-entry arrays during time, without clone/hash/comparison or added method hooks. Equal work is required; active and terminal/no-op ticks are disclosed. These short normal-HP episodes are neither the twenty-minute stress test nor the whole product loop/HUD/audio/persistence/GPU/FPS/heap/peakRAM. External --cpu-prof is diagnostic only, and its startup/setup/warmup/proof samples must be separated from tick attribution.'};
 report.proofSemantics='Full serialized finite-state/commands/events/both RNG/navigation equality against A1, outside timers. JSON serialization normalizes negative zero; this is not universal IEEE64 Game equality. Independent damping unit tests cover IEEE64 arithmetic.';
 try{
  assert.ok(Number(process.versions.node.split('.')[0])>=22,'Node22 required');if(mode==='compare')assert.equal(report.profile.v8CPUProfileFlag,false,'cost bracket must be unprofiled');
  const modules=await loadGameArms(mode==='compare');report.sourceSHA=modules.hashes;report.candidateSHA=modules.candidateSHA;report.status='running';
  const baseline=new Map();for(const [arm,Game]of mode==='profile'?[['A1-profile',modules.original]]:[['A1',modules.original],['B',modules.candidate],['A2',modules.original]]){
   const row={arm,counts:[]};report.arms.push(row);for(const count of mode==='profile'?[180]:COUNTS){const result=runCount(Game,count,arm,arm==='A1'||arm==='A1-profile'?null:baseline.get(count));row.counts.push(result.report);if(arm==='A1')baseline.set(count,result.proofs);}
  }
  report.complete=true;report.status=mode==='profile'?'baseline-profile-diagnostic':'compared';if(mode==='compare')report.acceptance=acceptance(report.arms);
 }catch(error){report.status='failed';report.errors.push(errorInfo(error));}
 try{const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');let offset=0;while(offset<bytes.length){const wrote=await file.write(bytes,offset,bytes.length-offset,offset);assert.ok(wrote.bytesWritten>0);offset+=wrote.bytesWritten;}await file.truncate(bytes.length);}finally{await file.close();}
 return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const options=parseArgs(process.argv.slice(2)),report=await runBenchmark(options);process.stdout.write(JSON.stringify({mode:report.mode,status:report.status,complete:report.complete,accepted:report.acceptance?.passed??null,out:options.out})+'\n');if(!report.complete||report.acceptance&&!report.acceptance.passed)process.exitCode=1;}
 catch(error){process.stderr.write(JSON.stringify({status:'not-completed',error:errorInfo(error)})+'\n');process.exitCode=1;}
}
