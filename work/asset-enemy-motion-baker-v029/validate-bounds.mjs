import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AnimationSampler,sampleTime} from './src/animation.js';
import {modelRotation} from './src/atlas.js';
import {posedWorldVertices,poseYawBounds} from './src/bounds-cache.js';
globalThis.ProgressEvent ??= class ProgressEvent {constructor(type,options={}) {this.type=type;Object.assign(this,options);}};
const jobs=JSON.parse(await readFile(new URL('./batches/locomotion-hq32.json',import.meta.url))).jobs;
const checks=[];let totalBoxes=0,maxError=0;
for(const j of jobs){
 const buffer=await readFile(new URL('./models/'+j.model,import.meta.url));
 const n=buffer.readUInt32LE(12);const json=JSON.parse(buffer.subarray(20,20+n).toString());
 // Rendering keeps original materials; this CPU-only validator omits image
 // loading while retaining every mesh, joint, animation and binary accessor.
 delete json.images;delete json.textures;delete json.materials;delete json.extensionsUsed;delete json.extensionsRequired;
 for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 const text=Buffer.from(JSON.stringify(json));const pad=Buffer.alloc((4-text.length%4)%4,32);const bin=buffer.subarray(20+n);
 const out=Buffer.alloc(20+text.length+pad.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(text.length+pad.length,12);out.writeUInt32LE(0x4e4f534a,16);text.copy(out,20);pad.copy(out,20+text.length);bin.copy(out,20+text.length+pad.length);
 const gltf=await new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.length),'');
 const scene=new THREE.Scene(),subject=new THREE.Group(),motion=new THREE.Group(),normalization=new THREE.Group();
 normalization.scale.setScalar(j.uniformScale);normalization.position.set(-j.originPivot.x*j.uniformScale,-j.originPivot.y*j.uniformScale,-j.originPivot.z*j.uniformScale);normalization.add(gltf.scene);motion.add(normalization);subject.add(motion);scene.add(subject);
 const sampler=new AnimationSampler({root:gltf.scene,subject,motion,clips:gltf.animations,subjectHeight:j.subjectHeight});const ci=gltf.animations.findIndex(c=>c.name===j.clip);
 const baselineYaw=modelRotation(0,0);const errors=[];
 const samples=['boss-10-final','boss-01-mid','enemy-runner'].some(id=>j.id.startsWith(id))?[...Array(32).keys()]:[0,7,16,31];
 for(const sample of samples){
  subject.rotation.y=baselineYaw;sampler.sample(ci,sampleTime(gltf.animations[ci],sample,32),{removeRootMotion:true});const points=posedWorldVertices(subject);
  for(const direction of [0,3,7,11,15]){
   const yaw=modelRotation(direction*Math.PI*2/16,0);subject.rotation.y=yaw;sampler.sample(ci,sampleTime(gltf.animations[ci],sample,32),{removeRootMotion:true});const reference=new THREE.Box3().setFromObject(subject,true),cached=poseYawBounds(points,yaw-baselineYaw);
   const error=Math.max(...reference.min.toArray().map((v,i)=>Math.abs(v-cached.min.toArray()[i])),...reference.max.toArray().map((v,i)=>Math.abs(v-cached.max.toArray()[i])));errors.push(error);maxError=Math.max(maxError,error);totalBoxes++;if(error>1e-6)throw new Error(j.id+' bound mismatch '+error);
  }
 }
 checks.push({id:j.id,model:j.model,clip:j.clip,sourceSHA256:createHash('sha256').update(buffer).digest('hex'),boxes:errors.length,maxError:Math.max(...errors)});console.log(JSON.stringify(checks.at(-1)));
}
await writeFile(new URL('./bounds-cache-validation.json',import.meta.url),JSON.stringify({actors:checks.length,boxes:totalBoxes,maxWorldError:maxError,tolerance:1e-6,checks},null,2)+'\n');
console.log(JSON.stringify({actors:checks.length,boxes:totalBoxes,maxWorldError:maxError}));
