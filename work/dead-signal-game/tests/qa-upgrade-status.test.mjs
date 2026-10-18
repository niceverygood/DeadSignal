import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../dist/engine.js';
import {loadProfile,PROFILE_KEY} from '../dist/storage.js';
import {createQAStorage} from '../dist/qa-storage.js';
import {allowUpgradeStatusQA,seedUpgradeStatusQA} from '../dist/qa-upgrade-status.js';

const location={protocol:'http:',hostname:'localhost',port:'8851'},query=new URLSearchParams('qa&qa-memory&qa-upgrade-status=15');
const memory=()=>createQAStorage(query,()=>{throw Error('persistent storage forbidden');});
test('strict origin, explicit level15 query and real branded memory gate reject before profile/storage work',()=>{
 let reads=0;const blockedProfile=new Proxy({},{get(){reads++;throw Error('profile accessed outside gate');}}),fake={getItem(){reads++;throw Error('storage accessed outside gate');},setItem(){reads++;throw Error('storage accessed outside gate');}},store=memory();
 for(const [loc,q,s]of [[{...location,port:'8806'},query,store],[{...location,protocol:'https:'},query,store],[{...location,hostname:'example.com'},query,store],[location,new URLSearchParams('qa&qa-memory'),store],[location,new URLSearchParams('qa&qa-memory&qa-upgrade-status=16'),store],[location,query,fake],[location,new URLSearchParams('qa&qa-memory&qa-upgrade-status=15&qa-upgrade-weapon=unknown'),store]])assert.equal(seedUpgradeStatusQA(blockedProfile,s,{location:loc,query:q}),null);
 assert.equal(reads,0);assert.equal(allowUpgradeStatusQA(location,query,store),true);
});
test('normal XP and13 first-offered choices produce a valid LV15 pending checkpoint and preserve the original enemies/spawn clock in memory only',()=>{
 for(const weapon of ['shotgun','nailgun']){
  const store=memory(),profile=loadProfile(store),q=new URLSearchParams(query);q.set('qa-upgrade-weapon',weapon);const baseline=new Game({seed:774,missionId:'mission-01',weapon,training:profile.training,equipment:profile.equipment}),selected=[];
  for(let level=2;level<=15;level++){baseline.gainXP(baseline.player.xpNext-baseline.player.xp);baseline.tick(0,{shoot:false,fireMode:'manual'});if(level<15){selected.push(baseline.choices[0].id);assert.equal(baseline.chooseUpgrade(baseline.choices[0].id),true);}}
  const report=seedUpgradeStatusQA(profile,store,{location,query:q});assert.equal(report.levelUps,14);assert.equal(report.selectedCount,13);assert.deepEqual(report.selected,selected);assert.equal(report.level,15);assert.equal(report.count,5);assert.equal(report.spawnClock,1.5);assert.equal(report.snapshotValid,true);
  assert.deepEqual(profile.activeRun.game,baseline.snapshot(),'independent normal API schedule is the checkpoint oracle');assert.deepEqual(JSON.parse(store.getItem(PROFILE_KEY)).activeRun.game,baseline.snapshot());const restored=Game.restore(profile.activeRun.game);assert.ok(restored);assert.equal(restored.state,'upgrade');assert.equal(restored.player.level,15);assert.deepEqual(restored.choices.map(choice=>choice.id),report.offered);assert.equal(restored.pendingLevels,1);
 }
});
test('unrelated profile state stays exact and a failed memory write restores the prior active-run identity',()=>{
 const store=memory(),profile=loadProfile(store),original={version:1,id:'existing-owned-memory-run',savedAt:0,game:{},selection:{route:'hospital'}};profile.activeRun=original;const untouched=JSON.stringify({...profile,activeRun:null}),set=store.setItem;store.setItem=()=>{throw Error('deliberate memory failure');};
 try{assert.throws(()=>seedUpgradeStatusQA(profile,store,{location,query}),/memory-checkpoint-failed/);assert.equal(profile.activeRun,original);assert.equal(JSON.stringify({...profile,activeRun:null}),untouched);}finally{store.setItem=set;}
});
test('app seeder stays dynamically gated and an upgrade fixture takes precedence over density seeding without changing keyboard choices',()=>{
 const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');assert.match(source,/query\.get\('qa-upgrade-status'\)==='15'[\s\S]*?isQAMemoryStorage\(qaStorage\)[\s\S]*?await import\('\.\/qa-upgrade-status\.js'\)/);assert.match(source,/qaLoopFixture=qaUpgradeFixture\|\|qaLoopModule\.seedAppLoopQA/);assert.match(source,/game\.state==='upgrade'&&\['Digit1','Digit2','Digit3'\]/);assert.match(source,/else if\(state==='upgrade'\)overlay\.innerHTML=upgradeStatusHTML\(game,\{compact:coarse\}\)/);assert.equal((source.match(/import\('\.\/qa-upgrade-status\.js'\)/g)||[]).length,1);
});
