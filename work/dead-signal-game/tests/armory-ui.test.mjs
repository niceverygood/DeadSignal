import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TRAINING, trainingStats, trainingOffer } from '../dist/training.js';
import { WEAPONS } from '../dist/engine.js';
import { loadProfile, buyTraining } from '../dist/storage.js';
import { applyMoodboardUI, ARMORY_MOODBOARD_ART } from '../dist/moodboard-ui.js';

const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
const helpers = source.split('\n').filter(line => line.startsWith('const btn=') || line.startsWith('const header=') || line.startsWith('function trainingCards()')).join('\n');
const branch = source.split('\n').find(line => line.startsWith("  else if(state==='armory')"));
assert.ok(branch && helpers.includes('function trainingCards()'));
const expression = branch.slice(branch.indexOf('overlay.innerHTML=') + 'overlay.innerHTML='.length).replace(/;$/, '');
function render(profile) {
  const before = JSON.stringify(profile);
  const context = vm.createContext({ profile, TRAINING, trainingStats, trainingOffer, WEAPONS,
    game: new Proxy({}, { get() { throw new Error('armory must not inspect or change a live operation'); } }),
    Math: Object.assign(Object.create(Math), { random() { throw new Error('armory must not consume randomness'); } }),
  });
  vm.runInContext(`${helpers}\nrendered=${expression}`, context);
  assert.equal(JSON.stringify(profile), before);
  return context.rendered;
}
function card(html, id) {
  const at = html.indexOf(`data-armory-item="${id}"`);
  assert.ok(at >= 0);
  return html.slice(html.lastIndexOf('<div', at), html.indexOf('</div>', at) + 6);
}

test('the actual armory supplies image zones on all five cards while preserving live prices, shortages and locked progress', () => {
  const profile = loadProfile({ getItem: () => null });
  profile.parts = 60; profile.totalKills = 37;
  const html = render(profile);
  assert.deepEqual([...html.matchAll(/data-armory-item="([a-z]+)"/g)].map(match => match[1]), ['armor', 'magazine', 'shotgun', 'nailgun', 'research']);
  assert.equal([...html.matchAll(/data-armory-art aria-hidden="true"><\/span>/g)].length, 5);
  const armor = card(html, 'armor'), magazine = card(html, 'magazine');
  assert.match(armor, /시작 체력 100/); assert.match(armor, /다음 체력 108/);
  assert.match(armor, /data-action="training" data-value="armor"\s*>60 부품으로 보강/);
  assert.doesNotMatch(armor, /disabled/);
  assert.match(magazine, /부품 15개 부족/);
  assert.match(magazine, /data-action="training" data-value="magazine" disabled>75 부품으로 보강/);
  assert.match(card(html, 'nailgun'), /locked/); assert.match(card(html, 'nailgun'), /누적 처치 37 \/ 100/);
  assert.match(card(html, 'shotgun'), /UNLOCKED/);
  assert.match(card(html, 'research'), /작전 중 12종 개조/);
});

test('real training purchases update the illustrated cards once, and maxed or unlocked states keep their original behavior', () => {
  const records = new Map(), storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
  const profile = loadProfile(storage); profile.parts = 60;
  assert.equal(buyTraining(profile, 'armor', storage), true);
  const html = render(profile);
  assert.equal(profile.parts, 0); assert.equal(profile.training.armor, 1);
  assert.match(card(html, 'armor'), /방호복 보강 · 1 \/ 3/);
  assert.match(card(html, 'armor'), /시작 체력 108/); assert.match(card(html, 'armor'), /다음 체력 116/);
  assert.match(card(html, 'armor'), /disabled>110 부품으로 보강/);
  assert.equal(buyTraining(profile, 'armor', storage), false);
  profile.training = { armor: 3, magazine: 3 }; profile.unlocked.push('nailgun');
  const maxed = render(profile);
  for (const id of ['armor', 'magazine']) {
    assert.match(card(maxed, id), /영구 보강 완료/);
    assert.match(card(maxed, id), /disabled>보강 완료/);
    assert.doesNotMatch(card(maxed, id), /다음 체력|다음 탄창/);
  }
  assert.match(card(maxed, 'nailgun'), /UNLOCKED/);
  assert.doesNotMatch(card(maxed, 'nailgun'), /class="[^"]*locked/);
});

class Node {
  constructor(tag, ownerDocument) {
    this.tagName = tag; this.ownerDocument = ownerDocument; this.children = []; this.dataset = {}; this.attributes = new Map(); this.listeners = new Map(); this.className = '';
    this.style = { setProperty() {} };
    this.classList = { add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); } };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  querySelector(selector) {
    return this.children.find(child => selector === '[data-armory-art]' ? child.isArt : selector === 'img' ? child.tagName === 'img' : false)
      ?? this.children.map(child => child.querySelector?.(selector)).find(Boolean) ?? null;
  }
}
function view() {
  const document = { createElement: tag => new Node(tag, document) };
  const cards = Object.keys(ARMORY_MOODBOARD_ART).map(id => {
    const node = new Node('div', document), art = new Node('span', document), button = Object.freeze({ disabled: id === 'magazine', action: 'training', value: id });
    node.dataset.armoryItem = id; art.isArt = true; node.children = [art, button];
    return { node, art, button };
  });
  const overlay = new Node('section', document);
  overlay.querySelector = () => null;
  overlay.querySelectorAll = selector => selector === '.armory-card[data-armory-item]' ? cards.map(card => card.node) : [];
  return { overlay, cards };
}

test('the armory adapter paints three registered illustrations and two canonical weapon crops once without replacing controls', () => {
  const { overlay, cards } = view();
  applyMoodboardUI(overlay, 'armory');
  for (const { node, art, button } of cards) {
    assert.equal(node.children[1], button); assert.equal(art.children.length, 1);
    assert.equal(art.attributes.get('aria-hidden'), 'true');
    const image = art.querySelector('img'); assert.ok(image); assert.equal(image.alt, '');
    const key = node.dataset.armoryItem, registered = ARMORY_MOODBOARD_ART[key];
    if (registered.image) assert.equal(image.src, registered.image);
    else {
      assert.equal(art.children[0].dataset.moodCrop, key);
      assert.match(image.src, /source-01-title-menu\.png$/);
    }
    const first = art.children[0]; applyMoodboardUI(overlay, 'armory');
    assert.equal(art.children[0], first, 'repainting preserves the loaded image and never duplicates it');
  }
  const armor = cards.find(({ node }) => node.dataset.armoryItem === 'armor');
  const image = armor.art.querySelector('img'); image.listeners.get('error')();
  assert.equal(image.hidden, true); assert.equal(armor.node.children[1], armor.button, 'an image failure does not disable or replace the existing purchase control');
  const separate = view(); applyMoodboardUI(separate.overlay, 'paused');
  assert.ok(separate.cards.every(({ art }) => art.children.length === 0), 'other screens never request armory illustrations');
});
