// Future tests/upgrade-status-view.test.mjs; root runs after API/source integration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UPGRADES,getUpgradeDisplay,getUpgradeCharacterStats} from '../dist/upgrade-model.js';
import {createUpgradeStatusView,upgradeStatusHTML} from '../dist/upgrade-status-view.js';

function fixture(){const game=new Game({seed:774,missionId:'mission-01',weapon:'nailgun'});game.player.level=15;game.state='upgrade';game.pendingLevels=1;game.choices=['health','haste','magnet'].map(id=>UPGRADES.find(item=>item.id===id));game.upgrades={damage:2,haste:3,magnet:2,health:1};return game;}
const observe=game=>JSON.stringify({snapshot:game.snapshot(),player:game.player,upgrades:game.upgrades,choices:game.choices,random:game.random.getState(),visualRandom:game.visualRandom.getState(),events:game.events,particles:game.particles,texts:game.texts,links:game.links});

test('view reads shared actual stats and current/next effects without selecting a choice or mutating checkpoint, RNG or effects',()=>{
 const game=fixture(),before=observe(game),view=createUpgradeStatusView(game);
 assert.deepEqual(view.rawStats,getUpgradeCharacterStats(game));assert.equal(view.level,15);assert.equal(view.choices.length,3);
 for(const choice of view.choices){const shared=getUpgradeDisplay(game,choice.id);assert.equal(choice.rank,shared.rank);assert.equal(choice.nextRank,shared.nextRank);assert.deepEqual(choice.currentEffects,shared.currentEffects);assert.deepEqual(choice.nextEffects,shared.nextEffects);assert.equal(choice.summary,shared.summary);}
 upgradeStatusHTML(game);upgradeStatusHTML(game,{compact:true});assert.equal(observe(game),before);assert.equal(game.state,'upgrade');
});
test('markup keeps three existing upgrade actions and keyboard order, prominent current level, original art and choices before owned details',()=>{
 const html=upgradeStatusHTML(fixture());assert.equal((html.match(/data-action="upgrade"/g)||[]).length,3);assert.match(html,/upgrade-level-badge[^>]*[\s\S]*?<strong aria-hidden="true">15<\/strong>/);assert.match(html,/role="dialog" aria-modal="true"/);
 for(const [index,id]of ['health','haste','magnet'].entries()){assert.match(html,new RegExp('data-value="'+id+'"'));assert.match(html,new RegExp((index+1)+' 키 또는 터치로 선택'));}
 assert.ok(html.indexOf('class="choice-grid"')<html.indexOf('class="upgrade-owned"'));assert.match(html,/data-mood-crop="survivor"/);assert.match(html,/source-02-safehouse-loadout\.png/);assert.match(html,/탄환 피해는 적 방어 적용 전 1발 기준/);
 assert.doesNotMatch(html,/\d+\s*\/\s*[345]\s*단계/);assert.equal((html.match(/<dd>/g)||[]).length,6);
});
test('large owned ranks keep all12 current ranks and exact shared next effects without a maximum-rank fraction',()=>{
 const game=fixture();game.upgrades=Object.fromEntries(UPGRADES.map(item=>[item.id,1000]));const before=observe(game),view=createUpgradeStatusView(game),html=upgradeStatusHTML(game);
 assert.equal(view.owned.length,12);assert.ok(view.owned.every(skill=>skill.rank===1000&&skill.nextRank===1001));assert.equal((html.match(/class="upgrade-owned-skill"/g)||[]).length,12);assert.match(html,/현재 1,000단계/);assert.match(html,/1,001단계/);assert.doesNotMatch(html,/1,000\s*\//);assert.equal(observe(game),before);
});
test('compact owned details remain native and optional while the same three choice buttons stay ahead of them',()=>{
 const desktop=upgradeStatusHTML(fixture()),compact=upgradeStatusHTML(fixture(),{compact:true});assert.match(desktop,/<details class="upgrade-owned" open>/);assert.match(compact,/<details class="upgrade-owned">/);assert.doesNotMatch(compact,/<details class="upgrade-owned" open>/);assert.equal((compact.match(/<button /g)||[]).length,3);assert.ok(compact.indexOf('data-action="upgrade"')<compact.indexOf('<summary>'));assert.doesNotMatch(compact,/data-action="(?:upgrade-next|owned-skill|close)"/);
});
