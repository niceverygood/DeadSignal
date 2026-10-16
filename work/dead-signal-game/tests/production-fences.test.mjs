import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {nativeFenceCells} from '../dist/production-fences.js';
import {nativeGroundFootprint,propPlacement,selectAtlasFrame} from '../dist/production-art.js';
import {createCity} from '../dist/world.js';
import {MISSIONS} from '../dist/campaign.js';

test('actual fence meshes repeat to cover every existing long collision cell without stretching or world mutation',async()=>{
 const metadata={};
 for(const axis of ['horizontal','vertical'])metadata[axis]=JSON.parse(await fs.readFile(new URL(`../dist/assets/production/env-fence-${axis}/metadata.json`,import.meta.url)));
 let checked=0,repeated=0;
 for(const mission of MISSIONS){
  let id=0; const world=createCity({random:()=>.5,nextId:()=>++id,missionId:mission.id,seed:17});
  const before=JSON.stringify(world);
  for(const obstacle of world.obstacles.filter(o=>o.kind==='fence')){
   const m=metadata[obstacle.w>=obstacle.h?'horizontal':'vertical'],frame=selectAtlasFrame(m,{angle:0,stationary:true});
   const cells=nativeFenceCells(obstacle,nativeGroundFootprint(m,frame));
   assert.ok(cells.length>0);if(cells.length>1)repeated++;
   const horizontal=obstacle.w>=obstacle.h;
   assert.ok(Math.abs(cells.reduce((n,c)=>n+(horizontal?c.w:c.h),0)-(horizontal?obstacle.w:obstacle.h))<1e-7);
   for(let i=0;i<cells.length;i++){
    const cell=cells[i],fit=propPlacement(m,frame,{footprint:cell}).footprint;
    assert.ok(Math.abs(fit.fitted[horizontal?'width':'height']-(horizontal?cell.w:cell.h))<1e-5);
    assert.ok(fit.fitted.width<=cell.w+1e-5&&fit.fitted.height<=cell.h+1e-5);
    if(i)assert.ok(Math.abs((horizontal?cells[i-1].x+cells[i-1].w:cells[i-1].y+cells[i-1].h)-(horizontal?cell.x:cell.y))<1e-7);
   }
   checked++;
  }
  assert.equal(JSON.stringify(world),before);
 }
 assert.ok(checked>=30);assert.ok(repeated>0);
});

test('invalid or excessive fence dimensions fail closed',()=>{
 assert.equal(nativeFenceCells({kind:'car',x:0,y:0,w:200,h:8},{width:120,height:5.4}),null);
 for(const w of [NaN,Infinity,-2,0,1e9])assert.equal(nativeFenceCells({kind:'fence',x:0,y:0,w,h:8},{width:120,height:5.4}),null);
});
