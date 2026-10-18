import * as THREE from './player-rig/vendor/three.module.js';
import {isQAMemoryStorage} from './qa-storage.js';
import {prepareNativeEnemyLaunch} from './boss-rig/native-launch-preparation.js';
import {GPUAlphaBounds} from './boss-rig/gpu-alpha-bounds.js';
import {CompletedEnemyFrames} from './completed-enemy-frames.js';

const active=new WeakSet(),ownerKeys=['liveEnemies','liveEnemiesPromise','liveEnemiesLoading'];
const objectLike=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const sameDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
const describeError=error=>{try{return typeof error?.message==='string'?error.message:'empty-lease-qa-failed';}catch{return'empty-lease-qa-failed';}};
const difference=(a,b)=>{if(a.length!==b.length)return{different:Math.max(a.length,b.length),maxDelta:255};let different=0,maxDelta=0;for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);if(delta)different++;maxDelta=Math.max(maxDelta,delta);}return{different,maxDelta};};
const exact=value=>JSON.stringify(value);
const publicState=rig=>{const renderer=rig.renderer;return{target:renderer.getRenderTarget()?.uuid??null,face:renderer.getActiveCubeFace(),level:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()).toArray(),scissor:renderer.getScissor(new THREE.Vector4()).toArray(),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear,canvas:[renderer.domElement.width,renderer.domElement.height],camera:[rig.camera.position.toArray(),rig.camera.quaternion.toArray(),rig.camera.projectionMatrix.toArray()],scene:rig.scene.children.map(object=>object.uuid)};};
const resources=helper=>({helper,source:helper.source,rows:helper.rows,bounds:helper.bounds,rowMaterial:helper.rowMaterial,boundsMaterial:helper.boundsMaterial,warmReady:helper.warmReady});
const sameResources=(before,helper)=>Object.entries(before).every(([key,value])=>(key==='helper'?helper:helper[key])===value);
const helperState=helper=>({rawBytes:helper?.rawBytes||0,reads:helper?.reads||0,bytesRead:helper?.bytesRead||0,warmReady:!!helper?.warmReady,leaseActive:helper?.retainWarmupResources?.()||false,rowMaterial:helper?.rowMaterial?.uuid??null,rows:helper?.rows?.uuid??null});
const flags=(rig,enabled)=>Object.assign(rig,{exactGPUAlphaBounds:enabled,verifyExactGPUAlphaBounds:false,minGPUAlphaCells:12,gpuPoseBounds:false,verifyPoseBounds:false,directAlphaReadback:false,verifyAlphaReadback:false,cropNativeComposite:false,batchInkComposite:false,gpuAlphaStats:{frames:0,verified:0,mismatches:0,fallbacks:0,bytesRead:0}});

export function allowGPUAlphaEmptyLease(location,query,storage){
 return location?.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&location.port==='8851'&&query?.has('qa')&&query.has('qa-memory')&&isQAMemoryStorage(storage);
}

// Bounded original-asset correctness QA. Main Renderer owners and Game/storage
// are never assigned or called. Two separate locally loaded original NPC rigs
// are retired in sequence; only their prepared handles are adopted privately.
export async function compareGPUAlphaEmptyLease(renderer,{storage,location=globalThis.location,query=new URLSearchParams(location?.search??''),signal,onProgress=()=>{},onImage=()=>{}}={}){
 if(!allowGPUAlphaEmptyLease(location,query,storage))throw Error('gpu-alpha-empty-lease-memory-qa-required');
 if(!objectLike(renderer)||active.has(renderer))throw Error('gpu-alpha-empty-lease-already-active');
 if(signal?.aborted)throw Error('gpu-alpha-empty-lease-aborted');
 const owners=new Map(ownerKeys.map(key=>[key,Object.getOwnPropertyDescriptor(renderer,key)])),protectedRigs=new Set([...owners.values()].map(descriptor=>descriptor?.value).filter(objectLike)),controller=new AbortController(),entries=[],cleanup={ownedRigs:0,retiredRigs:0,errors:[],resources:[],ownersUnchanged:false,externalOwnersPreserved:false,complete:false};
 let finished=false,completed=false,rejectCancelled;
 const cancelled=new Promise((resolve,reject)=>{rejectCancelled=reject;});cancelled.catch(()=>{});
 const currentOwners=()=>ownerKeys.every(key=>sameDescriptor(Object.getOwnPropertyDescriptor(renderer,key),owners.get(key)));
 const check=()=>{if(finished||controller.signal.aborted||signal?.aborted)throw Error('gpu-alpha-empty-lease-aborted');if(!currentOwners())throw Error('gpu-alpha-empty-lease-owner-changed');};
 const wait=promise=>Promise.race([Promise.resolve(promise),cancelled]);
 const cleanupError=(where,error)=>cleanup.errors.push({where,error:describeError(error)});
 const protectedHandle=handle=>handle?.adopted===true||handle?.disposed===true||protectedRigs.has(handle?.rig)||handle?.rig===handle?.old||handle?.rig===Object.getOwnPropertyDescriptor(renderer,'liveEnemies')?.value;
 function retire(entry){
  if(!entry||entry.retired||protectedRigs.has(entry.rig))return;entry.retired=true;cleanup.retiredRigs++;
  if(!entry.adopted){try{entry.handle.dispose();}catch(error){cleanupError('handle.dispose',error);}}
  else{
   try{entry.rig.releaseUnused([]);}catch(error){cleanupError('releaseUnused',error);}
   try{entry.rig.releaseExactGPUAlpha?.();}catch(error){cleanupError('releaseExactGPUAlpha',error);}
   try{entry.rig.renderer.dispose();}catch(error){cleanupError('renderer.dispose',error);}
   try{entry.rig.renderer.forceContextLoss();}catch(error){cleanupError('renderer.forceContextLoss',error);}
  }
  cleanup.resources.push({modelsRemaining:entry.rig.models?.size??null,alphaRawBytes:entry.rig.gpuAlphaBounds?.rawBytes||0});
 }
 const abort=()=>{if(finished||controller.signal.aborted)return;controller.abort();for(const entry of entries)retire(entry);rejectCancelled(Error('gpu-alpha-empty-lease-aborted'));};
 async function prepare(label){
  check();onProgress({phase:'prepare',label});const pending=Promise.resolve(prepareNativeEnemyLaunch(['enemy-walker'],{signal:controller.signal,timeoutMs:15000}));
  pending.then(handle=>{try{if((finished||controller.signal.aborted)&&handle&&!protectedHandle(handle))handle.dispose();}catch(error){cleanupError('late.handle.dispose',error);}},()=>{});
  const handle=await wait(pending);
  if(!objectLike(handle?.rig)||protectedHandle(handle))throw Error('gpu-alpha-empty-lease-original-owned-preparation-required');
  const entry={handle,rig:handle.rig,adopted:false,retired:false,label};entries.push(entry);cleanup.ownedRigs++;
  check();
  if(!handle.report?.prepared||!handle.report.textureUpload?.submitted||!handle.report.textureUpload.stateNormalized||handle.report.textureUpload.error||!handle.report.shaders?.every(shader=>shader.ready)||!handle.isReady())throw Error('gpu-alpha-empty-lease-original-preparation-required');
  const rig=entry.rig;rig.renderer.setSize(1024,768,false);rig.renderer.setViewport(0,0,1024,768);rig.renderer.setScissorTest(false);rig.renderer.clear();
  if(rig.renderer.info.render.frame!==0||!handle.isReady())throw Error('gpu-alpha-empty-lease-preparation-drew-source');
  return entry;
 }
 function adopt(entry){check();if(!entry.handle.isReady()||entry.handle.adopt()!==entry.rig)throw Error('gpu-alpha-empty-lease-owned-adoption-failed');entry.adopted=true;}
 function imagePixels(image,read){read.width=image.width;read.height=image.height;const context=read.getContext('2d',{willReadFrequently:true});if(!context)throw Error('gpu-alpha-empty-lease-canvas-required');context.clearRect(0,0,read.width,read.height);context.drawImage(image,0,0);return context.getImageData(0,0,read.width,read.height).data;}
 function jobs(art,rig,epoch=0){
  const model=rig.models.get('enemy-walker'),deathDuration=model?.sampler?.clips[model.indices?.death]?.duration;if(!Number.isFinite(deathDuration))throw Error('gpu-alpha-empty-lease-original-death-clip-required');
  const poses=['idle','walk','walk','walk','windup','attack','hit','idle','walk','attack','hit','death'];
  return poses.map((pose,index)=>{const actor={id:900+epoch*100+index,seed:900+epoch*100+index,type:'walker',x:1200+index*9,y:930,r:16,angle:index*.47,hp:pose==='death'?0:500,dead:pose==='death',time:10,duration:12,attackState:pose==='windup'?'windup':pose==='attack'?'charge':'walk',attackTime:.4,hitFlash:['windup','attack','hit'].includes(pose)?.09:0},animationTime=pose==='death'?deathDuration+1:.12;
   const fallback=art.enemyFrame('walker',actor,{pose,simulationTime:1.2,animationTime});if(!fallback)throw Error('gpu-alpha-empty-lease-original-art-required');
   return{actor,pose,options:{pose,animationTime,height:42,actionDurations:{windup:.9,charge:.75}},fallback:{...fallback,locomotion:{pose:pose==='hit'?'walk':pose,phase:2.4,angle:actor.angle,...(pose==='walk'?{moveWeight:index===1?.3:index===2?.7:1}:{})}}};
  });
 }
 function draw(rig,items){check();rig.beginBatch(12);for(const item of items)rig.frame('enemy-walker',item.actor,1.2,item.fallback,item.options);rig.endBatch();return items.map(item=>{const selected=rig.frames.get(item.actor)?.selected;if(!selected||selected.image.width!==256||selected.image.height!==256||selected.image===rig.renderer.domElement||selected.metadata.boundsKind!=='alpha')throw Error('gpu-alpha-empty-lease-private-original-output-required');return selected;});}
 const geometry=selected=>exact({frame:selected.frame,placement:selected.placement,animation:selected.metadata.animation,boundsKind:selected.metadata.boundsKind});
 active.add(renderer);
 try{
  signal?.addEventListener?.('abort',abort,{once:true});check();
  const art=renderer.productionArt,mapping=art?.manifest?.enemies?.walker;if(!mapping||typeof art.load!=='function'||typeof art.enemyFrame!=='function')throw Error('gpu-alpha-empty-lease-production-art-required');
  await wait(Promise.all((typeof mapping==='string'?[mapping]:Object.values(mapping)).map(id=>art.load(id,{retry:true}))));check();
  const read=document.createElement('canvas'),baselineEntry=await prepare('CPU 원본 기준');flags(baselineEntry.rig,false);adopt(baselineEntry);
  const baselineJobs=jobs(art,baselineEntry.rig),baselineSelected=draw(baselineEntry.rig,baselineJobs),baseline=baselineSelected.map(selected=>({pixels:imagePixels(selected.image,read),geometry:geometry(selected)}));
  const baselinePreparation=baselineEntry.handle.report;retire(baselineEntry);check();
  const candidateEntry=await prepare('GPU 원본 후보'),rig=candidateEntry.rig;flags(rig,true);rig.gpuAlphaBounds??=new GPUAlphaBounds();const helper=rig.gpuAlphaBounds;
  const beforeWarmState=publicState(rig),ready=await wait(helper.warmup(rig.renderer,1024,768,12,{signal:controller.signal,timeoutMs:15000,idleLeaseMs:15000}));check();
  if(!ready||helper.reads!==0||helper.bytesRead!==0||rig.renderer.info.render.frame!==0||exact(beforeWarmState)!==exact(publicState(rig)))throw Error('gpu-alpha-empty-lease-draw-free-warmup-required');
  const prepared=resources(helper),beforeEmpty=helperState(helper),beforeEmptyState=publicState(rig),colourBefore=imagePixels(rig.renderer.domElement,read),gpuRawBefore=rig.gpuRaw,rawDimensions=rig.gpuRaw?[rig.gpuRaw.width,rig.gpuRaw.height]:null;
  if(!beforeEmpty.leaseActive||!beforeEmpty.rawBytes||!beforeEmpty.warmReady)throw Error('gpu-alpha-empty-lease-live-warm-lease-required');
  onProgress({phase:'empty',label:'첫 draw 전 실제 빈 배치'});rig.beginBatch(12);rig.endBatch();
  const afterEmpty=helperState(helper),colourDifference=difference(colourBefore,imagePixels(rig.renderer.domElement,read)),empty={before:beforeEmpty,after:afterEmpty,resourceIdentitiesSame:sameResources(prepared,helper),publicStateSame:exact(beforeEmptyState)===exact(publicState(rig)),colourDifference,gpuColourCanvasSame:rig.gpuRaw===gpuRawBefore&&exact(rig.gpuRaw?[rig.gpuRaw.width,rig.gpuRaw.height]:null)===exact(rawDimensions),nativeRenderFrame:rig.renderer.info.render.frame,gpuCells:rig.gpuAlphaStats.frames,reads:helper.reads,bytesRead:helper.bytesRead};
  if(!empty.resourceIdentitiesSame||!empty.publicStateSame||!empty.gpuColourCanvasSame||colourDifference.different||afterEmpty.rawBytes!==beforeEmpty.rawBytes||!afterEmpty.warmReady||!afterEmpty.leaseActive||empty.nativeRenderFrame||empty.gpuCells||empty.reads||empty.bytesRead)throw Error('gpu-alpha-empty-lease-empty-discarded-preparation');
  adopt(candidateEntry);const candidateJobs=jobs(art,rig),selected=draw(rig,candidateJobs),comparisons=selected.map((image,index)=>({...difference(baseline[index].pixels,imagePixels(image.image,read)),geometrySame:baseline[index].geometry===geometry(image),private256:image.image.width===256&&image.image.height===256&&image.image!==rig.renderer.domElement}));
  const firstRead={helperSame:rig.gpuAlphaBounds===helper,rowMaterialSame:helper.rowMaterial===prepared.rowMaterial,sourceSame:helper.source===prepared.source,reads:helper.reads,bytesRead:helper.bytesRead,gpuStats:{...rig.gpuAlphaStats},nativeRenderFrame:rig.renderer.info.render.frame,allRGBAEqual:comparisons.every(value=>value.different===0&&value.maxDelta===0),allGeometryEqual:comparisons.every(value=>value.geometrySame),allPrivate:comparisons.every(value=>value.private256)};
  if(!firstRead.helperSame||!firstRead.rowMaterialSame||!firstRead.sourceSame||firstRead.reads!==1||firstRead.bytesRead!==48||firstRead.gpuStats.frames!==12||firstRead.gpuStats.fallbacks||firstRead.gpuStats.mismatches||!firstRead.allRGBAEqual||!firstRead.allGeometryEqual||!firstRead.allPrivate)throw Error('gpu-alpha-empty-lease-actual-original-GPU-read-required');
  const corpse=candidateJobs[11].actor,cache=new CompletedEnemyFrames(),completedCorpse=cache.remember(corpse,selected[11],42);if(!completedCorpse?.completedNativeDeath||completedCorpse.image===selected[11].image)throw Error('gpu-alpha-empty-lease-private-corpse-required');const corpseBefore=imagePixels(completedCorpse.image,read);
  const sheet=document.createElement('canvas');sheet.width=1024;sheet.height=852;const sheetContext=sheet.getContext('2d');sheetContext.fillStyle='#243236';sheetContext.fillRect(0,0,sheet.width,sheet.height);sheetContext.font='12px sans-serif';sheetContext.fillStyle='#f3f4e9';selected.forEach((image,index)=>{const x=index%4*256,y=Math.floor(index/4)*284;sheetContext.drawImage(image.image,x,y);sheetContext.fillText(index+' · '+candidateJobs[index].pose,x+8,y+274);});await wait(onImage({phase:'first-12',src:sheet.toDataURL(),alt:'원본 NPC 12자세 · 빈 배치 뒤 실제 GPU 알파 출력'}));check();
  draw(rig,jobs(art,rig,1));const afterReuse=difference(corpseBefore,imagePixels(completedCorpse.image,read));if(afterReuse.different||cache.get(corpse,42)!==completedCorpse)throw Error('gpu-alpha-empty-lease-corpse-changed-after-pool-reuse');
  rig.beginBatch(12);rig.endBatch();const consumed={rawBytes:helper.rawBytes,rowMaterialReleased:helper.rowMaterial===null,gpuCopySize:rig.gpuRaw?[rig.gpuRaw.width,rig.gpuRaw.height]:null,corpseDifference:difference(corpseBefore,imagePixels(completedCorpse.image,read))};
  if(consumed.rawBytes||!consumed.rowMaterialReleased||consumed.corpseDifference.different||consumed.gpuCopySize&&exact(consumed.gpuCopySize)!==exact([1,1]))throw Error('gpu-alpha-empty-lease-consumed-resources-retained');
  // Expiry uses the real public warmup lease API. The compilation timeout stays
  //15000ms; only this explicit idle lease is1ms, followed by a bounded20ms wait.
  const expiryReady=await wait(helper.warmup(rig.renderer,1024,768,12,{signal:controller.signal,timeoutMs:15000,idleLeaseMs:1}));check();if(!expiryReady)throw Error('gpu-alpha-empty-lease-expiry-preparation-failed');await wait(new Promise(resolve=>setTimeout(resolve,20)));check();const expiredBefore=helperState(helper);rig.beginBatch(12);rig.endBatch();const expired={ready:expiryReady,leaseActiveBefore:expiredBefore.leaseActive,rawBytes:helper.rawBytes,rowMaterialReleased:helper.rowMaterial===null,corpseDifference:difference(corpseBefore,imagePixels(completedCorpse.image,read))};
  if(expired.leaseActiveBefore||expired.rawBytes||!expired.rowMaterialReleased||expired.corpseDifference.different)throw Error('gpu-alpha-empty-lease-expired-resources-retained');
  await wait(onImage({phase:'private-corpse',src:completedCorpse.image.toDataURL(),alt:'원본 완료 시체 private 이미지 · 슬롯 재사용과 lease 정리 뒤'}));check();
  completed=true;return{report:{baselinePreparation,candidatePreparation:candidateEntry.handle.report,empty,firstRead,comparisons,privateCorpse:{completedNativeDeath:true,privateFromSlot:completedCorpse.image!==selected[11].image,afterReuse,consumed,expired},cleanup,note:'Explicit8851 genuine-memory QA; storage is a brand gate only and no storage or Game API is used. CPU baseline and GPU candidate each own one separately loaded original walker rig with the same original texture/shader preparation and1024x768 pre-draw atlas normalization. The actual empty batch occurs after compile-only warmup with a15s timeout and idle lease, before any source or reduction render/read. Subsequent actual12-cell min12 GPU read must reuse the same resources, return48 bytes with zero fallback, match all original256 RGBA/frame/bounds/placement/animation outputs and retain private completed death after another12-slot reuse. Consumed and legitimately expired idle leases release owned resources. Preparation API readiness does not prove GPU completion; this is correctness/lifecycle QA, not a performance, heap, FPS or actual app-loop comparison. Main renderer owners and current Game are not assigned.'}};
 }catch(error){try{if(objectLike(error))Object.defineProperty(error,'cleanup',{value:cleanup,enumerable:true});}catch{}throw error;}
 finally{
  finished=true;try{signal?.removeEventListener?.('abort',abort);}catch{}try{controller.abort();}catch{}for(const entry of entries)retire(entry);active.delete(renderer);
  cleanup.ownersUnchanged=currentOwners();cleanup.externalOwnersPreserved=!cleanup.ownersUnchanged;cleanup.complete=cleanup.errors.length===0&&cleanup.ownedRigs===cleanup.retiredRigs&&cleanup.resources.every(entry=>entry.modelsRemaining===0&&entry.alphaRawBytes===0)&&cleanup.ownersUnchanged;
  if(completed&&!cleanup.complete){const error=Error('gpu-alpha-empty-lease-cleanup-failed');error.cleanup=cleanup;throw error;}
 }
}
