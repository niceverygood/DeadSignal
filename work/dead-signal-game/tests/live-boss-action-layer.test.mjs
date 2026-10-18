import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {LiveBossRig} from '../dist/boss-rig/live-boss.js';
import {RigFramePool} from '../dist/boss-rig/frame-pool.js';
import {RigPoseHistory} from '../dist/boss-rig/pose-history.js';
import {upperBodyBones} from '../dist/boss-rig/hit-layer.js';
import {createBossActionLayer} from '../dist/boss-rig/boss-action-layer.js';

// Executes the actual frame, bossPose, hit/transition/history, cache and final
// compositor/diagnostic path. Three bones are real; the authored sampler and
// Canvas/WebGL backend are controlled fixtures, not original-GL/pixel proof.
// Every flag is explicit: default adoption policy is deliberately not asserted.
const names=['idle','walk','windup','attack','hit','death'];
const boneState=bone=>({name:bone.name,position:bone.position.toArray(),quaternion:bone.quaternion.toArray(),scale:bone.scale.toArray(),world:bone.matrixWorld.toArray()});
const localState=bone=>({name:bone.name,position:bone.position.toArray(),quaternion:bone.quaternion.toArray(),scale:bone.scale.toArray()});
const layers=diagnostic=>Object.fromEntries(['bossActionsEnabled','bossActionsActive','bossActionsBones','bossActionsMaxRadians','bossActionsKind'].map(key=>[key,diagnostic[key]]));
// Independent original transition operations, applied to a fresh incoming
// fixture and the preceding captured pose. Vendor Quaternion.slerp does not
// special-case t=1: its dot>=.9995 branch lerps then normalizes, so an endpoint
// can differ by a few IEEE64 bits. Compare that exact pathway, not a tolerance.
function originalTransitionPose(incoming,from,weight){return incoming.map((pose,index)=>({name:pose.name,
 position:new THREE.Vector3().fromArray(pose.position).lerp(new THREE.Vector3().fromArray(from[index].position),weight).toArray(),
 quaternion:new THREE.Quaternion().fromArray(pose.quaternion).slerp(new THREE.Quaternion().fromArray(from[index].quaternion),weight).toArray(),
 scale:new THREE.Vector3().fromArray(pose.scale).lerp(new THREE.Vector3().fromArray(from[index].scale),weight).toArray(),
}));}
function withCanvas(run){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
 const make=()=>{const canvas={width:512,height:512};const context={canvas,clearRect(){},drawImage(){},fillRect(){},globalAlpha:1,globalCompositeOperation:'source-over',fillStyle:''};canvas.getContext=()=>context;return canvas;};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:name=>{assert.equal(name,'canvas');return make();}}});
 try{return run(make);}finally{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;}
}
function fixture(make,{key='boss-01-final',enabled=false}={}){
 const root=new THREE.Bone();root.name='DS_Root';const thorax=new THREE.Bone();thorax.name='DS_Thorax';thorax.position.y=10;root.add(thorax);
 for(const side of [-1,1]){
  const leg=new THREE.Bone();leg.name='DS_Leg_'+side;leg.position.set(side*2,-5,0);root.add(leg);const foot=new THREE.Bone();foot.name='DS_Foot_'+side;foot.position.y=-5;leg.add(foot);
  for(const pair of [0,1]){const arm=new THREE.Bone();arm.name='DS_Arm_'+pair+'_'+side;arm.position.set(side*3,pair*2,0);thorax.add(arm);const forearm=new THREE.Bone();forearm.name='DS_Forearm_'+pair+'_'+side;forearm.position.x=side*2;arm.add(forearm);}
 }
 const bones=[];root.traverse(object=>{if(object.isBone)bones.push(object);});const subject=new THREE.Group(),motion=new THREE.Group();subject.add(motion);motion.add(root);subject.updateMatrixWorld(true);
 const restTransforms=bones.map(object=>({object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()})),rest=restTransforms.map(entry=>({position:entry.position.toArray(),quaternion:entry.quaternion.toArray(),scale:entry.scale.toArray()}));
 const calls={samples:[],renders:0,updates:0,reads:0,layers:[]};
 const sampler={subject,motion,restTransforms,clips:names.map(name=>new THREE.AnimationClip('DS_'+name,1,[])),sample(index,time,options){
  calls.samples.push({index,time,options:{...options}});for(const entry of restTransforms){entry.object.position.copy(entry.position);entry.object.quaternion.copy(entry.quaternion);entry.object.scale.copy(entry.scale);}motion.position.set(0,0,0);
  for(const bone of bones){let angle=0;if(bone.name==='DS_Thorax')angle=index===4?.22*time:index===2?-.025*time:index===3?.035*(1-time):index===5?.3*time:.01*Math.sin(time);
   else if(/^DS_(Arm|Forearm)_/.test(bone.name)){const side=bone.name.endsWith('_-1')?-1:1;angle=side*(index===4?.13*time:index===2?.08*time:index===3?.1*(1-time):index===1?.04*Math.sin(time*Math.PI*2):0);}
   bone.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),angle);if(index===5&&bone===root)bone.position.y-=5*time;
  }
 },updateSkinPose(){calls.updates++;subject.updateMatrixWorld(true);}};
 const config={original:'controlled-authored-fixture',projection:{pixelsPerWorld:2.25,footPivot:{x:128,y:205},subjectHeight:60,frontYawRadians:0},clips:Object.fromEntries(names.map((name,index)=>[name,{start:index*96,count:96,duration:1,loop:['idle','walk'].includes(name)}])),sampleDensity:Object.fromEntries(names.map(name=>[name,96]))},indices=Object.fromEntries(names.map((name,index)=>[name,index]));
 const candidate=createBossActionLayer(sampler,key),actionLayer=candidate.supported?candidate:null;
 if(actionLayer){const original=actionLayer.apply;actionLayer.apply=function(...args){const before=bones.map(localState),result=original.apply(this,args);calls.layers.push({pose:args[0].name,before,after:bones.map(localState),diagnostic:{...result}});return result;};}
 const model={config,root,subject,sampler,indices,bones,upperBones:upperBodyBones(bones),states:new WeakMap(),history:new RigPoseHistory(),actionLayer};
 const rig=Object.create(LiveBossRig.prototype);Object.assign(rig,{size:512,models:new Map([[key,model]]),frames:new WeakMap(),scene:new THREE.Scene(),camera:new THREE.OrthographicCamera(-100,100,100,-100,.1,8000),framePool:new RigFramePool(()=>{const image=make();return{image,context:image.getContext('2d')};}),lost:false,error:'',bossActionLayerEnabled:enabled,gpuPoseBounds:false,verifyPoseBounds:false,directAlphaReadback:false,verifyAlphaReadback:false,cropNativeComposite:false,batchInkComposite:false,exactGPUAlphaBounds:false,verifyExactGPUAlphaBounds:false,minGPUAlphaCells:12,batchInk:{release(){}},ink:make()});rig.inkContext=rig.ink.getContext('2d');
 const surface=make();rig.renderer={domElement:surface,setScissorTest(){},setViewport(){},setScissor(){},setSize(width,height){surface.width=width;surface.height=height;},clear(){},render(scene,camera){assert.equal(scene,rig.scene);assert.equal(camera,rig.camera);calls.renders++;}};
 rig.readSurface=(width,height)=>{calls.reads++;const source={width,height},pixels=new Uint8ClampedArray(width*height*4);for(let offset=0;offset<width;offset+=512)for(let y=200;y<204;y++)for(let x=200;x<204;x++)pixels[(y*width+offset+x)*4+3]=255;return{source,pixels};};
 const actor={id:71,x:1400,y:900,r:45,hp:900,maxHp:900,angle:.7,type:'collector',bossKey:key,bossRole:'final',attackState:'windup',attackTime:.45,hitFlash:0,stun:0,vx:0,vy:0,dead:false},epoch={};
 const fallback={id:'controlled-fallback',metadata:{atlas:{format:'original-fixture',samples:96},projection:{subjectHeight:60,pixelsPerWorld:2.25},animation:{}},frame:{rect:{x:0,y:0,width:256,height:256},footPivot:{x:128,y:205}},locomotion:{pose:'idle',phase:0,angle:actor.angle}};
 const options={height:60,epoch,actionDurations:{windup:1,charge:1}},render=(who=actor,time=1,selected=fallback,opts=options)=>rig.frame(key,who,time,selected,opts);
 const fixed=()=>bones.filter(bone=>/^(DS_Root|DS_Leg_|DS_Foot_)/.test(bone.name)).map(boneState),restNow=()=>restTransforms.map(entry=>({position:entry.position.toArray(),quaternion:entry.quaternion.toArray(),scale:entry.scale.toArray()}));
 return{rig,key,model,sampler,bones,thorax,actor,epoch,fallback,options,calls,render,fixed,rest,restNow};
}

test('same actor/time/pose flag changes invalidate exactly once while unchanged flags reuse the actual private frame; unsupported NPC signatures stay original',()=>withCanvas(make=>{
 const f=fixture(make,{enabled:false}),actorBefore=structuredClone(f.actor),original=f.render(),originalPose=f.bones.map(localState),fixed=f.fixed();assert.equal(f.calls.renders,1);assert.equal(f.calls.samples.length,1);assert.equal(f.calls.updates,1);assert.deepEqual(layers(f.rig.diagnostics),{bossActionsEnabled:false,bossActionsActive:false,bossActionsBones:0,bossActionsMaxRadians:0,bossActionsKind:'charge'});
 for(let i=0;i<3;i++)assert.equal(f.render(),original);assert.equal(f.calls.renders,1);assert.equal(f.calls.samples.length,1);
 f.rig.bossActionLayerEnabled=true;const enhanced=f.render();assert.notEqual(enhanced,original);assert.equal(f.calls.renders,2);assert.equal(f.calls.samples.length,2);assert.equal(f.calls.updates,2);assert.equal(f.rig.diagnostics.bossActionsEnabled,true);assert.equal(f.rig.diagnostics.bossActionsActive,true);assert.ok(f.rig.diagnostics.bossActionsBones>0);assert.ok(f.rig.diagnostics.bossActionsMaxRadians>0&&f.rig.diagnostics.bossActionsMaxRadians<=40*Math.PI/180+1e-12);assert.notDeepEqual(f.bones.map(localState),originalPose);assert.deepEqual(f.fixed(),fixed);assert.equal(f.render(),enhanced);assert.equal(f.calls.renders,2);
 f.rig.bossActionLayerEnabled=false;const reset=f.render();assert.notEqual(reset,enhanced);assert.equal(f.calls.renders,3);assert.equal(f.calls.samples.length,3);assert.deepEqual(f.bones.map(localState),originalPose);assert.deepEqual(f.fixed(),fixed);assert.equal(f.render(),reset);assert.equal(f.calls.renders,3);assert.deepEqual(f.actor,actorBefore);assert.deepEqual(f.restNow(),f.rest);
 const npc=fixture(make,{key:'enemy-walker',enabled:false}),before=npc.render(),signature=npc.rig.frames.get(npc.actor).signature;
 const expected=[npc.key,1,'windup',.55,npc.actor.angle,60,npc.actor.x,npc.actor.y,undefined,0,undefined,0,0,0,0,0,0,0,0,12].join(':');assert.equal(signature,expected,'unsupported source cache keeps its exact original signature with no layer suffix');
 npc.rig.bossActionLayerEnabled=true;assert.equal(npc.render(),before);npc.rig.bossActionLayerEnabled=false;assert.equal(npc.render(),before);assert.equal(npc.calls.renders,1);assert.equal(npc.calls.samples.length,1);assert.equal(Object.hasOwn(npc.rig.diagnostics,'bossActionsEnabled'),false);assert.equal(npc.model.actionLayer,null);
}));

test('batch items capture independent primitive layer diagnostics before another actor resets the cached layer diagnostic object',()=>withCanvas(make=>{
 const f=fixture(make,{enabled:true}),walking={...f.actor,id:72,attackState:'walk',attackTime:0},fallback={...f.fallback,locomotion:{pose:'walk',phase:1.3,angle:f.actor.angle,moveWeight:.6}};
 f.rig.beginBatch(2);assert.equal(f.render(),null);assert.equal(f.render(walking,1,fallback),null);assert.equal(f.calls.renders,2);f.rig.endBatch();
 const first=f.rig.frames.get(f.actor),second=f.rig.frames.get(walking);assert.ok(first.selected&&second.selected);assert.notEqual(first.image,second.image);assert.equal(first.diagnostics.bossActionsEnabled,true);assert.equal(first.diagnostics.bossActionsActive,true);assert.ok(first.diagnostics.bossActionsBones>0);assert.equal(second.diagnostics.bossActionsEnabled,true);assert.equal(second.diagnostics.bossActionsActive,false);assert.equal(second.diagnostics.bossActionsBones,0);assert.equal(second.diagnostics.bossActionsMaxRadians,0);assert.equal(first.diagnostics.bossActionsKind,'charge');
 for(const diagnostic of [first.diagnostics,second.diagnostics])for(const value of Object.values(layers(diagnostic)))assert.ok(['number','boolean','string'].includes(typeof value));assert.equal(f.calls.reads,1);assert.equal(f.calls.updates,2);assert.deepEqual(f.restNow(),f.rest);
}));

test('the layer uses the fresh base sample before original torso-hit blending, transitions and live-to-death history while rest/actor data remain untouched',()=>withCanvas(make=>{
 const f=fixture(make,{enabled:true});f.actor.hitFlash=.09;const actorBefore=structuredClone(f.actor);f.render();const trace=f.calls.layers.at(-1),final=f.bones.map(localState),arms=f.bones.filter(bone=>/^DS_(Arm|Forearm)_/.test(bone.name));
 assert.deepEqual(f.calls.samples.map(call=>call.index),[4,2],'authored hit pose and base action are sampled before the candidate layer');assert.equal(trace.pose,'windup');assert.ok(trace.diagnostic.active);for(const bone of arms)assert.deepEqual(localState(bone),trace.after.find(row=>row.name===bone.name),'original torso-only hit layer preserves the candidate striking arm chain');assert.notDeepEqual(localState(f.thorax),trace.after.find(row=>row.name==='DS_Thorax'),'original torso recoil still blends after the candidate');assert.equal(f.rig.diagnostics.hitTorsoOnly,true);assert.ok(f.rig.diagnostics.hitLayerWeight>0);assert.deepEqual(f.actor,actorBefore);
 const state=f.model.states.get(f.actor),remembered=f.model.history.records.get(f.actor.id);assert.equal(remembered.pose,state.pose);assert.deepEqual(state.pose.map((pose,index)=>({name:f.bones[index].name,position:pose.position.toArray(),quaternion:pose.quaternion.toArray(),scale:pose.scale.toArray()})),final);
 const freshAttack=fixture(make,{enabled:true});Object.assign(freshAttack.actor,{attackState:'charge',attackTime:.5,hitFlash:.09});freshAttack.render(freshAttack.actor,2);const incomingAttack=freshAttack.bones.map(localState),fixedBefore=f.fixed();
 f.actor.attackState='charge';f.actor.attackTime=.5;f.render(f.actor,2);assert.deepEqual(f.bones.map(localState),originalTransitionPose(incomingAttack,final,1),'existing transition uses the original exact vendor lerp/slerp endpoint math');assert.deepEqual(f.fixed(),fixedBefore);assert.ok(f.model.states.get(f.actor).transition);f.render(f.actor,2.1);assert.equal(f.model.states.get(f.actor).transition,undefined);assert.equal(f.model.states.get(f.actor).key,'attack');const lastAlive=f.bones.map(localState),lastFixed=f.fixed();
 const freshDeath=fixture(make,{enabled:true}),freshCorpse={...freshDeath.actor,id:undefined,seed:freshDeath.actor.id,hp:0,dead:true,hitFlash:0};freshDeath.render(freshCorpse,2.11,freshDeath.fallback,{...freshDeath.options,pose:'death',animationTime:0});const incomingDeath=freshDeath.bones.map(localState);
 const corpse={...f.actor,id:undefined,seed:f.actor.id,hp:0,dead:true,hitFlash:0};f.render(corpse,2.11,f.fallback,{...f.options,pose:'death',animationTime:0});assert.deepEqual(f.bones.map(localState),originalTransitionPose(incomingDeath,lastAlive,1),'original live-pose death bridge preserves the exact vendor endpoint operations');assert.deepEqual(f.fixed(),lastFixed);assert.equal(f.model.states.get(corpse).deathStart,0);assert.equal(f.model.history.records.has(f.actor.id),false);assert.equal(f.rig.diagnostics.clip,'death');assert.equal(f.rig.diagnostics.bossActionsEnabled,true);assert.equal(f.rig.diagnostics.bossActionsActive,false);assert.equal(f.rig.diagnostics.bossActionsBones,0);assert.deepEqual(f.restNow(),f.rest);
}));
