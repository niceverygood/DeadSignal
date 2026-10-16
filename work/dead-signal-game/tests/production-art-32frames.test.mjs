import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { animationSample, validateAtlasMetadata, selectAtlasFrame, ProductionPoseClock, ProductionArt } from '../dist/production-art.js';

const TAU = Math.PI * 2;
const actual = JSON.parse(await readFile(new URL('../dist/assets/production/survivor-shotgun-walk/metadata.json', import.meta.url), 'utf8'));
const baseURL = 'https://game.example/assets/production/';
const manifest = { assets: { walk: { metadata: 'survivor-walk/metadata.json', atlas: 'survivor-walk/atlas.png' } }, characters: { survivor: { walk: 'walk' } }, bosses: {}, enemies: {}, environment: {} };

// A schema/layout fixture made from actual native bounds, contours and muzzle
// records. This does not invent or claim to validate newly baked image pixels.
function nativeTable({ samples = 32, directions = 16, columns = 16, frameSize = 256 } = {}) {
  const value = structuredClone(actual), rows = Math.ceil(directions * samples / columns);
  Object.assign(value.atlas, { samples, directions, columns, rows, frameSize, width: columns * frameSize, height: rows * frameSize });
  value.animation.samples = samples;
  value.frames = Array.from({ length: directions * samples }, (_, index) => {
    const direction = Math.floor(index / samples), sample = index % samples;
    const original = actual.frames[direction * actual.atlas.samples + Math.floor(sample / samples * actual.atlas.samples)];
    return { ...structuredClone(original), index, direction, sample, angle: direction * TAU / directions,
      time: value.animation.duration * sample / samples,
      rect: { x: index % columns * frameSize, y: Math.floor(index / columns) * frameSize, width: frameSize, height: frameSize } };
  });
  return value;
}

function loader(source, { text = JSON.stringify(source) } = {}) {
  const calls = { images: 0, fetches: [], urls: [] };
  class Image {
    constructor() { calls.images++; this.naturalWidth = source.atlas.width; this.naturalHeight = source.atlas.height; }
    set src(url) { calls.urls.push(url); queueMicrotask(() => this.onload?.()); }
  }
  const art = new ProductionArt({ manifest, baseURL, ImageCtor: Image, fetchImpl: async url => {
    calls.fetches.push(url); return { ok: true, text: async () => text };
  } });
  return { art, calls };
}

test('a native 16-direction 32-sample table loads all 512 combined-weapon contours at the existing pixel limit', async () => {
  const source = nativeTable(), raw = JSON.stringify(source);
  assert.equal(source.frames.length, 512);
  assert.deepEqual([source.atlas.width, source.atlas.height], [4096, 8192]);
  assert.equal(source.atlas.width * source.atlas.height, 32 * 1024 * 1024);
  assert.ok(raw.length > 2 * 1024 * 1024 && raw.length < 8 * 1024 * 1024, 'actual native contour records exercise the formerly too-small loader limit');
  const { art, calls } = loader(source);
  const pending = art.load('walk');
  assert.equal(art.load('walk'), pending);
  assert.equal(await pending, true);
  const record = art.get('walk');
  assert.equal(record.metadata.frames.length, 512);
  assert.equal(art.hasIdentificationContours('walk'), true);
  assert.equal(await art.loadBodyAlpha('walk'), true);
  assert.equal(calls.images, 1, 'ready baked contours require no extra pixel-mask PNG');
  assert.equal(calls.fetches.length, 1);
  for (const frame of record.metadata.frames) {
    assert.ok(frame.bodyIdentificationContour.left.length > 1);
    assert.ok(Object.values(frame.weaponMuzzle).every(Number.isFinite));
    assert.ok(frame.rect.x >= 0 && frame.rect.x + frame.rect.width <= source.atlas.width);
    assert.ok(frame.rect.y >= 0 && frame.rect.y + frame.rect.height <= source.atlas.height);
  }
  assert.ok(Object.isFrozen(record.metadata.frames[511]));
  assert.equal(JSON.stringify(source), raw, 'validation and loading do not mutate producer metadata');
});

test('33 samples, either oversized axis, and a 64MP table remain rejected before image decoding', async () => {
  const invalid = [
    ['33 samples inside all image limits', nativeTable({ samples: 33, directions: 8 })],
    ['height over 8192 at exactly 32MP', nativeTable({ columns: 8 })],
    ['width over 8192 at exactly 32MP', nativeTable({ columns: 64 })],
    ['64MP with both axes 8192', nativeTable({ samples: 16, frameSize: 512 })],
  ];
  assert.ok(invalid[0][1].atlas.width <= 8192 && invalid[0][1].atlas.height <= 8192);
  assert.ok(invalid[0][1].atlas.width * invalid[0][1].atlas.height < 32 * 1024 * 1024);
  for (const [label, source] of invalid) {
    assert.throws(() => validateAtlasMetadata(source), /invalid-atlas-metadata/, label);
    const { art, calls } = loader(source);
    assert.equal(await art.load('walk'), false, label);
    assert.equal(art.get('walk'), null, label);
    assert.equal(calls.images, 0, `${label}: invalid metadata cannot allocate an atlas image`);
  }
});

test('32-frame phase and native-time sampling visit every sample in every direction and wrap without gaps', () => {
  const source = validateAtlasMetadata(nativeTable()), duration = source.animation.duration;
  for (let direction = 0; direction < 16; direction++) {
    const visited = new Set();
    for (let sample = 0; sample < 32; sample++) {
      const phase = TAU * (sample + .5) / 32;
      const selected = selectAtlasFrame(source, { angle: direction * TAU / 16, phase });
      assert.equal(selected.index, direction * 32 + sample);
      assert.equal(selected.sample, sample); visited.add(selected.sample);
      assert.equal(animationSample(source, { timeSeconds: duration * (sample + .5) / 32 }), sample);
      if (sample > 0) {
        assert.equal(animationSample(source, { phase: TAU * sample / 32 - 1e-7 }), sample - 1);
        assert.equal(animationSample(source, { phase: TAU * sample / 32 + 1e-7 }), sample);
      }
    }
    assert.equal(visited.size, 32);
  }
  assert.equal(animationSample(source, { phase: -1e-7 }), 31);
  assert.equal(animationSample(source, { phase: TAU + 1e-7 }), 0);
  for (const angle of [NaN, Infinity, -Infinity, -TAU * 4, TAU * 4, -1e-7, TAU - 1e-7]) {
    for (const phase of [NaN, Infinity, -Infinity, -TAU, 0, TAU, 1e100]) {
      const selected = selectAtlasFrame(source, { angle, phase });
      assert.ok(Number.isInteger(selected.index) && selected.index >= 0 && selected.index < 512);
    }
  }
});

test('the grounded pose clock reaches all 32 samples and freezes repeated paused draws without actor writes', () => {
  const source = validateAtlasMetadata(nativeTable()), clock = new ProductionPoseClock();
  const actor = { x: 1200, y: 930, walkPhase: 2.4, dashTime: 0 };
  const options = { runThreshold: 214 * 1.15, gait: { referenceSpeed: 214, walkDuration: source.animation.duration, runDuration: .6666666865 } };
  clock.select(actor, 0, options);
  const samples = new Set();
  let selected, time = 0;
  for (let step = 1; step <= 128; step++) {
    time = source.animation.duration * step / 128;
    actor.x = 1200 + 214 * time;
    const before = JSON.stringify(actor);
    selected = clock.select(actor, time, options);
    assert.equal(selected.pose, 'walk');
    samples.add(animationSample(source, selected));
    assert.equal(JSON.stringify(actor), before);
  }
  assert.equal(samples.size, 32);
  for (let render = 0; render < 100; render++) assert.equal(clock.select(actor, time, options), selected);
  const stopped = clock.select(actor, time + 1, options);
  assert.equal(stopped.pose, 'idle'); assert.equal(stopped.phase, selected.phase);
  assert.equal(selectAtlasFrame(source, { phase: stopped.phase, stationary: true }).sample, 0);
  assert.equal(clock.select(actor, 0, options).phase, 0);
  assert.equal(actor.walkPhase, 2.4);
});

test('the metadata text limit accepts exactly 8MiB and rejects one extra character before JSON parsing or PNG allocation', async () => {
  const source = nativeTable({ samples: 1, directions: 8 }), limit = 8 * 1024 * 1024;
  source.testPadding = '';
  source.testPadding = ' '.repeat(limit - JSON.stringify(source).length);
  const exact = JSON.stringify(source);
  assert.equal(exact.length, limit);
  const good = loader(source, { text: exact });
  assert.equal(await good.art.load('walk'), true);
  assert.equal(good.calls.images, 1);
  good.art.releaseUnusedAssets([]);
  const bad = loader(source, { text: `${exact} ` });
  assert.equal(await bad.art.load('walk'), false);
  assert.equal(bad.art.records.get('walk').error, 'atlas-metadata-too-large');
  assert.equal(bad.calls.images, 0);
});
