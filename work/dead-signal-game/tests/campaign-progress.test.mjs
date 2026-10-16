import test from 'node:test';
import assert from 'node:assert/strict';
import {MISSIONS,BOSS_CATALOG} from '../dist/campaign.js';
import {normalizeCampaign,missionAccess,planMissionSelection,planBossRecord,planMissionCompletion} from '../dist/campaign-progress.js';
import {loadProfile,saveProfile,recordRun,PROFILE_KEY} from '../dist/storage.js';

const store=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const victory=(mission,time=100)=>({missionId:mission.id,won:true,midBossDefeated:true,time,kills:15,parts:15,level:3});

test('a fresh or legacy survivor unlocks exactly the first campaign mission',()=>{
  const progress=normalizeCampaign(null);assert.equal(progress.selectedMission,MISSIONS[0].id);
  assert.deepEqual(MISSIONS.map(mission=>missionAccess(progress,mission.id).unlocked),[true,...Array(11).fill(false)]);
  const storage=store();storage.setItem(PROFILE_KEY,JSON.stringify({parts:17,unlocked:['nailgun'],options:{fireMode:'manual'}}));
  const profile=loadProfile(storage);assert.equal(profile.parts,17);assert.deepEqual(profile.unlocked,['shotgun','nailgun']);assert.equal(profile.options.fireMode,'manual');assert.deepEqual(profile.campaign,progress);
});

test('progress sanitization requires a sequential clear prefix and rejects invalid boss and timing records',()=>{
  const raw={cleared:[MISSIONS[2].id,MISSIONS[0].id,MISSIONS[0].id,'unknown'],bestTimes:{[MISSIONS[0].id]:-1,[MISSIONS[2].id]:5},bossSeen:[BOSS_CATALOG[0].id,'unknown'],bossDefeated:[BOSS_CATALOG[1].id,BOSS_CATALOG[1].id],selectedMission:MISSIONS[11].id};
  const before=JSON.stringify(raw),value=normalizeCampaign(raw);assert.deepEqual(value.cleared,[MISSIONS[0].id]);assert.deepEqual(value.bestTimes,{});assert.equal(value.selectedMission,MISSIONS[1].id);
  assert.deepEqual(value.bossDefeated,[BOSS_CATALOG[1].id]);assert.deepEqual(value.bossSeen,[BOSS_CATALOG[0].id,BOSS_CATALOG[1].id]);assert.equal(JSON.stringify(raw),before);
});

test('locked missions cannot be selected or cleared by an out of sequence result',()=>{
  const progress=normalizeCampaign(null);assert.equal(planMissionSelection(progress,MISSIONS[1].id),null);assert.equal(planMissionCompletion(progress,victory(MISSIONS[1])),null);
  assert.equal(planMissionSelection(progress,'unknown'),null);assert.equal(missionAccess(progress,'unknown'),null);
  for(const result of [{...victory(MISSIONS[0]),won:false},{...victory(MISSIONS[0]),midBossDefeated:false},{...victory(MISSIONS[0]),time:NaN},{...victory(MISSIONS[0]),time:-1}])assert.equal(planMissionCompletion(progress,result),null);
});

test('twelve successive victories unlock only the next map and record both mission bosses',()=>{
  let progress=normalizeCampaign(null);
  for(const mission of MISSIONS){const before=JSON.stringify(progress);Object.freeze(progress);
    const next=planMissionCompletion(progress,victory(mission,100+mission.index));assert.equal(JSON.stringify(progress),before);progress=next;
    assert.equal(progress.cleared.length,mission.index+1);assert.equal(progress.bestTimes[mission.id],100+mission.index);
    for(const key of [mission.midBoss,mission.finalBoss]){assert.ok(progress.bossSeen.includes(key));assert.ok(progress.bossDefeated.includes(key));}
    assert.equal(progress.selectedMission,MISSIONS[Math.min(11,mission.index+1)].id);
    if(mission.index<10)assert.equal(missionAccess(progress,MISSIONS[mission.index+2].id).unlocked,false);
  }
  assert.equal(progress.bossDefeated.length,24);
});

test('encounter records are idempotent and completion improves best time without duplicate mission clears',()=>{
  const key=MISSIONS[0].midBoss,first=planBossRecord(null,key),second=planBossRecord(first,key,true);assert.equal(first.bossDefeated.length,0);assert.equal(second.bossSeen.length,1);assert.equal(second.bossDefeated.length,1);assert.deepEqual(planBossRecord(second,key,true),second);assert.equal(planBossRecord(second,'unknown'),null);
  const won=planMissionCompletion(second,victory(MISSIONS[0],120)),slower=planMissionCompletion(won,victory(MISSIONS[0],130)),faster=planMissionCompletion(slower,victory(MISSIONS[0],90));
  assert.equal(slower.bestTimes[MISSIONS[0].id],120);assert.equal(faster.bestTimes[MISSIONS[0].id],90);assert.equal(faster.cleared.length,1);
});

test('campaign and old training/settings persist in one profile and a completed run cannot award twice',()=>{
  const storage=store(),profile=loadProfile(storage);profile.training.armor=2;profile.options.fireMode='manual';
  const result=victory(MISSIONS[0]);recordRun(profile,result,'campaign-run-1');assert.equal(profile.parts,15);assert.equal(profile.campaign.cleared.length,1);assert.equal(profile.unlocked.includes('nailgun'),true);
  const before=JSON.stringify(profile);recordRun(profile,result,'campaign-run-1');assert.equal(JSON.stringify(profile),before);
  assert.equal(saveProfile(profile,storage),true);assert.deepEqual(loadProfile(storage),profile);
});
