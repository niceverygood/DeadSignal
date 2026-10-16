import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { missionGuidance, fieldHint } from '../dist/guidance.js';

const view=overrides=>({state:'playing',stage:0,stageDuration:120,stageTime:0,time:0,stageBossSpawned:false,stageCleared:false,enemies:[],alarm:{active:false},...overrides});
const initialProfile={runs:0,options:{fireMode:'manual'}};
function validResult(result){
  assert.equal(typeof result.objective,'string');assert.ok(result.objective.length>0);
  assert.equal(typeof result.detail,'string');assert.ok(Number.isFinite(result.progress)&&result.progress>=0&&result.progress<=1);
  assert.ok(['survive','gatekeeper','collector','cleared','complete'].includes(result.kind));
}

test('normal districts show rounded countdown seconds and survival progress',()=>{
  for(const stage of [0,1]){
    const initial=missionGuidance(view({stage}));validResult(initial);
    assert.equal(initial.objective,'봉쇄 정예가 나타날 때까지 생존하세요');
    assert.equal(initial.detail,'정예 출현까지 02:00');assert.equal(initial.progress,0);
    const half=missionGuidance(view({stage,stageTime:60}));assert.equal(half.detail,'정예 출현까지 01:00');assert.equal(half.progress,.5);
    assert.equal(missionGuidance(view({stage,stageTime:59.1})).detail,'정예 출현까지 01:01');
    assert.equal(missionGuidance(view({stage,stageTime:119.99})).detail,'정예 출현까지 00:01');
  }
});

test('a delayed gatekeeper spawn stays a survival goal with an approaching message',()=>{
  for(const stageTime of [120,120.001,200]){
    const result=missionGuidance(view({stageTime}));validResult(result);
    assert.equal(result.kind,'survive');assert.equal(result.progress,1);assert.equal(result.detail,'봉쇄 정예 접근 중');
    assert.equal(result.objective,'봉쇄 정예가 나타날 때까지 생존하세요');
  }
});

test('the final collector countdown uses sixty five percent of each operation duration',()=>{
  for(const duration of [120,300]){
    const threshold=duration*.65;
    const halfway=missionGuidance(view({stage:2,stageDuration:duration,stageTime:threshold/2}));validResult(halfway);
    assert.equal(halfway.objective,'수집가가 나타날 때까지 생존하세요');assert.equal(halfway.progress,.5);
    assert.equal(missionGuidance(view({stage:2,stageDuration:duration,stageTime:threshold-.01})).detail,'수집가 출현까지 00:01');
    for(const stageTime of [threshold,threshold+10]){
      const delayed=missionGuidance(view({stage:2,stageDuration:duration,stageTime}));
      assert.equal(delayed.detail,'수집가 접근 중');assert.equal(delayed.progress,1);assert.equal(delayed.kind,'survive');
    }
  }
});

test('gatekeeper damage progress comes from the real gatekeeper instead of an alarm elite',()=>{
  const alarmElite={id:1,type:'elite',hp:5,maxHp:330,dead:false};
  const gatekeeper={id:2,type:'elite',gatekeeper:true,hp:49.25,maxHp:100,dead:false};
  const result=missionGuidance(view({stageBossSpawned:true,enemies:[alarmElite,gatekeeper],alarm:{active:true,eliteId:1}}));validResult(result);
  assert.equal(result.kind,'gatekeeper');assert.equal(result.objective,'봉쇄 정예를 처치해 다음 구역을 여세요');
  assert.equal(result.detail,'봉쇄 정예 체력 50 / 100');assert.ok(Math.abs(result.progress-.5075)<1e-10);
});

test('alarms never replace a survival countdown or the final collector objective',()=>{
  const alarmElite={id:1,type:'elite',hp:5,maxHp:330,dead:false};
  const base=view({stageTime:40,enemies:[alarmElite]});const alarm={active:true,time:3,eliteId:1};
  assert.deepEqual(missionGuidance({...base,alarm}),missionGuidance(base));
  const collector={id:2,type:'collector',hp:120,maxHp:240,dead:false};
  const final=view({stage:2,stageBossSpawned:true,boss:collector,enemies:[alarmElite,collector]});
  assert.deepEqual(missionGuidance({...final,alarm}),missionGuidance(final));
  assert.equal(missionGuidance(final).progress,.5);assert.equal(missionGuidance(final).objective,'수집가를 처치하고 탈출하세요');
});

test('a present collector is the final target and a missing gatekeeper has a safe fallback',()=>{
  const collector={type:'collector',hp:80,maxHp:100,dead:false};
  const present=missionGuidance(view({stage:2,boss:collector,enemies:[collector]}));validResult(present);
  assert.equal(present.kind,'collector');assert.equal(present.detail,'수집가 체력 80 / 100');
  const missing=missionGuidance(view({stageBossSpawned:true,enemies:[{type:'elite',hp:100,maxHp:100}]}));validResult(missing);
  assert.equal(missing.detail,'봉쇄 정예를 찾아 처치하세요');assert.equal(missing.progress,0);
});

test('cleared districts and victory return completed guidance even during an orphan alarm',()=>{
  const cleared=missionGuidance(view({state:'supply',stageCleared:true,alarm:{active:true,eliteId:99}}));validResult(cleared);
  assert.equal(cleared.kind,'cleared');assert.equal(cleared.progress,1);assert.equal(cleared.objective,'구역을 확보했습니다');
  const victory=missionGuidance(view({state:'victory',stage:2,stageBossSpawned:true}));validResult(victory);
  assert.equal(victory.kind,'complete');assert.equal(victory.progress,1);assert.equal(victory.objective,'탈출에 성공했습니다');
});

test('pause and upgrade menus keep the mission countdown frozen and suppress field hints',()=>{
  const game=new Game({seed:723});game.enemies=[];game.spawnClock=1e9;
  for(let i=0;i<180;i++)game.tick(1/60);
  const before=missionGuidance(game);game.pause();
  for(let i=0;i<180;i++)game.tick(1/60,{moveX:1,shoot:true});
  assert.deepEqual(missionGuidance(game),before);assert.equal(fieldHint(game,initialProfile),null);
  game.resume();game.gainXP(game.player.xpNext);game.tick(0);assert.equal(game.state,'upgrade');
  const choosing=missionGuidance(game);for(let i=0;i<180;i++)game.tick(1/60);
  assert.deepEqual(missionGuidance(game),choosing);assert.equal(fieldHint(game,initialProfile),null);
});

test('keyboard hints change at six and twelve seconds and end exactly at eighteen',()=>{
  assert.match(fieldHint(view({time:0}),initialProfile),/WASD/);
  assert.match(fieldHint(view({time:5.999}),initialProfile),/마우스/);
  assert.match(fieldHint(view({time:6}),initialProfile),/E로.*Q로/);
  assert.match(fieldHint(view({time:11.999}),initialProfile),/E로.*Q로/);
  assert.match(fieldHint(view({time:12}),initialProfile),/Space/);
  assert.match(fieldHint(view({time:17.999}),initialProfile),/Space/);
  assert.equal(fieldHint(view({time:18}),initialProfile),null);assert.equal(fieldHint(view({time:200}),initialProfile),null);
});

test('touch hints name the visible controls instead of keyboard keys',()=>{
  const movement=fieldHint(view({time:0}),initialProfile,true);
  assert.match(movement,/이동 스틱/);assert.match(movement,/사격 버튼/);
  const equipment=fieldHint(view({time:6}),initialProfile,true);
  assert.match(equipment,/유인 버튼/);assert.match(equipment,/화염 버튼/);
  assert.match(fieldHint(view({time:12}),initialProfile,true),/회피 버튼/);
  for(const hint of [movement,equipment,fieldHint(view({time:12}),initialProfile,true)])assert.doesNotMatch(hint,/WASD|Space|E로|Q로/);
});

test('only the first unfinished operation gets hints while actively playing',()=>{
  for(const runs of [1,4,'0',undefined])assert.equal(fieldHint(view({time:2}),{runs}),null);
  assert.equal(fieldHint(view({time:2}),undefined),null);
  for(const state of ['paused','upgrade','event','supply','route','menu','dead','victory'])assert.equal(fieldHint(view({state,time:2}),initialProfile),null);
  for(const time of [-1,NaN,Infinity])assert.equal(fieldHint(view({time}),initialProfile),null);
});

test('restoring a run keeps tutorial time and changing districts does not restart the hints',()=>{
  const game=new Game({seed:723});game.enemies=[];game.spawnClock=1e9;
  for(let i=0;i<450;i++)game.tick(1/60);
  const before=fieldHint(game,initialProfile),copy=Game.restore(game.snapshot());assert.ok(copy);
  assert.equal(fieldHint(copy,initialProfile),null,'The restore pause should not display combat hints');
  copy.resume();assert.equal(fieldHint(copy,initialProfile),before);assert.match(before,/E로.*Q로/);
  copy.advanceStage();assert.equal(copy.stageTime,0);assert.equal(fieldHint(copy,initialProfile),before,'Hints must use total run time, not district time');
});

test('guidance is read-only and progress remains finite for missing or out of range data',()=>{
  const game=Object.freeze(view({stageTime:130,enemies:Object.freeze([]),alarm:Object.freeze({active:true})}));
  const profile=Object.freeze({runs:0}),before=JSON.stringify(game);
  const first=missionGuidance(game),second=missionGuidance(game);assert.notEqual(first,second);
  fieldHint(game,profile);assert.equal(JSON.stringify(game),before);
  for(const input of [undefined,view({stageTime:-1}),view({stageTime:Infinity}),view({stageDuration:0}),view({stageBossSpawned:true,enemies:[{gatekeeper:true,hp:100,maxHp:0}]})])validResult(missionGuidance(input));
});

test('automatic firing hints explain movement and mode switching without asking for a firing button',()=>{
  for(const coarse of [false,true]){const profile={runs:0,options:{fireMode:'auto'}},hint=fieldHint(view({time:0}),profile,coarse);assert.match(hint,/자동으로 공격/);assert.doesNotMatch(hint,/사격 버튼|마우스/);assert.match(hint,coarse?/이동 스틱/:/WASD.*F로/);profile.options.fireMode='manual';assert.match(fieldHint(view({time:0}),profile,coarse),coarse?/사격 버튼/:/마우스/);}
  assert.match(fieldHint(view({time:0}),{runs:0}),/오토 모드/);
});
