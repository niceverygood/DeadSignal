import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createQAStorage, isQAMemoryStorage} from '../dist/qa-storage.js';

const root = new URL('../../../', import.meta.url);
const before = await readFile(new URL('qa/deferred-read-bounded-cost-20261018/qa-ui-script-before.txt', root));
const bytes = await readFile(new URL('../dist/qa-player-rig.js', import.meta.url)), source = bytes.toString('utf8');
const start = source.indexOf('// BEGIN DEFERRED BOUNDED COST UI'), end = source.indexOf('// END DEFERRED BOUNDED COST UI', start);
assert.ok(start > 0 && end > start);
const block = source.slice(start, end);
const install = new Function('createQAStorage', block.replace('export function installDeferredBoundedCostQA', 'function installDeferredBoundedCostQA') + '\nreturn installDeferredBoundedCostQA;')(createQAStorage);
const location = {protocol: 'http:', hostname: 'localhost', port: '8851', search: '?qa&qa-memory=deferred-bounded-test&qa-player-deferred-read=1&qa-owned-cleanup=1'};
const otherModes = ['originalReadbackProbe', 'originalAttribution', 'playerAttribution', 'playerPreparation', 'playerAlphaRows', 'playerAlphaRowsVerify', 'playerDeferredReadVerify'];

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.disabled = false; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}
function fixture(overrides = {}) {
  const nodes = [], nav = new Element('nav'), body = new Element('body'), listeners = new Set();
  const counts = {loads: 0, storage: 0, runs: 0}, renderer = {};
  const state = {ready: true, playing: false, renderer}, status = {textContent: ''};
  const result = {report: {complete: true, playerDeferredRead: true, boundedOwnedCleanup: true, performance: {accepted: false}, cleanup: {complete: true}}};
  const document = {body, createElement(tag) { const node = new Element(tag); nodes.push(node); return node; }, querySelector(selector) { assert.equal(selector, 'nav'); return nav; }};
  const eventTarget = {addEventListener(name, fn, options) { assert.equal(name, 'pagehide'); assert.equal(options.once, true); listeners.add(fn); }, removeEventListener(name, fn) { assert.equal(name, 'pagehide'); listeners.delete(fn); }};
  const options = {
    document, location, status, eventTarget, read: () => ({...state}),
    createStorage(query, persistent) {
      assert.equal(query.get('qa-player-deferred-read'), '1'); assert.equal(query.get('qa-owned-cleanup'), '1');
      assert.throws(persistent, /deferred-bounded-cost-persistent-storage-forbidden/);
      counts.storage++;
      return createQAStorage(query, persistent);
    },
    loadQA: async () => {
      counts.loads++;
      return {compareCanvasStateCombat: async (owner, args) => {
        assert.equal(owner, renderer); assert.equal(args.document, document);
        assert.equal(args.playerDeferredRead, true); assert.equal(args.boundedOwnedCleanup, true);
        assert.equal(isQAMemoryStorage(args.storage), true); assert.equal(args.signal.aborted, false);
        for (const mode of otherModes) assert.equal(Object.hasOwn(args, mode), false);
        assert.deepEqual(Object.keys(args).sort(), ['boundedOwnedCleanup', 'document', 'location', 'onImage', 'onProgress', 'playerDeferredRead', 'query', 'signal', 'storage'].sort());
        counts.runs++;
        args.onProgress({arm: 'B', phase: 'owned-cleanup', frame: 39});
        for (let index = 0; index < 5; index++) args.onImage({src: 'data:image/png;base64,AA==', alt: 'cost arm ' + index});
        return result;
      }};
    },
    ...overrides,
  };
  return {handle: install(options), options, nodes, listeners, counts, renderer, state, status, result, byId: id => nodes.find(node => node.id === id)};
}

test('deferred bounded UI appends to the exact197374-byte prior UI and gates both exact flags while excluding quality verification before IO', () => {
  assert.equal(before.length, 197374);
  assert.equal(createHash('sha256').update(before).digest('hex'), '45a4cc6713ca65352867ed7c6456843228f791995a88af7fb5f4669691a6a211');
  assert.deepEqual(bytes.subarray(0, before.length), before);
  assert.equal(source.indexOf('// BEGIN DEFERRED BOUNDED COST UI', start + 1), -1);
  const poison = () => { throw Error('invalid gate must not access owner/DOM/import/storage'); };
  for (const input of [
    null, {...location, port: '8806'}, {...location, hostname: 'example.com'}, {...location, protocol: 'https:'},
    {...location, search: '?qa&qa-player-deferred-read=1&qa-owned-cleanup=1'},
    {...location, search: '?qa-memory=x&qa-player-deferred-read=1&qa-owned-cleanup=1'},
    {...location, search: '?qa&qa-memory=x&qa-player-deferred-read=1'},
    {...location, search: '?qa&qa-memory=x&qa-owned-cleanup=1'},
    {...location, search: '?qa&qa-memory=x&qa-player-deferred-read=0&qa-owned-cleanup=1'},
    {...location, search: '?qa&qa-memory=x&qa-player-deferred-read=1&qa-owned-cleanup=true'},
    {...location, search: '?qa&qa-memory=x&qa-player-deferred-read=true&qa-owned-cleanup=1'},
    {...location, search: '?qa&qa-memory=x&qa-original-readback=1&qa-owned-cleanup=1'},
    {...location, search: location.search + '&qa-player-deferred-read-verify=1'},
  ]) assert.equal(install({location: input, document: new Proxy({}, {get: poison}), read: poison, loadQA: poison, createStorage: poison}), null);
  assert.doesNotMatch(block, /requestAnimationFrame\s*\(|setTimeout\s*\(|localStorage\.|\.render\s*\(|\.tick\s*\(|\bpaint\s*\(/);
  assert.ok(fixture({location: {...location, search: location.search + '&qa-player-deferred-read-verify=0'}}).handle);
});

test('only ready idle clicks request unverified deferred A/B/A cost with separate15-second cleanup, genuine memory reuse and three PNGs', async () => {
  const f = fixture();
  assert.deepEqual(f.counts, {loads: 0, storage: 0, runs: 0});
  f.state.ready = false; await f.handle.button.onclick();
  f.state.ready = true; f.state.playing = true; await f.handle.button.onclick();
  f.state.playing = false; f.handle.button.disabled = true; await f.handle.button.onclick();
  f.handle.button.disabled = false; assert.equal(f.counts.loads, 0);
  assert.equal(f.handle.button.id, 'deferred-bounded-cost-qa');
  assert.equal(f.handle.button.textContent, '180적 주인공 읽기 순서 · 정리 포함 비용 비교');
  const summary = f.nodes.find(node => node.tag === 'summary');
  assert.match(summary.textContent, /진단 전용/); assert.match(summary.textContent, /준비.*40회 콜백.*최종 읽기/);
  assert.match(summary.textContent, /전투 시간 밖.*최대\s*15초/); assert.match(summary.textContent, /별도/);
  assert.equal(await f.handle.button.onclick(), f.result);
  assert.deepEqual(f.counts, {loads: 1, storage: 1, runs: 1});
  assert.equal(f.byId('deferred-bounded-cost-proof').children.length, 3);
  assert.deepEqual(JSON.parse(f.byId('deferred-bounded-cost-report').textContent), f.result.report);
  assert.match(f.status.textContent, /비용 진단 완료/); assert.doesNotMatch(f.status.textContent, /채택|성능 향상/);
  assert.equal(f.listeners.size, 0); assert.equal(f.handle.button.disabled, false);
  await f.handle.button.onclick();
  assert.deepEqual(f.counts, {loads: 2, storage: 1, runs: 2});
  assert.equal(f.byId('deferred-bounded-cost-proof').children.length, 3);
  assert.equal(f.state.renderer, f.renderer); assert.deepEqual(f.renderer, {});
});

test('duplicates and changed renderer/readiness/playing/pagehide during lazy import cannot start a late deferred bounded cost job', async () => {
  for (const change of ['renderer', 'ready', 'playing', 'pagehide']) {
    const module = deferred(); let imports = 0, runs = 0;
    const f = fixture({loadQA: () => { imports++; return module.promise; }}), run = f.handle.button.onclick();
    assert.equal(f.handle.button.disabled, true); assert.equal(await f.handle.button.onclick(), undefined); assert.equal(imports, 1);
    if (change === 'renderer') f.state.renderer = {};
    if (change === 'ready') f.state.ready = false;
    if (change === 'playing') f.state.playing = true;
    if (change === 'pagehide') for (const hide of f.listeners) hide();
    module.resolve({compareCanvasStateCombat: () => { runs++; throw Error('late job forbidden'); }});
    assert.equal(await run, undefined); assert.equal(runs, 0); assert.equal(f.counts.storage, 0);
    assert.equal(f.listeners.size, 0); assert.equal(f.handle.button.disabled, false);
    if (change !== 'pagehide') assert.equal(JSON.parse(f.byId('deferred-bounded-cost-report').textContent).reason, 'qa-owner-or-state-changed');
  }
});

test('pagehide aborts running deferred cost and suppresses late progress/images/result while restoring button and listeners', async () => {
  const pending = deferred(); let args;
  const f = fixture({loadQA: async () => ({compareCanvasStateCombat: async (_, input) => { args = input; return pending.promise; }})});
  const run = f.handle.button.onclick(); await Promise.resolve(); await Promise.resolve();
  assert.ok(args); assert.equal(args.signal.aborted, false); for (const hide of f.listeners) hide(); assert.equal(args.signal.aborted, true);
  const status = f.status.textContent;
  args.onProgress({phase: 'late-cleanup'}); args.onImage({src: 'late', alt: 'must not append'});
  pending.resolve({report: {complete: true, cleanup: {complete: true}}});
  assert.equal(await run, undefined); assert.equal(f.status.textContent, status);
  assert.equal(f.byId('deferred-bounded-cost-proof').children.length, 0); assert.equal(f.byId('deferred-bounded-cost-report').textContent, '');
  assert.equal(f.listeners.size, 0); assert.equal(f.handle.button.disabled, false);
});

test('raw cleanup and strict-AA failures retain report evidence without displaying successful or adopted cost', async () => {
  const error = Object.assign(Error('qa-canvas-combat-cleanup-failed'), {
    report: {complete: false, playerDeferredRead: true, pixels: {originalRepeat: {differentComponents: 1322575, maxDelta: 69}}, performance: {accepted: false}},
    cleanup: {complete: false, lateScheduled: 8, lateSettled: 7, ownedDrain: {timedOut: true, pending: [{arm: 'A2', kind: 'npc', key: 'enemy-gas'}]}},
  });
  const broken = fixture({loadQA: async () => ({compareCanvasStateCombat: async () => { throw error; }})});
  assert.equal(await broken.handle.button.onclick(), undefined);
  const shown = JSON.parse(broken.byId('deferred-bounded-cost-report').textContent);
  assert.equal(shown.complete, false); assert.equal(shown.reason, 'deferred-bounded-cost-qa-failed'); assert.equal(shown.error, error.message);
  assert.deepEqual(shown.report, error.report); assert.deepEqual(shown.cleanup, error.cleanup);
  assert.match(broken.status.textContent, /중단/); assert.equal(broken.listeners.size, 0); assert.equal(broken.handle.button.disabled, false);
  const incomplete = {report: {complete: false, reason: 'strict-original-AA-diff', pixels: {originalRepeat: {differentComponents: 1, maxDelta: 1}}, performance: {accepted: false}, cleanup: {complete: true}}};
  const f = fixture({loadQA: async () => ({compareCanvasStateCombat: async () => incomplete})});
  assert.equal(await f.handle.button.onclick(), incomplete);
  assert.deepEqual(JSON.parse(f.byId('deferred-bounded-cost-report').textContent), incomplete.report);
  assert.match(f.status.textContent, /미완료/); assert.doesNotMatch(f.status.textContent, /진단 완료|채택|성능 향상/); assert.equal(f.listeners.size, 0);
});
