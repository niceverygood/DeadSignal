import test from 'node:test';import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';import {recordDamageContact,damageContact,drawDamageContact} from '../dist/damage-feedback.js';import {ActorInterpolation} from '../dist/actor-interpolation.js';
test('accepted damage records isometric source while rejected invulnerable hits do not replace it',()=>{
 const g=new Game({seed:774});g.player.invul=0;const rng=g.random.getState();g.hurtPlayer(8,{x:g.player.x+100,y:g.player.y});
 const hit=damageContact(g.player,g.time);assert.ok(hit.x>0&&hit.y>0);assert.equal(g.player.hp,92);assert.equal(g.random.getState(),rng);
 g.hurtPlayer(8,{x:g.player.x-100,y:g.player.y});assert.deepEqual(damageContact(g.player,g.time),hit);
 const restored=Game.restore(g.snapshot());assert.ok(restored);assert.equal(damageContact(restored.player,restored.time),null);
});
test('contact uses simulation clock and persistent interpolated actor prototypes',()=>{
 const g=new Game({seed:774}),i=new ActorInterpolation();g.player.invul=0;i.capture(g);g.hurtPlayer(8,{x:g.player.x,y:g.player.y+100});
 const view=i.sample(g,.5,1/60),hit=damageContact(view.player,view.time);assert.ok(hit.x<0&&hit.y>0);
 g.state='paused';g.tick(.5,{});assert.equal(damageContact(g.player,g.time).alpha,1);
 assert.equal(damageContact(g.player,g.time+.66),null);
});
test('unknown or coincident source clears stale direction and drawing restores canvas',()=>{
 const g=new Game({seed:774});recordDamageContact(g.player,0,{x:0,y:0});let depth=0,strokes=0;
 const c=new Proxy({save(){depth++;},restore(){depth--;},stroke(){strokes++;}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 const before=JSON.stringify(g.snapshot());assert.equal(drawDamageContact(c,g,900,600),true);assert.equal(depth,0);assert.equal(strokes,2);assert.equal(JSON.stringify(g.snapshot()),before);
 recordDamageContact(g.player,0,g.player);assert.equal(damageContact(g.player,0),null);recordDamageContact(g.player,0,{x:0,y:0});recordDamageContact(g.player,0,null);assert.equal(damageContact(g.player,0),null);
});
test('source metadata leaves damage, events and serialized snapshot exactly identical',()=>{
 const a=new Game({seed:774}),b=new Game({seed:774});a.player.invul=b.player.invul=0;a.hurtPlayer(8,{x:100,y:200});b.hurtPlayer(8);
 assert.deepEqual(a.drainEvents(),b.drainEvents());assert.deepEqual(a.snapshot(),b.snapshot());
});
