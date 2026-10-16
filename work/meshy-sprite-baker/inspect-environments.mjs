// Offline geometry inspection only. No image decode, network, API, or source GLB mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Box3,Vector3,Matrix4} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {modelRotation} from './src/atlas.js';
import {normalizeJob} from './src/batch.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const progress=JSON.parse(await fs.readFile(path.join(root,'work/environment-input-progress.json'),'utf8'));
const plan=JSON.parse(await fs.readFile(path.join(root,'work/production-environment-plan.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const exists=async p=>{try{await fs.access(p);return true;}catch{return false;}};
const vec=v=>({x:v.x,y:v.y,z:v.z});
const box=b=>({min:vec(b.min),max:vec(b.max),extent:vec(b.getSize(new Vector3())),center:vec(b.getCenter(new Vector3()))});
const planned=[...plan.landmarks,...plan.sharedProps];
const orientationReview=await exists(path.join(root,'work/environment-orientation-review.json'))?JSON.parse(await fs.readFile(path.join(root,'work/environment-orientation-review.json'),'utf8')):{models:{}};
const measurements=[],jobs=[];
for(const input of progress.assets){
 const id='env-'+input.slug,sourceRelative='outputs/dead-signal/production-assets/models/'+id+'-v1/model.glb';
 const source=path.join(root,sourceRelative),target=input.dimensions,model=id+'.glb';
 const record={id,planId:input.planId,source:sourceRelative,exists:await exists(source),target,ready:false,status:'model_missing',orientation:{frontPlusZ:'unverified_until_native_textured_view',note:'Meshy front/back preview labels alone do not establish GLB axes.'}};
 let originPivot=null,uniformScale=null,frontYawDegrees=-90;
 if(record.exists){
  try{
   const bytes=await fs.readFile(source),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
   loader.register(()=>({name:'OfflineGeometryWithoutTextureDecode',loadTexture:()=>Promise.resolve(null)}));
   const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
   gltf.scene.updateMatrixWorld(true);const b=new Box3().setFromObject(gltf.scene,true);
   if(b.isEmpty())throw new Error('Empty actual GLB');
   const points=[];let meshes=0,triangles=0;
   gltf.scene.traverse(o=>{if(!o.isMesh)return;meshes++;const p=o.geometry.attributes.position;triangles+=(o.geometry.index?.count||p.count)/3;for(let i=0;i<p.count;i++)points.push(new Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));});
   const sz=b.getSize(new Vector3()),center=b.getCenter(new Vector3());originPivot={x:center.x,y:b.min.y,z:center.z};
   const yawFits=[-90,0,90,180].map(yaw=>{const rot=new Matrix4().makeRotationY(modelRotation(0,yaw*Math.PI/180));const rb=new Box3();for(const p of points)rb.expandByPoint(p.clone().sub(new Vector3(originPivot.x,originPivot.y,originPivot.z)).applyMatrix4(rot));const e=rb.getSize(new Vector3()),s=Math.min(target.width/e.x,target.depth/e.z);return{frontYawDegrees:yaw,rawRotationDegrees:90+yaw,groundBounds:box(rb),uniformScale:s,fitted:{width:e.x*s,depth:e.z*s,height:e.y*s},widthOccupancy:e.x*s/target.width,depthOccupancy:e.z*s/target.depth,heightRatio:e.y*s/target.height};});
   // Opposite yaws have identical footprint. Floating error must not silently flip a facade.
   yawFits.sort((a,b)=>{const difference=Math.min(b.widthOccupancy,b.depthOccupancy)-Math.min(a.widthOccupancy,a.depthOccupancy);return Math.abs(difference)<1e-8?0:difference;});
   const fit=yawFits[0];frontYawDegrees=fit.frontYawDegrees;uniformScale=fit.uniformScale;
   const sliceCuts=[.03,.08,.15,.5,.85].map(f=>{const top=b.min.y+sz.y*f,subset=points.filter(p=>p.y<=top),sb=new Box3().setFromPoints(subset);return{heightFraction:f,vertices:subset.length,bounds:box(sb)};});
   const facadeSections=['x','z'].map(axis=>{const min=b.min[axis],span=sz[axis];return{axis,negative:points.filter(p=>p[axis]<=min+span*.1).length,positive:points.filter(p=>p[axis]>=min+span*.9).length};});
   const deviations={shortSideUnderfill:1-Math.min(fit.widthOccupancy,fit.depthOccupancy),heightRelativeError:Math.abs(fit.heightRatio-1),rawWidthDepthRatio:sz.x/sz.z,targetWidthDepthRatio:target.width/target.depth};
   Object.assign(record,{sha256:sha(bytes),bytes:bytes.length,meshes,vertices:points.length,triangles:Math.round(triangles),animations:gltf.animations.map(a=>({name:a.name,duration:a.duration})),originalBounds:box(b),originPivot,yawFits,chosenFit:fit,baseSlices:sliceCuts,facadeVertexDensity:facadeSections,deviations,geometryGate:deviations.shortSideUnderfill>.25||deviations.heightRelativeError>.25?'review_over_25_percent':'contain_candidate',status:'actual_model_measured_native_review_pending',ready:true});
   const verified=orientationReview.models?.[id];
   if(verified?.sourceSHA256===record.sha256){record.orientation={...verified,rawSemanticFrontIsPlusZ:verified.rawFrontVector?.join(',')==='0,0,1',normalizedFrontPolicy:'Baker rigid yaw places intended facade on game +Y / THREE +Z; no mirroring or axis scaling.'};}
   const copy=path.join(root,'work/meshy-sprite-baker/models',model);if(await exists(copy)){if(sha(await fs.readFile(copy))!==record.sha256)throw new Error('Existing baker model differs; never overwrite silently');}else await fs.copyFile(source,copy,fs.constants?.COPYFILE_EXCL||1);
   if(sha(await fs.readFile(source))!==record.sha256)throw new Error('Source changed during read');
  }catch(error){record.ready=false;record.status='inspection_error';record.error=error.message;}
 }
 const job={id,exportName:id,model,ready:record.ready,directions:input.slug==='broken-car'?16:8,samples:1,frameSize:planned.find(p=>p.id===input.planId)?.category==='landmark'?512:256,subjectHeight:target.height,padding:24,outlinePx:2,shading:'unlit',clip:null,weaponReady:false,rootMotion:false,frontYawDegrees,coreRegion:[.05,.05,.95,.95],uniformScale,originPivot};
 if(input.slug==='fence'){
  // Existing world fences use both axis orientations but have no angle field.
  // Two rigid-yaw exports preserve their geometry at the same default frame0.
  const horizontal={...job,id:'env-fence-horizontal',exportName:'env-fence-horizontal'};
  const vertical={...job,id:'env-fence-vertical',exportName:'env-fence-vertical',frontYawDegrees:job.frontYawDegrees===-90?0:-90};
  normalizeJob(horizontal);normalizeJob(vertical);jobs.push(horizontal,vertical);
 }else{normalizeJob(job);jobs.push(job);}
 measurements.push(record);
}
await fs.writeFile(path.join(root,'work/meshy-sprite-baker/batches/environment-production-jobs.json'),JSON.stringify({version:1,note:'ready means actual GLB measured and byte-exact copied, not art/geometry approved. 16 source models/17 exports: fence horizontal+vertical are rigid yaw variants. Static8dirs due baker schema; actual game angle0. Car16dirs. Uniform contain only, never stretch.',jobs},null,2)+'\n');
await fs.writeFile(path.join(root,'work/environment-glb-measurements.json'),JSON.stringify({schemaVersion:1,scope:'offline actual Three GLTFLoader transformed vertices; texture decode skipped; immutable originals',nativeProjection:plan.nativeProjection,modelCount:measurements.filter(r=>r.ready).length,measurements},null,2)+'\n');
console.log(JSON.stringify({ready:measurements.filter(r=>r.ready).map(r=>({id:r.id,extent:r.originalBounds.extent,fit:r.chosenFit.fitted,frontYaw:r.chosenFit.frontYawDegrees,gate:r.geometryGate,deviations:r.deviations})),missing:measurements.filter(r=>!r.exists).map(r=>r.id),errors:measurements.filter(r=>r.error).map(r=>({id:r.id,error:r.error}))},null,2));
