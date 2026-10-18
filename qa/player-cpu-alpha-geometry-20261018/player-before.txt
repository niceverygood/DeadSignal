import {weaponRecoil} from './weapon-recoil.js';
import {beginPlayerDeath,samplePlayerDeath} from './death-pose.js';
import {applyReloadPose} from './reload-pose.js';
import {NativeAlphaReadback} from '../native-alpha-readback.js';
import {nativeAlphaBounds} from '../native-alpha-bounds.js';
import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {AnimationSampler} from './animation.js';
import {applyWeaponReadyPose} from './weapon-pose.js';
import {loadNativeWeapon,weaponGripOffsets,attachAtPose} from './weapon-attachment.js';
import {PlayerRigMotion} from '../player-rig-motion.js';
import {spritePlacement,bodyIdentificationContour} from '../production-art.js?v=0.29.0';
import {LocomotionBlend,applyAuthoredUpperAction} from './locomotion-blend.js';
import {FootPlanting} from './foot-planting.js';
import {applyThrowPose} from './throw-pose.js';

const SIZE=256,DENSITY=3,PIVOT={x:128,y:192};
const base=new URL('./',import.meta.url);
export function applyUpperBodyAim(root,twist){
  for(const [name,weight] of [['Spine',.25],['Spine01',.35],['Spine02',.4]]){
    const spine=root.getObjectByName(name);
    if(!spine)throw new Error('original-player-spine-chain-incomplete');
    const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-twist*weight);
    const desired=rotation.multiply(spine.getWorldQuaternion(new THREE.Quaternion()));
    spine.quaternion.copy(spine.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired));
    spine.updateWorldMatrix(true,true);
  }
}
export function unlit(root){
  const converted=new Map();
  root.traverse(object=>{
    if(!object.isMesh)return;
    const convert=original=>{
      if(!converted.has(original))converted.set(original,new THREE.MeshBasicMaterial({
        color:original.color?.clone()||0xffffff,map:original.map,alphaMap:original.alphaMap,
        transparent:original.transparent,opacity:original.opacity,alphaTest:original.alphaTest,
        side:original.side,vertexColors:original.vertexColors}));
      return converted.get(original);
    };
    object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
    object.frustumCulled=false;
  });
}

// One small offscreen WebGL surface, composited in the existing depth-sorted
// Canvas pass. Original art, camera projection, saves and collision stay intact.
export class LivePlayerRig {
  constructor(){
    this.clock=new PlayerRigMotion();this.footPlanting=new FootPlanting();this.models=new Map();this.weapons=new Map();this.weaponLoads=new Map();
    this.loader=new GLTFLoader();this.scene=new THREE.Scene();
    this.alphaReadback=new NativeAlphaReadback();this.directAlphaReadback=false;this.verifyAlphaReadback=false;
    this.forceRedundantSkinUpdates=false;
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
    this.renderer.setSize(SIZE,SIZE,false);this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;
    const k=DENSITY*Math.sqrt(3/2);
    this.camera=new THREE.OrthographicCamera(-PIVOT.x/k,(SIZE-PIVOT.x)/k,PIVOT.y/k,(PIVOT.y-SIZE)/k,.1,8000);
    this.camera.position.set(1000,1000,1000);this.camera.lookAt(0,0,0);
    this.body=document.createElement('canvas');this.body.width=this.body.height=SIZE;
    this.bodyContext=this.body.getContext('2d',{willReadFrequently:true});
    this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=SIZE;
    this.context=this.canvas.getContext('2d');
    this.ink=document.createElement('canvas');this.ink.width=this.ink.height=SIZE;
    this.inkContext=this.ink.getContext('2d');
    this.pending=null;this.ready=false;this.error=null;this.last=null;
    this.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();this.ready=false;this.error='context-lost';});
    this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.error=null;this.ready=this.models.size===2;this.last=null;});
  }
  async load(weapon){
    try{
      this.pending??=this.loadModels();
      await this.pending;
      this.bottlePromise??=this.loadBottle();await this.bottlePromise;
      if(!this.weaponLoads.has(weapon))this.weaponLoads.set(weapon,(async()=>{
        const config=await fetch(new URL('weapon-config.json',base)).then(response=>{if(!response.ok)throw new Error('weapon-config');return response.json();});
        if(!config[weapon])throw new Error('unsupported-player-weapon');
        const gltf=await this.loader.loadAsync(new URL(`models/weapon-${weapon}.glb`,base).href);
        const instance=loadNativeWeapon(gltf,config[weapon]);unlit(instance.root);
        instance.gripOffsets=weaponGripOffsets(instance);this.weapons.set(weapon,instance);
      })());
      await this.weaponLoads.get(weapon);
      this.ready=true;return true;
    }catch(error){this.error=error.message;this.ready=false;return false;}
  }
  async loadModels(){
    await Promise.all(['walk','run'].map(async gait=>{
      const gltf=await this.loader.loadAsync(new URL(`models/survivor-v2-${gait}.glb`,base).href);
      const root=gltf.scene,bounds=new THREE.Box3().setFromObject(root,true),center=bounds.getCenter(new THREE.Vector3());
      const normalization=new THREE.Group(),motion=new THREE.Group(),subject=new THREE.Group();
      const scale=44/(bounds.max.y-bounds.min.y);
      normalization.scale.setScalar(scale);normalization.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
      normalization.add(root);motion.add(normalization);subject.add(motion);unlit(root);
      const sampler=new AnimationSampler({root,subject,motion,clips:gltf.animations,subjectHeight:44});
      const clip=gltf.animations.findIndex(item=>new RegExp(gait==='run'?'running':'walking','i').test(item.name));
      if(clip<0||!root.getObjectByName('Spine')||!root.getObjectByName('RightHand'))throw new Error('original-player-rig-incomplete');
      this.models.set(gait,{root,subject,motion,sampler,clip,animation:gltf.animations[clip]});
    }));
    // Only clips are needed from this original authored action GLB. Do not
    // decode another copy of textures already resident on the visible model.
    const clipLoader=new GLTFLoader();
    clipLoader.register(()=>({name:'animation-only-textures',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
    const authored=await clipLoader.loadAsync(new URL('models/survivor-rig-motion.glb',base).href);
    const actions=['DS_Idle','DS_Attack','DS_Hit','DS_Death'].map(name=>authored.animations.find(clip=>clip.name===name));
    if(actions.some(clip=>!clip))throw new Error('original-action-clip-missing');
    const model=this.models.get('run');
    model.sampler=new AnimationSampler({root:model.root,subject:model.subject,motion:model.motion,clips:[this.models.get('walk').animation,model.animation,...actions],subjectHeight:44});
    this.blend=new LocomotionBlend(model.sampler);
    this.actionReferences=new Map();
    for(const index of [3,4]){model.sampler.sample(index,0);this.actionReferences.set(index,this.blend.snapshot());}
  }
  async loadBottle(){
    const gltf=await this.loader.loadAsync(new URL('models/throwable-molotov.glb',base).href),bounds=new THREE.Box3().setFromObject(gltf.scene,true),center=bounds.getCenter(new THREE.Vector3()),scale=10/(bounds.max.y-bounds.min.y);
    const normal=new THREE.Group();normal.scale.setScalar(scale);normal.position.copy(center).multiplyScalar(-scale);normal.add(gltf.scene);
    this.bottle=new THREE.Group();this.bottle.add(normal);unlit(this.bottle);
    this.bottleCanvas=document.createElement('canvas');this.bottleCanvas.width=this.bottleCanvas.height=SIZE;
  }
  bottleFrame(progress){
    if(!this.bottle||!this.ready)return null;
    this.scene.clear();this.scene.add(this.bottle);this.bottle.visible=true;this.bottle.position.set(0,0,0);this.bottle.rotation.set(progress*Math.PI*4,progress*2,Math.PI/7);
    this.renderer.render(this.scene,this.camera);const c=this.bottleCanvas.getContext('2d');c.clearRect(0,0,SIZE,SIZE);c.drawImage(this.renderer.domElement,0,0);return this.bottleCanvas;
  }
  frame(actor,time,fallback,{hitFlash=0,throwMotion=null,reloadDuration=0,deathElapsed=0}={}){
    if(!this.ready||!this.weapons.has(actor.weapon)||!fallback)return null;
    if(actor.hp<=0)return this.deathFrame(actor,time,fallback,deathElapsed);
    this.deathState=null;
    let pose=this.clock.select(actor,time);
    const throwing=throwMotion&&throwMotion.elapsed<.55;
    if(throwing){const twist=Math.atan2(Math.sin(throwMotion.angle-pose.lowerAngle),Math.cos(throwMotion.angle-pose.lowerAngle));pose={...pose,aimAngle:throwMotion.angle,lowerAngle:Math.abs(twist)>1.8?throwMotion.angle-Math.sign(twist)*1.8:pose.lowerAngle,upperTwist:Math.max(-1.8,Math.min(1.8,twist))};}
    if(!throwing&&this.last?.actor===actor&&this.last.time===time&&this.last.weapon===actor.weapon&&this.last.recoil===actor.recoil&&this.last.hitFlash===hitFlash&&this.last.reloadTime===actor.reloadTime&&this.last.reloadDuration===reloadDuration&&this.last.skinUpdateMode===!!this.forceRedundantSkinUpdates)return this.place(this.last.selected,actor);
    const model=this.models.get('run'),weapon=this.weapons.get(actor.weapon);
    for(const instance of this.weapons.values())if(instance!==weapon)instance.root.removeFromParent();
    this.scene.clear();this.scene.add(model.subject);
    model.subject.rotation.y=Math.PI/2-pose.lowerAngle;
    if(this.last?.actor!==actor||this.last?.death)this.blend=new LocomotionBlend(model.sampler);
    const weights=this.blend.sample(pose,time);
    const grounding=this.footPlanting.apply(actor,pose,time,model,weights);
    const actionIndex=hitFlash>0?4:actor.recoil>0?3:null,actionDuration=hitFlash>0?.35:.12;
    const upperAction=applyAuthoredUpperAction(this.blend,actionIndex,this.actionReferences.get(actionIndex),actionIndex===null?1:1-(hitFlash||actor.recoil)/actionDuration,{time,duration:actionDuration});
    const kick=weaponRecoil(actor.weapon,throwing?0:actor.recoil);
    const ready=applyWeaponReadyPose({root:model.root,subject:model.subject,supportOffset:weapon.gripOffsets.supportOffset,retraction:kick.retraction});
    if(!ready.supported)throw new Error('original-player-arms-incomplete');
    // Rotate the actual spine in world space; imported spine rest axes need not
    // be vertical. Arms/head follow the spine while hips/legs keep their clip.
    applyUpperBodyAim(model.root,pose.upperTwist);
    model.sampler.updateSkinPose();
    const hand=throwing?applyThrowPose(model.root,throwMotion):null;
    if(throwing||this.forceRedundantSkinUpdates)model.sampler.updateSkinPose();
    const held=hand&&!throwMotion.released;
    const reload=!throwing?applyReloadPose(model.root,{weapon:actor.weapon,remaining:actor.reloadTime,duration:reloadDuration,angle:pose.aimAngle}):null;
    if((!throwing&&actor.reloadTime>0&&reloadDuration>0)||this.forceRedundantSkinUpdates)model.sampler.updateSkinPose();
    if(held&&this.bottle){this.bottle.position.copy(hand.position);this.bottle.quaternion.copy(hand.quaternion);this.scene.add(this.bottle);}
    const aim=[-Math.sin(pose.upperTwist),0,Math.cos(pose.upperTwist)];
    const attachment=attachAtPose(weapon,{subject:model.subject,rightHand:model.root.getObjectByName('RightHand'),leftHand:reload?null:model.root.getObjectByName('LeftHand'),aimDirection:aim});
    const selected=this.rasterFrame(model,weapon,fallback,pose,{weaponVisible:!throwing,held,muzzle:attachment.game.muzzle});
    this.last={actor,time,weapon:actor.weapon,held:!!held,recoil:actor.recoil,hitFlash,reloadTime:actor.reloadTime,reloadDuration,skinUpdateMode:!!this.forceRedundantSkinUpdates,selected};this.diagnostics={...pose,...weights,...grounding,upperAction,physicalRecoil:{...kick,applied:ready.retraction},reload,action:throwing?'throw':reload?'reload':hitFlash>0?'hit':actor.recoil>0?'shot':'locomotion',gripError:attachment.gripError,supportError:attachment.supportError,aimErrorDegrees:attachment.aimErrorDegrees};
    return this.place(selected,actor);
  }
  deathFrame(actor,time,fallback,elapsed){
    const model=this.models.get('run'),weapon=this.weapons.get(actor.weapon);
    if(this.deathState?.actor!==actor){
      if(this.last?.actor!==actor||this.last.weapon!==actor.weapon||this.last.death||time<this.last.time||time-this.last.time>.15)return null;
      const heldBottle=this.last.held?this.bottle:null;
      this.deathState={actor,...beginPlayerDeath(model,weapon,this.blend.bones,{heldBottle}),poseInfo:{...this.diagnostics}};
    }
    const state=this.deathState;
    if(state.finished&&elapsed>=state.duration)return this.place(this.last.selected,actor);
    const death=samplePlayerDeath(model,state,elapsed);state.finished=death.finished;state.duration=model.sampler.clips[5].duration;
    this.scene.clear();this.scene.add(model.subject);if(state.bottle)this.scene.add(state.bottle.object);
    const point=weapon.model.localToWorld(weapon.raw.muzzle.clone()),muzzle={x:point.x,y:point.z,z:point.y};
    const pose={lowerAngle:state.poseInfo.lowerAngle,aimAngle:state.poseInfo.aimAngle,upperTwist:state.poseInfo.upperTwist,gait:state.poseInfo.gait,phase:state.poseInfo.phase,pose:'death',moving:false},selected=this.rasterFrame(model,weapon,fallback,pose,{weaponVisible:state.weaponVisible,held:!!state.bottle,muzzle});
    this.last={actor,time,weapon:actor.weapon,death:true,selected};this.diagnostics={...pose,action:'death',death,gripError:weapon.model.localToWorld(weapon.raw.grip.clone()).distanceTo(model.root.getObjectByName('RightHand').getWorldPosition(new THREE.Vector3())),aimErrorDegrees:null};
    return this.place(selected,actor);
  }
  rasterFrame(model,weapon,fallback,pose,{weaponVisible,held,muzzle}){
    // Pre-weapon body mask maintains crowd identification without tracing guns.
    weapon.root.visible=false;if(held)this.bottle.visible=false;this.renderer.render(this.scene,this.camera);
    const bc=this.bodyContext;bc.clearRect(0,0,SIZE,SIZE);bc.drawImage(this.renderer.domElement,0,0);
    const direct=this.directAlphaReadback?this.alphaReadback.read(this.renderer,SIZE,SIZE):null,legacy=!direct||this.verifyAlphaReadback?bc.getImageData(0,0,SIZE,SIZE).data:null;
    if(direct&&legacy)this.alphaReadback.compareAlpha(direct,legacy);const pixels=direct||legacy;
    const bounds=nativeAlphaBounds(pixels,SIZE,SIZE)||{x:SIZE,y:SIZE,width:1,height:1};
    const {x:left,y:top}=bounds;
    const core={x:left,y:top,width:bounds.width,height:bounds.height*.72};
    weapon.root.visible=weaponVisible;if(held)this.bottle.visible=true;this.renderer.render(this.scene,this.camera);
    const c=this.context,ink=this.inkContext;
    c.clearRect(0,0,SIZE,SIZE);ink.clearRect(0,0,SIZE,SIZE);ink.drawImage(this.renderer.domElement,0,0);
    ink.globalCompositeOperation='source-in';ink.fillStyle='#181c1e';ink.fillRect(0,0,SIZE,SIZE);ink.globalCompositeOperation='source-over';
    for(const [x,y] of [[-3,0],[3,0],[0,-3],[0,3],[-2,-2],[2,-2],[-2,2],[2,2]])c.drawImage(this.ink,x,y);
    c.drawImage(this.renderer.domElement,0,0);
    const metadata={...fallback.metadata,projection:{...fallback.metadata.projection,pixelsPerWorld:DENSITY,subjectHeight:44},atlas:{...fallback.metadata.atlas,includesWeapon:true}};
    const frame={...fallback.frame,rect:{x:0,y:0,width:SIZE,height:SIZE},footPivot:PIVOT,angle:pose.aimAngle,
      alphaBounds:bounds,outlineBounds:{x:Math.max(0,left-3),y:Math.max(0,top-3),width:bounds.width+6,height:bounds.height+6},coreBounds:core,
      weaponMuzzle:muzzle,bodyIdentificationContour:bodyIdentificationContour(pixels,SIZE,SIZE,bounds,core)};
    return {id:'survivor-original-live-rig',image:this.canvas,bodyAlpha:this.body,metadata,frame,locomotion:{...pose,pose:pose.pose||(pose.moving?pose.gait:'idle')}};
  }
  place(selected,actor){
    const foot={x:(actor.x-actor.y)*Math.sqrt(3)/2,y:(actor.x+actor.y)*.5};
    return {...selected,placement:spritePlacement(selected.metadata,selected.frame,{foot,worldHeight:44})};
  }
}
