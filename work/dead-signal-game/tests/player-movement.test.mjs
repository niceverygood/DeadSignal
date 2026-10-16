import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,UPGRADES} from '../dist/engine.js';
import {PLAYER_LEGACY_SPEED,PLAYER_GROUND_SPEED,PLAYER_DASH_SPEED,effectivePlayerSpeed,stepPlayerMovement} from '../dist/player-movement.js';
import {Navigation} from '../dist/navigation.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} should equal ${b}`);
function fresh(options={}){
  const g=new Game({seed:4168,stageDuration:1e6,...options});g.enemies=[];g.spawnClock=1e9;g.world.obstacles=[];g.world.decor=[];g.navigation=new Navigation(g.world);g.player.x=1000;g.player.y=900;g.drainEvents();return g;
}
function seconds(g,total,input={},dt=1/60){let left=total;while(left>1e-10){const step=Math.min(dt,left);g.tick(step,input);left-=step;}}

test('actual movement is 128 world units per second while checkpoint speed stays at the legacy 214',()=>{
  const g=fresh(),before=g.snapshot(),start=g.player.x;assert.equal(g.player.speed,PLAYER_LEGACY_SPEED);
  seconds(g,1,{moveX:1});close(g.player.x-start,128);assert.equal(g.player.speed,214);
  assert.equal(g.snapshot().version,before.version);assert.deepEqual(Object.keys(g.snapshot().player),Object.keys(before.player));
});

test('digital diagonal movement is normalized and partial analog movement retains its magnitude',()=>{
  for(const [moveX,moveY,magnitude]of[[1,0,1],[1,1,1],[.3,.4,.5],[-.2,0,.2],[0,0,0]]){
    const g=fresh(),x=g.player.x,y=g.player.y;seconds(g,.5,{moveX,moveY});close(Math.hypot(g.player.x-x,g.player.y-y),128*.5*magnitude);
  }
});

test('releasing movement stops on that simulation step and reversing has no forward drift',()=>{
  const g=fresh();seconds(g,.3,{moveX:1});const stopped={x:g.player.x,y:g.player.y};seconds(g,.5,{});assert.deepEqual({x:g.player.x,y:g.player.y},stopped);
  g.tick(1/60,{moveX:-1});close(g.player.x,stopped.x-128/60);close(g.player.y,stopped.y);
  const turned={x:g.player.x,y:g.player.y};g.tick(1/60,{moveY:-1});close(g.player.x,turned.x);close(g.player.y,turned.y-128/60);
});

test('movement and complete 0.23 second dash distances are stable across simulation frame rates',()=>{
  for(const dt of [1/120,1/60,1/30,.05]){
    const walk=fresh(),x=walk.player.x;seconds(walk,1,{moveX:1},dt);close(walk.player.x-x,PLAYER_GROUND_SPEED);
    const dash=fresh(),start=dash.player.x;dash.tick(dt,{dash:true,moveX:1});seconds(dash,.4,{},dt);close(dash.player.x-start,PLAYER_DASH_SPEED*.23);assert.equal(dash.player.dashTime,0);
  }
});

test('dash exit and a stopped dash do not leak velocity into subsequent movement',()=>{
  const g=fresh();g.tick(.05,{dash:true,moveX:1});seconds(g,.3);const x=g.player.x;seconds(g,.3);assert.equal(g.player.x,x);
  g.tick(.05,{moveX:-1});close(g.player.x,x-128*.05);
});

test('wall contact blocks movement and dash without banking velocity for a direction change',()=>{
  for(const dash of [false,true]){
    const g=fresh();g.world.obstacles=[{id:++g.id,x:1015,y:700,w:40,h:400,kind:'building',hp:Infinity,maxHp:Infinity,destroyed:false}];
    seconds(g,.3,{moveX:1,dash});assert.ok(g.player.x<=1001+1e-8);const x=g.player.x;
    seconds(g,.3);g.tick(.05,{moveX:-1});close(g.player.x,x-128*.05);
  }
});

test('all existing equipment and speed upgrade bonuses retain their relative actual and saved effects',()=>{
  for(let rank=0;rank<=5;rank++)for(let upgrade=0;upgrade<=3;upgrade++){
    const equipment={items:{'magnetic-recovery':rank},equipped:{utility:'magnetic-recovery'}},g=fresh({missionId:'mission-01',equipment});
    // Use the real upgrade action so its speed expression is exercised.
    for(let n=0;n<upgrade;n++){g.pendingLevels=1;g.choices=[UPGRADES.find(u=>u.id==='speed')];g.state='upgrade';assert.equal(g.chooseUpgrade('speed'),true);}
    const multiplier=(1+.04*rank)*(1+.12*upgrade),x=g.player.x;seconds(g,.5,{moveX:1});
    close(g.player.speed,214*multiplier);close(effectivePlayerSpeed(g.player),128*multiplier);close(g.player.x-x,128*multiplier*.5);
  }
});

test('snapshot capture, paused input and legacy speed restore preserve the saved contract and both RNG streams',()=>{
  const g=fresh();seconds(g,.2,{moveX:.4,moveY:.1});g.pause();const raw=g.snapshot(),serialized=JSON.stringify(raw),rng=g.random.getState(),visual=g.visualRandom.getState();
  seconds(g,.5,{moveX:1,dash:true,shoot:true});assert.equal(JSON.stringify(g.snapshot()),serialized);assert.equal(g.random.getState(),rng);assert.equal(g.visualRandom.getState(),visual);
  const restored=Game.restore(raw);assert.ok(restored);assert.equal(restored.player.speed,214);assert.equal(JSON.stringify(raw),serialized);assert.equal(JSON.stringify(restored.snapshot()),serialized);
  restored.resume();const x=restored.player.x;seconds(restored,.2,{moveX:1});close(restored.player.x-x,128*.2);
});

test('live mid-movement save and resumePlaying restore remain deterministic without a transient movement cache',()=>{
  const g=fresh();seconds(g,.05,{moveY:.4});const raw=g.snapshot(),copy=Game.restore(raw,{resumePlaying:true});assert.ok(copy);
  for(let i=0;i<100;i++){const input=i<30?{moveX:.4,moveY:.1}:i<60?{moveX:-1}:{};g.tick(1/60,input);copy.tick(1/60,input);}
  assert.deepEqual(copy.snapshot(),g.snapshot());assert.equal(copy.random.getState(),g.random.getState());assert.equal(copy.visualRandom.getState(),g.visualRandom.getState());
});

test('the stateless displacement helper cannot mutate the player, consume RNG or accept non-finite controls',()=>{
  const p=Object.freeze({x:50,y:60,speed:214}),before=JSON.stringify(p);assert.deepEqual(stepPlayerMovement(p,.05,Infinity,NaN),{x:0,y:0});assert.deepEqual(stepPlayerMovement(p,0,1,0),{x:0,y:0});
  close(stepPlayerMovement(p,.05,1,0).x,6.4);assert.equal(JSON.stringify(p),before);
});
