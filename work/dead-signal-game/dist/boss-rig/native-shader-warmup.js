import * as THREE from '../player-rig/vendor/three.module.js';

const required=['getContext','getRenderTarget','getActiveCubeFace','getActiveMipmapLevel','getViewport','getScissor','getScissorTest','setRenderTarget','setViewport','setScissor','setScissorTest','compileAsync'];
const message=error=>error?.message??String(error);
function materialsOf(subject){
  const materials=new Map();
  subject.traverse(object=>{
    for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[])
      if(material&&!materials.has(material))materials.set(material,material.side);
  });
  return materials;
}

// Explicit preparation of the already loaded, original native subject. Product
// callers use only a fresh owned launch candidate; live rigs are never warmed.
// This helper creates no meshes, materials, textures, canvases or render targets
// and never poses, reparents, draws or reads pixels from the loaded model. The
// compile-only guarantee is restricted to the existing unlit MeshBasicMaterial
// path without environment maps, node materials or enabled shadow rendering;
// generic Three compile can otherwise perform environment/shadow preparation.
// API readiness is not first-draw/pixel validation or measured GPU execution.
// Three's compile can change material.version normally (e.g. transparent double
// sided variants); preserve that normal cache bookkeeping and restore side only.
// A vendor synchronous compile failure can leave PRIVATE render-state stacks
// changed: restoring public state below does not certify that renderer healthy.
// Abort/timeout revoke our readiness certificate, not Three's internal polling:
// compileAsync has no cancellation API and its existing work can finish later.
export class NativeShaderWarmup {
  constructor(){this.lastError='';this.epoch=0;this.pending=new Set();this.ready=new WeakMap();this.watchers=new Map();}
  fail(reason){this.lastError=reason;return Promise.resolve(false);}
  invalidate(renderer,reason){
    this.ready=new WeakMap();
    for(const token of [...this.pending])if(token.renderer===renderer){this.lastError=reason;token.finish(false);}
  }
  watch(renderer,gl){
    let watch=this.watchers.get(renderer);const surface=renderer.domElement;
    if(watch&&(watch.surface!==surface||watch.gl!==gl)){
      this.detach(watch);this.watchers.delete(renderer);this.invalidate(renderer,'native-shader-context-replaced');watch=null;
    }
    if(watch)return watch;
    watch={renderer,surface,gl,generation:0,lost:false};
    watch.loss=()=>{watch.generation++;watch.lost=true;this.invalidate(renderer,'native-shader-context-lost');};
    watch.restore=()=>{watch.generation++;watch.lost=false;this.invalidate(renderer,'native-shader-context-restored');};
    // Real WebGL renderer canvases expose both methods. Reject unsupported
    // surfaces so a transient loss/restore cannot reuse an old certificate.
    if(typeof surface?.addEventListener!=='function'||typeof surface?.removeEventListener!=='function')throw Error('native-shader-context-events-unavailable');
    try{surface.addEventListener('webglcontextlost',watch.loss);surface.addEventListener('webglcontextrestored',watch.restore);}
    catch(error){this.detach(watch);throw error;}
    this.watchers.set(renderer,watch);return watch;
  }
  detach(watch){
    for(const [name,listener]of [['webglcontextlost',watch.loss],['webglcontextrestored',watch.restore]])
      try{watch.surface.removeEventListener(name,listener);}catch{}
  }
  identity(token,request){
    return token.rig===request.rig&&token.key===request.key&&token.model===request.model&&token.subject===request.subject&&token.renderer===request.renderer&&token.scene===request.scene&&token.camera===request.camera&&token.gl===request.gl&&token.watch===request.watch&&token.generation===request.generation&&token.epoch===request.epoch;
  }
  current(token){
    const {rig,key,model,subject,renderer,scene,camera,gl,watch}=token;
    return token.epoch===this.epoch&&rig.models?.get(key)===model&&model.subject===subject&&rig.renderer===renderer&&rig.scene===scene&&rig.camera===camera&&renderer.domElement===watch.surface&&this.watchers.get(renderer)===watch&&watch.generation===token.generation&&!watch.lost&&!rig.lost&&!gl.isContextLost?.()&&renderer.getContext()===gl&&!renderer.xr?.isPresenting;
  }
  sameMaterials(token){
    const current=materialsOf(token.subject);if(current.size!==token.materials.size)return false;
    if(token.scene.environment!=null||token.renderer.shadowMap?.enabled)return false;
    for(const [material,side]of token.materials)if(!current.has(material)||current.get(material)!==side||material.version!==token.versions.get(material)||material.isMeshBasicMaterial!==true||material.isNodeMaterial||material.envMap!=null)return false;
    return true;
  }
  prepare(rig,key,{timeoutMs=10000,signal}={}){
    let model,subject,renderer,scene,camera,gl,saved,watch,materials;
    try{
      if(signal?.aborted)return this.fail('native-shader-pre-aborted');
      model=rig?.models?.get(key);subject=model?.subject;renderer=rig?.renderer;scene=rig?.scene;camera=rig?.camera;
      if(!model||!subject||typeof subject.traverse!=='function'||!scene||!camera||!renderer||!required.every(name=>typeof renderer[name]==='function'))return this.fail('native-shader-unsupported-or-missing-model');
      gl=renderer.getContext();
      if(!gl||rig.lost||gl.isContextLost?.())return this.fail('native-shader-context-lost');
      if(renderer.xr?.isPresenting||renderer.getRenderTarget()!==null)return this.fail('native-shader-default-target-required');
      materials=materialsOf(subject);
      if(!materials.size)return this.fail('native-shader-native-materials-missing');
      if(scene.environment!=null||renderer.shadowMap?.enabled||[...materials.keys()].some(material=>material.isMeshBasicMaterial!==true||material.isNodeMaterial||material.envMap!=null))return this.fail('native-shader-original-unlit-path-required');
      watch=this.watch(renderer,gl);
      const request={rig,key,model,subject,renderer,scene,camera,gl,watch,generation:watch.generation,epoch:this.epoch};
      for(const token of [...this.pending]){
        if(this.identity(token,request))return token.promise;
        if(token.rig===rig&&token.key===key){this.lastError='native-shader-model-or-owner-replaced';token.finish(false);}
      }
      const ready=this.ready.get(rig)?.get(key);
      if(ready&&this.identity(ready,request)&&this.current(ready)&&this.sameMaterials(ready)){this.lastError='';return ready.promise;}
      saved={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),level:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear};
    }catch(error){return this.fail(message(error));}

    const token={rig,key,model,subject,renderer,scene,camera,gl,watch,generation:watch.generation,epoch:this.epoch,materials,versions:new Map(),settled:false};
    token.promise=new Promise(resolve=>{token.resolve=resolve;});
    token.finish=value=>{
      if(token.settled)return;token.settled=true;clearTimeout(token.timer);this.pending.delete(token);
      try{signal?.removeEventListener?.('abort',token.abort);}catch{}
      token.resolve(value);
    };
    token.abort=()=>{if(!token.settled){this.lastError='native-shader-aborted';token.finish(false);}};
    this.pending.add(token);
    let compiled,failure;
    try{
      signal?.addEventListener?.('abort',token.abort,{once:true});
      if(signal?.aborted){token.abort();return token.promise;}
      token.timer=setTimeout(()=>{if(!token.settled){this.lastError='native-shader-timeout';token.finish(false);}},Number.isFinite(timeoutMs)?Math.max(1,Math.min(60000,timeoutMs)):10000);
      // compileAsync invokes compile synchronously before its readiness polling.
      // Keep the existing subject/SkinnedMesh/materials and target scene intact.
      compiled=renderer.compileAsync(subject,camera,scene);
    }catch(error){failure=Error('native-shader-compile-failed-public-state-only: '+message(error));}
    finally{
      // Every restoration is attempted independently, including after a compile
      // throw. Nothing stays temporarily changed during asynchronous polling.
      const restores=[
        ...[...materials].map(([material,side])=>()=>{if(material.side!==side)material.side=side;}),
        ()=>renderer.setRenderTarget(saved.target,saved.face,saved.level),
        ()=>renderer.setViewport(saved.viewport),()=>renderer.setScissor(saved.scissor),
        ()=>renderer.setScissorTest(saved.scissorTest),()=>{if(renderer.autoClear!==saved.autoClear)renderer.autoClear=saved.autoClear;}
      ];
      for(const restore of restores)try{restore();}catch(error){failure??=error;}
      for(const material of materials.keys())try{token.versions.set(material,material.version);}catch(error){failure??=error;}
    }
    if(failure){this.lastError=message(failure);token.finish(false);}
    // Always attach rejection handling, even after a restoration failure or a
    // synchronous abort settled this token. It must not affect a newer flight.
    Promise.resolve(compiled).then(()=>{
      if(token.settled)return;
      try{
        if(!this.current(token)||!this.sameMaterials(token)){this.lastError='native-shader-stale-model-or-context';token.finish(false);return;}
        let ready=this.ready.get(rig);if(!ready){ready=new Map();this.ready.set(rig,ready);}ready.set(key,token);this.lastError='';token.finish(true);
      }catch(error){if(!token.settled){this.lastError=message(error);token.finish(false);}}
    },error=>{if(!token.settled){this.lastError=message(error);token.finish(false);}});
    return token.promise;
  }
  dispose(){
    this.epoch++;this.ready=new WeakMap();
    for(const token of [...this.pending])token.finish(false);
    for(const watch of this.watchers.values())this.detach(watch);this.watchers.clear();
  }
}
