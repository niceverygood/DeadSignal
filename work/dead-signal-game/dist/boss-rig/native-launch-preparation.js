import {LiveBossRig} from './live-boss.js';
import {Cache} from '../player-rig/vendor/three.module.js';
import {NativeShaderWarmup} from './native-shader-warmup.js';
import {markFreshNativeUploadRig,prepareOriginalTextureUploads} from './native-texture-upload.js';

const enemyKeys=new Set(['enemy-walker','enemy-runner','enemy-shield','enemy-screamer','enemy-gas','enemy-elite','enemy-collector']);
const ownValues=(object,material=false)=>Object.keys(object).filter(key=>key!=='_listeners'&&(!material||key!=='version')).map(key=>[key,object[key]]);
const unchanged=(object,saved,material=false)=>Object.keys(object).filter(key=>key!=='_listeners'&&(!material||key!=='version')).length===saved.length&&saved.every(([key,value])=>Object.hasOwn(object,key)&&Object.is(object[key],value));
function sourcesOf(models){
  const materials=new Map(),textures=new Map(),bindings=[];
  for(const model of models)model.subject.traverse(object=>{
    if(object.material)bindings.push({object,material:object.material,members:Array.isArray(object.material)?[...object.material]:null,geometry:object.geometry});
    for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){
      if(!materials.has(material))materials.set(material,{own:ownValues(material,true),color:material.color,r:material.color?.r,g:material.color?.g,b:material.color?.b});
      for(const texture of [material.map,material.alphaMap])if(texture&&!textures.has(texture))textures.set(texture,{own:ownValues(texture),source:texture.source,sourceOwn:ownValues(texture.source),image:texture.image,width:texture.image?.width,height:texture.image?.height,
        vectors:['offset','repeat','center'].map(key=>[key,texture[key],texture[key]?.x,texture[key]?.y]),matrix:texture.matrix,elements:texture.matrix?.elements?[...texture.matrix.elements]:null});
    }
  });
  return {materials,textures,bindings};
}
function sameSources(models,saved,versions){
  const current=sourcesOf(models);if(current.materials.size!==saved.materials.size||current.textures.size!==saved.textures.size)return false;
  if(current.bindings.length!==saved.bindings.length||current.bindings.some((binding,index)=>{const before=saved.bindings[index];return binding.object!==before.object||binding.material!==before.material||binding.geometry!==before.geometry||before.members&&(binding.members?.length!==before.members.length||binding.members.some((material,n)=>material!==before.members[n]));}))return false;
  for(const [material,before]of saved.materials)if(!current.materials.has(material)||!unchanged(material,before.own,true)||material.color!==before.color||!Object.is(material.color?.r,before.r)||!Object.is(material.color?.g,before.g)||!Object.is(material.color?.b,before.b)||versions&&material.version!==versions.get(material))return false;
  for(const [texture,before]of saved.textures){
    if(!current.textures.has(texture)||!unchanged(texture,before.own)||texture.source!==before.source||!unchanged(texture.source,before.sourceOwn)||texture.image!==before.image||texture.source.data!==before.image||texture.image?.width!==before.width||texture.image?.height!==before.height||texture.matrix!==before.matrix)return false;
    for(const [key,vector,x,y]of before.vectors)if(texture[key]!==vector||!Object.is(vector?.x,x)||!Object.is(vector?.y,y))return false;
    if(before.elements&&(texture.matrix.elements.length!==before.elements.length||before.elements.some((value,index)=>!Object.is(texture.matrix.elements[index],value))))return false;
  }
  return true;
}
function fresh(rig){return !rig?.batch&&rig?.renderer?.info?.render?.frame===0&&rig.renderer.info?.memory?.textures===0;}

// Optional native launch preparation. It never changes a caller's Renderer,
// Game, assets or save pointer. An already drawn/uploaded rig retains its cache:
// no duplicate context/model candidate is created for that case. A candidate
// owns only a bounded original roster until adopt() transfers its ownership.
// Texture APIs submit synchronously; shader readiness is not GPU completion or
// first-draw validation. Abort/timeout cannot cancel GLTF fetch or Three's shader
// polling, so cancellation immediately releases the candidate GPU context and
// separately releases any models that arrive from a late original load.
// Candidate bitmap cleanup assumes the default disabled global Three cache and
// independent GLTF parser/image ownership. A globally cached external image can
// be shared with an existing rig, so reject that mode without changing Cache.
export async function prepareNativeEnemyLaunch(keys,{signal,existingRig,createRig=()=>new LiveBossRig({size:256,registryFile:'enemy-registry.json'}),timeoutMs=15000}={}){
  try{
    if(Cache.enabled!==false||!Array.isArray(keys)||!keys.length||keys.length>3||new Set(keys).size!==keys.length||keys.some(key=>!enemyKeys.has(key))||signal?.aborted||typeof createRig!=='function')return null;
    if(existingRig&&(!fresh(existingRig)||existingRig.lost))return null;
  }catch{return null;}
  keys=[...keys];
  const controller=new AbortController(),shader=new NativeShaderWarmup();
  const report={keys:[...keys],textureUpload:null,shaders:[],prepared:false,error:'',note:'Original native texture submission and shader API readiness before launch; not GPU completion, measured FPS or first-draw validation. A maximum of three original enemy models is owned until adoption.'};
  let rig,renderer,scene,camera,surface,gl,models,subjects,sourceState,versions,ready=false,adopted=false,disposed=false,cancelled=false,gpuDisposed=false,timer,resolveStopped,lossListener,restoreListener;
  const stopped=new Promise(resolve=>{resolveStopped=resolve;});
  const releaseModels=()=>{try{if(rig?.models?.size)rig.releaseUnused([]);}catch{}};
  const detach=()=>{
    clearTimeout(timer);try{signal?.removeEventListener?.('abort',abortListener);}catch{}
    for(const [name,listener]of [['webglcontextlost',lossListener],['webglcontextrestored',restoreListener]])try{if(listener)surface?.removeEventListener?.(name,listener);}catch{}
    try{shader.dispose();}catch{}
  };
  const cleanup=()=>{
    detach();releaseModels();
    if(renderer&&!gpuDisposed){gpuDisposed=true;try{renderer.dispose?.();}catch{}try{renderer.forceContextLoss?.();}catch{}}
  };
  const cancel=reason=>{
    if(adopted||cancelled)return;cancelled=true;ready=false;report.prepared=false;report.error=reason;
    try{controller.abort();}catch{}cleanup();resolveStopped(null);
  };
  const abortListener=()=>cancel('native-launch-aborted');
  const ownerCurrent=()=>!cancelled&&!disposed&&!controller.signal.aborted&&!signal?.aborted&&(!existingRig||fresh(existingRig)&&!existingRig.lost)&&rig?.renderer===renderer&&rig.scene===scene&&rig.camera===camera&&renderer?.domElement===surface&&renderer.getContext()===gl&&!rig.lost&&!gl.isContextLost?.()&&!renderer.xr?.isPresenting&&!rig.batch&&renderer.info?.render?.frame===0&&scene.environment==null&&!renderer.shadowMap?.enabled;
  const current=()=>ownerCurrent()&&keys.every((key,index)=>rig.models?.get(key)===models[index]&&models[index].subject===subjects[index])&&sameSources(models,sourceState,versions);
  const isReady=()=>{
    if(!ready||adopted||disposed||cancelled)return false;
    try{if(current())return true;}catch{}
    cancel('native-launch-ready-candidate-stale');return false;
  };
  const race=promise=>Promise.race([promise,stopped]);
  try{
    signal?.addEventListener?.('abort',abortListener,{once:true});
    timer=setTimeout(()=>cancel('native-launch-timeout'),Number.isFinite(timeoutMs)?Math.max(1,Math.min(60000,timeoutMs)):15000);
    if(signal?.aborted){cancel('native-launch-aborted');return null;}
    const creation=Promise.resolve().then(()=>cancelled?null:createRig()).then(candidate=>{
      if(!candidate||candidate===existingRig)return null;
      rig=candidate;renderer=rig.renderer;
      if(cancelled){cleanup();return null;}
      return candidate;
    });
    const candidate=await race(creation);
    if(!candidate){cancel('native-launch-candidate-unavailable');return null;}
    if(!fresh(rig)||typeof rig.load!=='function'||typeof rig.releaseUnused!=='function'||typeof renderer?.dispose!=='function'||typeof renderer.forceContextLoss!=='function')throw Error('native-launch-fresh-owned-rig-required');
    scene=rig.scene;camera=rig.camera;surface=renderer.domElement;gl=renderer.getContext();
    if(!scene||!camera||!gl||typeof surface?.addEventListener!=='function'||typeof surface?.removeEventListener!=='function'||rig.size!==undefined&&rig.size!==256||!ownerCurrent())throw Error('native-launch-original-native-rig-unavailable');
    lossListener=()=>cancel('native-launch-context-lost');restoreListener=()=>cancel('native-launch-context-restored');
    surface.addEventListener('webglcontextlost',lossListener);surface.addEventListener('webglcontextrestored',restoreListener);
    markFreshNativeUploadRig(rig);
    for(const key of keys){
      if(!ownerCurrent())throw Error('native-launch-owner-changed-before-load');
      const load=Promise.resolve().then(()=>cancelled?false:rig.load(key));
      // Attach both late outcomes before racing. Loader requests have no abort
      // guarantee; after cancellation their newly loaded resources are released.
      load.then(()=>{if(cancelled&&!adopted)releaseModels();},()=>{if(cancelled&&!adopted)releaseModels();});
      const loaded=await race(load);
      if(loaded!==true||!ownerCurrent()||!rig.models?.get(key))throw Error('native-launch-original-model-load-failed');
    }
    models=keys.map(key=>rig.models.get(key));subjects=models.map(model=>model.subject);
    report.textureUpload=prepareOriginalTextureUploads(rig,keys,{enabled:true,signal:controller.signal});
    if(!report.textureUpload.submitted||!report.textureUpload.stateNormalized||report.textureUpload.error||!ownerCurrent())throw Error(report.textureUpload.error||'native-launch-original-texture-submission-failed');
    sourceState=sourcesOf(models);versions=new Map([...sourceState.materials.keys()].map(material=>[material,material.version]));
    for(let index=0;index<keys.length;index++){
      if(!current())throw Error('native-launch-original-source-changed-before-shader');
      const preparation=shader.prepare(rig,keys[index],{signal:controller.signal,timeoutMs});
      // compile is synchronous inside prepare. Only its normal material.version
      // bookkeeping for this original subject is accepted before awaiting it.
      subjects[index].traverse(object=>{for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[])versions.set(material,material.version);});
      const compiled=await race(preparation);report.shaders.push({key:keys[index],ready:compiled===true});
      if(compiled!==true||!current())throw Error(shader.lastError||'native-launch-shader-api-preparation-failed');
    }
    if(!current())throw Error('native-launch-prepared-source-or-owner-changed');
    clearTimeout(timer);ready=true;report.prepared=true;
    return {rig,report,isReady,
      adopt(){if(!isReady())return null;adopted=true;ready=false;detach();return rig;},
      dispose(){if(disposed)return;disposed=true;if(adopted){detach();return;}cancel('native-launch-candidate-disposed');}
    };
  }catch(error){cancel(error?.message??String(error));return null;}
}
