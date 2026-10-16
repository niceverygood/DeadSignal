import {MISSIONS,BOSS_CATALOG,getMission,getBoss} from './campaign.js?v=0.29.0';

const keys=new Set(BOSS_CATALOG.map(boss=>boss.id));
const uniqueKeys=value=>Array.isArray(value)?[...new Set(value.filter(key=>keys.has(key)))]:[];

export function normalizeCampaign(raw){
  const requested=new Set(Array.isArray(raw?.cleared)?raw.cleared:[]),cleared=[];
  for(const mission of MISSIONS){if(!requested.has(mission.id))break;cleared.push(mission.id);}
  const defeated=uniqueKeys(raw?.bossDefeated),seen=[...new Set([...uniqueKeys(raw?.bossSeen),...defeated])],bestTimes={};
  for(const id of cleared){const time=raw?.bestTimes?.[id];if(Number.isFinite(time)&&time>=0&&time<=1e9)bestTimes[id]=time;}
  const selected=getMission(raw?.selectedMission),unlocked=selected&&(selected.index===0||cleared.includes(MISSIONS[selected.index-1].id));
  return {cleared,bestTimes,bossSeen:seen,bossDefeated:defeated,selectedMission:unlocked?selected.id:MISSIONS[Math.min(cleared.length,MISSIONS.length-1)].id};
}

export function missionAccess(raw,id){
  const mission=getMission(id);if(!mission)return null;
  const progress=normalizeCampaign(raw),cleared=progress.cleared.includes(mission.id),unlocked=mission.index===0||progress.cleared.includes(MISSIONS[mission.index-1].id);
  return {mission,unlocked,cleared,bestTime:progress.bestTimes[mission.id]??null};
}

export function planMissionSelection(raw,id){
  const access=missionAccess(raw,id);return access?.unlocked?{...normalizeCampaign(raw),selectedMission:access.mission.id}:null;
}

export function planBossRecord(raw,key,defeated=false){
  if(!getBoss(key))return null;
  const progress=normalizeCampaign(raw);
  if(!progress.bossSeen.includes(key))progress.bossSeen.push(key);
  if(defeated&&!progress.bossDefeated.includes(key))progress.bossDefeated.push(key);
  return progress;
}

export function planMissionCompletion(raw,result){
  const access=missionAccess(raw,result?.missionId);
  if(!result?.won||result.midBossDefeated!==true||!access?.unlocked||!Number.isFinite(result.time)||result.time<0||result.time>1e9)return null;
  let progress=normalizeCampaign(raw);
  if(!progress.cleared.includes(access.mission.id))progress.cleared.push(access.mission.id);
  const previous=progress.bestTimes[access.mission.id];progress.bestTimes[access.mission.id]=previous===undefined?result.time:Math.min(previous,result.time);
  for(const key of [access.mission.midBoss,access.mission.finalBoss])progress=planBossRecord(progress,key,true);
  progress.selectedMission=MISSIONS[Math.min(access.mission.index+1,MISSIONS.length-1)].id;
  return normalizeCampaign(progress);
}
