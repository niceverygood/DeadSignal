import * as THREE from '../player-rig/vendor/three.module.js';

const ownedQARigs=new WeakSet();
export function markFreshNativeUploadRig(rig){if(rig&&(typeof rig==='object'||typeof rig==='function'))ownedQARigs.add(rig);return rig;}
export const markOriginalTextureQARig=markFreshNativeUploadRig;
const nativeEnemyKeys=new Set(['enemy-walker','enemy-runner','enemy-shield','enemy-screamer','enemy-gas','enemy-elite','enemy-collector']);
const required=['getContext','getRenderTarget','getActiveCubeFace','getActiveMipmapLevel','getViewport','getScissor','getScissorTest','initTexture','resetState','setRenderTarget','setViewport','setScissor','setScissorTest'];
const rejectedKinds=['isCubeTexture','isDataTexture','isData3DTexture','isDataArrayTexture','isCompressedTexture','isCompressedArrayTexture','isVideoTexture','isRenderTargetTexture','isFramebufferTexture','isExternalTexture','isDepthTexture','isCanvasTexture'];
// The first genuine upload registers Three's normal dispose listener and may
// create an own _listeners field. Keep that runtime bookkeeping intact; it is
// not original texture/source/material presentation data and is not rolled back.
const presentationKeys=object=>Object.keys(object).filter(key=>key!=='_listeners');
const ownState=object=>presentationKeys(object).map(key=>[key,object[key]]);
const sameOwnState=(object,saved)=>presentationKeys(object).length===saved.length&&saved.every(([key,value])=>Object.hasOwn(object,key)&&Object.is(object[key],value));
const errorText=error=>error?.message??String(error);
function textureState(texture,maxSize){
  const source=texture?.source,image=texture?.image,width=image?.width,height=image?.height;
  if(texture?.isTexture!==true||rejectedKinds.some(key=>texture[key])||!source||source.data!==image||!image||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>maxSize||height>maxSize||image.complete===false||source.dataReady===false||typeof image.getContext==='function'||'videoWidth'in image||ArrayBuffer.isView(image.data)||image.data instanceof ArrayBuffer||!Array.isArray(texture.mipmaps)||texture.mipmaps.length||texture.onUpdate!=null||!Number.isFinite(texture.version)||texture.version<=0||!Number.isFinite(source.version))throw Error('native-texture-static-original-2d-required');
  return {texture,source,image,width,height,textureOwn:ownState(texture),sourceOwn:ownState(source),version:texture.version,sourceVersion:source.version,
    vectors:['offset','repeat','center'].map(key=>[key,texture[key],texture[key]?.x,texture[key]?.y]),matrix:texture.matrix,matrixElements:texture.matrix?.elements?[...texture.matrix.elements]:null};
}
function originalMaterials(subjects){
  const materials=new Map(),textures=new Set(),bindings=[];
  for(const subject of subjects)subject.traverse(object=>{
    if(object.material)bindings.push({object,material:object.material,members:Array.isArray(object.material)?[...object.material]:null,geometry:object.geometry});
    for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){
      if(material?.isMeshBasicMaterial!==true||material.isNodeMaterial||material.envMap!=null)throw Error('native-texture-original-unlit-path-required');
      if(!materials.has(material))materials.set(material,{own:ownState(material),color:material.color,r:material.color?.r,g:material.color?.g,b:material.color?.b});
      if(material.map)textures.add(material.map);if(material.alphaMap)textures.add(material.alphaMap);
    }
  });
  if(!textures.size)throw Error('native-texture-original-map-list-empty');return {materials,textures:[...textures],bindings};
}
function sameOriginals(subjects,original,states){
  const current=originalMaterials(subjects);
  if(current.materials.size!==original.materials.size||current.textures.length!==original.textures.length||current.textures.some((texture,index)=>texture!==original.textures[index]))return false;
  if(current.bindings.length!==original.bindings.length||current.bindings.some((binding,index)=>{const saved=original.bindings[index];return binding.object!==saved.object||binding.material!==saved.material||binding.geometry!==saved.geometry||saved.members&&(binding.members?.length!==saved.members.length||binding.members.some((material,n)=>material!==saved.members[n]));}))return false;
  for(const [material,saved]of original.materials)if(!current.materials.has(material)||!sameOwnState(material,saved.own)||material.color!==saved.color||!Object.is(material.color?.r,saved.r)||!Object.is(material.color?.g,saved.g)||!Object.is(material.color?.b,saved.b))return false;
  for(const state of states){
    const {texture,source,image}=state;
    if(texture.source!==source||texture.image!==image||source.data!==image||image.width!==state.width||image.height!==state.height||!sameOwnState(texture,state.textureOwn)||!sameOwnState(source,state.sourceOwn)||texture.version!==state.version||source.version!==state.sourceVersion||texture.mipmaps.length||texture.onUpdate!=null||source.dataReady===false||image.complete===false||texture.matrix!==state.matrix)return false;
    for(const [key,vector,x,y]of state.vectors)if(texture[key]!==vector||!Object.is(vector?.x,x)||!Object.is(vector?.y,y))return false;
    if(state.matrixElements&&(texture.matrix.elements.length!==state.matrixElements.length||state.matrixElements.some((value,index)=>!Object.is(texture.matrix.elements[index],value))))return false;
  }
  return true;
}

// Explicit fresh-owned-rig preparation. initTexture submits the existing texture;
// synchronous submission cannot be interrupted and does not certify GPU work
// completed. No clones, needsUpdate writes, poses, drawing or pixel/error reads
// are made. Partial failure may leave GPU textures on this caller-owned rig;
// the caller owns rig cleanup. Never dispose/close original textures or images.
// submitted=true means all requested original initTexture calls returned with
// unchanged sources/owners and successful canonical normalization in this call.
// Any reported error returns submitted=false, even if some/all APIs already ran;
// that false result is neither rollback nor an asynchronous readiness promise.
// Canonical resetState keeps Three's GL bindings and private binding cache in
// sync while retaining its texture/program properties. This is NOT restoration
// of historical raw GL bindings, and is restricted to rigs that never drew.
function prepareTextureUnion(rig,keys,{enabled=false,signal}={},registeredKeysOnly=false){
  enabled=enabled===true;
  const report={submitted:false,enabled,textures:[],texturesBefore:null,texturesAfter:null,error:'',stateNormalized:false};
  let renderer,models,subjects,scene,camera,gl,saved,original,states;
  try{
    if(!ownedQARigs.has(rig))throw Error('native-texture-fresh-owned-qa-rig-required');
    if(signal?.aborted)throw Error('native-texture-pre-aborted');
    if(!Array.isArray(keys)||keys.length<1||keys.length>7||new Set(keys).size!==keys.length||registeredKeysOnly&&keys.some(key=>!nativeEnemyKeys.has(key)))throw Error('native-texture-valid-unique-enemy-keys-required');
    keys=[...keys];renderer=rig?.renderer;models=keys.map(key=>rig?.models?.get(key));subjects=models.map(model=>model?.subject);scene=rig?.scene;camera=rig?.camera;
    if(!renderer||!required.every(name=>typeof renderer[name]==='function')||models.some(model=>!model)||subjects.some(subject=>typeof subject?.traverse!=='function')||!scene||!camera)throw Error('native-texture-unsupported-or-missing-model');
    report.texturesBefore=renderer.info?.memory?.textures??null;report.texturesAfter=report.texturesBefore;
    if(rig.batch||renderer.info?.render?.frame!==0||report.texturesBefore!==0||renderer.getRenderTarget()!==null||renderer.getActiveCubeFace()!==0||renderer.getActiveMipmapLevel()!==0||renderer.xr?.isPresenting||scene.environment!=null||renderer.shadowMap?.enabled)throw Error('native-texture-fresh-default-unlit-rig-required');
    gl=renderer.getContext();if(!gl||rig.lost||gl.isContextLost?.())throw Error('native-texture-context-lost');
    const maxSize=renderer.capabilities?.maxTextureSize;if(!Number.isFinite(maxSize)||maxSize<=0)throw Error('native-texture-max-size-unavailable');
    original=originalMaterials(subjects);states=original.textures.map(texture=>textureState(texture,maxSize));
    report.textures=states.map(({texture,width,height,version,sourceVersion})=>({uuid:texture.uuid,width,height,version,sourceVersion}));
    saved={viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear};
  }catch(error){report.error=errorText(error);return report;}

  const current=()=>!signal?.aborted&&!rig.lost&&!gl.isContextLost?.()&&keys.every((key,index)=>rig.models?.get(key)===models[index]&&models[index].subject===subjects[index])&&rig.renderer===renderer&&rig.scene===scene&&rig.camera===camera&&renderer.getContext()===gl&&!renderer.xr?.isPresenting&&!rig.batch&&scene.environment==null&&!renderer.shadowMap?.enabled&&sameOriginals(subjects,original,states);
  try{
    if(!current())throw Error('native-texture-stale-source-owner-or-aborted');
    if(enabled)for(const texture of original.textures){if(!current())throw Error('native-texture-upload-interrupted-or-source-changed');renderer.initTexture(texture);}
    if(!current())throw Error('native-texture-post-upload-source-owner-or-aborted');
    report.submitted=enabled;
  }catch(error){report.error=errorText(error);}
  finally{
    // Apply exactly the same canonical normalization in every validated arm,
    // including enabled=false baseline. Each public restoration is independent
    // so one rejected setter cannot skip all remaining restoration attempts.
    let restorationError;
    for(const restore of [()=>renderer.resetState(),()=>renderer.setRenderTarget(null,0,0),()=>renderer.setViewport(saved.viewport),()=>renderer.setScissor(saved.scissor),()=>renderer.setScissorTest(saved.scissorTest),()=>{if(renderer.autoClear!==saved.autoClear)renderer.autoClear=saved.autoClear;}])try{restore();}catch(error){restorationError??=error;}
    report.stateNormalized=!restorationError;
    if(restorationError)report.error+=(report.error?'; ':'')+'native-texture-canonical-state-restore-failed: '+errorText(restorationError);
    try{report.texturesAfter=renderer.info?.memory?.textures??null;}catch{report.texturesAfter=null;}
  }
  try{if(!current()){report.submitted=false;report.error+=(report.error?'; ':'')+'native-texture-post-normalization-source-owner-or-aborted';}}
  catch(error){report.submitted=false;report.error+=(report.error?'; ':'')+errorText(error);}
  if(report.error)report.submitted=false;
  // No asynchronous lifetime certificate is kept. The caller separately checks
  // context generations after its shader-readiness await before the first draw.
  return report;
}
// Keep the historical single-key QA contract, including arbitrary loaded keys.
export function prepareOriginalTextureUpload(rig,key,options){return prepareTextureUnion(rig,[key],options);}
// Product preparation validates the fixed original enemy registry and uploads
// a union once, while the candidate is still fresh before any texture exists.
export function prepareOriginalTextureUploads(rig,keys,options){return prepareTextureUnion(rig,keys,options,true);}
