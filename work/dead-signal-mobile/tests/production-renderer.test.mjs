import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game } from '../dist/engine.js';
import { Renderer, renderBossPortrait } from '../dist/renderer.js';
import { ProductionArt, validateAtlasMetadata, bodyIdentificationContour } from '../dist/production-art.js';
import { project } from '../dist/projection.js';
import { getBoss } from '../dist/campaign.js';

const TAU = Math.PI * 2;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
// Serialized-contract fixtures verify rendering math. They create no PNGs or
// substitute production artwork; the root separately previews real GLB bakes.
function metadata({ combined = false, samples = 4, prop = false } = {}) {
  const directions = prop ? 1 : 16, columns = prop ? 1 : 8, frameSize = 128;
  const count = directions * samples, rows = Math.ceil(count / columns), footPivot = { x: 64, y: 110 };
  return {
    format: 'meshy-iso-sprite-atlas', version: 1,
    projection: { subjectHeight: 44, pixelsPerWorld: 2, footPivot, azimuthDegrees: 45, elevationDegrees: 35.26438968275467, cameraScale: Math.sqrt(3 / 2), frontYawRadians: 0 },
    atlas: { width: columns * frameSize, height: rows * frameSize, columns, rows, frameSize, directions, samples, order: 'direction-major, sample-minor', transparent: true, alphaThreshold: 8, includesWeapon: combined },
    nativeWeapon: combined ? { bodyAlphaIncludesWeapon: false } : null,
    animation: samples > 1 ? { name: 'Running', duration: 1.2, loop: true, samples } : null,
    frames: Array.from({ length: count }, (_, index) => {
      const direction = Math.floor(index / samples), sample = index % samples, angle = direction * TAU / directions;
      return { index, direction, sample, angle, rect: { x: index % columns * frameSize, y: Math.floor(index / columns) * frameSize, width: frameSize, height: frameSize }, footPivot: { ...footPivot }, alphaBounds: { x: 42, y: 20, width: 40, height: 92 }, coreBounds: { x: 48, y: 40, width: 28, height: 46 }, outlineBounds: { x: 40, y: 18, width: 44, height: 96 }, clipped: false,
        ...(combined ? { weaponMuzzle: { x: Math.cos(angle) * 16, y: Math.sin(angle) * 16, z: 32 + sample * .2 } } : {}),
        ...(prop ? { groundBounds: { minX: -20, minY: -40, maxX: 20, maxY: 40 } } : {}) };
    }),
  };
}
function catalog({ bosses = true, enemies = true, props = true, combined = true } = {}) {
  const assets = {}, characters = {};
  for (const weapon of ['shotgun', 'nailgun']) {
    characters[`survivor-${weapon}`] = {};
    for (const pose of ['idle', 'walk', 'run']) {
      const id = `survivor-${weapon}-${pose}`;
      assets[id] = { metadata: `${id}/metadata.json`, atlas: `${id}/atlas.png`, bodyAlpha: `${id}/body-alpha.png` };
      characters[`survivor-${weapon}`][pose] = id;
    }
  }
  if (bosses) assets['boss-01-mid'] = { metadata: 'boss-01-mid/metadata.json', atlas: 'boss-01-mid/atlas.png' };
  if (enemies) for (const type of ['walker', 'runner', 'shield', 'screamer', 'gas', 'elite', 'collector']) assets[type] = { metadata: `${type}/metadata.json`, atlas: `${type}/atlas.png` };
  if (props) assets.building = { metadata: 'building/metadata.json', atlas: 'building/atlas.png' };
  return { assets, characters, bosses: bosses ? { 'boss-01-mid': 'boss-01-mid' } : {}, enemies: enemies ? Object.fromEntries(['walker', 'runner', 'shield', 'screamer', 'gas', 'elite', 'collector'].map(type => [type, type])) : {}, environment: props ? { building: 'building' } : {}, environmentRules: props ? [{ theme: 'demolition', kind: 'building', variant: 'brick', entry: 'building' }] : [], combined };
}
function bodyPixels() {
  const data = new Uint8ClampedArray(128 * 128 * 4);
  for (let y = 20; y < 112; y++) for (let x = y < 36 ? 55 : y < 86 ? 42 : 48; x < (y < 36 ? 70 : y < 86 ? 82 : 76); x++) data[(y * 128 + x) * 4 + 3] = 255;
  return data;
}
function fixture() {
  const calls = { images: [], fills: [], strokes: [], texts: [], ellipses: [], alphaReads: 0 };
  let matrix = [1, 0, 0, 1, 0, 0], points = []; const stack = [];
  const transform = (x, y) => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
  const multiply = (a, b, c, d, x, y) => { const m = matrix; matrix = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; };
  const raw = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '', strokeStyle: '', lineWidth: 1, imageSmoothingEnabled: true,
    save() { stack.push({ matrix: [...matrix], alpha: this.globalAlpha, composite: this.globalCompositeOperation, fill: this.fillStyle, stroke: this.strokeStyle, width: this.lineWidth }); },
    restore() { const saved = stack.pop(); if (saved) { matrix = saved.matrix; this.globalAlpha = saved.alpha; this.globalCompositeOperation = saved.composite; this.fillStyle = saved.fill; this.strokeStyle = saved.stroke; this.lineWidth = saved.width; } },
    setTransform(...args) { matrix = args; }, transform: multiply, translate(x, y) { multiply(1, 0, 0, 1, x, y); }, scale(x, y) { multiply(x, 0, 0, y, 0, 0); },
    rotate(angle) { multiply(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0); },
    beginPath() { points = []; }, moveTo(x, y) { points.push(transform(x, y)); }, lineTo(x, y) { points.push(transform(x, y)); },
    fill() { calls.fills.push({ points: [...points], color: this.fillStyle, alpha: this.globalAlpha }); },
    stroke() { calls.strokes.push({ points: [...points], color: this.strokeStyle, alpha: this.globalAlpha, cssWidth: this.lineWidth * Math.hypot(matrix[0], matrix[1]) }); },
    ellipse(x, y, rx, ry) { calls.ellipses.push({ point: transform(x, y), rx, ry }); },
    drawImage(image, ...args) { calls.images.push({ image, args, alpha: this.globalAlpha, composite: this.globalCompositeOperation, matrix: [...matrix] }); },
    fillRect(x, y, w, h) { calls.fills.push({ color: this.fillStyle, points: [transform(x, y), transform(x + w, y + h)], alpha: this.globalAlpha }); },
    fillText(text, x, y) { calls.texts.push({ text: String(text), point: transform(x, y) }); },
    measureText(text) { return { width: String(text).length * 7 }; },
    createRadialGradient() { return { addColorStop() {} }; }, createLinearGradient() { return { addColorStop() {} }; },
  };
  const c = new Proxy(raw, { get: (object, key) => key in object ? object[key] : () => {} });
  const canvas = { style: {}, dataset:{}, width: 1280, height: 720, parentElement: { getBoundingClientRect: () => ({ width: 1280, height: 720 }) }, getBoundingClientRect: () => ({ width: 180, height: 190 }), getContext: () => c };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return { clearRect() {}, drawImage() {}, getImageData() { calls.alphaReads++; return { data: bodyPixels() }; } }; } }; } };
  return { canvas, c, calls, reset() { for (const value of Object.values(calls)) if (Array.isArray(value)) value.length = 0; matrix = [1, 0, 0, 1, 0, 0]; } };
}
async function nativeFixture(options = {}) {
  const f = fixture(), supplied = catalog(options), requests = [];
  const real = {};
  if (options.realMetadata) for (const pose of ['idle', 'walk', 'run']) {
    const id = `survivor-shotgun-${pose}`;
    // This test covers legacy 8-frame grounding. HQ32 runtime art is validated
    // by the production-content tests against the live production manifest.
    const metadataURL=pose==='idle'?`../dist/assets/production/${id}/metadata.json`:`./fixtures/native-legacy-v026/${id}/metadata.json`;
    real[id] = JSON.parse(await readFile(new URL(metadataURL, import.meta.url), 'utf8'));
  }
  const sourceFor = id => real[id] || metadata({ combined: id.startsWith('survivor-') && supplied.combined, samples: id.endsWith('-idle') || id === 'building' ? 1 : 4, prop: id === 'building' });
  const fetchImpl = async url => { requests.push(url); const id = url.split('/').at(-2); return { ok: true, text: async () => JSON.stringify(sourceFor(id)) }; };
  const ImageCtor = class { set src(url) { this.url = url; this.id = url.split('/').at(-2); const source = sourceFor(this.id); this.naturalWidth = source.atlas.width; this.naturalHeight = source.atlas.height; queueMicrotask(() => this.onload?.()); } };
  const art = new ProductionArt({ manifest: supplied, baseURL: 'https://game.example/assets/production/', fetchImpl, ImageCtor });
  const renderer = new Renderer(f.canvas, { productionArt: art }); renderer.atmosphereEnabled = false; renderer.minimapEnabled = false;
  await renderer.preloadProductionPlayer('shotgun');
  return { ...f, renderer, art, requests };
}
const capture = game => JSON.stringify({ snapshot: game.snapshot(), player: game.player, enemies: game.enemies, bullets: game.bullets, particles: game.particles, events: game.events, random: game.random.getState(), visual: game.visualRandom.getState() });

test('an unregistered production catalog makes no requests and keeps the existing player art', () => {
  const f = fixture(), renderer = new Renderer(f.canvas), game = new Game({ seed: 821 });
  renderer.drawPlayer(f.c, game.player, game, game.time);
  assert.equal(renderer.productionCharacter('shotgun'), null); assert.equal(renderer.productionArt.records.size, 0);
  assert.equal(f.calls.images.length, 0); assert.ok(f.calls.fills.length > 10);
});

test('combined player rendering replaces both old body and gun while retaining shadow, reload and invulnerability', async () => {
  const f = await nativeFixture(), game = new Game({ seed: 821 }); game.player.reloadTime = 1;
  const before = capture(game); f.renderer.drawPlayer(f.c, game.player, game, game.time);
  assert.equal(f.calls.images.length, 1); assert.equal(f.calls.images[0].image.id, 'survivor-shotgun-idle');
  near(f.calls.images[0].alpha, .74); assert.equal(f.calls.fills.length, 2, 'broad and contact ground shadows remain; old body and gun are skipped');
  assert.ok(f.calls.texts.some(text => text.text === 'RELOAD')); assert.equal(capture(game), before);
  assert.equal(f.renderer.nativeActorFrames.get(game.player).placement.depth, project(game.player.x, game.player.y).y);
  const bodyOnly = await nativeFixture({ combined: false }); bodyOnly.renderer.drawPlayer(bodyOnly.c, game.player, game, game.time);
  assert.equal(bodyOnly.calls.images.length, 0); assert.ok(bodyOnly.calls.fills.length > 10);
});

test('16-direction gait follows game time and stops changing across paused wall-clock frames', async () => {
  const f = await nativeFixture(), game = new Game({ seed: 821 }); game.player.invul = 0;
  f.renderer.drawPlayer(f.c, game.player, game, game.time);
  game.enemies = []; game.spawnClock = 1e9; game.tick(.05, { moveX: 1, moveY: 0, aimX: game.player.x, aimY: game.player.y - 200 });
  f.renderer.drawPlayer(f.c, game.player, game, game.time);
  const selected = f.renderer.nativeActorFrames.get(game.player);
  assert.equal(selected.id, 'survivor-shotgun-walk'); assert.equal(selected.frame.direction, 12);
  game.pause(); const before = capture(game);
  for (const now of [10, 50, 1000]) { f.renderer.drawPlayer(f.c, game.player, game, now); assert.equal(f.renderer.nativeActorFrames.get(game.player).frame.index, selected.frame.index); }
  assert.equal(capture(game), before);
});

test('new bullet art starts at the actual native muzzle and freezes height without changing planar physics', async () => {
  const f = await nativeFixture(), game = new Game({ seed: 821 }); game.player.angle = 0; game.player.invul = 0;
  f.renderer.cameraProjection = project(game.player.x, game.player.y);
  f.renderer.drawPlayer(f.c, game.player, game, game.time); game.shoot();
  const bullet = game.bullets[0], before = capture(game); f.reset(); f.renderer.drawBullet(f.c, bullet, game);
  const cached = f.renderer.nativeBulletShots.get(bullet), actual = project(game.player.x + 16, game.player.y, 32);
  assert.equal(cached.height, 32); near(f.calls.strokes[0].points[0].x, actual.x); near(f.calls.strokes[0].points[0].y, actual.y);
  assert.equal(capture(game), before);
  const first = JSON.stringify(f.calls.strokes[0].points); f.reset(); f.renderer.drawBullet(f.c, bullet, game);
  assert.equal(JSON.stringify(f.calls.strokes[0].points), first, 'paused redraws preserve the first-step muzzle segment');
  game.player.angle = Math.PI / 2; game.player.walkPhase = Math.PI; game.player.x += 12; game.time += .1;
  f.renderer.drawPlayer(f.c, game.player, game, game.time); bullet.px = bullet.x; bullet.py = bullet.y; bullet.x += 8;
  f.reset(); f.renderer.drawBullet(f.c, bullet, game); assert.equal(f.renderer.nativeBulletShots.get(bullet).height, 32);
  const expected = project(bullet.px, bullet.py, 32); near(f.calls.strokes[0].points[0].x, expected.x); near(f.calls.strokes[0].points[0].y, expected.y);
  const legacy = Object.freeze({ x: 1200, y: 930, px: 1190, py: 930, weapon: 'unknown' });
  f.renderer.drawBullet(f.c, legacy, game); assert.equal(f.renderer.nativeBulletShots.get(legacy).height, 22);
});

test('real walking sole correction keeps native identification, draw bounds and muzzle on the same ground anchor', async () => {
  const f = await nativeFixture({ realMetadata: true }), game = new Game({ seed: 821 });
  game.enemies = []; game.spawnClock = 1e9;
  f.renderer.drawPlayer(f.c, game.player, game, game.time);
  for (let i = 0; i < 15; i++) {
    game.tick(1 / 60, { moveX: 1, moveY: 0, aimX: game.player.x + 200, aimY: game.player.y });
    const before = capture(game); f.renderer.drawPlayer(f.c, game.player, game, game.time);
    const selected = f.renderer.currentNativeFrame(game.player), q = project(game.player.x, game.player.y);
    assert.ok(selected); assert.equal(selected.id, 'survivor-shotgun-walk');
    assert.ok(selected.placement.groundingHeight > 0 && selected.placement.groundingHeight < .7);
    near(selected.placement.depth, q.y); near(selected.placement.groundFoot.y, q.y);
    near(selected.placement.foot.y, q.y + selected.placement.groundingHeight);
    const shot = f.renderer.nativePlayerShots.get(game.player), muzzle = selected.frame.weaponMuzzle;
    near(shot.muzzle.height, muzzle.z - selected.placement.groundingHeight);
    const projected = project(shot.muzzle.x, shot.muzzle.y, shot.muzzle.height);
    near(shot.point.x, projected.x); near(shot.point.y, projected.y);
    assert.equal(capture(game), before);
  }
  game.player.x += 1;
  assert.equal(f.renderer.currentNativeFrame(game.player), null, 'a moved actor still invalidates the old visible frame');
});

test('the native identification contour uses body-only head and torso alpha with no duplicate fill or gun/legs', async () => {
  const f = await nativeFixture(), game = new Game({ seed: 821 }); game.player.invul = 0;
  f.renderer.drawPlayer(f.c, game.player, game, game.time); f.reset();
  f.renderer.drawPlayerIdentification(f.c, game.player);
  assert.equal(f.calls.images.length, 0); assert.equal(f.calls.fills.length, 0); assert.equal(f.calls.strokes.length, 3);
  const top = project(game.player.x, game.player.y).y - 45, bottom = project(game.player.x, game.player.y).y - 12;
  for (const stroke of f.calls.strokes) { assert.equal(stroke.color, '#ded6b4'); near(stroke.alpha, .68); near(stroke.cssWidth * f.renderer.zoom, 1.3); for (const point of stroke.points) assert.ok(point.y >= top && point.y < bottom); }
  const reads = f.calls.alphaReads; f.renderer.drawPlayerIdentification(f.c, game.player); assert.equal(f.calls.alphaReads, reads, 'each alpha frame is read once');
  const contour = bodyIdentificationContour(bodyPixels(), 128, 128, { x: 42, y: 20, width: 40, height: 92 }, { x: 48, y: 40, width: 28, height: 46 });
  assert.equal(contour.left[0].x, 55); assert.equal(contour.left.at(-1).y, 85.5);
});

test('native player and enemy core bounds respect the existing depth order for identification', async () => {
  const f = await nativeFixture(), game = new Game({ seed: 821 }); game.player.invul = 0;
  await f.art.load('walker'); const enemy = { x: game.player.x + 10, y: game.player.y + 10, r: 14, type: 'walker', hp: 100, maxHp: 100, walkPhase: 0, angle: 0 };
  f.renderer.cameraProjection = project(game.player.x, game.player.y);
  f.renderer.drawPlayer(f.c, game.player, game, game.time); f.renderer.drawEnemy(f.c, enemy, game.time, game);
  const playerEntry = { kind: 'player', p: game.player }, enemyEntry = { kind: 'enemy', e: enemy };
  assert.equal(f.renderer.playerIdentificationNeeded(game, [playerEntry, enemyEntry]), true);
  assert.equal(f.renderer.playerIdentificationNeeded(game, [enemyEntry, playerEntry]), false);
  enemy.dead = true; assert.equal(f.renderer.playerIdentificationNeeded(game, [playerEntry, enemyEntry]), false);
});

test('native bosses and normal enemy types retain names, health and alarm captions after body replacement', async () => {
  const f = await nativeFixture(), game = new Game({ seed: 821, missionId: 'mission-01' });
  await Promise.all(['boss-01-mid', 'collector', 'elite', 'shield', 'gas'].map(id => f.art.load(id)));
  const boss = game.spawnMissionBoss('mid'); boss.hp--; boss.burn=1; f.reset(); f.renderer.drawEnemy(f.c, boss, game.time, game);
  assert.equal(f.calls.images.length, 1); assert.equal(f.calls.images[0].image.id, 'boss-01-mid'); assert.ok(f.calls.texts.some(text => text.text === getBoss('boss-01-mid').name));
  assert.ok(f.calls.fills.some(draw=>draw.color==='#ce7638'),'native boss retains the existing burn feedback');
  for (const type of ['elite', 'shield', 'gas', 'collector']) {
    const enemy = { id: 44, x: 1250, y: 960, r: type === 'collector' ? 49 : 14, type, hp: 90, maxHp: 100, angle: 0, walkPhase: 0, gatekeeper: type === 'elite' };
    f.reset(); f.renderer.drawEnemy(f.c, enemy, game.time, game); assert.equal(f.calls.images.length, 1); assert.ok(f.calls.fills.length >= 3, `${type} keeps ground shadow and health display`);
    if (type === 'elite') assert.ok(f.calls.texts.some(text => text.text === '봉쇄 정예'));
  }
});

test('native environment selection is explicit, uniformly fitted and preserves building ghost opacity', async () => {
  const f = await nativeFixture(); await f.art.load('building');
  const obstacle = Object.freeze({ x: 100, y: 200, w: 120, h: 120, kind: 'building', variant: 'brick' }), game = { world: { theme: 'demolition' }, player: { x: 110, y: 210 } };
  f.renderer.occludesPlayer = () => true; f.reset(); f.renderer.drawObstacle(f.c, obstacle, game);
  assert.equal(f.calls.images.length, 1); near(f.calls.images[0].alpha, .27); assert.equal(f.c.globalAlpha, 1);
  const fit = f.renderer.nativeActorFrames.get(obstacle).placement.footprint;
  near(fit.uniformScale, 1.5); assert.deepEqual(fit.fitted, { width: 60, height: 120 });
  assert.deepEqual(obstacle, { x: 100, y: 200, w: 120, h: 120, kind: 'building', variant: 'brick' });
  f.reset(); f.renderer.drawObstacle(f.c, obstacle, { ...game, world: { theme: 'harbor' } });
  assert.equal(f.calls.images.length, 0); assert.ok(f.calls.fills.length > 3);
});

test('native portraits stay instance-scoped and fit the actual visible outline without adding UI labels', async () => {
  const f = await nativeFixture(); await f.art.load('boss-01-mid'); f.reset();
  assert.equal(f.renderer.nativePortrait(f.canvas, 'boss-01-mid'), true); assert.equal(f.calls.images.length, 1); assert.equal(f.calls.texts.length, 0);
  const painted=f.calls.images[0], [, , sw, sh, dx, dy, dw, dh]=painted.args;
  const m=painted.matrix,point=(x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
  for(const [x,y] of [[40,18],[84,114]]){
    const visible=point(dx+x/sw*dw,dy+y/sh*dh);
    assert.ok(visible.x>=12-1e-7&&visible.x<=180-12+1e-7);assert.ok(visible.y>=12-1e-7&&visible.y<=190-12+1e-7);
  }
  f.reset(); assert.equal(renderBossPortrait(f.canvas, 'boss-01-mid', { renderer: f.renderer }), true); assert.equal(f.calls.images.length, 1);
  const other = new Renderer(f.canvas); f.reset(); assert.equal(other.nativePortrait(f.canvas, 'boss-01-mid'), true); assert.equal(f.calls.images.length, 0, 'a separate renderer retains its own empty catalog');
});

test('native render passes and paused redraws preserve real engine checkpoints, IDs, both RNG streams and effect queues', async () => {
  const f = await nativeFixture(), game = new Game({ seed: 821 }); game.enemies = []; game.world.obstacles = []; game.world.decor = []; game.spawnClock = 1e9;
  game.shoot(); game.pause(); const snapshot = game.snapshot(); assert.ok(snapshot);
  const before = capture(game); f.renderer.makeFloor = () => { f.renderer.floor = {}; };
  const random = Math.random, now = Date.now;
  try { Math.random = () => { throw new Error('Rendering cannot consume random state'); }; Date.now = () => { throw new Error('Rendering uses supplied clocks'); };
    for (const clock of [0, .1, 1, 50]) f.renderer.render(game, { fireMode: 'auto', targetId: null }, clock);
  } finally { Math.random = random; Date.now = now; }
  assert.equal(capture(game), before); assert.deepEqual(game.snapshot(), snapshot);
  assert.equal(Game.restore(snapshot).player.hp, game.player.hp);
});

test('DOM-only diagnostics describe the actual painted path and sanitized loading failures without layout or game changes', async () => {
  const f=await nativeFixture(),game=new Game({seed:821});
  const before=capture(game),size=[f.canvas.width,f.canvas.height],style={...f.canvas.style};
  f.renderer.drawPlayer(f.c,game.player,game,game.time);
  assert.equal(f.canvas.dataset.productionPlayer,'survivor-shotgun-idle');
  assert.equal(f.canvas.dataset.productionDrawStatus,'native');assert.equal(f.canvas.dataset.productionStatus,'ready');
  assert.equal(f.canvas.dataset.productionFrame,'12');
  assert.equal(JSON.stringify(f.canvas.dataset).includes('https:'),false);
  assert.equal(JSON.stringify(f.canvas.dataset).includes('/assets/'),false);
  assert.equal(capture(game),before);assert.deepEqual([f.canvas.width,f.canvas.height],size);assert.deepEqual(f.canvas.style,style);
  const failed=f.art.records.get('survivor-shotgun-run');failed.status='failed';failed.error='Failed to fetch https://example.com/private.png';
  f.renderer.productionAssetChanged({id:'survivor-shotgun-run',status:'failed',error:failed.error});
  f.renderer.drawPlayer(f.c,game.player,game,game.time);
  assert.equal(f.canvas.dataset.productionStatus,'failed');assert.equal(f.canvas.dataset.productionError,'asset-load-failed');
  assert.equal(f.canvas.dataset.productionFailedAsset,'survivor-shotgun-run');
  assert.equal(f.canvas.dataset.productionPlayer,'survivor-shotgun-idle','a ready idle+walk pair can still paint while the failed run is diagnosed');
  assert.equal(JSON.stringify(f.canvas.dataset).includes('https:'),false);
  const unloaded=fixture(),renderer=new Renderer(unloaded.canvas);renderer.drawPlayer(unloaded.c,game.player,game,game.time);
  assert.equal(unloaded.canvas.dataset.productionPlayer,'legacy');assert.equal(unloaded.canvas.dataset.productionStatus,'unregistered');
});

test('declared body-alpha failures are retried explicitly while successful and inflight masks stay deduplicated', async () => {
  const f=await nativeFixture(),id='survivor-shotgun-idle',record=f.art.get(id),notifications=[];
  record.bodyAlpha=null;record.bodyAlphaPromise=null;record.bodyAlphaStatus='idle';
  let fail=true,loads=0;
  f.art.ImageCtor=class {set src(url){loads++;this.naturalWidth=record.metadata.atlas.width;this.naturalHeight=record.metadata.atlas.height;queueMicrotask(()=>fail?this.onerror?.():this.onload?.());}};
  const previous=f.art.onChange;f.art.onChange=change=>{notifications.push(change.status);previous(change);};
  const first=f.art.loadBodyAlpha(id);assert.equal(f.art.loadBodyAlpha(id,{retry:true}),first);
  assert.equal(await first,false);assert.equal(record.bodyAlphaStatus,'failed');assert.equal(f.art.status(id),'ready');
  fail=false;assert.equal(await f.art.loadBodyAlpha(id),false);assert.equal(loads,1);
  assert.equal(await f.art.loadBodyAlpha(id,{retry:true}),true);assert.equal(record.bodyAlphaStatus,'ready');assert.equal(loads,2);
  assert.equal(await f.art.loadBodyAlpha(id,{retry:true}),true);assert.equal(loads,2);
  assert.deepEqual(notifications,['body-alpha-loading','body-alpha-failed','body-alpha-loading','body-alpha-ready']);
});


test('real engine hits briefly brighten the identical native enemy and boss alpha without extra masks or state drift',async()=>{
 for(const role of ['enemy','boss']){
  const f=await nativeFixture(),game=new Game({seed:823,missionId:role==='boss'?'mission-01':undefined});
  const e=role==='boss'?game.spawnMissionBoss('mid'):game.spawnEnemy('shield',450);
  assert.ok(e);await f.art.load(role==='boss'?'boss-01-mid':'shield');
  game.damageEnemy(e,1);assert.equal(e.hitFlash,.12);const before=capture(game),reads=f.calls.alphaReads;
  f.reset();f.c.globalAlpha=.65;f.renderer.drawEnemy(f.c,e,game.time,game);
  assert.equal(f.calls.images.length,2);
  const [body,flash]=f.calls.images;
  assert.equal(body.image,flash.image);assert.deepEqual(body.args,flash.args);
  assert.equal(body.composite,'source-over');assert.equal(flash.composite,'screen');
  near(flash.alpha,body.alpha*.82);near(f.c.globalAlpha,.65);assert.equal(f.c.globalCompositeOperation,'source-over');
  assert.equal(f.calls.alphaReads,reads);assert.equal(capture(game),before);
  e.hitFlash=0;f.reset();f.renderer.drawEnemy(f.c,e,game.time,game);assert.equal(f.calls.images.length,1);
 }
});

test('connected native building blocks reuse placements until their actual geometry or image changes',async()=>{
 const f=await nativeFixture();await f.art.load('building');
 const obstacle={x:100,y:200,w:510,h:450,kind:'building',variant:'brick'};
 const native=f.art.propFrame('building',obstacle),entry='env-common-brick';
 f.art.extendManifest({environment:{[entry]:'building'}});
 const first=f.renderer.nativeBuildingBlock(obstacle,native,entry);
 assert.ok(first?.sections.length>0);
 assert.equal(f.renderer.nativeBuildingBlock(obstacle,native,entry),first);
 obstacle.x+=5;
 assert.notEqual(f.renderer.nativeBuildingBlock(obstacle,native,entry),first);
 assert.equal(f.renderer.nativeBuildingBlock(obstacle,native,'building'),null);
});
