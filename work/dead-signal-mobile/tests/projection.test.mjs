import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { ISO_C, ISO_S, project, unproject, screenVectorToWorld } from '../dist/projection.js';

function near(actual, expected, context = '') {
  assert.ok(Number.isFinite(actual), `${context}: coordinate must be finite`);
  assert.ok(Math.abs(actual - expected) <= 1e-9, `${context}: expected ${expected}, received ${actual}`);
}
function pointNear(actual, expected, context = '') {
  near(actual.x, expected.x, `${context} x`);
  near(actual.y, expected.y, `${context} y`);
}

test('world bounds and elevated art points survive projection and inverse projection', () => {
  const points = [
    { x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 0, y: 1800 },
    { x: 2400, y: 1800 }, { x: 1200, y: 930 }, { x: 49, y: 49 },
    { x: 2351, y: 1751 }, { x: 630.25, y: 935.125 },
    { x: -150.75, y: 1820.5 },
  ];
  for (const point of points) for (const height of [0, 14, 22, 90, 260]) {
    const image = project(point.x, point.y, height);
    const recovered = unproject(image.x, image.y, height);
    pointNear(recovered, point, `height=${height}, world=${point.x},${point.y}`);
  }
});

test('the ground axes form equal length isometric diagonals and art rises vertically', () => {
  const origin = project(0, 0);
  pointNear(origin, { x: 0, y: 0 });
  const east = project(1, 0);
  const south = project(0, 1);
  assert.ok(east.x > 0 && east.y > 0);
  assert.ok(south.x < 0 && south.y > 0);
  near(Math.hypot(east.x, east.y), 1, 'east projected length');
  near(Math.hypot(south.x, south.y), 1, 'south projected length');
  near(east.x * south.x + east.y * south.y, -.5, 'ground axes meet at 120 degrees');
  const base = project(860, 1370, 0);
  const roof = project(860, 1370, 260);
  near(roof.x, base.x, 'roof horizontal alignment');
  near(base.y - roof.y, 260, 'vertical rise');
  assert.ok(ISO_C > ISO_S && ISO_S > 0);
});

test('all eight keyboard directions retain their intended screen direction at equal world speed', () => {
  const directions = [
    ['W', 0, -1], ['D', 1, 0], ['S', 0, 1], ['A', -1, 0],
    ['WD', 1, -1], ['DS', 1, 1], ['SA', -1, 1], ['AW', -1, -1],
  ];
  for (const [key, x, y] of directions) {
    const world = screenVectorToWorld(x, y);
    near(Math.hypot(world.x, world.y), 1, `${key} world speed`);
    const screen = project(world.x, world.y);
    const length = Math.hypot(screen.x, screen.y);
    const desired = Math.hypot(x, y);
    near(screen.x / length, x / desired, `${key} screen direction x`);
    near(screen.y / length, y / desired, `${key} screen direction y`);
  }
});

test('W and D move a real engine player up and right on screen', () => {
  for (const [key, sx, sy] of [['W', 0, -1], ['D', 1, 0]]) {
    const game = new Game({ seed: 937 });
    game.enemies = [];
    game.spawnClock = 1e9;
    const before = project(game.player.x, game.player.y);
    const input = screenVectorToWorld(sx, sy);
    game.tick(.05, { moveX: input.x, moveY: input.y });
    const after = project(game.player.x, game.player.y);
    assert.equal(game.blocked(game.player.x, game.player.y, game.player.r), false);
    if (key === 'W') {
      near(after.x, before.x, 'W retains screen column');
      assert.ok(after.y < before.y);
    } else {
      near(after.y, before.y, 'D retains screen row');
      assert.ok(after.x > before.x);
    }
  }
});

test('zero movement is finite and remains zero; analog directions keep their angle', () => {
  pointNear(screenVectorToWorld(0, 0), { x: 0, y: 0 });
  for (const [x, y] of [[.01, -.02], [-.75, .1], [3.6, -1.4]]) {
    const world = screenVectorToWorld(x, y);
    const screen = project(world.x, world.y);
    const magnitude = Math.hypot(screen.x, screen.y);
    const expectedMagnitude = Math.hypot(x, y);
    near(screen.x / magnitude, x / expectedMagnitude, 'analog screen x');
    near(screen.y / magnitude, y / expectedMagnitude, 'analog screen y');
    assert.ok(Math.hypot(world.x, world.y) <= 1 + 1e-9);
  }
});

test('cursor at a 22px weapon height recovers the same ground target and aim angle', () => {
  const player = { x: 1200, y: 930 };
  const targets = [{ x: 1360, y: 930 }, { x: 900, y: 1150 }, { x: 1400, y: 600 }];
  const camera = project(1100, 870);
  for (const zoom of [.6, .85, 1, 1.24, 1.8]) for (const target of targets) {
    const image = project(target.x, target.y, 22);
    const screen = { x: 960 / 2 + (image.x - camera.x) * zoom, y: 640 / 2 + (image.y - camera.y) * zoom };
    const recovered = unproject((screen.x - 960 / 2) / zoom + camera.x, (screen.y - 640 / 2) / zoom + camera.y, 22);
    pointNear(recovered, target, `aim target at zoom ${zoom}`);
    near(Math.atan2(recovered.y - player.y, recovered.x - player.x), Math.atan2(target.y - player.y, target.x - player.x), 'aim angle');
    const groundOnly = unproject(image.x, image.y);
    assert.ok(Math.hypot(groundOnly.x - target.x, groundOnly.y - target.y) > 20, 'Weapon height must be explicitly restored for aiming');
  }
});
