export const RENDER_ATTRIBUTION_NOTE='QA-owned Renderer observation only. Inclusive method spans overlap and must never be summed; selfMs subtracts only completed direct observed child spans, and buckets sum those self spans within an observed renderer.render call. renderer.render self is the remaining unwrapped render work, including observer overhead. Readiness snapshots are taken at frame boundaries, not construction times or guarantees of GPU readiness. floorReady reports surface existence only; floorWorldCached reports a stored world-cache owner, not cache freshness for a particular Game. Factory source/type classification uses bounded own-data fields and does not query GL or invoke metadata getters. drawPlayer is the current renderer\'s outer player draw; it has no drawNativePlayer method. No Canvas API hooks, draws, renders, pixel reads, loads, uploads, priming, ticks, event drains, storage or scheduling calls are added. CPU call wall includes synchronous waits and instrumentation overhead; it is not GPU execution time, presented FPS or peak memory. Use without overlapping external method profilers or candidate installers.';
export const PLAYER_ATTRIBUTION_NOTE='QA-owned player-only observation. Original renderer render/nativePlayerFrame/drawPlayer, player frame/rasterFrame, private WebGLRenderer.render and private bodyContext.getImageData calls are observed. The main Canvas is untouched; the private body read hook forwards each original call exactly once. No NPC or ProductionArt method is wrapped or inspected by this mode. GL body/armed labels mean first/second observed GL call in the innermost rasterFrame, not a material/scene query; outside or subsequent calls are labelled other. Body dimensions and requested RGBA byte estimates come only from primitive original call arguments, not extra pixel reads or returned data inspection. Player frame self is pose/IK and other work outside rasterFrame; raster self includes unobserved copies, alpha/contour work and metadata creation. Owner identities are read only at frame boundaries. Nested inclusive spans overlap; only self buckets partition an observed renderer.render. No extra GL/Canvas call, load, compile, pose, draw, prime, tick, storage or schedule is performed. Synchronous call wall includes waits and observer overhead, not GPU execution time, presented FPS or peak memory.';

const APPLY=Reflect.apply,OWN=Object.getOwnPropertyDescriptor,PROTO=Object.getPrototypeOf,DEFINE=Object.defineProperty;
const MAP_SIZE=OWN(Map.prototype,'size').get,MAP_HAS=Map.prototype.has;
const methodSlots=new WeakMap();
const TYPES=['walker','runner','shield','screamer','gas','elite','collector'];
const TYPE_SET=new Set(TYPES);
const METHODS=['render','makeFloor','prepareNativeEnemyBatch','nativePlayerFrame','drawPlayer','nativeEnemyFrame','drawNativeEnemy','drawEnemy','drawCampaignBoss','nativeCorpseFrame','drawNativeCorpse','drawCorpse','drawObstacle','drawDecor','prepareMinimap','drawMinimap'];
const PLAYER_METHODS=['render','nativePlayerFrame','drawPlayer'];
const CATEGORIES={render:'render',makeFloor:'floor',prepareNativeEnemyBatch:'batch',nativePlayerFrame:'player',drawPlayer:'player',nativeEnemyFrame:'npc',drawNativeEnemy:'npc',drawEnemy:'npc',drawCampaignBoss:'boss',nativeCorpseFrame:'corpse',drawNativeCorpse:'corpse',drawCorpse:'corpse',drawObstacle:'environment',drawDecor:'environment',prepareMinimap:'minimap',drawMinimap:'minimap'};
const RESERVED=new Set(['frameIndex','frameWallMs','stages','buckets','readinessBefore','readinessAfter','selections','renderCalls']);
const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
function ownData(value,key){try{const d=object(value)?OWN(value,key):null;return d&&'value'in d?d.value:undefined;}catch{return undefined;}}
function descriptorEqual(a,b){return !!a===!!b&&(!a||a.value===b.value&&a.get===b.get&&a.set===b.set&&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable);}
function methodValue(value,key){try{let at=value;for(let depth=0;at&&depth<24;depth++,at=PROTO(at)){const d=OWN(at,key);if(d)return 'value'in d&&typeof d.value==='function'?d.value:null;}}catch{}return null;}
function bounded(value,length=120){return typeof value==='string'?value.slice(0,length):null;}
function number(value){return typeof value==='number'&&Number.isFinite(value)?value:null;}
function mapSize(value){try{return APPLY(MAP_SIZE,value,[]);}catch{return null;}}
function mapHas(value,key){try{return APPLY(MAP_HAS,value,[key]);}catch{return false;}}
function sourceOf(selected){const meta=ownData(selected,'metadata'),id=ownData(selected,'id');return{source:ownData(meta,'liveRig')===true||id==='survivor-original-live-rig'?'native':ownData(meta,'format')==='meshy-iso-sprite-atlas'&&typeof id==='string'&&id?'baked':'unknown',assetId:bounded(id)};}
function primitiveMeta(target,meta){
 try{let count=0;for(const key of Object.getOwnPropertyNames(meta??{})){if(count>=16)break;if(RESERVED.has(key)||key.length>64)continue;const d=OWN(meta,key);if(!d||!('value'in d))continue;const v=d.value;if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number'&&Number.isFinite(v)){DEFINE(target,key,{value:typeof v==='string'?v.slice(0,160):v,writable:true,enumerable:true,configurable:true});count++;}}}catch{}
}
function summarize(values){const sorted=values.filter(v=>typeof v==='number'&&Number.isFinite(v)).sort((a,b)=>a-b),n=sorted.length;return{count:n,sumMs:sorted.reduce((sum,v)=>sum+v,0),medianMs:n?sorted[Math.floor((n-1)/2)]:0,p95Ms:n?sorted[Math.min(n-1,Math.ceil(n*.95)-1)]:0,maxMs:n?sorted[n-1]:0};}

// Dispatchers belong to this module alone. Their observer list is live, so
// independent observers can stop in either order without losing another one.
function subscribe(target,key,listener){
 let methods=methodSlots.get(target),slot=methods?.get(key);
 try{
  if(slot&&!descriptorEqual(OWN(target,key),slot.expected))return null;
  if(!slot){
   const before=OWN(target,key);if(before&&!('value'in before))return null;
   const original=methodValue(target,key);if(!original)return null;
   slot={before,original,listeners:new Set(),expected:null};
   slot.dispatch=function(...args){
    const entered=[];
    for(const item of slot.listeners)try{const token=item.enter(this,args);if(token)entered.push([item,token]);}catch{}
    let result,threw=true;
    try{result=APPLY(slot.original,this,args);threw=false;return result;}
    finally{for(let i=entered.length-1;i>=0;i--){const [item,token]=entered[i];try{item.leave(token,result,threw);}catch{}}}
   };
   const expected=before?{...before,value:slot.dispatch}:{value:slot.dispatch,writable:true,configurable:true,enumerable:false};
   DEFINE(target,key,expected);slot.expected=OWN(target,key);
   methods??=new Map();methods.set(key,slot);methodSlots.set(target,methods);
  }
 }catch{return null;}
 slot.listeners.add(listener);let attached=true;
 return()=>{
  if(!attached)return'shared';attached=false;slot.listeners.delete(listener);if(slot.listeners.size)return'shared';
  let status='restored';
  try{if(!descriptorEqual(OWN(target,key),slot.expected))status='foreign';else if(slot.before)DEFINE(target,key,slot.before);else if(!delete target[key])status='failed';}catch{status='failed';}
  methods.delete(key);if(!methods.size)methodSlots.delete(target);return status;
 };
}

/** The caller must own this renderer, its Art and its private drawing surface. */
export function installRenderAttribution({renderer,now=()=>performance.now(),enabled=true,limit=40,maxOutliers=32,playerOnly=false}={}){
 enabled=!!enabled;
 playerOnly=playerOnly===true;
 const samples=[],outliers=[],unmeasured=[],missing=new Set(),rendererUndo=[],artUndo=[],playerUndo=[],playerSurfaceUndo=[],stack=[];
 const cap=Number.isFinite(limit)?Math.max(1,Math.min(40,Math.floor(limit))):40;
 const outlierCap=Number.isFinite(maxOutliers)?Math.max(0,Math.min(32,Math.floor(maxOutliers))):32;
 let owner=renderer,clockFn=now,current=null,frameStart=null,art=null,context=null,playerOwner=null,playerGL=null,bodyContext=null,attached=false,stopped=false,nextFrame=0,cleanupComplete=true;
 const restoration={restored:0,shared:0,foreignPreserved:0,failed:0};
 const mark=name=>{if(missing.has(name)||unmeasured.length>=32)return;missing.add(name);unmeasured.push(name);};
 const clock=()=>{try{const value=clockFn?.();if(typeof value==='number'&&Number.isFinite(value))return value;}catch{}mark('clock');return null;};
 const duration=(a,b)=>a!==null&&b!==null?Math.max(0,b-a):null;
 function restore(list){for(const undo of list.splice(0).reverse())try{const status=undo();if(status==='foreign'){restoration.foreignPreserved++;cleanupComplete=false;mark('restore.foreign-descriptor');}else if(status==='failed'){restoration.failed++;cleanupComplete=false;mark('restore.failed');}else restoration[status]++;}catch{restoration.failed++;cleanupComplete=false;mark('restore.failed');}}
 function ready(){
  if(playerOnly){
   const next=ownData(owner,'livePlayer'),gl=ownData(next,'renderer');
   return{playerReady:typeof ownData(next,'ready')==='boolean'?ownData(next,'ready'):null,playerError:bounded(ownData(next,'error')),playerRenderFrames:number(ownData(ownData(ownData(gl,'info'),'render'),'frame')),playerAttached:object(playerOwner),glAttached:object(playerGL),bodyContextAttached:object(bodyContext),playerOwnerChanged:next!==playerOwner||gl!==playerGL||ownData(next,'bodyContext')!==bodyContext};
  }
  const player=ownData(owner,'livePlayer'),npc=ownData(owner,'liveEnemies'),models=ownData(npc,'models'),pending=ownData(npc,'pending');
  const renderFrames=rig=>number(ownData(ownData(ownData(ownData(rig,'renderer'),'info'),'render'),'frame'));
  const types=TYPES.map(type=>({type,ready:mapHas(models,'enemy-'+type),pending:mapHas(pending,'enemy-'+type)}));
  return{floorReady:!!ownData(owner,'floor'),floorWorldCached:!!ownData(owner,'floorWorld'),floorTextureStatus:bounded(ownData(owner,'textureStatus'),40),playerReady:typeof ownData(player,'ready')==='boolean'?ownData(player,'ready'):null,playerError:bounded(ownData(player,'error')),playerRenderFrames:renderFrames(player),npcRenderFrames:renderFrames(npc),npcModels:mapSize(models),npcPending:mapSize(pending),npcPendingWithoutModel:types.filter(item=>item.pending&&!item.ready).length,npcLost:ownData(npc,'lost')===true,npcError:bounded(ownData(npc,'error')),types};
 }
 function bucketFor(key,category,source){
  if(playerOnly){if(key==='frame')return'playerPose';if(key==='rasterFrame')return'playerRasterOther';if(key==='playerGL')return'playerGL'+source[0].toUpperCase()+source.slice(1);if(key==='bodyRead')return'playerBodyRead';}
  if(key==='render')return'renderRemainder';if(key==='makeFloor')return'floorCache';if(key==='prepareNativeEnemyBatch')return'nativeBatch';
  if(key==='nativePlayerFrame')return'playerFrame';if(key==='nativeEnemyFrame')return category==='boss'?'bossFrame':'npcFrame';if(key==='nativeCorpseFrame')return'corpseFrame';
  if(key==='drawFrame')return({player:'playerSprite',npc:'npcSprite',boss:'bossSprite',corpse:'corpseSprite',environment:'environmentSprite'}[category]||'otherSprite')+source[0].toUpperCase()+source.slice(1);
  return{player:'playerOther',npc:'npcOther',boss:'bossOther',corpse:'corpseOther',environment:'environmentOther',minimap:'minimap'}[category]||'renderOther';
 }
 function observe(target,key,label,list,kind=key){
  if(stopped)return;
  const release=subscribe(target,key,{
   enter(receiver,args){
    if(!current||stopped||receiver!==target)return null;
    if(stack.length>=64){mark('stack-limit');return null;}
    const parent=stack[stack.length-1]??null;
    let category=CATEGORIES[kind]||parent?.category||'other',type=null,source='unknown',assetId=null,spanLabel=label,ordinal=0,raster=null,readWidth=null,readHeight=null,readX=null,readY=null;
    if(playerOnly&&(kind==='playerGL'||kind==='bodyRead')){
     for(let i=stack.length-1;i>=0;i--)if(stack[i].key==='rasterFrame'){raster=stack[i];break;}
     if(kind==='playerGL'){ordinal=raster?++raster.glCalls:0;source=ordinal===1?'body':ordinal===2?'armed':'other';spanLabel=label+'.'+source;}
     else{readX=number(args[0]);readY=number(args[1]);readWidth=number(args[2]);readHeight=number(args[3]);}
    }
    if(key==='nativeEnemyFrame'){category=args[3]?'boss':'npc';const t=ownData(args[0],'type');type=TYPE_SET.has(t)?t:'other';}
    if(key==='drawFrame'){if(args[0]!==context)return null;const info=sourceOf(args[1]);source=info.source;assetId=info.assetId;category=parent?.category||'other';}
    const frame=current,start=clock();if(stopped||current!==frame)return null;
    const token={frame,key:kind,label:spanLabel,category,type,source,assetId,parent,start,children:0,insideRender:kind==='render'||!!parent?.insideRender};
    if(playerOnly){token.glCalls=0;token.glOrdinal=ordinal;token.readX=readX;token.readY=readY;token.readWidth=readWidth;token.readHeight=readHeight;}
    stack.push(token);return token;
   },
   leave(token,result,threw){
    if(stopped||token.frame!==current)return;const end=clock();if(stopped||token.frame!==current)return;
    if(stack[stack.length-1]!==token){mark('stack-order');const index=stack.indexOf(token);if(index>=0)stack.splice(index,1);}else stack.pop();
    const elapsed=duration(token.start,end),inclusive=elapsed??0,self=Math.max(0,inclusive-token.children);
    if(token.parent&&token.parent.frame===current)token.parent.children+=inclusive;
    const frame=token.frame,stage=frame.stages[token.label]??={calls:0,thrownCalls:0,falseReturns:0,inclusiveMs:0,selfMs:0};
    stage.calls++;stage.inclusiveMs+=inclusive;stage.selfMs+=self;if(threw)stage.thrownCalls++;else if(result===false)stage.falseReturns++;
    if(playerOnly){
     const calls=frame.playerCalls;
     if(token.key==='frame')calls.frameCalls++;
     else if(token.key==='rasterFrame')calls.rasterCalls++;
     else if(token.key==='playerGL'){calls.glCalls++;calls[token.source==='body'?'glBodyCalls':token.source==='armed'?'glArmedCalls':'glOtherCalls']++;}
     else if(token.key==='bodyRead'){
      calls.bodyReadCalls++;calls.lastBodyWidth=token.readWidth;calls.lastBodyHeight=token.readHeight;
      if(token.readX===0&&token.readY===0&&token.readWidth===256&&token.readHeight===256)calls.bodyRead256Calls++;else calls.bodyReadOtherCalls++;
      const pixels=token.readWidth*token.readHeight;
      if(Number.isInteger(token.readWidth)&&token.readWidth>0&&Number.isInteger(token.readHeight)&&token.readHeight>0&&Number.isSafeInteger(pixels)&&pixels<=Number.MAX_SAFE_INTEGER/4){
       if(Number.isSafeInteger(calls.bodyReadPixels+pixels)&&Number.isSafeInteger(calls.bodyReadBytes+pixels*4)){calls.bodyReadPixels+=pixels;calls.bodyReadBytes+=pixels*4;}else mark('player.bodyRead.estimate-overflow');
      }
     }
    }
    if(token.key==='nativeEnemyFrame'||token.key==='nativePlayerFrame'){
     if(result){const info=sourceOf(result);token.source=info.source;token.assetId=info.assetId;}
     else token.source='none';
     const group=token.key==='nativePlayerFrame'?'player':token.category==='boss'?'boss':'npc',type=token.type||'player';
     const entry=frame.selections[group][type]??={calls:0,native:0,baked:0,unknown:0,none:0,thrown:0};entry.calls++;if(threw)entry.thrown++;else entry[token.source]++;
    }
    if(token.insideRender){const name=bucketFor(token.key,token.category,token.source),bucket=frame.buckets[name]??={calls:0,selfMs:0};bucket.calls++;bucket.selfMs+=self;}
    if(token.key==='render')frame.renderCalls++;
    if(outlierCap&&elapsed!==null){
     const entry={frameIndex:frame.frameIndex,stage:token.label,type:token.type,source:token.source,assetId:token.assetId,inclusiveMs:inclusive,selfMs:self,threw,falseReturn:!threw&&result===false};
     if(playerOnly){entry.glOrdinal=token.glOrdinal;entry.readWidth=token.readWidth;entry.readHeight=token.readHeight;}
     if(outliers.length<outlierCap||inclusive>outliers[outliers.length-1].inclusiveMs){outliers.push(entry);outliers.sort((a,b)=>b.inclusiveMs-a.inclusiveMs);if(outliers.length>outlierCap)outliers.pop();}
    }
   }
  });
  if(release){if(stopped){try{release();}catch{}}else list.push(release);}else mark(label+'.unavailable');
 }
 function syncPlayer(){
  const next=ownData(owner,'livePlayer');
  if(next!==playerOwner){
   restore(playerSurfaceUndo);restore(playerUndo);if(stopped)return;playerOwner=next;playerGL=bodyContext=null;
   if(object(playerOwner)){observe(playerOwner,'frame','player.frame',playerUndo);observe(playerOwner,'rasterFrame','player.rasterFrame',playerUndo);}
  }
  if(stopped)return;const gl=ownData(playerOwner,'renderer'),body=ownData(playerOwner,'bodyContext');
  if(gl!==playerGL||body!==bodyContext){
   restore(playerSurfaceUndo);if(stopped)return;playerGL=gl;bodyContext=body;
   if(object(playerGL))observe(playerGL,'render','player.glSubmit',playerSurfaceUndo,'playerGL');else mark('player.glSubmit.unavailable');
   if(object(bodyContext))observe(bodyContext,'getImageData','player.bodyRead',playerSurfaceUndo,'bodyRead');else mark('player.bodyRead.unavailable');
  }
 }
 function sync(){
  if(!attached){attached=true;for(const key of playerOnly?PLAYER_METHODS:METHODS){if(stopped)return;observe(owner,key,'renderer.'+key,rendererUndo);}}
  if(playerOnly){syncPlayer();return;}
  const next=ownData(owner,'productionArt'),nextContext=ownData(owner,'ctx');
  if(stopped)return;
  if(art!==next||context!==nextContext){restore(artUndo);if(stopped)return;art=next;context=nextContext;if(object(art))observe(art,'drawFrame','production.drawFrame',artUndo);else mark('production.drawFrame.unavailable');}
 }
 function beginFrame(meta={}){
  if(!enabled||stopped||current)return null;
  const start=clock();if(stopped)return null;frameStart=start;
  const frame=current={frameIndex:nextFrame++,frameWallMs:0,renderCalls:0,stages:{},buckets:{},selections:{player:{},npc:{},boss:{}}};primitiveMeta(frame,meta);
  if(playerOnly)frame.playerCalls={frameCalls:0,rasterCalls:0,glCalls:0,glBodyCalls:0,glArmedCalls:0,glOtherCalls:0,bodyReadCalls:0,bodyRead256Calls:0,bodyReadOtherCalls:0,bodyReadPixels:0,bodyReadBytes:0,lastBodyWidth:null,lastBodyHeight:null};
  try{sync();if(stopped||current!==frame)return null;const snapshot=ready();if(stopped||current!==frame)return null;frame.readinessBefore=snapshot;}catch{mark('frame.attach');if(stopped||current!==frame)return null;frame.readinessBefore=null;}return frame;
 }
 function endFrame(meta={}){
  if(!current||stopped)return null;
  const frame=current;if(stack.length){mark('frame-ended-in-method');stack.length=0;}
  try{const snapshot=ready();if(stopped||current!==frame)return null;frame.readinessAfter=snapshot;}catch{mark('frame.readiness');if(stopped||current!==frame)return null;frame.readinessAfter=null;}
  const playerCalls=playerOnly?frame.playerCalls:null;primitiveMeta(frame,meta);if(playerOnly)frame.playerCalls=playerCalls;const end=clock();if(stopped||current!==frame)return null;frame.frameWallMs=duration(frameStart,end)??0;current=null;frameStart=null;samples.push(frame);
  if(samples.length>=cap)stop();return frame;
 }
 function report(){
  const stageTotals={},bucketTotals={};
  for(const frame of samples){for(const [key,value]of Object.entries(frame.stages)){const total=stageTotals[key]??={calls:0,thrownCalls:0,falseReturns:0,inclusiveMs:0,selfMs:0};for(const field of Object.keys(total))total[field]+=value[field];}for(const [key,value]of Object.entries(frame.buckets)){const total=bucketTotals[key]??={calls:0,selfMs:0};total.calls+=value.calls;total.selfMs+=value.selfMs;}}
  const result={enabled:!!enabled,stopped,cleanupComplete,samples,outliers,unmeasured,restoration:{...restoration},summary:{frames:samples.length,frameWallMs:summarize(samples.map(frame=>frame.frameWallMs)),renderInclusiveMs:summarize(samples.map(frame=>frame.stages['renderer.render']?.inclusiveMs??0)),stages:stageTotals,buckets:bucketTotals},note:playerOnly?PLAYER_ATTRIBUTION_NOTE:RENDER_ATTRIBUTION_NOTE};
  if(playerOnly)result.playerOnly=true;return result;
 }
 function stop(){
  if(!stopped){stopped=true;current=null;frameStart=null;stack.length=0;if(playerOnly){restore(playerSurfaceUndo);restore(playerUndo);}restore(artUndo);restore(rendererUndo);owner=art=context=playerOwner=playerGL=bodyContext=clockFn=renderer=now=null;}
  return report();
 }
 return{beginFrame,endFrame,report,stop};
}

export const createRenderAttribution=installRenderAttribution;
