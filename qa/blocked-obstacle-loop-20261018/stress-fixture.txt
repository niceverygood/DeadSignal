import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Game, UPGRADES, circleRect } from '../dist/engine.js';
import { loadProfile, saveProfile, recordRun, PROFILE_KEY } from '../dist/storage.js';

// Focused fixtures keep the real map and normal actions. Enemy spawns are held
// while a particular interaction is under test; flow/stress tests use spawns.
function isolated(options = {}) {
  const game = new Game({ seed: 4168, ...options });
  game.enemies = [];
  game.spawnClock = 1e9;
  game.drainEvents();
  return game;
}
function step(game, seconds, input = {}, dt = 1 / 120) {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) game.tick(dt, input);
}
function waitFor(game, condition, seconds = 5) {
  for (let i = 0; i < seconds * 120 && !condition(); i++) game.tick(1 / 120);
  assert.ok(condition(), `Condition not reached; state=${game.state}, stage=${game.stage}`);
}
function removeEnemy(game, enemy) {
  assert.ok(enemy);
  game.damageEnemy(enemy, enemy.hp + 1);
}

test('seeded actions produce the same world and combat result', () => {
  const run = () => {
    const game = new Game({ seed: 937, weapon: 'nailgun' });
    step(game, 4, { moveX: 1, moveY: -.4, shoot: true, aimX: 1900, aimY: 930 });
    return JSON.stringify({ world: game.world, player: game.player, enemies: game.enemies, kills: game.kills, parts: game.parts, time: game.time });
  };
  assert.equal(run(), run());
});

test('pause and upgrade menus freeze world, player timers, and combat', () => {
  const game = isolated();
  game.shoot();
  game.placeLure(1350, 930);
  game.pause();
  const snapshot = () => JSON.stringify({ time: game.time, stageTime: game.stageTime, player: game.player, bullets: game.bullets, lure: game.lure, noise: game.noise });
  const paused = snapshot();
  step(game, 2, { moveX: 1, shoot: true, dash: true });
  assert.equal(snapshot(), paused);
  game.resume();
  game.gainXP(game.player.xpNext);
  game.tick(1 / 120);
  assert.equal(game.state, 'upgrade');
  const upgrading = snapshot();
  step(game, 2, { moveX: 1, shoot: true });
  assert.equal(snapshot(), upgrading);
});

test('upgrade choices are unique, valid, uncapped, and queued levels are consumed', () => {
  const game = isolated();
  game.gainXP(100);
  game.tick(0);
  let selections = 0;
  while (game.state === 'upgrade') {
    const ids = game.choices.map(choice => choice.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.length > 0 && ids.length <= 3);
    for (const choice of game.choices) assert.ok(UPGRADES.some(upgrade => upgrade.id === choice.id));
    const before = JSON.stringify(game.upgrades);
    assert.equal(game.chooseUpgrade('nonexistent'), false);
    assert.equal(JSON.stringify(game.upgrades), before);
    assert.equal(game.chooseUpgrade(ids[0]), true);
    selections++;
  }
  assert.equal(game.pendingLevels, 0);
  assert.equal(game.state, 'playing');
  assert.equal(selections, game.player.level - 1);
  for (const choice of UPGRADES) game.upgrades[choice.id] = choice.max;
  game.pendingLevels = 1;
  game.showUpgrade();
  assert.equal(game.pendingLevels, 1);
  assert.equal(game.state, 'upgrade');
  assert.equal(game.choices.length, 3);
  const beyond = game.choices[0], previous = game.upgrades[beyond.id];
  assert.equal(game.chooseUpgrade(beyond.id), true);
  assert.equal(game.upgrades[beyond.id], previous + 1);
  assert.equal(game.pendingLevels, 0);
  assert.equal(game.state, 'playing');
});

test('walking and a complete dash cannot cross a building or intact car', () => {
  const game = isolated();
  game.player.x = 650;
  game.player.y = 340;
  step(game, 1, { moveX: -1 });
  assert.ok(game.player.x >= 644);
  assert.equal(game.blocked(game.player.x, game.player.y, game.player.r), false);
  const car = game.world.obstacles.find(obstacle => obstacle.kind === 'car');
  game.player.x = car.x - game.player.r - 16;
  game.player.y = car.y + car.h / 2;
  game.tick(.05, { moveX: 1, dash: true });
  step(game, .5, { moveX: 1 }, .05);
  assert.ok(game.player.x <= car.x - game.player.r);
  assert.equal(circleRect(game.player.x, game.player.y, game.player.r, car), false);
  game.player.x = 49;
  step(game, 1, { moveX: -1 });
  assert.ok(game.player.x >= 49);
});

test('circle collisions preserve edge and rounded corner tangency after optimization', () => {
  const rect = { x: 100, y: 100, w: 80, h: 40 };
  assert.equal(circleRect(140, 120, 1, rect), true);
  assert.equal(circleRect(140, 120, 0, rect), false);
  assert.equal(circleRect(140, 120, -5, rect), false);
  assert.equal(circleRect(95, 120, 5, rect), false, 'An exact edge tangent has no overlap');
  assert.equal(circleRect(95, 120, 5.01, rect), true);
  assert.equal(circleRect(97, 96, 5, rect), false, 'The 3-4-5 corner tangent has no overlap');
  assert.equal(circleRect(97, 96, 5.01, rect), true);
  assert.equal(circleRect(183, 144, 5, rect), false);
  assert.equal(circleRect(183, 144, 5.01, rect), true);
  assert.equal(circleRect(240, 220, 5, rect), false);
});

test('lure changes walker direction while collector continues toward player', () => {
  const game = isolated();
  const walker = game.spawnEnemy('walker', 0, { x: 1360, y: 930 });
  assert.equal(game.placeLure(1440, 930), true);
  const before = walker.x;
  step(game, .1);
  assert.ok(walker.x > before, 'Walker should approach lure to its right');
  assert.equal(game.placeLure(1300, 930), false, 'Cooldown should prevent replacing the lure');
  game.enemies = [];
  const boss = game.spawnEnemy('collector', 0, { x: 1360, y: 930 });
  const bossX = boss.x;
  step(game, .1);
  assert.ok(boss.x < bossX, 'Collector should approach player to its left');
});

test('gas deaths and car/barrel explosions terminate and count each enemy once', () => {
  const game = isolated();
  game.player.x = 1200;
  game.player.y = 930;
  const gasA = game.spawnEnemy('gas', 0, { x: 1480, y: 950 });
  const gasB = game.spawnEnemy('gas', 0, { x: 1510, y: 950 });
  const walker = game.spawnEnemy('walker', 0, { x: 1520, y: 930 });
  removeEnemy(game, gasA);
  assert.equal(gasA.dead, true);
  assert.equal(gasB.dead, true);
  assert.equal(walker.dead, true);
  assert.equal(game.kills, 3);
  assert.equal(game.parts, 3);
  removeEnemy(game, gasA);
  assert.equal(game.kills, 3);
  assert.equal(game.explosionDepth, 0);
  const car = game.world.obstacles.find(obstacle => obstacle.kind === 'car');
  game.explode(car.x + car.w / 2, car.y + car.h / 2, 180, 200, false);
  assert.equal(car.destroyed, true);
  assert.equal(game.explosionDepth, 0);
  assert.ok(game.particles.length <= 850);
});

test('normal shots kill an enemy, grant parts, and allow XP pickup', () => {
  const game = isolated({ weapon: 'nailgun' });
  game.spawnEnemy('walker', 0, { x: 1370, y: 930 });
  game.player.x = 1300;
  step(game, 2, { shoot: true, aimX: 1370, aimY: 930 });
  assert.equal(game.kills, 1);
  assert.equal(game.parts, 1);
  assert.equal(game.player.xp, 4);
  assert.equal(game.enemies.length, 0);
  assert.ok(game.player.ammo >= 0 && game.player.ammo <= game.player.maxAmmo);
});

test('fast nailgun bullets hit crossed enemies at the maximum supported tick', () => {
  const game = isolated({ weapon: 'nailgun' });
  const enemy = game.spawnEnemy('walker', 0, { x: 1360, y: 930 });
  game.player.x = 1310;
  const hp = enemy.hp;
  game.tick(.05, { shoot: true, aimX: 1500, aimY: 930 });
  assert.ok(enemy.hp < hp, 'A bullet passing through the enemy circle must hit');
});

test('fast bullets cannot shoot through a narrow explosive barrel', () => {
  const game = isolated({ weapon: 'nailgun' });
  const enemy = game.spawnEnemy('walker', 0, { x: 715, y: 935 });
  const barrel = game.world.obstacles.find(obstacle => obstacle.x === 630 && obstacle.y === 920);
  const enemyHp = enemy.hp;
  game.player.x = 600;
  game.player.y = 935;
  game.tick(.05, { shoot: true, aimX: 1000, aimY: 935 });
  game.tick(.05);
  assert.ok(barrel.hp < barrel.maxHp, 'Crossed barrel must intercept the bullet');
  assert.equal(enemy.hp, enemyHp, 'Enemy behind the intact barrel must be protected');
});

test('the nearest enemy intercepts a shot before a farther obstacle', () => {
  const game = isolated({ weapon: 'nailgun' });
  const enemy = game.spawnEnemy('walker', 0, { x: 612, y: 935 });
  const barrel = game.world.obstacles.find(obstacle => obstacle.x === 630 && obstacle.y === 920);
  const hp = enemy.hp;
  game.player.x = 580;
  game.player.y = 935;
  game.tick(.05, { shoot: true, aimX: 1000, aimY: 935 });
  assert.ok(enemy.hp < hp);
  assert.equal(barrel.hp, barrel.maxHp);
});

test('piercing bullets damage each crossed enemy once', () => {
  const game = isolated({ weapon: 'nailgun' });
  const first = game.spawnEnemy('walker', 0, { x: 1360, y: 930 });
  const second = game.spawnEnemy('walker', 0, { x: 1380, y: 930 });
  const firstHp = first.hp;
  const secondHp = second.hp;
  game.upgrades.pierce = 1;
  game.player.x = 1310;
  game.tick(.05, { shoot: true, aimX: 1600, aimY: 930 });
  assert.equal(first.hp, firstHp - 15);
  assert.equal(second.hp, secondHp - 15);
  game.tick(.05);
  assert.equal(first.hp, firstHp - 15);
  assert.equal(second.hp, secondHp - 15);
});

test('supply heal and mod charge once, respect funds, and never over-heal', () => {
  const game = isolated();
  assert.equal(game.buyHeal(), false);
  assert.equal(game.buyMod(), false);
  game.state = 'supply';
  game.player.hp = 90;
  game.parts = 19;
  assert.equal(game.buyHeal(), false);
  game.parts = 50;
  assert.equal(game.buyHeal(), true);
  assert.equal(game.player.hp, 100);
  assert.equal(game.parts, 30);
  assert.equal(game.buyHeal(), false);
  assert.equal(game.buyMod(), true);
  assert.equal(game.parts, 0);
  assert.equal(game.buyMod(), false);
  assert.equal(game.state, 'upgrade');
  game.chooseUpgrade(game.choices[0].id);
  game.finishSupplyUpgrade();
  assert.equal(game.state, 'supply');
  assert.equal(game.buyMod(), false);
  assert.ok(game.parts >= 0);
});

test('supply buys a real resumable mod beyond every original upgrade threshold', () => {
  const game = isolated({ stageDuration: .01 });
  game.tick(.02);
  removeEnemy(game, game.enemies.find(enemy => enemy.gatekeeper));
  assert.equal(game.state, 'supply');
  game.parts = 100;
  for (const upgrade of UPGRADES) game.upgrades[upgrade.id] = upgrade.max;
  assert.equal(game.buyMod(), true);
  assert.equal(game.parts, 70);
  assert.equal(game.state, 'upgrade');
  const selected=game.choices[0],previous=game.upgrades[selected.id];
  assert.equal(game.chooseUpgrade(selected.id),true);
  assert.equal(game.upgrades[selected.id],previous+1);
  game.finishSupplyUpgrade();
  assert.equal(game.state, 'supply');
  const saved=game.snapshot();assert.ok(saved);
  const copy=Game.restore(saved);assert.ok(copy);
  assert.equal(copy.state,'supply');assert.equal(copy.parts,70);
  assert.equal(copy.upgrades[selected.id],previous+1);
  assert.equal(game.buyMod(),false);assert.equal(game.parts,70);
});

test('gatekeepers, supply, hospital route, collector, and victory form one complete run', () => {
  const game = isolated({ stageDuration: 1 });
  waitFor(game, () => game.stageBossSpawned);
  const first = game.enemies.find(enemy => enemy.gatekeeper);
  removeEnemy(game, first);
  assert.equal(game.state, 'supply');
  assert.equal(game.world.exit.open, true);
  assert.equal(game.leaveSupply(), true);
  assert.equal(game.state, 'route');
  assert.equal(game.chooseRoute('invalid'), false);
  assert.equal(game.chooseRoute('hospital'), true);
  assert.equal(game.stage, 1);
  assert.equal(game.world.theme, 'commercial');
  waitFor(game, () => game.state === 'event');
  game.player.hp = 60;
  const count = game.enemies.length;
  assert.equal(game.chooseEvent(true), true);
  assert.equal(game.player.hp, 95);
  assert.ok(game.enemies.length > count);
  assert.equal(game.chooseEvent(true), false);
  waitFor(game, () => game.stageBossSpawned);
  removeEnemy(game, game.enemies.find(enemy => enemy.gatekeeper));
  assert.equal(game.state, 'supply');
  assert.equal(game.leaveSupply(), true);
  assert.equal(game.stage, 2);
  assert.equal(game.world.theme, 'station');
  waitFor(game, () => game.boss?.type === 'collector');
  removeEnemy(game, game.boss);
  assert.equal(game.state, 'victory');
  assert.equal(game.result.won, true);
  assert.equal(game.drainEvents().filter(event => event.type === 'end').length, 1);
});

test('police route triggers its alarm once and bypasses hospital event', () => {
  const game = isolated({ stageDuration: 1 });
  waitFor(game, () => game.stageBossSpawned);
  removeEnemy(game, game.enemies.find(enemy => enemy.gatekeeper));
  game.leaveSupply();
  game.chooseRoute('police');
  waitFor(game, () => game.eventSeen);
  assert.equal(game.state, 'playing');
  assert.equal(game.alarm.active, true);
  assert.equal(game.alarm.count, 1);
  assert.ok(game.enemies.some(enemy => enemy.id === game.alarm.eliteId));
});

test('death freezes simulation and emits only one end result', () => {
  const game = isolated();
  game.player.invul = 0;
  game.hurtPlayer(100);
  assert.equal(game.state, 'dead');
  const before = JSON.stringify({ player: game.player, result: game.result, time: game.time, world: game.world });
  step(game, 3, { shoot: true, dash: true, moveX: 1 });
  game.end(false);
  assert.equal(JSON.stringify({ player: game.player, result: game.result, time: game.time, world: game.world }), before);
  assert.equal(game.drainEvents().filter(event => event.type === 'end').length, 1);
});

test('a fatal contact cannot be undone by a pickup later in the same tick', () => {
  const game = isolated();
  const enemy = game.spawnEnemy('walker', 0, { x: 1360, y: 930 });
  game.player.x = enemy.x;
  game.player.hp = 8;
  game.player.invul = 0;
  game.pickups.push({ id: 999999, x: game.player.x, y: game.player.y, type: 'heal', value: 12 });
  game.tick(.01);
  assert.equal(game.state, 'dead');
  assert.equal(game.player.hp, 0, 'End state must freeze pickups before healing');
});

test('winning from a projectile stops enemy contact damage in the same tick', () => {
  const game = isolated({ weapon: 'nailgun' });
  const boss = game.spawnEnemy('collector', 0, { x: 1430, y: 930 });
  const walker = game.spawnEnemy('walker', 0, { x: 1410, y: 930 });
  game.player.x = 1400;
  game.player.invul = 0;
  boss.hp = 1;
  game.tick(.01, { shoot: true, aimX: 1600, aimY: 930 });
  assert.equal(game.state, 'victory');
  assert.equal(boss.dead, true);
  assert.equal(walker.dead, false);
  assert.equal(game.player.hp, 100, 'Contact damage must stop immediately on victory');
  assert.equal(game.drainEvents().filter(event => event.type === 'end').length, 1);
});

test('a winning explosion leaves the recorded kills and currency consistent', () => {
  const game = isolated();
  const boss = game.spawnEnemy('collector', 0, { x: 1480, y: 930 });
  game.spawnEnemy('gas', 0, { x: 1500, y: 930 });
  game.spawnEnemy('walker', 0, { x: 1520, y: 930 });
  boss.hp = 1;
  game.explode(1480, 930, 180, 200, false);
  assert.equal(game.state, 'victory');
  assert.equal(game.result.kills, game.kills, 'Result must include exactly the completed combat simulation');
  assert.equal(game.result.parts, game.parts);
  assert.equal(game.explosionDepth, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'end').length, 1);
});

test('a full crowd cannot prevent a district gatekeeper from appearing', () => {
  const game = isolated({ stageDuration: .01 });
  for (let i = 0; i < 210; i++) assert.ok(game.spawnEnemy('walker', 450));
  game.tick(.02);
  assert.ok(game.enemies.some(enemy => enemy.gatekeeper), 'Gatekeeper must reserve a slot or replace an ordinary enemy');
  assert.ok(game.enemies.length <= 211, 'Special enemies must still have a bounded reserve');
});

test('a full crowd still gives an alarm a live elite that can be killed', () => {
  const game = isolated();
  for (let i = 0; i < 210; i++) assert.ok(game.spawnEnemy('walker', 450));
  game.alarm.cooldown = 0;
  game.startAlarm();
  const elite = game.enemies.find(enemy => enemy.id === game.alarm.eliteId);
  assert.ok(elite, 'An alarm cannot start without its clear condition');
  removeEnemy(game, elite);
  assert.equal(game.alarm.active, false);
  assert.equal(game.pendingLevels, 1);
  assert.ok(game.enemies.length <= 211);
});

test('hit highlights and gun recoil expire after their short feedback window', () => {
  const game = isolated();
  const enemy = game.spawnEnemy('walker', 0, { x: 1370, y: 930 });
  game.damageEnemy(enemy, 3);
  game.shoot();
  assert.ok(enemy.hitFlash > 0 && game.player.recoil > 0);
  step(game, .06, {}, .01);
  assert.ok(enemy.hitFlash > 0 && game.player.recoil > 0, 'Feedback should remain visible halfway through its window');
  step(game, .07, {}, .01);
  assert.equal(enemy.hitFlash, 0);
  assert.equal(game.player.recoil, 0);
});

test('a lethal hit emits one routable kill event with the enemy type as payload', () => {
  const game = isolated();
  const enemy = game.spawnEnemy('walker', 0, { x: 1370, y: 930 });
  game.damageEnemy(enemy, enemy.hp + 1, { x: 30, y: 0 }, game.player);
  game.damageEnemy(enemy, 1, { x: 30, y: 0 }, game.player);
  game.killEnemy(enemy);
  const events = game.drainEvents();
  assert.equal(events.filter(event => event.type === 'hit').length, 1);
  const kills = events.filter(event => event.type === 'kill');
  assert.equal(kills.length, 1, 'The audio/UI dispatcher must receive exactly one kill event');
  assert.equal(kills[0].enemyType, 'walker');
  assert.equal(game.kills, 1);
  assert.equal(game.corpses.length, 1);
});

test('walking phases follow physical displacement and remain fixed when standing or blocked', () => {
  const game = isolated();
  const initialPhase = game.player.walkPhase;
  game.tick(.05, { moveX: 1 });
  assert.ok(game.player.walkPhase > initialPhase);
  const walkingPhase = game.player.walkPhase;
  step(game, .5);
  assert.equal(game.player.walkPhase, walkingPhase, 'Standing still must not animate walking');
  game.player.x = 644; game.player.y = 340;
  const blockedPosition = { x: game.player.x, y: game.player.y };
  step(game, .5, { moveX: -1 });
  assert.deepEqual({ x: game.player.x, y: game.player.y }, blockedPosition);
  assert.equal(game.player.walkPhase, walkingPhase, 'Pushing against a wall must not animate walking');

  game.player.x = 1200; game.player.y = 930;
  const enemy = game.spawnEnemy('walker', 0, { x: 1370, y: 930 });
  const enemyPhase = enemy.walkPhase;
  game.tick(.05);
  assert.ok(enemy.walkPhase > enemyPhase, 'An approaching enemy should animate walking');
  enemy.x = game.player.x + enemy.r + game.player.r - 3; enemy.y = game.player.y;
  enemy.vx = 0; enemy.vy = 0;
  const stoppedEnemyPhase = enemy.walkPhase;
  step(game, .2);
  assert.equal(enemy.walkPhase, stoppedEnemyPhase, 'An enemy stopped at its target must stop its walk phase');
});

test('collector charge advances its movement phase and recovery holds it still', () => {
  const game = isolated();
  const boss = game.spawnEnemy('collector', 0, { x: 1400, y: 930 });
  boss.attackState = 'charge'; boss.attackTime = .5; boss.angle = Math.PI;
  const before = { x: boss.x, y: boss.y, phase: boss.walkPhase };
  game.tick(.05);
  assert.ok(Math.hypot(boss.x - before.x, boss.y - before.y) > 1);
  assert.ok(boss.walkPhase > before.phase);
  boss.attackState = 'recover'; boss.attackTime = .5;
  const stopped = { x: boss.x, y: boss.y, phase: boss.walkPhase };
  step(game, .2);
  assert.deepEqual({ x: boss.x, y: boss.y, phase: boss.walkPhase }, stopped);
});

test('corpses expire after twelve seconds and rapid kills keep their pool at seventy', () => {
  const game = isolated({ stageDuration: 1e9 });
  for (let i = 0; i < 85; i++) {
    removeEnemy(game, game.spawnEnemy('walker', 0, { x: 1370, y: 930 }));
    assert.ok(game.corpses.length <= 70);
    assert.ok(game.particles.length <= 850);
  }
  assert.equal(game.kills, 85);
  assert.equal(game.corpses.length, 70);
  step(game, 11.8, {}, .05);
  assert.equal(game.corpses.length, 70, 'Corpses should persist for the intended duration');
  step(game, .3, {}, .05);
  assert.equal(game.corpses.length, 0, 'Old bodies must leave the render pool');
  assert.equal(game.kills, 85, 'Visual cleanup must not remove earned kills');
});

test('pause and upgrade screens freeze corpses, particles, hit highlights, and recoil together', () => {
  const game = isolated();
  removeEnemy(game, game.spawnEnemy('walker', 0, { x: 1370, y: 930 }));
  const survivor = game.spawnEnemy('walker', 0, { x: 1380, y: 930 });
  game.damageEnemy(survivor, 1);
  game.shoot();
  const snapshot = () => JSON.stringify({ corpses: game.corpses, particles: game.particles, hit: survivor.hitFlash, recoil: game.player.recoil });
  game.pause();
  const paused = snapshot();
  step(game, 20, { shoot: true, moveX: 1 }, .05);
  assert.equal(snapshot(), paused);
  game.resume();
  game.gainXP(game.player.xpNext);
  game.tick(0);
  assert.equal(game.state, 'upgrade');
  const upgraded = snapshot();
  step(game, 20, { shoot: true, moveX: 1 }, .05);
  assert.equal(snapshot(), upgraded);
  game.chooseUpgrade(game.choices[0].id);
  game.tick(.05);
  assert.ok(game.corpses[0].time < 12, 'Returning to play should resume visual lifetimes');
});

test('explosion smoke, embers, and shockwaves remain finite and bounded during a burst', () => {
  const game = isolated({ stageDuration: 1e9 });
  for (let i = 0; i < 35; i++) {
    game.explode(1200, 930, 40, 0, false);
    assert.ok(game.particles.length <= 850, 'Each explosion must enforce the pool cap immediately');
  }
  const kinds = new Set(game.particles.map(particle => particle.kind));
  for (const kind of ['smoke', 'ember', 'shockwave']) assert.ok(kinds.has(kind));
  step(game, .15, {}, .01);
  for (const particle of game.particles) for (const field of ['x', 'y', 'vx', 'vy', 'life', 'maxLife']) assert.ok(Number.isFinite(particle[field]), `${particle.kind}.${field} must remain finite`);
  assert.ok(game.particles.length <= 850);
  step(game, 1.1, {}, .05);
  assert.equal(game.particles.length, 0, 'An isolated explosion must not leak persistent particles');
});

test('fire continues emitting live embers, then cleans up after its duration', () => {
  const game = isolated({ stageDuration: 1e9 });
  assert.equal(game.throwFire(1250, 950), true);
  step(game, 1, {}, .05);
  assert.ok(game.fires.length > 0);
  assert.ok(game.particles.some(particle => particle.kind === 'ember'), 'Fire should still emit after its initial throw particles have expired');
  assert.ok(game.particles.length <= 850);
  step(game, 6, {}, .05);
  assert.equal(game.fires.length, 0);
  assert.equal(game.particles.length, 0);
});

test('extra cosmetic bursts do not change enemy spawns, shot spread, loot, or upgrade rolls', () => {
  const plain = isolated(), embellished = isolated();
  for (let i = 0; i < 25; i++) embellished.burst(800, 900, 17, '#ffad4a', 70, .5, i % 2 ? 'smoke' : 'ember');
  for (const game of [plain, embellished]) {
    game.shoot();
    removeEnemy(game, game.spawnEnemy('walker', 400));
    game.spawnEnemy('runner', 500);
    game.gainXP(game.player.xpNext);
    game.tick(0);
  }
  const gameplay = game => ({ enemies: game.enemies, bullets: game.bullets, pickups: game.pickups, choices: game.choices.map(choice => choice.id), kills: game.kills, parts: game.parts });
  assert.deepEqual(gameplay(embellished), gameplay(plain));
});

test('a district transition clears visual remains and old fire from the previous map', () => {
  const game = isolated({ stageDuration: 1 });
  removeEnemy(game, game.spawnEnemy('walker', 0, { x: 1370, y: 930 }));
  game.throwFire(1250, 950);
  waitFor(game, () => game.stageBossSpawned);
  removeEnemy(game, game.enemies.find(enemy => enemy.gatekeeper));
  assert.ok(game.corpses.length > 0 && game.fires.length > 0);
  assert.equal(game.leaveSupply(), true);
  assert.equal(game.chooseRoute('hospital'), true);
  for (const name of ['corpses', 'particles', 'texts', 'links', 'fires']) assert.deepEqual(game[name], [], `${name} must start empty in the next district`);
});

test('victory and death preserve the final combat pose and effects on the result screen', () => {
  for (const won of [true, false]) {
    const game = isolated();
    removeEnemy(game, game.spawnEnemy('walker', 0, { x: 1370, y: 930 }));
    game.throwFire(1250, 950);
    game.explode(1200, 930, 40, 0, false);
    game.shoot();
    if (won) removeEnemy(game, game.spawnEnemy('collector', 0, { x: 1430, y: 930 }));
    else { game.player.invul = 0; game.hurtPlayer(100); }
    assert.equal(game.state, won ? 'victory' : 'dead');
    const snapshot = () => JSON.stringify({ time: game.time, stageTime: game.stageTime, result: game.result, player: game.player, corpses: game.corpses, particles: game.particles, fires: game.fires, texts: game.texts, enemies: game.enemies });
    const resultFrame = snapshot();
    assert.equal(game.drainEvents().filter(event => event.type === 'end').length, 1);
    step(game, 30, { shoot: true, dash: true, moveX: 1, molotov: true, lure: true }, .05);
    assert.equal(snapshot(), resultFrame);
    assert.equal(game.drainEvents().filter(event => event.type === 'end').length, 0);
  }
});

test('twenty minutes of seeded autopilot keeps entity pools finite and bounded', { timeout: 20000 }, t => {
  const game = new Game({ seed: 774, weapon: 'nailgun', stageDuration: 1e9 });
  // Invulnerability is a stress fixture, so the run can exercise twenty minutes
  // of real spawning, crowds, gunfire, pickup handling, and upgrade selection.
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  let simulated = 0;
  for (let tick = 0; tick < 24000; tick++) {
    if (game.state === 'upgrade') game.chooseUpgrade(game.choices[0].id);
    game.player.invul = 1;
    const enemy = game.enemies.find(item => !item.dead);
    const direction = tick / 300;
    game.tick(.05, { moveX: Math.cos(direction), moveY: Math.sin(direction), aimX: enemy?.x ?? 1200, aimY: enemy?.y ?? 930, shoot: true, dash: tick % 80 === 0, lure: tick % 250 === 0, molotov: tick % 350 === 0 });
    game.drainEvents();
    simulated += .05;
    if (tick % 100 === 0) {
      assert.ok(game.enemies.length <= 210);
      assert.ok(game.corpses.length <= 70);
      assert.ok(game.particles.length <= 850);
      assert.ok(game.pickups.length <= 450);
      assert.ok(game.texts.length <= 30);
      assert.ok(Number.isFinite(game.player.x) && Number.isFinite(game.player.y));
      assert.ok(game.player.hp >= 0 && game.parts >= 0);
      assert.equal(game.blocked(game.player.x, game.player.y, game.player.r), false);
    }
  }
  assert.ok(simulated >= 1199);
  assert.ok(game.time > 1150);
  assert.ok(game.kills > 0);
  const wallMs = performance.now() - start, cpu = process.cpuUsage(cpuStart), cpuMs = (cpu.user + cpu.system) / 1000;
  t.diagnostic(`Stress wall=${wallMs.toFixed(2)}ms, CPU=${cpuMs.toFixed(2)}ms`);
  assert.ok(cpuMs < 15000, `Headless twenty minute simulation exceeds its CPU budget: CPU=${cpuMs.toFixed(2)}ms, wall=${wallMs.toFixed(2)}ms`);
});

test('run rewards and weapon unlocks survive a real save/load round trip', () => {
  const records = new Map();
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
  const profile = loadProfile(storage);
  assert.deepEqual(profile.unlocked, ['shotgun']);
  assert.deepEqual(recordRun(profile, { kills: 75, parts: 75, time: 240, won: false }), []);
  assert.deepEqual(recordRun(profile, { kills: 30, parts: 54, time: 300, won: true }), ['nailgun']);
  assert.deepEqual(recordRun(profile, { kills: 4, parts: 4, time: 280, won: true }), []);
  profile.options.autoAim = true;
  profile.options.sound = false;
  assert.equal(saveProfile(profile, storage), true);
  const loaded = loadProfile(storage);
  assert.deepEqual(loaded.unlocked, ['shotgun', 'nailgun']);
  assert.equal(loaded.runs, 3);
  assert.equal(loaded.wins, 2);
  assert.equal(loaded.totalKills, 109);
  assert.equal(loaded.parts, 133);
  assert.equal(loaded.bestTime, 280);
  assert.equal(loaded.options.autoAim, true);
  assert.equal(loaded.options.sound, false);
});

test('corrupt profile data recovers and unsafe settings are sanitized', () => {
  let data = '{bad JSON';
  const storage = { getItem: key => { assert.equal(key, PROFILE_KEY); return data; } };
  assert.equal(loadProfile(storage).runs, 0);
  data = JSON.stringify({ runs: 4.8, wins: -9, parts: '999', totalKills: 120, unlocked: ['nailgun', 'unknown', 'nailgun'], options: { volume: 7, sound: 'false', shake: false, autoAim: true } });
  const profile = loadProfile(storage);
  assert.equal(profile.runs, 4);
  assert.equal(profile.wins, 0);
  assert.equal(profile.parts, 0);
  assert.deepEqual(profile.unlocked, ['shotgun', 'nailgun']);
  assert.equal(profile.options.volume, 1);
  assert.equal(profile.options.sound, true);
  assert.equal(profile.options.shake, false);
  assert.equal(profile.options.autoAim, true);
});

test('a blocked localStorage getter or quota error cannot prevent play', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Access blocked'); } });
    const profile = loadProfile();
    assert.deepEqual(profile.unlocked, ['shotgun']);
    assert.equal(saveProfile(profile), false);
    assert.equal(saveProfile(profile, { setItem() { throw new Error('Quota exceeded'); } }), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
