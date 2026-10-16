const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const EQUIPMENT=freeze([
  {id:'blackout-rounds',name:'블랙아웃 탄두',slot:'weapon',icon:'◆',rarity:'전설',description:'모든 탄환 피해를 크게 높입니다.',costs:[200,400,700,1100,1600]},
  {id:'storm-magazine',name:'폭풍 탄창',slot:'weapon',icon:'ϟ',rarity:'전설',description:'연사와 재장전이 빨라지고 탄창이 커집니다.',costs:[180,360,650,1000,1500]},
  {id:'quarantine-armor',name:'격리 방호복',slot:'armor',icon:'⛨',rarity:'전설',description:'최대 체력을 크게 늘리고 받는 피해를 줄입니다.',costs:[180,360,650,1000,1500]},
  {id:'barrier-field',name:'차단 역장',slot:'armor',icon:'◎',rarity:'전설',description:'큰 피해 감소로 강한 보스의 공격을 버팁니다.',costs:[200,400,700,1100,1600]},
  {id:'survival-core',name:'생존 코어',slot:'utility',icon:'+',rarity:'전설',description:'치명상을 입으면 작전 중 제한 횟수만큼 다시 일어납니다.',costs:[220,440,800,1200,1800]},
  {id:'magnetic-recovery',name:'자기장 회수기',slot:'utility',icon:'↗',rarity:'전설',description:'더 먼 경험치를 회수하고 성장과 이동이 빨라집니다.',costs:[160,320,550,900,1300]}
]);
export const EQUIPMENT_SLOTS=Object.freeze(['weapon','armor','utility']);
export const TEST_CHIPS=20000;
const MAX_CHIPS=1000000000;
const catalog=new Map(EQUIPMENT.map(item=>[item.id,item]));
const rank=value=>Number.isInteger(value)&&value>=1&&value<=5?value:0;
export const getEquipment=id=>catalog.get(id)||null;

export function normalizeEquipment(raw){
  const items={},equipped={weapon:null,armor:null,utility:null};
  for(const item of EQUIPMENT){const owned=rank(raw?.items?.[item.id]);if(owned)items[item.id]=owned;}
  for(const slot of EQUIPMENT_SLOTS){const id=raw?.equipped?.[slot],item=getEquipment(id);if(item?.slot===slot&&items[id])equipped[slot]=id;}
  return {chips:Number.isInteger(raw?.chips)&&raw.chips>=0&&raw.chips<=MAX_CHIPS?raw.chips:0,items,equipped,testChipsClaimed:raw?.testChipsClaimed===true};
}

export function planTestChips(raw){
  const premium=normalizeEquipment(raw);if(premium.testChipsClaimed)return null;
  return {...premium,chips:Math.min(MAX_CHIPS,premium.chips+TEST_CHIPS),testChipsClaimed:true};
}

export function equipmentOffer(raw,id){
  const item=getEquipment(id);if(!item)return null;
  const premium=normalizeEquipment(raw),owned=premium.items[id]||0,maxed=owned>=item.costs.length,cost=maxed?0:item.costs[owned];
  return {item,rank:owned,cost,maxed,canBuy:!maxed&&premium.chips>=cost,shortage:Math.max(0,cost-premium.chips),equipped:premium.equipped[item.slot]===id};
}

export function planEquipmentPurchase(raw,id){
  const offer=equipmentOffer(raw,id);if(!offer?.canBuy)return null;
  const premium=normalizeEquipment(raw);premium.chips-=offer.cost;premium.items[id]=offer.rank+1;
  if(!premium.equipped[offer.item.slot])premium.equipped[offer.item.slot]=id;
  return premium;
}

export function planEquipmentSelection(raw,slot,id){
  if(!EQUIPMENT_SLOTS.includes(slot))return null;
  const premium=normalizeEquipment(raw);
  if(id!==null){const item=getEquipment(id);if(!item||item.slot!==slot||!premium.items[id])return null;}
  premium.equipped[slot]=id;return premium;
}

export function equipmentStats(raw){
  const premium=normalizeEquipment(raw),stats={damage:1,fireRate:1,ammoBonus:{shotgun:0,nailgun:0},hpBonus:0,mitigation:0,revives:0,reviveHeal:.45,movement:1,xp:1,pickupRadius:0};
  for(const id of Object.values(premium.equipped)){
    const level=premium.items[id]||0;if(!level)continue;
    if(id==='blackout-rounds')stats.damage=1+.45*level;
    if(id==='storm-magazine'){stats.fireRate=1+.16*level;stats.ammoBonus={shotgun:2*level,nailgun:6*level};}
    if(id==='quarantine-armor'){stats.hpBonus=45*level;stats.mitigation=.055*level;}
    if(id==='barrier-field'){stats.hpBonus=30*level;stats.mitigation=.09*level;}
    if(id==='survival-core'){stats.revives=Math.ceil(level/2);stats.reviveHeal=.43+.02*level;}
    if(id==='magnetic-recovery'){stats.movement=1+.04*level;stats.xp=1+.15*level;stats.pickupRadius=40*level;}
  }
  return stats;
}

export function equipmentDescription(id,level=1){
  const owned=rank(level)||1;
  if(id==='blackout-rounds')return `탄환 피해 ×${(1+.45*owned).toFixed(2)}`;
  if(id==='storm-magazine')return `사격·재장전 ×${(1+.16*owned).toFixed(2)} · 탄창 +${2*owned} / +${6*owned}발`;
  if(id==='quarantine-armor')return `최대 체력 +${45*owned} · 피해 감소 ${(5.5*owned).toFixed(1)}%`;
  if(id==='barrier-field')return `최대 체력 +${30*owned} · 피해 감소 ${9*owned}%`;
  if(id==='survival-core')return `치명상 복구 ${Math.ceil(owned/2)}회 · 체력 ${Math.round((.43+.02*owned)*100)}% 회복`;
  if(id==='magnetic-recovery')return `경험치 ×${(1+.15*owned).toFixed(2)} · 이동 ×${(1+.04*owned).toFixed(2)} · 회수 +${40*owned}`;
  return '';
}

const STAT_KEYS=Object.freeze(Object.keys(equipmentStats(null)));
const GROUPS=Object.freeze({weapon:['damage','fireRate','ammoBonus'],armor:['hpBonus','mitigation'],utility:['revives','reviveHeal','movement','xp','pickupRadius']});
const signature=(stats,fields)=>JSON.stringify(fields.map(key=>key==='ammoBonus'?[stats.ammoBonus.shotgun,stats.ammoBonus.nailgun]:stats[key]));
const signatures=Object.fromEntries(EQUIPMENT_SLOTS.map(slot=>{
  const allowed=new Set([signature(equipmentStats(null),GROUPS[slot])]);
  for(const item of EQUIPMENT.filter(item=>item.slot===slot))for(let level=1;level<=5;level++)allowed.add(signature(equipmentStats({items:{[item.id]:level},equipped:{[slot]:item.id}}),GROUPS[slot]));
  return [slot,allowed];
}));
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
export function validEquipmentStats(raw){
  try{
    if(!plain(raw)||Object.keys(raw).length!==STAT_KEYS.length||STAT_KEYS.some(key=>!Object.hasOwn(raw,key)))return false;
    if(!plain(raw.ammoBonus)||Object.keys(raw.ammoBonus).length!==2||!Object.hasOwn(raw.ammoBonus,'shotgun')||!Object.hasOwn(raw.ammoBonus,'nailgun'))return false;
    if(STAT_KEYS.some(key=>key!=='ammoBonus'&&!Number.isFinite(raw[key]))||!Number.isFinite(raw.ammoBonus.shotgun)||!Number.isFinite(raw.ammoBonus.nailgun))return false;
    return EQUIPMENT_SLOTS.every(slot=>signatures[slot].has(signature(raw,GROUPS[slot])));
  }catch{return false;}
}
