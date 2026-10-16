import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Game } from '../dist/engine.js';
import { Navigation } from '../dist/navigation.js';

const wall = (x, y, w, h, kind = 'building') => ({ x, y, w, h, kind, hp: Infinity, destroyed: false });
const world = obstacles => ({ width: 960, height: 720, obstacles });
const cornerWorld = () => world([wall(400, 140, 110, 320), wall(400, 350, 300, 110)]);
const length = point => Math.hypot(point.x, point.y);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function walker(nav, map, origin, target, radius = 18, limit = 1500) {
  const game = new Game({ seed: 37 });
  game.world = map;
  const actor = { ...origin, r: radius };
  const path = [{ x: actor.x, y: actor.y }];
  for (let step = 0; step < limit && distance(actor, target) > 4; step++) {
    const before = { x: actor.x, y: actor.y }, vector = nav.direction(actor, target, radius);
    assert.ok(Number.isFinite(vector.x) && Number.isFinite(vector.y));
    assert.ok(Math.abs(length(vector) - 1) < 1e-9, `A reachable route must keep moving at step ${step}`);
    const stride = Math.min(3, distance(actor, target));
    game.move(actor, vector.x * stride, vector.y * stride);
    assert.ok(distance(actor, before) > .1, `Route became stuck at ${actor.x},${actor.y}`);
    assert.equal(game.blocked(actor.x, actor.y, radius), false, 'Physical movement must never enter a wall');
    assert.equal(nav.lineOfSight(before, actor, radius), true, 'The continuous movement segment must also be clear');
    assert.ok(distance(actor, before) <= stride + 1e-9, 'Navigation must not teleport the actor');
    path.push({ x: actor.x, y: actor.y });
  }
  assert.ok(distance(actor, target) <= 4, `Did not reach target: ${actor.x},${actor.y}`);
  return path;
}

test('an actor physically reaches the other side of an L corner without crossing a wall', () => {
  const map = cornerWorld(), nav = new Navigation(map);
  const before = JSON.stringify(map), origin = { x: 300, y: 280 }, target = { x: 620, y: 260 };
  assert.equal(nav.lineOfSight(origin, target), false);
  const path = walker(nav, map, origin, target);
  assert.ok(path.some(point => point.y < 122), 'The actor should take the clear street above the L wall');
  assert.equal(JSON.stringify(map), before);
  assert.deepEqual(origin, { x: 300, y: 280 });
  assert.deepEqual(target, { x: 620, y: 260 });
});

test('player and lure can alternate flow fields and lead through different corners', () => {
  const map = cornerWorld(), nav = new Navigation(map), from = { x: 300, y: 280 };
  const player = { x: 620, y: 260 }, lure = { x: 620, y: 560 };
  const playerVector = nav.direction(from, player), lureVector = nav.direction(from, lure);
  assert.ok(playerVector.y < 0, 'The player route should go above the wall');
  assert.ok(lureVector.y > 0, 'The lure route should go below the wall');
  for (let i = 0; i < 40; i++) {
    assert.deepEqual(nav.direction(from, player), playerVector);
    assert.deepEqual(nav.direction(from, lure), lureVector);
  }
  walker(nav, map, from, lure);
});

test('a destroyed car immediately opens a shortcut and rebuilding it closes the shortcut', () => {
  const car = wall(430, 140, 100, 400, 'car'), map = world([car]), nav = new Navigation(map);
  const from = { x: 300, y: 360 }, target = { x: 700, y: 360 };
  const before = nav.direction(from, target);
  assert.ok(Math.abs(before.y) > .1);
  assert.equal(nav.lineOfSight(from, target), false);
  car.destroyed = true;
  assert.deepEqual(nav.direction(from, target), { x: 1, y: 0 });
  assert.equal(nav.lineOfSight(from, target), true);
  car.destroyed = false;
  assert.equal(nav.lineOfSight(from, target), false);
  assert.deepEqual(nav.direction(from, target), before);
});

test('unreachable rooms return a finite zero direction rather than targeting through a wall', () => {
  const map = world([wall(440, 0, 80, 720, 'fence')]), nav = new Navigation(map);
  for (const radius of [12, 18, 27, 49]) {
    assert.equal(nav.lineOfSight({ x: 250, y: 360 }, { x: 700, y: 360 }, radius), false);
    assert.deepEqual(nav.direction({ x: 250, y: 360 }, { x: 700, y: 360 }, radius), { x: 0, y: 0 });
  }
});

test('a previously unreachable route opens after a destroyed divider invalidates failed fields', () => {
  const divider = wall(440, 0, 80, 720, 'car'), nav = new Navigation(world([divider]));
  const from = { x: 250, y: 360 }, target = { x: 700, y: 360 };
  for (let i = 0; i < 20; i++) assert.deepEqual(nav.direction(from, target, 27), { x: 0, y: 0 });
  divider.destroyed = true;
  assert.deepEqual(nav.direction(from, target, 27), { x: 1, y: 0 });
});

test('a target too close to a wall is approached at a physically safe reachable edge', () => {
  const map = world([wall(430, 140, 100, 400)]), nav = new Navigation(map);
  const game = new Game({ seed: 52 }); game.world = map;
  const actor = { x: 300, y: 360, r: 18 }, target = { x: 414, y: 360 };
  for (let i = 0; i < 200; i++) {
    const vector = nav.direction(actor, target, actor.r);
    if (!length(vector)) break;
    const before = { ...actor };
    game.move(actor, vector.x * 3, vector.y * 3);
    assert.ok(distance(actor, before) > .1, 'Approaching a blocked target must not keep pushing into the wall');
    assert.equal(game.blocked(actor.x, actor.y, actor.r), false);
  }
  assert.ok(distance(actor, target) < 12, 'The actor should approach close enough to attack a smaller player');
  assert.deepEqual(nav.direction(actor, target, actor.r), { x: 0, y: 0 });
});

test('source cells next to a wall can find a nearby visible grid node', () => {
  const map = cornerWorld(), nav = new Navigation(map);
  const from = { x: 385, y: 280 }, target = { x: 620, y: 260 };
  walker(nav, map, from, target, 14);
});

test('an elite can follow the narrow real street around a building and a fence', () => {
  const map = { width: 2400, height: 1800, obstacles: [
    wall(1770, 120, 510, 450), wall(1400, 540, 380, 200),
    wall(1880, 670, 400, 300), wall(1450, 1070, 330, 200),
    wall(1800, 820, 8, 220, 'fence'),
  ] };
  const nav = new Navigation(map);
  const path = walker(nav, map, { x: 1830.674547, y: 676.40358 }, { x: 1200, y: 930 }, 27);
  assert.ok(path.some(point => point.x < 1780 && point.y > 767 && point.y < 793), 'The physical 80px street above the fence must remain reachable');
});

test('a small actor fits a doorway while the collector cannot squeeze through', () => {
  const map = world([wall(450, 0, 60, 300, 'fence'), wall(450, 380, 60, 340, 'fence')]), nav = new Navigation(map);
  const from = { x: 300, y: 340 }, target = { x: 700, y: 340 };
  walker(nav, map, from, target, 18);
  assert.deepEqual(nav.direction(from, target, 49), { x: 0, y: 0 });
  const wideMap = world([wall(450, 0, 60, 280, 'fence'), wall(450, 440, 60, 280, 'fence')]);
  walker(new Navigation(wideMap), wideMap, { x: 300, y: 360 }, { x: 700, y: 360 }, 49);
});

test('line of sight respects rounded circle clearance at a rectangle corner', () => {
  const nav = new Navigation(world([wall(300, 300, 100, 100)]));
  assert.equal(nav.lineOfSight({ x: 250, y: 324 }, { x: 324, y: 250 }, 18), true, 'A circle may pass outside a rounded corner');
  assert.equal(nav.lineOfSight({ x: 260, y: 324 }, { x: 324, y: 260 }, 18), false, 'A radius must not clip the same corner');
});

test('adjacent, identical, and invalid points cannot produce NaN or unwanted movement', () => {
  const nav = new Navigation(world([]));
  const from = { x: 200, y: 200 };
  assert.deepEqual(nav.direction(from, from), { x: 0, y: 0 });
  assert.deepEqual(nav.direction(from, { x: 200, y: 200.1 }), { x: 0, y: 1 });
  assert.deepEqual(nav.direction(from, { x: NaN, y: 200 }), { x: 0, y: 0 });
  assert.deepEqual(nav.direction({ x: Infinity, y: 200 }, from), { x: 0, y: 0 });
  assert.equal(nav.lineOfSight(from, { x: NaN, y: 200 }), false);
});

test('explicit invalidation updates a changed obstacle layout', () => {
  const car = wall(430, 140, 100, 400, 'car'), map = world([car]), nav = new Navigation(map);
  const from = { x: 300, y: 360 }, target = { x: 700, y: 360 };
  assert.ok(Math.abs(nav.direction(from, target).y) > .1);
  car.y = 550; car.h = 40;
  nav.invalidate();
  assert.deepEqual(nav.direction(from, target), { x: 1, y: 0 });
});

test('210 enemies with seven radii reuse player and lure navigation within a bounded frame budget', { timeout: 15000 }, () => {
  const map = { width: 2400, height: 1800, obstacles: [wall(1000, 350, 275, 800), wall(1000, 875, 750, 275)] };
  const nav = new Navigation(map), radii = [12, 14, 15, 18, 19, 27, 49];
  const targets = [{ x: 1550, y: 650 }, { x: 1550, y: 1400 }];
  const actors = Array.from({ length: 210 }, (_, i) => ({ x: 675 + (i % 6) * 16, y: 575 + (i % 9) * 18, r: radii[i % radii.length] }));
  const before = JSON.stringify({ map, targets, actors });
  for (const actor of actors) for (const target of targets) nav.direction(actor, target, actor.r);
  const started = performance.now();
  for (let frame = 0; frame < 40; frame++) for (const actor of actors) {
    const vector = nav.direction(actor, targets[frame % 2], actor.r);
    assert.ok(Number.isFinite(vector.x) && Number.isFinite(vector.y));
    assert.ok(length(vector) <= 1 + 1e-9);
  }
  assert.ok(performance.now() - started < 2500, 'Repeated mixed crowds must use shared flow fields instead of rebuilding BFS per actor');
  assert.equal(JSON.stringify({ map, targets, actors }), before);
});
