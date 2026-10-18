import * as THREE from './player-rig/vendor/three.module.js';

const SIZE=256,ROW_BYTES=SIZE*4,RAW_TARGET_BYTES=(SIZE*SIZE+SIZE)*4;
const vertex=`precision highp float;
in vec3 position;
void main(){gl_Position=vec4(position,1.0);}`;
const fragment=`precision highp float;
precision highp int;
uniform sampler2D originalBody;
out vec4 result;
void main(){
 int row=int(gl_FragCoord.y),left=255,right=0;
 for(int x=0;x<256;x++){
  float a=texelFetch(originalBody,ivec2(x,255-row),0).a;
  if(floor(a*255.0+0.5)>=8.0){left=min(left,x);right=max(right,x);}
 }
 result=vec4(float(left)/255.0,float(right)/255.0,0.0,1.0);
}`;
const required=['getContext','getRenderTarget','getActiveCubeFace','getActiveMipmapLevel','getViewport','getScissor','getScissorTest','copyFramebufferToTexture','setRenderTarget','setViewport','setScissor','setScissorTest','render','readRenderTargetPixels'];
function message(error,fallback){try{return typeof error?.message==='string'&&error.message?error.message:fallback;}catch{return fallback;}}
function validRows(bytes){
 if(!(bytes instanceof Uint8Array)&&!(bytes instanceof Uint8ClampedArray)||bytes.length!==ROW_BYTES)return false;
 for(let y=0;y<SIZE;y++){const n=y*4,left=bytes[n],right=bytes[n+1];if(bytes[n+2]!==0||bytes[n+3]!==255||right<left&&(left!==255||right!==0))return false;}
 return true;
}

// Row zero in this byte buffer is the original canvas's top row, despite the
// render-target read being GL-bottom-up. The shader explicitly reverses source Y.
// Only endpoints are returned; these bytes must never replace original colour
// or a full pixel mask. The caller retains the original body canvas.
export function decodePlayerAlphaRows(bytes){
 if(!validRows(bytes))return null;
 let left=SIZE,top=SIZE,right=0,bottom=0;
 for(let y=0;y<SIZE;y++){
  const n=y*4,first=bytes[n],last=bytes[n+1];if(last<first)continue;
  if(first<left)left=first;if(last+1>right)right=last+1;if(y<top)top=y;bottom=y+1;
 }
 const alphaBounds=right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:{x:SIZE,y:SIZE,width:1,height:1};
 const coreBounds={x:alphaBounds.x,y:alphaBounds.y,width:alphaBounds.width,height:alphaBounds.height*.72};
 const outlineLeft=[],outlineRight=[],firstRow=Math.max(0,Math.floor(alphaBounds.y)),lastRow=Math.min(SIZE,Math.floor(coreBounds.y+coreBounds.height));
 for(let y=firstRow;y<lastRow;y++){
  const n=y*4,first=bytes[n],last=bytes[n+1];if(last<first)continue;
  outlineLeft.push({x:first,y:y+.5});outlineRight.push({x:last+1,y:y+.5});
 }
 const bodyIdentificationContour=outlineLeft.length>1?{left:outlineLeft,right:outlineRight,top:[outlineLeft[0],outlineRight[0]]}:null;
 return {alphaBounds,coreBounds,bodyIdentificationContour};
}

// QA-only fixed original256 body pass. No warmup, geometry approximation,
// extra colour draw, full-RGBA CPU buffer or caller-owned resource disposal.
export class PlayerAlphaRows{
 constructor(){
  this.reads=0;this.fallbacks=0;this.bytesRead=0;this.lastError='';this.contextGeneration=0;this.reading=false;
  this.buffer=new Uint8Array(ROW_BYTES);this.viewport=new THREE.Vector4();this.scissor=new THREE.Vector4();
  this.owner=this.context=this.contextSurface=this.contextLossListener=this.contextRestoreListener=null;
  this.source=this.rows=this.geometry=this.rowMaterial=this.mesh=this.scene=this.camera=null;
 }
 report(){
  return {reads:this.reads,fallbacks:this.fallbacks,bytesRead:this.bytesRead,capacity:this.buffer?.byteLength||0,
   ownedResources:Number(!!this.source)+Number(!!this.rows)+Number(!!this.geometry)+Number(!!this.rowMaterial),
   rawTargetBytes:this.source&&this.rows?RAW_TARGET_BYTES:0,lastError:this.lastError,contextGeneration:this.contextGeneration};
 }
 fail(error,fallback='player-alpha-rows-read-failed'){
  const primary=message(error,fallback);this.fallbacks++;this.bytesRead=0;
  try{this.dispose();}catch{}this.lastError=primary;return null;
 }
 prepare(renderer,gl,surface){
  if(this.owner===renderer&&this.context===gl&&this.contextSurface===surface&&this.source&&this.rows&&this.geometry&&this.rowMaterial)return;
  this.dispose();this.owner=renderer;this.context=gl;this.contextSurface=surface;
  const generation=this.contextGeneration;
  const invalidate=()=>{
   if(this.owner!==renderer||this.context!==gl||this.contextSurface!==surface||this.contextGeneration!==generation)return;
   try{this.dispose();}catch{}this.lastError='player-alpha-rows-context-invalidated';
  };
  this.contextLossListener=invalidate;this.contextRestoreListener=invalidate;
  surface.addEventListener('webglcontextlost',invalidate);surface.addEventListener('webglcontextrestored',invalidate);
  this.buffer??=new Uint8Array(ROW_BYTES);this.viewport??=new THREE.Vector4();this.scissor??=new THREE.Vector4();
  this.source=new THREE.FramebufferTexture(SIZE,SIZE);this.source.colorSpace=THREE.NoColorSpace;this.source.internalFormat='RGBA8';
  this.rows=new THREE.WebGLRenderTarget(1,SIZE,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,internalFormat:'RGBA8',minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false,colorSpace:THREE.NoColorSpace,depthBuffer:false,stencilBuffer:false,samples:0});
  this.geometry=new THREE.PlaneGeometry(2,2);
  this.rowMaterial=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,uniforms:{originalBody:{value:this.source}},depthTest:false,depthWrite:false,blending:THREE.NoBlending,transparent:false,premultipliedAlpha:false,toneMapped:false,dithering:false});
  this.mesh=new THREE.Mesh(this.geometry,this.rowMaterial);this.mesh.frustumCulled=false;this.scene=new THREE.Scene();this.scene.add(this.mesh);this.camera=new THREE.Camera();
 }
 read(renderer){
  if(this.reading){this.fallbacks++;return null;}
  this.reading=true;let gl,surface,saved,token,current,result=null,failed=false,failure;
  try{
   if(!renderer||!required.every(key=>typeof renderer[key]==='function'))throw Error('player-alpha-rows-renderer-unsupported');
   gl=renderer.getContext();surface=renderer.domElement;
   if(!gl||renderer.capabilities?.isWebGL2!==true||typeof gl.isContextLost!=='function'||gl.isContextLost()||renderer.xr?.isPresenting
    ||surface?.width!==SIZE||surface?.height!==SIZE||gl.drawingBufferWidth!==SIZE||gl.drawingBufferHeight!==SIZE
    ||typeof surface.addEventListener!=='function'||typeof surface.removeEventListener!=='function'
    ||renderer.getRenderTarget()!==null||renderer.getActiveCubeFace()!==0||renderer.getActiveMipmapLevel()!==0)throw Error('player-alpha-rows-original256-default-framebuffer-required');
   saved={target:null,face:0,level:0,viewport:renderer.getViewport(this.viewport??=new THREE.Vector4()),scissor:renderer.getScissor(this.scissor??=new THREE.Vector4()),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear};
   this.prepare(renderer,gl,surface);
   token={generation:this.contextGeneration,source:this.source,rows:this.rows,material:this.rowMaterial,geometry:this.geometry,scene:this.scene,camera:this.camera,buffer:this.buffer};
   current=()=>{
    const lost=gl.isContextLost(),presenting=renderer.xr?.isPresenting;
    return !lost&&!presenting&&this.owner===renderer&&this.context===gl&&this.contextSurface===surface&&this.contextGeneration===token.generation
     &&this.source===token.source&&this.rows===token.rows&&this.rowMaterial===token.material&&this.geometry===token.geometry&&this.scene===token.scene&&this.camera===token.camera&&this.buffer===token.buffer
     &&renderer.domElement===surface&&surface.width===SIZE&&surface.height===SIZE&&gl.drawingBufferWidth===SIZE&&gl.drawingBufferHeight===SIZE&&this.contextGeneration===token.generation;
   };
   if(!current())throw Error('player-alpha-rows-owner-changed');
   // Copy the already rendered original body before changing its framebuffer.
   renderer.copyFramebufferToTexture(token.source);if(!current())throw Error('player-alpha-rows-owner-changed');
   renderer.autoClear=false;renderer.setScissorTest(false);renderer.setRenderTarget(token.rows);renderer.setViewport(0,0,1,SIZE);
   renderer.render(token.scene,token.camera);if(!current())throw Error('player-alpha-rows-owner-changed');
   renderer.readRenderTargetPixels(token.rows,0,0,1,SIZE,token.buffer);if(!current())throw Error('player-alpha-rows-owner-changed');
   if(typeof gl.getError==='function'&&gl.getError()!==(gl.NO_ERROR??0))throw Error('player-alpha-rows-gl-error');
   if(!validRows(token.buffer))throw Error('player-alpha-rows-invalid-row-bytes');result=token.buffer;
  }catch(error){failed=true;failure=error;}
  finally{
   if(saved){
    for(const restore of [()=>renderer.setRenderTarget(saved.target,saved.face,saved.level),()=>renderer.setViewport(saved.viewport),()=>renderer.setScissor(saved.scissor),()=>renderer.setScissorTest(saved.scissorTest),()=>{renderer.autoClear=saved.autoClear;}]){
     try{restore();}catch(error){if(!failed){failed=true;failure=error;}}
    }
   }
   // Restoration callbacks/context events may invalidate an otherwise valid read.
   try{
    if(result)try{if(!current||!current())throw Error('player-alpha-rows-restoration-owner-changed');}catch(error){if(!failed){failed=true;failure=error;}}
    if(failed)result=this.fail(failure);
   }finally{this.reading=false;}
  }
  if(result){this.reads++;this.bytesRead=ROW_BYTES;this.lastError='';}return result;
 }
 dispose(){
  const resources=[this.source,this.rows,this.geometry,this.rowMaterial],surface=this.contextSurface,loss=this.contextLossListener,restored=this.contextRestoreListener;
  this.contextGeneration++;
  // Clear old identities first: late/reentrant resource listeners cannot make
  // this cleanup dispose or null a newly created owner's resources.
  this.source=this.rows=this.geometry=this.rowMaterial=this.mesh=this.scene=this.camera=this.owner=this.context=this.contextSurface=this.contextLossListener=this.contextRestoreListener=null;
  this.buffer=this.viewport=this.scissor=null;this.bytesRead=0;let failed=false,failure;
  for(const remove of [()=>surface?.removeEventListener?.('webglcontextlost',loss),()=>surface?.removeEventListener?.('webglcontextrestored',restored)])try{remove();}catch(error){if(!failed){failed=true;failure=error;}}
  for(const resource of resources)try{resource?.dispose();}catch(error){if(!failed){failed=true;failure=error;}}
  if(failed)throw failure;
 }
}
