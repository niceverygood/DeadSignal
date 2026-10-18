import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GPUAlphaBounds} from '../dist/boss-rig/gpu-alpha-bounds.js';

// Protocol tests with actual Three resources and supplied byte records. This
// mock executes no shader, GPU work, native Canvas operation or timing test.
const RESTORERS=['target','viewport','scissor','scissorTest','autoClear'];
const OWNED=['source','rows','bounds','geometry','rowMaterial','boundsMaterial'];
const INITIAL={viewport:[9,10,19,29],scissor:[3,4,17,18],scissorTest:true,autoClear:true,face:2,level:1};
const sameArray=(left,right)=>left.length===right.length&&left.every((value,index)=>Object.is(value,right[index]));
function rendererFixture({restoreFailures=[],bodyFailure=null}={}){
 const calls=[],attempts=Object.fromEntries(RESTORERS.map(key=>[key,0])),failures=new Set(restoreFailures),markers=Object.fromEntries(RESTORERS.map(key=>[key,Error('restore-'+key)]));
 const bodyError=Error('body-'+bodyFailure),state={target:null,viewport:new THREE.Vector4(...INITIAL.viewport),scissor:new THREE.Vector4(...INITIAL.scissor),scissorTest:true,autoClear:true,face:2,level:1,lost:false,renders:0},originalPixels=new Uint8Array([3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59]);
 const originalImage={width:2,height:2,data:originalPixels},originalTexture=new THREE.DataTexture(originalPixels,2,2),originalTextureState={image:originalTexture.image,source:originalTexture.source,version:originalTexture.version,sourceVersion:originalTexture.source.version,pixels:originalPixels.slice()};
 let helper=null,originalTextureDisposals=0;originalTexture.addEventListener('dispose',()=>{originalTextureDisposals++;});
 const kind=resource=>resource===null?'default':resource===helper?.source?'source':resource===helper?.rows?'rows':resource===helper?.bounds?'bounds':'foreign';
 const restore=key=>{attempts[key]++;if(failures.has(key))throw markers[key];};
 const body=label=>{if(bodyFailure===label)throw bodyError;};
 const gl={NO_ERROR:0,isContextLost(){return state.lost;},getError(){calls.push(['getError']);body('gl');return bodyFailure==='gl-error'?1282:0;}};
 const renderer={domElement:{width:1024,height:768,originalImage},originalTexture,xr:{isPresenting:false},
  getContext(){return gl;},getRenderTarget(){return state.target;},getViewport(target){return target.copy(state.viewport);},getScissor(target){return target.copy(state.scissor);},getScissorTest(){return state.scissorTest;},getActiveCubeFace(){return state.face;},getActiveMipmapLevel(){return state.level;},
  copyFramebufferToTexture(texture){calls.push(['copy',kind(texture),kind(state.target)]);assert.equal(state.target,null,'copy the original default framebuffer before binding a helper target');assert.notEqual(texture,originalTexture);body('copy');},
  setRenderTarget(target,face=0,level=0){calls.push(['target',kind(target),face,level]);if(target===null)restore('target');state.target=target;state.face=face;state.level=level;},
  setViewport(x,y,w,h){const value=x?.isVector4?x.toArray():[x,y,w,h];calls.push(['viewport',...value]);if(x?.isVector4&&sameArray(value,INITIAL.viewport))restore('viewport');state.viewport.fromArray(value);},
  setScissor(x,y,w,h){const value=x?.isVector4?x.toArray():[x,y,w,h];calls.push(['scissor',...value]);if(x?.isVector4&&sameArray(value,INITIAL.scissor))restore('scissor');state.scissor.fromArray(value);},
  setScissorTest(value){calls.push(['scissorTest',value]);if(value===true)restore('scissorTest');state.scissorTest=value;},
  render(scene,camera){state.renders++;const material=scene.children[0].material;calls.push(['render',kind(state.target),material===helper.rowMaterial?'rows':'bounds',state.viewport.toArray(),state.scissorTest,state.autoClear]);assert.ok(camera.isCamera);body(state.renders===1?'rows-render':'bounds-render');},
  readRenderTargetPixels(target,x,y,count,height,buffer){calls.push(['read',kind(target),x,y,count,height]);assert.equal(target,state.target);body('read');for(let i=0;i<count;i++){const values=i===0?[0,0,0,0]:i===1?[255,255,255,255]:i===2?[255,255,0,0]:[i,i+1,255-i,254-i];for(let n=0;n<4;n++)buffer[i*4+n]=values[n];}},
 };
 Object.defineProperty(renderer,'autoClear',{enumerable:true,configurable:true,get(){return state.autoClear;},set(value){calls.push(['autoClear',value]);if(value===true)restore('autoClear');state.autoClear=value;}});
 const snapshot=()=>({target:kind(state.target),viewport:state.viewport.toArray(),scissor:state.scissor.toArray(),scissorTest:state.scissorTest,autoClear:state.autoClear,face:state.face,level:state.level});
 const originalUntouched=()=>{assert.equal(originalTexture.image,originalTextureState.image);assert.equal(originalTexture.source,originalTextureState.source);assert.equal(originalTexture.version,originalTextureState.version);assert.equal(originalTexture.source.version,originalTextureState.sourceVersion);assert.equal(originalTextureDisposals,0,'caller-owned original texture is never disposed');assert.deepEqual(originalPixels,originalTextureState.pixels);assert.equal(renderer.domElement.originalImage,originalImage);assert.equal(renderer.originalTexture,originalTexture);assert.deepEqual([renderer.domElement.width,renderer.domElement.height],[1024,768]);};
 return{renderer,state,gl,calls,attempts,markers,bodyError,failures,snapshot,originalUntouched,setHelper(value){helper=value;}};
}
function assertReleased(helper){
 for(const key of [...OWNED,'mesh','scene','camera','owner','contextSurface','contextLossListener','warmFlight','warmReady'])assert.equal(helper[key]??null,null,key+' released');
 assert.equal(helper.rawBytes,0);assert.equal(helper.bytesRead,0);assert.equal(helper.width??0,0);assert.equal(helper.height??0,0);
}
function assertOtherStateRestored(mock,before,failed){
 for(const key of ['viewport','scissor','scissorTest','autoClear'])if(!failed.includes(key))assert.deepEqual(mock.snapshot()[key],before[key],key+' still restored');
 if(!failed.includes('target'))for(const key of ['target','face','level'])assert.equal(mock.snapshot()[key],before[key],key+' restored');
 assert.deepEqual(mock.attempts,Object.fromEntries(RESTORERS.map(key=>[key,1])),'all five restorations attempted exactly once');
}
function watchResources(helper,callback){
 const originalPrepare=helper.prepare,counts={};helper.prepare=function(...args){const result=originalPrepare.apply(this,args);for(const key of OWNED){counts[key]=0;this[key].addEventListener('dispose',()=>{counts[key]++;callback?.(key);});}return result;};return counts;
}

test('each failed restoration and multiple failed setters invalidate the read while every other saved state is attempted once',()=>{
 for(const failed of [...RESTORERS.map(key=>[key]),['target','scissorTest'],[...RESTORERS]]){
  const helper=new GPUAlphaBounds(),mock=rendererFixture({restoreFailures:failed});mock.setHelper(helper);const before=mock.snapshot(),disposals=watchResources(helper);
  assert.equal(helper.read(mock.renderer,1024,768,12),null,failed.join(','));assert.equal(helper.reads,0,'a decoded but unrestored frame is not a successful read');assert.equal(helper.bytesRead,0);assert.equal(helper.fallbacks,1);assert.equal(helper.lastError,mock.markers[RESTORERS.find(key=>failed.includes(key))].message);assertOtherStateRestored(mock,before,failed);assertReleased(helper);assert.deepEqual(disposals,Object.fromEntries(OWNED.map(key=>[key,1])));mock.originalUntouched();
  const restores=mock.calls.filter(call=>call[0]==='target'&&call[1]==='default');assert.deepEqual(restores,[['target','default',2,1]],'saved cube face and mip level are forwarded once');
  mock.failures.clear();mock.state.target=null;mock.state.face=2;mock.state.level=1;mock.state.renders=0;mock.calls.length=0;for(const key of RESTORERS)mock.attempts[key]=0;
  // Restore the test surface itself before retrying; a failed native setter
  // cannot be claimed to have restored its own unknown state.
  mock.state.viewport.fromArray(INITIAL.viewport);mock.state.scissor.fromArray(INITIAL.scissor);mock.state.scissorTest=true;mock.state.autoClear=true;
  assert.equal(helper.read(mock.renderer,1024,768,12).length,12);assert.equal(helper.reads,1);assert.equal(helper.fallbacks,1);assert.deepEqual(mock.snapshot(),before);helper.dispose();assertReleased(helper);
 }
});

test('copy/render/read/GL/decode failures keep the first body error and no success counters even when restoration also fails',()=>{
 for(const failure of ['copy','rows-render','bounds-render','read','gl','gl-error','decode','decode-null','decode-short'])for(const failed of [[],['target','viewport','autoClear']]){
  const helper=new GPUAlphaBounds(),mock=rendererFixture({restoreFailures:failed,bodyFailure:failure});mock.setHelper(helper);const before=mock.snapshot(),disposals=watchResources(helper);helper.reads=3;
  if(failure==='decode')helper.buffer=new Proxy(helper.buffer,{get(target,key){if(key==='length')throw mock.bodyError;return Reflect.get(target,key,target);}});
  if(failure==='decode-null'||failure==='decode-short'){helper.buffer=failure==='decode-null'?null:new Uint8Array(1);mock.renderer.readRenderTargetPixels=(target,x,y,count,height)=>{mock.calls.push(['read','bounds',x,y,count,height]);assert.equal(target,mock.state.target);};}
  const expectedError=failure==='gl-error'?'gpu-alpha-bounds-gl-error':failure==='decode-null'||failure==='decode-short'?'gpu-alpha-bounds-decode-failed':mock.bodyError.message;
  assert.equal(helper.read(mock.renderer,1024,768,12),null,failure);assert.equal(helper.reads,3,'historical successful reads survive but failed calls add none');assert.equal(helper.fallbacks,1);assert.equal(helper.bytesRead,0);assert.equal(helper.lastError,expectedError);assertOtherStateRestored(mock,before,failed);assertReleased(helper);assert.deepEqual(disposals,Object.fromEntries(OWNED.map(key=>[key,1])));mock.originalUntouched();
 }
 for(const thrown of [null,undefined,0,{get message(){throw Error('hostile error message');}}]){const helper=new GPUAlphaBounds(),mock=rendererFixture({restoreFailures:['autoClear']});mock.setHelper(helper);const before=mock.snapshot();mock.renderer.copyFramebufferToTexture=()=>{throw thrown;};assert.equal(helper.read(mock.renderer,1024,768,12),null);assert.equal(helper.lastError,'gpu-alpha-bounds-read-failed','an opaque first body error is not replaced by a later restoration error');assert.equal(helper.reads,0);assert.equal(helper.fallbacks,1);assertOtherStateRestored(mock,before,['autoClear']);assertReleased(helper);mock.originalUntouched();}
});

test('cleanup exceptions cannot interrupt restoration or replace the first failure, and all helper-owned disposals are attempted and cleared',()=>{
 for(const failure of ['copy',null]){
  const failed=failure?['viewport']:['target','autoClear'],helper=new GPUAlphaBounds(),mock=rendererFixture({restoreFailures:failed,bodyFailure:failure}),cleanupError=Error('owned-source-dispose'),before=mock.snapshot();mock.setHelper(helper);
  const disposals=watchResources(helper,key=>{if(key==='source'||key==='bounds')throw cleanupError;});
  assert.equal(helper.read(mock.renderer,1024,768,12),null);assert.equal(helper.reads,0);assert.equal(helper.fallbacks,1);assert.equal(helper.lastError,failure?mock.bodyError.message:mock.markers.target.message);assertOtherStateRestored(mock,before,failed);assertReleased(helper);assert.deepEqual(disposals,Object.fromEntries(OWNED.map(key=>[key,1])));mock.originalUntouched();assert.doesNotThrow(()=>helper.dispose(),'already-released resources are not disposed twice');
 }
 const helper=new GPUAlphaBounds(),mock=rendererFixture({bodyFailure:'read',restoreFailures:['scissor']});mock.setHelper(helper);const before=mock.snapshot(),originalDispose=helper.dispose,originalPrepare=helper.prepare;let disposeCalls=0;
 helper.prepare=function(...args){const result=originalPrepare.apply(this,args);this.dispose=()=>{disposeCalls++;assert.deepEqual(mock.attempts,Object.fromEntries(RESTORERS.map(key=>[key,1])),'cleanup begins after every restoration attempt');throw Error('entire-dispose-failure');};return result;};
 try{assert.equal(helper.read(mock.renderer,1024,768,12),null);assert.equal(disposeCalls,1);assert.equal(helper.reads,0);assert.equal(helper.fallbacks,1);assert.equal(helper.lastError,mock.bodyError.message);assertOtherStateRestored(mock,before,['scissor']);mock.originalUntouched();}finally{helper.dispose=originalDispose;helper.dispose();}assertReleased(helper);
 for(const pending of [false,true]){const direct=new GPUAlphaBounds(),directMock=rendererFixture();directMock.setHelper(direct);direct.prepare(directMock.renderer,1024,768,12);const directCounts={},first=Error('first-owned-dispose'),pendingError=Error('pending-finish-dispose');let finishCalls=0;for(const key of OWNED){directCounts[key]=0;direct[key].addEventListener('dispose',()=>{directCounts[key]++;if(key==='source'||key==='rowMaterial')throw first;});}if(pending)direct.warmFlight={finish(value){finishCalls++;assert.equal(value,false);throw pendingError;}};
  assert.throws(()=>direct.dispose(),error=>error===(pending?pendingError:first),'direct dispose retains the first cleanup error identity');assert.equal(finishCalls,pending?1:0);assert.deepEqual(directCounts,Object.fromEntries(OWNED.map(key=>[key,1])));assertReleased(direct);directMock.originalUntouched();}
});

test('successful bytes, bounds and complete renderer call traces match the frozen original whole module including saved face/level and resource reuse',async()=>{
 const bytes=await readFile(new URL('../../../qa/gpu-alpha-restore-20261018/gpu-alpha-bounds-before-read-restore.txt',import.meta.url));assert.equal(bytes.byteLength,12031);assert.equal(createHash('sha256').update(bytes).digest('hex'),'943e9341964c8408835315c081d1d00f80027826e2fd0f921a8c8a82d1ce412b');
 const moduleURL=new URL('../dist/boss-rig/gpu-alpha-bounds.js',import.meta.url),originalSource=bytes.toString('utf8').replace("from '../player-rig/vendor/three.module.js'","from '"+new URL('../player-rig/vendor/three.module.js',moduleURL).href+"'");
 assert.notEqual(originalSource,bytes.toString('utf8'),'only the relative dependency is resolved for the original full-module import');const original=await import('data:text/javascript;base64,'+Buffer.from(originalSource).toString('base64'));
 function run(Type){
  const helper=new Type(),mock=rendererFixture();mock.setHelper(helper);const before=mock.snapshot(),observations=[];
  try{for(const count of [12,5,12,1]){mock.state.renders=0;const result=helper.read(mock.renderer,1024,768,count);assert.ok(result);assert.deepEqual(mock.snapshot(),before);mock.originalUntouched();observations.push({result,buffer:Array.from(helper.buffer),reads:helper.reads,bytesRead:helper.bytesRead,rawBytes:helper.rawBytes,fallbacks:helper.fallbacks,lastError:helper.lastError,sourceDimensions:[helper.source.image.width,helper.source.image.height],rowsDimensions:[helper.rows.width,helper.rows.height],boundsDimensions:[helper.bounds.width,helper.bounds.height],textureFlags:{sourceSpace:helper.source.colorSpace,rowsSpace:helper.rows.texture.colorSpace,boundsSpace:helper.bounds.texture.colorSpace,minFilter:helper.rows.texture.minFilter,magFilter:helper.rows.texture.magFilter,mipmaps:helper.rows.texture.generateMipmaps},materials:[helper.rowMaterial,helper.boundsMaterial].map(material=>({vertexShader:material.vertexShader,fragmentShader:material.fragmentShader,glslVersion:material.glslVersion,depthTest:material.depthTest,depthWrite:material.depthWrite,blending:material.blending,transparent:material.transparent,premultipliedAlpha:material.premultipliedAlpha,toneMapped:material.toneMapped,dithering:material.dithering})),state:mock.snapshot()});}return{observations,calls:mock.calls};}finally{helper.dispose();assertReleased(helper);}
 }
 const expected=run(original.GPUAlphaBounds),actual=run(GPUAlphaBounds);assert.deepEqual(actual,expected);assert.equal(actual.calls.filter(call=>call[0]==='copy').length,4);assert.equal(actual.calls.filter(call=>call[0]==='render').length,8);assert.equal(actual.calls.filter(call=>call[0]==='read').length,4);assert.deepEqual(actual.observations[0].result.slice(0,3),[{x:0,y:0,width:1,height:1},{x:255,y:255,width:1,height:1},null]);
});

test('invalid sizes/counts/renderers and failed state getters cause no preparation, GPU calls or restoration',()=>{
 const reject=(configure,dimensions=[1024,768,12],options={})=>{const helper=new GPUAlphaBounds(),mock=rendererFixture();mock.setHelper(helper);let preparations=0;helper.prepare=()=>{preparations++;assert.fail('invalid input cannot prepare resources');};configure?.(mock);assert.equal(helper.read(mock.renderer,...dimensions,options),null);assert.equal(preparations,0);assert.equal(helper.reads,0);assert.equal(helper.fallbacks,1);assert.equal(mock.calls.length,0);assert.deepEqual(mock.attempts,Object.fromEntries(RESTORERS.map(key=>[key,0])));assertReleased(helper);mock.originalUntouched();};
 for(const dimensions of [[1024,768,0],[1024,768,13],[1024,768,1.5],[1024,768,NaN],[257,768,1],[1024,257,1],[1280,256,5],[1024,1024,12],[256,256,2],[NaN,256,1]])reject(null,dimensions);
 reject(null,undefined,{size:512});reject(mock=>{mock.state.lost=true;});reject(mock=>{mock.state.target={originalTarget:true};});reject(mock=>{mock.renderer.xr.isPresenting=true;});reject(mock=>{mock.renderer.getContext=()=>null;});
 reject(mock=>{mock.renderer=null;});
 for(const key of ['getContext','getRenderTarget','getViewport','getScissor','getScissorTest','getActiveCubeFace','getActiveMipmapLevel','copyFramebufferToTexture','setRenderTarget','setViewport','setScissor','setScissorTest','render','readRenderTargetPixels'])reject(mock=>{mock.renderer[key]=null;});
 for(const key of ['getContext','getRenderTarget','getViewport','getScissor','getScissorTest','getActiveCubeFace','getActiveMipmapLevel'])reject(mock=>{mock.renderer[key]=()=>{throw Error('unavailable-'+key);};});
});
