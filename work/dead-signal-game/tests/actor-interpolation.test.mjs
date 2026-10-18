import test from 'node:test';
import assert from 'node:assert/strict';
import {ActorInterpolation} from '../dist/actor-interpolation.js';
import {advanceSimulation,FIXED_STEP} from '../dist/simulation.js';
import {Game} from '../dist/engine.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('all render actor pools interpolate without changing checkpoints, random streams or actor identity',()=>{
  const game=new Game({seed:43}),interpolator=new ActorInterpolation();
  interpolator.capture(game);const old=game.player.x;game.player.x+=2;game.time+=FIXED_STEP;
  const before=JSON.stringify(game.snapshot()),random=game.random.getState(),visual=game.visualRandom.getState();
  const a=interpolator.sample(game,.25,FIXED_STEP),player=a.player;near(player.x,old+.5);
  near(interpolator.sample(game,.75,FIXED_STEP).player.x,old+1.5);
  assert.equal(player,interpolator.sample(game,.5,FIXED_STEP).player);assert.notEqual(player,game.player);
  assert.equal(JSON.stringify(game.snapshot()),before);assert.equal(random,game.random.getState());assert.equal(visual,game.visualRandom.getState());
});
test('attack warnings, shields and gun aim keep exact angles while regular turns use the shortest arc',()=>{
  const game=new Game({seed:1}),i=new ActorInterpolation();game.enemies=[{x:1,y:1,angle:Math.PI*2-.1},{x:2,y:2,angle:0,type:'shield'},{x:3,y:3,angle:0,attackState:'windup'}];
  i.capture(game);game.time+=FIXED_STEP;game.enemies[0].angle=.1;game.enemies[1].angle=2;game.enemies[2].angle=3;game.player.angle=1;
  const view=i.sample(game,.5,FIXED_STEP);near(view.enemies[0].angle,Math.PI*2);near(view.enemies[1].angle,2);near(view.enemies[2].angle,3);near(view.player.angle,1);
});
test('paused positions snap once and stay fixed; teleports/new runs do not create sliding ghosts',()=>{
  const game=new Game({seed:1}),i=new ActorInterpolation();i.capture(game);game.player.x+=2;game.time+=FIXED_STEP;
  game.state='paused';near(i.sample(game,.2,FIXED_STEP).player.x,game.player.x);near(i.sample(game,.9,FIXED_STEP).time,game.time);
  game.state='playing';game.player.x+=1000;near(i.sample(game,.2,FIXED_STEP).player.x,game.player.x);
  const other=new Game({seed:2});assert.equal(i.sample(other,.5,FIXED_STEP),other);
});
test('substep renders are continuous and physics/checkpoints remain identical with interpolation enabled',()=>{
  const a=new Game({seed:43}),b=new Game({seed:43}),i=new ActorInterpolation(),command={moveX:1,moveY:0,shoot:false};
  advanceSimulation(a,command,FIXED_STEP*2.5,{interpolator:i});advanceSimulation(b,command,FIXED_STEP*2.5);
  assert.deepEqual(a.snapshot(),b.snapshot());
  const first=i.sample(a,.25,FIXED_STEP).player.x,second=i.sample(a,.75,FIXED_STEP).player.x;
  assert.ok(second>first);assert.ok(second<a.player.x);
});

test('particle fade and recoil produce distinct subframes without changing exact physics or reset timing',()=>{
 const g=new Game({seed:774}),i=new ActorInterpolation();g.player.recoil=.12;g.particles=[{kind:'shockwave',x:g.player.x,y:g.player.y,life:.32,maxLife:.32,radius:150}];g.flash=.35;i.capture(g);g.time+=FIXED_STEP;g.player.recoil-=FIXED_STEP;g.particles[0].life-=FIXED_STEP;g.flash-=FIXED_STEP;const before=JSON.stringify(g.snapshot()),rng=g.random.getState();
 const a=i.sample(g,.25,FIXED_STEP),lifeA=a.particles[0].life,recoilA=a.player.recoil,flashA=a.flash;const b=i.sample(g,.75,FIXED_STEP);assert.ok(lifeA>b.particles[0].life&&recoilA>b.player.recoil&&flashA>b.flash);near(lifeA,.32-FIXED_STEP*.25);assert.equal(JSON.stringify(g.snapshot()),before);assert.equal(g.random.getState(),rng);
 i.capture(g);g.time+=FIXED_STEP;g.player.recoil=.12;g.flash=.35;near(i.sample(g,.1,FIXED_STEP).player.recoil,.12);near(i.sample(g,.1,FIXED_STEP).flash,.35);
 g.state='paused';near(i.sample(g,.1,FIXED_STEP).particles[0].life,g.particles[0].life);near(i.sample(g,.9,FIXED_STEP).flash,g.flash);
});

test('new enemy hit/contact/skill countdowns start immediately and then only their decreasing phase interpolates',()=>{const g=new Game({seed:774}),i=new ActorInterpolation(),e=g.enemies[0];Object.assign(e,{hitFlash:0,attackCd:0,skillCd:0});i.capture(g);g.time+=FIXED_STEP;Object.assign(e,{hitFlash:.12,attackCd:.9,skillCd:9});const before=g.snapshot();for(const fraction of [0,.1,.5,.9,1]){const v=i.sample(g,fraction,FIXED_STEP).enemies[0];assert.equal(v.hitFlash,.12);assert.equal(v.attackCd,.9);assert.equal(v.skillCd,9);}assert.deepEqual(g.snapshot(),before);i.capture(g);g.time+=FIXED_STEP;for(const key of ['hitFlash','attackCd','skillCd'])e[key]-=FIXED_STEP;for(const fraction of [.1,.5,.9]){const v=i.sample(g,fraction,FIXED_STEP).enemies[0];near(v.hitFlash,.12-FIXED_STEP*fraction);near(v.attackCd,.9-FIXED_STEP*fraction);near(v.skillCd,9-FIXED_STEP*fraction);}g.pause();assert.equal(i.sample(g,.1,FIXED_STEP).enemies[0].hitFlash,e.hitFlash);});
test('real enemy contact and burn ticks expose immediate attack/hit onset without changing simulation or save',()=>{const g=new Game({seed:774}),i=new ActorInterpolation();g.enemies=[];g.spawnClock=1e9;g.player.invul=0;const e=g.spawnEnemy('walker',300);Object.assign(e,{x:g.player.x+20,y:g.player.y,speed:0,attackCd:0,burn:1,burnTick:0});g.drainEvents();i.capture(g);g.tick(FIXED_STEP,{shoot:false,fireMode:'manual'});assert.equal(e.attackCd,.9);assert.ok(e.hitFlash>0);const before=g.snapshot();const v=i.sample(g,.1,FIXED_STEP).enemies[0];assert.equal(v.attackCd,e.attackCd);assert.equal(v.hitFlash,e.hitFlash);assert.deepEqual(g.snapshot(),before);});
