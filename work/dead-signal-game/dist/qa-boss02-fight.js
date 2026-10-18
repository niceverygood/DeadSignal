import {Game as OriginalGame} from './engine.js?v=0.29.0';
import {Renderer as OriginalRenderer} from './renderer.js?v=0.29.0&dense=20261018-4';
import {ProductionArt as OriginalArt} from './production-art.js?v=0.29.0';
import {productionManifest} from './production-manifest.js?v=0.29.0';
import {productionLaunchPlan,preloadLaunchPlan} from './launch-gate.js?v=0.29.0';
import {ActorInterpolation} from './actor-interpolation.js';
import {advanceSimulation,FIXED_STEP} from './simulation.js?v=0.29.0';
import {LiveBossRig as OriginalRig} from './boss-rig/live-boss.js';
import {Cache} from './player-rig/vendor/three.module.js';
import {getBoss} from './campaign.js?v=0.29.0';
import {createQAStorage,isQAMemoryStorage} from './qa-storage.js';
import {createOwnedCleanupTracker} from './qa-owned-cleanup-tracker.js';

const KEY='boss-02-final',PROFILE='boss02-fold-v1',MAX_TICKS=720,MAX_FRAMES=2048;
const OWN=Object.getOwnPropertyDescriptor,APPLY=Reflect.apply;
const need=(value,message)=>{if(!value)throw Error('boss02-fight-'+message);};
const text=error=>{try{return String(error?.message??error).slice(0,220);}catch{return'failed';}};
const copy=value=>JSON.parse(JSON.stringify(value));
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function sameDescriptor(a,b){return !a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));}
function modeAt(location,query){try{return location?.protocol==='http:'&&['localhost','127.0.0.1','[::1]','::1'].includes(location.hostname)&&location.port==='8851'&&query.get('qa')==='1'&&query.has('qa-memory')&&['original','fold'].includes(query.get('qa-boss02-fight'))?query.get('qa-boss02-fight'):null;}catch{return null;}}
export function allowBoss02FightQA(location,query,storage){return !!modeAt(location,query)&&isQAMemoryStorage(storage);}

// Original-world corridor search from boss-hit-motion, with declared520 spacing.
function clearPositions(game,radius){
 const distance=520;
 for(let y=180;y<game.world.height-180;y+=70)for(let x=180;x<game.world.width-180;x+=70)for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const bx=x+Math.cos(angle)*distance,by=y+Math.sin(angle)*distance;
  if(game.blocked(x,y,game.player.r+2)||game.blocked(bx,by,radius+3))continue;
  let clear=true;for(let n=0;n<=18;n++)if(game.blocked(x+(bx-x)*n/18,y+(by-y)*n/18,radius+3)){clear=false;break;}
  if(clear)return{player:{x,y},boss:{x:bx,y:by},distance};
 }
 throw Error('boss02-fight-original-clear-corridor-unavailable');
}
export function createBoss02FightFixture(GameClass=OriginalGame){
 const game=new GameClass({seed:774,missionId:'mission-02',weapon:'nailgun'}),catalog=getBoss(KEY);
 const initialEnemies=game.enemies.length,spawnClock=game.spawnClock,playerBefore={hp:game.player.hp,maxHp:game.player.maxHp,invul:game.player.invul},positions=clearPositions(game,catalog.stats.r);
 Object.assign(game.player,positions.player);game.midBossSpawned=true;game.midBossDefeated=true;game.defeatedBossIds=[game.mission.midBoss];
 const boss=game.spawnMissionBoss('final');need(boss?.bossKey===KEY,'normal-final-spawn-required');Object.assign(boss,positions.boss);boss.angle=Math.atan2(game.player.y-boss.y,game.player.x-boss.x);
 need(game.spawnClock===spawnClock&&game.enemies.length===initialEnemies+1,'normal-roster-spawn-clock-required');
 need(!game.blocked(boss.x,boss.y,boss.r+2)&&!game.blocked(game.player.x,game.player.y,game.player.r+2),'unblocked-fixture-required');
 const snapshot=game.snapshot();need(snapshot,'valid-final-checkpoint-required');
 return{game,boss,catalog,snapshot,proof:{seed:774,missionId:'mission-02',weapon:'nailgun',initialEnemies,spawnClock,stageDuration:game.stageDuration,playerBefore,bossInitialSkillCd:boss.skillCd,positions,note:'Explicit own-QA final-entry checkpoint only: mid-boss flags/defeated id bootstrap and validated clear positions. Normal constructor HP, invulnerability, damage, ammunition, original roster/world/spawning, stage duration and AI are preserved. No story-completion claim; no forced skill cooldown/attack state or enemy removal.'}};
}
function primitive(value){return Object.fromEntries(Object.entries(value??{}).filter(([,v])=>v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)));}
function sourceSnapshot(model){
 const meshes=[],arrays=[];model.root.traverse(object=>{if(!object.geometry)return;const g=object.geometry,materials=Array.isArray(object.material)?object.material:[object.material];meshes.push({object,g,material:object.material,materials:materials.map(m=>({m,map:m.map,alphaMap:m.alphaMap,source:m.map?.source,image:m.map?.image}))});for(const a of [...Object.values(g.attributes),...(g.index?[g.index]:[])])if(a.array){const view=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength);arrays.push({a,array:a.array,buffer:a.array.buffer,offset:a.array.byteOffset,bytes:view.slice()});}});return{model,meshes,arrays};
}
function sourceEqual(before){let bytes=0;for(const m of before.meshes){need(m.object.geometry===m.g&&m.object.material===m.material,'original-geometry-material-changed');for(const t of m.materials)need(t.m.map===t.map&&t.m.alphaMap===t.alphaMap&&t.map?.source===t.source&&t.map?.image===t.image,'original-map-source-changed');}for(const a of before.arrays){need(a.a.array===a.array&&a.array.buffer===a.buffer&&a.array.byteOffset===a.offset&&a.array.byteLength===a.bytes.length,'original-array-identity-changed');const view=new Uint8Array(a.buffer,a.offset,a.bytes.length);need(view.every((v,i)=>v===a.bytes[i]),'original-geometry-uv-skin-bytes-changed');bytes+=view.length;}return{unchanged:true,bytesCompared:bytes,meshes:before.meshes.length};}

// One fresh owned page/run. Explicit testDeps produce injected:true evidence.
export function createBoss02FightRun(options={}){
 const location=options.location??globalThis.location,query=options.query??new URLSearchParams(location?.search??''),mode=modeAt(location,query);if(!mode)return null;
 const storage=options.storage??createQAStorage(query,()=>{throw Error('boss02-fight-persistent-storage-forbidden');});if(!isQAMemoryStorage(storage))return null;
 const {document=globalThis.document,canvas,signal,input=()=>({}),onProgress=()=>{},onCapture=()=>{},onStopping=()=>{},testDeps}=options;
 const deps={Game:OriginalGame,Renderer:OriginalRenderer,ProductionArt:OriginalArt,LiveBossRig:OriginalRig,Cache,manifest:productionManifest,productionLaunchPlan,preloadLaunchPlan,ActorInterpolation,advanceSimulation,createOwnedCleanupTracker,requestFrame:globalThis.requestAnimationFrame?.bind(globalThis),cancelFrame:globalThis.cancelAnimationFrame?.bind(globalThis),now:()=>performance.now(),setTimer:globalThis.setTimeout.bind(globalThis),clearTimer:globalThis.clearTimeout.bind(globalThis),...testDeps};
 let used=false,closing=false,requestedStop=null,controller=null,raf=null,realTimer=null,resolveLoop=null,rejectWait=null,renderer=null,art=null,game=null,boss=null,ownedBoss=null,interpolation=null,tracker=null,finalReport=null,job=null,source=null,frameUndo=null,tickUndo=null,flagBefore=null,flagExpected=null,lastNative=null,previousNative=null,verifiedProfile=null;
 const rigs=new Set(),surfaces=new Set(),followed=new Set(),settled=new WeakSet(),disposed=new WeakSet(),contexts=new WeakSet(),loadTimers=new Set();
 const report={available:true,complete:false,mode,injected:testDeps!==undefined,status:'idle',reason:null,fixture:null,initialSnapshot:null,finalSnapshot:null,ticks:[],events:[],frames:[],captures:[],sourceBeforeAfter:null,preparation:{timeoutMs:60000,complete:false,elapsedMs:null},limits:{gameSeconds:12,ticks:MAX_TICKS,realMilliseconds:300000,frameRecords:MAX_FRAMES,cleanupMilliseconds:15000},cleanup:{complete:false,errors:[],drain:null,trackerFinal:null,modelsRemaining:null,pendingRemaining:null,recordsRemaining:null,surfacesRemaining:null,contexts:0,methodsRestored:false,flagRestored:false,unprovenPlayerParallelLoads:false,uncancelableAsphaltPending:false,resourcesReleased:false,sharedEffectImagesRetained:true},evidence:null,note:'QA-only actual normal mission02 final-entry fight on a fresh owned Renderer. Original art, full world/effects,60Hz advanceSimulation and interpolation are used; shooting and movement are explicit manual inputs. The normal boss cooldown and damage clock are never accelerated. RenderActor may be an interpolation copy; the observed rig state/75ms transition belongs to that exact actor. Derived saved-countdown progress is not an exposed continuous sampler clock. Tick traces/events/snapshots/both RNG are evidence, not cross-pass equality when manual input or rAF schedules differ. No FPS, natural-motion certification, audio-output, peak-memory or product-default claim. UI PNG copies remain after owned worker canvases are retired. Shared fire/explosion module images are awaited but never disposed by this job. Already-started native loads cannot be cancelled; failed partial player sibling loads/asphalt are explicitly unproven. One run per fresh page; no persistent storage read/write.'};
 const err=(where,error)=>{if(report.cleanup.errors.length<48)report.cleanup.errors.push({where,error:text(error)});};
 const attempt=(where,fn)=>{try{return fn();}catch(error){err(where,error);}};
 const clock=()=>{const value=deps.now();need(Number.isFinite(value),'finite-clock-required');return value;};
 const check=()=>{need(!closing&&!controller?.signal.aborted&&!signal?.aborted,'cancelled');};
 function stopFrames(){if(raf!==null){deps.cancelFrame(raf);raf=null;}if(realTimer!==null){deps.clearTimer(realTimer);realTimer=null;}}
 function finish(reason){stopFrames();const resolve=resolveLoop;resolveLoop=null;resolve?.(reason);}
 function stop(reason='manual-stop'){requestedStop=reason;stopFrames();controller?.abort();rejectWait?.(Error('boss02-fight-'+reason));finish(reason);return snapshot();}
 function snapshot(){return finalReport??freeze({available:true,mode,used,running:used&&!closing,status:report.status,ticks:report.ticks.length,frames:report.frames.length,reason:requestedStop});}
 function follow(promise,kind,key){
  if(!promise||typeof promise.then!=='function'||followed.has(promise))return;followed.add(promise);
  const retire=(value,fulfilled)=>{settled.add(promise);if(kind==='rig'&&fulfilled&&value)rigs.add(value);discover();if(closing)retireOwned();};
  let accepted=false;try{accepted=tracker.follow(promise,{arm:mode,kind,key:String(key)},retire);}catch(error){err('follow',error);}
  if(!accepted){err('follow',Error('registration-or-capacity'));Promise.resolve(promise).then(value=>{attempt('late-untracked',()=>retire(value,true));},()=>{attempt('late-untracked',()=>retire(undefined,false));});}
 }
 function discover(){
  for(const key of ['liveBoss','liveEnemies','livePlayer'])if(renderer?.[key])rigs.add(renderer[key]);
  for(const key of ['liveBossPromise','liveEnemiesPromise','livePlayerPromise'])follow(renderer?.[key],'rig',key);
  for(const[id,record]of art?.records??[])for(const key of ['promise','bodyAlphaPromise'])follow(record[key],'atlas',id+':'+key);
  for(const rig of rigs){follow(rig.registry,'registry','registry');if(rig.pending instanceof Map){for(const[key,p]of rig.pending)follow(p,'model',key);}else follow(rig.pending,'player','models');follow(rig.bottlePromise,'player','bottle');for(const[key,p]of rig.weaponLoads??[])follow(p,'player','weapon:'+key);}
 }
 function retainSurface(surface){if(surface&&typeof surface.getContext==='function')surfaces.add(surface);}
 function collectSurfaces(){
  retainSurface(canvas);for(const key of ['floor','minimapCanvas','nativeMaskCanvas'])retainSurface(renderer?.[key]);
  for(const rig of rigs){for(const key of ['raw','ink','gpuRaw','canvas','body','bottleCanvas'])retainSurface(rig[key]);retainSurface(rig.batchInk?.image);retainSurface(rig.renderer?.domElement);for(const slot of rig.framePool?.slots??[])for(const key of ['image','canvas','body'])retainSurface(slot[key]);}
  for(const value of renderer?.completedEnemyFrames?.entries?.values?.()??[]){need(value.selected?.completedNativeDeath===true&&value.selected?.metadata?.liveRig===true,'owned-completed-copy-required');retainSurface(value.selected.image);}
  for(const cache of [renderer?.fireGround?.cache,renderer?.fireGround?.burns])for(const value of cache?.values?.()??[])for(const key of ['image','scorch','light'])retainSurface(value?.[key]);
 }
 function disposeOnce(value,where,fn){if(!value||typeof value!=='object'||disposed.has(value))return;disposed.add(value);attempt(where,fn);}
 function retireRoot(root){if(!root?.traverse)return;root.traverse(object=>{disposeOnce(object.geometry,'geometry',()=>object.geometry.dispose?.());disposeOnce(object.skeleton,'skeleton',()=>object.skeleton.dispose?.());for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){for(const texture of Object.values(material).filter(value=>value?.isTexture)){disposeOnce(texture,'texture',()=>texture.dispose?.());const image=texture.source?.data;disposeOnce(image,'bitmap',()=>image.close?.());}disposeOnce(material,'material',()=>material.dispose?.());}});}
 function retireOwned(){
  discover();attempt('collect-surfaces',collectSurfaces);
  for(const rig of rigs){
   if(rig===renderer?.livePlayer&&rig.ready!==true&&rig.pending&&rig.models?.size!==2)report.cleanup.unprovenPlayerParallelLoads=true;
   for(const[key,model]of rig.models??[]){attempt('model',()=>{retireRoot(model.root);if(model.subject!==model.root)retireRoot(model.subject);});rig.models.delete(key);}
   for(const[key,weapon]of rig.weapons??[]){attempt('weapon',()=>retireRoot(weapon.root));rig.weapons.delete(key);}attempt('bottle',()=>retireRoot(rig.bottle));rig.bottle=null;
   for(const[key,p]of rig.pending instanceof Map?rig.pending:[])if(settled.has(p))rig.pending.delete(key);
   for(const[key,p]of rig.weaponLoads??[])if(settled.has(p))rig.weaponLoads.delete(key);
   if(rig.pending&&!(rig.pending instanceof Map)&&settled.has(rig.pending))rig.pending=null;
   if(rig.bottlePromise&&settled.has(rig.bottlePromise))rig.bottlePromise=null;
   disposeOnce(rig.gpuAlphaBounds,'rig-alpha',()=>rig.gpuAlphaBounds.dispose?.());
   disposeOnce(rig.alphaReadback,'rig-alpha-readback',()=>{try{rig.alphaReadback.dispose?.();}finally{for(const key of ['bottom','top','view','rows'])rig.alphaReadback[key]=null;rig.alphaReadback.capacity=0;}});
   disposeOnce(rig.batchInk,'rig-batch-ink',()=>rig.batchInk.release?.());
   if(!contexts.has(rig)){contexts.add(rig);report.cleanup.contexts++;attempt('renderer.dispose',()=>rig.renderer?.dispose?.());attempt('renderer.forceContextLoss',()=>rig.renderer?.forceContextLoss?.());}
   for(const slot of rig.framePool?.slots??[]){slot.owner=null;}if(rig.framePool)rig.framePool.slots.length=0;attempt('scene.clear',()=>rig.scene?.clear?.());rig.last=null;
  }
  if(renderer?.textureStatus==='loading')report.cleanup.uncancelableAsphaltPending=true;
  if(renderer?.asphaltImage){renderer.asphaltImage.onload=null;renderer.asphaltImage.onerror=null;renderer.asphaltImage=null;}
  if(art){attempt('art.release',()=>art.releaseUnusedAssets([]));art.onChange=null;}
  if(renderer){renderer.completedEnemyFrames?.entries?.clear?.();renderer.liveEnemySelection?.clear?.();renderer.liveCorpseSelection?.clear?.();renderer.floorWorld=null;renderer.onProductionChange=null;for(const cache of [renderer.fireGround?.cache,renderer.fireGround?.burns])cache?.clear?.();if(renderer.fireGround)renderer.fireGround.world=null;}
  for(const surface of surfaces)attempt('surface',()=>{surface.width=0;surface.height=0;});
 }
 function waitLoad(promise,label){
  follow(promise,'load',label);
  return new Promise((resolve,reject)=>{let done=false;const finish=(callback,value)=>{if(done)return;done=true;deps.clearTimer(timer);loadTimers.delete(timer);rejectWait=null;callback(value);};const timer=deps.setTimer(()=>finish(reject,Error('boss02-fight-load-timeout')),60000);loadTimers.add(timer);rejectWait=error=>finish(reject,error);Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,error));});
 }
 function restoreMethods(){
  let okay=true;for(const entry of [tickUndo,frameUndo])if(entry)attempt('method.restore',()=>{if(!sameDescriptor(OWN(entry.owner,entry.key),entry.expected)){okay=false;throw Error('foreign-method-preserved');}if(entry.before)Object.defineProperty(entry.owner,entry.key,entry.before);else delete entry.owner[entry.key];});report.cleanup.methodsRestored=okay;tickUndo=frameUndo=null;
  if(ownedBoss&&flagBefore)attempt('flag.restore',()=>{need(sameDescriptor(OWN(ownedBoss,'bossActionLayerEnabled'),flagExpected),'foreign-flag-preserved');Object.defineProperty(ownedBoss,'bossActionLayerEnabled',flagBefore);report.cleanup.flagRestored=true;});else report.cleanup.flagRestored=true;
 }
 function wrap(owner,key,fn){const before=OWN(owner,key),original=owner[key];need(typeof original==='function'&&(!before||Object.hasOwn(before,'value')),'data-method-required');const wrapper=fn(original),expected={configurable:true,writable:true,enumerable:before?.enumerable??false,value:wrapper};Object.defineProperty(owner,key,expected);return{owner,key,before,expected:OWN(owner,key)};}
 function observeBossFrame(original){return function(...args){
  if(this!==ownedBoss||args[0]!==KEY)return APPLY(original,this,args);
  const before=this.renderer.info.render.frame,result=APPLY(original,this,args);
  if(this===ownedBoss&&args[0]===KEY){const actor=args[1],model=this.models.get(KEY),state=model?.states.get(actor),d=primitive(this.diagnostics),clip=d.clip,progress=actor.attackState==='windup'?1-actor.attackTime/getBoss(KEY).skill.windup:actor.attackState==='recover'?1-actor.attackTime/getBoss(KEY).skill.recovery:null;
   const record={renderActorId:actor.id??null,time:args[2],attackState:actor.attackState,attackTime:actor.attackTime,hitFlash:actor.hitFlash??0,savedCountdownProgress:progress,diagnostic:d,stateKey:state?.key??null,transition:state?.transition?{start:state.transition.start,duration:state.transition.duration,elapsed:Math.max(0,args[2]-state.transition.start)}:null,previousRendered:previousNative,nativeGLSubmissions:this.renderer.info.render.frame-before,private512:result?.metadata?.liveRig===true&&result.image?.width===512&&result.image?.height===512};
   previousNative={time:args[2],clip,savedCountdownProgress:progress};lastNative={actor,selected:result,record};retainSurface(result?.image);
  }return result;
 };}
 function renderFrame(now,callback,events){
  const view=interpolation.sample(game,callback.accumulator/FIXED_STEP,FIXED_STEP);lastNative=null;const before=copy({snapshot:game.snapshot(),random:game.random.getState(),visualRandom:game.visualRandom.getState(),events:game.events});renderer.render(view,callback.command,now/1000);
  need(JSON.stringify(before)===JSON.stringify({snapshot:game.snapshot(),random:game.random.getState(),visualRandom:game.visualRandom.getState(),events:game.events}),'render-mutated-game');
  const native=lastNative?.record??null;if(native){native.drawnNative=renderer.nativeActorFrames.get(lastNative.actor)===lastNative.selected;need(native.private512&&native.drawnNative&&native.diagnostic.key===KEY&&native.diagnostic.bossActionsEnabled===(mode==='fold'),'actual-native-boss-profile-required');need(Number.isFinite(native.diagnostic.bossActionsMaxRadians)&&native.diagnostic.bossActionsMaxRadians<=40*Math.PI/180,'forty-degree-cap-required');}
  collectSurfaces();const frame={index:report.frames.length,rafTimestamp:now,time:game.time,delta:callback.delta,accumulator:callback.accumulator,tickStart:callback.tickStart,tickEnd:report.ticks.length,state:game.state,playerHp:game.player.hp,bossHp:boss.hp,attackState:boss.attackState,attackTime:boss.attackTime,skillCd:boss.skillCd,bossHazards:game.bossHazards.filter(value=>value.ownerId===boss.id).map(primitive),native,events};report.frames.push(frame);need(report.frames.length<=MAX_FRAMES,'frame-record-limit');
  onProgress({state:game.state,time:game.time,playerHp:game.player.hp,bossHp:boss.hp,attackState:boss.attackState,frames:report.frames.length,native:!!native});
  const capture=events.find(event=>['bosswarn','bossskill'].includes(event.type)&&event.bossKey===KEY);if(capture&&!report.captures.some(value=>value.label===capture.type))captureImage(capture.type,frame);
 }
 function captureImage(label,frame){if(report.captures.length>=3)return;const src=canvas.toDataURL('image/png');onCapture({src,alt:'boss02 '+mode+' · '+label+' · '+game.time.toFixed(3)+'s',label,time:game.time});report.captures.push({label,time:game.time,frame:frame?.index??report.frames.length-1,tick:report.ticks.length,source:'original-whole-canvas-PNG'});}
 async function start(){
  if(used)return null;used=true;controller=new AbortController();tracker=deps.createOwnedCleanupTracker({timeoutMs:15000,maxEntries:256});report.status='loading';const hide=()=>stop('pagehide'),external=()=>stop('aborted');options.eventTarget?.addEventListener?.('pagehide',hide,{once:true});signal?.addEventListener?.('abort',external,{once:true});
  let failure=null,startWall=null;
  try{
   need(!signal?.aborted&&deps.Cache.enabled===false,'uncached-owned-assets-required');need(canvas&&document&&typeof deps.requestFrame==='function'&&typeof deps.cancelFrame==='function','owned-page-runtime-required');
   const fixture=createBoss02FightFixture(deps.Game);({game,boss}=fixture);report.fixture=fixture.proof;report.initialSnapshot=fixture.snapshot;
   art=new deps.ProductionArt({manifest:deps.manifest,onChange:null});renderer=new deps.Renderer(canvas,{productionManifest:deps.manifest,productionArt:art,onProductionChange:null});interpolation=new deps.ActorInterpolation();
   need(!renderer.liveBoss&&!renderer.liveBossPromise,'fresh-renderer-required');ownedBoss=new deps.LiveBossRig(mode==='fold'?{size:512,bossActionProfile:PROFILE}:{size:512});rigs.add(ownedBoss);renderer.liveBoss=ownedBoss;renderer.liveBossPromise=Promise.resolve(ownedBoss);flagBefore=OWN(ownedBoss,'bossActionLayerEnabled');need(flagBefore&&Object.hasOwn(flagBefore,'value')&&flagBefore.value===false,'default-off-required');ownedBoss.bossActionLayerEnabled=mode==='fold';flagExpected=OWN(ownedBoss,'bossActionLayerEnabled');
   discover();const plan=deps.productionLaunchPlan({manifest:art.manifest,weapon:game.player.weapon,mission:game.mission,world:game.world}),prepareStart=clock();
   const loading=(async()=>{need(await deps.preloadLaunchPlan(renderer,plan,{signal:controller.signal})===true,'original-launch-assets-required');discover();for(const effect of [renderer.fireArt,renderer.explosionArt])if(effect?.load){const p=effect.load();follow(p,'shared-effect','existing-load');await p;}while(renderer.textureStatus==='loading'){check();await new Promise((resolve,reject)=>{let done=false;const finish=(callback,value)=>{if(done)return;done=true;deps.clearTimer(timer);loadTimers.delete(timer);controller.signal.removeEventListener('abort',abort);callback(value);},abort=()=>finish(reject,Error('boss02-fight-cancelled')),timer=deps.setTimer(()=>finish(resolve),20);loadTimers.add(timer);controller.signal.addEventListener('abort',abort,{once:true});if(controller.signal.aborted)abort();});}need(renderer.textureStatus==='ready'&&renderer.asphaltImage,'original-asphalt-required');return true;})();
   await waitLoad(loading,'whole-preparation');check();discover();report.preparation.elapsedMs=clock()-prepareStart;report.preparation.complete=true;need(ownedBoss.models.has(KEY)&&ownedBoss.size===512&&!ownedBoss.error&&!ownedBoss.lost,'loaded-original-boss-required');if(mode==='fold')need(ownedBoss.models.get(KEY).actionLayer?.profile===PROFILE,'actual-fold-profile-required');
   if(mode==='fold')verifiedProfile=ownedBoss.models.get(KEY).actionLayer.profile;source=sourceSnapshot(ownedBoss.models.get(KEY));frameUndo=wrap(ownedBoss,'frame',observeBossFrame);
   tickUndo=wrap(game,'tick',original=>function(dt,command){const eventStart=this.events.length,result=APPLY(original,this,[dt,command]);report.ticks.push({index:report.ticks.length,dt,command:copy(command),time:this.time,state:this.state,playerHp:this.player.hp,bossHp:boss.hp,attackState:boss.attackState,attackTime:boss.attackTime,eventStart,eventEnd:this.events.length,emittedEvents:copy(this.events.slice(eventStart)),random:this.random.getState(),visualRandom:this.visualRandom.getState()});need(report.ticks.length<=MAX_TICKS,'tick-record-limit');return result;});
   report.status='playing';startWall=clock();let last=null,accumulator=0;
   report.reason=await new Promise(resolve=>{resolveLoop=resolve;realTimer=deps.setTimer(()=>finish('real-limit'),300000);const frame=now=>{raf=null;try{check();const delta=last===null?0:Math.min(.05,Math.max(0,(now-last)/1000));last=now;const tickStart=report.ticks.length,command={moveX:0,moveY:0,...input(),aimX:boss.x,aimY:boss.y,fireMode:'manual'};accumulator=Math.min(accumulator+delta,(MAX_TICKS-report.ticks.length)*FIXED_STEP);const advanced=deps.advanceSimulation(game,command,accumulator,{interpolator:interpolation});accumulator=advanced.accumulator;const events=game.drainEvents().map(event=>({...copy(event),observedTime:game.time,observedAfterTick:report.ticks.length}));report.events.push(...events);renderFrame(now,{delta,accumulator,tickStart,command:advanced.command},events);discover();if(!resolveLoop||controller.signal.aborted||requestedStop){finish(requestedStop??'aborted');return;}if(game.state!=='playing')finish('normal-'+game.state);else if(report.ticks.length>=MAX_TICKS)finish('game-limit');else raf=deps.requestFrame(frame);}catch(error){failure=error;finish(requestedStop??'error');}};raf=deps.requestFrame(frame);});
   report.elapsedRealMs=clock()-startWall;report.finalSnapshot=game.snapshot();report.final={state:game.state,time:game.time,playerHp:game.player.hp,bossHp:boss.hp,ammo:game.player.ammo,random:game.random.getState(),visualRandom:game.visualRandom.getState()};if(report.frames.length)captureImage('final',report.frames.at(-1));report.sourceBeforeAfter=sourceEqual(source);if(failure)throw failure;
  }catch(error){failure=error;report.reason=requestedStop??'error';report.error=text(error);}
  finally{
   stopFrames();attempt('input.detach',onStopping);closing=true;report.status='cleaning';controller.abort();signal?.removeEventListener?.('abort',external);options.eventTarget?.removeEventListener?.('pagehide',hide);for(const timer of loadTimers)deps.clearTimer(timer);loadTimers.clear();
   if(game&&!report.final)attempt('final-game-proof',()=>{report.finalSnapshot=game.snapshot();report.final={state:game.state,time:game.time,playerHp:game.player.hp,bossHp:boss.hp,ammo:game.player.ammo,random:game.random.getState(),visualRandom:game.visualRandom.getState()};});
   if(source)attempt('source-check',()=>{report.sourceBeforeAfter=sourceEqual(source);});restoreMethods();attempt('owned-retire',retireOwned);
   try{report.cleanup.drain=await tracker.wait();}catch(error){err('drain',error);}attempt('final-retire',retireOwned);report.cleanup.trackerFinal=tracker.snapshot();
   report.cleanup.modelsRemaining=[...rigs].reduce((sum,rig)=>sum+(rig.models?.size??0)+(rig.weapons?.size??0),0);report.cleanup.pendingRemaining=[...rigs].reduce((sum,rig)=>sum+(rig.pending instanceof Map?rig.pending.size:rig.pending?1:0)+(rig.weaponLoads?.size??0)+(rig.bottlePromise?1:0),0);report.cleanup.recordsRemaining=art?.records?.size??0;report.cleanup.surfacesRemaining=[...surfaces].filter(surface=>surface.width!==0||surface.height!==0).length;
   report.cleanup.rawAlphaBytes=[...rigs].reduce((sum,rig)=>sum+(rig.gpuAlphaBounds?.rawBytes??0),0);report.cleanup.alphaReadbackBytes=[...rigs].reduce((sum,rig)=>sum+(rig.alphaReadback?.capacity??0),0);report.cleanup.batchInkBytes=[...rigs].reduce((sum,rig)=>sum+(rig.batchInk?.rawBytes??0),0);report.cleanup.framePoolSlotsRemaining=[...rigs].reduce((sum,rig)=>sum+(rig.framePool?.slots?.length??0),0);
   const d=report.cleanup.drain,t=report.cleanup.trackerFinal;report.cleanup.complete=report.cleanup.errors.length===0&&d?.success===true&&t?.success===true&&d.scheduled===t.scheduled&&d.completed===t.completed&&report.cleanup.modelsRemaining===0&&report.cleanup.pendingRemaining===0&&report.cleanup.recordsRemaining===0&&report.cleanup.surfacesRemaining===0&&report.cleanup.methodsRestored&&report.cleanup.flagRestored&&!report.cleanup.unprovenPlayerParallelLoads&&!report.cleanup.uncancelableAsphaltPending&&report.cleanup.rawAlphaBytes===0&&report.cleanup.alphaReadbackBytes===0&&report.cleanup.batchInkBytes===0&&report.cleanup.framePoolSlotsRemaining===0;
   const events=report.events.filter(e=>e.bossKey===KEY),native=report.frames.filter(frame=>frame.native);report.evidence={bossWarnings:events.filter(e=>e.type==='bosswarn').length,bossSkills:events.filter(e=>e.type==='bossskill').length,hurtEvents:report.events.filter(e=>e.type==='hurt').length,hitEvents:report.events.filter(e=>e.type==='hit').length,nativeFrames:native.length,nativeGLSubmissions:native.reduce((sum,frame)=>sum+frame.native.nativeGLSubmissions,0),recoverObserved:report.frames.some(frame=>frame.attackState==='recover'),actualProfile:verifiedProfile,normalTerminal:report.reason?.startsWith('normal-')===true};
   const firstSkill=report.frames.find(frame=>frame.events.some(event=>event.type==='bossskill'&&event.bossKey===KEY));
   report.evidence.nativeWindupFrames=native.filter(frame=>frame.native.diagnostic.clip==='windup').length;report.evidence.nativeAttackFrames=native.filter(frame=>frame.native.diagnostic.clip==='attack').length;
   report.evidence.firstSkillNativeAttack=!!firstSkill?.native?.private512&&firstSkill.native.drawnNative&&firstSkill.native.diagnostic.clip==='attack';
   report.complete=!failure&&report.cleanup.complete&&(game?.time??0)>=8&&report.evidence.bossWarnings>0&&report.evidence.bossSkills>0&&report.evidence.recoverObserved&&report.evidence.nativeWindupFrames>0&&report.evidence.nativeAttackFrames>0&&report.evidence.firstSkillNativeAttack;report.status=report.complete?'observed':'incomplete';
   if(report.cleanup.complete){renderer=null;art=null;game=null;boss=null;ownedBoss=null;source=null;interpolation=null;lastNative=null;previousNative=null;rigs.clear();surfaces.clear();followed.clear();report.cleanup.resourcesReleased=true;}
   finalReport=freeze(copy(report));
  }
  return{report:finalReport};
 }
 return{start(){if(used)return job;job=start();return job;},stop,snapshot};
}

export function installBoss02FightQA(options={}){
 const location=options.location??globalThis.location,query=options.query??new URLSearchParams(location?.search??''),mode=modeAt(location,query);if(!mode)return null;
 const storage=options.storage??createQAStorage(query,()=>{throw Error('boss02-fight-persistent-storage-forbidden');});if(!isQAMemoryStorage(storage))return null;
 const document=options.document??globalThis.document,eventTarget=options.eventTarget??globalThis;
 const canvas=document.getElementById('boss02-fight-canvas'),start=document.getElementById('boss02-fight-start'),stop=document.getElementById('boss02-fight-stop'),shoot=document.getElementById('boss02-fight-shoot'),status=document.getElementById('boss02-fight-status'),output=document.getElementById('boss02-fight-report'),proof=document.getElementById('boss02-fight-proof');need([canvas,start,stop,shoot,status,output,proof].every(Boolean),'page-elements-required');
 const keys=new Set(),listeners=[];let firing=false,running=false;
 const listen=(owner,event,fn)=>{owner.addEventListener(event,fn);listeners.push(()=>owner.removeEventListener(event,fn));};
 const command=()=>({moveX:Number(keys.has('d')||keys.has('ArrowRight'))-Number(keys.has('a')||keys.has('ArrowLeft')),moveY:Number(keys.has('s')||keys.has('ArrowDown'))-Number(keys.has('w')||keys.has('ArrowUp')),shoot:firing});
 const detach=()=>{running=false;keys.clear();firing=false;shoot.disabled=true;stop.disabled=true;for(const undo of listeners.splice(0))undo();};
 const run=createBoss02FightRun({...options,document,location,query,storage,canvas,eventTarget,input:command,onStopping:detach,onProgress:info=>{running=true;shoot.disabled=false;status.textContent=(mode==='fold'?'B fold':'A original')+' · '+info.time.toFixed(2)+'초 · '+info.attackState+' · 체력 '+info.playerHp+' · 사격 '+(firing?'켜짐':'꺼짐');},onCapture:info=>{const image=document.createElement('img');image.src=info.src;image.alt=info.alt;image.style.maxWidth='100%';proof.append(image);}});
 listen(eventTarget,'keydown',event=>{if(!running)return;const key=event.key?.length===1?event.key.toLowerCase():event.key;if(['w','a','s','d','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){keys.add(key);event.preventDefault?.();}});listen(eventTarget,'keyup',event=>keys.delete(event.key?.length===1?event.key.toLowerCase():event.key));listen(eventTarget,'blur',()=>{keys.clear();firing=false;});
 for(const button of document.querySelectorAll('[data-fight-move]')){listen(button,'pointerdown',event=>{if(!running)return;event.preventDefault?.();keys.add(button.dataset.fightMove);button.setPointerCapture?.(event.pointerId);});for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(button,name,()=>keys.delete(button.dataset.fightMove));}
 listen(shoot,'click',()=>{if(running){firing=!firing;shoot.textContent=firing?'사격 끄기':'사격 켜기';}});listen(stop,'click',()=>{detach();run.stop();});listen(eventTarget,'pagehide',()=>{detach();run.stop('pagehide');});
 listen(start,'click',async()=>{if(start.disabled)return;start.disabled=true;stop.disabled=false;status.textContent='별도 소유 원본 에셋 준비 · 최대60초';try{const result=await run.start();output.textContent=JSON.stringify(result.report,null,2);status.textContent=result.report.complete?'정상 경고·공격·회복 관찰과 소유 정리 완료 · 제품 채택 아님':'관찰 미완료 · 원시 기록/종료 이유/정리를 확인하세요.';}catch(error){output.textContent=JSON.stringify({complete:false,error:text(error)},null,2);status.textContent='QA 오류 · 기록 확인';}finally{detach();}});
 status.textContent=(mode==='fold'?'B boss02-fold-v1':'A original · layer OFF')+' · 한 번만 시작 · WASD/방향키 이동 · 초기 무사격 · 정상 보스 타이머 유지';
 return{start,stop,shoot,snapshot:run.snapshot,dispose(){detach();return run.stop('disposed');}};
}
