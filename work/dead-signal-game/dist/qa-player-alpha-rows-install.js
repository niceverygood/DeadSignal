import {LivePlayerRig} from './player-rig/live-player.js';
import {PlayerAlphaRows,decodePlayerAlphaRows} from './qa-player-alpha-rows.js';
import {nativeAlphaBounds} from './native-alpha-bounds.js';
import {bodyIdentificationContour} from './production-art.js?v=0.29.0';

// This installer is used only by a separately gated, owned QA player. The
// original raster function still performs every pose, draw and colour copy.
const APPLY=Reflect.apply,DESC=Object.getOwnPropertyDescriptor,PROTO=Object.getPrototypeOf;
const RASTER=LivePlayerRig.prototype.rasterFrame,RASTER_DESCRIPTOR=DESC(LivePlayerRig.prototype,'rasterFrame');
const SIZE=256,MASK_BYTES=SIZE*SIZE*4,ROW_BYTES=SIZE*4;
// Original cf5c5721... player-live-before.txt: only a source-consumer guard,
// not a cryptographic quality proof. No raster implementation is copied here.
const EXPECTED_RASTER_FINGERPRINT='eb5f9c06';
const own=(object,key)=>{const d=object&&DESC(object,key);return d&&'value'in d?d.value:undefined;};
const equalDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&['value','get','set','writable','enumerable','configurable'].every(key=>Object.hasOwn(a,key)===Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
const message=error=>{try{return String(error?.message??error).slice(0,240);}catch{return'player-alpha-rows-error';}};
const fingerprint=fn=>{let hash=2166136261;const source=Function.prototype.toString.call(fn).trim().replace(/\r\n/g,'\n');for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),16777619)>>>0;return hash.toString(16).padStart(8,'0');};
function resolveData(object,key){for(let at=object,depth=0;at&&depth<24;at=PROTO(at),depth++){const d=DESC(at,key);if(d)return'value'in d?{owner:at,descriptor:d,value:d.value}:null;}return null;}
const note='QA-owned fresh player only. The unchanged original rasterFrame is called once; only its one exact256-square pre-weapon getImageData consumer receives a reusable sparse alpha8 endpoint mask. The mask is never drawn or substituted for original body/colour canvases. GPU row bytes preserve alpha8 bounds and open torso contour, not every original alpha value. verify=true intentionally performs one additional original same-frame Canvas read and is quality-only, not a speed comparison. Timings include synchronous GPU wait and installer overhead, not GPU duration/FPS/peak memory. Custom, repeated, reentrant or changed-owner reads fall back and block acceptance. No caller model, texture, canvas or renderer is disposed.';

export function installPlayerAlphaRows(player,{enabled=false,verify=false}={}){
 enabled=enabled===true;verify=verify===true;
 let available=false,stopped=false,reason=enabled?'not-installed':'control',helper=null,context=null,renderer=null,body=null,surface=null;
 let originalRead=null,readOwner=null,readDescriptor=null,playerBefore=null,playerExpected=null,contextBefore=null,contextExpected=null;
 let installed=false,contextInstalled=false,activeCall=null,bypassDepth=0,mask=null,maskResult=null;
 let methodRestored=false,contextRestored=true,cleanupComplete=false,stopPending=false,lastError='';
 const counts={rasterCalls:0,used:0,reads:0,bytesRead:0,fallbacks:0,unexpectedCalls:0,ownerMismatchCalls:0,reentrantCalls:0,peakCpuMaskBytes:0};
 const verification={calls:0,rowDifferences:0,boundsDifferences:0,contourDifferences:0};
 const cleanupErrors=[];let helperState={capacity:0,ownedResources:0,rawTargetBytes:0};
 const add=(key,n=1)=>{counts[key]=Math.min(Number.MAX_SAFE_INTEGER,counts[key]+n);};
 const error=(where,cause)=>{lastError=message(cause);if(cleanupErrors.length<8)cleanupErrors.push({where,error:lastError});};
 function helperReport(){if(!helper)return;try{const state=helper.report();helperState={capacity:state.capacity??0,ownedResources:state.ownedResources??0,rawTargetBytes:state.rawTargetBytes??0};}catch(cause){error('helper.report',cause);}}
 function report(){helperReport();return{enabled,verify,available,stopped,reason,...counts,verification:{...verification},cpuMaskBytes:mask?.byteLength??0,lastReadBytes:counts.reads?ROW_BYTES:0,helperCapacity:helperState.capacity,helperOwnedResources:helperState.ownedResources,helperRawTargetBytes:helperState.rawTargetBytes,methodRestored,contextRestored,cleanupComplete,stopPending,lastError,cleanupErrors:cleanupErrors.map(item=>({...item})),note};}
 function restore(object,key,expected,before){
  try{const current=DESC(object,key);if(equalDescriptor(current,before))return true;if(!equalDescriptor(current,expected))return false;if(before)Object.defineProperty(object,key,before);else delete object[key];return equalDescriptor(DESC(object,key),before);}catch(cause){error(key+'.restore',cause);return false;}
 }
 function restoreRead(){if(!contextInstalled)return contextRestored;contextRestored=restore(context,'getImageData',contextExpected,contextBefore);contextInstalled=false;return contextRestored;}
 function release(){
  let disposed=true;
  if(helper){try{helper.dispose();}catch(cause){disposed=false;error('helper.dispose',cause);}helperReport();}
  cleanupComplete=methodRestored&&contextRestored&&disposed&&cleanupErrors.length===0&&helperState.capacity===0&&helperState.ownedResources===0&&helperState.rawTargetBytes===0;
  helper=mask=maskResult=player=context=renderer=body=surface=originalRead=readOwner=readDescriptor=playerBefore=playerExpected=contextBefore=contextExpected=null;stopPending=false;
 }
 function stop(){
  if(!stopped){stopped=true;if(activeCall)activeCall.invalid=true;methodRestored=!installed||restore(player,'rasterFrame',playerExpected,playerBefore);installed=false;restoreRead();}
  if(activeCall){stopPending=true;return report();}
  if(!cleanupComplete&&player!==null)release();return report();
 }
 function current(){
  try{return !stopped&&PROTO(player)===LivePlayerRig.prototype&&equalDescriptor(DESC(LivePlayerRig.prototype,'rasterFrame'),RASTER_DESCRIPTOR)&&equalDescriptor(DESC(player,'rasterFrame'),playerExpected)&&own(player,'ready')===true&&own(player,'error')==null&&own(player,'renderer')===renderer&&own(player,'body')===body&&own(player,'bodyContext')===context&&own(player,'directAlphaReadback')===false&&own(player,'verifyAlphaReadback')===false&&own(renderer,'domElement')===surface&&equalDescriptor(DESC(readOwner,'getImageData'),readOwner===context&&contextInstalled?contextExpected:readDescriptor)&&equalDescriptor(DESC(context,'getImageData'),contextInstalled?contextExpected:contextBefore);}catch{return false;}
 }
 function mismatch(){available=false;reason='owner-or-method-changed';add('ownerMismatchCalls');add('fallbacks');if(activeCall)activeCall.invalid=true;}
 function legacy(receiver,args,read){return APPLY(read,receiver,args);}
 function verifyRows(bytes,pixels){
  verification.calls++;
  if(!pixels||pixels.length!==MASK_BYTES)throw Error('player-alpha-rows-original-mask-shape');
  let different=0;
  for(let y=0;y<SIZE;y++){
   const start=y*SIZE*4;let left=0;while(left<SIZE&&pixels[start+left*4+3]<8)left++;
   let right=SIZE-1;if(left===SIZE){left=255;right=0;}else while(right>left&&pixels[start+right*4+3]<8)right--;
   if(bytes[y*4]!==left||bytes[y*4+1]!==right||bytes[y*4+2]!==0||bytes[y*4+3]!==255)different++;
  }
  verification.rowDifferences+=different;
  const decoded=decodePlayerAlphaRows(bytes),bounds=nativeAlphaBounds(pixels,SIZE,SIZE)||{x:SIZE,y:SIZE,width:1,height:1},core={x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height*.72};
  const synthetic=nativeAlphaBounds(mask,SIZE,SIZE)||{x:SIZE,y:SIZE,width:1,height:1},syntheticCore={x:synthetic.x,y:synthetic.y,width:synthetic.width,height:synthetic.height*.72};
  if(!decoded||JSON.stringify(decoded.alphaBounds)!==JSON.stringify(bounds)||JSON.stringify(decoded.coreBounds)!==JSON.stringify(core)||JSON.stringify(synthetic)!==JSON.stringify(bounds)||JSON.stringify(syntheticCore)!==JSON.stringify(core))verification.boundsDifferences++;
  const contour=bodyIdentificationContour(pixels,SIZE,SIZE,bounds,core),syntheticContour=bodyIdentificationContour(mask,SIZE,SIZE,synthetic,syntheticCore);
  if(!decoded||JSON.stringify(decoded.bodyIdentificationContour)!==JSON.stringify(contour)||JSON.stringify(syntheticContour)!==JSON.stringify(contour))verification.contourDifferences++;
  if(different||verification.boundsDifferences||verification.contourDifferences)throw Error('player-alpha-rows-verification-mismatch');
 }
 function makeRead(fallback){return function read(...args){
  const scope=activeCall;
  if(!scope||stopped||bypassDepth||this!==context){add('fallbacks');return legacy(this,args,fallback);}
  scope.calls++;
  if(scope.calls!==1||args.length!==4||args[0]!==0||args[1]!==0||args[2]!==SIZE||args[3]!==SIZE){add('unexpectedCalls');add('fallbacks');scope.invalid=true;return legacy(this,args,fallback);}
  if(scope.invalid||!current()){mismatch();return legacy(this,args,fallback);}
  let bytes;
  try{bytes=helper.read(renderer);}catch(cause){lastError=message(cause);add('fallbacks');return legacy(this,args,fallback);}
  if(stopped||scope.invalid||!current()){if(!stopped)mismatch();else add('fallbacks');return legacy(this,args,fallback);}
  if(!(bytes instanceof Uint8Array)||bytes.length!==ROW_BYTES){add('fallbacks');lastError='player-alpha-rows-read-unavailable';return legacy(this,args,fallback);}
  add('reads');add('bytesRead',ROW_BYTES);
  let invalidEndpoints=false;
  try{
   if(!mask){mask=new Uint8ClampedArray(MASK_BYTES);maskResult=Object.freeze({data:mask});counts.peakCpuMaskBytes=MASK_BYTES;}
   mask.fill(0);
   for(let y=0;y<SIZE;y++){
    const index=y*4,left=bytes[index],right=bytes[index+1];
    if(bytes[index+2]!==0||bytes[index+3]!==255||left>right&&(left!==255||right!==0)){invalidEndpoints=true;break;}
    if(left<=right){const row=y*SIZE*4;mask[row+left*4+3]=8;mask[row+right*4+3]=8;}
   }
  }catch(cause){lastError=message(cause);add('fallbacks');return legacy(this,args,fallback);}
  if(invalidEndpoints){add('fallbacks');lastError='player-alpha-rows-invalid-endpoints';return legacy(this,args,fallback);}
  if(verify){const original=legacy(this,args,fallback);verifyRows(bytes,original.data);}
  if(stopped||scope.invalid||!current()){if(!stopped)mismatch();else add('fallbacks');return legacy(this,args,fallback);}
  add('used');return maskResult;
 };}
 function raster(...args){
  if(stopped)return APPLY(RASTER,this,args);
  add('rasterCalls');
  if(activeCall||this!==player||!available||!current()){
   if(activeCall){add('reentrantCalls');activeCall.invalid=true;add('fallbacks');}else mismatch();
   bypassDepth++;try{return APPLY(RASTER,this,args);}finally{bypassDepth--;}
  }
  const scope={calls:0,invalid:false};activeCall=scope;
  try{
   try{Object.defineProperty(context,'getImageData',contextExpected);contextInstalled=true;contextRestored=false;}catch(cause){lastError=message(cause);add('fallbacks');scope.invalid=true;}
   return APPLY(RASTER,this,args);
  }finally{
   if(!scope.invalid&&scope.calls!==1){add('unexpectedCalls');add('fallbacks');available=false;reason='original-single-read-required';}
   restoreRead();activeCall=null;
   if(stopped)release();
  }
 }
 const handle={report,stop,dispose:stop};
 if(!enabled){player=null;available=true;methodRestored=true;cleanupComplete=true;return handle;}
 try{
  if(!player||PROTO(player)!==LivePlayerRig.prototype||!equalDescriptor(DESC(LivePlayerRig.prototype,'rasterFrame'),RASTER_DESCRIPTOR)||fingerprint(RASTER)!==EXPECTED_RASTER_FINGERPRINT)throw Error('player-alpha-rows-original-raster-required');
  playerBefore=DESC(player,'rasterFrame');if(playerBefore&&(!('value'in playerBefore)||playerBefore.value!==RASTER))throw Error('player-alpha-rows-existing-raster-override');
  renderer=own(player,'renderer');body=own(player,'body');context=own(player,'bodyContext');surface=own(renderer,'domElement');
  if(own(player,'ready')!==true||own(player,'error')!=null||own(player,'last')!==null||own(player,'directAlphaReadback')!==false||own(player,'verifyAlphaReadback')!==false||own(own(own(renderer,'info'),'render'),'frame')!==0||!context||body?.width!==SIZE||body?.height!==SIZE||surface?.width!==SIZE||surface?.height!==SIZE)throw Error('player-alpha-rows-fresh-original-player-required');
  const resolved=resolveData(context,'getImageData');if(!resolved||typeof resolved.value!=='function')throw Error('player-alpha-rows-original-body-reader-required');
  originalRead=resolved.value;readOwner=resolved.owner;readDescriptor=resolved.descriptor;contextBefore=DESC(context,'getImageData');
  const read=makeRead(originalRead);contextExpected=contextBefore?{...contextBefore,value:read}:{value:read,writable:true,configurable:true,enumerable:false};
  if(contextBefore&&contextBefore.configurable===false&&contextBefore.writable!==true)throw Error('player-alpha-rows-body-reader-not-shadowable');
  helper=new PlayerAlphaRows();
  playerExpected=playerBefore?{...playerBefore,value:raster}:{value:raster,writable:true,configurable:true,enumerable:false};
  Object.defineProperty(player,'rasterFrame',playerExpected);installed=true;available=true;reason='installed';
 }catch(cause){lastError=message(cause);reason=lastError;stop();}
 return handle;
}
