import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {Game} from '../dist/engine.js?v=0.29.0';
import {prepareNativeEnemyLaunch} from '../dist/boss-rig/native-launch-preparation.js';

// Real launch/texture/shader helpers and real Three original objects are used.
// Only GLB loading and compileAsync are CPU service mocks: completion means an
// API readiness contract, never actual GPU, first-frame pixels or performance.
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({deferLoads=false,deferShaders=false}={}){
 const events=[],models=new Map(),loaded=new Map(),loadGates=new Map(),compileGates=[],textures=[],uploads=[],listeners=new Map(),forbidden=[];
 const image={width:16,height:8,complete:true,close(){forbidden.push('image.close');}},shared=new THREE.Texture(image),other=new THREE.Texture(image);shared.needsUpdate=true;other.needsUpdate=true;textures.push(shared,other);
 const state={target:null,face:0,level:0,viewport:new THREE.Vector4(3,5,255,253),scissor:new THREE.Vector4(7,9,117,119),test:true,lost:false},gl={isContextLost:()=>state.lost},surface={width:256,height:256,addEventListener(name,listener){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(listener);},removeEventListener(name,listener){listeners.get(name)?.delete(listener);}};
 const trap=name=>()=>{forbidden.push(name);throw Error('forbidden '+name);};for(const name of ['getError','getParameter','getExtension','readPixels'])gl[name]=trap(name);
 const renderer={domElement:surface,info:{memory:{textures:0},render:{frame:0},programs:[]},capabilities:{maxTextureSize:4096},xr:{isPresenting:false},autoClear:true,
  getContext(){return state.gl??gl;},getRenderTarget:()=>state.target,getActiveCubeFace:()=>state.face,getActiveMipmapLevel:()=>state.level,getViewport:value=>value.copy(state.viewport),getScissor:value=>value.copy(state.scissor),getScissorTest:()=>state.test,
  initTexture(texture){events.push(['upload',texture.uuid]);uploads.push(texture);texture.addEventListener('dispose',()=>{});renderer.info.memory.textures++;state.target={upload:true};state.face=2;state.level=3;state.viewport.set(0,0,1,1);state.scissor.set(0,0,1,1);state.test=false;renderer.autoClear=false;},
  resetState(){events.push(['reset']);state.target=null;state.face=state.level=0;},setRenderTarget(target,face,level){state.target=target;state.face=face;state.level=level;},setViewport(value){state.viewport.copy(value);},setScissor(value){state.scissor.copy(value);},setScissorTest(value){state.test=value;},
  compileAsync(subject,camera,scene){const key=[...loaded].find(([,model])=>model.subject===subject)?.[0];assert.ok(key);assert.equal(camera,rig.camera);assert.equal(scene,rig.scene);events.push(['compile',key]);const gate=deferred();compileGates.push({key,...gate});subject.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){if(material.transparent&&material.side===THREE.DoubleSide){material.needsUpdate=true;material.needsUpdate=true;}material.side=THREE.BackSide;}});state.target={compile:true};state.viewport.set(0,0,1,1);state.scissor.set(0,0,1,1);state.test=false;renderer.autoClear=false;if(!deferShaders)queueMicrotask(()=>gate.resolve());return gate.promise;},
  dispose(){events.push(['renderer-dispose']);},forceContextLoss(){events.push(['force-loss']);state.lost=true;},render:trap('render'),setSize:trap('resize'),readRenderTargetPixels:trap('read'),copyFramebufferToTexture:trap('copy')};
 const rig={models,pending:new Map(),renderer,scene:new THREE.Scene(),camera:new THREE.OrthographicCamera(-1,1,1,-1,.1,100),lost:false,error:'',async load(key){events.push(['load-start',key]);let gate=loadGates.get(key);if(deferLoads){gate??=deferred();loadGates.set(key,gate);await gate.promise;}if(rig.loadError)throw rig.loadError;if(rig.loadFalse)return false;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));const material=new THREE.MeshBasicMaterial({map:shared,alphaMap:key==='enemy-walker'?other:shared,side:THREE.DoubleSide,transparent:true}),subject=new THREE.Group(),mesh=new THREE.SkinnedMesh(geometry,material),bone=new THREE.Bone();mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));subject.add(mesh);subject.updateMatrixWorld(true);const model={subject,sampler:{clips:[]},indices:{walk:0},mesh,material};models.set(key,model);loaded.set(key,model);events.push(['load-complete',key]);return true;},releaseUnused(keys){assert.deepEqual(keys,[]);events.push(['release']);models.clear();},frame:trap('pose'),beginBatch:trap('batch'),endBatch:trap('draw')};
 const createRig=()=>{events.push(['create']);return rig;};
 const dispatch=name=>{for(const listener of [...(listeners.get(name)??[])])listener({type:name,preventDefault(){}});};
 const source=()=>({textures:textures.map(texture=>({texture,source:texture.source,image:texture.image,version:texture.version,sourceVersion:texture.source.version,offset:texture.offset.toArray(),repeat:texture.repeat.toArray(),matrix:texture.matrix.toArray()})),models:[...loaded].map(([key,model])=>({key,model,subject:model.subject,parent:model.subject.parent,geometry:model.mesh.geometry,positions:[...model.mesh.geometry.attributes.position.array],uv:[...model.mesh.geometry.attributes.uv.array],material:model.material,map:model.material.map,alphaMap:model.material.alphaMap,side:model.material.side,bones:[...model.mesh.skeleton.boneMatrices]}))});
 return {rig,renderer,state,gl,shared,other,image,events,models,loaded,loadGates,compileGates,textures,uploads,forbidden,listeners,createRig,dispatch,source,listenerCount:()=>[...listeners.values()].reduce((sum,set)=>sum+set.size,0)};
}
const count=(f,name)=>f.events.filter(event=>event[0]===name).length;
const released=f=>{if(f.loaded.size)assert.ok(count(f,'release')>=1);assert.equal(count(f,'renderer-dispose'),1);assert.equal(count(f,'force-loss'),1);assert.equal(f.models.size,0);assert.equal(f.listenerCount(),0);assert.deepEqual(f.forbidden,[]);};
const gameplay=game=>({snapshot:game.snapshot(),rng:game.random.getState(),visualRng:game.visualRandom.getState(),events:structuredClone(game.events),particles:structuredClone(game.particles),corpses:structuredClone(game.corpses)});

test('sequential original loads, union texture upload and all shader readiness finish before a caller-controlled adoption without mutating gameplay or parent pointers',async()=>{
 const f=fixture({deferLoads:true,deferShaders:true}),game=new Game({seed:774,missionId:'mission-01',weapon:'nailgun'}),save={writes:0},privateCorpse=new Map([[game,{originalCorpseCache:true}]]),parent={game,rig:{originalOnDemand:true},privateCorpse},before=gameplay(game),keys=['enemy-walker','enemy-runner'];
 const pending=prepareNativeEnemyLaunch(keys,{createRig:f.createRig});await turn();assert.deepEqual(f.events.map(event=>event.slice(0,2)),[['create'],['load-start','enemy-walker']]);assert.equal(parent.rig.originalOnDemand,true);assert.equal(f.uploads.length,0);
 f.loadGates.get('enemy-walker').resolve();await turn();assert.equal(count(f,'load-start'),2);assert.equal(f.uploads.length,0,'no partial upload before the second original GLB completes');f.loadGates.get('enemy-runner').resolve();await turn();assert.deepEqual(f.uploads,[f.shared,f.other]);assert.equal(count(f,'reset'),1);assert.equal(f.compileGates.length,1);assert.equal(f.compileGates[0].key,'enemy-walker');const original=f.source();
 f.compileGates[0].resolve();await turn();assert.equal(f.compileGates.length,2);assert.equal(f.compileGates[1].key,'enemy-runner');assert.equal(count(f,'renderer-dispose'),0);assert.equal(parent.game,game);assert.equal(parent.rig.originalOnDemand,true);f.compileGates[1].resolve();const handle=await pending;assert.ok(handle);assert.equal(handle.rig,f.rig);assert.ok(handle.report);assert.equal(handle.isReady(),true);assert.deepEqual(f.source(),original);assert.ok([...f.loaded.values()].every(model=>model.material.version===2),'normal transparent DoubleSide compiler bookkeeping remains intact');assert.deepEqual(gameplay(game),before);assert.equal(save.writes,0);assert.equal(parent.privateCorpse,privateCorpse);assert.equal(parent.rig.originalOnDemand,true);
 assert.equal(handle.adopt(),f.rig);assert.equal(handle.adopt(),null,'ownership transfers only once');parent.rig=handle.rig;handle.dispose();handle.dispose();assert.equal(parent.rig,f.rig);assert.equal(count(f,'release'),0,'an adopted original rig belongs to the caller');assert.equal(count(f,'renderer-dispose'),0);assert.equal(count(f,'force-loss'),0);assert.equal(f.listenerCount(),0);assert.deepEqual(gameplay(game),before);assert.deepEqual(f.forbidden,[]);
});

test('invalid keys, pre-abort and an already used existing rig fall back without creating or destroying a context',async()=>{
 const invalid=[null,[],['enemy-walker','enemy-walker'],['walker'],['enemy-boss'],['enemy-walker','enemy-runner','enemy-shield','enemy-gas'],['enemy-walker',{}]];
 for(const keys of invalid){const f=fixture();assert.equal(await prepareNativeEnemyLaunch(keys,{createRig:f.createRig}),null);assert.deepEqual(f.events,[]);}
 for(const mode of ['pre-abort','drawn','allocated','batch']){const f=fixture(),controller=new AbortController(),existing={renderer:{info:{render:{frame:mode==='drawn'?1:0},memory:{textures:mode==='allocated'?1:0}}},batch:mode==='batch'?{}:null};if(mode==='pre-abort')controller.abort();assert.equal(await prepareNativeEnemyLaunch(['enemy-walker'],{signal:controller.signal,existingRig:existing,createRig:f.createRig}),null,mode);assert.deepEqual(f.events,[],mode);}
 const previousCache=THREE.Cache.enabled;try{THREE.Cache.enabled=true;const f=fixture();assert.equal(await prepareNativeEnemyLaunch(['enemy-walker'],{createRig:f.createRig}),null,'a global loader cache could share image ownership with the old rig');assert.deepEqual(f.events,[],'shared-cache mode must not allocate a candidate context');assert.equal(THREE.Cache.enabled,true,'the helper never changes the global loader cache preference');}finally{THREE.Cache.enabled=previousCache;}
});

test('cancel during an outstanding GLB load destroys its owned context immediately and late completion is released without affecting a subsequent launch',async()=>{
 const old=fixture({deferLoads:true}),controller=new AbortController(),pending=prepareNativeEnemyLaunch(['enemy-walker'],{signal:controller.signal,createRig:old.createRig});await turn();controller.abort();assert.equal(await pending,null);assert.equal(count(old,'renderer-dispose'),1);assert.equal(count(old,'force-loss'),1);const fresh=fixture(),handle=await prepareNativeEnemyLaunch(['enemy-runner'],{createRig:fresh.createRig});assert.ok(handle);assert.equal(handle.isReady(),true);old.loadGates.get('enemy-walker').resolve();await turn();await turn();released(old);assert.equal(old.uploads.length,0);assert.equal(old.compileGates.length,0);assert.equal(handle.isReady(),true);assert.equal(count(fresh,'renderer-dispose'),0);handle.dispose();released(fresh);
});

test('timeout during GLB loading returns null and disposes immediately while a late rejected original load stays handled',async()=>{
 const f=fixture({deferLoads:true}),pending=prepareNativeEnemyLaunch(['enemy-walker'],{createRig:f.createRig,timeoutMs:5});await turn();assert.equal(await pending,null);assert.equal(count(f,'renderer-dispose'),1);assert.equal(count(f,'force-loss'),1);f.loadGates.get('enemy-walker').reject(Error('late original GLB failure'));await turn();released(f);assert.equal(f.uploads.length,0);assert.equal(f.compileGates.length,0);
});

test('shader abort and context-loss cancellation return null, clean listeners and cannot resurrect readiness on late compiler completion',async()=>{
 for(const mode of ['abort','loss']){const f=fixture({deferShaders:true}),controller=new AbortController(),pending=prepareNativeEnemyLaunch(['enemy-walker'],{createRig:f.createRig,signal:controller.signal});await turn();assert.equal(f.compileGates.length,1);if(mode==='abort')controller.abort();else{f.state.lost=true;f.dispatch('webglcontextlost');}assert.equal(await pending,null);released(f);f.compileGates[0].resolve();await turn();released(f);}
});

test('load failure, preflight rejection and partial texture failure fall back and release only the new owned rig',async()=>{
 for(const mode of ['load-false','load-throw','nonstatic','upload-throw']){const f=fixture();if(mode==='load-false')f.rig.loadFalse=true;if(mode==='load-throw')f.rig.loadError=Error('controlled original load rejection');if(mode==='nonstatic')f.shared.image.width=0;if(mode==='upload-throw'){const original=f.renderer.initTexture;f.renderer.initTexture=function(texture){if(texture===f.other)throw Error('controlled partial texture failure');return original.call(this,texture);};}assert.equal(await prepareNativeEnemyLaunch(['enemy-walker'],{createRig:f.createRig}),null,mode);released(f);assert.equal(f.compileGates.length,0,mode);if(mode==='upload-throw')assert.deepEqual(f.uploads,[f.shared]);}
});

test('original model/map/source identity changes while shader readiness is pending invalidate the launch certificate',async()=>{
 for(const mode of ['model','map','source','context']){const f=fixture({deferShaders:true}),pending=prepareNativeEnemyLaunch(['enemy-walker'],{createRig:f.createRig});await turn();assert.equal(f.compileGates.length,1);if(mode==='model')f.models.set('enemy-walker',{...f.loaded.get('enemy-walker')});if(mode==='map')f.loaded.get('enemy-walker').material.map=f.other;if(mode==='source')f.shared.source=new THREE.TextureSource(f.image);if(mode==='context')f.state.gl={isContextLost:()=>false};f.compileGates[0].resolve();assert.equal(await pending,null,mode);released(f);}
});

test('an unadopted ready handle becomes invalid on context loss and disposes once; a stale handle cannot adopt',async()=>{
 const f=fixture(),handle=await prepareNativeEnemyLaunch(['enemy-walker'],{createRig:f.createRig});assert.ok(handle);assert.equal(handle.isReady(),true);f.state.lost=true;f.dispatch('webglcontextlost');assert.equal(handle.isReady(),false);assert.equal(Boolean(handle.adopt()),false);handle.dispose();handle.dispose();released(f);
});

test('cancelled asynchronous creation retires only its late new rig and never disposes an existing rig returned by a faulty factory',async()=>{
 const late=fixture(),creation=deferred(),controller=new AbortController(),pending=prepareNativeEnemyLaunch(['enemy-walker'],{signal:controller.signal,createRig:()=>creation.promise});await turn();controller.abort();assert.equal(await pending,null);assert.equal(count(late,'renderer-dispose'),0);creation.resolve(late.rig);await turn();released(late);assert.equal(count(late,'load-start'),0);
 const existing=fixture();assert.equal(await prepareNativeEnemyLaunch(['enemy-walker'],{existingRig:existing.rig,createRig:()=>existing.rig}),null);assert.deepEqual(existing.events,[]);assert.equal(count(existing,'renderer-dispose'),0);
});

test('an original rig becoming active during candidate loading rejects the candidate before any texture upload and preserves that active owner',async()=>{
 for(const mode of ['drawn','allocated','batch','lost']){
  const old=fixture(),f=fixture({deferLoads:true}),pending=prepareNativeEnemyLaunch(['enemy-walker'],{existingRig:old.rig,createRig:f.createRig});await turn();
  if(mode==='drawn')old.renderer.info.render.frame=1;if(mode==='allocated')old.renderer.info.memory.textures=1;if(mode==='batch')old.rig.batch={items:[]};if(mode==='lost')old.rig.lost=true;
  f.loadGates.get('enemy-walker').resolve();assert.equal(await pending,null,mode);released(f);assert.equal(f.uploads.length,0,mode);assert.equal(f.compileGates.length,0,mode);assert.deepEqual(old.events,[],mode);
 }
});
