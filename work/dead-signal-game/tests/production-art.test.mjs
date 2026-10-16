import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { directionIndex, animationSample, validateAtlasMetadata, selectAtlasFrame, spritePlacement, spriteAttachmentPlacement, nativeGroundFootprint, propPlacement, frameVisibility, extendProductionAssets, ProductionPoseClock, ProductionArt, productionAssets } from '../dist/production-art.js';

const TAU = Math.PI * 2;
// Contract data uses the real v1 pilot's density, fixed foot pivot and body/core
// measurements. No image is manufactured by these tests.
function metadata(samples = 1, loop = true) {
  const columns = 8, frameSize = 512, directions = 16;
  const footPivot = { x: 256, y: 394.0415506214063 };
  return {
    format: 'meshy-iso-sprite-atlas', version: 1,
    projection: { azimuthDegrees: 45, elevationDegrees: 35.26438968275467, cameraScale: Math.sqrt(3 / 2), pixelsPerWorld: 6.274615937336651, footPivot, subjectHeight: 44 },
    atlas: { width: 4096, height: Math.ceil(directions * samples / columns) * frameSize, columns, rows: Math.ceil(directions * samples / columns), frameSize, directions, samples, order: 'direction-major, sample-minor', transparent: true },
    animation: samples === 1 ? null : { name: 'Running', duration: 1.2, loop, samples },
    frames: Array.from({ length: directions * samples }, (_, index) => ({
      index, direction: Math.floor(index / samples), sample: index % samples,
      angle: Math.floor(index / samples) * TAU / directions,
      rect: { x: index % columns * frameSize, y: Math.floor(index / columns) * frameSize, width: frameSize, height: frameSize },
      footPivot: { ...footPivot }, alphaBounds: { x: 186, y: 122, width: 187, height: 313 },
      outlineBounds: { x: 183, y: 119, width: 193, height: 319 },
      coreBounds: { x: 214, y: 178, width: 131, height: 170 }, clipped: false,
    })),
  };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const manifest = () => ({ assets: { run: { metadata: 'survivor-run/metadata.json', atlas: 'survivor-run/atlas.png' }, idle: { metadata: 'survivor-idle/metadata.json', atlas: 'survivor-idle/atlas.png' } }, characters: { survivor: { idle: 'idle', run: 'run' } }, bosses: {}, enemies: {}, environment: {} });
const baseURL = 'https://game.example/assets/production/';

function imageClass({ width = 4096, height = 4096, fail = false } = {}) {
  return class {
    constructor() { this.naturalWidth = width; this.naturalHeight = height; }
    set src(value) { this.url = value; queueMicrotask(() => fail ? this.onerror?.() : this.onload?.()); }
  };
}
function fetchMetadata(value = metadata(4)) {
  return async () => ({ ok: true, text: async () => JSON.stringify(value) });
}
function context() {
  return {
    globalAlpha: .8, imageSmoothingEnabled: false, imageSmoothingQuality: 'low', draws: [], stack: [],
    save() { this.stack.push([this.globalAlpha, this.imageSmoothingEnabled, this.imageSmoothingQuality]); },
    restore() { [this.globalAlpha, this.imageSmoothingEnabled, this.imageSmoothingQuality] = this.stack.pop(); },
    drawImage(...args) { this.draws.push({ args, alpha: this.globalAlpha }); },
  };
}

test('world-facing directions wrap correctly and do not use the distorted screen angle', () => {
  for (const [angle, expected] of [[0, 0], [Math.PI / 2, 4], [Math.PI, 8], [-Math.PI / 2, 12], [TAU, 0], [-TAU, 0], [TAU - .001, 0], [Math.PI / 4, 2], [Math.PI * 1.25, 10]]) {
    assert.equal(directionIndex(angle), expected);
    assert.equal(directionIndex(angle + TAU * 5), expected);
  }
  assert.equal(directionIndex(Math.PI / 8 - .001), 1);
  assert.equal(directionIndex(-Math.PI / 8), 15);
  assert.equal(directionIndex(Math.PI / 2, 8), 2);
  assert.equal(directionIndex(NaN), 0);
  const selected = selectAtlasFrame(metadata(4), { angle: -Math.PI / 2, phase: Math.PI });
  assert.equal(selected.direction, 12); assert.equal(selected.sample, 2); assert.equal(selected.index, 50);
});

test('looping gait uses the saved distance phase; stationary and one-shot samples stop correctly', () => {
  const running = metadata(4);
  for (const [phase, expected] of [[0, 0], [Math.PI / 2, 1], [Math.PI, 2], [Math.PI * 1.5, 3], [TAU, 0], [-Math.PI / 2, 3]]) {
    assert.equal(animationSample(running, { phase }), expected);
  }
  assert.equal(animationSample(running, { phase: Math.PI, stationary: true }), 0);
  assert.equal(animationSample(running, { timeSeconds: .91 }), 3);
  assert.equal(animationSample(running, { timeSeconds: 1.2 }), 0);
  assert.equal(animationSample(metadata(), { phase: Math.PI }), 0);
  const once = metadata(4, false);
  assert.equal(animationSample(once, { timeSeconds: -.1 }), 0);
  assert.equal(animationSample(once, { timeSeconds: .8 }), 2);
  assert.equal(animationSample(once, { timeSeconds: 1.2 }), 3);
  assert.equal(animationSample(once, { timeSeconds: 200 }), 3);
});

test('the fixed foot pivot cancels source padding and preserves world scale and body/core separation', () => {
  const source = validateAtlasMetadata(metadata());
  const foot = { x: 230, y: 1065 };
  const placed = spritePlacement(source, source.frames[0], { foot, worldHeight: 44 });
  near(placed.x + source.frames[0].footPivot.x * placed.scale, foot.x);
  near(placed.y + source.frames[0].footPivot.y * placed.scale, foot.y);
  near(placed.width, 512 / 6.274615937336651);
  near(placed.bounds.body.top, foot.y - 43.3558887648633);
  near(placed.bounds.core.top, foot.y - 34.431039728801025);
  assert.ok(placed.bounds.outline.left < placed.bounds.body.left);
  assert.ok(placed.bounds.core.left > placed.bounds.body.left);
  assert.equal(placed.depth, foot.y);
  const doubled = spritePlacement(source, source.frames[0], { foot, worldHeight: 88 });
  near(doubled.width, placed.width * 2); near(doubled.y - foot.y, (placed.y - foot.y) * 2);
  assert.equal(spritePlacement(source, source.frames[0], { foot, worldHeight: NaN }), null);
  assert.equal(spritePlacement(source, source.frames[0], { foot: { x: Infinity, y: 0 } }), null);
});

test('the render-only pose clock observes actual movement and freezes under repeated paused renders', () => {
  const clock = new ProductionPoseClock(), actor = { x: 10, y: 20, walkPhase: .1 };
  assert.deepEqual(clock.select(actor, 0), { pose: 'idle', phase: .1 });
  actor.x = 14; actor.walkPhase = Math.PI;
  const running = clock.select(actor, .1);
  assert.deepEqual(running, { pose: 'run', phase: Math.PI });
  for (let i = 0; i < 20; i++) assert.equal(clock.select(actor, .1), running);
  assert.equal(clock.select(actor, .2).pose, 'idle', 'aiming or pushing against a wall does not play running');
  actor.y += 3; actor.walkPhase = 4;
  assert.equal(clock.select(actor, .3).pose, 'run');
  assert.equal(clock.select(actor, .05).pose, 'idle', 'a restored/backward simulation clock resets the pose');
  clock.reset(actor); assert.equal(clock.select(actor, .1).pose, 'idle');
  assert.deepEqual(Object.keys(actor).sort(), ['walkPhase', 'x', 'y']);
});

test('loader accepts validated real-atlas format, deduplicates loads, and draws into an already projected context', async () => {
  const requests = [], transitions = [];
  const art = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: async (url, options) => { requests.push({ url, options }); return fetchMetadata()(url); }, ImageCtor: imageClass(), onChange: change => transitions.push(change.status) });
  const first = art.load('run'); assert.equal(art.load('run'), first);
  assert.equal(await first, true); assert.equal(art.isReady('run'), true);
  assert.deepEqual(transitions, ['loading', 'ready']); assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${baseURL}survivor-run/metadata.json`);
  assert.equal(requests[0].options.mode, 'same-origin');
  assert.equal(art.get('run').image.crossOrigin, 'anonymous');
  assert.equal(Object.isFrozen(art.get('run').metadata.frames[0]), true);
  const canvas = context();
  assert.equal(art.draw(canvas, 'run', { foot: { x: 230, y: 1065 }, angle: Math.PI / 2, phase: Math.PI, alpha: .74 }), true);
  const draw = canvas.draws[0]; assert.equal(draw.args[1], 1024); assert.equal(draw.args[2], 1024);
  assert.equal(draw.args[3], 512); assert.equal(draw.args[4], 512); near(draw.alpha, .8 * .74);
  assert.equal(canvas.globalAlpha, .8); assert.equal(canvas.imageSmoothingEnabled, false); assert.equal(canvas.imageSmoothingQuality, 'low');
  assert.equal(art.draw(canvas, 'missing', { foot: { x: 1, y: 2 } }), false);
  assert.equal(canvas.draws.length, 1);
});

test('a character uses the existing world foot, aiming direction and walkPhase without changing simulation or RNG', async () => {
  const game = new Game({ seed: 8391 });
  game.enemies = []; game.spawnClock = 1e9;
  const art = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: fetchMetadata(), ImageCtor: imageClass() });
  await art.loadCharacter('survivor'); assert.equal(art.isCharacterReady('survivor'), true);
  art.characterFrame('survivor', game.player, { simulationTime: game.time });
  game.tick(.05, { moveX: 1, moveY: 0, aimX: game.player.x, aimY: game.player.y - 200 });
  const before = JSON.stringify(game.snapshot()), random = Math.random, now = Date.now;
  try {
    Math.random = () => { throw new Error('Production rendering cannot use randomness'); };
    Date.now = () => { throw new Error('Production rendering cannot use wall time'); };
    const selected = art.characterFrame('survivor', game.player, { simulationTime: game.time, worldHeight: 44 });
    assert.equal(selected.id, 'run'); assert.equal(selected.frame.direction, 12);
    assert.equal(selected.frame.sample, Math.floor(game.player.walkPhase / TAU * 4));
    near(selected.placement.foot.x, (game.player.x - game.player.y) * Math.sqrt(3) / 2);
    near(selected.placement.foot.y, (game.player.x + game.player.y) * .5);
    for (let i = 0; i < 5; i++) assert.equal(art.drawCharacter(context(), 'survivor', game.player, { simulationTime: game.time }), true);
    assert.equal(JSON.stringify(game.snapshot()), before);
  } finally { Math.random = random; Date.now = now; }
});

test('invalid projection, clipping, frame order, transparency and image dimensions never become ready', async () => {
  for (const corrupt of [
    value => { value.projection.elevationDegrees = 30; }, value => { value.frames[0].clipped = true; },
    value => { value.frames[0].rect.x = 1; }, value => { value.atlas.transparent = false; },
    value => { value.frames[0].footPivot.y++; }, value => { value.frames[0].coreBounds.width = 900; },
  ]) {
    const source = metadata(4); corrupt(source); assert.throws(() => validateAtlasMetadata(source));
    const art = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: fetchMetadata(source), ImageCtor: imageClass() });
    assert.equal(await art.load('run'), false); assert.equal(art.status('run'), 'failed'); assert.equal(art.get('run'), null);
  }
  const wrongSize = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: fetchMetadata(), ImageCtor: imageClass({ width: 512, height: 512 }) });
  assert.equal(await wrongSize.load('run'), false); assert.equal(wrongSize.records.get('run').error, 'atlas-dimensions-mismatch');
});

test('CORS/fetch/PNG failures and unsafe paths resolve false, retain the caller fallback and allow explicit retry', async () => {
  let failed = true;
  const art = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: async () => { if (failed) throw new TypeError('Failed to fetch'); return fetchMetadata()(); }, ImageCtor: imageClass() });
  assert.equal(await art.load('run'), false); assert.equal(art.draw(context(), 'run'), false);
  failed = false; assert.equal(await art.load('run'), false); assert.equal(await art.load('run', { retry: true }), true);
  const badPNG = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: fetchMetadata(), ImageCtor: imageClass({ fail: true }) });
  assert.equal(await badPNG.load('run'), false); assert.equal(badPNG.status('run'), 'failed');
  for (const path of ['https://foreign.example/metadata.json', '../secret.json', '%2e%2e/secret.json', '%2e%2e%2fsecret.json', 'survivor-run/metadata.json?key=secret']) {
    const supplied = manifest(); supplied.assets.run.metadata = path;
    let called = false;
    const unsafe = new ProductionArt({ manifest: supplied, baseURL, fetchImpl: async () => { called = true; return fetchMetadata()(); }, ImageCtor: imageClass() });
    assert.equal(await unsafe.load('run'), false); assert.equal(called, false);
  }
  const unsupported = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: null, ImageCtor: null });
  assert.equal(await unsupported.load('run'), false);
  assert.equal(Object.isFrozen(productionAssets.characters.survivor), true);
});

test('metadata and image timeouts cannot leave a pending loading state', async () => {
  const pendingFetch = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: () => new Promise(() => {}), ImageCtor: imageClass(), timeoutMs: 5 });
  assert.equal(await pendingFetch.load('run'), false); assert.equal(pendingFetch.status('run'), 'failed');
  const pendingBody = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: async () => ({ ok: true, text: () => new Promise(() => {}) }), ImageCtor: imageClass(), timeoutMs: 5 });
  assert.equal(await pendingBody.load('run'), false); assert.equal(pendingBody.status('run'), 'failed');
  const pendingImage = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: fetchMetadata(), ImageCtor: class { set src(value) { this.url = value; } }, timeoutMs: 5 });
  assert.equal(await pendingImage.load('run'), false); assert.equal(pendingImage.status('run'), 'failed');
});

test('default browser fetch retains its global receiver and injected fetch remains compatible', async () => {
  const original=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=function(){if(this!==globalThis)throw new TypeError('Illegal invocation');calls++;return fetchMetadata()();};
    const browserDefault=new ProductionArt({manifest:manifest(),baseURL,ImageCtor:imageClass()});
    assert.equal(await browserDefault.load('run'),true);assert.equal(calls,1);
    let receiver;
    const injected=new ProductionArt({manifest:manifest(),baseURL,fetchImpl:function(){receiver=this;return fetchMetadata()();},ImageCtor:imageClass()});
    assert.equal(await injected.load('run'),true);assert.equal(receiver,injected);
  }finally{globalThis.fetch=original;}
});

test('dash, walk and run poses follow observed movement speed without adding actor fields', () => {
  const actor = { x: 0, y: 0, walkPhase: 0, dashTime: 0 }, clock = new ProductionPoseClock();
  clock.select(actor, 0, { runThreshold: 180 });
  actor.x = 5; actor.walkPhase = .4;
  assert.equal(clock.select(actor, .1, { runThreshold: 180 }).pose, 'walk');
  actor.x = 26; actor.walkPhase = 2.08;
  assert.equal(clock.select(actor, .2, { runThreshold: 180 }).pose, 'run');
  actor.x = 93.5; actor.dashTime = .13;
  const dashing = clock.select(actor, .3, { runThreshold: 180 });
  assert.equal(dashing.pose, 'dash'); assert.equal(clock.select(actor, .3), dashing);
  assert.equal(clock.select(actor, .4, { runThreshold: 180 }).pose, 'idle', 'a blocked dash has no moving pose');
  assert.deepEqual(Object.keys(actor).sort(), ['dashTime', 'walkPhase', 'x', 'y']);
});

test('grounded player gait respects native clip duration and caps dash cadence without changing engine phase', () => {
  const gait = { referenceSpeed: 214, walkDuration: 1.066666603088379, runDuration: .6666666865348816 };
  const options = { runThreshold: 214 * 1.15, gait };
  function walk(step, frames) {
    const clock = new ProductionPoseClock(), actor = { x: 0, y: 0, walkPhase: 2.7, dashTime: 0 };
    clock.select(actor, 0, options);
    let selection;
    for (let i = 1; i <= frames; i++) { actor.x = 214 * step * i; selection = clock.select(actor, step * i, options); }
    return { clock, actor, selection };
  }
  const fast = walk(1 / 120, 60), slow = walk(1 / 30, 15);
  assert.equal(fast.selection.pose, 'walk');
  near(fast.selection.phase, TAU * .5 / gait.walkDuration);
  near(slow.selection.phase, fast.selection.phase);
  assert.equal(fast.actor.walkPhase, 2.7, 'the saved distance-driven engine phase is untouched');
  const paused = fast.selection;
  for (let i = 0; i < 20; i++) assert.equal(fast.clock.select(fast.actor, .5, options), paused);
  const stopped = fast.clock.select(fast.actor, .6, options);
  assert.equal(stopped.pose, 'idle'); near(stopped.phase, paused.phase);
  fast.actor.x += 675 * .1; fast.actor.dashTime = .15;
  const dash = fast.clock.select(fast.actor, .7, options);
  assert.equal(dash.pose, 'dash');
  near(dash.phase, (paused.phase + TAU * .1 * 1.25 / gait.runDuration) % TAU);
  assert.equal(fast.clock.select(fast.actor, .2, options).phase, 0, 'restore resets only transient animation state');
  assert.deepEqual(Object.keys(fast.actor).sort(), ['dashTime', 'walkPhase', 'x', 'y']);
});

test('optional boss registration loads only real catalog entries and supports static and animated poses', async () => {
  const additions = {
    assets: { 'boss-01-mid': { metadata: 'boss-01-mid/metadata.json', atlas: 'boss-01-mid/atlas.png' } },
    bosses: { 'boss-01-mid': 'boss-01-mid' },
  };
  const augmented = extendProductionAssets(productionAssets, additions);
  assert.equal(Object.keys(productionAssets.bosses).length, 0); assert.equal(Object.keys(augmented.bosses).length, 1);
  let requests = 0;
  const art = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: async () => { requests++; return fetchMetadata(metadata())(); }, ImageCtor: imageClass({ height: 1024 }) });
  art.extendManifest(additions); assert.equal(requests, 0);
  assert.deepEqual(await art.loadBoss('boss-12-final'), []); assert.equal(requests, 0);
  assert.deepEqual(await art.loadBoss('boss-01-mid'), [true]); assert.equal(requests, 1);
  const boss = { x: 950, y: 860, angle: Math.PI, walkPhase: 1 };
  const selected = art.bossFrame('boss-01-mid', boss, { simulationTime: 2, worldHeight: 88 });
  assert.equal(selected.id, 'boss-01-mid'); assert.equal(selected.frame.direction, 8);
  near(selected.placement.width, 512 / 6.274615937336651 * 2);
  assert.equal(art.drawBoss(context(), 'boss-12-final', boss), false);
  const animated = new ProductionArt({ manifest: extendProductionAssets(manifest(), { bosses: { 'boss-02-mid': { idle: 'idle', walk: 'run', run: 'run' } } }), baseURL, fetchImpl: fetchMetadata(), ImageCtor: imageClass() });
  await animated.loadBoss('boss-02-mid');
  assert.equal(animated.bossFrame('boss-02-mid', boss, { simulationTime: 0 }).id, 'idle');
  boss.x += 10; boss.walkPhase = Math.PI;
  assert.equal(animated.bossFrame('boss-02-mid', boss, { simulationTime: .1 }).frame.sample, 2);
});

test('catalog updates preserve unchanged loaded assets and invalidate obsolete asynchronous results', async () => {
  let release;
  const art = new ProductionArt({ manifest: manifest(), baseURL, fetchImpl: () => new Promise(resolve => { release = resolve; }), ImageCtor: imageClass() });
  const obsolete = art.load('run'); await Promise.resolve();
  art.extendManifest({ assets: { run: { metadata: 'survivor-run-v2/metadata.json', atlas: 'survivor-run-v2/atlas.png' } } });
  release({ ok: true, text: async () => JSON.stringify(metadata(4)) });
  assert.equal(await obsolete, false); assert.equal(art.status('run'), 'idle');
  art.fetchImpl = fetchMetadata(); assert.equal(await art.load('run'), true);
  const ready = art.get('run'); art.extendManifest({ bosses: { 'boss-01-mid': 'run' } });
  assert.equal(art.get('run'), ready);
  art.extendManifest({ assets: { run: null }, bosses: { 'boss-01-mid': null } });
  assert.equal(art.get('run'), null); assert.equal(art.manifest.bosses['boss-01-mid'], undefined);
});

function propMetadata() {
  const value = metadata();
  value.atlas.directions = 1; value.atlas.columns = 1; value.atlas.rows = 1;
  value.atlas.width = value.atlas.height = value.atlas.frameSize;
  value.frames = [value.frames[0]];
  value.frames[0].groundBounds = { minX: -20, minY: -40, maxX: 20, maxY: 40 };
  return value;
}

test('single-view props use the same game camera and uniform footprint fit preserves the collision cell', async () => {
  const source = validateAtlasMetadata(propMetadata());
  assert.equal(selectAtlasFrame(source, { angle: Math.PI }).index, 0);
  const cell = Object.freeze({ x: 100, y: 200, w: 120, h: 120 });
  const placed = propPlacement(source, source.frames[0], { footprint: cell });
  assert.equal(placed.footprint.rule, 'contain-uniform'); assert.equal(placed.footprint.uniformScale, 1.5);
  assert.deepEqual(placed.footprint.fitted, { width: 60, height: 120 });
  assert.deepEqual(placed.footprint.target, { ...cell, width: 120, height: 120 });
  near(placed.width / source.frames[0].rect.width, placed.height / source.frames[0].rect.height);
  assert.deepEqual(cell, { x: 100, y: 200, w: 120, h: 120 });
  const updated = extendProductionAssets(manifest(), { assets: { van: { metadata: 'van/metadata.json', atlas: 'van/atlas.png' } }, environment: { van: 'van' } });
  const art = new ProductionArt({ manifest: updated, baseURL, fetchImpl: fetchMetadata(source), ImageCtor: imageClass({ width: 512, height: 512 }) });
  await art.load('van'); assert.equal(art.drawProp(context(), 'van', cell), true);
  assert.equal(art.drawProp(context(), 'not-produced', cell), false);
  const incompatible = propMetadata(); incompatible.projection.elevationDegrees = 30;
  assert.throws(() => validateAtlasMetadata(incompatible));
});

test('native GLB ground extents are normalized and yaw-rotated once, and an offset source pivot stays centered', () => {
  const source = metadata();
  source.source = { originalBounds: { min: [-2, 0, -1], max: [2, 5, 1] }, scale: 10 };
  assert.equal(nativeGroundFootprint(source, source.frames[0]), null, 'legacy omitted front yaw is not guessed');
  source.projection.frontYawRadians = 0;
  const native = nativeGroundFootprint(source, source.frames[0]);
  near(native.width, 20); near(native.height, 40);
  const placed = propPlacement(source, source.frames[0], { footprint: { width: 40, height: 120 }, foot: { x: 500, y: 600 } });
  near(placed.footprint.uniformScale, 2); near(placed.footprint.fitted.width, 40); near(placed.footprint.fitted.height, 80);
  const custom = propMetadata(); custom.frames[0].groundBounds = { minX: 0, minY: -20, maxX: 40, maxY: 60 };
  const aligned = propPlacement(custom, custom.frames[0], { footprint: { width: 80, height: 160 }, foot: { x: 500, y: 600 } });
  near(aligned.foot.x, 500); near(aligned.foot.y, 560);
  assert.deepEqual(aligned.footprint.targetFoot, { x: 500, y: 600 });
});

test('actual pre-outline body pixels remain separately available with an optional real body-alpha mask', async () => {
  const supplied = manifest(); supplied.assets.run.bodyAlpha = 'survivor-run/body-alpha.png';
  const art = new ProductionArt({ manifest: supplied, baseURL, fetchImpl: fetchMetadata(), ImageCtor: imageClass() });
  await art.load('run');
  const options = { foot: { x: 100, y: 200 }, angle: 0, phase: 0 };
  assert.equal(frameVisibility(art.frame('run', options)).bodyAlpha, null);
  assert.equal(await art.loadBodyAlpha('run'), true);
  const visibility = frameVisibility(art.frame('run', options));
  assert.equal(visibility.bodyAlpha.url, `${baseURL}survivor-run/body-alpha.png`);
  assert.deepEqual(visibility.pixels.body, { x: 186, y: 122, width: 187, height: 313 });
  assert.deepEqual(visibility.pixels.core, { x: 214, y: 178, width: 131, height: 170 });
  assert.ok(visibility.bounds.outline.left < visibility.bounds.body.left);
  assert.equal(await art.loadBodyAlpha('idle'), false); assert.equal(frameVisibility(null), null);
});

test('final weapon anchors already include normalization and baked direction; hand IK diagnostics are not attachments', () => {
  const source = metadata();
  source.projection.frontYawRadians = 0;
  const frame = source.frames[4];
  frame.weaponAnchor = { x: 0, y: 8, z: 22, support: { x: 0, y: 13, z: 22 } };
  frame.weaponPose = {
    supported: true, desiredGripHeight: 22,
    right: { position: { x: 0, y: 22, z: 8 }, requested: { x: 0, y: 22, z: 8 }, error: 0, clamped: false },
    left: { position: { x: 0, y: 22, z: 13 }, requested: { x: 0, y: 22, z: 13 }, error: 0, clamped: false },
    weaponAnchor: { x: 0, y: 22, z: 8, support: { x: 0, y: 22, z: 13 }, forward: { x: 0, y: 0, z: 1 } },
  };
  const validated = validateAtlasMetadata(source);
  assert.deepEqual(validated.frames[4].weaponPose, frame.weaponPose);
  const attachment = spriteAttachmentPlacement(validated, validated.frames[4], { foot: { x: 100, y: 200 }, worldHeight: 44 });
  near(attachment.grip.x, 100 - 8 * Math.sqrt(3) / 2); near(attachment.grip.y, 200 + 4 - 22);
  near(attachment.support.x, 100 - 13 * Math.sqrt(3) / 2); near(attachment.support.y, 200 + 6.5 - 22);
  assert.deepEqual(attachment.gameOffset, { x: 0, y: 8, height: 22 });
  assert.equal(attachment.angle, Math.PI / 2);
  const enlarged = spriteAttachmentPlacement(validated, validated.frames[4], { foot: { x: 100, y: 200 }, worldHeight: 88 });
  near(enlarged.grip.x - 100, (attachment.grip.x - 100) * 2); near(enlarged.grip.y - 200, (attachment.grip.y - 200) * 2);
  assert.equal(enlarged.gameOffset.height, 44);
  const alreadyTurned = { ...validated.frames[4], weaponAnchor: { ...validated.frames[4].weaponAnchor, forward: { x: 1, y: 0, z: 0 } } };
  const recorded = spriteAttachmentPlacement(validated, alreadyTurned, { foot: { x: 100, y: 200 } });
  assert.equal(recorded.angle, 0, 'a recorded final forward is not rotated by bakedAngle again');
  assert.equal(recorded.bakedAngle, Math.PI / 2);
  const unknownYaw = metadata(); unknownYaw.frames[0].weaponAnchor = frame.weaponAnchor;
  const knownGrip = spriteAttachmentPlacement(unknownYaw, unknownYaw.frames[0], { foot: { x: 0, y: 0 } });
  assert.equal(knownGrip.forward, null); assert.ok(Number.isFinite(knownGrip.grip.x));
  assert.equal(spriteAttachmentPlacement(source, source.frames[0], { foot: { x: 100, y: 200 } }), null);
  const badAnchor = metadata(); badAnchor.frames[0].weaponAnchor = { x: 0, y: NaN, z: 22, support: { x: 0, y: 5, z: 22 } };
  assert.throws(() => validateAtlasMetadata(badAnchor));
  const badIK = metadata(); badIK.frames[0].weaponPose = { ...frame.weaponPose, right: { ...frame.weaponPose.right, error: Infinity } };
  assert.throws(() => validateAtlasMetadata(badIK));
});
