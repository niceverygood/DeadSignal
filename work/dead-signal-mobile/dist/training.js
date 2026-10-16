// Safehouse upgrades apply only when a new operation is created.
export const TRAINING=[
  {id:'armor',name:'방호복 보강',icon:'⛨',costs:[60,110,180],description:'단계마다 시작 체력과 최대 체력 +8'},
  {id:'magazine',name:'확장 탄창',icon:'⊞',costs:[75,130,210],description:'단계마다 산탄총 +1발 · 못총 +3발'}
];
export function normalizeTraining(raw){
  const rank=value=>Number.isInteger(value)&&value>=0&&value<=3?value:0;
  return {armor:rank(raw?.armor),magazine:rank(raw?.magazine)};
}
export function trainingStats(raw){
  const ranks=normalizeTraining(raw);
  return {maxHp:100+ranks.armor*8,ammoBonus:{shotgun:ranks.magazine,nailgun:ranks.magazine*3}};
}
export function trainingOffer(profile,id){
  const item=TRAINING.find(item=>item.id===id);if(!item)return null;
  const rank=normalizeTraining(profile?.training)[id],maxed=rank===item.costs.length,cost=maxed?null:item.costs[rank];
  const parts=Number.isInteger(profile?.parts)&&profile.parts>=0?profile.parts:0;
  return {rank,maxed,cost,shortage:maxed?0:Math.max(0,cost-parts),canBuy:!maxed&&parts>=cost};
}
export function planTrainingPurchase(profile,id){
  const offer=trainingOffer(profile,id);if(!offer?.canBuy)return null;
  return {...profile,parts:profile.parts-offer.cost,training:{...normalizeTraining(profile.training),[id]:offer.rank+1}};
}
