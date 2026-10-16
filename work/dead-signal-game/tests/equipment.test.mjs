import test from 'node:test';
import assert from 'node:assert/strict';
import {EQUIPMENT,TEST_CHIPS,normalizeEquipment,planTestChips,planEquipmentPurchase,planEquipmentSelection,equipmentOffer,equipmentStats,validEquipmentStats} from '../dist/equipment.js';

test('unowned or malformed gear grants no combat effects and cannot cross equipment slots',()=>{
  const zero=equipmentStats(null),invalid=normalizeEquipment({chips:Infinity,items:{'blackout-rounds':6,'quarantine-armor':1},equipped:{weapon:'quarantine-armor',armor:'blackout-rounds',utility:'unknown'}});
  assert.deepEqual(invalid.equipped,{weapon:null,armor:null,utility:null});assert.equal(invalid.chips,0);assert.deepEqual(equipmentStats(invalid),zero);
  assert.equal(planEquipmentSelection(invalid,'weapon','quarantine-armor'),null);assert.equal(planEquipmentSelection(null,'weapon','blackout-rounds'),null);assert.equal(planEquipmentSelection(null,'unknown',null),null);
});

test('the explicitly marked test grant is available once and never grows beyond the wallet bound',()=>{
  const initial=normalizeEquipment(null);Object.freeze(initial);const next=planTestChips(initial);assert.equal(next.chips,TEST_CHIPS);assert.equal(next.testChipsClaimed,true);assert.equal(initial.chips,0);assert.equal(planTestChips(next),null);
  assert.equal(planTestChips({chips:999999999}).chips,1000000000);
});

test('fixed equipment costs debit once per rank, preserve unrelated items, and stop at the disclosed cap',()=>{
  let premium=planTestChips(null),spent=0;
  for(const item of EQUIPMENT.slice(0,2))for(let level=1;level<=5;level++){
    const before=JSON.stringify(premium),cost=item.costs[level-1];Object.freeze(premium);const next=planEquipmentPurchase(premium,item.id);assert.equal(JSON.stringify(premium),before);assert.ok(next);spent+=cost;assert.equal(next.chips,TEST_CHIPS-spent);assert.equal(next.items[item.id],level);premium=next;
  }
  assert.equal(premium.items['blackout-rounds'],5);assert.equal(premium.items['storm-magazine'],5);assert.equal(premium.equipped.weapon,'blackout-rounds');assert.equal(planEquipmentPurchase(premium,'blackout-rounds'),null);assert.equal(planEquipmentPurchase(premium,'unknown'),null);assert.equal(planEquipmentPurchase(null,'blackout-rounds'),null);
});

test('each slot applies only its equipped item, a rank increase takes effect once, and unequipping restores defaults',()=>{
  let premium=planTestChips(null);premium=planEquipmentPurchase(premium,'blackout-rounds');premium=planEquipmentPurchase(premium,'storm-magazine');premium=planEquipmentPurchase(premium,'quarantine-armor');premium=planEquipmentPurchase(premium,'survival-core');
  const first=equipmentStats(premium);assert.equal(first.damage,1.45);assert.equal(first.fireRate,1);assert.equal(first.hpBonus,45);assert.equal(first.revives,1);
  premium=planEquipmentSelection(premium,'weapon','storm-magazine');const switched=equipmentStats(premium);assert.equal(switched.damage,1);assert.equal(switched.fireRate,1.16);assert.deepEqual(switched.ammoBonus,{shotgun:2,nailgun:6});
  const before=JSON.stringify(premium);Object.freeze(premium);const upgraded=planEquipmentPurchase(premium,'storm-magazine');assert.equal(equipmentStats(upgraded).fireRate,1.32);assert.equal(JSON.stringify(premium),before);
  for(const slot of ['weapon','armor','utility'])premium=planEquipmentSelection(premium,slot,null);assert.deepEqual(equipmentStats(premium),equipmentStats(null));
});

test('all 30 equipment ranks stay finite and bounded while each stronger rank improves its stated benefit',()=>{
  for(const item of EQUIPMENT){let previous=null;
    for(let level=1;level<=5;level++){const premium={chips:0,items:{[item.id]:level},equipped:{[item.slot]:item.id}},stats=equipmentStats(premium);for(const value of Object.values(stats)){if(typeof value==='number')assert.ok(Number.isFinite(value));}
      assert.ok(stats.mitigation>=0&&stats.mitigation<=.45);assert.ok(stats.revives<=3);assert.ok(stats.hpBonus<=225);assert.ok(stats.ammoBonus.nailgun<=30);
      if(previous){const key={'blackout-rounds':'damage','storm-magazine':'fireRate','quarantine-armor':'hpBonus','barrier-field':'mitigation','magnetic-recovery':'xp'}[item.id];if(key)assert.ok(stats[key]>previous[key]);else {assert.ok(stats.revives>=previous.revives);assert.ok(stats.reviveHeal>previous.reviveHeal);}}
      previous=stats;
    }
  }
  const max=equipmentOffer({chips:TEST_CHIPS,items:{'survival-core':5}},'survival-core');assert.equal(max.maxed,true);assert.equal(max.canBuy,false);assert.equal(max.cost,0);
});

test('all 1331 legitimate equipped rank combinations remain valid across JSON save and restore',()=>{
  const choices=slot=>[null,...EQUIPMENT.filter(item=>item.slot===slot).flatMap(item=>Array.from({length:5},(_,i)=>({id:item.id,rank:i+1})))];let count=0;
  for(const weapon of choices('weapon'))for(const armor of choices('armor'))for(const utility of choices('utility')){
    const raw={items:{},equipped:{}};for(const [slot,item]of Object.entries({weapon,armor,utility}))if(item){raw.items[item.id]=item.rank;raw.equipped[slot]=item.id;}
    const stats=equipmentStats(raw),saved=JSON.parse(JSON.stringify(stats));Object.freeze(saved);assert.equal(validEquipmentStats(saved),true);assert.deepEqual(saved,stats);count++;
  }
  assert.equal(count,1331);
});

test('checkpoint gear rejects invented multipliers, simultaneous alternatives, missing and hidden numeric fields',()=>{
  const neutral=equipmentStats(null),weapon=equipmentStats({items:{'blackout-rounds':5},equipped:{weapon:'blackout-rounds'}}),speed=equipmentStats({items:{'storm-magazine':5},equipped:{weapon:'storm-magazine'}});
  for(const raw of [null,{},[],{...neutral,damage:Infinity},{...neutral,hpBonus:NaN},{...neutral,revives:5},{...neutral,damage:1.5},{...neutral,extra:1},{...neutral,ammoBonus:{shotgun:0}},{...neutral,ammoBonus:{shotgun:0,nailgun:0,bonus:1}},{...weapon,fireRate:speed.fireRate,ammoBonus:speed.ammoBonus},{...neutral,revives:1,reviveHeal:.99},{...neutral,mitigation:.45}])assert.equal(validEquipmentStats(raw),false);
  const before=JSON.stringify(weapon);Object.freeze(weapon);assert.equal(validEquipmentStats(weapon),true);assert.equal(JSON.stringify(weapon),before);
});
