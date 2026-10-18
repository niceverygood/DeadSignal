import {BOSS_CATALOG} from './campaign.js?v=0.29.0';
import {Renderer} from './renderer.js';

const active=new WeakSet(),SIZE=512,POSES=['idle','walk','windup','attack','hit','death'];
const NOTE='Controlled original-boss pose fixtures, not24 complete fights or a claim of natural motion, new frames, physics changes or presented FPS. Each pose uses a separate actor; walk has an explicit original-path clock seed followed by three distance-driven samples. Actual private512 RGBA, body-region differences, native clip selection and original WebGL submissions are checked. Distinctness uses byte comparisons; FNV1a32 hashes are diagnostic summaries. Pixel reads/contact sheets are correctness work, never performance samples. At most one loaded model/two current atlases are retained; the caller owns the isolated adapter and final/late-load GPU and image cleanup. GLTF/Image loads already started cannot be cancelled by this observer.';
const ownData=(object,key)=>{const d=object&&Object.getOwnPropertyDescriptor(object,key);return d&&Object.hasOwn(d,'value')?d:null;};
const sameDescriptor=(a,b)=>!!a===!!b&&(!a||Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.is(a[key],b[key])));
const finite=Number.isFinite;
function abortError(){const error=new Error('boss-pose-audit-aborted');error.name='AbortError';return error;}
function need(value,message){if(!value)throw new Error('boss-pose-audit-'+message);}
function rgbaHash(data){let hash=2166136261;for(let i=0;i<data.length;i++)hash=Math.imul(hash^data[i],16777619);return (hash>>>0).toString(16).padStart(8,'0');}
function differences(a,b){
 const left=Math.min(a.bounds.x,b.bounds.x),top=Math.min(a.bounds.y,b.bounds.y),right=Math.max(a.bounds.x+a.bounds.width,b.bounds.x+b.bounds.width),bottom=Math.max(a.bounds.y+a.bounds.height,b.bounds.y+b.bounds.height);
 let components=0,bodyComponents=0,maxDelta=0;
 for(let index=0;index<a.rgba.length;index++)if(a.rgba[index]!==b.rgba[index]){
  components++;maxDelta=Math.max(maxDelta,Math.abs(a.rgba[index]-b.rgba[index]));
  const pixel=index>>>2,x=pixel%SIZE,y=Math.floor(pixel/SIZE);if(x>=left&&x<right&&y>=top&&y<bottom)bodyComponents++;
 }
 return {from:a.sampleIndex,to:b.sampleIndex,differentComponents:components,bodyDifferentComponents:bodyComponents,maxDelta,bodyRegion:{x:left,y:top,width:right-left,height:bottom-top}};
}
function actionDuration(boss){const skill=boss.skill;return finite(skill.kind==='shield'?skill.guardDuration??skill.duration:skill.duration)?(skill.kind==='shield'?skill.guardDuration??skill.duration:skill.duration):skill.kind==='shield'?3:skill.kind==='leap'?.5:skill.kind==='pull'?1.1:.75;}
function placementProof(selected){
 const b=selected.placement?.bounds?.body,o=selected.placement?.bounds?.outline,foot=selected.placement?.groundFoot||selected.placement?.foot;
 need(b&&o&&foot&&[b.left,b.top,b.right,b.bottom,o.left,o.top,o.right,o.bottom,foot.x,foot.y].every(finite),'placement-invalid');
 return {body:{left:b.left,top:b.top,right:b.right,bottom:b.bottom},outline:{left:o.left,top:o.top,right:o.right,bottom:o.bottom},groundFoot:{x:foot.x,y:foot.y},groundingHeight:selected.placement.groundingHeight??0};
}

// The caller creates and owns this adapter; no main Renderer/Game/save is used.
export async function inspectOriginalBossPoses(adapter,{signal,onProgress,onImage}={}){
 need(adapter&&typeof adapter==='object'&&!active.has(adapter),'adapter-unavailable');
 if(signal?.aborted)throw abortError();
 const keys=['productionArt','liveBoss','canvas'],owners=keys.map(key=>ownData(adapter,key));
 need(owners.every(Boolean),'own-adapter-required');
 const [art,rig,canvas]=owners.map(d=>d.value),method=adapter.nativeEnemyFrame;
 need(Object.getPrototypeOf(adapter)===Renderer.prototype&&method===Renderer.prototype.nativeEnemyFrame,'original-renderer-method-required');
 need(art&&typeof art.load==='function'&&typeof art.get==='function'&&typeof art.releaseUnusedAssets==='function'&&art.records instanceof Map,'owned-art-required');
 need(rig?.size===SIZE&&rig.models instanceof Map&&typeof rig.load==='function'&&typeof rig.releaseUnused==='function'&&typeof rig.frame==='function'&&rig.renderer,'owned512-rig-required');
 need(canvas?.getContext&&rig.renderer.domElement!==canvas,'private-canvas-required');
 const documentOwner=canvas.ownerDocument||globalThis.document;
 need(typeof documentOwner?.createElement==='function','canvas-document-unavailable');
 const check=()=>{
  if(signal?.aborted)throw abortError();
  need(keys.every((key,index)=>sameDescriptor(Object.getOwnPropertyDescriptor(adapter,key),owners[index]))&&adapter.nativeEnemyFrame===method,'adapter-owner-changed');
  need(!rig.lost&&!rig.error,'rig-error-or-lost');
  need(!rig.batch&&!rig.gpuPoseBounds&&!rig.directAlphaReadback&&!rig.verifyAlphaReadback&&!rig.cropNativeComposite&&!rig.batchInkComposite&&!rig.exactGPUAlphaBounds&&!rig.verifyExactGPUAlphaBounds,'cpu-original-path-required');
 };
 const wait=async promise=>{
  check();let listener;
  const cancelled=new Promise((_resolve,reject)=>{listener=()=>reject(abortError());signal?.addEventListener('abort',listener,{once:true});if(signal?.aborted)listener();});
  try{const value=await Promise.race([Promise.resolve(promise),cancelled]);check();return value;}
  finally{signal?.removeEventListener('abort',listener);}
 };
 const reports=[],epoch={},game={world:epoch,time:0,state:'playing'},notify=async info=>{if(typeof onProgress==='function')await wait(onProgress(info));};let sheet=null;
 active.add(adapter);
 try{
  for(const [bossIndex,boss]of BOSS_CATALOG.entries()){
   check();await notify({phase:'load',index:bossIndex,total:BOSS_CATALOG.length,key:boss.id,name:boss.name});
   const mapping=art.manifest?.bosses?.[boss.id],ids=[...new Set(typeof mapping==='string'?[mapping]:Object.values(mapping||{}))];
   need(ids.length===2&&ids.every(id=>typeof id==='string'&&art.manifest.assets?.[id]),'two-original-atlases-required');
   rig.releaseUnused([boss.id]);art.releaseUnusedAssets(ids);check();
   for(const id of ids)need(await wait(art.load(id))===true,'original-atlas-not-ready');
   need(await wait(rig.load(boss.id))===true,'original-model-not-ready');
   const model=rig.models.get(boss.id);
   need(model&&model.sampler?.skins?.length&&model.bones?.length,'original-skin-required');
   need(rig.models.size===1&&art.records.size===2&&ids.every(id=>art.get(id)?.status==='ready'),'bounded-original-assets-required');
   const modelIdentity=model,atlasRecords=ids.map(id=>art.get(id)),atlasImages=atlasRecords.map(record=>record.image),atlasMetadata=atlasRecords.map(record=>record.metadata);
   const sourceCheck=()=>{check();need(rig.models.get(boss.id)===modelIdentity&&ids.every((id,index)=>art.get(id)===atlasRecords[index]&&atlasRecords[index].image===atlasImages[index]&&atlasRecords[index].metadata===atlasMetadata[index]),'original-source-changed');};
   sheet=documentOwner.createElement('canvas');sheet.width=3*176;sheet.height=POSES.length*194;
   const sheetContext=sheet.getContext('2d',{alpha:false});need(sheetContext,'contact-sheet-context-unavailable');
   sheetContext.fillStyle='#182a31';sheetContext.fillRect(0,0,sheet.width,sheet.height);sheetContext.font='11px sans-serif';sheetContext.textBaseline='top';
   const report={key:boss.id,name:boss.name,role:boss.role,source:String(model.config.original||''),registeredSourceSha256:String(model.config.sha256||''),sourceShaIsRegistryOnly:true,skins:model.sampler.skins.length,bones:model.bones.length,modelLimit:rig.models.size,atlasLimit:art.records.size,poses:[]};
   reports.push(report);
   for(const [poseIndex,pose]of POSES.entries()){
    sourceCheck();await notify({phase:'pose',index:bossIndex,total:BOSS_CATALOG.length,key:boss.id,name:boss.name,pose});
    const actor={id:1+bossIndex*POSES.length+poseIndex,x:1400,y:900,r:boss.stats.r,type:boss.role==='mid'?'elite':'collector',bossKey:boss.id,bossRole:boss.role,hp:boss.stats.hp,maxHp:boss.stats.hp,speed:boss.stats.speed,angle:.35,stun:0,vx:0,vy:0,hitFlash:0,walkPhase:0,attackCd:0,skillCd:boss.skill.cooldown,attackState:'walk',attackTime:0,dead:false};
    const samples=[],frames=[];let walkSeedDraws=0;
    if(pose==='walk'){
     game.time=10+bossIndex*10+poseIndex;const before=rig.renderer.info.render.frame;
     const seeded=method.call(adapter,actor,game.time,game,boss);sourceCheck();need(seeded?.metadata?.liveRig&&rig.renderer.info.render.frame>before,'walk-clock-seed-native-required');walkSeedDraws=rig.renderer.info.render.frame-before;
    }
    for(let sampleIndex=0;sampleIndex<3;sampleIndex++){
     sourceCheck();const progress=[.1,.43,.79][sampleIndex];
     game.time=10+bossIndex*10+poseIndex+(pose==='walk'?(sampleIndex+1)*.3:[.15,.6,1.1][sampleIndex]);
     actor.hitFlash=0;actor.attackState='walk';actor.attackTime=0;actor.dead=false;actor.hp=boss.stats.hp;
     if(pose==='walk')actor.x+=boss.stats.speed*.3;
     if(pose==='windup'){actor.attackState='windup';actor.attackTime=boss.skill.windup*(1-progress);}
     if(pose==='attack'){actor.attackState='charge';actor.attackTime=actionDuration(boss)*(1-progress);}
     if(pose==='hit')actor.hitFlash=.12*(1-progress);
     const before=rig.renderer.info.render.frame;let selected;
     if(pose==='death'){
      actor.dead=true;actor.hp=0;const age=model.config.clips.death.duration*progress;
      const fallback=art.bossFrame(boss.id,actor,{simulationTime:game.time,pose:'death',animationTime:age});
      need(fallback,'original-death-fallback-required');
      const height=art.manifest.assets[fallback.id]?.worldHeight||fallback.metadata.projection.subjectHeight;
      selected=rig.frame(boss.id,actor,game.time,fallback,{epoch,height,pose:'death',animationTime:age});
     }else selected=method.call(adapter,actor,game.time,game,boss);
     sourceCheck();const diagnostics=rig.diagnostics,draws=rig.renderer.info.render.frame-before;
     need(selected?.metadata?.liveRig===true&&draws>0&&diagnostics?.key===boss.id&&diagnostics.clip===pose&&diagnostics.continuousSampling===true,'actual-native-'+pose+'-required');
     need(selected.image?.width===SIZE&&selected.image?.height===SIZE&&!atlasImages.includes(selected.image)&&rig.frames.get(actor)?.selected===selected,'private512-frame-required');
     need(selected.metadata.boundsKind==='alpha'&&selected.frame?.rect?.x===0&&selected.frame.rect.y===0&&selected.frame.rect.width===SIZE&&selected.frame.rect.height===SIZE,'original512-alpha-path-required');
     const bounds=selected.frame.alphaBounds;
     need(bounds&&[bounds.x,bounds.y,bounds.width,bounds.height].every(finite)&&bounds.x>=0&&bounds.y>=0&&bounds.width>0&&bounds.height>0&&bounds.x+bounds.width<=SIZE&&bounds.y+bounds.height<=SIZE,'alpha-bounds-invalid');
     const context=selected.image.getContext('2d',{willReadFrequently:true});need(context,'private-frame-context-unavailable');
     const rgba=context.getImageData(0,0,SIZE,SIZE).data;need(rgba?.length===SIZE*SIZE*4,'actual-rgba-required');
     const placement=placementProof(selected),sample={sampleIndex,time:game.time,requestedActionProgress:['windup','attack','hit','death'].includes(pose)?progress:null,clip:diagnostics.clip,clipName:String(selected.metadata.animation?.name||''),sample:diagnostics.sample,sampleDensity:diagnostics.sampleDensity,continuousSampling:true,liveRig:true,nativeGLSubmissions:draws,phase:selected.locomotion?.phase??null,moveWeight:diagnostics.moveWeight??null,alphaBounds:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height},placement,clipped:diagnostics.clipped===true,rgbaHashFNV1a32:rgbaHash(rgba),rgbaBytes:rgba.length,rigError:String(rig.error||''),contextLost:!!rig.lost};
     samples.push(sample);frames.push({sampleIndex,rgba,bounds:sample.alphaBounds});
     sheetContext.drawImage(selected.image,sampleIndex*176,poseIndex*194,176,176);sheetContext.fillStyle=sample.clipped?'#ffbc8a':'#e0e8dd';sheetContext.fillText(pose+' '+sample.sample+'/'+sample.sampleDensity+(sample.clipped?' CLIPPED':''),sampleIndex*176+4,poseIndex*194+177);
    }
    const comparisons=[differences(frames[0],frames[1]),differences(frames[0],frames[2]),differences(frames[1],frames[2])],distinctRGBA=1+(comparisons[0].differentComponents>0?1:0)+(comparisons[1].differentComponents>0&&comparisons[2].differentComponents>0?1:0);
    const poseReport={pose,walkClockSeedSubmissions:walkSeedDraws,samples,comparisons,distinctRGBA,actualBodyMotion:comparisons.every(item=>item.bodyDifferentComponents>0),unclipped:samples.every(sample=>!sample.clipped)};report.poses.push(poseReport);frames.length=0;
    need(distinctRGBA===3&&poseReport.actualBodyMotion,'visible-body-motion-missing-'+boss.id+'-'+pose);
   }
   report.nativeGLSubmissions=report.poses.reduce((sum,pose)=>sum+pose.walkClockSeedSubmissions+pose.samples.reduce((n,sample)=>n+sample.nativeGLSubmissions,0),0);
   report.actualAllPosesMotion=report.poses.every(pose=>pose.actualBodyMotion&&pose.distinctRGBA===3);report.unclipped=report.poses.every(pose=>pose.unclipped);sourceCheck();
   if(typeof onImage==='function'){const src=sheet.toDataURL('image/png');await wait(onImage({phase:'boss-poses',key:boss.id,bossKey:boss.id,name:boss.name,src,alt:boss.id+' '+boss.name+' 원본512 대기·걷기·예고·공격·피격·사망 각3시점',width:sheet.width,height:sheet.height}));sourceCheck();}
   sheet.width=sheet.height=1;sheet=null;
  }
  check();return {reports,note:NOTE};
 }catch(error){try{error.poseAudit={reports,note:NOTE};}catch{}throw error;}
 finally{if(sheet)try{sheet.width=sheet.height=1;}catch{}active.delete(adapter);}
}
