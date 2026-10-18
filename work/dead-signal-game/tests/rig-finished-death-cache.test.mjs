import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {GLTFLoader} from '../dist/player-rig/vendor/GLTFLoader.js';
import {AnimationSampler} from '../dist/player-rig/animation.js';
import {LiveBossRig} from '../dist/boss-rig/live-boss.js';
import {bossClipIndices} from '../dist/boss-rig/boss-pose.js';
import {captureBonePose} from '../dist/boss-rig/pose-buffer.js';
import {RigPoseHistory} from '../dist/boss-rig/pose-history.js';
import {RigFramePool} from '../dist/boss-rig/frame-pool.js';

async function originalRig(){
 const key='boss-01-mid',registry=JSON.parse(await readFile(new URL('../dist/boss-rig/registry.json',import.meta.url))),config=registry.bosses[key],loader=new GLTFLoader();loader.register(()=>({name:'numeric-texture-placeholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const b=await readFile(new URL('../dist/boss-rig/'+config.file,import.meta.url)),g=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),''),root=g.scene,subject=new THREE.Group(),motion=new THREE.Group(),normal=new THREE.Group(),s=config.source.scale,p=config.source.originPivot;normal.scale.setScalar(s);normal.position.set(-p.x*s,-p.y*s,-p.z*s);normal.add(root);motion.add(normal);subject.add(motion);
 const sampler=new AnimationSampler({root,subject,motion,clips:g.animations,subjectHeight:config.projection.subjectHeight}),bones=sampler.restTransforms.filter(e=>e.object.isBone).map(e=>e.object),model={config,sampler,subject,root,bones,upperBones:[],indices:bossClipIndices(config,g.animations),states:new WeakMap(),history:new RigPoseHistory()};
 // The actual frame/cache/pose path runs against the original imported rig.
 // Only the GPU surface and pixel copy are counted substitutes in this Node test.
 const rig=Object.create(LiveBossRig.prototype);Object.assign(rig,{size:512,models:new Map([[key,model]]),frames:new WeakMap(),framePool:new RigFramePool(()=>{throw Error('unexpected pool allocation');}),camera:new THREE.OrthographicCamera(-100,100,100,-100,.1,8000),scene:new THREE.Scene(),lost:false,draws:0,reads:0});
 rig.renderer={domElement:{width:512,height:512},setScissorTest(){},setViewport(){},render(){rig.draws++;}};
 rig.readSurface=()=>{rig.reads++;return {source:null,pixels:null};};
 rig.finishFrame=item=>{const selected={pose:item.pose,bones:captureBonePose(bones)};rig.frames.set(item.actor,{signature:item.signature,selected});return selected;};
 return {rig,key,model};
}

test('finished original boss death reuses its own pose across advancing gameplay and other actors, with complete cache invalidation',async()=>{
 const {rig,key}=await originalRig(),epoch={},corpse={seed:7,x:30,y:40,angle:.8},fallback={locomotion:{pose:'death',phase:0}},options={epoch,pose:'death',animationTime:2,height:64},before=JSON.stringify(corpse);
 const final=rig.frame(key,corpse,2,fallback,options);assert.equal(rig.draws,1);
 assert.equal(rig.frame(key,corpse,3,fallback,{...options,animationTime:3}),final);assert.equal(rig.draws,1,'a static final corpse must not re-enter the GPU/alpha pipeline just because Game.time advanced');assert.equal(rig.reads,1);
 const live={id:8,hp:100,x:50,y:50,angle:1};rig.frame(key,live,3.1,{locomotion:{pose:'walk',phase:1}},{epoch,height:64});const drawn=rig.draws;
 assert.equal(rig.frame(key,corpse,3.2,fallback,{...options,animationTime:3.2}),final);assert.equal(rig.draws,drawn,'another actor reusing the source skeleton cannot invalidate a private copied corpse canvas');
 assert.equal(JSON.stringify(corpse),before);
 rig.frame(key,corpse,4,fallback,{...options,height:66});assert.equal(rig.draws,drawn+1);
 rig.directAlphaReadback=true;rig.frame(key,corpse,4.1,fallback,{...options,height:66});assert.equal(rig.draws,drawn+2,'readback mode change must refresh the source pass');
 rig.verifyAlphaReadback=true;rig.frame(key,corpse,4.2,fallback,{...options,height:66});assert.equal(rig.draws,drawn+3);
 const cached=rig.frames.get(corpse);cached.pool={owner:{}};rig.frame(key,corpse,4.3,fallback,{...options,height:66});assert.equal(rig.draws,drawn+4,'a recycled atlas slot must never masquerade as this corpse');
 rig.frames=new WeakMap();rig.frame(key,corpse,4.4,fallback,{...options,height:66});assert.equal(rig.draws,drawn+5,'context-restoration cache reset refreshes the final pose');
 corpse.x+=5;rig.frame(key,corpse,4.5,fallback,{...options,height:66});assert.equal(rig.draws,drawn+6,'world placement changes must refresh');corpse.angle+=.4;rig.frame(key,corpse,4.6,fallback,{...options,height:66});assert.equal(rig.draws,drawn+7,'corpse heading changes must refresh');
 rig.verifyPoseBounds=true;rig.frame(key,corpse,4.7,fallback,{...options,height:66});assert.equal(rig.draws,drawn+8,'bounds verification mode still refreshes');
 rig.cropNativeComposite=true;rig.frame(key,corpse,4.8,fallback,{...options,height:66});assert.equal(rig.draws,drawn+9,'composite experiment mode invalidates a finished image');
 rig.cropNativeComposite=false;rig.frame(key,corpse,4.9,fallback,{...options,height:66});assert.equal(rig.draws,drawn+10,'restoring the original composite refreshes it');
 rig.batchInkComposite=true;rig.frame(key,corpse,5,fallback,{...options,height:66});assert.equal(rig.draws,drawn+11,'batch ink mode cannot reuse an image created in a different mode');
 rig.batchInkComposite=false;rig.frame(key,corpse,5.1,fallback,{...options,height:66});assert.equal(rig.draws,drawn+12,'single-cell512px boss path refreshes after restoring the original mode');rig.lost=true;assert.equal(rig.frame(key,corpse,5.2,fallback,options),null);
});

test('a late live-to-death transition still completes instead of caching its inherited standing first pose',async()=>{
 const {rig,key}=await originalRig(),epoch={},actor={id:7,hp:100,x:0,y:0,angle:.8},walking=rig.frame(key,actor,1,{locomotion:{pose:'walk',phase:2}},{epoch,height:64});actor.hp=0;
 const fallback={locomotion:{pose:'death',phase:0}},options=age=>({epoch,pose:'death',animationTime:age,height:64}),before=JSON.stringify(actor),first=rig.frame(key,actor,2,fallback,options(2));
 assert.ok(first.bones.every((b,i)=>b.position.distanceTo(walking.bones[i].position)<1e-8));
 const middle=rig.frame(key,actor,2.04,fallback,options(2.04));assert.ok(middle.bones.some((b,i)=>b.quaternion.angleTo(first.bones[i].quaternion)>.001),'the inherited walk must actually settle into the authored death');
 rig.frame(key,actor,2.08,fallback,options(2.08));const settledDraws=rig.draws,final=rig.frame(key,actor,2.1,fallback,options(2.1)),draws=rig.draws;assert.equal(draws,settledDraws,'the first truly settled draw already has a reusable signature, even after sparse sampling');assert.equal(rig.frame(key,actor,2.2,fallback,options(2.2)),final);assert.equal(rig.draws,draws);assert.equal(JSON.stringify(actor),before);
});

test('unfinished death and living clips retain advancing-frame sampling',async()=>{
 const {rig,key}=await originalRig(),epoch={},actor={seed:7,x:0,y:0,angle:0},fallback={locomotion:{pose:'death',phase:0}};
 const first=rig.frame(key,actor,1,fallback,{epoch,pose:'death',animationTime:.1,height:64}),second=rig.frame(key,actor,1.1,fallback,{epoch,pose:'death',animationTime:.2,height:64});assert.notEqual(first,second);assert.equal(rig.draws,2);
 const live={id:8,hp:100,x:0,y:0,angle:0},walk={locomotion:{pose:'walk',phase:1}};rig.frame(key,live,2,walk,{epoch,height:64});rig.frame(key,live,2.1,walk,{epoch,height:64});assert.equal(rig.draws,4,'the finished-death optimization must not freeze living actors');
});
