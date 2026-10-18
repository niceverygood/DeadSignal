import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductionArt} from '../dist/production-art.js';
import {createQAStorage} from '../dist/qa-storage.js';
import {compareSpriteCallPixels} from '../dist/qa-sprite-call-pixels.js';

// Deterministic fake-RGBA tests of the QA comparison contract. These do not
// exercise native Canvas rasterization, browser pixels, GL, decode or FPS.
const descriptors=object=>Object.getOwnPropertyDescriptors(object);
const address=(query='qa&qa-memory&qa-loop=1&qa-loop-sprite-calls=1')=>new URL('http://localhost:8851/index.html?'+query);
const memory=query=>createQAStorage(query,()=>{throw Error('persistent storage is forbidden');});

function fakeCanvasDocument({fault=null,mismatch=false}={}){
 const canvases=[],draws=[],calls=[];let imageReads=0;
 class Context {
  constructor(canvas){this.canvas=canvas;this.alpha=1;this.smoothing=false;this.quality='low';this.stack=[];}
  get globalAlpha(){return this.alpha;}set globalAlpha(value){this.alpha=value;}
  get imageSmoothingEnabled(){return this.smoothing;}set imageSmoothingEnabled(value){this.smoothing=value;}
  get imageSmoothingQuality(){return this.quality;}set imageSmoothingQuality(value){this.quality=value;}
  save(){calls.push('save');if(fault==='save')throw Error('save failure');this.stack.push([this.alpha,this.smoothing,this.quality]);}
  restore(){calls.push('restore');if(fault==='restore')throw Error('restore failure');const saved=this.stack.pop();if(saved)[this.alpha,this.smoothing,this.quality]=saved;}
  setTransform(...args){calls.push(['setTransform',...args]);}
  clearRect(){this.canvas.pixels.fill(0);calls.push('clearRect');}
  fillRect(x,y,width,height){calls.push(['fillRect',x,y,width,height]);for(let row=Math.max(0,y);row<Math.min(this.canvas.height,y+height);row++)for(let column=Math.max(0,x);column<Math.min(this.canvas.width,x+width);column++){const index=(row*this.canvas.width+column)*4;this.canvas.pixels[index]=19;this.canvas.pixels[index+1]=31;this.canvas.pixels[index+2]=37;this.canvas.pixels[index+3]=89;}}
  fillText(...args){calls.push(['fillText',...args]);}
  drawImage(image,...args){
   calls.push('drawImage');draws.push({image,args:[...args],receiver:this});if(fault==='drawImage')throw Error('drawImage failure');
   if(args.length!==8&&args.length!==2)throw Error('unsupported fake drawImage shape');
   const [sx,sy,sw,sh,dx,dy,dw,dh]=args.length===8?args:[0,0,image.width,image.height,args[0],args[1],image.width,image.height];
   for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    const targetX=Math.floor(dx+x),targetY=Math.floor(dy+y);if(targetX<0||targetY<0||targetX>=this.canvas.width||targetY>=this.canvas.height)continue;
    const sourceX=Math.floor(sx+x*sw/dw),sourceY=Math.floor(sy+y*sh/dh),source=(sourceY*image.width+sourceX)*4,target=(targetY*this.canvas.width+targetX)*4;
    for(let channel=0;channel<4;channel++)this.canvas.pixels[target+channel]=channel===3?Math.round(image.pixels[source+channel]*this.alpha):image.pixels[source+channel];
   }
  }
  getImageData(x,y,width,height){
   imageReads++;calls.push(['getImageData',x,y,width,height]);if(fault==='getImageData')throw Error('pixel read failure');
   assert.equal(x,0);assert.equal(y,0);assert.equal(width,this.canvas.width);assert.equal(height,this.canvas.height);
   const data=this.canvas.pixels.slice();if(mismatch&&imageReads===2)data[0]^=1;return{data,width,height};
  }
 }
 class Canvas {
  constructor(){this.w=1;this.h=1;this.pixels=new Uint8ClampedArray(4);this.context=new Context(this);if(fault==='unhookable')Object.defineProperty(this.context,'drawImage',{value:Context.prototype.drawImage,writable:false,configurable:false});}
  get width(){return this.w;}set width(value){this.w=value;this.pixels=new Uint8ClampedArray(this.w*this.h*4);}
  get height(){return this.h;}set height(value){this.h=value;this.pixels=new Uint8ClampedArray(this.w*this.h*4);}
  getContext(kind){calls.push(['getContext',kind]);if(fault==='getContext')return null;assert.equal(kind,'2d');return this.context;}
  toDataURL(){calls.push('toDataURL');if(fault==='toDataURL')throw Error('export failure');return'data:image/mock;base64,contract-only';}
 }
 return{canvases,draws,calls,document:{createElement(tag){calls.push(['createElement',tag]);assert.equal(tag,'canvas');const canvas=new Canvas();canvases.push(canvas);return canvas;}}};
}

function originalImage(name){
 const pixels=new Uint8ClampedArray(8*8*4);for(let index=0;index<pixels.length;index+=4){pixels[index]=(index/4)%251;pixels[index+1]=name==='native'?71:29;pixels[index+2]=183;pixels[index+3]=255;}
 return Object.freeze({name,width:8,height:8,naturalWidth:8,naturalHeight:8,src:'http://localhost:8851/assets/'+name+'.png',currentSrc:'http://localhost:8851/assets/'+name+'.png',pixels});
}

function fixture(options={}){
 const location=address(),storage=memory(location.searchParams),dom=fakeCanvasDocument(options),art=Object.create(ProductionArt.prototype),nativeImage=originalImage('native'),bakedImage=originalImage('baked'),actor={originalActor:true};
 const native={id:'enemy-walker-native',image:nativeImage,metadata:{format:'meshy-iso-sprite-atlas',liveRig:true},frame:{rect:{x:1,y:2,width:4,height:3}},placement:{x:9,y:12,width:4,height:3}};
 const bakedMetadata={format:'meshy-iso-sprite-atlas',atlas:{width:8,height:8},frames:[{rect:{x:2,y:1,width:3,height:4}}]};
 art.manifest={enemies:{walker:{walk:'enemy-walker-walk'}}};
 art.records=new Map([['enemy-walker-walk',{status:'ready',image:bakedImage,metadata:bakedMetadata}]]);
 const nativeActorFrames=new WeakMap([[actor,native]]),mainCalls=[],ctx={mainContext:true},renderer={ctx,productionArt:art,nativeActorFrames,liveEnemySelection:new Set([actor]),render(){mainCalls.push('render');throw Error('main render forbidden');},nativeEnemyFrame(){mainCalls.push('nativeFrame');throw Error('native render forbidden');}};
 for(const key of ['load','frame','characterFrame','nativeFrame'])art[key]=()=>{mainCalls.push(key);throw Error('asset/selection operation forbidden');};
 return{location,query:location.searchParams,storage,document:dom.document,renderer,art,ctx,actor,native,nativeImage,bakedImage,bakedMetadata,dom,mainCalls};
}

function assertReleased(dom){assert.ok(dom.canvases.length>0,'the allowed test actually allocated a scratch canvas');for(const canvas of dom.canvases){assert.equal(canvas.width,0,'scratch width released');assert.equal(canvas.height,0,'scratch height released');}}

function assertNoOriginalReferences(report,forbidden,path='report'){
 assert.equal(forbidden.has(report),false,path+' retains original resources');if(report===null||['string','number','boolean','undefined'].includes(typeof report))return;
 assert.equal(typeof report,'object');assert.ok(Array.isArray(report)||Object.getPrototypeOf(report)===Object.prototype||Object.getPrototypeOf(report)===null,path+' is plain data');
 for(const key of Reflect.ownKeys(report)){const descriptor=Object.getOwnPropertyDescriptor(report,key);assert.ok('value'in descriptor,path+' has no getters');assertNoOriginalReferences(descriptor.value,forbidden,path+'.'+String(key));}
}

test('origin, explicit flag and genuine-memory checks reject before even reading renderer/document or storage methods',()=>{
 let ownerReads=0,storageReads=0;
 const valid=address(),storage=memory(valid.searchParams),unbranded={};
 for(const key of ['getItem','setItem','removeItem'])Object.defineProperty(unbranded,key,{get(){storageReads++;throw Error('persistent access');}});
 const cases=[
  [new URL('http://localhost:8806/?qa&qa-memory&qa-loop-sprite-calls=1'),storage],
  [new URL('https://localhost:8851/?qa&qa-memory&qa-loop-sprite-calls=1'),storage],
  [new URL('http://example.com:8851/?qa&qa-memory&qa-loop-sprite-calls=1'),storage],
  [address('qa-memory&qa-loop-sprite-calls=1'),storage],
  [address('qa&qa-loop-sprite-calls=1'),storage],
  [address('qa&qa-memory'),storage],
  [address('qa&qa-memory&qa-loop-sprite-calls=true'),storage],
  [valid,unbranded],
  [valid,new Map()]
 ];
 for(const [location,store]of cases){
  const options={location,query:location.searchParams,storage:store};
  for(const key of ['renderer','document'])Object.defineProperty(options,key,{get(){ownerReads++;throw Error('owner/DOM before gate');}});
  const report=compareSpriteCallPixels(options);
  assert.equal(report.available,false);assert.equal(report.complete,false);assert.equal(report.reason,'qa-origin-memory-opt-in-required');assert.deepEqual(report.cases,[]);assert.deepEqual(report.images,[]);
 }
 assert.equal(ownerReads,0);assert.equal(storageReads,0);
});

test('fake-RGBA A/B/A delegates the unchanged drawFrame to the same original native/baked images without rendering, fetching or altering their owners',()=>{
 const f=fixture(),objects=[f.renderer,f.art,f.ctx,f.native,f.native.frame,f.native.frame.rect,f.bakedMetadata],before=objects.map(descriptors),nativePixels=f.nativeImage.pixels.slice(),bakedPixels=f.bakedImage.pixels.slice(),originalMethod=ProductionArt.prototype.drawFrame;
 const report=compareSpriteCallPixels(f);
 assert.equal(report.available,true);assert.equal(report.complete,true);assert.equal(report.cases.length,2);
 assert.deepEqual(new Set(report.cases.map(entry=>entry.kind)),new Set(['native','baked']));
 for(const entry of report.cases){
  assert.deepEqual(entry.returns,[true,true,true]);assert.deepEqual(entry.differenceAB,{components:0,pixels:0,maxDelta:0});assert.deepEqual(entry.differenceAA,{components:0,pixels:0,maxDelta:0});assert.equal(entry.descriptorsRestored,true);
  assert.equal(entry.observerComplete,true);
  assert.equal(entry.observer.samples.length,1);assert.equal(entry.observer.samples[0].stages.drawFrame.calls,1);assert.equal(entry.observer.samples[0].stages.drawImage.calls,1);
 }
 const originalDraws=f.dom.draws.filter(call=>call.args.length===8);assert.equal(originalDraws.length,6,'exactly the independent A/B/A draw for each of the two source cells');
 assert.equal(originalDraws.filter(call=>call.image===f.nativeImage).length,3);assert.equal(originalDraws.filter(call=>call.image===f.bakedImage).length,3);
 for(const draw of originalDraws){assert.ok(draw.image===f.nativeImage||draw.image===f.bakedImage,'draw the existing image, not a copy, bitmap, decoded replacement or main canvas');}
 assert.equal(f.dom.draws.filter(call=>call.args.length===2).length,4,'the separate contact panels copy only already-drawn scratch canvases');assert.equal(report.images.length,2);assert.ok(report.images.every(image=>image.src==='data:image/mock;base64,contract-only'));
 assert.deepEqual(f.mainCalls,[]);objects.forEach((object,index)=>assert.deepEqual(descriptors(object),before[index],'original owner '+index+' unchanged'));assert.deepEqual(f.nativeImage.pixels,nativePixels);assert.deepEqual(f.bakedImage.pixels,bakedPixels);assert.equal(ProductionArt.prototype.drawFrame,originalMethod);
 assertReleased(f.dom);assertNoOriginalReferences(report,new Set([...objects,f.nativeImage,f.bakedImage,f.document,f.storage,...f.dom.canvases,...f.dom.canvases.map(canvas=>canvas.context)]));
 assert.match(report.note,/pixel|RGBA/i);assert.match(report.note,/after|separate/i);
});

test('missing or invalid original native/baked sources remain explicitly incomplete instead of passing an empty comparison',()=>{
 for(const missing of ['native','baked','both']){
  const f=fixture();if(missing!=='baked')f.renderer.liveEnemySelection.clear();if(missing!=='native')f.art.records.clear();
  const report=compareSpriteCallPixels(f);assert.equal(report.complete,false);assert.ok(report.reason,'a missing source has an explicit reason');
  assert.equal(report.cases.length,2,'both source kinds receive an explicit status');
  for(const kind of ['native','baked'])if(missing==='both'||kind===missing){const entry=report.cases.find(value=>value.kind===kind);assert.equal(entry.available,false);assert.equal(entry.complete,false);assert.equal(entry.reason,'already-ready-original-input-missing');}
  assert.deepEqual(f.mainCalls,[]);for(const canvas of f.dom.canvases){assert.equal(canvas.width,0);assert.equal(canvas.height,0);}
 }
 const f=fixture();f.native.frame.rect.width=513;f.bakedMetadata.frames[0].rect.height=513;
 const report=compareSpriteCallPixels(f);assert.equal(report.complete,false);assert.equal(report.cases.length,2);assert.ok(report.cases.every(entry=>entry.available===false&&entry.complete===false));assert.ok(report.reason);assert.deepEqual(f.dom.draws,[],'oversized source cells are not silently downscaled or drawn');assert.deepEqual(f.mainCalls,[]);
});

test('source-image comparison mismatches and original draw/read failures are retained as incomplete evidence, with scratch resources and instance descriptors released',()=>{
 for(const options of [{mismatch:true},{fault:'drawImage'},{fault:'restore'},{fault:'getImageData'},{fault:'getContext'},{fault:'unhookable'}]){
  const f=fixture(options),before=[descriptors(f.art),descriptors(f.renderer),descriptors(f.ctx)];
  const report=compareSpriteCallPixels(f);assert.equal(report.complete,false,JSON.stringify(options));assert.ok(report.reason||report.cases.some(entry=>entry.differenceAB?.components>0||entry.returns?.some(value=>value!==true)),'retain a concrete difference/failure reason');
  if(options.mismatch){assert.equal(report.cases[0].differenceAB.components,1);assert.equal(report.cases[0].differenceAB.pixels,1);assert.equal(report.cases[0].differenceAB.maxDelta,1);assert.equal(report.cases[0].differenceAA.components,0,'original A repeat remains exact');}
  if(options.fault==='unhookable')for(const entry of report.cases){assert.deepEqual(entry.returns,[true,true,true]);assert.equal(entry.differenceAB.components,0);assert.equal(entry.differenceAA.components,0);assert.equal(entry.observerComplete,false);assert.ok(entry.observer.unmeasured.includes('drawImage'),'matching fake RGBA alone cannot pass with an inactive Canvas hook');}
  assertReleased(f.dom);assert.deepEqual(descriptors(f.art),before[0]);assert.deepEqual(descriptors(f.renderer),before[1]);assert.deepEqual(descriptors(f.ctx),before[2]);assert.deepEqual(f.mainCalls,[]);
 }
});

test('unknown source/record accessors are skipped without invocation, and optional PNG export failure retains valid comparison and cleanup evidence',()=>{
 const missing=fixture();let getterReads=0;
 Object.defineProperty(missing.native,'metadata',{get(){getterReads++;throw Error('unknown native metadata');},configurable:true});
 Object.defineProperty(missing.art.records.get('enemy-walker-walk'),'status',{get(){getterReads++;throw Error('unknown record status');},configurable:true});
 const absent=compareSpriteCallPixels(missing);assert.equal(getterReads,0);assert.equal(absent.complete,false);assert.ok(absent.cases.every(entry=>entry.available===false));assert.deepEqual(missing.dom.canvases,[]);assert.deepEqual(missing.mainCalls,[]);
 const f=fixture({fault:'toDataURL'}),report=compareSpriteCallPixels(f);assert.equal(report.complete,true,'optional contact PNG export does not erase a completed RGBA comparison');assert.deepEqual(report.images,[]);assert.ok(report.cases.every(entry=>entry.complete&&entry.imageError==='export failure'));assert.equal(report.cleanup.complete,true);assertReleased(f.dom);assert.deepEqual(f.mainCalls,[]);
});
