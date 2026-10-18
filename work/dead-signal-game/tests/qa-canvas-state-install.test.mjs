import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductionArt,validateAtlasMetadata} from '../dist/production-art.js?v=0.29.0';
import {Renderer} from '../dist/renderer.js?v=0.29.0&dense=20261018-4';
import {installCanvasStateCandidate} from '../dist/qa-canvas-state-install.js';

// Actual Renderer final nativeEnemyFrame + actual ProductionArt selection/draw.
// Only native Canvas semantics and the already-loaded atlas image are fake;
// these tests are not raster-pixel, GPU, memory or performance evidence.
const originalFrame=Renderer.prototype.nativeEnemyFrame,originalDraw=ProductionArt.prototype.drawFrame;
const descriptors=object=>Object.getOwnPropertyDescriptors(object),outcome=call=>{try{return{returned:call()};}catch(error){return{error};}};
function environment(){
 const privateState=new WeakMap(),faults=new WeakMap(),draws=[];
 const record=ctx=>{const s=privateState.get(ctx);if(!s)throw new TypeError('Illegal invocation');return s;};
 const operation=(ctx,name,...args)=>{const s=record(ctx);s.calls.push([name,...args]);faults.get(ctx)?.(name,args);return s;};
 class Image{}
 class Canvas{}
 class Context{
  get globalAlpha(){return operation(this,'globalAlpha.get').alpha;}
  set globalAlpha(value){operation(this,'globalAlpha.set',value).alpha=value;}
  get imageSmoothingEnabled(){return operation(this,'imageSmoothingEnabled.get').smoothing;}
  set imageSmoothingEnabled(value){operation(this,'imageSmoothingEnabled.set',value).smoothing=value;}
  get imageSmoothingQuality(){return operation(this,'imageSmoothingQuality.get').quality;}
  set imageSmoothingQuality(value){operation(this,'imageSmoothingQuality.set',value).quality=value;}
  save(){const s=operation(this,'save');s.stack.push([s.alpha,s.smoothing,s.quality,s.composite]);}
  restore(){const s=operation(this,'restore');const previous=s.stack.pop();if(previous)[s.alpha,s.smoothing,s.quality,s.composite]=previous;}
  drawImage(...args){const s=operation(this,'drawImage',...args);draws.push({ctx,args:[...args],alpha:s.alpha,smoothing:s.smoothing,quality:s.quality,composite:s.composite});}
  beginPath(){operation(this,'beginPath');}ellipse(...args){operation(this,'ellipse',...args);}fill(){operation(this,'fill');}
  get globalCompositeOperation(){return record(this).composite;}
  set globalCompositeOperation(value){record(this).composite=value;}
 }
 const accessor=name=>{const descriptor=Object.getOwnPropertyDescriptor(Context.prototype,name);return{get:descriptor.get,set:descriptor.set,descriptor};};
 const api={contextPrototype:Context.prototype,canvasPrototype:Canvas.prototype,imagePrototype:Image.prototype,save:Context.prototype.save,restore:Context.prototype.restore,drawImage:Context.prototype.drawImage,globalAlpha:accessor('globalAlpha'),imageSmoothingEnabled:accessor('imageSmoothingEnabled'),imageSmoothingQuality:accessor('imageSmoothingQuality')};
 const context=()=>{const ctx=new Context();privateState.set(ctx,{alpha:.7,smoothing:false,quality:'medium',composite:'source-over',calls:[],stack:[]});return ctx;};
 const raw={format:'meshy-iso-sprite-atlas',version:1,projection:{azimuthDegrees:45,elevationDegrees:Math.asin(1/Math.sqrt(3))*180/Math.PI,cameraScale:Math.sqrt(3/2),pixelsPerWorld:1,subjectHeight:60,footPivot:{x:32,y:55}},atlas:{width:64,height:64,columns:1,rows:1,frameSize:64,directions:1,samples:1,order:'direction-major, sample-minor',transparent:true},animation:null,frames:[{index:0,direction:0,sample:0,angle:0,rect:{x:0,y:0,width:64,height:64},footPivot:{x:32,y:55},alphaBounds:{x:14,y:5,width:35,height:50},outlineBounds:{x:12,y:3,width:39,height:54},coreBounds:null,clipped:false}]};
 const metadata=validateAtlasMetadata(raw),image=new Image(),ctx=context(),art=new ProductionArt({manifest:{assets:{'walker-original':{metadata:'walker/metadata.json',atlas:'walker/atlas.png',worldHeight:60,referenceRadius:14}},enemies:{walker:'walker-original'},characters:{},bosses:{'fixture-boss':'walker-original'},environment:{}},fetchImpl:()=>{throw Error('test must not load');}});
 art.records.set('walker-original',{status:'ready',image,metadata,bodyAlpha:null});
 const renderer=Object.create(Renderer.prototype),catalog=[];
 Object.assign(renderer,{ctx,productionArt:art,motionEnabled:false,liveEnemies:null,liveBoss:null,enemyLiveFrames:0,nativeActorFrames:new WeakMap(),requestProductionCatalog(...args){catalog.push(args);},productionDataset(){}});
 const actor={id:17,type:'walker',x:400,y:340,r:14,angle:.4,walkPhase:0,speed:35,vx:0,vy:0,stun:0,attackState:'idle',attackTime:0,hitFlash:0,hp:100,maxHp:100},game={time:1,world:{originalWorld:true},player:{x:10,y:20}};
 return{api,Context,Image,Canvas,ctx,context,art,renderer,actor,game,metadata,image,catalog,draws,record,faults};
}
const primitiveReport=report=>{for(const [key,value]of Object.entries(report))assert.ok(value===null||['string','number','boolean','undefined'].includes(typeof value),key+' must not retain owners/selected records');};

test('only the final actual Renderer baked selection is certified; original mode keeps zero certification and every original draw',()=>{
 for(const mode of ['original','manual']){
  const e=environment();originalFrame.call(e.renderer,e.actor,1,e.game); // initialize the original lazy pose clock without any draw
  const artBefore=descriptors(e.art),rendererBefore=descriptors(e.renderer),install=installCanvasStateCandidate({renderer:e.renderer,mode,api:e.api});assert.ok(install);
  const factory=e.art.enemyFrame('walker',e.actor,{simulationTime:1});assert.ok(factory);assert.equal(e.art.drawFrame(e.ctx,factory),true);
  const first=install.report();assert.equal(first.candidateUsed,0,'intermediate Art factory placements must never enter the candidate');assert.equal(first.certified,0);
  const selected=e.renderer.nativeEnemyFrame(e.actor,1,e.game);assert.ok(selected);assert.notDeepEqual(selected.placement,factory.placement,'actual renderer adds final depth/ground foot placement');
  const beforeDraws=e.draws.length;assert.equal(e.art.drawFrame(e.ctx,selected),true);assert.equal(e.draws.length,beforeDraws+1);assert.deepEqual(e.draws.at(-1).args,[e.image,0,0,64,64,selected.placement.x,selected.placement.y,selected.placement.width,selected.placement.height]);
  const report=install.report();primitiveReport(report);assert.equal(report.certified,mode==='manual'?1:0);assert.equal(report.candidateUsed,mode==='manual'?1:0);assert.equal(report.fallback,mode==='manual'?1:2);
  assert.equal(e.renderer.drawNativeEnemy(e.ctx,{...e.actor,id:18},1,e.game),true,'the actual NPC body draw uses the final Renderer placement');
  if(mode==='manual')assert.ok(install.report().candidateUsed>report.candidateUsed);else assert.equal(install.report().certified,0);
  install.stop();assert.deepEqual(descriptors(e.art),artBefore);assert.deepEqual(descriptors(e.renderer),rendererBefore);
 }
});

test('options, native selections, foreign contexts and unrecognized Art factory inputs retain whole-original behavior',()=>{
 const e=environment(),install=installCanvasStateCandidate({renderer:e.renderer,mode:'manual',api:e.api});assert.ok(install);
 const selected=e.renderer.nativeEnemyFrame(e.actor,1,e.game);assert.equal(e.art.drawFrame(e.ctx,selected,{alpha:.25}),true);assert.equal(e.draws.at(-1).alpha,.7*.25);assert.equal(install.report().candidateUsed,0);
 const other=e.context();assert.equal(e.art.drawFrame(other,selected),true);assert.equal(install.report().candidateUsed,0);
 const body=e.renderer.nativeEnemyFrame({...e.actor,id:21},1,e.game);assert.equal(e.art.drawFrame(e.ctx,body),true);const used=install.report().candidateUsed;assert.equal(used,1);
 assert.equal(e.renderer.drawNativeHitFlash(e.ctx,body,.12,null),true);assert.equal(install.report().candidateUsed,used,'the repeated hit-light redraw retains whole-original save/restore');assert.equal(e.draws.at(-1).composite,'screen');assert.equal(e.draws.at(-1).alpha,.7*.82);
 e.renderer.motionEnabled=true;e.renderer.liveEnemySelection=new Set([e.actor]);let nativeCalls=0;
 const native={...selected,metadata:{...selected.metadata,liveRig:true}};e.renderer.liveEnemies={models:new Map([['enemy-walker',{}]]),diagnostics:{clip:'original',sampleDensity:32},frame(){nativeCalls++;return native;}};
 assert.equal(e.renderer.nativeEnemyFrame(e.actor,1,e.game),native);assert.equal(nativeCalls,1);assert.equal(e.art.drawFrame(e.ctx,native),true);assert.equal(install.report().candidateUsed,used);
 const factory=e.art.enemyFrame('walker',e.actor,{simulationTime:1});assert.equal(e.art.drawFrame(e.ctx,factory),true);assert.equal(install.report().candidateUsed,used);install.stop();
});

test('explicit boss calls stay original and foreign factory receivers cannot poison a later legitimate NPC draw',()=>{
 const e=environment(),foreign=environment(),install=installCanvasStateCandidate({renderer:e.renderer,mode:'manual',api:e.api}),boss={role:'final',stats:{r:14},skill:{kind:'slam',windup:.9,duration:.75,recovery:1}};
 const selected=e.renderer.nativeEnemyFrame({...e.actor,bossKey:'fixture-boss'},1,e.game,boss);assert.ok(selected);assert.equal(e.art.drawFrame(e.ctx,selected),true);assert.equal(install.report().certified,0);assert.equal(install.report().bakedReturned,0);assert.equal(install.report().bakedNpcManualCalls,0);
 const other=e.renderer.nativeEnemyFrame.call(foreign.renderer,foreign.actor,1,foreign.game);assert.ok(other);assert.equal(install.report().available,true);assert.equal(install.report().ownerMismatchCalls,1);assert.equal(install.report().certified,0);
 const own=e.renderer.nativeEnemyFrame(e.actor,1,e.game);assert.equal(e.art.drawFrame(e.ctx,own),true);assert.equal(install.report().bakedNpcManualCalls,1);assert.equal(install.report().available,true);install.stop();
});

test('wrapper receiver/args/return/throw and complete inherited method descriptors survive installation and stop',()=>{
 const e=environment(),frameDescriptor=Object.getOwnPropertyDescriptor(Renderer.prototype,'nativeEnemyFrame'),drawDescriptor=Object.getOwnPropertyDescriptor(ProductionArt.prototype,'drawFrame');
 const install=installCanvasStateCandidate({renderer:e.renderer,mode:'manual',api:e.api});assert.ok(install);
 assert.equal(install.report().available,true);assert.deepEqual({...Object.getOwnPropertyDescriptor(e.renderer,'nativeEnemyFrame'),value:originalFrame},{value:originalFrame,configurable:true,writable:true,enumerable:false});assert.deepEqual({...Object.getOwnPropertyDescriptor(e.art,'drawFrame'),value:originalDraw},{value:originalDraw,configurable:true,writable:true,enumerable:false});
 const selected=e.renderer.nativeEnemyFrame(e.actor,1,e.game,null,'original-extra-arg');assert.ok(selected);assert.equal(e.art.drawFrame.call(e.art,e.ctx,selected,undefined,'ignored-original-extra'),true);assert.equal(install.report().candidateUsed,0);
 const marker=Error('original options marker'),options={get alpha(){throw marker;}};assert.equal(outcome(()=>e.art.drawFrame.call(e.art,e.ctx,selected,options)).error,marker);
 const alien={};assert.equal(outcome(()=>e.renderer.nativeEnemyFrame.call(alien,e.actor,1,e.game)).error?.constructor,TypeError,'actual original foreign receiver failure remains observable');
 install.stop();install.stop();assert.equal(Object.getOwnPropertyDescriptor(e.renderer,'nativeEnemyFrame'),undefined);assert.equal(Object.getOwnPropertyDescriptor(e.art,'drawFrame'),undefined);assert.deepEqual(Object.getOwnPropertyDescriptor(Renderer.prototype,'nativeEnemyFrame'),frameDescriptor);assert.deepEqual(Object.getOwnPropertyDescriptor(ProductionArt.prototype,'drawFrame'),drawDescriptor);assert.equal(install.report().cleanupComplete,true);primitiveReport(install.report());
});

test('external method/owner/descriptor changes are preserved and prevent stale manual certification',()=>{
 for(const kind of ['frame-method','draw-method','same-value-attributes','art-owner','context-owner']){
  const e=environment(),install=installCanvasStateCandidate({renderer:e.renderer,mode:'manual',api:e.api});assert.ok(install);const selected=e.renderer.nativeEnemyFrame(e.actor,1,e.game);
  let expected;
  if(kind==='frame-method'){const value=function(){return'external-frame';};Object.defineProperty(e.renderer,'nativeEnemyFrame',{value,writable:true,enumerable:true,configurable:true});expected=descriptors(e.renderer).nativeEnemyFrame;}
  if(kind==='draw-method'){const value=function(){return'external-draw';};Object.defineProperty(e.art,'drawFrame',{value,writable:true,enumerable:true,configurable:true});expected=descriptors(e.art).drawFrame;}
  if(kind==='same-value-attributes'){const d=Object.getOwnPropertyDescriptor(e.art,'drawFrame');Object.defineProperty(e.art,'drawFrame',{...d,enumerable:!d.enumerable});expected=descriptors(e.art).drawFrame;}
  if(kind==='art-owner')e.renderer.productionArt=new ProductionArt({manifest:e.art.manifest});
  if(kind==='context-owner')e.renderer.ctx=e.context();
  if(kind!=='draw-method'){assert.equal(e.art.drawFrame(e.ctx,selected),true);assert.equal(install.report().candidateUsed,0,'lost ownership must fall back');}
  install.stop();if(kind==='frame-method')assert.deepEqual(descriptors(e.renderer).nativeEnemyFrame,expected);if(['draw-method','same-value-attributes'].includes(kind))assert.deepEqual(descriptors(e.art).drawFrame,expected);
  if(kind==='same-value-attributes')assert.equal(e.art.drawFrame(e.ctx,selected),true,'an externally retained wrapper forwards the original after stop');
  if(kind==='art-owner')assert.notEqual(e.renderer.productionArt,e.art);if(kind==='context-owner')assert.notEqual(e.renderer.ctx,e.ctx);primitiveReport(install.report());
 }
});

test('unrecognized methods and readonly/accessor owners fail closed without invoking getters or changing instance/prototype descriptors',()=>{
 for(const kind of ['unrecognized-frame','unrecognized-draw','readonly-frame','accessor-art','unsupported-mode']){
  const e=environment();let getters=0;
  if(kind==='unrecognized-frame')e.renderer.nativeEnemyFrame=function(){return{foreign:true};};
  if(kind==='unrecognized-draw')e.art.drawFrame=function(){return'foreign';};
  if(kind==='readonly-frame')Object.defineProperty(e.renderer,'nativeEnemyFrame',{value:originalFrame,configurable:false,writable:false});
  if(kind==='accessor-art')Object.defineProperty(e.renderer,'productionArt',{configurable:true,get(){getters++;throw Error('must-not-invoke-owner');}});
  const rendererBefore=descriptors(e.renderer),artBefore=descriptors(e.art),protoBefore=descriptors(Renderer.prototype),artProtoBefore=descriptors(ProductionArt.prototype);
  const install=installCanvasStateCandidate({renderer:e.renderer,mode:kind==='unsupported-mode'?'unsupported':'manual',api:e.api});assert.equal(install.report().available,false);assert.equal(install.report().factoryCalls,0);assert.equal(install.report().candidateUsed,0);install.stop();
  assert.equal(getters,0);assert.deepEqual(descriptors(e.renderer),rendererBefore);assert.deepEqual(descriptors(e.art),artBefore);assert.deepEqual(descriptors(Renderer.prototype),protoBefore);assert.deepEqual(descriptors(ProductionArt.prototype),artProtoBefore);
 }
});
