import test from 'node:test';import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';import {CITY_EXPEDITION,COLD_CHAIN_EXPEDITION,FINALE_EXPEDITION,HARBOR_POWER_EXPEDITION,EXPEDITIONS,expeditionTarget} from '../dist/expedition.js';
import {storyJournalModel,storyJournalHTML} from '../dist/story-journal.js';
import {seedJournalQA} from '../dist/qa-story-journal.js';
test('earned-clue QA requires explicit memory-only flags and supplies a normal restorable checkpoint',()=>{
 const profile={activeRun:null,expeditions:{cleared:[],bestTimes:{}}},before=JSON.stringify(profile);
 for(const flags of ['', 'qa-journal=earned','qa-memory=test']){assert.equal(seedJournalQA(profile,new URLSearchParams(flags)),false);assert.equal(JSON.stringify(profile),before);}
 assert.equal(seedJournalQA(profile,new URLSearchParams('qa-memory=test&qa-journal=earned')),true);const active=Game.restore(profile.activeRun.game);assert.ok(active);assert.equal(active.expedition.step,1);assert.equal(storyJournalModel(profile.expeditions,{activeGame:active}).count,1);assert.deepEqual(profile.expeditions,{cleared:[],bestTimes:{}});
 assert.equal(seedJournalQA(profile,new URLSearchParams('qa-memory=test&qa-journal=near')),true);const near=Game.restore(profile.activeRun.game),target=expeditionTarget(near);assert.ok(Math.hypot(near.player.x-target.x,near.player.y-target.y)<28);assert.equal(near.expedition.step,0);assert.equal(near.expedition.hold,0);assert.equal(storyJournalModel(null,{activeGame:near}).count,0);
});
test('fresh and unlocked-only profiles reveal no unearned clues',()=>{
 assert.equal(storyJournalModel(null).count,0);assert.match(storyJournalHTML(null),/아직 회수한 단서가 없습니다/);
 const m=storyJournalModel({cleared:[CITY_EXPEDITION.id,'fake']});assert.equal(m.chapters.length,1);assert.equal(m.count,3);assert.equal(m.chapters[0].id,CITY_EXPEDITION.id);assert.doesNotMatch(storyJournalHTML({cleared:[CITY_EXPEDITION.id]}),/화물 K-17|최종 보관체|교차 승인/);
});
test('a real completed city goal survives pause/restore and reveals its clue without touching game or progress',()=>{
 let g=new Game({seed:774,expeditionId:CITY_EXPEDITION.id});g.enemies=[];g.spawnClock=1e9;
 for(let i=0;i<1200&&g.expedition.step===0;i++){const t=expeditionTarget(g),near=Math.hypot(g.player.x-t.x,g.player.y-t.y)<28,d=near?{x:0,y:0}:g.navigation.direction(g.player,t,g.player.r);g.tick(1/60,{moveX:d.x,moveY:d.y,interact:near,shoot:false,fireMode:'manual'});g.drainEvents();}
 assert.equal(g.expedition.step,1);g.pause();g=Game.restore(g.snapshot());assert.ok(g);
 const progress={cleared:[],bestTimes:{}},before=JSON.stringify({snapshot:g.snapshot(),progress}),m=storyJournalModel(progress,{activeGame:g});
 assert.equal(m.count,1);assert.equal(m.current.objective,expeditionTarget(g).title);assert.match(m.chapters[0].clues[0].text,/마트 냉장/);assert.doesNotMatch(storyJournalHTML(progress,{activeGame:g}),/억제제와 병원 이송 기록을 회수했다/);assert.equal(JSON.stringify({snapshot:g.snapshot(),progress}),before);
});
test('partial defense holds and forged finale state never reveal a future recovery',()=>{
 const g=new Game({expeditionId:COLD_CHAIN_EXPEDITION.id});g.expedition.step=1;g.expedition.hold=10;
 const m=storyJournalModel(null,{activeGame:g});assert.equal(m.count,1);assert.doesNotMatch(storyJournalHTML(null,{activeGame:g}),/빈 냉각 용기가 밀봉됐어요/);
 const bad={expedition:{id:FINALE_EXPEDITION.id,step:3,hold:0,bossDefeated:false}};assert.equal(storyJournalModel(null,{activeGame:bad}).count,0);assert.doesNotMatch(storyJournalHTML(null,{activeGame:bad}),/첫 백신 원액을 확보했습니다/);
});
test('replaying a cleared branch keeps previously earned clues without duplication and does not mutate profile',()=>{
 const g=new Game({expeditionId:HARBOR_POWER_EXPEDITION.id}),progress={cleared:[HARBOR_POWER_EXPEDITION.id,HARBOR_POWER_EXPEDITION.id],bestTimes:{[HARBOR_POWER_EXPEDITION.id]:150}},before=JSON.stringify(progress);
 g.expedition.step=2;const m=storyJournalModel(progress,{activeGame:g});assert.equal(m.count,8);assert.equal(m.chapters.length,1);assert.equal(m.chapters[0].current,true);assert.equal(m.chapters[0].cleared,true);assert.equal(JSON.stringify(progress),before);
 assert.equal(storyJournalModel({cleared:EXPEDITIONS.map(d=>d.id)}).count,EXPEDITIONS.reduce((n,d)=>n+d.steps.length,0));
});
