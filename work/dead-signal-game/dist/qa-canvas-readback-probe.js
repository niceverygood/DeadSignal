const APPLY=Reflect.apply,OWN=Object.getOwnPropertyDescriptor,PROTO=Object.getPrototypeOf;
const FUNCTION_SOURCE=Function.prototype.toString;
const MAP_KEYS=Map.prototype.keys,MAP_SIZE=OWN(Map.prototype,'size').get;
const SET_VALUES=Set.prototype.values,SET_SIZE=OWN(Set.prototype,'size').get,WEAK_GET=WeakMap.prototype.get;
const MAIN_WIDTH=960,MAIN_HEIGHT=640,FLOOR_WIDTH=2400,FLOOR_HEIGHT=1800;

export const ORIGINAL_READBACK_NOTE='QA-owned original Renderer read diagnostic only. R0 is the caller\'s previously captured main RGBA array. R1 is read before hashes, metadata or Canvas state inspection; a differing R1 stops before any floor observation or R2. If requested, F reads the original source-created, already cached floor using getContext("2d") without options, then R2 reads the same main context. No tick, render, await, export, drawing, state setter, wrapper, new surface or asset is added. A floor read can itself materialize backing storage. Native function/brand observations and context attributes do not identify a GPU/backend or prove its behavior. State is inspected after the read sequence; no pre-read state snapshot or invisible clip/path equivalence is claimed. Hashes are bounded noncryptographic byte fingerprints, not source authenticity. This is neither a timing/performance acceptance nor presented FPS evidence. Any later PNG export is separate from R0 and cannot certify the exact R0 bytes.';

const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
function own(value,key){try{const d=object(value)?OWN(value,key):null;return d&&'value'in d?d.value:undefined;}catch{return undefined;}}
function method(value,key){try{for(let at=value,depth=0;object(at)&&depth<16;at=PROTO(at),depth++){const d=OWN(at,key);if(d)return 'value'in d&&typeof d.value==='function'?d.value:null;}}catch{}return null;}
function text(value,max=180){return typeof value==='string'?value.slice(0,max):null;}
function number(value){return typeof value==='number'&&Number.isFinite(value)?value:null;}
function primitive(value){return value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number'&&Number.isFinite(value);}
function bytes(value){return value instanceof Uint8Array||value instanceof Uint8ClampedArray;}
function nativeFunction(value){try{return typeof value==='function'&&/\{\s*\[native code\]\s*\}/.test(APPLY(FUNCTION_SOURCE,value,[]));}catch{return false;}}
function errorEntry(stage,error){return{stage,message:text(typeof error==='string'?error:own(error,'message'))||'diagnostic call failed',name:text(own(error,'name'),60)};}
function sizeOf(value,getter){try{return APPLY(getter,value,[]);}catch{return null;}}
function keysOf(value){const result=[];try{for(const key of APPLY(MAP_KEYS,value,[])){if(result.length===32)break;result.push(typeof key==='string'?key.slice(0,120):typeof key==='number'&&Number.isFinite(key)?key:null);}}catch{}return result;}
function fingerprint(value){if(!bytes(value))return null;let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value[i],16777619);return{algorithm:'fnv1a32-bytes',bytes:value.length,value:(hash>>>0).toString(16).padStart(8,'0')};}

function difference(a,b,width){
 const result={lengthA:a.length,lengthB:b.length,lengthEqual:a.length===b.length,components:0,pixels:0,maxDelta:0,alphaComponents:0,bounds:null,equal:false};
 if(!result.lengthEqual){result.components=null;result.pixels=null;result.maxDelta=null;result.alphaComponents=null;return result;}
 let minX=width,minY=a.length/(width*4),maxX=-1,maxY=-1;
 for(let at=0;at<a.length;at+=4){let changed=false;for(let channel=0;channel<4;channel++){const delta=Math.abs(a[at+channel]-b[at+channel]);if(!delta)continue;changed=true;result.components++;if(channel===3)result.alphaComponents++;if(delta>result.maxDelta)result.maxDelta=delta;}
  if(changed){result.pixels++;const index=at/4,x=index%width,y=Math.floor(index/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 }
 result.equal=result.components===0;if(result.pixels)result.bounds={x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1};return result;
}

function contextInfo(context,canvas,errors,label){
 const info={canvasIdentity:context.canvas===canvas,getImageDataNative:nativeFunction(method(context,'getImageData')),getContextAttributes:{supported:false,available:false,values:null},state:{},transform:null,clipPath:'not exposed; not inspected'};
 try{const C=globalThis.CanvasRenderingContext2D,H=globalThis.HTMLCanvasElement;info.contextPrototypeMatches=typeof C==='function'?PROTO(context)===C.prototype:null;info.canvasPrototypeMatches=typeof H==='function'?PROTO(canvas)===H.prototype:null;}catch{info.contextPrototypeMatches=null;info.canvasPrototypeMatches=null;}
 const attributes=method(context,'getContextAttributes');
 if(attributes){info.getContextAttributes.supported=true;info.getContextAttributes.native=nativeFunction(attributes);try{const value=APPLY(attributes,context,[]),values={};for(const key of ['alpha','colorSpace','colorType','pixelFormat','desynchronized','willReadFrequently']){const item=own(value,key);if(primitive(item))values[key]=typeof item==='string'?item.slice(0,80):item;}info.getContextAttributes.available=true;info.getContextAttributes.values=values;}catch(error){errors.push(errorEntry(label+'.getContextAttributes',error));}}
 for(const key of ['fillStyle','globalAlpha','globalCompositeOperation','imageSmoothingEnabled','imageSmoothingQuality','filter','shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY'])try{const value=context[key];info.state[key]=primitive(value)?typeof value==='string'?value.slice(0,120):value:null;if(key==='fillStyle')info.state.fillStyleKind=typeof value;}catch(error){info.state[key]=null;errors.push(errorEntry(label+'.state.'+key,error));}
 const transform=method(context,'getTransform');if(transform)try{const value=APPLY(transform,context,[]);info.transform={a:number(value.a),b:number(value.b),c:number(value.c),d:number(value.d),e:number(value.e),f:number(value.f)};}catch(error){errors.push(errorEntry(label+'.getTransform',error));}
 return info;
}

function rigInfo(rig){
 const models=own(rig,'models'),pending=own(rig,'pending'),gl=own(rig,'renderer'),info=own(gl,'info');
 return{present:object(rig),ready:typeof own(rig,'ready')==='boolean'?own(rig,'ready'):null,lost:own(rig,'lost')===true,error:text(own(rig,'error')),modelCount:sizeOf(models,MAP_SIZE),modelKeys:keysOf(models),pendingCount:sizeOf(pending,MAP_SIZE),pendingKeys:keysOf(pending),renderFrame:number(own(own(info,'render'),'frame'))};
}
function selectedInfo(selected){const metadata=own(selected,'metadata'),id=own(selected,'id');return{id:text(id,120),source:own(metadata,'liveRig')===true||id==='survivor-original-live-rig'?'native':own(metadata,'format')==='meshy-iso-sprite-atlas'?'baked':'unknown'};}
function selections(renderer,key){
 const actors=own(renderer,key),cache=own(renderer,'nativeActorFrames'),count=sizeOf(actors,SET_SIZE),result={available:count!==null,count,observed:0,truncated:count!==null&&count>32,entries:[]};
 if(count!==null)try{for(const actor of APPLY(SET_VALUES,actors,[])){if(result.observed===32)break;result.observed++;let selected=null;try{selected=APPLY(WEAK_GET,cache,[actor]);}catch{}result.entries.push({type:text(own(actor,'type'),40),bossKey:text(own(actor,'bossKey'),40),cached:object(selected),...selectedInfo(selected)});}}catch{}
 return result;
}
function diagnostics(renderer,canvas,context,floor,floorContext,observeFloor,errors){
 const camera=own(renderer,'camera'),projection=own(renderer,'cameraProjection'),asphalt=own(renderer,'asphaltImage');
 const result={mainContext:contextInfo(context,canvas,errors,'main'),floorContext:floorContext?contextInfo(floorContext,floor,errors,'floor'):null,renderer:{width:number(own(renderer,'width')),height:number(own(renderer,'height')),dpr:number(own(renderer,'dpr')),zoom:number(own(renderer,'zoom')),offsetY:number(own(renderer,'offsetY')),lastNow:number(own(renderer,'lastNow')),camera:{x:number(own(camera,'x')),y:number(own(camera,'y'))},cameraProjection:{x:number(own(projection,'x')),y:number(own(projection,'y'))},cameraReady:own(renderer,'cameraReady')===true,asphaltStatus:text(own(renderer,'textureStatus'),40),asphaltPresent:object(asphalt),floor:{observed:observeFloor,present:false,worldIdentityPresent:false,key:null}},native:{player:rigInfo(own(renderer,'livePlayer')),enemies:rigInfo(own(renderer,'liveEnemies')),boss:rigInfo(own(renderer,'liveBoss'))}};
 if(observeFloor){const surface=own(renderer,'floor'),world=own(renderer,'floorWorld');result.renderer.floor={observed:true,present:object(surface),worldIdentityPresent:object(world),key:text(own(renderer,'floorKey'),512),width:surface?number(surface.width):null,height:surface?number(surface.height):null,sameAsReadSurface:floor?surface===floor:null,world:{seed:number(own(world,'seed')),width:number(own(world,'width')),height:number(own(world,'height')),theme:text(own(world,'theme'),80),city:text(own(world,'city'),80),missionId:text(own(world,'missionId'),80),missionIndex:number(own(world,'missionIndex')),rooftop:typeof own(world,'rooftop')==='boolean'?own(world,'rooftop'):null,paletteAsphalt:text(own(own(world,'palette'),'asphalt'),80)}};}
 result.native.enemySelection=selections(renderer,'liveEnemySelection');result.native.corpseSelection=selections(renderer,'liveCorpseSelection');
 result.native.playerLastSelection=selectedInfo(own(own(own(renderer,'livePlayer'),'last'),'selected'));
 const visible=[...result.native.enemySelection.entries,...result.native.corpseSelection.entries],fallbackIds=[];
 for(const item of visible)if(item.source==='baked'&&item.id&&!fallbackIds.includes(item.id))fallbackIds.push(item.id);
 result.native.fallbackVisible={ids:fallbackIds,complete:false,scope:'Cached selected entries for current liveEnemySelection/liveCorpseSelection only. Renderer exposes no enumerable selection ID list for all other baked/fallback-visible actors.'};
 const dataset=canvas.dataset,drawStatus={};for(const key of ['productionPlayer','productionDrawStatus','productionRig','productionEnemyRig','productionBossRig']){const value=own(dataset,key);if(typeof value==='string')drawStatus[key]=value.slice(0,120);}result.native.lastPublicDrawStatus=drawStatus;
 return result;
}

/** Original, already rendered QA surfaces only; primaryPixels is R0.data. */
export function probeOriginalReadback(renderer,primaryPixels,options={}){
 const testAPI=own(options,'testAPI'),injected=own(options,'injected')===true||testAPI!==undefined,readFloor=own(options,'readFloor')===true;
 const geometry={mainWidth:MAIN_WIDTH,mainHeight:MAIN_HEIGHT,floorWidth:FLOOR_WIDTH,floorHeight:FLOOR_HEIGHT};
 const report={complete:false,stable:false,injected,reason:'not-started',readFloor,readSequence:[],geometry,primary:{expectedBytes:MAIN_WIDTH*MAIN_HEIGHT*4,providedBytes:null},comparisons:{R0R1:null,R0R2:null,R1R2:null},hashes:{R0:null,R1:null,F:null,R2:null},main:{width:null,height:null,contextCanvasIdentity:false,readbackColorSpace:null,readbackPixelFormat:null},floor:{requested:readFloor,attempted:false,read:false,width:null,height:null,existingCacheEvidence:false},diagnostics:null,errors:[],cleanup:{rawArraysRetained:false,newSurfaces:0,newContextsCreatedByHelper:0,existingFloorContextRequests:0,productionMutations:0,mainOwnerUnchanged:null,mainGeometryUnchanged:null,mainReadMethodUnchanged:null,floorOwnerUnchanged:null,floorGeometryUnchanged:null,floorWorldUnchanged:null,floorKeyUnchanged:null,floorReadMethodUnchanged:null},note:ORIGINAL_READBACK_NOTE};
 let context=null,canvas=null,mainRead=null,floor=null,floorContext=null,floorRead=null,floorWorld=null,floorKey=null,floorWidthBefore=null,floorHeightBefore=null,floorGeometryCaptured=false,r1=null,r2=null,floorPixels=null,r1ImageData=null,stage='preflight';
 const fail=(reason,...details)=>{report.reason=reason;if(details.length)report.errors.push(errorEntry(stage,details[0]));};
 const read=(ctx,fn,width,height,label)=>{stage=label;report.readSequence.push(label);const result=APPLY(fn,ctx,[0,0,width,height]),data=result?.data;if(label==='R1')r1ImageData=result;if(!bytes(data)||data.length!==width*height*4)throw new Error(label+' returned invalid RGBA byte length/type');return data;};
 try{
  if(testAPI!==undefined){for(const key of Object.keys(geometry)){const value=own(testAPI,key);if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>geometry[key]){fail('invalid-test-geometry');return report;}geometry[key]=value;}}
  report.primary.expectedBytes=geometry.mainWidth*geometry.mainHeight*4;
  // No renderer, context, state, metadata, hash or pixel loop precedes this check.
  if(!bytes(primaryPixels)){fail('primary-pixels-type-invalid');return report;}
  report.primary.providedBytes=primaryPixels.length;
  if(primaryPixels.length!==geometry.mainWidth*geometry.mainHeight*4){fail('primary-pixels-length-mismatch');return report;}
  context=own(renderer,'ctx');canvas=own(renderer,'canvas');if(!object(context)||!object(canvas)){fail('main-owner-unavailable');return report;}
  report.main.width=number(canvas.width);report.main.height=number(canvas.height);report.main.contextCanvasIdentity=context.canvas===canvas;
  if(!report.main.contextCanvasIdentity){fail('main-context-canvas-mismatch');return report;}
  if(canvas.width!==geometry.mainWidth||canvas.height!==geometry.mainHeight){fail('unsupported-main-geometry');return report;}
  mainRead=method(context,'getImageData');if(!mainRead){fail('main-read-method-unavailable');return report;}
  r1=read(context,mainRead,geometry.mainWidth,geometry.mainHeight,'R1');
  report.comparisons.R0R1=difference(primaryPixels,r1,geometry.mainWidth);
  if(!report.comparisons.R0R1.equal){fail('main-immediate-repeat-differed');return report;}
  if(readFloor){
   stage='F.preflight';floor=own(renderer,'floor');floorWorld=own(renderer,'floorWorld');floorKey=own(renderer,'floorKey');report.floor.existingCacheEvidence=object(floorWorld)&&typeof floorKey==='string'&&floorKey.length>0;
   if(!object(floor)||!report.floor.existingCacheEvidence){fail('existing-floor-cache-unavailable');return report;}
   floorWidthBefore=floor.width;floorHeightBefore=floor.height;floorGeometryCaptured=true;report.floor.width=number(floorWidthBefore);report.floor.height=number(floorHeightBefore);
   if(floor.width!==geometry.floorWidth||floor.height!==geometry.floorHeight){fail('unsupported-floor-geometry');return report;}
   const getContext=method(floor,'getContext');if(!getContext){fail('floor-context-method-unavailable');return report;}
   // Original Renderer.makeFloor has already created this exact 2D context.
   report.floor.attempted=true;report.cleanup.existingFloorContextRequests++;floorContext=APPLY(getContext,floor,['2d']);
   if(!object(floorContext)||floorContext.canvas!==floor){fail('existing-floor-context-unavailable');return report;}
   floorRead=method(floorContext,'getImageData');if(!floorRead){fail('floor-read-method-unavailable');return report;}
   floorPixels=read(floorContext,floorRead,geometry.floorWidth,geometry.floorHeight,'F');report.floor.read=true;
  }
  r2=read(context,mainRead,geometry.mainWidth,geometry.mainHeight,'R2');
  report.comparisons.R0R2=difference(primaryPixels,r2,geometry.mainWidth);report.comparisons.R1R2=difference(r1,r2,geometry.mainWidth);
  report.complete=true;report.stable=report.comparisons.R0R2.equal&&report.comparisons.R1R2.equal;
  report.reason=report.stable?'stable-original-readbacks':readFloor?'main-repeat-after-floor-differed':'main-repeat-without-floor-differed';
 }catch(error){fail(stage==='R1'?'main-immediate-read-failed':stage==='R2'?'main-final-read-failed':stage==='F'?'floor-read-failed':'readback-probe-failed',error);}
 finally{
  // Diagnostic-only work is deliberately after the last attempted pixel read.
  if(report.readSequence.length){
   report.hashes.R0=fingerprint(primaryPixels);report.hashes.R1=fingerprint(r1);report.hashes.F=fingerprint(floorPixels);report.hashes.R2=fingerprint(r2);
   try{report.main.readbackColorSpace=text(r1ImageData?.colorSpace,80);report.main.readbackPixelFormat=text(r1ImageData?.pixelFormat,80);}catch(error){report.errors.push(errorEntry('post-read-image-data-format',error));}
   try{report.diagnostics=diagnostics(renderer,canvas,context,floor,floorContext,report.comparisons.R0R1?.equal===true,report.errors);}catch(error){report.errors.push(errorEntry('post-read-diagnostics',error));}
   try{report.cleanup.mainOwnerUnchanged=own(renderer,'ctx')===context&&own(renderer,'canvas')===canvas&&context.canvas===canvas;report.cleanup.mainGeometryUnchanged=canvas.width===geometry.mainWidth&&canvas.height===geometry.mainHeight;report.cleanup.mainReadMethodUnchanged=method(context,'getImageData')===mainRead;if(floor){report.cleanup.floorOwnerUnchanged=own(renderer,'floor')===floor;report.cleanup.floorGeometryUnchanged=floorGeometryCaptured?Object.is(floor.width,floorWidthBefore)&&Object.is(floor.height,floorHeightBefore):null;report.cleanup.floorWorldUnchanged=own(renderer,'floorWorld')===floorWorld;report.cleanup.floorKeyUnchanged=own(renderer,'floorKey')===floorKey;report.cleanup.floorReadMethodUnchanged=floorRead?method(floorContext,'getImageData')===floorRead:null;}}catch(error){report.errors.push(errorEntry('post-read-owner-check',error));}
   if(report.cleanup.mainOwnerUnchanged===false||report.cleanup.mainGeometryUnchanged===false||report.cleanup.mainReadMethodUnchanged===false||report.cleanup.floorOwnerUnchanged===false||report.cleanup.floorGeometryUnchanged===false||report.cleanup.floorWorldUnchanged===false||report.cleanup.floorKeyUnchanged===false||report.cleanup.floorReadMethodUnchanged===false){report.complete=false;report.stable=false;report.reason='readback-owner-or-geometry-changed';}
   else if(report.complete&&report.errors.length){report.complete=false;report.reason='post-read-diagnostics-failed';}
  }
  // Only primitive DTOs escape this synchronous call. No delayed work exists.
  context=canvas=mainRead=floor=floorContext=floorRead=floorWorld=floorKey=floorWidthBefore=floorHeightBefore=r1=r2=floorPixels=r1ImageData=null;
 }
 return report;
}
