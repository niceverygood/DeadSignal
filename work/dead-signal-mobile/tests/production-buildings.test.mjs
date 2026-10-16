import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeBuildingCells} from '../dist/production-buildings.js';
import {propPlacement} from '../dist/production-art.js';
import {Game} from '../dist/engine.js';
import {MISSIONS} from '../dist/campaign.js';

// Measurements of the actual common-brick GLB at world height180, from the
// offline geometry report. No substitute mesh or texture is generated.
const brick=Object.freeze({width:231.22746170943623,height:230.74636088098606,subjectHeight:180});
const close=(a,b)=>assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
function checkBlock(plan,obstacle,native=brick,maxHeight=200){
  assert.ok(plan);assert.ok(plan.columns>=1&&plan.columns<=8);assert.ok(plan.rows>=1&&plan.rows<=8);
  assert.equal(plan.cells.length,plan.columns*plan.rows);assert.ok(plan.cells.length<=64);
  assert.ok(plan.worldHeight>0&&plan.worldHeight<=maxHeight);close(plan.worldHeight,native.subjectHeight*plan.scale);
  assert.ok(plan.bounds.x>=obstacle.x-1e-8&&plan.bounds.y>=obstacle.y-1e-8);
  assert.ok(plan.bounds.x+plan.bounds.w<=obstacle.x+obstacle.w+1e-8&&plan.bounds.y+plan.bounds.h<=obstacle.y+obstacle.h+1e-8);
  close(plan.bounds.x+plan.bounds.w/2,obstacle.x+obstacle.w/2);close(plan.bounds.y+plan.bounds.h/2,obstacle.y+obstacle.h/2);
  close(plan.occupancy,plan.bounds.w*plan.bounds.h/(obstacle.w*obstacle.h));
  let area=0;
  for(let i=0;i<plan.cells.length;i++){
    const cell=plan.cells[i],row=Math.floor(i/plan.columns),column=i%plan.columns;
    assert.ok(Object.values(cell).every(Number.isFinite));assert.ok(cell.w>0&&cell.h>0);
    close(cell.w/native.width,plan.scale);close(cell.h/native.height,plan.scale);
    close(cell.x,plan.bounds.x+column*cell.w);close(cell.y,plan.bounds.y+row*cell.h);area+=cell.w*cell.h;
    if(column+1<plan.columns)close(cell.x+cell.w,plan.cells[i+1].x);
    if(row+1<plan.rows)close(cell.y+cell.h,plan.cells[i+plan.columns].y);
    assert.ok(Object.isFrozen(cell));assert.equal(Object.hasOwn(cell,'id'),false);assert.equal(Object.hasOwn(cell,'hp'),false);
    for(let j=0;j<i;j++){
      const other=plan.cells[j],overlapX=Math.min(cell.x+cell.w,other.x+other.w)-Math.max(cell.x,other.x),overlapY=Math.min(cell.y+cell.h,other.y+other.h)-Math.max(cell.y,other.y);
      assert.ok(overlapX<=1e-8||overlapY<=1e-8,'modules touch at edges without overlapping or leaving internal alleys');
    }
  }
  close(area,plan.bounds.w*plan.bounds.h);close(Math.min(...plan.cells.map(cell=>cell.x)),plan.bounds.x);close(Math.min(...plan.cells.map(cell=>cell.y)),plan.bounds.y);
  close(Math.max(...plan.cells.map(cell=>cell.x+cell.w)),plan.bounds.x+plan.bounds.w);close(Math.max(...plan.cells.map(cell=>cell.y+cell.h)),plan.bounds.y+plan.bounds.h);
  assert.ok(Object.isFrozen(plan)&&Object.isFrozen(plan.cells)&&Object.isFrozen(plan.bounds));
}

test('the actual brick geometry forms a connected 2x2 block in a 510x450 outer cell without a 350-high single building',()=>{
  const obstacle=Object.freeze({x:120,y:120,w:510,h:450,kind:'building',id:77,hp:Infinity}),before={...obstacle};
  const plan=nativeBuildingCells(obstacle,brick);checkBlock(plan,obstacle);
  assert.equal(plan.columns,2);assert.equal(plan.rows,2);assert.ok(plan.worldHeight>175&&plan.worldHeight<176);assert.ok(plan.occupancy>.88);
  assert.deepEqual(obstacle,before);assert.deepEqual(nativeBuildingCells(obstacle,brick),plan);
});

test('preferred coverage chooses the fewest complete houses, with 75-percent and best-fit fallbacks when 80-percent is impossible',()=>{
  const native=Object.freeze({width:240,height:240,subjectHeight:180});
  const exact={x:0,y:0,w:480,h:240},plan=nativeBuildingCells(exact,native);checkBlock(plan,exact,native);
  assert.equal(plan.cells.length,2);assert.equal(plan.columns,2);assert.equal(plan.rows,1);assert.equal(plan.occupancy,1);assert.equal(plan.worldHeight,180);
  const wide={x:100,y:50,w:2520,h:240},partial=nativeBuildingCells(wide,native);checkBlock(partial,wide,native);
  assert.equal(partial.columns,8);assert.equal(partial.rows,1);assert.ok(partial.occupancy>=.75&&partial.occupancy<.8);
  const wider={...wide,w:2640},best=nativeBuildingCells(wider,native);checkBlock(best,wider,native);
  assert.equal(best.columns,8);assert.equal(best.rows,1);close(best.occupancy,8/11);
});

test('returned footprints use the existing uniform propPlacement contract and baked pivot without axis stretching',()=>{
  const obstacle={x:1770,y:1200,w:510,h:450,kind:'building'},plan=nativeBuildingCells(obstacle,brick);
  const metadata={source:{},projection:{subjectHeight:brick.subjectHeight,pixelsPerWorld:2}},frame={rect:{width:512,height:512},footPivot:{x:256,y:420},
    alphaBounds:{x:80,y:40,width:350,height:380},coreBounds:{x:90,y:50,width:330,height:340},outlineBounds:{x:78,y:38,width:354,height:384},groundBounds:{minX:-brick.width/2,minY:-brick.height/2,maxX:brick.width/2,maxY:brick.height/2}};
  for(const cell of plan.cells){
    const placed=propPlacement(metadata,frame,{footprint:cell});assert.ok(placed);
    close(placed.footprint.uniformScale,plan.scale);close(placed.footprint.fitted.width,cell.w);close(placed.footprint.fitted.height,cell.h);
    close(placed.scale*metadata.projection.pixelsPerWorld*metadata.projection.subjectHeight,plan.worldHeight);
    close(placed.footprint.targetFoot.x,(cell.x+cell.w/2-cell.y-cell.h/2)*Math.sqrt(3)/2);
    close(placed.footprint.targetFoot.y,(cell.x+cell.y+(cell.w+cell.h)/2)*.5);
  }
});

test('all twelve actual mission layouts retain exact obstacles, saves and both RNG streams while every building plan is bounded and connected',()=>{
  let checked=0;
  for(const mission of MISSIONS){
    const game=new Game({seed:19200+mission.index,missionId:mission.id}),snapshot=game.snapshot(),world=structuredClone(game.world),events=structuredClone(game.events);
    const rng=game.random.getState(),visual=game.visualRandom.getState(),originalRandom=Math.random,originalNow=Date.now;
    try{Math.random=()=>{throw Error('render footprint cannot use random');};Date.now=()=>{throw Error('render footprint cannot use time');};
      for(const obstacle of game.world.obstacles.filter(object=>object.kind==='building')){
        const plan=nativeBuildingCells(obstacle,brick);checkBlock(plan,obstacle);assert.ok(plan.occupancy>=.75-1e-12);checked++;
      }
    }finally{Math.random=originalRandom;Date.now=originalNow;}
    assert.deepEqual(game.world,world);assert.deepEqual(game.snapshot(),snapshot);assert.deepEqual(game.events,events);assert.equal(game.random.getState(),rng);assert.equal(game.visualRandom.getState(),visual);
  }
  assert.ok(checked>=108,'all outer cells plus actual mission interiors are covered');
});

test('a stricter render height stays bounded and search/output never exceed 8x8 modules',()=>{
  const obstacle={x:0,y:0,w:5000,h:5000,kind:'building'},plan=nativeBuildingCells(obstacle,brick,50);checkBlock(plan,obstacle,brick,50);
  assert.equal(plan.cells.length,64);close(plan.worldHeight,50);assert.ok(plan.occupancy<.75);
});

test('invalid geometry, destroyed objects and nonbuildings return null without changing the supplied data',()=>{
  const obstacle={x:1,y:2,w:510,h:450,kind:'building'};
  for(const invalid of [null,[],{}, {...obstacle,x:NaN},{...obstacle,y:Infinity},{...obstacle,w:0},{...obstacle,h:-1},{...obstacle,w:'510'}, {...obstacle,destroyed:true},{...obstacle,kind:'car'},{...obstacle,x:1e100,w:1},{...obstacle,w:1e308,h:1e308}])
    assert.equal(nativeBuildingCells(invalid,brick),null);
  for(const invalid of [null,[],{}, {...brick,width:0},{...brick,height:Infinity},{...brick,subjectHeight:NaN}])assert.equal(nativeBuildingCells(obstacle,invalid),null);
  for(const cap of [0,-1,NaN,Infinity,'200'])assert.equal(nativeBuildingCells(obstacle,brick,cap),null);
  assert.deepEqual(obstacle,{x:1,y:2,w:510,h:450,kind:'building'});assert.equal(nativeBuildingCells(obstacle,brick,200).cells.length,4);
});
