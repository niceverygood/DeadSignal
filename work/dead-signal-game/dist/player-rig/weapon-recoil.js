const smooth=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
// Existing saved recoil countdown drives both impulse and recovery; no new clock.
export function weaponRecoil(weapon,remaining){const age=Math.max(0,Math.min(.12,.12-(Number.isFinite(remaining)?remaining:0))),pulse=remaining>0?smooth(age/.009)*(1-smooth(age/.12)):0;return {age,pulse,retraction:(weapon==='shotgun'?1.1:.35)*pulse};}
// Lethal damage stops the simulation countdown. Release the last muzzle flash
// with the existing renderer end clock instead of leaving a frozen emission.
export function playerMuzzleRecoil(player,deathElapsed=0,ended=player?.hp<=0){
 const remaining=Number.isFinite(player?.recoil)?Math.max(0,player.recoil):0;
 return ended?Math.max(0,remaining-Math.max(0,Number.isFinite(deathElapsed)?deathElapsed:0)):remaining;
}
