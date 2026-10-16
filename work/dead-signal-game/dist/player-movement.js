// Preserve the speed stored in existing checkpoints. Only the actual simulation
// displacement changes; upgrade and equipment ratios remain exactly the same.
export const PLAYER_LEGACY_SPEED=214;
export const PLAYER_GROUND_SPEED=128;
export const PLAYER_DASH_SPEED=400;
export function effectivePlayerSpeed(player){
  const legacy=Number.isFinite(player?.speed)?Math.max(0,player.speed):PLAYER_LEGACY_SPEED;
  return legacy*(PLAYER_GROUND_SPEED/PLAYER_LEGACY_SPEED);
}
export function stepPlayerMovement(player,dt,moveX=0,moveY=0){
  const x=Number.isFinite(moveX)?moveX:0,y=Number.isFinite(moveY)?moveY:0;
  if(!(dt>0)||!Number.isFinite(dt))return {x:0,y:0};
  const divisor=Math.max(1,Math.hypot(x,y)),distance=effectivePlayerSpeed(player)*dt;
  // Direction follows the input immediately, with no stored velocity or drift.
  return {x:x/divisor*distance,y:y/divisor*distance};
}
