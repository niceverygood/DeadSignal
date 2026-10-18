const objectLike=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const imageFields=['src','currentSrc','naturalWidth','naturalHeight','width','height','complete'];
const mapGet=Map.prototype.get,functionSource=Function.prototype.toString;
const promisePrototype=Promise.prototype,promiseThen=Promise.prototype.then;
const clock=()=>{try{const value=globalThis.performance?.now?.();return Number.isFinite(value)?value:0;}catch{return 0;}};
const elapsed=start=>Math.max(0,clock()-start);
const decodedResult=()=>({done:true}),rejectedResult=error=>({error});
const failure=code=>Error(code);
const message=error=>{try{return typeof error?.message==='string'?error.message:'image-decode-failed';}catch{return'image-decode-failed';}};
const sameDescriptor=(a,b)=>!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
function data(object,key,code){
 if(!objectLike(object))throw failure(code);
 const descriptor=Object.getOwnPropertyDescriptor(object,key);
 if(!descriptor||!('value'in descriptor))throw failure(code);
 return descriptor.value;
}
function nativeFunction(value){try{return typeof value==='function'&&Reflect.apply(functionSource,value,[]).includes('[native code]');}catch{return false;}}
const note='QA-only sequential decode() on the existing original ready HTMLImageElement, without changing its URL, decoding hint, callbacks, record, metadata or image identity. Explicit ImageElement injection exists for controlled contract tests only; it is not browser/GPU evidence. Underlying native decode cannot be cancelled: abort/timeout only stop this readiness certificate and a late completion never publishes READY. decode may retain or increase decoded-cache memory; rawRGBAestimate is width*height*4 per unique original image, not measured heap/RAM/VRAM or a memory saving. API readiness is not first-draw, GPU-completion, FPS or full product-loop validation.';

// Never install this service in the product load path. The caller supplies at
// most two already-ready original atlas IDs and retains ordinary load fallback.
export async function prepareOriginalImageDecode(art,ids,options={}){
 const started=clock(),report={ready:false,status:'fallback',error:'',elapsedMs:0,attempted:0,completed:0,entries:[],totalRawEstimate:0,note};
 let signal,owner,ImageElement,prototype,decodeDescriptor,fieldDescriptors,records,captures,groups,images,timer,abort,resolveStopped,stoppedReason='';
 const stop=reason=>{if(stoppedReason)return;stoppedReason=reason;resolveStopped?.({stopped:reason});};
 const fallback=error=>{
  report.ready=false;report.status='fallback';report.error=typeof error==='string'?error:message(error);
  for(const entry of report.entries){entry.ready=false;entry.status='fallback';entry.error=report.error;}
  return report;
 };
 try{
  if(!objectLike(options))throw failure('image-decode-options-required');
  const option=(key,defaultValue)=>Object.hasOwn(options,key)?data(options,key,'image-decode-data-options-required'):defaultValue;
  signal=option('signal',undefined);owner=option('ownerCurrent',()=>true);ImageElement=option('ImageElement',globalThis.HTMLImageElement);
  const injected=Object.hasOwn(options,'ImageElement'),requestedTimeout=option('timeoutMs',15000),timeout=typeof requestedTimeout==='number'&&Number.isFinite(requestedTimeout)?Math.max(1,Math.min(15000,requestedTimeout)):15000;
  if(typeof owner!=='function')throw failure('image-decode-owner-callback-required');
  if(signal?.aborted)throw failure('image-decode-aborted');
  if(!Array.isArray(ids))throw failure('image-decode-valid-ids-required');
  const length=data(ids,'length','image-decode-valid-ids-required'),unique=[];
  if(!length)throw failure('image-decode-valid-ids-required');
  for(let index=0;index<length;index++){
   const id=data(ids,String(index),'image-decode-data-ids-required');
   if(typeof id!=='string'||!id)throw failure('image-decode-valid-ids-required');
   if(!unique.includes(id))unique.push(id);
   if(unique.length>2)throw failure('image-decode-two-original-ids-required');
  }
  report.entries=unique.map(id=>({id,width:0,height:0,rawRGBAestimate:0,attempted:false,ready:false,status:'pending',error:'',elapsedMs:0}));
  if(typeof ImageElement!=='function')throw failure('image-decode-standard-image-unsupported');
  prototype=data(ImageElement,'prototype','image-decode-standard-prototype-required');
  decodeDescriptor=Object.getOwnPropertyDescriptor(prototype,'decode');
  if(!decodeDescriptor||!('value'in decodeDescriptor)||typeof decodeDescriptor.value!=='function'||!injected&&(!nativeFunction(ImageElement)||!nativeFunction(decodeDescriptor.value)))throw failure('image-decode-standard-method-required');
  fieldDescriptors=new Map();
  for(const key of imageFields){
   const descriptor=Object.getOwnPropertyDescriptor(prototype,key);
   if(!descriptor||('value'in descriptor? !injected : typeof descriptor.get!=='function'||!injected&&!nativeFunction(descriptor.get)))throw failure('image-decode-standard-fields-required');
   fieldDescriptors.set(key,descriptor);
  }
  records=data(art,'records','image-decode-data-records-required');
  // Calling the Map intrinsic rejects Map-like mocks/proxies and does not call
  // a replaced get() method or an accessor on the supplied records object.
  Reflect.apply(mapGet,records,[unique[0]]);
  const stopped=new Promise(resolve=>{resolveStopped=resolve;});
  abort=()=>stop('image-decode-aborted');signal?.addEventListener?.('abort',abort,{once:true});
  timer=setTimeout(()=>stop('image-decode-timeout'),timeout);
  function checkOwner(){
   if(stoppedReason||signal?.aborted)throw failure(stoppedReason||'image-decode-aborted');
   if(owner()!==true)throw failure('image-decode-owner-changed');
   if(stoppedReason||signal?.aborted)throw failure(stoppedReason||'image-decode-aborted');
   if(data(art,'records','image-decode-data-records-required')!==records)throw failure('image-decode-records-changed');
  }
  function imageValues(image){
   if(!objectLike(image)||Object.getPrototypeOf(image)!==prototype||Object.getOwnPropertyDescriptor(image,'decode')||!sameDescriptor(Object.getOwnPropertyDescriptor(prototype,'decode'),decodeDescriptor))throw failure('image-decode-original-standard-image-required');
   const values={};
   for(const [key,descriptor]of fieldDescriptors){
    if(Object.getOwnPropertyDescriptor(image,key)||!sameDescriptor(Object.getOwnPropertyDescriptor(prototype,key),descriptor))throw failure('image-decode-original-image-field-required');
    values[key]='value'in descriptor?descriptor.value:Reflect.apply(descriptor.get,image,[]);
   }
   return values;
  }
  function capture(entry){
   const record=Reflect.apply(mapGet,records,[entry.id]);
   if(data(record,'status','image-decode-ready-record-required')!=='ready')throw failure('image-decode-ready-record-required');
   const image=data(record,'image','image-decode-data-image-required'),metadata=data(record,'metadata','image-decode-data-metadata-required'),atlas=data(metadata,'atlas','image-decode-data-atlas-required');
   const width=data(atlas,'width','image-decode-data-dimensions-required'),height=data(atlas,'height','image-decode-data-dimensions-required');
   if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0)throw failure('image-decode-original-dimensions-required');
   const raw=width*height*4,values=imageValues(image);
   if(!Number.isSafeInteger(raw)||typeof values.src!=='string'||!values.src||typeof values.currentSrc!=='string'||values.complete!==true||values.naturalWidth!==width||values.naturalHeight!==height||values.width!==width||values.height!==height)throw failure('image-decode-original-dimensions-required');
   entry.width=width;entry.height=height;entry.rawRGBAestimate=raw;
   return{entry,record,image,metadata,atlas,width,height,values};
  }
  function checkAll(){
   checkOwner();
   for(const saved of captures){
    const record=Reflect.apply(mapGet,records,[saved.entry.id]);
    if(record!==saved.record||data(record,'status','image-decode-ready-record-required')!=='ready'||data(record,'image','image-decode-data-image-required')!==saved.image||data(record,'metadata','image-decode-data-metadata-required')!==saved.metadata||data(saved.metadata,'atlas','image-decode-data-atlas-required')!==saved.atlas||data(saved.atlas,'width','image-decode-data-dimensions-required')!==saved.width||data(saved.atlas,'height','image-decode-data-dimensions-required')!==saved.height)throw failure('image-decode-original-record-changed');
    const values=imageValues(saved.image);if(imageFields.some(key=>!Object.is(values[key],saved.values[key])))throw failure('image-decode-original-source-changed');
   }
   if(stoppedReason||signal?.aborted)throw failure(stoppedReason||'image-decode-aborted');
  }
  checkOwner();captures=report.entries.map(capture);groups=[];
  images=new Map();
  for(const saved of captures){let group=images.get(saved.image);if(!group){group={image:saved.image,entries:[]};images.set(saved.image,group);groups.push(group);report.totalRawEstimate+=saved.entry.rawRGBAestimate;}group.entries.push(saved.entry);}
  if(!Number.isSafeInteger(report.totalRawEstimate))throw failure('image-decode-dimensions-estimate-overflow');
  for(const group of groups){
   checkAll();const entryStart=clock();for(const entry of group.entries)entry.attempted=true;report.attempted++;
   try{
    const pending=Reflect.apply(decodeDescriptor.value,group.image,[]);
    if(!objectLike(pending)||Object.getPrototypeOf(pending)!==promisePrototype||Object.getOwnPropertyDescriptor(pending,'then')||Object.getOwnPropertyDescriptor(pending,'constructor'))throw failure('image-decode-native-promise-required');
    // These normalization callbacks capture neither original images nor the
    // report; a late native settlement cannot publish a readiness transition.
    const outcome=await Promise.race([Reflect.apply(promiseThen,pending,[decodedResult,rejectedResult]),stopped]);
    if(outcome.stopped)throw failure(outcome.stopped);if('error'in outcome)throw outcome.error;
    checkAll();report.completed++;for(const entry of group.entries){entry.ready=true;entry.status='ready';}
   }finally{for(const entry of group.entries)entry.elapsedMs=elapsed(entryStart);}
  }
  checkAll();report.ready=true;report.status='ready';return report;
 }catch(error){return fallback(error);}
 finally{
  clearTimeout(timer);try{signal?.removeEventListener?.('abort',abort);}catch{}
  report.elapsedMs=elapsed(started);
  // No owner, image, record, metadata, options or pending Promise is retained in
  // the returned primitive report, including abort/timeout/partial completion.
  images?.clear();images=captures=groups=records=fieldDescriptors=decodeDescriptor=prototype=ImageElement=owner=signal=art=ids=options=abort=resolveStopped=null;
 }
}
