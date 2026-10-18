import {readFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

export const ORIGINAL_PROFILE_SHA256='3b2f3774d703f84952c501f85b001d169e6fbbda024d407478bd989539026cce';
export const CANDIDATE_PROFILE_SHA256='83926473a1962e533ca630ed7d7f9266b89bbfd136724993b818a8af49ab7584';
export const OBSERVER_WINDOW_FRAMES=40;
export const FRAME_OBSERVER_POOL_NOTE='Sequential fresh Node original/candidate/original workers use the same real Game60/180 fixture and controlled JavaScript Renderer/player/art method workload. The candidate is QA-only, SHA-pinned at qa/frame-observer-20261018/frame-cost-profile-pool-candidate.txt; production retains the original observer. A fresh checkpoint restore, controlled owners and observer are used per40-frame window; at most40 report samples remain in that window and only primitive summaries/digests are retained afterward. Only beginFrame, one original Game.tick(1/60, explicit manual no-shoot input), controlled original observation calls and endFrame are timed. Import, fixture creation/restore, input creation, stop/descriptor cleanup, event draining, report/state hashing and comparison are outside those call intervals. A deterministic synthetic clock advances by.125 only when an original observed/workload method executes; observer clock reads do not advance it. Synthetic report cpuMs are proof values, never real time. Actual call-wall and process CPU are separately reported and include real simulation, controlled workload/counter overhead and observer work; process CPU can include other threads. Identical untimed unobserved windows independently check that observation preserves original call counters, events, game/runtime and both RNG streams. The report has no source-factory allocation instrumentation, no continuous heap/GC/retention measurements and no claimed allocation-byte reduction. Controlled native labels/GL/read method names are stand-ins with no Canvas, GPU, images, upload, WebAudio or native pixels. This is not actual production Renderer/app.frame, full HUD/audio/save, browser cadence or FPS evidence. Normal input/HP/AI/speed/spawn/RNG are preserved; no source Game/assets/save or external services are modified. There is no performance threshold.';
const rootURL=new URL('../',import.meta.url),profileURL=new URL('../qa/frame-observer-20261018/frame-cost-profile-pool-candidate.txt',import.meta.url),originalURL=new URL('../qa/frame-observer-20261018/frame-cost-profile-before-pool.txt',import.meta.url),engineURL=new URL('../work/dead-signal-game/dist/engine.js',import.meta.url);
const sha=value=>createHash('sha256').update(value).digest('hex');
const GAME_METHODS=['tick','updateMolotovs','updateBullets','updateEnemies','updatePickups','updateEffects','spawnEnemy','shoot'];
const NAV_METHODS=['direction','_sync','_grid','_field','_nearest','_approachBlocked'];
const CONTROL_METHODS=['render','makeFloor','nativePlayerFrame','drawPlayer','drawObstacle','drawDecor','prepareNativeEnemyBatch','drawMinimap','drawEnemy','nativeEnemyFrame','drawNativeEnemy','drawCampaignBoss','nativeCorpseFrame','drawNativeCorpse','drawCorpse','drawParticle','art.drawFrame','player.frame','player.rasterFrame','player.render','player.getImageData'];
const LABELS=[...GAME_METHODS.map(key=>'game.'+key),...NAV_METHODS.map(key=>'navigation.'+key),...CONTROL_METHODS.map(key=>'control.'+key)];
const validate=({actors='both',windows=2}={})=>{if(!['both',60,180].includes(actors))throw Error('frame-observer-actors-60-180-or-both');if(!Number.isInteger(windows)||windows<1||windows>20)throw Error('frame-observer-windows-1-to-20');return{actors,windows};};

export function strictObserverDigest(value){
 const digest=createHash('sha256'),number=Buffer.allocUnsafe(8);
 function visit(v){
  if(typeof v==='number'){digest.update('number:');number.writeDoubleLE(v);digest.update(number);return;}
  if(v===null||typeof v!=='object'){digest.update(typeof v+':'+String(v)+';');return;}
  if(Array.isArray(v)){digest.update('array:'+v.length+'[');for(let i=0;i<v.length;i++){digest.update(Object.hasOwn(v,i)?'own:':'hole:');visit(v[i]);}digest.update(']');return;}
  const keys=Object.keys(v).sort();digest.update('object:'+keys.length+'{');for(const key of keys){digest.update(key+':');visit(v[key]);}digest.update('}');
 }
 visit(value);return digest.digest('hex');
}
function runtimeState(game){
 const target=value=>value===game.player?'player':value===game.lure?'lure':value==null?value:{id:value.id,x:value.x,y:value.y};
 return{snapshot:game.snapshot(),player:game.player,enemies:game.enemies.map(e=>({...e,navTarget:target(e.navTarget)})),bullets:game.bullets.map(b=>({...b,hits:[...b.hits]})),particles:game.particles,texts:game.texts,links:game.links,corpses:game.corpses,fires:game.fires,throwables:game.throwables,pickups:game.pickups,lure:game.lure,events:game.events,world:game.world,id:game.id,state:game.state,time:game.time,stageTime:game.stageTime,kills:game.kills,parts:game.parts,noise:game.noise,spawnClock:game.spawnClock,shake:game.shake,flash:game.flash,random:game.random.getState(),visualRandom:game.visualRandom.getState()};
}
export function createObserverCheckpoint(Game,actors){
 if(![60,180].includes(actors))throw Error('frame-observer-worker-actors-60-or-180');
 const game=new Game({seed:774,missionId:'mission-01',weapon:actors===60?'shotgun':'nailgun'}),baseEnemies=game.enemies.length;
 for(let i=baseEnemies;i<actors;i++){
  let at=null;for(let n=0;n<32&&!at;n++){const a=(i/actors+n/32)*Math.PI*2,r=210+(i%5)*32,x=game.player.x+Math.cos(a)*r,y=game.player.y+Math.sin(a)*r;if(!game.blocked(x,y,16))at={x,y};}
  if(!at||!game.spawnEnemy('walker',210,at))throw Error('frame-observer-normal-spawn-failed-'+i);
 }
 const snapshot=game.snapshot();if(!snapshot||snapshot.enemies.length!==actors)throw Error('frame-observer-checkpoint-invalid');
 return{snapshot,metadata:{actors,baseEnemies,seed:774,weapon:game.player.weapon,spawnClock:game.spawnClock,framesPerWindow:OBSERVER_WINDOW_FRAMES,input:'one fixed1/60 Game.tick per frame; zero movement/manual no-shoot/normal AI and spawning'}};
}
function methodDescriptors(objects){return objects.map(object=>({object,before:Object.getOwnPropertyDescriptors(object)}));}
function functionsRestored(records){
 for(const {object,before}of records){for(const [key,descriptor]of Object.entries(before))if(typeof descriptor.value==='function'||!('value'in descriptor)){const now=Object.getOwnPropertyDescriptor(object,key);if(!now||now.value!==descriptor.value||now.get!==descriptor.get||now.set!==descriptor.set||now.configurable!==descriptor.configurable||now.enumerable!==descriptor.enumerable||now.writable!==descriptor.writable)return false;}
  for(const key of Reflect.ownKeys(object)){const now=Object.getOwnPropertyDescriptor(object,key);if(typeof now?.value==='function'&&!Object.hasOwn(before,key))return false;}
 }
 return true;
}
export function createControlledObserverWorkload(game){
 const counts=Object.fromEntries(LABELS.map(label=>[label,0])),codes=Object.fromEntries(LABELS.map((label,index)=>[label,index+1])),undo=[];
 let clock=0,clockReads=0,sequence=2166136261,scalarChecksum=0,callCount=0;
 function called(label,value=0){counts[label]++;callCount++;sequence=Math.imul(sequence^codes[label],16777619)>>>0;scalarChecksum+=value;clock+=.125;}
 function shadow(object,key,label){const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];if(typeof original!=='function')throw Error('frame-observer-original-method-missing-'+label);const wrapped=function(...args){called(label);return Reflect.apply(original,this,args);};Object.defineProperty(object,key,descriptor?{...descriptor,value:wrapped}:{value:wrapped,writable:true,configurable:true,enumerable:false});undo.push(()=>{if(Object.getOwnPropertyDescriptor(object,key)?.value!==wrapped)throw Error('frame-observer-original-owner-changed-'+label);if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];});}
 const originalDescriptors=methodDescriptors([game,game.navigation]);for(const key of GAME_METHODS)shadow(game,key,'game.'+key);for(const key of NAV_METHODS)shadow(game.navigation,key,'navigation.'+key);
 const result=Object.freeze({controlledResult:true}),floor=Object.freeze({controlledFloor:true}),context=Object.freeze({controlledContext:true});
 const native=Object.freeze({id:'controlled-native',metadata:Object.freeze({liveRig:true})}),baked=Object.freeze({id:'controlled-baked',metadata:Object.freeze({format:'meshy-iso-sprite-atlas'})}),unknown=Object.freeze({id:'controlled-unknown',metadata:Object.freeze({})}),hero=Object.freeze({id:'survivor-original-live-rig',metadata:Object.freeze({liveRig:true})});
 const art={drawFrame(c,selected){called('control.art.drawFrame',selected===native?3:selected===baked?5:selected===hero?7:11);return result;}};
 const gl={render(){called('control.player.render');return result;}},body={getImageData(){called('control.player.getImageData');return result;}};
 const player={renderer:gl,bodyContext:body,frame(){called('control.player.frame');return this.rasterFrame();},rasterFrame(){called('control.player.rasterFrame');this.renderer.render();this.bodyContext.getImageData();this.renderer.render();return hero;}};
 const renderer={productionArt:art,livePlayer:player,floor:null,
  makeFloor(){called('control.makeFloor');this.floor??=floor;return result;},
  nativePlayerFrame(){called('control.nativePlayerFrame');return this.livePlayer.frame();},
  drawPlayer(){called('control.drawPlayer');return this.productionArt.drawFrame(context,this.nativePlayerFrame());},
  drawObstacle(c,o){called('control.drawObstacle',o.x+o.y);return this.productionArt.drawFrame(c,baked);},
  drawDecor(c,d){called('control.drawDecor',d.x+d.y);return this.productionArt.drawFrame(c,baked);},
  prepareNativeEnemyBatch(){called('control.prepareNativeEnemyBatch');return result;},
  drawMinimap(){called('control.drawMinimap');return result;},
  drawEnemy(c,e){called('control.drawEnemy',e.id+e.x+e.y);return this.drawNativeEnemy(c,e);},
  nativeEnemyFrame(e){called('control.nativeEnemyFrame');return e.id%19===0?unknown:e.id%3===0?native:baked;},
  drawNativeEnemy(c,e){called('control.drawNativeEnemy');const selected=this.nativeEnemyFrame(e);const value=this.productionArt.drawFrame(c,selected);if(e.id%7===0)this.productionArt.drawFrame(c,selected);if(e.id%17===0)this.drawPlayer();return value;},
  drawCampaignBoss(){called('control.drawCampaignBoss');return this.productionArt.drawFrame(context,native);},
  nativeCorpseFrame(){called('control.nativeCorpseFrame');return baked;},
  drawNativeCorpse(c,selected){called('control.drawNativeCorpse');return this.productionArt.drawFrame(c,selected);},
  drawCorpse(){called('control.drawCorpse');return this.drawNativeCorpse(context,this.nativeCorpseFrame());},
  drawParticle(){called('control.drawParticle');return result;},
  render(){
   called('control.render');if(this.prepareNativeEnemyBatch()!==result||this.makeFloor()!==result)throw Error('frame-observer-controlled-return-changed');
   const obstacleCount=Math.min(24,game.world.obstacles.length),decorCount=Math.min(12,game.world.decor.length);
   for(let i=0;i<obstacleCount;i++)if(this.drawObstacle(context,game.world.obstacles[i])!==result)throw Error('frame-observer-obstacle-return-changed');
   for(let i=0;i<decorCount;i++)if(this.drawDecor(context,game.world.decor[i])!==result)throw Error('frame-observer-decor-return-changed');
   for(const e of game.enemies)if(!e.dead&&this.drawEnemy(context,e)!==result)throw Error('frame-observer-enemy-return-changed');
   if(this.drawCampaignBoss()!==result||this.drawCorpse()!==result||this.drawPlayer()!==result||this.drawParticle()!==result||this.drawMinimap()!==result)throw Error('frame-observer-controlled-return-changed');return result;
  }
 };
 const objects=[game,game.navigation,renderer,art,player,gl,body],beforeProfile=methodDescriptors(objects);
 return{renderer,now(){clockReads++;return clock;},render:()=>renderer.render(),publicProof:()=>({counts:{...counts},callCount,sequence,scalarChecksum,syntheticClock:clock}),clockReads:()=>clockReads,profileRestored:()=>functionsRestored(beforeProfile),cleanup(){for(const release of undo.splice(0).reverse())release();return functionsRestored(originalDescriptors);}};
}
function summarizeStages(samples){const totals={};for(const sample of samples)for(const [name,stage]of Object.entries(sample.stages)){const total=totals[name]??={calls:0,syntheticCpuMs:0};total.calls+=stage.calls;total.syntheticCpuMs+=stage.cpuMs;}return totals;}
export function measureObserverWindows(Game,createProfile,{actors=180,windows=2,wallNow=()=>performance.now(),cpuUsage=previous=>process.cpuUsage(previous)}={}){
 validate({actors,windows});if(typeof createProfile!=='function')throw Error('frame-observer-create-profile-required');
 const fixture=createObserverCheckpoint(Game,actors),initialSnapshotSha256=strictObserverDigest(fixture.snapshot),reports=[];
 for(let window=0;window<windows;window++){
  const game=Game.restore(fixture.snapshot,{resumePlaying:true});if(!game||game.state!=='playing')throw Error('frame-observer-restore-failed');
  const workload=createControlledObserverWorkload(game),profile=createProfile({renderer:workload.renderer,read:()=>({game}),now:workload.now}),events=[],command=Object.freeze({moveX:0,moveY:0,shoot:false,fireMode:'manual',aimX:game.player.x+300,aimY:game.player.y});
  let callWallMs=0,callCpuMs=0,report,profileRestored=false,originalsRestored=false;
  try{
   for(let frame=0;frame<OBSERVER_WINDOW_FRAMES;frame++){
    if(game.state!=='playing')throw Error('frame-observer-normal-combat-ended-'+frame);
    const meta={window,frame},cpuStart=cpuUsage(),start=wallNow();profile.beginFrame(meta);game.tick(1/60,command);workload.render();profile.endFrame();callWallMs+=wallNow()-start;const used=cpuUsage(cpuStart);callCpuMs+=(used.user+used.system)/1000;
    events.push(...game.drainEvents());
   }
  }finally{try{report=profile.stop();profileRestored=workload.profileRestored();}finally{originalsRestored=workload.cleanup();}}
  const samples=report?.samples??[],publicProof=workload.publicProof(),stateSha256=strictObserverDigest(runtimeState(game));
  reports.push({window,frames:samples.length,callWallMs,callCpuMs,clockReads:workload.clockReads(),reportSha256:strictObserverDigest(report),stateSha256,eventSha256:strictObserverDigest(events),publicProof,stageTotals:summarizeStages(samples),unmeasured:report?.unmeasured??['missing-report'],profileRestored,originalsRestored,final:{time:game.time,hp:game.player.hp,enemies:game.enemies.length,random:game.random.getState(),visualRandom:game.visualRandom.getState()}});
 }
 // Independent original-call control is untimed and runs only after measured
 // windows, so it cannot warm the original Game before the first timed window.
 const game=Game.restore(fixture.snapshot,{resumePlaying:true}),control=createControlledObserverWorkload(game),events=[],command=Object.freeze({moveX:0,moveY:0,shoot:false,fireMode:'manual',aimX:game.player.x+300,aimY:game.player.y});let controlRestored=false;
 try{for(let frame=0;frame<OBSERVER_WINDOW_FRAMES;frame++){if(game.state!=='playing')throw Error('frame-observer-control-combat-ended');game.tick(1/60,command);control.render();events.push(...game.drainEvents());}}finally{controlRestored=control.cleanup();}
 const unobserved={stateSha256:strictObserverDigest(runtimeState(game)),eventSha256:strictObserverDigest(events),publicProof:control.publicProof(),restored:controlRestored};
 const observationTransparent=reports.every(report=>report.stateSha256===unobserved.stateSha256&&report.eventSha256===unobserved.eventSha256&&strictObserverDigest(report.publicProof)===strictObserverDigest(unobserved.publicProof));
 const maxRetainedWindowSamples=Math.max(...reports.map(report=>report.frames)),allValid=observationTransparent&&controlRestored&&reports.every(report=>report.frames===OBSERVER_WINDOW_FRAMES&&report.profileRestored&&report.originalsRestored&&!report.unmeasured.length&&report.stageTotals['production.drawFrame.enemy']?.calls>0&&report.stageTotals['simulation.updateEnemies']?.calls===OBSERVER_WINDOW_FRAMES);
 return{actors,windows,framesPerWindow:OBSERVER_WINDOW_FRAMES,fixture:fixture.metadata,initialSnapshotSha256,callWallMs:reports.reduce((sum,report)=>sum+report.callWallMs,0),callCpuMs:reports.reduce((sum,report)=>sum+report.callCpuMs,0),maxRetainedWindowSamples,retentionScope:'Only one live observer/report sample window at a time; stored results below contain primitive counts/summaries/digests, not report samples, owners or actors. This is a designed window bound, not measured heap or factory allocation proof.',observationTransparent,allValid,reports,unobserved,note:FRAME_OBSERVER_POOL_NOTE};
}
export async function runObserverWorker(mode,{actors=180,windows=2}={}){
 validate({actors,windows});if(![60,180].includes(actors)||!['original','candidate'].includes(mode))throw Error('frame-observer-worker-mode-or-actors');
 const original=await readFile(originalURL,'utf8'),candidate=await readFile(profileURL,'utf8');if(sha(original)!==ORIGINAL_PROFILE_SHA256)throw Error('frame-observer-original-sha-mismatch');if(sha(candidate)!==CANDIDATE_PROFILE_SHA256)throw Error('frame-observer-candidate-sha-mismatch');
 const dependencyStart=performance.now(),{Game}=await import(engineURL.href),dependencyImportWallMs=performance.now()-dependencyStart,importStart=performance.now(),module=await import('data:text/javascript;base64,'+Buffer.from(mode==='original'?original:candidate).toString('base64')),moduleImportWallMs=performance.now()-importStart;
 return{mode,nodeVersion:process.version,v8Version:process.versions.v8,platform:process.platform,arch:process.arch,nodeFlags:[...process.execArgv],originalModuleSha256:ORIGINAL_PROFILE_SHA256,candidateModuleSha256:CANDIDATE_PROFILE_SHA256,setup:{dependencyImportWallMs,moduleImportWallMs},...measureObserverWindows(Game,module.createFrameCostProfile,{actors,windows})};
}
export function spawnObserverWorker(mode,{actors,windows=2}){
 return new Promise((resolveChild,reject)=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker',mode,'--actors',String(actors),'--windows',String(windows)],{cwd:fileURLToPath(rootURL),windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',overflow=false;child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>4*1024*1024){overflow=true;child.kill();}});child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8000);});child.on('error',reject);child.on('close',(code,signal)=>{if(overflow){reject(Error('frame-observer-worker-output-limit'));return;}if(code!==0){reject(Error('frame-observer-worker-failed-'+mode+'-'+code+'-'+signal+': '+stderr));return;}try{resolveChild(JSON.parse(stdout));}catch{reject(Error('frame-observer-worker-invalid-json'));}});});
}
const comparable=run=>({nodeVersion:run.nodeVersion,v8Version:run.v8Version,platform:run.platform,arch:run.arch,nodeFlags:run.nodeFlags,originalModuleSha256:run.originalModuleSha256,candidateModuleSha256:run.candidateModuleSha256,actors:run.actors,windows:run.windows,framesPerWindow:run.framesPerWindow,fixture:run.fixture,initialSnapshotSha256:run.initialSnapshotSha256,maxRetainedWindowSamples:run.maxRetainedWindowSamples,observationTransparent:run.observationTransparent,unobserved:run.unobserved,reports:run.reports.map(({callWallMs,callCpuMs,...proof})=>proof)});
export async function compareFrameObserverPool(options={},runChild=spawnObserverWorker){
 const {actors,windows}=validate(options),comparisons=[];
 for(const count of actors==='both'?[60,180]:[actors]){
  const runs=[];for(const [index,mode]of ['original','candidate','original'].entries())runs.push({arm:index===0?'A':index===1?'B':'A-repeat',...await runChild(mode,{actors:count,windows})});
  const expected=strictObserverDigest(comparable(runs[0])),outputsExact=runs.every(run=>strictObserverDigest(comparable(run))===expected),allValid=runs.every(run=>run.allValid);comparisons.push({actors:count,outputsExact,allValid,runs});
 }
 return{diagnosticOnly:true,actors,windows,framesPerWindow:OBSERVER_WINDOW_FRAMES,processOrder:'sequential fresh Node A original → B candidate → A original-repeat for each requested actor count; no concurrent workers',outputsExact:comparisons.every(comparison=>comparison.outputsExact),allValid:comparisons.every(comparison=>comparison.allValid),comparisons,note:FRAME_OBSERVER_POOL_NOTE};
}
export function parseObserverCLIArgs(args){
 const options={actors:'both',windows:2,out:null,worker:null,help:false},seen=new Set();
 for(let i=0;i<args.length;i++){const key=args[i];if(key==='--help'||key==='-h'){options.help=true;continue;}if(!['--actors','--windows','--out','--worker'].includes(key))throw Error('frame-observer-unknown-option-'+key);if(seen.has(key))throw Error('frame-observer-duplicate-option-'+key);seen.add(key);const value=args[++i];if(!value||value.startsWith('--'))throw Error('frame-observer-option-value-required-'+key);if(key==='--actors'){if(!['both','60','180'].includes(value))throw Error('frame-observer-actors-60-180-or-both');options.actors=value==='both'?'both':Number(value);}else if(key==='--windows'){if(!/^\d+$/.test(value))throw Error('frame-observer-windows-integer');options.windows=Number(value);}else if(key==='--worker'){if(!['original','candidate'].includes(value))throw Error('frame-observer-worker-mode');options.worker=value;}else options.out=value;}
 validate(options);if(options.worker&&(options.out||options.actors==='both'))throw Error('frame-observer-worker-no-output-single-actors');if(!options.worker&&!options.help&&!options.out)throw Error('frame-observer-new-output-required');if(options.out&&!/\.json$/i.test(options.out))throw Error('frame-observer-output-json-required');return options;
}
const usage='Usage: node tools/qa-frame-observer-pool.mjs --out NEW.json [--actors 60|180|both] [--windows 1..20]\nDefault both/2windows; each window is40 fixed real Game ticks plus controlled original Renderer calls. Reports are bounded per window and converted to strict IEEE64 digests outside timing. --out is reserved with exclusive creation before source reads or workers. Exit0=exact reports/calls/Game/RNG and valid transparency/cleanup, exit1=mismatch, exit2=CLI/I/O/worker error. This is not native rendering, app.frame, heap or FPS evidence.';
async function writePositionedReport(output,text){
 const bytes=Buffer.from(text);let offset=0;
 while(offset<bytes.length){const result=await output.write(bytes,offset,bytes.length-offset,offset);if(!Number.isInteger(result?.bytesWritten)||result.bytesWritten<=0||result.bytesWritten>bytes.length-offset)throw Error('frame-observer-output-write-no-progress');offset+=result.bytesWritten;}
 await output.truncate(bytes.length);
}
export async function runObserverCLI(args,{stdout=value=>console.log(value),stderr=value=>console.error(value),runChild=spawnObserverWorker,openOutput=path=>open(path,'wx')}={}){
 let output=null,reportComplete=false;
 try{const options=parseObserverCLIArgs(args);if(options.help){stdout(usage);return 0;}if(options.out)output=await openOutput(resolve(options.out));const report=options.worker?await runObserverWorker(options.worker,options):await compareFrameObserverPool(options,runChild),text=JSON.stringify(report,null,2)+'\n';if(output){await writePositionedReport(output,text);reportComplete=true;}stdout(text.trimEnd());return options.worker?0:report.outputsExact&&report.allValid?0:1;}
 catch(error){const failure={diagnosticOnly:true,error:error?.message??String(error),note:FRAME_OBSERVER_POOL_NOTE};if(output&&!reportComplete)try{await writePositionedReport(output,JSON.stringify(failure,null,2)+'\n');}catch(writeError){failure.outputRecoveryError=writeError?.message??String(writeError);}stderr(JSON.stringify({...failure,usage}));return 2;}finally{if(output)await output.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await runObserverCLI(process.argv.slice(2));
