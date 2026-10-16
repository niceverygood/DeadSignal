import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_KEY, activeRunEnvelope, loadProfile, saveProfile, recordRun } from '../dist/storage.js';

class FakeStorage {
  constructor(profile = null) {
    this.records = new Map(profile === null ? [] : [[PROFILE_KEY, JSON.stringify(profile)]]);
    this.writes = [];
    this.failWrites = false;
  }
  getItem(key) { return this.records.get(key) ?? null; }
  setItem(key, value) {
    this.writes.push({ key, value });
    if (this.failWrites) throw new Error('Quota exceeded');
    this.records.set(key, value);
  }
}

function checkpoint(id = 'run-1', route = 'police') {
  return {
    version: 1,
    id,
    savedAt: 1730000000000,
    game: { version: 1, stage: 1, time: 143.5, player: { hp: 62, weapon: 'shotgun' } },
    selection: { route },
  };
}

const finished = { kills: 105, parts: 21, time: 244.8, won: true };

test('active run envelope accepts boundary metadata and keeps the selected route', () => {
  const raw = checkpoint('a'.repeat(100));
  raw.savedAt = 0;
  assert.deepEqual(activeRunEnvelope(raw), raw);
  assert.equal(activeRunEnvelope(checkpoint('run-hospital', 'hospital')).selection.route, 'hospital');
  assert.equal(activeRunEnvelope(checkpoint('run-fallback', 'unknown')).selection.route, 'hospital');
  const noSelection = checkpoint();
  delete noSelection.selection;
  assert.equal(activeRunEnvelope(noSelection).selection.route, 'hospital');
});

test('malformed checkpoint envelopes cannot become resumable runs', () => {
  const invalid = [
    null,
    false,
    { ...checkpoint(), version: 2 },
    { ...checkpoint(), id: '' },
    { ...checkpoint(), id: 7 },
    { ...checkpoint(), id: 'a'.repeat(101) },
    { ...checkpoint(), savedAt: -1 },
    { ...checkpoint(), savedAt: NaN },
    { ...checkpoint(), savedAt: Infinity },
    { ...checkpoint(), savedAt: 'today' },
    { ...checkpoint(), game: null },
    { ...checkpoint(), game: [] },
    { ...checkpoint(), game: 'snapshot' },
  ];
  for (const raw of invalid) assert.equal(activeRunEnvelope(raw), null);
  const loaded = loadProfile(new FakeStorage({ runs: 3, activeRun: invalid.at(-1) }));
  assert.equal(loaded.activeRun, null);
  assert.equal(loaded.runs, 3);
});

test('checkpoint and progression round trip together in exactly one profile write', () => {
  const storage = new FakeStorage();
  const profile = loadProfile(storage);
  profile.activeRun = checkpoint();
  profile.completedRuns = ['earlier-run'];
  profile.runs = 4;
  profile.parts = 87;
  profile.options.autoAim = true;
  assert.equal(saveProfile(profile, storage), true);
  assert.equal(storage.writes.length, 1);
  assert.equal(storage.writes[0].key, PROFILE_KEY);
  assert.equal(storage.records.size, 1);
  const stored = JSON.parse(storage.writes[0].value);
  assert.deepEqual(stored.activeRun, profile.activeRun);
  assert.deepEqual(stored.completedRuns, ['earlier-run']);
  const reloaded = loadProfile(storage);
  assert.deepEqual(reloaded.activeRun, profile.activeRun);
  assert.deepEqual(reloaded.completedRuns, ['earlier-run']);
  assert.equal(reloaded.runs, 4);
  assert.equal(reloaded.parts, 87);
  assert.equal(reloaded.options.autoAim, true);
});

test('legacy profiles gain empty resume metadata without losing progression', () => {
  const legacy = { version: 1, runs: 8, wins: 2, totalKills: 400, bestKills: 99, bestTime: 320, parts: 166, unlocked: ['shotgun', 'nailgun'] };
  const loaded = loadProfile(new FakeStorage(legacy));
  assert.equal(loaded.activeRun, null);
  assert.deepEqual(loaded.completedRuns, []);
  for (const key of ['runs', 'wins', 'totalKills', 'bestKills', 'bestTime', 'parts', 'unlocked']) assert.deepEqual(loaded[key], legacy[key]);
});

test('atmosphere defaults for old or malformed profiles and both boolean preferences survive save and reload', () => {
  assert.equal(loadProfile(new FakeStorage()).options.atmosphere, true);
  const legacy = loadProfile(new FakeStorage({ runs: 3, parts: 84, options: { sound: false, volume: .2 } }));
  assert.equal(legacy.options.atmosphere, true);
  assert.equal(legacy.options.sound, false);
  assert.equal(legacy.parts, 84);
  const storage = new FakeStorage({ runs: 3, parts: 84, activeRun: checkpoint('settings-run'), training: { armor: 1, magazine: 2 } });
  const profile = loadProfile(storage), activeRun = structuredClone(profile.activeRun);
  for (const preference of [false, true]) {
    profile.options.atmosphere = preference;
    assert.equal(saveProfile(profile, storage), true);
    const reloaded = loadProfile(storage);
    assert.equal(reloaded.options.atmosphere, preference);
    assert.equal(reloaded.runs, 3);
    assert.equal(reloaded.parts, 84);
    assert.deepEqual(reloaded.activeRun, activeRun);
    assert.deepEqual(reloaded.training, { armor: 1, magazine: 2 });
  }
  for (const malformed of ['false', 'true', 0, 1, null, [], {}]) {
    assert.equal(loadProfile(new FakeStorage({ options: { atmosphere: malformed } })).options.atmosphere, true);
  }
});

test('completion history is sanitized and only the latest 64 distinct valid IDs are retained', () => {
  const ids = Array.from({ length: 80 }, (_, i) => `completed-${i}`);
  const loaded = loadProfile(new FakeStorage({ completedRuns: [null, '', 7, 'x'.repeat(101), ...ids, ids.at(-1), ids[25]] }));
  assert.deepEqual(loaded.completedRuns, ids.slice(-64));
  assert.equal(new Set(loaded.completedRuns).size, 64);
});

test('a checkpoint for an already completed ID is suppressed on load', () => {
  const profile = loadProfile(new FakeStorage({ completedRuns: ['run-1'], activeRun: checkpoint('run-1') }));
  assert.equal(profile.activeRun, null);
  assert.deepEqual(profile.completedRuns, ['run-1']);
  const other = loadProfile(new FakeStorage({ completedRuns: ['old-run'], activeRun: checkpoint('run-1') }));
  assert.equal(other.activeRun.id, 'run-1');
});

test('a completed run ID awards statistics and unlocks once, then clears its matching checkpoint', () => {
  const profile = loadProfile(new FakeStorage());
  profile.activeRun = checkpoint('same-run');
  assert.deepEqual(recordRun(profile, finished, 'same-run'), ['nailgun']);
  assert.equal(profile.activeRun, null);
  assert.deepEqual(profile.completedRuns, ['same-run']);
  const afterFirst = structuredClone(profile);
  profile.activeRun = checkpoint('same-run');
  assert.deepEqual(recordRun(profile, { kills: 999, parts: 999, time: 1, won: true }, 'same-run'), []);
  assert.deepEqual(profile, afterFirst);
});

test('recording another run keeps an unrelated checkpoint and caps completion history', () => {
  const profile = loadProfile(new FakeStorage());
  profile.completedRuns = Array.from({ length: 64 }, (_, i) => `prior-${i}`);
  profile.activeRun = checkpoint('current-run');
  const current = structuredClone(profile.activeRun);
  recordRun(profile, finished, 'finished-other-run');
  assert.deepEqual(profile.activeRun, current);
  assert.equal(profile.completedRuns.length, 64);
  assert.equal(profile.completedRuns[0], 'prior-1');
  assert.equal(profile.completedRuns.at(-1), 'finished-other-run');
});

test('a failed atomic write preserves the persisted checkpoint and in-memory completion for retry', () => {
  const storage = new FakeStorage({ activeRun: checkpoint('retry-run') });
  const profile = loadProfile(storage);
  const previousStored = storage.getItem(PROFILE_KEY);
  recordRun(profile, finished, 'retry-run');
  const completed = structuredClone(profile);
  storage.failWrites = true;
  assert.equal(saveProfile(profile, storage), false);
  assert.deepEqual(profile, completed);
  assert.equal(storage.getItem(PROFILE_KEY), previousStored);
  assert.equal(storage.writes.length, 1);
  assert.deepEqual(recordRun(profile, finished, 'retry-run'), []);
  assert.deepEqual(profile, completed);
  storage.failWrites = false;
  assert.equal(saveProfile(profile, storage), true);
  const recovered = loadProfile(storage);
  assert.equal(recovered.runs, 1);
  assert.equal(recovered.wins, 1);
  assert.equal(recovered.totalKills, finished.kills);
  assert.equal(recovered.parts, finished.parts);
  assert.equal(recovered.activeRun, null);
  assert.deepEqual(recovered.completedRuns, ['retry-run']);
});

test('auto firing is the default and explicit auto/manual modes persist without changing the saved operation',()=>{
  for(const mode of [undefined,'invalid',false,null,0,{},'AUTO'])assert.equal(loadProfile(new FakeStorage({options:{fireMode:mode,autoAim:true}})).options.fireMode,'auto');
  const storage=new FakeStorage({runs:3,parts:24,training:{armor:1,magazine:2},activeRun:checkpoint('firing-run')}),profile=loadProfile(storage),operation=structuredClone(profile.activeRun);
  for(const mode of ['manual','auto']){profile.options.fireMode=mode;assert.equal(saveProfile(profile,storage),true);const loaded=loadProfile(storage);assert.equal(loaded.options.fireMode,mode);assert.deepEqual(loaded.activeRun,operation);assert.equal(loaded.parts,24);assert.deepEqual(loaded.training,{armor:1,magazine:2});}
});

test('minimap preferences default on for existing saves and preserve progression on either selection',()=>{
  for(const value of [undefined,null,0,1,'false',{}])assert.equal(loadProfile(new FakeStorage({parts:87,options:{minimap:value}})).options.minimap,true);
  const storage=new FakeStorage({parts:87,activeRun:checkpoint('map-run')}),profile=loadProfile(storage),operation=structuredClone(profile.activeRun);
  for(const value of [false,true]){profile.options.minimap=value;assert.equal(saveProfile(profile,storage),true);const loaded=loadProfile(storage);assert.equal(loaded.options.minimap,value);assert.equal(loaded.parts,87);assert.deepEqual(loaded.activeRun,operation);}
});
