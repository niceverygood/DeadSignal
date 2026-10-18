import test from 'node:test';import assert from 'node:assert/strict';
import {Game,circleRect} from '../dist/engine.js';import {NORTH_EXPEDITION,expeditionTarget,expeditionTransport,updateExpedition} from '../dist/expedition.js';
import {escortBlockReason} from '../dist/escort.js';import {firingIntent} from '../dist/firing.js';
const fresh=()=>{const g=new Game({seed:774,expeditionId:NORTH_EXPEDITION.id,weapon:'nailgun'});g.enemies=[];g.spawnClock=1e9;return g;};
test('walking, dashing and knockback cannot tunnel through the physical convoy body',()=>{
 for(const r of [12,14,27,49]){const g=fresh(),actor={x:700,y:1300,r};g.move(actor,600,0);assert.ok(actor.x<=871-r+.001);assert.equal(circleRect(actor.x,actor.y,r,expeditionTransport(g)),false);assert.ok(actor.walkPhase>0);}
});
test('moving convoy stops before touching the player and resumes after the front is cleared',()=>{
 const g=fresh();g.expedition.step=2;Object.assign(g.player,{x:944,y:1300});const target=expeditionTarget(g),before={x:g.player.x,y:g.player.y,hp:g.player.hp};
 assert.equal(g.blocked(g.player.x,g.player.y,g.player.r),false);assert.equal(escortBlockReason(g,target,.05),'player');updateExpedition(g,.05,{});assert.equal(g.expedition.hold,0);
 assert.deepEqual({x:g.player.x,y:g.player.y,hp:g.player.hp},before);g.move(g.player,0,100);updateExpedition(g,.05,{});assert.equal(g.expedition.hold,.05);assert.equal(g.blocked(g.player.x,g.player.y,g.player.r),false);
});
test('local navigation routes a body around a parked convoy without rebuilding static grids or entering it',()=>{
 for(const r of [12,14,19,27,49]){const g=fresh(),actor={x:700,y:1300,r},target={x:1100,y:1300};
 for(let i=0;i<2200&&Math.hypot(actor.x-target.x,actor.y-target.y)>15;i++){const d=g.navigation.direction(actor,target,actor.r);g.move(actor,d.x*3,d.y*3);assert.equal(g.blocked(actor.x,actor.y,actor.r),false);}
 assert.ok(Math.hypot(actor.x-target.x,actor.y-target.y)<20,JSON.stringify(actor));}
});
test('convoy blocks real bullets and auto aim with native metal feedback, without damage or explosions',()=>{
 const g=fresh();Object.assign(g.player,{x:700,y:1300,angle:0});const enemy=g.spawnEnemy('walker',400,{x:1100,y:1300});assert.ok(enemy);enemy.hp=enemy.maxHp=500;
 assert.equal(firingIntent(g,{mode:'auto'}).shoot,false);assert.equal(g.navigation.lineOfSight(g.player,enemy,3,{allowVoid:true}),false);
 const body=expeditionTransport(g);g.shoot();g.updateBullets(.5);assert.equal(enemy.hp,500);assert.equal(g.bullets.length,0);assert.equal(body.hp,Infinity);assert.equal(body.destroyed,false);
 assert.ok(g.particles.some(p=>p.kind==='weapon-impact'&&p.surface==='metal'&&p.targetId==='wall-expedition-transport'));
 const events=g.drainEvents();assert.ok(events.some(e=>e.type==='wall-hit'&&e.material==='metal'));assert.ok(!events.some(e=>e.type==='explosion'));
 const clear=g.spawnEnemy('walker',400,{x:700,y:1100});assert.ok(clear);assert.equal(firingIntent(g,{mode:'auto'}).targetId,clear.id);
});
test('pre-collision overlapping convoy saves recover nearby without losing progress, RNG, health or IDs',()=>{
 const g=fresh();g.expedition.step=2;g.expedition.hold=7;Object.assign(g.player,{x:1180,y:1300});const raw=g.snapshot();assert.ok(raw);
 const r=Game.restore(raw,{resumePlaying:true});assert.ok(r);assert.equal(r.blocked(r.player.x,r.player.y,r.player.r),false);
 assert.ok(Math.hypot(r.player.x-raw.player.x,r.player.y-raw.player.y)<80);assert.equal(r.player.hp,raw.player.hp);assert.equal(r.id,raw.id);assert.deepEqual(r.expedition,raw.expedition);assert.equal(r.random.getState(),raw.randomState);assert.equal(r.visualRandom.getState(),raw.visualRandomState);assert.deepEqual(r.snapshot().world,raw.world);
 const stable=r.snapshot();assert.deepEqual(Game.restore(stable,{resumePlaying:true}).snapshot(),stable);
 const legacy=new Game({seed:774}).snapshot();assert.deepEqual(Game.restore(legacy,{resumePlaying:true}).snapshot(),legacy);
});
