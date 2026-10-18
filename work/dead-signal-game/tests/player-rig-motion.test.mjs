import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayerRigMotion,signedAngle} from '../dist/player-rig-motion.js';
import {PLAYER_RUN_CYCLE_DISTANCE} from '../dist/player-locomotion.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('eight travel directions keep independent aim and the planted-foot travel sign',()=>{
  for(let direction=0;direction<8;direction++)for(let aim=0;aim<16;aim++){
    const angle=direction*Math.PI/4,actor={x:0,y:0,angle:aim*Math.PI/8},clock=new PlayerRigMotion();
    clock.select(actor,0);actor.x+=Math.cos(angle)*128/60;actor.y+=Math.sin(angle)*128/60;
    const before=JSON.stringify(actor),pose=clock.select(actor,1/60);
    near(signedAngle(pose.lowerAngle+(pose.reverse?Math.PI:0)-angle),0);
    near(signedAngle(pose.lowerAngle+pose.upperTwist-actor.angle),0);
    assert.ok(Math.abs(pose.upperTwist)<=Math.PI/2+1e-7);
    near(pose.speed,128);assert.equal(before,JSON.stringify(actor));
  }
});

test('distance-driven gait is consistent across render rates and save phase is preserved',()=>{
  for(const hz of [20,30,60,120]){
    const actor={x:0,y:0,angle:0,walkPhase:9},clock=new PlayerRigMotion();clock.select(actor,0);
    let pose;for(let i=1;i<=hz;i++){actor.x=128*i/hz;pose=clock.select(actor,i/hz);}
    near(pose.phase,(128/PLAYER_RUN_CYCLE_DISTANCE)%1);assert.equal(actor.walkPhase,9);
  }
});

test('backpedal reverses the original gait, sidestep follows travel, pause and wall stop freeze phase',()=>{
  const actor={x:0,y:0,angle:0},clock=new PlayerRigMotion();clock.select(actor,0);
  actor.x=-2;const backward=clock.select(actor,1/60);assert.equal(backward.reverse,true);near(backward.lowerAngle,0);
  for(let i=0;i<10;i++)assert.equal(clock.select(actor,1/60),backward);
  const stopped=clock.select(actor,2/60);assert.equal(stopped.moving,false);near(stopped.phase,backward.phase);
  actor.y=2;const side=clock.select(actor,3/60);near(side.lowerAngle,Math.PI/2);near(side.upperTwist,-Math.PI/2);
});

test('auto-aim noise near perpendicular does not flip the hips each frame',()=>{
  const actor={x:0,y:0,angle:0},clock=new PlayerRigMotion();clock.select(actor,0);
  const modes=[];
  for(let i=1;i<=30;i++){actor.y+=2;actor.angle=(i%2?1:-1)*.03;modes.push(clock.select(actor,i/60).reverse);}
  assert.equal(new Set(modes).size,1);
});

test('restoration and long discontinuities never animate teleport distance',()=>{
  const actor={x:0,y:0,angle:0},clock=new PlayerRigMotion();clock.select(actor,10);
  actor.x=1000;const restored=clock.select(actor,0);near(restored.phase,0);assert.equal(restored.moving,false);
  actor.x=2000;const gap=clock.select(actor,10);near(gap.phase,0);assert.equal(gap.moving,false);
});
