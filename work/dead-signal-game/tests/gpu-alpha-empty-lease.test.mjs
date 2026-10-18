import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {LiveBossRig} from '../dist/boss-rig/live-boss.js';
import {GPUAlphaBounds} from '../dist/boss-rig/gpu-alpha-bounds.js';
import {CompletedEnemyFrames} from '../dist/completed-enemy-frames.js';

const bytes=await readFile(new URL('../../../qa/gpu-alpha-empty-lease-20261018/live-boss-before-empty-lease.txt',import.meta.url));
assert.equal(bytes.length,21121);
assert.equal(createHash('sha256').update(bytes).digest('hex'),'61df38772e3bdce8122f92a1e05b6c4052f81e3f5c3b4b8a91946d1649657612','the full independent original class is pinned before the empty-lease change');
const originalURL=new URL('../dist/boss-rig/live-boss.js',import.meta.url),originalText=bytes.toString('utf8');
assert.equal(originalText.split("new URL('./',import.meta.url)").length,2,'only the original asset base needs rebasing');
// Rebase imports and the asset URL only. No original method body is extracted,
// recreated or replaced with candidate expressions.
const originalSource=originalText.replace(/(from\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,(_all,prefix,specifier,suffix)=>prefix+new URL(specifier,originalURL).href+suffix)
 .replace("new URL('./',import.meta.url)",`new URL('./',${JSON.stringify(originalURL.href)})`);
const {LiveBossRig:OriginalLiveBossRig}=await import('data:text/javascript;base64,'+Buffer.from(originalSource).toString('base64'));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const resourceKeys=['source','rows','bounds','geometry','rowMaterial','boundsMaterial'];
const resources=helper=>resourceKeys.map(key=>helper[key]);
const bounds=count=>Array.from({length:count},(_,i)=>({x:i,y:i+1,width:256-2*i,height:254-2*i}));

// The deferred compile and byte records model only API/lifecycle protocol.
// They do not execute GLSL or establish real GPU pixel/performance results.
function rendererMock(){
 const calls=[],compiles=[],listeners=new Map(),pixels=new Uint8Array([0,7,8,128,255]);
 const state={target:null,face:2,level:1,viewport:new THREE.Vector4(9,10,19,29),scissor:new THREE.Vector4(3,4,17,18),scissorTest:true,lost:false,compileError:null};
 const surface={width:1024,height:768,pixels,addEventListener(name,listener){let set=listeners.get(name);if(!set)listeners.set(name,set=new Set());set.add(listener);},removeEventListener(name,listener){listeners.get(name)?.delete(listener);}};
 const gl={NO_ERROR:0,isContextLost(){calls.push(['lost-query']);return state.lost;},getError(){calls.push(['error-query']);return 0;}};
 const renderer={domElement:surface,xr:{isPresenting:false},autoClear:true,getContext(){calls.push(['context']);return gl;},getRenderTarget:()=>state.target,getActiveCubeFace:()=>state.face,getActiveMipmapLevel:()=>state.level,getViewport:out=>out.copy(state.viewport),getScissor:out=>out.copy(state.scissor),getScissorTest:()=>state.scissorTest,
  setRenderTarget(target,face=0,level=0){calls.push(['target',target?.height??null,face,level]);state.target=target;state.face=face;state.level=level;},
  setViewport(x,y,w,h){state.viewport.copy(x?.isVector4?x:new THREE.Vector4(x,y,w,h));calls.push(['viewport',...state.viewport.toArray()]);},
  setScissor(x,y,w,h){state.scissor.copy(x?.isVector4?x:new THREE.Vector4(x,y,w,h));calls.push(['scissor',...state.scissor.toArray()]);},
  setScissorTest(value){calls.push(['scissor-test',value]);state.scissorTest=value;},
  compileAsync(scene,camera){assert.equal(this,renderer);assert.ok(camera.isCamera);assert.equal(scene.children[0].material.length,2);const gate=deferred();compiles.push(gate);calls.push(['compile']);state.viewport.set(55,66,77,88);state.scissor.set(11,22,33,44);state.scissorTest=false;renderer.autoClear=false;if(state.compileError)throw state.compileError;return gate.promise;},
  copyFramebufferToTexture(texture){assert.equal(state.target,null);assert.ok(texture.isFramebufferTexture);calls.push(['copy']);},
  render(scene,camera){assert.ok(camera.isCamera);assert.notEqual(state.target,null);assert.ok(scene.children[0].material.isRawShaderMaterial);calls.push(['render',state.target.height]);},
  readRenderTargetPixels(target,x,y,count,rows,buffer){assert.equal(target,state.target);assert.equal(rows,1);calls.push(['read',x,y,count,rows]);for(let i=0;i<count;i++)buffer.set([i,i+1,255-i,254-i],i*4);},
 };
 return{renderer,state,calls,compiles,pixels,snapshot:()=>({target:state.target,face:state.face,level:state.level,viewport:state.viewport.toArray(),scissor:state.scissor.toArray(),scissorTest:state.scissorTest,autoClear:renderer.autoClear,width:surface.width,height:surface.height,pixels:Array.from(pixels)}),dispatch(name){for(const listener of [...(listeners.get(name)||[])])listener({type:name});},listenerCount:()=>[...listeners.values()].reduce((count,set)=>count+set.size,0)};
}
function fixture(Class=LiveBossRig){
 const mock=rendererMock(),helper=new GPUAlphaBounds(),rig=Object.create(Class.prototype),pure=[];
 Object.assign(rig,{renderer:mock.renderer,size:256,exactGPUAlphaBounds:true,verifyExactGPUAlphaBounds:false,minGPUAlphaCells:12,gpuPoseBounds:false,directAlphaReadback:false,cropNativeComposite:false,batchInkComposite:false,lost:false,gpuAlphaBounds:helper,gpuRaw:{width:1024,height:768},gpuAlphaStats:{frames:0,verified:0,mismatches:0,fallbacks:0,bytesRead:0},batch:{width:1024,height:768,items:[]},batchInk:{release(){mock.calls.push(['ink-release']);}}});
 const dispose=helper.dispose,retain=helper.retainWarmupResources,compatible=Class.prototype.gpuAlphaCompatible;
 helper.dispose=function(...args){mock.calls.push(['helper-dispose']);return dispose.apply(this,args);};
 helper.retainWarmupResources=function(...args){pure.push(['lease']);return retain.apply(this,args);};
 rig.gpuAlphaCompatible=function(...args){pure.push(['compatible']);return compatible.apply(this,args);};
 return{rig,helper,mock,pure,close(){helper.dispose();}};
}
async function prepare(f,{pending=false,lease=15000}={}){
 const promise=f.helper.warmup(f.mock.renderer,1024,768,12,{idleLeaseMs:lease,timeoutMs:10000});
 if(!pending){f.mock.compiles.at(-1).resolve();assert.equal(await promise,true);}
 return{promise};
}
function countDisposals(list){const counts=new Map();for(const resource of list){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}return counts;}
function assertEmpty(helper){for(const key of [...resourceKeys,'mesh','scene','camera','owner','warmFlight','warmReady','contextSurface','contextLossListener'])assert.equal(helper[key]??null,null,key);assert.equal(helper.rawBytes,0);assert.equal(helper.bytesRead,0);}
function completedCorpse(){
 const actor={angle:.7,time:1},source={width:256,height:256,pixels:new Uint8Array([1,7,8,128,255])};
 const cache=new CompletedEnemyFrames({createImage(){const image={};image.getContext=()=>({drawImage(original){image.pixels=original.pixels.slice();}});return image;}});
 const selected={image:source,settledDeath:true,metadata:{liveRig:true,animation:{name:'DS_Death',loop:false,samples:96}},frame:{sample:95,rect:{x:0,y:0,width:256,height:256},alphaBounds:{x:10,y:20,width:30,height:40}},placement:{x:123,y:456,worldHeight:42}};
 const copy=cache.remember(actor,selected,42);assert.ok(copy?.completedNativeDeath);source.pixels.fill(0);
 return{cache,actor,copy,saved:structuredClone({...copy,image:{width:copy.image.width,height:copy.image.height,pixels:Array.from(copy.image.pixels)}})};
}
function assertCorpse(corpse){assert.equal(corpse.cache.get(corpse.actor,42),corpse.copy);assert.deepEqual({...corpse.copy,image:{width:corpse.copy.image.width,height:corpse.copy.image.height,pixels:Array.from(corpse.copy.image.pixels)}},corpse.saved);}

test('empty batches without a valid explicit lease preserve the pinned full-original protocol, fallback and resource-disposal order',async t=>{
 const cases=['default','off','expired','consumed','null-batch','512','geometry','direct','crop','batch-ink','lost','xr','wrong-owner'];
 for(const mode of cases){
  const results=[];
  for(const Class of [OriginalLiveBossRig,LiveBossRig]){
   const f=fixture(Class);t.after(()=>f.close());await prepare(f,{lease:mode==='default'?0:15000});const allocated=resources(f.helper),disposals=countDisposals(allocated),corpse=completedCorpse();
   if(mode==='expired')f.helper.warmReady.idleLeaseUntil=performance.now()-1;
   if(mode==='consumed')assert.deepEqual(f.helper.read(f.mock.renderer,1024,768,12),bounds(12));
   if(mode==='off')f.rig.exactGPUAlphaBounds=false;if(mode==='null-batch')f.rig.batch=null;if(mode==='512')f.rig.size=512;if(mode==='geometry')f.rig.gpuPoseBounds=true;if(mode==='direct')f.rig.directAlphaReadback=true;if(mode==='crop')f.rig.cropNativeComposite=true;if(mode==='batch-ink')f.rig.batchInkComposite=true;if(mode==='lost')f.rig.lost=true;if(mode==='xr')f.mock.renderer.xr.isPresenting=true;if(mode==='wrong-owner')f.helper.owner={differentRenderer:true};
   f.mock.calls.length=0;f.pure.length=0;const result=f.rig.endBatch();
   assert.equal(result,undefined);assert.equal(f.rig.batch,null);assertEmpty(f.helper);assert.ok(allocated.every(resource=>disposals.get(resource)===1),mode+' releases every owned resource once');assertCorpse(corpse);
   assert.deepEqual([f.rig.gpuRaw.width,f.rig.gpuRaw.height],mode==='geometry'?[1024,768]:[1,1]);
   assert.deepEqual(f.mock.calls,[['scissor-test',false],['ink-release'],['helper-dispose']],mode+' initiates no GL query/draw/read/copy');
   if(Class===LiveBossRig&&['off','null-batch','512','lost','xr'].includes(mode))assert.equal(f.pure.some(call=>call[0]==='lease'),false,mode+' short-circuits before lease evaluation');
   if(Class===LiveBossRig&&mode==='off')assert.deepEqual(f.pure,[],'default GPU-OFF adds no compatibility or clock/lease call');
   results.push({result,trace:f.mock.calls,snapshot:f.mock.snapshot(),raw:[f.rig.gpuRaw.width,f.rig.gpuRaw.height],reads:f.helper.reads,fallbacks:f.helper.fallbacks});
  }
  assert.deepEqual(results[1],results[0],mode+' matches the independent full original class');
 }
});

test('actual pending and ready leases survive an empty batch without draws or reads and the next twelve-cell original batch reuses its resources',async t=>{
 for(const pending of [true,false]){
  const f=fixture();t.after(()=>f.close());const {promise}=await prepare(f,{pending}),allocated=resources(f.helper),disposals=countDisposals(allocated),corpse=completedCorpse(),before=f.mock.snapshot(),raw=f.helper.rawBytes,flight=f.helper.warmFlight;
  f.mock.calls.length=0;assert.equal(f.rig.endBatch(),undefined);assert.equal(f.rig.batch,null);assert.deepEqual(f.mock.calls,[['scissor-test',false],['ink-release']]);assert.deepEqual(resources(f.helper),allocated);assert.equal(f.helper.rawBytes,raw);assert.equal(f.helper.reads,0);assert.equal(f.helper.bytesRead,0);assert.ok(allocated.every(resource=>disposals.get(resource)===0));assert.deepEqual([f.rig.gpuRaw.width,f.rig.gpuRaw.height],[1024,768]);assert.deepEqual(f.mock.snapshot(),{...before,scissorTest:false});assertCorpse(corpse);
  if(pending){assert.equal(f.helper.warmFlight,flight);f.mock.compiles[0].resolve();assert.equal(await promise,true);}
  const finished=[],colour={originalColour:true};f.rig.gpuSurface=()=>colour;f.rig.finishFrame=(...args)=>finished.push(args);
  const items=Array.from({length:12},(_,index)=>({actor:{id:index},offsetX:index%4*256,offsetY:Math.floor(index/4)*256})),input=structuredClone(items);f.rig.batch={width:1024,height:768,items};
  f.mock.calls.length=0;f.rig.endBatch();assert.deepEqual(items,input);assert.deepEqual(resources(f.helper),allocated);assert.ok(allocated.every(resource=>disposals.get(resource)===0));assert.equal(f.helper.reads,1);assert.equal(f.helper.bytesRead,48);assert.equal(f.rig.gpuAlphaStats.frames,12);assert.equal(f.rig.gpuAlphaStats.bytesRead,48);assert.equal(f.rig.gpuAlphaStats.fallbacks,0);assert.equal(finished.length,12);
  for(let i=0;i<12;i++){assert.equal(finished[i][0],items[i]);assert.equal(finished[i][1],colour);assert.equal(finished[i][2],null);assert.deepEqual(finished[i][6],bounds(12)[i]);assert.equal(finished[i][8],true);}
  assert.equal(f.mock.calls.filter(call=>call[0]==='copy').length,1);assert.equal(f.mock.calls.filter(call=>call[0]==='render').length,2);assert.deepEqual(f.mock.calls.filter(call=>call[0]==='read'),[['read',0,0,12,1]]);assert.deepEqual(Array.from(f.mock.pixels),before.pixels);assertCorpse(corpse);
  f.rig.batch={items:[]};f.mock.calls.length=0;f.rig.endBatch();assertEmpty(f.helper);assert.ok(allocated.every(resource=>disposals.get(resource)===1),'the first successful read consumes only retention and later empty cleanup disposes once');assert.deepEqual(f.mock.calls,[['scissor-test',false],['ink-release'],['helper-dispose']]);assertCorpse(corpse);
 }
});

test('successful lease retention is the sole intended original-oracle difference and leaves completed private death data unchanged',async t=>{
 const results=[];
 for(const Class of [OriginalLiveBossRig,LiveBossRig]){
  const f=fixture(Class);t.after(()=>f.close());await prepare(f);const before=f.mock.snapshot(),corpse=completedCorpse();f.mock.calls.length=0;
  assert.equal(f.rig.endBatch(),undefined);assertCorpse(corpse);assert.deepEqual(f.mock.snapshot(),{...before,scissorTest:false});
  results.push({calls:f.mock.calls,reads:f.helper.reads,bytes:f.helper.bytesRead,raw:f.helper.rawBytes,corpse:corpse.saved});
 }
 assert.deepEqual(results[0].calls,[['scissor-test',false],['ink-release'],['helper-dispose']]);assert.deepEqual(results[1].calls,[['scissor-test',false],['ink-release']]);assert.equal(results[0].raw,0);assert.ok(results[1].raw>0);assert.equal(results[1].reads,0);assert.equal(results[1].bytes,0);assert.deepEqual(results[1].corpse,results[0].corpse);
});

test('early original exceptions preserve throw identity, batch detachment and protocol before lease checks',async t=>{
 for(const failure of ['scissor','ink']){
  const marker={originalException:failure},results=[];
  for(const Class of [OriginalLiveBossRig,LiveBossRig]){
   const f=fixture(Class);t.after(()=>f.close());await prepare(f);const allocated=resources(f.helper),disposals=countDisposals(allocated);
   if(failure==='scissor')f.mock.renderer.setScissorTest=value=>{f.mock.calls.push(['scissor-test',value]);throw marker;};
   else f.rig.batchInk.release=()=>{f.mock.calls.push(['ink-release']);throw marker;};
   f.mock.calls.length=0;f.pure.length=0;assert.throws(()=>f.rig.endBatch(),error=>error===marker);assert.equal(f.rig.batch,null);assert.deepEqual(resources(f.helper),allocated);assert.ok(allocated.every(resource=>disposals.get(resource)===0));assert.deepEqual(f.pure,[]);results.push(f.mock.calls);
  }
  assert.deepEqual(results[1],results[0]);
 }
});

test('context loss, failed reprepare, abort and timeout invalidate retained generations and late completion cannot resurrect them',async t=>{
 for(const mode of ['context','compile-failure','abort','timeout']){
  const f=fixture();t.after(()=>f.close());const controller=new AbortController(),options={idleLeaseMs:15000,timeoutMs:mode==='timeout'?1:10000,signal:controller.signal};
  const promise=f.helper.warmup(f.mock.renderer,1024,768,12,options),allocated=resources(f.helper),disposals=countDisposals(allocated),oldGate=f.mock.compiles[0];f.rig.endBatch();assert.ok(f.helper.rawBytes>0);
  if(mode==='context'){f.mock.state.lost=true;f.mock.dispatch('webglcontextlost');f.mock.state.lost=false;f.mock.dispatch('webglcontextrestored');}
  else if(mode==='abort')controller.abort();
  else if(mode==='compile-failure'){f.mock.state.compileError=Error('original-reprepare-compile-failed');const replacement=f.helper.warmup(f.mock.renderer,512,256,2);assert.equal(await replacement,false,'a conflicting active generation rejects without replacing the original');f.helper.prepare(f.mock.renderer,1024,768,12);assert.equal(await promise,false);const failing=f.helper.warmup(f.mock.renderer,1024,768,12,{idleLeaseMs:15000});assert.equal(await failing,false);}
  assert.equal(await promise,false);assertEmpty(f.helper);assert.ok(allocated.every(resource=>disposals.get(resource)===1));assert.equal(f.mock.listenerCount(),0);
  oldGate.resolve();await turn();assertEmpty(f.helper);f.rig.batch={items:[]};f.mock.calls.length=0;f.rig.endBatch();assert.deepEqual(f.mock.calls,[['scissor-test',false],['ink-release'],['helper-dispose']]);
  f.mock.state.compileError=null;const retry=f.helper.warmup(f.mock.renderer,1024,768,12,{idleLeaseMs:15000});f.mock.compiles.at(-1).resolve();assert.equal(await retry,true);const replacement=resources(f.helper);oldGate.reject(Error('late-old-error'));await turn();assert.deepEqual(resources(f.helper),replacement);assert.equal(f.helper.warmReady.rows,f.helper.rowMaterial);
 }
});
