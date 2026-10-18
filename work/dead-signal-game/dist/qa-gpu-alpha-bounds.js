import * as THREE from './player-rig/vendor/three.module.js';
import {GPUAlphaBounds} from './boss-rig/gpu-alpha-bounds.js';
import {nativeAlphaBounds} from './native-alpha-bounds.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const differences=(a,b)=>{let different=0,maxDelta=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)different++;maxDelta=Math.max(maxDelta,d);}return {different,maxDelta};};
export function syntheticGPUAlphaBounds(){
 const width=1024,height=768,size=256,bytes=new Uint8Array(width*height*4),set=(cell,x,y,a)=>{const px=(cell%4)*256+x,py=Math.floor(cell/4)*256+y,n=((height-1-py)*width+px)*4;bytes[n]=bytes[n+1]=bytes[n+2]=Math.round(a*.3);bytes[n+3]=a;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)set(0,x,y,7);
 set(1,0,0,8);set(2,255,255,8);set(3,255,0,255);set(4,0,255,9);
 for(let y=23;y<=210;y++)for(let x=12;x<=200;x++)set(5,x,y,128);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){set(6,x,y,x===3||y===9||x===250||y===247?8:7);set(7,x,y,255);}
 for(let i=0;i<64;i++)set(8,(i*37)%256,(i*23)%256,[1,7,8,9,255][i%5]);
 set(9,0,127,8);set(10,255,0,8); //11 is entirely transparent.
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(width,height,false);
 const texture=new THREE.DataTexture(bytes,width,height,THREE.RGBAFormat);texture.colorSpace=THREE.NoColorSpace;texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:'precision highp float; in vec3 position; void main(){gl_Position=vec4(position,1.0);}',fragmentShader:'precision highp float; precision highp int; uniform sampler2D source; out vec4 result; void main(){result=texelFetch(source,ivec2(gl_FragCoord.xy),0);}',uniforms:{source:{value:texture}},depthTest:false,depthWrite:false,blending:THREE.NoBlending,transparent:false,toneMapped:false});
 const geometry=new THREE.PlaneGeometry(2,2),mesh=new THREE.Mesh(geometry,material),scene=new THREE.Scene(),camera=new THREE.Camera();mesh.frustumCulled=false;scene.add(mesh);
 const helper=new GPUAlphaBounds(),read=document.createElement('canvas');read.width=width;read.height=height;const c=read.getContext('2d',{willReadFrequently:true});
 const capture=()=>{c.clearRect(0,0,width,height);c.drawImage(renderer.domElement,0,0);return c.getImageData(0,0,width,height).data;};
 try{
  renderer.render(scene,camera);const before=capture(),expected=Array.from({length:12},(_,i)=>nativeAlphaBounds(before,width,height,8,{x:i%4*256,y:Math.floor(i/4)*256,w:256,h:256})),records=[];
  renderer.setViewport(17,29,91,73);renderer.setScissor(31,41,53,61);renderer.setScissorTest(true);renderer.autoClear=false;
  for(const count of [12,5,12]){
   const bounds=helper.read(renderer,width,height,count);if(!bounds)throw Error(helper.lastError||'gpu-alpha-reduction-unavailable');
   const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4());
   records.push({count,bounds,expected:expected.slice(0,count),exact:same(bounds,expected.slice(0,count)),bytesRead:helper.bytesRead,rawBytes:helper.rawBytes,stateRestored:viewport.equals(new THREE.Vector4(17,29,91,73))&&scissor.equals(new THREE.Vector4(31,41,53,61))&&renderer.getScissorTest()&&renderer.autoClear===false&&renderer.getRenderTarget()===null,...differences(before,capture())});
  }
  helper.dispose();return {records,releasedRawBytes:helper.rawBytes,note:'Actual antialiased WebGL framebuffer, byte alpha7/8/9, empty and one-pixel corners, strong adjacent cells. A separate test-only context is disposed/lost after this fixture.'};
 }finally{helper.dispose();texture.dispose();material.dispose();geometry.dispose();renderer.dispose();renderer.forceContextLoss();}
}
export async function compareOriginalGPUAlphaBounds(renderer,{onProgress=()=>{},onImage=()=>{}}={}){
 const rig=renderer.liveEnemies,art=renderer.productionArt,helper=new GPUAlphaBounds(),reports=[];
 try{for(const type of ['walker','runner','shield','screamer','gas','elite','collector']){
  onProgress(type);const key='enemy-'+type;rig.releaseUnused([key]);if(!await rig.load(key))throw Error(rig.error||'native-model-not-ready');
  const mapping=art.manifest.enemies[type];await Promise.all((typeof mapping==='string'?[mapping]:Object.values(mapping)).map(id=>art.load(id,{retry:true})));
  const jobs=['idle','walk','walk','walk','windup','attack','hit','death'].map((pose,i)=>{
   const actor={id:900+i,type,x:1200,y:930,hp:pose==='death'?0:500,dead:pose==='death',angle:i*.73,attackState:pose==='windup'?'windup':pose==='attack'?'charge':'walk',attackTime:.4,hitFlash:['windup','attack','hit'].includes(pose)?.09:0};
   const options={pose,animationTime:pose==='death'?.45:.1,height:42,actionDurations:{windup:.9,charge:.75}},selected=art.enemyFrame(type,actor,{pose,simulationTime:1.2,animationTime:options.animationTime});if(!selected)throw Error('native-art-not-ready');
   return {actor,options,fallback:{...selected,locomotion:{pose:pose==='hit'?'walk':pose,phase:2.4,angle:actor.angle,...(pose==='walk'?{moveWeight:[.3,.7,1][i-1]}:{})}}};
  });
  rig.beginBatch(jobs.length);for(const j of jobs)rig.frame(key,j.actor,1.2,j.fallback,j.options);const batch=rig.batch;rig.endBatch();
  const before=rig.rawContext.getImageData(0,0,batch.width,batch.height).data,expected=jobs.map(j=>rig.frames.get(j.actor).selected.frame.alphaBounds),actual=helper.read(rig.renderer,batch.width,batch.height,jobs.length);if(!actual)throw Error(helper.lastError||'gpu-alpha-reduction-unavailable');
  const after=rig.readSurface(batch.width,batch.height).pixels;
  reports.push({type,poses:jobs.length,expected,actual,exact:same(actual,expected),bytesRead:helper.bytesRead,rawBytes:helper.rawBytes,...differences(before,after),originalPrivateOutputs:jobs.every(j=>rig.frames.get(j.actor).selected.image.width===256)});
  await onImage(type,rig.frames.get(jobs[5].actor).selected.image.toDataURL());await new Promise(requestAnimationFrame);
 }}finally{helper.dispose();}
 return reports;
}
