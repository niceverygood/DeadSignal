import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import nodePath from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import { Group, Texture, Vector3 } from './meshy-sprite-baker/node_modules/three/build/three.module.js';
import { GLTFLoader } from './meshy-sprite-baker/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationSampler } from './meshy-sprite-baker/src/animation.js';

// Numeric source analysis. The JSON report is written unless --dry-run is set;
// runtime profiles are written only to an explicitly selected output path.
// Texture decoding is replaced, while geometry, skinning, interpolation,
// original animation tracks and exact runtime height normalization are retained.
const root = new URL('../', import.meta.url);
const rootPath=fileURLToPath(root);
const gameDir=nodePath.resolve(rootPath,process.env.DEAD_SIGNAL_GAME_DIR||'work/dead-signal-game/dist');
const {productionManifest}=await import(pathToFileURL(nodePath.join(gameDir,'production-manifest.js')));
const groundedDerived = process.argv.includes('--grounded');
const dryRun=process.argv.includes('--dry-run');
const profilesOutputIndex=process.argv.indexOf('--profiles-output');
if(profilesOutputIndex>=0&&(!process.argv[profilesOutputIndex+1]||process.argv[profilesOutputIndex+1].startsWith('--')))throw new Error('--profiles-output requires an explicit file path');
const requestedProfilesPath=profilesOutputIndex>=0?process.argv[profilesOutputIndex+1]:process.env.DEAD_SIGNAL_PROFILES_OUTPUT;
const profilesPath=requestedProfilesPath?nodePath.resolve(rootPath,requestedProfilesPath):null;
const sha = b => createHash('sha256').update(b).digest('hex');
const sourceHashes = {}, samples = 256;
const read = p => readFile(new URL(p, root));
async function immutableRead(p) { const b = await read(p); sourceHashes[p] = sha(b); return b; }
const vector = new Vector3();
const point = v => ({ x: v.x, y: v.y, z: v.z });
const models = [];
const characterManifest = JSON.parse(await immutableRead('outputs/dead-signal/production-assets/audits/2026-10-16/character-motion-manifest.json'));
const families = characterManifest.assets.filter(a => a.assetId !== 'survivor');
assert.equal(families.length, 19);

function regression(rows, bone, axis) {
  const n = rows.length, mx = rows.reduce((s, r) => s + r.time, 0) / n;
  const my = rows.reduce((s, r) => s + r.bones[bone][axis], 0) / n;
  const sxx = rows.reduce((s, r) => s + (r.time - mx) ** 2, 0);
  const sxy = rows.reduce((s, r) => s + (r.time - mx) * (r.bones[bone][axis] - my), 0);
  const slope = sxy / sxx, intercept = my - slope * mx;
  const sse = rows.reduce((s, r) => s + (r.bones[bone][axis] - slope * r.time - intercept) ** 2, 0);
  const syy = rows.reduce((s, r) => s + (r.bones[bone][axis] - my) ** 2, 0);
  return { slope, intercept, rSquared: syy ? 1 - sse / syy : 1,
    maxResidual: Math.max(...rows.map(r => Math.abs(r.bones[bone][axis] - slope * r.time - intercept))) };
}

function footVertices(sampler) {
  const sides = { Left: [], Right: [] };
  for (const mesh of sampler.skins) {
    const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    for (const side of Object.keys(sides)) {
      const ids = new Set(mesh.skeleton.bones.map((b, i) => b.name === `${side}Foot` || b.name === `${side}ToeBase` ? i : -1).filter(i => i >= 0));
      assert.ok(ids.size > 0, `${side} foot is missing`);
      const selected = [];
      for (let i = 0; i < indices.count; i++) {
        let weight = 0;
        for (let j = 0; j < 4; j++) if (ids.has(indices.getComponent(i, j))) weight += weights.getComponent(i, j);
        if (weight >= .5) selected.push(i);
      }
      if (selected.length) sides[side].push({ mesh, indices: selected });
    }
  }
  assert.ok(sides.Left.length && sides.Right.length, 'Foot-weighted geometry is required for actual sole minima.');
  return sides;
}

function skinnedFootMinimum(groups) {
  let y = Infinity, lowest = null;
  for (const { mesh, indices } of groups) for (const index of indices) {
    mesh.getVertexPosition(index, vector).applyMatrix4(mesh.matrixWorld);
    if (vector.y < y) { y = vector.y; lowest = point(vector); }
  }
  return { y, point: lowest };
}

for (const family of families) {
  const id = `${family.assetId}-rig-motion`, asset = productionManifest.assets[id];
  assert.ok(asset, id);
  const metadataPath = nodePath.relative(rootPath,nodePath.join(gameDir,'assets/production',asset.metadata)).split(nodePath.sep).join('/');
  const metadata = JSON.parse(await immutableRead(metadataPath));
  const path = groundedDerived ? `outputs/dead-signal/production-assets/models/${family.assetId}-grounded-locomotion-v1/model.glb` : `outputs/dead-signal/production-assets/${family.model}`;
  const bytes = await immutableRead(path);
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'numeric-analysis-texture-placeholder', loadTexture: () => Promise.resolve(new Texture()) }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const worldHeight = asset.worldHeight ?? metadata.projection.subjectHeight;
  const ratio = worldHeight / metadata.projection.subjectHeight;
  const normalize = new Group(), motion = new Group(), subject = new Group();
  const scale = metadata.source.scale * ratio, pivot = metadata.source.originPivot;
  normalize.scale.setScalar(scale);
  normalize.position.set(-pivot.x * scale, -pivot.y * scale, -pivot.z * scale);
  normalize.add(gltf.scene); motion.add(normalize); subject.add(motion);
  const sampler = new AnimationSampler({ root: gltf.scene, subject, motion, clips: gltf.animations, subjectHeight: worldHeight });
  sampler.updateSkinPose();
  const soles = footVertices(sampler);
  const footVertexCount = Object.fromEntries(Object.entries(soles).map(([side, groups]) => [side, groups.reduce((n, x) => n + x.indices.length, 0)]));
  const poses = [];
  for (const pose of ['walk', 'run']) {
    const clipName = groundedDerived ? (pose === 'walk' ? 'DS_GroundedWalk' : 'DS_GroundedRun') : (pose === 'walk' ? family.walkClip : family.runClip);
    const clipIndex = gltf.animations.findIndex(c => c.name === clipName), clip = gltf.animations[clipIndex];
    assert.ok(clip, clipName);
    const rows = [];
    const names = ['Hips', 'LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase'];
    for (let i = 0; i < samples; i++) {
      const time = clip.duration * i / samples;
      sampler.sample(clipIndex, time, { removeRootMotion: true });
      rows.push({ sample: i, time, bones: Object.fromEntries(names.map(name => {
        const bone = gltf.scene.getObjectByName(name); assert.ok(bone, name);
        return [name, point(bone.getWorldPosition(new Vector3()))];
      })) });
    }
    // Central stance windows of the unchanged walking/running source motion.
    // They exclude heel-strike/lift transitions. Joint origins are not outsoles;
    // independently evaluated skinned outsole minima below are separate evidence.
    const windows = pose === 'walk'
      ? [['LeftToeBase', 10 / 32, 25 / 32], ['RightToeBase', 2 / 32, 10 / 32], ['RightToeBase', 27 / 32, 31 / 32]]
      : [['LeftToeBase', 12 / 32, 16 / 32], ['RightToeBase', 26 / 32, 31 / 32]];
    const contacts = windows.map(([bone, start, end]) => {
      const subset = rows.filter(r => r.time >= start * clip.duration && r.time <= end * clip.duration);
      const x = regression(subset, bone, 'x'), z = regression(subset, bone, 'z');
      return { bone, phaseStart: start, phaseEnd: end, samples: subset.length,
        forwardSpeedForStationaryContact: -z.slope, nativeCycleDistance: -z.slope * clip.duration,
        regression: z, lateralSpeed: x.slope,
        contactJointHeight: { min: Math.min(...subset.map(r => r.bones[bone].y)), max: Math.max(...subset.map(r => r.bones[bone].y)) } };
    });
    const nativeSpeed = contacts.reduce((s, c) => s + c.forwardSpeedForStationaryContact * c.samples, 0) / contacts.reduce((s, c) => s + c.samples, 0);
    const soleSamples = [];
    for (let i = 0; i < 32; i++) {
      sampler.sample(clipIndex, clip.duration * i / 32, { removeRootMotion: true });
      const left = skinnedFootMinimum(soles.Left), right = skinnedFootMinimum(soles.Right);
      soleSamples.push({ sample: i, phase: i / 32, left, right, lowest: Math.min(left.y, right.y) });
    }
    const cycleDistance = nativeSpeed * clip.duration;
    poses.push({ pose, clip: clipName, duration: clip.duration, measuredCycleDistance: cycleDistance,
      sourceSpeedForStationaryContact: nativeSpeed, contacts,
      stanceLinearityMinimum: Math.min(...contacts.map(c => c.regression.rSquared)),
      footJointRows32: rows.filter((_, i) => i % 8 === 0), soleSamples32: soleSamples,
      soleLow32: soleSamples.map(s => s.lowest),
      minimumSole: Math.min(...soleSamples.map(s => s.lowest)), maximumSole: Math.max(...soleSamples.map(s => s.lowest)),
      rootMotion: sampler.describeRootMotion(clipIndex),
      baselineCycleDistance: Math.PI * 2 / .08,
      baselineCycleVersusMeasured: (Math.PI * 2 / .08) / cycleDistance,
      recommendedCycleDistance: cycleDistance,
      limitations: pose === 'run' ? ['Authored airborne phases are preserved. Never force every run frame sole minimum to zero.'] : [] });
  }
  const reelIndex = gltf.animations.findIndex(c => c.name === metadata.animation.name);
  assert.ok(reelIndex >= 0);
  const reelWalkSamples = [];
  for (let i = 0; i < 8; i++) {
    // Exact sampling of the already published v027/v028 reel, not an estimate
    // reconstructed from its low resolution PNG.
    const sample = 4 + i;
    sampler.sample(reelIndex, gltf.animations[reelIndex].duration * sample / 32, { removeRootMotion: false, once: false });
    const left = skinnedFootMinimum(soles.Left), right = skinnedFootMinimum(soles.Right);
    reelWalkSamples.push({ sample, left, right, lowest: Math.min(left.y, right.y) });
  }
  models.push({ id: family.assetId, assetId: id, sourceModel: path, sourceSha256: sha(bytes), metadataPath,
    baseWorldHeight: worldHeight, metadataHeight: metadata.projection.subjectHeight, normalizationScale: scale,
    radiusScaleRule: 'Runtime uses clamp(actor.r / referenceRadius, .72, 1.65). Multiply cycle distances and sole offsets by the same visual scale.',
    nativeForwardAxis: '+Z before yaw; visible yaw = pi/2 - actor.angle', footVertexCount, poses,
    publishedReelWalkSoleLow8: reelWalkSamples.map(s => s.lowest), publishedReelWalkSoleSamples: reelWalkSamples });
  sampler.mixer.stopAllAction();
  console.log(JSON.stringify({ id: family.assetId, worldHeight, footVertexCount, poses: poses.map(p => ({pose:p.pose,cycle:p.measuredCycleDistance,minimumLinearity:p.stanceLinearityMinimum,sole:[p.minimumSole,p.maximumSole]})) }));
}

const finalBosses = [];
for (let i = 1; i <= 12; i++) {
  const id = `boss-${String(i).padStart(2, '0')}-final`, asset = productionManifest.assets[`${id}-rig-motion`];
  const metadataPath = nodePath.relative(rootPath,nodePath.join(gameDir,'assets/production',asset.metadata)).split(nodePath.sep).join('/');
  const m = JSON.parse(await immutableRead(metadataPath));
  const worldHeight = asset.worldHeight ?? m.projection.subjectHeight;
  const bounds = m.source.originalBounds, nativeHeight = bounds.max[1] - bounds.min[1];
  const bodyDepth = (bounds.max[2] - bounds.min[2]) * worldHeight / nativeHeight;
  const bodyWidth = (bounds.max[0] - bounds.min[0]) * worldHeight / nativeHeight;
  const provenancePath = `outputs/dead-signal/production-assets/models/${id}-motion-v1/rig-provenance.json`;
  const provenance = JSON.parse(await immutableRead(provenancePath));
  const approximateCycleDistance = Math.max(worldHeight * .65, Math.min(worldHeight * 1.15, bodyDepth));
  const modelPath = `outputs/dead-signal/production-assets/models/${id}-motion-v1/model.glb`;
  const bytes = await immutableRead(modelPath), loader = new GLTFLoader();
  loader.register(() => ({ name: 'numeric-analysis-texture-placeholder', loadTexture: () => Promise.resolve(new Texture()) }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const normalize = new Group(), motion = new Group(), subject = new Group();
  const scale = m.source.scale * worldHeight / m.projection.subjectHeight, pivot = m.source.originPivot;
  normalize.scale.setScalar(scale); normalize.position.set(-pivot.x * scale, -pivot.y * scale, -pivot.z * scale);
  normalize.add(gltf.scene); motion.add(normalize); subject.add(motion);
  const sampler = new AnimationSampler({root:gltf.scene, subject, motion, clips:gltf.animations, subjectHeight:worldHeight});
  const walkIndex = gltf.animations.findIndex(c => c.name === 'DS_walk'); assert.ok(walkIndex >= 0);
  const meshes = []; gltf.scene.traverse(mesh => { if(mesh.isMesh) meshes.push(mesh); });
  const skinnedMinimum32 = [];
  for(let sample=0; sample<32; sample++) {
    sampler.sample(walkIndex,gltf.animations[walkIndex].duration*sample/32,{removeRootMotion:false,once:false});
    let lowest=Infinity;
    for(const mesh of meshes) for(let vertex=0; vertex<mesh.geometry.getAttribute('position').count; vertex++) {
      mesh.getVertexPosition(vertex,vector).applyMatrix4(mesh.matrixWorld); lowest=Math.min(lowest,vector.y);
    }
    skinnedMinimum32.push(lowest);
  }
  sampler.mixer.stopAllAction();
  finalBosses.push({ id, assetId: `${id}-rig-motion`, metadataPath, provenancePath,
    modelPath, sourceSha256:sha(bytes), baseWorldHeight: worldHeight, bodyDepth, bodyWidth, limbs: { arms: provenance.arms, legs: provenance.legs },
    method: 'Explicit visual-cadence approximation from body depth and height; NOT a planted-foot measurement.',
    approximateCycleDistance, rule: 'max(baseWorldHeight*.65, min(baseWorldHeight*1.15, normalizedBodyDepth)); multiply by runtime radius scale',
    sourceMotionLimitation: 'Regional limb rig uses sinusoidal leg translations with amplitude 3.2% of depth, without a constant-backward-speed planted stance. Existing source cannot support an honest stationary-contact regression.',
    actualAnatomicalFootLock: false, actualSkinnedMinimum32:skinnedMinimum32,
    groundingMeasurement:'All deformed mesh vertices evaluated at 32 exact DS_walk phases. Lowest geometry is measured; anatomical contact-patch classification is not claimed.' });
}

for (const [path, hash] of Object.entries(sourceHashes)) assert.equal(sha(await read(path)), hash, `Source changed during read-only measurement: ${path}`);
const report = { format: 'dead-signal-enemy-locomotion-diagnosis-v1', createdAt: new Date().toISOString(), groundedDerived,
  method: '19 original weighted humanoid rigs sampled with production AnimationSampler at 256 phases per walk/run clip. Toe-origin central stance regressions estimate root travel per gait cycle; actual skinned foot-weighted geometry gives 32 phase outsole minima. Exact catalog normalization and runtime base height applied. Twelve regional final boss rigs use explicitly labeled cadence approximations only.',
  source: nodePath.relative(rootPath,gameDir).split(nodePath.sep).join('/'),
  sourceMotionRevision:productionManifest.motionRevision||null,
  measuredHumanoids: models.length, approximateFinalBosses: finalBosses.length,
  simulationChanges: false, modelChanges: false, imageChanges: false, paidRequests: false,
  baseline: { gaitPhasePerWorldUnit: .08, sameCycleDistanceForEveryActor: Math.PI * 2 / .08,
    actionReelWalkSamples: 8, issue: 'All 31 enemy forms share a 78.54 world-unit cycle despite different real contact strides. Reels also contain only eight walk samples and replace locomotion with full-body hit/attack poses.' },
  units: { ground: 'source XZ before yaw maps to game XY', vertical: 'source Y maps to game height', normalizedHeightIncludesRuntimeWorldHeight: true,
    soleVertexSelection: 'All geometry vertices whose combined Left/RightFoot and ToeBase skin influence >= .5. Exact deformed world minimum; no inference from image alpha.',
    toeRegressionLimitation: 'Joint origins are inside feet, not contact-patch centroids; central stance estimates have finite residuals. This is numeric source evidence, not rendered gameplay feel approval.' },
  models, finalBosses, sourceHashes,
  integrationRecommendations: ['Use measured individual cycle distance times the same visual radius scale as renderer, driven by actual displacement rather than wall-clock time.',
    'Native walk and run should retain 32 poses; select run only when actual displacement speed warrants it. Preserve authored running flight.',
    'Use foot-weighted minima only for source-specific walking floor placement, not attacks/death or arbitrary other GLBs.',
    'Smooth facing visually over time with bounded angular velocity, preserving combat facing/skill timing/collision state.',
    'Retain moving lower-body gait during ordinary hit/contact fire when full-body action would lock the feet. Preserve windup, skill attack and death readability.'],
  limitations: ['No native strafe animation added; all measured humanoid sources are forward gait only.',
    'Final boss approximate cadence improves pacing without claiming anatomical stride or foot locking.',
    'No browser approval, benchmark, runtime implementation, physics or balance change performed by this diagnostic.'] };
const output = groundedDerived ? 'outputs/dead-signal/production-assets/qa/enemy-grounded-locomotion-diagnosis-20261016.json' : 'outputs/dead-signal/production-assets/qa/enemy-locomotion-diagnosis-20261016.json';
if(!dryRun){
  await mkdir(new URL('outputs/dead-signal/production-assets/qa/', root), {recursive: true});
  await writeFile(new URL(output, root), JSON.stringify(report, null, 2) + '\n');
}
const profiles = {};
for(const model of models) {
  const pose=model.id==='enemy-runner'?'run':'walk', measured=model.poses.find(p=>p.pose===pose);
  const maxCorrectionRange = measured.maximumSole - measured.minimumSole;
  profiles[model.id] = { cycleDistance:measured.measuredCycleDistance, subjectHeight:model.baseWorldHeight,
    pose, sourceClip:measured.clip, duration:measured.duration, soleHeights:measured.soleLow32,
    grounding:pose==='run'?'preserve-flight':groundedDerived?'authored-leg-ik':'measured-skinned-minimum',
    groundingBaseline:pose==='run'?measured.minimumSole:0,
    strideMethod:'measured-central-stance-toe-regression', strideMeasured:true,
    stanceLinearityMinimum:measured.stanceLinearityMinimum,
    sourceRetargetConcern:measured.minimumSole < -model.baseWorldHeight*.04 || (pose!=='run'&&maxCorrectionRange > model.baseWorldHeight*.06),
    authoredLegCorrection:groundedDerived,
    measuredSoleRange:[measured.minimumSole,measured.maximumSole],
    groundingNote:pose==='run'?'Constant minimum source sole offset only; retain every authored flight phase. Never apply per-frame sole correction to run.':
      'Per-frame sole heights are exact source values. Limit correction changes to avoid moving whole body to conceal poor original single-leg retargeting.',
    referenceRadiusScale:'Multiply cycleDistance, subjectHeight, and grounding by renderer visual radius scale (.72..1.65).',
    evidence:output.replace('outputs/dead-signal/','') };
}
for(const model of finalBosses) profiles[model.id]={cycleDistance:model.approximateCycleDistance,subjectHeight:model.baseWorldHeight,
  pose:'walk',sourceClip:'DS_walk',soleHeights:model.actualSkinnedMinimum32,grounding:'measured-skinned-box-minimum',groundingBaseline:0,
  strideMethod:'approximate-body-depth-cadence',strideMeasured:false,
  strideApproximationRule:model.rule,actualAnatomicalFootLock:false,
  groundingNote:'Actual full deformed geometry minima are measured; do not infer anatomical contact or increase correction past a small fraction of body height.',
  referenceRadiusScale:'Multiply cycleDistance, subjectHeight, and grounding by renderer visual radius scale (.72..1.65).',
  evidence:'production-assets/qa/enemy-locomotion-diagnosis-20261016.json'};
assert.equal(Object.keys(profiles).length,31);
if(profilesPath&&!dryRun){
  await mkdir(nodePath.dirname(profilesPath),{recursive:true});
  await writeFile(profilesPath,'// Read-only source measurements; no model, texture, gameplay balance or physics changes.\n// Humanoid strides are actual central-stance measurements. Regional final boss cadence\n// is explicitly approximate. Original retargeting faults are flagged, not hidden.\nexport const ENEMY_MOTION_PROFILES = '+JSON.stringify(profiles,null,2)+';\n');
}
console.log(JSON.stringify({ output, humanoids: models.length, approximateFinalBosses: finalBosses.length,
  profilesPath:profilesPath?nodePath.relative(rootPath,profilesPath).split(nodePath.sep).join('/'):null,
  gameDir:nodePath.relative(rootPath,gameDir).split(nodePath.sep).join('/'),dryRun,reportWritten:!dryRun,profilesWritten:!!profilesPath&&!dryRun,
  walkCycleRange: [Math.min(...models.map(m => m.poses[0].measuredCycleDistance)),Math.max(...models.map(m => m.poses[0].measuredCycleDistance))],
  runCycleRange: [Math.min(...models.map(m => m.poses[1].measuredCycleDistance)),Math.max(...models.map(m => m.poses[1].measuredCycleDistance))] }));
