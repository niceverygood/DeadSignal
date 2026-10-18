import * as THREE from './player-rig/vendor/three.module.js';
import {LiveBossRig} from './boss-rig/live-boss.js';
import {NativeShaderWarmup} from './boss-rig/native-shader-warmup.js';
import {compareBulletBroadphase} from './qa-bullet-broadphase.js';
import {createNativeFrameProfile} from './qa-native-frame-profile.js';

const types=['walker','runner','shield','screamer','gas','elite','collector'];
const difference=(a,b)=>{let different=0,maxDelta=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)different++;maxDelta=Math.max(maxDelta,d);}return{different,maxDelta};};
const publicState=rig=>{const r=rig.renderer;return JSON.stringify({target:r.getRenderTarget()?.uuid??null,face:r.getActiveCubeFace(),level:r.getActiveMipmapLevel(),viewport:r.getViewport(new THREE.Vector4()).toArray(),scissor:r.getScissor(new THREE.Vector4()).toArray(),scissorTest:r.getScissorTest(),autoClear:r.autoClear,canvas:[r.domElement.width,r.domElement.height],camera:[rig.camera.position.toArray(),rig.camera.quaternion.toArray(),rig.camera.projectionMatrix.toArray(),rig.camera.matrixWorld.toArray()],scene:rig.scene.children.map(o=>o.uuid)});};
// Version/listener/program caches are legitimate compile effects and are not
// source art. Track versions separately rather than reverting their counters.
function sourceState(model){
 const objects=[],materials=new Map();
 model.subject.traverse(o=>{
  const geometry=o.geometry,attrs=geometry?Object.entries(geometry.attributes).map(([key,a])=>[key,a.uuid??null,a.count,Array.from(a.array)]):null;
  objects.push([o.uuid,o.parent?.uuid??null,o.visible,o.position.toArray(),o.quaternion.toArray(),o.scale.toArray(),o.matrix.toArray(),o.matrixWorld.toArray(),geometry?.uuid??null,attrs,geometry?.index?Array.from(geometry.index.array):null,o.skeleton?.boneInverses.map(m=>m.toArray())??null]);
  for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.set(m.uuid,[m.uuid,m.type,m.side,m.color?.toArray(),m.opacity,m.transparent,m.alphaTest,m.forceSinglePass,m.map?.uuid??null,m.alphaMap?.uuid??null]);
 });
 return JSON.stringify({objects,materials:[...materials.values()],clips:model.sampler.clips.map(c=>[c.uuid,c.name,c.duration]),indices:model.indices});
}
function versions(model){const out=new Map();model.subject.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])out.set(m.uuid,m.version);});return Object.fromEntries(out);}
function disposeRig(rig){if(!rig)return;rig.releaseUnused([]);rig.renderer.dispose();rig.renderer.forceContextLoss();}
async function freshRig(key){const rig=new LiveBossRig({size:256,registryFile:'enemy-registry.json'});try{if(!await rig.load(key))throw Error(rig.error||'shader-original-model-not-ready');return rig;}catch(error){disposeRig(rig);throw error;}}
async function prepare(rig,key,enabled,{mode='shader',createUploadProfile=null}={}){
 const model=rig.models.get(key),before=publicState(rig),sourceBefore=sourceState(model),versionBefore=versions(model),programsBefore=rig.renderer.info.programs.length,drawsBefore=rig.renderer.info.render.frame;
 const helper=new NativeShaderWarmup(),uploadProfile=createUploadProfile?.(rig),started=performance.now();let textureUpload=null,textureMs=0,shaderMs=0;
 uploadProfile?.beginFrame({phase:'preparation',mode,enabled});
 try{
  if(mode==='textures'){
   const {markOriginalTextureQARig,prepareOriginalTextureUpload}=await import('./boss-rig/native-texture-upload.js');markOriginalTextureQARig(rig);
   const textureStart=performance.now();textureUpload=prepareOriginalTextureUpload(rig,key,{enabled});textureMs=performance.now()-textureStart;
   if(textureUpload.error||enabled&&!textureUpload.submitted)throw Error(textureUpload.error||'original-texture-upload-not-submitted');
  }
  const shaderStart=performance.now(),ready=enabled||mode==='textures'?await helper.prepare(rig,key):false;shaderMs=performance.now()-shaderStart;const warmupMs=performance.now()-started;
  const result={enabled,mode,ready,warmupMs,textureMs,shaderMs,textureUpload,programsBefore,programsAfter:rig.renderer.info.programs.length,drawsDuringPreparation:rig.renderer.info.render.frame-drawsBefore,drawCounterScope:'GL render-frame counter only; no claim of observing every possible 2D canvas/content operation.',publicStateSame:before===publicState(rig),sourcePoseGeometryMaterialSame:sourceBefore===sourceState(model),sourceAuditScope:'Geometry attribute/index data, local/world transforms, hierarchy/visibility, bone inverse matrices, material expression and texture UUID identity, clip names/durations/indices. Full texture contents, skin matrices and clip-track data are not independently scanned here.',materialVersionsBefore:versionBefore,materialVersionsAfter:versions(model),error:helper.lastError||''};
  if((enabled||mode==='textures')&&!ready)throw Error(result.error||'shader-preparation-not-ready');
  if(!result.publicStateSame||!result.sourcePoseGeometryMaterialSame||result.drawsDuringPreparation!==0)throw Error('shader-preparation-source-mutation');
  if(uploadProfile){uploadProfile.endFrame({ready});result.uploadProfile=uploadProfile.stop();result.uploadProfile.intervalNote='Preparation frameCpuMs is elapsed wall time across async shader readiness plus the post-preparation source audit. warmupMs ends before that audit. Individual GL stage call-wall times observe original calls only; these nested/asynchronous intervals must not be added or called actual CPU/GPU execution time.';}
  return result;
 }finally{uploadProfile?.stop();helper.dispose();}
}
function poseJobs(art,type){return ['idle','walk','walk','walk','windup','attack','hit','death'].map((pose,i)=>{
 const actor={id:900+i,type,x:1200,y:930,hp:pose==='death'?0:500,dead:pose==='death',angle:i*.73,attackState:pose==='windup'?'windup':pose==='attack'?'charge':'walk',attackTime:.4,hitFlash:['windup','attack','hit'].includes(pose)?.09:0};
 const options={pose,animationTime:pose==='death'?.45:.1,height:42,actionDurations:{windup:.9,charge:.75}},selected=art.enemyFrame(type,actor,{pose,simulationTime:1.2,animationTime:options.animationTime});
 if(!selected)throw Error('shader-original-art-not-ready');
 return{actor,options,fallback:{...selected,locomotion:{pose:pose==='hit'?'walk':pose,phase:2.4,angle:actor.angle,...(pose==='walk'?{moveWeight:[.3,.7,1][i-1]}:{})}}};
});}

export async function compareNativeShaderWarmup(renderer,canvas,{location=globalThis.location,query=new URLSearchParams(location?.search??''),mode='shader',observeUploads=false,beforeScenario=async()=>{},onProgress=()=>{},onImage=()=>{}}={}){
 if(location?.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(location?.hostname)||location?.port!=='8851'||!query.has('qa')||!query.has('qa-memory'))throw Error('shader-memory-qa-origin-required');
 if(!['shader','textures'].includes(mode))throw Error('native-preparation-mode-invalid');
 const createUploadProfile=observeUploads?(await import('./qa-native-upload-profile.js')).createNativeUploadProfile:null;
 // Import the explicit texture service before any preparation timer starts.
 if(mode==='textures')await import('./boss-rig/native-texture-upload.js');
 const priorRig=renderer.liveEnemies,quality=[],reports=[],read=document.createElement('canvas');read.width=read.height=256;const context=read.getContext('2d',{willReadFrequently:true});
 let owned=null,profile=null,uploadProfile=null,finalGame;
 try{
  for(const type of types){
   const key='enemy-'+type,mapping=renderer.productionArt.manifest.enemies[type];
   await Promise.all((typeof mapping==='string'?[mapping]:Object.values(mapping)).map(id=>renderer.productionArt.load(id,{retry:true})));
   const passes=[],pixels=[];
   for(const enabled of [false,true,false]){
    onProgress({phase:'quality',type,enabled});owned=await freshRig(key);const preparation=await prepare(owned,key,enabled,{mode,createUploadProfile}),jobs=poseJobs(renderer.productionArt,type),started=performance.now();
    uploadProfile=createUploadProfile?.(owned);uploadProfile?.beginFrame({phase:'quality-first-render',type,enabled});
    owned.beginBatch(jobs.length);for(const job of jobs)owned.frame(key,job.actor,1.2,job.fallback,job.options);owned.endBatch();const firstRenderMs=performance.now()-started;
    let firstUploadProfile=null;if(uploadProfile){uploadProfile.endFrame();firstUploadProfile=uploadProfile.stop();uploadProfile=null;}
    pixels.push(jobs.map(job=>{const selected=owned.frames.get(job.actor).selected;context.clearRect(0,0,256,256);context.drawImage(selected.image,0,0);return{pixels:context.getImageData(0,0,256,256).data,geometry:JSON.stringify([selected.frame.alphaBounds,selected.frame.coreBounds,selected.placement]),animation:JSON.stringify(selected.metadata.animation)};}));
    passes.push({enabled,preparation,firstRenderMs,firstUploadProfile,firstRenderIntervalNote:'firstRenderMs includes profiler installation/begin overhead; firstUploadProfile frameCpuMs begins afterward. Both are instrumented call wall time, not GPU execution.',programsAfterFirstRender:owned.renderer.info.programs.length,outputsPrivate:jobs.every(job=>owned.frames.get(job.actor).selected.image.width===256&&owned.frames.get(job.actor).selected.image!==owned.renderer.domElement)});
    if(enabled)onImage({phase:'quality',type,enabled,src:owned.frames.get(jobs[5].actor).selected.image.toDataURL()});
    disposeRig(owned);owned=null;await new Promise(requestAnimationFrame);
   }
   const comparisons=pixels.slice(1).map((pass,index)=>{let different=0,maxDelta=0;let geometrySame=true,animationSame=true;for(let i=0;i<pass.length;i++){const d=difference(pixels[0][i].pixels,pass[i].pixels);different+=d.different;maxDelta=Math.max(maxDelta,d.maxDelta);geometrySame&&=pixels[0][i].geometry===pass[i].geometry;animationSame&&=pixels[0][i].animation===pass[i].animation;}return{enabled:index===0,different,maxDelta,geometrySame,animationSame};});
   quality.push({type,poses:8,passes,comparisons});
  }
  for(const [count,weapon]of [[60,'shotgun'],[180,'nailgun']]){
   await beforeScenario({count,weapon});const extras=[];let preparation;
   const result=await compareBulletBroadphase(renderer,canvas,{count,weapon,legacyBulletComparison:false,
    onPass:async force=>{
     profile?.stop();profile=null;uploadProfile?.stop();uploadProfile=null;disposeRig(owned);owned=null;
     owned=await freshRig('enemy-walker');preparation=await prepare(owned,'enemy-walker',!force,{mode,createUploadProfile});renderer.liveEnemies=owned;profile=createNativeFrameProfile(owned);uploadProfile=createUploadProfile?.(owned);
    },
    onProgress:force=>onProgress({phase:'combat',count,weapon,enabled:!force}),
    onFrameStart:meta=>{profile.beginFrame({...meta,programsBefore:owned.renderer.info.programs.length});uploadProfile?.beginFrame(meta);},
    onFrameEnd:meta=>profile.endFrame({...meta,upload:uploadProfile?.endFrame(),programsAfter:owned.renderer.info.programs.length,nativeSelected:renderer.liveEnemySelection?.size||0,rigError:owned.error||canvas.dataset?.productionEnemyRigError||''}),
    onImage:(force,src)=>{
     const stopped=profile.stop(),samples=stopped.samples,uploadStopped=uploadProfile?.stop();profile=null;uploadProfile=null;const firstNative=samples.find(s=>(s.stages['native.glSubmit']?.calls||0)>0);
     if(!firstNative||firstNative.nativeSelected<1||samples.some(s=>s.rigError))throw Error('shader-actual-native-render-required');
     extras.push({preparation,firstNativeFrame:firstNative,allNativeProfiles:samples,unmeasured:stopped.unmeasured,uploadUnmeasured:uploadStopped?.unmeasured});onImage({phase:'combat',count,weapon,enabled:!force,src});
    }
   });
   finalGame=result.game;result.report.passes.forEach((pass,i)=>Object.assign(pass,extras[i]));reports.push(result.report);disposeRig(owned);owned=null;renderer.liveEnemies=priorRig;
  }
  return{game:finalGame,report:{mode,observeUploads,quality,reports,note:'Explicit in-memory8851 QA. Each A/B/A arm uses a newly constructed original256 NPC rig/context and the same locally loaded model. Shader mode compares unprepared/compiled/unprepared. Textures mode compares shader-only/original-texture-preupload-plus-shader/shader-only; ALL arms normalize fresh state through the same public resetState path and compile the actual subject before first draw. Preupload uses original map/alphaMap identities, without cloning or needsUpdate. It normalizes private/public state for subsequent Three draw, not an exact restoration of past GL texture binding. GLB load is completed in all arms and excluded from preparation/combat clocks. This is a fresh renderer context comparison, not hardware/driver-cold proof. Preparation/upload/shader/first native render/whole fixed1/60 batch8 combat are separate. API submission/readiness does not prove GPU completion, link success, uniform/geometry/VAO/bone work or elimination of first read waits. No product catch-up/HUD/audio/save/FPS/GPU-execution or real-memory claim. Original GL upload/reflection/buffer/VAO/bone calls are only observed; nested inclusive wall times must not be added. Normal game rules/state/events are compared; source audit scope is recorded per pass. Every combat pass requires native submission/selection and no observed rig error. Shared main-renderer player/background caches can vary. This comparison owns separate QA rigs and does not invoke product launch preparation. Product launch separately prepares a bounded fresh original candidate.'}};
 }finally{profile?.stop();uploadProfile?.stop();renderer.liveEnemies=priorRig;disposeRig(owned);}
}
