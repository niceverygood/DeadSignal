// Separate opt-in peak contacts; the original seven phases/timeline stay intact.
const SIZE=512,PROFILE='boss02-fold-v1',PROGRESS=.72,own=Object.getOwnPropertyDescriptor;
const need=(value,message)=>{if(!value)throw Error('boss-fold-peaks-'+message);};
const finite=Number.isFinite;
function sameDescriptor(a,b){return !a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));}
function snapshot(value){const copy=JSON.parse(JSON.stringify(value));const freeze=item=>{if(item&&typeof item==='object'){for(const child of Object.values(item))freeze(child);Object.freeze(item);}return item;};return freeze(copy);}

export async function observeBossFoldPeaks({rig,art,adapter,boss,document,check,wait,yieldUI,registerSurface,onImage=()=>{},Renderer,helpers}){
 const report={complete:false,bossKey:boss?.id??null,profile:PROFILE,angles:[],nativeSamples:0,nativeGLSubmissions:0,protectedExact:true,sourceBeforeAfter:null,flagRestored:false,cleanupErrors:[],contact:{width:1024,height:2048,pairs:4,nativeCells:8},note:'Separate controlled boss02 windup .72 contacts at four original headings. A original/B fold profile use fresh independent actors and original512 native rendering. This is eight native observations, not another timeline, gameplay simulation, natural-motion threshold, performance measurement or product adoption. Source identities/full geometry bytes, root/feet, the existing40degree cap and nonclipping gates are retained. Raw RGBA exists only for the current pair; the PNG is callback-only and parent-owned surfaces are retired by the caller.'};
 const {originalModelSnapshot,verifyOriginalModel,handPoints,projectedHands,protectedPoints,protectedPositions,actorFixture,layerEvidence,byteDifference,sameNumbers,primitive}=helpers;
 let model,actionLayer,before,originalFlag,expectedFlag,sheet,failed=false,primary;
 const flag=value=>{need(sameDescriptor(own(rig,'bossActionLayerEnabled'),expectedFlag),'flag-owner-changed');rig.bossActionLayerEnabled=value;expectedFlag=own(rig,'bossActionLayerEnabled');};
 const current=()=>{check();need(rig.models.get(boss.id)===model&&model.actionLayer===actionLayer&&actionLayer.profile===PROFILE&&sameDescriptor(own(rig,'bossActionLayerEnabled'),expectedFlag),'model-profile-or-flag-changed');};
 try{
  need(boss?.id==='boss-02-final'&&boss.skill?.kind==='slam','boss02-required');
  need([check,wait,yieldUI,registerSurface,onImage].every(value=>typeof value==='function'),'callbacks-required');
  model=rig.models.get(boss.id);need(model&&rig.size===SIZE&&model.actionLayer?.profile===PROFILE,'loaded-original512-fold-profile-required');actionLayer=model.actionLayer;
  originalFlag=own(rig,'bossActionLayerEnabled');need(originalFlag&&Object.hasOwn(originalFlag,'value'),'own-flag-required');expectedFlag=originalFlag;
  before=originalModelSnapshot(model);const hands=handPoints(model),protectedBones=protectedPoints(model);need(protectedBones.length>=3,'protected-root-feet-required');
  current();sheet=document.createElement('canvas');registerSurface(sheet);sheet.width=1024;sheet.height=2048;const sc=sheet.getContext('2d',{alpha:true});need(sc,'canvas-context-required');
  const game={world:{},state:'playing',time:50};
  for(let angleIndex=0;angleIndex<4;angleIndex++){
   current();const angle=.35+angleIndex*Math.PI/2,pair=[];
   for(let arm=0;arm<2;arm++){
    flag(arm===1);const actor=actorFixture(boss,930000+angleIndex*2+arm,angle);Object.assign(actor,{attackState:'windup',attackTime:boss.skill.windup*(1-PROGRESS),hitFlash:0,dead:false,hp:boss.stats.hp});
    const framesBefore=rig.renderer.info.render.frame,selected=Renderer.prototype.nativeEnemyFrame.call(adapter,actor,game.time,game,boss);current();
    const d=rig.diagnostics,draws=rig.renderer.info.render.frame-framesBefore;
    need(selected?.image?.width===SIZE&&selected.image.height===SIZE&&selected.metadata?.liveRig&&rig.frames.get(actor)?.selected===selected,'actual-private512-required');registerSurface(selected.image);
    need(Number.isInteger(draws)&&draws>0&&d?.key===boss.id&&d.clip==='windup'&&d.continuousSampling,'actual-native-windup-required');
    report.nativeSamples++;report.nativeGLSubmissions+=draws;
    const layer=layerEvidence(d,arm===1,'windup',boss.skill.kind),bounds=selected.frame.alphaBounds,body=selected.placement?.bounds?.body;
    need(bounds&&[bounds.x,bounds.y,bounds.width,bounds.height].every(finite)&&bounds.x>=0&&bounds.y>=0&&bounds.width>0&&bounds.height>0&&bounds.x+bounds.width<=SIZE&&bounds.y+bounds.height<=SIZE&&selected.metadata.boundsKind==='alpha'&&d.clipped!==true&&body&&[body.left,body.top,body.right,body.bottom].every(finite),'unclipped-alpha-placement-required');
    const context=selected.image.getContext('2d',{willReadFrequently:true});need(context,'native-context-required');const rgba=context.getImageData(0,0,SIZE,SIZE).data;need(rgba.length===SIZE*SIZE*4,'rgba-required');
    pair.push({rgba,feet:protectedPositions(protectedBones),record:{nativeGLSubmissions:draws,clip:d.clip,layer,diagnostic:primitive(d),alphaBounds:{...bounds},bodyPlacement:{left:body.left,top:body.top,right:body.right,bottom:body.bottom},hands:projectedHands(hands,rig.camera)}});
    sc.drawImage(selected.image,0,0,SIZE,SIZE,arm*SIZE,angleIndex*SIZE,SIZE,SIZE);
   }
   report.protectedExact=sameNumbers(pair[0].feet,pair[1].feet);need(report.protectedExact,'root-feet-world-position-changed');
   report.angles.push({angle,pose:'windup',progress:PROGRESS,original:pair[0].record,candidate:pair[1].record,feetAndHipsExact:true,rgbaDifference:byteDifference(pair[0].rgba,pair[1].rgba)});await yieldUI();
  }
  current();report.sourceBeforeAfter=verifyOriginalModel(before);need(report.nativeSamples===8,'eight-native-samples-required');
  await wait(onImage({key:boss.id,src:sheet.toDataURL('image/png'),alt:'보스02 접힘 프로필 정점 .72: 네 방향 원본·후보 원본512 비교',width:1024,height:2048}));current();report.complete=true;
 }catch(error){failed=true;primary=error;}
 finally{
  if(originalFlag)try{if(sameDescriptor(own(rig,'bossActionLayerEnabled'),expectedFlag)){Object.defineProperty(rig,'bossActionLayerEnabled',originalFlag);report.flagRestored=true;}else throw Error('boss-fold-peaks-flag-owner-changed');}catch(error){report.cleanupErrors.push('flag-restore-failed');if(!failed){failed=true;primary=error;}}
  if(before)try{report.sourceBeforeAfter=verifyOriginalModel(before);}catch(error){report.sourceBeforeAfter={unchanged:false};report.cleanupErrors.push('source-check-failed');if(!failed){failed=true;primary=error;}}
 }
 report.complete=report.complete&&!failed&&report.flagRestored&&report.cleanupErrors.length===0;
 const result=snapshot(report);if(failed){try{Object.defineProperty(primary,'bossFoldPeaks',{value:result,configurable:true});}catch{}throw primary;}return result;
}
