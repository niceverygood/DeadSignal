import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NPC_REVIEW_CHOICES,createNpcReviewScene,controlledNpcReviewTick,dueNpcReviewTicks,npcReviewFingerprint,npcReviewHash,npcAngleDifference} from '../dist/enemy-motion-review.js';

const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('NPC review creates all 24 real campaign bosses and 7 distinct ordinary enemies on original maps',()=>{
 assert.equal(NPC_REVIEW_CHOICES.length,31);assert.equal(new Set(NPC_REVIEW_CHOICES.map(c=>c.id)).size,31);
 for(const choice of NPC_REVIEW_CHOICES){const {game,actor,clearCorridor}=createNpcReviewScene(choice.id);assert.ok(game.enemies.includes(actor));assert.equal(actor.dead,false);assert.ok(!game.blocked(actor.x,actor.y,actor.r));assert.equal(choice.kind==='boss'?actor.bossKey:`enemy:${actor.type}`,choice.id);assert.equal(typeof clearCorridor,'boolean');assert.equal(game.spawnClock,1e9);}
 assert.throws(()=>createNpcReviewScene('unknown'),/invalid-review-actor/);
});
test('controlled NPC review uses actual collision displacement and keeps RNG plus original speed intact',()=>{
 for(const choice of NPC_REVIEW_CHOICES){const {game,actor,clearCorridor}=createNpcReviewScene(choice.id),speed=actor.speed,random=[game.random.getState(),game.visualRandom.getState()],origin={x:actor.x,y:actor.y};
  for(let i=0;i<60;i++)controlledNpcReviewTick(game,actor);const distance=Math.hypot(actor.x-origin.x,actor.y-origin.y);if(clearCorridor)near(distance,speed);else assert.ok(distance<=speed+1e-7);near(game.time,1);assert.equal(actor.speed,speed);assert.deepEqual([game.random.getState(),game.visualRandom.getState()],random);
 }
});
test('wall and stop cases reveal real stopped displacement without pretending a walking sample moved',()=>{
 for(const choice of NPC_REVIEW_CHOICES){const {game,actor}=createNpcReviewScene(choice.id,{direction:0,collision:'on'}),origin={x:actor.x,y:actor.y};for(let i=0;i<60;i++)controlledNpcReviewTick(game,actor);assert.ok(Math.hypot(actor.x-origin.x,actor.y-origin.y)<.02);const phase=actor.walkPhase;for(let i=0;i<60;i++)controlledNpcReviewTick(game,actor,{stop:true});near(actor.x,origin.x);near(actor.y,origin.y);near(actor.walkPhase,phase);
  game.pause();const before=npcReviewFingerprint(game);controlledNpcReviewTick(game,actor);assert.equal(npcReviewFingerprint(game),before);
 }
});
test('bounded review requires actual elapsed screen time and tracks wrapped turn increments',()=>{
 assert.equal(dueNpcReviewTicks(0,0),0);assert.equal(dueNpcReviewTicks(1/60,0),1);assert.equal(dueNpcReviewTicks(.5,0),4);assert.equal(dueNpcReviewTicks(2,119,120),1);assert.equal(dueNpcReviewTicks(5,120,120),0);assert.equal(dueNpcReviewTicks(-1,0),0);
 near(npcAngleDifference(-Math.PI+.1,Math.PI-.1),.2);near(npcAngleDifference(Math.PI-.1,-Math.PI+.1),-.2);
 const {game}=createNpcReviewScene('enemy:walker');game.pause();const before=npcReviewFingerprint(game);for(let i=0;i<60;i++)game.tick(1/60);assert.equal(npcReviewFingerprint(game),before);assert.equal(npcReviewHash(before),npcReviewHash(npcReviewFingerprint(game)));game.visualRandom();assert.notEqual(npcReviewFingerprint(game),before);
});
test('review page keeps all playback isolated from storage and retains manual zoom after resize',async()=>{
 const source=await readFile(new URL('../dist/enemy-motion-review.js',import.meta.url),'utf8'),html=await readFile(new URL('../dist/enemy-motion-review.html',import.meta.url),'utf8');
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|loadProfile|saveProfile|fetch\(/);assert.match(source,/renderer\.resize=\(\)=>\{resize\(\);renderer\.zoom=Number\(\$\('zoom'\)\.value\);\}/);assert.match(source,/selected===state\.candidate/);assert.match(html,/id="turn-90"/);assert.match(html,/id="stop-check"/);assert.match(html,/value="combat"/);assert.match(html,/value="walk"/);
});
