import {HAIFA_TRANSFER_EXPEDITION,createHaifaTransferWorld} from './haifa-transfer-expedition.js';
import {crossedReloadStages} from './reload-stages.js';
import {BULLET_BOUNDS_MARGIN,boundedBulletSegment,bulletCircleMayOverlap,bulletRectMayOverlap,segmentRectNoAlloc} from './bullet-broadphase.js';
import {PATIENT_RECORD_EXPEDITION,createPatientRecordWorld} from './patient-record-expedition.js';
import {HARBOR_POWER_EXPEDITION,createHarborPowerWorld} from './harbor-power-expedition.js';
import {COLD_CHAIN_EXPEDITION,createColdChainWorld} from './cold-chain-expedition.js';
import {FINALE_EXPEDITION_ID,createFinaleWorld} from './finale-world.js';
import {ISRAEL_EXPEDITION_ID,createIsraelWorld} from './israel-world.js';
import {recordDamageContact} from './damage-feedback.js';
import {SEA_EXPEDITION_ID,SEA_WATER,createSeaWorld,validSeaWater,inWater} from './sea-world.js';
import {NORTH_EXPEDITION_ID,createNorthWorld} from './north-world.js';
import {HOSPITAL_EXPEDITION_ID,createHospitalWorld} from './hospital-world.js';
import {ROOF_EXPEDITION_ID,ROOF_SURFACE,createRooftopWorld,roofSupports,validRoofSurface} from './rooftop-world.js';
// Pure, deterministic game simulation. The renderer and interface consume its state.
import {CITY_EXPEDITION,getExpedition,newExpedition,expeditionHasTransport,expeditionTransport,validExpeditionState,updateExpedition} from './expedition.js';
import {createCity} from './world.js?v=0.29.0';
import {Navigation} from './navigation.js';
import {acquireEnemyGrid,recordFreshEnemyGrid} from './enemy-separation-grid.js';
import {attachTransportNavigation,recoverTransportOverlap} from './escort.js';
import {trainingStats} from './training.js?v=0.29.0';
import {getMission,getBoss,missionScaling} from './campaign.js?v=0.29.0';
import {updateCampaignBoss,updateBossEffects,clearBossEffects,MAX_BOSS_HAZARDS,MAX_HOSTILE_PROJECTILES} from './boss-combat.js?v=0.29.0';
import {bossDamageMultiplier} from './boss-patterns.js?v=0.29.0';
import {equipmentStats as deriveEquipmentStats,validEquipmentStats} from './equipment.js';
import {PLAYER_DASH_SPEED,stepPlayerMovement} from './player-movement.js?v=0.29.0';
import {WEAPONS,UPGRADES,validUpgradeRank,getUpgradeRank,getUpgradeValue,getBulletDamage,getPelletCount,getFireInterval,getReloadDuration,getShockTargets,getShockDamageMultiplier,getVolatileDamage,getHealthGrowth,getHealthRecovery,getStoredMoveSpeed,getDashCooldown,getMagnetRange} from './upgrade-model.js';
export {WEAPONS,UPGRADES};
export const DISTRICTS = ['주택가', '상업지구', '탈출역'];
const TYPES = {
  walker: { hp: 42, speed: 65, r: 14, damage: 9, xp: 4 },
  runner: { hp: 30, speed: 131, r: 12, damage: 8, xp: 5 },
  shield: { hp: 115, speed: 51, r: 19, damage: 14, xp: 9 },
  screamer: { hp: 67, speed: 55, r: 15, damage: 8, xp: 8 },
  gas: { hp: 58, speed: 50, r: 18, damage: 10, xp: 8 },
  elite: { hp: 330, speed: 68, r: 27, damage: 19, xp: 25 },
  collector: { hp: 2400, speed: 57, r: 49, damage: 27, xp: 100 }
};
export const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
export const distance = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function rng(seed){let n=seed>>>0;const next=()=>{n=(n+0x6D2B79F5)>>>0;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};next.getState=()=>n;next.setState=value=>{if(!Number.isInteger(value)||value<0||value>0xFFFFFFFF)return false;n=value;return true;};return next;}
export function circleRect(x,y,r,o){if(r<=0||x+r<=o.x||x-r>=o.x+o.w||y+r<=o.y||y-r>=o.y+o.h)return false;const dx=x-clamp(x,o.x,o.x+o.w),dy=y-clamp(y,o.y,o.y+o.h);return dx*dx+dy*dy<r*r;}
function segmentCircle(x1,y1,x2,y2,x,y,r){const dx=x2-x1,dy=y2-y1,fx=x1-x,fy=y1-y,a=dx*dx+dy*dy,c=fx*fx+fy*fy-r*r;if(c<=0)return 0;if(a===0)return null;const b=2*(fx*dx+fy*dy),disc=b*b-4*a*c;if(disc<0)return null;const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;}
function segmentRect(x1,y1,x2,y2,o,pad=3){let lo=0,hi=1;for(const [start,delta,min,max]of [[x1,x2-x1,o.x-pad,o.x+o.w+pad],[y1,y2-y1,o.y-pad,o.y+o.h+pad]]){if(Math.abs(delta)<1e-9){if(start<min||start>max)return null;}else{let a=(min-start)/delta,b=(max-start)/delta;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;}}return lo;}

import {createMolotov,advanceMolotov,validMolotov,beginMolotovFall,advanceMolotovFall} from './molotov.js';
const CHECKPOINT_STATES=new Set(['playing','paused','upgrade','supply','route','event']);
const CHECKPOINT_LIMIT=600000;
const RUN_FIELDS=['seed','mode','stageDuration','route','stage','time','stageTime','id','kills','parts','combo','comboTime','noise','pendingLevels','stageBossSpawned','stageCleared','eventSeen','shopBought','healBought','spawnClock'];
const PLAYER_FIELDS=['x','y','r','angle','hp','maxHp','weapon','ammo','maxAmmo','reloadTime','fireTime','dashTime','dashCd','dashX','dashY','invul','lureCd','molotovCd','level','xp','xpNext','speed','walkPhase','recoil'];
const ENEMY_FIELDS=['id','x','y','r','type','hp','maxHp','speed','damage','xp','angle','stun','vx','vy','burn','burnTick','hitFlash','walkPhase','attackCd','skillCd','attackState','attackTime','targetX','targetY'];
const BULLET_FIELDS=['id','x','y','px','py','vx','vy','life','damage','pierce','color','weapon'];
const pick=(source,fields)=>Object.fromEntries(fields.map(key=>[key,source[key]]));
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const number=(value,min=-1e12,max=1e12)=>Number.isFinite(value)&&value>=min&&value<=max;
const integer=(value,min=0,max=1e12)=>Number.isInteger(value)&&number(value,min,max);
const bool=value=>typeof value==='boolean';
const freezeEquipmentStats=stats=>Object.freeze({...stats,ammoBonus:Object.freeze({...stats.ammoBonus})});
const list=(value,max)=>Array.isArray(value)&&value.length<=max;
function jsonSafe(value,depth=0,seen=new WeakSet()){
  if(depth>8)return false;if(value===null||bool(value))return true;
  if(typeof value==='number')return Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER;if(typeof value==='string')return value.length<=256;
  if(!value||typeof value!=='object'||seen.has(value))return false;seen.add(value);
  if(Array.isArray(value))return value.length<=1024&&value.every(item=>jsonSafe(item,depth+1,seen));
  if(!plain(value))return false;const keys=Object.keys(value);return keys.length<=80&&keys.every(key=>key.length<=80&&key!=='__proto__'&&key!=='constructor'&&key!=='prototype'&&jsonSafe(value[key],depth+1,seen));
}
function checkpointTextFits(text){return text.length<=CHECKPOINT_LIMIT&&new TextEncoder().encode(text).length<=CHECKPOINT_LIMIT;}
function validCheckpoint(data){
  if(data?.expedition!==undefined&&(!validExpeditionState(data.expedition)||data.version!==1||data.stage!==0||data.stageCleared||data.stageBossSpawned||data.world?.expeditionId!==data.expedition.id||!['playing','paused','upgrade'].includes(data.state)))return false;
  if(data?.throwables!==undefined&&(!Array.isArray(data.throwables)||data.throwables.length>8||!data.throwables.every(validMolotov)))return false;
  if(!plain(data)||!jsonSafe(data)||![1,2].includes(data.version)||!CHECKPOINT_STATES.has(data.state))return false;
  const mission=data.version===2?getMission(data.missionId):null;
  if(data.version===2&&!mission||data.version===1&&data.missionId!==undefined)return false;
  if(mission){
    if(data.missionIndex!==mission.index||data.stage!==0||!['playing','paused','upgrade'].includes(data.state)||data.stageBossSpawned||data.stageCleared)return false;
    for(const key of ['midBossSpawned','midBossDefeated','finalBossSpawned'])if(!bool(data[key]))return false;
    if(data.midBossDefeated&&!data.midBossSpawned||data.finalBossSpawned&&!data.midBossDefeated)return false;
    if(!list(data.defeatedBossIds,2)||JSON.stringify(data.defeatedBossIds)!==JSON.stringify(data.midBossDefeated?[mission.midBoss]:[]))return false;
    if(!list(data.hostileProjectiles,MAX_HOSTILE_PROJECTILES)||!list(data.bossHazards,MAX_BOSS_HAZARDS))return false;
    const hasEquipment=Object.hasOwn(data,'equipmentStats');
    if(hasEquipment!==Object.hasOwn(data,'remainingRevives'))return false;
    if(hasEquipment&&(!validEquipmentStats(data.equipmentStats)||!integer(data.remainingRevives,0,data.equipmentStats.revives)))return false;
  }
  if(!integer(data.seed,0,0xFFFFFFFF)||!integer(data.randomState,0,0xFFFFFFFF)||!integer(data.visualRandomState,0,0xFFFFFFFF)||!['quick','standard'].includes(data.mode)||!['hospital','police'].includes(data.route)||!integer(data.stage,0,2))return false;
  if(!number(data.stageDuration,.001,1e9)||!number(data.time,0,1e9)||!number(data.stageTime,0,data.time)||!integer(data.id,1))return false;
  for(const key of ['kills','parts','combo','pendingLevels'])if(key==='pendingLevels'?(!Number.isSafeInteger(data[key])||data[key]<0):!integer(data[key],0,1e12))return false;
  if(!number(data.comboTime,-1,4)||!number(data.noise,0,100)||!number(data.spawnClock,-1,1e9))return false;
  for(const key of ['stageBossSpawned','stageCleared','eventSeen','shopBought','healBought','returnToSupply'])if(!bool(data[key]))return false;
  const world=data.world,ids=new Set();
  if((data.throwables||[]).some(item=>item.fallElapsed!==undefined&&(!world?.rooftop||item.fallDepth!==world.rooftop.elevation||roofSupports(world,item.targetX,item.targetY,0))))return false;
  if(world?.expeditionId!==undefined&&world.expeditionId!==data.expedition?.id)return false;
  const identifier=id=>{if(!integer(id,1,data.id)||ids.has(id))return false;ids.add(id);return true;};
  const position=(entity,margin=0)=>plain(entity)&&number(entity.x,-margin,2400+margin)&&number(entity.y,-margin,1800+margin);
  if(!plain(world)||world.width!==2400||world.height!==1800||world.theme!==(mission?mission.theme:getExpedition(data.expedition?.id)?.theme??['residential','commercial','station'][data.stage])||!integer(world.seed,0,0xFFFFFFFF+(mission?11:2))||!list(world.obstacles,128)||!list(world.decor,256)||!list(world.roads,32)||!position(world.exit)||!bool(world.exit.open)||!position(world.spawn))return false;
  if([SEA_EXPEDITION_ID,HARBOR_POWER_EXPEDITION.id].includes(data.expedition?.id)?!validSeaWater(world.water):world.water!==undefined)return false;
  if(data.expedition?.id===ROOF_EXPEDITION_ID?!validRoofSurface(world.rooftop):world.rooftop!==undefined)return false;
  if(mission&&(world.missionId!==mission.id||world.missionIndex!==mission.index))return false;
  for(const o of world.obstacles){
    if(!position(o)||!identifier(o.id)||!['building','car','barrel','fence'].includes(o.kind)||!number(o.w,1,2400)||!number(o.h,1,1800)||o.x+o.w>2400||o.y+o.h>1800||!bool(o.destroyed))return false;
    for(const key of ['hp','maxHp'])if(o[key]==='Infinity'){if(!['building','fence'].includes(o.kind))return false;}else if(!number(o[key],key==='maxHp'?1:-1e12,1e12))return false;
  }
  for(const d of world.decor)if(!position(d)||!['rubble','lamp','hydrant','trash','sign'].includes(d.kind))return false;
  for(const road of world.roads)if(!position(road)||!number(road.w,1,2400)||!number(road.h,1,1800)||!['x','y'].includes(road.axis))return false;
  const p=data.player;
  if(!position(p)||!Object.hasOwn(WEAPONS,p.weapon)||p.r!==14||!integer(p.ammo,0,120)||!integer(p.maxAmmo,1,120)||p.ammo>p.maxAmmo||!number(p.maxHp,1,20000)||!number(p.hp,Number.MIN_VALUE,p.maxHp)||(!Number.isSafeInteger(p.level)||p.level<1)||!number(p.xp,0,1e12)||!integer(p.xpNext,1)||p.xp>=p.xpNext||!number(p.speed,1,2000))return false;
  for(const key of ['angle','dashX','dashY','walkPhase'])if(!number(p[key]))return false;
  for(const key of ['reloadTime','fireTime','dashTime','dashCd','invul','lureCd','molotovCd','recoil'])if(!number(p[key],0,10000))return false;
  if(world.water?.some(w=>circleRect(p.x,p.y,p.r,w)))return false;
  if(p.x<p.r+35||p.y<p.r+35||p.x>2400-p.r-35||p.y>1800-p.r-35||world.obstacles.some(o=>!o.destroyed&&circleRect(p.x,p.y,p.r,o))||world.rooftop&&!roofSupports(world,p.x,p.y,p.r))return false;
  if(!plain(data.upgrades)||Object.keys(data.upgrades).some(id=>!UPGRADES.some(u=>u.id===id&&validUpgradeRank(data.upgrades[id]))))return false;
  if(!list(data.choices,3)||new Set(data.choices).size!==data.choices.length||data.choices.some(id=>!UPGRADES.some(u=>u.id===id)))return false;
  if(data.state==='upgrade'?(data.choices.length===0||data.pendingLevels===0):data.choices.length!==0)return false;
  if(!list(data.enemies,210)||!list(data.bullets,300)||!list(data.pickups,1024)||!list(data.corpses,70)||!list(data.fires,32))return false;
  let collector=null,combatBoss=null;
  for(const e of data.enemies){
    if(world.rooftop&&!roofSupports(world,e.x,e.y,e.r))return false;
    if(world.water?.some(w=>circleRect(e.x,e.y,e.r,w)))return false;
    if(!position(e)||!identifier(e.id)||!Object.hasOwn(TYPES,e.type)||e.r!==(e.bossKey?getBoss(e.bossKey)?.stats.r:TYPES[e.type].r)||!number(e.maxHp,1)||!number(e.hp,Number.MIN_VALUE,e.maxHp)||!number(e.speed,0,1000)||!number(e.damage,0,10000)||!number(e.xp,0,10000)||!bool(e.gatekeeper))return false;
    for(const key of ['angle','stun','vx','vy','burn','burnTick','hitFlash','walkPhase','attackCd','skillCd','attackTime','targetX','targetY'])if(!number(e[key]))return false;
    if(!['walk','windup','charge','recover'].includes(e.attackState)||(!e.bossKey&&e.type!=='collector'&&e.attackState!=='walk')||(e.gatekeeper&&e.type!=='elite'))return false;
    if(e.bossKey!==undefined||e.bossRole!==undefined){
      const catalog=getBoss(e.bossKey);
      if(!mission||!catalog||combatBoss||catalog.missionId!==mission.id||e.bossRole!==catalog.role||e.bossKey!==mission[e.bossRole==='mid'?'midBoss':'finalBoss']||e.type!==(e.bossRole==='mid'?'elite':'collector')||e.gatekeeper)return false;
      if(!number(e.skillCd,-1,60)||!number(e.attackTime,-.1,10)||!number(e.targetX,0,2400)||!number(e.targetY,0,1800)||!integer(e.skillRepeats,0,2))return false;
      combatBoss=e;
    }else if(mission&&e.type==='collector')return false;
    if(e.summonedBy!==undefined&&(!mission||!integer(e.summonedBy,1,data.id)))return false;
    if(e.type==='collector'){if(collector)return false;collector=e;}
  }
  if(data.expedition?.id===FINALE_EXPEDITION_ID){const needsBoss=data.expedition.step===1&&!data.expedition.bossDefeated;if(needsBoss?!collector:!!collector)return false;if(data.expedition.step===0&&data.expedition.bossDefeated)return false;}
  const currentBoss=mission?combatBoss:collector;
  if(data.bossId!==null&&(!integer(data.bossId,1,data.id)||currentBoss?.id!==data.bossId))return false;
  if(currentBoss&&data.bossId!==currentBoss.id)return false;
  if(mission){
    const expected=data.finalBossSpawned?'final':data.midBossSpawned&&!data.midBossDefeated?'mid':null;
    if(expected?combatBoss?.bossRole!==expected:combatBoss!==null)return false;
    for(const shot of data.hostileProjectiles){
      if(!position(shot,50)||!identifier(shot.id)||shot.ownerId!==combatBoss?.id||shot.kind!==getBoss(combatBoss?.bossKey)?.skill.kind||!['spit','spread'].includes(shot.kind)||!number(shot.r,3,30)||!number(shot.maxLife,.2,5)||!number(shot.life,Number.MIN_VALUE,shot.maxLife)||!number(shot.damage,0,10000)||shot.color!==(shot.kind==='spit'?'#94b86e':'#b5c76c'))return false;
      if(shot.kind==='spit'&&(!number(shot.puddleRadius,20,160)||!number(shot.puddleDuration,.2,8)||!number(shot.puddleDamage,0,10000)))return false;
      for(const key of ['px','py'])if(!number(shot[key],-50,key==='px'?2450:1850))return false;
      for(const key of ['vx','vy'])if(!number(shot[key],-900,900))return false;
    }
    for(const h of data.bossHazards){
      if(!position(h)||!identifier(h.id)||h.ownerId!==combatBoss?.id||h.kind!==getBoss(combatBoss?.bossKey)?.skill.kind||!['line','circle'].includes(h.shape)||!['warning','active'].includes(h.phase)||!number(h.damage,0,10000)||!['#e6865d','#94b86e','#d6a04d','#d89c68','#9abbd4','#d9a06f','#abcafa','#f0a565','#d5cc87','#c9a5df','#b5c76c','#9dcfea'].includes(h.color))return false;
      if(!number(h.targetX,0,2400)||!number(h.targetY,0,1800)||!number(h.r,1,400)||!number(h.width,1,160)||!number(h.duration,.05,8)||!number(h.time,Number.MIN_VALUE,h.duration))return false;
      for(const [key,min,max] of [['activeDuration',0,8],['innerR',0,h.r],['force',0,400],['tickClock',-.1,2]])if(h[key]!==undefined&&!number(h[key],min,max))return false;
    }
  }
  for(const b of data.bullets){
    if(!position(b,1000)||!identifier(b.id)||!Object.hasOwn(WEAPONS,b.weapon)||b.color!==WEAPONS[b.weapon].color||!number(b.life,Number.MIN_VALUE,WEAPONS[b.weapon].life)||!number(b.damage,0,100000)||!integer(b.pierce,0,7)||!list(b.hits,8)||new Set(b.hits).size!==b.hits.length||b.hits.some(id=>!integer(id,1,data.id)))return false;
    if(!number(b.px,-1000,3400)||!number(b.py,-1000,2800)||!number(b.vx,-2000,2000)||!number(b.vy,-2000,2000))return false;
  }
  for(const a of data.pickups)if(!position(a)||!identifier(a.id)||!['xp','heal'].includes(a.type)||!number(a.value,0,100000))return false;
  for(const c of data.corpses){
    if(!position(c)||!Object.hasOwn(TYPES,c.type)||!number(c.angle)||!number(c.duration,Number.MIN_VALUE,120)||!number(c.time,Number.MIN_VALUE,c.duration)||!integer(c.seed,1,data.id))return false;
    if(c.bossKey!==undefined){
      const catalog=getBoss(c.bossKey);
      if(!mission||!catalog||catalog.missionId!==mission.id||c.type!==(catalog.role==='mid'?'elite':'collector')||!data.defeatedBossIds.includes(c.bossKey))return false;
    }
  }
  for(const f of data.fires)if(!position(f,310)||!number(f.r,1,1000)||!number(f.duration,Number.MIN_VALUE,120)||!number(f.time,Number.MIN_VALUE,f.duration)||!number(f.emberClock,-1,1))return false;
  if(data.lure!==null&&(!position(data.lure)||!number(data.lure.duration,Number.MIN_VALUE,120)||!number(data.lure.time,Number.MIN_VALUE,data.lure.duration)||!number(data.lure.radius,1,2000)))return false;
  const a=data.alarm;if(!plain(a)||!bool(a.active)||!number(a.time,0,30)||!number(a.cooldown,0,10000)||!integer(a.count,0,2)||(a.eliteId!==null&&!integer(a.eliteId,1,data.id)))return false;
  const supplyContext=data.state==='supply'||data.state==='route'||data.returnToSupply;
  if(a.active&&!supplyContext&&!data.enemies.some(e=>e.id===a.eliteId&&e.type==='elite'))return false;
  if(['supply','route'].includes(data.state)&&(!data.stageCleared||!world.exit.open||data.stage===2))return false;
  if(data.state==='route'&&data.stage!==0)return false;
  if(data.state==='event'&&(data.stage!==1||data.route!=='hospital'||!data.eventSeen))return false;
  if(data.stageBossSpawned&&!data.stageCleared&&data.stage<2&&!data.enemies.some(e=>e.gatekeeper))return false;
  if(data.stageBossSpawned&&data.stage===2&&!collector)return false;
  return true;
}

export class Game {
  constructor(options={}){
    this.seed=options.seed??(Date.now()>>>0);this.random=rng(this.seed);this.visualRandom=rng(this.seed^0xB10D);this.mode=options.mode??'quick';
    this.mission=getMission(options.missionId);this.missionId=this.mission?.id??null;this.missionIndex=this.mission?.index??null;this.campaignScale=this.mission?missionScaling(this.missionIndex):null;
    this.equipmentStats=freezeEquipmentStats(deriveEquipmentStats(this.mission?options.equipment:null));this.remainingRevives=this.mission?this.equipmentStats.revives:0;this._equipmentSnapshot=!!this.mission&&options.equipment!==undefined;
    this.expedition=!this.mission&&getExpedition(options.expeditionId)?newExpedition(options.expeditionId):null;
    this.midBossSpawned=false;this.midBossDefeated=false;this.finalBossSpawned=false;this.defeatedBossIds=[];this.hostileProjectiles=[];this.bossHazards=[];
    this.stageDuration=options.stageDuration??(this.mission?(this.mode==='standard'?180:120):(this.mode==='standard'?300:120));
    this.route=options.route??'hospital';this.stage=0;this.time=0;this.stageTime=0;this.state='playing';
    this.id=0;this.kills=0;this.parts=0;this.combo=0;this.comboTime=0;this.noise=0;this.shake=0;this.flash=0;
    this.enemies=[];this.corpses=[];this.bullets=[];this.pickups=[];this.particles=[];this.texts=[];this.links=[];this.fires=[];this.lure=null;this.events=[];
    this.forceBulletNarrowPhase=false;this.bulletBoundsMode='rect';this.bulletCollisionStats=null; // Ephemeral QA controls, excluded from saves.
    this.upgrades={};this.choices=[];this.pendingLevels=0;this.stageBossSpawned=false;this.stageCleared=false;this.eventSeen=false;this.shopBought=false;this.healBought=false;
    this.alarm={active:false,time:0,cooldown:12,count:0,eliteId:null};this.spawnClock=1.5;this.boss=null;this.explosionDepth=0;this.result=null;
    const weapon=Object.hasOwn(WEAPONS,options.weapon)?options.weapon:'shotgun',w=WEAPONS[weapon],training=trainingStats(options.training),maxAmmo=Math.min(120,w.ammo+training.ammoBonus[weapon]+this.equipmentStats.ammoBonus[weapon]),maxHp=Math.min(10000,training.maxHp+this.equipmentStats.hpBonus);
    this.player={x:1200,y:930,r:14,angle:-Math.PI/2,hp:maxHp,maxHp,weapon,ammo:maxAmmo,maxAmmo,reloadTime:0,fireTime:0,dashTime:0,dashCd:0,dashX:0,dashY:-1,invul:1,lureCd:0,molotovCd:0,level:1,xp:0,xpNext:26,speed:214*this.equipmentStats.movement,walkPhase:0,recoil:0};
    this.throwables=[];
    this.world=this.makeWorld();
    if(this.mission||this.expedition){this.player.x=this.world.spawn.x;this.player.y=this.world.spawn.y;}
    for(let i=0;i<5;i++)this.spawnEnemy(this.mission?this.missionEnemyType():'walker',400+i*20);
  }
  snapshot(){
    try{
      if(!CHECKPOINT_STATES.has(this.state)||this.result||this.explosionDepth!==0)return null;
      const data={version:this.mission?2:1,...pick(this,RUN_FIELDS),state:this.state,randomState:this.random.getState(),visualRandomState:this.visualRandom.getState(),returnToSupply:!!this.returnToSupply,
        ...((this.throwables||[]).length?{throwables:this.throwables.map(item=>({...item}))}:{}),player:pick(this.player,PLAYER_FIELDS),upgrades:{...this.upgrades},choices:this.choices.map(u=>u.id),bossId:this.boss?.id??null,
        world:{...this.world,obstacles:this.world.obstacles.map(o=>({...o,hp:o.hp===Infinity?'Infinity':o.hp,maxHp:o.maxHp===Infinity?'Infinity':o.maxHp}))},
        enemies:this.enemies.filter(e=>!e.dead).map(e=>({...pick(e,ENEMY_FIELDS),gatekeeper:!!e.gatekeeper,...(e.bossKey?{bossKey:e.bossKey,bossRole:e.bossRole,skillRepeats:e.skillRepeats}:{}),...(e.summonedBy?{summonedBy:e.summonedBy}:{})})),
        bullets:this.bullets.filter(b=>b.life>0).map(b=>({...pick(b,BULLET_FIELDS),hits:[...b.hits]})),pickups:this.pickups.map(a=>({...a})),corpses:this.corpses.map(c=>({...c})),fires:this.fires.map(f=>({...f})),lure:this.lure?{...this.lure}:null,alarm:{...this.alarm}};
      if(this.expedition)data.expedition={...this.expedition};
      if(this.mission)Object.assign(data,{missionId:this.missionId,missionIndex:this.missionIndex,midBossSpawned:this.midBossSpawned,midBossDefeated:this.midBossDefeated,finalBossSpawned:this.finalBossSpawned,defeatedBossIds:[...this.defeatedBossIds],hostileProjectiles:this.hostileProjectiles.map(item=>({...item})),bossHazards:this.bossHazards.map(item=>({...item}))});
      if(this.mission&&this._equipmentSnapshot)Object.assign(data,{equipmentStats:{...this.equipmentStats,ammoBonus:{...this.equipmentStats.ammoBonus}},remainingRevives:this.remainingRevives});
      if(!validCheckpoint(data))return null;const text=JSON.stringify(data);return checkpointTextFits(text)?JSON.parse(text):null;
    }catch{return null;}
  }
  static restore(raw,options={}){
    try{
      const resumePlaying=options?.resumePlaying===true;
      let data;
      if(typeof raw==='string'){if(!checkpointTextFits(raw))return null;data=JSON.parse(raw);}else{if(!plain(raw)||!jsonSafe(raw))return null;const text=JSON.stringify(raw);if(!checkpointTextFits(text))return null;data=JSON.parse(text);}
      if(!validCheckpoint(data))return null;
      const game=Object.create(Game.prototype);Object.assign(game,pick(data,RUN_FIELDS));game.state=data.state==='playing'&&!resumePlaying?'paused':data.state;
      game.random=rng(data.seed);game.random.setState(data.randomState);game.visualRandom=rng(data.seed^0xB10D);game.visualRandom.setState(data.visualRandomState);
      game.world=data.world;for(const o of game.world.obstacles)for(const key of ['hp','maxHp'])if(o[key]==='Infinity')o[key]=Infinity;
      if(game.world.water)game.world.water=SEA_WATER;if(game.world.rooftop)game.world.rooftop=ROOF_SURFACE;game.navigation=new Navigation(game.world);game.player=data.player;game.upgrades=data.upgrades;game.choices=data.choices.map(id=>UPGRADES.find(u=>u.id===id));game.returnToSupply=data.returnToSupply;
      game.enemies=data.enemies.map(e=>({...e,dead:false}));game.boss=game.enemies.find(e=>e.id===data.bossId)??null;game.bullets=data.bullets.map(b=>({...b,hits:new Set(b.hits)}));
      game.expedition=data.expedition??null;game.throwables=data.throwables??[];game.pickups=data.pickups;game.corpses=data.corpses;game.fires=data.fires;game.lure=data.lure;game.alarm=data.alarm;
      game.mission=data.version===2?getMission(data.missionId):null;game.missionId=game.mission?.id??null;game.missionIndex=game.mission?.index??null;game.campaignScale=game.mission?missionScaling(game.missionIndex):null;
      game.midBossSpawned=data.midBossSpawned??false;game.midBossDefeated=data.midBossDefeated??false;game.finalBossSpawned=data.finalBossSpawned??false;game.defeatedBossIds=data.defeatedBossIds??[];game.hostileProjectiles=data.hostileProjectiles??[];game.bossHazards=data.bossHazards??[];
      game._equipmentSnapshot=!!game.mission&&Object.hasOwn(data,'equipmentStats');game.equipmentStats=freezeEquipmentStats(game._equipmentSnapshot?data.equipmentStats:deriveEquipmentStats(null));game.remainingRevives=game._equipmentSnapshot?data.remainingRevives:0;
      // Preserve normal saved choices exactly. A previously saved choice at
      // numeric precision saturation cannot advance: retain usable choices or
      // choose a canonical fallback without consuming RNG or replaying audio.
      if(game.state==='upgrade'&&game.choices.some(choice=>getUpgradeRank(game.upgrades,choice.id)===Number.MAX_SAFE_INTEGER)){
        game.choices=game.choices.filter(choice=>getUpgradeRank(game.upgrades,choice.id)<Number.MAX_SAFE_INTEGER);
        if(!game.choices.length)game.choices=UPGRADES.filter(choice=>getUpgradeRank(game.upgrades,choice.id)<Number.MAX_SAFE_INTEGER).slice(0,3);
        if(!game.choices.length){game.pendingLevels=0;if(game.returnToSupply&&!game.mission&&!game.expedition&&game.stageCleared&&game.world.exit.open&&game.stage<2){game.returnToSupply=false;game.state='supply';}else game.state=resumePlaying?'playing':'paused';}
      }
      game.particles=[];game.texts=[];game.links=[];game.events=[];game.shake=0;game.flash=0;game.explosionDepth=0;game.result=null;if(expeditionHasTransport(game.expedition?.id)){attachTransportNavigation(game.navigation,game,expeditionTransport);if(!recoverTransportOverlap(game,expeditionTransport))return null;}return game;
    }catch{return null;}
  }
  emit(type,data={}){this.events.push({type,...data});}
  drainEvents(){return this.events.splice(0);}
  makeWorld(){
    const world=this.expedition?.id===HAIFA_TRANSFER_EXPEDITION.id?createHaifaTransferWorld({nextId:()=>++this.id,seed:this.seed}):this.expedition?.id===PATIENT_RECORD_EXPEDITION.id?createPatientRecordWorld({nextId:()=>++this.id,seed:this.seed}):this.expedition?.id===HARBOR_POWER_EXPEDITION.id?createHarborPowerWorld({nextId:()=>++this.id,seed:this.seed}):this.expedition?.id===COLD_CHAIN_EXPEDITION.id?createColdChainWorld({nextId:()=>++this.id,seed:this.seed}):this.expedition?.id===FINALE_EXPEDITION_ID?createFinaleWorld({nextId:()=>++this.id,seed:this.seed}):this.expedition?.id===ISRAEL_EXPEDITION_ID?createIsraelWorld({nextId:()=>++this.id,seed:this.seed}):this.expedition?.id===SEA_EXPEDITION_ID?createSeaWorld({nextId:()=>++this.id,seed:this.seed}):this.expedition?.id===NORTH_EXPEDITION_ID?createNorthWorld({nextId:()=>++this.id,seed:this.seed}):this.expedition?.id===HOSPITAL_EXPEDITION_ID?createHospitalWorld({nextId:()=>++this.id,seed:this.seed}):this.expedition?.id===ROOF_EXPEDITION_ID?createRooftopWorld({nextId:()=>++this.id,seed:this.seed}):createCity({stage:this.stage,route:this.route,random:()=>this.random(),nextId:()=>++this.id,seed:this.seed,missionId:this.missionId});
    if(this.expedition)world.expeditionId=this.expedition.id;
    this.navigation=new Navigation(world);if(expeditionHasTransport(this.expedition?.id))attachTransportNavigation(this.navigation,this,expeditionTransport);return world;
  }
  missionEnemyType(){
    const pool=this.mission.enemyPool,total=pool.reduce((n,item)=>n+item.weight,0);let choice=this.random()*total;
    for(const item of pool){choice-=item.weight;if(choice<0)return item.type;}return pool.at(-1).type;
  }
  spawnMissionBoss(role){
    if(!this.mission||this.state!=='playing'||!['mid','final'].includes(role)||this.boss&&!this.boss.dead||role==='mid'&&this.midBossSpawned||role==='final'&&(!this.midBossDefeated||this.finalBossSpawned))return null;
    const catalog=getBoss(this.mission[role==='mid'?'midBoss':'finalBoss']),e=this.spawnEnemy(role==='mid'?'elite':'collector',450,null,catalog.stats);if(!e)return null;
    Object.assign(e,{bossKey:catalog.id,bossRole:role,hp:Math.ceil(catalog.stats.hp*this.campaignScale.hp),maxHp:Math.ceil(catalog.stats.hp*this.campaignScale.hp),damage:Math.ceil(catalog.stats.damage*this.campaignScale.damage),skillCd:catalog.skill.cooldown,skillRepeats:0});this.boss=e;
    if(role==='mid')this.midBossSpawned=true;else this.finalBossSpawned=true;
    this.emit('boss',{final:role==='final',bossKey:e.bossKey,role});return e;
  }
  blocked(x,y,r){if(this.world.water?.some(w=>circleRect(x,y,r,w)))return true;const expedition=this.expedition;if(expedition!=null&&expeditionHasTransport(expedition.id)&&circleRect(x,y,r,expeditionTransport(this)))return true;if(this.world.rooftop&&!roofSupports(this.world,x,y,r))return true;if(x<r+35||y<r+35||x>this.world.width-r-35||y>this.world.height-r-35)return true;return this.world.obstacles.some(o=>!o.destroyed&&circleRect(x,y,r,o));}
  move(entity,dx,dy){const oldX=entity.x,oldY=entity.y,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/Math.max(4,entity.r*.6))),sx=dx/steps,sy=dy/steps;
    for(let i=0;i<steps;i++){if(!this.blocked(entity.x+sx,entity.y+sy,entity.r)){entity.x+=sx;entity.y+=sy;continue;}
      if(!this.blocked(entity.x+sx,entity.y,entity.r))entity.x+=sx;if(!this.blocked(entity.x,entity.y+sy,entity.r))entity.y+=sy;}
    entity.walkPhase=((entity.walkPhase||0)+Math.hypot(entity.x-oldX,entity.y-oldY)*.08)%(Math.PI*2);
  }
  spawnEnemy(type='walker',radius=500,at=null,stats=null){
    if(this.enemies.filter(e=>!e.dead).length>=210){if(type!=='collector'&&type!=='elite')return null;const replace=this.enemies.find(e=>!e.dead&&!['collector','elite'].includes(e.type));if(!replace)return null;this.enemies=this.enemies.filter(e=>e!==replace);}
    const d=stats??TYPES[type],p=this.player;let x,y,valid=false;
    for(let i=0;i<40;i++){const a=this.random()*Math.PI*2;x=at?.x??p.x+Math.cos(a)*(radius+this.random()*90);y=at?.y??p.y+Math.sin(a)*(radius+this.random()*90);if(!this.blocked(x,y,d.r+2)&&Math.hypot(x-p.x,y-p.y)>150){valid=true;break;}if(at)break;}
    if(!valid){x=1200;y=640;if(this.blocked(x,y,d.r))return null;}
    const scale=(1+this.stage*.18+(type==='collector'?0:this.stageTime/this.stageDuration*.12))*(this.campaignScale?.hp??1);
    const e={id:++this.id,x,y,r:d.r,type,hp:d.hp*scale,maxHp:d.hp*scale,speed:d.speed*(this.campaignScale?.speed??1),damage:d.damage*(this.campaignScale?.damage??1),xp:d.xp,angle:0,stun:0,vx:0,vy:0,burn:0,burnTick:0,hitFlash:0,walkPhase:0,attackCd:0,skillCd:4+this.random()*3,attackState:'walk',attackTime:0,targetX:0,targetY:0,dead:false};
    this.enemies.push(e);if(type==='collector')this.boss=e;return e;
  }
  addNoise(n){this.noise=clamp(this.noise+n,0,100);}
  shoot(){
    const p=this.player,w=WEAPONS[p.weapon];if(p.fireTime>0||p.reloadTime>0)return;
    if(p.ammo<=0){this.reload();return;}p.ammo--;p.fireTime=getFireInterval(this);
    const count=getPelletCount(this),damage=getBulletDamage(this);
    for(let i=0;i<count;i++){const a=p.angle+(this.random()-.5)*w.spread*2+(p.weapon==='nailgun'?(i-(count-1)/2)*.08:0),x=p.x+Math.cos(a)*24,y=p.y+Math.sin(a)*24;
      this.bullets.push({id:++this.id,x,y,px:x,py:y,vx:Math.cos(a)*w.speed,vy:Math.sin(a)*w.speed,life:w.life,damage,pierce:getUpgradeValue(this.upgrades,'pierce'),hits:new Set(),color:w.color,weapon:p.weapon});}
    p.recoil=.12;this.addNoise(p.weapon==='shotgun'?8:2);this.shake=Math.max(this.shake,p.weapon==='shotgun'?3:1);this.emit('shot',{weapon:p.weapon,x:p.x,y:p.y});
    this.burst(p.x+Math.cos(p.angle)*25,p.y+Math.sin(p.angle)*25,4,'#ffd28a',55,.08);
    if(p.ammo===0)this.reload();
  }
  reload(){const p=this.player;if(p.ammo<p.maxAmmo&&p.reloadTime<=0){p.reloadTime=playerReloadDuration(this);this.emit('reload',{weapon:p.weapon,duration:p.reloadTime,x:p.x,y:p.y});}}
  dash(mx,my){const p=this.player;if(p.dashCd>0||p.dashTime>0)return;const len=Math.hypot(mx,my),a=p.angle;p.dashX=len?mx/len:Math.cos(a);p.dashY=len?my/len:Math.sin(a);p.dashTime=.23;p.invul=Math.max(p.invul,.4);p.dashCd=getDashCooldown(this.upgrades);this.emit('dash');}
  placeLure(x,y){const p=this.player;if(p.lureCd>0)return false;const d=Math.hypot(x-p.x,y-p.y),scale=d>240?240/d:1;let lx=p.x+(x-p.x)*scale,ly=p.y+(y-p.y)*scale;if(this.blocked(lx,ly,12)){lx=p.x;ly=p.y;}
    this.lure={x:lx,y:ly,time:8,duration:8,radius:550};p.lureCd=12;this.addNoise(19);this.emit('lure',{x:lx,y:ly});this.float(lx,ly,'유인 신호','#f4b14f');return true;
  }
  throwFire(x,y){const p=this.player;if(p.molotovCd>0)return false;const item=createMolotov(p,x,y,getUpgradeValue(this.upgrades,'fire'));if(!item)return false;
    this.throwables??=[];this.throwables.push(item);p.molotovCd=17;this.addNoise(12);this.emit('fire-throw',{angle:item.angle,x:p.x,y:p.y});return true;
  }
  updateMolotovs(dt){
    this.throwables=(this.throwables||[]).filter(item=>{
      if(item.fallElapsed!==undefined){if(!advanceMolotovFall(item,dt))return true;this.finishMolotovFall(item);return false;}
      if(!advanceMolotov(item,dt,this.player))return true;
      if(this.world.rooftop&&!roofSupports(this.world,item.targetX,item.targetY,0)){beginMolotovFall(item,this.world.rooftop.elevation);return true;}
      if(inWater(this.world,item.targetX,item.targetY)){this.burst(item.targetX,item.targetY,10,'#a3d3db',80,.5,'water-drop');this.particles.push({kind:'splash-ring',x:item.targetX,y:item.targetY,vx:0,vy:0,life:.6,maxLife:.6,size:1,color:'#bce9e8'});this.trimParticles();this.emit('fire-fall',{x:item.targetX,y:item.targetY});return false;}
      this.fires.push({x:item.targetX,y:item.targetY,r:item.radius,time:item.fireDuration,duration:item.fireDuration,emberClock:0});
      this.burst(item.targetX,item.targetY,28,'#ffad45',190,.65,'ember');this.burst(item.targetX,item.targetY,10,'#ffe1a0',130,.24);this.burst(item.targetX,item.targetY,9,'#51473c',65,.9,'smoke');
      this.particles.push({x:item.targetX,y:item.targetY,vx:0,vy:0,life:.55,maxLife:.55,size:1,radius:item.radius*1.1,color:'#ffd393',kind:'shockwave'});this.trimParticles();this.shake=Math.max(this.shake,6);this.emit('fire',{x:item.targetX,y:item.targetY,radius:item.radius});return false;
    });
  }
  finishMolotovFall(item){this.burst(item.targetX,item.targetY,12,'#ffad45',100,.6,'ember');this.burst(item.targetX,item.targetY,6,'#51473c',40,.8,'smoke');for(const p of this.particles.slice(-18))p.z=-item.fallDepth;this.emit('fire-fall',{x:item.targetX,y:item.targetY});}
  hurtPlayer(amount,source=null){const p=this.player;if(this.state!=='playing'||p.invul>0||p.hp<=0)return;if(this.equipmentStats.mitigation>0)amount=Math.ceil(amount*(1-this.equipmentStats.mitigation)-1e-9);p.hp=Math.max(0,p.hp-amount);p.invul=.7;this.flash=.35;this.shake=6;this.combo=0;recordDamageContact(p,this.time,source);this.emit('hurt');this.float(p.x,p.y-25,'−'+amount,'#f47168');
    if(p.hp===0&&this.remainingRevives>0){this.remainingRevives--;p.hp=Math.max(1,Math.ceil(p.maxHp*this.equipmentStats.reviveHeal));p.invul=2;this.emit('revive',{remaining:this.remainingRevives,hp:p.hp,maxHp:p.maxHp});this.float(p.x,p.y-45,'생존 코어 복구','#b9e6bf');return;}
    if(p.hp===0)this.end(false);}
  damageEnemy(e,n,knock=null,from=null){if(this.state!=='playing'||e.dead)return;
    let shielded=false;if(e.bossKey){const multiplier=bossDamageMultiplier(this,e,from);if(multiplier<1){n*=multiplier;shielded=true;}}if(e.type==='shield'&&from){const dx=from.x-e.x,dy=from.y-e.y,len=Math.hypot(dx,dy)||1;if((dx*Math.cos(e.angle)+dy*Math.sin(e.angle))/len>.5){n*=.22;shielded=true;}}
    e.hp-=n;e.hitFlash=.12;if(knock){if(!e.bossKey){e.vx+=knock.x;e.vy+=knock.y;e.stun=.09;}this.emit('hit',{shielded,weapon:this.player.weapon,lethal:e.hp<=0,x:e.x,y:e.y});if(from){const old=this.particles.find(p=>p.kind==='weapon-impact'&&p.targetId===e.id&&p.maxLife-p.life<.045);if(old){old.hits++;old.lethal||=e.hp<=0;}else this.particles.push({kind:'weapon-impact',targetId:e.id,x:e.x,y:e.y,vx:0,vy:0,z:Math.min(40,Math.max(18,e.r*.7)),angle:Math.atan2(knock.y,knock.x),weapon:this.player.weapon,shielded,lethal:e.hp<=0,hits:1,life:this.player.weapon==='shotgun'?.30:.24,maxLife:this.player.weapon==='shotgun'?.30:.24,size:1,color:'#ffe1a0'});this.trimParticles();}}this.burst(e.x,e.y,shielded?3:2,shielded?'#d5d2ba':'#a64742',34,.23,shielded?'spark':'blood');
    if(e.hp<=0)this.killEnemy(e);
  }
  killEnemy(e){if(this.state!=='playing'||e.dead)return;e.dead=true;this.kills++;this.combo++;this.comboTime=3.5;this.parts+=e.type==='collector'?25:e.type==='elite'?12:1;
    this.corpses.push({x:e.x,y:e.y,type:e.type,angle:e.angle,time:12,duration:12,seed:e.id,...(e.bossKey?{bossKey:e.bossKey}:{})});if(this.corpses.length>70)this.corpses.shift();
    this.pickups.push({id:++this.id,x:e.x,y:e.y,type:'xp',value:e.xp});
    if(this.random()<.025)this.pickups.push({id:++this.id,x:e.x+10,y:e.y,type:'heal',value:12});
    const level=getUpgradeValue(this.upgrades,'reload');if(level&&this.random()<level*.28)this.player.ammo=Math.min(this.player.maxAmmo,this.player.ammo+1);
    this.burst(e.x,e.y,5,'#82665c',80,.4);this.emit('kill',{enemyType:e.type,combo:this.combo,x:e.x,y:e.y});
    if(e.type==='gas'||(this.upgrades.volatile&&this.random()<.18*getUpgradeValue(this.upgrades,'volatile')))this.explode(e.x,e.y,e.type==='gas'?150:100,e.type==='gas'?74:getVolatileDamage(this.upgrades),false);
    if(this.alarm.eliteId===e.id){this.alarm.active=false;this.alarm.time=0;this.alarm.cooldown=25;this.noise=25;this.pendingLevels++;this.emit('alarmclear');}
    if(e.bossKey){
      clearBossEffects(this,e.id);if(this.state!=='playing')return;
      this.defeatedBossIds.push(e.bossKey);this.emit('bossdefeat',{bossKey:e.bossKey,role:e.bossRole});
      if(e.bossRole==='mid'){this.midBossDefeated=true;this.boss=null;}else this.end(true);return;
    }
    if(e.gatekeeper&&!this.expedition){this.stageCleared=true;this.world.exit.open=true;this.state='supply';this.enemies=[];this.bullets=[];this.shopBought=false;this.healBought=false;this.emit('stageclear');}
    if(e.type==='collector'){if(this.expedition?.id===FINALE_EXPEDITION_ID)this.expedition.bossDefeated=true;if(this.expedition)this.boss=null;else this.end(true);}
  }
  explode(x,y,r,damage,hurt=true){if(this.state!=='playing'||this.explosionDepth>5)return;this.explosionDepth++;this.shake=Math.max(this.shake,9);this.burst(x,y,22,'#fb9142',210,.6,'ember');this.burst(x,y,12,'#ffd58d',120,.28);this.burst(x,y,8,'#50473e',70,1.05,'smoke');this.particles.push({x,y,vx:0,vy:0,life:.32,maxLife:.32,size:1,radius:r,color:'#ffc06b',kind:'shockwave'});this.trimParticles();this.float(x,y-25,'연쇄 폭발','#ffb65d');this.addNoise(13);this.emit('explosion',{x,y});
    for(const e of this.enemies){if(this.state!=='playing')break;const d=Math.hypot(e.x-x,e.y-y);if(!e.dead&&d<r+e.r)this.damageEnemy(e,damage*(1-.35*d/r),{x:(e.x-x)/(d||1)*160,y:(e.y-y)/(d||1)*160});}
    for(const o of this.world.obstacles){if(this.state!=='playing')break;if(o.destroyed||o.kind==='building')continue;if(circleRect(x,y,r,o)){o.hp-=damage;if(o.hp<=0){o.destroyed=true;if(o.kind==='barrel'||o.kind==='car')this.explode(o.x+o.w/2,o.y+o.h/2,o.kind==='car'?170:150,85,hurt);}}}
    if(hurt&&Math.hypot(this.player.x-x,this.player.y-y)<r*.7)this.hurtPlayer(12,{x,y});this.explosionDepth--;
  }
  chain(source,damage){const level=getUpgradeValue(this.upgrades,'shock');if(this.state!=='playing'||!level||this.random()>.17+level*.12)return;let from=source;const seen=new Set([source.id]),targets=getShockTargets(this.upgrades);for(let i=0;i<targets;i++){if(this.state!=='playing')break;let target=null,best=170;for(const e of this.enemies){if(e.dead||seen.has(e.id))continue;const d=distance(e,from);if(d<best){best=d;target=e;}}if(!target)break;seen.add(target.id);this.links.push({x1:from.x,y1:from.y,x2:target.x,y2:target.y,life:.16});this.damageEnemy(target,damage*getShockDamageMultiplier(this.upgrades));from=target;}this.emit('shock');}
  burst(x,y,n,color,speed=90,life=.4,kind='spark'){for(let i=0;i<n;i++){const a=this.visualRandom()*Math.PI*2,s=speed*(.3+this.visualRandom()*.7);this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,maxLife:life,size:2+this.visualRandom()*3,color,kind});}this.trimParticles();}
  trimParticles(){if(this.particles.length>850)this.particles.splice(0,this.particles.length-850);}
  float(x,y,text,color='#f3ca7b'){this.texts.push({x,y,text,color,life:1});if(this.texts.length>30)this.texts.shift();}
  gainXP(n){
    const p=this.player;if(!Number.isFinite(n)||n<0||!(p.xpNext>0))return;
    let xp=p.xp+n*this.equipmentStats.xp,level=p.level,next=p.xpNext,pending=this.pendingLevels;
    if(!Number.isFinite(xp)||xp>Number.MAX_SAFE_INTEGER)return;
    // Preserve the original XP curve through its former saveable range. Once
    // its threshold reaches1e12, levels keep advancing at that finite cost.
    // Large grants use one arithmetic batch after the bounded original prefix.
    while(xp>=next&&next<1e12){xp-=next;level++;next=Math.min(1e12,Math.round(next*1.22+5));pending++;}
    if(xp>=next){const count=Math.floor(xp/next);xp-=count*next;level+=count;pending+=count;}
    if(!Number.isSafeInteger(level)||!Number.isSafeInteger(pending))return;
    p.xp=xp;p.level=level;p.xpNext=next;this.pendingLevels=pending;
  }
  showUpgrade(){const available=UPGRADES.filter(u=>getUpgradeRank(this.upgrades,u.id)<Number.MAX_SAFE_INTEGER);if(!available.length){this.pendingLevels=0;this.choices=[];this.state='playing';this.finishSupplyUpgrade();return;}this.choices=[];while(this.choices.length<3&&available.length){this.choices.push(available.splice(Math.floor(this.random()*available.length),1)[0]);}this.state='upgrade';this.emit('levelup');}
  chooseUpgrade(id){if(this.state!=='upgrade'||!this.choices.some(u=>u.id===id))return false;const previous=getUpgradeRank(this.upgrades,id),next=previous+1;if(!validUpgradeRank(next))return false;this.upgrades[id]=next;
    const p=this.player;if(id==='health'){p.maxHp+=getHealthGrowth(previous,next);p.hp=Math.min(p.maxHp,p.hp+getHealthRecovery(previous,next));}if(id==='speed')p.speed=getStoredMoveSpeed(next,this.equipmentStats.movement);
    this.pendingLevels=Math.max(0,this.pendingLevels-1);this.choices=[];this.state='playing';this.emit('upgrade',{id});if(this.pendingLevels>0)this.showUpgrade();return true;
  }
  buyHeal(){if(this.state!=='supply'||this.healBought||this.parts<20||this.player.hp>=this.player.maxHp)return false;this.parts-=20;this.player.hp=Math.min(this.player.maxHp,this.player.hp+45);this.healBought=true;this.emit('heal');return true;}
  buyMod(){if(this.state!=='supply'||this.shopBought||this.parts<30||!UPGRADES.some(u=>getUpgradeRank(this.upgrades,u.id)<Number.MAX_SAFE_INTEGER))return false;this.parts-=30;this.shopBought=true;this.returnToSupply=true;this.pendingLevels++;this.showUpgrade();return true;}
  finishSupplyUpgrade(){if(this.returnToSupply&&this.state==='playing'){this.returnToSupply=false;this.state='supply';}}
  leaveSupply(){if(this.state!=='supply')return false;if(this.stage===0){this.state='route';return true;}this.advanceStage();return true;}
  chooseRoute(route){if(this.state!=='route'||!['hospital','police'].includes(route))return false;this.route=route;this.advanceStage();return true;}
  advanceStage(){this.stage++;this.stageTime=0;this.stageBossSpawned=false;this.stageCleared=false;this.eventSeen=false;this.alarm={active:false,time:0,cooldown:10,count:0,eliteId:null};this.noise=15;this.lure=null;this.fires=[];this.throwables=[];this.corpses=[];this.particles=[];this.texts=[];this.links=[];this.enemies=[];this.bullets=[];this.pickups=[];this.world=this.makeWorld();this.player.x=1200;this.player.y=930;this.player.invul=2;this.player.ammo=this.player.maxAmmo;this.player.reloadTime=0;this.spawnClock=1;this.state='playing';for(let i=0;i<7;i++)this.spawnEnemy(i%3===0?'runner':'walker',430);this.emit('district',{stage:this.stage});}
  chooseEvent(search){if(this.state!=='event')return false;this.state='playing';if(search){this.player.hp=Math.min(this.player.maxHp,this.player.hp+35);this.addNoise(45);for(let i=0;i<9;i++)this.spawnEnemy(i%3===0?'runner':'walker',300);this.float(this.player.x,this.player.y-30,'의약품 회수 +35','#a7d79f');this.emit('heal');}return true;}
  startAlarm(){if(this.alarm.active||this.alarm.count>=2||this.alarm.cooldown>0)return;const e=this.spawnEnemy('elite',440);if(!e)return;this.alarm.active=true;this.alarm.time=30;this.alarm.count++;this.alarm.eliteId=e.id;for(let i=0;i<9;i++)this.spawnEnemy(i%3===0?'runner':'walker',420);this.emit('alarm');this.float(this.player.x,this.player.y-60,'경보! 정예를 처치하세요','#ff7771');}
  end(won){if(this.result||won&&this.expedition?.id===FINALE_EXPEDITION_ID&&(!this.expedition.bossDefeated||this.expedition.step!==4))return;this.state=won?'victory':'dead';if(this.mission){this.hostileProjectiles=[];this.bossHazards=[];}this.result={won,...(this.expedition?{expeditionId:this.expedition.id,objectivesCompleted:this.expedition.step,...(this.expedition.id===FINALE_EXPEDITION_ID?{vaccineRecovered:won&&this.expedition.bossDefeated&&this.expedition.step===4}:{})}:{}),missionId:this.missionId??null,midBossDefeated:!!this.midBossDefeated,defeatedBossIds:[...(this.defeatedBossIds??[])],kills:this.kills,time:this.time,level:this.player.level,parts:this.parts,weapon:this.player.weapon,mode:this.mode,upgrades:{...this.upgrades},seed:this.seed};this.emit('end',{result:this.result});}
  pause(){if(this.state==='playing'){this.state='paused';this.emit('pause');}}
  resume(){if(this.state==='paused'){this.state='playing';this.emit('resume');}}
  tick(dt,input={}){
    if(this.state!=='playing')return;dt=clamp(dt,0,.05);const p=this.player;this.time+=dt;this.stageTime+=dt;
    for(const k of ['fireTime','dashCd','lureCd','molotovCd','invul'])p[k]=Math.max(0,p[k]-dt);
    if(p.reloadTime>0){const before=p.reloadTime;p.reloadTime=Math.max(0,p.reloadTime-dt);for(const stage of crossedReloadStages(p.weapon,before,p.reloadTime,playerReloadDuration(this)))this.emit('reload-stage',{weapon:p.weapon,stage:stage.kind,progress:stage.progress,x:p.x,y:p.y});if(p.reloadTime===0){p.ammo=p.maxAmmo;this.emit('loaded',{weapon:p.weapon,x:p.x,y:p.y});}}
    const mx=Number.isFinite(input.moveX)?input.moveX:0,my=Number.isFinite(input.moveY)?input.moveY:0,ax=input.aimX??p.x+Math.cos(p.angle)*200,ay=input.aimY??p.y+Math.sin(p.angle)*200;p.angle=Math.atan2(ay-p.y,ax-p.x);
    if(input.dash)this.dash(mx,my);if(p.dashTime>0){const dashStep=Math.min(dt,p.dashTime);p.dashTime=Math.max(0,p.dashTime-dt);this.move(p,p.dashX*PLAYER_DASH_SPEED*dashStep,p.dashY*PLAYER_DASH_SPEED*dashStep);this.burst(p.x,p.y,1,'#dab98a',25,.15);}else{const movement=stepPlayerMovement(p,dt,mx,my);this.move(p,movement.x,movement.y);}
    if(input.reload)this.reload();if(input.shoot&&!(this.throwables||[]).some(item=>item.elapsed<.5))this.shoot();if(input.lure)this.placeLure(input.targetX??ax,input.targetY??ay);if(input.molotov)this.throwFire(input.targetX??ax,input.targetY??ay);this.updateMolotovs(dt);
    this.noise=Math.max(0,this.noise-dt*(this.alarm.active?.6:3.6));this.alarm.cooldown=Math.max(0,this.alarm.cooldown-dt);if(this.noise>=99)this.startAlarm();
    if(this.alarm.active){this.alarm.time=Math.max(0,this.alarm.time-dt);if(this.alarm.time===0)this.noise=Math.min(this.noise,85);}
    if(this.lure){this.lure.time-=dt;if(this.lure.time<=0)this.lure=null;}
    if(this.comboTime>0){this.comboTime-=dt;if(this.comboTime<=0)this.combo=0;}
    this.spawnClock-=dt;if(this.spawnClock<=0){const rate=1.8+this.stage*1.4+this.stageTime/this.stageDuration*2+this.noise/24;this.spawnClock=1/(rate*(this.campaignScale?.spawn??1));let type;if(this.mission)type=this.missionEnemyType();else{type='walker';const t=this.random();if(t<.12+this.stage*.035)type='runner';else if(this.stage>0&&t<.27)type='shield';else if(this.stage>0&&t<.34)type='screamer';else if(t<.43&&this.stageTime>20)type='gas';}this.spawnEnemy(type,520);}
    this.updateBullets(dt);if(this.state!=='playing')return;this.updateEnemies(dt);if(this.state!=='playing')return;if(this.mission)updateBossEffects(this,dt);if(this.state!=='playing')return;this.updatePickups(dt);this.updateEffects(dt);
    if(this.state!=='playing')return;
    if(this.mission){
      if(!this.midBossSpawned&&this.stageTime>=this.stageDuration*.35)this.spawnMissionBoss('mid');
      else if(this.midBossDefeated&&!this.finalBossSpawned&&this.stageTime>=this.stageDuration*.75)this.spawnMissionBoss('final');
      if(this.pendingLevels>0)this.showUpgrade();return;
    }
    if(this.expedition){updateExpedition(this,dt,input);if(this.state==='playing'&&this.pendingLevels>0)this.showUpgrade();return;}
    if(this.stage===1&&this.route==='hospital'&&!this.eventSeen&&this.stageTime>this.stageDuration*.35){this.eventSeen=true;this.state='event';this.emit('event');return;}
    if(this.stage===1&&this.route==='police'&&!this.eventSeen&&this.stageTime>this.stageDuration*.4){this.eventSeen=true;this.noise=100;this.alarm.cooldown=0;this.startAlarm();}
    if(!this.stageBossSpawned&&this.stageTime>this.stageDuration*(this.stage===2?.65:1)){const e=this.spawnEnemy(this.stage===2?'collector':'elite',450);if(e){this.stageBossSpawned=true;if(this.stage<2)e.gatekeeper=true;this.emit('boss',{final:this.stage===2});}}
    if(this.pendingLevels>0)this.showUpgrade();
  }
  updateBullets(dt){
    const transport=expeditionTransport(this),stats=this.bulletCollisionStats,rectTest=this.forceBulletNarrowPhase?segmentRect:segmentRectNoAlloc,filterCircles=this.bulletBoundsMode==='all';
    for(const b of this.bullets){if(b.life<=0)continue;b.px=b.x;b.py=b.y;const ex=b.x+b.vx*dt,ey=b.y+b.vy*dt;b.life-=dt;const hits=[];
      const bounded=!this.forceBulletNarrowPhase&&this.bulletBoundsMode!=='off'&&boundedBulletSegment(b.px,b.py,ex,ey);let minX,minY,maxX,maxY;
      if(bounded){minX=Math.min(b.px,ex)-BULLET_BOUNDS_MARGIN;minY=Math.min(b.py,ey)-BULLET_BOUNDS_MARGIN;maxX=Math.max(b.px,ex)+BULLET_BOUNDS_MARGIN;maxY=Math.max(b.py,ey)+BULLET_BOUNDS_MARGIN;}
      for(const o of this.world.obstacles){if(o.destroyed)continue;if(stats)stats.rectCandidates++;if(bounded&&!bulletRectMayOverlap(minX,minY,maxX,maxY,o)){if(stats)stats.rectRejected++;continue;}if(stats)stats.rectTests++;const t=rectTest(b.px,b.py,ex,ey,o);if(t!==null)hits.push({t,o});}
      if(transport){if(stats)stats.rectCandidates++;if(!bounded||bulletRectMayOverlap(minX,minY,maxX,maxY,transport)){if(stats)stats.rectTests++;const t=rectTest(b.px,b.py,ex,ey,transport);if(t!==null)hits.push({t,o:transport});}else if(stats)stats.rectRejected++;}
      for(const e of this.enemies){if(e.dead||b.hits.has(e.id))continue;if(stats)stats.circleCandidates++;if(bounded&&filterCircles&&!bulletCircleMayOverlap(minX,minY,maxX,maxY,e.x,e.y,e.r+3)){if(stats)stats.circleRejected++;continue;}if(stats)stats.circleTests++;const t=segmentCircle(b.px,b.py,ex,ey,e.x,e.y,e.r+3);if(t!==null)hits.push({t,e});}
      hits.sort((a,b)=>a.t-b.t);b.x=ex;b.y=ey;
      for(const hit of hits){if(this.state!=='playing')break;const{e,o,t}=hit;if(o){if(o.destroyed)continue;b.x=b.px+(ex-b.px)*t;b.y=b.py+(ey-b.py)*t;b.life=0;const material=['car','barrel','fence'].includes(o.kind)?'metal':'concrete';const impact=this.particles.find(p=>p.kind==='weapon-impact'&&p.targetId==='wall-'+o.id&&p.maxLife-p.life<.045);if(impact)impact.hits++;else this.particles.push({kind:'weapon-impact',targetId:'wall-'+o.id,surface:material,x:b.x,y:b.y,vx:0,vy:0,z:22,angle:Math.atan2(b.vy,b.vx),weapon:b.weapon,shielded:material==='metal',hits:1,life:.2,maxLife:.2,size:1,color:'#d8c4a1'});this.trimParticles();this.emit('wall-hit',{x:b.x,y:b.y,material,weapon:b.weapon});if(o.kind!=='building'&&!o.transport){o.hp-=b.damage;if(o.hp<=0){o.destroyed=true;this.explode(o.x+o.w/2,o.y+o.h/2,o.kind==='car'?170:150,85);}}break;}
        if(e.dead)continue;b.hits.add(e.id);const l=Math.hypot(b.vx,b.vy)||1,k=45+getUpgradeValue(this.upgrades,'knockback')*80;this.damageEnemy(e,b.damage,{x:b.vx/l*k,y:b.vy/l*k},{x:b.px,y:b.py});this.chain(e,b.damage);if(b.pierce<=0){b.x=b.px+(ex-b.px)*t;b.y=b.py+(ey-b.py)*t;b.life=0;break;}b.pierce--;}
      if(this.state!=='playing')break;
    }this.bullets=this.bullets.filter(b=>b.life>0);
  }
  updateEnemies(dt){
    const p=this.player,cell=55;
    // Production worlds are2400x1800; use strings for out-of-range custom maps.
    const compact=this.world.width<55*32768&&this.world.height<55*32768;
    let lease=null,grid;
    if(this.forceFreshEnemyGrid===true){
      grid=new Map();for(const e of this.enemies){if(e.dead)continue;const cx=Math.floor(e.x/cell),cy=Math.floor(e.y/cell),key=compact?cx*65536+cy:cx+','+cy;let bucket=grid.get(key);if(!bucket)grid.set(key,bucket=[]);bucket.push(e);}recordFreshEnemyGrid(this,grid);
    }else{lease=acquireEnemyGrid(this,this.enemies,compact);grid=lease.grid;}
    try{
    for(const e of this.enemies){if(this.state!=='playing')break;if(e.dead)continue;e.attackCd=Math.max(0,e.attackCd-dt);e.stun=Math.max(0,e.stun-dt);e.skillCd-=dt;
      for(const f of this.fires){if(Math.hypot(e.x-f.x,e.y-f.y)<f.r+e.r)e.burn=Math.max(e.burn,1.4);}
      if(e.burn>0){e.burn-=dt;e.burnTick-=dt;if(e.burnTick<=0){e.burnTick=.3;this.damageEnemy(e,7+2*getUpgradeValue(this.upgrades,'fire'));}}
      if(e.dead)continue;
      let target=p;if(this.lure&&distance(e,this.lure)<this.lure.radius&&e.type!=='collector')target=this.lure;
      if(e.bossKey){if(updateCampaignBoss(this,e,dt)){e.vx*=Math.exp(-dt*9);e.vy*=Math.exp(-dt*9);continue;}}
      else if(e.type==='collector'){this.updateBoss(e,dt);if(e.attackState==='windup'||e.attackState==='recover')continue;if(e.attackState==='charge'){this.move(e,Math.cos(e.angle)*540*dt,Math.sin(e.angle)*540*dt);for(const o of this.world.obstacles){if(o.destroyed||o.kind==='building'||!circleRect(e.x,e.y,e.r+8,o))continue;o.destroyed=true;this.burst(o.x,o.y,15,'#9a8670',180,.5);}if(distance(e,p)<e.r+p.r)this.hurtPlayer(e.damage,e);continue;}}
      const dx=target.x-e.x,dy=target.y-e.y,len=Math.hypot(dx,dy)||1;e.angle=Math.atan2(dy,dx);
      let sx=0,sy=0;const cx=Math.floor(e.x/cell),cy=Math.floor(e.y/cell);
      for(let gx=cx-1;gx<=cx+1;gx++)for(let gy=cy-1;gy<=cy+1;gy++){
        const neighbors=grid.get(compact?gx*65536+gy:gx+','+gy);if(!neighbors?.length)continue;
        for(const other of neighbors){if(other===e||other.dead)continue;const ox=e.x-other.x,oy=e.y-other.y,d2=ox*ox+oy*oy,min=e.r+other.r-3;if(d2<min*min&&d2>.01){const d=Math.sqrt(d2);sx+=ox/d*(min-d)*3;sy+=oy/d*(min-d)*3;}}
      }
      if(e.vx||e.vy)this.move(e,e.vx*dt,e.vy*dt);
      if(e.stun<=0&&len>e.r+(target===p?p.r:12)-3){e.navTime=(e.navTime||0)-dt;
        if(e.navTime<=0||e.navTarget!==target||Math.hypot(target.x-(e.navTargetX??target.x),target.y-(e.navTargetY??target.y))>40){const d=this.navigation.direction(e,target,e.r);e.navX=d.x;e.navY=d.y;e.navTarget=target;e.navTargetX=target.x;e.navTargetY=target.y;e.navTime=.14+(e.id%5)*.009;}
        const direction={x:e.navX||0,y:e.navY||0};if(direction.x||direction.y)e.angle=Math.atan2(direction.y,direction.x);this.move(e,(direction.x*e.speed+sx)*dt,(direction.y*e.speed+sy)*dt);}
      e.vx*=Math.exp(-dt*9);e.vy*=Math.exp(-dt*9);
      if(distance(e,p)<e.r+p.r+2&&e.attackCd<=0){e.attackCd=.9;this.hurtPlayer(e.damage,e);}
      if(e.type==='screamer'&&e.skillCd<=0){e.skillCd=9;this.addNoise(7);for(let i=0;i<3;i++)this.spawnEnemy('walker',500);this.float(e.x,e.y-25,'비명!','#ee7971');this.emit('scream');}
    }this.enemies=this.enemies.filter(e=>!e.dead);
    }finally{lease?.release();}
  }
  updateBoss(e,dt){
    if(e.attackState==='windup'){e.attackTime-=dt;if(e.attackTime<=0){e.attackState='charge';e.attackTime=.95;e.angle=Math.atan2(e.targetY-e.y,e.targetX-e.x);this.emit('charge');}}
    else if(e.attackState==='charge'){e.attackTime-=dt;if(e.attackTime<=0){e.attackState='recover';e.attackTime=1.15;this.shake=9;}}
    else if(e.attackState==='recover'){e.attackTime-=dt;if(e.attackTime<=0)e.attackState='walk';}
    if(e.skillCd<=0&&e.attackState==='walk'){e.skillCd=7;e.attackState='windup';e.attackTime=1.15;e.targetX=this.player.x;e.targetY=this.player.y;this.emit('bosswarn');for(let i=0;i<5;i++)this.spawnEnemy(i%3===0?'runner':'walker',470);}
  }
  updatePickups(dt){const p=this.player,range=getMagnetRange(this);for(const a of this.pickups){const d=distance(a,p);if(d<range){const speed=280+(range-d)*4;a.x+=(p.x-a.x)/(d||1)*Math.min(d,speed*dt);a.y+=(p.y-a.y)/(d||1)*Math.min(d,speed*dt);}if(d<22){a.collected=true;if(a.type==='xp')this.gainXP(a.value);else if(a.type==='heal'){p.hp=Math.min(p.maxHp,p.hp+a.value);this.emit('heal');}}}
    this.pickups=this.pickups.filter(a=>!a.collected);if(this.pickups.length>450){const first=this.pickups.splice(0,this.pickups.length-450);this.gainXP(first.filter(a=>a.type==='xp').reduce((n,a)=>n+a.value,0));}}
  updateEffects(dt){
    this.player.recoil=Math.max(0,this.player.recoil-dt);for(const e of this.enemies)e.hitFlash=Math.max(0,e.hitFlash-dt);
    for(const c of this.corpses)c.time-=dt;this.corpses=this.corpses.filter(c=>c.time>0);
    for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-dt*4);p.vy*=Math.exp(-dt*4);}this.particles=this.particles.filter(p=>p.life>0);
    for(const t of this.texts){t.life-=dt;t.y-=24*dt;}this.texts=this.texts.filter(t=>t.life>0);for(const l of this.links)l.life-=dt;this.links=this.links.filter(l=>l.life>0);
    for(const f of this.fires){f.time-=dt;f.emberClock=(f.emberClock||0)-dt;if(f.time>0&&f.emberClock<=0){f.emberClock=.12;const a=this.visualRandom()*Math.PI*2,r=this.visualRandom()*f.r*.8;this.burst(f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,2,'#ffad4a',24,.6,'ember');}}
    this.fires=this.fires.filter(f=>f.time>0);this.shake=Math.max(0,this.shake-dt*28);this.flash=Math.max(0,this.flash-dt);
  }
}

export const playerReloadDuration=game=>getReloadDuration(game);
