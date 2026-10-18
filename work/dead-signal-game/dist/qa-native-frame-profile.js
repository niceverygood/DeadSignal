import {GPUAlphaBounds} from './boss-rig/gpu-alpha-bounds.js';

export const NATIVE_FRAME_PROFILE_NOTE='QA instrumentation measures CPU call wall time only, including any synchronous wait and instrumentation overhead. It does not measure GPU execution, FPS or total memory. Stage fields are independent inclusive observations: nested stages overlap and must not be summed.';

// One dispatcher per object/method permits overlapping QA sessions to stop in
// either order. Preserve descriptors and never overwrite a later external edit.
const methodSlots=new WeakMap();
function subscribe(object,key,observer){
 if(!object)return null;
 let methods=methodSlots.get(object),slot=methods?.get(key);
 try{
  if(slot&&object[key]!==slot.dispatch)return null;
  if(!slot){
   const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];if(typeof original!=='function')return null;
   slot={descriptor,original,observers:new Set()};
   slot.dispatch=function(...args){
    const entered=[];for(const listener of slot.observers){try{entered.push([listener,listener.enter?.(this,args)]);}catch{}}
    let result,returned=false;
    try{result=slot.original.apply(this,args);returned=true;return result;}
    finally{for(let i=entered.length-1;i>=0;i--){const [listener,token]=entered[i];try{listener.leave?.(token,result,!returned,this,args);}catch{}}}
   };
   const next=descriptor&&'value'in descriptor?{...descriptor,value:slot.dispatch}:{configurable:descriptor?.configurable??true,enumerable:descriptor?.enumerable??false,writable:true,value:slot.dispatch};
   Object.defineProperty(object,key,next);methods??=new Map();methodSlots.set(object,methods);methods.set(key,slot);
  }
 }catch{return null;}
 slot.observers.add(observer);let attached=true;
 return()=>{
  if(!attached)return;attached=false;slot.observers.delete(observer);if(slot.observers.size)return;
  try{if(Object.getOwnPropertyDescriptor(object,key)?.value===slot.dispatch){if(slot.descriptor)Object.defineProperty(object,key,slot.descriptor);else delete object[key];}}catch{}
  methods.delete(key);if(!methods.size)methodSlots.delete(object);
 };
}

// No rendering, getContext, pixel reads, GL error queries or timer queries are
// initiated by this profiler. Every measured call was made by the original rig.
export function createNativeFrameProfile(rig,{enabled=true,now=()=>performance.now()}={}){
 const samples=[],unmeasured=[],undo=[],watched=new WeakMap(),contextPrototypes=[],finishActors=[];
 let current=null,stopped=false,gpuReadDepth=0;
 const clock=()=>{try{const value=now();return Number.isFinite(value)?value:null;}catch{return null;}};
 const enterStage=name=>name&&current?{frame:current,name,start:clock()}:null;
 const leaveStage=token=>{if(!token)return;const end=clock(),entry=token.frame.stages[token.name]??={cpuMs:0,calls:0};entry.calls++;if(token.start!==null&&end!==null)entry.cpuMs+=Math.max(0,end-token.start);};
 function observe(object,key,{name,enter,leave}={}){
  if(!object||(typeof object!=='object'&&typeof object!=='function'))return;
  let keys=watched.get(object);if(keys?.has(key))return;keys??=new Set();keys.add(key);watched.set(object,keys);
  const restore=subscribe(object,key,{enter(receiver,args){const extra=enter?.(receiver,args);return{extra,stage:enterStage(typeof name==='function'?name(receiver,args):name)};},leave(token,result,threw,receiver,args){leaveStage(token?.stage);leave?.(token?.extra,result,threw,receiver,args);}});
  if(restore)undo.push(restore);else unmeasured.push(key);
 }
 const resourceState=()=>({size:rig?.size??null,cells:rig?.batch?.items?.length??null,atlasWidth:rig?.renderer?.domElement?.width??null,atlasHeight:rig?.renderer?.domElement?.height??null,exactGPUAlphaBounds:!!rig?.exactGPUAlphaBounds,minGPUAlphaCells:rig?.minGPUAlphaCells??null,helperRawBytes:rig?.gpuAlphaBounds?.rawBytes??0,gpuColourWidth:rig?.gpuRaw?.width??0,gpuColourHeight:rig?.gpuRaw?.height??0});
 function contextLabel(context,key){
  if(context===rig?.rawContext)return{drawImage:'cpuSurface.copy',getImageData:'cpuSurface.readPixels',clearRect:'cpuSurface.clear'}[key];
  if(context===rig?.gpuRawContext)return{drawImage:'gpuColour.copy',clearRect:'gpuColour.clear'}[key];
  if(context===rig?.inkContext)return{drawImage:'private.inkCopy',clearRect:'private.inkClear',fillRect:'private.inkTint'}[key];
  const actor=finishActors.at(-1),output=actor&&rig?.frames?.get?.(actor)?.context;
  if(context===output)return{drawImage:'private.outputCopy',clearRect:'private.outputClear'}[key];
  return null;
 }
 function watchContext(context){
  if(!context)return;
  for(const key of ['drawImage','getImageData','clearRect','fillRect']){
   if(contextPrototypes.some(prototype=>context[key]===prototype[key]))continue;
   observe(context,key,{name:receiver=>contextLabel(receiver,key)});
  }
 }
 function watchContexts(){
  for(const context of [rig?.rawContext,rig?.gpuRawContext,rig?.inkContext])watchContext(context);
  for(const slot of rig?.framePool?.slots||[])watchContext(slot.context);
 }
 function readObserver(){return{name:receiver=>receiver===rig?.gpuAlphaBounds?'gpuAlpha.read':null,enter(receiver){if(receiver!==rig?.gpuAlphaBounds)return false;watchHelper(receiver);gpuReadDepth++;return true;},leave(entered){if(entered)gpuReadDepth--;}};}
 function watchHelper(helper){
  if(!helper)return;
  // The temporary prototype dispatcher captures the first lazily constructed
  // helper. Custom/own read implementations are measured on their instance.
  if(helper.read!==GPUAlphaBounds.prototype.read)observe(helper,'read',readObserver());
  observe(helper,'prepare',{name:'gpuAlpha.prepare'});observe(helper,'dispose',{name:'gpuAlpha.dispose'});
 }
 function watchGL(gl){observe(gl,'getError',{name:()=>gpuReadDepth?'gpuAlpha.getError':null});}
 function install(){
  observe(GPUAlphaBounds.prototype,'read',readObserver());
  for(const prototype of [globalThis.CanvasRenderingContext2D?.prototype,globalThis.OffscreenCanvasRenderingContext2D?.prototype]){
   if(!prototype||contextPrototypes.includes(prototype))continue;contextPrototypes.push(prototype);
   for(const key of ['drawImage','getImageData','clearRect','fillRect'])observe(prototype,key,{name:receiver=>contextLabel(receiver,key)});
  }
  observe(rig,'exactAlphaSurface',{name:'native.exactAlphaSurface',enter(){watchHelper(rig.gpuAlphaBounds);watchContexts();},leave(){watchHelper(rig.gpuAlphaBounds);watchContexts();}});
  observe(rig,'gpuSurface',{name:'gpuColour.surface',enter:watchContexts,leave:watchContexts});
  observe(rig,'readSurface',{name:'cpuSurface.surface',enter:watchContexts});
  observe(rig,'finishFrame',{name:'private.finishFrame',enter(receiver,args){const actor=args[0]?.actor;finishActors.push(actor);watchContexts();watchContext(actor&&rig.frames?.get?.(actor)?.context);},leave(){finishActors.pop();}});
  observe(rig,'beginBatch',{name:'native.beginBatch',leave:watchContexts});
  observe(rig?.framePool,'reserve',{leave:watchContexts});observe(rig?.framePool,'claim',{leave(token,result){watchContext(result?.context);}});
  const renderer=rig?.renderer;
  observe(renderer,'getContext',{leave(token,result,threw){if(!threw)watchGL(result);}});
  observe(renderer,'render',{name(receiver,args){if(!gpuReadDepth)return'native.glSubmit';const helper=rig.gpuAlphaBounds;if(args[0]!==helper?.scene)return'gpuAlpha.otherSubmit';const material=helper.mesh?.material;return material===helper.rowMaterial?'gpuAlpha.rowsSubmit':material===helper.boundsMaterial?'gpuAlpha.boundsSubmit':'gpuAlpha.otherSubmit';}});
  observe(renderer,'copyFramebufferToTexture',{name:()=>gpuReadDepth?'gpuAlpha.framebufferCopy':null});
  observe(renderer,'readRenderTargetPixels',{name:()=>gpuReadDepth?'gpuAlpha.readPixels':null});
  observe(renderer,'setSize',{name:'native.resize'});
  for(const key of ['setRenderTarget','setViewport','setScissor','setScissorTest'])observe(renderer,key,{name:()=>gpuReadDepth?'gpuAlpha.stateCalls':null});
  watchHelper(rig?.gpuAlphaBounds);watchContexts();
 }
 if(enabled)install();
 function beginFrame(meta={}){
  if(!enabled||stopped)return null;if(current)throw Error('native-frame-profile-frame-already-open');
  current={...meta,stages:{},resourcesBefore:resourceState()};current.startCpu=clock();return current;
 }
 function endFrame(meta={}){
  if(!current)return null;const frame=current,end=clock();current=null;
  const start=frame.startCpu;delete frame.startCpu;Object.assign(frame,meta);frame.frameCpuMs=start!==null&&end!==null?Math.max(0,end-start):0;frame.resourcesAfter=resourceState();samples.push(frame);return frame;
 }
 function stop(){if(stopped)return{enabled,samples,unmeasured,note:NATIVE_FRAME_PROFILE_NOTE};stopped=true;current=null;for(const restore of undo.reverse())restore();return{enabled,samples,unmeasured,note:NATIVE_FRAME_PROFILE_NOTE};}
 return{beginFrame,endFrame,samples,unmeasured,stop,note:NATIVE_FRAME_PROFILE_NOTE};
}
