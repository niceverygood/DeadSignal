import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductionArt} from '../dist/production-art.js?v=0.29.0';
import {captureNativeCanvasAPI,createCanvasStateCandidate} from '../dist/qa-canvas-state.js';

// The original production method is the independent command/state oracle.
// Controlled native-semantic APIs do not prove native browser raster pixels,
// presented FPS, Canvas implementation timings, or memory consumption.
const original=ProductionArt.prototype.drawFrame;
const originalSource=Function.prototype.toString.call(original);
const clone=value=>structuredClone(value);
const outcome=call=>{try{return{returned:call()};}catch(error){return{error};}};

function fixture(){
 const records=new WeakMap(),contexts=[],images=[],faults=new WeakMap();
 const record=context=>{const result=records.get(context);if(!result)throw new TypeError('Illegal invocation');return result;};
 const call=(context,name,...args)=>{const result=record(context);result.protocol.push([name,...args]);faults.get(context)?.(name,args);return result;};
 class ImageElement{}
 class Canvas{}
 class Context{
  get globalAlpha(){return call(this,'globalAlpha.get').state.globalAlpha;}
  set globalAlpha(value){const r=call(this,'globalAlpha.set',value);if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1)r.state.globalAlpha=value;}
  get imageSmoothingEnabled(){return call(this,'imageSmoothingEnabled.get').state.imageSmoothingEnabled;}
  set imageSmoothingEnabled(value){call(this,'imageSmoothingEnabled.set',value).state.imageSmoothingEnabled=Boolean(value);}
  get imageSmoothingQuality(){return call(this,'imageSmoothingQuality.get').state.imageSmoothingQuality;}
  set imageSmoothingQuality(value){const r=call(this,'imageSmoothingQuality.set',value);if(['low','medium','high'].includes(value))r.state.imageSmoothingQuality=value;}
  save(){const r=call(this,'save');r.stack.push(clone(r.state));}
  restore(){const r=call(this,'restore'),previous=r.stack.pop();if(previous)r.state=previous;}
  drawImage(...args){const r=call(this,'drawImage',...args);r.draws.push({args:[...args],state:clone(r.state),stackDepth:r.stack.length});}
 }
 const descriptor=name=>Object.getOwnPropertyDescriptor(Context.prototype,name);
 const accessor=name=>{const d=descriptor(name);return{get:d.get,set:d.set,descriptor:d};};
 const api={contextPrototype:Context.prototype,save:Context.prototype.save,restore:Context.prototype.restore,drawImage:Context.prototype.drawImage,
  globalAlpha:accessor('globalAlpha'),imageSmoothingEnabled:accessor('imageSmoothingEnabled'),imageSmoothingQuality:accessor('imageSmoothingQuality'),
  canvasPrototype:Canvas.prototype,imagePrototype:ImageElement.prototype};
 const state={globalAlpha:.63,imageSmoothingEnabled:false,imageSmoothingQuality:'medium',transform:[.75,.12,-.24,1.13,19,-7],clip:['original-clip',3,4,83,97],
  globalCompositeOperation:'screen',filter:'blur(1px) contrast(105%)',shadowColor:'#12345678',shadowBlur:7,shadowOffsetX:-2,shadowOffsetY:4,lineWidth:3,
  strokeStyle:'#345',fillStyle:'#678',font:'17px serif',textAlign:'right',textBaseline:'middle',lineDash:[3,7]};
 const context=initial=>{const ctx=new Context();records.set(ctx,{state:{...clone(state),...initial},stack:[],draws:[],protocol:[]});contexts.push(ctx);return ctx;};
 const image=()=>{const value=new ImageElement();images.push(value);return value;};
 const selected=(value=image())=>({image:value,frame:{rect:{x:8,y:16,width:256,height:256}},placement:{x:-12,y:20,width:48,height:72}});
 const snapshot=ctx=>{const r=record(ctx);return{state:clone(r.state),stack:clone(r.stack)};};
 const clear=ctx=>{const r=record(ctx);r.protocol.length=0;r.draws.length=0;};
 return{api,Context,Canvas,ImageElement,context,image,selected,snapshot,clear,record,faults,contexts,images};
}

function primitiveTree(value,seen=new Set()){
 if(value===null||['string','boolean','undefined'].includes(typeof value))return;
 if(typeof value==='number'){assert.ok(Number.isFinite(value));return;}
 assert.equal(typeof value,'object','reports must contain only primitive leaves');assert.ok(!seen.has(value),'report must be acyclic');seen.add(value);
 assert.ok(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype);
 for(const d of Object.values(Object.getOwnPropertyDescriptors(value))){if('value'in d)primitiveTree(d.value,seen);else assert.fail('report accessors are not primitive data');}
 seen.delete(value);
}

test('native API capture fails closed for unsupported or nonnative realms without invoking constructor accessors',()=>{
 assert.equal(captureNativeCanvasAPI({}),null);
 let reads=0;const poison={};for(const name of ['CanvasRenderingContext2D','HTMLCanvasElement','HTMLImageElement'])Object.defineProperty(poison,name,{get(){reads++;throw Error('must-not-read');}});
 assert.equal(captureNativeCanvasAPI(poison),null);assert.equal(reads,0);
 const f=fixture();assert.equal(captureNativeCanvasAPI({CanvasRenderingContext2D:f.Context,HTMLCanvasElement:f.Canvas,HTMLImageElement:f.ImageElement}),null,'controlled fake APIs require explicit injection');
});

test('certified manual draws keep all original nine arguments, draw-time state and outer state/clip/transform/stack',()=>{
 const f=fixture(),art=Object.create(ProductionArt.prototype),image=f.image(),selected=f.selected(image);
 Object.defineProperties(selected,{id:{get(){throw Error('id is not a draw input');}},metadata:{get(){throw Error('metadata is not a draw input');}}});
 for(const alpha of [0,.63,1])for(const smoothing of [false,true])for(const quality of ['low','medium','high'])for(const explicitUndefined of [false,true]){
  const a=f.context({globalAlpha:alpha,imageSmoothingEnabled:smoothing,imageSmoothingQuality:quality}),b=f.context({globalAlpha:alpha,imageSmoothingEnabled:smoothing,imageSmoothingQuality:quality});
  a.save();b.save();const prior=f.snapshot(b);f.clear(a);f.clear(b);
  const candidate=createCanvasStateCandidate({context:b,original,api:f.api,mode:'manual'});assert.equal(candidate.certify(selected),true);
  const argsA=explicitUndefined?[a,selected,undefined]:[a,selected],argsB=explicitUndefined?[b,selected,undefined]:[b,selected];
  assert.equal(candidate.drawFrame.apply(art,argsB),original.apply(art,argsA));
  const drawA=f.record(a).draws,drawB=f.record(b).draws;assert.equal(drawA.length,1);assert.equal(drawB.length,1);
  assert.deepEqual(drawB[0].args,drawA[0].args);assert.equal(drawB[0].args[0],image);assert.equal(drawB[0].args.length,9);
  assert.deepEqual(drawB[0].state,drawA[0].state);assert.deepEqual(f.snapshot(b),f.snapshot(a));assert.deepEqual(f.snapshot(b),prior);
  assert.equal(f.record(b).protocol.filter(([name])=>name==='save'||name==='restore').length,0,'manual candidate must omit only its inner native state stack');
  b.restore();a.restore();assert.deepEqual(f.snapshot(b),f.snapshot(a));candidate.stop();
 }
 const rect=selected.frame.rect,placement=selected.placement;rect.x=-0;rect.y=0;placement.x=-0;placement.y=0;
 const a=f.context(),b=f.context(),candidate=createCanvasStateCandidate({context:b,original,api:f.api});assert.equal(candidate.certify(selected),true);
 original.call(art,a,selected);candidate.drawFrame.call(art,b,selected);
 for(let i=0;i<9;i++)assert.ok(Object.is(f.record(a).draws[0].args[i],f.record(b).draws[0].args[i]),'signed zero draw argument '+i);candidate.stop();
 for(const width of [0,-8]){const x=f.context(),y=f.context(),s=f.selected(image),c=createCanvasStateCandidate({context:y,original,api:f.api});s.frame.rect.width=width;s.placement.width=width;assert.equal(c.certify(s),true,'finite signed dimensions retain the native drawImage contract');assert.equal(c.drawFrame.call(art,y,s),original.call(art,x,s));assert.deepEqual(f.record(y).draws[0].args,f.record(x).draws[0].args);assert.deepEqual(f.snapshot(y),f.snapshot(x));c.stop();}
 assert.equal(Function.prototype.toString.call(ProductionArt.prototype.drawFrame),originalSource);
});

test('uncertified proxies and every options-bearing call preserve original getter order, arity, receiver and thrown identity',()=>{
 const run=(candidateMode,kind)=>{
  const f=fixture(),ctx=f.context(),log=[],marker=Error('getter-marker'),base=f.selected(),art={originalReceiver:true};
  const selected=new Proxy(base,{get(target,key,receiver){log.push('selected.'+String(key));return Reflect.get(target,key,receiver);},getPrototypeOf(){log.push('selected.prototype');return Object.prototype;},getOwnPropertyDescriptor(target,key){log.push('selected.descriptor.'+String(key));return Reflect.getOwnPropertyDescriptor(target,key);}});
  const candidate=createCanvasStateCandidate({context:ctx,original,api:f.api,mode:'manual'});
  let args=[ctx,selected];if(kind==='alpha')args.push({get alpha(){log.push('options.alpha');return .25;}});
  if(kind==='throw')args.push({get alpha(){log.push('options.alpha');throw marker;}});
  if(kind==='null')args.push(null);if(kind==='fourth')args.push(undefined,'ignored-original-fourth');
  const result=outcome(()=>candidateMode?candidate.drawFrame.apply(art,args):original.apply(art,args));
  const report={log,protocol:f.record(ctx).protocol.map(entry=>entry.map(value=>value===base.image?'original-image':value)),draws:f.record(ctx).draws.map(draw=>({state:draw.state,args:draw.args.map(value=>value===base.image?'original-image':value)})),state:f.snapshot(ctx),returned:result.returned,error:result.error};
  if(kind==='throw')assert.equal(result.error,marker);candidate.stop();return report;
 };
 for(const kind of ['two','alpha','throw','null','fourth']){const a=run(false,kind),b=run(true,kind);if(a.error&&kind!=='throw'){assert.equal(b.error?.constructor,a.error.constructor);a.error=b.error=null;}if(kind==='throw')a.error=b.error='same-marker-identity-checked';assert.deepEqual(b,a,kind);}
 const f=fixture(),ctx=f.context(),selection=f.selected();let called=0,expectedThis,argsSeen;
 function forwarding(...args){called++;expectedThis=this;argsSeen=args;return'original-custom-result';}forwarding.apply=()=>{throw Error('a custom apply property is not a direct invocation');};
 const candidate=createCanvasStateCandidate({context:ctx,original:forwarding,api:f.api,mode:'original'}),receiver={tag:'foreign-art'},args=[ctx,selection,{alpha:.2},'tail'];
 assert.equal(candidate.drawFrame.apply(receiver,args),'original-custom-result');assert.equal(called,1);assert.equal(expectedThis,receiver);assert.deepEqual(argsSeen,args);candidate.stop();
});

test('certificate snapshot changes and selected accessors fall back once without reading unrelated metadata',()=>{
 const changes=[s=>{s.frame.rect.x+=1;},s=>{s.placement.width+=1;},s=>{s.image=new (Object.getPrototypeOf(s.image).constructor)();},s=>{s.frame={rect:{...s.frame.rect}};},s=>{Object.setPrototypeOf(s.placement,null);},s=>{Object.defineProperty(s.frame.rect,'x',{value:s.frame.rect.x,writable:false,configurable:true,enumerable:true});}];
 for(const change of changes){const f=fixture(),ctx=f.context(),selected=f.selected(),candidate=createCanvasStateCandidate({context:ctx,original,api:f.api});assert.equal(candidate.certify(selected),true);change(selected);assert.equal(candidate.drawFrame.call({},ctx,selected),true);assert.equal(f.record(ctx).protocol.filter(([name])=>name==='save').length,1);assert.equal(f.record(ctx).draws.length,1);candidate.stop();}
 const f=fixture(),ctx=f.context(),selected=f.selected(),candidate=createCanvasStateCandidate({context:ctx,original,api:f.api});assert.equal(candidate.certify(selected),true);
 let reads=0;const x=selected.frame.rect.x;Object.defineProperty(selected.frame.rect,'x',{configurable:true,get(){reads++;ctx.globalAlpha=.2;return x;}});
 const prior=f.snapshot(ctx);assert.equal(candidate.drawFrame.call({},ctx,selected),true);assert.equal(reads,1);assert.equal(f.record(ctx).draws[0].state.globalAlpha,.2);assert.deepEqual(f.snapshot(ctx),prior,'original save/restore must contain getter state mutation');candidate.stop();
 for(const target of ['selected','frame','rect','placement']){const q=fixture(),s=q.selected(),c=createCanvasStateCandidate({context:q.context(),original,api:q.api});let n=0;const object=target==='selected'?s:target==='frame'?s.frame:target==='rect'?s.frame.rect:s.placement,key=target==='selected'?'image':target==='frame'?'rect':'x';Object.defineProperty(object,key,{configurable:true,get(){n++;throw Error('poisoned certificate');}});assert.equal(c.certify(s),false);assert.equal(n,0);c.stop();}
});

test('replacement nested proxies reach only the original getter protocol after a formerly valid certificate',()=>{
 for(const field of ['frame','rect','placement']){
  const run=manual=>{
   const f=fixture(),ctx=f.context(),selected=f.selected(),candidate=createCanvasStateCandidate({context:ctx,original,api:f.api}),log=[];
   assert.equal(candidate.certify(selected),true);
   const target=field==='frame'?{rect:{...selected.frame.rect}}:field==='rect'?{...selected.frame.rect}:{...selected.placement};
   const replacement=new Proxy(target,{get(value,key,receiver){log.push('get.'+String(key));return Reflect.get(value,key,receiver);},getPrototypeOf(value){log.push('prototype');return Reflect.getPrototypeOf(value);},getOwnPropertyDescriptor(value,key){log.push('descriptor.'+String(key));return Reflect.getOwnPropertyDescriptor(value,key);}});
   if(field==='rect')selected.frame.rect=replacement;else selected[field]=replacement;
   const result=manual?candidate.drawFrame.call({},ctx,selected):original.call({},ctx,selected);
   const report={result,log,state:f.snapshot(ctx),draws:f.record(ctx).draws.map(draw=>draw.args.slice(1)),protocol:f.record(ctx).protocol.map(([name])=>name)};candidate.stop();return report;
  };
  assert.deepEqual(run(true),run(false),field+' replacement must not be inspected before original fallback');
 }
});

test('own hooks, prototype methods/accessors and foreign contexts prevent manual execution while original behavior survives',()=>{
 for(const field of ['save','restore','drawImage','globalAlpha','imageSmoothingEnabled','imageSmoothingQuality']){
  const f=fixture(),ctx=f.context(),selected=f.selected(),candidate=createCanvasStateCandidate({context:ctx,original,api:f.api});assert.equal(candidate.certify(selected),true);
  const d=Object.getOwnPropertyDescriptor(f.Context.prototype,field);let hooks=0;
  if('value'in d)Object.defineProperty(ctx,field,{configurable:true,value:function(...args){hooks++;return d.value.apply(this,args);}});
  else Object.defineProperty(ctx,field,{configurable:true,get(){hooks++;return d.get.call(this);},set(value){hooks++;d.set.call(this,value);}});
  assert.equal(candidate.drawFrame.call({},ctx,selected),true);assert.ok(hooks>0,field);assert.equal(f.record(ctx).protocol.filter(([name])=>name==='save').length,1,field);candidate.stop();
 }
 for(const field of ['drawImage','globalAlpha']){
  const f=fixture(),ctx=f.context(),selected=f.selected(),candidate=createCanvasStateCandidate({context:ctx,original,api:f.api});assert.equal(candidate.certify(selected),true);
  const d=Object.getOwnPropertyDescriptor(f.Context.prototype,field);let hooks=0;
  if('value'in d)Object.defineProperty(f.Context.prototype,field,{...d,value:function(...args){hooks++;return d.value.apply(this,args);}});
  else Object.defineProperty(f.Context.prototype,field,{...d,get(){hooks++;return d.get.call(this);},set(value){hooks++;d.set.call(this,value);}});
  assert.equal(candidate.drawFrame.call({},ctx,selected),true);assert.ok(hooks>0);assert.equal(f.record(ctx).protocol.filter(([name])=>name==='save').length,1);candidate.stop();
 }
 const f=fixture(),a=f.context(),b=f.context(),selected=f.selected(),candidate=createCanvasStateCandidate({context:a,original,api:f.api});assert.equal(candidate.certify(selected),true);
 f.clear(a);f.clear(b);
 assert.equal(candidate.drawFrame.call({},b,selected),true);assert.equal(f.record(b).protocol.filter(([name])=>name==='save').length,1);assert.equal(f.record(a).protocol.length,0);candidate.stop();
});

test('native draw failure restores the three states without retry and options errors retain their original identity',()=>{
 const f=fixture(),a=f.context(),b=f.context(),selected=f.selected(),marker=Error('draw failure'),art={};
 const candidate=createCanvasStateCandidate({context:b,original,api:f.api});assert.equal(candidate.certify(selected),true);const prior=f.snapshot(b);
 f.faults.set(a,name=>{if(name==='drawImage')throw marker;});f.faults.set(b,name=>{if(name==='drawImage')throw marker;});
 assert.equal(original.call(art,a,selected),false);assert.equal(candidate.drawFrame.call(art,b,selected),false);
 assert.deepEqual(f.snapshot(b),f.snapshot(a));assert.deepEqual(f.snapshot(b),prior);
 assert.equal(f.record(b).protocol.filter(([name])=>name==='drawImage').length,1);assert.equal(f.record(b).protocol.filter(([name])=>name==='save').length,0);
 const before=f.record(b).protocol.length;const options={get alpha(){throw marker;}};assert.equal(outcome(()=>candidate.drawFrame.call(art,b,selected,options)).error,marker);assert.equal(f.record(b).protocol.length,before);candidate.stop();
});

test('injected restoration faults attempt all three restorers, escape the first fault and never retry the original draw',()=>{
 // Throwing injected setters are outside the native valid-receiver guarantee;
 // this verifies cleanup policy, not universal equivalence to native restore.
 const f=fixture(),ctx=f.context(),selected=f.selected(),candidate=createCanvasStateCandidate({context:ctx,original,api:f.api});assert.equal(candidate.certify(selected),true);
 const first=Error('alpha restoration'),second=Error('smoothing restoration');let drew=false;
 f.faults.set(ctx,name=>{if(name==='drawImage'){drew=true;return;}if(drew&&name==='globalAlpha.set')throw first;if(drew&&name==='imageSmoothingEnabled.set')throw second;});
 assert.equal(outcome(()=>candidate.drawFrame.call({},ctx,selected)).error,first);
 const names=f.record(ctx).protocol.map(([name])=>name),draw=names.indexOf('drawImage');
 assert.deepEqual(names.slice(draw+1),['globalAlpha.set','imageSmoothingEnabled.set','imageSmoothingQuality.set']);
 assert.equal(names.filter(name=>name==='drawImage').length,1);assert.equal(names.filter(name=>name==='save'||name==='restore').length,0);
 assert.equal(f.snapshot(ctx).state.imageSmoothingQuality,'medium');candidate.stop();
});

test('invalid recipes are not certified and stop ends the bounded primitive QA utility without subsequent observations',()=>{
 const invalid=[s=>{s.frame.rect.x=NaN;},s=>{s.placement.height=Infinity;},s=>{s.frame.rect.width=-Infinity;},s=>{delete s.placement.width;},s=>{s.image={};},s=>{s.frame.rect.x='8';}];
 for(const mutate of invalid){const f=fixture(),s=f.selected(),candidate=createCanvasStateCandidate({context:f.context(),original,api:f.api});mutate(s);assert.equal(candidate.certify(s),false);candidate.stop();}
 const f=fixture(),ctx=f.context(),selected=f.selected(),candidate=createCanvasStateCandidate({context:ctx,original,api:f.api});assert.equal(candidate.certify(selected),true);
 for(let i=0;i<80;i++)assert.equal(candidate.drawFrame.call({},ctx,selected),true);
 primitiveTree(candidate.report());const before=f.record(ctx).protocol.length;candidate.stop();candidate.stop();assert.deepEqual(candidate.report(),{mode:'manual',stopped:true,certified:1,candidateUsed:80,fallback:0,falseReturns:0});assert.equal(candidate.certify(selected),false);assert.equal(candidate.drawFrame.call({},ctx,selected),false);assert.equal(f.record(ctx).protocol.length,before);primitiveTree(candidate.report());
 assert.equal(Function.prototype.toString.call(ProductionArt.prototype.drawFrame),originalSource);
 for(const stage of ['globalAlpha.get','drawImage']){const h=fixture(),target=h.context(),s=h.selected(),c=createCanvasStateCandidate({context:target,original,api:h.api}),prior=h.snapshot(target);assert.equal(c.certify(s),true);let fired=false;h.faults.set(target,name=>{if(name===stage&&!fired){fired=true;c.stop();}});assert.equal(c.drawFrame.call({},target,s),true,'in-flight native locals complete their original draw and finally');assert.equal(fired,true);assert.deepEqual(h.snapshot(target),prior);assert.equal(c.report().stopped,true);const count=h.record(target).protocol.length;assert.equal(c.drawFrame.call({},target,s),false);assert.equal(h.record(target).protocol.length,count);}
});
