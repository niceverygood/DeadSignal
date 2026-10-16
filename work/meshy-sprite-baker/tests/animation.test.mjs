import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Group, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationSampler, sampleTime } from '../src/animation.js';
import { fitProjection, modelRotation, projectWorld } from '../src/atlas.js';
import { applyWeaponReadyPose } from '../src/weapon-pose.js';
import { loadNativeWeapon, weaponGripOffsets, attachAtPose, SHOTGUN_LANDMARK_CANDIDATE } from '../src/weapon-attachment.js';

async function realModel(file) {
  const bytes = await readFile(new URL(`../models/${file}`, import.meta.url));
  const loader = new GLTFLoader();
  // CPU-only geometry/rig tests skip JPEG decoding. The actual GLB geometry,
  // skin weights, bones and animation data are parsed unmodified. Browser
  // previews continue to load the real embedded baseColor image normally.
  loader.register(() => ({ name: 'CPU-analysis-skip-JPEG-decode', loadTexture: () => Promise.resolve(new Texture()) }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const original = new Box3().setFromObject(root, true);
  const center = original.getCenter(new Vector3());
  const scale = 44 / (original.max.y - original.min.y);
  const normalize = new Group();
  normalize.scale.setScalar(scale);
  normalize.position.set(-center.x * scale, -original.min.y * scale, -center.z * scale);
  normalize.add(root);
  const motion = new Group(), subject = new Group();
  motion.add(normalize); subject.add(motion);
  const sampler = new AnimationSampler({ root, subject, motion, clips: gltf.animations, subjectHeight: 44 });
  sampler.updateSkinPose();
  return { gltf, sampler, root, subject, motion, scale };
}

const vertex = (mesh, index) => mesh.localToWorld(mesh.getVertexPosition(index, new Vector3()));
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('all three real Meshy files have a 24-bone rig and correct +Z rest facing', async t => {
  for (const [file, expected, duration] of [
    ['survivor-v2-rig.glb', 'Armature|clip0|baselayer', .033333335],
    ['survivor-v2-walk.glb', 'Armature|walking_man|baselayer', 1.066666603],
    ['survivor-v2-run.glb', 'Armature|running|baselayer', .666666687],
  ]) {
    const { gltf, sampler } = await realModel(file);
    assert.equal(sampler.skins.length, 1);
    assert.equal(sampler.skins[0].skeleton.bones.length, 24);
    assert.equal(sampler.skins[0].geometry.attributes.position.count, 36380);
    assert.equal(gltf.animations.length, 1); assert.equal(gltf.animations[0].name, expected);
    near(gltf.animations[0].duration, duration);
    const forward = sampler.restForward();
    assert.ok(Math.abs(forward[0]) < 1e-5 && Math.abs(forward[1]) < 1e-5 && forward[2] > .99999);
    const rootMotion = sampler.describeRootMotion(0);
    t.diagnostic(`${file}: duration ${gltf.animations[0].duration.toFixed(6)}s, root XZ travel ${Math.hypot(rootMotion.delta.x, rootMotion.delta.z).toFixed(6)} world units, significant=${rootMotion.significant}`);
    assert.equal(rootMotion.significant, false, 'actual clips are in-place; keep natural hip sway');
  }
});

test('real walk/run skins deform and fit all directions using current-pose bounds, not the static T-pose hull', async t => {
  for (const file of ['survivor-v2-walk.glb', 'survivor-v2-run.glb']) {
    const { gltf, sampler, subject } = await realModel(file);
    const mesh = sampler.skins[0], clip = gltf.animations[0];
    const rest = new Box3().setFromObject(subject, true);
    sampler.sample(0, 0);
    const first = [];
    for (let index = 0; index < mesh.geometry.attributes.position.count; index += 97) first.push(vertex(mesh, index));
    sampler.sample(0, clip.duration * .25);
    const changed = first.map((point, order) => point.distanceTo(vertex(mesh, order * 97)));
    assert.ok(changed.filter(distance => distance > .1).length > 50, 'real skinned limbs must change pose');
    const moving = new Box3().setFromObject(subject, true);
    assert.ok(Math.abs(moving.max.x - moving.min.x - (rest.max.x - rest.min.x)) > 2, 'animated arms differ from static T-pose hull');
    const boxes = [];
    for (let direction = 0; direction < 16; direction++) {
      subject.rotation.y = modelRotation(direction * Math.PI / 8);
      for (let sample = 0; sample < 8; sample++) {
        sampler.sample(0, sampleTime(clip, sample, 8));
        boxes.push(new Box3().setFromObject(subject, true));
      }
    }
    const fit = fitProjection(boxes, 256, 24);
    for (let direction = 0; direction < 16; direction++) {
      subject.rotation.y = modelRotation(direction * Math.PI / 8);
      for (let sample = 0; sample < 8; sample++) {
        sampler.sample(0, sampleTime(clip, sample, 8));
        for (let index = 0; index < mesh.geometry.attributes.position.count; index += 97) {
          const point = vertex(mesh, index), projected = projectWorld(point.x, point.z, point.y);
          const x = fit.pivot.x + projected.x * fit.density, y = fit.pivot.y + projected.y * fit.density;
          assert.ok(x >= 24 - 1e-5 && x <= 232 + 1e-5 && y >= 24 - 1e-5 && y <= 232 + 1e-5);
        }
      }
    }
    t.diagnostic(`${file}: ${boxes.length} actual skinned pose/direction bounds fit one pivot ${fit.pivot.x.toFixed(2)},${fit.pivot.y.toFixed(2)} and density ${fit.density.toFixed(4)}`);
  }
});

test('weapon-ready IK on actual walk/run meets both grips while preserving original lower-body motion and joint lengths', async t => {
  for (const file of ['survivor-v2-walk.glb', 'survivor-v2-run.glb']) {
    const { gltf, sampler, subject, root } = await realModel(file);
    const clip = gltf.animations[0];
    const feet = [];
    for (let sample = 0; sample < 8; sample++) {
      subject.rotation.y = modelRotation(sample * Math.PI / 4);
      sampler.sample(0, sampleTime(clip, sample, 8));
      const saved = ['Hips', 'LeftLeg', 'LeftFoot', 'RightLeg', 'RightFoot'].map(name => root.getObjectByName(name).getWorldPosition(new Vector3()));
      const jointPositions = ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'].map(name => root.getObjectByName(name).position.clone());
      const result = applyWeaponReadyPose({ root, subject });
      sampler.updateSkinPose();
      assert.equal(result.supported, true);
      assert.equal(result.right.clamped, false); assert.equal(result.left.clamped, false);
      assert.ok(result.right.error < .001 && result.left.error < .001);
      assert.ok(result.right.position.y > 22 && result.right.position.y < 35.2, 'grips stay in the reachable upper-body band during gait bob');
      assert.ok(result.left.position.z > result.right.position.z);
      saved.forEach((position, index) => near(root.getObjectByName(['Hips', 'LeftLeg', 'LeftFoot', 'RightLeg', 'RightFoot'][index]).getWorldPosition(new Vector3()).distanceTo(position), 0));
      jointPositions.forEach((position, index) => near(root.getObjectByName(['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'][index]).position.distanceTo(position), 0));
      const foot = subject.worldToLocal(root.getObjectByName('LeftFoot').getWorldPosition(new Vector3()));
      feet.push(foot);
      assert.deepEqual(sampler.motion.position.toArray(), [0, 0, 0]);
      const fixedOrigin = subject.localToWorld(new Vector3());
      assert.deepEqual(projectWorld(fixedOrigin.x, fixedOrigin.z, fixedOrigin.y), { x: 0, y: 0 });
      t.diagnostic(`${file} sample ${sample}: gripY ${result.right.position.y.toFixed(3)}, hand error ${Math.max(result.left.error, result.right.error).toFixed(6)}; lower-body untouched`);
    }
    assert.ok(feet.some(point => point.distanceTo(feet[0]) > 1), 'real feet continue walking/running while the atlas origin remains fixed');
  }
});

test('unreachable requested height is reported without stretching the real rig; neutral-pose IK never accumulates', async () => {
  const { sampler, subject, root } = await realModel('survivor-v2-walk.glb');
  sampler.sample(null, 0);
  const first = applyWeaponReadyPose({ root, subject });
  sampler.updateSkinPose();
  const firstHand = root.getObjectByName('RightHand').getWorldPosition(new Vector3());
  sampler.sample(null, 0);
  const second = applyWeaponReadyPose({ root, subject });
  sampler.updateSkinPose();
  near(root.getObjectByName('RightHand').getWorldPosition(new Vector3()).distanceTo(firstHand), 0);
  near(first.right.position.y, second.right.position.y);
  sampler.sample(0, 0);
  const impossible = applyWeaponReadyPose({ root, subject, gripHeight: 22 });
  assert.ok(impossible.left.clamped || impossible.right.clamped);
  assert.ok(impossible.left.error > .1 || impossible.right.error > .1);
  assert.equal(impossible.weaponGeometryAdded, false);
  assert.equal(impossible.fingerRig, false);
});

test('loop/reset/one-shot sampling on a real rig is repeatable across directions', async () => {
  const { gltf, sampler, subject } = await realModel('survivor-v2-walk.glb');
  const mesh = sampler.skins[0], clip = gltf.animations[0];
  sampler.sample(0, 0);
  const initial = [0, 1000, 8000, 20000].map(index => vertex(mesh, index));
  sampler.sample(0, clip.duration * .7);
  sampler.sample(0, clip.duration);
  [0, 1000, 8000, 20000].forEach((index, order) => near(vertex(mesh, index).distanceTo(initial[order]), 0));
  const attack = clip.clone(); attack.name = 'attack-one-shot';
  sampler.clips.push(attack);
  near(sampleTime(attack, 7, 8), attack.duration);
  assert.ok(sampleTime(clip, 7, 8) < clip.duration);
  sampler.sample(1, attack.duration);
  sampler.sample(1, 0);
  [0, 1000, 8000, 20000].forEach((index, order) => near(vertex(mesh, index).distanceTo(initial[order]), 0));
  subject.rotation.y = modelRotation(Math.PI / 2);
  sampler.sample(0, clip.duration * .25);
  const rotated = new Box3().setFromObject(subject, true);
  sampler.sample(0, clip.duration * .75);
  sampler.sample(0, clip.duration * .25);
  const repeated = new Box3().setFromObject(subject, true);
  near(rotated.min.distanceTo(repeated.min), 0); near(rotated.max.distanceTo(repeated.max), 0);
});

test('net root travel compensation on the real rig removes game-duplicate locomotion while preserving vertical bob', async () => {
  const { gltf, sampler, scale } = await realModel('survivor-v2-walk.glb');
  const traveling = gltf.animations[0].clone(); traveling.name = 'walking-forward-validation';
  const track = traveling.tracks.find(track => track.name === 'Hips.position');
  assert.ok(track);
  const last = track.times[track.times.length - 1];
  for (let index = 0; index < track.times.length; index++) track.values[index * 3 + 2] += 100 * track.times[index] / last;
  sampler.clips.push(traveling);
  const descriptor = sampler.describeRootMotion(1);
  assert.equal(descriptor.significant, true);
  const expectedTravel = scale * (last - track.times[0]) / last;
  assert.ok(Math.abs(descriptor.delta.z - expectedTravel) < .01, `travel uses the actual root track first/last times: ${JSON.stringify({ descriptor, expectedTravel })}`);
  sampler.sample(1, 0, { removeRootMotion: false, once: true });
  const start = sampler.rootPosition();
  sampler.sample(1, traveling.duration, { removeRootMotion: false, once: true });
  const without = sampler.rootPosition();
  assert.ok(without.z - start.z > 20);
  const result = sampler.sample(1, traveling.duration, { removeRootMotion: true, once: true });
  assert.equal(result.rootMotionRemoved, true);
  const compensated = sampler.rootPosition();
  near(compensated.x, start.x); near(compensated.z, start.z);
  near(compensated.y, without.y);
  sampler.sample(0, traveling.duration * .25, { removeRootMotion: true });
  assert.deepEqual(sampler.motion.position.toArray(), [0, 0, 0], 'in-place clip does not remove natural side sway');
});

test('actual shotgun with coupled IK matches both hands across sixteen directions and preserves real barrel forward/muzzle height', async t => {
  const bytes = await readFile(new URL('../models/weapon-shotgun.glb', import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'CPU-analysis-skip-JPEG-decode', loadTexture: () => Promise.resolve(new Texture()) }));
  const weaponGLTF = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  for (const file of ['survivor-v2-walk.glb', 'survivor-v2-run.glb']) {
    const { gltf, sampler, root, subject } = await realModel(file);
    const weapon = loadNativeWeapon(weaponGLTF, SHOTGUN_LANDMARK_CANDIDATE);
    subject.add(weapon.root);
    const offsets = weaponGripOffsets(weapon);
    let minimumY = Infinity, maximumY = -Infinity, maximumError = 0;
    for (let direction = 0; direction < 16; direction++) for (let sample = 0; sample < 8; sample++) {
      const angle = direction * Math.PI / 8;
      subject.rotation.y = modelRotation(angle);
      sampler.sample(0, sampleTime(gltf.animations[0], sample, 8));
      const before = root.getObjectByName('LeftFoot').getWorldPosition(new Vector3());
      const pose = applyWeaponReadyPose({ root, subject, supportOffset: offsets.supportOffset });
      assert.equal(pose.coupledSupport.reachable, true, `${file} ${sample} must reach the actual foreend`);
      assert.equal(pose.right.clamped, false); assert.equal(pose.left.clamped, false);
      sampler.updateSkinPose();
      const attachment = attachAtPose(weapon, { subject, rightHand: root.getObjectByName('RightHand'), leftHand: root.getObjectByName('LeftHand') });
      near(root.getObjectByName('LeftFoot').getWorldPosition(new Vector3()).distanceTo(before), 0);
      maximumError = Math.max(maximumError, attachment.gripError, attachment.supportError);
      assert.ok(attachment.gripError < .001 && attachment.supportError < .001);
      near(attachment.game.forward.x, Math.cos(angle)); near(attachment.game.forward.y, Math.sin(angle));
      near(attachment.scaledNativeLength, 22);
      assert.ok(attachment.game.muzzle.z > pose.right.position.y, 'actual barrel rises above its grip landmark');
      minimumY = Math.min(minimumY, attachment.game.muzzle.z); maximumY = Math.max(maximumY, attachment.game.muzzle.z);
      assert.equal(attachment.bodyAlphaIncludesWeapon, false);
    }
    t.diagnostic(`${file}: 16x8 actual-shotgun attachments, max grip/support error ${maximumError.toFixed(6)}, muzzle Y ${minimumY.toFixed(3)}..${maximumY.toFixed(3)}`);
  }
});
