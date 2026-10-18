import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GLTFLoader} from '../dist/player-rig/vendor/GLTFLoader.js';
import {AnimationSampler} from '../dist/player-rig/animation.js';
import {LiveBossRig} from '../dist/boss-rig/live-boss.js';
import {createAnimationOnlyLoader} from '../dist/boss-rig/animation-only-loader.js';

const registryUrl=new URL('../dist/boss-rig/enemy-registry.json',import.meta.url);
const fileUrl=relative=>new URL('../dist/boss-rig/'+relative,import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const arrayBytes=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength);
const parse=(loader,bytes)=>loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
// Node has no image decoder. This baseline preserves the normal full-scene
// parser and counts its texture requests; real decode savings require browser QA.
function baselineLoader(image=null){
 const loader=new GLTFLoader();loader.textureRequests=0;
 loader.register(()=>({name:'node-baseline-image-placeholder',loadTexture:()=>{loader.textureRequests++;return Promise.resolve(new THREE.Texture(image));}}));return loader;
}
function geometryDigest(root){
 const hash=createHash('sha256');root.traverse(object=>{const g=object.geometry;if(!g)return;
  for(const name of Object.keys(g.attributes).sort()){hash.update(name);const a=g.attributes[name],array=a.array||a.data?.array;hash.update(arrayBytes(array));}
  if(g.index)hash.update(arrayBytes(g.index.array));
 });return hash.digest('hex');
}
function materialMaps(root){const maps=[];root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.map)maps.push({mesh:o.name,material:m.name,texture:m.map});});return maps;}
function makeSampler(gltf,config){
 const root=gltf.scene,normal=new THREE.Group(),motion=new THREE.Group(),subject=new THREE.Group(),p=config.source.originPivot,s=config.source.scale;
 normal.scale.setScalar(s);normal.position.set(-p.x*s,-p.y*s,-p.z*s);normal.add(root);motion.add(normal);subject.add(motion);subject.rotation.y=.73;
 const sampler=new AnimationSampler({root,subject,motion,clips:gltf.animations,subjectHeight:config.projection.subjectHeight});
 return {sampler,bones:sampler.restTransforms.filter(e=>e.object.isBone).map(e=>e.object)};
}
function poseSnapshot(model){
 return {bones:model.bones.map(b=>({name:b.name,p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray(),world:b.matrixWorld.toArray()})),
  skins:model.sampler.skins.map(mesh=>({matrices:Array.from(mesh.skeleton.boneMatrices),points:Array.from({length:8},(_,i)=>{
   const index=Math.floor(i*(mesh.geometry.attributes.position.count-1)/7);return mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray();
  })})),motion:model.sampler.motion.position.toArray()};
}

test('all seven original walk files retain exact clips, geometry, UVs, every source bone and skinned points without decoding their unused textures',async()=>{
 const registryBytes=await readFile(registryUrl),registry=JSON.parse(registryBytes),optimizedLoader=createAnimationOnlyLoader();
 assert.equal(optimizedLoader.skippedTextures,0);
 for(const [key,config]of Object.entries(registry.bosses)){
  const bytes=await readFile(fileUrl(config.walkFile)),before=digest(bytes),baseline=baselineLoader(),skippedBefore=optimizedLoader.skippedTextures;
  const a=await parse(baseline,bytes),b=await parse(optimizedLoader,bytes);
  assert.equal(baseline.textureRequests,1,key+' original full-scene parser requests its embedded image');assert.equal(optimizedLoader.skippedTextures-skippedBefore,baseline.textureRequests);
  assert.equal(a.animations.length,10);assert.equal(b.animations.length,a.animations.length);
  for(let i=0;i<a.animations.length;i++){
   const source=a.animations[i],candidate=b.animations[i];assert.equal(candidate.name,source.name);assert.equal(candidate.duration,source.duration);assert.equal(candidate.blendMode,source.blendMode);assert.equal(candidate.tracks.length,source.tracks.length);
   for(let j=0;j<source.tracks.length;j++){
    const left=source.tracks[j],right=candidate.tracks[j];assert.equal(right.name,left.name);assert.equal(right.ValueTypeName,left.ValueTypeName);assert.equal(right.getInterpolation(),left.getInterpolation());
    assert.deepEqual(right.times,left.times,key+' '+source.name+' original keyframe times');assert.deepEqual(right.values,left.values,key+' '+source.name+' original keyframe values');
   }
  }
  const geometry=geometryDigest(a.scene);assert.equal(geometryDigest(b.scene),geometry);
  const sourceMaps=materialMaps(a.scene),candidateMaps=materialMaps(b.scene);assert.equal(sourceMaps.length,1);assert.equal(candidateMaps.length,sourceMaps.length);
  for(let i=0;i<sourceMaps.length;i++){
   const left=sourceMaps[i],right=candidateMaps[i];assert.equal(right.mesh,left.mesh);assert.equal(right.material,left.material);assert.equal(right.texture.isTexture,true);
   assert.equal(right.texture.name,left.texture.name);assert.equal(right.texture.image,null);assert.equal(right.texture.colorSpace,left.texture.colorSpace);
  }
  const sourceModel=makeSampler(a,config),candidateModel=makeSampler(b,config);assert.ok(sourceModel.bones.length>=20,'compare every actual source bone rather than inventing a larger rig');assert.equal(candidateModel.bones.length,sourceModel.bones.length);assert.ok(sourceModel.sampler.skins.length>0);
  for(let clip=0;clip<a.animations.length;clip++)for(const progress of [0,.17,.51,.93,1]){
   const time=a.animations[clip].duration*progress;sourceModel.sampler.sample(clip,time);candidateModel.sampler.sample(clip,time);
   assert.deepEqual(poseSnapshot(candidateModel),poseSnapshot(sourceModel),key+' '+a.animations[clip].name+' at '+progress+' retains exact original skeletal rendering inputs');
  }
  assert.equal(geometryDigest(a.scene),geometry);assert.equal(geometryDigest(b.scene),geometry);
  assert.equal(digest(bytes),before,'parsers do not mutate original GLB input');assert.equal(digest(await readFile(fileUrl(config.walkFile))),before,'original GLB file remains unchanged');
 }
 assert.equal(optimizedLoader.skippedTextures,7);assert.deepEqual(await readFile(registryUrl),registryBytes,'original registry remains unchanged');
});

test('actual LiveBossRig.load keeps the visible original base texture and appends walk clips in the same order through a separate loader',async()=>{
 const registry=JSON.parse(await readFile(registryUrl)),key='enemy-walker',config=registry.bosses[key],configBefore=JSON.stringify(config),baseBytes=await readFile(fileUrl(config.file)),walkBytes=await readFile(fileUrl(config.walkFile)),baseHash=digest(baseBytes),walkHash=digest(walkBytes);
 for(const forceWalkTextureDecode of [false,true]){
  const originalImage={width:4096,height:4096,tag:'visible-original-image'},baseParser=baselineLoader(originalImage),walkParser=baselineLoader(),base=await parse(baseParser,baseBytes),walk=await parse(walkParser,walkBytes);
  const visibleMaps=materialMaps(base.scene),geometry=geometryDigest(base.scene),baseClips=[...base.animations],baseCalls=[],clipCalls=[],clipLoader=createAnimationOnlyLoader();
  const clipLoad=clipLoader.loadAsync.bind(clipLoader);clipLoader.loadAsync=async url=>{clipCalls.push(url);assert.equal(url,fileUrl(config.walkFile).href);return parse(clipLoader,walkBytes);};
  const loader={async loadAsync(url){baseCalls.push(url);if(url===fileUrl(config.file).href)return base;assert.equal(url,fileUrl(config.walkFile).href);return walk;}};
  const rig=Object.create(LiveBossRig.prototype);Object.assign(rig,{size:256,models:new Map(),pending:new Map(),registry:Promise.resolve(registry),loader,clipLoader,forceWalkTextureDecode,error:''});
  const pending=rig.load(key);assert.equal(rig.load(key),pending,'concurrent requests reuse the pending load');assert.equal(await pending,true,rig.error);
  const model=rig.models.get(key);assert.equal(model.root,base.scene);assert.equal(geometryDigest(model.root),geometry);assert.equal(model.sampler.clips.length,baseClips.length+walk.animations.length);
  for(let i=0;i<baseClips.length;i++)assert.equal(model.sampler.clips[i],baseClips[i],'visible base clips remain in their original positions');
  for(let i=0;i<walk.animations.length;i++){
   const clip=model.sampler.clips[baseClips.length+i];assert.equal(clip.name,walk.animations[i].name);assert.equal(clip.duration,walk.animations[i].duration);
   if(forceWalkTextureDecode)assert.equal(clip,walk.animations[i]);
  }
  const loadedMaps=materialMaps(model.root);assert.equal(loadedMaps.length,visibleMaps.length);
  for(let i=0;i<visibleMaps.length;i++){assert.equal(loadedMaps[i].texture,visibleMaps[i].texture,'unlit visible material retains its actual base texture');assert.equal(loadedMaps[i].texture.image,originalImage);}
  assert.equal(baseParser.textureRequests,1);assert.equal(baseCalls.length,forceWalkTextureDecode?2:1);assert.equal(clipCalls.length,forceWalkTextureDecode?0:1);assert.equal(clipLoader.skippedTextures,forceWalkTextureDecode?0:1);
  assert.equal(await rig.load(key),true);assert.equal(baseCalls.length,forceWalkTextureDecode?2:1,'already loaded source is not fetched again');assert.equal(clipCalls.length,forceWalkTextureDecode?0:1);
  clipLoader.loadAsync=clipLoad;
 }
 assert.equal(JSON.stringify(config),configBefore);assert.equal(digest(baseBytes),baseHash);assert.equal(digest(walkBytes),walkHash);assert.equal(digest(await readFile(fileUrl(config.file))),baseHash);assert.equal(digest(await readFile(fileUrl(config.walkFile))),walkHash);
});
