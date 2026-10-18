import {Game} from './engine.js?v=0.29.0';
import {saveProfile} from './storage.js?v=0.29.0';
import {isQAMemoryStorage} from './qa-storage.js';

export function allowUpgradeStatusQA(location,query,storage){
 return location?.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&location.port==='8851'&&query?.has('qa')&&query.has('qa-memory')&&query.get('qa-upgrade-status')==='15'&&isQAMemoryStorage(storage);
}
// A new own Game earns each level through the real XP/choice APIs. No user run
// or persistent store is read; the genuine memory-store gate precedes all work.
export function seedUpgradeStatusQA(profile,storage,{location,query}={}){
 if(!allowUpgradeStatusQA(location,query,storage))return null;
 const weapon=query.get('qa-upgrade-weapon')??'shotgun';if(!['shotgun','nailgun'].includes(weapon))return null;
 const game=new Game({seed:774,missionId:'mission-01',weapon,training:profile.training,equipment:profile.equipment}),baseEnemies=game.enemies.length,spawnClock=game.spawnClock,selected=[];
 for(let level=2;level<=15;level++){
  game.gainXP(game.player.xpNext-game.player.xp);game.tick(0,{shoot:false,fireMode:'manual'});
  if(game.player.level!==level||game.state!=='upgrade'||game.choices.length!==3)throw Error('qa-upgrade-normal-level-choice-required');
  if(level<15){const id=game.choices[0].id;if(!game.chooseUpgrade(id))throw Error('qa-upgrade-normal-selection-failed');selected.push(id);}
 }
 const snapshot=game.snapshot();if(!snapshot||snapshot.state!=='upgrade'||snapshot.player.level!==15||snapshot.choices.length!==3||game.enemies.length!==baseEnemies||game.spawnClock!==spawnClock)throw Error('qa-upgrade-valid-pending-checkpoint-required');
 const previous=profile.activeRun,envelope={version:1,id:`qa-upgrade-status-15-${weapon}`,savedAt:Date.now(),game:snapshot,selection:{route:'hospital'}};profile.activeRun=envelope;
 if(!saveProfile(profile,storage)){profile.activeRun=previous;throw Error('qa-upgrade-memory-checkpoint-failed');}
 return {kind:'upgrade-status',level:15,levelUps:14,selectedCount:selected.length,selected,offered:[...snapshot.choices],count:baseEnemies,baseEnemies,weapon,seed:game.seed,spawnClock,snapshotValid:true,note:'New owned memory-only Game earns14 levels fromLV1, applies13 first-offered QA choices and leaves the14th choice pending atLV15. Normal HP/training/equipment/XP growth/choices/RNG/enemies/spawnClock are preserved. Continue uses the original launch/UI path. The app-loop observer cannot start while upgrade selection is pending; no user choice or persistent save is touched.'};
}
