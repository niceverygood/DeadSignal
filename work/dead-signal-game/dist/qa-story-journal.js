import {Game} from './engine.js';
import {CITY_EXPEDITION,expeditionTarget} from './expedition.js';
// Explicit memory-only QA fixture. Earn the first clue with actual engine input
// before providing its normal checkpoint to the real app's Continue flow.
export function seedJournalQA(profile,query){
 if(!query.has('qa-memory')||!['earned','near'].includes(query.get('qa-journal')))return false;
 const nearOnly=query.get('qa-journal')==='near';
 const game=new Game({seed:774,expeditionId:CITY_EXPEDITION.id});game.enemies=[];game.spawnClock=1e9;
 for(let i=0;i<1200&&game.expedition.step===0;i++){
  const target=expeditionTarget(game),near=Math.hypot(game.player.x-target.x,game.player.y-target.y)<28,d=near?{x:0,y:0}:game.navigation.direction(game.player,target,game.player.r);
  if(nearOnly&&near)break;
  game.tick(1/60,{moveX:d.x,moveY:d.y,interact:near&&!nearOnly,shoot:false,fireMode:'manual'});game.drainEvents();
 }
 if(game.expedition.step!==(nearOnly?0:1))throw Error('qa-journal-first-goal-not-earned');
 if(nearOnly){const target=expeditionTarget(game);if(Math.hypot(game.player.x-target.x,game.player.y-target.y)>=28||game.expedition.hold!==0)throw Error('qa-input-not-near-untouched-goal');}
 game.pause();const snapshot=game.snapshot();if(!Game.restore(snapshot))throw Error('qa-journal-invalid-checkpoint');
 profile.activeRun={version:1,id:nearOnly?'qa-input-near-goal':'qa-journal-earned-goal',savedAt:Date.now(),game:snapshot,selection:{route:game.route}};
 return true;
}
