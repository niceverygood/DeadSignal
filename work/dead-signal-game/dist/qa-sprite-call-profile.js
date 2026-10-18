export const SPRITE_CALL_PROFILE_NOTE='QA observes synchronous CPU call wall time of existing ProductionArt.drawFrame and Canvas calls on the supplied renderer context only. drawFrame, Canvas methods and accessors are inclusive observations; nested calls overlap and must not be added as exclusive costs. Observer hooks, clocks and primitive snapshots add overhead. Hooks detach at every endFrame and reinstall at the next beginFrame, adding per-frame property installation overhead and avoiding retired inner-observer wrappers when owners change. No extra draw, render, pixel read, bitmap, upload or asset operation is performed. Reports retain at most 80 frames and 32 primitive outliers; these bounds are not a peak-memory measurement. Source labels describe the selected sprite, not unique actors or renderer categories. No GPU execution time, FPS, performance improvement or cold-decode conclusion is implied. With an independent observer wrapping the same art, begin that observer first, end this observer first, and stop this observer first.';

const APPLY=Reflect.apply,slots=new WeakMap();
const isObject=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const ownData=(object,key)=>{try{if(!isObject(object))return;const descriptor=Object.getOwnPropertyDescriptor(object,key);return descriptor&&'value'in descriptor?descriptor.value:undefined;}catch{}};
const sameDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
function findDescriptor(object,key){
 let owner=object;
 for(let depth=0;owner&&depth<32;depth++,owner=Object.getPrototypeOf(owner)){
  const descriptor=Object.getOwnPropertyDescriptor(owner,key);if(descriptor)return descriptor;
 }
 return null;
}
function dispatch(slot,part,receiver,args){
 const entered=[];
 for(const listener of slot.listeners)try{const token=listener.enter(part,receiver,args);if(token)entered.push([listener,token]);}catch{try{listener.error();}catch{}}
 let result,threw=true;
 try{result=APPLY(slot.original[part],receiver,args);threw=false;return result;}
 finally{for(let i=entered.length-1;i>=0;i--)try{entered[i][0].leave(entered[i][1],threw);}catch{try{entered[i][0].error();}catch{}}}
}
function subscribe(object,key,kind,listener){
 if(!isObject(object))return null;
 let methods=slots.get(object),slot=methods?.get(key);
 try{
  if(slot){if(slot.kind!==kind||!sameDescriptor(Object.getOwnPropertyDescriptor(object,key),slot.expected))return null;}
  else{
   const descriptor=Object.getOwnPropertyDescriptor(object,key),source=findDescriptor(object,key);
   if(!source||descriptor&&!descriptor.configurable&&(kind!=='method'||!descriptor.writable))return null;
   slot={kind,descriptor,original:{},listeners:new Set(),expected:null};
   if(kind==='method'){
    if(!('value'in source)||typeof source.value!=='function')return null;
    slot.original.call=source.value;
    const value=function(...args){return dispatch(slot,'call',this,args);};
    slot.expected=descriptor?{...descriptor,value}:{value,writable:true,enumerable:false,configurable:true};
   }else{
    if('value'in source||typeof source.set!=='function'||key==='globalAlpha'&&typeof source.get!=='function')return null;
    slot.original.get=source.get;slot.original.set=source.set;
    const get=typeof source.get==='function'?function(){return dispatch(slot,'get',this,[]);}:undefined;
    const set=function(value){return dispatch(slot,'set',this,[value]);};
    slot.expected={get,set,enumerable:descriptor?.enumerable??source.enumerable,configurable:descriptor?.configurable??true};
   }
   Object.defineProperty(object,key,slot.expected);
   methods??=new Map();slots.set(object,methods);methods.set(key,slot);
  }
 }catch{return null;}
 slot.listeners.add(listener);let attached=true;
 return()=>{
  if(!attached)return true;attached=false;slot.listeners.delete(listener);if(slot.listeners.size)return true;
  let restored=false;
  try{if(sameDescriptor(Object.getOwnPropertyDescriptor(object,key),slot.expected)){if(slot.descriptor)Object.defineProperty(object,key,slot.descriptor);else delete object[key];restored=sameDescriptor(Object.getOwnPropertyDescriptor(object,key),slot.descriptor);}}catch{}
  methods.delete(key);if(!methods.size)slots.delete(object);return restored;
 };
}
function metadataSnapshot(selected){
 const id=ownData(selected,'id'),metadata=ownData(selected,'metadata'),frame=ownData(selected,'frame'),rect=ownData(frame,'rect');
 let source='unknown';if(ownData(metadata,'liveRig')===true||id==='survivor-original-live-rig')source='native';else if(ownData(metadata,'format')==='meshy-iso-sprite-atlas'&&typeof id==='string')source='baked';
 const values=['x','y','width','height'].map(key=>ownData(rect,key));
 return{assetId:typeof id==='string'?id:null,source,rect:values.every(Number.isFinite)?{x:values[0],y:values[1],width:values[2],height:values[3]}:null};
}
function primitiveMetadata(meta){
 const copy={};if(!isObject(meta))return copy;
 try{for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(meta))){if(!descriptor.enumerable||!('value'in descriptor)||['frameIndex','stages'].includes(key))continue;const value=descriptor.value;if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))Object.defineProperty(copy,key,{value,writable:true,enumerable:true,configurable:true});}}catch{}
 return copy;
}

export function createSpriteCallProfile({renderer,read,now=()=>performance.now(),enabled=true,limit=40,maxOutliers=32}={}){
 enabled=!!enabled;limit=Number.isFinite(limit)?Math.min(80,Math.max(1,Math.floor(limit))):40;maxOutliers=Number.isFinite(maxOutliers)?Math.min(32,Math.max(0,Math.floor(maxOutliers))):32;
 const samples=[],outliers=[],unmeasured=[],missing=new Set(),undo=[];
 let stopped=false,report=null,current=null,scope=null,art=null,context=null,clockActive=false;
 const mark=label=>{try{if(!missing.has(label)){missing.add(label);unmeasured.push(label);}}catch{}};
 function clock(){
  if(stopped)return null;if(clockActive){mark('clock.reentrant');return null;}
  clockActive=true;try{const value=typeof now==='function'?now():NaN;if(Number.isFinite(value))return value;mark('clock');return null;}catch{mark('clock');return null;}finally{clockActive=false;}
 }
 function restore(){for(let i=undo.length-1;i>=0;i--){const item=undo[i];try{if(!item.release())mark(item.label+'.restore');}catch{mark(item.label+'.restore');}}undo.length=0;}
 function retainOutlier(token,wallMs,threw){
  if(!maxOutliers||token.start===null||!Number.isFinite(wallMs))return;
  if(outliers.length===maxOutliers&&wallMs<=outliers[outliers.length-1].wallMs)return;
  const data=token.snapshot,entry={frameIndex:token.frame.frameIndex,stage:token.label,wallMs,threw,assetId:data.assetId,source:data.source,rect:data.rect?{...data.rect}:null};
  let index=outliers.findIndex(value=>wallMs>value.wallMs);if(index<0)index=outliers.length;outliers.splice(index,0,entry);if(outliers.length>maxOutliers)outliers.pop();
 }
 function finish(token,threw){
  if(!token)return;const end=clock();
  if(!stopped&&current===token.frame){const measured=token.start!==null&&end!==null,wallMs=measured?Math.max(0,end-token.start):0,stage=token.frame.stages[token.label]??={calls:0,thrownCalls:0,wallMs:0};stage.calls++;if(threw)stage.thrownCalls++;stage.wallMs+=wallMs;if(measured)retainOutlier(token,wallMs,threw);}
 }
 function attach(){
  const nextArt=ownData(renderer,'productionArt'),nextContext=ownData(renderer,'ctx');
  if(nextArt===art&&nextContext===context)return;
  restore();scope=null;art=nextArt;context=nextContext;
  if(!isObject(art)||!isObject(context)){mark('owners');return;}
  const install=(object,key,kind,listener,label)=>{const release=subscribe(object,key,kind,listener);if(release)undo.push({release,label});else mark(label);};
  for(const key of ['save','restore','drawImage','globalAlpha','imageSmoothingEnabled','imageSmoothingQuality']){
   const kind=['save','restore','drawImage'].includes(key)?'method':'accessor';
   install(context,key,kind,{
    error:()=>mark(key+'.observer'),
    enter(part,receiver){const active=scope;if(stopped||!current||!active||active.frame!==current||receiver!==context||part==='get'&&key!=='globalAlpha')return null;const token={frame:current,snapshot:active.snapshot,label:kind==='method'?key:key+'.'+part,start:null};token.start=clock();return token;},
    leave:finish
   },key);
  }
  install(art,'drawFrame','method',{
   error:()=>mark('drawFrame.observer'),
   enter(part,receiver,args){
    if(stopped||!current)return null;
    if(receiver!==art||args[0]!==context||ownData(renderer,'productionArt')!==art||ownData(renderer,'ctx')!==context){const token={frame:current,label:null,active:null,previous:scope};scope=null;mark('drawFrame.foreignOwnerOrContext');return token;}
    const active={frame:current,snapshot:metadataSnapshot(args[1])},token={frame:current,snapshot:active.snapshot,label:'drawFrame',start:null,active,previous:scope};scope=active;token.start=clock();return token;
   },
   leave(token,threw){try{if(token.label)finish(token,threw);}finally{if(scope===token.active)scope=!stopped&&current===token.frame?token.previous:null;token.active=null;token.previous=null;}}
  },'drawFrame');
 }
 function beginFrame(meta={}){
  if(!enabled||stopped||current)return null;
  current={...primitiveMetadata(meta),frameIndex:samples.length,stages:{}};scope=null;try{attach();}catch{mark('attach');}return current;
 }
 function endFrame(meta={}){
  if(!enabled||stopped||!current)return null;
  const frame=current;current=null;scope=null;try{for(const [key,value]of Object.entries(primitiveMetadata(meta)))Object.defineProperty(frame,key,{value,writable:true,enumerable:true,configurable:true});samples.push(frame);}catch{mark('sample.store');stop();}finally{restore();art=context=null;}if(samples.length>=limit)stop();return frame;
 }
 function stop(){
  if(report)return report;stopped=true;if(current)mark('frame.unfinished');current=null;scope=null;restore();art=context=renderer=read=now=null;
  return report={enabled,samples,outliers,unmeasured,note:SPRITE_CALL_PROFILE_NOTE};
 }
 return{beginFrame,endFrame,stop,samples,unmeasured,note:SPRITE_CALL_PROFILE_NOTE};
}
