import test from 'node:test';import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {HOSPITAL_EXPEDITION,HOSPITAL_STEPS,ROOF_EXPEDITION,CITY_EXPEDITION,getExpedition,expeditionUnlocked,updateExpedition,expeditionGuardCount} from '../dist/expedition.js';
import {expeditionManifest} from '../dist/expedition-art.js';import {productionManifest} from '../dist/production-manifest.js';import {launchWorld,productionLaunchPlan} from '../dist/launch-gate.js';
import {expeditionResultHTML} from '../dist/expedition-ui.js';import {radioCue} from '../dist/story-radio.js';
const fresh=()=>{const g=new Game({seed:774,expeditionId:HOSPITAL_EXPEDITION.id});g.enemies=[];g.spawnClock=1e9;return g;};
const at=(g,t)=>{g.player.x=t.x;g.player.y=t.y;g.flash=0;};
test('hospital fresh launch and actual world agree and all props use original approved native art',()=>{
 const g=new Game({seed:0,expeditionId:HOSPITAL_EXPEDITION.id}),preview=launchWorld({expeditionId:HOSPITAL_EXPEDITION.id});assert.deepEqual(preview,g.world);
 assert.equal(g.world.theme,'hospital');assert.equal(g.world.rooftop,undefined);
 const plan=productionLaunchPlan({manifest:expeditionManifest(productionManifest),weapon:'shotgun',world:g.world});assert.deepEqual(plan.missing,[]);
 assert.ok(plan.assetIds.includes('env-hospital-quarantine-wing'));assert.ok(plan.assetIds.includes('env-power-transformer-bank'));assert.ok(g.snapshot());
});
test('hospital targets and guard are reachable at real player and elite radii without crossing walls',()=>{
 for(const r of [14,27]){const g=fresh(),actor={x:g.player.x,y:g.player.y,r};
  for(const target of HOSPITAL_STEPS){assert.equal(g.blocked(target.x,target.y,r),false,target.id);
   for(let i=0;i<2500&&Math.hypot(actor.x-target.x,actor.y-target.y)>25;i++){const d=g.navigation.direction(actor,target,r);g.move(actor,d.x*4,d.y*4);assert.equal(g.blocked(actor.x,actor.y,r),false);}
   assert.ok(Math.hypot(actor.x-target.x,actor.y-target.y)<30,target.id+' inaccessible');
  }
  const guard=HOSPITAL_STEPS[2].guardAt;assert.equal(g.blocked(guard.x,guard.y,27),false);
 }
});
test('hospital guard blocks records until actually killed and survives checkpoint resume',()=>{
 const g=fresh();for(const t of HOSPITAL_STEPS.slice(0,2)){at(g,t);updateExpedition(g,t.duration,{interact:true});}
 assert.equal(g.expedition.step,2);assert.equal(expeditionGuardCount(g),1);at(g,HOSPITAL_STEPS[2]);updateExpedition(g,20,{interact:true});assert.equal(g.expedition.step,2);assert.equal(g.expedition.hold,0);
 const raw=g.snapshot(),r=Game.restore(raw,{resumePlaying:true});assert.ok(r);assert.equal(expeditionGuardCount(r),1);
 for(const current of [g,r]){current.damageEnemy(current.enemies.find(e=>e.gatekeeper),100000);updateExpedition(current,1,{});assert.equal(current.expedition.step,3);assert.equal(current.state,'playing');assert.equal(current.stageCleared,false);assert.equal(current.world.exit.open,false);}
 assert.deepEqual(r.snapshot(),g.snapshot());assert.match(radioCue(g,{type:'expedition-step',step:3}).text,/통로가 열렸/);
});
test('hospital records require sustained interaction and correct theme, then produce the northern cargo clue',()=>{
 const g=fresh();g.expedition.step=3;const t=HOSPITAL_STEPS[3];at(g,t);updateExpedition(g,1,{interact:true});assert.equal(g.expedition.hold,1);
 const raw=g.snapshot();assert.ok(Game.restore(raw));const wrong=structuredClone(raw);wrong.world.theme='residential';assert.equal(Game.restore(wrong),null);
 g.pause();updateExpedition(g,10,{interact:true});assert.equal(g.expedition.hold,1);g.resume();updateExpedition(g,3,{interact:true});assert.equal(g.expedition.step,4);
 at(g,HOSPITAL_STEPS[4]);updateExpedition(g,3,{interact:true});assert.equal(g.state,'victory');assert.equal(g.result.objectivesCompleted,5);
 assert.match(expeditionResultHTML(g),/북쪽 검역 화물망/);assert.match(expeditionResultHTML(g),/백신은 아직 확보하지/);
 const old=new Game({seed:774}).snapshot();old.world.theme='hospital';assert.equal(Game.restore(old),null);
});
test('roof clear unlocks hospital without bypassing city progress or claiming a completed vaccine',()=>{
 assert.equal(getExpedition(ROOF_EXPEDITION.id).nextId,HOSPITAL_EXPEDITION.id);assert.equal(expeditionUnlocked(null,HOSPITAL_EXPEDITION.id),false);
 assert.equal(expeditionUnlocked({cleared:[CITY_EXPEDITION.id]},HOSPITAL_EXPEDITION.id),false);
 assert.equal(expeditionUnlocked({cleared:[CITY_EXPEDITION.id,ROOF_EXPEDITION.id]},HOSPITAL_EXPEDITION.id),true);
 const g=fresh();assert.match(radioCue(g).text,/냉각 기록/);assert.equal(expeditionResultHTML(g),'');
});
test('a failed guard spawn cannot silently open the hospital archive and can retry from a valid save',()=>{
 const g=fresh();g.expedition.step=1;at(g,HOSPITAL_STEPS[1]);const spawn=g.spawnEnemy;g.spawnEnemy=()=>null;
 updateExpedition(g,3,{interact:true});assert.equal(g.expedition.step,1);assert.ok(g.snapshot());
 g.spawnEnemy=spawn;updateExpedition(g,.1,{interact:true});assert.equal(g.expedition.step,2);assert.equal(expeditionGuardCount(g),1);
});
