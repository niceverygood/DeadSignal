import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';

test('every district and branch has a clear spawn and a physically reachable exit',()=>{
  for(let stage=0;stage<3;stage++)for(const route of ['hospital','police']){
    const game=new Game({seed:1334,route});game.stage=stage;game.world=game.makeWorld();const p=game.player,target=game.world.exit;
    assert.equal(game.blocked(p.x,p.y,p.r),false);
    for(let i=0;i<1200&&Math.hypot(p.x-target.x,p.y-target.y)>8;i++){const d=game.navigation.direction(p,target,p.r);game.move(p,d.x*6,d.y*6);assert.equal(game.blocked(p.x,p.y,p.r),false);}
    assert.ok(Math.hypot(p.x-target.x,p.y-target.y)<=8,`stage ${stage}, route ${route} must reach exit`);
  }
});

test('a fast dodge cannot cross a thin fence and its destruction restores passage',()=>{
  const game=new Game({seed:832});game.enemies=[];game.spawnClock=1e9;const fence=game.world.obstacles.find(o=>o.kind==='fence'),p=game.player;
  p.x=fence.x-p.r-16;p.y=fence.y+fence.h/2;assert.equal(game.blocked(p.x,p.y,p.r),false);
  game.tick(.05,{moveX:1,dash:true});for(let i=0;i<8;i++)game.tick(.05,{moveX:1});
  assert.ok(p.x<=fence.x-p.r);assert.equal(game.blocked(p.x,p.y,p.r),false);
  fence.destroyed=true;for(let i=0;i<8;i++)game.tick(.05,{moveX:1});assert.ok(p.x>fence.x+fence.w+p.r);
});
