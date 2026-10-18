import {ProductionArt} from './production-art.js?v=0.29.0';

// QA-only experiment. certify() is for the utility's known plain internal
// selections, never arbitrary caller objects or proxies. It is not a general
// proxy detector. Uncertified draw inputs are forwarded without inspecting them.
// This module performs no asset load, bitmap creation, pixel read or installation.
const APPLY=Reflect.apply,DESCRIPTOR=Object.getOwnPropertyDescriptor,PROTO=Object.getPrototypeOf;
const STRING=Function.prototype.toString,ORIGINAL=ProductionArt.prototype.drawFrame;
const ATTRIBUTES=['globalAlpha','imageSmoothingEnabled','imageSmoothingQuality'];
const METHODS=['save','restore','drawImage'],RECT_FIELDS=['x','y','width','height'];
const ownData=(object,key)=>{const descriptor=object&&DESCRIPTOR(object,key);return descriptor&&'value'in descriptor?descriptor.value:undefined;};
const sameDescriptor=(a,b)=>!!a&&!!b&&['value','writable','get','set','enumerable','configurable'].every(key=>Object.hasOwn(a,key)===Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
const native=fn=>typeof fn==='function'&&/\{\s*\[native code\]\s*\}$/.test(APPLY(STRING,fn,[]));
const descriptorCopy=descriptor=>descriptor?Object.freeze({...descriptor}):null;

export function captureNativeCanvasAPI(realm=globalThis){
 try{
  const Context=ownData(realm,'CanvasRenderingContext2D'),Canvas=ownData(realm,'HTMLCanvasElement'),Image=ownData(realm,'HTMLImageElement');
  if(![Context,Canvas,Image].every(native))return null;
  const contextPrototype=ownData(Context,'prototype'),canvasPrototype=ownData(Canvas,'prototype'),imagePrototype=ownData(Image,'prototype');
  if(!contextPrototype||!canvasPrototype||!imagePrototype)return null;
  const api={contextPrototype,contextParent:PROTO(contextPrototype),canvasPrototype,imagePrototype,methodDescriptors:{}};
  for(const name of METHODS){const descriptor=DESCRIPTOR(contextPrototype,name);if(!descriptor||!('value'in descriptor)||!native(descriptor.value))return null;api[name]=descriptor.value;api.methodDescriptors[name]=descriptorCopy(descriptor);}
  for(const name of ATTRIBUTES){const descriptor=DESCRIPTOR(contextPrototype,name);if(!descriptor||'value'in descriptor||!native(descriptor.get)||!native(descriptor.set))return null;api[name]=Object.freeze({get:descriptor.get,set:descriptor.set,descriptor:descriptorCopy(descriptor)});}
  const canvasDescriptor=DESCRIPTOR(canvasPrototype,'width'),imageDescriptor=DESCRIPTOR(imagePrototype,'naturalWidth');
  if(!canvasDescriptor||!imageDescriptor||!native(canvasDescriptor.get)||!native(imageDescriptor.get))return null;
  api.canvasBrandGet=canvasDescriptor.get;api.imageBrandGet=imageDescriptor.get;
  api.canvasBrandDescriptor=descriptorCopy(canvasDescriptor);api.imageBrandDescriptor=descriptorCopy(imageDescriptor);
  Object.freeze(api.methodDescriptors);return Object.freeze(api);
 }catch{return null;}
}

// Explicit API injection is a trusted, controlled unit-test seam. Actual-browser
// callers use captureNativeCanvasAPI(), which rejects non-native implementations.
function copyAPI(value){
 try{
  const contextPrototype=ownData(value,'contextPrototype'),canvasPrototype=ownData(value,'canvasPrototype'),imagePrototype=ownData(value,'imagePrototype');
  if(!contextPrototype||!canvasPrototype||!imagePrototype)return null;
  const capturedParent=ownData(value,'contextParent');if(capturedParent!==undefined&&capturedParent!==PROTO(contextPrototype))return null;
  const api={contextPrototype,canvasPrototype,imagePrototype,contextParent:PROTO(contextPrototype),methodDescriptors:{}};
  for(const name of METHODS){const fn=ownData(value,name),descriptor=DESCRIPTOR(contextPrototype,name);if(typeof fn!=='function'||!descriptor||!('value'in descriptor)||descriptor.value!==fn)return null;api[name]=fn;api.methodDescriptors[name]=descriptorCopy(descriptor);}
  for(const name of ATTRIBUTES){const item=ownData(value,name),get=ownData(item,'get'),set=ownData(item,'set'),descriptor=ownData(item,'descriptor')??DESCRIPTOR(contextPrototype,name);if(typeof get!=='function'||typeof set!=='function'||!descriptor||descriptor.get!==get||descriptor.set!==set||!sameDescriptor(DESCRIPTOR(contextPrototype,name),descriptor))return null;api[name]={get,set,descriptor:descriptorCopy(descriptor)};}
  for(const [kind,name]of [['canvas','width'],['image','naturalWidth']]){
   const get=ownData(value,kind+'BrandGet');if(get!==undefined&&typeof get!=='function')return null;
   api[kind+'BrandGet']=get;
   if(get){const descriptor=ownData(value,kind+'BrandDescriptor')??DESCRIPTOR(api[kind+'Prototype'],name);if(!descriptor||descriptor.get!==get)return null;api[kind+'BrandDescriptor']=descriptorCopy(descriptor);}
  }
  return api;
 }catch{return null;}
}

function contextCurrent(context,api){
 try{
  if(!context||!api||PROTO(context)!==api.contextPrototype||PROTO(api.contextPrototype)!==api.contextParent)return false;
  for(const name of METHODS)if(DESCRIPTOR(context,name)||!sameDescriptor(DESCRIPTOR(api.contextPrototype,name),api.methodDescriptors[name]))return false;
  for(const name of ATTRIBUTES)if(DESCRIPTOR(context,name)||!sameDescriptor(DESCRIPTOR(api.contextPrototype,name),api[name].descriptor))return false;
  return true;
 }catch{return false;}
}

function plainSnapshot(object,fields){
 if(!object||typeof object!=='object')return null;
 const prototype=PROTO(object);if(prototype!==Object.prototype&&prototype!==null)return null;
 const descriptors={};
 for(const name of fields){const descriptor=DESCRIPTOR(object,name);if(!descriptor||!('value'in descriptor))return null;descriptors[name]=descriptorCopy(descriptor);}
 return{object,prototype,descriptors};
}
function snapshotCurrent(snapshot){
 if(PROTO(snapshot.object)!==snapshot.prototype)return false;
 for(const [name,descriptor]of Object.entries(snapshot.descriptors))if(!sameDescriptor(DESCRIPTOR(snapshot.object,name),descriptor))return false;
 return true;
}
function imageKind(image,api){
 const prototype=PROTO(image);
 for(const kind of ['canvas','image'])if(prototype===api[kind+'Prototype']){
  const get=api[kind+'BrandGet'];if(get){if(!sameDescriptor(DESCRIPTOR(prototype,kind==='canvas'?'width':'naturalWidth'),api[kind+'BrandDescriptor']))return null;APPLY(get,image,[]);}
  return kind;
 }
 return null;
}

export function createCanvasStateCandidate({context,original,api=captureNativeCanvasAPI(),mode='manual'}={}){
 api=copyAPI(api);mode=mode==='manual'?'manual':'disabled';
 let certificates=new WeakMap(),stopped=false,certified=0,candidateUsed=0,fallback=0,falseReturns=0;
 const increment=name=>{if(name==='certified')certified=Math.min(Number.MAX_SAFE_INTEGER,certified+1);else if(name==='candidateUsed')candidateUsed=Math.min(Number.MAX_SAFE_INTEGER,candidateUsed+1);else if(name==='fallback')fallback=Math.min(Number.MAX_SAFE_INTEGER,fallback+1);else falseReturns=Math.min(Number.MAX_SAFE_INTEGER,falseReturns+1);};
 function certify(selected){
  if(stopped||mode!=='manual'||original!==ORIGINAL||!contextCurrent(context,api))return false;
  try{
   // The captured native getter also rejects a forged context/proxy receiver.
   if(!Number.isFinite(APPLY(api.globalAlpha.get,context,[])))return false;
   const selection=plainSnapshot(selected,['image','frame','placement']);if(!selection)return false;
   const image=selection.descriptors.image.value,kind=image&&typeof image==='object'?imageKind(image,api):null;if(!kind)return false;
   const frame=plainSnapshot(selection.descriptors.frame.value,['rect']),placement=plainSnapshot(selection.descriptors.placement.value,RECT_FIELDS);if(!frame||!placement)return false;
   const rect=plainSnapshot(frame.descriptors.rect.value,RECT_FIELDS);if(!rect)return false;
   for(const item of [rect,placement])if(!RECT_FIELDS.every(name=>Number.isFinite(item.descriptors[name].value)))return false;
   const existed=certificates.has(selected);certificates.set(selected,{selection,frame,rect,placement,image,kind,imagePrototype:PROTO(image)});if(!existed)increment('certified');return true;
  }catch{return false;}
 }
 function current(certificate){
  try{return contextCurrent(context,api)&&[certificate.selection,certificate.frame,certificate.rect,certificate.placement].every(snapshotCurrent)&&PROTO(certificate.image)===certificate.imagePrototype&&imageKind(certificate.image,api)===certificate.kind;}catch{return false;}
 }
 function manual(certificate){
  const target=context,nativeAPI=api;
  let previous=null,result=false;
  try{
   const alpha=APPLY(nativeAPI.globalAlpha.get,target,[]),smoothing=APPLY(nativeAPI.imageSmoothingEnabled.get,target,[]),quality=APPLY(nativeAPI.imageSmoothingQuality.get,target,[]);
   previous={alpha,smoothing,quality};
   APPLY(nativeAPI.globalAlpha.set,target,[alpha*Math.min(1,1)]);
   APPLY(nativeAPI.imageSmoothingEnabled.set,target,[true]);APPLY(nativeAPI.imageSmoothingQuality.set,target,['high']);
   const rect=certificate.rect.descriptors,placement=certificate.placement.descriptors;
   APPLY(nativeAPI.drawImage,target,[certificate.image,rect.x.value,rect.y.value,rect.width.value,rect.height.value,placement.x.value,placement.y.value,placement.width.value,placement.height.value]);result=true;
  }catch{result=false;}
  finally{
   if(previous){let firstError,failed=false;for(const [name,value]of [['globalAlpha',previous.alpha],['imageSmoothingEnabled',previous.smoothing],['imageSmoothingQuality',previous.quality]])try{APPLY(nativeAPI[name].set,target,[value]);}catch(error){if(!failed){firstError=error;failed=true;}}if(failed)throw firstError;}
  }
  if(result===false)increment('falseReturns');return result;
 }
 function drawFrame(...args){
  if(stopped)return false;
  const selected=args[1],known=certificates.has(selected);
  if(mode==='manual'&&original===ORIGINAL&&args[0]===context&&(args.length===2||args.length===3&&args[2]===undefined)&&known){
   const certificate=certificates.get(selected);if(current(certificate)){increment('candidateUsed');return manual(certificate);}certificates.delete(selected);
  }
  increment('fallback');const result=APPLY(original,this,args);if(result===false)increment('falseReturns');return result;
 }
 function report(){return{mode,stopped,certified,candidateUsed,fallback,falseReturns};}
 function stop(){if(!stopped){stopped=true;certificates=context=original=api=null;}return report();}
 return{certify,drawFrame,report,stop};
}
