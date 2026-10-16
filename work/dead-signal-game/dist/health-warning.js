export const LOW_HEALTH_THRESHOLD=.30;

// Use combat values before HUD rounding, including permanent health upgrades.
export function isCriticalHealth(player){
  return Number.isFinite(player?.hp)&&Number.isFinite(player?.maxHp)&&player.maxHp>0&&player.hp>0&&player.hp/player.maxHp<=LOW_HEALTH_THRESHOLD;
}
