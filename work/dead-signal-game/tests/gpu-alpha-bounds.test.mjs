import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GPUAlphaBounds,decodeGPUAlphaBounds,GPU_ALPHA_CELL_SIZE,GPU_ALPHA_MAX_CELLS} from '../dist/boss-rig/gpu-alpha-bounds.js';
import {LiveBossRig} from '../dist/boss-rig/live-boss.js';
import {RigFramePool} from '../dist/boss-rig/frame-pool.js';
import {BatchNativeInk} from '../dist/boss-rig/batch-native-ink.js';
import {CompletedEnemyFrames} from '../dist/completed-enemy-frames.js';
import {nativeAlphaBounds} from '../dist/native-alpha-bounds.js';

// This renderer only verifies the resource/state/readback protocol. It supplies
// known byte records and never evaluates GLSL; actual shader math and native
// alpha equality remain the responsibility of the separate real-browser QA.
function rendererMock(width=1024,height=768){
 const state={target:null,viewport:new THREE.Vector4(9,10,19,29),scissor:new THREE.Vector4(3,4,17,18),scissorTest:true,face:2,level:1,lost:false,error:0,fail:null,renders:0},calls=[];
 const gl={NO_ERROR:0,isContextLost:()=>state.lost,getError:()=>state.error};
 const renderer={domElement:{width,height},xr:{isPresenting:false},autoClear:true,
  getContext:()=>gl,getRenderTarget:()=>state.target,getViewport:t=>t.copy(state.viewport),getScissor:t=>t.copy(state.scissor),getScissorTest:()=>state.scissorTest,getActiveCubeFace:()=>state.face,getActiveMipmapLevel:()=>state.level,
  copyFramebufferToTexture(texture){calls.push({kind:'copy',texture,target:state.target});assert.equal(state.target,null,'copy the untouched default framebuffer before binding any reduction target');if(state.fail==='copy')throw Error('mock-copy-failure');},
  setRenderTarget(target,face=0,level=0){calls.push({kind:'target',target,face,level});state.target=target;state.face=face;state.level=level;},
  setViewport(x,y,w,h){state.viewport.copy(x?.isVector4?x:new THREE.Vector4(x,y,w,h));calls.push({kind:'viewport',value:state.viewport.toArray()});},
  setScissor(x,y,w,h){state.scissor.copy(x?.isVector4?x:new THREE.Vector4(x,y,w,h));calls.push({kind:'scissor',value:state.scissor.toArray()});},
  setScissorTest(value){state.scissorTest=value;calls.push({kind:'scissorTest',value});},
  render(scene,camera){state.renders++;calls.push({kind:'render',target:state.target,material:scene.children[0].material,viewport:state.viewport.toArray(),scissorTest:state.scissorTest,autoClear:renderer.autoClear});assert.ok(camera.isCamera);if(state.fail==='render'+state.renders)throw Error('mock-render-failure');},
  readRenderTargetPixels(target,x,y,count,rows,buffer){calls.push({kind:'read',target,x,y,count,rows});assert.equal(target,state.target);assert.equal(rows,1);if(state.fail==='read')throw Error('mock-read-failure');for(let i=0;i<count;i++)buffer.set([i,i+1,255-i,254-i],i*4);},
 };
 const snapshot=()=>({target:state.target,viewport:state.viewport.toArray(),scissor:state.scissor.toArray(),scissorTest:state.scissorTest,face:state.face,level:state.level,autoClear:renderer.autoClear});
 return{renderer,state,calls,snapshot};
}
const resources=helper=>[helper.source,helper.rows,helper.bounds,helper.geometry,helper.rowMaterial,helper.boundsMaterial];
function disposalCounts(items){const counters=new Map();for(const resource of items){counters.set(resource,0);resource.addEventListener('dispose',()=>counters.set(resource,counters.get(resource)+1));}return counters;}
function emptyResources(helper){for(const key of ['source','rows','bounds','geometry','rowMaterial','boundsMaterial','mesh','scene','camera','owner'])assert.equal(helper[key]??null,null,key+' is released');assert.equal(helper.rawBytes,0);assert.equal(helper.bytesRead,0);}

test('GPU alpha bound records decode empty cells and inclusive one-pixel/extreme coordinates for all twelve cells',()=>{
 assert.equal(GPU_ALPHA_CELL_SIZE,256);assert.equal(GPU_ALPHA_MAX_CELLS,12);
 const bytes=new Uint8Array(48);for(let i=0;i<12;i++)bytes.set([i,i,255-i,255-i],i*4);
 bytes.set([255,255,0,0],0);bytes.set([0,0,0,0],4);bytes.set([255,255,255,255],8);bytes.set([0,0,255,255],12);bytes.set([4,9,33,10],16);bytes.set([5,10,5,9],20);
 const result=decodeGPUAlphaBounds(bytes,12);assert.equal(result.length,12);assert.equal(result[0],null);assert.deepEqual(result[1],{x:0,y:0,width:1,height:1});assert.deepEqual(result[2],{x:255,y:255,width:1,height:1});assert.deepEqual(result[3],{x:0,y:0,width:256,height:256});assert.deepEqual(result[4],{x:4,y:9,width:30,height:2});assert.equal(result[5],null);
 for(let i=6;i<12;i++)assert.deepEqual(result[i],{x:i,y:i,width:256-2*i,height:256-2*i});
 for(const count of [-1,0,13,1.5,NaN,Infinity,undefined])assert.equal(decodeGPUAlphaBounds(bytes,count),null);
 assert.equal(decodeGPUAlphaBounds(new Uint8Array(7),2),null);assert.equal(decodeGPUAlphaBounds(null,1),null);assert.equal(decodeGPUAlphaBounds(undefined,1),null);
});

test('unsupported renderer, invalid atlas sizes and lost/nondefault contexts fail before allocation or rendering',()=>{
 const required=['getContext','getRenderTarget','getViewport','getScissor','getScissorTest','getActiveCubeFace','getActiveMipmapLevel','copyFramebufferToTexture','setRenderTarget','setViewport','setScissor','setScissorTest','render','readRenderTargetPixels'];
 const reject=(mock,width=1024,height=768,count=12,options={})=>{
  const helper=new GPUAlphaBounds();let preparations=0;helper.prepare=()=>{preparations++;throw Error('invalid input must not allocate');};assert.equal(helper.read(mock?.renderer,width,height,count,options),null);assert.equal(preparations,0);assert.equal(helper.fallbacks,1);assert.equal(helper.reads,0);emptyResources(helper);if(mock)assert.equal(mock.calls.length,0);
 };
 reject(null);for(const key of required){const mock=rendererMock();mock.renderer[key]=undefined;reject(mock);}
 for(const [width,height,count,size]of [[1024,768,13,256],[1024,768,0,256],[1024,768,1.5,256],[1024,768,12,512],[1280,256,5,256],[1024,1024,12,256],[257,256,1,256],[256,257,1,256],[256,256,2,256],[0,256,1,256],[NaN,256,1,256]])reject(rendererMock(width,height),width,height,count,{size});
 const noContext=rendererMock();noContext.renderer.getContext=()=>null;reject(noContext);
 const lost=rendererMock();lost.state.lost=true;reject(lost);const target=rendererMock();target.state.target={existingRenderTarget:true};reject(target);
 const xr=rendererMock();xr.renderer.xr.isPresenting=true;reject(xr);reject(rendererMock(512,256));
 const getterFailure=rendererMock();getterFailure.renderer.getViewport=()=>{throw Error('mock-state-getter-failure');};reject(getterFailure);
});

test('read uses raw nearest RGBA targets, copies first, restores state, reuses 12/5/12 resources and releases resized or changed-owner resources',()=>{
 const helper=new GPUAlphaBounds(),mock=rendererMock(),before=mock.snapshot(),result=helper.read(mock.renderer,1024,768,12);
 assert.deepEqual(result,Array.from({length:12},(_,i)=>({x:i,y:i+1,width:256-2*i,height:254-2*i})));assert.deepEqual(mock.snapshot(),before);
 assert.equal(helper.reads,1);assert.equal(helper.bytesRead,48);assert.equal(helper.rawBytes,(1024*768+12*256+12)*4);
 assert.ok(helper.source.isFramebufferTexture);assert.equal(helper.source.image.width,1024);assert.equal(helper.source.image.height,768);assert.equal(helper.source.colorSpace,THREE.NoColorSpace);assert.equal(helper.source.internalFormat,'RGBA8');assert.equal(helper.source.minFilter,THREE.NearestFilter);assert.equal(helper.source.magFilter,THREE.NearestFilter);assert.equal(helper.source.generateMipmaps,false);
 for(const target of [helper.rows,helper.bounds]){
  assert.ok(target.isWebGLRenderTarget);assert.equal(target.texture.format,THREE.RGBAFormat);assert.equal(target.texture.type,THREE.UnsignedByteType);assert.equal(target.texture.internalFormat,'RGBA8');assert.equal(target.texture.colorSpace,THREE.NoColorSpace);assert.equal(target.texture.minFilter,THREE.NearestFilter);assert.equal(target.texture.magFilter,THREE.NearestFilter);assert.equal(target.texture.generateMipmaps,false);assert.equal(target.depthBuffer,false);assert.equal(target.stencilBuffer,false);assert.equal(target.samples,0);
 }
 for(const material of [helper.rowMaterial,helper.boundsMaterial]){
  assert.ok(material.isRawShaderMaterial);assert.equal(material.glslVersion,THREE.GLSL3);assert.equal(material.blending,THREE.NoBlending);assert.equal(material.transparent,false);assert.equal(material.premultipliedAlpha,false);assert.equal(material.toneMapped,false);assert.equal(material.dithering,false);assert.equal(material.depthTest,false);assert.equal(material.depthWrite,false);
 }
 assert.equal(mock.calls[0].kind,'copy');const passes=mock.calls.filter(c=>c.kind==='render');assert.equal(passes.length,2);assert.equal(passes[0].target,helper.rows);assert.equal(passes[1].target,helper.bounds);assert.equal(passes[0].material,helper.rowMaterial);assert.equal(passes[1].material,helper.boundsMaterial);assert.deepEqual(passes[0].viewport,[0,0,12,256]);assert.deepEqual(passes[1].viewport,[0,0,12,1]);assert.ok(passes.every(p=>p.autoClear===false&&p.scissorTest===false));
 const first=resources(helper),disposed=disposalCounts(first),source=helper.source;
 for(const count of [5,12]){assert.equal(helper.read(mock.renderer,1024,768,count).length,count);assert.equal(helper.source,source);assert.deepEqual(resources(helper),first);assert.equal(helper.rows.width,count);assert.equal(helper.bounds.width,count);assert.equal(helper.rawBytes,(1024*768+count*256+count)*4);assert.deepEqual(mock.snapshot(),before);}
 assert.equal(disposed.get(first[1]),2);assert.equal(disposed.get(first[2]),2);assert.equal(disposed.get(source),0);
 mock.renderer.domElement.width=512;mock.renderer.domElement.height=256;assert.equal(helper.read(mock.renderer,512,256,2).length,2);assert.notEqual(helper.source,source);assert.equal(disposed.get(source),1);assert.equal(helper.geometry,first[3]);assert.equal(helper.rowMaterial.uniforms.originalAtlas.value,helper.source);assert.equal(helper.rowMaterial.uniforms.atlasHeight.value,256);assert.equal(helper.rowMaterial.uniforms.columns.value,2);assert.equal(helper.rawBytes,(512*256+2*256+2)*4);assert.deepEqual(mock.snapshot(),before);
 const old=resources(helper),oldDisposals=disposalCounts(old),nextOwner=rendererMock(512,256),nextState=nextOwner.snapshot();assert.equal(helper.read(nextOwner.renderer,512,256,2).length,2);assert.deepEqual(nextOwner.snapshot(),nextState);assert.ok(old.every(resource=>oldDisposals.get(resource)===1),'switching renderer owners disposes every old GL resource');assert.equal(helper.owner,nextOwner.renderer);
 const current=resources(helper),finalDisposals=disposalCounts(current);helper.dispose();assert.ok(current.every(resource=>finalDisposals.get(resource)===1));emptyResources(helper);assert.equal(helper.width,0);assert.equal(helper.height,0);helper.dispose();assert.ok(current.every(resource=>finalDisposals.get(resource)===1),'repeated disposal does not dispose old resources again');
});

test('copy, render, read and GL failures release resources and restore every saved renderer state before a clean retry',()=>{
 for(const fail of ['copy','render1','render2','read','gl-error']){
  const helper=new GPUAlphaBounds(),mock=rendererMock(),before=mock.snapshot();if(fail==='gl-error')mock.state.error=1282;else mock.state.fail=fail;
  assert.equal(helper.read(mock.renderer,1024,768,12),null,fail);assert.deepEqual(mock.snapshot(),before,fail+' renderer state');assert.equal(helper.fallbacks,1);assert.equal(helper.reads,0);assert.match(helper.lastError,/mock-|gpu-alpha-bounds-gl-error/);emptyResources(helper);
  mock.state.fail=null;mock.state.error=0;mock.state.renders=0;assert.equal(helper.read(mock.renderer,1024,768,12).length,12);assert.deepEqual(mock.snapshot(),before);assert.equal(helper.reads,1);helper.dispose();emptyResources(helper);
 }
});

function alphaSurface(width,height){
 const image={width,height,alpha:new Uint8Array(width*height)},context={globalCompositeOperation:'source-over',clearRect(){image.alpha.fill(0);},fillRect(){assert.equal(this.globalCompositeOperation,'source-in');},drawImage(source,...args){
  const [sx,sy,sw,sh,dx,dy,dw,dh]=args.length===2?[0,0,source.width,source.height,args[0],args[1],source.width,source.height]:args;assert.equal(sw,dw);assert.equal(sh,dh);
  for(let row=0;row<sh;row++)for(let col=0;col<sw;col++){const x=dx+col,y=dy+row;if(x<0||y<0||x>=width||y>=height)continue;const alpha=source.alpha[(sy+row)*source.width+sx+col],i=y*width+x;image.alpha[i]=Math.round(alpha+image.alpha[i]*(255-alpha)/255);}
 }};image.getContext=()=>context;return{image,context};
}
function integratedRig({size=256,count=2,exact=true,verify=false,mismatch=false,failedRead=false}={}){
 const columns=Math.min(4,count),rows=Math.ceil(count/columns),atlas=alphaSurface(size*columns,size*rows),pixels=new Uint8Array(size*columns*size*rows*4),key='enemy-original-fixture';
 atlas.image.alpha[0]=8;atlas.image.alpha[15*atlas.image.width+12]=255;atlas.image.alpha[(size-1)*atlas.image.width+size-1]=7;
 for(let i=1;i<count;i++){const x=i%columns*size,y=Math.floor(i/columns)*size;atlas.image.alpha[(y+40)*atlas.image.width+x+30]=128;atlas.image.alpha[(y+45)*atlas.image.width+x+35]=255;}
 for(let i=0;i<atlas.image.alpha.length;i++)pixels[i*4+3]=atlas.image.alpha[i];
 const config={original:'unchanged-source-fixture',projection:{subjectHeight:50,pixelsPerWorld:2.25,footPivot:{x:size/2,y:size*.8}},clips:Object.fromEntries(['idle','walk','windup','attack','hit','death'].map(n=>[n,{duration:1,loop:['idle','walk'].includes(n)}])),sampleDensity:{idle:128,walk:128,windup:64,attack:96,hit:64,death:96}};
 const motion=new THREE.Group(),subject=new THREE.Group(),bone=new THREE.Bone();bone.name='Hips';subject.add(bone);subject.add(motion);
 const sampler={clips:[{name:'DS_GroundedWalk',duration:1},{name:'DS_Death',duration:1.12}],motion,sample(){},updateSkinPose(){}},states=new WeakMap(),model={config,sampler,subject,bones:[bone],upperBones:[bone],states,indices:{idle:0,walk:0,windup:0,attack:0,hit:0,death:1},history:{remember(){return null;},takeDeath(){return null;}}};
 const items=Array.from({length:count},(_,i)=>{
  const actor=Object.freeze({id:40+i,x:1000+i*20,y:930,type:'walker',angle:i*.7,hp:i?0:100,hitFlash:0}),pose={name:i?'death':'walk',index:i?1:0,count:i?96:128,sample:i?95:4,angle:actor.angle,loop:!i,progress:i?1:.3,time:i?1.12:.3};if(i)states.set(actor,{key:'death'});
  const fallback={id:'unchanged-original-art',metadata:{projection:{...config.projection},atlas:{samples:128}},frame:{rect:{x:0,y:0,width:size,height:size}},locomotion:{pose:pose.name,phase:.3}};
  return{key,actor,config,sampler,pose,fallback,height:42,SIZE:size,signature:'fixture-'+i,density:2.25,pivot:{x:size/2,y:size*.8},slot:i,offsetX:i%columns*size,offsetY:Math.floor(i/columns)*size};
 });
 const rig=Object.create(LiveBossRig.prototype),ink=alphaSurface(size,size),calls={gpuReads:0,pixelReads:0,gpuCopies:0,disposed:0,finish:[]};
 const helper={rawBytes:4096,bytesRead:count*4,read(renderer,width,height,n=count){calls.gpuReads++;if(failedRead)return null;return items.slice(0,n).map((item,i)=>{const b=nativeAlphaBounds(pixels,atlas.image.width,atlas.image.height,8,{x:item.offsetX,y:item.offsetY,w:size,h:size});return mismatch&&i===count-1?{...b,x:b.x+1}:b;});},dispose(){calls.disposed++;this.rawBytes=0;}};
 Object.assign(rig,{size,exactGPUAlphaBounds:exact,verifyExactGPUAlphaBounds:verify,gpuPoseBounds:false,verifyPoseBounds:false,directAlphaReadback:false,verifyAlphaReadback:false,cropNativeComposite:false,batchInkComposite:false,gpuAlphaBounds:helper,gpuAlphaStats:{frames:0,verified:0,mismatches:0,fallbacks:0,bytesRead:0},models:new Map([[key,model]]),pending:new Map(),frames:new WeakMap(),framePool:new RigFramePool(()=>alphaSurface(size,size)),ink:ink.image,inkContext:ink.context,batchInk:new BatchNativeInk({createImage:()=>alphaSurface(atlas.image.width,atlas.image.height).image}),gpuRaw:{width:atlas.image.width,height:atlas.image.height},camera:new THREE.OrthographicCamera(-100,100,100,-100,.1,8000),scene:new THREE.Scene(),lost:false});
 rig.renderer={domElement:{width:atlas.image.width,height:atlas.image.height},setScissorTest(){},setViewport(){},setSize(w,h){this.domElement.width=w;this.domElement.height=h;},render(){}};
 rig.readSurface=()=>{calls.pixelReads++;return{source:atlas.image,pixels};};rig.gpuSurface=()=>{calls.gpuCopies++;return atlas.image;};
 rig.finishFrame=function(...args){calls.finish.push(args);return LiveBossRig.prototype.finishFrame.apply(this,args);};
 rig.batch={width:atlas.image.width,height:atlas.image.height,columns,items};
 return{rig,calls,items,atlas,pixels,key,model};
}
function selectedSnapshot(fixture){return fixture.items.map(item=>{const c=fixture.rig.frames.get(item.actor),selected=c.selected;return{frame:selected.frame,metadata:selected.metadata,placement:selected.placement,settledDeath:selected.settledDeath,alpha:Array.from(selected.image.alpha),clipped:c.diagnostics.clipped};});}

test('LiveBossRig batch integration keeps exact alpha metadata, placement, clipping and private original outputs while preserving legacy fallbacks',()=>{
 const baseline=integratedRig({exact:false});baseline.rig.endBatch();const expected=selectedSnapshot(baseline);
 for(const verify of [false,true]){
  const f=integratedRig({verify}),sourceBefore=JSON.stringify(f.items.map(i=>({actor:i.actor,config:i.config,pose:i.pose,fallback:i.fallback})));f.rig.endBatch();
  assert.deepEqual(selectedSnapshot(f),expected);assert.equal(f.calls.gpuReads,1);assert.equal(f.calls.pixelReads,verify?1:0);assert.equal(f.calls.gpuCopies,1);assert.equal(f.rig.lastBatchReadbacks,verify?2:1);assert.equal(f.rig.gpuAlphaStats.frames,2);assert.equal(f.rig.gpuAlphaStats.verified,verify?2:0);
  assert.ok(f.calls.finish.every(args=>args.length===9&&args[2]===null&&args[8]===true));assert.equal(JSON.stringify(f.items.map(i=>({actor:i.actor,config:i.config,pose:i.pose,fallback:i.fallback}))),sourceBefore);
  for(const item of f.items){const c=f.rig.frames.get(item.actor);assert.equal(c.pool.owner,item.actor);assert.notEqual(c.selected.image,f.atlas.image);assert.equal(c.selected.image.width,256);assert.deepEqual(c.selected.frame.rect,{x:0,y:0,width:256,height:256});assert.equal(c.selected.metadata.boundsKind,'alpha');}
  assert.equal(f.rig.frames.get(f.items[0].actor).diagnostics.clipped,true);assert.equal(f.rig.frames.get(f.items[1].actor).diagnostics.clipped,false);
  const corpse=f.items[1].actor,cache=new CompletedEnemyFrames({createImage:()=>alphaSurface(256,256).image}),completed=cache.remember(corpse,f.rig.frames.get(corpse).selected,42);assert.ok(completed?.completedNativeDeath);const retained=completed.image.alpha.slice();
  f.rig.framePool.claim(1,{}).image.alpha.fill(255);f.atlas.image.alpha.fill(0);assert.deepEqual(completed.image.alpha,retained,'finished native death remains a private copy after slot and atlas reuse');
 }
 for(const mode of ['mismatch','failed-read','disabled','512','crop','direct','geometry','batch-ink']){
  const f=integratedRig({size:mode==='512'?512:256,exact:mode!=='disabled',verify:mode==='mismatch',mismatch:mode==='mismatch',failedRead:mode==='failed-read'});
  if(mode==='crop')f.rig.cropNativeComposite=true;if(mode==='direct')f.rig.directAlphaReadback=true;if(mode==='geometry')f.rig.gpuPoseBounds=true;if(mode==='batch-ink')f.rig.batchInkComposite=true;
  f.rig.endBatch();assert.ok(f.calls.pixelReads>=1,mode+' retains the original readback fallback');assert.equal(f.calls.gpuCopies,0,mode+' does not pass failed bounds to the GPU colour surface');assert.ok(f.calls.finish.every(args=>args.length===(mode==='batch-ink'?8:6)&&args[8]!==true),mode+' keeps the existing compositor call signature');
  if(mode!=='512')assert.deepEqual(selectedSnapshot(f),expected,mode+' preserves exact old bounds and private alpha output');
  if(mode==='mismatch'){assert.equal(f.rig.gpuAlphaStats.mismatches,1);assert.equal(f.rig.gpuAlphaStats.frames,0);assert.equal(f.calls.pixelReads,2);}else if(mode==='failed-read')assert.equal(f.rig.gpuAlphaStats.fallbacks,1);else{assert.equal(f.calls.gpuReads,0);assert.equal(f.rig.gpuAlphaBounds.rawBytes,0);}
 }
 const empty=integratedRig();empty.rig.batch.items=[];empty.rig.endBatch();assert.equal(empty.calls.gpuReads,0);assert.equal(empty.calls.pixelReads,0);assert.equal(empty.calls.finish.length,0);assert.equal(empty.rig.gpuAlphaBounds.rawBytes,0);assert.deepEqual([empty.rig.gpuRaw.width,empty.rig.gpuRaw.height],[1,1]);
 const released=integratedRig();released.rig.releaseUnused([]);assert.equal(released.rig.models.size,0);assert.equal(released.rig.gpuAlphaBounds.rawBytes,0);
});

test('single-frame original rig cache invalidates exact/verify modes without disposing every compatible sampled pose',()=>{
 const f=integratedRig({count:1}),item=f.items[0];f.rig.batch=null;f.rig.frames.set(item.actor,alphaSurface(256,256));item.fallback.locomotion={pose:'idle',phase:0};f.model.sampler.clips[0].name='DS_Idle';
 const original=JSON.stringify(item.actor),first=f.rig.frame(f.key,item.actor,1,item.fallback,{height:42});assert.ok(first);assert.equal(f.calls.finish[0].length,9);assert.equal(first.metadata.boundsKind,'alpha');assert.equal(f.calls.gpuReads,1);assert.equal(f.calls.pixelReads,0);
 assert.equal(f.rig.frame(f.key,item.actor,1,item.fallback,{height:42}),first);assert.equal(f.calls.gpuReads,1,'unchanged source time still uses its original cached private frame');
 f.rig.verifyExactGPUAlphaBounds=true;assert.ok(f.rig.frame(f.key,item.actor,1,item.fallback,{height:42}));assert.equal(f.calls.gpuReads,2,'verification mode invalidates the frame signature');assert.equal(f.calls.pixelReads,1);assert.equal(f.calls.disposed,0,'compatible ongoing reads reuse the helper resources');
 f.rig.exactGPUAlphaBounds=false;assert.ok(f.rig.frame(f.key,item.actor,1,item.fallback,{height:42}));assert.equal(f.calls.finish.at(-1).length,6);assert.equal(f.calls.pixelReads,2);assert.equal(f.rig.gpuAlphaBounds.rawBytes,0);assert.equal(JSON.stringify(item.actor),original);
});

test('twelve-cell threshold uses CPU at eleven without disposal churn and invalidates same-time private caches when changed',()=>{
 const f=integratedRig({count:12});f.rig.minGPUAlphaCells=12;const batch={...f.rig.batch},helper=f.rig.gpuAlphaBounds;
 assert.deepEqual([batch.width,batch.height,batch.columns],[1024,768,4]);f.rig.endBatch();assert.equal(f.calls.gpuReads,1);assert.equal(f.calls.pixelReads,0);assert.ok(f.calls.finish.slice(-12).every(args=>args.length===9));
 f.rig.batch={...batch,items:f.items.slice(0,11)};f.rig.endBatch();assert.equal(f.calls.gpuReads,1);assert.equal(f.calls.pixelReads,1);assert.ok(f.calls.finish.slice(-11).every(args=>args.length===6));assert.equal(f.calls.disposed,0);assert.equal(f.rig.gpuAlphaBounds,helper);assert.ok(helper.rawBytes>0,'the compatible twelve-cell resources remain resident during an eleven-cell frame');
 f.rig.batch=batch;f.rig.endBatch();assert.equal(f.calls.gpuReads,2);assert.equal(f.calls.pixelReads,1);assert.equal(f.calls.disposed,0);assert.equal(f.rig.gpuAlphaBounds,helper);assert.ok(f.calls.finish.slice(-12).every(args=>args.length===9));
 const single=integratedRig({count:1}),item=single.items[0];single.rig.batch=null;single.rig.minGPUAlphaCells=12;single.rig.frames.set(item.actor,alphaSurface(256,256));item.fallback.locomotion={pose:'idle',phase:0};single.model.sampler.clips[0].name='DS_Idle';
 const first=single.rig.frame(single.key,item.actor,1,item.fallback,{height:42});assert.ok(first);assert.equal(single.calls.gpuReads,0);assert.equal(single.calls.pixelReads,1);assert.equal(single.calls.finish.at(-1).length,6);
 assert.equal(single.rig.frame(single.key,item.actor,1,item.fallback,{height:42}),first);assert.equal(single.calls.pixelReads,1);
 single.rig.minGPUAlphaCells=1;assert.ok(single.rig.frame(single.key,item.actor,1,item.fallback,{height:42}));assert.equal(single.calls.gpuReads,1);assert.equal(single.calls.pixelReads,1);assert.equal(single.calls.finish.at(-1).length,9,'lowering the threshold invalidates the same-time CPU frame');
 single.rig.minGPUAlphaCells=12;assert.ok(single.rig.frame(single.key,item.actor,1,item.fallback,{height:42}));assert.equal(single.calls.gpuReads,1);assert.equal(single.calls.pixelReads,2);assert.equal(single.calls.finish.at(-1).length,6,'restoring the production threshold invalidates the same-time GPU frame');assert.equal(single.calls.disposed,0);assert.ok(single.rig.gpuAlphaBounds.rawBytes>0);
});

test('idle cleanup retains GPU resources for live or fresh death selections and releases them without changing completed private corpses',()=>{
 const f=integratedRig({exact:false});f.rig.endBatch();const corpse=f.items[1].actor,completedCache=new CompletedEnemyFrames({createImage:()=>alphaSurface(256,256).image}),completed=completedCache.remember(corpse,f.rig.frames.get(corpse).selected,42);assert.ok(completed?.completedNativeDeath);
 const pixels=completed.image.alpha.slice(),frame=structuredClone(completed.frame),placement=structuredClone(completed.placement),gpu=new GPUAlphaBounds(),mock=rendererMock();assert.equal(gpu.read(mock.renderer,1024,768,12).length,12);assert.ok(gpu.rawBytes>0);const retained=resources(gpu),disposals=disposalCounts(retained);f.rig.gpuAlphaBounds=gpu;
 const bytes=gpu.rawBytes;for(const [alive,fresh]of [[0,1],[1,0],[11,1]]){f.rig.releaseIdleExactGPUAlpha(alive,fresh);assert.equal(gpu.rawBytes,bytes);assert.ok(retained.every(r=>disposals.get(r)===0));}
 f.rig.releaseIdleExactGPUAlpha(0,0);emptyResources(gpu);assert.ok(retained.every(r=>disposals.get(r)===1));assert.deepEqual([f.rig.gpuRaw.width,f.rig.gpuRaw.height],[1,1]);
 assert.equal(completedCache.get(corpse,42),completed);assert.deepEqual(completed.image.alpha,pixels);assert.deepEqual(completed.frame,frame);assert.deepEqual(completed.placement,placement,'idle cleanup never discards the preserved native corpse');
 f.rig.releaseIdleExactGPUAlpha();assert.ok(retained.every(r=>disposals.get(r)===1),'already-idle frames do not repeatedly dispose released resources');
});

test('idle cleanup shrinks the retained colour atlas after the reduction helper has already disposed itself on a read failure',()=>{
 const f=integratedRig({count:12});f.rig.minGPUAlphaCells=12;f.rig.endBatch();
 const corpse=f.items[1].actor,completedCache=new CompletedEnemyFrames({createImage:()=>alphaSurface(256,256).image}),completed=completedCache.remember(corpse,f.rig.frames.get(corpse).selected,42);assert.ok(completed?.completedNativeDeath);
 const original={alpha:completed.image.alpha.slice(),frame:structuredClone(completed.frame),placement:structuredClone(completed.placement)},gpu=new GPUAlphaBounds(),mock=rendererMock();assert.equal(gpu.read(mock.renderer,1024,768,12).length,12);
 const allocated=resources(gpu),disposals=disposalCounts(allocated);f.rig.gpuAlphaBounds=gpu;assert.deepEqual([f.rig.gpuRaw.width,f.rig.gpuRaw.height],[1024,768]);
 mock.state.fail='read';assert.equal(gpu.read(mock.renderer,1024,768,12),null);emptyResources(gpu);assert.ok(allocated.every(r=>disposals.get(r)===1));assert.deepEqual([f.rig.gpuRaw.width,f.rig.gpuRaw.height],[1024,768],'a failed reduction does not itself resize the independent colour canvas');
 let releases=0;f.rig.releaseExactGPUAlpha=function(){releases++;return LiveBossRig.prototype.releaseExactGPUAlpha.call(this);};
 f.rig.releaseIdleExactGPUAlpha(0,1);assert.equal(releases,0);assert.deepEqual([f.rig.gpuRaw.width,f.rig.gpuRaw.height],[1024,768],'fresh native corpses still retain their colour surface');
 f.rig.releaseIdleExactGPUAlpha(0,0);assert.equal(releases,1);assert.deepEqual([f.rig.gpuRaw.width,f.rig.gpuRaw.height],[1,1]);emptyResources(gpu);assert.ok(allocated.every(r=>disposals.get(r)===1),'idle cleanup does not redispose the failed helper resources');
 f.rig.releaseIdleExactGPUAlpha();assert.equal(releases,1,'the already-small idle canvas requires no repeated cleanup');
 assert.equal(completedCache.get(corpse,42),completed);assert.deepEqual(completed.image.alpha,original.alpha);assert.deepEqual(completed.frame,original.frame);assert.deepEqual(completed.placement,original.placement);
 f.rig.gpuPoseBounds=true;f.rig.gpuRaw.width=1024;f.rig.gpuRaw.height=768;f.rig.releaseIdleExactGPUAlpha();assert.equal(releases,1);assert.deepEqual([f.rig.gpuRaw.width,f.rig.gpuRaw.height],[1024,768],'an independently active geometry path retains its colour surface');
});

test('GPU colour-copy failures preserve successful frame statistics and recover through the same-frame legacy compositor in batch and single paths',()=>{
 for(const single of [false,true])for(const verify of [false,true]){
  const count=single?1:12,make=exact=>{const f=integratedRig({count,exact,verify});f.rig.minGPUAlphaCells=count;if(single){const item=f.items[0];f.rig.batch=null;f.rig.frames.set(item.actor,alphaSurface(256,256));item.fallback.locomotion={pose:'idle',phase:0};f.model.sampler.clips[0].name='DS_Idle';}return f;};
  const render=f=>single?f.rig.frame(f.key,f.items[0].actor,1,f.items[0].fallback,{height:42}):f.rig.endBatch(),baseline=make(false);render(baseline);const expected=selectedSnapshot(baseline),f=make(true);
  f.rig.gpuAlphaStats.frames=7;f.rig.gpuAlphaStats.fallbacks=2;f.rig.gpuSurface=()=>{f.calls.gpuCopies++;throw Error('mock-colour-copy-failure');};
  assert.doesNotThrow(()=>render(f));assert.deepEqual(selectedSnapshot(f),expected);assert.equal(f.calls.gpuReads,1);assert.equal(f.calls.gpuCopies,1);assert.equal(f.calls.pixelReads,verify?2:1);assert.equal(f.calls.finish.length,count);assert.ok(f.calls.finish.every(args=>args.length===6),'the failed colour copy reuses the original same-frame six-argument compositor');
  assert.equal(f.rig.gpuAlphaStats.frames,7,'a failed colour copy never counts as a successful GPU frame');assert.equal(f.rig.gpuAlphaStats.fallbacks,3);assert.equal(f.rig.gpuAlphaStats.verified,verify?count:0);assert.equal(f.calls.disposed,1);assert.equal(f.rig.gpuAlphaBounds.rawBytes,0);assert.deepEqual([f.rig.gpuRaw.width,f.rig.gpuRaw.height],[1,1]);
  for(const item of f.items)assert.notEqual(f.rig.frames.get(item.actor).selected.image,f.atlas.image,'fallback outputs remain private original cell copies');
 }
});
