import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {Box3,Group,Texture,Vector3} from './meshy-sprite-baker/node_modules/three/build/three.module.js';
import {GLTFLoader} from './meshy-sprite-baker/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {AnimationSampler} from './meshy-sprite-baker/src/animation.js';

// Read-only CPU analysis. Texture decode is omitted; original mesh, weights,
// bone transforms, clip interpolation and catalog normalization are retained.
const root=new URL('../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFile(new URL(p,root));
const sourceHashes={},samples=256,bones=['Hips','Head','LeftFoot','LeftToeBase','RightFoot','RightToeBase'];
const point=v=>({x:v.x,y:v.y,z:v.z});
async function immutableRead(path){const b=await read(path);sourceHashes[path]=sha(b);return b;}
function regression(rows,bone,axis){
  const n=rows.length,tx=rows.reduce((s,r)=>s+r.time,0)/n,ty=rows.reduce((s,r)=>s+r.bones[bone][axis],0)/n;
  const sxx=rows.reduce((s,r)=>s+(r.time-tx)**2,0),sxy=rows.reduce((s,r)=>s+(r.time-tx)*(r.bones[bone][axis]-ty),0);
  const slope=sxy/sxx,intercept=ty-slope*tx,sse=rows.reduce((s,r)=>s+(r.bones[bone][axis]-slope*r.time-intercept)**2,0);
  const syy=rows.reduce((s,r)=>s+(r.bones[bone][axis]-ty)**2,0);
  return{slope,intercept,rSquared:syy?1-sse/syy:1,maxResidual:Math.max(...rows.map(r=>Math.abs(r.bones[bone][axis]-slope*r.time-intercept)))};
}
const rowsByPose=[];
for(const name of ['engine.js','production-art.js','renderer.js'])await immutableRead(`outputs/dead-signal/playable/v0.27.0/dist/${name}`);
for(const pose of ['walk','run']){
  const metaPath=`work/dead-signal-game/dist/assets/production/survivor-shotgun-${pose}-hq32-packed/metadata.json`;
  const metadata=JSON.parse(await immutableRead(metaPath)),path=`work/meshy-sprite-baker/models/${metadata.source.file}`,bytes=await immutableRead(path);
  const loader=new GLTFLoader();loader.register(()=>({name:'numeric-analysis-texture-placeholder',loadTexture:()=>Promise.resolve(new Texture())}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(gltf.scene,true),normalize=new Group(),motion=new Group(),subject=new Group();
  assert.ok(Math.abs((bounds.max.y-bounds.min.y)*metadata.source.scale-44)<1e-6);
  normalize.scale.setScalar(metadata.source.scale);
  const p=metadata.source.originPivot;normalize.position.set(-p.x*metadata.source.scale,-p.y*metadata.source.scale,-p.z*metadata.source.scale);
  normalize.add(gltf.scene);motion.add(normalize);subject.add(motion);
  const sampler=new AnimationSampler({root:gltf.scene,subject,motion,clips:gltf.animations,subjectHeight:44});
  const clipIndex=gltf.animations.findIndex(c=>c.name===metadata.animation.name),clip=gltf.animations[clipIndex];
  assert.ok(clip&&sampler.skins.length>0);
  const rows=[];
  for(let i=0;i<samples;i++){
    const time=clip.duration*i/samples;sampler.sample(clipIndex,time,{removeRootMotion:true});
    rows.push({sample:i,time,bones:Object.fromEntries(bones.map(name=>[name,point(gltf.scene.getObjectByName(name).getWorldPosition(new Vector3()))]))});
  }
  // Windows are explicit, conservative central stance regions from inspection
  // of all 32 registered samples. No foot origin is claimed to be an outsole.
  const windows=pose==='walk'?
    [['LeftToeBase',10/32,25/32],['RightToeBase',2/32,10/32],['RightToeBase',27/32,31/32]]:
    [['LeftToeBase',12/32,16/32],['RightToeBase',26/32,31/32]];
  const contacts=windows.map(([bone,start,end])=>{
    const windowRows=rows.filter(r=>r.time>=start*clip.duration&&r.time<=end*clip.duration),x=regression(windowRows,bone,'x'),z=regression(windowRows,bone,'z');
    return{bone,phaseStart:start,phaseEnd:end,timeStart:start*clip.duration,timeEnd:end*clip.duration,samples:windowRows.length,
      forwardSpeedForStationaryContact:-z.slope,lateralBoneSpeed:x.slope,
      nativeStrideForStationaryContact:-z.slope*clip.duration,
      linearity:z,contactBoneHeight:{min:Math.min(...windowRows.map(r=>r.bones[bone].y)),max:Math.max(...windowRows.map(r=>r.bones[bone].y))}};
  });
  const speed=contacts.reduce((s,c)=>s+c.forwardSpeedForStationaryContact*c.samples,0)/contacts.reduce((s,c)=>s+c.samples,0);
  const stride=speed*clip.duration;
  rowsByPose.push({pose,path,sha256:sha(bytes),catalogMetadata:metaPath,normalizedHeight:44,clip:clip.name,duration:clip.duration,
    rootMotion:sampler.describeRootMotion(clipIndex),nativeForwardSpeedEstimate:speed,nativeCycleDistanceEstimate:stride,contacts,rows});
  sampler.mixer.stopAllAction();
}
const walk=rowsByPose[0],run=rowsByPose[1],speed=214,reference=214;
const candidateSpeed=128,candidateCycle={walk:39.371208828398544,run:84.94224247163403};
const candidateSimulation=rowsByPose.map(model=>{
  const cycleDistance=candidateCycle[model.pose],cadenceRate=candidateSpeed*model.duration/cycleDistance;
  const directions=[1,-1].map(sign=>({travelDirection:sign===1?'forward':'backward',playbackDirection:sign===1?'forward':'reverse',
    rootSpeed:sign*candidateSpeed,sourceTimeRate:sign*cadenceRate,
    contacts:model.contacts.map(contact=>{
      const rows=model.rows.filter(r=>r.time>=contact.timeStart&&r.time<=contact.timeEnd);
      // In reverse playback, chronological simulation visits these same source
      // poses in reverse order. Root translation per signed source second is
      // unchanged, so the same contact-position expression applies to both.
      const footPositions=rows.map(r=>r.bones[contact.bone].z+r.time*cycleDistance/model.duration);
      const mean=footPositions.reduce((s,v)=>s+v,0)/footPositions.length;
      return{bone:contact.bone,samples:rows.length,
        actualContactSlipSpeed:sign*(candidateSpeed-contact.forwardSpeedForStationaryContact*cadenceRate),
        contactForwardPositionRange:Math.max(...footPositions)-Math.min(...footPositions),
        contactMaximumDeviationFromMean:Math.max(...footPositions.map(v=>Math.abs(v-mean))),
        contactSimulationDuration:(contact.timeEnd-contact.timeStart)/cadenceRate};
    })}));
  return{pose:model.pose,cycleDistance,cadenceRate,cycleDurationAt128:cycleDistance/candidateSpeed,directions};
});
const directionalSlip=[0,45,90,135,180].map(degrees=>{
  const a=degrees*Math.PI/180,v=[Math.cos(a)*speed,Math.sin(a)*speed],foot=[-walk.nativeForwardSpeedEstimate,0];
  return{movementRelativeToAimDegrees:degrees,worldVelocity:v,plantedFootVelocityAssumingWalkForward:foot,
    resultingFootWorldSpeed:Math.hypot(v[0]+foot[0],v[1]+foot[1])};
});
const report={format:'dead-signal-native-locomotion-diagnosis-v1',createdAt:new Date().toISOString(),
  method:'Unchanged actual GLB bones sampled at 256 phases using the production AnimationSampler and exact registered 44-world-unit normalization. Central stance toe-origin regression measures the root speed required for stationary contact. CPU texture decode skipped only.',
  baseline:'outputs/dead-signal/playable/v0.27.0/dist',samplesPerClip:samples,models:rowsByPose,
  units:{characterHeight:44,threeAxes:'X=game ground x, Y=game height, Z=game ground y before model yaw',metadataScaleIsApplied:true,
    atlasPixelDensityCancelledBySpritePlacement:true,projection:'screen x=(x-y)*sqrt(3)/2; screen y=(x+y)/2-z',
    groundToScreenSpeedRatioRange:[1/Math.sqrt(2),Math.sqrt(3/2)],
    nativeFootForwardAxis:'source +Z; baker yaw=pi/2-actor.angle; rendered forward=(cos(angle),sin(angle))'},
  baselineRuntime:{normalSpeed:speed,groundedGaitReferenceSpeed:reference,walkCadenceRate:1,runThreshold:214*1.15,
    normalClip:'walk',normalTravelPerCycle:speed*walk.duration,
    normalTravelVersusNativeStride:speed*walk.duration/walk.nativeCycleDistanceEstimate,
    predictedContactSlipSpeed:speed-walk.nativeForwardSpeedEstimate,
    predictedContactSlipDuringLeftStance:(speed-walk.nativeForwardSpeedEstimate)*(walk.contacts[0].timeEnd-walk.contacts[0].timeStart),
    dashSpeed:675,dashDuration:.23,dashTravel:675*.23,dashRateCap:1.25,
    dashNativeClipCompensatedSpeed:run.nativeForwardSpeedEstimate*1.25,
    shootFullBodyActionDuration:.12,nailgunFireDelay:.105,shotgunFireDelay:.48,
    continuousNailgunFullBodyActionDutyCycle:Math.min(1,.12/.105),shotgunFullBodyActionDutyCycle:Math.min(1,.12/.48),
    actionProblem:'Recoil replaces the full HQ32 locomotion with DS_attack whose leg rotations are authored over one first walking pose. Nailgun interval is shorter than action duration, so feet can remain almost permanently in the static attack leg pose while root translation continues.',
    directionProblem:'actor.angle is aim direction, not displacement direction. The same forward gait is selected for sideways and backward travel.',directionalSlip},
  candidateDistancePhaseSimulation:candidateSimulation,
  recommendation:{normalSpeedRange:[120,130],normalPose:'run at measured distance phase, independent of fire/hit full-body action while moving',
    walkSpeedUpperThresholdRange:[55,65],walkCycleDistance:walk.nativeCycleDistanceEstimate,runCycleDistance:run.nativeCycleDistanceEstimate,
    approximateRoundedCycleDistances:{walk:40,run:85},
    phaseRule:'phase += actualEuclideanDisplacement * playbackSign * TAU / cycleDistance. Choose negative sign for backward travel relative to aim; retain a stable nonzero sign around perpendicular travel. Do not use the magnitude of a forward dot product, which would freeze legs during sideways movement. Exact contact matching applies only to parallel/antiparallel travel until native strafe clips exist.',
    fireRule:'Keep locomotion legs while moving. Apply existing muzzle flash/weapon recoil as a render effect or use an actually layered new bake; a full-body static action must not replace the stride.',
    orientationRule:'For exact side movement contact, a forward-only full-body atlas cannot keep both aimed upper body and movement-aligned legs. Prefer correctly layered lower-body movement + aimed upper body bake. For immediate bounded improvement, retain facing but reverse playback when displacement is backward; this improves backward travel only and does not solve perpendicular strafing.',
    footLockMinimum:'Match distance to the measured stride first. Optional per-contact screen translation can pin one planted foot and release at lift-off, but cap correction and never accumulate it into collision/root state. This cannot physically fix an arbitrarily sideways full-body forward animation.',
    dash:'At 675 world/sec the existing run is only sufficient for roughly 159 world/sec at capped cadence. Treat a reduced short dodge as a deliberate burst with its own animation; do not claim ordinary stride can lock 675 world/sec.'},
  nativeBakeFollowup:{requiredFor:'Physically credible perpendicular strafing while the gun and upper body maintain independent aim direction.',
    preserve:'Reuse original GLB geometry, original textures, exact normalization, current weapon meshes and measured landmark attachments.',
    locomotion:'Add actual forward, backward and left/right strafe lower-body trajectories, with planted-foot XZ constancy and original plausible Y/flight.',
    layering:'Author locomotion and aimed upper-body/weapon-ready pose on the rig before rendering. Validate torso twist and hand IK through each movement-relative-to-aim variant.',
    framePlan:'Retain 16 world-facing directions and 32 native phase samples. Additional movement-relative-to-aim variants need separate atlas pages or a deliberately bounded runtime rig; the present 16-facing atlas contains only forward gait.',
    actions:'Bake recoil over the moving lower-body cycle rather than replacing the full body with a static first-walk pose. Test stationary attack separately.',
    acceptance:['Forward and backward planted-foot position varies by less than 1 world unit during central stance at intended move speed.',
      'Sideways travel has its own planted-foot trajectory aligned to the actual displacement, not only a renamed forward clip.',
      'Weapon muzzle follows the actual hand rig and aim; no source geometry or texture substitute.',
      'No full-body atlas switch during sustained firing can freeze the lower-body cycle.',
      'Pause, stop, wall contact and saved-state restore preserve phase without continuing foot motion.'],
    status:'Specification only; no new native strafe bake performed by this diagnostic.'},
  limitations:['Central stance toe joint origins lie inside shoes; the regression estimates root speed and is not an exact skinned outsole solver.',
    'Run includes authored airborne phases; exact foot locking applies only during contact and must not pull all samples to the floor.',
    'This is numerical source analysis, not browser feel approval or a performance benchmark.',
    'No runtime, source GLB, sprite image, save, profile or native release changed by this diagnostic script.'],sourceHashes};
for(const[path,hash]of Object.entries(sourceHashes))assert.equal(sha(await read(path)),hash);
const output='outputs/dead-signal/production-assets/qa/player-locomotion-diagnosis-20261016.json';
await writeFile(new URL(output,root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,walk:{speed:walk.nativeForwardSpeedEstimate,stride:walk.nativeCycleDistanceEstimate,contacts:walk.contacts},run:{speed:run.nativeForwardSpeedEstimate,stride:run.nativeCycleDistanceEstimate,contacts:run.contacts},baseline:report.baselineRuntime,recommendation:report.recommendation},null,2));
