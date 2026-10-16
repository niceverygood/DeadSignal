import test from 'node:test';
import assert from 'node:assert/strict';
import {MISSIONS,BOSS_CATALOG,getMission,getBoss,missionScaling} from '../dist/campaign.js';

const FAMILIES=['charge','slam','summon','spit','shield','leap','beam','fire','mine','pull','spread','storm'];
const color=value=>/^#[0-9a-f]{6}$/i.test(value);
function deeplyFrozen(value){
  if(value&&typeof value==='object'){
    assert.equal(Object.isFrozen(value),true);
    for(const child of Object.values(value))deeplyFrozen(child);
  }
}

test('campaign has twelve ordered, individually themed missions and an unbroken unlock chain',()=>{
  assert.equal(MISSIONS.length,12);deeplyFrozen(MISSIONS);
  assert.equal(new Set(MISSIONS.map(m=>m.id)).size,12);
  assert.equal(new Set(MISSIONS.map(m=>m.theme)).size,12);
  assert.equal(new Set(MISSIONS.map(m=>JSON.stringify(m.mapPalette))).size,12);
  for(const [index,mission]of MISSIONS.entries()){
    assert.equal(mission.id,`mission-${String(index+1).padStart(2,'0')}`);
    assert.equal(mission.index,index);assert.equal(mission.parSeconds,120);
    assert.equal(mission.unlockAfter,index?MISSIONS[index-1].id:null);
    assert.equal(getMission(index),mission);assert.equal(getMission(mission.id),mission);
    assert.ok(mission.title&&mission.subtitle&&color(mission.accent));
    for(const key of ['asphalt','road','curb','wall','roof','fog','accent'])assert.ok(color(mission.mapPalette[key]));
    assert.equal(mission.mapPalette.accent,mission.accent);
    assert.ok(mission.enemyPool.length>1);
    const types=new Set();for(const entry of mission.enemyPool){
      assert.ok(['walker','runner','shield','screamer','gas'].includes(entry.type));
      assert.ok(entry.weight>0&&Number.isFinite(entry.weight));
      assert.equal(types.has(entry.type),false);types.add(entry.type);
    }
    assert.equal(getBoss(mission.midBoss)?.role,'mid');
    assert.equal(getBoss(mission.finalBoss)?.role,'final');
  }
});

test('twenty-four bosses have distinct identities, occupational silhouettes and readable counterplay',()=>{
  assert.equal(BOSS_CATALOG.length,24);deeplyFrozen(BOSS_CATALOG);
  for(const key of ['id','name','skillName'])assert.equal(new Set(BOSS_CATALOG.map(b=>b[key])).size,24,key);
  assert.equal(new Set(BOSS_CATALOG.map(b=>b.appearance.silhouette)).size,24);
  assert.deepEqual([...new Set(BOSS_CATALOG.map(b=>b.family))],FAMILIES);
  for(const boss of BOSS_CATALOG){
    const mission=getMission(boss.missionId);assert.ok(mission);
    assert.equal(mission[boss.role==='mid'?'midBoss':'finalBoss'],boss.id);
    assert.equal(getBoss(boss.id),boss);assert.equal(boss.family,boss.skill.kind);
    for(const key of ['name','title','skillName','skillDescription','counter'])assert.ok(/[가-힣]/.test(boss[key]),`${boss.id}.${key}`);
    for(const key of ['silhouette','head','prop','back','description'])assert.ok(boss.appearance[key]);
    assert.ok([2,4,6].includes(boss.appearance.arms));assert.ok([2,4].includes(boss.appearance.legs));
    for(const value of Object.values(boss.palette))assert.ok(color(value));
    for(const value of Object.values(boss.stats))assert.ok(Number.isFinite(value)&&value>0);
    assert.ok(boss.stats.r>=24&&boss.stats.r<=49);
    for(const key of ['cooldown','windup','recovery'])assert.ok(boss.skill[key]>0);
    for(const value of Object.values(boss.skill))if(typeof value==='number')assert.ok(Number.isFinite(value)&&value>0);
  }
  for(const mission of MISSIONS){
    const mid=getBoss(mission.midBoss),final=getBoss(mission.finalBoss);
    assert.ok(final.stats.hp>mid.stats.hp);assert.ok(final.stats.damage>mid.stats.damage);
    assert.notDeepEqual(mid.appearance,final.appearance);assert.notDeepEqual(mid.skill,final.skill);
  }
});

test('all four mission factors and scaled boss hp/contact damage strictly increase',()=>{
  let previous=null;const statsByRole={mid:null,final:null};
  for(const mission of MISSIONS){
    const scale=missionScaling(mission.index);
    assert.deepEqual(Object.keys(scale),['hp','damage','spawn','speed']);
    for(const [key,value]of Object.entries(scale)){
      assert.ok(Number.isFinite(value)&&value>=1);
      if(previous)assert.ok(value>previous[key],`${mission.id} ${key}`);
    }
    for(const role of ['mid','final']){
      const boss=getBoss(mission[role==='mid'?'midBoss':'finalBoss']);
      const actual={hp:Math.ceil(boss.stats.hp*scale.hp),damage:Math.ceil(boss.stats.damage*scale.damage)};
      if(statsByRole[role])for(const key of ['hp','damage'])assert.ok(actual[key]>statsByRole[role][key],`${mission.id} ${role} ${key}`);
      statsByRole[role]=actual;
    }
    previous=scale;
  }
  assert.ok(previous.speed<=1.55);
});

test('catalog lookups reject unknown keys and scaling is pure with bounded invalid input',()=>{
  for(const value of [null,undefined,{},[],true,NaN,Infinity,-1,12,1.5,'mission-13','__proto__'])assert.equal(getMission(value),null);
  for(const value of [null,undefined,{},[],true,0,'boss-13-mid','__proto__'])assert.equal(getBoss(value),null);
  assert.deepEqual(missionScaling(-100),missionScaling(0));assert.deepEqual(missionScaling(NaN),missionScaling(0));
  assert.deepEqual(missionScaling(1.9),missionScaling(1));assert.deepEqual(missionScaling(100),missionScaling(11));
  const first=missionScaling(4);first.hp=0;assert.ok(missionScaling(4).hp>1);
  assert.throws(()=>{MISSIONS[0].enemyPool[0].weight=0;},TypeError);
  assert.throws(()=>{BOSS_CATALOG[0].appearance.head='changed';},TypeError);
});
