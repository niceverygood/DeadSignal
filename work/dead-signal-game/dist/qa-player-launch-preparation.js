import * as THREE from './player-rig/vendor/three.module.js';
import {NativeShaderWarmup} from './boss-rig/native-shader-warmup.js';
import {markFreshNativeUploadRig,prepareOriginalTextureUpload} from './boss-rig/native-texture-upload.js';

const OWN=Object.getOwnPropertyDescriptor,PROTO=Object.getPrototypeOf,APPLY=Reflect.apply,TRAVERSE=THREE.Object3D.prototype.traverse;
const MAP_GET=Map.prototype.get,MAP_ENTRIES=Map.prototype.entries;
const required=['getContext','getRenderTarget','getActiveCubeFace','getActiveMipmapLevel','getViewport','getScissor','getScissorTest','initTexture','resetState','setRenderTarget','setViewport','setScissor','setScissorTest','compileAsync'];
const note='QA-only preparation of the already loaded original run subject and current weapon root. A read-only union submits each original Texture identity at most once; baseline performs the same canonical normalization without uploads or shader compilation. Candidate compiles the two real roots without posing, reparenting, new source assets, bitmaps, render targets or extra drawing/pixel reads. initTexture and shader compilation may create GPU textures/programs. API readiness is not GPU completion or first-draw validation. Public renderer normalization is not historical raw GL-binding restoration, and a synchronous vendor compile failure does not certify private renderer stacks. Abort/timeout revoke readiness; vendor shader polling cannot be cancelled. This handle never disposes the caller-owned GPU, geometry, material, texture or image. The caller retires a failed/partial candidate. Timings include source-proof overhead, not FPS or peak memory.';
const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const text=error=>String(error?.message??error).slice(0,240);
function data(value,key,requiredValue=true){const d=object(value)?OWN(value,key):null;if(!d){if(requiredValue)throw Error('player-preparation-own-data-required: '+key);return undefined;}if(!('value'in d))throw Error('player-preparation-accessor-rejected: '+key);return d.value;}
function resolved(value,key){for(let at=value,depth=0;at&&depth<24;at=PROTO(at),depth++){const d=OWN(at,key);if(d){if(!('value'in d))throw Error('player-preparation-accessor-rejected: '+key);return d.value;}}return undefined;}
function noAccessors(value){for(const key of Object.getOwnPropertyNames(value)){const d=OWN(value,key);if(!('value'in d))throw Error('player-preparation-accessor-rejected: '+key);}}
function dimension(image,key){
 const own=OWN(image,key);if(own){if(!('value'in own))throw Error('player-preparation-image-accessor-rejected');return own.value;}
 for(const name of ['HTMLImageElement','ImageBitmap']){
  const ctor=globalThis[name],proto=ctor?.prototype,d=proto&&OWN(proto,key);
  if(d?.get&&Function.prototype.toString.call(d.get).includes('[native code]'))try{if(proto.isPrototypeOf(image))return APPLY(d.get,image,[]);}catch{}
 }
 throw Error('player-preparation-original-image-dimensions-required');
}
function sameDescriptor(a,b,ignoreValue=false){return !!a===!!b&&(!a||a.get===b.get&&a.set===b.set&&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&(ignoreValue||Object.is(a.value,b.value)));}
function nativeImageState(image){
 const proto=globalThis.HTMLImageElement?.prototype;if(!proto||PROTO(image)!==proto)return null;
 return{image,proto,fields:['src','currentSrc','complete','naturalWidth','naturalHeight'].map(key=>{const descriptor=OWN(proto,key);if(typeof descriptor?.get!=='function'||!Function.prototype.toString.call(descriptor.get).includes('[native code]'))throw Error('player-preparation-native-image-getter-required');return{key,descriptor,value:APPLY(descriptor.get,image,[])};})};
}

// CPU-only snapshots retain originals privately until dispose. The report
// receives counts/booleans only, never graph, typed-array or image references.
function sourceSnapshot(player,roots,scene,camera,surface){
 const objects=new Map(),arrays=new Map(),materials=new Set(),textures=new Set(),geometries=new Set(),nodes=new Set(),versions=new Map(),versionDescriptors=new Map();
 const keep=(value,material=false)=>{
  if(!object(value)||objects.has(value))return;
  const entries=Object.getOwnPropertyNames(value).filter(key=>key!=='_listeners'&&(!material||key!=='version')).map(key=>[key,OWN(value,key)]);
  objects.set(value,{proto:PROTO(value),entries,material});
 };
 const array=value=>{if(!value||arrays.has(value))return;if(ArrayBuffer.isView(value)&&!(value instanceof DataView)){arrays.set(value,{buffer:value.buffer,offset:value.byteOffset,length:value.byteLength,bytes:new Uint8Array(value.buffer,value.byteOffset,value.byteLength).slice()});}else if(Array.isArray(value)){const values=[];for(let i=0;i<value.length;i++){const d=OWN(value,String(i));if(!d||!('value'in d))throw Error('player-preparation-dense-data-array-required');values.push(d.value);}arrays.set(value,{values});}};
 const vector=value=>{if(!object(value))return;keep(value);array(data(value,'elements',false));};
 const transform=value=>{for(const key of ['position','quaternion','scale','rotation','matrix','matrixWorld','modelViewMatrix','normalMatrix','bindMatrix','bindMatrixInverse'])vector(data(value,key,false));array(data(value,'morphTargetInfluences',false));};
 const attribute=value=>{if(!object(value))return;keep(value);const storage=data(value,'data',false);if(storage){keep(storage);array(data(storage,'array'));}array(data(value,'array',false));};
 const geometry=value=>{
  if(!value||geometries.has(value))return;geometries.add(value);keep(value);
  const attrs=data(value,'attributes');noAccessors(attrs);keep(attrs);for(const a of Object.values(attrs))attribute(a);attribute(data(value,'index',false));
  const morph=data(value,'morphAttributes',false);if(morph){noAccessors(morph);keep(morph);for(const list of Object.values(morph)){array(list);for(const a of list)attribute(a);}}
  const groups=data(value,'groups',false);array(groups);for(const group of groups??[])keep(group);keep(data(value,'drawRange',false));
  for(const key of ['boundingBox','boundingSphere']){const bound=data(value,key,false);if(bound){keep(bound);for(const field of ['min','max','center'])vector(data(bound,field,false));}}
 };
 const texture=value=>{
  if(!value||textures.has(value))return;textures.add(value);noAccessors(value);keep(value);
  const source=data(value,'source');noAccessors(source);keep(source);const image=data(source,'data');if(!object(image))throw Error('player-preparation-original-image-required');noAccessors(image);keep(image);
  if(PROTO(image)!==Object.prototype&&!['HTMLImageElement','ImageBitmap'].some(name=>globalThis[name]?.prototype===PROTO(image)))throw Error('player-preparation-original-image-prototype-required');
  const imageGetter=OWN(THREE.Texture.prototype,'image');let proto=value;while(proto&&!OWN(proto,'image'))proto=PROTO(proto);const actual=proto&&OWN(proto,'image');if(actual?.get!==imageGetter?.get||actual?.set!==imageGetter?.set)throw Error('player-preparation-original-texture-image-required');
  const width=dimension(image,'width'),height=dimension(image,'height');if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('player-preparation-original-image-size-required');
  imageSizes.push({image,width,height});const nativeState=nativeImageState(image);if(nativeState)nativeImageStates.push(nativeState);for(const key of ['offset','repeat','center','matrix'])vector(data(value,key,false));array(data(value,'mipmaps',false));
 };
 const imageSizes=[],nativeImageStates=[];
 const material=value=>{
  if(!value||materials.has(value))return;materials.add(value);noAccessors(value);
  if(resolved(value,'isMeshBasicMaterial')!==true||resolved(value,'isNodeMaterial')||data(value,'envMap',false)!=null)throw Error('player-preparation-original-unlit-required');
  keep(value,true);versions.set(value,data(value,'version'));versionDescriptors.set(value,OWN(value,'version'));vector(data(value,'color',false));texture(data(value,'map',false));texture(data(value,'alphaMap',false));
 };
 const visit=node=>{
  if(nodes.has(node))return;nodes.add(node);keep(node);transform(node);const children=data(node,'children');array(children);
  for(const key of ['material','geometry','skeleton']){const d=OWN(node,key);if(d&&!('value'in d))throw Error('player-preparation-node-accessor-rejected: '+key);}
  const mat=data(node,'material',false);if(Array.isArray(mat)){array(mat);for(const value of mat)material(value);}else material(mat);geometry(data(node,'geometry',false));
  const skin=data(node,'skeleton',false);if(skin){keep(skin);const bones=data(skin,'bones');array(bones);for(const bone of bones){keep(bone);transform(bone);array(data(bone,'children'));}const inverses=data(skin,'boneInverses');array(inverses);for(const inverse of inverses)vector(inverse);array(data(skin,'boneMatrices'));}
 };
 for(const root of roots){if(!(root instanceof THREE.Object3D)||resolved(root,'traverse')!==TRAVERSE)throw Error('player-preparation-original-object3d-required');APPLY(TRAVERSE,root,[visit]);}
 keep(player);keep(scene);transform(scene);array(data(scene,'children'));keep(camera);transform(camera);for(const key of ['projectionMatrix','projectionMatrixInverse','matrixWorldInverse'])vector(data(camera,key,false));
 for(const key of ['clock','footPlanting','blend']){const value=data(player,key,false);if(value)keep(value);}
 const maps=['models','weapons','weaponLoads'].map(key=>{const map=data(player,key),entries=[...APPLY(MAP_ENTRIES,map,[])];if(key!=='weaponLoads')for(const [,value]of entries){keep(value);const sampler=data(value,'sampler',false);if(sampler)keep(sampler);}return{map,entries};});
 const canvases=[surface,...['canvas','body','ink','bottleCanvas'].map(key=>data(player,key,false))].filter(Boolean).map(canvas=>({canvas,width:dimensionCanvas(canvas,'width'),height:dimensionCanvas(canvas,'height')}));
 const counts={nodes:nodes.size,materials:materials.size,textures:textures.size,geometries:geometries.size,arrays:arrays.size,sourceBytes:[...arrays.values()].reduce((sum,a)=>sum+(a.bytes?.byteLength??a.values.length*8),0)};
 return{materials,versions,counts,
  current(){
   for(const [value,saved]of objects){if(PROTO(value)!==saved.proto)return false;const keys=Object.getOwnPropertyNames(value).filter(key=>key!=='_listeners'&&(!saved.material||key!=='version'));if(keys.length!==saved.entries.length||saved.entries.some(([key,d])=>!sameDescriptor(OWN(value,key),d)))return false;}
   for(const [value,saved]of arrays){if(saved.bytes){if(value.buffer!==saved.buffer||value.byteOffset!==saved.offset||value.byteLength!==saved.length)return false;const bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);for(let i=0;i<bytes.length;i++)if(bytes[i]!==saved.bytes[i])return false;}else if(value.length!==saved.values.length||saved.values.some((item,index)=>{const d=OWN(value,String(index));return !d||!('value'in d)||!Object.is(d.value,item);} ))return false;}
   for(const saved of imageSizes)if(dimension(saved.image,'width')!==saved.width||dimension(saved.image,'height')!==saved.height)return false;
   for(const saved of nativeImageStates)for(const field of saved.fields)if(!sameDescriptor(OWN(saved.proto,field.key),field.descriptor)||!Object.is(APPLY(field.descriptor.get,saved.image,[]),field.value))return false;
   for(const saved of canvases)if(dimensionCanvas(saved.canvas,'width')!==saved.width||dimensionCanvas(saved.canvas,'height')!==saved.height)return false;
   for(const saved of maps){const entries=[...APPLY(MAP_ENTRIES,saved.map,[])];if(entries.length!==saved.entries.length||entries.some(([key,value],index)=>key!==saved.entries[index][0]||value!==saved.entries[index][1]))return false;}
   for(const material of materials)if(!sameDescriptor(OWN(material,'version'),versionDescriptors.get(material),true)||data(material,'version')!==versions.get(material))return false;return true;
  },
  compiled(root){
   const occurrences=new Map();APPLY(TRAVERSE,root,[node=>{if(!node.isMesh&&!node.isPoints&&!node.isLine&&!node.isSprite)return;for(const value of Array.isArray(node.material)?node.material:node.material?[node.material]:[])occurrences.set(value,(occurrences.get(value)??0)+1);}]);
   for(const material of materials){const before=versions.get(material),after=data(material,'version'),count=occurrences.get(material)??0,allowed=material.transparent&&material.side===THREE.DoubleSide&&!material.forceSinglePass?2*count:0;if(after!==before&&after!==before+allowed)throw Error('player-preparation-unexpected-material-version');versions.set(material,after);}
  }
 };
}
function dimensionCanvas(canvas,key){const own=OWN(canvas,key);if(own){if(!('value'in own))throw Error('player-preparation-canvas-accessor-rejected');return own.value;}const proto=globalThis.HTMLCanvasElement?.prototype,d=proto&&OWN(proto,key);if(d?.get&&Function.prototype.toString.call(d.get).includes('[native code]')&&proto.isPrototypeOf(canvas))return APPLY(d.get,canvas,[]);throw Error('player-preparation-native-canvas-required');}

export async function prepareFreshPlayerLaunch(player,weapon,{enabled=false,signal,now=()=>performance.now(),timeoutMs=15000}={}){
 enabled=enabled===true;
 const report={enabled,prepared:false,ready:false,disposed:false,error:'',elapsedMs:0,totalPreparationMs:0,texturePreparationMs:0,shaderPreparationMs:0,frameBefore:null,frameAfter:null,preserved:false,sourceUnchanged:false,renderStateUnchanged:false,textureUpload:null,shaders:[],sourceCounts:null,cleanup:{detached:false,errors:[]},note};
 const controller=new AbortController(),detachTasks=[];let shader=new NativeShaderWarmup(),renderer,scene,camera,surface,gl,run,instance,roots,adapter,snapshot,state,timer,loss,restored,aborted,disposed=false,cancelled=false,generation=0,initialGeneration=0,resolveStop,shaderStart=null;
 let clockFn=now,playerRef=player,signalRef=signal;
 const clock=()=>{try{const n=clockFn?.();return Number.isFinite(n)?n:null;}catch{return null;}};const start=clock(),elapsed=at=>{const end=clock();return at!==null&&end!==null?Math.max(0,end-at):0;};
 const stopped=new Promise(resolve=>{resolveStop=resolve;});
 const fail=reason=>{if(cancelled||disposed)return;cancelled=true;report.ready=false;report.prepared=false;report.preserved=false;report.error||=text(reason);try{controller.abort();}catch{}resolveStop(false);detach();};
 function detach(){clearTimeout(timer);for(const release of detachTasks.splice(0).reverse())try{release();}catch(error){report.cleanup.errors.push(text(error));}try{shader?.dispose();}catch(error){report.cleanup.errors.push(text(error));}report.cleanup.detached=report.cleanup.errors.length===0;}
 function watch(target,name,fn,options){target.addEventListener(name,fn,options);const remove=()=>target.removeEventListener(name,fn);if(cancelled||disposed){try{remove();}catch(error){report.cleanup.errors.push(text(error));}throw Error('player-preparation-aborted-during-watch');}detachTasks.push(remove);report.cleanup.detached=false;}
 function release(){snapshot=state=adapter=roots=run=instance=renderer=scene=camera=surface=gl=shader=playerRef=player=signalRef=signal=clockFn=now=null;loss=restored=aborted=null;}
 function ownerCurrent(){return !disposed&&!cancelled&&!controller.signal.aborted&&!signalRef?.aborted&&generation===initialGeneration&&THREE.Cache.enabled===false&&data(playerRef,'ready')===true&&data(playerRef,'error',false)==null&&data(playerRef,'last')===null&&data(playerRef,'renderer')===renderer&&data(playerRef,'scene')===scene&&data(playerRef,'camera')===camera&&APPLY(MAP_GET,data(playerRef,'models'),['run'])===run&&run.subject===roots[0]&&APPLY(MAP_GET,data(playerRef,'weapons'),[weapon])===instance&&instance.root===roots[1]&&renderer.domElement===surface&&renderer.getContext()===gl&&!gl.isContextLost?.()&&renderer.info.render.frame===0&&!renderer.xr?.isPresenting&&scene.environment==null&&!renderer.shadowMap?.enabled;}
 function renderCurrent(){return renderer.getRenderTarget()===state.target&&renderer.getActiveCubeFace()===state.face&&renderer.getActiveMipmapLevel()===state.level&&renderer.getViewport(new THREE.Vector4()).equals(state.viewport)&&renderer.getScissor(new THREE.Vector4()).equals(state.scissor)&&renderer.getScissorTest()===state.scissorTest&&renderer.autoClear===state.autoClear&&renderer.outputColorSpace===state.outputColorSpace&&renderer.toneMapping===state.toneMapping&&renderer.toneMappingExposure===state.toneMappingExposure;}
 function validate(){if(!ownerCurrent())throw Error('player-preparation-owner-context-or-freshness-changed');report.sourceUnchanged=snapshot.current();report.renderStateUnchanged=renderCurrent();report.frameAfter=renderer.info.render.frame;if(!report.sourceUnchanged||!report.renderStateUnchanged)throw Error('player-preparation-original-source-or-state-changed');report.preserved=true;return true;}
 const handle={report,isReady(){if(!report.ready||disposed||cancelled)return false;try{return validate();}catch(error){fail(error);release();return false;}},dispose(){if(disposed)return;disposed=true;report.disposed=true;report.ready=false;try{controller.abort();}catch{}resolveStop(false);detach();release();}};
 try{
  if(signalRef?.aborted)throw Error('player-preparation-pre-aborted');
  if(THREE.Cache.enabled!==false||typeof weapon!=='string'||!weapon||data(playerRef,'ready')!==true||data(playerRef,'error',false)!=null||data(playerRef,'last')!==null)throw Error('player-preparation-fresh-loaded-player-required');
  renderer=data(playerRef,'renderer');scene=data(playerRef,'scene');camera=data(playerRef,'camera');run=APPLY(MAP_GET,data(playerRef,'models'),['run']);instance=APPLY(MAP_GET,data(playerRef,'weapons'),[weapon]);roots=[data(run,'subject'),data(instance,'root')];surface=data(renderer,'domElement');
  for(const name of required)if(typeof resolved(renderer,name)!=='function')throw Error('player-preparation-renderer-api-unavailable');
  for(const key of ['info','xr','shadowMap','capabilities','autoClear','outputColorSpace','toneMapping','toneMappingExposure']){const d=OWN(renderer,key);if(d&&!('value'in d))throw Error('player-preparation-renderer-accessor-rejected');}
  for(const [value,keys]of [[renderer.info,['render','memory']],[renderer.info?.render,['frame']],[renderer.info?.memory,['textures']],[renderer.xr,['isPresenting']],[renderer.shadowMap,['enabled']],[renderer.capabilities,['maxTextureSize']],[scene,['environment']]])for(const key of keys){const d=object(value)?OWN(value,key):null;if(d&&!('value'in d))throw Error('player-preparation-renderer-accessor-rejected');}
  if(renderer.info?.render?.frame!==0||renderer.info?.memory?.textures!==0||renderer.getRenderTarget()!==null||renderer.getActiveCubeFace()!==0||renderer.getActiveMipmapLevel()!==0||renderer.xr?.isPresenting||scene.environment!=null||renderer.shadowMap?.enabled)throw Error('player-preparation-fresh-default-unlit-context-required');
  gl=renderer.getContext();if(!gl||typeof resolved(gl,'isContextLost')==='function'&&gl.isContextLost())throw Error('player-preparation-context-lost');
  for(const name of ['addEventListener','removeEventListener'])if(typeof resolved(surface,name)!=='function')throw Error('player-preparation-context-events-required');
  snapshot=sourceSnapshot(playerRef,roots,scene,camera,surface);report.sourceCounts={...snapshot.counts};report.frameBefore=renderer.info.render.frame;
  state={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),level:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear,outputColorSpace:renderer.outputColorSpace,toneMapping:renderer.toneMapping,toneMappingExposure:renderer.toneMappingExposure};
  const union=Object.freeze({traverse(visitor){const seen=new Set();for(const root of roots)APPLY(TRAVERSE,root,[node=>{if(!seen.has(node)){seen.add(node);visitor(node);}}]);}});
  adapter={renderer,scene,camera,lost:false,batch:null,models:new Map([['qa-player-union',Object.freeze({subject:union})],['qa-player-run',Object.freeze({subject:roots[0]})],['qa-player-weapon',Object.freeze({subject:roots[1]})]])};markFreshNativeUploadRig(adapter);
  aborted=()=>fail('player-preparation-aborted');loss=()=>{generation++;fail('player-preparation-context-lost');};restored=()=>{generation++;fail('player-preparation-context-restored');};
  if(signalRef)watch(signalRef,'abort',aborted,{once:true});watch(surface,'webglcontextlost',loss);watch(surface,'webglcontextrestored',restored);
  timer=setTimeout(()=>fail('player-preparation-timeout'),Number.isFinite(timeoutMs)?Math.max(1,Math.min(15000,timeoutMs)):15000);if(signalRef?.aborted)throw Error('player-preparation-aborted');
  validate();const textureStart=clock();report.textureUpload=prepareOriginalTextureUpload(adapter,'qa-player-union',{enabled,signal:controller.signal});report.texturePreparationMs=elapsed(textureStart);
  if(report.textureUpload.error||!report.textureUpload.stateNormalized||report.textureUpload.submitted!==enabled)throw Error(report.textureUpload.error||'player-preparation-texture-normalization-failed');validate();
  if(enabled){
   shaderStart=clock();
   for(const [index,key]of ['qa-player-run','qa-player-weapon'].entries()){
    validate();const at=clock(),promise=shader.prepare(adapter,key,{signal:controller.signal,timeoutMs});snapshot.compiled(roots[index]);validate();
    const ready=await Promise.race([promise,stopped]);report.shaders.push({root:index===0?'run':'weapon',ready:ready===true,elapsedMs:elapsed(at)});if(ready!==true)throw Error(shader.lastError||'player-preparation-shader-unavailable');validate();
   }
   report.shaderPreparationMs=elapsed(shaderStart);
  }
  validate();clearTimeout(timer);report.prepared=report.ready=true;
 }catch(error){fail(error);detach();if(shaderStart!==null)report.shaderPreparationMs=elapsed(shaderStart);report.totalPreparationMs=report.elapsedMs=elapsed(start);release();return handle;}
 report.totalPreparationMs=report.elapsedMs=elapsed(start);return handle;
}
