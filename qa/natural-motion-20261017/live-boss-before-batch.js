import * as THREE from '../player-rig/vendor/three.module.js';
import {GLTFLoader} from '../player-rig/vendor/GLTFLoader.js';
import {AnimationSampler} from '../player-rig/animation.js';
import {unlit} from '../player-rig/live-player.js';
import {spritePlacement} from '../production-art.js?v=0.29.0';
import {bossClipIndices,bossPose} from './boss-pose.js';
const SIZE=512,DENSITY=2.25,PIVOT={x:256,y:410},TAU=Math.PI*2;
const base=new URL('./',import.meta.url),clamp=value=>Math.max(0,Math.min(1,value));
const snapshot=bones=>bones.map(bone=>({position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()}));
function floorHeight(profile,phase){
  if(!profile?.soleHeights?.length)return 0;
  if(profile.grounding?.includes('preserve-flight'))return profile.groundingBaseline||0;
  const n=profile.soleHeights.length,s=((phase%TAU)+TAU)%TAU/TAU*n,index=Math.floor(s),a=profile.soleHeights[index%n],b=profile.soleHeights[(index+1)%n];
  return a+(b-a)*(s-index);
}
export class LiveBossRig {
  constructor({size=512,registryFile='registry.json'}={}){
    const SIZE=size;this.size=size;
    this.models=new Map();this.pending=new Map();this.frames=new WeakMap();this.scene=new THREE.Scene();this.loader=new GLTFLoader();
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});this.renderer.setSize(SIZE,SIZE,false);this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;
    const k=DENSITY*Math.sqrt(3/2);this.camera=new THREE.OrthographicCamera(-PIVOT.x/k,(SIZE-PIVOT.x)/k,PIVOT.y/k,(PIVOT.y-SIZE)/k,.1,8000);this.camera.position.set(1000,1000,1000);this.camera.lookAt(0,0,0);
    this.raw=document.createElement('canvas');this.raw.width=this.raw.height=SIZE;this.rawContext=this.raw.getContext('2d',{willReadFrequently:true});
    this.ink=document.createElement('canvas');this.ink.width=this.ink.height=SIZE;this.inkContext=this.ink.getContext('2d');
    this.registry=fetch(new URL(registryFile,base)).then(response=>{if(!response.ok)throw new Error('boss-runtime-registry-missing');return response.json();});
    this.lost=false;this.error='';
    this.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;});
    this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.lost=false;this.frames=new WeakMap();});
  }
  load(key){
    if(!this.pending.has(key))this.pending.set(key,(async()=>{
      const config=(await this.registry).bosses[key];if(!config)throw new Error('unregistered-boss');
      const gltf=await this.loader.loadAsync(new URL(config.file,base).href),root=gltf.scene;
      if(config.walkFile){const walk=await this.loader.loadAsync(new URL(config.walkFile,base).href);gltf.animations.push(...walk.animations);}
      const normal=new THREE.Group(),motion=new THREE.Group(),subject=new THREE.Group(),scale=config.source.scale,p=config.source.originPivot;
      normal.scale.setScalar(scale);normal.position.set(-p.x*scale,-p.y*scale,-p.z*scale);normal.add(root);motion.add(normal);subject.add(motion);unlit(root);
      const sampler=new AnimationSampler({root,subject,motion,clips:gltf.animations,subjectHeight:config.projection.subjectHeight});
      const indices=bossClipIndices(config,gltf.animations),bones=sampler.restTransforms.filter(entry=>entry.object.isBone).map(entry=>entry.object);
      this.models.set(key,{config,root,subject,sampler,indices,bones,states:new WeakMap()});return true;
    })().catch(error=>{this.error=error.message;return false;}));
    return this.pending.get(key);
  }
  releaseUnused(keys){
    const keep=new Set(keys);
    for(const [key,model]of this.models)if(!keep.has(key)){
      model.subject.traverse(object=>{object.geometry?.dispose();for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){material.map?.dispose();material.map?.source?.data?.close?.();material.dispose();}});
      this.models.delete(key);this.pending.delete(key);
    }
  }
  frame(key,actor,time,fallback,{height,profile,...options}={}){
    const SIZE=this.size;const model=this.models.get(key);if(!model||this.lost||!fallback)return null;
    const {config,sampler,subject,indices,bones}=model;
    const resolution=SIZE/256,density=config.projection.pixelsPerWorld*resolution,pivot={x:config.projection.footPivot.x*resolution,y:config.projection.footPivot.y*resolution},k=density*Math.sqrt(3/2);
    Object.assign(this.camera,{left:-pivot.x/k,right:(SIZE-pivot.x)/k,top:pivot.y/k,bottom:(pivot.y-SIZE)/k});this.camera.updateProjectionMatrix();
    const pose=bossPose(config,sampler.clips,indices,actor,time,fallback.locomotion,options);
    let state=model.states.get(actor),cache=this.frames.get(actor);
    const signature=[key,time,pose.name,pose.time,pose.angle,height,actor.x,actor.y].join(':');
    if(cache?.signature===signature)return cache.selected;
    subject.rotation.y=Math.PI/2-pose.angle+(config.projection.frontYawRadians||0);
    sampler.sample(pose.index,pose.time,{removeRootMotion:true,once:!pose.loop});
    const clock=time+(options.animationTime||0);
    if(state&&state.key!==pose.name)state.transition={from:state.pose,start:clock,duration:pose.name==='hit'?.025:.075};
    if(state?.transition){
      const t=clamp((clock-state.transition.start)/state.transition.duration),ease=t*t*(3-2*t);
      bones.forEach((bone,index)=>{bone.position.lerp(state.transition.from[index].position,1-ease);bone.quaternion.slerp(state.transition.from[index].quaternion,1-ease);bone.scale.lerp(state.transition.from[index].scale,1-ease);});
      if(t===1)delete state.transition;
    }
    state??={};state.key=pose.name;state.pose=snapshot(bones);model.states.set(actor,state);sampler.updateSkinPose();
    this.scene.clear();this.scene.add(subject);this.renderer.render(this.scene,this.camera);
    const raw=this.rawContext;raw.clearRect(0,0,SIZE,SIZE);raw.drawImage(this.renderer.domElement,0,0);
    const pixels=raw.getImageData(0,0,SIZE,SIZE).data;let left=SIZE,top=SIZE,right=0,bottom=0;
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(pixels[(y*SIZE+x)*4+3]>=8){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
    if(right<=left||bottom<=top)throw new Error('boss-native-frame-empty');
    if(!cache){const image=document.createElement('canvas');image.width=image.height=SIZE;cache={image,context:image.getContext('2d')};this.frames.set(actor,cache);}
    const ink=this.inkContext,c=cache.context;ink.clearRect(0,0,SIZE,SIZE);ink.drawImage(this.raw,0,0);ink.globalCompositeOperation='source-in';ink.fillStyle='#181c1e';ink.fillRect(0,0,SIZE,SIZE);ink.globalCompositeOperation='source-over';c.clearRect(0,0,SIZE,SIZE);
    for(const [x,y]of [[-3,0],[3,0],[0,-3],[0,3],[-2,-2],[2,-2],[-2,2],[2,2]])c.drawImage(this.ink,x,y);c.drawImage(this.raw,0,0);
    const bounds={x:left,y:top,width:right-left,height:bottom-top},core={...bounds,height:bounds.height*.72};
    const metadata={...fallback.metadata,liveRig:true,projection:{...config.projection,pixelsPerWorld:density},animation:{name:sampler.clips[pose.index].name,duration:sampler.clips[pose.index].duration,samples:pose.count,loop:pose.loop},atlas:{...fallback.metadata.atlas,samples:pose.count}};
    const frame={...fallback.frame,rect:{x:0,y:0,width:SIZE,height:SIZE},footPivot:pivot,alphaBounds:bounds,outlineBounds:bounds,coreBounds:core,sample:pose.sample,index:pose.sample,angle:pose.angle};
    const worldHeight=height||config.projection.subjectHeight,scale=worldHeight/config.projection.subjectHeight,groundFoot={x:(actor.x-actor.y)*Math.sqrt(3)/2,y:(actor.x+actor.y)*.5};
    const correction=pose.name==='walk'?Math.max(-config.projection.subjectHeight*.04,Math.min(config.projection.subjectHeight*.04,floorHeight(profile,fallback.locomotion?.phase||0)))*scale:0;
    const foot={x:groundFoot.x,y:groundFoot.y+correction};
    const selected={...fallback,image:cache.image,bodyAlpha:null,metadata,frame,placement:{...spritePlacement(metadata,frame,{foot,worldHeight}),groundFoot,groundingHeight:correction,depth:groundFoot.y}};
    cache.signature=signature;cache.selected=selected;
    this.diagnostics={key,clip:pose.name,sample:pose.sample,sampleDensity:pose.count,continuousSampling:true,source:config.original,angle:pose.angle,clipped:left===0||top===0||right===SIZE||bottom===SIZE};
    return selected;
  }
}
