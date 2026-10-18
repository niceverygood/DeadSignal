import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnedCleanupTracker} from '../dist/qa-owned-cleanup-tracker.js';

// Controlled Promise/timer protocol only. These tests neither render nor load
// assets, and their small disposable objects are not native GPU evidence.
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}

async function flush() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}

function fakeClock(start = 100) {
  let time = start, next = 1;
  const timers = new Map(), scheduled = [], cleared = [];
  return {
    now: () => time,
    setTimer(callback, delay) {
      assert.equal(typeof callback, 'function');
      assert.ok(Number.isFinite(delay) && delay > 0);
      const id = next++;
      timers.set(id, {id, callback, due: time + delay});
      scheduled.push({id, delay, due: time + delay});
      return id;
    },
    clearTimer(id) {
      cleared.push(id);
      timers.delete(id);
    },
    elapseWithoutTimers(ms) {
      assert.ok(Number.isFinite(ms) && ms >= 0);
      time += ms;
    },
    advance(ms) {
      assert.ok(Number.isFinite(ms) && ms >= 0);
      time += ms;
      let fired = 0;
      for (;;) {
        const due = [...timers.values()]
          .filter(timer => timer.due <= time)
          .sort((a, b) => a.due - b.due || a.id - b.id)[0];
        if (!due) break;
        assert.ok(++fired <= 32, 'the fixture must not silently poll forever');
        timers.delete(due.id);
        due.callback();
      }
    },
    scheduled,
    cleared,
    timers,
  };
}

function trackerWith(clock, options = {}) {
  return createOwnedCleanupTracker({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...options,
  });
}

function assertFrozenPrimitiveTree(value, ancestors = new Set()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), 'report numbers must be finite primitives');
    return;
  }
  assert.equal(typeof value, 'object', 'report must not retain functions or undefined');
  assert.ok(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);
  assert.equal(ArrayBuffer.isView(value), false, 'report must not retain raw buffers');
  assert.equal(ancestors.has(value), false, 'report must not contain a cycle');
  assert.equal(Object.isFrozen(value), true, 'every DTO object and array must be frozen');
  ancestors.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    assert.ok('value' in descriptor, 'report must not retain accessors');
    assertFrozenPrimitiveTree(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}

test('a fulfilled owned load stays active until its asynchronous retirement ends', {timeout: 2000}, async () => {
  const clock = fakeClock(), tracker = trackerWith(clock, {timeoutMs: 200});
  const load = deferred(), retirement = deferred(), calls = [];
  const model = {
    disposed: 0,
    dispose() {
      assert.equal(this, model);
      calls.push('model.dispose');
      this.disposed++;
    },
    get render() { assert.fail('tracker must not inspect or render the payload'); },
  };
  assert.equal(tracker.follow(load.promise, {arm: 'A1', kind: 'native-model', key: 'walker'}, (value, fulfilled) => {
    calls.push('retire.enter');
    assert.equal(value, model);
    assert.equal(fulfilled, true);
    return retirement.promise.then(() => value.dispose());
  }), true);
  const initial = tracker.snapshot();
  assert.equal(initial.scheduled, 1);
  assert.equal(initial.active, 1);
  assert.equal(initial.entries[0].status, 'pending');
  assert.equal(initial.entries[0].fulfilled, null);
  assertFrozenPrimitiveTree(initial);

  const waiting = tracker.wait();
  assert.equal(tracker.wait(), waiting, 'one job has one immutable wait result');
  let finished = false;
  waiting.then(() => { finished = true; });
  assert.deepEqual(clock.scheduled.map(timer => timer.delay), [200]);
  load.resolve(model);
  await flush();
  const retiring = tracker.snapshot();
  assert.deepEqual(calls, ['retire.enter']);
  assert.equal(finished, false);
  assert.equal(model.disposed, 0);
  assert.equal(retiring.settled, 1);
  assert.equal(retiring.callbackEntered, 1);
  assert.equal(retiring.completed, 0);
  assert.equal(retiring.active, 1);
  assert.equal(retiring.entries[0].status, 'retiring');
  assert.equal(retiring.pending[0].status, 'retiring');

  retirement.resolve();
  const result = await waiting;
  assert.deepEqual(calls, ['retire.enter', 'model.dispose']);
  assert.equal(model.disposed, 1);
  assert.equal(result.complete, true);
  assert.equal(result.success, true);
  assert.equal(result.fulfilled, 1);
  assert.equal(result.rejected, 0);
  assert.equal(result.completed, 1);
  assert.equal(result.active, 0);
  assert.deepEqual(result.pending, []);
  assert.equal(result.entries[0].status, 'completed');
  assert.equal(result.wait.timersScheduled, 1);
  assert.equal(result.wait.timersCleared, 1);
  assert.equal(result.wait.timersFired, 0);
  assert.equal(result.wait.timerActive, false);
  assert.equal(clock.timers.size, 0);
  assertFrozenPrimitiveTree(result);
  assert.equal(initial.entries[0].status, 'pending', 'earlier snapshots must remain unchanged');
});

test('producer rejection is retired once and differs from a retirement failure, including opaque thrown values', {timeout: 2000}, async () => {
  const clock = fakeClock(), tracker = trackerWith(clock), loadError = Error('owned producer rejected');
  let retired = 0;
  assert.equal(tracker.follow(Promise.reject(loadError), {arm: 'A2', kind: 'rejected-load', key: 4}, (value, fulfilled) => {
    assert.equal(value, loadError);
    assert.equal(fulfilled, false);
    retired++;
  }), true);
  await flush();
  const result = await tracker.wait();
  assert.equal(retired, 1);
  assert.equal(result.success, true, 'a producer rejection is not itself a cleanup failure');
  assert.equal(result.rejected, 1);
  assert.equal(result.retireFailed, 0);
  assert.equal(result.completed, 1);
  assert.equal(result.wait.timersScheduled, 0, 'already completed work needs no timer');
  assert.deepEqual(result.errors, []);
  assertFrozenPrimitiveTree(result);

  for (const marker of [Error('owned cleanup failed'), 0, null, undefined]) {
    const x = trackerWith(fakeClock());
    const value = {notInReport: new Uint8Array(4)};
    let calls = 0;
    assert.equal(x.follow(Promise.resolve(value), {arm: 'B', kind: 'dispose', key: 'model'}, (actual, fulfilled) => {
      assert.equal(actual, value);
      assert.equal(fulfilled, true);
      calls++;
      throw marker;
    }), true);
    await flush();
    const failed = await x.wait();
    assert.equal(calls, 1);
    assert.equal(failed.complete, true);
    assert.equal(failed.success, false);
    assert.equal(failed.completed, 1, 'failed handlers have still finished and leave the active set');
    assert.equal(failed.active, 0);
    assert.equal(failed.retireFailed, 1);
    assert.equal(failed.entries[0].status, 'retire-failed');
    assert.equal(failed.errors.length, 1);
    assert.equal(failed.errors[0].stage, 'retire');
    assert.equal(typeof failed.errors[0].message, 'string');
    assertFrozenPrimitiveTree(failed);
  }
});

test('one event-driven deadline times out unresolved work, while late retirement cannot mutate the saved result', {timeout: 2000}, async () => {
  const clock = fakeClock(1000), tracker = trackerWith(clock, {timeoutMs: 50});
  const load = deferred(), model = {disposed: 0, dispose() { this.disposed++; }};
  tracker.follow(load.promise, {arm: 'B', kind: 'late-load', key: 'runner'}, (value, fulfilled) => {
    assert.equal(fulfilled, true);
    value.dispose();
  });
  const waiting = tracker.wait();
  let finished = false;
  waiting.then(() => { finished = true; });
  clock.advance(49);
  await flush();
  assert.equal(finished, false);
  assert.equal(clock.scheduled.length, 1);
  assert.equal(tracker.snapshot().wait.deadlineAt, 1050);
  clock.advance(1);
  const timedOut = await waiting, saved = JSON.stringify(timedOut);
  assert.equal(timedOut.complete, false);
  assert.equal(timedOut.success, false);
  assert.equal(timedOut.timedOut, true);
  assert.equal(timedOut.active, 1);
  assert.equal(timedOut.completed, 0);
  assert.equal(timedOut.pending.length, 1);
  assert.equal(timedOut.wait.timersScheduled, 1);
  assert.equal(timedOut.wait.timersFired, 1);
  assert.equal(timedOut.wait.timerActive, false);
  assertFrozenPrimitiveTree(timedOut);
  assert.throws(() => { timedOut.pending[0].label.kind = 'rewritten'; }, TypeError);

  load.resolve(model);
  await flush();
  const late = tracker.snapshot();
  assert.equal(model.disposed, 1);
  assert.equal(late.complete, true);
  assert.equal(late.success, false, 'late completion does not erase the deadline failure');
  assert.equal(late.timedOut, true);
  assert.equal(late.completed, 1);
  assert.equal(late.active, 0);
  assert.deepEqual(late.pending, []);
  assert.equal(JSON.stringify(timedOut), saved);
  assert.equal(tracker.wait(), waiting);
  assert.equal(await tracker.wait(), timedOut);
  assert.equal(clock.scheduled.length, 1, 'late cleanup must not start another timer');
  assertFrozenPrimitiveTree(late);
});

test('duplicate identities retain only the first callback and newly discovered followers delay completion without resetting the deadline', {timeout: 2000}, async () => {
  const clock = fakeClock(), tracker = trackerWith(clock, {timeoutMs: 100});
  const parent = deferred(), discovery = deferred(), child = deferred(), childRetirement = deferred();
  const order = [];
  assert.equal(tracker.follow(parent.promise, {arm: 'A1', kind: 'parent', key: 'first'}, value => {
    assert.equal(value, 'parent-value');
    order.push('parent.enter');
    return discovery.promise.then(() => {
      order.push('child.follow');
      assert.equal(tracker.follow(child.promise, {arm: 'A1', kind: 'child', key: 'discovered'}, actual => {
        assert.equal(actual, 'child-value');
        order.push('child.enter');
        return childRetirement.promise.then(() => { order.push('child.complete'); });
      }), true);
    });
  }), true);
  assert.equal(tracker.follow(parent.promise, {arm: 'B', kind: 'duplicate', key: 'ignored'}, () => {
    assert.fail('duplicate registration must not attach a second retirement');
  }), false);
  const waiting = tracker.wait();
  let finished = false;
  waiting.then(() => { finished = true; });
  parent.resolve('parent-value');
  await flush();
  assert.equal(tracker.snapshot().entries[0].status, 'retiring');
  clock.advance(20);
  discovery.resolve();
  await flush();
  const discovered = tracker.snapshot();
  assert.equal(discovered.scheduled, 2);
  assert.equal(discovered.completed, 1);
  assert.equal(discovered.active, 1);
  assert.equal(discovered.duplicates, 1);
  assert.equal(discovered.entries[0].label.key, 'first');
  assert.equal(discovered.wait.deadlineAt, 200, 'followers use the original deadline');
  assert.equal(clock.scheduled.length, 1);
  assert.equal(finished, false);
  child.resolve('child-value');
  await flush();
  assert.equal(tracker.snapshot().entries[1].status, 'retiring');
  assert.equal(finished, false);
  childRetirement.resolve();
  const result = await waiting;
  assert.deepEqual(order, ['parent.enter', 'child.follow', 'child.enter', 'child.complete']);
  assert.equal(result.success, true);
  assert.equal(result.scheduled, 2);
  assert.equal(result.settled, 2);
  assert.equal(result.callbackEntered, 2);
  assert.equal(result.completed, 2);
  assert.equal(result.active, 0);
  assert.equal(result.wait.timersScheduled, 1);
  assert.equal(result.wait.timersCleared, 1);
  assert.equal(tracker.follow(parent.promise, {}, () => assert.fail('completed duplicate callback')), false);
  assert.equal(tracker.snapshot().duplicates, 2, 'deduplication lasts after completion');
  assert.equal(result.duplicates, 1, 'the resolved wait result is independent of later registrations');
  assertFrozenPrimitiveTree(result);
});

test('lifetime capacity refusal attaches no retirement and preserves caller-owned overflow cleanup', {timeout: 2000}, async () => {
  const clock = fakeClock(), tracker = trackerWith(clock, {maxEntries: 2});
  const first = deferred(), second = deferred(), overflow = deferred();
  const calls = [], overflowValue = {retired: 0};
  assert.equal(tracker.follow(first.promise, {key: 1}, value => calls.push(value)), true);
  assert.equal(tracker.follow(second.promise, {key: 2}, value => calls.push(value)), true);
  let wronglyAttached = 0;
  assert.equal(tracker.follow(overflow.promise, {key: 3}, () => { wronglyAttached++; }), false);
  assert.equal(tracker.snapshot().overflowed, 1);
  // A capacity refusal is explicitly unobserved. Unlike a duplicate refusal,
  // the caller must still arrange its pre-existing best-effort cleanup.
  const callerCleanup = overflow.promise.then(value => { value.retired++; });
  first.resolve('first');
  second.resolve('second');
  overflow.resolve(overflowValue);
  await callerCleanup;
  await flush();
  const result = await tracker.wait();
  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(wronglyAttached, 0);
  assert.equal(overflowValue.retired, 1);
  assert.equal(result.complete, true);
  assert.equal(result.success, false);
  assert.equal(result.overflow, true);
  assert.equal(result.capacity, 2);
  assert.equal(result.scheduled, 2);
  assert.equal(result.completed, 2);
  assert.equal(result.entries.length, 2);
  assert.equal(result.overflowed, 1);
  assert.equal(result.errors[0].stage, 'follow.overflow');
  assert.equal(result.wait.timersScheduled, 0);
  assertFrozenPrimitiveTree(result);
  assert.equal(tracker.follow(Promise.resolve('fourth'), {}, () => assert.fail('capacity is lifetime-bounded')), false);
  assert.equal(tracker.snapshot().scheduled, 2);
  assert.equal(tracker.snapshot().overflowed, 2);
});

test('labels and diagnostics copy only bounded own primitives without invoking getters or retaining resource/error objects', {timeout: 2000}, async () => {
  const tracker = trackerWith(fakeClock()), resource = {private: new Uint8Array(8)};
  let getterCalls = 0;
  const label = {
    arm: 'A1',
    kind: 'x'.repeat(140),
    key: resource,
    get ignored() { getterCalls++; return resource; },
  };
  const inherited = Object.create({arm: 'inherited'});
  Object.defineProperty(inherited, 'kind', {get() { getterCalls++; throw resource; }});
  Object.defineProperty(inherited, 'key', {value: 12, enumerable: true});
  const error = Object.create(null);
  Object.defineProperty(error, 'message', {get() { getterCalls++; return 'must not read'; }});
  assert.equal(tracker.follow(Promise.resolve(resource), label, value => {
    assert.equal(value, resource);
  }), true);
  assert.equal(tracker.follow(Promise.resolve('second'), inherited, () => { throw error; }), true);
  label.arm = 'mutated';
  label.kind = 'mutated';
  await flush();
  const result = await tracker.wait();
  assert.equal(getterCalls, 0);
  assert.deepEqual(result.entries[0].label, {arm: 'A1', kind: 'x'.repeat(120), key: null});
  assert.deepEqual(result.entries[1].label, {arm: null, kind: null, key: 12});
  assert.equal(result.errors[0].message, 'cleanup observation or retirement failed');
  assert.equal(result.retireFailed, 1);
  assert.equal(result.completed, 2);
  assertFrozenPrimitiveTree(result);
  const before = JSON.stringify(result);
  resource.private.fill(255);
  assert.equal(JSON.stringify(result), before, 'resource mutation cannot alter a primitive report');
});

test('timeout/capacity bounds and timer failures stay bounded and report incomplete infrastructure honestly', {timeout: 2000}, async () => {
  const clock = fakeClock(), tracker = trackerWith(clock, {timeoutMs: 60001, maxEntries: 999});
  const unresolved = deferred();
  tracker.follow(unresolved.promise, {}, () => {});
  const waiting = tracker.wait();
  assert.equal(tracker.wait(), waiting);
  const initial = tracker.snapshot();
  assert.equal(initial.capacity, 256);
  assert.equal(initial.wait.timeoutMs, 60000);
  assert.deepEqual(clock.scheduled.map(timer => timer.delay), [60000]);
  unresolved.resolve();
  const complete = await waiting;
  assert.equal(complete.success, true);
  assert.equal(clock.timers.size, 0);

  const lowerClock = fakeClock(), lower = trackerWith(lowerClock, {timeoutMs: 0, maxEntries: 0});
  const pending = deferred();
  lower.follow(pending.promise, {}, () => {});
  assert.equal(lower.follow(Promise.resolve(), {}, () => assert.fail('minimum cap is one')), false);
  const lowerWait = lower.wait();
  assert.equal(lower.snapshot().capacity, 1);
  assert.deepEqual(lowerClock.scheduled.map(timer => timer.delay), [1]);
  lowerClock.advance(1);
  const lowerResult = await lowerWait;
  assert.equal(lowerResult.timedOut, true);
  assert.equal(lowerResult.overflow, true);
  assertFrozenPrimitiveTree(lowerResult);
  pending.resolve();
  await flush();

  const blockedClock = fakeClock(), blocked = trackerWith(blockedClock, {timeoutMs: 50});
  blocked.follow(Promise.resolve('synchronous-retirement'), {}, value => {
    assert.equal(value, 'synchronous-retirement');
    // Model a busy retirement before the event loop can dispatch its timer.
    blockedClock.elapseWithoutTimers(51);
  });
  const overrun = await blocked.wait();
  assert.equal(overrun.complete, true);
  assert.equal(overrun.completed, 1);
  assert.equal(overrun.timedOut, true, 'the completion clock must enforce the same overall deadline');
  assert.equal(overrun.success, false);
  assert.equal(overrun.wait.elapsedMs, 51);
  assert.equal(overrun.wait.timersFired, 0, 'no timer callback ran while retirement was busy');
  assert.equal(overrun.wait.timersScheduled, 1);
  assert.equal(overrun.wait.timersCleared, 1);
  assert.equal(blockedClock.timers.size, 0);
  assertFrozenPrimitiveTree(overrun);

  for (const point of ['set', 'clear']) {
    const c = fakeClock(), marker = Error('controlled timer ' + point);
    const x = createOwnedCleanupTracker({
      now: c.now,
      setTimer: point === 'set' ? () => { throw marker; } : c.setTimer,
      clearTimer: point === 'clear' ? id => { c.clearTimer(id); throw marker; } : c.clearTimer,
    });
    const load = deferred();
    let retired = 0;
    x.follow(load.promise, {kind: 'timer-' + point}, () => { retired++; });
    const resultPromise = x.wait();
    if (point === 'clear') load.resolve();
    const result = await resultPromise;
    assert.equal(result.success, false);
    assert.equal(result.wait.timerCleanupComplete, false);
    assert.equal(result.wait.timerActive, false);
    assert.equal(result.errors.some(entry => entry.stage === 'timer.' + point), true);
    assertFrozenPrimitiveTree(result);
    if (point === 'set') {
      assert.equal(result.complete, false);
      load.resolve();
      await flush();
      assert.equal(x.snapshot().complete, true);
    }
    assert.equal(retired, 1, 'infrastructure failure does not cancel accepted retirement');
    assert.equal(c.timers.size, 0);
  }
});

test('work accepted after a finished empty wait remains best-effort and cannot retroactively certify the old result', {timeout: 2000}, async () => {
  const clock = fakeClock(), tracker = trackerWith(clock);
  const waiting = tracker.wait(), result = await waiting, saved = JSON.stringify(result);
  assert.equal(result.success, true);
  assert.equal(result.scheduled, 0);
  assert.equal(result.wait.timersScheduled, 0);
  const later = deferred();
  let retired = 0;
  assert.equal(tracker.follow(later.promise, {arm: 'late', kind: 'discovered-after-wait', key: null}, value => {
    assert.equal(value, 'late-value');
    retired++;
  }), true);
  const pending = tracker.snapshot();
  assert.equal(pending.success, false);
  assert.equal(pending.complete, false);
  assert.equal(pending.lateRegistrations, 1);
  assert.equal(pending.active, 1);
  later.resolve('late-value');
  await flush();
  const latest = tracker.snapshot();
  assert.equal(retired, 1);
  assert.equal(latest.success, true);
  assert.equal(latest.completed, 1);
  assert.equal(latest.lateRegistrations, 1);
  assert.equal(tracker.wait(), waiting);
  assert.equal(await tracker.wait(), result);
  assert.equal(JSON.stringify(result), saved);
  assert.equal(clock.scheduled.length, 0);
  assertFrozenPrimitiveTree(latest);
});
