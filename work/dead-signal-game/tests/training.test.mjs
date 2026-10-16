import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAINING, normalizeTraining, trainingStats, trainingOffer, planTrainingPurchase } from '../dist/training.js';
import { PROFILE_KEY, loadProfile, buyTraining } from '../dist/storage.js';

class FakeStorage {
  constructor(raw = null) {
    this.records = new Map(raw === null ? [] : [[PROFILE_KEY, JSON.stringify(raw)]]);
    this.writes = [];
    this.onWrite = null;
    this.failWrites = false;
  }
  getItem(key) { return this.records.get(key) ?? null; }
  setItem(key, value) {
    this.writes.push({ key, value });
    this.onWrite?.(key, value);
    if (this.failWrites) throw new Error('Quota exceeded');
    this.records.set(key, value);
  }
}

function checkpoint() {
  return {
    version: 1, id: 'saved-operation', savedAt: 1730000000000,
    game: { version: 1, state: 'paused', player: { hp: 62, maxHp: 100, ammo: 3, maxAmmo: 6 } },
    selection: { route: 'hospital' },
  };
}

function funded(parts = 765) {
  const profile = loadProfile(new FakeStorage());
  profile.parts = parts;
  profile.activeRun = checkpoint();
  profile.completedRuns = ['previous-operation'];
  return profile;
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value;
}

test('legacy progression gains zero training ranks while preserving its wallet and saved operation', () => {
  const raw = { parts: 87, runs: 3, activeRun: checkpoint(), completedRuns: ['previous-operation'] };
  const profile = loadProfile(new FakeStorage(raw));
  assert.deepEqual(profile.training, { armor: 0, magazine: 0 });
  assert.equal(profile.parts, 87);
  assert.equal(profile.runs, 3);
  assert.deepEqual(profile.activeRun, raw.activeRun);
  assert.deepEqual(profile.completedRuns, raw.completedRuns);
});

test('training normalization rejects malformed ranks and loading sanitizes each rank independently', () => {
  for (const value of [-1, 4, 1.5, '2', NaN, Infinity, null, undefined, true]) {
    assert.deepEqual(normalizeTraining({ armor: value, magazine: value }), { armor: 0, magazine: 0 });
  }
  assert.deepEqual(normalizeTraining(null), { armor: 0, magazine: 0 });
  assert.deepEqual(normalizeTraining({ armor: 3, magazine: 2, unknown: 99 }), { armor: 3, magazine: 2 });
  const loaded = loadProfile(new FakeStorage({ parts: 100, training: { armor: 2, magazine: '3' } }));
  assert.deepEqual(loaded.training, { armor: 2, magazine: 0 });
  assert.equal(loaded.parts, 100);
});

test('training grants the defined health and weapon-specific ammunition bonuses at every rank', () => {
  for (let rank = 0; rank <= 3; rank++) {
    assert.deepEqual(trainingStats({ armor: rank, magazine: rank }), {
      maxHp: 100 + rank * 8,
      ammoBonus: { shotgun: rank, nailgun: rank * 3 },
    });
  }
  assert.deepEqual(trainingStats({ armor: 4, magazine: -1 }), { maxHp: 100, ammoBonus: { shotgun: 0, nailgun: 0 } });
});

test('each armor and magazine price has an exact affordable boundary with zero remaining parts', () => {
  assert.deepEqual(TRAINING.map(item => ({ id: item.id, costs: item.costs })), [
    { id: 'armor', costs: [60, 110, 180] },
    { id: 'magazine', costs: [75, 130, 210] },
  ]);
  for (const item of TRAINING) for (const [rank, cost] of item.costs.entries()) {
    const profile = funded(cost);
    profile.training[item.id] = rank;
    assert.deepEqual(trainingOffer(profile, item.id), { rank, maxed: false, cost, shortage: 0, canBuy: true });
    const plan = planTrainingPurchase(profile, item.id);
    assert.equal(plan.parts, 0);
    assert.equal(plan.training[item.id], rank + 1);
    profile.parts = cost - 1;
    assert.deepEqual(trainingOffer(profile, item.id), { rank, maxed: false, cost, shortage: 1, canBuy: false });
    assert.equal(planTrainingPurchase(profile, item.id), null);
  }
});

test('purchase planning leaves its frozen source and active operation unchanged', () => {
  const profile = freezeDeep(funded(200));
  const original = structuredClone(profile);
  const planned = planTrainingPurchase(profile, 'armor');
  assert.notEqual(planned, profile);
  assert.notEqual(planned.training, profile.training);
  assert.equal(planned.parts, 140);
  assert.deepEqual(planned.training, { armor: 1, magazine: 0 });
  assert.equal(planned.activeRun, profile.activeRun);
  assert.deepEqual(planned.activeRun.game.player, { hp: 62, maxHp: 100, ammo: 3, maxAmmo: 6 });
  assert.deepEqual(profile, original);
});

test('insufficient funds, unknown upgrades and max rank cannot write or spend parts', () => {
  for (const [parts, training, id] of [
    [59, { armor: 0, magazine: 0 }, 'armor'],
    [74, { armor: 0, magazine: 0 }, 'magazine'],
    [1000, { armor: 0, magazine: 0 }, 'unknown'],
    [1000, { armor: 3, magazine: 0 }, 'armor'],
    [1000, { armor: 0, magazine: 3 }, 'magazine'],
  ]) {
    const profile = funded(parts);
    profile.training = training;
    const before = structuredClone(profile);
    const storage = new FakeStorage(profile);
    assert.equal(buyTraining(profile, id, storage), false);
    assert.deepEqual(profile, before);
    assert.equal(storage.writes.length, 0);
  }
  assert.equal(trainingOffer(funded(), 'unknown'), null);
  const maxed = funded();
  maxed.training = { armor: 3, magazine: 3 };
  for (const id of ['armor', 'magazine']) assert.deepEqual(trainingOffer(maxed, id), { rank: 3, maxed: true, cost: null, shortage: 0, canBuy: false });
});

test('noninteger or blocked wallets cannot produce a purchase candidate', () => {
  for (const parts of [-1, 100.5, '100', NaN, Infinity]) {
    const profile = funded();
    profile.parts = parts;
    assert.equal(trainingOffer(profile, 'armor').canBuy, false);
    assert.equal(planTrainingPurchase(profile, 'armor'), null);
  }
});

test('successive upgrades spend each tier price once and stop at rank three', () => {
  const profile = funded(765), active = profile.activeRun, storage = new FakeStorage(profile);
  const ids = ['armor', 'magazine', 'armor', 'magazine', 'armor', 'magazine'];
  const balances = [705, 630, 520, 390, 210, 0];
  for (const [index, id] of ids.entries()) {
    assert.equal(buyTraining(profile, id, storage), true);
    assert.equal(profile.parts, balances[index]);
    assert.equal(profile.activeRun, active);
  }
  assert.deepEqual(profile.training, { armor: 3, magazine: 3 });
  assert.equal(storage.writes.length, 6);
  assert.equal(buyTraining(profile, 'armor', storage), false);
  assert.equal(buyTraining(profile, 'magazine', storage), false);
  assert.equal(storage.writes.length, 6);
  const loaded = loadProfile(storage);
  assert.deepEqual(loaded.training, profile.training);
  assert.equal(loaded.parts, 0);
  assert.deepEqual(loaded.activeRun, active);
});

test('a purchase persists wallet, permanent training and active checkpoint in one write before committing memory', () => {
  const profile = funded(75), active = profile.activeRun, storage = new FakeStorage(profile);
  storage.onWrite = (key, value) => {
    assert.equal(key, PROFILE_KEY);
    assert.equal(profile.parts, 75);
    assert.deepEqual(profile.training, { armor: 0, magazine: 0 });
    assert.equal(profile.activeRun, active);
    const candidate = JSON.parse(value);
    assert.equal(candidate.parts, 0);
    assert.deepEqual(candidate.training, { armor: 0, magazine: 1 });
    assert.deepEqual(candidate.activeRun, active);
    assert.deepEqual(candidate.completedRuns, ['previous-operation']);
  };
  assert.equal(buyTraining(profile, 'magazine', storage), true);
  assert.equal(storage.writes.length, 1);
  assert.equal(storage.records.size, 1);
  assert.equal(profile.parts, 0);
  assert.equal(profile.activeRun, active);
  assert.deepEqual(profile.training, { armor: 0, magazine: 1 });
  assert.deepEqual(loadProfile(storage), profile);
});

test('storage write exceptions roll back training, wallet and active operation without changing the persisted profile', () => {
  const profile = funded(110);
  profile.training.armor = 1;
  const active = profile.activeRun, ranks = profile.training, before = structuredClone(profile), storage = new FakeStorage(profile);
  const previous = storage.getItem(PROFILE_KEY);
  storage.failWrites = true;
  assert.equal(buyTraining(profile, 'armor', storage), false);
  assert.deepEqual(profile, before);
  assert.equal(profile.training, ranks);
  assert.equal(profile.activeRun, active);
  assert.equal(storage.getItem(PROFILE_KEY), previous);
  assert.equal(storage.writes.length, 1);
  storage.failWrites = false;
  assert.equal(buyTraining(profile, 'armor', storage), true);
  assert.equal(profile.parts, 0);
  assert.deepEqual(profile.training, { armor: 2, magazine: 0 });
  assert.equal(profile.activeRun, active);
});

test('a throwing localStorage accessor blocks purchases without mutating progression', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const profile = funded(60), before = structuredClone(profile), active = profile.activeRun;
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage access blocked'); } });
    assert.equal(buyTraining(profile, 'armor'), false);
    assert.deepEqual(profile, before);
    assert.equal(profile.activeRun, active);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
