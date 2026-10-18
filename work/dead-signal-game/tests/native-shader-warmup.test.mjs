import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {NativeShaderWarmup} from '../dist/boss-rig/native-shader-warmup.js';
import {LiveBossRig} from '../dist/boss-rig/live-boss.js';

// compileAsync is a deferred service mock. These tests prove public state and
// asset/lifecycle contracts, never real shader success, pixels, GPU execution,
// private vendor renderer recovery or cancellation of its internal polling.
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function eventSurface(){
 const listeners=new Map(),counts={added:0,removed:0};
 return {width:256,height:256,framebuffer:new Uint8Array([1,7,8,9,128,255]),counts,
  addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);counts.added++;},
  removeEventListener(type,listener){if(listeners.get(type)?.delete(listener))counts.removed++;},
  dispatch(type){for(const listener of [...(listeners.get(type)||[])])listener({type,preventDefault(){}});},
  listenerCount(){return [...listeners.values()].reduce((sum,set)=>sum+set.size,0);},
 };
}
function mockRenderer(){
 const calls=[],compiles=[],surface=eventSurface(),state={target:null,face:2,level:1,viewport:new THREE.Vector4(9,10,19,29),scissor:new THREE.Vector4(3,4,17,18),scissorTest:true,lost:false,fail:null,restoreFail:null},gl={isContextLost:()=>state.lost,getError(){throw Error('forbidden GL error query');}};
 const forbidden=name=>()=>{calls.push(['forbidden',name]);throw Error('forbidden '+name);};
 const renderer={domElement:surface,xr:{isPresenting:false},autoClear:true,getContext:()=>state.gl??gl,getRenderTarget:()=>state.target,getActiveCubeFace:()=>state.face,getActiveMipmapLevel:()=>state.level,getViewport:value=>value.copy(state.viewport),getScissor:value=>value.copy(state.scissor),getScissorTest:()=>state.scissorTest,
  setRenderTarget(target,face=0,level=0){calls.push(['restore','target']);if(state.restoreFail==='target')throw Error('restore-target-failure');state.target=target;state.face=face;state.level=level;},
  setViewport(value,y,w,h){calls.push(['restore','viewport']);if(state.restoreFail==='viewport')throw Error('restore-viewport-failure');state.viewport.copy(value?.isVector4?value:new THREE.Vector4(value,y,w,h));},
  setScissor(value,y,w,h){calls.push(['restore','scissor']);if(state.restoreFail==='scissor')throw Error('restore-scissor-failure');state.scissor.copy(value?.isVector4?value:new THREE.Vector4(value,y,w,h));},
  setScissorTest(value){calls.push(['restore','scissorTest']);if(state.restoreFail==='scissorTest')throw Error('restore-scissorTest-failure');state.scissorTest=value;},
  compileAsync(subject,camera,targetScene){
   assert.equal(this,renderer);assert.ok(subject.isObject3D&&camera.isCamera&&targetScene.isScene);const gate=deferred();compiles.push({gate,subject,camera,targetScene});calls.push(['compile']);
   state.target={temporaryCompilerBinding:true};state.face=7;state.level=3;state.viewport.set(55,66,77,88);state.scissor.set(11,22,33,44);state.scissorTest=false;renderer.autoClear=false;
   subject.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){if(material.side===THREE.DoubleSide&&material.transparent){material.needsUpdate=true;material.needsUpdate=true;}material.side=THREE.BackSide;}});
   if(state.fail==='compile')throw Error('mock-compile-failure');return gate.promise;
  },
  render:forbidden('render'),setSize:forbidden('resize'),copyFramebufferToTexture:forbidden('copy'),readRenderTargetPixels:forbidden('readback'),initTexture:forbidden('texture upload'),initRenderTarget:forbidden('target allocation'),
 };
 return {renderer,state,surface,calls,compiles,snapshot:()=>({target:state.target,face:state.face,level:state.level,viewport:state.viewport.toArray(),scissor:state.scissor.toArray(),scissorTest:state.scissorTest,autoClear:renderer.autoClear,width:surface.width,height:surface.height,framebuffer:[...surface.framebuffer]})};
}
function fixture(){
 const mock=mockRenderer(),key='enemy-original',geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,1,0,0,0,1,0,0,0,1,0,0],4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,.75,.25,0,0,.5,.5,0,0],4));
 const texture=new THREE.DataTexture(new Uint8Array([10,20,30,255]),1,1),front=new THREE.MeshBasicMaterial({map:texture,side:THREE.FrontSide}),double=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true,opacity:.75}),mesh=new THREE.SkinnedMesh(geometry,[front,double]);
 const hip=new THREE.Bone(),arm=new THREE.Bone();hip.name='Hips';arm.name='UpperArm';arm.position.set(.5,1,.2);hip.add(arm);mesh.add(hip);mesh.bind(new THREE.Skeleton([hip,arm]));mesh.position.set(1,2,3);hip.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),.3);arm.rotation.z=.2;
 const subject=new THREE.Group(),parent=new THREE.Group(),scene=new THREE.Scene(),light=new THREE.AmbientLight();subject.name='original Meshy subject';subject.position.set(4,5,6);subject.add(mesh);subject.add(new THREE.Mesh(geometry,front));parent.add(subject);scene.add(light);subject.updateMatrixWorld(true);mesh.skeleton.update();
 const camera=new THREE.OrthographicCamera(-100,100,100,-100,.1,8000);camera.position.set(1000,1000,1000);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
 const forbidden=name=>()=>{mock.calls.push(['forbidden',name]);throw Error('forbidden '+name);};
 const model={subject,root:mesh,bones:[hip,arm],states:new WeakMap(),sampler:{sample:forbidden('pose sample'),updateSkinPose:forbidden('skin update')}},rig={models:new Map([[key,model]]),pending:new Map(),renderer:mock.renderer,scene,camera,lost:false,error:'original rig error',load:forbidden('model load'),frame:forbidden('pose frame'),releaseExactGPUAlpha(){}};
 scene.add=forbidden('scene reparent');subject.add=forbidden('subject reparent');
 const resources=[geometry,front,double,texture],disposed=new Map(resources.map(resource=>[resource,0]));for(const resource of resources)resource.addEventListener('dispose',()=>disposed.set(resource,disposed.get(resource)+1));
 const assets=()=>({subjectParent:subject.parent,parentChildren:[...parent.children],sceneChildren:[...scene.children],meshParent:mesh.parent,geometry:mesh.geometry,attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([name,attribute])=>[name,{attribute,values:[...attribute.array]}])),materials:[...mesh.material],materialState:[front,double].map(material=>({side:material.side,map:material.map,transparent:material.transparent,opacity:material.opacity,color:material.color.toArray()})),textureData:[...texture.image.data],bones:[hip,arm].map(bone=>({parent:bone.parent,position:bone.position.toArray(),quaternion:bone.quaternion.toArray(),scale:bone.scale.toArray(),matrix:bone.matrix.toArray(),matrixWorld:bone.matrixWorld.toArray()})),boneMatrices:[...mesh.skeleton.boneMatrices],subjectMatrix:subject.matrix.toArray(),subjectWorld:subject.matrixWorld.toArray(),meshMatrix:mesh.matrix.toArray(),meshWorld:mesh.matrixWorld.toArray(),bindMatrix:mesh.bindMatrix.toArray(),inverseBind:mesh.bindMatrixInverse.toArray(),cameraMatrix:camera.matrix.toArray(),cameraWorld:camera.matrixWorld.toArray(),cameraProjection:camera.projectionMatrix.toArray(),cameraPosition:camera.position.toArray(),cameraQuaternion:camera.quaternion.toArray(),rigError:rig.error});
 return {...mock,rig,key,model,geometry,front,double,texture,mesh,subject,scene,camera,disposed,assets};
}
const noForbidden=f=>assert.equal(f.calls.some(call=>call[0]==='forbidden'),false,'preparation must never load, sample, draw, resize, copy, read or allocate GPU targets');
const noAssetDisposal=f=>assert.ok([...f.disposed.values()].every(count=>count===0),'helper disposal never owns the original model assets');

test('original skinned geometry, UVs, materials, hierarchy, bone matrices and camera survive deferred compile with synchronous public-state restoration',async t=>{
 const helper=new NativeShaderWarmup(),f=fixture(),before=f.snapshot(),assets=f.assets(),version=f.double.version;t.after(()=>helper.dispose());const pending=helper.prepare(f.rig,f.key);
 assert.equal(helper.prepare(f.rig,f.key),pending,'identical pending requests share the exact Promise');assert.equal(f.compiles.length,1);assert.deepEqual(f.compiles[0],{gate:f.compiles[0].gate,subject:f.subject,camera:f.camera,targetScene:f.scene});assert.deepEqual(f.snapshot(),before,'restore before asynchronous readiness finishes');assert.deepEqual(f.assets(),assets);noForbidden(f);noAssetDisposal(f);
 assert.equal(f.double.version,version+2,'normal vendor material version bookkeeping is preserved');f.compiles[0].gate.resolve();assert.equal(await pending,true);assert.equal(await helper.prepare(f.rig,f.key),true);assert.equal(f.compiles.length,1,'matching ready identity does not compile again');assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.assets(),assets);
 f.front.needsUpdate=true;const changed=helper.prepare(f.rig,f.key);assert.equal(f.compiles.length,2,'a genuinely changed material version requires fresh readiness');f.compiles[1].gate.resolve();assert.equal(await changed,true);helper.dispose();helper.dispose();assert.equal(f.surface.listenerCount(),0);noAssetDisposal(f);
});

test('missing models, unsupported APIs, lost/nondefault/XR contexts and pre-aborted requests reject before compilation or model changes',async()=>{
 const required=['getContext','getRenderTarget','getActiveCubeFace','getActiveMipmapLevel','getViewport','getScissor','getScissorTest','setRenderTarget','setViewport','setScissor','setScissorTest','compileAsync'];
 for(const mode of ['missing-rig','missing-model','missing-subject','empty-subject','missing-context','lost','rig-lost','nondefault','xr','pre-abort','getter','node-material','lit-material','env-map','scene-environment','shadows','missing-add-listener','missing-remove-listener',...required]){
  const helper=new NativeShaderWarmup(),f=fixture(),controller=new AbortController();
  if(mode==='missing-model')f.rig.models.delete(f.key);if(mode==='missing-subject')f.model.subject=null;if(mode==='empty-subject')f.model.subject=new THREE.Group();if(mode==='missing-context')f.renderer.getContext=()=>null;if(mode==='lost')f.state.lost=true;if(mode==='rig-lost')f.rig.lost=true;if(mode==='nondefault')f.state.target={originalTarget:true};if(mode==='xr')f.renderer.xr.isPresenting=true;if(mode==='pre-abort')controller.abort();if(mode==='getter')f.renderer.getViewport=()=>{throw Error('state getter failure');};if(mode==='node-material')f.front.isNodeMaterial=true;if(mode==='lit-material')f.front.isMeshBasicMaterial=false;if(mode==='env-map')f.front.envMap=f.texture;if(mode==='scene-environment')f.scene.environment=f.texture;if(mode==='shadows')f.renderer.shadowMap={enabled:true};if(mode==='missing-add-listener')f.surface.addEventListener=undefined;if(mode==='missing-remove-listener')f.surface.removeEventListener=undefined;if(required.includes(mode))f.renderer[mode]=undefined;
  const before=f.snapshot(),assets=f.assets();assert.equal(await helper.prepare(mode==='missing-rig'?null:f.rig,f.key,{signal:controller.signal}),false,mode);assert.equal(f.compiles.length,0);assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.assets(),assets);helper.dispose();assert.equal(f.surface.listenerCount(),0);noForbidden(f);noAssetDisposal(f);
 }
});

test('synchronous compile exceptions and asynchronous rejection report false, restore public state and allow an isolated retry',async t=>{
 for(const mode of ['throw','reject']){
  const helper=new NativeShaderWarmup(),f=fixture(),before=f.snapshot(),assets=f.assets();t.after(()=>helper.dispose());if(mode==='throw')f.state.fail='compile';const pending=helper.prepare(f.rig,f.key);assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.assets(),assets);
  if(mode==='reject')f.compiles[0].gate.reject(Error('mock-readiness-rejection'));assert.equal(await pending,false);assert.match(helper.lastError,/mock-/);noForbidden(f);noAssetDisposal(f);
  f.state.fail=null;const retry=helper.prepare(f.rig,f.key);f.compiles.at(-1).gate.resolve();assert.equal(await retry,true);assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.assets(),assets);helper.dispose();assert.equal(f.surface.listenerCount(),0);noAssetDisposal(f);
 }
});

test('abort, timeout and explicit disposal settle false while late old completions cannot replace or invalidate a new generation',async t=>{
 for(const mode of ['abort-resolve','abort-reject','timeout','dispose-resolve','dispose-reject']){
  const helper=new NativeShaderWarmup(),f=fixture(),controller=new AbortController(),assets=f.assets(),before=f.snapshot();t.after(()=>helper.dispose());const old=helper.prepare(f.rig,f.key,{signal:controller.signal,timeoutMs:mode==='timeout'?1:10000}),gate=f.compiles[0].gate;
  if(mode.startsWith('abort'))controller.abort();else if(mode.startsWith('dispose'))helper.dispose();assert.equal(await old,false);assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.assets(),assets);noAssetDisposal(f);
  const replacement=helper.prepare(f.rig,f.key),lastError=helper.lastError;assert.equal(f.compiles.length,2);if(mode.endsWith('reject'))gate.reject(Error('late previous failure'));else gate.resolve();await turn();assert.equal(helper.lastError,lastError,'an old generation cannot overwrite the new generation diagnostics');assert.equal(helper.prepare(f.rig,f.key),replacement);f.compiles[1].gate.resolve();assert.equal(await replacement,true);assert.equal(await helper.prepare(f.rig,f.key),true);assert.equal(f.compiles.length,2);noForbidden(f);helper.dispose();assert.equal(f.surface.listenerCount(),0);noAssetDisposal(f);
 }
});

test('context loss/restoration events and changed context identities invalidate readiness without resurrecting old work',async t=>{
 const helper=new NativeShaderWarmup(),f=fixture(),before=f.snapshot(),assets=f.assets();t.after(()=>helper.dispose());const pending=helper.prepare(f.rig,f.key),old=f.compiles[0].gate;assert.ok(f.surface.listenerCount()>0);
 f.state.lost=true;f.surface.dispatch('webglcontextlost');f.state.lost=false;f.surface.dispatch('webglcontextrestored');assert.equal(await pending,false);const retry=helper.prepare(f.rig,f.key);old.resolve();await turn();assert.equal(helper.prepare(f.rig,f.key),retry);f.compiles[1].gate.resolve();assert.equal(await retry,true);
 f.surface.dispatch('webglcontextrestored');const restored=helper.prepare(f.rig,f.key);assert.equal(f.compiles.length,3);f.compiles[2].gate.resolve();assert.equal(await restored,true);
 f.state.gl={isContextLost:()=>false};const changed=helper.prepare(f.rig,f.key);assert.equal(f.compiles.length,4);f.compiles[3].gate.resolve();assert.equal(await changed,true);assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.assets(),assets);noForbidden(f);helper.dispose();assert.equal(f.surface.listenerCount(),0);noAssetDisposal(f);
});

test('model, subject, renderer, scene and camera identity replacement cannot reuse stale ready or pending work',async t=>{
 for(const mode of ['model','subject','renderer','scene','camera']){
  const helper=new NativeShaderWarmup(),f=fixture();t.after(()=>helper.dispose());const old=helper.prepare(f.rig,f.key),oldGate=f.compiles[0].gate;let owner=f;
  if(mode==='model')f.rig.models.set(f.key,{...f.model});if(mode==='subject'){const subject=new THREE.Group();subject.add(new THREE.Mesh(f.geometry,f.front));f.model.subject=subject;}if(mode==='renderer'){owner=mockRenderer();f.rig.renderer=owner.renderer;}if(mode==='scene')f.rig.scene=new THREE.Scene();if(mode==='camera')f.rig.camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);
  const replacement=helper.prepare(f.rig,f.key);assert.notEqual(replacement,old);assert.equal(await old,false);oldGate.reject(Error('late replaced identity'));await turn();assert.equal(helper.prepare(f.rig,f.key),replacement);owner.compiles.at(-1).gate.resolve();assert.equal(await replacement,true);assert.equal(await helper.prepare(f.rig,f.key),true);noForbidden(f);noForbidden(owner);noAssetDisposal(f);helper.dispose();assert.equal(f.surface.listenerCount(),0);assert.equal(owner.surface.listenerCount(),0);
 }
});

test('actual releaseUnused model removal prevents stale certification and helper cleanup never double-disposes the rig-owned assets',async t=>{
 const helper=new NativeShaderWarmup(),f=fixture();t.after(()=>helper.dispose());const pending=helper.prepare(f.rig,f.key),gate=f.compiles[0].gate;
 LiveBossRig.prototype.releaseUnused.call(f.rig,[]);assert.equal(f.rig.models.has(f.key),false);const rigDisposals=new Map(f.disposed);assert.ok([...rigDisposals.values()].some(count=>count>0));gate.resolve();assert.equal(await pending,false);assert.equal(await helper.prepare(f.rig,f.key),false);helper.dispose();assert.deepEqual(f.disposed,rigDisposals,'the helper owns no geometry/material/texture disposal');assert.equal(f.surface.listenerCount(),0);noForbidden(f);
});

test('a failed public-state restoration still attempts independent restorations and never certifies readiness',async t=>{
 for(const failed of ['target','viewport','scissor','scissorTest']){
  const helper=new NativeShaderWarmup(),f=fixture(),before=f.snapshot(),assets=f.assets();t.after(()=>helper.dispose());f.state.restoreFail=failed;const pending=helper.prepare(f.rig,f.key);assert.equal(await pending,false);assert.match(helper.lastError,/restore-/);assert.deepEqual(f.assets(),assets,'original material sides are restored independently of renderer setter failures');
  const after=f.snapshot();for(const key of failed==='target'?['target','face','level']:[failed]){delete before[key];delete after[key];}assert.deepEqual(after,before);assert.ok(['target','viewport','scissor','scissorTest'].every(name=>f.calls.some(call=>call[0]==='restore'&&call[1]===name)));
  f.compiles[0].gate.resolve();await turn();helper.dispose();assert.equal(f.surface.listenerCount(),0);noForbidden(f);noAssetDisposal(f);
 }
});
