import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/player-rig/vendor/three.module.js';import {GLTFLoader} from '../dist/player-rig/vendor/GLTFLoader.js';import {AnimationSampler} from '../dist/player-rig/animation.js';import {bossClipIndices} from '../dist/boss-rig/boss-pose.js';import {SkinnedPoseBounds} from '../dist/boss-rig/pose-bounds.js';
for(const [file,size]of [['registry.json',512],['enemy-registry.json',256]]){
 const registry=JSON.parse(await readFile(new URL('../dist/boss-rig/'+file,import.meta.url)));
 for(const [key,config]of Object.entries(registry.bosses))test(key+': conservative original-bone bounds contain every visible authored vertex across actions',async()=>{
  const loader=new GLTFLoader();loader.register(()=>({name:'numeric-texture-placeholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const parse=async file=>{const b=await readFile(new URL('../dist/boss-rig/'+file,import.meta.url));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
  const gltf=await parse(config.file);if(config.walkFile)gltf.animations.push(...(await parse(config.walkFile)).animations);
  const root=gltf.scene,normal=new THREE.Group(),motion=new THREE.Group(),subject=new THREE.Group(),p=config.source.originPivot,scale=config.source.scale;
  normal.scale.setScalar(scale);normal.position.set(-p.x*scale,-p.y*scale,-p.z*scale);normal.add(root);motion.add(normal);subject.add(motion);
  const sampler=new AnimationSampler({root,subject,motion,clips:gltf.animations,subjectHeight:config.projection.subjectHeight}),bounds=new SkinnedPoseBounds(root);assert.equal(bounds.available,true,bounds.error);
  const resolution=size/256,density=config.projection.pixelsPerWorld*resolution,pivot={x:config.projection.footPivot.x*resolution,y:config.projection.footPivot.y*resolution},k=density*Math.sqrt(3/2),camera=new THREE.OrthographicCamera(-pivot.x/k,(size-pivot.x)/k,pivot.y/k,(pivot.y-size)/k,.1,8000);camera.position.set(1000,1000,1000);camera.lookAt(0,0,0);
  const indices=bossClipIndices(config,gltf.animations),vertex=new THREE.Vector3();let checked=0;
  for(const [i,name]of ['idle','walk','attack','hit','death'].entries()){
   subject.rotation.y=i*.83;sampler.sample(indices[name],gltf.animations[indices[name]].duration*(i%2?.87:.37));const b=bounds.project(camera,size);assert.ok(b,name);
   root.traverse(mesh=>{if(!mesh.isMesh)return;for(let n=0;n<mesh.geometry.attributes.position.count;n++){
    mesh.getVertexPosition(n,vertex);vertex.applyMatrix4(mesh.matrixWorld).project(camera);const x=(vertex.x*.5+.5)*size,y=(.5-vertex.y*.5)*size;if(x<0||y<0||x>size||y>size)continue;
    assert.ok(x>=b.x-1e-5&&x<=b.x+b.width+1e-5&&y>=b.y-1e-5&&y<=b.y+b.height+1e-5,JSON.stringify({name,n,x,y,b}));checked++;
   }});
  }assert.ok(checked>100);assert.equal(bounds.project(new THREE.PerspectiveCamera(),size),null);
 });
}
test('unproven morph geometry takes the existing readback fallback rather than inventing bounds',()=>{
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));geometry.morphAttributes.position=[geometry.attributes.position];const root=new THREE.Group();root.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()));const bounds=new SkinnedPoseBounds(root);assert.equal(bounds.available,false);assert.equal(bounds.project(new THREE.OrthographicCamera(),256),null);
});
