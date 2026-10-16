import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {effectivePlayerSpeed} from '../dist/player-movement.js';
import {reviewInput,dueReviewTicks,reviewFingerprint,reviewHash} from '../dist/motion-review.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function safeGame(){const game=new Game({seed:831572,stageDuration:1e9});game.enemies=[];game.spawnClock=1e9;game.player.invul=9999;return game;}
test('movement review uses legal unchanged original road and actual analog engine displacement',()=>{
 for(const movement of['forward','back','left','right','diagonal'])for(const strength of[1,.4,.25]){
  const game=safeGame(),start={x:game.player.x,y:game.player.y};for(let tick=0;tick<60;tick++)game.tick(1/60,reviewInput({movement,strength},game.player));
  near(Math.hypot(game.player.x-start.x,game.player.y-start.y),effectivePlayerSpeed(game.player)*strength);assert.equal(game.player.speed,214);assert.equal(game.state,'playing');
 }
});
test('review fixed ticks require elapsed wall time and cap frame catch-up',()=>{
 assert.equal(dueReviewTicks(0,0),0);assert.equal(dueReviewTicks(.015,0),0);assert.equal(dueReviewTicks(1/60,0),1);assert.equal(dueReviewTicks(.5,29),1);assert.equal(dueReviewTicks(.5,0),4);assert.equal(dueReviewTicks(1,59),1);assert.equal(dueReviewTicks(4,60),0);assert.equal(dueReviewTicks(2,119,120),1);assert.equal(dueReviewTicks(-1,0),0);
});
test('actual no-input follow-up has no drift; pause fingerprint includes both RNG states',()=>{
 const game=safeGame();for(let tick=0;tick<60;tick++)game.tick(1/60,reviewInput({},game.player));const start={x:game.player.x,y:game.player.y};
 for(let tick=0;tick<60;tick++)game.tick(1/60,reviewInput({movement:'none'},game.player));near(game.player.x,start.x);near(game.player.y,start.y);
 game.pause();const signature=reviewFingerprint(game);for(let tick=0;tick<60;tick++)game.tick(1/60,reviewInput({},game.player));assert.equal(reviewFingerprint(game),signature);assert.equal(reviewHash(signature),reviewHash(reviewFingerprint(game)));game.random();assert.notEqual(reviewFingerprint(game),signature);
});
test('fixed and heading aim are real simulation inputs, and fire fires the actual weapon',()=>{
 const game=safeGame();const fixed=reviewInput({movement:'back'},game.player),heading=reviewInput({movement:'back',aim:'heading'},game.player);assert.ok(fixed.aimY<game.player.y);assert.ok(heading.aimY>game.player.y);
 const before=game.player.ammo;game.tick(1/60,reviewInput({movement:'left',fire:'on'},game.player));assert.equal(game.player.ammo,before-1);assert.equal(game.bullets.length,6);assert.ok(game.player.x<1200);
});
