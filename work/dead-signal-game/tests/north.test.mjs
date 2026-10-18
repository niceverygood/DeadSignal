import test from 'node:test';import assert from 'node:assert/strict';
import {Game,circleRect} from '../dist/engine.js';import {ActorInterpolation} from '../dist/actor-interpolation.js';
import {NORTH_EXPEDITION,NORTH_STEPS,HOSPITAL_EXPEDITION,getExpedition,expeditionUnlocked,expeditionTarget,expeditionTransport,updateExpedition} from '../dist/expedition.js';
import {escortPoint,escortBlocked} from '../dist/escort.js';import {productionLaunchPlan,launchWorld} from '../dist/launch-gate.js';import {expeditionManifest} from '../dist/expedition-art.js';import {productionManifest} from '../dist/production-manifest.js';import {expeditionResultHTML} from '../dist/expedition-ui.js';
const escort=NORTH_STEPS[2];
const fresh=()=>{const g=new Game({seed:774,expeditionId:NORTH_EXPEDITION.id});g.enemies=[];g.spawnClock=1e9;return g;};
test('northern fresh launch has exact native checkpoint/bunker/vehicle coverage and valid save theme',()=>{
 const g=new Game({seed:0,expeditionId:NORTH_EXPEDITION.id});assert.deepEqual(launchWorld({expeditionId:NORTH_EXPEDITION.id}),g.world);
 const plan=productionLaunchPlan({manifest:expeditionManifest(productionManifest),weapon:'shotgun',world:g.world});assert.deepEqual(plan.missing,[]);
 for(const id of ['env-broken-car','env-checkpoint-guardhouse','env-armory-bunker'])assert.ok(plan.assetIds.includes(id));
 assert.ok(Game.restore(g.snapshot()));assert.equal(getExpedition(HOSPITAL_EXPEDITION.id).nextId,NORTH_EXPEDITION.id);
 assert.equal(expeditionUnlocked(null,NORTH_EXPEDITION.id),false);assert.equal(expeditionUnlocked({cleared:[HOSPITAL_EXPEDITION.id]},NORTH_EXPEDITION.id),true);
});
test('escort uses constant-distance polyline travel and every payload footprint stays clear',()=>{
 const g=fresh();assert.deepEqual(escortPoint(escort,0),{x:900,y:1300,angle:0});assert.deepEqual(escortPoint(escort,30),{x:1700,y:900,angle:0});
 assert.equal(escortPoint(escort,7.5).x,1200);assert.equal(escortPoint(escort,17.5).y,900);
 let previous=escortPoint(escort,0).angle;for(let i=1;i<=600;i++){const angle=escortPoint(escort,i/20).angle;assert.ok(Math.abs(angle-previous)<.06,'heading snapped at '+i/20);previous=angle;}
 for(let i=0;i<=300;i++){const p=escortPoint(escort,i/10);assert.equal(g.world.obstacles.some(o=>!o.destroyed&&circleRect(p.x,p.y,65,o)),false,'payload blocked at '+JSON.stringify(p));}
 const actor={...g.player};for(const target of NORTH_STEPS){const arrival=target.id==='north-manifest'?target.radius-1:target.kind==='escort'?target.radius-10:25;for(let i=0;i<2500&&Math.hypot(actor.x-target.x,actor.y-target.y)>arrival;i++){const d=g.navigation.direction(actor,target,actor.r);g.move(actor,d.x*4,d.y*4);}assert.ok(Math.hypot(actor.x-target.x,actor.y-target.y)<target.radius,target.id);}
});
test('escort advances only beside a clear vehicle, holds without reversing when blocked or away, and freezes paused',()=>{
 const g=fresh();g.expedition.step=2;Object.assign(g.player,{x:900,y:1380});updateExpedition(g,2,{});assert.equal(g.expedition.hold,2);
 const t=expeditionTarget(g),enemy=g.spawnEnemy('walker',400);Object.assign(enemy,{x:t.x+50,y:t.y});assert.equal(escortBlocked(g,t),true);
 updateExpedition(g,5,{});assert.equal(g.expedition.hold,2);g.damageEnemy(enemy,1e6);g.player.x=2000;g.player.y=1500;updateExpedition(g,5,{});assert.equal(g.expedition.hold,2);
 const raw=g.snapshot(),restored=Game.restore(raw,{resumePlaying:true});assert.ok(restored);assert.deepEqual(expeditionTransport(restored),expeditionTransport(g));
 g.pause();updateExpedition(g,5,{});assert.equal(g.expedition.hold,2);
});
test('vehicle render interpolation is smooth and cannot alter progress, RNG or checkpoints',()=>{
 const g=fresh();g.expedition.step=2;Object.assign(g.player,{x:900,y:1380});const interpolation=new ActorInterpolation();interpolation.capture(g);g.time+=.05;updateExpedition(g,.05,{});
 const raw=g.snapshot(),rng=g.random.getState();const a=expeditionTransport(interpolation.sample(g,0,.05)).x,b=expeditionTransport(interpolation.sample(g,.5,.05)).x,c=expeditionTransport(interpolation.sample(g,1,.05)).x;
 assert.ok(a<b&&b<c);assert.deepEqual(g.snapshot(),raw);assert.equal(g.random.getState(),rng);
 g.pause();assert.equal(expeditionTransport(interpolation.sample(g,.1,.05)).x,c);
});
test('actual expedition completion keeps payload at arrival and awards the earned Israel cargo clue only after exit',()=>{
 const g=fresh();for(const t of NORTH_STEPS.slice(0,2)){Object.assign(g.player,{x:t.x,y:t.y});g.enemies=[];updateExpedition(g,t.duration,{interact:true});}
 g.enemies=[];for(let i=0;i<600&&g.expedition.step===2;i++){const t=expeditionTarget(g);Object.assign(g.player,{x:t.x,y:t.y+90});updateExpedition(g,.05,{});}
 assert.equal(g.expedition.step,3);assert.equal(g.state,'playing');assert.equal(expeditionResultHTML(g),'');assert.equal(expeditionTransport(g).x,1671);
 const exit=NORTH_STEPS[3];Object.assign(g.player,{x:exit.x,y:exit.y});g.flash=0;updateExpedition(g,exit.duration,{interact:true});assert.equal(g.state,'victory');assert.equal(g.result.objectivesCompleted,4);assert.match(expeditionResultHTML(g),/이스라엘 하이파/);assert.match(expeditionResultHTML(g),/백신은 아직 확보하지/);
});
