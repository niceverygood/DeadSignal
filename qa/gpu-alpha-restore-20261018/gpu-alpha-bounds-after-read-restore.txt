import * as THREE from '../player-rig/vendor/three.module.js';
export const GPU_ALPHA_CELL_SIZE=256,GPU_ALPHA_MAX_CELLS=12;
export function decodeGPUAlphaBounds(bytes,count){
 if(!bytes||!Number.isInteger(count)||count<1||count>GPU_ALPHA_MAX_CELLS||bytes.length<count*4)return null;
 return Array.from({length:count},(_,i)=>{const n=i*4,left=bytes[n],top=bytes[n+1],right=bytes[n+2],bottom=bytes[n+3];return right<left||bottom<top?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};});
}
const vertex=`precision highp float;
in vec3 position;
void main(){gl_Position=vec4(position,1.0);}`;
const rowsFragment=`precision highp float;
precision highp int;
uniform sampler2D originalAtlas;
uniform int atlasHeight;
uniform int columns;
out vec4 result;
void main(){
 int cell=int(gl_FragCoord.x),row=int(gl_FragCoord.y);
 int sourceX=(cell%columns)*256,sourceY=atlasHeight-1-(cell/columns)*256-row;
 int left=255,right=0;
 for(int x=0;x<256;x++){
  float a=texelFetch(originalAtlas,ivec2(sourceX+x,sourceY),0).a;
  if(floor(a*255.0+0.5)>=8.0){left=min(left,x);right=max(right,x);}
 }
 result=vec4(float(left)/255.0,float(right)/255.0,0.0,1.0);
}`;
const boundsFragment=`precision highp float;
precision highp int;
uniform sampler2D rowBounds;
out vec4 result;
void main(){
 int cell=int(gl_FragCoord.x),left=255,top=255,right=0,bottom=0;
 for(int y=0;y<256;y++){
  ivec2 row=ivec2(floor(texelFetch(rowBounds,ivec2(cell,y),0).rg*255.0+0.5));
  if(row.y>=row.x){left=min(left,row.x);right=max(right,row.y);top=min(top,y);bottom=max(bottom,y);}
 }
 result=vec4(float(left),float(top),float(right),float(bottom))/255.0;
}`;
const material=(fragment,uniforms)=>new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,uniforms,depthTest:false,depthWrite:false,blending:THREE.NoBlending,transparent:false,premultipliedAlpha:false,toneMapped:false,dithering:false});
const target=(width,height)=>new THREE.WebGLRenderTarget(width,height,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,internalFormat:'RGBA8',minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false,colorSpace:THREE.NoColorSpace,depthBuffer:false,stencilBuffer:false,samples:0});

// Keep the original private256px colour compositor. This helper measures exact
// byte-alpha>=8 bounds; no geometry approximation or stale pose is substituted.
export class GPUAlphaBounds {
 constructor(){this.reads=0;this.fallbacks=0;this.lastError='';this.rawBytes=0;this.bytesRead=0;this.buffer=new Uint8Array(GPU_ALPHA_MAX_CELLS*4);}
 // Explicit QA preparation only. compileAsync readiness is not shader/pixel
 // validation, and may leave first uniform/attribute costs for the first read.
 warmup(renderer,width=1024,height=768,count=12,{signal,timeoutMs=10000,idleLeaseMs=0}={}){
  const required=['getContext','getRenderTarget','getViewport','getScissor','getScissorTest','getActiveCubeFace','getActiveMipmapLevel','setRenderTarget','setViewport','setScissor','setScissorTest','compileAsync'];
  const leaseMs=Number.isFinite(idleLeaseMs)?Math.max(0,Math.min(30000,idleLeaseMs)):0;
  let gl,saved;
  try{
   if(!renderer||!required.every(key=>typeof renderer[key]==='function')||signal?.aborted||!Number.isInteger(count)||count<1||count>12||!Number.isInteger(width)||!Number.isInteger(height)||width<256||height<256||width%256||height%256||width>1024||width*height>12*256*256||count>width*height/(256*256))return Promise.resolve(false);
   gl=renderer.getContext();if(!gl||gl.isContextLost?.()||renderer.xr?.isPresenting||renderer.getRenderTarget()!==null)return Promise.resolve(false);
   if(this.warmFlight)return this.warmFlight.owner===renderer&&this.warmFlight.width===width&&this.warmFlight.height===height&&this.warmFlight.count===count?this.warmFlight.promise:Promise.resolve(false);
   if(this.warmReady?.owner===renderer&&this.warmReady.rows===this.rowMaterial&&this.warmReady.bounds===this.boundsMaterial&&this.owner===renderer&&this.width===width&&this.height===height&&this.rows?.width===count){this.warmReady.idleLeaseUntil=performance.now()+leaseMs;this.warmReady.readsAtWarmup=this.reads;return Promise.resolve(true);}
   saved={viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear,face:renderer.getActiveCubeFace(),level:renderer.getActiveMipmapLevel()};
  }catch(error){this.lastError=error.message;return Promise.resolve(false);}
  let token,compiled,mesh,oldMaterial;
  try{
   this.prepare(renderer,width,height,count);mesh=this.mesh;oldMaterial=mesh.material;this.warmReady=null;
   token={owner:renderer,width,height,count,source:this.source,rows:this.rowMaterial,bounds:this.boundsMaterial,idleLeaseMs:leaseMs,settled:false};
   token.promise=new Promise(resolve=>{token.resolve=resolve;});
   token.finish=value=>{if(token.settled)return;token.settled=true;clearTimeout(token.timer);try{signal?.removeEventListener?.('abort',token.abort);}catch{}if(this.warmFlight===token)this.warmFlight=null;token.resolve(value);};
   this.warmFlight=token;
   token.abort=()=>{if(this.warmFlight===token){this.lastError='gpu-alpha-warmup-aborted';this.dispose();}else token.finish(false);};
   signal?.addEventListener?.('abort',token.abort,{once:true});
   token.timer=setTimeout(()=>{if(this.warmFlight===token){this.lastError='gpu-alpha-warmup-timeout';this.dispose();}},Number.isFinite(timeoutMs)?Math.max(1,Math.min(60000,timeoutMs)):10000);
   // Both materials use the same non-XR target colour-space conditions. The
   // vendor compile traversal prepares every material in the array, no draws.
   renderer.setRenderTarget(this.rows);mesh.material=[this.rowMaterial,this.boundsMaterial];
   compiled=renderer.compileAsync(this.scene,this.camera);
  }catch(error){this.lastError=error.message;this.dispose();}
  finally{
   if(mesh)mesh.material=oldMaterial;
   let restorationError;for(const restore of [()=>renderer.setRenderTarget(null,saved.face,saved.level),()=>renderer.setViewport(saved.viewport),()=>renderer.setScissor(saved.scissor),()=>renderer.setScissorTest(saved.scissorTest),()=>{renderer.autoClear=saved.autoClear;}])try{restore();}catch(error){restorationError??=error;}
   if(restorationError){this.lastError=restorationError.message;this.dispose();}
  }
  if(!token)return Promise.resolve(false);
  // Never hold an FBO or temporary material while readiness is polled. A late
  // completion from disposed resources must not affect a replacement flight.
  Promise.resolve(compiled).then(()=>{
   if(token.settled)return;
   if(this.warmFlight!==token||this.owner!==renderer||this.source!==token.source||this.rowMaterial!==token.rows||this.boundsMaterial!==token.bounds||gl.isContextLost?.()||renderer.xr?.isPresenting){if(this.warmFlight===token)this.dispose();else token.finish(false);return;}
   this.lastError='';this.warmReady={owner:renderer,rows:token.rows,bounds:token.bounds,idleLeaseUntil:performance.now()+leaseMs,readsAtWarmup:this.reads};token.finish(true);
  }).catch(error=>{if(this.warmFlight===token){this.lastError=error.message;this.dispose();}else token.finish(false);});
  return token.promise;
 }
 retainWarmupResources(now=performance.now()){
  return !!(this.warmFlight?.idleLeaseMs>0||(this.warmReady&&this.reads===this.warmReady.readsAtWarmup&&now<this.warmReady.idleLeaseUntil));
 }
 prepare(renderer,width,height,count){
  if(this.warmFlight)this.dispose();
  if(this.owner!==renderer){this.dispose();this.owner=renderer;const surface=renderer.domElement;if(typeof surface?.addEventListener==='function'){this.contextSurface=surface;this.contextLossListener=()=>this.dispose();surface.addEventListener('webglcontextlost',this.contextLossListener);}}
  if(!this.source||this.width!==width||this.height!==height){this.source?.dispose();this.source=new THREE.FramebufferTexture(width,height);this.source.colorSpace=THREE.NoColorSpace;this.source.internalFormat='RGBA8';this.width=width;this.height=height;}
  if(!this.scene){
   this.rows=target(count,256);this.bounds=target(count,1);this.geometry=new THREE.PlaneGeometry(2,2);
   this.rowMaterial=material(rowsFragment,{originalAtlas:{value:this.source},atlasHeight:{value:height},columns:{value:width/256}});
   this.boundsMaterial=material(boundsFragment,{rowBounds:{value:this.rows.texture}});
   this.mesh=new THREE.Mesh(this.geometry,this.rowMaterial);this.mesh.frustumCulled=false;this.scene=new THREE.Scene();this.scene.add(this.mesh);this.camera=new THREE.Camera();
  }
  if(this.rows.width!==count){this.rows.setSize(count,256);this.bounds.setSize(count,1);}
  this.rowMaterial.uniforms.originalAtlas.value=this.source;this.rowMaterial.uniforms.atlasHeight.value=height;this.rowMaterial.uniforms.columns.value=width/256;
  this.boundsMaterial.uniforms.rowBounds.value=this.rows.texture;
  this.rawBytes=(width*height+count*256+count)*4; // Active rawRGBA targets only, not actual GPU memory.
 }
 read(renderer,width,height,count,{size=256}={}){
  if(this.warmFlight){this.fallbacks++;return null;}
  const required=['getContext','getRenderTarget','getViewport','getScissor','getScissorTest','getActiveCubeFace','getActiveMipmapLevel','copyFramebufferToTexture','setRenderTarget','setViewport','setScissor','setScissorTest','render','readRenderTargetPixels'];
  if(!renderer||!required.every(key=>typeof renderer[key]==='function')){this.fallbacks++;return null;}
  let gl,saved;
  try{
   gl=renderer.getContext();
   if(!gl||size!==256||!Number.isInteger(count)||count<1||count>12||!Number.isInteger(width)||!Number.isInteger(height)||width<256||height<256||width%256||height%256||width>1024||width*height>12*256*256||count>width*height/(256*256)||renderer.domElement?.width!==width||renderer.domElement?.height!==height||renderer.getRenderTarget()!==null||gl.isContextLost?.()||renderer.xr?.isPresenting){this.fallbacks++;return null;}
   saved={viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear,face:renderer.getActiveCubeFace(),level:renderer.getActiveMipmapLevel()};
  }catch(error){this.lastError=error.message;this.fallbacks++;return null;}
  let result=null,failed=false,failure;
  try{
   this.prepare(renderer,width,height,count);this.lastError='';
   // Copy before changing targets. FramebufferTexture preserves GL's bottom-up
   // rows; the first shader explicitly indexes the original top-left cells.
   renderer.copyFramebufferToTexture(this.source);
   renderer.autoClear=false;renderer.setScissorTest(false);this.mesh.material=this.rowMaterial;
   renderer.setRenderTarget(this.rows);renderer.setViewport(0,0,count,256);renderer.render(this.scene,this.camera);
   this.mesh.material=this.boundsMaterial;renderer.setRenderTarget(this.bounds);renderer.setViewport(0,0,count,1);renderer.render(this.scene,this.camera);
   renderer.readRenderTargetPixels(this.bounds,0,0,count,1,this.buffer);
   if(gl?.getError&&gl.getError()!==(gl.NO_ERROR??0))throw Error('gpu-alpha-bounds-gl-error');
   result=decodeGPUAlphaBounds(this.buffer,count);
   if(result===null)throw Error('gpu-alpha-bounds-decode-failed');
  }catch(error){failed=true;failure=error;}
  finally{
   // A failed setter cannot prevent the other saved fields being attempted.
   // A decoded result is certified only after every restoration succeeds.
   try{renderer.setRenderTarget(null,saved.face,saved.level);}catch(error){if(!failed){failed=true;failure=error;}}
   try{renderer.setViewport(saved.viewport);}catch(error){if(!failed){failed=true;failure=error;}}
   try{renderer.setScissor(saved.scissor);}catch(error){if(!failed){failed=true;failure=error;}}
   try{renderer.setScissorTest(saved.scissorTest);}catch(error){if(!failed){failed=true;failure=error;}}
   try{renderer.autoClear=saved.autoClear;}catch(error){if(!failed){failed=true;failure=error;}}
  }
  if(failed){
   // Keep the first operation error, otherwise the first restoration error.
   // Owned cleanup runs afterwards and cannot replace that primary failure.
   this.fallbacks++;try{this.dispose();}catch{}
   let message;try{message=failure?.message;}catch{}
   this.lastError=typeof message==='string'&&message?message:'gpu-alpha-bounds-read-failed';return null;
  }
  this.reads++;this.bytesRead=count*4;return result;
 }
 dispose(){
  let failed=false,failure;
  try{
   try{this.contextSurface?.removeEventListener?.('webglcontextlost',this.contextLossListener);}catch{}this.contextSurface=this.contextLossListener=null;
   const pending=this.warmFlight;this.warmFlight=null;this.warmReady=null;
   try{pending?.finish(false);}catch(error){failed=true;failure=error;}
   // These six resources are helper-owned; never dispose the caller's rig or
   // original colour textures. One failing listener must not retain the rest.
   for(const resource of [this.source,this.rows,this.bounds,this.geometry,this.rowMaterial,this.boundsMaterial])try{resource?.dispose();}catch(error){if(!failed){failed=true;failure=error;}}
  }finally{
   this.contextSurface=this.contextLossListener=this.warmFlight=this.warmReady=null;
   this.source=this.rows=this.bounds=this.geometry=this.rowMaterial=this.boundsMaterial=this.mesh=this.scene=this.camera=this.owner=null;this.width=this.height=0;this.rawBytes=0;this.bytesRead=0;
  }
  if(failed)throw failure;
 }
}
