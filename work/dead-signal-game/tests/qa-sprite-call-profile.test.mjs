import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductionArt} from '../dist/production-art.js';
import {createFrameCostProfile} from '../dist/qa-frame-cost-profile.js';
import {createSpriteCallProfile} from '../dist/qa-sprite-call-profile.js';

// This is a call/descriptor oracle for the unchanged production method, not a
// Canvas, WebGL, memory-use, or presented-FPS benchmark.
const originalDrawFrame=ProductionArt.prototype.drawFrame;
const originalDrawSource=Function.prototype.toString.call(originalDrawFrame);
const descriptors=object=>Object.getOwnPropertyDescriptors(object);
const stage=(frame,name)=>frame.stages[name]??{calls:0,thrownCalls:0,wallMs:0};
const outcome=call=>{try{return{returned:call()};}catch(error){return{error};}};

function selected(id='walker-original',metadata={format:'meshy-iso-sprite-atlas'}){
 return{id,metadata,image:Object.freeze({originalAtlas:true}),frame:{rect:{x:8,y:16,width:256,height:256}},placement:{x:-12,y:20,width:48,height:72}};
}

function canvasFixture({fault=null,marker=Error('original failure')}={}){
 const log=[],image=Object.freeze({originalAtlas:true}),state={alpha:.75,smoothing:false,quality:'low'},stack=[];
 let time=0,clockReads=0;
 const record=(name,...args)=>{log.push([name,...args]);time++;if(name===fault)throw marker;};
 class Context {
  get globalAlpha(){record('globalAlpha.get');return state.alpha;}
  set globalAlpha(value){record('globalAlpha.set',value);state.alpha=value;}
  get imageSmoothingEnabled(){record('imageSmoothingEnabled.get');return state.smoothing;}
  set imageSmoothingEnabled(value){record('imageSmoothingEnabled.set',value);state.smoothing=value;}
  get imageSmoothingQuality(){record('imageSmoothingQuality.get');return state.quality;}
  set imageSmoothingQuality(value){record('imageSmoothingQuality.set',value);state.quality=value;}
  save(...args){record('save',this===ctx,args);stack.push({...state});return'save-result';}
  restore(...args){record('restore',this===ctx,args);const previous=stack.pop();if(previous)Object.assign(state,previous);return'restore-result';}
  drawImage(...args){record('drawImage',this===ctx,args.map(value=>value===image?'original-image':value));return'draw-result';}
 }
 const ctx=new Context(),art=Object.create(ProductionArt.prototype),renderer={ctx,productionArt:art};
 const selection={id:'walker-original',metadata:{format:'meshy-iso-sprite-atlas'},image,frame:{rect:{x:8,y:16,width:256,height:256}},placement:{x:-12,y:20,width:48,height:72}};
 let metadataReads=0,idReads=0;
 Object.defineProperties(selection,{
  metadata:{configurable:true,get(){metadataReads++;throw Error('metadata must not be read');}},
  id:{configurable:true,get(){idReads++;throw Error('id must not be read');}}
 });
 const options={alpha:.5};
 if(fault==='selected.frame')Object.defineProperty(selection,'frame',{configurable:true,get(){record('selected.frame');return{rect:{x:0,y:0,width:1,height:1}};}});
 if(fault==='selected.image')Object.defineProperty(selection,'image',{configurable:true,get(){record('selected.image');return image;}});
 if(fault==='options.alpha')Object.defineProperty(options,'alpha',{get(){record('options.alpha');return .5;}});
 if(fault==='readable-getters'){
  const frame=selection.frame,rect=frame.rect,placement=selection.placement;
  for(const key of ['x','y','width','height']){const value=rect[key];Object.defineProperty(rect,key,{get(){record('rect.'+key);return value;},configurable:true});}
  Object.defineProperty(frame,'rect',{get(){record('frame.rect');return rect;},configurable:true});
  Object.defineProperties(selection,{frame:{get(){record('selected.frame');return frame;},configurable:true},placement:{get(){record('selected.placement');return placement;},configurable:true},image:{get(){record('selected.image');return image;},configurable:true}});
  Object.defineProperty(options,'alpha',{get(){record('options.alpha');return .5;}});
  Object.defineProperty(ctx,'drawImage',{get(){record('drawImage.get');return Context.prototype.drawImage;},configurable:true});
 }
 for(const name of ['drawImage','save','restore'])if(fault===name+'.get')Object.defineProperty(ctx,name,{configurable:true,get(){record(name+'.get');return Context.prototype[name];}});
 return{ctx,art,renderer,selection,options,log,state,stack,marker,Context,
  now(){clockReads++;return time;},
  get clockReads(){return clockReads;},
  get getterReads(){return{metadataReads,idReads};},
  draw(){return art.drawFrame(ctx,selection,options);},
  baseline(){return originalDrawFrame.call(art,ctx,selection,options);}
 };
}

function assertPrimitiveTree(value,forbidden=new Set(),path='report'){
 assert.equal(forbidden.has(value),false,path+' retains an original object');
 if(value===null||['string','number','boolean','undefined'].includes(typeof value))return;
 assert.equal(typeof value,'object',path+' is data, not a function/promise');
 assert.equal(value instanceof Promise,false,path+' contains no Promise');
 assert.ok(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null,path+' contains only plain report data');
 for(const key of Reflect.ownKeys(value)){
  assert.equal(typeof key,'string',path+' has no symbol fields');
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  assert.ok('value'in descriptor,path+'.'+key+' has no report accessor');
  assertPrimitiveTree(descriptor.value,forbidden,path+'.'+key);
 }
}

test('actual ProductionArt drawFrame is an independent strict Canvas/state oracle, including the original save/draw/restore failure policy',()=>{
 const prototypeBefore=descriptors(ProductionArt.prototype);
 for(const fault of [null,'save','drawImage','restore','globalAlpha.get','globalAlpha.set','imageSmoothingEnabled.set','imageSmoothingQuality.set','selected.frame','selected.image','options.alpha','drawImage.get','save.get','restore.get','readable-getters']){
  const marker=Error(String(fault)),baseline=canvasFixture({fault,marker}),observed=canvasFixture({fault,marker});
  const expected=outcome(()=>baseline.baseline()),ctxBefore=descriptors(observed.ctx),artBefore=descriptors(observed.art);
  const profile=createSpriteCallProfile({renderer:observed.renderer,read:()=>({}),now:observed.now});
  try{
   assert.deepEqual(observed.log,[],'installation has no original Canvas calls/getters');
   profile.beginFrame({callback:1});
   assert.deepEqual(outcome(()=>observed.draw()),expected,String(fault)+' return/error identity');
   const frame=profile.endFrame();
   assert.deepEqual(observed.log,baseline.log,String(fault)+' exact original method/property read order and arguments');
   assert.deepEqual(observed.state,baseline.state,String(fault)+' original state');
   assert.deepEqual(observed.stack,baseline.stack,String(fault)+' original save stack');
   assert.deepEqual(observed.getterReads,{metadataReads:0,idReads:0},'classification never invokes selected metadata/id accessors');
   assert.equal(stage(frame,'drawFrame').calls,1);
   assert.equal(stage(frame,'drawFrame').thrownCalls,'error'in expected?1:0);
   if(fault===null){
    for(const name of ['save','restore','drawImage','globalAlpha.get','globalAlpha.set','imageSmoothingEnabled.set','imageSmoothingQuality.set'])assert.equal(stage(frame,name).calls,1,name);
    assert.equal(stage(frame,'drawFrame').wallMs,7,'outer call includes the seven original Canvas operations');
    assert.equal(stage(frame,'drawImage').wallMs,1);
    const canvasWall=['save','restore','drawImage','globalAlpha.get','globalAlpha.set','imageSmoothingEnabled.set','imageSmoothingQuality.set'].reduce((sum,name)=>sum+stage(frame,name).wallMs,0);
    assert.equal(canvasWall,7);assert.ok(stage(frame,'drawFrame').wallMs+canvasWall>observed.now(),'inclusive sprite and contained Canvas walls overlap the same seven units of original work');
   }
  }finally{profile.stop();}
  assert.deepEqual(descriptors(observed.ctx),ctxBefore,String(fault)+' exact own Canvas descriptor restoration');
  assert.deepEqual(descriptors(observed.art),artBefore,String(fault)+' exact art descriptor restoration');
 }
 assert.equal(ProductionArt.prototype.drawFrame,originalDrawFrame);
 assert.equal(Function.prototype.toString.call(ProductionArt.prototype.drawFrame),originalDrawSource);
 assert.deepEqual(descriptors(ProductionArt.prototype),prototypeBefore,'no global/prototype hooks');
});

test('forwarding preserves this, argument and return/Promise/error identities, and observes only the renderer context during a drawFrame',()=>{
 const value={},promise=Promise.resolve(value),marker=Error('original custom draw'),calls=[],ctx={save(){calls.push('save');},restore(){calls.push('restore');},drawImage(...args){calls.push({receiver:this,args});return value;}},foreignCtx={save(){calls.push('foreign-save');},restore(){calls.push('foreign-restore');},drawImage(){calls.push('foreign');return value;}};
 const art={drawFrame(...args){calls.push({receiver:this,args});if(args[1]===marker)throw marker;if(args[1]===promise)return promise;if(args[1]===false)return false;if(args[1]==='draw'){args[0].save();const result=args[0].drawImage(value,1,2);args[0].restore();return result;}return value;}},renderer={ctx,productionArt:art},before=[descriptors(ctx),descriptors(art)],foreign={originalReceiver:true};
 let nowCalls=0;
 const profile=createSpriteCallProfile({renderer,read:()=>({}),now(){nowCalls++;throw Error('observer clock failure');}});
 try{
  profile.beginFrame();
  assert.equal(art.drawFrame.call(foreign,ctx,value,'third',4),value);
  assert.equal(art.drawFrame(ctx,promise),promise);
  assert.throws(()=>art.drawFrame(ctx,marker),error=>error===marker);
  assert.equal(art.drawFrame(ctx,false),false);
  assert.equal(art.drawFrame(ctx,'draw'),value);
  assert.equal(art.drawFrame(foreignCtx,'draw'),value);
  const beforeUnscoped=calls.length;ctx.drawImage(value,3,4);assert.equal(calls.length,beforeUnscoped+1,'unscoped original call still runs once');
  const frame=profile.endFrame();
  assert.deepEqual(calls[0],{receiver:foreign,args:[ctx,value,'third',4]});
  assert.equal(stage(frame,'drawFrame').calls,4,'foreign context/receiver drawFrame is forwarded without being measured');
  assert.equal(stage(frame,'drawFrame').thrownCalls,1);
  assert.equal(stage(frame,'drawImage').calls,1,'outside/foreign-context calls are not charged');
  assert.equal(stage(frame,'drawImage').wallMs,0,'clock failure is observation-only');
  assert.ok(nowCalls>0);
 }finally{profile.stop();}
 assert.deepEqual(descriptors(ctx),before[0]);assert.deepEqual(descriptors(art),before[1]);
});

test('nested drawFrame calls restore the outer scope after success and throw without duplicate Canvas work',()=>{
 const calls=[],marker=Error('inner'),ctx={drawImage(value){calls.push(value);if(value==='throw')throw marker;return value;}},art={drawFrame(context,selection){if(selection==='outer'){this.drawFrame(context,'inner');return context.drawImage('outer');}return context.drawImage(selection);}},renderer={ctx,productionArt:art},before=[descriptors(ctx),descriptors(art)];let time=0;
 const profile=createSpriteCallProfile({renderer,read:()=>({}),now:()=>++time});
 try{
  profile.beginFrame();assert.equal(art.drawFrame(ctx,'outer'),'outer');assert.throws(()=>art.drawFrame(ctx,'throw'),error=>error===marker);assert.equal(art.drawFrame(ctx,'after'),'after');const frame=profile.endFrame();
  assert.deepEqual(calls,['inner','outer','throw','after']);assert.equal(stage(frame,'drawFrame').calls,4);assert.equal(stage(frame,'drawFrame').thrownCalls,1);assert.equal(stage(frame,'drawImage').calls,4);assert.equal(stage(frame,'drawImage').thrownCalls,1);
  assert.ok(stage(frame,'drawFrame').wallMs>stage(frame,'drawImage').wallMs,'enclosing/nested walls overlap');
 }finally{profile.stop();}
 assert.deepEqual(descriptors(ctx),before[0]);assert.deepEqual(descriptors(art),before[1]);
});

test('nested foreign receiver/context or retired owner calls cannot inherit the outer measured Canvas scope',()=>{
 const calls=[],ctx={drawImage(value){calls.push(['main',value]);return value;}},foreignContext={drawImage(value){calls.push(['foreign',value]);return value;}},foreignReceiver={};
 let renderer;
 const art={drawFrame(context,selection){
  if(selection==='outer'){
   art.drawFrame.call(foreignReceiver,ctx,'foreign-this');
   art.drawFrame(foreignContext,'foreign-context');
   const owner=renderer.productionArt;renderer.productionArt={drawFrame(){return'unrelated';}};
   try{art.drawFrame(ctx,'retired-owner');}finally{renderer.productionArt=owner;}
   return context.drawImage('outer');
  }
  if(selection==='foreign-context')ctx.drawImage('foreign-context-also-main');
  return context.drawImage(selection);
 }};
 renderer={ctx,productionArt:art};const before=[descriptors(ctx),descriptors(art)],profile=createSpriteCallProfile({renderer,read:()=>({}),now:()=>0});
 try{profile.beginFrame();assert.equal(art.drawFrame(ctx,'outer'),'outer');const frame=profile.endFrame();assert.deepEqual(calls,[['main','foreign-this'],['main','foreign-context-also-main'],['foreign','foreign-context'],['main','retired-owner'],['main','outer']]);assert.equal(stage(frame,'drawFrame').calls,1);assert.equal(stage(frame,'drawImage').calls,1);assert.ok(profile.unmeasured.includes('drawFrame.foreignOwnerOrContext'));}finally{profile.stop();}
 assert.deepEqual(descriptors(ctx),before[0]);assert.deepEqual(descriptors(art),before[1]);
});

test('class getters, readonly/unknown methods and descriptor failures are unmeasured without being invoked or changing original drawing',()=>{
 let getterReads=0,draws=0;
 const ctx={drawImage(){draws++;return'original';}},draw=function(context){return context.drawImage();};
 class Art {get drawFrame(){getterReads++;return draw;}}
 const art=new Art(),renderer={ctx,productionArt:art},before=[descriptors(ctx),descriptors(art)],p=createSpriteCallProfile({renderer,read:()=>({}),now:()=>0});
 try{
  p.beginFrame();assert.equal(getterReads,0,'method accessor is not invoked to install a hook');assert.equal(art.drawFrame(ctx),'original');assert.equal(getterReads,1,'only the original caller reads the method getter');const frame=p.endFrame();assert.deepEqual(frame.stages,{});assert.ok(p.unmeasured.includes('drawFrame'));assert.equal(draws,1);
 }finally{p.stop();}
 assert.deepEqual(descriptors(ctx),before[0]);assert.deepEqual(descriptors(art),before[1]);
 const readonlyArt={},readonlyCtx={globalAlpha:1,imageSmoothingEnabled:false,imageSmoothingQuality:'low'};
 Object.defineProperty(readonlyArt,'drawFrame',{value:originalDrawFrame,writable:false,configurable:false});
 Object.defineProperty(readonlyCtx,'drawImage',{value(){draws++;},writable:false,configurable:false});
 const q=createSpriteCallProfile({renderer:{ctx:readonlyCtx,productionArt:readonlyArt},read:()=>({}),now:()=>0});
 try{q.beginFrame();assert.equal(readonlyArt.drawFrame(readonlyCtx,selected()),false,'missing save keeps original false result');assert.deepEqual(q.endFrame().stages,{});for(const name of ['drawFrame','drawImage','save','restore','globalAlpha','imageSmoothingEnabled','imageSmoothingQuality'])assert.ok(q.unmeasured.includes(name),name+' honestly unmeasured');}finally{q.stop();}
 const marker=Error('descriptor inspection unavailable'),plain={drawImage(){draws++;return'proxy-original';}},proxy=new Proxy(plain,{getOwnPropertyDescriptor(){throw marker;}}),proxyArt={drawFrame(context){return context.drawImage();}},r=createSpriteCallProfile({renderer:{ctx:proxy,productionArt:proxyArt},read:()=>({}),now:()=>0});
 try{r.beginFrame();assert.equal(proxyArt.drawFrame(proxy),'proxy-original');const frame=r.endFrame();assert.equal(stage(frame,'drawFrame').calls,1);assert.equal(stage(frame,'drawImage').calls,0);assert.ok(r.unmeasured.includes('drawImage'));}finally{r.stop();}
 assert.equal(plain.drawImage(),'proxy-original','inspection failure never replaces the original method');
});

test('overlapping observers restore in either stop order and owner changes/foreign full descriptors remain isolated',()=>{
 for(const order of [[0,1],[1,0]]){
  const f=canvasFixture(),before=[descriptors(f.ctx),descriptors(f.art)],profiles=[0,1].map(()=>createSpriteCallProfile({renderer:f.renderer,read:()=>({}),now:f.now}));
  try{
   profiles.forEach(p=>p.beginFrame());assert.equal(f.draw(),true);for(const p of profiles){const frame=p.endFrame();assert.equal(stage(frame,'drawFrame').calls,1);assert.equal(stage(frame,'drawImage').calls,1);}
   assert.equal(f.log.filter(entry=>entry[0]==='drawImage').length,1,'two observers still execute each original once');
   profiles[order[0]].stop();const remaining=profiles[order[1]];remaining.beginFrame();assert.equal(f.draw(),true);assert.equal(stage(remaining.endFrame(),'drawImage').calls,1);
  }finally{profiles.forEach(p=>p.stop());}
  assert.deepEqual(descriptors(f.ctx),before[0]);assert.deepEqual(descriptors(f.art),before[1]);
 }
 const old=canvasFixture(),next=canvasFixture(),oldBefore=[descriptors(old.ctx),descriptors(old.art)],nextBefore=[descriptors(next.ctx),descriptors(next.art)],profile=createSpriteCallProfile({renderer:old.renderer,read:()=>({}),now:old.now});
 try{
  profile.beginFrame();old.draw();profile.endFrame();old.renderer.productionArt=next.art;old.renderer.ctx=next.ctx;
  profile.beginFrame();assert.deepEqual(descriptors(old.ctx),oldBefore[0]);assert.deepEqual(descriptors(old.art),oldBefore[1]);assert.equal(next.draw(),true);
  const replacement=function(){return'external';},foreign={value:replacement,writable:false,enumerable:true,configurable:true};
  Object.defineProperty(next.art,'drawFrame',foreign);
  const current=Object.getOwnPropertyDescriptor(next.ctx,'drawImage');Object.defineProperty(next.ctx,'drawImage',{...current,enumerable:!current.enumerable});
  const canvasForeign=Object.getOwnPropertyDescriptor(next.ctx,'drawImage');profile.endFrame();profile.stop();
  assert.deepEqual(Object.getOwnPropertyDescriptor(next.art,'drawFrame'),foreign);
  assert.deepEqual(Object.getOwnPropertyDescriptor(next.ctx,'drawImage'),canvasForeign,'same wrapper value with foreign descriptor attributes is preserved');
  assert.ok(profile.unmeasured.includes('drawFrame.restore'));assert.ok(profile.unmeasured.includes('drawImage.restore'));
  assert.equal(next.art.drawFrame(),'external');assert.equal(next.ctx.drawImage(), 'draw-result','a retained dispatcher with no listeners still forwards the original');
  assert.deepEqual(descriptors(old.ctx),oldBefore[0]);assert.deepEqual(descriptors(old.art),oldBefore[1]);
  for(const name of ['globalAlpha','imageSmoothingEnabled','imageSmoothingQuality','save','restore'])assert.deepEqual(Object.getOwnPropertyDescriptor(next.ctx,name),nextBefore[0][name]);
 }finally{profile.stop();}
 // The deliberately foreign replacements above belong to this isolated fixture.
 assert.equal(Reflect.ownKeys(nextBefore[1]).length,0);
});

test('restoration failure is reported, and stopping during a drawing call preserves original return/error and drops the unfinished report',()=>{
 const original=function(){return'original';},target={drawImage:original};let failDelete=false;
 const ctx=new Proxy(target,{deleteProperty(object,key){if(failDelete&&key==='drawImage')throw Error('cannot restore');return Reflect.deleteProperty(object,key);}});
 // Use an inherited method so restoration takes the failing delete path.
 delete target.drawImage;Object.setPrototypeOf(target,{drawImage:original});
 const art={drawFrame(context){return context.drawImage();}},p=createSpriteCallProfile({renderer:{ctx,productionArt:art},read:()=>({}),now:()=>0});
 p.beginFrame();assert.equal(art.drawFrame(ctx),'original');failDelete=true;p.endFrame();const report=p.stop();assert.ok(report.unmeasured.includes('drawImage.restore'));assert.equal(ctx.drawImage(),'original');assert.equal(p.stop(),report);
 failDelete=false;delete ctx.drawImage;assert.equal(Object.hasOwn(ctx,'drawImage'),false,'release the deliberately un-restorable fixture shadow after verifying the failure');
 for(const throws of [false,true]){
  const marker=Error('original drawing error'),context={drawImage(){return'drawn';}};let profile;
  const drawing={drawFrame(c){profile.stop();c.drawImage();if(throws)throw marker;return'original-result';}},before=[descriptors(context),descriptors(drawing)];
  profile=createSpriteCallProfile({renderer:{ctx:context,productionArt:drawing},read:()=>({}),now:()=>0});profile.beginFrame();
  assert.deepEqual(outcome(()=>drawing.drawFrame(context)),throws?{error:marker}:{returned:'original-result'});assert.equal(profile.endFrame(),null);assert.deepEqual(profile.samples,[]);assert.ok(profile.stop().unmeasured.includes('frame.unfinished'));assert.deepEqual(descriptors(context),before[0]);assert.deepEqual(descriptors(drawing),before[1]);
 }
});

test('frame/outlier caps retain copied primitive asset/rect evidence, skip metadata getters, and auto-stop leaves subsequent original calls entirely unobserved',()=>{
 let time=0,clockReads=0,draws=0,metadataReads=0;
 class Context {
  get globalAlpha(){return 1;}set globalAlpha(value){}
  get imageSmoothingEnabled(){return false;}set imageSmoothingEnabled(value){}
  get imageSmoothingQuality(){return'low';}set imageSmoothingQuality(value){}
  save(){time++;}restore(){time++;}drawImage(image,x,y,width){draws++;time+=width;}
 }
 const ctx=new Context(),art=Object.create(ProductionArt.prototype),renderer={ctx,productionArt:art},before=[descriptors(ctx),descriptors(art)],forbidden=new Set([ctx,art,renderer]),profile=createSpriteCallProfile({renderer,read:()=>({}),now(){clockReads++;return time;},limit:1000,maxOutliers:1000});
 const meta={callback:0,ref:renderer};Object.defineProperty(meta,'unknown',{enumerable:true,get(){metadataReads++;throw Error('metadata getter');}});Object.defineProperty(meta,'__proto__',{value:'safe primitive field',enumerable:true});
 try{
  for(let index=0;index<80;index++){
   const selection=selected('asset-'+index,index%3===0?{liveRig:true}:index%3===1?{format:'meshy-iso-sprite-atlas'}:{});selection.frame.rect={x:-0,y:index,width:index+1,height:256};
   for(const value of [selection,selection.image,selection.metadata,selection.frame,selection.frame.rect,selection.placement])forbidden.add(value);
   meta.callback=index;profile.beginFrame(meta);assert.equal(art.drawFrame(ctx,selection),true);const sample=profile.endFrame({finished:true,frameIndex:999,stages:renderer,object:selection});
   assert.equal(sample.frameIndex,index);assert.equal(sample.callback,index);assert.equal(sample.finished,true);assert.equal(Object.hasOwn(sample,'object'),false);assert.equal(Object.hasOwn(sample,'ref'),false);assert.equal(Object.hasOwn(sample,'unknown'),false);assert.equal(Object.getOwnPropertyDescriptor(sample,'__proto__').value,'safe primitive field');
   selection.id='mutated-after-observation';selection.frame.rect.x=999;
  }
  const report=profile.stop();assert.equal(report.samples,profile.samples);assert.equal(report.samples.length,80);assert.equal(report.outliers.length,32);assert.equal(report.outliers[0].assetId,'asset-79');assert.equal(report.outliers[0].stage,'drawFrame');assert.ok(Object.is(report.outliers[0].rect.x,-0));assert.equal(report.outliers[0].rect.width,80);assert.equal(report.outliers[0].source,'baked');
  assert.equal(report.outliers.every((entry,index,array)=>index===0||array[index-1].wallMs>=entry.wallMs),true);assert.equal(metadataReads,0);assertPrimitiveTree(report,forbidden);
  assert.match(report.note,/inclusive|overlap/);assert.match(report.note,/overhead/);assert.match(report.note,/not a peak-memory measurement/);assert.match(report.note,/No GPU execution time, FPS/);
  const readsAtStop=clockReads;assert.equal(profile.beginFrame(),null);assert.equal(art.drawFrame(ctx,selected()),true);assert.equal(profile.endFrame(),null);assert.equal(clockReads,readsAtStop);assert.equal(draws,81);assert.equal(profile.samples.length,80);
 }finally{profile.stop();}
 assert.deepEqual(descriptors(ctx),before[0]);assert.deepEqual(descriptors(art),before[1]);
});

test('disabled mode performs no owner, metadata, read callback or clock access; malformed selection remains the original false/throw',()=>{
 let reads=0;const hostile=new Proxy({}, {get(){reads++;throw Error('disabled owner');},getOwnPropertyDescriptor(){reads++;throw Error('disabled descriptor');},ownKeys(){reads++;throw Error('disabled keys');}});
 const p=createSpriteCallProfile({renderer:hostile,read(){reads++;throw Error('disabled read');},now(){reads++;throw Error('disabled clock');},enabled:false});
 assert.equal(p.beginFrame(hostile),null);assert.equal(p.endFrame(hostile),null);const report=p.stop();assert.equal(reads,0);assert.deepEqual(report.samples,[]);assert.deepEqual(report.outliers,[]);assert.deepEqual(report.unmeasured,[]);assert.equal(p.stop(),report);
 const f=canvasFixture(),q=createSpriteCallProfile({renderer:f.renderer,read:()=>({}),now:f.now});
 try{q.beginFrame();assert.equal(f.art.drawFrame(f.ctx,null),false);assert.equal(f.art.drawFrame(f.ctx,selected(),{alpha:0}),false);const baseline=outcome(()=>originalDrawFrame.call(f.art,f.ctx,{})),observed=outcome(()=>f.art.drawFrame(f.ctx,{}));assert.equal(observed.error?.constructor,baseline.error?.constructor);assert.equal(observed.error?.message,baseline.error?.message);const frame=q.endFrame();assert.equal(stage(frame,'drawFrame').calls,3);assert.equal(stage(frame,'drawFrame').thrownCalls,1);assert.equal(stage(frame,'drawImage').calls,0);assert.deepEqual(f.log,[]);}finally{q.stop();}
});

test('the documented cost-first/sprite-second composition measures each original call once and restores both independent observer modules',()=>{
 const baseline=canvasFixture();baseline.baseline();const f=canvasFixture();f.renderer.drawEnemy=function(context,selection,options){return this.productionArt.drawFrame(context,selection,options);};const before=[descriptors(f.ctx),descriptors(f.art),descriptors(f.renderer)],cost=createFrameCostProfile({renderer:f.renderer,read:()=>({}),now:f.now});
 let sprite;
 try{
  cost.beginFrame();sprite=createSpriteCallProfile({renderer:f.renderer,read:()=>({}),now:f.now});sprite.beginFrame();assert.equal(f.renderer.drawEnemy(f.ctx,f.selection,f.options),true);const spriteFrame=sprite.endFrame(),costFrame=cost.endFrame();
  assert.deepEqual(f.log,baseline.log);assert.equal(stage(spriteFrame,'drawImage').calls,1);assert.equal(stage(spriteFrame,'drawFrame').calls,1);assert.equal(costFrame.stages['production.drawFrame'].calls,1);assert.equal(costFrame.stages['renderer.drawEnemy'].calls,1);
 }finally{sprite?.stop();cost.stop();}
 assert.deepEqual(descriptors(f.ctx),before[0]);assert.deepEqual(descriptors(f.art),before[1]);assert.deepEqual(descriptors(f.renderer),before[2]);
});

test('cost-first composition restores full retired art/context descriptors across successive owner identities, with sprite hooks detached after each frame',()=>{
 const a=canvasFixture(),b=canvasFixture(),renderer=a.renderer;
 renderer.drawEnemy=function(context,selection,options){return this.productionArt.drawFrame(context,selection,options);};
 const objects=[a.art,a.ctx,b.art,b.ctx,renderer],before=objects.map(descriptors),cost=createFrameCostProfile({renderer,read:()=>({}),now:a.now}),sprite=createSpriteCallProfile({renderer,read:()=>({}),now:a.now});
 try{
  for(const [index,f]of [a,b].entries()){
   renderer.productionArt=f.art;renderer.ctx=f.ctx;
   cost.beginFrame({callback:index});sprite.beginFrame({callback:index});assert.equal(renderer.drawEnemy(f.ctx,f.selection,f.options),true);const spriteFrame=sprite.endFrame();const costFrame=cost.endFrame();
   assert.equal(stage(spriteFrame,'drawFrame').calls,1);assert.equal(stage(spriteFrame,'drawImage').calls,1);assert.equal(costFrame.stages['production.drawFrame'].calls,1);
   assert.deepEqual(descriptors(f.ctx),before[index===0?1:3],'no Canvas hook survives a finished frame');
   if(index===1){assert.deepEqual(descriptors(a.art),before[0],'cost owner switch does not strand a retired cost dispatcher under a sprite shadow');assert.deepEqual(descriptors(a.ctx),before[1]);}
  }
 }finally{sprite.stop();cost.stop();}
 objects.slice(0,4).forEach((object,index)=>assert.deepEqual(descriptors(object),before[index],'owner '+index+' exact final full descriptor restoration'));
 // These are the caller's deliberate owner changes, not observer side effects.
 assert.equal(renderer.productionArt,b.art);assert.equal(renderer.ctx,b.ctx);
 const rendererExpected={...before[4],productionArt:{...before[4].productionArt,value:b.art},ctx:{...before[4].ctx,value:b.ctx}};
 assert.deepEqual(descriptors(renderer),rendererExpected);
 assert.equal(a.log.filter(entry=>entry[0]==='drawImage').length,1);assert.equal(b.log.filter(entry=>entry[0]==='drawImage').length,1);
});
