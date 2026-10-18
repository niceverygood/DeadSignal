import {LivePlayerRig} from './player-rig/live-player.js';
import {LivePlayerRig as DeferredPlayerRig} from './player-rig/qa-live-player-deferred.js';
import * as THREE from './player-rig/vendor/three.module.js';

const APPLY=Reflect.apply,DESC=Object.getOwnPropertyDescriptor,PROTO=Object.getPrototypeOf,SOURCE=Function.prototype.toString;
const RASTER=LivePlayerRig.prototype.rasterFrame,DEFERRED=DeferredPlayerRig.prototype.rasterFrame;
const ORIGINAL_DESCRIPTOR=DESC(LivePlayerRig.prototype,'rasterFrame'),DEFERRED_DESCRIPTOR=DESC(DeferredPlayerRig.prototype,'rasterFrame');
const SIZE=256,RGBA_BYTES=SIZE*SIZE*4,EXPECTED_ORIGINAL='eb5f9c06',EXPECTED_DEFERRED='7964b30a',EXPECTED_RENDER='5f756eb1';
const METHODS=['getImageData','drawImage','clearRect','fillRect'],PROPERTIES=['globalCompositeOperation','fillStyle'];
const own=(object,key)=>{const d=object&&DESC(object,key);return d&&'value'in d?d.value:undefined;};
const same=(a,b)=>!a&&!b||!!a&&!!b&&['value','get','set','writable','enumerable','configurable'].every(key=>Object.hasOwn(a,key)===Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
const text=fn=>APPLY(SOURCE,fn,[]);
function fingerprint(fn){let hash=2166136261;const value=text(fn).trim().replace(/\r\n/g,'\n');for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619)>>>0;return hash.toString(16).padStart(8,'0');}
const native=fn=>typeof fn==='function'&&/\{\s*\[native code\]\s*\}/.test(text(fn));
const message=error=>{try{return String(error?.message??error).slice(0,240);}catch{return'player-deferred-read-error';}};
const note='QA-only successful native-Canvas path; the original player module is unchanged. The full same-folder candidate only relocates the original direct/legacy read and bounds/core block after armed rendering and colour composition, before metadata/frame spreads. The installer permits the candidate only when both own directAlphaReadback and verifyAlphaReadback flags are false; direct use of the candidate class is unsupported. Direct/verification modes, custom methods and changed owners use the whole original raster. Successful colour/body/bounds/contour equivalence requires separate actual quality evidence. Universal exception/order equivalence is not claimed: a deferred body-read error follows armed/compositor work, and an armed/compositor error can occur before that read. An already-started candidate is never retried through the original. Critical Canvas methods and ink write accessors are checked without invoking custom getters. Mutation of global ImageData/HTMLCanvas accessors or Three render-graph prototypes/callbacks is outside this native-successful-path contract. Original owned assets/scene callbacks must not mutate the frozen body canvas during the call; no per-frame whole-scene traversal certifies arbitrary foreign callbacks. No clocks, poses, skins, model data, assets or saves are advanced here. verify=true is quality-only Aoriginal/Bdeferred/Aoriginal, with six GL renders instead of two plus six explicit native Canvas captures; it returns the final original output and is never a performance pass. Whole-scene A/A quality gates remain independent. Source FNV guards are consumer guards, not cryptographic provenance. No caller GPU or asset resource is owned or disposed.';

function nativeCanvasAPI(){
 const constructor=own(globalThis,'CanvasRenderingContext2D'),prototype=own(constructor,'prototype');
 if(!native(constructor)||!prototype)return null;
 const getter=DESC(prototype,'canvas')?.get,methods={};if(!native(getter))return null;
 for(const key of METHODS){const d=DESC(prototype,key);if(!d||!('value'in d)||!native(d.value))return null;methods[key]=d.value;}
 for(const key of PROPERTIES){const d=DESC(prototype,key);if(!d||!native(d.get)||!native(d.set))return null;}
 return {contextPrototype:prototype,canvasGetter:getter,methods,rendererPrototype:THREE.WebGLRenderer.prototype,render:null};
}
function pixelDifference(a,b){
 if(!(a instanceof Uint8ClampedArray)||!(b instanceof Uint8ClampedArray)||a.length!==RGBA_BYTES||b.length!==RGBA_BYTES)throw Error('player-deferred-read-quality-rgba-shape');
 let different=0,maxDelta=0;for(let i=0;i<RGBA_BYTES;i++){const delta=Math.abs(a[i]-b[i]);if(delta){different++;if(delta>maxDelta)maxDelta=delta;}}return {different,maxDelta};
}

export function installPlayerDeferredRead(player,{enabled=false,verify=false,canvasAPI}={}){
 enabled=enabled===true;verify=enabled&&verify===true;const injected=enabled&&canvasAPI!==undefined;
 let available=false,stopped=false,installed=false,reason=enabled?'not-installed':'control',before=null,expected=null;
 let renderer=null,surface=null,scene=null,camera=null,contexts=null,api=null,renderDescriptor=null,activeCall=null,bypassDepth=0;
 let methodRestored=false,cleanupComplete=false,stopPending=false,lastError='',originalFingerprint=null,deferredFingerprint=null,renderFingerprint=null;
 const counts={rasterCalls:0,used:0,fallbacks:0,unexpectedCalls:0,ownerMismatchCalls:0,reentrantCalls:0,flagFallbackCalls:0,originalCalls:0,thrownCalls:0};
 const verification={calls:0,passed:true,colourDifferences:0,bodyDifferences:0,metadataDifferences:0,originalRepeatColourDifferences:0,originalRepeatBodyDifferences:0,originalRepeatMetadataDifferences:0,maxColourDelta:0,maxBodyDelta:0,lastComparison:null};
 const cleanupErrors=[];
 const add=key=>{counts[key]=Math.min(Number.MAX_SAFE_INTEGER,counts[key]+1);};
 function report(){
  const errors=cleanupErrors.map(item=>({...item}));
  return {enabled,verify,injected,available,stopped,reason,...counts,methodRestored,cleanupComplete,stopPending,lastError,originalFingerprint,deferredFingerprint,renderFingerprint,
   verification:{...verification,lastComparison:verification.lastComparison?{...verification.lastComparison}:null},cleanupErrors:errors,cleanup:{complete:cleanupComplete,methodRestored,stopPending,errors},note};
 }
 function restore(){
  try{const current=DESC(player,'rasterFrame');if(same(current,before))return true;if(!same(current,expected))return false;if(before)Object.defineProperty(player,'rasterFrame',before);else delete player.rasterFrame;return same(DESC(player,'rasterFrame'),before);}
  catch(error){lastError=message(error);if(cleanupErrors.length<8)cleanupErrors.push({where:'rasterFrame.restore',error:lastError});return false;}
 }
 function release(){
  cleanupComplete=methodRestored&&cleanupErrors.length===0;stopPending=false;
  player=renderer=surface=scene=camera=contexts=api=renderDescriptor=before=expected=canvasAPI=null;
 }
 function stop(){
  if(!stopped){stopped=true;if(activeCall)activeCall.invalid=true;methodRestored=!installed||restore();installed=false;}
  if(activeCall){stopPending=true;return report();}release();return report();
 }
 function contextCurrent(record){
  if(PROTO(record.context)!==api.contextPrototype||record.canvas.width!==SIZE||record.canvas.height!==SIZE)return false;
  for(const key of METHODS){if(DESC(record.context,key)||!same(DESC(api.contextPrototype,key),record.methods[key]))return false;}
  for(const key of PROPERTIES){if(DESC(record.context,key)||!same(DESC(api.contextPrototype,key),record.properties[key]))return false;}
  return same(DESC(api.contextPrototype,'canvas'),record.canvasDescriptor);
 }
 function current(){
  try{return !stopped&&PROTO(player)===LivePlayerRig.prototype&&same(DESC(LivePlayerRig.prototype,'rasterFrame'),ORIGINAL_DESCRIPTOR)&&same(DESC(DeferredPlayerRig.prototype,'rasterFrame'),DEFERRED_DESCRIPTOR)
   &&same(DESC(player,'rasterFrame'),expected)&&own(player,'ready')===true&&own(player,'error')==null&&own(player,'renderer')===renderer&&own(renderer,'domElement')===surface
   &&own(player,'scene')===scene&&own(player,'camera')===camera&&surface.width===SIZE&&surface.height===SIZE&&PROTO(renderer)===api.rendererPrototype&&same(DESC(renderer,'render'),renderDescriptor)
   &&contexts.every(record=>own(player,record.contextKey)===record.context&&own(player,record.canvasKey)===record.canvas&&contextCurrent(record));}catch{return false;}
 }
 function mismatch(fallback=true){available=false;reason='owner-or-method-changed';add('ownerMismatchCalls');if(fallback)add('fallbacks');if(activeCall)activeCall.invalid=true;}
 function original(receiver,args){add('originalCalls');bypassDepth++;try{return APPLY(RASTER,receiver,args);}finally{bypassDepth--;}}
 function deferred(receiver,args){add('used');return APPLY(DEFERRED,receiver,args);}
 function capture(selected){
  if(!current()||activeCall?.invalid)throw Error('player-deferred-read-quality-owner-changed');
  const colour=APPLY(api.methods.getImageData,contexts[1].context,[0,0,SIZE,SIZE]).data,body=APPLY(api.methods.getImageData,contexts[0].context,[0,0,SIZE,SIZE]).data;
  if(!(colour instanceof Uint8ClampedArray)||!(body instanceof Uint8ClampedArray)||colour.length!==RGBA_BYTES||body.length!==RGBA_BYTES)throw Error('player-deferred-read-quality-rgba-shape');
  const metadata=JSON.stringify({id:selected.id,metadata:selected.metadata,frame:selected.frame,locomotion:selected.locomotion});
  if(!current()||activeCall?.invalid)throw Error('player-deferred-read-quality-owner-changed');return {colour,body,metadata};
 }
 function quality(receiver,args){
  verification.calls++;verification.passed=false;
  const a=capture(original(receiver,args)),b=capture(deferred(receiver,args)),result=original(receiver,args),again=capture(result);
  const cab=pixelDifference(a.colour,b.colour),caa=pixelDifference(a.colour,again.colour),cba=pixelDifference(b.colour,again.colour);
  const bab=pixelDifference(a.body,b.body),baa=pixelDifference(a.body,again.body),bba=pixelDifference(b.body,again.body);
  const mab=Number(a.metadata!==b.metadata),maa=Number(a.metadata!==again.metadata),mba=Number(b.metadata!==again.metadata);
  verification.colourDifferences+=cab.different+caa.different+cba.different;verification.bodyDifferences+=bab.different+baa.different+bba.different;verification.metadataDifferences+=mab+maa+mba;
  verification.originalRepeatColourDifferences+=caa.different;verification.originalRepeatBodyDifferences+=baa.different;verification.originalRepeatMetadataDifferences+=maa;
  verification.maxColourDelta=Math.max(verification.maxColourDelta,cab.maxDelta,caa.maxDelta,cba.maxDelta);verification.maxBodyDelta=Math.max(verification.maxBodyDelta,bab.maxDelta,baa.maxDelta,bba.maxDelta);
  verification.lastComparison={colourAB:cab.different,colourAA:caa.different,colourBA:cba.different,bodyAB:bab.different,bodyAA:baa.different,bodyBA:bba.different,metadataAB:mab,metadataAA:maa,metadataBA:mba};
  verification.passed=verification.colourDifferences===0&&verification.bodyDifferences===0&&verification.metadataDifferences===0;
  if(!verification.passed){lastError='player-deferred-read-verification-mismatch';throw Error(lastError);}return result;
 }
 function raster(...args){
  if(stopped)return APPLY(RASTER,this,args);
  add('rasterCalls');
  if(activeCall||bypassDepth){add('reentrantCalls');add('unexpectedCalls');add('fallbacks');if(activeCall)activeCall.invalid=true;return original(this,args);}
  if(this!==player){add('unexpectedCalls');add('ownerMismatchCalls');add('fallbacks');return original(this,args);}
  if(!available||!current()){mismatch();return original(this,args);}
  if(own(player,'directAlphaReadback')!==false||own(player,'verifyAlphaReadback')!==false){add('flagFallbackCalls');add('fallbacks');return original(this,args);}
  if(args.length!==5||!args[4]||typeof args[4]!=='object'){add('unexpectedCalls');add('fallbacks');return original(this,args);}
  activeCall={invalid:false};
  try{const result=verify?quality(this,args):deferred(this,args);if(!stopped&&!current())mismatch(false);return result;}
  catch(error){add('thrownCalls');if(verify)verification.passed=false;if(!lastError)lastError='raster-call-threw';throw error;}
  finally{activeCall=null;if(stopped)release();}
 }
 const handle={report,stop,dispose:stop};
 if(!enabled){player=canvasAPI=null;available=true;methodRestored=true;cleanupComplete=true;return handle;}
 try{
  if(!player||PROTO(player)!==LivePlayerRig.prototype||!same(DESC(LivePlayerRig.prototype,'rasterFrame'),ORIGINAL_DESCRIPTOR)||!same(DESC(DeferredPlayerRig.prototype,'rasterFrame'),DEFERRED_DESCRIPTOR))throw Error('player-deferred-read-original-raster-required');
  originalFingerprint=fingerprint(RASTER);deferredFingerprint=fingerprint(DEFERRED);
  if(originalFingerprint!==EXPECTED_ORIGINAL||deferredFingerprint!==EXPECTED_DEFERRED)throw Error('player-deferred-read-raster-source-changed');
  before=DESC(player,'rasterFrame');if(before&&(!('value'in before)||before.value!==RASTER))throw Error('player-deferred-read-existing-raster-override');
  renderer=own(player,'renderer');surface=own(renderer,'domElement');scene=own(player,'scene');camera=own(player,'camera');
  if(own(player,'ready')!==true||own(player,'error')!=null||own(player,'last')!==null||own(own(own(renderer,'info'),'render'),'frame')!==0||!surface||surface.width!==SIZE||surface.height!==SIZE||!scene||!camera)throw Error('player-deferred-read-fresh-original-player-required');
  api=injected?canvasAPI:nativeCanvasAPI();
  const prototype=own(api,'contextPrototype'),getter=own(api,'canvasGetter'),methods=own(api,'methods'),rendererPrototype=own(api,'rendererPrototype'),expectedRender=own(api,'render');
  if(!prototype||typeof getter!=='function'||!methods||!rendererPrototype||PROTO(renderer)!==rendererPrototype)throw Error('player-deferred-read-native-canvas-api-required');
  for(const key of METHODS){const d=DESC(prototype,key);if(!d||!('value'in d)||typeof d.value!=='function'||d.value!==own(methods,key))throw Error('player-deferred-read-native-canvas-method-required');}
  if(DESC(prototype,'canvas')?.get!==getter)throw Error('player-deferred-read-native-canvas-brand-required');
  renderDescriptor=DESC(renderer,'render');if(!renderDescriptor||!('value'in renderDescriptor)||typeof renderDescriptor.value!=='function')throw Error('player-deferred-read-original-render-required');
  renderFingerprint=fingerprint(renderDescriptor.value);
  if(injected?renderDescriptor.value!==expectedRender:renderFingerprint!==EXPECTED_RENDER)throw Error('player-deferred-read-wrapped-render-unsupported');
  contexts=[['bodyContext','body'],['context','canvas'],['inkContext','ink']].map(([contextKey,canvasKey])=>{
   const context=own(player,contextKey),canvas=own(player,canvasKey);
   if(!context||!canvas||PROTO(context)!==prototype||canvas.width!==SIZE||canvas.height!==SIZE||APPLY(getter,context,[])!==canvas)throw Error('player-deferred-read-original-private-context-required');
   const record={contextKey,canvasKey,context,canvas,methods:{},properties:{},canvasDescriptor:DESC(prototype,'canvas')};
   for(const key of METHODS){if(DESC(context,key))throw Error('player-deferred-read-own-canvas-method-unsupported');record.methods[key]=DESC(prototype,key);}
   for(const key of PROPERTIES){const d=DESC(prototype,key);if(DESC(context,key)||!d||'value'in d||typeof d.get!=='function'||typeof d.set!=='function')throw Error('player-deferred-read-own-or-custom-ink-property-unsupported');record.properties[key]=d;}return record;
  });
  // Keep only the checked primitive/function/prototype records, not an input
  // options object which might also reference a caller's Game or other owners.
  api={contextPrototype:prototype,canvasGetter:getter,rendererPrototype,methods:Object.fromEntries(METHODS.map(key=>[key,own(methods,key)]))};canvasAPI=null;
  expected=before?{...before,value:raster}:{value:raster,writable:true,configurable:true,enumerable:false};
  installed=true;Object.defineProperty(player,'rasterFrame',expected);available=true;reason='installed';
 }catch(error){lastError=message(error);reason=lastError;stop();}
 return handle;
}
