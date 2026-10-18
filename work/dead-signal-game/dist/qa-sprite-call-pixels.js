import {ProductionArt} from './production-art.js?v=0.29.0';
import {createSpriteCallProfile} from './qa-sprite-call-profile.js';
import {isQAMemoryStorage} from './qa-storage.js';

const NOTE='Separate synchronous, post-measurement QA pixel probe. At most one already-cached native NPC cell and one already-ready original baked walker/runner cell are drawn on scratch canvases with the same original image, source rectangle and rect-sized placement. No live pose, model rendering, preload, decode, fetch, main-canvas draw, Game change or asset disposal occurs. A/B/A compares these selected inputs only, not the whole scene, all 12 live rigs or bosses. The observer remains unchanged and does not itself add draws; this explicit utility performs three original draws per selected input. Exact RGBA equality is required, with no tolerance or retry. Scratch dimensions and raw-RGBA estimates are geometry bounds, not peak memory or GPU allocation measurements. No FPS, GPU-time, decode or performance claim follows.';
const ownData=(object,key)=>{try{const d=object&&Object.getOwnPropertyDescriptor(object,key);return d&&'value'in d?d.value:undefined;}catch{}};
const sameDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
const sameOwn=(object,before)=>{try{const after=Object.getOwnPropertyDescriptors(object);return Reflect.ownKeys(before).length===Reflect.ownKeys(after).length&&Reflect.ownKeys(before).every(key=>sameDescriptor(before[key],after[key]));}catch{return false;}};
const errorText=error=>{try{return typeof error?.message==='string'?error.message:'sprite-pixel-probe-failed';}catch{return'sprite-pixel-probe-failed';}};
function allowed(location,query,storage){
 try{return location?.protocol==='http:'&&['127.0.0.1','localhost','[::1]','::1'].includes(location.hostname)&&location.port==='8851'&&query.has('qa')&&query.has('qa-memory')&&query.get('qa-loop-sprite-calls')==='1'&&isQAMemoryStorage(storage);}catch{return false;}
}
function rectOf(selected){
 const frame=ownData(selected,'frame'),source=ownData(frame,'rect'),image=ownData(selected,'image');
 const rect={x:ownData(source,'x'),y:ownData(source,'y'),width:ownData(source,'width'),height:ownData(source,'height')};
 if(!image||!Object.values(rect).every(Number.isInteger)||rect.x<0||rect.y<0||rect.width<1||rect.height<1||rect.width>512||rect.height>512)return null;
 const width=image.width,height=image.height;
 return Number.isFinite(width)&&Number.isFinite(height)&&rect.x+rect.width<=width&&rect.y+rect.height<=height?{rect,sourceAtlas:{width,height}}:null;
}
function nativeInput(renderer){
 const selection=ownData(renderer,'liveEnemySelection'),cache=ownData(renderer,'nativeActorFrames');
 try{for(const actor of Set.prototype.values.call(selection)){const selected=WeakMap.prototype.get.call(cache,actor);if(ownData(ownData(selected,'metadata'),'liveRig')===true&&rectOf(selected))return{selected,actor,cache};}}catch{}
 return null;
}
function bakedInput(art){
 const records=ownData(art,'records'),manifest=ownData(art,'manifest'),enemies=ownData(manifest,'enemies');
 for(const key of ['walker','runner']){
  const mapping=ownData(enemies,key),ids=[];
  if(typeof mapping==='string')ids.push(mapping);else for(const pose of ['walk','idle','actions']){const id=ownData(mapping,pose);if(typeof id==='string'&&!ids.includes(id))ids.push(id);}
  for(const id of ids){
   let record;try{record=Map.prototype.get.call(records,id);}catch{continue;}
   if(ownData(record,'status')!=='ready')continue;
   const metadata=ownData(record,'metadata'),image=ownData(record,'image'),frames=ownData(metadata,'frames');
   if(ownData(metadata,'format')!=='meshy-iso-sprite-atlas'||!Array.isArray(frames))continue;
   for(let index=0;index<frames.length;index++){
    const frame=ownData(frames,String(index));if(!frame)continue;
    const selected={id,image,bodyAlpha:ownData(record,'bodyAlpha'),metadata,frame,placement:{}};
    if(rectOf(selected))return{selected,record,id};
   }
  }
 }
 return null;
}
function inputAtOrigin(selected,rect){
 const descriptors=Object.getOwnPropertyDescriptors(selected),placement=ownData(selected,'placement');
 const p=placement&&Object.getOwnPropertyDescriptors(placement)||{};
 for(const [key,value]of Object.entries({x:16,y:16,width:rect.width,height:rect.height}))p[key]={value,writable:false,enumerable:true,configurable:false};
 const ownedPlacement=Object.freeze(Object.create(Object.prototype,p));
 descriptors.placement={value:ownedPlacement,writable:false,enumerable:true,configurable:false};
 return Object.freeze(Object.create(Object.getPrototypeOf(selected),descriptors));
}
function delta(a,b){
 let components=0,pixels=0,maxDelta=0;
 for(let i=0;i<a.length;i+=4){let changed=false;for(let channel=0;channel<4;channel++){const d=Math.abs(a[i+channel]-b[i+channel]);if(d){components++;changed=true;}maxDelta=Math.max(maxDelta,d);}if(changed)pixels++;}
 return{components,pixels,maxDelta};
}
function checker(ctx,width,height){
 ctx.clearRect(0,0,width,height);
 for(let y=0;y<height;y+=16)for(let x=0;x<width;x+=16){ctx.fillStyle=((x+y)/16)%2?'rgba(33,48,55,.35)':'rgba(13,28,35,.35)';ctx.fillRect(x,y,Math.min(16,width-x),Math.min(16,height-y));}
}

export function compareSpriteCallPixels(options={}){
 let location,query,storage;
 try{location=options.location??globalThis.location;query=options.query??new URLSearchParams(location?.search??'');storage=options.storage;}catch{}
 const report={available:false,complete:false,reason:'qa-origin-memory-opt-in-required',cases:[],images:[],cleanup:{scratchCreated:0,scratchReleased:0,errors:[],mainOwnersUnchanged:false,mainRecordsUnchanged:false,mainMappingUnchanged:false,nativeCacheUnchanged:false,complete:false},note:NOTE};
 if(!allowed(location,query,storage))return report;
 report.available=true;report.reason='inputs-unavailable';
 const scratch=new Set();let renderer,art,document,rendererBefore,artBefore,records,entriesBefore,manifest,enemies,mappingBefore,native,baked,sourceRecordBefore;
 const release=canvas=>{try{canvas.width=0;canvas.height=0;}catch(e){report.cleanup.errors.push({where:'scratch.release',error:errorText(e)});}};
 const makeCanvas=(width,height)=>{const canvas=document.createElement('canvas');scratch.add(canvas);report.cleanup.scratchCreated++;canvas.width=width;canvas.height=height;return canvas;};
 try{
  renderer=options.renderer;document=options.document??globalThis.document;
  if(!renderer||!document||typeof document.createElement!=='function'){report.reason='renderer-or-document-unavailable';return report;}
  rendererBefore=Object.getOwnPropertyDescriptors(renderer);art=ownData(renderer,'productionArt');
  if(!art){report.reason='original-art-unavailable';return report;}
  artBefore=Object.getOwnPropertyDescriptors(art);records=ownData(art,'records');entriesBefore=[...Map.prototype.entries.call(records)];manifest=ownData(art,'manifest');enemies=ownData(manifest,'enemies');mappingBefore=Object.getOwnPropertyDescriptors(enemies);
  native=nativeInput(renderer);baked=bakedInput(art);if(baked)sourceRecordBefore=Object.getOwnPropertyDescriptors(baked.record);
  for(const [kind,source]of [['native',native],['baked',baked]]){
   if(!source){report.cases.push({kind,available:false,complete:false,reason:'already-ready-original-input-missing'});continue;}
   const info=rectOf(source.selected),selected=inputAtOrigin(source.selected,info.rect),width=info.rect.width+32,height=info.rect.height+32,ownedArt={drawFrame:ProductionArt.prototype.drawFrame},ownedArtBefore=Object.getOwnPropertyDescriptors(ownedArt),canvases=[];
   const result={kind,available:true,complete:false,id:ownData(selected,'id')??null,rect:info.rect,sourceAtlas:info.sourceAtlas,scratchSize:{width,height},rawRGBAestimatePerArm:width*height*4,returns:[],differenceAB:null,differenceAA:null,descriptorsRestored:false,observerComplete:false,observer:null};report.cases.push(result);
   let observer=null;
   try{
    const arms=[];
    for(const name of ['A','B','A-repeat']){
     const canvas=makeCanvas(width,height);canvases.push(canvas);const ctx=canvas.getContext('2d',{alpha:true,willReadFrequently:true});if(!ctx)throw Error('sprite-pixel-context-unavailable');checker(ctx,width,height);const contextBefore=Object.getOwnPropertyDescriptors(ctx);
     if(name==='B'){observer=createSpriteCallProfile({renderer:{productionArt:ownedArt,ctx},limit:1,maxOutliers:8});observer.beginFrame({proof:kind});}
     let returned;try{returned=ownedArt.drawFrame(ctx,selected);}finally{if(observer){observer.endFrame();result.observer=observer.stop();observer=null;}}
     result.returns.push(returned);if(name==='B')result.descriptorsRestored=sameOwn(ownedArt,ownedArtBefore)&&sameOwn(ctx,contextBefore);
     arms.push({canvas,pixels:ctx.getImageData(0,0,width,height).data});
    }
    result.differenceAB=delta(arms[0].pixels,arms[1].pixels);result.differenceAA=delta(arms[0].pixels,arms[2].pixels);
    const stages=result.observer?.samples?.[0]?.stages;result.observerComplete=result.observer?.enabled===true&&result.observer.samples.length===1&&!result.observer.unmeasured.length&&['drawFrame','save','restore','drawImage','globalAlpha.get','globalAlpha.set','imageSmoothingEnabled.set','imageSmoothingQuality.set'].every(label=>stages?.[label]?.calls===1&&stages[label].thrownCalls===0);
    result.complete=result.returns.every(value=>value===true)&&result.descriptorsRestored&&result.observerComplete&&!result.differenceAB.components&&!result.differenceAA.components;
    if(!result.complete)result.reason='original-return-descriptor-or-rgba-mismatch';
    try{const panel=makeCanvas(width*2,height+24);canvases.push(panel);const ctx=panel.getContext('2d');ctx.fillStyle='#10222b';ctx.fillRect(0,0,panel.width,panel.height);ctx.drawImage(arms[0].canvas,0,24);ctx.drawImage(arms[1].canvas,width,24);ctx.fillStyle='#f1f5ef';ctx.font='12px sans-serif';ctx.fillText(kind+' A original',5,16);ctx.fillText('B observer · delta '+result.differenceAB.maxDelta,width+5,16);report.images.push({kind,src:panel.toDataURL(),alt:kind+' 원본 셀 A/B 계측 픽셀 검수 · '+String(result.id)});}catch(e){result.imageError=errorText(e);}
   }catch(e){result.error=errorText(e);result.reason='pixel-probe-failed';}
   finally{if(observer)try{result.observer=observer.stop();}catch(e){report.cleanup.errors.push({where:'observer.stop',error:errorText(e)});}for(const canvas of canvases)release(canvas);}
  }
  report.complete=report.cases.length===2&&report.cases.every(value=>value.complete);report.reason=report.complete?'selected-original-rgba-exact':'selected-inputs-incomplete-or-failed';
 }catch(e){report.reason='pixel-probe-failed';report.error=errorText(e);}
 finally{
  for(const canvas of scratch)try{if(canvas.width||canvas.height)release(canvas);if(canvas.width===0&&canvas.height===0)report.cleanup.scratchReleased++;}catch(e){report.cleanup.errors.push({where:'scratch.check',error:errorText(e)});}
  report.cleanup.mainOwnersUnchanged=!!rendererBefore&&sameOwn(renderer,rendererBefore)&&!!artBefore&&sameOwn(art,artBefore);
  try{const after=[...Map.prototype.entries.call(records)];report.cleanup.mainRecordsUnchanged=!!entriesBefore&&entriesBefore.length===after.length&&entriesBefore.every(([id,record],index)=>after[index][0]===id&&after[index][1]===record)&&(!baked||sameOwn(baked.record,sourceRecordBefore));}catch{}
  report.cleanup.mainMappingUnchanged=!!mappingBefore&&ownData(art,'manifest')===manifest&&ownData(manifest,'enemies')===enemies&&sameOwn(enemies,mappingBefore);
  try{report.cleanup.nativeCacheUnchanged=!native||ownData(renderer,'nativeActorFrames')===native.cache&&WeakMap.prototype.get.call(native.cache,native.actor)===native.selected;}catch{}
  report.cleanup.complete=report.cleanup.mainOwnersUnchanged&&report.cleanup.mainRecordsUnchanged&&report.cleanup.mainMappingUnchanged&&report.cleanup.nativeCacheUnchanged&&report.cleanup.scratchCreated===report.cleanup.scratchReleased&&!report.cleanup.errors.length;
  if(report.complete&&!report.cleanup.complete){report.complete=false;report.reason='pixel-probe-cleanup-or-owner-check-failed';}
 }
 return report;
}
