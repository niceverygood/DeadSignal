import {HAIFA_TRANSFER_EXPEDITION,createHaifaTransferWorld} from './haifa-transfer-expedition.js';
import {PATIENT_RECORD_EXPEDITION,createPatientRecordWorld} from './patient-record-expedition.js';
import {HARBOR_POWER_EXPEDITION,createHarborPowerWorld} from './harbor-power-expedition.js';
import {COLD_CHAIN_EXPEDITION,createColdChainWorld} from './cold-chain-expedition.js';
import {FINALE_EXPEDITION_ID,createFinaleWorld} from './finale-world.js';
import {ISRAEL_EXPEDITION_ID,createIsraelWorld} from './israel-world.js';
import {getMission} from './campaign.js?v=0.29.0';
import {SEA_EXPEDITION_ID,createSeaWorld} from './sea-world.js';
import {NORTH_EXPEDITION_ID,createNorthWorld} from './north-world.js';
import {HOSPITAL_EXPEDITION_ID,createHospitalWorld} from './hospital-world.js';
import {getExpedition} from './expedition.js';
import {ROOF_EXPEDITION_ID,createRooftopWorld} from './rooftop-world.js';
import {createCity} from './world.js?v=0.29.0';
import {matchesEnvironmentRule} from './production-rules.js?v=0.29.0';
import {PRODUCTION_LURE_ENTRY} from './production-props.js?v=0.29.0';
import {nativeLaunchKeys} from './native-launch-plan.js';

const own=(object,key)=>!!object&&Object.hasOwn(object,key);

// Read the deterministic layout with a local RNG and local IDs. Exact art
// selection consumes no active Game RNG, IDs, saves or effects.
export function launchWorld({missionId=null,route='hospital',stage=0,expeditionId=null}={}){
  let id=0;
  if(!getMission(missionId)&&expeditionId===HAIFA_TRANSFER_EXPEDITION.id)return createHaifaTransferWorld({seed:0,nextId:()=>++id});
  if(!getMission(missionId)&&expeditionId===PATIENT_RECORD_EXPEDITION.id)return createPatientRecordWorld({seed:0,nextId:()=>++id});
  if(!getMission(missionId)&&expeditionId===HARBOR_POWER_EXPEDITION.id)return createHarborPowerWorld({seed:0,nextId:()=>++id});
  if(!getMission(missionId)&&expeditionId===COLD_CHAIN_EXPEDITION.id)return createColdChainWorld({seed:0,nextId:()=>++id});
  if(!getMission(missionId)&&expeditionId===FINALE_EXPEDITION_ID)return createFinaleWorld({seed:0,nextId:()=>++id});
  if(!getMission(missionId)&&expeditionId===ISRAEL_EXPEDITION_ID)return createIsraelWorld({seed:0,nextId:()=>++id});
  if(!getMission(missionId)&&expeditionId===SEA_EXPEDITION_ID)return createSeaWorld({seed:0,nextId:()=>++id});
  if(!getMission(missionId)&&expeditionId===NORTH_EXPEDITION_ID)return createNorthWorld({seed:0,nextId:()=>++id});
  if(!getMission(missionId)&&expeditionId===HOSPITAL_EXPEDITION_ID)return createHospitalWorld({seed:0,nextId:()=>++id});
  if(!getMission(missionId)&&expeditionId===ROOF_EXPEDITION_ID)return createRooftopWorld({seed:0,nextId:()=>++id});
  const world=createCity({missionId,route,stage,seed:0,random:()=>.5,nextId:()=>++id});
  if(!getMission(missionId)&&getExpedition(expeditionId))world.expeditionId=expeditionId;
  return world;
}

export function productionLaunchPlan({manifest,weapon,mission=null,world,enemyTypes=[],nativeGame=null,strictCoverage=manifest?.strictCoverage===true}){
  const ids=new Set(),missing=new Set(),playerIds=new Set();
  const character=own(manifest?.characters,`survivor-${weapon}`)?`survivor-${weapon}`:own(manifest?.characters,'survivor')?'survivor':null;
  const add=(section,key,player=false)=>{
    if(!own(manifest?.[section],key)){missing.add(`${section}:${key}`);return;}
    const mapping=manifest[section][key],entries=typeof mapping==='string'?[mapping]:mapping&&typeof mapping==='object'&&!Array.isArray(mapping)?Object.values(mapping):[];
    if(!entries.length||entries.some(id=>typeof id!=='string'||!id||!own(manifest?.assets,id)))throw new Error('invalid-registered-production-asset');
    for(const id of entries){ids.add(id);if(player)playerIds.add(id);}
  };
  if(character)add('characters',character,true);else missing.add(`characters:survivor-${weapon}`);
  if(mission){add('bosses',mission.midBoss);add('bosses',mission.finalBoss);}
  // A legacy run crosses three districts without another launch gate. Prepare
  // its complete fixed roster now so later districts never reveal fallback art.
  const types=new Set(mission?mission.enemyPool.filter(item=>item.weight>0).map(item=>item.type):['walker','runner','shield','screamer','gas','elite','collector']);
  // Alarm reinforcements can occur independently of the ordinary mission pool.
  for(const type of ['walker','runner','elite',...enemyTypes])types.add(type);
  for(const type of types)add('enemies',type);
  add('environment',PRODUCTION_LURE_ENTRY);if(world?.rooftop)add('environment','env-common-brick');
  const rules=manifest?.environmentRules||[];
  for(const object of [...(world?.obstacles||[]).filter(object=>!object.destroyed),...(world?.decor||[])]){
    const variant=String(object.variant||'');
    const rule=rules.find(rule=>matchesEnvironmentRule(rule,object,world));
    if(rule)add('environment',rule.entry);else missing.add(`environment:${object.kind}:${variant}`);
  }
  if(strictCoverage&&missing.size)throw new Error('production-coverage-incomplete');
  // Only the player identification outline reads a pixel mask. Enemy/prop
  // occlusion bounds already come from metadata; don't decode unused masks.
  return {weapon,character,rooftop:!!world?.rooftop,bossKeys:mission?[mission.midBoss,mission.finalBoss]:[],assetIds:[...ids],playerIds:[...playerIds],maskIds:[...playerIds].filter(id=>!!manifest.assets[id].bodyAlpha),missing:[...missing],nativeEnemyKeys:nativeLaunchKeys({mission,game:nativeGame})};
}

export async function preloadLaunchPlan(renderer,plan,{signal,prepareNative=false}={}){
  if(signal?.aborted)return false;
  const art=renderer.productionArt;
  if(plan.rooftop&&(!renderer.preloadRooftop||await renderer.preloadRooftop()!==true))return false;
  if(plan.assetIds.length){
    // Limit simultaneous PNG decode/metadata parsing on memory-constrained hosts.
    let allReady=true;for(let start=0;start<plan.assetIds.length;start+=4){
      if(signal?.aborted)return false;
      const results=await Promise.all(plan.assetIds.slice(start,start+4).map(id=>art.load(id,{retry:true})));
      if(results.some(ready=>ready!==true))allReady=false;
    }
    if(!allReady)return false;
  }
  if(signal?.aborted)return false;
  if(plan.character&&await renderer.preloadProductionPlayer(plan.weapon)!==true)return false;
  if(signal?.aborted)return false;
  if(plan.bossKeys?.length&&renderer.preloadProductionBosses)await renderer.preloadProductionBosses(plan.bossKeys);
  if(signal?.aborted)return false;
  const masks=await Promise.all(plan.maskIds.map(id=>art.loadBodyAlpha(id,{retry:true})));
  if(signal?.aborted||!masks.every(ready=>!!ready))return false;
  if(prepareNative&&renderer.prepareProductionEnemyLaunch){
    try{plan.nativeCandidate=await renderer.prepareProductionEnemyLaunch(plan.nativeEnemyKeys,{signal});}
    catch{plan.nativeCandidate=null;}
  }
  return !signal?.aborted;
}

// Loading may fail or be cancelled while a paused run is still usable. Its
// images stay resident until a replacement scene has actually committed.
export function releaseCommittedLaunch(renderer,plan,result){
  try{plan?.nativeCandidate?.dispose();}catch{}
  if(result?.status!=='committed')return [];
  renderer.liveBoss?.releaseUnused(plan.bossKeys||[]);
  return renderer.productionArt.releaseUnusedAssets(plan.assetIds);
}

// Commits are synchronous. A cancelled request keeps its cached fetches but
// can never create a Game, replace a save, or unlock a newer request's UI.
export class LaunchGate{
  constructor({onChange=()=>{}}={}){this.pending=null;this.onChange=onChange;}
  get busy(){return this.pending!==null;}
  cancel(){if(!this.pending)return;const token=this.pending;token.cancelled=true;this.pending=null;token.controller.abort();this.onChange({busy:false,status:'cancelled'});}
  async run({load,isCurrent=()=>true,commit}){
    if(this.busy)return {status:'busy'};
    const token={cancelled:false,controller:new AbortController()};this.pending=token;this.onChange({busy:true,status:'loading'});
    let status='failed';
    try{
      const ready=await load({signal:token.controller.signal});
      if(this.pending!==token||token.cancelled||!isCurrent()){status='cancelled';return {status};}
      if(ready!==true)return {status};
      const value=commit();status='committed';return {status,value};
    }catch(error){status=this.pending!==token||token.cancelled?'cancelled':'failed';return {status,error};}
    finally{if(status!=='committed')token.controller.abort();if(this.pending===token){this.pending=null;this.onChange({busy:false,status});}}
  }
}
