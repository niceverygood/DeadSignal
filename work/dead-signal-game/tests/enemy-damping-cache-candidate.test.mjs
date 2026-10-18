import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game as ProductionGame} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {enemyGridAllocationStats} from '../dist/enemy-separation-grid.js';
import {captureGame} from '../../../qa/enemy-neighborhood-cache-20261018/enemy-neighborhood-oracle.mjs';

// Source-only QA candidate. Normal, unchanged Math.exp/intrinsics are the
// premise: fewer exp calls are intentional, and a getter replacing Math.exp is
// outside this equivalence claim. No Canvas, GPU, speed or allocation claim.
const engineURL = new URL('../dist/engine.js', import.meta.url);
const beforeURL = new URL('../../../qa/enemy-damping-cache-20261018/engine-before.txt', import.meta.url);
const generatorURL = new URL('../../../qa/enemy-damping-cache-20261018/candidate-source.mjs', import.meta.url);
const ORIGINAL_SHA = '72487b352161059b5745a3e5cfc149ff71ae3f7b98c7e310b5d8b3a5345260ce';
const GENERATOR_SHA = '3cc8e2c8d467d0ee58e5150baffa590a167a9db7a24b38f94869fe980b6cbb8b';
const OLD_HEADER = '  updateEnemies(dt){\n    const p=this.player,cell=55;';
const NEW_HEADER = "  updateEnemies(dt){\n    const p=this.player,cell=55,numericDt=typeof dt==='number';let enemyDamping;";
const OLD_PAIR = 'e.vx*=Math.exp(-dt*9);e.vy*=Math.exp(-dt*9);';
const NEW_RHS = '(numericDt?(enemyDamping??=Math.exp(-dt*9)):Math.exp(-dt*9))';
const NEW_PAIR = 'e.vx*=' + NEW_RHS + ';e.vy*=' + NEW_RHS + ';';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const occurrences = (source, text) => source.split(text).length - 1;
let loaded;
async function modules() {
  if (!loaded) loaded = (async () => {
    const [beforeBytes, productBytes, generatorBytes] = await Promise.all([
      readFile(beforeURL), readFile(engineURL), readFile(generatorURL),
    ]);
    assert.equal(beforeBytes.length, 59149);
    assert.equal(sha(beforeBytes), ORIGINAL_SHA, 'independent whole original stays pinned');
    assert.deepEqual(productBytes, beforeBytes, 'this experiment does not edit the product engine');
    assert.equal(generatorBytes.length, 1868);
    assert.equal(sha(generatorBytes), GENERATOR_SHA, 'the reviewed source-only generator stays pinned');
    const {buildDampingCandidate} = await import(generatorURL.href);
    const before = beforeBytes.toString('utf8'), candidate = buildDampingCandidate(before);
    assert.equal(occurrences(before, OLD_HEADER), 1);
    assert.equal(occurrences(before, OLD_PAIR), 2);
    assert.equal(occurrences(candidate, NEW_HEADER), 1);
    assert.equal(occurrences(candidate, NEW_PAIR), 2);
    assert.equal(before.replace(OLD_HEADER, NEW_HEADER).split(OLD_PAIR).join(NEW_PAIR), candidate,
      'only the invocation-local declaration and the two original damping pairs change');
    assert.equal(candidate.split(NEW_PAIR).join(OLD_PAIR).replace(NEW_HEADER, OLD_HEADER), before,
      'three inverse sites recover every original byte');
    let imports = 0;
    const rebase = source => source.replace(/(\bfrom\s+)(['"])(\.[^'"]+)\2/g, (_all, prefix, quote, specifier) => {
      imports++;
      return prefix + quote + new URL(specifier, engineURL).href + quote;
    });
    const asModule = (source, arm) => 'data:text/javascript;base64,' + Buffer.from(
      rebase(source) + '\n//# sourceURL=' + engineURL.href + '?qa-damping=' + arm,
    ).toString('base64');
    const [original, changed] = await Promise.all([import(asModule(before, 'original')), import(asModule(candidate, 'candidate'))]);
    assert.ok(imports >= 20, 'both full modules retain their actual dependencies');
    return {O: original.Game, C: changed.Game, before, candidate, buildDampingCandidate};
  })();
  return loaded;
}

const floatBytes = new DataView(new ArrayBuffer(8));
function bits(value) { floatBytes.setFloat64(0, value, true); return floatBytes.getBigUint64(0, true); }
function fromBits(value) { floatBytes.setBigUint64(0, value, true); return floatBytes.getFloat64(0, true); }
function exactNumbers(actual, expected, path = 'state') {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', path);
    assert.equal(bits(actual), bits(expected), path + ' IEEE64 bits');
  } else if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, path);
    for (let i = 0; i < expected.length; i++) exactNumbers(actual[i], expected[i], path + '[' + i + ']');
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected), path + ' keys');
    for (const key of Object.keys(expected)) exactNumbers(actual[key], expected[key], path + '.' + key);
  } else assert.equal(actual, expected, path);
}

function fixture(Game, options = {}) {
  const log = [], moves = [], backing = [], wrapped = new WeakMap();
  const player = {x: 1200, y: 930, r: 14};
  const specs = options.specs ?? [
    {name: 'boss', bossKey: 'boss-01-final', type: 'collector', vx: 4, vy: -3},
    {name: 'ordinary', type: 'walker', vx: -2, vy: 5},
  ];
  let owner, reentered = false;
  const fail = point => { if (options.throwAt === point) throw options.marker; };
  const actors = specs.map((spec, index) => {
    const name = spec.name ?? 'actor' + index;
    const actor = {
      id: index + 1, x: 700 + index * 100, y: 600, r: 14,
      type: spec.type ?? 'walker', ...(spec.bossKey ? {bossKey: spec.bossKey} : {}),
      dead: spec.dead ?? false, attackCd: 10, stun: Infinity, skillCd: 10,
      burn: spec.burn ?? 0, burnTick: 0, speed: 65, angle: 0,
      attackState: spec.attackState ?? 'recover', attackTime: Infinity,
      navTime: 1, navX: 0, navY: 0, navTarget: player,
      navTargetX: player.x, navTargetY: player.y,
    };
    const values = {vx: Object.hasOwn(spec, 'vx') ? spec.vx : 0, vy: Object.hasOwn(spec, 'vy') ? spec.vy : 0};
    backing.push(values);
    for (const key of ['vx', 'vy']) {
      if (options.coerce) {
        const scalar = values[key], value = {
          [Symbol.toPrimitive](hint) {
            log.push(name + '.' + key + '.primitive:' + hint);
            fail(name + '.' + key + '.primitive');
            return scalar;
          },
        };
        wrapped.set(value, scalar);
        values[key] = value;
      }
      Object.defineProperty(actor, key, {
        enumerable: true, configurable: true,
        get() {
          log.push(name + '.' + key + '.get');
          fail(name + '.' + key + '.get');
          if (options.reentry === 'get' && name === 'boss' && key === 'vx' && !reentered) {
            reentered = true;
            log.push('reentry.begin');
            Game.prototype.updateEnemies.call(owner, .125);
            log.push('reentry.end');
          }
          return values[key];
        },
        set(value) {
          log.push(name + '.' + key + '.set');
          fail(name + '.' + key + '.set');
          values[key] = value;
          if (options.mutateY && name === 'boss' && key === 'vx') values.vy = -17;
          if (options.reentry === 'set' && name === 'boss' && key === 'vx' && !reentered) {
            reentered = true;
            log.push('reentry.begin');
            Game.prototype.updateEnemies.call(owner, .125);
            log.push('reentry.end');
          }
        },
      });
    }
    return actor;
  });
  owner = Object.assign(Object.create(Game.prototype), {
    state: options.state ?? 'playing', player,
    world: {width: 2400, height: 1800, obstacles: []}, enemies: actors,
    fires: [], lure: null, upgrades: {}, forceFreshEnemyGrid: options.fresh === true,
    navigation: {direction() { assert.fail('the controlled stunned actors must not navigate'); }},
    move(actor, dx, dy) {
      log.push('move.' + actor.id);
      moves.push([actor.id, dx, dy]);
      return options.moveResult;
    },
    updateBoss(actor) { log.push('updateBoss.' + actor.id); },
    damageEnemy(actor, damage) { log.push('damage.' + actor.id + ':' + damage); actor.dead = true; },
    hurtPlayer() { assert.fail('the controlled actors remain outside contact range'); },
  });
  const normalized = value => value && typeof value === 'object' && wrapped.has(value)
    ? {unconsumedCoercible: wrapped.get(value)} : value;
  return {
    owner, actors, log, moves,
    inspect() {
      return {
        state: owner.state, keys: Object.keys(owner), remainingIds: owner.enemies.map(actor => actor.id),
        reentered, moves: moves.map(args => [...args]),
        actors: actors.map((actor, index) => ({
          keys: Object.keys(actor), id: actor.id, dead: actor.dead, x: actor.x, y: actor.y,
          vx: normalized(backing[index].vx), vy: normalized(backing[index].vy),
          attackCd: actor.attackCd, stun: actor.stun, skillCd: actor.skillCd,
          burn: actor.burn, burnTick: actor.burnTick, attackTime: actor.attackTime,
          attackState: actor.attackState, angle: actor.angle,
        })),
      };
    },
  };
}
function invoke(Game, f, dt) {
  try { return {thrown: false, value: Game.prototype.updateEnemies.call(f.owner, dt)}; }
  catch (error) { return {thrown: true, error}; }
}
function compare(O, C, options = {}) {
  const a = fixture(O, options), b = fixture(C, options), oldArray = a.owner.enemies, newArray = b.owner.enemies;
  const dtA = options.dtFactory ? options.dtFactory(a.log) : Object.hasOwn(options, 'dt') ? options.dt : .05;
  const dtB = options.dtFactory ? options.dtFactory(b.log) : Object.hasOwn(options, 'dt') ? options.dt : .05;
  const expected = invoke(O, a, dtA), actual = invoke(C, b, dtB);
  assert.equal(actual.thrown, expected.thrown, 'original completion/throw branch');
  if (options.throwAt || options.dtThrows) {
    assert.equal(expected.thrown, true, 'the controlled exception must actually be reached');
    assert.equal(expected.error, options.marker);
    assert.equal(actual.error, options.marker, 'the first controlled thrown value retains identity');
  } else if (expected.thrown) {
    assert.equal(expected.error?.constructor, actual.error?.constructor, 'native conversion error class');
    assert.ok(expected.error instanceof TypeError);
  } else assert.equal(actual.value, expected.value, 'original return value');
  assert.deepEqual(b.log, a.log, 'getter, conversion, setter and original callback order');
  assert.deepEqual(b.inspect(), a.inspect(), 'all controlled mutations and values');
  exactNumbers(b.inspect(), a.inspect());
  assert.equal(a.owner.enemies === oldArray, expected.thrown, 'original filter timing');
  assert.equal(b.owner.enemies === newArray, actual.thrown, 'candidate filter timing');
  for (const f of [a, b]) {
    const stats = enemyGridAllocationStats(f.owner);
    assert.equal(stats.retainedActors, 0, 'the unchanged finally releases every grid actor');
    assert.ok(stats.retainedBuckets <= 256);
    assert.ok(stats.acquisitions >= 1);
  }
  assert.deepEqual(enemyGridAllocationStats(b.owner), enemyGridAllocationStats(a.owner));
  return {a, b, expected, actual};
}

test('damping generator is SHA-pinned, exactly invertible, and leaves the whole product engine original', async () => {
  const {O, C, before, candidate, buildDampingCandidate} = await modules();
  assert.notEqual(C, ProductionGame);
  assert.equal(O.prototype.updateEnemies.toString(), ProductionGame.prototype.updateEnemies.toString());
  assert.equal(candidate.split(NEW_PAIR).join(OLD_PAIR).replace(NEW_HEADER, OLD_HEADER), before);
  for (const input of [null, undefined, 0, {}, new String(before)]) {
    assert.throws(() => buildDampingCandidate(input), {name: 'TypeError', message: 'damping-candidate-source-string-required'});
  }
  assert.throws(() => buildDampingCandidate(before + '\n'), /damping-candidate-original-sha-mismatch/);
});

test('both damping sites preserve IEEE64 values for signed zero, subnormals, infinities and numeric NaNs', async () => {
  const {O, C} = await modules();
  const dts = [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, 1 / 60, .05, 1000, -1000,
    Number.MAX_VALUE, -Number.MAX_VALUE, Infinity, -Infinity, NaN, fromBits(0xfff8000000000031n)];
  const velocities = [[0, -0], [4, -3], [Number.MIN_VALUE, -Number.MIN_VALUE],
    [Number.MAX_VALUE, -Number.MAX_VALUE], [Infinity, -Infinity], [NaN, fromBits(0x7ff8000000000042n)]];
  for (const dt of dts) for (const [vx, vy] of velocities) for (const fresh of [false, true]) {
    const {a, expected} = compare(O, C, {dt, fresh, specs: [
      {name: 'boss', bossKey: 'boss-01-final', type: 'collector', vx, vy},
      {name: 'ordinary', type: 'walker', vx, vy},
    ]});
    assert.equal(expected.thrown, false);
    assert.ok(a.log.includes('boss.vx.set') && a.log.includes('boss.vy.set'), 'the early campaign-boss pair is reached');
    assert.ok(a.log.includes('ordinary.vx.set') && a.log.includes('ordinary.vy.set'), 'the ordinary trailing pair is reached');
    assert.equal(a.log.indexOf('boss.vx.get') < a.log.indexOf('boss.vx.set'), true);
    assert.equal(a.log.indexOf('boss.vx.set') < a.log.indexOf('boss.vy.get'), true);
  }
});

test('velocity accessors and nonnumeric dt retain every original conversion and mutation in order', async () => {
  const {O, C} = await modules();
  const changed = compare(O, C, {coerce: true, mutateY: true}).a;
  assert.deepEqual(changed.log.slice(0, 5), [
    'boss.vx.get', 'boss.vx.primitive:number', 'boss.vx.set', 'boss.vy.get', 'boss.vy.set',
  ]);
  assert.equal(changed.inspect().actors[0].vy, -17 * Math.exp(-.05 * 9));
  for (const dt of ['0.05', '', null, undefined, false, true, 0n, Symbol('dt')]) compare(O, C, {dt});
  const factories = [
    log => {
      let conversions = 0;
      return {[Symbol.toPrimitive](hint) { conversions++; log.push('dt.' + conversions + ':' + hint); return .01 + conversions / 1000; }};
    },
    log => { const value = new Number(.05); value.valueOf = function() { log.push('dt.valueOf'); return .05; }; return value; },
    log => ({valueOf() { log.push('dt.valueOf.object'); return {}; }, toString() { log.push('dt.toString'); return '.05'; }}),
  ];
  for (const dtFactory of factories) for (const fresh of [false, true]) {
    const {a, expected} = compare(O, C, {dtFactory, coerce: true, fresh});
    assert.equal(expected.thrown, false);
    const firstRead = a.log.indexOf('boss.vx.get'), firstWrite = a.log.indexOf('boss.vx.set');
    assert.ok(a.log.slice(firstRead + 1, firstWrite).some(entry => entry.startsWith('dt.')),
      'the first exp conversion remains after the vx getter and before its setter');
    assert.ok(a.log.filter(entry => entry.startsWith('dt.')).length >= 10,
      'nonnumeric dt is not cached across either velocity or actor');
  }
});

test('getter, coercion, setter and dt failures preserve thrown identity, partial writes and grid cleanup', async () => {
  const {O, C} = await modules();
  const points = ['boss.vx.get', 'boss.vx.primitive', 'boss.vx.set', 'boss.vy.get',
    'boss.vy.primitive', 'boss.vy.set', 'ordinary.vx.get', 'ordinary.vy.set'];
  for (const throwAt of points) for (const marker of [Error(throwAt), null, 0, undefined]) {
    const {a} = compare(O, C, {coerce: true, throwAt, marker});
    if (throwAt.startsWith('boss.vx')) assert.equal(a.log.includes('boss.vy.get'), false);
  }
  for (const marker of [Error('dt conversion'), null, undefined]) for (const at of [1, 4, 5]) {
    compare(O, C, {marker, dtThrows: true, dtFactory: log => {
      let count = 0;
      return {[Symbol.toPrimitive](hint) { count++; log.push('dt.' + count + ':' + hint); if (count === at) throw marker; return .05; }};
    }});
  }
  for (const vx of [1n, Symbol('velocity')]) {
    const {a, expected} = compare(O, C, {specs: [{name: 'boss', bossKey: 'boss-01-final', type: 'collector', vx, vy: 3}]});
    assert.equal(expected.thrown, true);
    assert.equal(a.log.includes('boss.vx.set'), false);
    assert.equal(a.log.includes('boss.vy.get'), false);
  }
});

test('paused, dead, burn-killed and collector-owned early branches do not newly access velocity', async () => {
  const {O, C} = await modules();
  const branches = [
    {state: 'paused', specs: [{name: 'unused'}]},
    {specs: [{name: 'unused', dead: true}]},
    {specs: [{name: 'unused', burn: 1}]},
    ...['windup', 'recover', 'charge'].map(attackState => ({specs: [{name: 'unused', type: 'collector', attackState}]})),
    {specs: []},
  ];
  for (const options of branches) for (const fresh of [false, true]) {
    const {a, expected} = compare(O, C, {...options, fresh, throwAt: undefined});
    assert.equal(expected.thrown, false);
    assert.equal(a.log.some(entry => entry.includes('.vx.') || entry.includes('.vy.')), false,
      'only the originally reached damping branches may inspect velocity');
  }
});

test('same-owner getter and setter reentry keep damping invocation-local without changing original callbacks', async () => {
  const {O, C} = await modules();
  for (const reentry of ['get', 'set']) for (const fresh of [false, true]) {
    const {a, b, expected} = compare(O, C, {reentry, fresh, moveResult: Object.freeze({ignored: true})});
    assert.equal(expected.thrown, false);
    assert.equal(a.inspect().reentered, true);
    assert.equal(a.log.filter(entry => entry === 'reentry.begin').length, 1);
    assert.equal(a.log.filter(entry => entry === 'boss.vx.set').length, 2);
    assert.equal(a.log.filter(entry => entry === 'ordinary.vy.set').length, 2);
    assert.equal(enemyGridAllocationStats(a.owner).acquisitions, 2);
    assert.equal(enemyGridAllocationStats(b.owner).acquisitions, 2);
    if (reentry === 'get') assert.equal(bits(a.inspect().actors[0].vx), bits(4 * Math.exp(-.125 * 9) * Math.exp(-.05 * 9)));
  }
});

function populate(Game, count, seed) {
  const game = new Game({seed, weapon: seed === 774 ? 'nailgun' : 'shotgun', stageDuration: 1e9});
  assert.ok(game.navigation instanceof Navigation);
  const world = game.world, spawnClock = game.spawnClock, initialIds = game.enemies.map(actor => actor.id);
  assert.ok(initialIds.length > 0);
  assert.ok(game.spawnEnemy('collector', 500));
  const types = ['walker', 'runner', 'shield', 'screamer', 'gas', 'elite'];
  for (let index = 0; game.enemies.length < count; index++) assert.ok(game.spawnEnemy(types[index % types.length], 500));
  assert.equal(game.enemies.length, count);
  assert.equal(game.world, world);
  assert.equal(game.spawnClock, spawnClock, 'normal spawn scheduling is untouched by the fixture');
  assert.deepEqual(game.enemies.slice(0, initialIds.length).map(actor => actor.id), initialIds);
  assert.ok(game.snapshot(), 'a valid original checkpoint, rather than a synthetic arena');
  return game;
}
function navigationState(nav) {
  return {
    revision: nav.revision, active: structuredClone(nav.active),
    grids: [...nav.grids].map(([radius, grid]) => [radius, {
      radius: grid.radius, cell: grid.cell, cols: grid.cols, rows: grid.rows, size: grid.size,
      clear: [...grid.clear], edges: [...grid.edges], components: [...grid.components],
      fields: [...grid.fields].map(([key, field]) => [key, {goal: field.goal,
        ...(field.distances ? {distances: [...field.distances], next: [...field.next]} : {}),
      }]),
    }]),
  };
}

test('two seeds at 60/180/210 enemies preserve actual city-world ticks, full runtime, motion, events and both RNG streams', async () => {
  const {O, C} = await modules();
  // Bounded unit replay, separate from the root-run 24k cost arm and longer
  // quality oracle. Normal HP, collisions, spawning, AI and player actions stay.
  let comparisons = 0, ticks = 0;
  for (const seed of [774, 19253]) for (const count of [60, 180, 210]) {
    const a = populate(O, count, seed), b = populate(C, count, seed);
    const identitiesA = new Map(a.enemies.map(actor => [actor.id, actor]));
    const identitiesB = new Map(b.enemies.map(actor => [actor.id, actor]));
    assert.deepEqual(captureGame(b), captureGame(a));
    comparisons++;
    for (let frame = 0; frame < 60; frame++) {
      if (a.state === 'upgrade') {
        assert.deepEqual(b.choices.map(choice => choice.id), a.choices.map(choice => choice.id));
        const id = a.choices[0].id;
        assert.equal(a.chooseUpgrade(id), true);
        assert.equal(b.chooseUpgrade(id), true);
      }
      const enemy = a.enemies.find(actor => !actor.dead), direction = frame / 36;
      const command = {
        moveX: Math.cos(direction), moveY: Math.sin(direction),
        aimX: enemy?.x ?? 1200, aimY: enemy?.y ?? 930, shoot: true,
        dash: frame % 80 === 0, lure: frame === 12, molotov: frame === 45,
        targetX: enemy?.x ?? 1350, targetY: enemy?.y ?? 930,
      };
      const commandA = {...command}, commandB = {...command}, dt = [1 / 60, .05, .012, .033][frame % 4];
      a.tick(dt, commandA);
      b.tick(dt, commandB);
      assert.deepEqual(commandB, commandA, 'original command mutation protocol');
      assert.deepEqual(captureGame(b), captureGame(a), 'seed ' + seed + '/count ' + count + '/frame ' + frame);
      comparisons++; ticks++;
      assert.deepEqual(b.drainEvents(), a.drainEvents(), 'literal event ordering');
      for (const [game, identities] of [[a, identitiesA], [b, identitiesB]]) {
        for (const actor of game.enemies) {
          if (identities.has(actor.id)) assert.equal(actor, identities.get(actor.id), 'existing actor identity');
          else identities.set(actor.id, actor);
        }
        assert.equal(enemyGridAllocationStats(game).retainedActors, 0);
      }
    }
    assert.deepEqual(navigationState(b.navigation), navigationState(a.navigation), 'actual clearance, flow fields and LRU order');
    assert.deepEqual(enemyGridAllocationStats(b), enemyGridAllocationStats(a), 'unchanged grid lifetime protocol');
    assert.ok(enemyGridAllocationStats(a).acquisitions > 0);
    assert.deepEqual(Object.keys(b), Object.keys(a), 'the candidate adds no Game fields');
  }
  assert.equal(ticks, 360);
  assert.equal(comparisons, 366);
});
