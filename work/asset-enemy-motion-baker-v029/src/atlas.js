export const ISO_C = Math.sqrt(3) / 2;
export const ISO_S = .5;
export const CAMERA_ELEVATION = Math.asin(1 / Math.sqrt(3));
export const CAMERA_SCALE = Math.sqrt(3 / 2);
export const MAX_ATLAS_SIZE = 8192;
export const MAX_ATLAS_PIXELS = 32 * 1024 * 1024;
export const MAX_ATLAS_FRAMES = 16 * 32;

/** Preserve existing packing; widen only when the old row count exceeds 8192. */
export function atlasLayout({ directions, samples, frameSize }) {
  if (![8, 16].includes(directions) || ![1, 4, 8, 12, 32].includes(samples) || ![128, 256, 512].includes(frameSize)) throw new Error('방향/프레임/해상도 값이 지원 범위를 벗어났습니다.');
  const total = directions * samples;
  if (total * frameSize * frameSize > MAX_ATLAS_PIXELS) throw new Error('아틀라스가 32MP 제한을 초과합니다. 해상도나 프레임 수를 낮춰주세요.');
  let columns = directions === 16 ? 8 : 4;
  while (Math.ceil(total / columns) * frameSize > MAX_ATLAS_SIZE && columns * frameSize < MAX_ATLAS_SIZE) columns *= 2;
  const rows = Math.ceil(total / columns), width = columns * frameSize, height = rows * frameSize;
  if (width > MAX_ATLAS_SIZE || height > MAX_ATLAS_SIZE || width * height > MAX_ATLAS_PIXELS) throw new Error('아틀라스 크기가 8192px/32MP 제한을 초과합니다.');
  return { total, columns, rows, width, height };
}

export function projectWorld(x, y, z = 0) {
  return { x: (x - y) * ISO_C, y: (x + y) * ISO_S - z };
}

export function modelRotation(angle, frontYaw = 0) {
  return Math.PI / 2 - angle + frontYaw;
}

export function alphaBounds(rgba, width, height, threshold = 8, region = null) {
  const area = region || { x: 0, y: 0, width, height };
  const x0 = Math.max(0, Math.floor(area.x));
  const y0 = Math.max(0, Math.floor(area.y));
  const x1 = Math.min(width, Math.ceil(area.x + area.width));
  const y1 = Math.min(height, Math.ceil(area.y + area.height));
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (rgba[(y * width + x) * 4 + 3] < threshold) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function bodyAlpha(rgba) {
  const mask = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    mask[i] = mask[i + 1] = mask[i + 2] = 255;
    mask[i + 3] = rgba[i + 3];
  }
  return mask;
}

// Same frame-local pre-weapon contour contract as game production-art.js.
// Store exact row edges once; the runtime can avoid decoding a full alpha atlas.
export function bodyIdentificationContour(rgba, width, height, body, core, threshold = 8) {
  if (!rgba || rgba.length !== width * height * 4 || !body || !Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return null;
  const left = [], right = [];
  const top = Math.max(0, Math.floor(body.y));
  const bottom = Math.min(height, Math.floor(core ? core.y + core.height : body.y + body.height * .72));
  const x0 = Math.max(0, Math.floor(body.x)), x1 = Math.min(width, Math.ceil(body.x + body.width));
  for (let y = top; y < bottom; y++) {
    let min = -1, max = -1;
    for (let x = x0; x < x1; x++) if (rgba[(y * width + x) * 4 + 3] >= threshold) { if (min < 0) min = x; max = x; }
    if (min >= 0) { left.push({ x: min, y: y + .5 }); right.push({ x: max + 1, y: y + .5 }); }
  }
  return left.length > 1 ? { left, right, top: [left[0], right[0]] } : null;
}

export function coreBounds(rgba, width, height, body, proportions = [.15, .18, .85, .72]) {
  if (!body) return null;
  const [left, top, right, bottom] = proportions;
  return alphaBounds(rgba, width, height, 24, {
    x: body.x + body.width * left,
    y: body.y + body.height * top,
    width: body.width * (right - left), height: body.height * (bottom - top),
  });
}

export function withOutline(rgba, width, height, radius = 1.2, color = [24, 28, 30]) {
  const result = new Uint8ClampedArray(rgba.length);
  const reach = Math.ceil(radius + .5);
  const offsets = [];
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const coverage = Math.min(1, Math.max(0, radius + .5 - Math.hypot(dx, dy)));
    if (coverage > 0) offsets.push([dx, dy, coverage]);
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const body = rgba[i + 3] / 255;
    let dilated = body;
    for (const [dx, dy, coverage] of offsets) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      dilated = Math.max(dilated, rgba[(yy * width + xx) * 4 + 3] / 255 * coverage);
    }
    const ink = radius > 0 ? dilated * (1 - body) : 0;
    const alpha = body + ink;
    if (alpha > 0) for (let channel = 0; channel < 3; channel++) {
      result[i + channel] = (rgba[i + channel] * body + color[channel] * ink) / alpha;
    }
    result[i + 3] = alpha * 255;
  }
  return result;
}

export function relativeBounds(box, pivot, density = 1) {
  if (!box) return null;
  return {
    left: (box.x - pivot.x) / density, top: (box.y - pivot.y) / density,
    right: (box.x + box.width - pivot.x) / density,
    bottom: (box.y + box.height - pivot.y) / density,
  };
}

export function fitProjection(boxes, frameSize, padding) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const box of boxes) for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const projected = projectWorld(x, z, y);
      left = Math.min(left, projected.x); right = Math.max(right, projected.x);
      top = Math.min(top, projected.y); bottom = Math.max(bottom, projected.y);
    }
  }
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
    throw new Error('모델의 유효한 몸체 범위를 찾지 못했습니다.');
  }
  const density = Math.min((frameSize - padding * 2) / (right - left), (frameSize - padding * 2) / (bottom - top));
  return { density, pivot: { x: (frameSize - (right + left) * density) / 2, y: (frameSize - (bottom + top) * density) / 2 }, projectedBounds: { left, top, right, bottom } };
}
