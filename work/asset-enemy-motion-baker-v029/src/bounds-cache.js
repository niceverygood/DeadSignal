import * as THREE from 'three';

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

