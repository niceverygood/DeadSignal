import { AnimationMixer, LoopOnce, LoopRepeat, Vector3 } from 'three';

export function isOneShot(clip) {
  return /attack|death|die|hit|damage|jump|leap/i.test(clip?.name || '');
}

export function sampleTime(clip, index, count) {
  if (!clip) return 0;
  return clip.duration * index / (isOneShot(clip) && count > 1 ? count - 1 : count);
}

// Direction/normalization/compensation groups stay outside the animated rig.
// Skinning is evaluated before CPU bounds and before the actual GPU alpha pass.
export class AnimationSampler {
  constructor({ root, subject, motion, clips, subjectHeight }) {
    this.root = root;
    this.subject = subject;
    this.motion = motion;
    this.clips = clips;
    this.subjectHeight = subjectHeight;
    this.mixer = clips.length ? new AnimationMixer(root) : null;
    this.rootBone = root.getObjectByName('Hips') || null;
    this.skins = [];
    this.restTransforms = [];
    root.traverse(object => {
      this.restTransforms.push({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() });
      if (!object.isSkinnedMesh) return;
      this.skins.push(object);
      if (!this.rootBone) this.rootBone = object.skeleton.bones.find(bone => !bone.parent?.isBone) || null;
      object.frustumCulled = false;
    });
    this.rootMotionCache = new Map();
  }

  updateSkinPose() {
    this.subject.updateMatrixWorld(true);
    for (const mesh of this.skins) mesh.skeleton.update();
  }

  rootPosition() {
    if (!this.rootBone) return new Vector3();
    const point = this.rootBone.getWorldPosition(new Vector3());
    return this.subject.worldToLocal(point);
  }

  describeRootMotion(index) {
    if (index === null || !this.clips[index] || !this.rootBone) {
      return { bone: null, delta: { x: 0, y: 0, z: 0 }, significant: false, method: 'none', preservesVerticalMotion: true };
    }
    if (this.rootMotionCache.has(index)) return this.rootMotionCache.get(index);
    this.sample(index, 0, { removeRootMotion: false, once: true });
    const start = this.rootPosition();
    this.sample(index, this.clips[index].duration, { removeRootMotion: false, once: true });
    const finish = this.rootPosition();
    const delta = finish.sub(start);
    const positionTrack = this.clips[index].tracks.find(track => track.name === `${this.rootBone.name}.position`);
    const times = positionTrack?.times;
    const result = {
      bone: this.rootBone.name,
      delta: { x: delta.x, y: delta.y, z: delta.z },
      significant: Math.hypot(delta.x, delta.z) > this.subjectHeight * .02,
      method: 'remove net linear XZ travel only; preserve closed-cycle sway and vertical motion',
      preservesVerticalMotion: true,
      timeSpan: { start: times?.[0] || 0, end: times?.[times.length - 1] || this.clips[index].duration },
    };
    this.rootMotionCache.set(index, result);
    return result;
  }

  sample(index, time, { removeRootMotion = true, once = undefined } = {}) {
    const clip = index === null ? null : this.clips[index];
    if (index !== null && !clip) throw new Error('선택한 동작이 모델에 없습니다.');
    const motion = removeRootMotion && clip ? this.describeRootMotion(index) : null;
    this.motion.position.set(0, 0, 0);
    if (this.mixer) {
      this.mixer.stopAllAction();
      for (const rest of this.restTransforms) {
        rest.object.position.copy(rest.position);
        rest.object.quaternion.copy(rest.quaternion);
        rest.object.scale.copy(rest.scale);
      }
      if (clip) {
        const oneShot = once ?? isOneShot(clip);
        const action = this.mixer.clipAction(clip);
        action.reset().setLoop(oneShot ? LoopOnce : LoopRepeat, oneShot ? 1 : Infinity).setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        action.clampWhenFinished = oneShot;
        this.mixer.setTime(Math.max(0, Math.min(time, clip.duration)));
      }
    }
    this.updateSkinPose();
    const startTime = motion?.timeSpan?.start || 0;
    const endTime = motion?.timeSpan?.end || clip?.duration || 0;
    const progress = endTime > startTime ? Math.max(0, Math.min(1, (time - startTime) / (endTime - startTime))) : 0;
    const applied = !!motion?.significant;
    if (applied) {
      this.motion.position.set(-motion.delta.x * progress, 0, -motion.delta.z * progress);
      this.updateSkinPose();
    }
    return { rootMotionRemoved: applied, compensation: this.motion.position.toArray() };
  }

  restForward() {
    this.sample(null, 0, { removeRootMotion: false });
    const head = this.root.getObjectByName('Head');
    const front = this.root.getObjectByName('headfront');
    if (!head || !front) return null;
    const headPoint = this.subject.worldToLocal(head.getWorldPosition(new Vector3()));
    const frontPoint = this.subject.worldToLocal(front.getWorldPosition(new Vector3()));
    return frontPoint.sub(headPoint).normalize().toArray();
  }
}
