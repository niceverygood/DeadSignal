import {project} from './projection.js';
import {getBoss} from './campaign.js?v=0.29.0';
import {bossBodyBounds} from './boss-art.js?v=0.29.0';

const metadataIntervals=new WeakMap(),finite=Number.isFinite;
const radii={walker:14,runner:12,shield:19,screamer:15,gas:18,elite:27,collector:49};
const positive=value=>finite(value)&&value>0;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function atlasInterval(metadata){
 if(!metadata||!positive(metadata.projection?.subjectHeight)||!positive(metadata.projection?.pixelsPerWorld)||!Array.isArray(metadata.frames)||!metadata.frames.length)return null;
 const cached=metadataIntervals.get(metadata);if(cached)return cached;
 let left=Infinity,right=-Infinity,immutable=Object.isFrozen(metadata)&&Object.isFrozen(metadata.frames);
 // Cropped frames have different foot pivots. Union every original frame,
 // including transparent padding, rather than trusting a previous pose's alpha.
 for(const frame of metadata.frames){const pivot=frame?.footPivot?.x,width=frame?.rect?.width;if(!finite(pivot)||!positive(width))return null;left=Math.min(left,-pivot);right=Math.max(right,width-pivot);immutable&&=Object.isFrozen(frame)&&Object.isFrozen(frame.rect)&&Object.isFrozen(frame.footPivot);}
 const result={left,right};if(immutable)metadataIntervals.set(metadata,result);return result;
}

// Bounds the WHOLE actor draw horizontally, not just its body alpha. It reads
// ready tables/configuration only: no pose, load, render, pixel read or Game/RNG
// write occurs. Unknown/unready/custom paths retain conservative hard ordering.
export function actorHorizontalInterval(item,renderer,game){
 const actor=item?.kind==='player'?item.p:item?.kind==='enemy'?item.e:item?.kind==='corpse'?item.corpse:null;
 if(!actor||!finite(actor.x)||!finite(actor.y)||!renderer)return null;
 try{
  const q=project(actor.x,actor.y);let left=Infinity,right=-Infinity;
  const include=(a,b)=>{if(!finite(a)||!finite(b)||a>b)return false;left=Math.min(left,a);right=Math.max(right,b);return true;};
  if(item.kind==='corpse'){
   const selected=item.native,placement=selected?.placement;if(!placement||!positive(placement.width)||!finite(placement.x))return null;
   include(placement.x-q.x,placement.x+placement.width-q.x);include(-90,90);
  }else{
   const art=renderer.productionArt,manifest=art?.manifest;if(!(art?.records instanceof Map)||!manifest)return null;
   const player=item.kind==='player',boss=actor.bossKey?getBoss(actor.bossKey):null,type=actor.type||'walker';
   if(!player&&!boss&&!Object.hasOwn(radii,type))return null;
   const section=player?'characters':boss?'bosses':'enemies',specific='survivor-'+actor.weapon,key=player?(manifest.characters?.[specific]?specific:manifest.characters?.survivor?'survivor':null):boss?actor.bossKey:type;
   const mapping=manifest[section]?.[key],ids=[...new Set(typeof mapping==='string'?[mapping]:Object.values(mapping??{}))];if(!ids.length)return null;
   const baseId=typeof mapping==='string'?mapping:mapping.walk||mapping.idle,reference=manifest.assets?.[baseId]?.referenceRadius??boss?.stats.r??radii[type];
   const scale=player?1:positive(reference)?clamp((finite(actor.r)?actor.r:reference)/reference,.72,1.65):null;if(!positive(scale))return null;
   const model=player?null:(boss?renderer.liveBoss:renderer.liveEnemies)?.models?.get(boss?key:'enemy-'+key),rig=player?null:boss?renderer.liveBoss:renderer.liveEnemies;
   for(const id of ids){
    const record=art.records.get(id);if(record?.status!=='ready'||!record.image)return null;
    const interval=atlasInterval(record.metadata),height=player?44:(manifest.assets?.[id]?.worldHeight??record.metadata?.projection?.subjectHeight)*scale;
    if(!interval||!positive(height))return null;
    const factor=height/record.metadata.projection.subjectHeight/record.metadata.projection.pixelsPerWorld;include(interval.left*factor,interval.right*factor);
    // A live original native frame is a private full256/512 cell. Use its
    // complete canvas, not a previous alpha crop or a guessed collision radius.
    if(model){const p=model.config?.projection,size=rig.size,resolution=size/256,density=p?.pixelsPerWorld*resolution,factor=height/p?.subjectHeight/density,pivot=p?.footPivot?.x*resolution;if(!positive(size)||!positive(density)||!positive(factor)||!finite(pivot))return null;include(-pivot*factor,(size-pivot)*factor);}
   }
   if(player){
    // Original live-player raster uses the orthographic projected view and a
    // full private canvas; its camera already contains the exact pixel density.
    const camera=renderer.livePlayer?.ready&&renderer.livePlayer.camera;
    if(camera?.isOrthographicCamera){const k=Math.sqrt(3/2);if(!include(camera.left*k,camera.right*k))return null;}
    include(-26,26); // original shadows, centered RELOAD text and line
    if(actor.dashTime>0){const dx=finite(actor.dashX)?actor.dashX:0,dy=finite(actor.dashY)?actor.dashY:0;for(let i=1;i<4;i++){const offset=project(-dx*i*14,-dy*i*14).x;include(offset-8,offset+8);}}
   }else if(boss){
    const bounds=bossBodyBounds(boss,actor),shadow=(boss.role==='final'?39:26)*bounds.scale;
    include(Math.min(-64,3-shadow,-16*bounds.scale),Math.max(64,3+shadow,16*bounds.scale)); // plaque126+stroke, HP82/58, burn and stun
   }else{
    const collector=type==='collector',s=collector?(finite(actor.r)?actor.r:49)/42:clamp((finite(actor.r)?actor.r:14)/14,.9,1.55);
    include(2-(collector?43:14)*s,2+(collector?43:14)*s);include(-Math.max(37,35*s),Math.max(37,35*s)); // native role plaque, burn glow, health/stun
    if(type==='elite'){const radius=(finite(actor.r)?actor.r:27)+5;include(-radius*Math.sqrt(1.5)-1,radius*Math.sqrt(1.5)+1);}
   }
  }
  // The normal renderer zoom is>=.88. Two projected-world units enclose its
  // antialiased edges/strokes. A custom camera/zoom cannot certify this bound.
  if(!finite(renderer.zoom)||renderer.zoom<.88)return null;
  return finite(left)&&finite(right)&&left<right?{left:q.x+left-2,right:q.x+right+2}:null;
 }catch{return null;}
}
