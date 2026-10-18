import {getExpedition} from './expedition.js';

// Quest access is derived so existing snapshots keep their original world bytes.
export function exitPresentation(game){
 const exit=game.world?.exit,definition=getExpedition(game.expedition?.id),last=definition?.steps.at(-1);
 const missionExit=!!exit&&!!last&&Math.hypot(exit.x-last.x,exit.y-last.y)<1;
 const questReady=missionExit&&game.expedition.step>=definition.steps.length-1&&(!definition.vaccineEnding||game.expedition.bossDefeated===true);
 const open=Boolean(exit?.open)||questReady;
 const label=questReady?(definition.vaccineEnding?(game.state==='victory'?'VACCINE / SECURED':'VACCINE TRANSPORT / READY'):'MISSION EXIT / READY'):open?(game.stage===2?'EXTRACTION / OPEN':'NEXT SECTOR / OPEN'):'GATE / LOCKED';
 return {open,label};
}
