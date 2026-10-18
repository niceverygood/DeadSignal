import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {Game} from '../work/dead-signal-game/dist/engine.js';

// Diagnostic reproduction of engine.test.mjs:547-578. Run from the repository
// root with node --cpu-prof [--cpu-prof-dir=...] tools/qa-stress-profile.mjs.
// No warmup, interpolation, renderer, per-tick profiler wrapper or alternate
// engine settings are added. The original test and its 15000ms budget stay intact.
const game = new Game({ seed: 774, weapon: 'nailgun', stageDuration: 1e9 });
// Invulnerability is the original stress fixture, not a normal gameplay rule.
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

// Snapshot, hashing and output deliberately occur after the original timing
// interval. CPU-prof still includes startup/reporting; use its call tree to
// distinguish them from the unchanged stress loop.
const finalSnapshot=game.snapshot(),randomState=game.random.getState(),visualRandomState=game.visualRandom.getState();
const hashState={snapshot:finalSnapshot,state:game.state,time:game.time,stageTime:game.stageTime,kills:game.kills,parts:game.parts,player:game.player,enemies:game.enemies,corpses:game.corpses,particles:game.particles,pickups:game.pickups,texts:game.texts,links:game.links,fires:game.fires,throwables:game.throwables,lure:game.lure,bullets:game.bullets.map(bullet=>({...bullet,hits:[...bullet.hits]})),upgrades:game.upgrades,choices:game.choices,world:game.world,shake:game.shake,flash:game.flash,randomState,visualRandomState};
const stateHashSha256=createHash('sha256').update(JSON.stringify(hashState)).digest('hex');
console.log(JSON.stringify({
  diagnosticOnly:true,
  fixture:'work/dead-signal-game/tests/engine.test.mjs:547-578',
  seed:774,weapon:'nailgun',stageDuration:1e9,ticks:24000,fixedStepSeconds:.05,simulatedSeconds:simulated,
  periodicEntityInvariantChecks:240,
  wallMs,cpuMs,cpuMicroseconds:cpu,
  originalCpuBudgetMs:15000,cpuBudgetExceeded:cpuMs>=15000,
  finalState:game.state,finalGameTime:game.time,finalKills:game.kills,
  randomState,visualRandomState,stateHashSha256,finalSnapshot,
  stateHashBasis:'JSON of checkpoint plus explicit final runtime entities/effects/world/player/clock and both RNG states; hashing occurs after timing.',
  note:'Profiling diagnostic only. Reproduces the original stress actions, event drains and entity assertions. It does not assert the CPU budget or claim the original test passed. Original tests and their 15000ms assertion are unchanged. CPU profiling adds overhead; no root cause or comparison is inferred here.',
},null,2));
