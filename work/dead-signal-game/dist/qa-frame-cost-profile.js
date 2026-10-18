export const FRAME_COST_PROFILE_NOTE='QA measures synchronous CPU call wall time, including waits and observer overhead. Nested stage observations overlap and must not be summed. This is not GPU execution time, presented FPS, paint or total memory. First-observed owner identities are not game/model construction times. Scoped production.drawFrame stages observe only original calls on the existing ProductionArt instance within the innermost enemy/boss/corpse/player/obstacle/decor renderer category; extra hit-light draws remain separate calls. Category and source subtotals overlap their parent stages, and calls are not unique actors. Native classification uses the existing liveRig metadata flag or original live-player ID; baked requires the original atlas format and a string asset ID; unrecognized selections remain unknown. No Canvas method hooks are added for sprite timing. The observer performs no tick, render, pose, draw, pixel read, upload, event drain or scheduling calls.';

// Only existing instance methods are shadowed. A shared dispatcher allows two
// observers to stop in either order without restoring over the remaining one.
const methodSlots=new WeakMap();
function subscribe(object,key,listener){
 if(!object||(typeof object!=='object'&&typeof object!=='function'))return null;
 let methods=methodSlots.get(object),slot=methods?.get(key);
 try{
  if(slot&&object[key]!==slot.dispatch)return null;
  if(!slot){
   const descriptor=Object.getOwnPropertyDescriptor(object,key);
   // Do not turn an accessor into a value property or invoke its setter.
   if(descriptor&&!('value'in descriptor))return null;
   const original=object[key];if(typeof original!=='function')return null;
   slot={descriptor,original,listeners:new Set()};
   slot.dispatch=function(...args){
    const entered=[];
    for(const observer of slot.listeners)try{entered.push([observer,observer.enter(this,args)]);}catch{}
    let result,threw=true;
    try{result=slot.original.apply(this,args);threw=false;return result;}
    finally{for(let i=entered.length-1;i>=0;i--){const [observer,token]=entered[i];try{observer.leave(token,result,threw,this,args);}catch{}}}
   };
   Object.defineProperty(object,key,descriptor?{...descriptor,value:slot.dispatch}:{value:slot.dispatch,configurable:true,writable:true,enumerable:false});
   methods??=new Map();methodSlots.set(object,methods);methods.set(key,slot);
  }
 }catch{return null;}
 slot.listeners.add(listener);let attached=true;
 return()=>{
  if(!attached)return;attached=false;slot.listeners.delete(listener);if(slot.listeners.size)return;
  try{if(Object.getOwnPropertyDescriptor(object,key)?.value===slot.dispatch){if(slot.descriptor)Object.defineProperty(object,key,slot.descriptor);else delete object[key];}}catch{}
  methods.delete(key);if(!methods.size)methodSlots.delete(object);
 };
}

const GAME_METHODS=['updateMolotovs','updateBullets','updateEnemies','updatePickups','updateEffects','spawnEnemy','shoot'];
const NAV_METHODS=['direction','_sync','_grid','_field','_nearest','_approachBlocked'];
const RENDERER_METHODS=['makeFloor','nativePlayerFrame','drawPlayer','drawObstacle','drawDecor','prepareNativeEnemyBatch','drawMinimap','drawEnemy','nativeEnemyFrame','drawNativeEnemy','drawCampaignBoss','nativeCorpseFrame','drawNativeCorpse','drawCorpse','drawParticle'];
const DRAW_CATEGORIES={drawEnemy:'enemy',drawNativeEnemy:'enemy',drawCampaignBoss:'boss',drawNativeCorpse:'corpse',drawPlayer:'player',drawObstacle:'obstacle',drawDecor:'decor'};
const mapSize=Object.getOwnPropertyDescriptor(Map.prototype,'size').get;
const isObject=value=>value!==null&&(typeof value==='object'||typeof value==='function');
function ownData(object,key){try{if(!isObject(object))return;const descriptor=Object.getOwnPropertyDescriptor(object,key);return descriptor&&'value'in descriptor?descriptor.value:undefined;}catch{}}
function spriteSource(selected){
 const metadata=ownData(selected,'metadata'),assetId=ownData(selected,'id');
 if(ownData(metadata,'liveRig')===true||assetId==='survivor-original-live-rig')return'native';
 if(ownData(metadata,'format')==='meshy-iso-sprite-atlas'&&typeof assetId==='string'&&assetId.length)return'baked';
 return'unknown';
}

export function createFrameCostProfile({renderer,read,now=()=>performance.now(),enabled=true}={}){
 const samples=[],unmeasured=[],missing=new Set(),rendererUndo=[],gameUndo=[],navUndo=[],playerUndo=[],surfaceUndo=[],artUndo=[];
 const identities=new WeakMap(),seenGames=new WeakSet(),seenNavs=new WeakSet(),seenPlayers=new WeakSet(),seenArt=new WeakSet();
 let identity=0,current=null,stopped=false,report=null,game=null,nav=null,player=null,playerRenderer=null,bodyContext=null,art=null,drawCategory=null;
 const clock=()=>{try{const value=now();return Number.isFinite(value)?value:null;}catch{return null;}};
 const markMissing=name=>{if(!missing.has(name)){missing.add(name);unmeasured.push(name);}};
 const id=value=>{if(!isObject(value))return null;if(!identities.has(value))identities.set(value,++identity);return identities.get(value);};
 const restore=undo=>{for(const release of undo.splice(0).reverse())try{release();}catch{markMissing('restore');}};
 function observe(object,key,name,undo,{enter,leave,when}={}){
  const release=subscribe(object,key,{
   enter(receiver,args){
    if(!current||when&&!when(receiver,args))return null;
    const token={frame:current,start:clock(),name,extra:null};
    try{token.extra=enter?.(receiver,args,token.frame);}catch{markMissing(name+'.observation');}
    return token;
   },
   leave(token,result,threw,receiver,args){
    if(!token)return;
    const end=clock(),stage=token.frame.stages[name]??={cpuMs:0,calls:0};stage.calls++;
    const cpuMs=token.start!==null&&end!==null?Math.max(0,end-token.start):0;stage.cpuMs+=cpuMs;
    try{leave?.(token.extra,result,threw,receiver,args,stage,token.frame,cpuMs);}catch{markMissing(name+'.observation');}
   }
  });
  if(release)undo.push(release);else markMissing(name);
 }
 function navSnapshot(value){
  if(!value)return null;
  const result={id:id(value),revision:value.revision??null,gridCount:null,grids:[],truncated:false};
  try{
   result.gridCount=mapSize.call(value.grids);
   for(const [radius,grid] of Map.prototype.entries.call(value.grids)){
    if(result.grids.length===8){result.truncated=true;break;}
    let fields=null;try{fields=mapSize.call(grid?.fields);}catch{}
    result.grids.push({radius,fields});
   }
  }catch{markMissing('navigation.snapshot');}
  return result;
 }
 function ownerSnapshot(){
  try{return{gameId:id(game),navigation:navSnapshot(nav),playerId:id(player),productionArtId:id(art),floorId:id(renderer?.floor)};}
  catch{markMissing('owner.snapshot');return null;}
 }
 function firstObserved(value,seen,key){if(!current||!isObject(value)||seen.has(value))return;seen.add(value);current.observations[key]=true;}
 function syncNavigation(next){
  if(nav===next)return;restore(navUndo);nav=next;firstObserved(nav,seenNavs,'navigationFirstObserved');
  if(!nav)return;
  for(const key of NAV_METHODS)observe(nav,key,'navigation.'+key,navUndo,{
   enter(receiver,args){
    if(key==='_grid')return{cold:!Map.prototype.has.call(receiver.grids,args[0])};
    if(key==='_sync')return{revision:receiver.revision};
    return null;
   },
   leave(extra,result,threw,receiver,args,stage){
    if(key==='_grid'){stage.coldCalls??=0;if(extra?.cold)stage.coldCalls++;}
    if(key==='_sync'){stage.revisionChanges??=0;if(extra&&receiver.revision!==extra.revision)stage.revisionChanges++;}
   }
  });
 }
 function syncGame(next){
  if(game!==next){
   restore(gameUndo);game=next;firstObserved(game,seenGames,'gameFirstObserved');
   if(game)for(const key of GAME_METHODS)observe(game,key,'simulation.'+key,gameUndo,{enter(receiver){syncNavigation(receiver.navigation);}});
  }
  syncNavigation(game?.navigation);
 }
 function syncPlayerSurfaces(){
  const nextRenderer=player?.renderer,nextContext=player?.bodyContext;
  if(nextRenderer===playerRenderer&&nextContext===bodyContext)return;
  restore(surfaceUndo);playerRenderer=nextRenderer;bodyContext=nextContext;
  if(playerRenderer)observe(playerRenderer,'render','player.glSubmit',surfaceUndo);
  if(bodyContext)observe(bodyContext,'getImageData','player.bodyReadPixels',surfaceUndo);
 }
 function syncPlayer(){
  const next=renderer?.livePlayer;
  if(player!==next){
   restore(playerUndo);restore(surfaceUndo);player=next;playerRenderer=null;bodyContext=null;firstObserved(player,seenPlayers,'playerFirstObserved');
   if(player)for(const key of ['frame','rasterFrame'])observe(player,key,'player.'+key,playerUndo,{enter:syncPlayerSurfaces,leave:syncPlayerSurfaces});
  }
  syncPlayerSurfaces();
 }
 function syncProductionArt(){
  const next=renderer?.productionArt;if(art===next)return;restore(artUndo);art=next;firstObserved(art,seenArt,'productionArtFirstObserved');
  if(!isObject(art))return;
  observe(art,'drawFrame','production.drawFrame',artUndo,{
   when:()=>drawCategory!==null,
   enter(receiver,args){return{category:drawCategory,source:spriteSource(args[1])};},
   leave(extra,result,threw,receiver,args,total,frame,cpuMs){
    if(!extra)return;
    const category=frame.stages['production.drawFrame.'+extra.category]??={cpuMs:0,calls:0,nativeCalls:0,bakedCalls:0,unknownCalls:0,thrownCalls:0,falseReturns:0};
    category.calls++;category.cpuMs+=cpuMs;category[extra.source+'Calls']++;if(threw)category.thrownCalls++;else if(result===false)category.falseReturns++;
    const source=frame.stages['production.drawFrame.'+extra.category+'.'+extra.source]??={cpuMs:0,calls:0};source.calls++;source.cpuMs+=cpuMs;
   }
  });
 }
 function attach(){
  try{syncGame(typeof read==='function'?read()?.game:null);}catch{markMissing('context.read');}
  try{syncPlayer();}catch{markMissing('player.attach');}
  try{syncProductionArt();}catch{markMissing('production.attach');}
 }
 if(enabled)for(const key of RENDERER_METHODS)observe(renderer,key,'renderer.'+key,rendererUndo,{
  enter(receiver){if(key==='nativePlayerFrame'||key==='drawPlayer')syncPlayer();if(DRAW_CATEGORIES[key]){syncProductionArt();const previous=drawCategory;drawCategory=DRAW_CATEGORIES[key];return{previous,category:true};}return key==='makeFloor'?receiver.floor:null;},
  leave(before,result,threw,receiver,args,stage){if(before?.category)drawCategory=before.previous;if(key==='makeFloor'){stage.identityChanges??=0;if(receiver.floor!==before)stage.identityChanges++;}}
 });
 function beginFrame(meta={}){
  if(!enabled||stopped||current)return null;
  drawCategory=null;current={...meta,stages:{},observations:{gameFirstObserved:false,navigationFirstObserved:false,playerFirstObserved:false,productionArtFirstObserved:false}};
  current.startCpu=clock();attach();current.resourcesBefore=ownerSnapshot();
  current.observations.navigationEmptyAtBegin=current.resourcesBefore?.navigation?.gridCount===0;
  return current;
 }
 function endFrame(meta={}){
  if(!current)return null;
  const frame=current,end=clock();current=null;drawCategory=null;const start=frame.startCpu;delete frame.startCpu;
  Object.assign(frame,meta);frame.frameCpuMs=start!==null&&end!==null?Math.max(0,end-start):0;frame.resourcesAfter=ownerSnapshot();samples.push(frame);return frame;
 }
 function stop(){
  if(report)return report;stopped=true;current=null;drawCategory=null;
  restore(artUndo);restore(surfaceUndo);restore(playerUndo);restore(navUndo);restore(gameUndo);restore(rendererUndo);
  game=nav=player=playerRenderer=bodyContext=art=null;
  return report={enabled,samples,unmeasured,note:FRAME_COST_PROFILE_NOTE};
 }
 return{beginFrame,endFrame,stop,samples,unmeasured,note:FRAME_COST_PROFILE_NOTE};
}
