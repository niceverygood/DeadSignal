import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { patchMobileApp, patchMobileAudio, patchMobileIndex, sha256, BASE_HASHES } from './fixtures/mobile-ux-patch-functions.mjs';
import { Game } from '../dist/engine.js';

const base = new URL('./fixtures/mobile-v026-base/', import.meta.url);
const sources = Object.fromEntries(await Promise.all(Object.keys(BASE_HASHES).map(async file => [file, await readFile(new URL(file, base), 'utf8')])));
const patched = patchMobileApp(sources['app.js']);
function actualFunction(name, nextName) {
  const start = patched.indexOf(`function ${name}(`);
  const end = patched.indexOf(nextName, start);
  assert.ok(start >= 0 && end > start);
  return patched.slice(start, end).trim();
}
test('patch anchors are pinned to immutable release, and a changed source cannot silently pass', () => {
  for (const [file, hash] of Object.entries(BASE_HASHES)) assert.equal(sha256(sources[file]), hash);
  assert.throws(() => patchMobileApp(sources['app.js'].replace('function action(name,value){', 'function action(x,y){')), /source anchor/);
  assert.throws(() => patchMobileApp(patched), /source anchor/);
  const html = patchMobileIndex(sources['index.html']);
  assert.ok(html.includes('data-release-channel="store"'));
  assert.ok(html.includes('./mobile.css?v=1.0.0'));
  const upgradeLine=patched.split('\n').find(line=>line.includes("state==='upgrade')overlay.innerHTML="));
  const hint=upgradeLine.match(/<span class="card-meta">(.*?)<\/span>/)[1];
  const renderHint=Function('coarse','i','game','u','return `'+hint+'`;');
  const game={upgrades:{damage:1}},upgrade={id:'damage',max:5};
  assert.equal(renderHint(true,2,game,upgrade),'눌러서 선택 · 2 / 5 단계');
  assert.equal(renderHint(false,2,game,upgrade),'3 키로 선택 · 2 / 5 단계');
});
test('store gear action guard prevents test chips, test purchases and test equipment navigation before any side effect', () => {
  const actionSource = actualFunction('action', 'overlay.addEventListener');
  const action = Function('storeRelease', `return (${actionSource});`)(true);
  for (const name of ['equipment', 'gear-test-chips', 'gear-buy', 'gear-equip', 'gear-unequip', 'gear-future-action']) assert.doesNotThrow(() => action(name, 'test'));
  // No stubbed storage or Game is supplied: any accidental path after the guard throws.
  assert.throws(() => action('training', 'armor'), /launchGate/);
  assert.ok(patched.includes("${storeRelease?'':btn('강화 상점','equipment','secondary')}"));
  assert.ok(patched.includes("${!storeRelease&&getMission(selection.missionId)?btn('강화 장비 선택','equipment','secondary'):''}"));
  assert.ok(patched.includes("document.documentElement.dataset.nativeRuntime==='true'||matchMedia('(pointer: coarse)').matches"));
});
test('mobile background callback checkpoints actual combat paused with HP, ammo, RNG and choices preserved', () => {
  for (const state of ['playing', 'upgrade']) {
    const game = new Game({ seed: 19341, weapon: 'nailgun', stageDuration: 120 });
    game.enemies = []; game.spawnClock = 1e9;
    game.tick(1 / 60, { moveX: 1, moveY: 0 });
    if (state === 'upgrade') { game.pendingLevels = 1; game.showUpgrade(); }
    const before = { player: structuredClone(game.player), random: game.random.getState(), visual: game.visualRandom.getState(), time: game.time, choices: structuredClone(game.choices) };
    const calls = [], snapshots = [];
    const fn = actualFunction('suspendMobileSession', 'function mobileBack(');
    const invoke = Function('game', 'launchGate', 'resetInput', 'checkpoint', 'renderUI', 'audio', `let screen=${JSON.stringify(state === 'upgrade' ? 'codex' : null)};${fn};return ()=>{suspendMobileSession();return screen;};`)(
      game, { cancel: () => calls.push('cancel') }, () => calls.push('clear-input'), () => { calls.push('save'); snapshots.push(game.snapshot()); }, () => calls.push('render'), { suspend: () => calls.push('audio-suspend') }
    );
    const screen = invoke();
    assert.deepEqual(calls, ['cancel', 'clear-input', 'save', 'render', 'audio-suspend']);
    assert.equal(game.state, state === 'playing' ? 'paused' : 'upgrade');
    assert.equal(screen, state === 'playing' ? null : 'codex');
    assert.deepEqual(game.player, before.player); assert.deepEqual(game.choices, before.choices);
    assert.equal(game.time, before.time); assert.equal(game.random.getState(), before.random); assert.equal(game.visualRandom.getState(), before.visual);
    const restored = Game.restore(snapshots[0]); assert.ok(restored);
    assert.equal(restored.state, state === 'playing' ? 'paused' : 'upgrade');
    assert.deepEqual(restored.player, before.player); assert.deepEqual(restored.choices, before.choices);
    for (let i = 0; i < 60; i++) game.tick(1 / 60, { moveX: 1, shoot: true });
    assert.equal(game.time, before.time, 'Background callbacks must not automatically resume combat');
  }
});
test('Android back cancels loading, closes a dialog, pauses combat and leaves decisions intact', () => {
  const source = actualFunction('mobileBack', "window.addEventListener('dead-signal:app-state'");
  const scenarios = [
    { state: 'playing', screen: null, busy: true, expected: ['cancel', 'clear', 'render'] },
    { state: 'paused', screen: 'settings', expected: ['clear', 'render'] },
    { state: 'paused', screen: 'mobile-privacy', expected: ['clear', 'render'] },
    { state: 'playing', screen: null, expected: ['pause'] },
    { state: 'upgrade', screen: null, expected: ['clear', 'save'] },
    { state: 'menu', screen: 'menu', expected: [], handled: false }
  ];
  for (const scenario of scenarios) {
    const calls = [], game = { state: scenario.state };
    const back = Function('game', 'launchGate', 'resetInput', 'checkpoint', 'renderUI', 'pause', `let screen=${JSON.stringify(scenario.screen)};${source};return mobileBack;`)(game, { busy: !!scenario.busy, cancel: () => calls.push('cancel') }, () => calls.push('clear'), () => calls.push('save'), () => calls.push('render'), () => calls.push('pause'));
    assert.equal(back(), scenario.handled !== false); assert.deepEqual(calls, scenario.expected); assert.equal(game.state, scenario.state);
  }
});
test('privacy panel closes to settings and Escape cannot accidentally resume a paused operation', () => {
  assert.ok(patched.includes("else if(name==='close'){if(screen==='mobile-privacy'){screen='settings';renderUI();return;}screen=null;"));
  assert.ok(patched.includes("if(screen==='settings'||screen==='mobile-privacy')action('close');"));
  assert.ok(patched.includes("else if(state==='mobile-privacy')overlay.innerHTML="));
  assert.ok(patched.includes("${btn('개인정보 처리방침','mobile-privacy','secondary')}"));
  assert.ok(patched.includes("import {mobilePrivacyHTML} from './mobile-privacy.js?v=1.0.0'"));
});
test('WebAudio explicitly suspends and an interrupted iOS context unlocks only on explicit input', async () => {
  const moduleURL = `data:text/javascript;base64,${Buffer.from(patchMobileAudio(sources['audio.js'])).toString('base64')}`;
  const { AudioSystem } = await import(moduleURL);
  const calls = [], audio = new AudioSystem();
  audio.ctx = { state: 'interrupted', resume: async () => calls.push('resume'), suspend: async () => calls.push('suspend') };
  await audio.suspend(); assert.deepEqual(calls, ['suspend']);
  audio.unlock(); await Promise.resolve(); assert.deepEqual(calls, ['suspend', 'resume']);
  audio.ctx.suspend = () => Promise.reject(new Error('OS denial'));
  await assert.doesNotReject(audio.suspend());
});

const actualApp = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
const actualAudio = await readFile(new URL('../dist/audio.js', import.meta.url), 'utf8');
const actualCSS = await readFile(new URL('../dist/mobile.css', import.meta.url), 'utf8');
test('applied native app and audio exactly match reviewed mobile patches', () => {
  assert.equal(actualApp, patched);
  assert.equal(actualAudio, patchMobileAudio(sources['audio.js']));
});
test('native safe areas include both WebKit env and Capacitor Android SystemBars custom insets', () => {
  for (const side of ['top', 'right', 'bottom', 'left']) {
    assert.ok(actualCSS.includes(`--mobile-safe-${side}: max(env(safe-area-inset-${side}, 0px), var(--safe-area-inset-${side}, 0px));`));
  }
});
