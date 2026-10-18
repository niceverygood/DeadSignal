import assert from 'node:assert/strict';
import {readFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';

// QA-only source clone. This file never writes an engine, asset, save or test.
export const ENGINE_SHA256='72487b352161059b5745a3e5cfc149ff71ae3f7b98c7e310b5d8b3a5345260ce';
const engineURL=new URL('../../work/dead-signal-game/dist/engine.js',import.meta.url);
const testURL=new URL('../../work/dead-signal-game/tests/engine.test.mjs',import.meta.url);
const originalScan='const d=distance(e,from);if(d<best){best=d;target=e;}';
const candidateScan='const dx=e.x-from.x,dy=e.y-from.y;if(Math.abs(dx)>=best||Math.abs(dy)>=best)continue;const d=Math.hypot(dx,dy);if(d<best){best=d;target=e;}';
const poolNames=['enemies','corpses','particles','pickups','texts','bullets','links','fires','throwables'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const cpuMs=value=>(value.user+value.system)/1000;
const NOTE='QA-only A then B, each in one fresh sequential Node process, with no repetitions or speed threshold. A is the SHA-pinned current unlimited-upgrade engine; B differs only in the chain nearest-target scan, rejecting axis distances >= the current best before the same Math.hypot. Both run the unchanged twenty-minute stress actions, including its explicit invulnerability fixture, first offered upgrades, event drain order and periodic entity/collision assertions. This is not normal player survival. Both arms have identical Math.hypot counters, instance chain/target observers, event hashes, pool maxima and every100-tick full-state/checkpoint hashing. Reported loop CPU/wall includes those observers, snapshots, hashes, allocation and assertions; it is not an uninstrumented npm test, a 15000ms budget pass, browser/GPU/FPS evidence, or a general getter/monkeypatched-Math equivalence claim. Imports and final reporting are outside loop timing. Full checkpoints/runtime (including world, effects and both RNGs) are hashed with type tags and IEEE64 numbers; checkpoints themselves retain the normal snapshot API representation. Hashes are exact trace comparisons, not a proof for every possible game. No CPU budget or concurrency setting is changed.';

function options(args){
 const result={out:null,worker:null,help:false},seen=new Set();
 for(let i=0;i<args.length;i++){
  const key=args[i];if(key==='--help'||key==='-h'){result.help=true;continue;}
  if(!['--out','--worker'].includes(key)||seen.has(key))throw Error('unknown-or-duplicate-option:'+key);seen.add(key);
  const value=args[++i];if(!value||value.startsWith('--'))throw Error('option-value-required:'+key);
  if(key==='--worker'){if(!['A','B'].includes(value))throw Error('worker-must-be-A-or-B');result.worker=value;}else result.out=value;
 }
 if(result.worker&&result.out)throw Error('worker-cannot-write-report');
 if(!result.help&&!result.worker&&!result.out)throw Error('--out NEW_REPORT.json required');
 if(result.out&&!/\.json$/i.test(result.out))throw Error('output-must-be-json');
 return result;
}
function relocate(source){return source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_match,_quote,specifier)=>'from '+JSON.stringify(new URL(specifier,engineURL).href)).replaceAll('import.meta.url',JSON.stringify(engineURL.href));}
async function sources(){
 const bytes=await readFile(engineURL);assert.equal(hash(bytes),ENGINE_SHA256,'current engine changed; do not silently compare another version');const original=bytes.toString('utf8');
 assert.equal(original.split(originalScan).length-1,1,'chain scan substitution must match exactly once');
 const candidate=original.replace(originalScan,candidateScan);assert.equal(candidate.replace(candidateScan,originalScan),original,'only the approved scan may differ');
 const testSource=await readFile(testURL,'utf8'),start=testSource.indexOf("test('twenty minutes of seeded autopilot keeps entity pools finite and bounded'");assert.ok(start>=0,'original stress fixture missing');
 const end=testSource.indexOf('\n});',start);assert.ok(end>start,'stress fixture boundary missing');const fixture=testSource.slice(start,end+4);
 for(const token of ["new Game({ seed: 774, weapon: 'nailgun', stageDuration: 1e9 })",'tick < 24000','game.player.invul = 1','game.drainEvents();','cpuMs < 15000'])assert.ok(fixture.includes(token),'stress fixture contract changed:'+token);
 const dependencies=[],seen=new Set();
 async function visit(url,text){const name=fileURLToPath(url);if(seen.has(name))return;seen.add(name);const data=text===undefined?await readFile(url):Buffer.from(text);const content=data.toString('utf8');dependencies.push({file:name,sha256:hash(data)});for(const match of content.matchAll(/from\s+(['"])(\.[^'"]+)\1/g)){const next=new URL(match[2],url);if(next.pathname.endsWith('.js'))await visit(next);}}
 await visit(engineURL,original);dependencies.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
 return {original,candidate,originalBytes:bytes.length,originalSha256:hash(bytes),candidateSha256:hash(candidate),fixtureSha256:hash(fixture),dependencies,dependencySha256:hash(JSON.stringify(dependencies))};
}

// No JSON normalization of -0, undefined, infinities or NaN in comparison hashes.
function exactWriter(digest){
 const number=Buffer.allocUnsafe(8);
 function value(item){
  if(item===null){digest.update('null;');return;}
  const type=typeof item;
  if(type==='number'){number.writeDoubleLE(item);digest.update('n:');digest.update(number);return;}
  if(type==='string'){digest.update('s:'+Buffer.byteLength(item)+':');digest.update(item);return;}
  if(type==='boolean'||type==='undefined'){digest.update(type+':'+String(item)+';');return;}
  if(Array.isArray(item)){digest.update('a:'+item.length+'[');for(const entry of item)value(entry);digest.update(']');return;}
  if(item instanceof Set){digest.update('set:'+item.size+'[');for(const entry of item)value(entry);digest.update(']');return;}
  if(item instanceof Map){digest.update('map:'+item.size+'[');for(const [key,entry]of item){value(key);value(entry);}digest.update(']');return;}
  assert.equal(type,'object','unexpected runtime value type');const keys=Object.keys(item);digest.update('o:'+keys.length+'{');for(const key of keys){value(key);value(item[key]);}digest.update('}');
 }
 return value;
}
function exactHash(value){const digest=createHash('sha256');exactWriter(digest)(value);return digest.digest('hex');}
function stateOf(game){
 const runtime={};for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(game)))if(key!=='navigation'&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value!=='function')runtime[key]=descriptor.value;
 return {runtime,randomState:game.random.getState(),visualRandomState:game.visualRandom.getState()};
}
function boundaryProof(){
 const nextUp=value=>{const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,value);let bits=data.getBigUint64(0);bits+=value>=0?1n:-1n;data.setBigUint64(0,bits);return data.getFloat64(0);};
 const nextDown=value=>-nextUp(-value),r=170,inside=nextDown(r),outside=nextUp(r),tiny=Number.MIN_VALUE,huge=Number.MAX_VALUE;
 const cases=[[[r,0],[inside,0],[0,inside]],[[outside,0],[r,0],[-inside,0]],[[0,r],[0,inside],[0,-inside]],[[102,136],[102,nextDown(136)],[102,nextUp(136)]],[[1,0],[1,0],[-1,0]],[[0,-0],[-0,0],[tiny,tiny]],[[huge,huge],[Infinity,0],[NaN,0],[0,inside]],[[inside,inside],[100,100],[100,-100]]];
 const pick=(points,candidate)=>{let target=null,best=r;for(let index=0;index<points.length;index++){const [dx,dy]=points[index];if(candidate&&(Math.abs(dx)>=best||Math.abs(dy)>=best))continue;const d=Math.hypot(dx,dy);if(d<best){best=d;target=index;}}return{target,best};};
 const records=cases.map((points,index)=>{const original=pick(points,false),candidate=pick(points,true);assert.equal(candidate.target,original.target,'boundary target '+index);assert.ok(Object.is(candidate.best,original.best),'boundary exact distance '+index);return{index,target:original.target,best:original.best};});
 return {cases:records,exact:true,note:'Standalone ordinary-Math numeric scan control: strict radius boundary, adjacent IEEE64 values, tie order, signed zero, subnormal, overflow and nonfinite non-targets. No Game state is changed.'};
}
function observe(game){
 let activeTick=-1,chainDepth=0,damageDepth=0,chainCalls=0,shockTargets=0,hypotCalls=0,chainHypotCalls=0;const targetDigest=createHash('sha256'),targetValue=exactWriter(targetDigest),originalHypot=Math.hypot,originalHypotDescriptor=Object.getOwnPropertyDescriptor(Math,'hypot'),originalChain=game.chain,originalDamage=game.damageEnemy,ownChain=Object.getOwnPropertyDescriptor(game,'chain'),ownDamage=Object.getOwnPropertyDescriptor(game,'damageEnemy');
 const hypot=function(...args){hypotCalls++;if(chainDepth)chainHypotCalls++;return Reflect.apply(originalHypot,this,args);};
 const chain=function(...args){chainCalls++;chainDepth++;try{return Reflect.apply(originalChain,this,args);}finally{chainDepth--;}};
 const damage=function(...args){if(chainDepth&&!damageDepth){shockTargets++;targetValue([activeTick,chainCalls,args[0].id,args[1]]);}damageDepth++;try{return Reflect.apply(originalDamage,this,args);}finally{damageDepth--;}};
 Object.defineProperty(Math,'hypot',{...originalHypotDescriptor,value:hypot});Object.defineProperty(game,'chain',{configurable:true,writable:true,value:chain});Object.defineProperty(game,'damageEnemy',{configurable:true,writable:true,value:damage});
 let stopped=false,cleanup=null;
 return {setTick(tick){activeTick=tick;},counts(){return{hypotCalls,chainHypotCalls,outsideChainHypotCalls:hypotCalls-chainHypotCalls,chainCalls,shockTargets,shockTargetSha256:targetDigest.copy().digest('hex')};},stop(){if(stopped)return cleanup;stopped=true;if(Math.hypot===hypot)Object.defineProperty(Math,'hypot',originalHypotDescriptor);for(const [key,wrapper,before]of [['chain',chain,ownChain],['damageEnemy',damage,ownDamage]])if(game[key]===wrapper){if(before)Object.defineProperty(game,key,before);else delete game[key];}cleanup={mathHypotRestored:Math.hypot===originalHypot,chainRestored:game.chain===originalChain,damageRestored:game.damageEnemy===originalDamage,chainDepth,damageDepth};return cleanup;}};
}

async function worker(arm){
 const input=await sources(),boundary=boundaryProof(),source=arm==='A'?input.original:input.candidate,importStart=performance.now(),{Game}=await import('data:text/javascript;base64,'+Buffer.from(relocate(source)).toString('base64')),importWallMs=performance.now()-importStart;
 const game=new Game({seed:774,weapon:'nailgun',stageDuration:1e9}),eventDigest=createHash('sha256'),eventValue=exactWriter(eventDigest),checkpoints=[],poolMaxima=Object.fromEntries(poolNames.map(key=>[key,0]));let eventCount=0,shotCount=0,shockEvents=0,simulated=0,cleanup;
 const initialSnapshot=game.snapshot();assert.ok(initialSnapshot,'initial checkpoint must be valid');const initialStateSha256=exactHash({snapshot:initialSnapshot,...stateOf(game)});
 const observation=observe(game);
 const cpuStart=process.cpuUsage(),start=performance.now();let wallMs,cpu;
 try{
  for(let tick=0;tick<24000;tick++){
   observation.setTick(tick);
   if(game.state==='upgrade')game.chooseUpgrade(game.choices[0].id);
   game.player.invul=1;
   const enemy=game.enemies.find(item=>!item.dead);
   const direction=tick/300;
   game.tick(.05,{moveX:Math.cos(direction),moveY:Math.sin(direction),aimX:enemy?.x??1200,aimY:enemy?.y??930,shoot:true,dash:tick%80===0,lure:tick%250===0,molotov:tick%350===0});
   const events=game.drainEvents();
   simulated+=.05;
   eventValue([tick,events]);eventCount+=events.length;for(const event of events){if(event.type==='shot')shotCount++;if(event.type==='shock')shockEvents++;}
   for(const key of poolNames)poolMaxima[key]=Math.max(poolMaxima[key],game[key]?.length??0);
   if(tick%100===0){
    assert.ok(game.enemies.length<=210);assert.ok(game.corpses.length<=70);assert.ok(game.particles.length<=850);assert.ok(game.pickups.length<=450);assert.ok(game.texts.length<=30);assert.ok(Number.isFinite(game.player.x)&&Number.isFinite(game.player.y));assert.ok(game.player.hp>=0&&game.parts>=0);assert.equal(game.blocked(game.player.x,game.player.y,game.player.r),false);
    const snapshot=game.snapshot();assert.ok(snapshot,'checkpoint invalid at tick '+tick);const state=stateOf(game);
    checkpoints.push({tick,snapshotSha256:exactHash(snapshot),fullStateSha256:exactHash(state),worldSha256:exactHash(game.world),randomState:state.randomState,visualRandomState:state.visualRandomState,eventSha256:eventDigest.copy().digest('hex'),eventCount,shotCount,shockEvents,shockTargets:observation.counts().shockTargets,shockTargetSha256:observation.counts().shockTargetSha256,level:game.player.level,upgrades:{...game.upgrades}});
   }
  }
  assert.ok(simulated>=1199);assert.ok(game.time>1150);assert.ok(game.kills>0);assert.ok(shockEvents>0&&observation.counts().shockTargets>0&&observation.counts().chainHypotCalls>0,'the stress trace must actually exercise shock target selection');
  wallMs=performance.now()-start;cpu=process.cpuUsage(cpuStart);
 }finally{cleanup=observation.stop();}
 const finalSnapshot=game.snapshot();assert.ok(finalSnapshot,'final checkpoint invalid');assert.deepEqual(cleanup,{mathHypotRestored:true,chainRestored:true,damageRestored:true,chainDepth:0,damageDepth:0});
 const finalState=stateOf(game),finalStateSha256=exactHash(finalState),finalSnapshotSha256=exactHash(finalSnapshot),counts=observation.counts();
 return {arm,engineSha256:input.originalSha256,candidateSha256:input.candidateSha256,engineBytes:input.originalBytes,fixtureSha256:input.fixtureSha256,dependencies:input.dependencies,dependencySha256:input.dependencySha256,node:process.version,execArgv:process.execArgv,fixture:{seed:774,weapon:'nailgun',stageDuration:1e9,ticks:24000,dt:.05,simulatedSeconds:simulated,invulnerabilityFixture:true,originalCpuBudgetMs:15000,periodicInvariantChecks:240},importWallMs,timing:{wallMs,cpuMs:cpuMs(cpu),cpuMicroseconds:cpu,includesObservationAndCheckpointHashing:true,isOriginalTestBudgetMeasurement:false},boundary,counts,eventCount,shotCount,shockEvents,eventSha256:eventDigest.digest('hex'),poolMaxima,initialSnapshot,initialStateSha256,checkpoints,finalSnapshot,finalSnapshotSha256,finalStateSha256,finalWorldSha256:exactHash(game.world),randomState:finalState.randomState,visualRandomState:finalState.visualRandomState,finalLevel:game.player.level,finalRanks:{...game.upgrades},finalKills:game.kills,finalGameTime:game.time,finalState:finalState.runtime,cleanup};
}
function runChild(arm){
 return new Promise((resolveChild,reject)=>{
  const child=spawn(process.execPath,[...process.execArgv,fileURLToPath(import.meta.url),'--worker',arm],{cwd:fileURLToPath(new URL('../../',import.meta.url)),stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',text=>stdout+=text);child.stderr.on('data',text=>stderr+=text);child.on('error',reject);child.on('close',(code,signal)=>{let result;try{result=JSON.parse(stdout);}catch{reject(Error('worker-'+arm+' invalid JSON; exit='+code+' signal='+signal+' stderr='+stderr.slice(-2000)));return;}resolveChild({arm,code,signal,stderr,result});});
 });
}
function compare(a,b){
 const errors=[];const fields=['engineSha256','candidateSha256','engineBytes','fixtureSha256','dependencies','dependencySha256','node','execArgv','fixture','boundary','eventCount','shotCount','shockEvents','eventSha256','poolMaxima','initialSnapshot','initialStateSha256','checkpoints','finalSnapshot','finalSnapshotSha256','finalStateSha256','finalWorldSha256','randomState','visualRandomState','finalLevel','finalRanks','finalKills','finalGameTime','finalState','cleanup'];
 for(const field of fields)try{assert.deepEqual(b[field],a[field]);}catch{errors.push(field);}
 for(const field of ['chainCalls','shockTargets','shockTargetSha256','outsideChainHypotCalls'])if(b.counts?.[field]!==a.counts?.[field])errors.push('counts.'+field);
 if(!(b.counts?.chainHypotCalls<=a.counts?.chainHypotCalls))errors.push('candidate-chain-hypot-not-reduced-or-equal');
 return {exact:errors.length===0,mismatches:errors,hypotCallsRemoved:(a.counts?.hypotCalls??0)-(b.counts?.hypotCalls??0),chainHypotCallsRemoved:(a.counts?.chainHypotCalls??0)-(b.counts?.chainHypotCalls??0),note:'Timing, import wall and intentionally removed hypot counts are excluded from equality. Every100-tick full runtime/world/checkpoint, cumulative events/target traces and both RNG states, final full runtime/checkpoint and fixture/action counters must match.'};
}
async function writeReport(handle,report){const data=Buffer.from(JSON.stringify(report,null,2)+'\n');let position=0;while(position<data.length){const {bytesWritten}=await handle.write(data,position,data.length-position,position);if(!bytesWritten)throw Error('report-write-made-no-progress');position+=bytesWritten;}await handle.truncate(data.length);await handle.sync();}
async function main(){
 let config;try{config=options(process.argv.slice(2));assert.ok(Number(process.versions.node.split('.')[0])>=22,'Node.js22 or newer required');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=2;return;}
 if(config.help){process.stdout.write('node qa/upgrade-status-20261018/compare-chain-axis-stress.mjs --out NEW_REPORT.json\nTwo fixed sequential A/B workers; no repetitions. Existing output is never overwritten. Exit0=exact proof, exit1=mismatch, exit2=source/worker/I/O failure. Timing is instrumented diagnostic only.\n');return;}
 if(config.worker){try{process.stdout.write(JSON.stringify(await worker(config.worker))+'\n');}catch(error){process.stdout.write(JSON.stringify({error:{name:error.name,message:error.message},arm:config.worker})+'\n');process.exitCode=2;}return;}
 let output;try{output=await open(resolve(config.out),'wx');}catch(error){process.stderr.write('exclusive-output-failed: '+error.message+'\n');process.exitCode=2;return;}
 const report={schema:'dead-signal-chain-axis-stress-v1',diagnosticOnly:true,productionChanged:false,order:['A','B'],createdUTC:new Date().toISOString(),note:NOTE,workers:[],comparison:null,error:null};let written=false;
 try{
  await sources();
  for(const arm of ['A','B']){const child=await runChild(arm);report.workers.push(child);if(child.code!==0||child.signal||child.result?.error)throw Error('worker-'+arm+' failed; evidence retained');}
  report.comparison=compare(report.workers[0].result,report.workers[1].result);process.exitCode=report.comparison.exact?0:1;
  await writeReport(output,report);written=true;process.stdout.write(JSON.stringify({out:resolve(config.out),exact:report.comparison.exact,mismatches:report.comparison.mismatches,timing:report.workers.map(item=>({arm:item.arm,...item.result.timing})),hypotCallsRemoved:report.comparison.hypotCallsRemoved})+'\n');
 }catch(error){report.error={name:error.name,message:error.message};process.exitCode=2;if(!written)try{await writeReport(output,report);written=true;}catch(writeError){process.stderr.write('failure-report-write-failed: '+writeError.message+'\n');}process.stderr.write(error.message+'\n');}
 finally{await output.close();}
}
await main();
