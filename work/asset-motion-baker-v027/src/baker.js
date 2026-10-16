import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CAMERA_ELEVATION, CAMERA_SCALE, atlasLayout, projectWorld, modelRotation, fitProjection, alphaBounds, bodyAlpha, bodyIdentificationContour, coreBounds, relativeBounds, withOutline } from './atlas.js';
import { AnimationSampler, isOneShot, sampleTime } from './animation.js';
import { applyWeaponReadyPose } from './weapon-pose.js';
import { BatchQueue, BatchPaused, parsePlan } from './batch.js';
import { loadNativeWeapon, attachAtPose, weaponGripOffsets, nativeWeaponCandidate } from './weapon-attachment.js';

const $ = id => document.getElementById(id);
const elements = Object.fromEntries(['model', 'refresh', 'load', 'directions', 'frame-size', 'subject-height', 'uniform-scale', 'origin-x', 'origin-y', 'origin-z', 'padding', 'outline', 'front-yaw', 'shading', 'clip', 'samples', 'root-motion', 'weapon-ready', 'grip-height', 'core-region', 'weapon-model', 'weapon-config', 'weapon-preset', 'export-name', 'bake', 'save', 'status', 'info', 'saved', 'view', 'atlas', 'alpha-atlas', 'view-direction', 'view-sample', 'bounds'].map(id => [id, $(id)]));
const manifest = await fetch('/manifest.json').then(response => response.json()).catch(() => ({}));
let renderer = null, scene = null, camera = null, subject = null, mixer = null, sampler = null, nativeWeapon = null, animationClips = [], selectedModel = null, modelStats = null, normalizedHeight = 0, loadedNormalization = null, loadedWeaponConfig = null, baked = null, busy = false, batchRunning = false;

function status(message, error = false) {
  elements.status.textContent = message;
  elements.status.dataset.error = String(error);
}

function setBusy(value) {
  busy = value;
  const blocked = value || batchRunning;
  elements.refresh.disabled = blocked;
  elements.load.disabled = blocked || !elements.model.value;
  elements.bake.disabled = blocked || !subject;
  elements.save.disabled = blocked || !baked;
  for (const id of ['model', 'directions', 'frame-size', 'subject-height', 'uniform-scale', 'origin-x', 'origin-y', 'origin-z', 'padding', 'outline', 'front-yaw', 'shading', 'clip', 'samples', 'root-motion', 'weapon-ready', 'grip-height', 'core-region', 'weapon-model', 'weapon-config', 'weapon-preset', 'export-name']) elements[id].disabled = blocked;
  if ($('batch-load')) $('batch-load').disabled = blocked;
}

function invalidateBake() {
  if (busy) return;
  baked = null;
  elements.save.disabled = true;
  elements.saved.replaceChildren();
  if (subject) status('설정이 바뀌었습니다. 아틀라스를 다시 만들어주세요.');
}

function finiteInput(id, minimum, maximum) {
  const value = Number(elements[id].value);
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${id} 설정 범위를 확인해주세요.`);
  return value;
}

function settings() {
  const frameSize = finiteInput('frame-size', 128, 512);
  const padding = finiteInput('padding', 4, Math.floor(frameSize / 3));
  const clip = elements.clip.value === '' ? null : Number(elements.clip.value);
  const samples = clip === null ? 1 : finiteInput('samples', 1, 32);
  const coreRegion = elements['core-region'].value.split(',').map(value => Number(value.trim()));
  if (!Array.isArray(coreRegion) || coreRegion.length !== 4 || !coreRegion.every(value => Number.isFinite(value) && value >= 0 && value <= 1) || coreRegion[0] >= coreRegion[2] || coreRegion[1] >= coreRegion[3]) throw new Error('manifest coreRegion 설정을 확인해주세요.');
  const origins = ['origin-x', 'origin-y', 'origin-z'].map(id => elements[id].value);
  if (origins.some(value => value !== '') && origins.some(value => value === '')) throw new Error('원본 기준점 X/Y/Z를 모두 입력하거나 모두 비워주세요.');
  const originPivot = origins[0] === '' ? null : { x: finiteInput('origin-x', -1e6, 1e6), y: finiteInput('origin-y', -1e6, 1e6), z: finiteInput('origin-z', -1e6, 1e6) };
  const weaponModel = elements['weapon-model'].value || null;
  const weaponConfig = weaponModel ? JSON.parse(elements['weapon-config'].value) : null;
  if (weaponModel && (!weaponConfig || !elements['weapon-ready'].checked)) throw new Error('실제 무기의 landmark JSON과 무기 준비·양손 IK 설정이 필요합니다.');
  return { frameSize, padding, directions: finiteInput('directions', 8, 16), subjectHeight: finiteInput('subject-height', 8, 400), uniformScale: elements['uniform-scale'].value === '' ? null : finiteInput('uniform-scale', .00001, 10000), originPivot, outline: finiteInput('outline', 0, 4), frontYaw: finiteInput('front-yaw', -180, 180) * Math.PI / 180, shading: elements.shading.value, clip, samples, coreRegion, removeRootMotion: elements['root-motion'].checked, weaponReady: elements['weapon-ready'].checked, gripHeight: elements['grip-height'].value === '' ? null : finiteInput('grip-height', 1, 400), weaponModel, weaponConfig };
}

function normalizationConfig(chosen) {
  return { subjectHeight: chosen.subjectHeight, uniformScale: chosen.uniformScale, originPivot: chosen.originPivot };
}

function initializeRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;
  scene = new THREE.Scene();
  scene.background = null;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, .65));
  const key = new THREE.DirectionalLight(0xffffff, .75);
  key.position.set(-4, 7, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, .18);
  fill.position.set(5, 3, -4);
  scene.add(fill);
  camera = new THREE.OrthographicCamera(-100, 100, 100, -100, .1, 10000);
  camera.position.set(1000, 1000, 1000);
  camera.lookAt(0, 0, 0);
}

function disposeSubject() {
  if (!subject) return;
  scene.remove(subject);
  if (mixer) mixer.stopAllAction();
  const geometries = new Set(), materials = new Set(), textures = new Set();
  subject.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  subject = null;
  mixer = null;
  sampler = null;
  nativeWeapon = null;
  baked = null;
}

function neutralMaterials(root, mode = 'matte') {
  let meshes = 0, triangles = 0, skinnedMeshes = 0;
  const converted = new Map();
  let gradient = null;
  if (mode === 'cel') {
    gradient = new THREE.DataTexture(new Uint8Array([72, 72, 72, 255, 158, 158, 158, 255, 238, 238, 238, 255]), 3, 1, THREE.RGBAFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  const convert = original => {
    if (converted.has(original)) return converted.get(original);
    const Material = mode === 'unlit' ? THREE.MeshBasicMaterial : mode === 'cel' ? THREE.MeshToonMaterial : THREE.MeshLambertMaterial;
    const options = {
      color: original.color ? original.color.clone() : 0xffffff,
      map: original.map || null, alphaMap: original.alphaMap || null,
      transparent: !!original.transparent, opacity: original.opacity ?? 1,
      depthWrite: original.depthWrite ?? true, depthTest: original.depthTest ?? true,
      alphaTest: original.alphaTest || 0, side: original.side ?? THREE.FrontSide,
      vertexColors: !!original.vertexColors,
    };
    if (mode !== 'unlit') Object.assign(options, {
      emissive: original.emissive ? original.emissive.clone() : 0x000000,
      emissiveMap: original.emissiveMap || null, emissiveIntensity: original.emissiveIntensity ?? 1,
    });
    if (mode === 'cel') options.gradientMap = gradient;
    if (mode === 'matte') options.flatShading = !!original.flatShading;
    const material = new Material(options);
    material.name = `${original.name || 'Meshy'} · baseColor ${mode}`;
    converted.set(original, material);
    return material;
  };
  root.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    if (object.isSkinnedMesh) skinnedMeshes++;
    triangles += (object.geometry.index ? object.geometry.index.count : object.geometry.attributes.position?.count || 0) / 3;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    if (object.material) object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
  });
  for (const original of converted.keys()) original.dispose();
  return { meshes, triangles: Math.round(triangles), skinnedMeshes, materials: converted.size };
}

async function refreshModels() {
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const previous = elements.model.value;
    const previousWeapon = elements['weapon-model'].value;
    elements.model.replaceChildren(new Option(data.models.length ? '실제 GLB를 선택해주세요' : '준비 중 · models/에 실제 GLB 파일을 넣어주세요', ''));
    for (const model of data.models) elements.model.add(new Option(model.name, model.url));
    elements['weapon-model'].replaceChildren(new Option('없음 · 몸체만 렌더', ''));
    for (const model of data.models.filter(model => model.name.startsWith('weapon-'))) elements['weapon-model'].add(new Option(model.name, model.name));
    if (data.models.some(model => model.name === previousWeapon)) elements['weapon-model'].value = previousWeapon;
    const preferred = previous || manifest.modelPath;
    if (data.models.some(model => model.url === preferred)) elements.model.value = preferred;
    setBusy(false);
    if (!data.models.length) status('준비 중입니다. 실제 Meshy GLB 파일이 아직 없습니다.');
  } catch (error) { status(error.message, true); }
}

async function loadActualGLB(url) {
  const draco = new DRACOLoader().setDecoderPath('/node_modules/three/examples/jsm/libs/draco/gltf/');
  const ktx2 = new KTX2Loader().setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/').detectSupport(renderer);
  const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  try { return await loader.loadAsync(url); }
  finally { draco.dispose(); ktx2.dispose(); }
}

export async function loadModel(options = {}) {
  if (!/^\/models\/[^/]+\.glb$/i.test(elements.model.value)) return;
  setBusy(true);
  status('실제 GLB와 원본 텍스처를 불러오는 중입니다…');
  try {
    initializeRenderer();
    disposeSubject();
    const gltf = await loadActualGLB(elements.model.value);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const original = new THREE.Box3().setFromObject(root, true);
    if (original.isEmpty() || !Number.isFinite(original.max.y - original.min.y) || original.max.y - original.min.y <= 0) throw new Error('유효한 모델 높이를 찾지 못했습니다.');
    const chosen = settings();
    const scale = chosen.uniformScale ?? chosen.subjectHeight / (original.max.y - original.min.y);
    normalizedHeight = (original.max.y - original.min.y) * scale;
    loadedNormalization = normalizationConfig(chosen);
    const center = original.getCenter(new THREE.Vector3());
    const originPivot = chosen.originPivot || { x: center.x, y: original.min.y, z: center.z };
    const normalization = new THREE.Group();
    normalization.name = 'fixed-foot-normalization';
    normalization.scale.setScalar(scale);
    normalization.position.set(-originPivot.x * scale, -originPivot.y * scale, -originPivot.z * scale);
    normalization.add(root);
    subject = new THREE.Group();
    subject.name = 'world-facing-outside-animation';
    const motion = new THREE.Group();
    motion.name = 'root-travel-compensation-outside-animation';
    motion.add(normalization);
    subject.add(motion);
    modelStats = neutralMaterials(root, chosen.shading);
    scene.add(subject);
    animationClips = gltf.animations;
    sampler = new AnimationSampler({ root, subject, motion, clips: animationClips, subjectHeight: normalizedHeight });
    mixer = sampler.mixer;
    loadedWeaponConfig = { model: chosen.weaponModel, config: chosen.weaponConfig };
    if (chosen.weaponModel) {
      if (!sampler.root.getObjectByName('RightHand') || !sampler.root.getObjectByName('LeftHand')) throw new Error('실제 무기 착장에는 양손 뼈가 필요합니다.');
      status('실제 무기 GLB와 원본 텍스처를 불러오는 중…');
      const weaponGLTF = await loadActualGLB(`/models/${encodeURIComponent(chosen.weaponModel)}`);
      nativeWeapon = loadNativeWeapon(weaponGLTF, chosen.weaponConfig);
      subject.add(nativeWeapon.root);
      neutralMaterials(nativeWeapon.root, chosen.shading);
      nativeWeapon.gripOffsets = weaponGripOffsets(nativeWeapon);
      nativeWeapon.file = chosen.weaponModel;
    }
    elements.clip.replaceChildren(new Option('기본 자세', ''));
    animationClips.forEach((clip, index) => elements.clip.add(new Option(`${clip.name || `동작 ${index + 1}`} (${clip.duration.toFixed(2)}초)`, String(index))));
    selectedModel = { file: decodeURIComponent(elements.model.value.split('/').pop()), url: elements.model.value, originalBounds: { min: original.min.toArray(), max: original.max.toArray() }, scale, originPivot, normalizationMode: chosen.uniformScale === null ? 'height' : 'uniformScale', rig: { skins: sampler.skins.length, bones: sampler.skins.reduce((count, mesh) => count + mesh.skeleton.bones.length, 0), restForward: sampler.restForward() } };
    elements['export-name'].value = selectedModel.file.replace(/\.glb$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-');
    elements.info.replaceChildren();
    for (const [label, value] of [['GLB', selectedModel.file], ['삼각형', modelStats.triangles.toLocaleString()], ['몸체', `${modelStats.meshes}개 / 스킨 ${modelStats.skinnedMeshes}개`], ['동작', `${animationClips.length}개`]]) {
      const term = document.createElement('dt'), description = document.createElement('dd');
      term.textContent = label; description.textContent = value;
      elements.info.append(term, description);
    }
    status('모델을 불러왔습니다. 실제 방향별 아틀라스를 생성할 수 있습니다.');
    return selectedModel;
  } catch (error) { disposeSubject(); status(`불러오기 실패: ${error.message}`, true); if (options.throwOnError) throw error; }
  finally { setBusy(false); }
}

function poseAt(clipIndex, time, chosen) {
  const sampled = sampler.sample(clipIndex, time, { removeRootMotion: chosen.removeRootMotion });
  if (chosen.weaponReady) {
    const collapse = animationClips[clipIndex]?.name === 'DS_MotionReel' && time >= 26 / 12 - 1e-6;
    sampled.weaponPose = collapse ? { supported: false, passiveGripDuringCollapse: true } : applyWeaponReadyPose({ root: sampler.root, subject, gripHeight: chosen.gripHeight, supportOffset: nativeWeapon?.gripOffsets?.supportOffset || null });
    if (!sampled.weaponPose.supported && !collapse) throw new Error('이 모델에는 무기 준비에 필요한 팔 뼈가 없습니다.');
    sampler.updateSkinPose();
    const hand = sampler.root.getObjectByName('RightHand').getWorldPosition(new THREE.Vector3());
    const support = sampler.root.getObjectByName('LeftHand').getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, 1).transformDirection(subject.matrixWorld);
    sampled.weaponAnchor = { x: hand.x, y: hand.z, z: hand.y, forward: { x: forward.x, y: forward.z, z: forward.y }, support: { x: support.x, y: support.z, z: support.y } };
    if (nativeWeapon) {
      sampled.weaponAttachment = attachAtPose(nativeWeapon, { subject, rightHand: sampler.root.getObjectByName('RightHand'), leftHand: sampler.root.getObjectByName('LeftHand') });
      sampled.weaponPose.weaponGeometryAdded = true;
    }
  }
  return sampled;
}

function attachmentMetadata(attachment) {
  if (!attachment) return null;
  // Native landmarks/geometry are recorded once at the atlas level. Repeating
  // them in 128 frames would inflate metadata without adding pose evidence.
  const { config, geometry, world, ...pose } = attachment;
  return { ...pose, landmarkConfidence: config.confidence };
}

function frameTime(chosen, sample) {
  if (chosen.clip === null) return 0;
  return sampleTime(animationClips[chosen.clip], sample, chosen.samples);
}

function setCamera(chosen, fitted, boxes) {
  const k = fitted.density * CAMERA_SCALE;
  camera.left = -fitted.pivot.x / k;
  camera.right = (chosen.frameSize - fitted.pivot.x) / k;
  camera.top = fitted.pivot.y / k;
  camera.bottom = (fitted.pivot.y - chosen.frameSize) / k;
  const maximumCoordinate = Math.max(...boxes.flatMap(box => [...box.min.toArray(), ...box.max.toArray()].map(Math.abs)));
  const distance = Math.max(1000, maximumCoordinate * 4);
  camera.position.set(distance, distance, distance);
  camera.lookAt(0, 0, 0);
  camera.far = distance * 8;
  camera.updateProjectionMatrix();
  renderer.setSize(chosen.frameSize, chosen.frameSize, false);
}

const yieldFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

// For an outer, origin-centred world Y rotation, rigid yaw commutes with the
// already evaluated internal pose. Keep every deformed vertex (not the corners
// of its AABB): rotating a box would overestimate diagonal silhouette bounds.
// Float64 retains the precision used by Vector3 / precise Box3 CPU traversal.
export function posedWorldVertices(root) {
  const objects = [];
  let count = 0;
  root.traverse(object => {
    const position = object.geometry?.attributes?.position;
    if (!position) return;
    objects.push({ object, position });
    count += position.count;
  });
  const points = new Float64Array(count * 3);
  const vertex = new THREE.Vector3();
  let offset = 0;
  for (const { object, position } of objects) {
    for (let index = 0; index < position.count; index++) {
      if (object.isMesh) object.getVertexPosition(index, vertex);
      else vertex.fromBufferAttribute(position, index);
      vertex.applyMatrix4(object.matrixWorld);
      points[offset++] = vertex.x;
      points[offset++] = vertex.y;
      points[offset++] = vertex.z;
    }
  }
  return points;
}

export function poseYawBounds(points, deltaYaw) {
  const cosine = Math.cos(deltaYaw), sine = Math.sin(deltaYaw);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let index = 0; index < points.length; index += 3) {
    const x = points[index], y = points[index + 1], z = points[index + 2];
    const rotatedX = cosine * x + sine * z;
    const rotatedZ = -sine * x + cosine * z;
    minX = Math.min(minX, rotatedX); maxX = Math.max(maxX, rotatedX);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, rotatedZ); maxZ = Math.max(maxZ, rotatedZ);
  }
  return new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
}

function reusableYawBounds(chosen) {
  // Two-hand IK / attached weapon orientation can depend on the requested view.
  // Retain the existing precise traversal for those jobs and unusual objects.
  if (animationClips[chosen.clip]?.name !== 'DS_MotionReel' || nativeWeapon || chosen.weaponReady) return false;
  if (subject.parent !== scene || subject.position.lengthSq() !== 0 || subject.rotation.x !== 0 || subject.rotation.z !== 0) return false;
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  if (!scene.matrixWorld.elements.every((value, index) => value === identity[index])) return false;
  let supported = true;
  subject.traverse(object => {
    if (object.isInstancedMesh || object.geometry && !object.geometry.attributes?.position) supported = false;
  });
  return supported;
}

export async function bakeAtlas(options = {}) {
  if (!subject) return;
  setBusy(true);
  baked = null;
  try {
    const chosen = settings();
    atlasLayout(chosen);
    if (JSON.stringify(normalizationConfig(chosen)) !== JSON.stringify(loadedNormalization)) throw new Error('모델 높이·배율·기준점이 바뀌었습니다. 모델을 다시 불러와 고정 기준을 갱신해주세요.');
    if (JSON.stringify({ model: chosen.weaponModel, config: chosen.weaponConfig }) !== JSON.stringify(loadedWeaponConfig)) throw new Error('실제 무기 또는 landmark가 바뀌었습니다. 모델을 다시 불러와주세요.');
    modelStats = neutralMaterials(subject, chosen.shading);
    const boxes = [];
    if (reusableYawBounds(chosen)) {
      const baselineYaw = modelRotation(0, chosen.frontYaw);
      subject.rotation.y = baselineYaw;
      for (let sample = 0; sample < chosen.samples; sample++) {
        options.check?.();
        poseAt(chosen.clip, frameTime(chosen, sample), chosen);
        // Cache just one sample's CPU-skinned positions at a time. All direction
        // boxes survive for fitting/metadata; the much larger vertex buffer can
        // be released before the next pose and never survives this bake/load.
        const points = posedWorldVertices(subject);
        for (let direction = 0; direction < chosen.directions; direction++) {
          const yaw = modelRotation(direction * Math.PI * 2 / chosen.directions, chosen.frontYaw);
          boxes[direction * chosen.samples + sample] = poseYawBounds(points, yaw - baselineYaw);
        }
        status(`실제 포즈 경계 확인 ${sample + 1}/${chosen.samples}`);
        await yieldFrame();
      }
    } else {
      for (let direction = 0; direction < chosen.directions; direction++) {
        options.check?.();
        subject.rotation.y = modelRotation(direction * Math.PI * 2 / chosen.directions, chosen.frontYaw);
        for (let sample = 0; sample < chosen.samples; sample++) {
          poseAt(chosen.clip, frameTime(chosen, sample), chosen);
          boxes.push(new THREE.Box3().setFromObject(subject, true));
        }
        await yieldFrame();
      }
    }
    const fitted = fitProjection(boxes, chosen.frameSize, chosen.padding);
    setCamera(chosen, fitted, boxes);
    const { total, columns, rows, width, height } = atlasLayout(chosen);
    for (const id of ['atlas', 'alpha-atlas']) {
      elements[id].width = width; elements[id].height = height;
      elements[id].getContext('2d').clearRect(0, 0, width, height);
    }
    const capture = document.createElement('canvas');
    capture.width = capture.height = chosen.frameSize;
    const context = capture.getContext('2d', { willReadFrequently: true });
    const atlasContext = elements.atlas.getContext('2d');
    const alphaContext = elements['alpha-atlas'].getContext('2d');
    const frames = [];
    for (let direction = 0; direction < chosen.directions; direction++) {
      const angle = direction * Math.PI * 2 / chosen.directions;
      subject.rotation.y = modelRotation(angle, chosen.frontYaw);
      for (let sample = 0; sample < chosen.samples; sample++) {
        options.check?.();
        const time = frameTime(chosen, sample);
        const sampled = poseAt(chosen.clip, time, chosen);
        const actualBox = boxes[direction * chosen.samples + sample];
        if (nativeWeapon) nativeWeapon.root.visible = false;
        renderer.render(scene, camera);
        context.clearRect(0, 0, capture.width, capture.height);
        context.drawImage(renderer.domElement, 0, 0);
        const bodyImage = context.getImageData(0, 0, capture.width, capture.height);
        if (nativeWeapon) {
          nativeWeapon.root.visible = true;
          renderer.render(scene, camera);
          context.clearRect(0, 0, capture.width, capture.height);
          context.drawImage(renderer.domElement, 0, 0);
        }
        const image = nativeWeapon ? context.getImageData(0, 0, capture.width, capture.height) : bodyImage;
        const bounds = alphaBounds(bodyImage.data, capture.width, capture.height);
        if (!bounds) throw new Error(`방향 ${direction}, 프레임 ${sample}에 보이는 몸체가 없습니다.`);
        const core = coreBounds(bodyImage.data, capture.width, capture.height, bounds, chosen.coreRegion);
        const mask = bodyAlpha(bodyImage.data);
        const outlined = withOutline(image.data, capture.width, capture.height, chosen.outline);
        const index = direction * chosen.samples + sample;
        const x = index % columns * chosen.frameSize, y = Math.floor(index / columns) * chosen.frameSize;
        atlasContext.putImageData(new ImageData(outlined, capture.width, capture.height), x, y);
        alphaContext.putImageData(new ImageData(mask, capture.width, capture.height), x, y);
        frames.push({ index, direction, sample, angle, time, groundBounds: { minX: actualBox.min.x, minY: actualBox.min.z, maxX: actualBox.max.x, maxY: actualBox.max.z }, rootCompensation: sampled.compensation, weaponPose: sampled.weaponPose || null, weaponAnchor: sampled.weaponAnchor || null, weaponAttachment: attachmentMetadata(sampled.weaponAttachment), weaponMuzzle: sampled.weaponAttachment?.game?.muzzle || null, screenForward: projectWorld(Math.cos(angle), Math.sin(angle)), rect: { x, y, width: chosen.frameSize, height: chosen.frameSize }, footPivot: { ...fitted.pivot }, alphaBounds: bounds, combinedAlphaBounds: alphaBounds(image.data, capture.width, capture.height), outlineBounds: alphaBounds(outlined, capture.width, capture.height), coreBounds: core, bodyIdentificationContour: bodyIdentificationContour(mask, capture.width, capture.height, bounds, core), projectedBodyBounds: relativeBounds(bounds, fitted.pivot, fitted.density), projectedCoreBounds: relativeBounds(core, fitted.pivot, fitted.density), clipped: bounds.x <= chosen.outline || bounds.y <= chosen.outline || bounds.x + bounds.width >= chosen.frameSize - chosen.outline || bounds.y + bounds.height >= chosen.frameSize - chosen.outline });
        status(`실제 WebGL 렌더 ${index + 1}/${total} · ${direction + 1}번째 방향`);
        options.report?.(`실제 WebGL 렌더 ${index + 1}/${total}`, .1 + .75 * (index + 1) / total);
        await yieldFrame();
      }
    }
    const clip = chosen.clip === null ? null : animationClips[chosen.clip];
    const rootMotion = clip ? sampler.describeRootMotion(chosen.clip) : null;
    baked = { format: 'meshy-iso-sprite-atlas', version: 1, source: { ...selectedModel, format: 'glb', stats: modelStats }, projection: { gameAxes: 'x,y on ground; z height', threeAxes: 'X=game.x,Y=game.z,Z=game.y', azimuthDegrees: 45, elevationDegrees: CAMERA_ELEVATION * 180 / Math.PI, cameraScale: CAMERA_SCALE, pixelsPerWorld: fitted.density, footPivot: fitted.pivot, subjectHeight: normalizedHeight, frontYawRadians: chosen.frontYaw }, atlas: { width, height, columns, rows, frameSize: chosen.frameSize, directions: chosen.directions, samples: chosen.samples, order: 'direction-major, sample-minor', transparent: true, alphaThreshold: 8 }, animation: clip ? { name: clip.name, duration: clip.duration, loop: !isOneShot(clip), samples: chosen.samples, rootMotionRemoved: chosen.removeRootMotion && rootMotion.significant, rootMotion } : null, weaponReady: chosen.weaponReady ? { enabled: true, gripHeight: chosen.gripHeight, method: 'actual-joint-length two-bone IK; original lower-body clip retained', fingerRig: false, weaponGeometryAdded: false } : null, appearance: { baseColor: 'original GLB map and color factor', material: chosen.shading, lights: { hemisphereWhite: .65, keyWhite: .75, keyPosition: [-4, 7, 6], fillWhite: .18, fillPosition: [5, 3, -4] }, toneMapping: 'none', outputColorSpace: 'sRGB', outline: { color: '#181c1e', pixels: chosen.outline }, floor: false, shadow: false }, coreRegion: { proportions: chosen.coreRegion, method: 'alpha-occupied torso band; requires visual review for unusual silhouettes' }, frames };
    if (clip?.name === 'DS_MotionReel') { baked.animation.clips = {"idle": {"start": 0, "count": 4, "duration": 1.8, "loop": true}, "walk": {"start": 4, "count": 8, "duration": 1.2, "loop": true}, "windup": {"start": 12, "count": 6, "duration": 0.8, "loop": false}, "attack": {"start": 18, "count": 6, "duration": 0.55, "loop": false}, "hit": {"start": 24, "count": 2, "duration": 0.22, "loop": false}, "death": {"start": 26, "count": 6, "duration": 1.15, "loop": false}}; baked.animation.type = 'skeletal-action-reel'; baked.animation.loop = false; }
    baked.nativeWeapon = nativeWeapon ? { file: nativeWeapon.file, config: nativeWeapon.config, geometry: nativeWeapon.geometry.bounds, geometryStats: { vertices: nativeWeapon.geometry.vertices, triangles: nativeWeapon.geometry.triangles, longestAxis: nativeWeapon.geometry.longestAxis }, gripOffsets: nativeWeapon.gripOffsets, bodyAlphaIncludesWeapon: false } : null;
    baked.atlas.includesWeapon = !!nativeWeapon;
    if (baked.weaponReady) baked.weaponReady.weaponGeometryAdded = !!nativeWeapon;
    elements['view-direction'].replaceChildren();
    for (let direction = 0; direction < chosen.directions; direction++) elements['view-direction'].add(new Option(`${direction} · ${(direction * 360 / chosen.directions).toFixed(1)}°`, String(direction)));
    elements['view-sample'].replaceChildren();
    for (let sample = 0; sample < chosen.samples; sample++) elements['view-sample'].add(new Option(String(sample), String(sample)));
    displayFrame();
    const clipped = frames.filter(frame => frame.clipped).length;
    const gripClamps = frames.filter(frame => frame.weaponPose?.left?.clamped || frame.weaponPose?.right?.clamped).length;
    status(gripClamps ? `완료 · ${total}장. ${gripClamps}장에 손 도달 한계가 있습니다. 그립 높이를 자동으로 바꾸거나 손 위치를 검수해주세요.` : clipped ? `완료 · ${total}장. 가장자리 접촉 ${clipped}장이 있으니 여백을 늘려 검수해주세요.` : `완료 · 실제 모델 ${total}장, 발 기준점 고정. 저장 버튼으로 PNG와 메타데이터를 내보낼 수 있습니다.`);
    return baked;
  } catch (error) { baked = null; status(error instanceof BatchPaused ? error.message : `제작 실패: ${error.message}`, !(error instanceof BatchPaused)); if (options.throwOnError) throw error; }
  finally { setBusy(false); }
}

function displayFrame() {
  if (!baked) return;
  const direction = Number(elements['view-direction'].value), sample = Number(elements['view-sample'].value);
  const frame = baked.frames[direction * baked.atlas.samples + sample];
  const poseInfo = $('pose-info');
  poseInfo.textContent = frame.weaponPose ? `양손 IK · 오른손 높이 ${frame.weaponPose.right.position.y.toFixed(2)} / 왼손 높이 ${frame.weaponPose.left.position.y.toFixed(2)} · 최대 그립 오차 ${Math.max(frame.weaponPose.right.error, frame.weaponPose.left.error).toFixed(3)}${frame.weaponPose.right.clamped || frame.weaponPose.left.clamped ? ' · 도달 한계 있음' : ''}.${frame.weaponAttachment ? ` 실제 무기 착장 · 총구 높이 ${frame.weaponMuzzle.z.toFixed(2)} · 지지손 오차 ${frame.weaponAttachment.supportError.toFixed(3)} · landmark ${frame.weaponAttachment.landmarkConfidence}` : ' 실제 무기 없음'}. 손가락 리그는 포함하지 않습니다.` : '';
  const canvas = elements.view;
  canvas.width = canvas.height = baked.atlas.frameSize;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(elements.atlas, frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height, 0, 0, canvas.width, canvas.height);
  if (elements.bounds.checked) {
    context.lineWidth = 1;
    context.strokeStyle = '#36dca0';
    context.strokeRect(frame.alphaBounds.x, frame.alphaBounds.y, frame.alphaBounds.width, frame.alphaBounds.height);
    if (frame.coreBounds) { context.strokeStyle = '#f2c94c'; context.strokeRect(frame.coreBounds.x, frame.coreBounds.y, frame.coreBounds.width, frame.coreBounds.height); }
    context.strokeStyle = '#ff6b80';
    context.beginPath(); context.moveTo(frame.footPivot.x - 6, frame.footPivot.y); context.lineTo(frame.footPivot.x + 6, frame.footPivot.y); context.moveTo(frame.footPivot.x, frame.footPivot.y - 6); context.lineTo(frame.footPivot.x, frame.footPivot.y + 6); context.stroke();
    if (frame.weaponAnchor) for (const [anchor, color] of [[frame.weaponAnchor, '#7ae2f0'], [frame.weaponAnchor.support, '#f5a663']]) {
      const point = projectWorld(anchor.x, anchor.y, anchor.z);
      context.strokeStyle = color;
      context.beginPath(); context.arc(frame.footPivot.x + point.x * baked.projection.pixelsPerWorld, frame.footPivot.y + point.y * baked.projection.pixelsPerWorld, 3, 0, Math.PI * 2); context.stroke();
    }
    if (frame.weaponMuzzle) {
      const point = projectWorld(frame.weaponMuzzle.x, frame.weaponMuzzle.y, frame.weaponMuzzle.z);
      context.strokeStyle = '#ffffff'; context.beginPath(); context.arc(frame.footPivot.x + point.x * baked.projection.pixelsPerWorld, frame.footPivot.y + point.y * baked.projection.pixelsPerWorld, 3, 0, Math.PI * 2); context.stroke();
    }
  }
}

export async function saveAtlas(options = {}) {
  if (!baked) return;
  setBusy(true);
  status('저장 중 · 투명 PNG와 메타데이터를 로컬 서버로 내보냅니다…');
  try {
    const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: elements['export-name'].value, atlas: elements.atlas.toDataURL('image/png'), alpha: elements['alpha-atlas'].toDataURL('image/png'), metadata: baked }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    elements.saved.replaceChildren();
    const destination = document.createElement('p');
    destination.textContent = result.directory;
    elements.saved.append(destination);
    for (const [label, url] of Object.entries(result.urls)) {
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = `${label} 보기`;
      elements.saved.append(link, document.createElement('br'));
    }
    status('저장 완료 · 실제 아틀라스, 본체 알파 마스크, 메타데이터 3개 파일을 만들었습니다.');
    return result;
  } catch (error) { status(`저장 실패: ${error.message}`, true); if (options.throwOnError) throw error; }
  finally { setBusy(false); }
}

elements.refresh.addEventListener('click', refreshModels);
elements.load.addEventListener('click', loadModel);
elements.model.addEventListener('change', () => { elements.load.disabled = busy || !elements.model.value; });
elements.bake.addEventListener('click', bakeAtlas);
elements.save.addEventListener('click', saveAtlas);
for (const id of ['directions', 'frame-size', 'subject-height', 'uniform-scale', 'origin-x', 'origin-y', 'origin-z', 'padding', 'outline', 'front-yaw', 'shading', 'clip', 'samples', 'root-motion', 'weapon-ready', 'grip-height', 'core-region', 'weapon-model', 'weapon-config']) elements[id].addEventListener('change', invalidateBake);
elements['weapon-preset'].addEventListener('click', () => {
  const name = elements['weapon-model'].value;
  const inventory = [...elements['weapon-model'].options].map(option => option.value);
  const candidate = nativeWeaponCandidate(name, inventory);
  if (!candidate) return status('선택한 실제 무기의 실측 landmark 후보가 없습니다. 모델을 선택하거나 원본 geometry를 검수해 직접 설정해주세요.', true);
  elements['weapon-config'].value = JSON.stringify(candidate, null, 2);
  elements['weapon-ready'].checked = true;
  invalidateBake();
  status('선택한 실제 무기의 landmark 후보를 읽었습니다. 모델을 다시 불러와 손·총구·질감을 검수해주세요. 후보는 최종 승인된 설정이 아닙니다.');
});
for (const id of ['view-direction', 'view-sample', 'bounds']) elements[id].addEventListener('change', displayFrame);
for (const [id, key] of [['directions', 'directions'], ['frame-size', 'frameSize'], ['subject-height', 'subjectHeight'], ['padding', 'padding'], ['outline', 'outlinePx'], ['front-yaw', 'frontYawDegrees']]) if (manifest[key] !== undefined) elements[id].value = manifest[key];
if (manifest.coreRegion) elements['core-region'].value = manifest.coreRegion.join(',');

let batchQueue = null, batchPlanPath = '', batchRows = new Map(), availableModels = new Set(), checkpointSignature = '';

function selectedBatchIds() {
  return [...batchRows].filter(([, row]) => row.select.checked).map(([id]) => id);
}

function batchStatus(message) { $('batch-status').textContent = message; }

function renderBatch(queue) {
  const active = queue.state === 'running' || queue.state === 'stopping';
  const counts = queue.summary();
  const state = { ready: '대기', running: '실행 중', stopping: '중단 요청 · 현재 프레임/저장 완료를 기다립니다', paused: '중단됨 · 재개 가능' }[queue.state];
  batchStatus(`${state} · 실제 저장 성공 ${counts.completed}/${counts.total} · 실패 ${counts.failed} · 건너뜀 ${counts.skipped} · 대기 ${counts.pending} · 실행 ${counts.running}`);
  $('batch-start').disabled = active || !counts.pending;
  $('batch-stop').disabled = queue.state !== 'running';
  $('batch-resume').disabled = active || queue.state !== 'paused' || !counts.pending;
  $('batch-retry').disabled = active || !queue.items.some(item => item.status === 'failed' && item.job?.ready);
  for (const item of queue.items) {
    const row = batchRows.get(item.id);
    if (!row) continue;
    row.select.disabled = active || !item.job?.ready || ['complete', 'skipped'].includes(item.status);
    row.status.textContent = `${{ pending: '대기', running: '실행', complete: '저장 완료', failed: '실패', skipped: '건너뜀' }[item.status]} · ${item.message}`;
    row.progress.value = item.progress;
    row.percent.textContent = `${Math.round(item.progress * 100)}%`;
    if (item.result && row.result.dataset.folder !== item.result.folder) {
      row.result.dataset.folder = item.result.folder || item.result.directory;
      row.result.replaceChildren();
      const directory = document.createElement('small'); directory.textContent = item.result.directory;
      row.result.append(directory);
      for (const [label, url] of Object.entries(item.result.urls || {})) {
        if (typeof url !== 'string' || !url.startsWith('/exports/')) continue;
        const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = `${label} 보기`;
        row.result.append(link, document.createElement('br'));
      }
    }
  }
  const signature = `${queue.state}:${queue.items.map(item => `${item.id}:${item.status}:${item.result?.directory || ''}`).join('|')}`;
  if (signature !== checkpointSignature) {
    checkpointSignature = signature;
    try { localStorage.setItem(`meshy-baker-batch:${batchPlanPath}`, JSON.stringify(queue.checkpoint())); } catch { /* file results remain visible if storage is unavailable */ }
  }
}

function createBatchRows(items) {
  batchRows = new Map();
  $('batch-rows').replaceChildren();
  for (const item of items) {
    const tr = document.createElement('tr');
    const chooseCell = document.createElement('td'), description = document.createElement('td'), statusCell = document.createElement('td'), progressCell = document.createElement('td'), result = document.createElement('td');
    const select = document.createElement('input'); select.type = 'checkbox'; select.checked = item.status === 'pending'; select.setAttribute('aria-label', `${item.id} 선택`); chooseCell.append(select);
    const title = document.createElement('strong'); title.textContent = item.id;
    const model = document.createElement('small'); model.textContent = item.job?.model || '유효한 GLB 작업이 아닙니다'; description.append(title, model);
    const progress = document.createElement('progress'); progress.max = 1; progress.value = item.progress;
    const percent = document.createElement('small'); progressCell.append(progress, percent); result.className = 'result';
    tr.append(chooseCell, description, statusCell, progressCell, result); $('batch-rows').append(tr);
    batchRows.set(item.id, { select, status: statusCell, progress, percent, result });
  }
}

function applyJobControls(job) {
  const map = { directions: 'directions', samples: 'samples', frameSize: 'frame-size', subjectHeight: 'subject-height', padding: 'padding', outlinePx: 'outline', frontYawDegrees: 'front-yaw', shading: 'shading' };
  for (const [key, id] of Object.entries(map)) elements[id].value = job[key];
  elements['root-motion'].checked = job.rootMotion;
  elements['weapon-ready'].checked = job.weaponReady;
  elements['grip-height'].value = job.gripHeight ?? '';
  elements['uniform-scale'].value = job.uniformScale ?? '';
  for (const axis of ['x', 'y', 'z']) elements[`origin-${axis}`].value = job.originPivot?.[axis] ?? '';
  elements['core-region'].value = job.coreRegion.join(',');
  if (job.weaponModel && ![...elements['weapon-model'].options].some(option => option.value === job.weaponModel)) elements['weapon-model'].add(new Option(job.weaponModel, job.weaponModel));
  elements['weapon-model'].value = job.weaponModel || '';
  elements['weapon-config'].value = job.weaponConfig ? JSON.stringify(job.weaponConfig, null, 2) : '';
  const url = `/models/${encodeURIComponent(job.model)}`;
  if (![...elements.model.options].some(option => option.value === url)) elements.model.add(new Option(job.model, url));
  elements.model.value = url;
}

async function executeBatchJob(job, context) {
  const check = () => { if (context.shouldStop()) throw new BatchPaused(); };
  check();
  applyJobControls(job);
  await loadModel({ throwOnError: true });
  check();
  if (!subject || selectedModel?.file !== job.model) throw new Error('요청한 실제 모델이 불러와지지 않았습니다.');
  if (job.clip !== null) {
    const index = animationClips.findIndex(clip => clip.name === job.clip);
    if (index < 0) throw new Error(`정확한 clip이 없습니다: ${job.clip}`);
    elements.clip.value = String(index);
  } else elements.clip.value = '';
  elements['export-name'].value = job.exportName;
  context.report('실제 GLB 확인 완료 · 방향별 렌더', .1);
  await bakeAtlas({ throwOnError: true, check, report: context.report });
  check();
  if (!baked || baked.source.file !== job.model) throw new Error('실제 렌더 결과가 없습니다.');
  context.report('실제 PNG·metadata 로컬 저장 중', .9);
  // A save already in flight is completed atomically before a stop is honored.
  return await saveAtlas({ throwOnError: true });
}

async function loadBatchPlan() {
  const path = $('batch-path').value.trim();
  if (!/^\/batches\/[a-zA-Z0-9_-]+\.json$/.test(path)) return batchStatus('계획 경로는 /batches/<파일이름>.json이어야 합니다.');
  try {
    batchStatus('로컬 작업 계획과 실제 GLB 목록을 읽는 중…');
    const response = await fetch(path);
    if (!response.ok) throw new Error(response.status === 404 ? '계획 파일이 아직 없습니다. 준비 중입니다.' : '계획 파일을 읽지 못했습니다.');
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024) throw new Error('계획 파일은 2MB 이하여야 합니다.');
    const items = parsePlan(JSON.parse(text));
    const models = await fetch('/api/models').then(response => response.json());
    availableModels = new Set(models.models.map(model => model.name));
    for (const item of items) if (item.status === 'pending' && (!availableModels.has(item.job.model) || item.job.weaponModel && !availableModels.has(item.job.weaponModel))) {
      const missing = availableModels.has(item.job.model) ? item.job.weaponModel : item.job.model;
      item.status = 'skipped'; item.message = `실제 models/${missing} 파일 없음 · 준비 중`;
    }
    batchPlanPath = path;
    checkpointSignature = '';
    createBatchRows(items);
    batchQueue = new BatchQueue(items, { runJob: executeBatchJob, isAvailable: job => availableModels.has(job.model) && (!job.weaponModel || availableModels.has(job.weaponModel)), onChange: renderBatch });
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(`meshy-baker-batch:${path}`)); } catch { /* corrupted checkpoints are ignored */ }
    if (saved) await batchQueue.restore(saved, async (result, job) => {
      if (typeof result.folder !== 'string') return false;
      const response = await fetch(`/api/export-status?folder=${encodeURIComponent(result.folder)}`);
      const status = await response.json();
      return response.ok && status.complete === true && status.sourceFile === job.model;
    });
    renderBatch(batchQueue);
  } catch (error) { batchQueue = null; batchRows = new Map(); $('batch-rows').replaceChildren(); for (const id of ['batch-start', 'batch-stop', 'batch-resume', 'batch-retry']) $(id).disabled = true; batchStatus(error.message); }
}

async function runBatch(mode = 'start') {
  if (!batchQueue || batchRunning || busy) return;
  const selection = mode === 'resume' ? null : selectedBatchIds();
  if (mode !== 'resume' && !selection.length) return batchStatus('실행할 실제 준비 작업을 선택해주세요.');
  batchRunning = true; setBusy(false);
  try {
    if (mode === 'resume') await batchQueue.resume();
    else await batchQueue.start(selection, { retryFailed: mode === 'retry' });
  } finally { batchRunning = false; setBusy(false); renderBatch(batchQueue); }
}

$('batch-load').addEventListener('click', loadBatchPlan);
$('batch-start').addEventListener('click', () => runBatch());
$('batch-stop').addEventListener('click', () => batchQueue?.stop());
$('batch-resume').addEventListener('click', () => runBatch('resume'));
$('batch-retry').addEventListener('click', () => runBatch('retry'));
await refreshModels();
