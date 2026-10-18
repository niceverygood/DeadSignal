import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game as ProductionGame} from '../dist/engine.js';
import {enemyGridAllocationStats} from '../dist/enemy-separation-grid.js';

// QA-only whole-module oracle. The actual city-world/timing proof is a separate
// root-run job; these fixtures expose the original method's evaluation protocol.
const engineURL = new URL('../dist/engine.js', import.meta.url);
const candidateURL = new URL('../dist/qa-engine-direction-candidate.js', import.meta.url);
const beforeURL = new URL('../../../qa/engine-collision-profile-20261018/engine-before.txt', import.meta.url);
const ORIGINAL_SHA = '72487b352161059b5745a3e5cfc149ff71ae3f7b98c7e310b5d8b3a5345260ce';
const CANDIDATE_SHA = '62d0bd9a718757354a62e36d928c75a97f4a464ffd93d81e2344648183f6f34d';
const ORIGINAL_LINE = 'const direction={x:e.navX||0,y:e.navY||0};if(direction.x||direction.y)e.angle=Math.atan2(direction.y,direction.x);this.move(e,(direction.x*e.speed+sx)*dt,(direction.y*e.speed+sy)*dt);';
const CANDIDATE_LINE = 'const directionX=e.navX||0,directionY=e.navY||0;if(directionX||directionY)e.angle=Math.atan2(directionY,directionX);this.move(e,(directionX*e.speed+sx)*dt,(directionY*e.speed+sy)*dt);';
const sha = value => createHash('sha256').update(value).digest('hex');
let loaded;
async function modules() {
  if (!loaded) loaded = (async () => {
    const [beforeBytes, productionBytes, candidateBytes] = await Promise.all([
      readFile(beforeURL), readFile(engineURL), readFile(candidateURL),
    ]);
    assert.equal(beforeBytes.length, 59149);
    assert.equal(sha(beforeBytes), ORIGINAL_SHA, 'the independent whole original must stay pinned');
    assert.equal(candidateBytes.length, 59149);
    assert.equal(sha(candidateBytes), CANDIDATE_SHA, 'load the frozen whole QA candidate');
    assert.deepEqual(productionBytes, beforeBytes, 'the product engine must remain byte-exactly original');
    const before = beforeBytes.toString('utf8'), candidate = candidateBytes.toString('utf8');
    assert.equal(before.split(ORIGINAL_LINE).length, 2);
    assert.equal(candidate.split(CANDIDATE_LINE).length, 2);
    assert.equal(before.replace(ORIGINAL_LINE, CANDIDATE_LINE), candidate, 'candidate contains only the approved one-line replacement');
    assert.equal(candidate.replace(CANDIDATE_LINE, ORIGINAL_LINE), before, 'one inverse restores every original byte');
    let imports = 0;
    const rebased = before.replace(/(\bfrom\s+)(['"])(\.[^'"]+)\2/g, (_all, prefix, quote, specifier) => {
      imports++;
      return prefix + quote + new URL(specifier, engineURL).href + quote;
    });
    assert.ok(imports >= 10, 'load the full original with its actual dependencies');
    const [original, changed] = await Promise.all([
      import('data:text/javascript;base64,' + Buffer.from(rebased).toString('base64')),
      import(candidateURL.href),
    ]);
    return {OriginalGame: original.Game, CandidateGame: changed.Game, before, candidate, imports};
  })();
  return loaded;
}

function fixture(Game, options = {}) {
  const log = [], moveCalls = [], angleHistory = [];
  const player = {x: 1000, y: 1000, r: 14};
  const actor = {
    id: 9, x: 900, y: 1000, r: 14, type: 'walker', dead: false,
    attackCd: 1, stun: 0, skillCd: 10, burn: 0, burnTick: 0,
    vx: 0, vy: 0, navTime: 1, navTarget: player,
    navTargetX: player.x, navTargetY: player.y, walkPhase: 0,
  };
  let navX = Object.hasOwn(options, 'x') ? options.x : 1;
  let navY = Object.hasOwn(options, 'y') ? options.y : .5, angle = 0;
  let speedReads = 0, navXReads = 0, navYReads = 0, moveReads = 0, angleWrites = 0;
  let reentered = false;
  const marker = options.marker;
  const fail = point => { if (options.throwAt === point) throw marker; };
  function directionValue(axis, value) {
    if (!options.coerce && options.throwAt !== 'coerce.' + axis) return value;
    return {
      [Symbol.toPrimitive](hint) {
        log.push('coerce.' + axis + ':' + hint);
        fail('coerce.' + axis);
        return value;
      },
    };
  }
  navX = directionValue('x', navX);
  navY = directionValue('y', navY);
  Object.defineProperty(actor, 'navX', {
    configurable: true,
    get() { navXReads++; log.push('navX.get'); fail('navX'); return navX; },
  });
  Object.defineProperty(actor, 'navY', {
    configurable: true,
    get() { navYReads++; log.push('navY.get'); fail('navY'); return navY; },
  });
  Object.defineProperty(actor, 'speed', {
    configurable: true,
    get() {
      speedReads++;
      log.push('speed.get:' + speedReads);
      fail('speed.' + speedReads);
      const value = options.distinctSpeeds ? 66 - speedReads : 65;
      return options.speedCoerce ? {
        [Symbol.toPrimitive](hint) { log.push('coerce.speed' + speedReads + ':' + hint); return value; },
      } : value;
    },
  });
  Object.defineProperty(actor, 'angle', {
    configurable: true,
    get() { return angle; },
    set(value) {
      angleWrites++;
      log.push('angle.set:' + angleWrites);
      fail('angle.' + angleWrites);
      angle = value;
      angleHistory.push(value);
    },
  });
  const owner = Object.assign(Object.create(Game.prototype), {
    state: 'playing', player, world: {width: 2400, height: 1800},
    enemies: [actor], fires: [], lure: null,
    navigation: {direction() { assert.fail('the controlled cached direction must not refresh'); }},
    hurtPlayer() { assert.fail('the controlled actor is outside contact range'); },
    forceFreshEnemyGrid: options.fresh === true,
  });
  const move = function(entity, dx, dy) {
    assert.equal(this, owner);
    assert.equal(entity, actor);
    log.push('move.call');
    moveCalls.push([dx, dy]);
    if (options.reentrant && !reentered) {
      reentered = true;
      log.push('reentry.begin');
      Game.prototype.updateEnemies.call(owner, .05);
      log.push('reentry.end');
    }
    fail('move.call');
    return options.moveResult;
  };
  Object.defineProperty(owner, 'move', {
    configurable: true,
    get() { moveReads++; log.push('move.get'); fail('move.get'); return move; },
  });
  return {
    owner, actor, player, log, moveCalls, angleHistory,
    inspect() {
      return {
        state: owner.state, retainedActorIdentity: owner.enemies[0] === actor,
        count: owner.enemies.length, x: actor.x, y: actor.y, vx: actor.vx, vy: actor.vy,
        navTime: actor.navTime, attackCd: actor.attackCd, skillCd: actor.skillCd,
        stun: actor.stun, angle, angleWrites, navXReads, navYReads, speedReads, moveReads,
        moveCalls: moveCalls.map(args => [...args]), angleHistory: [...angleHistory], reentered,
      };
    },
  };
}

function outcome(Game, f, dt = .05) {
  try { return {thrown: false, value: Game.prototype.updateEnemies.call(f.owner, dt)}; }
  catch (error) { return {thrown: true, error}; }
}

function compare(OriginalGame, CandidateGame, options = {}) {
  const a = fixture(OriginalGame, options), b = fixture(CandidateGame, options);
  const oldArray = a.owner.enemies, newArray = b.owner.enemies;
  const expected = outcome(OriginalGame, a, options.dt ?? .05);
  const actual = outcome(CandidateGame, b, options.dt ?? .05);
  assert.equal(actual.thrown, expected.thrown);
  if (options.throwAt) {
    assert.equal(expected.thrown, true, 'the named throw path must actually execute');
    assert.equal(expected.error, options.marker);
    assert.equal(actual.error, options.marker, 'controlled thrown identity is preserved');
  } else {
    assert.equal(expected.thrown, false);
    assert.equal(actual.value, expected.value);
    assert.equal(actual.value, undefined);
  }
  assert.deepEqual(b.log, a.log, 'getter, coercion, setter and original move order');
  assert.deepEqual(b.inspect(), a.inspect(), 'numeric results and controlled state are exact');
  assert.equal(a.owner.enemies === oldArray, expected.thrown, 'original filter replacement timing');
  assert.equal(b.owner.enemies === newArray, actual.thrown, 'candidate keeps original filter identity behavior');
  for (const f of [a, b]) {
    const stats = enemyGridAllocationStats(f.owner);
    assert.equal(stats.retainedActors, 0, 'the original finally releases actors on success and throw');
    assert.ok(stats.retainedBuckets <= 256);
    assert.ok(stats.acquisitions >= 1);
  }
  return {a, b, expected, actual};
}

test('the whole QA candidate is one reversible replacement and the default production engine stays original', async () => {
  const {OriginalGame, CandidateGame, before, candidate} = await modules();
  assert.notEqual(CandidateGame, ProductionGame);
  assert.equal(ProductionGame.prototype.updateEnemies.toString(), OriginalGame.prototype.updateEnemies.toString());
  assert.notEqual(CandidateGame.prototype.updateEnemies.toString(), ProductionGame.prototype.updateEnemies.toString());
  assert.equal(candidate.replace(CANDIDATE_LINE, ORIGINAL_LINE), before);
});

test('cached direction primitives preserve falsey normalization, signed zeros, numeric strings and the two speed reads', async () => {
  const {OriginalGame: O, CandidateGame: C} = await modules();
  const cases = [[1, .5], [-1, -2], [0, -0], [NaN, false], ['', undefined], [null, null], ['2', '-3'], [Infinity, 1]];
  for (const [x, y] of cases) for (const fresh of [false, true]) {
    const {a} = compare(O, C, {x, y, fresh, distinctSpeeds: true});
    const state = a.inspect();
    assert.equal(state.navXReads, 1);
    assert.equal(state.navYReads, 1);
    assert.equal(state.speedReads, 2);
    assert.equal(state.moveReads, 1);
    assert.equal(a.moveCalls.length, 1);
    assert.equal(a.log.indexOf('navX.get') < a.log.indexOf('navY.get'), true);
    assert.equal(a.log.indexOf('move.get') < a.log.indexOf('speed.get:1'), true);
  }
  const zero = compare(O, C, {x: -0, y: -0}).a;
  assert.equal(Object.is(zero.moveCalls[0][0], 0), true);
  assert.equal(Object.is(zero.moveCalls[0][1], 0), true);
  assert.equal(zero.inspect().angleWrites, 1, 'zero direction must not add the optional angle assignment');
});

test('truthy direction and speed objects preserve exact Math conversion order without extra field reads', async () => {
  const {OriginalGame: O, CandidateGame: C} = await modules();
  const {a} = compare(O, C, {x: 2, y: -3, coerce: true, distinctSpeeds: true});
  assert.deepEqual(a.log, [
    'angle.set:1', 'navX.get', 'navY.get',
    'coerce.y:number', 'coerce.x:number', 'angle.set:2', 'move.get',
    'speed.get:1', 'coerce.x:number', 'speed.get:2', 'coerce.y:number', 'move.call',
  ]);
  assert.deepEqual(a.moveCalls, [[6.5, -9.600000000000001]]);
  assert.equal(a.angleHistory[1], Math.atan2(-3, 2));
  const both = compare(O, C, {x: 2, y: -3, coerce: true, speedCoerce: true}).a;
  assert.deepEqual(both.log.slice(-7), [
    'speed.get:1', 'coerce.x:number', 'coerce.speed1:number',
    'speed.get:2', 'coerce.y:number', 'coerce.speed2:number', 'move.call',
  ]);
});

test('getter/coercion/setter and move failures preserve the first thrown value, argument evaluation and grid release', async () => {
  const {OriginalGame: O, CandidateGame: C} = await modules();
  const points = ['navX', 'navY', 'coerce.y', 'coerce.x', 'angle.2', 'move.get', 'speed.1', 'speed.2', 'move.call'];
  for (const throwAt of points) for (const marker of [Error('controlled ' + throwAt), null, 0, undefined]) {
    const {a} = compare(O, C, {x: 2, y: -3, coerce: true, throwAt, marker});
    if (throwAt === 'navX') assert.equal(a.inspect().navYReads, 0);
    if (throwAt === 'coerce.y') assert.equal(a.log.includes('coerce.x:number'), false);
    if (throwAt === 'angle.2' || throwAt === 'move.get') assert.equal(a.inspect().speedReads, 0);
    if (throwAt === 'speed.1') assert.equal(a.inspect().speedReads, 1);
    if (throwAt === 'speed.2') assert.equal(a.inspect().speedReads, 2);
    if (throwAt !== 'move.call') assert.equal(a.moveCalls.length, 0);
  }
});

test('same-owner reentry and original move return values cannot expose or retain a removed temporary object', async () => {
  const {OriginalGame: O, CandidateGame: C} = await modules();
  for (const fresh of [false, true]) {
    const {a, b} = compare(O, C, {x: .4, y: -.7, reentrant: true, fresh, moveResult: Object.freeze({ignored: true})});
    assert.equal(a.moveCalls.length, 2);
    assert.equal(a.inspect().reentered, true);
    assert.equal(a.inspect().navXReads, 2);
    assert.equal(a.inspect().navYReads, 2);
    assert.equal(a.inspect().speedReads, 4);
    for (const f of [a, b]) assert.equal(enemyGridAllocationStats(f.owner).acquisitions, 2);
  }
});
