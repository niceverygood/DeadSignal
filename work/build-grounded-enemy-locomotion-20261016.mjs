import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Group,Texture,Vector3,Quaternion} from './meshy-sprite-baker/node_modules/three/build/three.module.js';
import {GLTFLoader} from './meshy-sprite-baker/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {AnimationSampler} from './meshy-sprite-baker/src/animation.js';
import {solveArm} from './meshy-sprite-baker/src/weapon-pose.js';
import {productionManifest} from './dead-signal-game/dist/production-manifest.js';

const root=new URL('../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFile(new URL(p,root)),V=new Vector3();
const diagnosis=JSON.parse(await read('outputs/dead-signal/production-assets/qa/enemy-locomotion-diagnosis-20261016.json'));
const only=process.argv.slice(2),reports=[];
function document(bytes){const j=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+j)),start=20+j;return{doc,binary:bytes.subarray(start+8,start+8+bytes.readUInt32LE(start))};}
function append(doc,parts,values,kind){const width=kind==='SCALAR'?1:4,raw=Buffer.alloc(values.length*width*4);values.forEach((v,i)=>{(width===1?[v]:v).forEach((x,j)=>raw.writeFloatLE(x,(i*width+j)*4));});let length=parts.reduce((n,b)=>n+b.length,0);const pad=(-length)&3;if(pad){parts.push(Buffer.alloc(pad));length+=pad;}parts.push(raw);const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:raw.length});const a={bufferView:view,componentType:5126,count:values.length,type:kind};if(kind==='SCALAR'){a.min=[Math.min(...values)];a.max=[Math.max(...values)];}doc.accessors.push(a);return doc.accessors.length-1;}
function serialize(doc,parts){let binary=Buffer.concat(parts);doc.buffers[0].byteLength=binary.length;if(binary.length%4)binary=Buffer.concat([binary,Buffer.alloc(4-binary.length%4)]);let json=Buffer.from(JSON.stringify(doc));if(json.length%4)json=Buffer.concat([json,Buffer.from(' '.repeat(4-json.length%4))]);const header=Buffer.alloc(20),bheader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);bheader.writeUInt32LE(binary.length);bheader.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,bheader,binary]);}
function footGroups(sampler,side){const groups=[];for(const mesh of sampler.skins){const si=mesh.geometry.getAttribute('skinIndex'),sw=mesh.geometry.getAttribute('skinWeight'),ids=new Set(mesh.skeleton.bones.map((b,i)=>b.name===`${side}Foot`||b.name===`${side}ToeBase`?i:-1));const indices=[];for(let vertex=0;vertex<si.count;vertex++){let w=0;for(let c=0;c<4;c++)if(ids.has(si.getComponent(vertex,c)))w+=sw.getComponent(vertex,c);if(w>=.5)indices.push(vertex);}if(indices.length)groups.push({mesh,indices});}assert.ok(groups.length);return groups;}
function soleMin(groups){let min=Infinity;for(const{mesh,indices}of groups)for(const i of indices){mesh.getVertexPosition(i,V).applyMatrix4(mesh.matrixWorld);min=Math.min(min,V.y);}return min;}
function worldQuaternion(bone,q){bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(q)).normalize();bone.updateWorldMatrix(true,true);}
function smooth(a,b,t){const x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x);}
function stanceWeight(pose,side,phase){const windows=pose==='walk'?(side==='Left'?[[.30,.78]]:[[0,.30],[.84,1]]):(side==='Left'?[[.375,.50]]:[[.8125,.96875]]);let w=0;for(const[start,end]of windows){const enter=start===0?1:smooth(start-.065,start,phase),leave=end===1?1:1-smooth(end,end+.065,phase);w=Math.max(w,enter*leave);}return w;}

for(const model of diagnosis.models.filter(m=>!only.length||only.includes(m.id))){
  const bytes=await read(model.sourceModel),original=document(bytes),doc=structuredClone(original.doc),parts=[original.binary];
  const loader=new GLTFLoader();loader.register(()=>({name:'numeric-texture-placeholder',loadTexture:()=>Promise.resolve(new Texture())}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const meta=JSON.parse(await read(model.metadataPath)),height=model.baseWorldHeight,normalize=new Group(),motion=new Group(),subject=new Group();
  const scale=meta.source.scale*height/meta.projection.subjectHeight,pivot=meta.source.originPivot;normalize.scale.setScalar(scale);normalize.position.set(-pivot.x*scale,-pivot.y*scale,-pivot.z*scale);normalize.add(gltf.scene);motion.add(normalize);subject.add(motion);
  const sampler=new AnimationSampler({root:gltf.scene,subject,motion,clips:gltf.animations,subjectHeight:height});sampler.updateSkinPose();
  const sides=Object.fromEntries(['Left','Right'].map(side=>[side,{upper:gltf.scene.getObjectByName(side+'UpLeg'),knee:gltf.scene.getObjectByName(side+'Leg'),foot:gltf.scene.getObjectByName(side+'Foot'),groups:footGroups(sampler,side)}]));
  const clipReports=[];
  for(const pose of ['walk','run']){
    const measurement=model.poses.find(p=>p.pose===pose),index=gltf.animations.findIndex(c=>c.name===measurement.clip),clip=gltf.animations[index],sourceClip=original.doc.animations[index];
    assert.equal(sourceClip.name,clip.name);const count=128,duration=clip.duration,clearance=height*.0015;
    const originalMin=Object.fromEntries(['Left','Right'].map(side=>[side,Math.min(...measurement.soleSamples32.map(row=>row[side.toLowerCase()].y))]));
    const offsets=Object.fromEntries(Object.entries(originalMin).map(([side,min])=>[side,Math.max(0,clearance-min)]));
    const tracks={},validation=[],stats={clamps:0,maxTargetError:0,maxIterations:0};
    for(const side of ['Left','Right'])for(const bone of [sides[side].upper,sides[side].knee,sides[side].foot]){assert.ok(bone?.isBone);tracks[bone.name]=[];}
    for(let sample=0;sample<count;sample++){
      const phase=sample/count;sampler.sample(index,duration*phase,{removeRootMotion:true});
      const row={sample,phase,before:{},after:{},targets:{}};
      for(const side of ['Left','Right']){
        const {upper,knee,foot,groups}=sides[side],before=soleMin(groups),ankle=foot.getWorldPosition(new Vector3()),originalQ=foot.getWorldQuaternion(new Quaternion());
        const pole=knee.getWorldPosition(new Vector3()).sub(upper.getWorldPosition(new Vector3()));
        let desired=before+offsets[side];const stance=stanceWeight(pose,side,phase);desired=desired*(1-stance)+clearance*stance;
        // Only legs are adjusted. Body/hips/upper-body trajectories stay exact.
        // A large original retargeting error is fixed anatomically at the leg,
        // rather than lifting the whole body to conceal it.
        let target=ankle.clone();target.y+=desired-before;
        let iterations=0;
        for(;iterations<7;iterations++){
          const solved=solveArm(upper,knee,foot,target,pole);assert.ok(solved);if(solved.clamped)stats.clamps++;
          worldQuaternion(foot,originalQ);sampler.updateSkinPose();
          const residual=desired-soleMin(groups);if(Math.abs(residual)<.002)break;target.y+=residual;
        }
        const after=soleMin(groups);stats.maxTargetError=Math.max(stats.maxTargetError,Math.abs(after-desired));stats.maxIterations=Math.max(stats.maxIterations,iterations+1);
        row.before[side]=before;row.after[side]=after;row.targets[side]=desired;
      }
      for(const [name,values]of Object.entries(tracks))values.push(gltf.scene.getObjectByName(name).quaternion.toArray());
      if(sample%4===0)validation.push(row);
    }
    const times=Array.from({length:count+1},(_,i)=>duration*i/count),input=append(doc,parts,times,'SCALAR');
    const modified=structuredClone(sourceClip);modified.name=pose==='walk'?'DS_GroundedWalk':'DS_GroundedRun';
    for(const [name,values]of Object.entries(tracks)){
      values.push([...values[0]]);const output=append(doc,parts,values,'VEC4'),node=doc.nodes.findIndex(n=>n.name===name),channel=modified.channels.find(c=>c.target.node===node&&c.target.path==='rotation');assert.ok(channel,name);
      const si=modified.samplers.length;modified.samplers.push({input,output,interpolation:'LINEAR'});channel.sampler=si;
    }
    doc.animations.push(modified);
    clipReports.push({pose,clip:modified.name,duration,samples:count,legOnlyRotationCorrection:true,originalClipPreserved:true,originalPerFootMin:originalMin,offsets,stats,
      minAfter:Math.min(...validation.flatMap(r=>Object.values(r.after))),maxAfter:Math.max(...validation.flatMap(r=>Object.values(r.after))),samples32:validation});
  }
  doc.extras={...doc.extras,deadSignalGroundedLocomotion:{method:'actual two-bone IK with foot world orientation preserved; exact skinned outsole targets; no pelvis/root trajectory change',sourceSHA256:sha(bytes),clips:clipReports.map(c=>c.clip),onlyModifiedBoneChannels:['LeftUpLeg.rotation','LeftLeg.rotation','LeftFoot.rotation','RightUpLeg.rotation','RightLeg.rotation','RightFoot.rotation'],textureChanges:false,geometryChanges:false,originalAnimationsPreserved:true,requiresVisualReview:true}};
  const result=serialize(doc,parts),round=document(result);assert.ok(round.binary.subarray(0,original.binary.length).equals(original.binary));
  for(const field of ['meshes','skins','nodes','materials','images','textures','samplers','scenes','scene'])assert.deepEqual(round.doc[field],original.doc[field]);
  assert.deepEqual(round.doc.animations.slice(0,original.doc.animations.length),original.doc.animations);
  assert.equal(sha(await read(model.sourceModel)),sha(bytes));
  const folder=`outputs/dead-signal/production-assets/models/${model.id}-grounded-locomotion-v1`;
  await mkdir(new URL(folder+'/',root),{recursive:true});await writeFile(new URL(folder+'/model.glb',root),result);
  const report={id:model.id,source:model.sourceModel,sourceSHA256:sha(bytes),model:folder+'/model.glb',sha256:sha(result),baseWorldHeight:height,originalBinaryPrefixExact:true,originalGeometrySkinUVTextureExact:true,originalClipsExact:true,clips:clipReports,visualApproval:'pending'};
  await writeFile(new URL(folder+'/grounding-provenance.json',root),JSON.stringify(report,null,2)+'\n');reports.push(report);sampler.mixer.stopAllAction();
  console.log(JSON.stringify({id:model.id,model:report.model,clips:clipReports.map(c=>({clip:c.clip,offsets:c.offsets,stats:c.stats,after:[c.minAfter,c.maxAfter]}))}));
}
await writeFile(new URL('outputs/dead-signal/production-assets/qa/enemy-grounded-locomotion-authoring-20261016.json',root),JSON.stringify({method:'Append-only derived GLBs: source geometry, UVs, skin, texture, bind skeleton and original animations preserved exactly. New walk/run clips correct only six leg rotation channels with actual skinned sole checks.',generatedAt:new Date().toISOString(),assets:reports,visualApproval:'pending'},null,2)+'\n');
