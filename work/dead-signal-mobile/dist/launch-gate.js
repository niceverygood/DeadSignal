import {createCity} from './world.js?v=0.26.0';
import {matchesEnvironmentRule} from './production-rules.js?v=0.26.0';
import {PRODUCTION_LURE_ENTRY} from './production-props.js?v=0.26.0';

const own=(object,key)=>!!object&&Object.hasOwn(object,key);

// Read the deterministic layout with a local RNG and local IDs. Exact art
// selection consumes no active Game RNG, IDs, saves or effects.
export function launchWorld({missionId=null,route='hospital',stage=0}={}){
  let id=0;
  return createCity({missionId,route,stage,seed:0,random:()=>.5,nextId:()=>++id});
}

export function productionLaunchPlan({manifest,weapon,mission=null,world,enemyTypes=[],strictCoverage=manifest?.strictCoverage===true}){
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
  add('environment',PRODUCTION_LURE_ENTRY);
  const rules=manifest?.environmentRules||[];
  for(const object of [...(world?.obstacles||[]).filter(object=>!object.destroyed),...(world?.decor||[])]){
    const variant=String(object.variant||'');
    const rule=rules.find(rule=>matchesEnvironmentRule(rule,object,world));
    if(rule)add('environment',rule.entry);else missing.add(`environment:${object.kind}:${variant}`);
  }
  if(strictCoverage&&missing.size)throw new Error('production-coverage-incomplete');
  // Only the player identification outline reads a pixel mask. Enemy/prop
  // occlusion bounds already come from metadata; don't decode unused masks.
  return {weapon,character,assetIds:[...ids],playerIds:[...playerIds],maskIds:[...playerIds].filter(id=>!!manifest.assets[id].bodyAlpha),missing:[...missing]};
}

export async function preloadLaunchPlan(renderer,plan){
  const art=renderer.productionArt;
  if(plan.assetIds.length){
    const results=await Promise.all(plan.assetIds.map(id=>art.load(id,{retry:true})));
    if(results.some(ready=>ready!==true))return false;
  }
  if(plan.character&&await renderer.preloadProductionPlayer(plan.weapon)!==true)return false;
  const masks=await Promise.all(plan.maskIds.map(id=>art.loadBodyAlpha(id,{retry:true})));
  return masks.every(ready=>!!ready);
}

// Loading may fail or be cancelled while a paused run is still usable. Its
// images stay resident until a replacement scene has actually committed.
export function releaseCommittedLaunch(renderer,plan,result){
  if(result?.status!=='committed')return [];
  return renderer.productionArt.releaseUnusedAssets(plan.assetIds);
}

// Commits are synchronous. A cancelled request keeps its cached fetches but
// can never create a Game, replace a save, or unlock a newer request's UI.
export class LaunchGate{
  constructor({onChange=()=>{}}={}){this.pending=null;this.onChange=onChange;}
  get busy(){return this.pending!==null;}
  cancel(){if(!this.pending)return;this.pending.cancelled=true;this.pending=null;this.onChange({busy:false,status:'cancelled'});}
  async run({load,isCurrent=()=>true,commit}){
    if(this.busy)return {status:'busy'};
    const token={cancelled:false};this.pending=token;this.onChange({busy:true,status:'loading'});
    let status='failed';
    try{
      const ready=await load();
      if(this.pending!==token||token.cancelled||!isCurrent()){status='cancelled';return {status};}
      if(ready!==true)return {status};
      const value=commit();status='committed';return {status,value};
    }catch(error){status=this.pending!==token||token.cancelled?'cancelled':'failed';return {status,error};}
    finally{if(this.pending===token){this.pending=null;this.onChange({busy:false,status});}}
  }
}
