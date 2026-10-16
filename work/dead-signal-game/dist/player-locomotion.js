// Measured from the unchanged, normalized 44-unit survivor GLBs. The planted
// foot's backwards travel cancels this much world travel per complete cycle.
// Evidence: production-assets/qa/player-locomotion-diagnosis-20261016.json.
export const PLAYER_WALK_CYCLE_DISTANCE = 39.37121;
export const PLAYER_RUN_CYCLE_DISTANCE = 84.94224;
export const PLAYER_RUN_THRESHOLD = 64;

export function measuredPlayerGait(walkDuration, runDuration) {
  return {
    walkDuration, runDuration,
    walkCycleDistance: PLAYER_WALK_CYCLE_DISTANCE,
    runCycleDistance: PLAYER_RUN_CYCLE_DISTANCE,
  };
}
