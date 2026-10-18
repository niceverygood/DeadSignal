import test from 'node:test';
import assert from 'node:assert/strict';
import {EnemyLocomotionClock,shortestTurn,enemyGroundingHeight} from '../dist/enemy-locomotion.js';
const tau=Math.PI*2,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('enemy stride is actual distance and body scale, with stable individual phase and no actor writes',()=>{
  const final=[];
  for(const hz of[120,60,30,20]){
    const clock=new EnemyLocomotionClock(),e={id:7,x:0,y:0,angle:0,attackState:'walk',walkPhase:4};
    const first=clock.select(e,0,{cycleDistance:50,scale:1.25});let last;
    for(let i=1;i<=hz;i++){e.x=65*i/hz;last=clock.select(e,i/hz,{cycleDistance:50,scale:1.25});}
    near(last.phase,(first.phase+65/62.5*tau)%tau);near(last.speed,65);near(last.cycleDistance,62.5);
    assert.equal(e.walkPhase,4);assert.deepEqual(Object.keys(e).sort(),['angle','attackState','id','walkPhase','x','y']);final.push(last.phase);
  }
  for(const phase of final)near(phase,final[0]);
  const c=new EnemyLocomotionClock();assert.notEqual(c.select({id:8,x:0,y:0,angle:0},0).phase,c.select({id:9,x:0,y:0,angle:0},0).phase);
});

test('walking turns take the shortest bounded arc while warnings and charges use the exact danger angle',()=>{
  const c=new EnemyLocomotionClock(),e={id:1,x:0,y:0,angle:0,attackState:'walk'};c.select(e,0);
  e.y=4;e.angle=Math.PI/2;const turning=c.select(e,.05,{cycleDistance:60,turnRate:4});near(turning.angle,.2);assert.equal(turning.turning,true);
  e.attackState='windup';e.angle=Math.PI;const warn=c.select(e,.1,{turnRate:4});near(warn.angle,Math.PI);assert.equal(warn.actionFacing,true);near(warn.phase,turning.phase);
  e.attackState='charge';e.x-=30;e.angle=3.3;const charge=c.select(e,.15);near(charge.angle,3.3);near(charge.phase,warn.phase);
  near(shortestTurn(tau-.1,.1),.2);
  const shield={id:2,type:'shield',x:0,y:0,angle:0,attackState:'walk'},sc=new EnemyLocomotionClock();
  const rest=sc.select(shield,0);shield.x=2;shield.angle=1.4;const guard=sc.select(shield,.05);
  near(guard.angle,1.4);assert.notEqual(guard.phase,rest.phase,'shield facing stays honest without freezing its legs');
});

test('blocked movement, paused draws and knockback never spin the legs; restore has deterministic phase',()=>{
  const c=new EnemyLocomotionClock(),e={id:3,x:10,y:10,angle:0};const initial=c.select(e,0);
  e.x+=2;const moved=c.select(e,.05);for(let i=0;i<30;i++)assert.equal(c.select(e,.05),moved);
  const blocked=c.select(e,.1);assert.equal(blocked.pose,'idle');near(blocked.phase,moved.phase);
  e.stun=.2;e.vx=-100;e.x-=5;const hit=c.select(e,.15);assert.equal(hit.knocked,true);near(hit.phase,blocked.phase);
  near(c.select(e,0).phase,initial.phase);
});

test('measured sole correction is limited and never flattens running flight or adjusts actions',()=>{
  const selected={metadata:{atlas:{samples:32},animation:{name:'walk'}},frame:{sample:3}};
  const profile={subjectHeight:50,soleHeights:Array(32).fill(.8),grounding:'measured-skinned-minimum'};
  near(enemyGroundingHeight(selected,profile,1.2),.96);
  near(enemyGroundingHeight(selected,{...profile,soleHeights:Array(32).fill(-20)}),-2);
  near(enemyGroundingHeight(selected,{...profile,grounding:'measured-constant-baseline-preserve-flight',groundingBaseline:.2}),.2);
  assert.equal(enemyGroundingHeight({...selected,metadata:{...selected.metadata,animation:{clips:{walk:{}}}}},profile),0);
});

test('native start/stop weight is time based and keeps distance cadence frozen when blocked',()=>{const results=[];for(const hz of [20,30,60,120]){const c=new EnemyLocomotionClock(),e={id:9,x:0,y:0,angle:0,speed:40};c.select(e,0);let s;for(let i=1;i<=hz;i++){e.x=40*i/hz;s=c.select(e,i/hz);}near(s.moveWeight,1-Math.exp(-1/.075));const phase=s.phase;for(let i=1;i<=hz;i++)s=c.select(e,1+i/hz);near(s.moveWeight,(1-Math.exp(-1/.075))*Math.exp(-1/.12));near(s.phase,phase);assert.equal(s.pose,'idle');assert.equal(c.select(e,2),s);assert.equal(Object.hasOwn(e,'moveWeight'),false);results.push(s.moveWeight);}for(const x of results)near(x,results[0]);});
