import {Game} from './engine.js?v=0.29.0';
import {ProductionArt} from './production-art.js?v=0.29.0';
import {ActorInterpolation} from './actor-interpolation.js';
import {advanceSimulation,FIXED_STEP} from './simulation.js?v=0.29.0';
import {isQAMemoryStorage,createQAStorage} from './qa-storage.js';
import {loadProfile} from './storage.js?v=0.29.0';
import {seedAppLoopQA} from './qa-app-loop.js';
import {prepareNativeEnemyLaunch} from './boss-rig/native-launch-preparation.js';
import {prepareOriginalImageDecode} from './qa-image-decode-preparation.js';
import {createFrameCostProfile} from './qa-frame-cost-profile.js';
import {createNativeFrameProfile} from './qa-native-frame-profile.js';

const active=new WeakSet(),keys=['productionArt','liveEnemies','liveEnemiesPromise','liveEnemiesLoading'];
const walkerIDs=Object.freeze(['enemy-walker-locomotion-hq32','enemy-walker-rig-motion']);
const observerSHA='3b2f3774d703f84952c501f85b001d169e6fbbda024d407478bd989539026cce';
const objectLike=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const sameDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
const sameOwn=(object,saved)=>{const now=Object.getOwnPropertyDescriptors(object);return Reflect.ownKeys(now).length===Reflect.ownKeys(saved).length&&Reflect.ownKeys(saved).every(key=>sameDescriptor(now[key],saved[key]));};
const serialize=value=>JSON.stringify(value);
const state=game=>{const snapshot=game.snapshot();if(!snapshot)throw Error('image-decode-valid-checkpoint-required');return serialize({snapshot,events:game.events,particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash,random:game.random.getState(),visualRandom:game.visualRandom.getState()});};
const motion=game=>serialize(game.enemies.map(e=>[e.id,e.x,e.y,e.vx,e.vy,e.angle,e.walkPhase,e.navX,e.navY,e.navTime,e.navTarget===game.player?'player':e.navTarget===game.lure?'lure':null,e.navTargetX,e.navTargetY]));
const summary=values=>{values=values.filter(Number.isFinite);const sorted=[...values].sort((a,b)=>a-b);return{medianMs:sorted[Math.floor(sorted.length*.5)]??0,p95Ms:sorted[Math.floor(sorted.length*.95)]??0,maxMs:Math.max(0,...values),sumMs:values.reduce((sum,n)=>sum+n,0)};};
const difference=(a,b)=>{if(a.length!==b.length)return{different:Math.max(a.length,b.length),maxDelta:255};let different=0,maxDelta=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)different++;maxDelta=Math.max(maxDelta,d);}return{different,maxDelta};};
const errorText=error=>{try{return typeof error?.message==='string'?error.message:'image-decode-qa-failed';}catch{return'image-decode-qa-failed';}};

export function allowImageDecodeCombat(location,query,storage){return location?.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&location.port==='8851'&&query?.has('qa')&&query.has('qa-memory')&&isQAMemoryStorage(storage);}

// All image reads and image exports happen after an arm's forty renders. No
// prime/quality draw occurs before measured frame zero. This does not isolate
// the browser's shared URL decode cache or reproduce the product's rAF cadence.
export async function compareImageDecodeCombat(renderer,canvas,{location=globalThis.location,query=new URLSearchParams(location?.search??''),storage,signal,beforeScenario=async()=>{},onProgress=()=>{},onImage=()=>{}}={}){
 if(!allowImageDecodeCombat(location,query,storage))throw Error('image-decode-memory-origin-required');
 if(!objectLike(renderer)||active.has(renderer))throw Error('image-decode-already-active');
 if(signal?.aborted)throw Error('image-decode-aborted');
 const saved=new Map(),expected=new Map();for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(renderer,key);if(descriptor&&!('value'in descriptor))throw Error('image-decode-data-owner-required');saved.set(key,descriptor);expected.set(key,descriptor);}
 const originalArt=saved.get('productionArt')?.value,originalRig=saved.get('liveEnemies')?.value;
 if(!originalArt?.records||!originalArt.manifest||!originalRig)throw Error('image-decode-original-owners-required');
 const protectedRigs=new Set([originalRig]),controller=new AbortController(),entries=[],reports=[],images=[],cleanup={ownedArts:0,releasedArts:0,ownedRigs:0,retiredRigs:0,lateHandles:0,errors:[],arms:[],ownerDescriptorsRestored:false,externalReplacementPreserved:false,complete:false};
 let finished=false,completed=false,entry=null,profile=null,native=null,rejectCancelled,finalGame;
 const cancellation=new Promise((resolve,reject)=>{rejectCancelled=reject;});cancellation.catch(()=>{});
 const current=()=>keys.every(key=>sameDescriptor(Object.getOwnPropertyDescriptor(renderer,key),expected.get(key)));
 const check=()=>{if(finished||signal?.aborted||controller.signal.aborted)throw Error('image-decode-aborted');if(!current())throw Error('image-decode-owner-changed');if(cleanup.errors.length)throw Error('image-decode-cleanup-failed');};
 const wait=promise=>Promise.race([Promise.resolve(promise),cancellation]);
 const cleanupError=(where,error)=>cleanup.errors.push({where,error:errorText(error)});
 function restoreOwners(){for(const key of keys)try{const descriptor=Object.getOwnPropertyDescriptor(renderer,key);if(sameDescriptor(descriptor,expected.get(key))){const before=saved.get(key);if(before)Object.defineProperty(renderer,key,before);else if(!delete renderer[key])throw Error('owner-delete-failed');expected.set(key,before);}else if(!sameDescriptor(descriptor,saved.get(key)))cleanup.externalReplacementPreserved=true;}catch(error){cleanupError('restore.'+key,error);}}
 function assign(key,value){check();const before=expected.get(key),next=before?{...before,value}:{value,writable:true,configurable:true,enumerable:true};Object.defineProperty(renderer,key,next);expected.set(key,Object.getOwnPropertyDescriptor(renderer,key));}
 const protectedHandle=handle=>!objectLike(handle?.rig)||handle.adopted===true||handle.disposed===true||protectedRigs.has(handle.rig)||handle.rig===handle.old||handle.rig===Object.getOwnPropertyDescriptor(renderer,'liveEnemies')?.value;
 function stopProfiles(){for(const [label,observer]of [['cost',profile],['native',native]])try{observer?.stop();}catch(error){cleanupError(label+'.stop',error);}profile=native=null;}
 function release(owned){
  if(!owned||owned.released)return;owned.released=true;
  const row={borrowedRecordsUnchanged:true,ownedRecordsRemaining:null,modelsRemaining:null,alphaRawBytes:0,currentArtPreserved:false};cleanup.arms.push(row);
  const currentArt=Object.getOwnPropertyDescriptor(renderer,'productionArt');
  if(currentArt&&'value'in currentArt&&currentArt.value===owned.art){
   row.currentArtPreserved=true;row.ownedRecordsRemaining=owned.art.records.size;cleanupError('art.release',Error('image-decode-current-product-art-preserved'));
  }else{
   for(const [id,record]of owned.borrowed){if(owned.art.records.get(id)!==record||!sameOwn(record,owned.borrowedStates.get(id)))row.borrowedRecordsUnchanged=false;owned.art.records.delete(id);}
   try{owned.art.releaseUnusedAssets([]);}catch(error){cleanupError('art.release',error);}row.ownedRecordsRemaining=owned.art.records.size;cleanup.releasedArts++;
  }
  if(owned.handle){
   const rig=owned.handle.rig,currentRig=Object.getOwnPropertyDescriptor(renderer,'liveEnemies')?.value;
   if(protectedRigs.has(rig)||rig===owned.handle.old||rig===currentRig){cleanupError('rig.release',Error('image-decode-current-product-rig-preserved'));}
   else{
    if(!owned.adopted)try{owned.handle.dispose();}catch(error){cleanupError('handle.dispose',error);}
    else{
     const pending=[...(rig.pending?.values?.()||[])];
     for(const [label,operation]of [['release',()=>rig.releaseUnused([])],['alpha',()=>rig.releaseExactGPUAlpha?.()],['dispose',()=>rig.renderer.dispose()],['context-loss',()=>rig.renderer.forceContextLoss()]])try{operation();}catch(error){cleanupError('rig.'+label,error);}
     for(const promise of pending)Promise.resolve(promise).then(()=>{try{rig.releaseUnused([]);row.modelsRemaining=rig.models?.size??null;}catch(error){cleanupError('late.rig.release',error);}},()=>{});
    }
    cleanup.retiredRigs++;row.modelsRemaining=rig.models?.size??null;row.alphaRawBytes=rig.gpuAlphaBounds?.rawBytes||0;
   }
  }
  if(!row.borrowedRecordsUnchanged)cleanupError('borrowed.records',Error('image-decode-borrowed-record-mutation'));
  owned.borrowed.clear();owned.borrowedStates.clear();owned.handle=null;owned.art=null;
 }
 function releaseArm(){stopProfiles();restoreOwners();const prior=entry;entry=null;release(prior);}
 const abort=()=>{if(finished||controller.signal.aborted)return;controller.abort();releaseArm();rejectCancelled(Error('image-decode-aborted'));};
 function newArt(){
  check();const art=new ProductionArt({manifest:originalArt.manifest,baseURL:originalArt.baseURL,fetchImpl:originalArt.fetchImpl,ImageCtor:originalArt.ImageCtor,timeoutMs:originalArt.timeoutMs,onChange:null,forceLegacyMetadataParse:originalArt.forceLegacyMetadataParse===true});
  const borrowed=new Map(),borrowedStates=new Map();for(const [id,record]of originalArt.records)if(!walkerIDs.includes(id)&&record.status==='ready'){borrowed.set(id,record);borrowedStates.set(id,Object.getOwnPropertyDescriptors(record));art.records.set(id,record);}
  const owned={art,borrowed,borrowedStates,handle:null,adopted:false,released:false};entries.push(owned);entry=owned;cleanup.ownedArts++;
  const load=art.load;art.load=function(id,...args){if(walkerIDs.includes(id))return load.call(this,id,...args);const record=borrowed.get(id);if(record&&this.records.get(id)===record&&record.status==='ready')return record.promise;throw Error('image-decode-original-scenario-not-ready-'+id);};
  const body=art.loadBodyAlpha;art.loadBodyAlpha=function(id,...args){if(!borrowed.has(id))return body.call(this,id,...args);const record=borrowed.get(id);if(record.bodyAlphaStatus==='ready')return record.bodyAlphaPromise??Promise.resolve(true);throw Error('image-decode-borrowed-body-alpha-not-ready-'+id);};
  return owned;
 }
 async function prepareRig(owned,game){
  const roster=[...new Set([...game.enemies.map(actor=>'enemy-'+actor.type),...(game.mission?.enemyPool??[]).filter(item=>item.weight>0).map(item=>'enemy-'+item.type)])];if(!roster.length||roster.length>3)throw Error('image-decode-bounded-native-roster-required');
  const start=performance.now(),pending=Promise.resolve(prepareNativeEnemyLaunch(roster,{signal:controller.signal,timeoutMs:15000}));
  pending.then(handle=>{if((finished||controller.signal.aborted)&&!protectedHandle(handle)){cleanup.lateHandles++;try{handle.dispose();}catch(error){cleanupError('late.handle.dispose',error);}}},()=>{});
  const handle=await wait(pending);if(protectedHandle(handle))throw Error('image-decode-owned-native-required');owned.handle=handle;cleanup.ownedRigs++;check();
  const rig=handle.rig;if(rig.size!==256||!handle.report?.prepared||!handle.report.textureUpload?.submitted||!handle.report.textureUpload.stateNormalized||handle.report.textureUpload.error||!handle.report.shaders?.length||!handle.report.shaders.every(shader=>shader.ready)||!handle.isReady()||rig.renderer.info.render.frame!==0)throw Error('image-decode-native-original-preparation-required');
  Object.assign(rig,{exactGPUAlphaBounds:false,verifyExactGPUAlphaBounds:false,minGPUAlphaCells:12,gpuPoseBounds:false,verifyPoseBounds:false,directAlphaReadback:false,verifyAlphaReadback:false,cropNativeComposite:false,batchInkComposite:false,gpuAlphaStats:{frames:0,verified:0,mismatches:0,fallbacks:0,bytesRead:0}});
  if(!handle.isReady()||handle.adopt()!==rig)throw Error('image-decode-native-adoption-failed');owned.adopted=true;
  assign('productionArt',owned.art);assign('liveEnemies',rig);assign('liveEnemiesPromise',Promise.resolve(rig));assign('liveEnemiesLoading',true);
  return{keys:roster,native:handle.report,nativePreparationMs:performance.now()-start,sourceFrameBeforeFirstRender:rig.renderer.info.render.frame,gpuEnabled:false,size:rig.size};
 }
 function readPixels(image,read,rect=null){const width=rect?.width??image.width,height=rect?.height??image.height;read.width=width;read.height=height;const context=read.getContext('2d',{willReadFrequently:true});if(!context)throw Error('image-decode-read-canvas-required');context.clearRect(0,0,width,height);if(rect)context.drawImage(image,rect.x,rect.y,width,height,0,0,width,height);else context.drawImage(image,0,0);return context.getImageData(0,0,width,height).data;}
 function quality(art,readA,readB,originalTables){
  const records=[];for(const id of walkerIDs){const before=originalArt.get(id),after=art.get(id);if(!before||!after||before.image===after.image)throw Error('image-decode-distinct-original-images-required');const metadataSame=originalTables.get(id)===serialize(after.metadata),frames=after.metadata.frames,indices=[...new Set(Array.from({length:8},(_,index)=>Math.floor(index*(frames.length-1)/7)))],crops=[];
   for(const index of indices){const frame=frames[index];crops.push({index,rect:{...frame.rect},...difference(readPixels(before.image,readA,frame.rect),readPixels(after.image,readB,frame.rect))});}
   const clips=Object.keys(after.metadata.animation?.clips??{}),selectionCases=[];
   for(let n=0;n<12;n++){const options={angle:n*.53,phase:n*.39,timeSeconds:n*.073,stationary:n===0,foot:{x:321.5,y:-15.25},worldHeight:42,...(clips.length?{clip:clips[n%clips.length]}:{})},left=originalArt.frame(id,options),right=art.frame(id,options);selectionCases.push(serialize({frame:left?.frame,placement:left?.placement})===serialize({frame:right?.frame,placement:right?.placement}));}
   const result={id,originalImageDistinct:true,width:after.image.naturalWidth??after.image.width,height:after.image.naturalHeight??after.image.height,rawRGBAestimate:(after.image.naturalWidth??after.image.width)*(after.image.naturalHeight??after.image.height)*4,metadataSame,framePlacementActionSelectionsSame:selectionCases.every(Boolean),sampledCrops:crops};
   if(!metadataSame||!result.framePlacementActionSelectionsSame||crops.some(crop=>crop.different||crop.maxDelta))throw Error('image-decode-original-quality-difference');records.push(result);
  }return records;
 }
 active.add(renderer);
 try{
  signal?.addEventListener?.('abort',abort,{once:true});if(signal?.aborted)abort();check();
  for(const count of [60,180]){
   const localQuery=new URLSearchParams(query);localQuery.set('qa-loop','1');localQuery.set('qa-loop-count',String(count));const memory=createQAStorage(localQuery,()=>{throw Error('image-decode-persistent-storage-forbidden');}),profileData=loadProfile(memory),fixture=seedAppLoopQA(profileData,memory,{location,query:localQuery});if(!fixture||!fixture.snapshotValid)throw Error('image-decode-normal-fixture-required');
   const snapshot=profileData.activeRun.game,weapon=fixture.weapon;await wait(beforeScenario({count,weapon}));check();
   const originalTables=new Map();for(const id of walkerIDs){const record=originalArt.get(id);if(!record?.metadata||!record.image)throw Error('image-decode-original-walker-not-ready');originalTables.set(id,serialize(record.metadata));}
   const passes=[],states=[],streams=[],motions=[],pixels=[];
   for(const [armIndex,decode]of [false,true,false].entries()){
    check();onProgress({phase:'preparation',count,weapon,armIndex,decode});check();const game=Game.restore(snapshot,{resumePlaying:true});if(!game)throw Error('image-decode-normal-checkpoint-required');const beforePreparation=state(game),prepStart=performance.now(),owned=newArt(),loadStart=performance.now();
    const loaded=await wait(Promise.all(walkerIDs.map(id=>owned.art.load(id))));check();if(!loaded.every(Boolean)||!walkerIDs.every(id=>owned.art.isReady(id)))throw Error('image-decode-two-original-loads-required');const loadMs=performance.now()-loadStart;
    const decodeReport=decode?await wait(prepareOriginalImageDecode(owned.art,[...walkerIDs],{signal:controller.signal,timeoutMs:15000,ownerCurrent:()=>!owned.released&&!controller.signal.aborted&&current()})):{ready:false,status:'not-requested',error:'',elapsedMs:0,attempted:0,completed:0,entries:[],totalRawEstimate:0,note:'CPU control makes no explicit decode call.'};check();
    const nativePreparation=await prepareRig(owned,game);check();if(state(game)!==beforePreparation)throw Error('image-decode-preparation-game-mutation');const preparationMs=performance.now()-prepStart;
    const rig=owned.handle.rig,interpolation=new ActorInterpolation(),allSamples=[],events=[],motionFrames=[],upgradeChoices=[];let accumulator=0;
    renderer.cameraReady=false;renderer.lastNow=null;profile=createFrameCostProfile({renderer,read:()=>({game})});native=createNativeFrameProfile(rig);
    onProgress({phase:'combat',count,weapon,armIndex,decode});check();const combatStart=performance.now();
    for(let frame=0;frame<40;frame++){
     check();if(game.state==='upgrade'){const id=game.choices[0]?.id;if(!id)throw Error('image-decode-offered-upgrade-required');upgradeChoices.push({frame,id});game.chooseUpgrade(id);}if(game.state!=='playing')throw Error('image-decode-normal-combat-ended-'+frame);
     const start=performance.now(),meta={frame,count,armIndex,decode,warmup:frame<10};profile.beginFrame(meta);native.beginFrame(meta);let advanceMs,sampleMs,renderMs,combinedMs;
     try{
      accumulator+=.12;const advanced=advanceSimulation(game,{moveX:0,moveY:0,shoot:false,fireMode:'auto',aimX:game.player.x+300,aimY:game.player.y},accumulator,{interpolator:interpolation});accumulator=advanced.accumulator;advanceMs=performance.now()-start;events.push(...game.drainEvents());const sampled=performance.now(),view=interpolation.sample(game,accumulator/FIXED_STEP,FIXED_STEP);sampleMs=performance.now()-sampled;const drawing=performance.now();renderer.render(view,advanced.command,game.time);renderMs=performance.now()-drawing;combinedMs=performance.now()-start;
     }finally{try{native.endFrame();}finally{profile.endFrame();}}
     if(rig.error||rig.lost||rig.renderer.getContext().isContextLost?.())throw Error('image-decode-native-context-or-model-error');if(rig.exactGPUAlphaBounds||rig.gpuAlphaStats.frames||rig.gpuAlphaBounds?.reads)throw Error('image-decode-default-gpu-off-required');
     allSamples.push({frame,advanceMs,sampleMs,renderMs,combinedMs,nativeSelected:renderer.liveEnemySelection?.size||0,rigError:rig.error||'',nativeRenderFrame:rig.renderer.info.render.frame});motionFrames.push(motion(game));if(frame%8===0)await wait(new Promise(requestAnimationFrame));
    }
    const combatWallMs=performance.now()-combatStart,costs=profile.stop(),nativeReport=native.stop();profile=native=null;
    if(allSamples.length!==40||nativeReport.samples.length!==40||!nativeReport.samples.some(sample=>sample.stages['native.glSubmit']?.calls>0)||!allSamples.some(sample=>sample.nativeSelected>0)||allSamples.some(sample=>sample.nativeSelected>12))throw Error('image-decode-actual-native-40-frames-required');
    check();const qualityStart=performance.now(),readA=document.createElement('canvas'),readB=document.createElement('canvas');pixels.push(readPixels(canvas,readA));images.push({phase:'combat',count,weapon,armIndex,decode,src:canvas.toDataURL()});const sourceQuality=quality(owned.art,readA,readB,originalTables),qualityMs=performance.now()-qualityStart;
    const summarize=list=>Object.fromEntries(['advanceMs','sampleMs','renderMs','combinedMs'].map(key=>[key,summary(list.map(sample=>sample[key]))]));
    const successfulCandidate=decode&&decodeReport.ready===true&&decodeReport.attempted===2&&decodeReport.completed===2&&decodeReport.entries?.length===2&&decodeReport.entries.every(row=>row.ready===true);
    passes.push({armIndex,decode,successfulCandidate,loadMs,decodePreparation:decodeReport,nativePreparation,preparationMs,firstFrame:allSamples[0],all40Summary:summarize(allSamples),steady30Summary:summarize(allSamples.slice(10)),allSamples,costs,native:nativeReport,combatWallMs,startupPlusFirstMs:preparationMs+allSamples[0].combinedMs,startupPlusAll40CallMs:preparationMs+allSamples.reduce((sum,sample)=>sum+sample.combinedMs,0),qualityMs,sourceQuality,upgradeChoices,hp:game.player.hp,kills:game.kills,enemies:game.enemies.length,time:game.time,random:game.random.getState(),visualRandom:game.visualRandom.getState(),canvas:{width:canvas.width,height:canvas.height,dpr:renderer.dpr}});
    states.push(state(game));streams.push(serialize(events));motions.push(serialize(motionFrames));finalGame=game;releaseArm();check();
   }
   const candidateVsFirst=difference(pixels[0],pixels[1]),repeatedCPU=difference(pixels[0],pixels[2]),candidateVsRepeat=difference(pixels[1],pixels[2]),identicalCombatState=states.every(value=>value===states[0]),identicalEvents=streams.every(value=>value===streams[0]),identicalActorMotion=motions.every(value=>value===motions[0]),identicalUpgradeChoices=passes.every(pass=>serialize(pass.upgradeChoices)===serialize(passes[0].upgradeChoices));
   const result={count,weapon,fixture,passes,candidateVsFirst,repeatedCPU,candidateVsRepeat,identicalCombatState,identicalEvents,identicalActorMotion,identicalUpgradeChoices};reports.push(result);
   if(!identicalCombatState||!identicalEvents||!identicalActorMotion||!identicalUpgradeChoices||Math.max(candidateVsFirst.maxDelta,repeatedCPU.maxDelta,candidateVsRepeat.maxDelta)>1)throw Error('image-decode-combat-or-original-pixels-difference');
  }
  for(const image of images){check();await wait(onImage(image));}check();completed=true;
  return{game:finalGame,report:{reports,cleanup,observerSourceSHA256:observerSHA,originalImageIDs:[...walkerIDs],note:'Explicit8851 genuine-memory QA. Passed storage is only a brand gate; each density uses a separate memory fixture with original normal HP, AI, automatic fire, spawning and offered first-choice upgrades. Each60/180 CPU(no explicit decode) / decode / CPU arm freshly loads only the two original walker image records, borrows all other ready records by identity, and owns a separate max-three original-model texture/shader prepared native256 rig with twelve live slots; boss512 and all GPU experiments retain defaults OFF. Frame zero is timed without a renderer prime or source-quality draw. Forty fixed .12s catch-up renders, interpolation and event drains use batch8 yields; all40 and first frame plus preparation totals are kept separately from the30-frame steady summary. Decode ready requires actual two-image API completion; unsupported/rejected/timed-out paths remain visible as unsuccessful candidate fallback. Source quality is full metadata and twelve deterministic frame/placement/action selections plus eight sampled crops per atlas, after each cost arm; it is not full-atlas RGBA proof. Whole-canvas candidate and repeated-CPU differences are reported separately and original repeat maxDelta1 is not called exact. Source crop reads after each arm and same URL/browser decode caches can warm later arms; fresh HTMLImageElement does not mean cold decoding. The original shared art/native rig and player/world caches stay alive. Only owned records/rigs are released, borrowed records are detached unchanged, external owner changes are preserved, and PNG callbacks flush after all six cost arms. Raw image estimates describe source pixels, not measured live/peak heap/RAM/VRAM. Instrumented synchronous call wall includes waits/observer overhead and nested stages overlap; shader/decode readiness is not GPU completion, normal presented FPS, actual app HUD/audio/persistence, or proof of a performance gain.'}};
 }catch(error){try{if(objectLike(error))Object.defineProperty(error,'cleanup',{value:cleanup,enumerable:true});}catch{}throw error;}
 finally{
  finished=true;try{signal?.removeEventListener?.('abort',abort);}catch{}try{controller.abort();}catch{}releaseArm();for(const owned of entries)release(owned);active.delete(renderer);
  cleanup.ownerDescriptorsRestored=keys.every(key=>sameDescriptor(Object.getOwnPropertyDescriptor(renderer,key),saved.get(key)));cleanup.complete=cleanup.errors.length===0&&cleanup.ownerDescriptorsRestored&&cleanup.ownedArts===cleanup.releasedArts&&cleanup.ownedRigs===cleanup.retiredRigs&&cleanup.arms.every(arm=>arm.borrowedRecordsUnchanged&&arm.ownedRecordsRemaining===0&&(arm.modelsRemaining===null||arm.modelsRemaining===0)&&arm.alphaRawBytes===0);
  if(completed&&!cleanup.complete){const error=Error('image-decode-cleanup-failed');error.cleanup=cleanup;throw error;}
 }
}
