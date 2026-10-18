import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,realpath,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve,relative,sep,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GLTFLoader} from '../dist/player-rig/vendor/GLTFLoader.js';
import {clone as cloneRig} from '../dist/player-rig/vendor/SkeletonUtils.js';
import {AnimationSampler} from '../dist/player-rig/animation.js';
import {applyWeaponReadyPose} from '../dist/player-rig/weapon-pose.js';
import {loadNativeWeapon,weaponGripOffsets,attachAtPose} from '../dist/player-rig/weapon-attachment.js';
import {PLAYER_RUNTIME_MODULE_SOURCES,loadPlayerRuntimeModule} from '../../../tools/player-runtime-sources.mjs';

const rootURL=new URL('../../../',import.meta.url),rootPath=fileURLToPath(rootURL);
const evidenceURL=new URL('../../../qa/player-runtime-recoil-20261018/',import.meta.url);
const before=JSON.parse(await readFile(new URL('source-before.json',evidenceURL),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const originalBytes=await readFile(new URL('original-baker-weapon-pose.txt',evidenceURL));
const originalRecord=before.modules.find(record=>record.file==='work/meshy-sprite-baker/src/weapon-pose.js');
assert.ok(originalRecord);assert.equal(originalBytes.length,originalRecord.bytes);assert.equal(sha(originalBytes),originalRecord.sha256);
assert.equal(originalRecord.sha256,'2f85640fc1dbe3c6ea12678205e91a776ad1233e845b62031eeefba143b6773c');
const threeURL=new URL('../dist/player-rig/vendor/three.module.js',import.meta.url);
const original=await import('data:text/javascript;base64,'+Buffer.from(originalBytes.toString('utf8').replaceAll("from 'three'",'from '+JSON.stringify(threeURL.href))).toString('base64'));
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} should equal ${expected}`);
async function hashFile(file){const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');}

test('setup selects the tracked game IK source and generated runtime/provenance exactly match its compiled bytes',async()=>{
 assert.ok(Object.isFrozen(PLAYER_RUNTIME_MODULE_SOURCES));
 assert.equal(PLAYER_RUNTIME_MODULE_SOURCES['weapon-pose.js'],'work/dead-signal-game/player-rig-src/weapon-pose.js');
 assert.equal(PLAYER_RUNTIME_MODULE_SOURCES['animation.js'],'work/meshy-sprite-baker/src/animation.js');
 assert.equal(PLAYER_RUNTIME_MODULE_SOURCES['weapon-attachment.js'],'work/meshy-sprite-baker/src/weapon-attachment.js');
 const provenance=JSON.parse(await readFile(new URL('../dist/player-rig/provenance.json',import.meta.url),'utf8'));
 for(const name of ['animation.js','weapon-pose.js','weapon-attachment.js']){
  const loaded=await loadPlayerRuntimeModule(name),canonical=new URL(PLAYER_RUNTIME_MODULE_SOURCES[name],rootURL),sourceBytes=await readFile(canonical);
  assert.equal(loaded.sourceURL.href,canonical.href);assert.equal(loaded.source,sourceBytes.toString('utf8'));
  assert.equal(loaded.bytes,sourceBytes.length);assert.equal(loaded.sha256,sha(sourceBytes));
  assert.equal(loaded.compiled,loaded.source.replaceAll("from 'three'","from './vendor/three.module.js'"));
  assert.equal(loaded.compiledSHA256,sha(loaded.compiled));
  assert.deepEqual(await readFile(new URL('../dist/player-rig/'+name,import.meta.url)),Buffer.from(loaded.compiled),'setup must regenerate the current tracked behavior, not the old baker copy');
  const row=provenance.runtimeModules?.find(item=>item.output===name);assert.ok(row,name+' must record the selected runtime source');
  assert.equal(row.source,PLAYER_RUNTIME_MODULE_SOURCES[name]);assert.equal(row.sha256,loaded.sha256);assert.equal(row.bytes,loaded.bytes);assert.equal(row.outputSHA256,loaded.compiledSHA256);
 }
 const gameSource=await loadPlayerRuntimeModule('weapon-pose.js');
 assert.notEqual(gameSource.sha256,originalRecord.sha256,'the game extension must have its own tracked source');
 const setup=await readFile(new URL('../../../tools/prepare-player-runtime.mjs',import.meta.url),'utf8');
 assert.match(setup,/loadPlayerRuntimeModule\(name\)/);assert.match(setup,/writeFile\([^\n]+module\.compiled/);
 const gitignore=await readFile(new URL('../../../.gitignore',import.meta.url),'utf8');
 assert.match(gitignore,/work\/dead-signal-game\/dist\/player-rig\/weapon-pose\.js/);
 assert.doesNotMatch(gitignore,/^work\/dead-signal-game\/player-rig-src\//m,'the canonical game IK source must be transferable through Git');
});

test('unknown module names reject before fallback and a missing canonical file never silently loads the old baker',async()=>{
 for(const name of ['missing.js','constructor','__proto__','../weapon-pose.js','weapon-pose.js?old','weapon-pose',null,0,{},Symbol('name')]){
  await assert.rejects(loadPlayerRuntimeModule(name,{rootURL:new URL('file:///missing-runtime-source-root/')}),error=>error instanceof RangeError&&error.message==='Unknown player runtime module');
 }
 const temporary=await mkdtemp(join(tmpdir(),'deadsignal-runtime-source-'));
 try{
  const oldDirectory=join(temporary,'work','meshy-sprite-baker','src');await mkdir(oldDirectory,{recursive:true});
  await writeFile(join(oldDirectory,'weapon-pose.js'),'export const oldBakerFallbackMustNotLoad=true;\n');
  const fixtureRoot=pathToFileURL(temporary+sep);
  await assert.rejects(loadPlayerRuntimeModule('weapon-pose.js',{rootURL:fixtureRoot}),error=>error?.code==='ENOENT');
  const canonical=join(temporary,...PLAYER_RUNTIME_MODULE_SOURCES['weapon-pose.js'].split('/'));await mkdir(resolve(canonical,'..'),{recursive:true});
  const sentinel="import {Vector3} from 'three';\nexport const trackedFixture=true;\n";await writeFile(canonical,sentinel);
  const loaded=await loadPlayerRuntimeModule('weapon-pose.js',{rootURL:fixtureRoot});assert.equal(loaded.source,sentinel);
  assert.equal(loaded.sourceURL.href,pathToFileURL(canonical).href);assert.equal(loaded.compiled,sentinel.replaceAll("from 'three'","from './vendor/three.module.js'"));
 }finally{
  const base=await realpath(tmpdir()),target=await realpath(temporary);
  assert.ok(relative(base,target)&&target.startsWith(base+sep)&&basename(target).startsWith('deadsignal-runtime-source-'),'only the owned temporary fixture may be removed');
  await rm(target,{recursive:true,force:true});
 }
});

test('historical baker modules, source/runtime models and the original recoil thresholds remain byte exact',async()=>{
 for(const row of before.modules.filter(record=>record.file.startsWith('work/meshy-sprite-baker/src/')||record.file.endsWith('/player-weapon-recoil.test.mjs'))){
  const file=new URL(row.file,rootURL);assert.equal((await stat(file)).size,row.bytes,row.file);assert.equal(await hashFile(file),row.sha256,row.file);
 }
 for(const row of before.models){const file=new URL(row.file,rootURL);assert.equal((await stat(file)).size,row.bytes,row.file);assert.equal(await hashFile(file),row.sha256,row.file);}
 assert.equal(await hashFile(new URL('work/meshy-sprite-baker/src/weapon-pose.js',rootURL)),sha(originalBytes));
});

let modelsPromise;
function models(){
 return modelsPromise??=(async()=>{
  const loader=new GLTFLoader();loader.register(()=>({name:'numeric-texture-placeholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const parse=async name=>{const bytes=await readFile(new URL('work/meshy-sprite-baker/models/'+name,rootURL));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
  const survivor=await parse('survivor-v2-run.glb'),shotgun=await parse('weapon-shotgun.glb'),nailgun=await parse('weapon-nailgun.glb');
  const configurations=JSON.parse(await readFile(new URL('../dist/player-rig/weapon-config.json',import.meta.url),'utf8'));
  return {survivor,weapons:{shotgun,nailgun},configurations};
 })();
}
function rig(survivor){
 const root=cloneRig(survivor.scene);
 // clone().bind() resets the attached skin inverse; unlike a freshly parsed
 // scene, the clone needs the SkinnedMesh update before precise skin bounds.
 root.updateMatrixWorld(true);root.traverse(object=>{if(object.isSkinnedMesh)object.skeleton.update();});
 const bounds=new THREE.Box3().setFromObject(root,true),center=bounds.getCenter(new THREE.Vector3()),scale=44/(bounds.max.y-bounds.min.y);
 const normalization=new THREE.Group(),motion=new THREE.Group(),subject=new THREE.Group();normalization.scale.setScalar(scale);normalization.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
 normalization.add(root);motion.add(normalization);subject.add(motion);
 subject.updateMatrixWorld(true);const normalizedBounds=new THREE.Box3().setFromObject(subject,true);
 close(normalizedBounds.max.y-normalizedBounds.min.y,44);close(normalizedBounds.min.y,0);
 const sampler=new AnimationSampler({root,subject,motion,clips:survivor.animations,subjectHeight:44});
 const bones=[];root.traverse(object=>{if(object.isBone)bones.push(object);});
 return {root,subject,sampler,bones};
}
function boneState(model){model.subject.updateMatrixWorld(true);return model.bones.map(bone=>({name:bone.name,position:bone.position.toArray(),quaternion:bone.quaternion.toArray(),scale:bone.scale.toArray(),world:bone.matrixWorld.toArray()}));}
function footState(model){return ['Hips','LeftFoot','RightFoot','LeftToeBase','RightToeBase'].map(name=>({name,world:model.root.getObjectByName(name).getWorldPosition(new THREE.Vector3()).toArray()}));}
const originalResultFields=['supported','method','desiredGripHeight','right','left','coupledSupport','weaponAnchor','fingerRig','weaponGeometryAdded'];

test('omitted and zero retraction retain the actual original baker pose, feet and two-hand weapon transforms exactly',async()=>{
 const data=await models(),a=rig(data.survivor),b=rig(data.survivor);
 for(const name of ['shotgun','nailgun']){
  const oldWeapon=loadNativeWeapon({...data.weapons[name],scene:cloneRig(data.weapons[name].scene)},data.configurations[name]),newWeapon=loadNativeWeapon({...data.weapons[name],scene:cloneRig(data.weapons[name].scene)},data.configurations[name]);
  const offsets=weaponGripOffsets(oldWeapon);assert.deepEqual(weaponGripOffsets(newWeapon),offsets);
  for(const phase of [.1,.35,.7])for(const heading of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const explicitZero of [false,true]){
   a.subject.rotation.y=b.subject.rotation.y=heading;a.sampler.sample(0,data.survivor.animations[0].duration*phase);b.sampler.sample(0,data.survivor.animations[0].duration*phase);
   const beforeFeet=footState(b),old=original.applyWeaponReadyPose({root:a.root,subject:a.subject,supportOffset:offsets.supportOffset}),current=applyWeaponReadyPose({root:b.root,subject:b.subject,supportOffset:offsets.supportOffset,...(explicitZero?{retraction:0}:{})});
   assert.equal(current.supported,true);assert.equal(current.retraction,0);assert.equal(current.requestedRetraction,0);
   for(const key of originalResultFields)assert.deepEqual(current[key],old[key],`${name}/${phase}/${heading}/${explicitZero}/${key}`);
   assert.deepEqual(boneState(b),boneState(a),'default0 must keep every original numerical bone transform');assert.deepEqual(footState(b),beforeFeet);
   const attach=(weapon,model)=>attachAtPose(weapon,{subject:model.subject,rightHand:model.root.getObjectByName('RightHand'),leftHand:model.root.getObjectByName('LeftHand'),aimDirection:[0,0,1]});
   assert.deepEqual(attach(newWeapon,b),attach(oldWeapon,a));assert.deepEqual(newWeapon.root.matrix.toArray(),oldWeapon.root.matrix.toArray());assert.deepEqual(newWeapon.root.matrixWorld.toArray(),oldWeapon.root.matrixWorld.toArray());
  }
  oldWeapon.root.removeFromParent();newWeapon.root.removeFromParent();
 }
});

test('invalid retraction never coerces inputs and positive finite requests remain bounded with the original feet and arm geometry',async()=>{
 const data=await models(),model=rig(data.survivor),baseline=rig(data.survivor);
 const weapon=loadNativeWeapon({...data.weapons.shotgun,scene:cloneRig(data.weapons.shotgun.scene)},data.configurations.shotgun),offset=weaponGripOffsets(weapon).supportOffset;
 const reset=()=>{model.sampler.sample(0,data.survivor.animations[0].duration*.35);baseline.sampler.sample(0,data.survivor.animations[0].duration*.35);};
 let coerced=0;const coercible={valueOf(){coerced++;throw Error('must-not-coerce');}};
 for(const retraction of [-1,-Infinity,Infinity,NaN,null,undefined,'1',Symbol('retraction'),coercible]){
  reset();const old=original.applyWeaponReadyPose({root:baseline.root,subject:baseline.subject,supportOffset:offset});
  const current=applyWeaponReadyPose({root:model.root,subject:model.subject,supportOffset:offset,retraction});
  assert.equal(current.retraction,0);assert.equal(current.requestedRetraction,0);assert.deepEqual(boneState(model),boneState(baseline));
  for(const key of originalResultFields)assert.deepEqual(current[key],old[key]);
 }
 assert.equal(coerced,0);
 let maximum=0;
 for(const retraction of [Number.MIN_VALUE,.25,.75,1.1,5,Number.MAX_VALUE]){
  reset();const feet=footState(model),positions=model.bones.map(bone=>bone.position.toArray()),scales=model.bones.map(bone=>bone.scale.toArray());
  const old=original.applyWeaponReadyPose({root:baseline.root,subject:baseline.subject,supportOffset:offset}),current=applyWeaponReadyPose({root:model.root,subject:model.subject,supportOffset:offset,retraction});
  assert.equal(current.supported,true);assert.equal(current.requestedRetraction,Math.min(1.1,retraction));assert.ok(Number.isFinite(current.retraction)&&current.retraction>=0&&current.retraction<=current.requestedRetraction);
  maximum=Math.max(maximum,current.retraction);close(old.right.requested.z-current.right.requested.z,current.retraction);close(old.left.requested.z-current.left.requested.z,current.retraction);
  assert.equal(current.right.clamped,false);assert.equal(current.left.clamped,false);
  const diagnostic=JSON.stringify({retraction,offset,old,current});
  assert.ok(current.right.error<1e-4,'right IK residual: '+diagnostic);assert.ok(current.left.error<1e-4,'left IK residual: '+diagnostic);
  close(current.left.requested.x-current.right.requested.x,offset.x);close(current.left.requested.y-current.right.requested.y,offset.y);close(current.left.requested.z-current.right.requested.z,offset.z);
  assert.deepEqual(footState(model),feet);assert.deepEqual(model.bones.map(bone=>bone.position.toArray()),positions);assert.deepEqual(model.bones.map(bone=>bone.scale.toArray()),scales);
  for(const bone of model.bones){assert.ok(bone.quaternion.toArray().every(Number.isFinite));close(bone.quaternion.length(),1,1e-5);}
 }
 assert.ok(maximum>1,'the regenerated actual original rig must receive a visible bounded hand retreat');
 reset();const unreachable={supportOffset:offset,gripHeight:1e6};
 const oldUnreachable=original.applyWeaponReadyPose({root:baseline.root,subject:baseline.subject,...unreachable});
 const currentUnreachable=applyWeaponReadyPose({root:model.root,subject:model.subject,...unreachable,retraction:1.1});
 assert.equal(currentUnreachable.retraction,0);assert.equal(currentUnreachable.requestedRetraction,1.1);
 assert.equal(currentUnreachable.coupledSupport.reachable,false);
 for(const key of originalResultFields)assert.deepEqual(currentUnreachable[key],oldUnreachable[key],'an unreachable original request must retain its original fallback');
 assert.deepEqual(boneState(model),boneState(baseline));weapon.root.removeFromParent();
 const absent={root:new THREE.Group(),subject:new THREE.Group(),retraction:1.1};assert.deepEqual(applyWeaponReadyPose(absent),original.applyWeaponReadyPose(absent));
});
