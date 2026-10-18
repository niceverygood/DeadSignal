import {selectLiveEnemies,selectLiveCorpses} from './live-enemy-selection.js';

const TYPES=new Set(['walker','runner','shield','screamer','gas','elite','collector']);
// Keep GPU startup residency bounded independently of the complete baked roster.
// Read only the saved Game; never construct a preview Game or consume its RNG.
export function nativeLaunchKeys({mission=null,game=null}={}){
  const types=game
    ?[...selectLiveEnemies(game,12,{radius:Infinity}),...selectLiveCorpses(game,12)].map(actor=>actor.type)
    :mission?(mission.enemyPool||[]).filter(item=>item.weight>0).map((item,index)=>({...item,index})).sort((a,b)=>b.weight-a.weight||a.index-b.index).map(item=>item.type):['walker'];
  return [...new Set(types.filter(type=>TYPES.has(type)))].slice(0,3).map(type=>'enemy-'+type);
}
