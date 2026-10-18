import {FireGround} from '../dist/fire-ground.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {Game,circleRect} from '../dist/engine.js';import {Renderer} from '../dist/renderer.js';
import {SEA_EXPEDITION,SEA_STEPS,NORTH_EXPEDITION,getExpedition,expeditionUnlocked,expeditionTarget,expeditionGuardCount,updateExpedition} from '../dist/expedition.js';
import {SEA_WATER,validSeaWater,inWater} from '../dist/sea-world.js';import {drawSeaWater,supportedGround} from '../dist/sea-art.js';import {expeditionManifest} from '../dist/expedition-art.js';import {productionManifest} from '../dist/production-manifest.js';import {launchWorld,productionLaunchPlan} from '../dist/launch-gate.js';import {radioCue} from '../dist/story-radio.js';import {expeditionResultHTML} from '../dist/expedition-ui.js';
const fresh=()=>{const g=new Game({seed:774,expeditionId:SEA_EXPEDITION.id});g.enemies=[];g.spawnClock=1e9;return g;};
const at=(g,p)=>Object.assign(g.player,{x:p.x,y:p.y});
test('sea launch matches actual original-art world and requires northern cargo evidence',()=>{
 const g=new Game({seed:0,expeditionId:SEA_EXPEDITION.id});assert.deepEqual(launchWorld({expeditionId:SEA_EXPEDITION.id}),g.world);
 const plan=productionLaunchPlan({manifest:expeditionManifest(productionManifest),weapon:'shotgun',world:g.world});assert.deepEqual(plan.missing,[]);for(const id of ['env-harbor-container','env-breakwater-control-building'])assert.ok(plan.assetIds.includes(id));
 assert.equal(getExpedition(NORTH_EXPEDITION.id).nextId,SEA_EXPEDITION.id);assert.equal(expeditionUnlocked(null,SEA_EXPEDITION.id),false);assert.equal(expeditionUnlocked({cleared:[NORTH_EXPEDITION.id]},SEA_EXPEDITION.id),true);assert.ok(Game.restore(g.snapshot()));
});
test('all relay zones and boarding objectives are physically reachable without crossing water',()=>{
 for(const r of [14,27,49]){const g=fresh(),actor={x:g.player.x,y:g.player.y,r},targets=[SEA_STEPS[0],SEA_STEPS[1],...SEA_STEPS[2].zones,SEA_STEPS[2].zones[0],SEA_STEPS[2].zones[1],SEA_STEPS[3],SEA_STEPS[4]];
  for(const t of targets){assert.equal(g.blocked(t.x,t.y,r),false);for(let i=0;i<3000&&Math.hypot(actor.x-t.x,actor.y-t.y)>25;i++){const d=g.navigation.direction(actor,t,r);g.move(actor,d.x*4,d.y*4);assert.equal(g.blocked(actor.x,actor.y,r),false);}assert.ok(Math.hypot(actor.x-t.x,actor.y-t.y)<30,JSON.stringify({r,t,actor}));}
 }
 const g=fresh(),edge={x:1970,y:700,r:14};g.move(edge,500,0);assert.ok(edge.x<=2016);assert.equal(inWater(g.world,edge.x,edge.y),false);assert.equal(g.navigation.lineOfSight({x:1970,y:700},{x:2120,y:700},14),false);
});
test('cross-channel relay keeps earned progress, changes real target every8 seconds, pauses and restores mid-channel',()=>{
 const g=fresh();g.expedition.step=2;at(g,SEA_STEPS[2].zones[0]);updateExpedition(g,8,{});assert.equal(g.expedition.hold,8);assert.equal(expeditionTarget(g).channel,1);assert.equal(g.drainEvents().filter(e=>e.type==='expedition-relay').length,1);
 updateExpedition(g,2,{});assert.equal(g.expedition.hold,8);const r=Game.restore(g.snapshot(),{resumePlaying:true});assert.ok(r);assert.equal(expeditionTarget(r).channel,1);
 g.pause();updateExpedition(g,10,{});assert.equal(g.expedition.hold,8);g.resume();
 for(let i=1;i<4;i++){at(g,SEA_STEPS[2].zones[i%2]);updateExpedition(g,8,{});}
 assert.equal(g.expedition.step,3);assert.equal(expeditionGuardCount(g),1);assert.equal(g.state,'playing');assert.equal(g.drainEvents().filter(e=>e.type==='expedition-relay').length,2);
 g.damageEnemy(g.enemies.find(e=>e.gatekeeper),100000);at(g,SEA_STEPS[3]);updateExpedition(g,1,{});assert.equal(g.expedition.step,4);assert.equal(expeditionResultHTML(g),'');at(g,SEA_STEPS[4]);updateExpedition(g,3,{interact:true});assert.equal(g.state,'victory');assert.match(expeditionResultHTML(g),/이스라엘 격리 배양 시설/);assert.match(expeditionResultHTML(g),/백신은 아직 확보하지/);
});
test('saved water boundary is canonical and cannot smuggle new hazards into old runs or place actors in the sea',()=>{
 const g=fresh(),raw=g.snapshot();assert.ok(validSeaWater(SEA_WATER));const r=Game.restore(raw);assert.equal(r.world.water,SEA_WATER);
 const altered=structuredClone(raw);altered.world.water[0].w=1;assert.equal(Game.restore(altered),null);
 const wet=structuredClone(raw);wet.player.x=2120;wet.player.y=500;assert.equal(Game.restore(wet),null);
 const old=new Game({seed:774}).snapshot();old.world.water=structuredClone(SEA_WATER);assert.equal(Game.restore(old),null);
 for(let i=0;i<50;i++){const e=g.spawnEnemy('walker',500);assert.ok(e);assert.ok(!g.world.water.some(w=>circleRect(e.x,e.y,e.r,w)));}
});
test('Molotov landing in water makes a splash and never creates floating persistent fire',()=>{
 const g=fresh();at(g,{x:1970,y:700});assert.equal(g.throwFire(2120,700),true);for(let i=0;i<45;i++)g.updateMolotovs(.05);
 assert.equal(g.throwables.length,0);assert.equal(g.fires.length,0);assert.ok(g.particles.some(p=>p.kind==='splash-ring'));assert.equal(g.drainEvents().filter(e=>e.type==='fire-fall').length,1);assert.ok(g.snapshot());
 assert.equal(supportedGround(g.world,2120,700),false);assert.equal(supportedGround(g.world,2190,975),true);
});
test('water rendering preserves canvas/world state and original native fire clusters stay on supported ground',()=>{
 let depth=0,contains=null,clipRule=null;const raw={save(){depth++;},restore(){depth--;},clip(rule){clipRule=rule;},createRadialGradient(){return {addColorStop(){}};}};
 const c=new Proxy(raw,{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>{o[k]=v;return true;}}),g=fresh(),before=JSON.stringify(g.world);
 assert.equal(drawSeaWater(c,g.world,2),true);assert.equal(depth,0);assert.equal(JSON.stringify(g.world),before);
 Renderer.prototype.drawFire.call({fireGround:new FireGround(()=>({getContext:()=>new Proxy({createRadialGradient(){return {addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:()=>{}})})),visible:()=>true,motionEnabled:false,fireArt:{drawClusters(_c,options){contains=options.contains;return true;}}},c,{x:2010,y:700,r:90,time:1,duration:4},0,g.world);
 assert.equal(contains(2120,700),false);assert.equal(contains(1970,700),true);assert.equal(clipRule,'evenodd');assert.equal(depth,0);
 assert.match(radioCue({...g,expedition:{...g.expedition,step:2,hold:8}},{type:'expedition-relay',step:2,channel:1}).text,/채널 B/);
});
