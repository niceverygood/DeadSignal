import {ProductionArt} from './production-art.js?v=0.29.0';
import {captureNativeCanvasAPI,createCanvasStateCandidate} from './qa-canvas-state.js';
import {isQAMemoryStorage} from './qa-storage.js';

const NOTE='8851 메모리 QA의 별도 동기 픽셀 검수입니다. 이미 준비된 원본 native NPC 셀과 baked walker/runner 셀을 최대 하나씩 재사용합니다. 새 리그 포즈·모델 렌더·preload·decode·fetch·메인 Canvas 그리기·Game 변경은 하지 않습니다. 입력별 5개 상태, options fallback 1개, 소유한 0×0 Canvas의 실제 draw 예외 1개로 최대 12조건을 검수합니다. 각 조건은 A 원본/B 후보/A 원본을 한 번씩 그리며 원본 반환값, RGBA, 호출자 상태, clip/path와 save-stack sentinel이 허용오차 없이 같아야 합니다. 후보 실행 횟수를 검사해 fallback만으로 품질 통과하지 않습니다. 원본 이미지·리그·레코드·매핑은 변경하지 않고 scratch Canvas를 순차 정리합니다. PNG는 입력별 대표 또는 실패 조건 하나씩, 최대 2개입니다. 선택된 두 셀의 상태 보존 검수이며 전체 월드·모든 동작·FPS·GPU 시간·성능 향상·peak memory 검증이 아닙니다. raw RGBA 크기는 기하학적 추정입니다.';
const APPLY=Reflect.apply;
const ownData=(object,key)=>{try{const d=object&&Object.getOwnPropertyDescriptor(object,key);return d&&'value'in d?d.value:undefined;}catch{}};
const sameDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
const sameOwn=(object,before)=>{try{const after=Object.getOwnPropertyDescriptors(object);return Reflect.ownKeys(before).length===Reflect.ownKeys(after).length&&Reflect.ownKeys(before).every(key=>sameDescriptor(before[key],after[key]));}catch{return false;}};
const text=e=>{try{return typeof e?.message==='string'?e.message:'canvas-state-pixel-failed';}catch{return'canvas-state-pixel-failed';}};
function allow(location,query,storage){try{return location?.protocol==='http:'&&['127.0.0.1','localhost','[::1]','::1'].includes(location.hostname)&&location.port==='8851'&&query.has('qa')&&query.has('qa-memory')&&query.get('qa-canvas-state')==='1'&&isQAMemoryStorage(storage);}catch{return false;}}
function readRect(selected){
 const frame=ownData(selected,'frame'),r=ownData(frame,'rect'),image=ownData(selected,'image'),rect={x:ownData(r,'x'),y:ownData(r,'y'),width:ownData(r,'width'),height:ownData(r,'height')};
 if(!image||!Object.values(rect).every(Number.isInteger)||rect.x<0||rect.y<0||rect.width<1||rect.height<1||rect.width>512||rect.height>512)return null;
 const width=image.width,height=image.height;return Number.isFinite(width)&&Number.isFinite(height)&&rect.x+rect.width<=width&&rect.y+rect.height<=height?{rect,atlas:{width,height}}:null;
}
function nativeInput(renderer){
 const set=ownData(renderer,'liveEnemySelection'),cache=ownData(renderer,'nativeActorFrames');
 try{for(const actor of Set.prototype.values.call(set)){const selected=WeakMap.prototype.get.call(cache,actor);if(ownData(ownData(selected,'metadata'),'liveRig')===true&&readRect(selected))return{selected,actor,cache};}}catch{}
 return null;
}
function bakedInput(art){
 const records=ownData(art,'records'),enemies=ownData(ownData(art,'manifest'),'enemies');
 for(const type of ['walker','runner']){
  const mapping=ownData(enemies,type),ids=[];if(typeof mapping==='string')ids.push(mapping);else for(const pose of ['walk','idle','actions']){const id=ownData(mapping,pose);if(typeof id==='string'&&!ids.includes(id))ids.push(id);}
  for(const id of ids){let record;try{record=Map.prototype.get.call(records,id);}catch{continue;}if(ownData(record,'status')!=='ready')continue;const image=ownData(record,'image'),metadata=ownData(record,'metadata'),frames=ownData(metadata,'frames');if(ownData(metadata,'format')!=='meshy-iso-sprite-atlas'||!Array.isArray(frames))continue;
   for(let i=0;i<frames.length;i++){const frame=ownData(frames,String(i)),selected={id,image,metadata,frame};if(frame&&readRect(selected))return{selected,record};}
  }
 }
 return null;
}
function controlledSelected(source,rect,image=ownData(source,'image')){
 return Object.freeze({id:ownData(source,'id'),image,metadata:ownData(source,'metadata'),frame:Object.freeze({rect:Object.freeze({...rect})}),placement:Object.freeze({x:16,y:16,width:rect.width,height:rect.height})});
}
function difference(a,b){
 let pixels=0,components=0,maxDelta=0;for(let i=0;i<a.length;i+=4){let changed=false;for(let k=0;k<4;k++){const d=Math.abs(a[i+k]-b[i+k]);if(d){components++;changed=true;}maxDelta=Math.max(maxDelta,d);}if(changed)pixels++;}return{pixels,components,maxDelta};
}
function state(ctx){
 const t=ctx.getTransform();return{transform:[t.a,t.b,t.c,t.d,t.e,t.f],globalAlpha:ctx.globalAlpha,smoothing:ctx.imageSmoothingEnabled,quality:ctx.imageSmoothingQuality,composite:ctx.globalCompositeOperation,filter:ctx.filter,shadowBlur:ctx.shadowBlur,shadowColor:ctx.shadowColor,shadowOffsetX:ctx.shadowOffsetX,shadowOffsetY:ctx.shadowOffsetY,fillStyle:ctx.fillStyle,strokeStyle:ctx.strokeStyle,lineWidth:ctx.lineWidth,lineCap:ctx.lineCap,lineJoin:ctx.lineJoin,miterLimit:ctx.miterLimit,lineDashOffset:ctx.lineDashOffset,lineDash:ctx.getLineDash(),font:ctx.font,textAlign:ctx.textAlign,textBaseline:ctx.textBaseline};
}
function baseState(ctx,width,height){
 ctx.clearRect(0,0,width,height);for(let y=0;y<height;y+=16)for(let x=0;x<width;x+=16){ctx.fillStyle=((x+y)/16)%2?'rgba(30,46,54,.35)':'rgba(11,25,32,.35)';ctx.fillRect(x,y,Math.min(16,width-x),Math.min(16,height-y));}
 ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=.875;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='medium';ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.shadowBlur=0;ctx.shadowColor='rgba(0,0,0,0)';ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;ctx.fillStyle='#306c98';ctx.strokeStyle='#a8bcca';ctx.lineWidth=1.25;ctx.lineCap='butt';ctx.lineJoin='miter';ctx.miterLimit=10;ctx.lineDashOffset=0;ctx.setLineDash([]);ctx.font='10px sans-serif';ctx.textAlign='start';ctx.textBaseline='alphabetic';
 return state(ctx);
}
function recipeState(ctx,recipe,width,height){
 ctx.globalAlpha=recipe.alpha;ctx.imageSmoothingEnabled=recipe.smoothing;ctx.imageSmoothingQuality=recipe.quality;ctx.fillStyle='#b6c87a';ctx.strokeStyle='#e7b05f';ctx.lineWidth=2.5;ctx.setLineDash([3,2]);ctx.lineDashOffset=.5;
 if(recipe.complex){ctx.setTransform(1,.08,.04,.95,4,5);ctx.globalCompositeOperation='multiply';ctx.filter='blur(0.5px)';ctx.shadowBlur=3;ctx.shadowColor='rgba(255,80,30,.4)';ctx.shadowOffsetX=3;ctx.shadowOffsetY=2;ctx.beginPath();ctx.rect(8,8,width-24,height-24);ctx.clip();}
 ctx.beginPath();ctx.moveTo(19,height-23);ctx.lineTo(width-19,height-23);ctx.lineTo(width/2,height-43);ctx.closePath();
 return state(ctx);
}
function sentinelStyle(ctx){ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.shadowBlur=0;ctx.shadowColor='rgba(0,0,0,0)';ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;ctx.strokeStyle='#ffa16c';ctx.lineWidth=2;ctx.setLineDash([]);ctx.fillStyle='rgba(210,45,96,.25)';}
const RECIPES=Object.freeze([
 Object.freeze({id:'alpha-zero',label:'alpha 0 · low',alpha:0,smoothing:true,quality:'low'}),
 Object.freeze({id:'half-unsmoothed',label:'alpha 0.5 · 보간 off',alpha:.5,smoothing:false,quality:'low'}),
 Object.freeze({id:'opaque-low',label:'alpha 1 · low',alpha:1,smoothing:true,quality:'low'}),
 Object.freeze({id:'opaque-high',label:'alpha 1 · high',alpha:1,smoothing:true,quality:'high'}),
 Object.freeze({id:'transform-clip-effects',label:'변환·clip·합성·filter·shadow',alpha:.5,smoothing:false,quality:'high',complex:true}),
]);

export function compareCanvasStatePixels(options={}){
 let location,query,storage;try{location=options.location??globalThis.location;query=options.query??new URLSearchParams(location?.search??'');storage=options.storage;}catch{}
 const report={available:false,complete:false,reason:'qa-origin-memory-opt-in-required',cases:[],images:[],cleanup:{scratchCreated:0,scratchReleased:0,errors:[],mainOwnersUnchanged:false,mainRecordsUnchanged:false,mainMappingUnchanged:false,nativeCacheUnchanged:false,complete:false},note:NOTE};if(!allow(location,query,storage))return report;
 report.available=true;const scratch=new Set();let renderer,document,art,rendererBefore,artBefore,records,entriesBefore,manifest,enemies,mappingBefore,native,baked,bakedBefore,api;
 const release=canvas=>{try{canvas.width=0;canvas.height=0;}catch(e){report.cleanup.errors.push({where:'scratch.release',error:text(e)});}};
 const make=(width,height)=>{const canvas=document.createElement('canvas');scratch.add(canvas);report.cleanup.scratchCreated++;canvas.width=width;canvas.height=height;return canvas;};
 function runCase(kind,source,recipe,{fallback=false,exceptionImage=null}={}){
  const info=readRect(source.selected),rect=info.rect,selected=controlledSelected(source.selected,rect,exceptionImage??ownData(source.selected,'image')),width=rect.width+64,height=rect.height+64,ownedArt={drawFrame:ProductionArt.prototype.drawFrame},artOwn=Object.getOwnPropertyDescriptors(ownedArt),canvases=[];
  const result={kind,recipe:recipe.id,label:recipe.label,exceptionFixture:!!exceptionImage,optionsFallback:fallback,available:true,complete:false,id:ownData(source.selected,'id')??null,sourceRect:rect,sourceAtlas:exceptionImage?{width:0,height:0}:info.atlas,scratchSize:{width,height},rawRGBAEstimatePerPhase:width*height*4,returns:[],statesUnchanged:[],callerStackStatesUnchanged:[],descriptorsUnchanged:[],candidate:null,candidateStopped:null,certified:false,differences:null};report.cases.push(result);let candidate=null;
  try{
   const arms=[];
   for(const armName of ['A','B','A-repeat']){
    const canvas=make(width,height);canvases.push(canvas);const ctx=canvas.getContext('2d',{alpha:true,willReadFrequently:true});if(!ctx)throw Error('canvas-state-context-unavailable');const contextOwn=Object.getOwnPropertyDescriptors(ctx),base=baseState(ctx,width,height);ctx.save();const before=recipeState(ctx,recipe,width,height),args=fallback?[ctx,selected,Object.freeze({alpha:.65})]:[ctx,selected];let returned;
    if(armName==='B'){candidate=createCanvasStateCandidate({context:ctx,original:ProductionArt.prototype.drawFrame,api,mode:'manual'});result.certified=candidate.certify(selected);try{returned=APPLY(candidate.drawFrame,ownedArt,args);}finally{result.candidate=candidate.report();candidate.stop();result.candidateStopped=candidate.report();candidate=null;}}
    else returned=APPLY(ProductionArt.prototype.drawFrame,ownedArt,args);
    result.returns.push(returned);const after=state(ctx);result.statesUnchanged.push(JSON.stringify(before)===JSON.stringify(after));
    const read=()=>{const value=ctx.getImageData(0,0,width,height).data;if(value.length!==width*height*4)throw Error('canvas-state-pixel-length-invalid');return value;};const drawPixels=read();
    ctx.save();sentinelStyle(ctx);ctx.stroke();ctx.fillRect(0,0,width,height);const clipPathPixels=read();ctx.restore();ctx.restore();const popped=state(ctx);result.callerStackStatesUnchanged.push(JSON.stringify(popped)===JSON.stringify(base));
    sentinelStyle(ctx);ctx.fillStyle='#4d163f';ctx.fillRect(0,0,width,height);const callerStackPixels=read();result.descriptorsUnchanged.push(sameOwn(ctx,contextOwn)&&sameOwn(ownedArt,artOwn));arms.push({canvas,drawPixels,clipPathPixels,callerStackPixels,before,after,popped});
   }
   result.differences={drawAB:difference(arms[0].drawPixels,arms[1].drawPixels),drawAA:difference(arms[0].drawPixels,arms[2].drawPixels),clipPathAB:difference(arms[0].clipPathPixels,arms[1].clipPathPixels),clipPathAA:difference(arms[0].clipPathPixels,arms[2].clipPathPixels),callerStackAB:difference(arms[0].callerStackPixels,arms[1].callerStackPixels),callerStackAA:difference(arms[0].callerStackPixels,arms[2].callerStackPixels)};
   result.callerState=arms[0].before;result.callerStackBase=arms[0].popped;result.statesMatchOriginal=[1,2].every(index=>['before','after','popped'].every(key=>JSON.stringify(arms[0][key])===JSON.stringify(arms[index][key])));
   const counters=result.candidate,used=fallback?counters?.candidateUsed===0&&counters?.fallback===1:counters?.candidateUsed===1&&counters?.fallback===0,expectedReturn=!exceptionImage;
   result.complete=result.certified===true&&used&&counters.falseReturns===(exceptionImage?1:0)&&result.candidateStopped?.stopped===true&&result.returns.every(value=>value===expectedReturn)&&result.statesMatchOriginal&&result.statesUnchanged.every(Boolean)&&result.callerStackStatesUnchanged.every(Boolean)&&result.descriptorsUnchanged.every(Boolean)&&Object.values(result.differences).every(value=>value.components===0);
   if(!result.complete){result.reason='return-state-sentinel-rgba-or-candidate-mismatch';result.stateProof={a:{before:arms[0].before,after:arms[0].after,popped:arms[0].popped},b:{before:arms[1].before,after:arms[1].after,popped:arms[1].popped},repeat:{before:arms[2].before,after:arms[2].after,popped:arms[2].popped}};}
   const previous=report.images.findIndex(value=>value.kind===kind),representative=recipe.id==='opaque-low'&&!fallback&&!exceptionImage,failed=!result.complete;
   if((representative||failed)&&(previous<0||!report.images[previous].failed))try{
    const panel=make(width*2,height+26);canvases.push(panel);const ctx=panel.getContext('2d'),cell=make(width,height);canvases.push(cell);const sourceCtx=cell.getContext('2d');ctx.fillStyle='#10222b';ctx.fillRect(0,0,panel.width,panel.height);for(const [index,arm]of [arms[0],arms[1]].entries()){sourceCtx.putImageData(new ImageData(arm.drawPixels,width,height),0,0);ctx.drawImage(cell,index*width,26);ctx.fillStyle='#f0f4ec';ctx.font='12px sans-serif';ctx.fillText((index?'B 후보':'A 원본')+' · '+kind+' · '+recipe.label,index*width+5,17);}const image={kind,recipe:recipe.id,failed,src:panel.toDataURL(),alt:kind+' Canvas 상태 원본/후보 · '+recipe.label+' · RGBA 차이 '+result.differences.drawAB.maxDelta};if(previous<0)report.images.push(image);else report.images[previous]=image;
   }catch(e){result.imageError=text(e);}
  }catch(e){result.reason='canvas-state-pixel-probe-failed';result.error=text(e);}
  finally{if(candidate)try{candidate.stop();}catch(e){report.cleanup.errors.push({where:'candidate.stop',error:text(e)});}for(const canvas of canvases)release(canvas);}
 }
 try{
  renderer=options.renderer;document=options.document??globalThis.document;if(!renderer||!document||typeof document.createElement!=='function'){report.reason='renderer-or-document-unavailable';return report;}
  rendererBefore=Object.getOwnPropertyDescriptors(renderer);art=ownData(renderer,'productionArt');if(!art){report.reason='original-art-unavailable';return report;}artBefore=Object.getOwnPropertyDescriptors(art);records=ownData(art,'records');entriesBefore=[...Map.prototype.entries.call(records)];manifest=ownData(art,'manifest');enemies=ownData(manifest,'enemies');mappingBefore=Object.getOwnPropertyDescriptors(enemies);native=nativeInput(renderer);baked=bakedInput(art);if(baked)bakedBefore=Object.getOwnPropertyDescriptors(baked.record);api=captureNativeCanvasAPI(globalThis);if(!api){report.reason='native-canvas-api-unavailable';return report;}
  for(const [kind,input]of [['native',native],['baked',baked]]){if(!input){report.cases.push({kind,available:false,complete:false,reason:'already-ready-original-input-missing'});continue;}for(const recipe of RECIPES)runCase(kind,input,recipe);}
  if(native){runCase('native',native,{...RECIPES[1],id:'options-alpha-fallback',label:'options alpha 0.65 · 원본 fallback'},{fallback:true});const empty=make(0,0);runCase('native',native,{...RECIPES[2],id:'empty-source-exception',label:'소유한 0×0 Canvas 실제 예외'},{exceptionImage:empty});release(empty);}
  report.complete=report.cases.length===12&&report.cases.every(value=>value.complete);report.reason=report.complete?'selected-canvas-state-rgba-exact':'selected-inputs-incomplete-or-failed';
 }catch(e){report.reason='canvas-state-pixel-probe-failed';report.error=text(e);}
 finally{
  for(const canvas of scratch)try{if(canvas.width||canvas.height)release(canvas);if(canvas.width===0&&canvas.height===0)report.cleanup.scratchReleased++;}catch(e){report.cleanup.errors.push({where:'scratch.check',error:text(e)});}
  report.cleanup.mainOwnersUnchanged=!!rendererBefore&&sameOwn(renderer,rendererBefore)&&!!artBefore&&sameOwn(art,artBefore);
  try{const after=[...Map.prototype.entries.call(records)];report.cleanup.mainRecordsUnchanged=!!entriesBefore&&entriesBefore.length===after.length&&entriesBefore.every(([id,record],i)=>after[i][0]===id&&after[i][1]===record)&&(!baked||sameOwn(baked.record,bakedBefore));}catch{}
  report.cleanup.mainMappingUnchanged=!!mappingBefore&&ownData(art,'manifest')===manifest&&ownData(manifest,'enemies')===enemies&&sameOwn(enemies,mappingBefore);
  try{report.cleanup.nativeCacheUnchanged=!native||ownData(renderer,'nativeActorFrames')===native.cache&&WeakMap.prototype.get.call(native.cache,native.actor)===native.selected;}catch{}
  report.cleanup.complete=report.cleanup.mainOwnersUnchanged&&report.cleanup.mainRecordsUnchanged&&report.cleanup.mainMappingUnchanged&&report.cleanup.nativeCacheUnchanged&&report.cleanup.scratchCreated===report.cleanup.scratchReleased&&!report.cleanup.errors.length;
  if(report.complete&&!report.cleanup.complete){report.complete=false;report.reason='canvas-state-cleanup-or-owner-check-failed';}
 }
 return report;
}
