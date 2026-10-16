import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { OrthographicCamera, Vector3, Box3, Group } from 'three';
import { CAMERA_SCALE, projectWorld, modelRotation, fitProjection, alphaBounds, bodyAlpha, coreBounds, relativeBounds, withOutline } from '../src/atlas.js';
import { createBakerServer, decodePNG } from '../server.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('actual Three camera matches game isometric projection with fixed foot pivot', () => {
  const width = 256, height = 256, pivot = { x: 121, y: 210 }, density = 2.7, k = density * CAMERA_SCALE;
  const camera = new OrthographicCamera(-pivot.x / k, (width - pivot.x) / k, pivot.y / k, (pivot.y - height) / k, .1, 10000);
  camera.position.set(1000, 1000, 1000); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  for (const x of [-49, 0, 27, 1200]) for (const y of [-70, 0, 49, 930]) for (const z of [0, 22, 72]) {
    const actual = new Vector3(x, z, y).project(camera);
    const expected = projectWorld(x, y, z);
    near((actual.x + 1) * width / 2, pivot.x + density * expected.x);
    near((1 - actual.y) * height / 2, pivot.y + density * expected.y);
  }
});

test('all sixteen world headings preserve +Z model forward and exact screen direction', () => {
  for (let direction = 0; direction < 16; direction++) {
    const angle = direction * Math.PI * 2 / 16;
    const group = new Group(); group.rotation.y = modelRotation(angle);
    group.updateMatrixWorld(true);
    const forward = new Vector3(0, 0, 1).applyMatrix4(group.matrixWorld);
    near(forward.x, Math.cos(angle)); near(forward.z, Math.sin(angle));
    const projected = projectWorld(forward.x, forward.z);
    const expected = projectWorld(Math.cos(angle), Math.sin(angle));
    near(projected.x, expected.x); near(projected.y, expected.y);
  }
});

test('one union fit keeps every pose inside padding without changing a shared pivot', () => {
  const boxes = [new Box3(new Vector3(-30, 0, -20), new Vector3(40, 72, 30)), new Box3(new Vector3(-60, -4, -25), new Vector3(30, 85, 27))];
  const original = boxes.map(box => [box.min.toArray(), box.max.toArray()]);
  const fit = fitProjection(boxes, 256, 24);
  for (const box of boxes) for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const projected = projectWorld(x, z, y);
    const px = fit.pivot.x + projected.x * fit.density, py = fit.pivot.y + projected.y * fit.density;
    assert.ok(px >= 24 - 1e-8 && px <= 232 + 1e-8);
    assert.ok(py >= 24 - 1e-8 && py <= 232 + 1e-8);
  }
  assert.deepEqual(boxes.map(box => [box.min.toArray(), box.max.toArray()]), original);
  assert.throws(() => fitProjection([], 256, 24));
});

test('outline leaves opaque baseColor intact and keeps the body mask separate', () => {
  const source = new Uint8ClampedArray(9 * 9 * 4);
  const center = (4 * 9 + 4) * 4;
  source.set([210, 156, 40, 255], center);
  const original = source.slice();
  const outlined = withOutline(source, 9, 9, 1.2);
  const mask = bodyAlpha(source);
  assert.deepEqual([...outlined.slice(center, center + 4)], [210, 156, 40, 255]);
  assert.ok(outlined[(4 * 9 + 3) * 4 + 3] > 0);
  assert.deepEqual([...outlined.slice((4 * 9 + 3) * 4, (4 * 9 + 3) * 4 + 3)], [24, 28, 30]);
  assert.equal(mask[(4 * 9 + 3) * 4 + 3], 0);
  assert.deepEqual(alphaBounds(mask, 9, 9), { x: 4, y: 4, width: 1, height: 1 });
  assert.deepEqual(withOutline(source, 9, 9, 0), source);
  assert.deepEqual(source, original);
});

test('core bounds use actual occupied alpha and projected bounds retain foot-relative units', () => {
  const source = new Uint8ClampedArray(20 * 30 * 4);
  for (let y = 3; y <= 25; y++) for (let x = 6; x <= 12; x++) source[(y * 20 + x) * 4 + 3] = 255;
  source[(8 * 20 + 2) * 4 + 3] = 255;
  const body = alphaBounds(source, 20, 30);
  const core = coreBounds(source, 20, 30, body, [.3, .2, .9, .7]);
  assert.ok(core.x >= 6 && core.x + core.width <= 13);
  assert.ok(core.y > 3 && core.y + core.height < 26);
  assert.deepEqual(relativeBounds({ x: 6, y: 8, width: 7, height: 10 }, { x: 10, y: 25 }, 2), { left: -2, top: -8.5, right: 1.5, bottom: -3.5 });
  assert.equal(alphaBounds(new Uint8ClampedArray(16), 2, 2), null);
  assert.equal(coreBounds(source, 20, 30, null), null);
});

function crc32(buffer) {
  let result = 0xffffffff;
  for (const byte of buffer) {
    result ^= byte;
    for (let bit = 0; bit < 8; bit++) result = (result >>> 1) ^ ((result & 1) ? 0xedb88320 : 0);
  }
  return (result ^ 0xffffffff) >>> 0;
}

function rgbaPNG(width, height) {
  const chunk = (type, contents) => {
    const result = Buffer.alloc(contents.length + 12);
    result.writeUInt32BE(contents.length, 0); result.write(type, 4); contents.copy(result, 8);
    result.writeUInt32BE(crc32(result.subarray(4, 8 + contents.length)), 8 + contents.length);
    return result;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  const buffer = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

test('local HTTP button export writes exact RGBA PNG and metadata; rejects foreign origin and traversal', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'meshy-baker-test-'));
  await mkdir(path.join(root, 'models')); await mkdir(path.join(root, 'exports'));
  const server = createBakerServer({ root });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const models = await fetch(`${origin}/api/models`).then(response => response.json());
  assert.deepEqual(models, { models: [] });
  const image = rgbaPNG(8, 8);
  const metadata = { format: 'meshy-iso-sprite-atlas', version: 1, source: { format: 'glb', file: 'validation.glb' }, atlas: { width: 8, height: 8 }, frames: [{ index: 0 }] };
  const body = { name: '../../safe-name', atlas: image, alpha: image, metadata };
  const blocked = await fetch(`${origin}/api/export`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://example.com' }, body: JSON.stringify(body) });
  assert.equal(blocked.status, 403);
  const traversal = await fetch(`${origin}/models/%2e%2e%2fserver.mjs`);
  assert.equal(traversal.status, 403);
  const response = await fetch(`${origin}/api/export`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  const exported = await response.json();
  assert.ok(exported.directory.startsWith(path.join(root, 'exports') + path.sep));
  assert.deepEqual(await readFile(path.join(exported.directory, 'atlas.png')), decodePNG(image).buffer);
  const saved = JSON.parse(await readFile(path.join(exported.directory, 'metadata.json'), 'utf8'));
  assert.equal(saved.frames.length, 1); assert.equal(saved.files.bodyAlpha, 'body-alpha.png');
  const verified = await fetch(`${origin}/api/export-status?folder=${encodeURIComponent(exported.folder)}`).then(response => response.json());
  assert.equal(verified.complete, true); assert.equal(verified.sourceFile, 'validation.glb');
  assert.deepEqual(verified.atlas, { width: 8, height: 8 });
  const served = await fetch(origin + exported.urls.atlas);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), decodePNG(image).buffer);
  const malformed = await fetch(`${origin}/api/export`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, alpha: rgbaPNG(9, 8) }) });
  assert.equal(malformed.status, 400);
});

test('PNG validation bounds dimensions and requires real RGBA header', () => {
  assert.equal(decodePNG(rgbaPNG(8, 9)).height, 9);
  assert.throws(() => decodePNG('data:image/png;base64,AAAA'));
  assert.throws(() => decodePNG('not-an-image'));
  const oversized = decodePNG(rgbaPNG(1, 1)).buffer;
  oversized.writeUInt32BE(8193, 16);
  assert.throws(() => decodePNG(`data:image/png;base64,${oversized.toString('base64')}`));
});
