import * as THREE from './player-rig/vendor/three.module.js';
import {isQAMemoryStorage} from './qa-storage.js';
import {GPUAlphaBounds} from './boss-rig/gpu-alpha-bounds.js';

const installed=new WeakMap(),ownerKeys=['liveEnemies','liveEnemiesPromise','liveEnemiesLoading'];
const objectLike=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const ownData=(object,key)=>{const descriptor=objectLike(object)?Object.getOwnPropertyDescriptor(object,key):null;return descriptor&&'value'in descriptor?descriptor.value:undefined;};
const sameDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
const state=renderer=>({target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),level:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()).toArray(),scissor:renderer.getScissor(new THREE.Vector4()).toArray(),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear});
const sameState=(a,b)=>a.target===b.target&&a.face===b.face&&a.level===b.level&&a.scissorTest===b.scissorTest&&a.autoClear===b.autoClear&&JSON.stringify([a.viewport,a.scissor])===JSON.stringify([b.viewport,b.scissor]);
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:0;
const text=value=>typeof value==='string'?value:'';
const message=error=>{try{return typeof error?.message==='string'?error.message:'qa-gpu-alpha-launch-failed';}catch{return'qa-gpu-alpha-launch-failed';}};
function method(object,key){for(let owner=object;owner;owner=Object.getPrototypeOf(owner)){const descriptor=Object.getOwnPropertyDescriptor(owner,key);if(descriptor)return'value'in descriptor&&typeof descriptor.value==='function'?descriptor.value:null;}return null;}

// Explicit8851 memory-only instrumentation of the original launch service.
// It does not create a Game, initiate a launch, force a fresh hot rig, schedule
// ticks/renders, access storage or take ownership of an adopted product rig.
export function installAppGPUAlphaLaunchQA(renderer,{location,query,storage,fixture}={}){
 let mode;
 try{
  mode=query?.get('qa-loop-gpu-alpha');
  if(!['cpu','exact'].includes(mode)||location?.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(location.hostname)||location.port!=='8851'||!query.has('qa')||!query.has('qa-memory')||query.get('qa-loop')!=='1'||!isQAMemoryStorage(storage)||![60,180].includes(ownData(fixture,'count'))||ownData(fixture,'snapshotValid')!==true||!objectLike(renderer)||installed.has(renderer))return null;
 }catch{return null;}
 let descriptor,original;try{descriptor=Object.getOwnPropertyDescriptor(renderer,'prepareProductionEnemyLaunch');original=method(renderer,'prepareProductionEnemyLaunch');}catch{return null;}
 if(!original||descriptor&&!('value'in descriptor))return null;
 let stopped=false,sequence=0,flight=null,cached=null,wrappedDescriptor;
 const initial=()=>({mode,status:'idle',available:false,ready:false,adopted:false,error:'',token:0,nativePreparationMs:0,alphaWarmupMs:0,totalPreparationMs:0,commonOriginalTextureAndShaderPreparation:false,textureSubmitted:false,textureCount:0,shaderReadyCount:0,keyCount:0,nativeDrawsBefore:0,nativeDrawsAfter:0,stateRestored:false,ownerDescriptorsCurrent:false,alphaIdleLeaseMs:mode==='exact'?15000:0});
 let latest=initial();
 const reportError=(token,error)=>{if(!token.qa.error)token.qa.error=typeof error==='string'?error:message(error);};
 const detach=token=>{clearTimeout(token.timer);try{token.parent?.removeEventListener?.('abort',token.parentAbort);}catch{}token.parent=null;token.parentAbort=null;for(const name of ['webglcontextlost','webglcontextrestored'])try{token.surface?.removeEventListener?.(name,token.contextChange);}catch{}token.surface=null;token.contextChange=null;};
 const adopted=token=>token?.handle?.adopted===true;
 const disposeCandidate=token=>{
  if(!token?.handle||adopted(token)||token.disposed)return;token.disposed=true;
  const candidateRig=token.handle.candidate?.rig;
  if(candidateRig&&(candidateRig===token.initialRig||candidateRig===token.handle.old||candidateRig===renderer?.liveEnemies))return;
  try{token.handle.dispose();}catch(error){reportError(token,error);}
 };
 const cancel=(token,reason)=>{
  if(!token||token.cancelled)return;token.cancelled=true;detach(token);
  if(!adopted(token)){reportError(token,reason);token.qa.ready=false;token.qa.status='cancelled';try{token.controller.abort();}catch(error){reportError(token,error);}disposeCandidate(token);}
  token.resolveCancelled(null);
 };
 const ownerCurrent=token=>renderer&&ownerKeys.every(key=>sameDescriptor(Object.getOwnPropertyDescriptor(renderer,key),token.owners.get(key)));
 const alive=token=>!stopped&&flight===token&&!token.cancelled&&!token.controller.signal.aborted&&!token.parent?.aborted&&renderer&&sameDescriptor(Object.getOwnPropertyDescriptor(renderer,'prepareProductionEnemyLaunch'),wrappedDescriptor);
 const current=token=>alive(token)&&ownerCurrent(token);
 function acceptOriginalPendingOwner(token,handle){
  const before=token.owners.get('liveEnemies'),after=Object.getOwnPropertyDescriptor(renderer,'liveEnemies'),promise=token.owners.get('liveEnemiesPromise')?.value;
  if(sameDescriptor(before,after))return;
  // The original service explicitly permits its initial pending preload to
  // assign the old rig. Accept only that authenticated ordinary data write;
  // foreign owner values, descriptor edits and promise/loading edits are stale.
  if(before?.value!==undefined||!promise||!after||!('value'in after)||!after.value||handle.old!==after.value||handle.expectedRig!==after.value||handle.expectedPromise!==promise||!sameDescriptor(Object.getOwnPropertyDescriptor(renderer,'liveEnemiesPromise'),token.owners.get('liveEnemiesPromise'))||!sameDescriptor(Object.getOwnPropertyDescriptor(renderer,'liveEnemiesLoading'),token.owners.get('liveEnemiesLoading')))return;
  const ordinary=before?{...before,value:after.value}:{value:after.value,writable:true,configurable:true,enumerable:true};
  if(sameDescriptor(after,ordinary))token.owners.set('liveEnemies',after);
 }
 const flags=rig=>Object.assign(rig,{exactGPUAlphaBounds:mode==='exact',verifyExactGPUAlphaBounds:false,minGPUAlphaCells:12,gpuPoseBounds:false,verifyPoseBounds:false,directAlphaReadback:false,verifyAlphaReadback:false,cropNativeComposite:false,batchInkComposite:false});
 function optionsFor(args,controller){
  const value=args[1];if(value!==undefined&&!objectLike(value))return null;
  const descriptors=value===undefined?{}:Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(descriptors).some(key=>!('value'in descriptors[key])))return null;
  if(value)for(let proto=Object.getPrototypeOf(value);proto;proto=Object.getPrototypeOf(proto))if(Object.getOwnPropertyDescriptor(proto,'signal'))return null;
  const parent=descriptors.signal?.value;
  descriptors.signal={value:controller.signal,writable:true,configurable:true,enumerable:descriptors.signal?.enumerable??true};
  return{options:Object.defineProperties({},descriptors),parent};
 }
 async function run(receiver,args){
  if(flight)cancel(flight,'qa-gpu-alpha-launch-superseded');
  const controller=new AbortController(),configured=optionsFor(args,controller);
  if(!configured){latest={...initial(),status:'unavailable',error:'qa-gpu-alpha-launch-data-options-required'};return original.apply(receiver,args);}
  const qa={...initial(),status:'preparing',token:++sequence,keyCount:Array.isArray(args[0])?args[0].length:0},token={qa,controller,parent:configured.parent,owners:new Map(ownerKeys.map(key=>[key,Object.getOwnPropertyDescriptor(renderer,key)])),initialRig:renderer.liveEnemies,cancelled:false,disposed:false,handle:null,warmHelper:null,warmRows:null,resolveCancelled:null};
  const cancelled=new Promise(resolve=>{token.resolveCancelled=resolve;});
  const wait=promise=>Promise.race([Promise.resolve(promise),cancelled]);
  flight=token;latest=qa;const started=performance.now();
  try{
   token.parentAbort=()=>cancel(token,'qa-gpu-alpha-launch-aborted');
   token.parent?.addEventListener?.('abort',token.parentAbort,{once:true});
   token.timer=setTimeout(()=>cancel(token,'qa-gpu-alpha-launch-timeout'),15000);
   if(token.parent?.aborted){cancel(token,'qa-gpu-alpha-launch-aborted');return null;}
   const forwarded=[...args];forwarded[1]=configured.options;
   const pending=Promise.resolve(original.apply(receiver,forwarded));
   pending.then(handle=>{if(token.cancelled||stopped||flight!==token){token.handle=handle;disposeCandidate(token);}},()=>{});
   token.handle=await wait(pending);qa.nativePreparationMs=performance.now()-started;
   if(!alive(token)){cancel(token,'qa-gpu-alpha-launch-owner-or-token-changed');return null;}
   if(!token.handle){qa.status='unavailable';qa.error='qa-gpu-alpha-launch-original-candidate-unavailable';detach(token);return null;}
   acceptOriginalPendingOwner(token,token.handle);
   if(!current(token)){cancel(token,'qa-gpu-alpha-launch-owner-or-token-changed');return null;}
   const handle=token.handle,candidate=handle.candidate,rig=candidate?.rig,report=handle.report,glRenderer=rig?.renderer;
   if(!candidate||!rig||handle.adopted===true||handle.disposed===true||rig===handle.old||rig===token.initialRig||rig===renderer.liveEnemies||rig.size!==256||rig.batch||rig.lost||rig.error||!glRenderer||glRenderer.info?.render?.frame!==0||glRenderer.xr?.isPresenting||report?.prepared!==true||report.textureUpload?.submitted!==true||report.textureUpload?.stateNormalized!==true||report.textureUpload?.error||!Array.isArray(report.textureUpload?.textures)||!report.textureUpload.textures.length||!Array.isArray(report.shaders)||report.shaders.length!==qa.keyCount||!report.shaders.every(item=>item.ready===true)||qa.keyCount<1||qa.keyCount>3){cancel(token,'qa-gpu-alpha-launch-common-original-preparation-required');return null;}
   qa.commonOriginalTextureAndShaderPreparation=true;qa.textureSubmitted=true;qa.textureCount=report.textureUpload.textures?.length||0;qa.shaderReadyCount=report.shaders.length;qa.available=true;qa.nativeDrawsBefore=glRenderer.info.render.frame;
   token.surface=glRenderer.domElement;token.contextChange=()=>{if(adopted(token))reportError(token,'qa-gpu-alpha-launch-active-context-changed');else cancel(token,'qa-gpu-alpha-launch-prepared-context-changed');};
   token.surface?.addEventListener?.('webglcontextlost',token.contextChange);token.surface?.addEventListener?.('webglcontextrestored',token.contextChange);
   flags(rig);const savedState=state(glRenderer),warmStarted=performance.now();qa.alphaReadsBefore=number(rig.gpuAlphaBounds?.reads);
   if(mode==='exact'){
    rig.gpuAlphaBounds??=new GPUAlphaBounds();token.warmHelper=rig.gpuAlphaBounds;
    const ready=await wait(rig.gpuAlphaBounds.warmup(glRenderer,1024,768,12,{signal:controller.signal,timeoutMs:15000,idleLeaseMs:15000}));
    qa.alphaWarmupMs=performance.now()-warmStarted;
    if(!ready){cancel(token,'qa-gpu-alpha-launch-alpha-warmup-failed');return null;}
    token.warmRows=rig.gpuAlphaBounds.rowMaterial;
   }
   qa.nativeDrawsAfter=glRenderer.info.render.frame;qa.alphaReadsAfter=number(rig.gpuAlphaBounds?.reads);qa.stateRestored=sameState(savedState,state(glRenderer));qa.ownerDescriptorsCurrent=ownerCurrent(token);
   if(!current(token)||qa.nativeDrawsAfter!==0||!qa.stateRestored||!candidate.isReady()){cancel(token,'qa-gpu-alpha-launch-ready-candidate-stale');return null;}
   if(!current(token)){cancel(token,'qa-gpu-alpha-launch-owner-or-token-changed');return null;}
   qa.totalPreparationMs=performance.now()-started;qa.ready=true;qa.status='ready';clearTimeout(token.timer);
   // Preserve the original wrapper/candidate and its adoption protocol. Keep
   // the parent abort link alive through LaunchGate's later synchronous commit.
   report.qaGPUAlpha={...qa,minGPUAlphaCells:12,verifyExactGPUAlphaBounds:false,alphaWarmupEnabled:mode==='exact',note:'QA-only original common texture/shader preparation; exact alpha compile API readiness and15s idle lease, zero preparation draws. Not GPU completion or first-draw validation.'};
   return handle;
  }catch(error){reportError(token,error);cancel(token,'qa-gpu-alpha-launch-failed');throw error;}
  finally{qa.totalPreparationMs=performance.now()-started;if(!qa.ready||token.cancelled)detach(token);}
 }
 const wrapper=function(...args){if(stopped||this!==renderer)return original.apply(this,args);return run(this,args);};
 try{Object.defineProperty(renderer,'prepareProductionEnemyLaunch',descriptor?{...descriptor,value:wrapper}:{value:wrapper,writable:true,configurable:true,enumerable:false});}catch{return null;}
 wrappedDescriptor=Object.getOwnPropertyDescriptor(renderer,'prepareProductionEnemyLaunch');
 function snapshot(){
  if(stopped)return{...cached};
  const rig=renderer.liveEnemies,helper=rig?.gpuAlphaBounds,stats=rig?.gpuAlphaStats,warm=helper?.warmReady,now=performance.now(),isAdopted=adopted(flight),leaseUntil=number(warm?.idleLeaseUntil);
  if(isAdopted){latest.adopted=true;detach(flight);}
  return{...latest,stopped:false,adopted:isAdopted,activeGPUEnabled:rig?.exactGPUAlphaBounds===true,activeMinGPUAlphaCells:number(rig?.minGPUAlphaCells),nativeRendererFrame:number(rig?.renderer?.info?.render?.frame),activeGPUCells:number(stats?.frames),activeGPUReads:number(helper?.reads),activeGPUReadBytes:number(stats?.bytesRead),activeGPUFallbacks:number(stats?.fallbacks),activeGPUMismatches:number(stats?.mismatches),rawAlphaBytes:number(helper?.rawBytes),gpuCopyWidth:number(rig?.gpuRaw?.width),gpuCopyHeight:number(rig?.gpuRaw?.height),cpuRawWidth:number(rig?.raw?.width),cpuRawHeight:number(rig?.raw?.height),rigError:text(rig?.error),rigLost:rig?.lost===true,alphaError:text(helper?.lastError),warmHelperAlive:!!(flight?.warmHelper&&helper===flight.warmHelper),warmMaterialAlive:!!(flight?.warmRows&&helper?.rowMaterial===flight.warmRows),warmReady:!!warm,warmLeaseActive:!!(warm&&helper.reads===warm.readsAtWarmup&&now<leaseUntil),warmLeaseRemainingMs:Math.max(0,leaseUntil-now)};
 }
 const api={mode,snapshot,stop(){
  if(stopped)return{...cached};cached=snapshot();stopped=true;
  if(flight){cancel(flight,'qa-gpu-alpha-launch-stopped');detach(flight);flight=null;}
  try{if(sameDescriptor(Object.getOwnPropertyDescriptor(renderer,'prepareProductionEnemyLaunch'),wrappedDescriptor)){if(descriptor)Object.defineProperty(renderer,'prepareProductionEnemyLaunch',descriptor);else delete renderer.prepareProductionEnemyLaunch;cached.methodRestored=true;}else cached.methodRestored=false;}catch(error){cached.error||=message(error);cached.methodRestored=false;}
  if(!cached.adopted){cached.ready=false;cached.status='stopped';cached.error||=latest.error;}
  installed.delete(renderer);renderer=null;cached.stopped=true;return{...cached};
 }};
 installed.set(renderer,api);return api;
}
