import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GPUAlphaBounds} from '../dist/boss-rig/gpu-alpha-bounds.js';
import {createNativeFrameProfile,NATIVE_FRAME_PROFILE_NOTE} from '../dist/qa-native-frame-profile.js';

// The renderer supplies known records. These tests verify observational hooks,
// original call order/output and restoration, not shader execution or GPU cost.
function fixture(gpu=true){
 const calls=[],actor=Object.freeze({id:13}),originalScene={},output=Object.freeze({originalArt:'preserved',frame:{width:256,height:256}}),record=name=>calls.push(name);
 class Context{
  constructor(name){this.name=name;}
  clearRect(){record(this.name+'.clear');}
  drawImage(){record(this.name+'.copy');}
  fillRect(){record(this.name+'.fill');}
  getImageData(){record(this.name+'.read');return{data:new Uint8Array([1,7,8,255])};}
 }
 const state={target:null,viewport:new THREE.Vector4(9,10,19,29),scissor:new THREE.Vector4(3,4,17,18),scissorTest:true,face:2,level:1},gl={NO_ERROR:0,isContextLost:()=>false,getError(){assert.equal(this,gl);record('getError');return 0;}};
 const renderer={domElement:{width:1024,height:768},xr:{isPresenting:false},autoClear:true,
  getContext(){assert.equal(this,renderer);record('getContext');return gl;},getRenderTarget:()=>state.target,getViewport:t=>t.copy(state.viewport),getScissor:t=>t.copy(state.scissor),getScissorTest:()=>state.scissorTest,getActiveCubeFace:()=>state.face,getActiveMipmapLevel:()=>state.level,
  copyFramebufferToTexture(){assert.equal(this,renderer);record('framebufferCopy');},
  setRenderTarget(target,face=0,level=0){state.target=target;state.face=face;state.level=level;record('target');},setViewport(x,y,w,h){state.viewport.copy(x?.isVector4?x:new THREE.Vector4(x,y,w,h));record('viewport');},setScissor(x,y,w,h){state.scissor.copy(x?.isVector4?x:new THREE.Vector4(x,y,w,h));record('scissor');},setScissorTest(value){state.scissorTest=value;record('scissorTest');},
  render(scene){assert.equal(this,renderer);record(scene===originalScene?'nativeRender':'reductionRender');},readRenderTargetPixels(target,x,y,count,rows,buffer){assert.equal(this,renderer);record('readPixels');for(let i=0;i<count;i++)buffer.set([10,20,30,40],i*4);},setSize(width,height){record('resize');this.domElement.width=width;this.domElement.height=height;},
 };
 const rig={size:256,renderer,exactGPUAlphaBounds:gpu,minGPUAlphaCells:12,rawContext:new Context('cpu'),inkContext:new Context('ink'),frames:new WeakMap(),framePool:{slots:[],reserve(){},claim(){return this.slots[0];}},
  beginBatch(){record('beginBatch');},
  exactAlphaSurface(width,height,items){assert.equal(this,rig);this.gpuAlphaBounds??=new GPUAlphaBounds();const bounds=this.gpuAlphaBounds.read(this.renderer,width,height,items.length);return{bounds,source:this.gpuSurface(width,height)};},
  gpuSurface(width,height){assert.equal(this,rig);if(!this.gpuRaw){this.gpuRaw={width:1,height:1};this.gpuRawContext=new Context('gpuColour');}this.gpuRaw.width=width;this.gpuRaw.height=height;this.gpuRawContext.clearRect(0,0,width,height);this.gpuRawContext.drawImage(this.renderer.domElement,0,0);return this.gpuRaw;},
  readSurface(){assert.equal(this,rig);this.rawContext.clearRect();this.rawContext.drawImage(this.renderer.domElement);return this.rawContext.getImageData();},
  finishFrame(item){assert.equal(this,rig);const context=new Context('output');this.frames.set(item.actor,{context});this.inkContext.clearRect();this.inkContext.drawImage({original:true});this.inkContext.fillRect();context.clearRect();context.drawImage({original:true});return output;},
 };
 function render(){rig.beginBatch(12);renderer.render(originalScene);if(gpu)rig.exactAlphaSurface(1024,768,Array.from({length:12},()=>({actor})));else rig.readSurface();return rig.finishFrame({actor});}
 return{rig,renderer,gl,Context,calls,actor,output,render};
}
const ownDescriptors=object=>Object.getOwnPropertyDescriptors(object);
function withContextPrototype(Context,run){const prior=Object.getOwnPropertyDescriptor(globalThis,'CanvasRenderingContext2D');Object.defineProperty(globalThis,'CanvasRenderingContext2D',{value:Context,writable:true,configurable:true});try{return run();}finally{if(prior)Object.defineProperty(globalThis,'CanvasRenderingContext2D',prior);else delete globalThis.CanvasRenderingContext2D;}}

test('QA captures the first lazy helper and colour/output contexts, separates native/reduction calls and leaves CPU/GPU source outputs and call order unchanged',()=>{
 for(const gpu of [false,true]){
  const baseline=fixture(gpu);assert.equal(baseline.render(),baseline.output);const expected=baseline.calls.slice();baseline.rig.gpuAlphaBounds?.dispose();
  const f=fixture(gpu),rigBefore=ownDescriptors(f.rig),rendererBefore=ownDescriptors(f.renderer),protoBefore=ownDescriptors(GPUAlphaBounds.prototype),contextBefore=ownDescriptors(f.Context.prototype);let time=0;
  withContextPrototype(f.Context,()=>{
   const profile=createNativeFrameProfile(f.rig,{now:()=>time+=.125});assert.equal(f.rig.gpuAlphaBounds,undefined,'profiling never eagerly constructs a helper');assert.equal(f.rig.gpuRawContext,undefined,'profiling never eagerly creates a colour canvas');
   profile.beginFrame({frame:17,cells:12,path:gpu?'gpu':'cpu'});assert.equal(f.render(),f.output);const sample=profile.endFrame({phase:'finished'});
   assert.equal(sample.frame,17);assert.equal(sample.cells,12);assert.equal(sample.phase,'finished');assert.ok(sample.frameCpuMs>0);assert.equal(profile.samples[0],sample);assert.equal(sample.stages['native.glSubmit'].calls,1);assert.equal(sample.stages['private.finishFrame'].calls,1);assert.equal(sample.stages['private.inkCopy'].calls,1);assert.equal(sample.stages['private.outputCopy'].calls,1,'new private contexts are observed on their first copy');
   assert.deepEqual(f.calls,expected,'no extra renderer, getContext, pixel-read or error-query calls are introduced');
   if(gpu){
    for(const label of ['native.exactAlphaSurface','gpuAlpha.read','gpuAlpha.prepare','gpuAlpha.framebufferCopy','gpuAlpha.rowsSubmit','gpuAlpha.boundsSubmit','gpuAlpha.readPixels','gpuAlpha.getError','gpuColour.surface','gpuColour.clear','gpuColour.copy'])assert.equal(sample.stages[label].calls,1,label+' first call captured');
    assert.ok(sample.stages['gpuAlpha.stateCalls'].calls>0);assert.equal(sample.resourcesBefore.helperRawBytes,0);assert.ok(sample.resourcesAfter.helperRawBytes>0);assert.equal(sample.resourcesAfter.gpuColourWidth,1024);assert.equal(sample.stages['cpuSurface.readPixels'],undefined);
   }else{
    for(const label of ['cpuSurface.surface','cpuSurface.clear','cpuSurface.copy','cpuSurface.readPixels'])assert.equal(sample.stages[label].calls,1,label);
    assert.equal(sample.stages['gpuAlpha.read'],undefined);assert.equal(f.rig.gpuAlphaBounds,undefined);assert.equal(f.rig.gpuRaw,undefined);
   }
   const stopped=profile.stop();assert.equal(stopped.samples,profile.samples);assert.match(stopped.note,/CPU call wall time only/);assert.match(stopped.note,/must not be summed/);assert.equal(profile.beginFrame(),null);assert.equal(profile.endFrame(),null);assert.deepEqual(f.calls,expected,'stop performs no rendering or GL/canvas queries');
  });
  for(const key of Object.keys(rigBefore))assert.deepEqual(Object.getOwnPropertyDescriptor(f.rig,key),rigBefore[key],key+' rig descriptor restored');assert.deepEqual(ownDescriptors(f.renderer),rendererBefore);assert.deepEqual(ownDescriptors(GPUAlphaBounds.prototype),protoBefore);assert.deepEqual(ownDescriptors(f.Context.prototype),contextBefore);f.rig.gpuAlphaBounds?.dispose();
 }
});

test('observational hooks preserve this, arguments, return/promise identity and thrown identity, restore inherited/immutable methods and do nothing when disabled',()=>{
 const marker=Error('original-failure'),result={unchanged:true},promise=Promise.resolve(result),seen=[],prototype={finishFrame(...args){seen.push({receiver:this,args});if(args[0]==='throw')throw marker;return args[0]==='promise'?promise:result;}},rig=Object.create(prototype);
 Object.defineProperty(rig,'readSurface',{value(){return result;},writable:false,configurable:false,enumerable:false});let time=0;
 const descriptors=ownDescriptors(rig),profile=createNativeFrameProfile(rig,{now:()=>++time});profile.beginFrame({frame:1});const receiver={foreignThis:true};assert.equal(rig.finishFrame.call(receiver,'return',13),result);assert.equal(rig.finishFrame('promise'),promise);assert.throws(()=>rig.finishFrame('throw'),error=>error===marker);assert.equal(rig.readSurface(),result);const sample=profile.endFrame();assert.equal(sample.stages['private.finishFrame'].calls,3);assert.equal(sample.stages['cpuSurface.surface'],undefined);assert.ok(profile.unmeasured.includes('readSurface'));assert.equal(seen[0].receiver,receiver);assert.deepEqual(seen[0].args,['return',13]);
 profile.stop();profile.stop();assert.deepEqual(ownDescriptors(rig),descriptors);assert.equal(rig.finishFrame,prototype.finishFrame);assert.equal(Object.hasOwn(rig,'finishFrame'),false);
 const before=ownDescriptors(GPUAlphaBounds.prototype),disabled=createNativeFrameProfile(rig,{enabled:false,now(){throw Error('disabled clock must never run');}});assert.deepEqual(ownDescriptors(rig),descriptors);assert.deepEqual(ownDescriptors(GPUAlphaBounds.prototype),before);assert.equal(disabled.beginFrame({frame:2}),null);assert.equal(disabled.endFrame(),null);assert.deepEqual(disabled.stop().samples,[]);assert.match(NATIVE_FRAME_PROFILE_NOTE,/synchronous wait/);
 const failingClock=createNativeFrameProfile(rig,{now(){throw Error('profiling-clock-failure');}});failingClock.beginFrame();assert.equal(rig.finishFrame('return'),result);assert.throws(()=>rig.finishFrame('throw'),error=>error===marker);failingClock.endFrame();failingClock.stop();assert.deepEqual(ownDescriptors(rig),descriptors,'instrumentation clock errors cannot alter original exceptions or restoration');
});

test('overlapping sessions restore exactly in either stop order, leave the remaining observer active and preserve later external method replacements',()=>{
 for(const order of [[0,1],[1,0]]){
  const rig={readSurface(){return this.value;},value:{original:true}},before=ownDescriptors(rig),prototypeBefore=ownDescriptors(GPUAlphaBounds.prototype);let time=0;const profiles=[createNativeFrameProfile(rig,{now:()=>++time}),createNativeFrameProfile(rig,{now:()=>++time})];
  for(const p of profiles)p.beginFrame({frame:0});assert.equal(rig.readSurface(),rig.value);for(const p of profiles)assert.equal(p.endFrame().stages['cpuSurface.surface'].calls,1);
  profiles[order[0]].stop();const remaining=profiles[order[1]];assert.notEqual(rig.readSurface,before.readSurface.value);remaining.beginFrame({frame:1});assert.equal(rig.readSurface(),rig.value);assert.equal(remaining.endFrame().stages['cpuSurface.surface'].calls,1);profiles[order[1]].stop();assert.deepEqual(ownDescriptors(rig),before);assert.deepEqual(ownDescriptors(GPUAlphaBounds.prototype),prototypeBefore);
 }
 const rig={readSurface(){return 1;}},profile=createNativeFrameProfile(rig),later=function(){return 2;};rig.readSurface=later;profile.stop();assert.equal(rig.readSurface,later,'cleanup does not clobber a function deliberately replaced after instrumentation');
});
