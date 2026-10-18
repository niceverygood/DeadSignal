import {normalizeExpeditionProgress,planExpeditionCompletion} from './expedition.js';
import {normalizeTraining,planTrainingPurchase} from './training.js?v=0.29.0';
import {normalizeCampaign,planMissionCompletion} from './campaign-progress.js?v=0.29.0';
import {normalizeEquipment,planTestChips,planEquipmentPurchase,planEquipmentSelection} from './equipment.js?v=0.29.0';
export const PROFILE_KEY='dead-signal.profile.v1';
const defaults=()=>({runs:0,wins:0,totalKills:0,bestKills:0,bestTime:0,parts:0,unlocked:['shotgun'],options:{sound:true,volume:.35,shake:true,autoAim:false,atmosphere:true,fireMode:'auto',minimap:true},training:normalizeTraining(null),campaign:normalizeCampaign(null),equipment:normalizeEquipment(null),expeditions:normalizeExpeditionProgress(null),activeRun:null,completedRuns:[],version:1});
export function activeRunEnvelope(raw){
  if(!raw||raw.version!==1||typeof raw.id!=='string'||!raw.id.length||raw.id.length>100||!Number.isFinite(raw.savedAt)||raw.savedAt<0||!raw.game||typeof raw.game!=='object'||Array.isArray(raw.game))return null;
  return {version:1,id:raw.id,savedAt:raw.savedAt,game:raw.game,selection:{route:raw.selection?.route==='police'?'police':'hospital'}};
}
export function loadProfile(storage){
  const base=defaults();try{storage??=globalThis.localStorage;const raw=JSON.parse(storage.getItem(PROFILE_KEY)||'null');if(!raw||typeof raw!=='object')return base;
    for(const k of ['runs','wins','totalKills','bestKills','bestTime','parts'])if(Number.isFinite(raw[k])&&raw[k]>=0)base[k]=Math.floor(raw[k]);
    if(Array.isArray(raw.unlocked))base.unlocked=[...new Set(['shotgun',...raw.unlocked.filter(w=>w==='nailgun')])];
    if(raw.options&&typeof raw.options==='object'){for(const k of ['sound','shake','autoAim','atmosphere','minimap'])if(typeof raw.options[k]==='boolean')base.options[k]=raw.options[k];if(['auto','manual'].includes(raw.options.fireMode))base.options.fireMode=raw.options.fireMode;if(Number.isFinite(raw.options.volume))base.options.volume=Math.max(0,Math.min(1,raw.options.volume));}
    if(Array.isArray(raw.completedRuns))base.completedRuns=[...new Set(raw.completedRuns.filter(id=>typeof id==='string'&&id.length>0&&id.length<=100))].slice(-64);
    base.activeRun=activeRunEnvelope(raw.activeRun);if(base.activeRun&&base.completedRuns.includes(base.activeRun.id))base.activeRun=null;
    base.training=normalizeTraining(raw.training);
    base.campaign=normalizeCampaign(raw.campaign);
    base.equipment=normalizeEquipment(raw.equipment);base.expeditions=normalizeExpeditionProgress(raw.expeditions);
    return base;
  }catch{return base;}
}
export function saveProfile(profile,storage){try{storage??=globalThis.localStorage;storage.setItem(PROFILE_KEY,JSON.stringify(profile));return true;}catch{return false;}}
export function buyTraining(profile,id,storage){const next=planTrainingPurchase(profile,id);if(!next||!saveProfile(next,storage))return false;Object.assign(profile,next);return true;}
function commitEquipment(profile,equipment,storage){if(!equipment)return false;const next={...profile,equipment};if(!saveProfile(next,storage))return false;Object.assign(profile,next);return true;}
export function claimTestChips(profile,storage){return commitEquipment(profile,planTestChips(profile.equipment),storage);}
export function buyEquipment(profile,id,storage){return commitEquipment(profile,planEquipmentPurchase(profile.equipment,id),storage);}
export function equipItem(profile,slot,id,storage){return commitEquipment(profile,planEquipmentSelection(profile.equipment,slot,id),storage);}
export function recordRun(profile,result,runId=null){
  if(runId&&profile.completedRuns?.includes(runId)){if(profile.activeRun?.id===runId)profile.activeRun=null;return [];}
  profile.runs++;profile.totalKills+=result.kills;profile.bestKills=Math.max(profile.bestKills,result.kills);profile.parts+=result.parts;
  if(result.won&&!result.expeditionId){profile.wins++;profile.bestTime=profile.bestTime?Math.min(profile.bestTime,Math.round(result.time)):Math.round(result.time);}
  const expedition=planExpeditionCompletion(profile.expeditions,result);if(expedition)profile.expeditions=expedition;
  const campaign=planMissionCompletion(profile.campaign,result);if(campaign)profile.campaign=campaign;
  const unlocked=[];if((profile.totalKills>=100||profile.wins>0)&&!profile.unlocked.includes('nailgun')){profile.unlocked.push('nailgun');unlocked.push('nailgun');}
  if(runId){profile.completedRuns=[...(profile.completedRuns||[]),runId].slice(-64);if(profile.activeRun?.id===runId)profile.activeRun=null;}return unlocked;
}
