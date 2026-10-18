import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {Game} from '../dist/engine.js?v=0.29.0';

// Import the actual QA orchestrator with explicit local service seams,
// including the optional dynamic texture/preparation-observer services.
// No WebGL, shader, pixel-art or performance claim follows from these mocks.
const source=await readFile(new URL('../dist/qa-native-shader-warmup.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done;}),resolve:value=>resolve(value)};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const locationFor=address=>new URL(address??'http://localhost:8851/qa-player-rig.html?qa=1&qa-memory=shader');
let moduleNumber=0;
function surface(width=256,height=256){
 const canvas={width,height,dataset:{},pixels:new Uint8ClampedArray(16),toDataURL(){return 'data:image/mock;base64,'+Buffer.from(this.pixels).toString('base64');}};
 canvas.getContext=()=>({clearRect(){canvas.pixels.fill(0);},drawImage(image){canvas.pixels.set(image.pixels);},getImageData(){return {data:new Uint8ClampedArray(canvas.pixels)};}});return canvas;
}
async function environment(mode,run){
 const descriptors=new Map(['document','performance','requestAnimationFrame'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),events=[],rigs=[],helpers=[],profiles=[],compareCalls=[],images=[],uploadProfiles=[],texturePreparations=[];
 const loadGate=deferred(),prepareGate=deferred(),activeProfiles=new Map(),activeUploadProfiles=new Map(),markedRigs=new WeakSet(),canvas=surface(),prior={sentinel:'existing product rig'},location=locationFor();let now=0,domCalls=0,rafCalls=0;
 const renderer={liveEnemies:prior,productionArt:{manifest:{enemies:Object.fromEntries(['walker','runner','shield','screamer','gas','elite','collector'].map(type=>[type,{idle:type+'-idle',walk:type+'-walk'}]))},async load(id,options){events.push(['art-load',id,options.retry]);return true;},enemyFrame(type,actor,options){return {id:type+'-'+options.pose,metadata:{animation:{name:options.pose,duration:1,samples:128}},frame:{index:actor.id},image:canvas};}},render(game){const rig=this.liveEnemies;events.push(['combat-render',rig.number]);if(mode==='render-failure')throw Error('controlled combat render failure');this.liveEnemySelection=new Set(mode==='selected-zero'?[]:[game.enemies[0]]);if(mode==='rig-error')rig.error='controlled rig error';if(mode!=='native-none')rig.renderer.render(rig.scene,rig.camera);}};
 class LiveBossRigFixture{
  constructor(options){assert.deepEqual(options,{size:256,registryFile:'enemy-registry.json'});this.number=rigs.length;this.models=new Map();this.frames=new WeakMap();this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);this.error='';this.releases=this.disposes=this.losses=this.batches=0;const owner=this;this.renderer={domElement:surface(),autoClear:true,info:{programs:[],render:{frame:0}},getRenderTarget:()=>null,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,getViewport:value=>value.set(0,0,256,256),getScissor:value=>value.set(0,0,256,256),getScissorTest:()=>false,
   initTexture(texture){events.push(['texture-init',owner.number,texture]);},
   render(){owner.renderer.info.render.frame++;events.push(['native-draw',owner.number]);const sample=activeProfiles.get(owner)?.current;if(sample)sample.stages['native.glSubmit']={cpuMs:.1,calls:1};},
   dispose(){owner.disposes++;events.push(['renderer-dispose',owner.number]);},forceContextLoss(){owner.losses++;events.push(['context-loss',owner.number]);}};rigs.push(this);events.push(['construct',this.number]);
  }
  async load(key){events.push(['model-load-start',this.number,key]);if(mode==='deferred'&&this.number===0)await loadGate.promise;if(mode==='load-failure')return false;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));const subject=new THREE.Group(),texture=new THREE.Texture({width:4,height:4,complete:true});texture.needsUpdate=true;subject.add(new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial({map:texture,alphaMap:texture})));this.models.set(key,{subject,sampler:{clips:[{uuid:'source-clip',name:'DS_Walk',duration:1}]},indices:{walk:0}});events.push(['model-loaded',this.number,key]);return true;}
  beginBatch(){this.batches++;this.jobs=[];events.push(['batch-start',this.number]);}
  frame(key,actor,time,fallback,options){assert.ok(this.models.has(key),'drawing uses the loaded original model');this.jobs.push({actor,fallback,options});}
  endBatch(){this.renderer.render();for(const {actor,options}of this.jobs){const image=surface();image.pixels.fill((actor.id+options.pose.length)%256);this.frames.set(actor,{selected:{image,frame:{alphaBounds:{x:1,y:2,width:3,height:4},coreBounds:{x:1,y:2,width:3,height:2}},placement:{x:actor.x,y:actor.y},metadata:{animation:{name:options.pose,duration:1,samples:128}}}});}}
  releaseUnused(keys){assert.deepEqual(keys,[]);this.releases++;this.models.clear();events.push(['rig-release',this.number]);}
 }
 class NativeShaderWarmupFixture{
  constructor(){this.lastError='';this.disposals=0;helpers.push(this);}
  async prepare(rig,key){assert.ok(rig.models.has(key));events.push(['prepare-start',rig.number]);if(mode==='deferred'&&helpers.filter(helper=>helper.started).length===0){this.started=true;await prepareGate.promise;}else this.started=true;
   if(mode==='prepare-failure'){this.lastError='controlled preparation failure';return false;}if(mode==='source-mutation')rig.models.get(key).subject.position.x++;
   rig.renderer.info.programs.push({compiled:true});events.push(['prepared',rig.number]);return true;
  }
  dispose(){this.disposals++;}
 }
 function createNativeFrameProfile(rig){const profile={rig,samples:[],stopCalls:0,current:null,beginFrame(meta){this.current={...meta,stages:{}};},endFrame(meta){const sample={...this.current,...meta};this.samples.push(sample);this.current=null;return sample;},stop(){this.stopCalls++;activeProfiles.delete(rig);return {samples:this.samples,unmeasured:[]};}};profiles.push(profile);activeProfiles.set(rig,profile);return profile;}
 function createNativeUploadProfile(rig){const profile={rig,samples:[],stopCalls:0,current:null,stopped:false,beginFrame(meta){assert.equal(this.current,null);this.current={...meta,stages:{}};events.push(['upload-profile-start',rig.number,meta.phase??'combat']);},endFrame(meta){assert.ok(this.current);const sample={...this.current,...meta};this.samples.push(sample);this.current=null;return sample;},stop(){if(!this.stopped){this.stopped=true;this.stopCalls++;this.current=null;activeUploadProfiles.delete(rig);events.push(['upload-profile-stop',rig.number]);}return {samples:this.samples,unmeasured:[],note:'CPU observation mock, not GPU measurement'};}};uploadProfiles.push(profile);activeUploadProfiles.set(rig,profile);return profile;}
 function markOriginalTextureQARig(rig){markedRigs.add(rig);events.push(['texture-mark',rig.number]);return rig;}
 function prepareOriginalTextureUpload(rig,key,{enabled=false}={}){assert.equal(markedRigs.has(rig),true);assert.ok(rig.models.has(key));assert.equal(rig.renderer.info.render.frame,0,'all texture arms use a never-drawn owned rig');assert.ok(activeUploadProfiles.has(rig),'preparation observer starts before the original upload service');events.push(['texture-reset',rig.number,enabled]);texturePreparations.push({rig,key,enabled});if(mode==='texture-combat-failure'&&rig.number===22)return {enabled,submitted:false,error:'controlled original texture upload failure',stateNormalized:true};const textures=new Set();rig.models.get(key).subject.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){if(material.map)textures.add(material.map);if(material.alphaMap)textures.add(material.alphaMap);}});if(enabled)for(const texture of textures)rig.renderer.initTexture(texture);return {enabled,submitted:enabled,error:'',stateNormalized:true,textures:[...textures].map(texture=>({uuid:texture.uuid,width:4,height:4,version:texture.version,sourceVersion:texture.source.version})),texturesBefore:0,texturesAfter:enabled?textures.size:0};}
 async function compareBulletBroadphase(main,target,options){
  compareCalls.push(options);assert.equal(main,renderer);assert.equal(target,canvas);assert.equal(options.legacyBulletComparison,false);assert.equal(Object.hasOwn(options,'input'),false,'the orchestrator does not replace the normal combat input');assert.equal(Object.hasOwn(options,'frames'),false,'the normal QA workload stays delegated');
  const passes=[];let game;for(const force of [true,false,true]){game=new Game({seed:774,missionId:'mission-01',weapon:options.weapon});const before=JSON.stringify(game.snapshot()),rng=[game.random.getState(),game.visualRandom.getState()];await options.onPass(force,game);options.onProgress(force);for(let frame=0;frame<2;frame++){const meta={frame,force,warmup:frame===0};options.onFrameStart(meta,game);main.render(game);options.onFrameEnd(meta,game);}assert.equal(JSON.stringify(game.snapshot()),before,'loading/preparation hooks never write gameplay state');assert.deepEqual([game.random.getState(),game.visualRandom.getState()],rng);options.onImage(force,target.toDataURL());passes.push({force});}
  return {game,report:{count:options.count,weapon:options.weapon,legacyBulletComparison:options.legacyBulletComparison,passes,mockService:true}};
 }
 const key=Symbol.for('dead-signal-native-shader-qa-test-'+moduleNumber++),services={LiveBossRig:LiveBossRigFixture,NativeShaderWarmup:NativeShaderWarmupFixture,compareBulletBroadphase,createNativeFrameProfile,createNativeUploadProfile,markOriginalTextureQARig,prepareOriginalTextureUpload};globalThis[key]=services;
 const shim='const services=globalThis[Symbol.for('+JSON.stringify(Symbol.keyFor(key))+')];export const {LiveBossRig,NativeShaderWarmup,compareBulletBroadphase,createNativeFrameProfile,createNativeUploadProfile,markOriginalTextureQARig,prepareOriginalTextureUpload}=services;',shimURL='data:text/javascript;base64,'+Buffer.from(shim).toString('base64');
 let imported=source.replaceAll("'./player-rig/vendor/three.module.js'",JSON.stringify(new URL('../dist/player-rig/vendor/three.module.js',import.meta.url).href));for(const specifier of ['./boss-rig/live-boss.js','./boss-rig/native-shader-warmup.js','./qa-bullet-broadphase.js','./qa-native-frame-profile.js','./boss-rig/native-texture-upload.js','./qa-native-upload-profile.js']){assert.ok(imported.includes("'"+specifier+"'"));imported=imported.replaceAll("'"+specifier+"'",JSON.stringify(shimURL));}
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(tag){domCalls++;assert.equal(tag,'canvas');return surface();}}});Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now+=.125}});Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:callback=>{rafCalls++;queueMicrotask(()=>callback(rafCalls*1000/60));return rafCalls;}});
 try{const module=await import('data:text/javascript;base64,'+Buffer.from(imported).toString('base64'));return await run({compare:module.compareNativeShaderWarmup,renderer,canvas,prior,location,query:location.searchParams,events,rigs,helpers,profiles,uploadProfiles,texturePreparations,compareCalls,images,loadGate,prepareGate,get domCalls(){return domCalls;},get rafCalls(){return rafCalls;}});}
 finally{delete globalThis[key];for(const [name,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
}
function cleaned(env){assert.equal(env.renderer.liveEnemies,env.prior);for(const rig of env.rigs){assert.equal(rig.releases,1);assert.equal(rig.disposes,1);assert.equal(rig.losses,1);}for(const helper of env.helpers)assert.equal(helper.disposals,1);for(const profile of [...env.profiles,...env.uploadProfiles])assert.equal(profile.stopCalls,1);}

test('the actual QA orchestrator awaits original loading and preparation before drawing, preserves six normal combat delegations and releases its own contexts',async()=>{
 await environment('deferred',async env=>{
  const pending=env.compare(env.renderer,env.canvas,{location:env.location,query:env.query,onImage:image=>env.images.push(image)});await turn();assert.equal(env.rigs.length,1);assert.equal(env.rigs[0].batches,0);assert.equal(env.events.some(event=>event[0]==='native-draw'),false);
  env.loadGate.resolve(true);await turn();assert.equal(env.rigs.length,2);assert.equal(env.rigs[0].batches,1);assert.equal(env.rigs[1].batches,0,'prepared arm cannot draw while its prepare Promise is pending');assert.ok(env.events.some(event=>event[0]==='prepare-start'&&event[1]===1));env.prepareGate.resolve(true);
  const {report}=await pending;assert.equal(report.quality.length,7);assert.equal(report.reports.length,2);assert.equal(env.rigs.length,27);assert.equal(env.helpers.length,27);assert.equal(env.helpers.filter(helper=>helper.started).length,9);assert.equal(env.profiles.length,6);assert.equal(env.images.length,13);assert.equal(env.rafCalls,21);
  for(const quality of report.quality){assert.equal(quality.poses,8);assert.deepEqual(quality.passes.map(pass=>pass.enabled),[false,true,false]);assert.ok(quality.passes.every(pass=>pass.outputsPrivate&&pass.preparation.publicStateSame&&pass.preparation.sourcePoseGeometryMaterialSame&&pass.preparation.drawsDuringPreparation===0));assert.ok(quality.comparisons.every(result=>result.different===0&&result.maxDelta===0&&result.geometrySame&&result.animationSame));}
  assert.deepEqual(env.compareCalls.map(options=>[options.count,options.weapon]),[[60,'shotgun'],[180,'nailgun']]);for(const scenario of report.reports){assert.deepEqual(scenario.passes.map(pass=>pass.preparation.enabled),[false,true,false]);for(const pass of scenario.passes){assert.equal(pass.firstNativeFrame.nativeSelected,1);assert.equal(pass.firstNativeFrame.stages['native.glSubmit'].calls,1);assert.equal(pass.firstNativeFrame.rigError,'');}}
  for(const rig of env.rigs){const loaded=env.events.findIndex(event=>event[0]==='model-loaded'&&event[1]===rig.number),draw=env.events.findIndex(event=>event[0]==='native-draw'&&event[1]===rig.number),prepared=env.events.findIndex(event=>event[0]==='prepared'&&event[1]===rig.number);assert.ok(loaded>=0&&draw>loaded);if(prepared>=0)assert.ok(prepared<draw);}
  assert.deepEqual(env.uploadProfiles,[],'the original default shader branch does not load the upload observer');assert.deepEqual(env.texturePreparations,[],'the original shader branch does not call the texture service');cleaned(env);
 });
});

test('missing native submission, empty native selection or a rig error rejects the combat comparison and restores the previous product rig',async()=>{
 for(const mode of ['native-none','selected-zero','rig-error'])await environment(mode,async env=>{await assert.rejects(env.compare(env.renderer,env.canvas,{location:env.location,query:env.query}),/shader-actual-native-render-required/);assert.equal(env.profiles.length,1);assert.equal(env.compareCalls.length,1);cleaned(env);});
});

test('load, preparation, source-audit and combat-render failures clean up helpers, profiles and owned contexts without releasing the prior rig',async()=>{
 for(const mode of ['load-failure','prepare-failure','source-mutation','render-failure'])await environment(mode,async env=>{await assert.rejects(env.compare(env.renderer,env.canvas,{location:env.location,query:env.query}),/shader-original-model-not-ready|controlled preparation failure|shader-preparation-source-mutation|controlled combat render failure/);cleaned(env);});
});

test('non-loopback, non-8851 or non-memory requests reject before any DOM, model, preparation or combat service access',async()=>{
 await environment('normal',async env=>{
  let scenarios=0;for(const address of ['http://localhost:8806/?qa&qa-memory','http://localhost:8852/?qa&qa-memory','https://localhost:8851/?qa&qa-memory','http://localhost.evil.example:8851/?qa&qa-memory','http://example.com:8851/?qa&qa-memory','http://localhost:8851/?qa','http://localhost:8851/?qa-memory']){const location=locationFor(address);await assert.rejects(env.compare(env.renderer,env.canvas,{location,query:location.searchParams,beforeScenario(){scenarios++;}}),/shader-memory-qa-origin-required/);}
  assert.equal(scenarios,0);assert.equal(env.domCalls,0);assert.equal(env.rafCalls,0);assert.equal(env.rigs.length,0);assert.equal(env.helpers.length,0);assert.equal(env.profiles.length,0);assert.equal(env.compareCalls.length,0);assert.deepEqual(env.events,[]);assert.equal(env.renderer.liveEnemies,env.prior);
 });
});

test('texture mode normalizes every false/true/false arm, submits only original candidate textures and awaits common shader preparation before any draw',async()=>{
 await environment('deferred',async env=>{
  const pending=env.compare(env.renderer,env.canvas,{location:env.location,query:env.query,mode:'textures',observeUploads:true});await turn();assert.equal(env.rigs.length,1);assert.equal(env.texturePreparations.length,0);assert.equal(env.events.some(event=>event[0]==='native-draw'),false);
  env.loadGate.resolve(true);await turn();assert.equal(env.rigs.length,1,'the first baseline also waits for its shader preparation');assert.deepEqual(env.texturePreparations.map(preparation=>preparation.enabled),[false]);assert.equal(env.rigs[0].batches,0);assert.ok(env.events.some(event=>event[0]==='prepare-start'&&event[1]===0));assert.equal(env.events.some(event=>event[0]==='native-draw'),false);env.prepareGate.resolve(true);
  const {report}=await pending;assert.equal(report.mode,'textures');assert.equal(report.observeUploads,true);assert.equal(env.rigs.length,27);assert.equal(env.helpers.filter(helper=>helper.started).length,27,'baseline and candidate receive the same shader preparation');assert.equal(env.texturePreparations.length,27);assert.equal(env.uploadProfiles.length,54);assert.equal(env.events.filter(event=>event[0]==='texture-init').length,9,'each candidate submits its shared map/alphaMap identity once');assert.deepEqual(env.compareCalls.map(options=>[options.count,options.weapon]),[[60,'shotgun'],[180,'nailgun']]);
  for(let i=0;i<env.texturePreparations.length;i+=3)assert.deepEqual(env.texturePreparations.slice(i,i+3).map(preparation=>preparation.enabled),[false,true,false]);
  for(const rig of env.rigs){const order=name=>env.events.findIndex(event=>event[0]===name&&event[1]===rig.number),texture=env.texturePreparations.find(preparation=>preparation.rig===rig);assert.ok(order('model-loaded')<order('texture-reset'));assert.ok(order('texture-reset')<order('prepare-start'));assert.ok(order('prepared')<order('native-draw'));const originalTexture=rig.number;assert.equal(env.events.filter(event=>event[0]==='texture-init'&&event[1]===originalTexture).length,texture.enabled?1:0);}
  for(const quality of report.quality){assert.ok(quality.comparisons.every(comparison=>comparison.different===0&&comparison.geometrySame&&comparison.animationSame));for(const pass of quality.passes){assert.equal(pass.preparation.ready,true);assert.equal(pass.preparation.textureUpload.submitted,pass.enabled);assert.equal(pass.preparation.textureUpload.stateNormalized,true);assert.equal(pass.preparation.uploadProfile.samples.length,1);assert.equal(pass.firstUploadProfile.samples.length,1);}}
  for(const scenario of report.reports)for(const pass of scenario.passes){assert.equal(pass.preparation.ready,true);assert.equal(pass.preparation.textureUpload.submitted,pass.preparation.enabled);assert.equal(pass.firstNativeFrame.nativeSelected,1);assert.ok(pass.firstNativeFrame.upload);assert.deepEqual(pass.uploadUnmeasured,[]);}
  cleaned(env);
 });
});

test('candidate original texture upload failure closes preparation/combat observers and releases every owned rig before restoring the prior renderer rig',async()=>{
 await environment('texture-combat-failure',async env=>{
  await assert.rejects(env.compare(env.renderer,env.canvas,{location:env.location,query:env.query,mode:'textures',observeUploads:true}),/controlled original texture upload failure/);assert.equal(env.compareCalls.length,1);assert.equal(env.rigs.length,23);assert.equal(env.texturePreparations.at(-1).enabled,true);assert.equal(env.profiles.length,1,'first combat baseline observer was installed then stopped before the failed candidate');assert.equal(env.profiles[0].samples.length,2);assert.equal(env.uploadProfiles.at(-1).samples.length,0,'failed preparation abandons its open observer sample');assert.equal(env.events.some(event=>event[0]==='native-draw'&&event[1]===22),false);assert.equal(env.events.some(event=>event[0]==='prepare-start'&&event[1]===22),false);cleaned(env);
 });
});

test('invalid mode and protected-origin texture requests perform no optional service, DOM or gameplay work',async()=>{
 await environment('normal',async env=>{
  await assert.rejects(env.compare(env.renderer,env.canvas,{location:env.location,query:env.query,mode:'unknown',observeUploads:true}),/native-preparation-mode-invalid/);
  const location=locationFor('http://localhost:8806/?qa&qa-memory');await assert.rejects(env.compare(env.renderer,env.canvas,{location,query:location.searchParams,mode:'textures',observeUploads:true}),/shader-memory-qa-origin-required/);assert.equal(env.domCalls,0);assert.equal(env.rafCalls,0);assert.deepEqual(env.events,[]);assert.deepEqual(env.texturePreparations,[]);assert.deepEqual(env.uploadProfiles,[]);assert.deepEqual(env.compareCalls,[]);assert.equal(env.renderer.liveEnemies,env.prior);
 });
});
