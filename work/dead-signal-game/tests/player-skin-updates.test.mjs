import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GLTFLoader} from '../dist/player-rig/vendor/GLTFLoader.js';
import {AnimationSampler} from '../dist/player-rig/animation.js';
import {LivePlayerRig} from '../dist/player-rig/live-player.js';
import {loadNativeWeapon,weaponGripOffsets} from '../dist/player-rig/weapon-attachment.js';
import {LocomotionBlend} from '../dist/player-rig/locomotion-blend.js';
import {FootPlanting} from '../dist/player-rig/foot-planting.js';
import {PlayerRigMotion} from '../dist/player-rig-motion.js';
import {Game} from '../dist/engine.js';

const assetNames=['survivor-v2-walk.glb','survivor-v2-run.glb','survivor-rig-motion.glb','weapon-shotgun.glb','weapon-nailgun.glb','throwable-molotov.glb'];
const assetUrl=name=>new URL('../dist/player-rig/models/'+name,import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const arrayBytes=value=>Buffer.from(value.buffer,value.byteOffset,value.byteLength);
function originalDataDigest(model,weapons,bottle){
 const hash=createHash('sha256'),seen=new Set();
 for(const root of [model.root,...[...weapons.values()].map(w=>w.model),bottle])root.traverse(object=>{
  const geometry=object.geometry;if(!geometry||seen.has(geometry))return;seen.add(geometry);
  for(const name of Object.keys(geometry.attributes).sort()){
   hash.update(name);const attribute=geometry.attributes[name],array=attribute.array||attribute.data?.array;if(array)hash.update(arrayBytes(array));
  }
  if(geometry.index)hash.update(arrayBytes(geometry.index.array));
 });
 for(const clip of model.sampler.clips)for(const track of clip.tracks){hash.update(track.name);hash.update(arrayBytes(track.times));hash.update(arrayBytes(track.values));}
 return hash.digest('hex');
}
async function fixture(assets,config,forceRedundantSkinUpdates){
 const loader=new GLTFLoader();loader.register(()=>({name:'numeric-texture-placeholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const parse=name=>{const b=assets.get(name);return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
 const walk=await parse('survivor-v2-walk.glb'),run=await parse('survivor-v2-run.glb'),authored=await parse('survivor-rig-motion.glb');
 const root=run.scene,bounds=new THREE.Box3().setFromObject(root,true),center=bounds.getCenter(new THREE.Vector3()),scale=44/(bounds.max.y-bounds.min.y);
 const normal=new THREE.Group(),motion=new THREE.Group(),subject=new THREE.Group();normal.scale.setScalar(scale);normal.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);normal.add(root);motion.add(normal);subject.add(motion);
 const walking=walk.animations.find(c=>/walking/i.test(c.name)),running=run.animations.find(c=>/running/i.test(c.name));
 const actions=['DS_Idle','DS_Attack','DS_Hit','DS_Death'].map(name=>authored.animations.find(c=>c.name===name));
 assert.ok(walking&&running&&actions.every(Boolean),'all original locomotion/action clips exist');
 const sampler=new AnimationSampler({root,subject,motion,clips:[walking,running,...actions],subjectHeight:44}),model={root,subject,motion,sampler};
 const rig=Object.create(LivePlayerRig.prototype);Object.assign(rig,{ready:true,models:new Map([['run',model]]),weapons:new Map(),scene:new THREE.Scene(),clock:new PlayerRigMotion(),footPlanting:new FootPlanting(),blend:new LocomotionBlend(sampler),actionReferences:new Map(),forceRedundantSkinUpdates});
 for(const index of [3,4]){sampler.sample(index,0);rig.actionReferences.set(index,rig.blend.snapshot());}
 for(const name of ['shotgun','nailgun']){const weapon=loadNativeWeapon(await parse('weapon-'+name+'.glb'),config[name]);weapon.gripOffsets=weaponGripOffsets(weapon);rig.weapons.set(name,weapon);}
 const bottleAsset=await parse('throwable-molotov.glb'),bottleBounds=new THREE.Box3().setFromObject(bottleAsset.scene,true),bottleCenter=bottleBounds.getCenter(new THREE.Vector3()),bottleNormal=new THREE.Group();
 bottleNormal.scale.setScalar(10/(bottleBounds.max.y-bottleBounds.min.y));bottleNormal.position.copy(bottleCenter).multiplyScalar(-bottleNormal.scale.x);bottleNormal.add(bottleAsset.scene);rig.bottle=new THREE.Group();rig.bottle.add(bottleNormal);
 let updates=0;const update=sampler.updateSkinPose.bind(sampler);sampler.updateSkinPose=()=>{updates++;return update();};
 rig.rasterFrame=(m,weapon,fallback,pose,{weaponVisible,held,muzzle})=>{
  weapon.root.visible=weaponVisible;if(held)rig.bottle.visible=true;
  return {pose:{...pose},weaponVisible,held:!!held,muzzle:{...muzzle},
   bones:rig.blend.bones.map(b=>({name:b.name,position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray(),matrix:b.matrix.toArray(),world:b.matrixWorld.toArray()})),
   skins:m.sampler.skins.map(mesh=>Array.from(mesh.skeleton.boneMatrices)),
   weapon:{position:weapon.root.position.toArray(),quaternion:weapon.root.quaternion.toArray(),scale:weapon.root.scale.toArray(),world:weapon.root.matrixWorld.toArray()},
   bottle:held?{position:rig.bottle.position.toArray(),quaternion:rig.bottle.quaternion.toArray()}:null};
 };
 rig.place=selected=>selected;
 return {rig,model,updates:()=>updates,originalDigest:()=>originalDataDigest(model,rig.weapons,rig.bottle)};
}

test('actual original player frame keeps identical poses, native attachments and source data while skipping only redundant skin updates',async()=>{
 const assets=new Map(await Promise.all(assetNames.map(async name=>[name,await readFile(assetUrl(name))]))),sourceHashes=new Map([...assets].map(([name,bytes])=>[name,digest(bytes)]));
 const config=JSON.parse(await readFile(new URL('../dist/player-rig/weapon-config.json',import.meta.url)));
 const steps=[
  {name:'idle',time:0,dx:0,dy:0},{name:'idle',time:.05,dx:0,dy:0},
  {name:'walk',time:.10,dx:3,dy:1},{name:'walk',time:.15,dx:4,dy:1},
  {name:'run',time:.20,dx:12,dy:3},{name:'run',time:.25,dx:12,dy:3},
  {name:'shot',time:.30,dx:3,dy:1,recoil:.115},{name:'shot',time:.325,dx:3,dy:1,recoil:.09},
  {name:'hit',time:.35,dx:2,dy:1,hitFlash:.34},{name:'hit',time:.375,dx:2,dy:1,hitFlash:.30},
  {name:'recover',time:.42,dx:2,dy:1},
  {name:'reload',time:.47,dx:3,dy:1,reload:.9},{name:'reload',time:.52,dx:3,dy:1,reload:.5},{name:'reload',time:.57,dx:3,dy:1,reload:.2},
  {name:'idle',time:.62,dx:0,dy:0},
  {name:'throw',time:.67,dx:2,dy:1,throwAge:.08},{name:'throw',time:.72,dx:2,dy:1,throwAge:.20},
  {name:'throw',time:.77,dx:2,dy:1,throwAge:.28},{name:'throw',time:.82,dx:2,dy:1,throwAge:.50},
  {name:'recover',time:.92,dx:0,dy:0},
 ];
 for(const weapon of ['shotgun','nailgun']){
  const baseline=await fixture(assets,config,true),candidate=await fixture(assets,config,false),cases=[];
  for(const f of [baseline,candidate]){
   const game=new Game({weapon,seed:774}),actor=game.player,sourceBefore=f.originalDigest(),frames=[];
   const reloadDuration=weapon==='shotgun'?1.35:1.1;actor.angle=weapon==='shotgun'?.8:2.7;
   for(const step of steps){
    actor.x+=step.dx;actor.y+=step.dy;actor.recoil=step.recoil||0;actor.reloadTime=(step.reload||0)*reloadDuration;
    const options=Object.freeze({hitFlash:step.hitFlash||0,reloadDuration,throwMotion:step.throwAge===undefined?null:Object.freeze({elapsed:step.throwAge,angle:actor.angle+.7,released:step.throwAge>=.22})});
    const before=JSON.stringify(game.snapshot()),calls=f.updates(),selected=f.rig.frame(actor,step.time,Object.freeze({id:'original-source-fallback'}),options);
    assert.equal(JSON.stringify(game.snapshot()),before,weapon+' '+step.name+' cannot change authoritative game data');
    assert.ok(selected.bones.length>20&&selected.skins.length>0,'actual imported bones and skin matrices were exercised');
    frames.push({selected,diagnostics:structuredClone(f.rig.diagnostics),updates:f.updates()-calls});
   }
   assert.equal(f.originalDigest(),sourceBefore,'original geometry, UV, skin weights and clip keyframes remain intact');cases.push(frames);
  }
  for(let i=0;i<steps.length;i++){
   const label=weapon+' '+steps[i].name+' frame '+i,a=cases[0][i],b=cases[1][i];
   assert.deepEqual(b.selected,a.selected,label+' preserves exact local/world poses, skin matrices and muzzle');
   assert.deepEqual(b.diagnostics,a.diagnostics,label+' preserves IK and action diagnostics');
   assert.equal(a.updates-b.updates,steps[i].reload||steps[i].throwAge!==undefined?1:2,label+' skips only calls with no intervening pose change');
  }
 }
 for(const name of assetNames)assert.equal(digest(await readFile(assetUrl(name))),sourceHashes.get(name),name+' original bytes remain unchanged');
});
