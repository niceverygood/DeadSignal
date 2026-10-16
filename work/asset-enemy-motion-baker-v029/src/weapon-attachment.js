import { Group, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';

const finite = Number.isFinite;
const positive = value => finite(value) && value > 0;
const axes = ['x', 'y', 'z'];
const plain = vector => ({ x: vector.x, y: vector.y, z: vector.z });
const game = vector => ({ x: vector.x, y: vector.z, z: vector.y });
function freezeTree(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}
function vector(value, label) {
  if (Array.isArray(value) ? value.length !== 3 || !value.every(finite) : !value || !axes.every(axis => finite(value[axis]))) throw new Error(`invalid-${label}`);
  const point = Array.isArray(value) ? new Vector3(...value) : new Vector3(value?.x, value?.y, value?.z);
  return point;
}
function unit(value, label) {
  const point = vector(value, label);
  if (point.lengthSq() < 1e-12) throw new Error(`invalid-${label}`);
  return point.normalize();
}

// This is a measured-geometry candidate, not an approved visual binding.
// +X has the broad low stock; -X has the upper, round barrel cap. Native point
// landmarks still require the actual textured attachment preview to approve.
export const SHOTGUN_LANDMARK_CANDIDATE = freezeTree({
  forward: [-1, 0, 0], up: [0, 1, 0],
  gripPosition: [.47, -.03, 0], supportPosition: [-.33, -.03, 0],
  muzzlePosition: [-.94, .131, 0], landmarkCoordinates: 'model-space',
  fitToHands: false, alignMode: 'aim', lengthWorld: 22,
  confidence: 'candidate',
  landmarkEvidence: 'Actual shotgun GLB vertex sections: stock +X extends to y=-.2197; barrel -X tip is centered near y=.131. Grip/foreend coordinates are manual candidates awaiting textured preview.',
});

// Entries are added only after inspecting the corresponding original GLB.
// A selected filename or a future model name is not geometric evidence.
export const NAILGUN_LANDMARK_CANDIDATE = freezeTree({
  forward: [-1, 0, 0], up: [0, 1, 0],
  gripPosition: [.42, -.16, 0], supportPosition: [-.45, .20, 0],
  muzzlePosition: [-.94, .435, 0], landmarkCoordinates: 'model-space',
  fitToHands: false, alignMode: 'aim', lengthWorld: 14,
  confidence: 'candidate',
  landmarkEvidence: 'Actual nailgun GLB SHA256 3b802b120cc9ff51771c7a9f7ca687a7acd679d10d9015902456a9694c1f1d1c; 17820 vertices/11741 triangles. X extent 1.903141; -X tip section is narrow (Z .093644) at Y .436475, +X rear housing is broad (Z .265678). Original canonical image agrees muzzle -X/top +Y. Grip (.42,-.16,0) and underside support (-.45,.20,0) are manual mesh-region candidates, not approved attachment contacts; textured pose review is required.',
});

const measuredCandidates = freezeTree({
  'weapon-shotgun.glb': SHOTGUN_LANDMARK_CANDIDATE,
  'weapon-nailgun.glb': NAILGUN_LANDMARK_CANDIDATE,
});

/** Return a measured candidate only for an exact local inventory entry.
 * The browser UI supplies its actual model list; this pure lookup never loads
 * a file, substitutes another weapon's landmarks, or implies visual approval.
 * Unmeasured models remain null even when their file has just arrived. */
export function nativeWeaponCandidate(modelName, availableModels) {
  if (typeof modelName !== 'string' || !/^[a-zA-Z0-9_-]+\.glb$/.test(modelName)) return null;
  const inventory = availableModels instanceof Set ? availableModels : Array.isArray(availableModels) ? new Set(availableModels) : null;
  return inventory?.has(modelName) ? measuredCandidates[modelName] || null : null;
}

/** Inspect imported vertex positions in gltf.scene-local coordinates. */
export function measureNativeWeapon(root, { binCount = 20 } = {}) {
  if (!root?.isObject3D || !Number.isInteger(binCount) || binCount < 4 || binCount > 64) throw new Error('invalid-weapon-geometry');
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), points = [], min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  const point = new Vector3(); let meshes = 0, triangles = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    if (object.isSkinnedMesh) throw new Error('weapon-must-be-rigid');
    const position = object.geometry?.attributes?.position;
    if (!position) return;
    meshes++; triangles += (object.geometry.index?.count || position.count) / 3;
    const transform = new Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).applyMatrix4(transform);
      if (!axes.every(axis => finite(point[axis]))) throw new Error('invalid-weapon-vertex');
      min.min(point); max.max(point); points.push(point.clone());
    }
  });
  if (!points.length) throw new Error('empty-weapon-geometry');
  const extent = max.clone().sub(min);
  const longestAxis = axes.reduce((winner, axis) => extent[axis] > extent[winner] ? axis : winner, 'x');
  if (!positive(extent[longestAxis])) throw new Error('empty-weapon-extent');
  const sections = Array.from({ length: binCount }, (_, index) => ({ index, count: 0, min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity), sum: new Vector3() }));
  for (const point of points) {
    const index = Math.min(binCount - 1, Math.floor((point[longestAxis] - min[longestAxis]) / extent[longestAxis] * binCount));
    const section = sections[index]; section.count++; section.min.min(point); section.max.max(point); section.sum.add(point);
  }
  return freezeTree({
    coordinates: 'gltf.scene-local; actual imported vertex positions',
    meshes, vertices: points.length, triangles, longestAxis,
    bounds: { min: plain(min), max: plain(max), extent: plain(extent) },
    sections: sections.map(section => section.count ? { index: section.index, count: section.count, min: plain(section.min), max: plain(section.max), extent: plain(section.max.clone().sub(section.min)), centroid: plain(section.sum.divideScalar(section.count)) } : { index: section.index, count: 0 }),
  });
}

function landmark(value, geometry, coordinates, label) {
  const point = vector(value, label);
  if (coordinates === 'model-space') return point;
  if (coordinates !== 'bounds-normalized' || axes.some(axis => point[axis] < 0 || point[axis] > 1)) throw new Error('invalid-landmark-coordinates');
  return new Vector3(...axes.map(axis => geometry.bounds.min[axis] + geometry.bounds.extent[axis] * point[axis]));
}

function lengthAlongForward(root, forward) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), point = new Vector3();
  let low = Infinity, high = -Infinity;
  root.traverse(object => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    const positions = object.geometry.attributes.position, transform = new Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    for (let index = 0; index < positions.count; index++) {
      const coordinate = point.fromBufferAttribute(positions, index).applyMatrix4(transform).dot(forward);
      low = Math.min(low, coordinate); high = Math.max(high, coordinate);
    }
  });
  if (!positive(high - low)) throw new Error('empty-weapon-forward-extent');
  return high - low;
}

/** Receive an actual GLTFLoader result; no placeholder mesh is ever created. */
export function loadNativeWeapon(gltf, config) {
  if (!gltf?.scene?.isObject3D || !config || typeof config !== 'object') throw new Error('actual-weapon-and-config-required');
  const geometry = measureNativeWeapon(gltf.scene);
  const coordinates = config.landmarkCoordinates || 'model-space';
  const raw = {
    grip: landmark(config.gripPosition, geometry, coordinates, 'grip-position'),
    support: landmark(config.supportPosition, geometry, coordinates, 'support-position'),
    muzzle: landmark(config.muzzlePosition, geometry, coordinates, 'muzzle-position'),
    forward: unit(config.forward, 'weapon-forward'), up: unit(config.up, 'weapon-up'),
  };
  if (raw.grip.distanceTo(raw.support) < 1e-6 || Math.abs(raw.forward.dot(raw.up)) > .999) throw new Error('degenerate-weapon-landmarks');
  const alignMode = config.alignMode || 'hands';
  if (!['hands', 'aim'].includes(alignMode)) throw new Error('invalid-weapon-align-mode');
  if (config.scaleRange != null && (!Array.isArray(config.scaleRange) || config.scaleRange.length !== 2
    || !config.scaleRange.every(positive) || config.scaleRange[0] > config.scaleRange[1])) throw new Error('invalid-weapon-scale-range');
  if (config.uniformScale !== undefined && !positive(config.uniformScale) || config.lengthWorld !== undefined && !positive(config.lengthWorld)) throw new Error('invalid-weapon-scale');
  const model = gltf.scene.clone(true), root = new Group();
  root.name = 'actual-native-weapon-attachment'; root.add(model); model.updateMatrix();
  const native = {
    grip: raw.grip.clone().applyMatrix4(model.matrix), support: raw.support.clone().applyMatrix4(model.matrix), muzzle: raw.muzzle.clone().applyMatrix4(model.matrix),
    forward: raw.forward.clone().transformDirection(model.matrix), up: raw.up.clone().transformDirection(model.matrix),
  };
  return {
    root, model, raw, native, geometry, nativeLength: lengthAlongForward(root, native.forward),
    config: freezeTree({
      ...JSON.parse(JSON.stringify(config)), alignMode, landmarkCoordinates: coordinates,
      fitToHands: config.fitToHands !== false,
      confidence: config.confidence || 'candidate',
      landmarkEvidence: config.landmarkEvidence || 'Explicit manual landmarks; visual approval not recorded.',
    }),
  };
}

function basis(forward, up) {
  const x = forward.clone().normalize(), y = up.clone().addScaledVector(x, -up.dot(x));
  if (x.lengthSq() < 1e-12 || y.lengthSq() < 1e-12) throw new Error('degenerate-weapon-basis');
  y.normalize(); const z = new Vector3().crossVectors(x, y).normalize();
  return new Matrix4().makeBasis(x, y, z);
}
function rigidRotation(sourceForward, sourceUp, desiredForward, desiredUp) {
  const source = basis(sourceForward, sourceUp), destination = basis(desiredForward, desiredUp);
  return new Quaternion().setFromRotationMatrix(destination.multiply(source.transpose())).normalize();
}
function handPosition(hand, label) {
  if (typeof hand?.getWorldPosition === 'function') return hand.getWorldPosition(new Vector3());
  return vector(hand, label);
}

/** Feed these real, uniformly scaled offsets into the coupled two-arm IK.
 * Coordinates stay subject-local; the caller applies the subject's yaw once.
 * This does not assume either arm can reach the requested support position. */
export function weaponGripOffsets(instance, { aimDirection = [0, 0, 1], up = [0, 1, 0], uniformScale = instance?.config?.uniformScale, lengthWorld = instance?.config?.lengthWorld } = {}) {
  if (!instance?.root?.isObject3D) throw new Error('actual-weapon-required');
  let requestedScale;
  if (positive(uniformScale)) requestedScale = uniformScale;
  else if (positive(lengthWorld)) requestedScale = lengthWorld / instance.nativeLength;
  else throw new Error('explicit-weapon-size-required');
  const range = instance.config.scaleRange;
  const scale = range ? Math.max(range[0], Math.min(range[1], requestedScale)) : requestedScale;
  const desiredAim = unit(aimDirection, 'aim-direction'), desiredUp = unit(up, 'attachment-up');
  const rotation = rigidRotation(instance.native.forward, instance.native.up, desiredAim, desiredUp);
  const rotatedOffset = point => point.clone().sub(instance.native.grip).multiplyScalar(scale).applyQuaternion(rotation);
  return {
    coordinates: 'subject-local THREE axes; parent yaw not applied',
    supportOffset: plain(rotatedOffset(instance.native.support)),
    muzzleOffset: plain(rotatedOffset(instance.native.muzzle)), forward: plain(desiredAim),
    uniformScale: scale, requestedScale, scaleClamped: Math.abs(scale - requestedScale) > 1e-8,
    nativeLength: instance.nativeLength,
    scaledNativeLength: instance.nativeLength * scale,
    config: instance.config,
  };
}

/** Attach under the yawed subject, then use only subject-local rigid transforms.
 * 'hands' fits both hands when scale is unrestricted. 'aim' keeps the native
 * barrel aligned with gameplay aim and reports any foreend-hand mismatch.
 * Never rotate actor.angle here: the parent subject already has that yaw. */
export function attachAtPose(instance, { subject, rightHand, leftHand = null, aimDirection = [0, 0, 1], up = [0, 1, 0] } = {}) {
  if (!instance?.root?.isObject3D || !subject?.isObject3D) throw new Error('invalid-weapon-attachment');
  subject.updateWorldMatrix(true, true);
  const subjectScale = subject.getWorldScale(new Vector3());
  if (!positive(subjectScale.x) || !positive(subjectScale.y) || !positive(subjectScale.z)
    || Math.max(subjectScale.x, subjectScale.y, subjectScale.z) - Math.min(subjectScale.x, subjectScale.y, subjectScale.z) > 1e-6) throw new Error('nonuniform-subject-scale');
  const desiredGripWorld = handPosition(rightHand, 'right-hand'), desiredSupportWorld = leftHand ? handPosition(leftHand, 'left-hand') : null;
  const desiredGrip = subject.worldToLocal(desiredGripWorld.clone()), desiredSupport = desiredSupportWorld ? subject.worldToLocal(desiredSupportWorld.clone()) : null;
  const nativeGap = instance.native.support.clone().sub(instance.native.grip);
  const targetGap = desiredSupport ? desiredSupport.clone().sub(desiredGrip) : null;
  if (targetGap && targetGap.lengthSq() < 1e-12) throw new Error('coincident-hand-grips');
  const desiredAim = unit(aimDirection, 'aim-direction'), desiredUp = unit(up, 'attachment-up');
  const config = instance.config;
  let requestedScale;
  if (positive(config.uniformScale)) requestedScale = config.uniformScale;
  else if (positive(config.lengthWorld)) requestedScale = config.lengthWorld / instance.nativeLength;
  else if (config.fitToHands && targetGap) requestedScale = targetGap.length() / nativeGap.length();
  else throw new Error('explicit-scale-or-two-hands-required');
  const scale = config.scaleRange ? Math.max(config.scaleRange[0], Math.min(config.scaleRange[1], requestedScale)) : requestedScale;
  const rotation = config.alignMode === 'hands' && targetGap
    ? rigidRotation(nativeGap, instance.native.up, targetGap, desiredUp)
    : rigidRotation(instance.native.forward, instance.native.up, desiredAim, desiredUp);
  if (instance.root.parent !== subject) subject.add(instance.root);
  instance.root.scale.setScalar(scale); instance.root.quaternion.copy(rotation);
  instance.root.position.copy(desiredGrip).sub(instance.native.grip.clone().multiplyScalar(scale).applyQuaternion(rotation));
  instance.root.updateWorldMatrix(true, true);
  const grip = instance.model.localToWorld(instance.raw.grip.clone()), support = instance.model.localToWorld(instance.raw.support.clone()), muzzle = instance.model.localToWorld(instance.raw.muzzle.clone());
  const directionMatrix = new Matrix3().setFromMatrix4(instance.model.matrixWorld);
  const forward = instance.raw.forward.clone().applyMatrix3(directionMatrix).normalize();
  const requestedAimWorld = desiredAim.clone().transformDirection(subject.matrixWorld);
  const origin = subject.getWorldPosition(new Vector3());
  const offset = muzzle.clone().sub(origin), requestedGap = targetGap?.length() ?? null;
  return {
    supported: true, alignMode: config.alignMode, uniformScale: scale, requestedScale,
    scaleClamped: Math.abs(scale - requestedScale) > 1e-8,
    nativeGripDistance: nativeGap.length(), targetGripDistance: requestedGap,
    nativeLength: instance.nativeLength, scaledNativeLength: instance.nativeLength * scale * subjectScale.x,
    gripError: grip.distanceTo(desiredGripWorld), supportError: desiredSupportWorld ? support.distanceTo(desiredSupportWorld) : null,
    aimErrorDegrees: forward.angleTo(requestedAimWorld) * 180 / Math.PI,
    world: { grip: plain(grip), support: plain(support), muzzle: plain(muzzle), forward: plain(forward) },
    game: { grip: game(grip), support: game(support), muzzle: game(muzzle), forward: game(forward) },
    gameOffset: { x: offset.x, y: offset.z, height: offset.y }, gameHeight: offset.y,
    config,
    geometry: { vertices: instance.geometry.vertices, triangles: instance.geometry.triangles, longestAxis: instance.geometry.longestAxis, bounds: instance.geometry.bounds },
    // Rendering can hide root for a body-only alpha pass without losing pose.
    bodyAlphaIncludesWeapon: false,
  };
}
