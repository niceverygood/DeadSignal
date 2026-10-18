import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GPUAlphaBounds} from '../dist/boss-rig/gpu-alpha-bounds.js';
import {LiveBossRig} from '../dist/boss-rig/live-boss.js';
import {CompletedEnemyFrames} from '../dist/completed-enemy-frames.js';

// compileAsync is a deferred mock; READY means that API completed. This suite
// verifies lifecycle/state/reuse, not real shader compilation, pixels or GPU time.
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function rendererMock(width=1024,height=768){
 const calls=[],compiles=[],framebuffer=new Uint8Array([1,7,8,9,128,255]),state={target:null,viewport:new THREE.Vector4(9,10,19,29),scissor:new THREE.Vector4(3,4,17,18),scissorTest:true,face:2,level:1,lost:false,error:0,fail:null,mutateCompile:true};let canvasWidth=width,canvasHeight=height,canvasWrites=0;
 const canvas={framebuffer};Object.defineProperties(canvas,{width:{get:()=>canvasWidth,set:value=>{canvasWrites++;canvasWidth=value;},enumerable:true},height:{get:()=>canvasHeight,set:value=>{canvasWrites++;canvasHeight=value;},enumerable:true}});
 const gl={NO_ERROR:0,isContextLost:()=>state.lost,getError(){calls.push({kind:'error'});return state.error;}};
 const renderer={domElement:canvas,xr:{isPresenting:false},autoClear:true,
  getContext:()=>gl,getRenderTarget:()=>state.target,getViewport:t=>t.copy(state.viewport),getScissor:t=>t.copy(state.scissor),getScissorTest:()=>state.scissorTest,getActiveCubeFace:()=>state.face,getActiveMipmapLevel:()=>state.level,
  setRenderTarget(target,face=0,level=0){calls.push({kind:'target',target,face,level});if(target&&state.fail==='bind')throw Error('mock-bind-failure');state.target=target;state.face=face;state.level=level;if(target){state.viewport.copy(target.viewport);state.scissor.copy(target.scissor);state.scissorTest=target.scissorTest;}},
  setViewport(x,y,w,h){calls.push({kind:'viewport'});state.viewport.copy(x?.isVector4?x:new THREE.Vector4(x,y,w,h));},setScissor(x,y,w,h){calls.push({kind:'scissor'});state.scissor.copy(x?.isVector4?x:new THREE.Vector4(x,y,w,h));},setScissorTest(value){calls.push({kind:'scissorTest'});state.scissorTest=value;},
  compileAsync(scene,camera){
   assert.equal(this,renderer);assert.ok(camera.isCamera);const mesh=scene.children[0],materials=mesh.material;assert.equal(materials.length,2);assert.ok(materials.every(m=>m.isRawShaderMaterial));assert.ok(state.target?.isWebGLRenderTarget);assert.equal(state.target.height,256);
   const gate=deferred();compiles.push({gate,mesh,materials:materials.slice(),target:state.target});calls.push({kind:'compile'});
   if(state.mutateCompile){state.viewport.set(55,66,77,88);state.scissor.set(11,22,33,44);state.scissorTest=false;renderer.autoClear=false;}
   if(state.fail==='compile')throw Error('mock-compile-failure');return gate.promise;
  },
  copyFramebufferToTexture(texture){calls.push({kind:'copy',texture,target:state.target});assert.equal(state.target,null);},render(scene){calls.push({kind:'render',target:state.target,material:scene.children[0].material});assert.notEqual(state.target,null,'the original default framebuffer is never rendered into');},
  readRenderTargetPixels(target,x,y,count,rows,buffer){calls.push({kind:'read'});assert.equal(target,state.target);for(let i=0;i<count;i++)buffer.set([i,i+1,255-i,254-i],i*4);},setSize(){calls.push({kind:'resize'});throw Error('warmup must never resize the original canvas');},
 };
 const snapshot=()=>({target:state.target,viewport:state.viewport.toArray(),scissor:state.scissor.toArray(),scissorTest:state.scissorTest,face:state.face,level:state.level,autoClear:renderer.autoClear,canvasWidth,canvasHeight,canvasWrites,framebuffer:Array.from(framebuffer)});
 return{renderer,state,calls,compiles,snapshot,canvasWrites:()=>canvasWrites};
}
const resources=helper=>[helper.source,helper.rows,helper.bounds,helper.geometry,helper.rowMaterial,helper.boundsMaterial];
function disposals(items){const counts=new Map();for(const item of items){counts.set(item,0);item.addEventListener('dispose',()=>counts.set(item,counts.get(item)+1));}return counts;}
function empty(helper){for(const key of ['source','rows','bounds','geometry','rowMaterial','boundsMaterial','mesh','scene','camera','owner','warmFlight','warmReady','contextSurface','contextLossListener'])assert.equal(helper[key]??null,null,key+' released');assert.equal(helper.rawBytes,0);assert.equal(helper.bytesRead,0);assert.equal(helper.retainWarmupResources(),false);}
const expectedBounds=count=>Array.from({length:count},(_,i)=>({x:i,y:i+1,width:256-2*i,height:254-2*i}));
function noDrawing(mock){assert.equal(mock.canvasWrites(),0);assert.ok(mock.calls.every(c=>!['copy','render','read','error','resize'].includes(c.kind)),'warmup only prepares and compiles; it does not copy, draw, query errors, read pixels or resize');}

test('unsupported, invalid, pre-aborted and state-getter failures refuse warmup before allocation without changing read statistics or source pixels',async()=>{
 const required=['getContext','getRenderTarget','getViewport','getScissor','getScissorTest','getActiveCubeFace','getActiveMipmapLevel','setRenderTarget','setViewport','setScissor','setScissorTest','compileAsync'];
 async function reject(mock,width=1024,height=768,count=12,options={}){const helper=new GPUAlphaBounds();let preparations=0;helper.prepare=()=>{preparations++;throw Error('invalid warmup allocated');};const before=mock?.snapshot();assert.equal(await helper.warmup(mock?.renderer,width,height,count,options),false);assert.equal(preparations,0);assert.equal(helper.reads,0);assert.equal(helper.fallbacks,0);empty(helper);if(mock){assert.equal(mock.compiles.length,0);assert.deepEqual(mock.snapshot(),before);noDrawing(mock);}}
 await reject(null);for(const key of required){const mock=rendererMock();mock.renderer[key]=undefined;await reject(mock);}
 for(const [width,height,count]of [[0,256,1],[257,256,1],[256,257,1],[1280,256,5],[1024,1024,12],[512,256,3],[1024,768,0],[1024,768,13],[1024,768,1.5],[NaN,768,12]])await reject(rendererMock(),width,height,count);
 const aborted=new AbortController();aborted.abort();await reject(rendererMock(),1024,768,12,{signal:aborted.signal});
 for(const mode of ['no-gl','lost','xr','nondefault','getter']){const mock=rendererMock();if(mode==='no-gl')mock.renderer.getContext=()=>null;if(mode==='lost')mock.state.lost=true;if(mode==='xr')mock.renderer.xr.isPresenting=true;if(mode==='nondefault')mock.state.target={originalTarget:true};if(mode==='getter')mock.renderer.getViewport=()=>{throw Error('mock-state-getter-failure');};await reject(mock);}
});

test('warmup compiles both materials once, restores state before waiting, shares its flight and lets the next exact read reuse every resource',async t=>{
 const helper=new GPUAlphaBounds(),mock=rendererMock(),before=mock.snapshot();t.after(()=>helper.dispose());
 const promise=helper.warmup(mock.renderer),allocated=resources(helper),disposed=disposals(allocated),flight=helper.warmFlight;
 assert.equal(helper.warmup(mock.renderer),promise,'identical pending requests share the exact Promise');assert.equal(await helper.warmup(mock.renderer,512,256,2),false);assert.equal(await helper.warmup(rendererMock().renderer),false);assert.equal(helper.warmFlight,flight);assert.equal(mock.compiles.length,1);
 assert.deepEqual(mock.snapshot(),before,'all renderer state is restored synchronously while compileAsync is still pending');assert.equal(helper.mesh.material,helper.rowMaterial);assert.deepEqual(mock.compiles[0].materials,[helper.rowMaterial,helper.boundsMaterial]);assert.equal(mock.compiles[0].target,helper.rows);assert.ok(helper.rawBytes>0);assert.equal(helper.reads,0);assert.equal(helper.bytesRead,0);noDrawing(mock);
 const callsBeforeRead=mock.calls.length;assert.equal(helper.read(mock.renderer,1024,768,12),null);assert.equal(mock.calls.length,callsBeforeRead,'pending readiness never blocks or submits a combat read');assert.equal(helper.fallbacks,1);
 mock.compiles[0].gate.resolve();assert.equal(await promise,true);assert.equal(helper.warmFlight,null);assert.equal(helper.warmReady.owner,mock.renderer);assert.deepEqual(mock.snapshot(),before);assert.ok(allocated.every(r=>disposed.get(r)===0));
 assert.equal(await helper.warmup(mock.renderer),true);assert.equal(mock.compiles.length,1,'completed matching readiness is reused');noDrawing(mock);assert.deepEqual(resources(helper),allocated);
 assert.deepEqual(helper.read(mock.renderer,1024,768,12),expectedBounds(12));assert.deepEqual(resources(helper),allocated);assert.ok(allocated.every(r=>disposed.get(r)===0));assert.equal(helper.reads,1);assert.equal(helper.bytesRead,48);assert.deepEqual(mock.snapshot(),before);assert.equal(mock.calls.filter(c=>c.kind==='copy').length,1);assert.equal(mock.calls.filter(c=>c.kind==='render').length,2);assert.equal(mock.calls.filter(c=>c.kind==='read').length,1);
 const later=helper.warmup(mock.renderer);assert.equal(await later,true);assert.equal(helper.reads,1);assert.equal(helper.bytesRead,48,'warmup never overwrites actual readback diagnostics');assert.equal(mock.compiles.length,1);
 // Compilation is allowed before the future atlas canvas size exists, without
 // resizing or drawing to the original small canvas to simulate the future read.
 const small=new GPUAlphaBounds(),smallMock=rendererMock(256,256),smallBefore=smallMock.snapshot();t.after(()=>small.dispose());const smallFlight=small.warmup(smallMock.renderer);assert.deepEqual(smallMock.snapshot(),smallBefore);smallMock.compiles[0].gate.resolve();assert.equal(await smallFlight,true);noDrawing(smallMock);assert.deepEqual(smallMock.snapshot(),smallBefore);
});

test('abort and dispose settle immediately, release once and isolate late completion or rejection from a replacement flight',async t=>{
 for(const mode of ['abort-resolve','abort-reject','dispose-resolve','dispose-reject']){
  const helper=new GPUAlphaBounds(),mock=rendererMock(),controller=new AbortController(),before=mock.snapshot();t.after(()=>helper.dispose());
  const oldPromise=helper.warmup(mock.renderer,1024,768,12,{signal:controller.signal}),old=resources(helper),oldDisposals=disposals(old),oldGate=mock.compiles[0].gate;
  if(mode.startsWith('abort'))controller.abort();else helper.dispose();assert.equal(await oldPromise,false,'cancellation settles before compileAsync completes');empty(helper);assert.ok(old.every(r=>oldDisposals.get(r)===1));assert.deepEqual(mock.snapshot(),before);
  const nextPromise=helper.warmup(mock.renderer),nextFlight=helper.warmFlight,next=resources(helper),nextDisposals=disposals(next),lastError=helper.lastError;assert.ok(next.every(r=>!old.includes(r)));assert.equal(mock.compiles.length,2);
  if(mode.endsWith('reject'))oldGate.reject(Error('late-old-compile-failure'));else oldGate.resolve();await turn();assert.equal(helper.warmFlight,nextFlight);assert.deepEqual(resources(helper),next);assert.equal(helper.lastError,lastError);assert.ok(next.every(r=>nextDisposals.get(r)===0),'a late previous completion cannot release replacement resources');
  mock.compiles[1].gate.resolve();assert.equal(await nextPromise,true);assert.equal(helper.warmReady.owner,mock.renderer);assert.deepEqual(mock.snapshot(),before);noDrawing(mock);assert.ok(old.every(r=>oldDisposals.get(r)===1));helper.dispose();helper.dispose();assert.ok(next.every(r=>nextDisposals.get(r)===1));empty(helper);
 }
});

test('preparation, binding, compilation and readonly restoration failures never report READY and release resources before retry',async t=>{
 for(const mode of ['prepare','bind','compile','reject','readonly-autoClear']){
  const helper=new GPUAlphaBounds(),mock=rendererMock(),before=mock.snapshot();t.after(()=>helper.dispose());let allocated=[],disposed;
  helper.prepare=function(...args){if(mode==='prepare')throw Error('mock-prepare-failure');GPUAlphaBounds.prototype.prepare.apply(this,args);allocated=resources(this);disposed=disposals(allocated);};
  if(mode==='bind'||mode==='compile')mock.state.fail=mode;
  if(mode==='readonly-autoClear'){mock.state.mutateCompile=false;Object.defineProperty(mock.renderer,'autoClear',{value:true,writable:false,configurable:true,enumerable:true});}
  const promise=helper.warmup(mock.renderer);assert.deepEqual(mock.snapshot(),before,'renderer state is restored before asynchronous success or failure is handled');
  if(mode==='reject')mock.compiles[0].gate.reject(Error('mock-compile-rejection'));
  assert.equal(await promise,false);empty(helper);assert.ok(allocated.every(r=>disposed.get(r)===1));assert.match(helper.lastError,mode==='readonly-autoClear'?/read only|readonly|Cannot assign/i:/mock-/);noDrawing(mock);
  for(const compile of mock.compiles)compile.gate.resolve();await turn();empty(helper);
  mock.state.fail=null;if(mode==='readonly-autoClear')Object.defineProperty(mock.renderer,'autoClear',{value:true,writable:true,configurable:true,enumerable:true});helper.prepare=GPUAlphaBounds.prototype.prepare;
  const retry=helper.warmup(mock.renderer);mock.compiles.at(-1).gate.resolve();assert.equal(await retry,true);assert.deepEqual(mock.snapshot(),before);helper.dispose();empty(helper);
 }
});

test('timeout, context loss and XR changes cancel pending readiness without late resurrection and allow clean preparation afterward',async t=>{
 for(const mode of ['timeout','lost','xr']){
  const helper=new GPUAlphaBounds(),mock=rendererMock(),before=mock.snapshot();t.after(()=>helper.dispose());const promise=helper.warmup(mock.renderer,1024,768,12,{timeoutMs:mode==='timeout'?1:10000}),allocated=resources(helper),disposed=disposals(allocated),gate=mock.compiles[0].gate;
  if(mode==='lost'){mock.state.lost=true;gate.resolve();}else if(mode==='xr'){mock.renderer.xr.isPresenting=true;gate.resolve();}
  assert.equal(await promise,false);empty(helper);assert.ok(allocated.every(r=>disposed.get(r)===1));assert.deepEqual(mock.snapshot(),before);noDrawing(mock);if(mode==='timeout')assert.equal(helper.lastError,'gpu-alpha-warmup-timeout');
  gate.reject(Error('late-failed-or-timed-out-compile'));await turn();empty(helper);assert.ok(allocated.every(r=>disposed.get(r)===1));mock.state.lost=false;mock.renderer.xr.isPresenting=false;
  const retry=helper.warmup(mock.renderer);mock.compiles.at(-1).gate.resolve();assert.equal(await retry,true);assert.deepEqual(mock.snapshot(),before);helper.dispose();empty(helper);
 }
});

test('one failed restoration setter still attempts every subsequent renderer-state restoration and never reports READY',async t=>{
 for(const failed of ['setRenderTarget','setViewport','setScissor','setScissorTest','autoClear']){
  const helper=new GPUAlphaBounds(),mock=rendererMock(),before=mock.snapshot(),attempted=[];t.after(()=>helper.dispose());
  for(const key of ['setRenderTarget','setViewport','setScissor','setScissorTest']){const original=mock.renderer[key];mock.renderer[key]=function(...args){if(key==='setRenderTarget'&&args[0]!==null)return original.apply(this,args);attempted.push(key);if(key===failed)throw Error('mock-restore-'+key);return original.apply(this,args);};}
  let autoClear=mock.renderer.autoClear;Object.defineProperty(mock.renderer,'autoClear',{configurable:true,enumerable:true,get:()=>autoClear,set(value){if(value===before.autoClear){attempted.push('autoClear');if(failed==='autoClear')throw Error('mock-restore-autoClear');}autoClear=value;}});
  const promise=helper.warmup(mock.renderer),mesh=mock.compiles[0].mesh,materials=mock.compiles[0].materials;assert.equal(await promise,false);empty(helper);assert.equal(mesh.material,materials[0],'temporary material arrays are restored even when a renderer setter fails');assert.deepEqual(attempted,['setRenderTarget','setViewport','setScissor','setScissorTest','autoClear']);assert.equal(helper.lastError,'mock-restore-'+failed);
  const after=mock.snapshot(),unrestorable=failed==='setRenderTarget'?['target','face','level']:[{setViewport:'viewport',setScissor:'scissor',setScissorTest:'scissorTest',autoClear:'autoClear'}[failed]];for(const key of unrestorable){delete before[key];delete after[key];}assert.deepEqual(after,before,'every independent state whose setter works is restored');noDrawing(mock);mock.compiles[0].gate.resolve();await turn();empty(helper);
 }
});

function eventSurface(mock){
 const listeners=new Map(),counts={added:0,removed:0};Object.assign(mock.renderer.domElement,{addEventListener(type,listener){let set=listeners.get(type);if(!set){set=new Set();listeners.set(type,set);}set.add(listener);counts.added++;},removeEventListener(type,listener){if(listeners.get(type)?.delete(listener))counts.removed++;}});
 return{counts,size:()=>listeners.get('webglcontextlost')?.size||0,dispatch(type){for(const listener of [...(listeners.get(type)||[])])listener({type});}};
}
test('prepare cancels an in-flight generation and event-supported context loss invalidates even a transient lost/restored interval while unregistering old owners',async t=>{
 const helper=new GPUAlphaBounds(),mock=rendererMock(),events=eventSurface(mock),before=mock.snapshot();t.after(()=>helper.dispose());
 const pending=helper.warmup(mock.renderer),old=resources(helper),disposed=disposals(old),oldGate=mock.compiles[0].gate;assert.equal(events.size(),1);
 helper.prepare(mock.renderer,1024,768,12);assert.equal(await pending,false);const replacement=resources(helper),replacementDisposals=disposals(replacement);assert.ok(replacement.every(r=>!old.includes(r)));assert.ok(old.every(r=>disposed.get(r)===1));assert.equal(events.size(),1);assert.equal(events.counts.added,2);assert.equal(events.counts.removed,1);
 oldGate.reject(Error('late-compile-before-direct-prepare'));await turn();assert.deepEqual(resources(helper),replacement);assert.ok(replacement.every(r=>replacementDisposals.get(r)===0));assert.equal(helper.warmFlight,null);
 const next=helper.warmup(mock.renderer);assert.deepEqual(resources(helper),replacement);assert.equal(events.size(),1,'same-owner preparation never duplicates the context listener');mock.state.lost=true;events.dispatch('webglcontextlost');mock.state.lost=false;events.dispatch('webglcontextrestored');assert.equal(await next,false,'loss events cancel immediately even if the context is restored before readiness resolves');empty(helper);assert.equal(events.size(),0);assert.ok(replacement.every(r=>replacementDisposals.get(r)===1));mock.compiles[1].gate.resolve();await turn();empty(helper);assert.deepEqual(mock.snapshot(),before);
 const retry=helper.warmup(mock.renderer);mock.compiles[2].gate.resolve();assert.equal(await retry,true);assert.equal(events.size(),1);
 const other=rendererMock(),otherEvents=eventSurface(other);helper.prepare(other.renderer,1024,768,12);const newOwner=resources(helper);assert.equal(events.size(),0);assert.equal(otherEvents.size(),1);events.dispatch('webglcontextlost');assert.deepEqual(resources(helper),newOwner,'an old canvas cannot dispose the replacement renderer resources');otherEvents.dispatch('webglcontextlost');empty(helper);assert.equal(otherEvents.size(),0);helper.dispose();assert.equal(otherEvents.counts.removed,1);
});

test('explicit idle leases are bounded, survive only pending preparation or readiness before the first successful read, and do not appear by default',async t=>{
 for(const lease of [undefined,0,-5,NaN,Infinity,15000,100000]){
  const helper=new GPUAlphaBounds(),mock=rendererMock();t.after(()=>helper.dispose());const options=lease===undefined?{}:{idleLeaseMs:lease},promise=helper.warmup(mock.renderer,1024,768,12,options),expected=Number.isFinite(lease)?Math.max(0,Math.min(30000,lease)):0;
  assert.equal(helper.warmFlight.idleLeaseMs,expected);assert.equal(helper.retainWarmupResources(),expected>0);mock.compiles[0].gate.resolve();assert.equal(await promise,true);assert.equal(helper.warmReady.readsAtWarmup,helper.reads);const deadline=helper.warmReady.idleLeaseUntil;
  assert.equal(helper.retainWarmupResources(),expected>0);assert.equal(helper.retainWarmupResources(deadline),false);assert.equal(helper.retainWarmupResources(deadline+1),false);
  if(expected>0){assert.equal(helper.retainWarmupResources(deadline-1),true);assert.equal(helper.read(mock.renderer,1024,768,12,{size:512}),null);assert.equal(helper.retainWarmupResources(deadline-1),true,'an unsuccessful read never consumes the lease');assert.deepEqual(helper.read(mock.renderer,1024,768,12),expectedBounds(12));assert.equal(helper.retainWarmupResources(deadline-1),false,'the first successful exact read consumes retention immediately');}
  helper.dispose();empty(helper);
 }
 const timed=new GPUAlphaBounds(),mock=rendererMock();t.after(()=>timed.dispose());const pending=timed.warmup(mock.renderer,1024,768,12,{idleLeaseMs:15000,timeoutMs:1});assert.equal(timed.retainWarmupResources(),true);assert.equal(await pending,false);empty(timed);mock.compiles[0].gate.resolve();await turn();empty(timed);
});

const corpseSnapshot=selected=>({width:selected.image.width,height:selected.image.height,pixels:Array.from(selected.image.pixels),metadata:structuredClone(selected.metadata),frame:structuredClone(selected.frame),placement:structuredClone(selected.placement),completedNativeDeath:selected.completedNativeDeath});
function completedCorpse(){
 const corpse={angle:.7,time:1},original={width:256,height:256,pixels:new Uint8Array([1,7,8,128,255])},createImage=()=>{const image={};image.getContext=()=>({drawImage(source){image.pixels=source.pixels.slice();}});return image;},cache=new CompletedEnemyFrames({createImage});
 const selected={image:original,settledDeath:true,metadata:{liveRig:true,animation:{name:'DS_Death',loop:false,samples:96}},frame:{sample:95,rect:{x:0,y:0,width:256,height:256},alphaBounds:{x:10,y:20,width:30,height:40}},placement:{x:123,y:456,worldHeight:42}},copy=cache.remember(corpse,selected,42);assert.ok(copy?.completedNativeDeath);original.pixels.fill(0);return{corpse,cache,copy,snapshot:corpseSnapshot(copy)};
}
test('actual LiveBossRig idle cleanup honors only compatible explicit leases and preserves private completed death images through release',async t=>{
 for(const mode of ['pending','ready','expired','first-read','default','off','geometry','512','direct','crop','batch-ink']){
  const helper=new GPUAlphaBounds(),mock=rendererMock(),rig=Object.create(LiveBossRig.prototype),completed=completedCorpse();t.after(()=>helper.dispose());Object.assign(rig,{size:256,exactGPUAlphaBounds:true,gpuPoseBounds:false,directAlphaReadback:false,cropNativeComposite:false,batchInkComposite:false,gpuAlphaBounds:helper,gpuRaw:{width:1024,height:768}});
  const promise=helper.warmup(mock.renderer,1024,768,12,{idleLeaseMs:mode==='default'?0:15000}),allocated=resources(helper),disposed=disposals(allocated);
  if(mode!=='pending'){mock.compiles[0].gate.resolve();assert.equal(await promise,true);}if(mode==='expired')helper.warmReady.idleLeaseUntil=performance.now()-1;if(mode==='first-read')assert.deepEqual(helper.read(mock.renderer,1024,768,12),expectedBounds(12));if(mode==='off')rig.exactGPUAlphaBounds=false;if(mode==='geometry')rig.gpuPoseBounds=true;if(mode==='512')rig.size=512;if(mode==='direct')rig.directAlphaReadback=true;if(mode==='crop')rig.cropNativeComposite=true;if(mode==='batch-ink')rig.batchInkComposite=true;
  rig.releaseIdleExactGPUAlpha(0,1);assert.ok(helper.rawBytes>0,'fresh native death selection retains its original in-progress resources');rig.releaseIdleExactGPUAlpha(0,0);
  if(mode==='pending'||mode==='ready'){assert.ok(helper.rawBytes>0);assert.ok(allocated.every(r=>disposed.get(r)===0));assert.deepEqual([rig.gpuRaw.width,rig.gpuRaw.height],[1024,768]);if(mode==='pending'){mock.compiles[0].gate.resolve();assert.equal(await promise,true);}helper.warmReady.idleLeaseUntil=performance.now()-1;rig.releaseIdleExactGPUAlpha();}
  empty(helper);assert.ok(allocated.every(r=>disposed.get(r)===1));assert.deepEqual([rig.gpuRaw.width,rig.gpuRaw.height],mode==='geometry'?[1024,768]:[1,1]);assert.equal(completed.cache.get(completed.corpse,42),completed.copy);assert.deepEqual(corpseSnapshot(completed.copy),completed.snapshot,'lease/flag changes and idle cleanup never alter private original death pixels, bounds or placement');
 }
});
