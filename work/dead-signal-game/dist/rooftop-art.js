import * as THREE from './player-rig/vendor/three.module.js';
import {GLTFLoader} from './player-rig/vendor/GLTFLoader.js';
import {unlit} from './player-rig/live-player.js';
import {nativeBuildingCells} from './production-buildings.js?v=0.29.0';
import {project} from './projection.js?v=0.29.0';
const ISO=Math.sqrt(3)/2,SIZE=512;
function polygon(c,r){const pts=[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]].map(([x,y])=>project(x,y));c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();}
export class RooftopArt{
 constructor(){this.ready=false;this.error='';this.promise=null;this.texture=document.createElement('canvas');this.texture.width=this.texture.height=SIZE;this.plans=new WeakMap();}
 load(){return this.promise??=(async()=>{let renderer,root;try{const loader=new GLTFLoader(),gltf=await loader.loadAsync(new URL('./player-rig/models/env-common-brick.glb',import.meta.url).href);root=gltf.scene;root.rotation.y=Math.PI/2;const box=new THREE.Box3().setFromObject(root,true),center=box.getCenter(new THREE.Vector3());root.position.set(-center.x,-box.min.y,-center.z);unlit(root);const scene=new THREE.Scene();scene.add(root);const w=(box.max.x-box.min.x)*1.02,h=(box.max.z-box.min.z)*1.02,camera=new THREE.OrthographicCamera(-w/2,w/2,h/2,-h/2,.01,30);camera.position.set(0,10,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(SIZE,SIZE,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.render(scene,camera);this.texture.getContext('2d').drawImage(renderer.domElement,0,0);this.ready=true;return true;}catch(error){this.error=error.message;this.promise=null;return false;}finally{renderer?.dispose();root?.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){m.map?.dispose();m.map?.source?.data?.close?.();m.dispose();}});}})();}
 draw(c,world,art){if(!this.ready)return false;const surface=world.rooftop;
 c.save();try{
 // Distant blocks use the same unchanged original atlas below the roof plane.
 c.save();c.globalAlpha=.4;c.translate(0,surface.elevation+100);
 for(const [x,y]of [[350,350],[950,300],[1550,300],[2050,450],[350,950],[2100,1150],[650,1350],[1250,1300],[1800,1350]]){const prop=art.propFrame('env-common-brick',{x,y,w:230,h:230,kind:'building'});if(prop)art.drawFrame(c,prop);}c.restore();
 for(const roof of surface.platforms.slice(0,2)){
 const base=art.propFrame('env-common-brick',{...roof,kind:'building'});if(!base)continue;let plan=this.plans.get(roof);if(!plan){plan=nativeBuildingCells({...roof,kind:'building'},{...base.placement.footprint.native,subjectHeight:base.metadata.projection.subjectHeight},surface.elevation);this.plans.set(roof,plan);}if(!plan)continue;
 c.save();c.translate(0,plan.worldHeight);for(const cell of [...plan.cells].sort((a,b)=>a.x+a.y-b.x-b.y)){const prop=art.propFrame('env-common-brick',cell);if(prop)art.drawFrame(c,prop);}c.restore();
 }
 // Orthographic roof pixels come directly from the original GLB's top view.
 for(const roof of surface.platforms){c.save();polygon(c,roof);c.clip();c.transform(ISO,.5,-ISO,.5,0,0);const tile=180;for(let y=roof.y;y<roof.y+roof.h;y+=tile)for(let x=roof.x;x<roof.x+roof.w;x+=tile)c.drawImage(this.texture,0,0,SIZE,SIZE,x-4,y-4,tile+8,tile+8);c.restore();polygon(c,roof);c.strokeStyle='#17272d';c.lineWidth=5;c.stroke();}
 return true;}finally{c.restore();}}
}
