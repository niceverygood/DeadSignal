// Separate owned-cleanup QA. Original phase/render/quality calculations below
// are copied from qa-boss-action-layer; the legacy module remains unchanged.
import {BOSS_CATALOG} from './campaign.js?v=0.29.0';
import {Renderer as DefaultRenderer} from './renderer.js';
import {ProductionArt as DefaultProductionArt} from './production-art.js?v=0.29.0';
import {LiveBossRig as DefaultLiveBossRig} from './boss-rig/live-boss.js';
import {Cache as DefaultCache,Vector3} from './player-rig/vendor/three.module.js';
import {isQAMemoryStorage} from './qa-storage.js';
import {createOwnedCleanupTracker as defaultOwnedCleanupTracker} from './qa-owned-cleanup-tracker.js';

const active=new WeakSet(),SIZE=512,OWNER_KEYS=['productionArt','liveBoss','liveBossPromise','liveEnemies','liveEnemiesPromise','liveEnemiesLoading'];
const PHASES=[['windup',.1],['windup',.5],['windup',.99],['attack',.02],['attack',.22],['attack',.65],['attack',.99]];
const NOTE='QA-only optional upper-body candidate, never a natural-motion or new-animation claim. Twelve final bosses use controlled actors and original512 native rendering; boss01final covers16 angles and the other11 cover4, with identical seven windup/attack phases in Aoriginal/Bcandidate. These840 active samples and separate inactive idle/walk/death controls are correctness work, not performance/FPS measurements or12 actual fights. Hands use an original geometry vertex dominated by its forearm skin weight when available; any joint fallback is explicitly qualified. The10% body-alpha-height travel target is an initial visual-QA flag, not an anatomical or gameplay guarantee. Full geometry/index/UV/skin-attribute bytes are compared at each model boundary, with original geometry/material/map/source identities preserved. One own model/two atlases and one contact sheet are retained at a time. The caller-facing main renderer is never assigned; all images and GPU contexts here are owned and retired. Already-started GLTF/Image loads cannot be cancelled; late completion cleanup is scheduled. Original source-file SHAs are separately verified evidence, not rehashed by this browser helper.';
const descriptor=(object,key)=>Object.getOwnPropertyDescriptor(object,key);
const sameDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
const need=(value,message)=>{if(!value)throw Error('boss-action-layer-'+message);};
const finite=Number.isFinite;
const errorText=error=>{try{return String(error?.message||'failed');}catch{return'failed';}};
const primitive=value=>Object.fromEntries(Object.entries(value||{}).filter(([,item])=>item===null||typeof item==='string'||typeof item==='boolean'||typeof item==='number'&&finite(item)));
function layerEvidence(d,enabled,pose,kind){
 const names=['bossActionsEnabled','bossActionsActive','bossActionsBones','bossActionsMaxRadians','bossActionsKind'];need(names.every(name=>Object.hasOwn(d,name)),'supported-layer-diagnostics-required');
 const expectedActive=enabled&&(pose==='windup'||pose==='attack');need(d.bossActionsEnabled===enabled&&d.bossActionsActive===expectedActive&&d.bossActionsKind===kind,'layer-enabled-active-kind-mismatch');
 need(Number.isInteger(d.bossActionsBones)&&finite(d.bossActionsMaxRadians)&&d.bossActionsMaxRadians>=0&&d.bossActionsMaxRadians<=40*(Math.PI/180),'layer-angle-or-bone-count-invalid');
 need(expectedActive?d.bossActionsBones>0:d.bossActionsBones===0&&d.bossActionsMaxRadians===0,'layer-application-contract-mismatch');return Object.fromEntries(names.map(name=>[name,d[name]]));
}
function bytesHash(bytes){let hash=2166136261;for(let index=0;index<bytes.length;index++)hash=Math.imul(hash^bytes[index],16777619);return(hash>>>0).toString(16).padStart(8,'0');}
function byteDifference(a,b){need(a.length===b.length,'rgba-length-mismatch');let differentComponents=0,maxDelta=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i]){differentComponents++;maxDelta=Math.max(maxDelta,Math.abs(a[i]-b[i]));}return{differentComponents,maxDelta};}
function sameNumbers(a,b){return a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));}
function actionDuration(boss){const skill=boss.skill,value=skill.kind==='shield'?skill.guardDuration??skill.duration:skill.duration;return finite(value)?value:skill.kind==='shield'?3:skill.kind==='leap'?.5:skill.kind==='pull'?1.1:.75;}
function originalModelSnapshot(model){
 const meshes=[],buffers=[],seenBuffers=new Set(),textures=new Set();
 model.root.traverse(mesh=>{
  if(!mesh.geometry)return;
  const geometry=mesh.geometry,attributes=Object.entries(geometry.attributes),index=geometry.index,materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const record={mesh,geometry,attributes:attributes.map(([name,attribute])=>({name,attribute,array:attribute.array,itemSize:attribute.itemSize,normalized:attribute.normalized,count:attribute.count,offset:attribute.offset,data:attribute.data,stride:attribute.data?.stride})),index,indexArray:index?.array,indexCount:index?.count,indexItemSize:index?.itemSize,indexNormalized:index?.normalized,material:mesh.material,materials:[...materials],maps:materials.map(material=>({material,map:material?.map,alphaMap:material?.alphaMap,color:material?.color?[material.color.r,material.color.g,material.color.b]:null,opacity:material?.opacity,side:material?.side,transparent:material?.transparent}))};
  meshes.push(record);
  for(const attribute of [...attributes.map(([,value])=>value),...(index?[index]:[])]){
   const array=attribute.array;if(!ArrayBuffer.isView(array)||seenBuffers.has(array))continue;seenBuffers.add(array);
   const view=new Uint8Array(array.buffer,array.byteOffset,array.byteLength),copy=view.slice();buffers.push({array,buffer:array.buffer,offset:array.byteOffset,length:array.byteLength,copy,hash:bytesHash(copy)});
  }
  for(const material of materials)for(const texture of [material?.map,material?.alphaMap])if(texture&&!textures.has(texture))textures.add(texture);
 });
 const textureRecords=[...textures].map(texture=>({texture,source:texture.source,data:texture.source?.data,image:texture.image,width:texture.image?.width,height:texture.image?.height}));
 return {meshes,buffers,textures:textureRecords};
}
function verifyOriginalModel(snapshot){
 let bytes=0;
 for(const record of snapshot.meshes){
  need(record.mesh.geometry===record.geometry&&record.mesh.material===record.material,'original-geometry-material-identity-changed');
  const materials=Array.isArray(record.mesh.material)?record.mesh.material:[record.mesh.material];need(materials.length===record.materials.length&&materials.every((value,index)=>value===record.materials[index]),'original-material-members-changed');
  need(Object.keys(record.geometry.attributes).length===record.attributes.length&&record.geometry.index===record.index&&record.index?.array===record.indexArray&&record.index?.count===record.indexCount&&record.index?.itemSize===record.indexItemSize&&record.index?.normalized===record.indexNormalized,'original-attribute-list-or-index-changed');
  for(const a of record.attributes)need(record.geometry.attributes[a.name]===a.attribute&&a.attribute.array===a.array&&a.attribute.itemSize===a.itemSize&&a.attribute.normalized===a.normalized&&a.attribute.count===a.count&&a.attribute.offset===a.offset&&a.attribute.data===a.data&&a.attribute.data?.stride===a.stride,'original-attribute-identity-changed-'+a.name);
  for(const m of record.maps)need(m.material?.map===m.map&&m.material?.alphaMap===m.alphaMap&&m.material?.opacity===m.opacity&&m.material?.side===m.side&&m.material?.transparent===m.transparent&&(!m.color||sameNumbers([m.material.color.r,m.material.color.g,m.material.color.b],m.color)),'original-material-representation-changed');
 }
 for(const b of snapshot.buffers){need(b.array.buffer===b.buffer&&b.array.byteOffset===b.offset&&b.array.byteLength===b.length,'original-buffer-identity-changed');const current=new Uint8Array(b.buffer,b.offset,b.length);need(current.every((value,index)=>value===b.copy[index]),'original-geometry-uv-skin-buffer-changed');bytes+=current.length;}
 for(const t of snapshot.textures)need(t.texture.source===t.source&&t.source?.data===t.data&&t.texture.image===t.image&&t.image?.width===t.width&&t.image?.height===t.height,'original-map-source-changed');
 return {unchanged:true,meshCount:snapshot.meshes.length,attributes:snapshot.meshes.map(m=>m.attributes.map(a=>a.name)),buffers:snapshot.buffers.length,bytesCompared:bytes,bufferHashesFNV1a32:snapshot.buffers.map(b=>b.hash),textureCount:snapshot.textures.length,note:'Identity and full byte comparisons establish equality; hashes only summarize those same buffers. Normal vendor material version/listener bookkeeping is not treated as a source edit.'};
}
function handPoints(model){
 const byName=new Map();
 for(const mesh of model.sampler.skins){
  const position=mesh.geometry.attributes.position,joints=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;if(!position||!joints||!weights)continue;
  const candidates=new Map();
  for(const [boneIndex,bone]of mesh.skeleton.bones.entries())if(/^DS_Forearm_/.test(bone.name)){
   let candidate=byName.get(bone.name);if(!candidate){candidate={bone,boneIndex,mesh:null,index:-1,weight:0,x:/_-1$/.test(bone.name)?Infinity:-Infinity,left:/_-1$/.test(bone.name)};byName.set(bone.name,candidate);}candidates.set(boneIndex,candidate);
  }
  for(let index=0;index<position.count;index++)for(let component=0;component<Math.min(4,joints.itemSize,weights.itemSize);component++){
   const boneIndex=joints.getComponent(index,component),weight=weights.getComponent(index,component),candidate=candidates.get(boneIndex);if(!candidate||!(weight>.5))continue;
   const x=position.getX(index);if(candidate.index<0||(candidate.left?x<candidate.x:x>candidate.x)||Object.is(x,candidate.x)&&weight>candidate.weight){candidate.bone=mesh.skeleton.bones[boneIndex];candidate.boneIndex=boneIndex;candidate.mesh=mesh;candidate.index=index;candidate.weight=weight;candidate.x=x;}
  }
 }
 // A torso/prop mesh may expose the skeleton without owning any hand weight.
 // Scan every skin before choosing unique hands; actual weighted vertices win.
 const candidates=[...byName.values()],ordered=[...candidates.filter(point=>point.index>=0),...candidates.filter(point=>point.index<0)];
 const points=ordered.slice(0,8).map(candidate=>candidate.index>=0?{...candidate,original:new Vector3().fromBufferAttribute(candidate.mesh.geometry.attributes.position,candidate.index),vector:new Vector3(),kind:'dominant-forearm-skin-vertex'}:{...candidate,vector:new Vector3(),kind:'forearm-joint-origin-fallback'});
 need(points.length>0,'hand-points-unavailable');return points;
}
function projectedHands(points,camera){return points.map(point=>{const vector=point.vector;if(point.kind==='dominant-forearm-skin-vertex'){vector.copy(point.original);point.mesh.applyBoneTransform(point.index,vector);point.mesh.localToWorld(vector);}else point.bone.getWorldPosition(vector);vector.project(camera);need([vector.x,vector.y,vector.z].every(finite),'hand-projection-invalid');return{bone:point.bone.name,kind:point.kind,vertexIndex:point.index,dominantWeight:point.kind==='dominant-forearm-skin-vertex'?point.weight:null,x:(vector.x*.5+.5)*SIZE,y:(.5-vector.y*.5)*SIZE,z:vector.z};});}
function protectedPoints(model){return model.bones.filter(bone=>/^(DS_Root|DS_Leg_.*|DS_Foot_.*|Hips)$/.test(bone.name)).map(bone=>({bone,vector:new Vector3()}));}
function protectedPositions(points){return points.flatMap(point=>{point.bone.getWorldPosition(point.vector);need([point.vector.x,point.vector.y,point.vector.z].every(finite),'protected-world-position-invalid');return[point.vector.x,point.vector.y,point.vector.z];});}
function localBonePose(model){return model.bones.flatMap(bone=>[bone.position.x,bone.position.y,bone.position.z,bone.quaternion.x,bone.quaternion.y,bone.quaternion.z,bone.quaternion.w,bone.scale.x,bone.scale.y,bone.scale.z]);}
function actorFixture(boss,id,angle){return{id,x:1400,y:900,r:boss.stats.r,type:'collector',bossKey:boss.id,bossRole:'final',hp:boss.stats.hp,maxHp:boss.stats.hp,speed:boss.stats.speed,angle,stun:0,vx:0,vy:0,hitFlash:0,attackCd:0,skillCd:boss.skill.cooldown,attackState:'walk',attackTime:0,dead:false};}
function handTravel(samples){
 const held=samples[2],bodyAlphaHeights=samples.map(sample=>sample.alphaBounds.height),bodyAlphaHeight=Math.max(...bodyAlphaHeights),targetPixels=bodyAlphaHeight*.1;
 const phase=index=>({sampleIndex:index,pose:samples[index].pose,progress:samples[index].progress});
 const points=held.hands.map((point,index)=>{
  let maxTravelPixels=-1,maxPair=null;
  for(let from=0;from<samples.length;from++)for(let to=from+1;to<samples.length;to++){
   const a=samples[from].hands[index],b=samples[to].hands[index],distancePixels=Math.hypot(b.x-a.x,b.y-a.y);
   if(distancePixels>maxTravelPixels){maxTravelPixels=distancePixels;maxPair={from:phase(from),to:phase(to),distancePixels};}
  }
  return {bone:point.bone,kind:point.kind,vertexIndex:point.vertexIndex,dominantWeight:point.dominantWeight,heldToAttack22:Math.hypot(samples[4].hands[index].x-point.x,samples[4].hands[index].y-point.y),heldToAttack65:Math.hypot(samples[5].hands[index].x-point.x,samples[5].hands[index].y-point.y),maxTravelPixels,maxPair};
 });
 const weighted=points.filter(point=>point.kind==='dominant-forearm-skin-vertex'),maximum=weighted.reduce((best,point)=>!best||point.maxTravelPixels>best.maxTravelPixels?point:best,null);
 return {points,maxTravelPixels:maximum?.maxTravelPixels??0,maxPair:maximum?{bone:maximum.bone,kind:maximum.kind,vertexIndex:maximum.vertexIndex,...maximum.maxPair}:null,weightedPointCount:weighted.length,allPointMaxTravelPixels:Math.max(0,...points.map(point=>point.maxTravelPixels)),sampleCount:samples.length,pairsPerPoint:samples.length*(samples.length-1)/2,bodyAlphaHeight,bodyAlphaHeights,bodyAlphaHeightBasis:'maximum across all sampled phases',targetFraction:.1,targetPixels,meetsInitialQATarget:maximum!==null&&maximum.maxTravelPixels>targetPixels,allPointsAreWeightedVertices:points.every(point=>point.kind==='dominant-forearm-skin-vertex')};
}
function allowedOwned(location,query,storage){try{return location?.protocol==='http:'&&['localhost','127.0.0.1','[::1]','::1'].includes(location.hostname)&&location.port==='8851'&&query.has('qa')&&query.has('qa-memory')&&query.get('qa-boss-owned-cleanup')==='1'&&isQAMemoryStorage(storage);}catch{return false;}}
function frozenSnapshot(value){const copy=JSON.parse(JSON.stringify(value));const freeze=item=>{if(item&&typeof item==='object'){for(const child of Object.values(item))freeze(child);Object.freeze(item);}return item;};return freeze(copy);}
const OWNED_NOTE=' Separate opt-in qa-boss-owned-cleanup=1 owned-lifecycle route. Legacy action QA is unchanged. Registered subsets are explicitly reported by selectedBossKeys/fullCatalogue and actual activeSamples/inactiveSamples; the840-sample catalogue description above applies only to the full catalogue, and omitted bosses remain unverified. The same original render, phases, hand-travel thresholds and pixel/source checks are retained. Every known owned registry/model/atlas Promise is registered before its await, and retirement can discover followers. Each owned atlas/model await has a separate15second timeout; the one overall15second event-driven cleanup deadline starts only in finalization. These deadlines do not cancel native loads or bound the complete correctness job. Original progress/image callback awaits are cancellation-raced, not a new globally timed caller-callback scheduler. Resource disposal and source-image close are attempted once per owned identity. Final maps, CPU/GPU helpers, surfaces and main-owner descriptors are inspected after the drain. Timeout/failure returns a fixed primitive snapshot; late accepted handlers still retire best-effort without changing that report. No Game/storage writes, source edits, performance measurements or product adoption. Current final12 registry models have no secondary walkFile loader graph; this cleanup proof does not cover unrelated loader internals.';

export async function compareBossActionLayerOwned(renderer,options={}){
 const location=options.location??globalThis.location,query=options.query??new URLSearchParams(location?.search??''),storage=options.storage;
 if(!allowedOwned(location,query,storage))return{report:{available:false,complete:false,reason:'8851-genuine-memory-qa-required'}};
 const timelineEnabled=descriptor(options,'timelineObservation')?.value===true;
 if(timelineEnabled){const keys=descriptor(options,'bossKeys')?.value;if(query.get('qa-boss-action-timeline')!=='1'||!Array.isArray(keys)||descriptor(keys,'length')?.value!==1||descriptor(keys,'0')?.value!=='boss-02-final')return{report:{available:false,complete:false,reason:'boss02-timeline-gate-required'}};}
 const foldEnabled=timelineEnabled&&descriptor(options,'boss02FoldProfile')?.value===true;
 if(foldEnabled&&query.get('qa-boss02-fold')!=='1')return{report:{available:false,complete:false,reason:'boss02-fold-gate-required'}};
 const {document=globalThis.document,signal,bossKeys=null,onProgress=()=>{},onImage=()=>{},testDeps}=options;
 const deps={Renderer:DefaultRenderer,ProductionArt:DefaultProductionArt,LiveBossRig:DefaultLiveBossRig,Cache:DefaultCache,createOwnedCleanupTracker:defaultOwnedCleanupTracker,MessageChannel:globalThis.MessageChannel,...testDeps};
 const {Renderer,ProductionArt,LiveBossRig,Cache}=deps;
 const controller=new AbortController(),reports=[],cleanup={errors:[],complete:false,closing:false,modelsRemaining:null,recordsRemaining:null,pendingRemaining:null,rawAlphaBytes:0,alphaReadbackBytes:0,batchInkBytes:0,lateScheduled:0,lateSettled:0,ownedDrain:null,trackerFinal:null,mainOwnersUnchanged:false,surfacesRemaining:null,surfacesReleased:false,framePoolSlotsRemaining:null,channelClosed:false,resourceRefsCleared:false,partialArtConstructorUnproven:false,partialRigConstructorUnproven:false,unownedArtRejected:false,unownedRigRejected:false,loadWait:{scheduled:0,cleared:0,fired:0,active:0},retired:{geometries:0,materials:0,textures:0,images:0,skeletons:0,helpers:0,renderers:0,contexts:0}};
 let originalOwners=null,originalArt=null,finals=[],art=null,rig=null,adapter=null,sheet=null,finished=false,completed=false,failed=false,primary,finalReport=null,rejectCancelled,channel=null,resumeYield=null,tracker=null,closing=false,activeRegistered=false;
 let artAttempted=false,rigAttempted=false,artOwned=false,rigOwned=false,channelAttempted=false,channelCreated=false;
 let temporalObservation=null;
 let foldPeakObservation=null;
 const followed=new Set(),settled=new WeakSet(),disposed=new WeakSet(),lostContexts=new WeakSet(),protectedResources=new WeakSet(),protectedRigs=new Set(),ownedSurfaces=new Set(),loadTimers=new Set();
 const cancelled=new Promise((_resolve,reject)=>{rejectCancelled=reject;});cancelled.catch(()=>{});
 const cleanupError=(where,error)=>{if(cleanup.errors.length<64)cleanup.errors.push({where,error:errorText(error)});};
 const attempt=(where,fn)=>{try{return fn();}catch(error){cleanupError(where,error);}};
 const ownersCurrent=()=>!!originalOwners&&OWNER_KEYS.every(key=>sameDescriptor(descriptor(renderer,key),originalOwners.get(key)));
 const check=()=>{need(!finished&&!controller.signal.aborted&&!signal?.aborted,'aborted');need(ownersCurrent(),'main-owner-changed');if(rig)need(!rig.lost&&!rig.error&&!rig.batch&&!rig.exactGPUAlphaBounds&&!rig.gpuPoseBounds&&!rig.directAlphaReadback&&!rig.cropNativeComposite&&!rig.batchInkComposite,'owned-original-cpu-path-required');};
 const wait=promise=>Promise.race([Promise.resolve(promise),cancelled]);
 const yieldUI=async()=>{check();await wait(new Promise(resolve=>{resumeYield=resolve;channel.port2.postMessage(0);}));check();};
 const ownObject=value=>value!==null&&(typeof value==='object'||typeof value==='function');
 function protect(value){if(ownObject(value))protectedResources.add(value);}
 function protectRoot(root){root?.traverse?.(object=>{protect(object.geometry);protect(object.skeleton);for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){protect(material);for(const value of Object.values(material))if(value?.isTexture){protect(value);protect(value.source?.data);}}});}
 function rememberProtected(){
  for(const surface of [renderer.canvas,renderer.ctx?.canvas,renderer.floor,renderer.minimapCanvas,renderer.nativeMaskCanvas])protect(surface);
  for(const key of ['liveBoss','liveEnemies']){const value=originalOwners.get(key)?.value;if(!value)continue;protectedRigs.add(value);for(const object of [value.renderer,value.models,value.pending,value.scene,value.framePool,value.framePool?.slots,value.gpuAlphaBounds,value.alphaReadback,value.batchInk])protect(object);for(const surface of [value.raw,value.ink,value.gpuRaw,value.batchInk?.image,value.renderer?.domElement])protect(surface);for(const slot of value.framePool?.slots??[]){protect(slot);for(const surface of [slot.image,slot.canvas,slot.body])protect(surface);}for(const model of value.models?.values?.()??[]){protect(model);protectRoot(model.root);protectRoot(model.subject);}}
  protect(originalArt.records);for(const record of originalArt.records?.values?.()??[]){protect(record);protect(record.image);protect(record.bodyAlpha);}
 }
 function disposeOnce(where,value,kind,fn){
  if(!ownObject(value)||disposed.has(value))return;
  if(protectedResources.has(value)){cleanupError(where,Error('boss-action-owned-protected-source'));return;}
  disposed.add(value);if(kind)cleanup.retired[kind]++;attempt(where,fn);
 }
 function shrink(value){
  if(!value)return;
  if(protectedResources.has(value))throw Error('boss-action-owned-protected-surface');
  ownedSurfaces.add(value);value.width=0;value.height=0;
 }
 function deleteSettled(promise){
  if(rigOwned&&!protectedResources.has(rig.pending)&&rig?.pending instanceof Map)for(const [key,value]of rig.pending)if(value===promise)rig.pending.delete(key);
 }
 function followOwned(promise,kind,key){
  if(!promise||typeof promise.then!=='function'||followed.has(promise))return;
  followed.add(promise);
  const retire=()=>{settled.add(promise);if(closing){attempt('late.release',release);attempt('late.pending-delete',()=>deleteSettled(promise));attempt('late.discover',discover);}};
  let accepted=false;try{accepted=tracker.follow(promise,{arm:'boss-actions',kind,key:String(key)},retire);}catch(error){cleanupError('tracker.follow',error);}
  if(!accepted){cleanupError('tracker.untracked',Error('boss-action-owned-untracked-promise'));Promise.resolve(promise).then(retire,retire);}
 }
 async function waitOwned(promise,kind,key){
  followOwned(promise,kind,key);check();
  const settings=testDeps?.loadWaitTestOptions,requested=settings?.timeoutMs;
  const timeoutMs=typeof requested==='number'&&finite(requested)?Math.max(1,Math.min(15000,Math.floor(requested))):15000;
  const setTimer=settings?.setTimer??setTimeout,clearTimer=settings?.clearTimer??clearTimeout;
  const token={armed:true,handle:null};loadTimers.add(token);cleanup.loadWait.scheduled++;
  try{
   const timeout=new Promise((_resolve,reject)=>{token.handle=setTimer(()=>{if(!token.armed)return;token.armed=false;loadTimers.delete(token);cleanup.loadWait.fired++;reject(Error('boss-action-owned-load-timeout-'+kind+'-'+key));},timeoutMs);});
   return await Promise.race([Promise.resolve(promise),cancelled,timeout]);
  }finally{
   if(token.armed){token.armed=false;loadTimers.delete(token);attempt('load.timer.clear',()=>{clearTimer(token.handle);cleanup.loadWait.cleared++;});}token.handle=null;
  }
 }
 function discover(){
  if(rigOwned&&!protectedResources.has(rig.pending)&&rig?.pending instanceof Map)for(const [key,promise]of rig.pending){followOwned(promise,'model',key);if(settled.has(promise)&&closing&&rig.pending.get(key)===promise)rig.pending.delete(key);}
  for(const [id,record]of (artOwned?(art?.records??[]):[]))if(record.promise)followOwned(record.promise,'atlas',id);
 }
 function retireModel(model){
  if(protectedResources.has(model)){cleanupError('model.protected',Error('boss-action-owned-protected-model'));return;}
  const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  const visit=object=>{if(object.geometry)geometries.add(object.geometry);if(object.skeleton)skeletons.add(object.skeleton);for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}};
  for(const root of new Set([model?.root,model?.subject].filter(Boolean)))attempt('model.traverse',()=>root.traverse(visit));
  const images=new Set();for(const value of textures)if(value.source?.data)images.add(value.source.data);
  for(const value of skeletons)disposeOnce('model.skeleton',value,'skeletons',()=>value.dispose?.());
  for(const value of geometries)disposeOnce('model.geometry',value,'geometries',()=>value.dispose?.());
  for(const value of materials)disposeOnce('model.material',value,'materials',()=>value.dispose?.());
  for(const value of textures)disposeOnce('model.texture',value,'textures',()=>value.dispose?.());
  for(const value of images)disposeOnce('model.image',value,'images',()=>value.close?.());
  attempt('model.history',()=>{model?.history?.records?.clear?.();if(model?.history)model.history.epoch=null;});
 }
 function releaseModelsExcept(keep){
  if(!rigOwned)return;if(protectedResources.has(rig.models)){cleanupError('model.map-protected',Error('boss-action-owned-protected-model-map'));return;}
  discover();for(const [key,model]of rig.models??[])if(!keep.has(key)){retireModel(model);attempt('model.delete',()=>{if(rig.models.get(key)===model)rig.models.delete(key);});const promise=rig.pending?.get(key);if(promise&&settled.has(promise)&&rig.pending.get(key)===promise)rig.pending.delete(key);}
  discover();
 }
 function releaseArtExcept(keep){
  if(!artOwned)return;
  if(protectedResources.has(art.records)||[...(art.records?.values?.()??[])].some(value=>protectedResources.has(value))){cleanupError('art.protected',Error('boss-action-owned-protected-art-records'));return;}
  discover();const kept=new Set(keep);
  for(const [id,record]of art.records??[])if(!kept.has(id))for(const image of [record.image,record.bodyAlpha])if(image&&typeof image.close==='function')disposeOnce('art.image',image,'images',()=>image.close());
  attempt('art.release',()=>art.releaseUnusedAssets(keep));discover();
 }
 function closeChannel(){
  const value=channel;channel=null;if(value){attempt('channel.handler',()=>{value.port1.onmessage=null;});attempt('channel.port1',()=>value.port1.close());attempt('channel.port2',()=>value.port2.close());}
  const resume=resumeYield;resumeYield=null;attempt('channel.resume',()=>resume?.());cleanup.channelClosed=channel===null;
 }
 function release(){
  discover();closeChannel();releaseModelsExcept(new Set());releaseArtExcept([]);
  if(rigOwned){
   disposeOnce('rig.alpha',rig.gpuAlphaBounds,'helpers',()=>rig.gpuAlphaBounds.dispose());
   disposeOnce('rig.alphaReadback',rig.alphaReadback,'helpers',()=>{rig.alphaReadback.dispose?.();for(const key of ['bottom','top','view','rows'])rig.alphaReadback[key]=null;rig.alphaReadback.capacity=0;});
   disposeOnce('rig.batchInk',rig.batchInk,'helpers',()=>rig.batchInk.release?.());
   disposeOnce('renderer.dispose',rig.renderer,'renderers',()=>rig.renderer?.dispose());
   if(rig.renderer&&!lostContexts.has(rig.renderer)&&!protectedResources.has(rig.renderer)){lostContexts.add(rig.renderer);cleanup.retired.contexts++;attempt('renderer.context-loss',()=>rig.renderer.forceContextLoss());}
   for(const value of [rig.raw,rig.ink,rig.gpuRaw,rig.renderer?.domElement])attempt('rig.surface',()=>shrink(value));
   if(protectedResources.has(rig.framePool)||protectedResources.has(rig.framePool?.slots))cleanupError('pool.protected',Error('boss-action-owned-protected-frame-pool'));
   else{for(const slot of rig.framePool?.slots??[]){if(protectedResources.has(slot)){cleanupError('pool.slot-protected',Error('boss-action-owned-protected-frame-slot'));continue;}for(const value of [slot.image,slot.canvas,slot.body])attempt('pool.surface',()=>shrink(value));attempt('pool.owner',()=>{slot.owner=null;});}attempt('pool.clear',()=>{if(rig.framePool?.slots)rig.framePool.slots.length=0;});}
   attempt('rig.scene',()=>{if(protectedResources.has(rig.scene))throw Error('boss-action-owned-protected-scene');rig.scene?.clear?.();});
   attempt('rig.frames',()=>{rig.frames=new WeakMap();rig.batch=null;});
  }
  attempt('adapter.surface',()=>shrink(adapter?.canvas));attempt('sheet.surface',()=>shrink(sheet));discover();
 }
 const abort=()=>{if(finished||controller.signal.aborted)return;controller.abort();closing=true;cleanup.closing=true;attempt('abort.release',release);rejectCancelled(Error('boss-action-layer-aborted'));};
 try{
  need(renderer&&typeof renderer==='object'&&!active.has(renderer),'already-active');need(!signal?.aborted,'aborted');need(Cache.enabled===false,'independent-image-cache-required');need(document&&typeof document.createElement==='function','owned-document-required');
  originalOwners=new Map(OWNER_KEYS.map(key=>[key,descriptor(renderer,key)]));need([...originalOwners.values()].every(d=>!d||Object.hasOwn(d,'value')),'data-owner-required');originalArt=originalOwners.get('productionArt')?.value;need(originalArt?.manifest,'original-manifest-required');rememberProtected();
  const catalogue=BOSS_CATALOG.filter(boss=>boss.role==='final');need(catalogue.length===12,'final-catalogue-required');
  need(bossKeys===null||Array.isArray(bossKeys)&&bossKeys.length>0&&bossKeys.length<=12&&new Set(bossKeys).size===bossKeys.length&&bossKeys.every(key=>typeof key==='string'&&catalogue.some(boss=>boss.id===key)),'registered-final-subset-required');
  finals=bossKeys===null?catalogue:catalogue.filter(boss=>bossKeys.includes(boss.id));
  tracker=deps.createOwnedCleanupTracker({...testDeps?.ownedCleanupTestOptions,timeoutMs:testDeps===undefined?15000:testDeps.ownedCleanupTestOptions?.timeoutMs??15000});
  need(tracker&&typeof tracker.follow==='function'&&typeof tracker.wait==='function'&&typeof tracker.snapshot==='function','owned-tracker-required');
  active.add(renderer);activeRegistered=true;signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();check();
  // The original correctness yield queue is not a simulation/cost clock.
  channelAttempted=true;channel=new deps.MessageChannel();channelCreated=true;channel.port1.onmessage=()=>{const resume=resumeYield;resumeYield=null;resume?.();};
  artAttempted=true;art=new ProductionArt({manifest:originalArt.manifest,baseURL:originalArt.baseURL,fetchImpl:originalArt.fetchImpl,ImageCtor:originalArt.ImageCtor,timeoutMs:originalArt.timeoutMs,onChange:null});artOwned=art!==originalArt&&!protectedResources.has(art.records)&&![...(art.records?.values?.()??[])].some(value=>protectedResources.has(value));cleanup.unownedArtRejected=!artOwned;need(artOwned,'owned-art-required');
  rigAttempted=true;rig=new LiveBossRig(foldEnabled?{size:SIZE,bossActionProfile:'boss02-fold-v1'}:{size:SIZE});
  rigOwned=!protectedRigs.has(rig)&&!protectedResources.has(rig.renderer);cleanup.unownedRigRejected=!rigOwned;
  if(rigOwned)followOwned(rig.registry,'registry','registry');
  need(rigOwned&&rig.size===SIZE,'owned512-rig-required');need(Object.hasOwn(rig,'bossActionLayerEnabled'),'candidate-integration-unavailable');
  need(![rig.models,rig.pending,rig.scene,rig.framePool,rig.framePool?.slots,...(rig.framePool?.slots??[])].some(value=>protectedResources.has(value)),'independent-owned-model-pool-required');
  const canvas=document.createElement('canvas');need(!protectedResources.has(canvas),'owned-canvas-required');canvas.width=canvas.height=SIZE;ownedSurfaces.add(canvas);adapter=Object.create(Renderer.prototype);Object.assign(adapter,{productionArt:art,liveBoss:rig,canvas,motionEnabled:true,onProductionChange:null});
  for(const [bossIndex,boss]of finals.entries()){
   check();await wait(onProgress({phase:'load',key:boss.id,bossKey:boss.id,index:bossIndex,total:finals.length}));check();
   const ids=[...new Set(Object.values(art.manifest.bosses[boss.id]||{}))];need(ids.length===2,'two-original-atlases-required');releaseModelsExcept(new Set([boss.id]));releaseArtExcept(ids);
   for(const id of ids){need(await waitOwned(art.load(id),'atlas',id)===true,'original-atlas-not-ready');check();}need(await waitOwned(rig.load(boss.id),'model',boss.id)===true,'original-model-not-ready');check();
   const model=rig.models.get(boss.id);need(model?.sampler?.skins?.length&&rig.models.size===1&&art.records.size===2,'bounded-original-model-required');
   const source=originalModelSnapshot(model),hands=handPoints(model),protectedBones=protectedPoints(model);need(protectedBones.length>=3,'protected-root-feet-unavailable');
   const flagBefore=descriptor(rig,'bossActionLayerEnabled');let flagExpected=flagBefore;
   const setFlag=value=>{need(sameDescriptor(descriptor(rig,'bossActionLayerEnabled'),flagExpected),'candidate-flag-owner-changed');rig.bossActionLayerEnabled=value;flagExpected=descriptor(rig,'bossActionLayerEnabled');};
   const ownCheck=()=>{check();need(rig.models.get(boss.id)===model&&sameDescriptor(descriptor(rig,'bossActionLayerEnabled'),flagExpected),'owned-model-or-flag-changed');};
   sheet=document.createElement('canvas');need(!protectedResources.has(sheet),'owned-sheet-required');ownedSurfaces.add(sheet);sheet.width=384;sheet.height=7*212;const sc=sheet.getContext('2d',{alpha:false});need(sc,'sheet-context-unavailable');sc.fillStyle='#192c33';sc.fillRect(0,0,sheet.width,sheet.height);sc.font='11px sans-serif';sc.textBaseline='top';
   const result={key:boss.id,name:boss.name,angles:[],inactive:[],handPointKinds:hands.map(point=>({bone:point.bone.name,kind:point.kind,vertexIndex:point.index,dominantWeight:point.kind==='dominant-forearm-skin-vertex'?point.weight:null})),protectedBones:protectedBones.map(point=>point.bone.name),source:null};reports.push(result);
   function render(actor,game,pose,progress){
    ownCheck();const before=rig.renderer.info.render.frame;actor.attackState=pose==='windup'?'windup':pose==='attack'?'charge':'walk';actor.attackTime=pose==='windup'?boss.skill.windup*(1-progress):pose==='attack'?actionDuration(boss)*(1-progress):0;actor.dead=pose==='death';actor.hp=actor.dead?0:boss.stats.hp;
    let selected;if(pose==='death'){const age=model.config.clips.death.duration*progress,fallback=art.bossFrame(boss.id,actor,{pose:'death',animationTime:age,simulationTime:game.time});need(fallback,'death-fallback-required');selected=rig.frame(boss.id,actor,game.time,fallback,{epoch:game.world,pose:'death',animationTime:age,height:art.manifest.assets[fallback.id]?.worldHeight||fallback.metadata.projection.subjectHeight});}else selected=Renderer.prototype.nativeEnemyFrame.call(adapter,actor,game.time,game,boss);
    ownCheck();const d=rig.diagnostics,draws=rig.renderer.info.render.frame-before;need(selected?.metadata?.liveRig&&selected.image?.width===SIZE&&selected.image.height===SIZE&&rig.frames.get(actor)?.selected===selected&&draws>0&&d?.key===boss.id&&d.clip===pose&&d.continuousSampling,'actual-private512-native-'+pose+'-required');
    need(!protectedResources.has(selected.image),'owned-native-surface-required');ownedSurfaces.add(selected.image);
    const layer=layerEvidence(d,flagExpected.value,pose,boss.skill.kind),bounds=selected.frame.alphaBounds,body=selected.placement?.bounds?.body;need(bounds&&[bounds.x,bounds.y,bounds.width,bounds.height].every(finite)&&bounds.x>=0&&bounds.y>=0&&bounds.width>0&&bounds.height>0&&bounds.x+bounds.width<=SIZE&&bounds.y+bounds.height<=SIZE&&selected.metadata.boundsKind==='alpha'&&body&&[body.left,body.top,body.right,body.bottom].every(finite),'body-alpha-or-placement-invalid');
    const rgba=selected.image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,SIZE,SIZE).data,feet=protectedPositions(protectedBones);need(rgba.length===SIZE*SIZE*4,'actual512-rgba-required');
    return{rgba,feet,image:selected.image,sample:{pose,progress,time:game.time,angle:actor.angle,nativeGLSubmissions:draws,clip:d.clip,sample:d.sample,sampleDensity:d.sampleDensity,liveRig:true,private512:true,layer,diagnostic:primitive(d),alphaBounds:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height},clipped:d.clipped===true,bodyPlacement:{left:selected.placement.bounds.body.left,top:selected.placement.bounds.body.top,right:selected.placement.bounds.body.right,bottom:selected.placement.bounds.body.bottom},hands:projectedHands(hands,rig.camera),rgbaHashFNV1a32:bytesHash(rgba)}};
   }
   try{
    const angleCount=boss.id==='boss-01-final'?16:4;
    for(let angleIndex=0;angleIndex<angleCount;angleIndex++){
     const angle=.35+angleIndex*Math.PI*2/angleCount;await wait(onProgress({phase:'angles',key:boss.id,bossKey:boss.id,index:bossIndex,angleIndex,angleCount}));ownCheck();
     const a=[],b=[],baseline=[];
     for(const enabled of [false,true]){
      setFlag(enabled);const actor=actorFixture(boss,100000+bossIndex*1000+angleIndex*10,angle),game={world:{},state:'playing',time:10};
      for(const [phaseIndex,[pose,progress]]of PHASES.entries()){
       game.time=10+(pose==='attack'?1:0)+progress;const frame=render(actor,game,pose,progress);(enabled?b:a).push(frame.sample);
       if(enabled){const control=baseline[phaseIndex];need(sameNumbers(frame.feet,control.feet),'root-feet-world-position-changed');frame.sample.feetAndHipsExact=true;frame.sample.rgbaDifference=byteDifference(control.rgba,frame.rgba);frame.sample.introducedClipping=!control.clipped&&frame.sample.clipped;}
       else baseline.push({rgba:frame.rgba,feet:frame.feet,clipped:frame.sample.clipped});
       if(angleIndex===0){sc.drawImage(frame.image,enabled?192:0,phaseIndex*212,192,192);sc.fillStyle=frame.sample.clipped?'#ffb57a':'#e5eadc';sc.fillText((enabled?'B layer':'A original')+' '+pose+' '+progress,enabled?196:4,phaseIndex*212+194);}
       if(phaseIndex%2===1)await yieldUI();
      }
     }
     const beforeTravel=handTravel(a),afterTravel=handTravel(b),changedPhases=b.filter(sample=>sample.rgbaDifference.differentComponents>0).length;
     need(changedPhases>0,'visible-candidate-change-missing-'+boss.id);
     result.angles.push({angle,original:a,candidate:b,changedPhases,feetAndHipsExact:true,introducedClipping:b.some(sample=>sample.introducedClipping),handTravel:{original:beforeTravel,candidate:afterTravel,deltaPixels:afterTravel.maxTravelPixels-beforeTravel.maxTravelPixels,initialQATargetPassed:afterTravel.meetsInitialQATarget}});baseline.length=0;
    }
    for(const [poseIndex,pose]of ['idle','walk','death'].entries()){
     let baseline=null,record=null;
     for(const enabled of [false,true]){
      setFlag(enabled);const actor=actorFixture(boss,200000+bossIndex*10+poseIndex,.35),game={world:{},state:'playing',time:30};
      if(pose==='walk'){Renderer.prototype.nativeEnemyFrame.call(adapter,actor,game.time,game,boss);ownCheck();actor.x+=boss.stats.speed*.3;game.time+=.3;}
      const frame=render(actor,game,pose,.43),bones=localBonePose(model);
      if(!enabled){baseline={rgba:frame.rgba,feet:frame.feet,bones};record={pose,original:frame.sample,candidate:null,differentComponents:null,bonesExact:false,feetAndHipsExact:false};}
      else{const diff=byteDifference(baseline.rgba,frame.rgba);need(diff.differentComponents===0&&sameNumbers(frame.feet,baseline.feet)&&sameNumbers(bones,baseline.bones),'inactive-original-'+pose+'-changed');Object.assign(record,{candidate:frame.sample,...diff,bonesExact:true,feetAndHipsExact:true});}
      await yieldUI();
     }
     result.inactive.push(record);
    }
    ownCheck();result.source=verifyOriginalModel(source);result.allProtectedExact=true;result.inactiveExact=result.inactive.every(record=>record.differentComponents===0&&record.bonesExact);result.introducedClipping=result.angles.some(angle=>angle.introducedClipping);result.unclipped=result.angles.every(angle=>[...angle.original,...angle.candidate].every(sample=>!sample.clipped))&&result.inactive.every(record=>!record.original.clipped&&!record.candidate.clipped);result.initialHandTravelTargetPassed=result.angles.some(angle=>angle.handTravel.initialQATargetPassed);
    await wait(onImage({key:boss.id,bossKey:boss.id,src:sheet.toDataURL('image/png'),alt:boss.id+' '+boss.name+' 원본·상체 후보 각7단계 비교',width:sheet.width,height:sheet.height}));ownCheck();
   }finally{attempt('flag.restore',()=>{if(sameDescriptor(descriptor(rig,'bossActionLayerEnabled'),flagExpected))Object.defineProperty(rig,'bossActionLayerEnabled',flagBefore);});attempt('sheet.close',()=>{if(sheet){if(protectedResources.has(sheet))throw Error('boss-action-owned-protected-sheet');sheet.width=sheet.height=1;}});sheet=null;}
  }
  check();need(reports.every(boss=>boss.unclipped),'nonclipping-quality-failed');
  if(timelineEnabled){
   if(foldEnabled)need(rig.models.get(finals[0].id)?.actionLayer?.profile==='boss02-fold-v1','boss02-fold-profile-required');
   const {observeBossActionTimeline}=await wait(import('./qa-boss-action-timeline.js'));
   const image=descriptor(options,'onTimelineImage'),preview=descriptor(options,'onTimelinePreview');need((!image||Object.hasOwn(image,'value')&&typeof image.value==='function')&&(!preview||Object.hasOwn(preview,'value')&&typeof preview.value==='function'),'timeline-data-callbacks-required');
   try{temporalObservation=await wait(observeBossActionTimeline({rig,art,adapter,boss:finals[0],document,check,wait,yieldUI,registerSurface:surface=>{need(!protectedResources.has(surface),'owned-timeline-surface-required');ownedSurfaces.add(surface);},onImage:image?.value,onPreview:preview?.value,Renderer,helpers:{originalModelSnapshot,verifyOriginalModel,handPoints,projectedHands,protectedPoints,protectedPositions,localBonePose,actorFixture,layerEvidence,byteDifference,sameNumbers,primitive}}));check();}
   catch(error){let partial;try{partial=error&&descriptor(error,'bossActionTimeline')?.value;}catch{}temporalObservation=partial||{complete:false,error:errorText(error)};throw error;}
  }
  if(foldEnabled){
   const {observeBossFoldPeaks}=await wait(import('./qa-boss-fold-peaks.js')),image=descriptor(options,'onFoldPeaksImage');need(!image||Object.hasOwn(image,'value')&&typeof image.value==='function','fold-peaks-data-callback-required');
   try{foldPeakObservation=await wait(observeBossFoldPeaks({rig,art,adapter,boss:finals[0],document,check,wait,yieldUI,registerSurface:surface=>{need(!protectedResources.has(surface),'owned-fold-peaks-surface-required');ownedSurfaces.add(surface);},onImage:image?.value,Renderer,helpers:{originalModelSnapshot,verifyOriginalModel,handPoints,projectedHands,protectedPoints,protectedPositions,actorFixture,layerEvidence,byteDifference,sameNumbers,primitive}}));check();}
   catch(error){let partial;try{partial=error&&descriptor(error,'bossFoldPeaks')?.value;}catch{}foldPeakObservation=partial||{complete:false,error:errorText(error)};throw error;}
  }
  completed=true;
 }catch(error){failed=true;primary=error;}
 finally{
  finished=true;closing=true;cleanup.closing=true;
  attempt('signal.detach',()=>signal?.removeEventListener('abort',abort));attempt('signal.abort',()=>controller.abort());
  attempt('owned.release',release);
  if(tracker)try{cleanup.ownedDrain=await tracker.wait();}catch(error){cleanupError('tracker.wait',error);}
  attempt('owned.final-release',release);
  if(tracker)attempt('tracker.final-snapshot',()=>{cleanup.trackerFinal=tracker.snapshot();});
  cleanup.partialArtConstructorUnproven=artAttempted&&!art;
  cleanup.partialRigConstructorUnproven=rigAttempted&&!rig;
  cleanup.partialChannelConstructorUnproven=channelAttempted&&!channelCreated;
  attempt('owned.final-snapshot',()=>{
   cleanup.modelsRemaining=rig?.models?.size??0;cleanup.recordsRemaining=art?.records?.size??0;cleanup.pendingRemaining=rig?.pending?.size??0;
   cleanup.rawAlphaBytes=rig?.gpuAlphaBounds?.rawBytes??0;cleanup.alphaReadbackBytes=rig?.alphaReadback?.capacity??0;cleanup.batchInkBytes=rig?.batchInk?.rawBytes??0;
   cleanup.framePoolSlotsRemaining=rig?.framePool?.slots?.length??0;
   for(const surface of ownedSurfaces)attempt('owned.final-surface',()=>shrink(surface));
   cleanup.surfacesRemaining=[...ownedSurfaces].filter(surface=>surface.width!==0||surface.height!==0).length;cleanup.surfacesReleased=cleanup.surfacesRemaining===0;
   cleanup.mainOwnersUnchanged=ownersCurrent();cleanup.loadWait.active=loadTimers.size;
  });
  const drain=cleanup.ownedDrain;cleanup.lateScheduled=drain?.scheduled??0;cleanup.lateSettled=drain?.completed??0;
  const current=cleanup.trackerFinal;
  cleanup.complete=cleanup.errors.length===0&&!cleanup.partialArtConstructorUnproven&&!cleanup.partialRigConstructorUnproven&&!cleanup.partialChannelConstructorUnproven&&!cleanup.unownedArtRejected&&!cleanup.unownedRigRejected&&drain?.success===true&&current?.success===true&&current.active===0&&current.scheduled===drain.scheduled&&current.completed===drain.completed&&cleanup.modelsRemaining===0&&cleanup.recordsRemaining===0&&cleanup.pendingRemaining===0&&cleanup.rawAlphaBytes===0&&cleanup.alphaReadbackBytes===0&&cleanup.batchInkBytes===0&&cleanup.framePoolSlotsRemaining===0&&cleanup.surfacesReleased&&cleanup.mainOwnersUnchanged&&cleanup.channelClosed&&cleanup.loadWait.active===0;
  if(cleanup.complete){
   if(adapter){adapter.productionArt=null;adapter.liveBoss=null;adapter.canvas=null;}
   rig=null;art=null;adapter=null;sheet=null;originalArt=null;originalOwners=null;followed.clear();protectedRigs.clear();ownedSurfaces.clear();cleanup.resourceRefsCleared=true;
  }
  if(activeRegistered)active.delete(renderer);
  finalReport=frozenSnapshot({available:true,complete:completed&&!failed&&cleanup.complete,injected:testDeps!==undefined,boundedOwnedCleanup:true,reports,selectedBossKeys:finals.map(boss=>boss.id),fullCatalogue:finals.length===12,activeSamples:reports.reduce((sum,boss)=>sum+boss.angles.length*PHASES.length*2,0),inactiveSamples:reports.reduce((sum,boss)=>sum+boss.inactive.length*2,0),cleanup,...(timelineEnabled?{temporalObservation}:{}),...(foldEnabled?{candidateProfile:'boss02-fold-v1',foldPeakObservation}:{}),note:NOTE+OWNED_NOTE});
 }
 if(failed){try{Object.defineProperty(primary,'bossActionLayerQA',{value:finalReport,enumerable:true,configurable:true});Object.defineProperty(primary,'cleanup',{value:finalReport.cleanup,enumerable:true,configurable:true});}catch{}throw primary;}
 if(!finalReport.complete){const error=Error('boss-action-layer-cleanup-failed');error.bossActionLayerQA=finalReport;error.cleanup=finalReport.cleanup;throw error;}
 return{report:finalReport};
}
