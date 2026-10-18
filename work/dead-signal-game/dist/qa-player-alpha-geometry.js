import {createQAStorage,isQAMemoryStorage} from './qa-storage.js';

const SIZE=256,RGBA_BYTES=SIZE*SIZE*4,RAW_LIMIT=12*RGBA_BYTES;
const active=new WeakSet(),installedDocuments=new WeakSet();
const POSES=Object.freeze([
 Object.freeze({label:'idle',dx:0,dy:0,angle:0,time:0}),
 Object.freeze({label:'walk-forward',dx:4,dy:0,angle:0,time:.125}),
 Object.freeze({label:'walk-strafe',dx:0,dy:4,angle:0,time:.25}),
 Object.freeze({label:'walk-back',dx:-4,dy:0,angle:0,time:.375}),
 Object.freeze({label:'run-strafe',dx:0,dy:-12,angle:Math.PI/4,time:.5}),
 Object.freeze({label:'run-turn',dx:8,dy:8,angle:-Math.PI/4,time:.625}),
]);
const NOTE='Separate8851 genuine-memory QA. Only an owned original LivePlayerRig and owned ProductionArt are loaded; no Game, tick, main Renderer or user state is used. Twelve controlled render-only actor samples (two weapons, six movement/aim histories) call the original public player.frame API. Its original two GL draws and original body read are unchanged. One additional post-frame native body Canvas RGBA capture per sample is quality/input collection only. Body geometry is compared exactly; contact sheets separately show the original armed colour/outline canvas, not the computational mask. The fused helper is not installed in rasterFrame: these checks do not certify whole-canvas candidate AB or relax any previous failed native frame gate. Fixed CPU helper A1/B/A2 uses those same cached native RGBA inputs,120 warmup calls per arm outside timing and2400 calls per arm in12 batches of200. Both paths include the same scalar output consumer; timings are CPU call wall, not GPU time, presented FPS, whole-frame improvement or peak memory. No retries or product adoption. Browser URL/decoded/driver caches can remain resident. Failed parallel player loads can have unobservable sibling requests, explicitly making cleanup unproven. Original loadModels also creates an animation-only authored GLTF scene outside its model map; this route retires visible owned models/materials/textures, not a separately unretained loader graph. Raw RGBA storage is bounded to3MiB, one1KiB row scratch is reused, and returned geometry objects are fresh.';
const message=error=>{try{return String(error?.message??error).slice(0,240);}catch{return'player-alpha-geometry-error';}};
const equal=(a,b)=>{
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return false;
 const ka=Reflect.ownKeys(a),kb=Reflect.ownKeys(b);
 return ka.length===kb.length&&ka.every((key,index)=>key===kb[index]&&equal(a[key],b[key]));
};
const sameBytes=(a,b)=>{if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const clone=value=>JSON.parse(JSON.stringify(value));
const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b);return{count:values.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1),sumMs:values.reduce((n,value)=>n+value,0)};};
function allowed(location,query){try{return location?.protocol==='http:'&&['localhost','127.0.0.1','[::1]','::1'].includes(location.hostname)&&location.port==='8851'&&query.has('qa')&&query.has('qa-memory')&&query.get('qa-player-alpha-geometry')==='1';}catch{return false;}}
async function dependencies(){
 const [player,art,manifest,geometry,bounds,tracker,three]=await Promise.all([
  import('./player-rig/live-player.js'),import('./production-art.js?v=0.29.0'),import('./production-manifest.js?v=0.29.0'),import('./player-alpha-geometry.js'),import('./native-alpha-bounds.js'),import('./qa-owned-cleanup-tracker.js'),import('./player-rig/vendor/three.module.js'),
 ]);
 return{LivePlayerRig:player.LivePlayerRig,ProductionArt:art.ProductionArt,productionManifest:manifest.productionManifest,scanFixedPlayerAlphaGeometry:geometry.scanFixedPlayerAlphaGeometry,nativeAlphaBounds:bounds.nativeAlphaBounds,bodyIdentificationContour:art.bodyIdentificationContour,createOwnedCleanupTracker:tracker.createOwnedCleanupTracker,Cache:three.Cache};
}
function geometryFromOriginal(deps,rgba){
 const alphaBounds=deps.nativeAlphaBounds(rgba,SIZE,SIZE)||{x:SIZE,y:SIZE,width:1,height:1};
 const coreBounds={x:alphaBounds.x,y:alphaBounds.y,width:alphaBounds.width,height:alphaBounds.height*.72};
 return{alphaBounds,coreBounds,bodyIdentificationContour:deps.bodyIdentificationContour(rgba,SIZE,SIZE,alphaBounds,coreBounds)};
}
function aliasCorrect(value){const c=value.bodyIdentificationContour;return !c||c.top[0]===c.left[0]&&c.top[1]===c.right[0];}
function consume(value){
 let result=value.alphaBounds.x+value.alphaBounds.y+value.alphaBounds.width+value.alphaBounds.height+value.coreBounds.x+value.coreBounds.y+value.coreBounds.width+value.coreBounds.height;
 const c=value.bodyIdentificationContour;if(c){for(let i=0;i<c.left.length;i++)result+=c.left[i].x+c.left[i].y+c.right[i].x+c.right[i].y;result+=c.top[0].x+c.top[1].x;}
 return result;
}
function hashBytes(bytes){let hash=2166136261;for(let i=0;i<bytes.length;i++)hash=Math.imul(hash^bytes[i],16777619)>>>0;return hash.toString(16).padStart(8,'0');}
function hashText(value){return hashBytes(new TextEncoder().encode(JSON.stringify(value)));}
function rawExport(frames){
 return JSON.stringify({version:1,width:SIZE,height:SIZE,format:'RGBA8',byteLength:frames.length*RGBA_BYTES,frames:frames.map(frame=>{
  let binary='';for(let at=0;at<frame.rgba.length;at+=8192)binary+=String.fromCharCode(...frame.rgba.subarray(at,at+8192));
  return{weapon:frame.weapon,index:frame.index,poseLabel:frame.poseLabel,rgbaBase64:btoa(binary)};
 })});
}
function yieldOwned(signal){
 if(signal?.aborted)return Promise.reject(Error('player-alpha-geometry-aborted'));
 if(typeof MessageChannel!=='function')return Promise.resolve();
 return new Promise((resolve,reject)=>{const channel=new MessageChannel();const finish=error=>{channel.port1.onmessage=null;channel.port1.close();channel.port2.close();signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve();};const abort=()=>finish(Error('player-alpha-geometry-aborted'));channel.port1.onmessage=()=>finish();signal?.addEventListener('abort',abort,{once:true});channel.port2.postMessage(0);});
}

export async function capturePlayerAlphaGeometry(options={}){
 const location=options.location??globalThis.location,query=options.query??new URLSearchParams(location?.search??'');
 if(!allowed(location,query))return{report:{available:false,complete:false,reason:'8851-genuine-memory-qa-required'},rawFrames:[]};
 const storage=options.storage;
 if(!isQAMemoryStorage(storage))return{report:{available:false,complete:false,reason:'8851-genuine-memory-qa-required'},rawFrames:[]};
 const {document=globalThis.document,signal,onProgress=()=>{},onImage=()=>{},now=()=>performance.now(),testDeps}=options;
 if(!document||typeof document!=='object'||active.has(document))throw Error('player-alpha-geometry-invalid-or-active-document');
 if(signal?.aborted)throw Error('player-alpha-geometry-aborted');
 active.add(document);
 const rawFrames=[],sheets=[];
 const cleanup={complete:false,closing:false,unprovenPlayerParallelLoads:false,knownPlayerPromises:0,modelsRemaining:null,weaponsRemaining:null,recordsRemaining:null,canvasesReleased:false,contextRetired:false,resourceRefsCleared:false,ownedDrain:null,errors:[]};
 const report={available:true,complete:false,injected:testDeps!==undefined||Object.hasOwn(options,'now'),clockInjected:Object.hasOwn(options,'now'),captured:0,rawBytes:0,rawByteLimit:RAW_LIMIT,validationCopyByteLimit:RGBA_BYTES,rowScratchBytes:1024,rowScratchReleased:false,glDraws:0,bodyCaptureReads:0,samples:[],performance:null,cleanup,note:NOTE+' One additional256KiB validation copy is live at a time, outside timers; the3MiB limit describes retained raw inputs, not peak process memory. FNV32 fields are diagnostics only; equality is checked by full byte comparison and recursive Object.is geometry comparison. Dependency or external-clock injection is diagnostic only and cannot certify a CPU-helper win.'};
 let deps=null,art=null,rig=null,rowEdges=null,tracker=null,primary=null,failed=false,prepared=false,finalReport=null;
 const followed=new Set(),disposed=new WeakSet();
 const clock=()=>{const value=now();if(typeof value!=='number'||!Number.isFinite(value))throw Error('player-alpha-geometry-invalid-clock');return value;};
 const check=()=>{if(signal?.aborted)throw Error('player-alpha-geometry-aborted');if(deps?.Cache?.enabled!==false)throw Error('player-alpha-geometry-shared-three-cache-unsupported');};
 const cleanupError=(where,error)=>{if(cleanup.errors.length<24)cleanup.errors.push({where,error:message(error)});};
 const attempt=(where,fn)=>{try{return fn();}catch(error){cleanupError(where,error);}};
 const once=(where,value,fn)=>{if(!value||disposed.has(value))return;disposed.add(value);attempt(where,fn);};
 function follow(promise,key){
  if(!promise||typeof promise.then!=='function'||followed.has(promise))return;
  followed.add(promise);cleanup.knownPlayerPromises++;
  let accepted=false;
  try{accepted=tracker.follow(promise,{arm:'capture',kind:'owned-load',key},()=>{if(cleanup.closing)retire();});}catch(error){cleanupError('tracker.follow',error);}
  if(!accepted){cleanupError('tracker.follow',Error('player-alpha-geometry-unobserved-promise'));Promise.resolve(promise).then(()=>{if(cleanup.closing)attempt('fallback.late-retire',retire);},()=>{if(cleanup.closing)attempt('fallback.late-retire',retire);});}
 }
 function retire(){
  if(rig){
   for(const [index,promise]of [rig.pending,rig.bottlePromise,...(rig.weaponLoads?.values?.()??[])].entries())follow(promise,'player-'+index);
   const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
   const roots=new Set([rig.bottle,...[...(rig.models?.values?.()??[])].flatMap(model=>[model.root,model.subject]),...[...(rig.weapons?.values?.()??[])].map(weapon=>weapon.root)].filter(Boolean));
   for(const root of roots)attempt('player.traverse',()=>root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.skeleton)skeletons.add(object.skeleton);for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}}));
   for(const value of skeletons)once('player.skeleton',value,()=>value.dispose?.());
   for(const value of geometries)once('player.geometry',value,()=>value.dispose?.());
   for(const value of materials)once('player.material',value,()=>value.dispose?.());
   for(const value of textures){once('player.texture',value,()=>value.dispose?.());const image=value.source?.data;if(image)once('player.bitmap',image,()=>image.close?.());}
   attempt('player.alphaReadback',()=>rig.alphaReadback?.dispose?.());
   once('player.context',rig.renderer,()=>{attempt('player.renderer.dispose',()=>rig.renderer.dispose());attempt('player.renderer.forceContextLoss',()=>rig.renderer.forceContextLoss());cleanup.contextRetired=true;});
   for(const canvas of [rig.body,rig.canvas,rig.ink,rig.bottleCanvas,rig.renderer?.domElement])if(canvas)attempt('player.canvas',()=>{canvas.width=0;canvas.height=0;});
   attempt('player.scene',()=>rig.scene?.clear());attempt('player.models',()=>rig.models?.clear());attempt('player.weapons',()=>rig.weapons?.clear());attempt('player.weaponLoads',()=>rig.weaponLoads?.clear());
   rig.bottle=null;rig.last=null;rig.blend=null;rig.deathState=null;rig.actionReferences?.clear?.();
  }
  if(art)attempt('art.release',()=>{art.onChange=null;art.releaseUnusedAssets([]);});
 }
 async function wait(promise,key){
  follow(promise,key);check();
  let timer,abort;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('player-alpha-geometry-'+key+'-timeout')),15000);abort=()=>reject(Error('player-alpha-geometry-aborted'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();})]);}
  finally{clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort);}
 }
 try{
  deps=testDeps??await dependencies();check();
  tracker=deps.createOwnedCleanupTracker({timeoutMs:15000});
  art=new deps.ProductionArt({manifest:deps.productionManifest,onChange:null});
  rig=new deps.LivePlayerRig();rowEdges=new Uint16Array(SIZE*2);
  if(rig.directAlphaReadback!==false||rig.verifyAlphaReadback!==false||rig.renderer.info.render.frame!==0)throw Error('player-alpha-geometry-fresh-original-player-required');
  for(const weapon of ['shotgun','nailgun']){
   check();prepared=false;onProgress({weapon,phase:'load'});
   const id='survivor-'+weapon+'-idle',load=Promise.resolve(art.load(id));
   if(!await wait(load,'art-'+weapon))throw Error('player-alpha-geometry-original-art-load-failed');
   if(!await wait(Promise.resolve(rig.load(weapon)),'player-'+weapon))throw Error('player-alpha-geometry-original-player-load-failed');
   prepared=true;check();
   const actor={x:900,y:650,r:14,hp:100,weapon,angle:0,walkPhase:0,recoil:0,reloadTime:0,dashTime:0};
   const sheet=document.createElement('canvas');sheet.width=SIZE*3;sheet.height=SIZE*2;const sheetContext=sheet.getContext('2d');if(!sheetContext)throw Error('player-alpha-geometry-sheet-context-required');
   sheets.push({weapon,canvas:sheet});
   for(let index=0;index<POSES.length;index++){
    check();const sample=POSES[index];actor.x+=sample.dx;actor.y+=sample.dy;actor.angle=sample.angle;
    const actorBefore=JSON.stringify(actor),fallback=art.frame(id,{foot:{x:0,y:0},worldHeight:44,angle:actor.angle,stationary:true});
    if(!fallback)throw Error('player-alpha-geometry-original-fallback-required');
    onProgress({weapon,phase:'capture',index,total:12});
    const before=rig.renderer.info.render.frame,selected=rig.frame(actor,sample.time,fallback,{hitFlash:0,throwMotion:null,reloadDuration:0}),after=rig.renderer.info.render.frame;
    const rect=selected?.frame?.rect;
    if(!selected||selected.id!=='survivor-original-live-rig'||selected.image!==rig.canvas||selected.bodyAlpha!==rig.body||!rect||rect.x!==0||rect.y!==0||rect.width!==SIZE||rect.height!==SIZE||after-before!==2||JSON.stringify(actor)!==actorBefore||rig.error||!rig.ready)throw Error('player-alpha-geometry-original-native-frame-required');
    if(!['x','y','z'].every(key=>Number.isFinite(selected.frame.weaponMuzzle?.[key])))throw Error('player-alpha-geometry-original-muzzle-required');
    // Both source canvases are reused by the next original frame. Copy the
    // armed colour cell now; the geometry input remains the pre-weapon body.
    sheetContext.drawImage(selected.image,index%3*SIZE,Math.floor(index/3)*SIZE);
    const rgba=rig.bodyContext.getImageData(0,0,SIZE,SIZE).data;
    if(!(rgba instanceof Uint8ClampedArray)||rgba.length!==RGBA_BYTES)throw Error('player-alpha-geometry-native-rgba-required');
    report.glDraws+=after-before;report.bodyCaptureReads++;
    rawFrames.push({weapon,index,poseLabel:sample.label,rgba});report.captured=rawFrames.length;report.rawBytes=rawFrames.length*RGBA_BYTES;
    if(report.rawBytes>RAW_LIMIT)throw Error('player-alpha-geometry-raw-capacity');
    let validationCopy=rgba.slice();
    const original=geometryFromOriginal(deps,validationCopy),candidate=deps.scanFixedPlayerAlphaGeometry(rgba,rowEdges);
    const selectedGeometry={alphaBounds:selected.frame.alphaBounds,coreBounds:selected.frame.coreBounds,bodyIdentificationContour:selected.frame.bodyIdentificationContour};
    const inputUnchanged=sameBytes(rgba,validationCopy),selectedEqual=equal(original,selectedGeometry),candidateEqual=equal(original,candidate),aliases=aliasCorrect(original)&&aliasCorrect(selectedGeometry)&&aliasCorrect(candidate);
    report.lastComparison={weapon,index,inputUnchanged,selectedEqual,candidateEqual,aliases};
    if(!inputUnchanged){rawFrames.at(-1).rgba=validationCopy;validationCopy=null;}
    if(!inputUnchanged||!selectedEqual||!candidateEqual||!aliases)throw Error('player-alpha-geometry-native-geometry-mismatch');
    validationCopy=null;
    const d=rig.diagnostics??{};
    if(d.moving!==(index>0)||!Number.isFinite(d.phase)||!Number.isFinite(d.aimAngle)||!Number.isFinite(d.gripError)||!Number.isFinite(d.aimErrorDegrees))throw Error('player-alpha-geometry-native-pose-diagnostics-required');
    report.samples.push({weapon,index,poseLabel:sample.label,time:sample.time,actorUnchanged:true,inputBytesUnchanged:true,glDraws:after-before,bodyCaptureReads:1,width:SIZE,height:SIZE,rgbaFNV32:hashBytes(rgba),originalGeometry:clone(original),exactSelectedGeometry:true,exactFusedGeometry:true,contourAliases:true,originalMuzzle:{...selected.frame.weaponMuzzle},native:{moving:!!d.moving,gait:d.gait,phase:d.phase,aimAngle:d.aimAngle,lowerAngle:d.lowerAngle,upperTwist:d.upperTwist,moveWeight:d.moveWeight,runWeight:d.runWeight,action:d.action,gripError:d.gripError,supportError:d.supportError,aimErrorDegrees:d.aimErrorDegrees},models:rig.models.size,weapons:rig.weapons.size});
    await yieldOwned(signal);
   }
   art.releaseUnusedAssets([]);
  }
  if(rawFrames.length!==12||report.glDraws!==24||report.bodyCaptureReads!==12)throw Error('player-alpha-geometry-complete-inputs-required');
  const baseline=rgba=>geometryFromOriginal(deps,rgba),fused=rgba=>deps.scanFixedPlayerAlphaGeometry(rgba,rowEdges),arms=[];
  for(const [arm,fn]of [['A1',baseline],['B',fused],['A2',baseline]]){
   check();onProgress({phase:'cpu',arm});
   let warmupChecksum=0;
   for(const frame of rawFrames){
    let validationCopy=frame.rgba.slice();const expected=geometryFromOriginal(deps,validationCopy);
    for(let call=0;call<10;call++)warmupChecksum+=consume(fn(frame.rgba));
    const actual=fn(frame.rgba);
    if(!sameBytes(frame.rgba,validationCopy)||!equal(actual,expected)||!aliasCorrect(actual))throw Error('player-alpha-geometry-warmup-exactness-failed');
    validationCopy=null;
   }
   const batches=[];let checksum=0;
   for(let index=0;index<rawFrames.length;index++){
    check();let validationCopy=rawFrames[index].rgba.slice();const expected=geometryFromOriginal(deps,validationCopy);
    const start=clock();for(let call=0;call<200;call++)checksum+=consume(fn(rawFrames[index].rgba));const elapsed=clock()-start;
    if(!Number.isFinite(elapsed)||elapsed<0)throw Error('player-alpha-geometry-invalid-elapsed-clock');batches.push({input:index,calls:200,wallMs:elapsed});
    const actual=fn(rawFrames[index].rgba);
    if(!sameBytes(rawFrames[index].rgba,validationCopy)||!equal(actual,expected)||!aliasCorrect(actual))throw Error('player-alpha-geometry-batch-exactness-failed');
    validationCopy=null;
   }
   const outputHashes=rawFrames.map((frame,index)=>{
    const expected=geometryFromOriginal(deps,frame.rgba),output=fn(frame.rgba);
    if(!equal(expected,report.samples[index].originalGeometry)||!equal(output,expected)||!aliasCorrect(output))throw Error('player-alpha-geometry-benchmark-exactness-failed');
    return hashText(output);
   });
   const summary=summarize(batches.map(batch=>batch.wallMs));if(!Number.isFinite(summary.sumMs))throw Error('player-alpha-geometry-invalid-clock-sum');
   arms.push({arm,calls:2400,warmupCalls:120,untimedOutputValidationCalls:36,warmupChecksum,checksum,batches,summary,outputHashes,inputUnchanged:true,comparison:'full-byte and recursive Object.is, hashes diagnostic only'});
  }
  if(!Object.is(arms[0].checksum,arms[1].checksum)||!Object.is(arms[0].checksum,arms[2].checksum)||!Object.is(arms[0].warmupChecksum,arms[1].warmupChecksum)||!Object.is(arms[0].warmupChecksum,arms[2].warmupChecksum))throw Error('player-alpha-geometry-checksum-mismatch');
  const fasterOriginal=Math.min(arms[0].summary.sumMs,arms[2].summary.sumMs),candidateMs=arms[1].summary.sumMs;
  report.performance={arms,fasterOriginalSumMs:fasterOriginal,candidateSumMs:candidateMs,improvementFraction:fasterOriginal>0?(fasterOriginal-candidateMs)/fasterOriginal:null,requiredImprovementFraction:.1,cpuHelperWin:false,adopted:false,wholeFrameEvidence:false,note:'Fixed2400 calls per arm,120 warmups per arm outside all timers.12batches of200 consume the same complete output scalars inside timing; per-batch p95 nearest rank equals max for12 samples. Hashing, exact comparisons, native reads/draws, yields, UI, PNG, encoding and resource cleanup are outside these CPU-helper timers.10% lower summed CPU-helper wall than the faster A is the predeclared microcriterion, not a whole-frame or product acceptance gate.'};
  for(const sheet of sheets){check();await onImage({weapon:sheet.weapon,src:sheet.canvas.toDataURL('image/png'),alt:sheet.weapon+' 원본 실제 리그 · 6개 움직임·조준 자세 (몸체 geometry 비교와 별도)',width:sheet.canvas.width,height:sheet.canvas.height});}
 }catch(error){primary=error;failed=true;}
 finally{
  cleanup.closing=true;
  if(rig&&!prepared&&rig.pending&&rig.ready!==true)cleanup.unprovenPlayerParallelLoads=true;
  attempt('retire.initial',retire);
  if(tracker){try{cleanup.ownedDrain=await tracker.wait();}catch(error){cleanupError('tracker.wait',error);}}
  attempt('retire.final',retire);
  cleanup.modelsRemaining=rig?.models?.size??0;cleanup.weaponsRemaining=rig?.weapons?.size??0;cleanup.recordsRemaining=art?.records?.size??0;
  cleanup.canvasesReleased=!rig||[rig.body,rig.canvas,rig.ink,rig.bottleCanvas,rig.renderer?.domElement].filter(Boolean).every(canvas=>canvas.width===0&&canvas.height===0);
  for(const sheet of sheets)attempt('sheet.release',()=>{sheet.canvas.width=0;sheet.canvas.height=0;});
  sheets.length=0;rowEdges=null;report.rowScratchReleased=true;
  const drain=cleanup.ownedDrain;
  cleanup.complete=cleanup.errors.length===0&&!cleanup.unprovenPlayerParallelLoads&&cleanup.modelsRemaining===0&&cleanup.weaponsRemaining===0&&cleanup.recordsRemaining===0&&cleanup.canvasesReleased&&(!rig||cleanup.contextRetired)&&!!drain?.success;
  if(cleanup.complete){rig=null;art=null;deps=null;followed.clear();cleanup.resourceRefsCleared=true;}
  report.complete=!failed&&report.captured===12&&report.samples.every(sample=>sample.exactFusedGeometry&&sample.exactSelectedGeometry)&&cleanup.complete;
  if(report.performance)report.performance.cpuHelperWin=!report.injected&&report.complete&&report.performance.improvementFraction!==null&&report.performance.improvementFraction>=.1;
  active.delete(document);finalReport=freeze(clone(report));
 }
 if(failed){try{primary.report=finalReport;primary.rawFrames=rawFrames;}catch{}throw primary;}
 if(!finalReport.complete){const error=Error('player-alpha-geometry-incomplete');error.report=finalReport;error.rawFrames=rawFrames;throw error;}
 return{report:finalReport,rawFrames};
}

export function installPlayerAlphaGeometryQA(options={}){
 const location=options.location??globalThis.location,query=options.query??new URLSearchParams(location?.search??'');
 if(!allowed(location,query))return null;
 const createStorage=options.createStorage??createQAStorage;
 const storage=createStorage(query,()=>{throw Error('player-alpha-geometry-persistent-storage-forbidden');});
 if(!isQAMemoryStorage(storage))return null;
 const {document=globalThis.document,eventTarget=globalThis,loadCapture=()=>Promise.resolve({capturePlayerAlphaGeometry})}=options;
 if(!document||typeof document!=='object'||installedDocuments.has(document)||document.getElementById?.('player-alpha-geometry-qa'))return null;
 const button=document.createElement('button');button.id='player-alpha-geometry-qa';button.textContent='원본 주인공 12자세 · CPU 윤곽 계산 비교';
 const status=document.createElement('p');status.id='player-alpha-geometry-status';status.textContent='준비 완료 · 원본 리그만 별도 소유 · 제품 변경 없음';
 const details=document.createElement('details'),summary=document.createElement('summary'),output=document.createElement('pre'),proof=document.createElement('div');summary.textContent='실제 몸체 RGBA 정확도·순수 CPU 비용 · 전체 프레임/FPS·채택 결과 아님';output.id='player-alpha-geometry-report';proof.id='player-alpha-geometry-proof';details.append(summary,output,proof);
 const rawDetails=document.createElement('details'),rawSummary=document.createElement('summary'),raw=document.createElement('pre');rawSummary.textContent='원본 RGBA12개 · 최대3MiB raw/base64 내보내기';raw.id='player-alpha-geometry-raw';rawDetails.append(rawSummary,raw);
 (document.querySelector('nav')??document.body).append(button);document.body.append(status,details,rawDetails);
 button.onclick=async()=>{
  if(button.disabled)return;
  button.disabled=true;proof.replaceChildren();output.textContent='';raw.textContent='';
  const controller=new AbortController(),hide=()=>controller.abort();eventTarget.addEventListener?.('pagehide',hide,{once:true});
  let exported=false;const exportRaw=frames=>{if(exported||controller.signal.aborted)return;exported=true;raw.textContent=rawExport(frames??[]);};
  status.textContent='원본 2무기·12자세 준비 · 게임 진행·저장 접근 없음';
  try{
   const module=await loadCapture();if(controller.signal.aborted)return;
   const result=await module.capturePlayerAlphaGeometry({document,location,query,storage,signal:controller.signal,
    onProgress:info=>{if(!controller.signal.aborted)status.textContent='원본 CPU 윤곽 검수 · '+(info.weapon??info.arm??'')+' · '+(info.phase??'')+' '+(info.index??'');},
    onImage:info=>{if(controller.signal.aborted||proof.children.length>=2)return;const image=document.createElement('img');image.src=info.src;image.alt=info.alt;image.style.maxWidth='100%';proof.append(image);},
   });
   if(controller.signal.aborted)return;exportRaw(result.rawFrames);output.textContent=JSON.stringify(result.report,null,2);status.textContent=result.report.complete?'원본 geometry 검수 완료 · CPU만 비교 · 제품 채택 없음':'원본 geometry 검수 미완료 · 원시 기록 확인';return{report:result.report};
  }catch(error){if(controller.signal.aborted)return;exportRaw(error?.rawFrames);output.textContent=JSON.stringify({complete:false,error:message(error),report:error?.report??null},null,2);status.textContent='원본 geometry 검수 중단 · 실패·정리 기록 유지';}
  finally{eventTarget.removeEventListener?.('pagehide',hide);controller.abort();button.disabled=false;}
 };
 installedDocuments.add(document);return{button,status};
}
