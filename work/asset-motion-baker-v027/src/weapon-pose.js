import { Quaternion, Vector3 } from 'three';

function position(bone) {
  return bone.getWorldPosition(new Vector3());
}

function rotateWorld(bone, rotation) {
  const desired = rotation.clone().multiply(bone.getWorldQuaternion(new Quaternion()));
  const parent = bone.parent.getWorldQuaternion(new Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(desired).normalize());
  bone.updateWorldMatrix(true, true);
}

// Analytic two-bone IK uses the actual imported joint lengths and transforms.
// It modifies rotations only; no bones are scaled or translated to force reach.
export function solveArm(upper, forearm, hand, requestedTarget, pole) {
  const shoulder = position(upper), elbow = position(forearm), wrist = position(hand);
  const upperLength = shoulder.distanceTo(elbow), lowerLength = elbow.distanceTo(wrist);
  const delta = requestedTarget.clone().sub(shoulder);
  const requestedDistance = delta.length();
  if (upperLength < 1e-6 || lowerLength < 1e-6 || requestedDistance < 1e-6) return null;
  const axis = delta.normalize();
  const minimum = Math.abs(upperLength - lowerLength) + 1e-5;
  const maximum = upperLength + lowerLength - 1e-5;
  const distance = Math.min(maximum, Math.max(minimum, requestedDistance));
  const target = shoulder.clone().addScaledVector(axis, distance);
  let bend = pole.clone().addScaledVector(axis, -pole.dot(axis));
  if (bend.lengthSq() < 1e-8) bend = new Vector3(0, -1, 0).addScaledVector(axis, axis.y);
  bend.normalize();
  const cosine = Math.min(1, Math.max(-1, (distance * distance + upperLength * upperLength - lowerLength * lowerLength) / (2 * distance * upperLength)));
  const wantedElbow = shoulder.clone().addScaledVector(axis, upperLength * cosine).addScaledVector(bend, upperLength * Math.sqrt(1 - cosine * cosine));
  rotateWorld(upper, new Quaternion().setFromUnitVectors(elbow.sub(shoulder).normalize(), wantedElbow.clone().sub(shoulder).normalize()));
  const newElbow = position(forearm), newWrist = position(hand);
  rotateWorld(forearm, new Quaternion().setFromUnitVectors(newWrist.sub(newElbow).normalize(), target.clone().sub(newElbow).normalize()));
  return { requestedTarget, target, actual: position(hand), clamped: Math.abs(distance - requestedDistance) > 1e-4, upperLength, lowerLength };
}

export function applyWeaponReadyPose({ root, subject, gripHeight = null, supportOffset = null }) {
  const names = ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'Spine'];
  const bones = Object.fromEntries(names.map(name => [name, root.getObjectByName(name)]));
  if (names.some(name => !bones[name]?.isBone)) return { supported: false, reason: 'required arm chain is absent' };
  subject.updateMatrixWorld(true);
  const local = object => subject.worldToLocal(position(object));
  const leftShoulder = local(bones.LeftArm), rightShoulder = local(bones.RightArm);
  const chest = local(bones.Spine);
  const widths = leftShoulder.distanceTo(rightShoulder);
  const leftLength = leftShoulder.distanceTo(local(bones.LeftForeArm)) + local(bones.LeftForeArm).distanceTo(local(bones.LeftHand));
  const rightLength = rightShoulder.distanceTo(local(bones.RightForeArm)) + local(bones.RightForeArm).distanceTo(local(bones.RightHand));
  const reach = (leftLength + rightLength) / 2;
  const coupled = supportOffset && ['x', 'y', 'z'].every(axis => Number.isFinite(supportOffset[axis]));
  const height = Number.isFinite(gripHeight) ? gripHeight : (leftShoulder.y + rightShoulder.y) / 2 - reach * (coupled ? .3 : .45);
  const targets = {
    Right: new Vector3(chest.x - widths * .1, height, chest.z + reach * .32),
    Left: new Vector3(chest.x + widths * .08, height, chest.z + reach * .68),
  };
  let coupledReachable = null;
  if (coupled) {
    const right = targets.Right;
    right.z = chest.z + reach * .12;
    const forwardRange = (shoulder, length, x, y) => {
      const remaining = (length * .98) ** 2 - (x - shoulder.x) ** 2 - (y - shoulder.y) ** 2;
      return remaining > 0 ? Math.sqrt(remaining) : -1;
    };
    const rightReach = forwardRange(rightShoulder, rightLength, right.x, right.y);
    const leftReach = forwardRange(leftShoulder, leftLength, right.x + supportOffset.x, right.y + supportOffset.y);
    const minimumZ = Math.max(rightShoulder.z - rightReach, leftShoulder.z - supportOffset.z - leftReach);
    const maximumZ = Math.min(rightShoulder.z + rightReach, leftShoulder.z - supportOffset.z + leftReach);
    coupledReachable = rightReach >= 0 && leftReach >= 0 && minimumZ <= maximumZ;
    if (coupledReachable) right.z = Math.max(minimumZ, Math.min(maximumZ, right.z));
    targets.Left = right.clone().add(new Vector3(supportOffset.x, supportOffset.y, supportOffset.z));
  } else if (!Number.isFinite(gripHeight)) {
    for (const [side, shoulder, length] of [['Right', rightShoulder, rightLength], ['Left', leftShoulder, leftLength]]) {
      const target = targets[side];
      const lateral = target.x - shoulder.x, vertical = target.y - shoulder.y;
      const forwardReach = Math.sqrt(Math.max(0, (length * .92) ** 2 - lateral * lateral - vertical * vertical));
      target.z = Math.min(target.z, shoulder.z + forwardReach);
    }
  }
  const forward = new Vector3(0, 0, 1).transformDirection(subject.matrixWorld);
  const result = {};
  for (const [side, sign] of [['Right', -1], ['Left', 1]]) {
    const upper = bones[`${side}Arm`], forearm = bones[`${side}ForeArm`], hand = bones[`${side}Hand`];
    const target = subject.localToWorld(targets[side].clone());
    const pole = new Vector3(sign, -.7, 0).transformDirection(subject.matrixWorld);
    const solved = solveArm(upper, forearm, hand, target, pole);
    if (!solved) return { supported: false, reason: 'arm lengths cannot be evaluated' };
    // Imported hand +Y follows its finger direction. Align it with the barrel
    // forward vector without predicting an Euler angle for this skeleton.
    const handForward = new Vector3(0, 1, 0).applyQuaternion(hand.getWorldQuaternion(new Quaternion()));
    rotateWorld(hand, new Quaternion().setFromUnitVectors(handForward.normalize(), forward));
    const actual = subject.worldToLocal(position(hand));
    result[side.toLowerCase()] = {
      position: { x: actual.x, y: actual.y, z: actual.z },
      requested: { x: targets[side].x, y: targets[side].y, z: targets[side].z },
      clamped: solved.clamped,
      error: actual.distanceTo(targets[side]),
    };
  }
  subject.updateMatrixWorld(true);
  return {
    supported: true, method: 'two-bone IK from actual arm joint lengths; no scale or translation',
    desiredGripHeight: height, right: result.right, left: result.left,
    coupledSupport: coupled ? { offset: { ...supportOffset }, reachable: coupledReachable } : null,
    weaponAnchor: { ...result.right.position, forward: { x: 0, y: 0, z: 1 }, support: result.left.position },
    fingerRig: false, weaponGeometryAdded: false,
  };
}
