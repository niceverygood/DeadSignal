import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { getBoss } from '../dist/campaign.js';
import { Navigation } from '../dist/navigation.js';
import { ProductionArt, animationSample, validateAtlasMetadata, selectAtlasFrame, spritePlacement } from '../dist/production-art.js';
import { Renderer } from '../dist/renderer.js';
import { validAnimationClips, nativeActionSelection } from '../dist/native-action-animation.js';

const clips = () => ({
  idle: { start: 0, count: 4, duration: 1.2, loop: true },
  walk: { start: 4, count: 8, duration: 1.1, loop: true },
  windup: { start: 12, count: 6, duration: .9, loop: false },
  attack: { start: 18, count: 6, duration: .6, loop: false },
  hit: { start: 24, count: 2, duration: .12, loop: false },
  death: { start: 26, count: 6, duration: 1.1, loop: false },
});
// Contract-only frame coordinates; no substitute artwork is generated here.
function metadata() {
  const directions = 8, samples = 32, frameSize = 128, columns = 8, rows = 32;
  const footPivot = { x: 64, y: 110 };
  return {
    format: 'meshy-iso-sprite-atlas', version: 1,
    projection: { subjectHeight: 100, pixelsPerWorld: 2, footPivot, azimuthDegrees: 45, elevationDegrees: 35.26438968275467, cameraScale: Math.sqrt(3 / 2) },
    atlas: { width: columns * frameSize, height: rows * frameSize, columns, rows, frameSize, directions, samples, order: 'direction-major, sample-minor', transparent: true },
    animation: { name: 'native action set', duration: 5.02, loop: false, samples, clips: clips() },
    frames: Array.from({ length: directions * samples }, (_, index) => ({
      index, direction: Math.floor(index / samples), sample: index % samples, angle: Math.floor(index / samples) * Math.PI / 4,
      rect: { x: index % columns * frameSize, y: Math.floor(index / columns) * frameSize, width: frameSize, height: frameSize },
      footPivot: { ...footPivot }, alphaBounds: { x: 42, y: 20, width: 40, height: 92 },
      coreBounds: { x: 48, y: 40, width: 28, height: 46 }, outlineBounds: { x: 40, y: 18, width: 44, height: 96 }, clipped: false,
    })),
  };
}
async function artFixture(value = metadata()) {
  const manifest = {
    assets: { rigged: { metadata: 'rigged/metadata.json', atlas: 'rigged/atlas.png' } }, characters: {}, enemies: {walker:'rigged',screamer:'rigged',collector:'rigged'}, environment: {},
    bosses: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`boss-${String(i + 1).padStart(2, '0')}-final`, 'rigged'])),
  };
  const ImageCtor = class {
    constructor() { this.naturalWidth = value.atlas.width; this.naturalHeight = value.atlas.height; }
    set src(url) { this.url = url; queueMicrotask(() => this.onload?.()); }
  };
  const art = new ProductionArt({ manifest, baseURL: 'https://game.example/assets/production/',
    fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify(value) }), ImageCtor });
  assert.equal(await art.load('rigged'), true);
  return art;
}
const actionDurations = boss => ({ windup: boss.skill.windup, charge: boss.skill.duration,
  recover: boss.skill.recovery, recoveryIsAttack: !['charge', 'shield', 'leap', 'pull'].includes(boss.skill.kind) });
function fresh(role = 'mid', missionId = 'mission-01') {
  const game = new Game({ seed: 93882, missionId, stageDuration: 1e9 });
  game.world.obstacles = []; game.world.decor = []; game.enemies = []; game.spawnClock = 1e9;
  game.navigation = new Navigation(game.world); game.player.invul = 9999;
  let actor = game.spawnMissionBoss('mid');
  if (role === 'final') { game.damageEnemy(actor, actor.hp); actor = game.spawnMissionBoss('final'); }
  return { game, actor, catalog: getBoss(actor.bossKey) };
}

// A combined atlas must never fall through a missing span into a neighbouring
// action or the next direction, even when the simulation stalls or time is huge.
test('all six named spans select only their own native samples and clamp one shots', () => {
  const m = validateAtlasMetadata(metadata());
  for (const [clip, span] of Object.entries(m.animation.clips)) {
    assert.equal(animationSample(m, { clip, timeSeconds: 0 }), span.start);
    assert.equal(animationSample(m, { clip, timeSeconds: -100 }), span.start);
    const end = animationSample(m, { clip, timeSeconds: span.duration });
    assert.equal(end, span.loop ? span.start : span.start + span.count - 1);
    assert.ok(animationSample(m, { clip, timeSeconds: 1e9 }) >= span.start);
    assert.ok(animationSample(m, { clip, timeSeconds: 1e9 }) < span.start + span.count);
    const frame = selectAtlasFrame(m, { clip, timeSeconds: span.duration, angle: -Math.PI / 2 });
    assert.equal(frame.direction, 6); assert.equal(frame.sample, end); assert.equal(frame.index, 6 * 32 + end);
  }
  assert.equal(animationSample(m, { stationary: true, clip: 'attack', timeSeconds: 999 }), 18);
  assert.ok(animationSample(m, { clip: 'missing', timeSeconds: 999 }) < 12);
});

test('combined walk loops through its own phase and idle breathes without running an action', () => {
  const m = metadata();
  for (let i = 0; i < 8; i++) assert.equal(animationSample(m, { clip: 'walk', phase: i * Math.PI / 4 }), 4 + i);
  assert.equal(animationSample(m, { clip: 'walk', phase: Math.PI * 2 }), 4);
  const actor = { x: 4, y: 8, hp: 100, attackState: 'walk' };
  const a = nativeActionSelection(m, actor, { pose: 'idle', simulationTime: .7 });
  assert.equal(a.clip, 'idle'); assert.equal(animationSample(m, a), 2);
});

test('overlap, out-of-range spans, impossible time and missing idle reject the entire combined atlas', () => {
  const mutations = [
    c => { c.attack.start = 17; }, c => { c.death.count = 7; }, c => { c.idle.start = -1; },
    c => { c.hit.duration = Infinity; }, c => { c.walk.loop = 'true'; }, c => { c.windup.count = .5; },
    c => { delete c.idle; }, c => { c.constructor = { start: 32, count: 1, duration: 1, loop: false }; },
  ];
  for (const mutate of mutations) {
    const m = metadata(); mutate(m.animation.clips);
    assert.equal(validAnimationClips(m.animation.clips, 32), false);
    assert.throws(() => validateAtlasMetadata(m), /invalid-atlas-metadata/);
  }
  assert.equal(validAnimationClips(clips(), 32), true);
});

test('legacy single-clip metadata retains its distance phase and stationary frame selection', () => {
  const m = metadata(); delete m.animation.clips; m.animation.loop = true;
  assert.equal(animationSample(m, { phase: Math.PI }), 16);
  assert.equal(animationSample(m, { phase: Math.PI, stationary: true }), 0);
  assert.equal(nativeActionSelection(m, { hp: 12 }, {}), null);
});

test('live boss warnings and recovery use saved countdowns; damage cannot hide the warning', async () => {
  const art = await artFixture(), { game, actor, catalog } = fresh('final');
  actor.skillCd = 0; game.tick(.01);
  assert.equal(actor.attackState, 'windup');
  actor.hitFlash = .12;
  const options = { simulationTime: game.time, actionDurations: actionDurations(catalog) };
  const first = art.bossFrame(actor.bossKey, actor, options);
  assert.equal(first.frame.sample, 12);
  for (let i = 0; i < 11; i++) game.tick(.05);
  const advanced = art.bossFrame(actor.bossKey, actor, { ...options, simulationTime: game.time });
  assert.ok(advanced.frame.sample > first.frame.sample && advanced.frame.sample <= 17);
  game.pause(); const raw = game.snapshot(), before = JSON.stringify(raw);
  for (let i = 0; i < 10; i++) {
    game.tick(.1);
    assert.equal(art.bossFrame(actor.bossKey, actor, { ...options, simulationTime: game.time }).frame.sample, advanced.frame.sample);
  }
  const copy = Game.restore(raw), restoredActor = copy.enemies.find(e => e.bossKey);
  assert.ok(copy);
  assert.equal(art.bossFrame(restoredActor.bossKey, restoredActor, { ...options, simulationTime: copy.time }).frame.sample, advanced.frame.sample);
  assert.equal(JSON.stringify(game.snapshot()), before);
});

test('each of the twelve real final boss skill states selects the correct attack window', async () => {
  const art = await artFixture();
  for (let index = 1; index <= 12; index++) {
    const { game, actor, catalog } = fresh('final', `mission-${String(index).padStart(2, '0')}`);
    actor.skillCd = 0; game.tick(.01);
    assert.equal(art.bossFrame(actor.bossKey, actor, { simulationTime: game.time, actionDurations: actionDurations(catalog) }).frame.sample, 12);
    for (let ticks = 0; ticks < 200 && actor.attackState === 'windup'; ticks++) game.tick(.01);
    assert.ok(['charge', 'recover'].includes(actor.attackState), catalog.id);
    const captured = JSON.stringify({ actor, random: game.random.getState(), visual: game.visualRandom.getState(), result: game.result });
    const selected = art.bossFrame(actor.bossKey, actor, { simulationTime: game.time, actionDurations: actionDurations(catalog) });
    assert.ok(selected.frame.sample >= 18 && selected.frame.sample <= 23, `${catalog.id} should show attack, got ${selected.frame.sample}`);
    assert.equal(JSON.stringify({ actor, random: game.random.getState(), visual: game.visualRandom.getState(), result: game.result }), captured);
  }
});

test('ordinary hit reaction and native death stop inside their own one-shot spans', () => {
  const m = metadata(), actor = { hp: 100, attackState: 'walk', hitFlash: .12 };
  assert.equal(animationSample(m, nativeActionSelection(m, actor, { pose: 'walk' })), 24);
  actor.hitFlash = .02;
  assert.equal(animationSample(m, nativeActionSelection(m, actor, { pose: 'walk' })), 25);
  actor.dead = true;
  const selected = nativeActionSelection(m, actor, { pose: 'death', animationTime: 100 });
  assert.equal(selected.clip, 'death'); assert.equal(animationSample(m, selected), 31);
});

test('boss corpse identity persists through new checkpoints and old identity-free saves still restore', () => {
  const { game, actor } = fresh(); game.damageEnemy(actor, actor.hp);
  assert.equal(game.corpses[0].bossKey, actor.bossKey);
  const snapshot = game.snapshot(); assert.ok(snapshot);
  const copy = Game.restore(snapshot); assert.ok(copy); assert.equal(copy.corpses[0].bossKey, actor.bossKey);
  const legacy = structuredClone(snapshot); delete legacy.corpses[0].bossKey;
  assert.ok(Game.restore(legacy));
  for (const key of ['boss-12-mid', 'boss-01-final', 'missing', null, {}]) {
    const invalid = structuredClone(snapshot); invalid.corpses[0].bossKey = key;
    assert.equal(Game.restore(invalid), null, String(key));
  }
});

test('native corpse animation follows simulation through pause and completes once after terminal victory without mutating it', async () => {
  const art = await artFixture(), renderer = Object.assign(Object.create(Renderer.prototype), {
    productionArt: art, motionEnabled: true, nativeCorpseEndClocks: new WeakMap(), requestProductionCatalog() {},
  });
  const { game, actor } = fresh('final'); game.damageEnemy(actor, actor.hp);
  assert.equal(game.state, 'victory');
  const corpse = game.corpses.find(c => c.bossKey === actor.bossKey), before = JSON.stringify({ result: game.result, corpse, random: game.random.getState(), visual: game.visualRandom.getState() });
  assert.equal(renderer.nativeCorpseFrame(corpse, game, 5).frame.sample, 26);
  assert.ok(renderer.nativeCorpseFrame(corpse, game, 5.55).frame.sample > 26);
  assert.equal(renderer.nativeCorpseFrame(corpse, game, 999).frame.sample, 31);
  assert.equal(renderer.nativeCorpseFrame(corpse, game, 1000).frame.sample, 31);
  assert.equal(JSON.stringify({ result: game.result, corpse, random: game.random.getState(), visual: game.visualRandom.getState() }), before);
  const paused = { state: 'paused', time: game.time };
  assert.equal(renderer.nativeCorpseFrame(corpse, paused, 1001).frame.sample, 26);
  corpse.time -= .55;
  assert.ok(renderer.nativeCorpseFrame(corpse, paused, 2000).frame.sample > 26);
  renderer.motionEnabled = false;
  assert.equal(renderer.nativeCorpseFrame(corpse, paused, 2001).frame.sample, 31);
});

test('native dying bodies share the live actor depth sort and do not use the generic ground prepass', () => {
  const order = [], c = new Proxy({}, { get: (target, key) => key in target ? target[key] : () => ({ addColorStop() {} }) });
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    ctx: c, dpr: 1, width: 800, height: 600, offsetY: 0, zoom: 1, cameraReady: true, camera: { x: 1000, y: 1000 }, lastNow: 0,
    floor: {}, atmosphereEnabled: false, shakeEnabled: false, fireArt: { status: 'idle' }, explosionArt: { status: 'idle' },
    makeFloor() {}, visible() { return true; }, nativeCorpseFrame() { return { native: true }; },
    drawCorpse() { order.push('generic'); }, drawNativeCorpse() { order.push('native corpse'); }, drawEnemy() { order.push('enemy'); },
    drawPlayer() { order.push('player'); }, drawTelegraph() {}, playerIdentificationNeeded() { return false; },
    drawCursor() {}, drawHealthWarning() {}, drawObjectiveDirections() {}, drawMinimap() {},
  });
  const game = { time: 1, state: 'playing', world: { width: 2400, height: 1800, decor: [], obstacles: [] }, player: { x: 500, y: 500 },
    corpses: [{ x: 200, y: 200 }], enemies: [{ x: 300, y: 300 }] };
  renderer.render(game, {}, 1);
  assert.deepEqual(order, ['native corpse', 'enemy', 'player']);
});

function packedMetadata(source = metadata()) {
  const value = structuredClone(source), cellWidth = 56, cellHeight = 106, columns = 16;
  value.atlas.packing = 'trimmed-v1'; value.atlas.width = cellWidth * columns;
  value.atlas.height = cellHeight * Math.ceil(value.frames.length / columns);
  delete value.atlas.columns; delete value.atlas.rows;
  for (const frame of value.frames) {
    const x = 38 - frame.index % 3, y = 16 - frame.index % 2;
    frame.rect = { x: frame.index % columns * cellWidth, y: Math.floor(frame.index / columns) * cellHeight,
      width: 48 + frame.index % 3 * 2, height: 100 + frame.index % 2 * 2 };
    frame.footPivot.x -= x; frame.footPivot.y -= y;
    for (const field of ['alphaBounds', 'outlineBounds', 'coreBounds', 'combinedAlphaBounds']) {
      if (frame[field]) { frame[field].x -= x; frame[field].y -= y; }
    }
    if (frame.bodyIdentificationContour) for (const field of ['left', 'right', 'top'])
      for (const point of frame.bodyIdentificationContour[field]) { point.x -= x; point.y -= y; }
  }
  return value;
}

test('losslessly packed variable rectangles preserve every frame world bounds, anchors and sample indices', () => {
  const original = metadata();
  for (const frame of original.frames) {
    frame.combinedAlphaBounds = { ...frame.alphaBounds };
    frame.bodyIdentificationContour = { left: [{ x: 48, y: 40 }, { x: 48, y: 50 }], right: [{ x: 76, y: 40 }, { x: 76, y: 50 }], top: [{ x: 48, y: 40 }, { x: 76, y: 40 }] };
  }
  const packed = validateAtlasMetadata(packedMetadata(original)), legacy = validateAtlasMetadata(original);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  assert.ok(packed.atlas.width * packed.atlas.height < legacy.atlas.width * legacy.atlas.height / 2);
  for (let index = 0; index < legacy.frames.length; index++) {
    const options = { foot: { x: 500 + index, y: 900 - index }, worldHeight: 137 };
    const a = spritePlacement(legacy, legacy.frames[index], options), b = spritePlacement(packed, packed.frames[index], options);
    assert.deepEqual(a.foot, b.foot); assert.equal(a.depth, b.depth); assert.equal(a.scale, b.scale);
    for (const kind of ['body', 'core', 'outline']) for (const edge of ['left', 'right', 'top', 'bottom']) near(a.bounds[kind][edge], b.bounds[kind][edge]);
    const oldContour = legacy.frames[index].bodyIdentificationContour, newContour = packed.frames[index].bodyIdentificationContour;
    for (const side of ['left', 'right', 'top']) for (let i = 0; i < oldContour[side].length; i++) {
      near(a.x + oldContour[side][i].x * a.scale, b.x + newContour[side][i].x * b.scale);
      near(a.y + oldContour[side][i].y * a.scale, b.y + newContour[side][i].y * b.scale);
    }
  }
  for (const [clip, span] of Object.entries(clips())) for (let direction = 0; direction < 8; direction++) {
    const options = { angle: direction * Math.PI / 4, clip, timeSeconds: span.duration / 2 };
    assert.equal(selectAtlasFrame(packed, options).index, selectAtlasFrame(legacy, options).index);
  }
});

test('packed pivots outside their cropped rectangle remain valid and keep the ground anchor exact', () => {
  const original = metadata(); original.projection.footPivot = { x: 20, y: 125 };
  for (const frame of original.frames) frame.footPivot = { ...original.projection.footPivot };
  const packed = validateAtlasMetadata(packedMetadata(original)), frame = packed.frames[0];
  assert.ok(frame.footPivot.x < 0); assert.ok(frame.footPivot.y > frame.rect.height);
  const foot = { x: 500, y: 600 }, placed = spritePlacement(packed, frame, { foot });
  assert.equal(placed.x + frame.footPivot.x * placed.scale, foot.x);
  assert.equal(placed.y + frame.footPivot.y * placed.scale, foot.y);
});

test('packed validation rejects overlap, fractional or out-of-image rectangles, cropped bounds and unknown packing', () => {
  const cases = [
    p => { p.frames[1].rect.x = p.frames[0].rect.x; },
    p => { p.frames[0].rect.x = .25; }, p => { p.frames[0].rect.x = -1; },
    p => { p.frames[0].rect.width = p.atlas.frameSize + 1; }, p => { p.frames[0].rect.y = p.atlas.height; },
    p => { p.frames[0].alphaBounds.width = p.frames[0].rect.width; },
    p => { p.frames[0].coreBounds.height = p.frames[0].rect.height; },
    p => { p.frames[0].outlineBounds.y = -1; }, p => { p.frames[0].footPivot.y = Infinity; },
    p => { p.atlas.packing = 'trimmed-v2'; }, p => { p.atlas.width = 8193; },
  ];
  for (const change of cases) {
    const p = packedMetadata(); change(p); assert.throws(() => validateAtlasMetadata(p), /invalid-atlas-metadata/);
  }
  const legacy = metadata(); legacy.frames[0].rect.width -= 1;
  assert.throws(() => validateAtlasMetadata(legacy), /invalid-atlas-metadata/, 'Legacy grid strictness remains unchanged');
});

test('the atlas loader and draw path use each packed source rect rather than the original frame canvas size', async () => {
  const m = packedMetadata(), art = await artFixture(m), actor = { x: 100, y: 100, angle: Math.PI / 2, hp: 0, dead: true };
  const selected = art.bossFrame('boss-01-final', actor, { pose: 'death', animationTime: .55 });
  const calls = [], context = { globalAlpha: 1, save() {}, restore() {}, drawImage(...args) { calls.push(args); } };
  assert.equal(art.drawFrame(context, selected), true);
  const rect = selected.frame.rect, placed = selected.placement;
  assert.deepEqual(calls[0].slice(1), [rect.x, rect.y, rect.width, rect.height, placed.x, placed.y, placed.width, placed.height]);
  assert.ok(rect.width < m.atlas.frameSize); assert.ok(rect.height < m.atlas.frameSize);
  assert.equal(selected.frame.direction, 2); assert.equal(selected.frame.sample, 29);
});

test('real ordinary NPC contact strikes and scream releases use existing saved cooldowns without new gameplay', () => {
  const m = metadata(), game = new Game({ seed: 2345 });
  game.enemies = []; game.world.obstacles = []; game.navigation = new Navigation(game.world); game.spawnClock = 1e9; game.player.invul = 9999;
  const walker = game.spawnEnemy('walker', 0, { x: game.player.x + 15, y: game.player.y });
  game.move(walker, game.player.x + 15 - walker.x, game.player.y - walker.y);
  game.tick(.01); assert.equal(walker.attackCd, .9);
  const before = JSON.stringify({ actor: walker, random: game.random.getState(), visual: game.visualRandom.getState() });
  assert.equal(animationSample(m, nativeActionSelection(m, walker, { pose: 'walk' })), 18);
  assert.equal(JSON.stringify({ actor: walker, random: game.random.getState(), visual: game.visualRandom.getState() }), before);
  walker.hitFlash = .12;
  assert.equal(nativeActionSelection(m, walker, { pose: 'walk' }).clip, 'hit');
  walker.hitFlash = 0; walker.attackCd = .5;
  assert.equal(nativeActionSelection(m, walker, { pose: 'walk' }).clip, 'walk');
  const screamer = game.spawnEnemy('screamer', 0, { x: game.player.x + 100, y: game.player.y });
  screamer.skillCd = .2; assert.equal(nativeActionSelection(m, screamer, { pose: 'walk' }).clip, 'windup');
  screamer.skillCd = 0; game.drainEvents(); game.tick(.01);
  assert.ok(game.events.some(event => event.type === 'scream')); assert.equal(screamer.skillCd, 9);
  assert.equal(animationSample(m, nativeActionSelection(m, screamer, { pose: 'walk' })), 18);
});

test('ordinary NPC death reuses its exact registered enemy identity and the same saved corpse lifetime', async () => {
  const art = await artFixture(), renderer = Object.assign(Object.create(Renderer.prototype), {
    productionArt: art, motionEnabled: true, nativeCorpseEndClocks: new WeakMap(), requestProductionCatalog() {},
  });
  const game = new Game({ seed: 22 }); game.enemies = []; game.player.invul = 9999;
  const enemy = game.spawnEnemy('walker', 0, { x: game.player.x + 100, y: game.player.y }); game.damageEnemy(enemy, enemy.hp);
  const corpse = game.corpses[0]; assert.equal(corpse.type, 'walker'); assert.equal(corpse.bossKey, undefined);
  assert.equal(renderer.nativeCorpseFrame(corpse, game, 1).frame.sample, 26);
  const snapshot = game.snapshot(), restored = Game.restore(snapshot); assert.ok(restored);
  assert.deepEqual(restored.corpses, game.corpses);
  restored.corpses[0].time -= .55;
  const before = JSON.stringify(restored.corpses);
  assert.equal(renderer.nativeCorpseFrame(restored.corpses[0], restored, 999).frame.sample, 29);
  assert.equal(JSON.stringify(restored.corpses), before);
});

async function heroArtFixture(withActions = true) {
  const aliases = { idle: 'hero-idle', walk: 'hero-walk', run: 'hero-run', ...(withActions ? { actions: 'hero-actions' } : {}) };
  const manifest = { assets: Object.fromEntries(Object.values(aliases).map(id => [id, { atlas: `${id}/atlas.png`, metadata: `${id}/metadata.json` }])),
    characters: { 'survivor-shotgun': aliases }, enemies: {}, bosses: {}, environment: {} };
  const sourceFor = id => {
    const m = metadata(); m.atlas.includesWeapon = true; m.projection.subjectHeight = 44;
    for (const frame of m.frames) frame.weaponMuzzle = { x: 20, y: 0, z: 32 };
    if (id !== 'hero-actions') { delete m.animation.clips; m.animation.loop = true; }
    return m;
  };
  const ImageCtor = class {
    constructor() { this.naturalWidth = 1024; this.naturalHeight = 4096; }
    set src(url) { this.url = url; queueMicrotask(() => this.onload?.()); }
  };
  const art = new ProductionArt({ manifest, baseURL: 'https://game.example/assets/production/', ImageCtor,
    fetchImpl: async url => ({ ok: true, text: async () => JSON.stringify(sourceFor(url.split('/').at(-2))) }) });
  await art.loadCharacter('survivor-shotgun'); return art;
}

test('optional hero action reel handles real shooting, hurt and death while preserving packed locomotion aliases and the actual player clock', async () => {
  const art = await heroArtFixture(), renderer = Object.assign(Object.create(Renderer.prototype), {
    productionArt: art, nativePlayerEndClocks: new WeakMap(), lastNow: 10, motionEnabled: true,
  });
  const game = new Game({ seed: 20 }), player = game.player;
  assert.equal(renderer.nativePlayerFrame(player, game).id, 'hero-idle');
  game.shoot(); assert.ok(player.recoil > 0);
  const before = JSON.stringify({ player, random: game.random.getState(), visual: game.visualRandom.getState() });
  const shooting = renderer.nativePlayerFrame(player, game);
  assert.equal(shooting.id, 'hero-actions'); assert.ok(shooting.frame.sample >= 18 && shooting.frame.sample <= 23);
  assert.equal(JSON.stringify({ player, random: game.random.getState(), visual: game.visualRandom.getState() }), before);
  assert.ok(art.poseClock.actors.has(player), 'Locomotion keeps the real player as its stable WeakMap key');
  game.tick(.05); game.tick(.05); game.tick(.05, { moveX: 1 });
  assert.equal(renderer.nativePlayerFrame(player, game).id, 'hero-walk');
  player.invul = 0; game.hurtPlayer(5);
  const movingHurt = renderer.nativePlayerFrame(player, game); assert.equal(movingHurt.id, 'hero-walk', 'damage must not freeze moving feet');
  game.tick(.01);
  const hurt = renderer.nativePlayerFrame(player, game); assert.equal(hurt.id, 'hero-actions'); assert.equal(hurt.frame.sample, 24);
  player.invul = 0; game.hurtPlayer(player.hp); assert.equal(game.state, 'dead');
  renderer.lastNow = 10; assert.equal(renderer.nativePlayerFrame(player, game).frame.sample, 26);
  const terminal = JSON.stringify({ player, result: game.result, random: game.random.getState(), visual: game.visualRandom.getState() });
  renderer.lastNow = 20; assert.equal(renderer.nativePlayerFrame(player, game).frame.sample, 31);
  assert.equal(JSON.stringify({ player, result: game.result, random: game.random.getState(), visual: game.visualRandom.getState() }), terminal);
});

test('a missing hero action reel and real reload cooldown retain original equipped hero art instead of substituting an unarmed model', async () => {
  for (const withActions of [false, true]) {
    const art = await heroArtFixture(withActions), game = new Game({ seed: 21 });
    const renderer = Object.assign(Object.create(Renderer.prototype), { productionArt: art, lastNow: 0, motionEnabled: true });
    game.player.reloadTime = 1; game.player.recoil = 0;
    const selected = renderer.nativePlayerFrame(game.player, game);
    assert.equal(selected.id, 'hero-idle'); assert.equal(selected.metadata.atlas.includesWeapon, true);
    if (!withActions) {
      game.shoot(); game.player.reloadTime = 0; game.shoot();
      assert.equal(renderer.nativePlayerFrame(game.player, game).id, 'hero-idle');
    }
  }
});
