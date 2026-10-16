import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { measureNativeWeapon, loadNativeWeapon, weaponGripOffsets, attachAtPose, nativeWeaponCandidate, SHOTGUN_LANDMARK_CANDIDATE, NAILGUN_LANDMARK_CANDIDATE } from '../src/weapon-attachment.js';

const bytes = await fs.readFile(new URL('../models/weapon-shotgun.glb', import.meta.url));
const loader = new GLTFLoader();
// Node checks inspect the actual original GLB geometry. Texture decode is
// intentionally skipped because no browser image API is available here.
loader.register(() => ({ name: 'GeometryCheckWithoutTextureDecode', loadTexture: () => Promise.resolve(null) }));
const actual = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const nailgunBytes = await fs.readFile(new URL('../models/weapon-nailgun.glb', import.meta.url));
const actualNailgun = await loader.parseAsync(nailgunBytes.buffer.slice(nailgunBytes.byteOffset, nailgunBytes.byteOffset + nailgunBytes.byteLength), '');
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const pointNear = (actual, expected) => { for (const axis of ['x', 'y', 'z']) near(actual[axis], expected[axis]); };
const config = overrides => ({ ...SHOTGUN_LANDMARK_CANDIDATE, ...overrides });

test('candidate lookup requires the exact actual inventory entry and never borrows another weapon config', async () => {
  const inventory = await fs.readdir(new URL('../models/', import.meta.url));
  assert.equal(nativeWeaponCandidate('weapon-shotgun.glb', inventory), SHOTGUN_LANDMARK_CANDIDATE);
  assert.equal(nativeWeaponCandidate('weapon-shotgun.glb', new Set(inventory)), SHOTGUN_LANDMARK_CANDIDATE);
  assert.equal(nativeWeaponCandidate('weapon-shotgun.glb', []), null);
  assert.equal(nativeWeaponCandidate('weapon-shotgun.glb'), null);
  assert.equal(nativeWeaponCandidate('weapon-nailgun.glb', inventory), NAILGUN_LANDMARK_CANDIDATE);
  assert.notEqual(nativeWeaponCandidate('weapon-nailgun.glb', inventory), SHOTGUN_LANDMARK_CANDIDATE);
  assert.equal(nativeWeaponCandidate('weapon-nailgun.glb', []), null);
  assert.equal(nativeWeaponCandidate('weapon-nailgun-v2.glb', [...inventory, 'weapon-nailgun-v2.glb']), null, 'even a newly delivered file needs its own measured landmarks');
  assert.equal(nativeWeaponCandidate('unknown.glb', ['unknown.glb']), null);
  assert.equal(nativeWeaponCandidate('/models/weapon-shotgun.glb', inventory), null);
  assert.equal(nativeWeaponCandidate('../weapon-shotgun.glb', inventory), null);
  assert.equal(Object.isFrozen(nativeWeaponCandidate('weapon-shotgun.glb', inventory)), true);
});

test('actual compact nailgun has independent muzzle evidence, size and coupled-IK offsets', () => {
  const report = measureNativeWeapon(actualNailgun.scene);
  assert.equal(report.vertices, 17820); assert.equal(report.triangles, 11741); assert.equal(report.meshes, 1);
  assert.equal(report.longestAxis, 'x'); near(report.bounds.extent.x, 1.9031410217285156);
  near(report.sections[0].centroid.y, .4364745089920556);
  assert.ok(report.sections[0].extent.z < .10); assert.ok(report.sections[19].extent.z > .26);
  const weapon = loadNativeWeapon(actualNailgun, NAILGUN_LANDMARK_CANDIDATE);
  const offsets = weaponGripOffsets(weapon), scale = 14 / report.bounds.extent.x;
  near(offsets.scaledNativeLength, 14); near(offsets.supportOffset.z, .87 * scale);
  near(offsets.supportOffset.y, .36 * scale); near(offsets.muzzleOffset.z, 1.36 * scale);
  near(offsets.muzzleOffset.y, .595 * scale);
  assert.equal(weapon.config.confidence, 'candidate'); assert.match(weapon.config.landmarkEvidence, /manual mesh-region candidates/);
  const subject = new Group(); subject.rotation.y = Math.PI / 2; subject.updateMatrixWorld(true);
  const grip = new Vector3(0, 28, -3), support = grip.clone().add(new Vector3(offsets.supportOffset.x, offsets.supportOffset.y, offsets.supportOffset.z));
  const binding = attachAtPose(weapon, { subject, rightHand: subject.localToWorld(grip), leftHand: subject.localToWorld(support) });
  near(binding.gripError, 0); near(binding.supportError, 0); near(binding.aimErrorDegrees, 0);
  near(binding.game.forward.x, 1); near(binding.scaledNativeLength, 14); near(binding.gameHeight, 28 + .595 * scale);
});

test('actual shotgun GLB has measured X length and vertex-section evidence for stock and barrel', () => {
  const report = measureNativeWeapon(actual.scene);
  assert.equal(report.vertices, 13591); assert.equal(report.triangles, 11697); assert.equal(report.meshes, 1);
  assert.equal(report.longestAxis, 'x');
  near(report.bounds.min.x, -.9525410532951355); near(report.bounds.max.x, .950456976890564);
  near(report.bounds.extent.x, 1.9029980301856995);
  assert.ok(report.sections[19].min.y < -.21); assert.ok(report.sections[19].extent.z > .16);
  assert.ok(report.sections[0].centroid.y > .10); assert.ok(report.sections[0].extent.z < .10);
  assert.equal(SHOTGUN_LANDMARK_CANDIDATE.confidence, 'candidate', 'geometry inference is not silently approved');
});

test('a native weapon requires real geometry and explicit nondegenerate landmark axes', () => {
  assert.throws(() => loadNativeWeapon(null, config()), /actual-weapon/);
  assert.throws(() => loadNativeWeapon({ scene: new Group() }, config()), /empty-weapon/);
  assert.throws(() => loadNativeWeapon(actual, config({ forward: [0, 0, 0] })), /weapon-forward/);
  assert.throws(() => loadNativeWeapon(actual, config({ up: [-1, 0, 0] })), /degenerate/);
  assert.throws(() => loadNativeWeapon(actual, config({ gripPosition: [NaN, 0, 0] })), /grip-position/);
  assert.throws(() => loadNativeWeapon(actual, config({ gripPosition: undefined })), /grip-position/);
  assert.throws(() => loadNativeWeapon(actual, config({ supportPosition: [.47, -.03, 0] })), /degenerate/);
});

test('unrestricted two-hand fitting applies rigid rotation and one uniform scale under the already yawed parent', () => {
  const weapon = loadNativeWeapon(actual, config({ alignMode: 'hands', fitToHands: true, lengthWorld: undefined }));
  const subject = new Group(); subject.position.set(100, 0, 200); subject.rotation.y = Math.PI / 2; subject.updateMatrixWorld(true);
  const right = subject.localToWorld(new Vector3(2, 30, 3)), left = subject.localToWorld(new Vector3(2, 30, 10));
  const binding = attachAtPose(weapon, { subject, rightHand: right, leftHand: left });
  near(binding.gripError, 0); near(binding.supportError, 0); near(binding.uniformScale, 7 / .8);
  assert.equal(weapon.root.parent, subject); near(weapon.root.scale.x, weapon.root.scale.y); near(weapon.root.scale.y, weapon.root.scale.z);
  pointNear(binding.world.grip, right); pointNear(binding.world.support, left);
  near(binding.game.forward.x, 1); near(binding.game.forward.y, 0); near(binding.aimErrorDegrees, 0);
  assert.equal(actual.scene.parent, null, 'binding a clone does not reparent the imported source');
  let sourceMaterial, boundMaterial;
  actual.scene.traverse(object => { if (object.isMesh) sourceMaterial = object.material; });
  weapon.model.traverse(object => { if (object.isMesh) boundMaterial = object.material; });
  assert.equal(boundMaterial, sourceMaterial, 'the original GLB material and texture references are retained');
});

test('a reviewed-size preset preserves gameplay aim and right-hand contact while exposing the real left-hand mismatch', () => {
  const weapon = loadNativeWeapon(actual, config());
  const subject = new Group(); subject.rotation.y = Math.PI / 2;
  // These are the root's actual idle frame 0 hand measurements converted from
  // game axes back to THREE world axes, rather than invented ideal grips.
  const right = new Vector3(5.5367, 29.656, 1.2626), left = new Vector3(9.1798, 29.656, -.5829);
  const binding = attachAtPose(weapon, { subject, rightHand: right, leftHand: left });
  near(binding.scaledNativeLength, 22); near(binding.gripError, 0);
  near(binding.game.forward.x, 1); near(binding.game.forward.y, 0); near(binding.aimErrorDegrees, 0);
  assert.ok(binding.supportError > 5, 'the original four-world-unit hand pose cannot secretly fit a full-size gun');
  assert.equal(binding.config.confidence, 'candidate'); assert.equal(binding.scaleClamped, false);
  assert.ok(binding.gameHeight > 29.656, 'the actual barrel is above the grip by its measured native Y offset');
});

test('coupled IK offsets come from actual native landmarks and fixed weapon length before parent yaw', () => {
  const weapon = loadNativeWeapon(actual, config());
  const offsets = weaponGripOffsets(weapon);
  const scale = 22 / 1.9029980301856995;
  near(offsets.uniformScale, scale); near(offsets.scaledNativeLength, 22);
  near(offsets.supportOffset.x, 0); near(offsets.supportOffset.y, 0); near(offsets.supportOffset.z, .8 * scale);
  near(offsets.muzzleOffset.x, 0); near(offsets.muzzleOffset.y, .161 * scale); near(offsets.muzzleOffset.z, 1.41 * scale);
  assert.match(offsets.coordinates, /parent yaw not applied/);
  const subject = new Group(); subject.rotation.y = -.7; subject.updateMatrixWorld(true);
  const localGrip = new Vector3(0, 29, -2);
  const localSupport = localGrip.clone().add(new Vector3(offsets.supportOffset.x, offsets.supportOffset.y, offsets.supportOffset.z));
  const binding = attachAtPose(weapon, { subject, rightHand: subject.localToWorld(localGrip), leftHand: subject.localToWorld(localSupport) });
  near(binding.gripError, 0); near(binding.supportError, 0); near(binding.scaledNativeLength, 22);
});

test('restricted scale keeps one exact grip and reports support error instead of stretching the model or arm', () => {
  const weapon = loadNativeWeapon(actual, config({ alignMode: 'hands', fitToHands: true, lengthWorld: undefined, scaleRange: [3, 4] }));
  const subject = new Group(), right = new Vector3(0, 30, 0), left = new Vector3(0, 30, 8);
  const binding = attachAtPose(weapon, { subject, rightHand: right, leftHand: left });
  near(binding.requestedScale, 10); near(binding.uniformScale, 4);
  assert.equal(binding.scaleClamped, true); near(binding.gripError, 0); near(binding.supportError, 4.8);
  pointNear(right, new Vector3(0, 30, 0)); pointNear(left, new Vector3(0, 30, 8));
  const distorted = new Group(); distorted.scale.set(1, 2, 1);
  assert.throws(() => attachAtPose(weapon, { subject: distorted, rightHand: right, leftHand: left }), /nonuniform/);
});

test('repeated binding is deterministic and the actual body-only pass can hide the gun without losing its pose', () => {
  const weapon = loadNativeWeapon(actual, config()), subject = new Group();
  const right = new Vector3(1, 30, 2), left = new Vector3(1, 30, 11);
  const initial = attachAtPose(weapon, { subject, rightHand: right, leftHand: left });
  const before = JSON.stringify(initial), random = Math.random, now = Date.now;
  try {
    Math.random = () => { throw new Error('Binding must not consume randomness'); };
    Date.now = () => { throw new Error('Binding must not read wall time'); };
    weapon.root.visible = false;
    assert.equal(JSON.stringify(attachAtPose(weapon, { subject, rightHand: right, leftHand: left })), before);
    assert.equal(weapon.root.visible, false); weapon.root.visible = true;
  } finally { Math.random = random; Date.now = now; }
  assert.equal(initial.bodyAlphaIncludesWeapon, false);
});

test('normalized UI landmarks resolve against actual bounds and remain explicit manual configuration', () => {
  const weapon = loadNativeWeapon(actual, config({ landmarkCoordinates: 'bounds-normalized', gripPosition: [.75, .43, .5], supportPosition: [.33, .43, .5], muzzlePosition: [0, .80, .5], landmarkEvidence: 'Manual normalized UI trial; root has not approved.' }));
  near(weapon.raw.grip.x, -.9525410532951355 + 1.9029980301856995 * .75);
  assert.equal(weapon.config.landmarkEvidence, 'Manual normalized UI trial; root has not approved.');
  assert.throws(() => loadNativeWeapon(actual, config({ landmarkCoordinates: 'bounds-normalized', gripPosition: [1.1, .5, .5] })), /landmark/);
});
