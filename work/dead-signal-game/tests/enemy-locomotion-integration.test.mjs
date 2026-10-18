import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ProductionArt} from '../dist/production-art.js';
import {Renderer} from '../dist/renderer.js';
import {productionManifest} from '../dist/production-manifest.js';
import {ENEMY_MOTION_PROFILES} from '../dist/enemy-motion-profiles.js';
import {getBoss} from '../dist/campaign.js';

test('all31 NPCs retain HQ32 moving feet, authored idle/stagger, exact warnings and immutable paused actors',async()=>{
  const ids=new Set([...Object.values(productionManifest.bosses),...Object.values(productionManifest.enemies)].flatMap(x=>typeof x==='string'?[x]:Object.values(x)));
  // Keep the complete original metadata only in ProductionArt. The image stub
  // needs dimensions, not a second permanent copy of every contour/frame.
  const atlasSizes=new Map();
  const find=(url,field)=>[...ids].find(id=>new URL(url).pathname.endsWith('/'+productionManifest.assets[id][field]));
  const ImageCtor=class {set src(url){const size=atlasSizes.get(find(url,'atlas'));this.naturalWidth=size.width;this.naturalHeight=size.height;queueMicrotask(()=>this.onload?.());}};
  const art=new ProductionArt({manifest:productionManifest,baseURL:'https://local.example/assets/production/',ImageCtor,
    fetchImpl:async url=>{const id=find(url,'metadata'),content=await fs.readFile(new URL(`../dist/assets/production/${productionManifest.assets[id].metadata}`,import.meta.url),'utf8');const {width,height}=JSON.parse(content).atlas;atlasSizes.set(id,{width,height});return {ok:true,text:async()=>content};}});
  for(const id of ids)assert.equal(await art.load(id),true,id);
  const renderer=Object.assign(Object.create(Renderer.prototype),{productionArt:art,requestProductionCatalog:()=>{}});
  let count=0;
  for(const [section,mappings]of [['bosses',productionManifest.bosses],['enemies',productionManifest.enemies]])for(const [key,mapping]of Object.entries(mappings)){
    const boss=section==='bosses'?getBoss(key):null,descriptor=productionManifest.assets[mapping.walk];
    const actor={id:++count,x:1200,y:930,angle:0,r:descriptor.referenceRadius,speed:65,hp:100,walkPhase:.7,
      type:boss?'collector':key,attackState:'walk',attackCd:0,skillCd:3,stun:0,hitFlash:0,vx:0,vy:0,...(boss?{bossKey:key}:{})};
    const render=time=>renderer.nativeEnemyFrame(actor,time,{time},boss);
    const idle=render(0);assert.equal(idle.id,mapping.actions);const idleClip=idle.metadata.animation.clips.idle;assert.ok(idle.frame.sample>=idleClip.start&&idle.frame.sample<idleClip.start+idleClip.count);assert.equal(idle.metadata.atlas.samples,32);
    actor.x+=65/60;let before=JSON.stringify(actor),walking=render(1/60);assert.equal(walking.id,mapping.walk);assert.equal(JSON.stringify(actor),before);
    assert.ok(walking.locomotion.cycleDistance>20);assert.ok(Number.isFinite(walking.placement.groundingHeight));
    assert.ok(Math.abs(walking.placement.groundingHeight)<(descriptor.worldHeight||walking.metadata.projection.subjectHeight)*.04+.0001,key);
    actor.x+=65/60;actor.hitFlash=.12;actor.stun=.1;actor.vx=-20;const hit=render(2/60);
    assert.equal(hit.id,mapping.actions,'a real stun/knockback uses the original stagger clip rather than frozen walking legs');assert.equal(hit.locomotion.knocked,true);
    const hitClip=hit.metadata.animation.clips.hit;assert.ok(hit.frame.sample>=hitClip.start&&hit.frame.sample<hitClip.start+hitClip.count);
    const phase=hit.locomotion.phase,frame=hit.frame.index;before=JSON.stringify(actor);
    for(let i=0;i<10;i++){const frozen=render(2/60);assert.equal(frozen.frame.index,frame);assert.equal(frozen.locomotion.phase,phase);}
    assert.equal(JSON.stringify(actor),before);
    actor.stun=0;actor.vx=0;actor.x+=65/60;
    const movingFlash=render(2.5/60);assert.equal(movingFlash.id,mapping.walk,'a non-staggering damage flash preserves the grounded gait');
    actor.hitFlash=0;actor.vx=0;actor.stun=0;actor.attackState='windup';actor.attackTime=boss?.skill.windup||1.15;actor.angle=Math.PI;
    const warning=render(3/60);assert.equal(warning.id,mapping.actions);assert.equal(warning.frame.direction,8,'warnings must show the exact attack direction');assert.ok(warning.frame.sample>=12&&warning.frame.sample<18);
    actor.hp=0;actor.dead=true;const death=render(4/60);assert.equal(death.id,mapping.actions);assert.ok(death.frame.sample>=26);
  }
  assert.equal(count,31);assert.equal(Object.keys(ENEMY_MOTION_PROFILES).length,31);
});
