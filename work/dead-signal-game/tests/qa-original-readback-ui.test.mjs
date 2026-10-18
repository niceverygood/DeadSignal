import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createQAStorage, isQAMemoryStorage} from '../dist/qa-storage.js';

const root = new URL('../../../', import.meta.url);
const before = await readFile(new URL('qa/original-readback-probe-20261018/qa-ui-script-before.txt', root));
const bytes = await readFile(new URL('../dist/qa-player-rig.js', import.meta.url));
const source = bytes.toString('utf8');
const start = source.indexOf('// BEGIN ORIGINAL READBACK UI');
const end = source.indexOf('// END ORIGINAL READBACK UI', start);
assert.ok(start > 0 && end > start);
const block = source.slice(start, end);
const install = new Function('createQAStorage', block.replace('export function installOriginalReadbackQA', 'function installOriginalReadbackQA') + '\nreturn installOriginalReadbackQA;')(createQAStorage);
const location = {protocol: 'http:', hostname: 'localhost', port: '8851', search: '?qa&qa-memory=original-readback-test&qa-original-readback=1'};
const forbiddenModes = ['originalAttribution', 'playerAttribution', 'playerPreparation', 'playerAlphaRows', 'playerAlphaRowsVerify', 'playerDeferredRead', 'playerDeferredReadVerify'];

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.disabled = false; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function fixture(overrides = {}) {
  const nodes = [], nav = new Element('nav'), body = new Element('body'), listeners = new Set();
  const counts = {loads: 0, storage: 0, runs: 0};
  const renderer = {}, state = {ready: true, playing: false, renderer}, status = {textContent: ''};
  const result = {report: {complete: true, originalReadbackProbe: true, performance: {accepted: false}, passes: [{arm: 'A1'}, {arm: 'A2'}]}};
  const document = {
    body,
    createElement(tag) { const node = new Element(tag); nodes.push(node); return node; },
    querySelector(selector) { assert.equal(selector, 'nav'); return nav; },
  };
  const eventTarget = {
    addEventListener(name, callback, options) { assert.equal(name, 'pagehide'); assert.equal(options.once, true); listeners.add(callback); },
    removeEventListener(name, callback) { assert.equal(name, 'pagehide'); listeners.delete(callback); },
  };
  const options = {
    document, location, status, eventTarget,
    read: () => ({...state}),
    createStorage(query, persistent) {
      assert.equal(query.get('qa-original-readback'), '1');
      assert.throws(persistent, /original-readback-persistent-storage-forbidden/);
      counts.storage++;
      const memory = createQAStorage(query, persistent);
      assert.equal(isQAMemoryStorage(memory), true);
      return memory;
    },
    loadQA: async () => {
      counts.loads++;
      return {compareCanvasStateCombat: async (owner, args) => {
        assert.equal(owner, renderer);
        assert.equal(args.document, document);
        assert.equal(args.originalReadbackProbe, true);
        assert.equal(isQAMemoryStorage(args.storage), true);
        assert.equal(args.signal.aborted, false);
        for (const mode of forbiddenModes) assert.equal(Object.hasOwn(args, mode), false);
        counts.runs++;
        args.onProgress({arm: 'A2', phase: 'readback', frame: 39});
        for (let index = 0; index < 5; index++) args.onImage({src: 'data:image/png;base64,AA==', alt: 'postprobe original ' + index});
        return result;
      }};
    },
    ...overrides,
  };
  return {handle: install(options), options, nodes, nav, body, listeners, counts, renderer, state, status, result, byId: id => nodes.find(node => node.id === id)};
}

test('original readback UI preserves the full frozen prefix and rejects non-isolated gates before all DOM/owner/import/storage IO', () => {
  assert.equal(before.length, 190616);
  assert.equal(createHash('sha256').update(before).digest('hex'), 'b3bab88e2cce1f0f2efbf7f9b7b536a09f74b33b5ab00105558256b617fb3075');
  assert.deepEqual(bytes.subarray(0, before.length), before);
  assert.equal(source.indexOf('// BEGIN ORIGINAL READBACK UI', start + 1), -1);
  const poison = () => { throw Error('invalid gate must not access owners or IO'); };
  for (const input of [
    null,
    {...location, port: '8806'}, {...location, hostname: 'example.com'}, {...location, protocol: 'https:'},
    {...location, search: '?qa&qa-original-readback=1'}, {...location, search: '?qa-memory=x&qa-original-readback=1'},
    {...location, search: '?qa&qa-memory=x'}, {...location, search: '?qa&qa-memory=x&qa-original-readback=0'},
    {...location, search: '?qa&qa-memory=x&qa-original-readback=true'},
    {...location, search: '?qa&qa-memory=x&qa-render-attribution=1'},
    {...location, search: '?qa&qa-memory=x&qa-player-deferred-read=1'},
  ]) {
    assert.equal(install({location: input, document: new Proxy({}, {get: poison}), status: new Proxy({}, {get: poison, set: poison}), read: poison, loadQA: poison, createStorage: poison}), null);
  }
  assert.doesNotMatch(block, /requestAnimationFrame\s*\(|localStorage\.|\.render\s*\(|\.tick\s*\(|\bpaint\s*\(/);
});

test('ready idle clicks pass only the original-only mode, use genuine reused memory and retain at most two postprobe PNGs', async () => {
  const f = fixture();
  assert.deepEqual(f.counts, {loads: 0, storage: 0, runs: 0});
  f.state.ready = false; await f.handle.button.onclick();
  f.state.ready = true; f.state.playing = true; await f.handle.button.onclick();
  f.state.playing = false; f.handle.button.disabled = true; await f.handle.button.onclick();
  f.handle.button.disabled = false;
  assert.equal(f.counts.loads, 0);
  assert.equal(f.handle.button.id, 'original-readback-qa');
  assert.equal(await f.handle.button.onclick(), f.result);
  assert.deepEqual(f.counts, {loads: 1, storage: 1, runs: 1});
  assert.equal(f.byId('original-readback-proof').children.length, 2);
  assert.deepEqual(JSON.parse(f.byId('original-readback-report').textContent), f.result.report);
  assert.match(f.status.textContent, /완료/);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.handle.button.disabled, false);
  await f.handle.button.onclick();
  assert.deepEqual(f.counts, {loads: 2, storage: 1, runs: 2});
  assert.equal(f.byId('original-readback-proof').children.length, 2);
  assert.equal(f.state.renderer, f.renderer);
  assert.deepEqual(f.renderer, {});
});

test('duplicate clicks and owner/state replacement or pagehide during lazy import cannot start a late comparison', async () => {
  for (const change of ['owner', 'playing', 'unready', 'pagehide']) {
    const module = deferred();
    let imports = 0, runs = 0;
    const f = fixture({loadQA: () => { imports++; return module.promise; }});
    const run = f.handle.button.onclick();
    assert.equal(f.handle.button.disabled, true);
    assert.equal(await f.handle.button.onclick(), undefined);
    assert.equal(imports, 1);
    if (change === 'owner') f.state.renderer = {};
    if (change === 'playing') f.state.playing = true;
    if (change === 'unready') f.state.ready = false;
    if (change === 'pagehide') for (const hide of f.listeners) hide();
    module.resolve({compareCanvasStateCombat: () => { runs++; throw Error('late run forbidden'); }});
    assert.equal(await run, undefined);
    assert.equal(runs, 0);
    assert.equal(f.counts.storage, 0);
    assert.equal(f.listeners.size, 0);
    assert.equal(f.handle.button.disabled, false);
    if (change !== 'pagehide') assert.equal(JSON.parse(f.byId('original-readback-report').textContent).reason, 'qa-owner-or-state-changed');
  }
});

test('in-flight pagehide aborts the exact signal and suppresses late progress, images and completion UI', async () => {
  const pending = deferred();
  let args;
  const f = fixture({loadQA: async () => ({compareCanvasStateCombat: async (_, options) => { args = options; return pending.promise; }})});
  const run = f.handle.button.onclick();
  await Promise.resolve(); await Promise.resolve();
  assert.ok(args);
  assert.equal(args.signal.aborted, false);
  for (const hide of f.listeners) hide();
  assert.equal(args.signal.aborted, true);
  const statusAfterHide = f.status.textContent;
  args.onProgress({arm: 'late', frame: 999}); args.onImage({src: 'late', alt: 'must not append'});
  pending.resolve({report: {complete: true}});
  assert.equal(await run, undefined);
  assert.equal(f.status.textContent, statusAfterHide);
  assert.equal(f.byId('original-readback-proof').children.length, 0);
  assert.equal(f.byId('original-readback-report').textContent, '');
  assert.equal(f.listeners.size, 0);
  assert.equal(f.handle.button.disabled, false);
});

test('strict readback/AA failures preserve raw report and cleanup, while incomplete reports are never labelled complete', async () => {
  const error = Object.assign(Error('strict-original-AA-diff'), {report: {complete: false, pixels: {originalRepeat: {differentComponents: 1322575, maxDelta: 69}}, passes: [{arm: 'A1', originalReadbackProbe: {passed: false, failure: 'R0-R1'}}]}, cleanup: {complete: true, lateScheduled: 12, lateSettled: 12}});
  const broken = fixture({loadQA: async () => ({compareCanvasStateCombat: async () => { throw error; }})});
  assert.equal(await broken.handle.button.onclick(), undefined);
  const shown = JSON.parse(broken.byId('original-readback-report').textContent);
  assert.equal(shown.complete, false);
  assert.equal(shown.reason, 'original-readback-qa-failed');
  assert.equal(shown.error, error.message);
  assert.deepEqual(shown.report, error.report);
  assert.deepEqual(shown.cleanup, error.cleanup);
  assert.match(broken.status.textContent, /중단/);
  assert.equal(broken.listeners.size, 0);
  assert.equal(broken.handle.button.disabled, false);
  const incomplete = {report: {available: false, complete: false, reason: '8851-genuine-memory-qa-required', performance: {accepted: false}}};
  const f = fixture({loadQA: async () => ({compareCanvasStateCombat: async () => incomplete})});
  assert.equal(await f.handle.button.onclick(), incomplete);
  assert.deepEqual(JSON.parse(f.byId('original-readback-report').textContent), incomplete.report);
  assert.match(f.status.textContent, /미완료/);
  assert.doesNotMatch(f.status.textContent, /진단 완료/);
  assert.equal(f.listeners.size, 0);
});
