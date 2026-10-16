import {project} from './projection.js?v=0.29.0';

export const PRODUCTION_LURE_ENTRY='lure-speaker';
export const DEFAULT_LURE_WORLD_HEIGHT=20;

const positive=value=>Number.isFinite(value)&&value>0;
const own=(object,key)=>!!object&&Object.hasOwn(object,key);

/** Select only a real, active engine lure. The caller owns effects and fetches.
 * propFrame fits obstacle rectangles; a speaker instead keeps its baked scale
 * and ground pivot without borrowing its sound radius as a physical footprint.
 * Q currently creates only an area fire, not an airborne Molotov entity. That
 * area and all weapon/hostile projectiles intentionally have no prop hook here.
 */
export function nativeLureFrame(art,lure){
  if(!lure||!Number.isFinite(lure.x)||!Number.isFinite(lure.y)
    ||!positive(lure.time)||!positive(lure.duration)||lure.time>lure.duration||!positive(lure.radius))return null;
  const manifest=art?.manifest;
  if(!own(manifest?.environment,PRODUCTION_LURE_ENTRY))return null;
  const id=manifest.environment[PRODUCTION_LURE_ENTRY];
  if(typeof id!=='string'||!own(manifest?.assets,id)||typeof art.isReady!=='function'||!art.isReady(id))return null;
  const height=manifest.assets[id].worldHeight??DEFAULT_LURE_WORLD_HEIGHT;
  if(!positive(height)||typeof art.frame!=='function')return null;
  return art.frame(id,{foot:project(lure.x,lure.y),worldHeight:height,
    angle:Number.isFinite(lure.angle)?lure.angle:0,stationary:true});
}

/** True only after the ready atlas actually painted; false keeps legacy art. */
export function drawNativeLure(context,art,lure){
  const selected=nativeLureFrame(art,lure);
  return !!selected&&typeof art.drawFrame==='function'&&art.drawFrame(context,selected)===true;
}
