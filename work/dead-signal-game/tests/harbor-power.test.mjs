import test from 'node:test';import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {HARBOR_POWER_EXPEDITION as D,HARBOR_POWER_STEPS as STEPS,NORTH_EXPEDITION,SEA_EXPEDITION,getExpedition,expeditionUnlocked,expeditionTarget,expeditionTransport,planExpeditionCompletion} from '../dist/expedition.js';
import {expeditionManifest} from '../dist/expedition-art.js';import {productionManifest} from '../dist/production-manifest.js';import {productionLaunchPlan,launchWorld} from '../dist/launch-gate.js';
import {storyRouteModel} from '../dist/story-route.js';import {runHarborPowerQA} from '../dist/qa-harbor-power.js';
test('harbor branch preserves the main route and original-art world while exposing its own optional card',()=>{
 const g=new Game({seed:0,expeditionId:D.id});assert.equal(getExpedition(D.id).optional,true);assert.equal(getExpedition(NORTH_EXPEDITION.id).nextId,SEA_EXPEDITION.id);assert.equal(getExpedition(D.id).nextId,SEA_EXPEDITION.id);
 assert.equal(expeditionUnlocked(null,D.id),false);assert.equal(expeditionUnlocked({cleared:[NORTH_EXPEDITION.id]},D.id),true);assert.deepEqual(launchWorld({expeditionId:D.id}),g.world);
 assert.deepEqual(productionLaunchPlan({manifest:expeditionManifest(productionManifest),weapon:'shotgun',world:g.world}).missing,[]);
 const card=storyRouteModel({cleared:[NORTH_EXPEDITION.id]}).find(c=>c.definition.id===D.id);assert.match(card.place,/항만/);assert.match(card.detail,/차량/);assert.equal(card.unlocked,true);
 for(const target of STEPS.flatMap(t=>t.zones||[t]))if(target.kind!=='escort')assert.equal(g.blocked(target.x,target.y,14),false,target.id);
 assert.equal(g.blocked(STEPS[3].guardAt.x,STEPS[3].guardAt.y,27),false);
 assert.ok(Game.restore(g.snapshot()));const bad=g.snapshot();bad.world.water[0].w=1;assert.equal(Game.restore(bad),null);
});
test('harbor transport physically blocks actors and restored navigation while its state stays in saved progress',()=>{
 const g=new Game({seed:774,expeditionId:D.id});g.enemies=[];g.spawnClock=1e9;g.expedition.step=4;g.expedition.hold=12;const t=expeditionTarget(g);g.player.x=t.x-85;g.player.y=t.y;
 assert.equal(g.blocked(t.x,t.y,14),true);const before=expeditionTransport(g);g.pause();g.tick(1);assert.deepEqual(expeditionTransport(g),before);const r=Game.restore(g.snapshot(),{resumePlaying:true});assert.ok(r);assert.deepEqual(expeditionTransport(r),before);assert.equal(r.blocked(t.x,t.y,14),true);
 assert.equal(r.navigation.lineOfSight({x:t.x-100,y:t.y},{x:t.x+100,y:t.y},14),false);
});
test('actual isolated harbor combat completes all eight goals and restores defense and escort without awarding vaccine',async()=>{
 const {report}=await runHarborPowerQA();assert.equal(report.result?.won,true,JSON.stringify(report));assert.equal(report.milestones.length,8);assert.equal(report.defenseRestored,true);assert.equal(report.escortRestored,true);assert.equal(report.result.vaccineRecovered,undefined);
 const progress=planExpeditionCompletion(null,report.result);assert.deepEqual(progress.cleared,[D.id]);assert.equal(expeditionUnlocked(progress,SEA_EXPEDITION.id),false,'optional completion cannot forge the required northern evidence');
});
