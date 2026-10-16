import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProfile,saveProfile,claimTestChips,buyEquipment,equipItem,PROFILE_KEY} from '../dist/storage.js';
import {TEST_CHIPS,equipmentStats} from '../dist/equipment.js';
import {Game} from '../dist/engine.js';

function memory(){let writes=0;const map=new Map();return {getItem:key=>map.get(key)??null,setItem(key,value){writes++;map.set(key,value);},get writes(){return writes;}};}

test('legacy progression gains an empty equipment inventory and retains its operation and preferences',()=>{
  const storage=memory();storage.setItem(PROFILE_KEY,JSON.stringify({parts:76,totalKills:118,training:{armor:2,magazine:1},options:{fireMode:'manual'},campaign:{cleared:['mission-01']}}));
  const profile=loadProfile(storage);assert.equal(profile.parts,76);assert.equal(profile.totalKills,118);assert.equal(profile.options.fireMode,'manual');assert.equal(profile.training.armor,2);assert.equal(profile.campaign.cleared.length,1);assert.equal(profile.equipment.chips,0);assert.deepEqual(profile.equipment.items,{});
});

test('one test grant and each fixed item upgrade persist as a single write and the grant cannot repeat after reload',()=>{
  const storage=memory(),profile=loadProfile(storage);profile.parts=80;profile.options.fireMode='manual';
  assert.equal(claimTestChips(profile,storage),true);assert.equal(storage.writes,1);assert.equal(profile.equipment.chips,TEST_CHIPS);
  assert.equal(buyEquipment(profile,'blackout-rounds',storage),true);assert.equal(storage.writes,2);assert.equal(profile.equipment.chips,TEST_CHIPS-200);assert.equal(profile.equipment.items['blackout-rounds'],1);assert.equal(equipmentStats(profile.equipment).damage,1.45);
  const loaded=loadProfile(storage);assert.deepEqual(loaded,profile);assert.equal(claimTestChips(loaded,storage),false);assert.equal(storage.writes,2);assert.equal(loaded.parts,80);assert.equal(loaded.options.fireMode,'manual');
});

test('failed grant, purchase or equipment writes keep both profile and the persisted wallet unchanged',()=>{
  const storage=memory(),profile=loadProfile(storage);assert.equal(claimTestChips(profile,storage),true);assert.equal(buyEquipment(profile,'blackout-rounds',storage),true);assert.equal(buyEquipment(profile,'storm-magazine',storage),true);
  const persisted=storage.getItem(PROFILE_KEY),before=JSON.stringify(profile),failure={getItem:key=>storage.getItem(key),setItem(){throw new Error('quota');}};
  assert.equal(buyEquipment(profile,'blackout-rounds',failure),false);assert.equal(equipItem(profile,'weapon','storm-magazine',failure),false);assert.equal(JSON.stringify(profile),before);assert.equal(storage.getItem(PROFILE_KEY),persisted);
  const fresh=loadProfile();const freshBefore=JSON.stringify(fresh);assert.equal(claimTestChips(fresh,failure),false);assert.equal(JSON.stringify(fresh),freshBefore);
});

test('gear selection preserves an already saved mission byte for byte and survives profile reload',()=>{
  const storage=memory(),profile=loadProfile(storage),game=new Game({seed:1839,missionId:'mission-01'});profile.activeRun={version:1,id:'existing-campaign',savedAt:1,selection:{route:'hospital'},game:game.snapshot()};assert.ok(profile.activeRun.game);
  const checkpoint=JSON.stringify(profile.activeRun.game);assert.equal(claimTestChips(profile,storage),true);assert.equal(buyEquipment(profile,'quarantine-armor',storage),true);assert.equal(equipItem(profile,'armor',null,storage),true);assert.equal(JSON.stringify(profile.activeRun.game),checkpoint);
  assert.equal(equipmentStats(profile.equipment).hpBonus,0);assert.equal(equipItem(profile,'armor','quarantine-armor',storage),true);assert.equal(equipmentStats(profile.equipment).hpBonus,45);const restored=loadProfile(storage);assert.deepEqual(restored,profile);assert.equal(JSON.stringify(restored.activeRun.game),checkpoint);assert.equal(Game.restore(restored.activeRun.game).player.maxHp,100);
});

test('insufficient funds, rank caps and invalid cross-slot selections never write or change inventory',()=>{
  const storage=memory(),profile=loadProfile(storage);assert.equal(buyEquipment(profile,'survival-core',storage),false);assert.equal(equipItem(profile,'armor','survival-core',storage),false);assert.equal(storage.writes,0);
  assert.equal(claimTestChips(profile,storage),true);for(let i=0;i<5;i++)assert.equal(buyEquipment(profile,'survival-core',storage),true);
  const before=JSON.stringify(profile),writes=storage.writes;assert.equal(buyEquipment(profile,'survival-core',storage),false);assert.equal(buyEquipment(profile,'unknown',storage),false);assert.equal(equipItem(profile,'weapon','survival-core',storage),false);assert.equal(JSON.stringify(profile),before);assert.equal(storage.writes,writes);assert.equal(saveProfile(profile,storage),true);
});
