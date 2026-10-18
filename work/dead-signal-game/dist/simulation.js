import {firingIntent} from './firing.js?v=0.29.0';

export const FIXED_STEP=1/60;

// Keep manual pointer input stable for the frame. Automatic aim must follow the
// latest combat state when a slow frame contains several simulation steps.
function currentCommand(game,command,firingEnabled){
  if(command.fireMode!=='auto')return firingEnabled?command:{...command,shoot:false,targetId:null};
  if(!firingEnabled)return {...command,shoot:false,targetId:null};
  return {...command,...firingIntent(game,{mode:'auto',aimX:command.aimX,aimY:command.aimY})};
}

export function advanceSimulation(game,frameCommand,accumulator,{firingEnabled=true,interpolator=null}={}){
  let first=true;
  while(accumulator>=FIXED_STEP){
    const command=currentCommand(game,frameCommand,firingEnabled);
    const pulseOnly=command.fireMode==='manual'&&command.fireOnce&&command.heldShoot===false;
    interpolator?.capture(game);
    game.tick(FIXED_STEP,{...command,shoot:command.shoot&&(!pulseOnly||first),dash:first&&command.dash,lure:first&&command.lure,molotov:first&&command.molotov,reload:first&&command.reload});
    accumulator-=FIXED_STEP;
    first=false;
  }
  // The renderer also receives the post-step target, so a defeated target loses
  // its aiming marker immediately, including frames that open an upgrade.
  return {accumulator,consumed:!first,command:currentCommand(game,frameCommand,firingEnabled)};
}
