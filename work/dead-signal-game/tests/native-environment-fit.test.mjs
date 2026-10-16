import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {propPlacement,selectAtlasFrame,validateAtlasMetadata} from '../dist/production-art.js';
import {productionManifest} from '../dist/production-manifest.js';
import {createCity} from '../dist/world.js';
import {MISSIONS} from '../dist/campaign.js';
import {matchesEnvironmentRule} from '../dist/production-rules.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const readMetadata=async id=>validateAtlasMetadata(JSON.parse(await fs.readFile(new URL(`../dist/assets/production/${productionManifest.assets[id].metadata}`,import.meta.url))));

test('real car collision depth h wins over vertical height while explicit width/height rectangle callers remain supported',async()=>{
 const metadata=await readMetadata('env-broken-car'),frame=selectAtlasFrame(metadata,{angle:0,stationary:true});
 const obstacle={x:100,y:200,w:58,h:112,height:27},before=JSON.stringify(obstacle);
 const actual=propPlacement(metadata,frame,{footprint:obstacle}),groundOnly=propPlacement(metadata,frame,{footprint:{x:100,y:200,w:58,h:112}});
 assert.deepEqual(actual.footprint.fitted,groundOnly.footprint.fitted);
 near(actual.footprint.target.height,112);near(actual.footprint.fitted.height,112);
 const rectangle=propPlacement(metadata,frame,{footprint:{x:100,y:200,width:58,height:112}});
 assert.deepEqual(rectangle.footprint.fitted,groundOnly.footprint.fitted);
 assert.equal(JSON.stringify(obstacle),before);
});

test('all twelve actual canonical landmarks fit their ground collision cells without borrowing the independent art height',async()=>{
 let checked=0;
 for(const mission of MISSIONS){
  let id=0;const world=createCity({missionId:mission.id,seed:17,random:()=>.5,nextId:()=>++id}),before=JSON.stringify(world);
  for(const o of world.obstacles.filter(o=>o.kind==='building')){
   const rule=productionManifest.environmentRules.find(r=>matchesEnvironmentRule(r,o,world));
   if(!rule||rule.entry==='env-common-brick')continue;
   const metadata=await readMetadata(productionManifest.environment[rule.entry]),frame=selectAtlasFrame(metadata,{angle:0,stationary:true});
   const fit=propPlacement(metadata,frame,{footprint:o}).footprint;
   assert.ok(fit.fitted.width<=o.w+1e-6&&fit.fitted.height<=o.h+1e-6);
   near(fit.target.width,o.w);near(fit.target.height,o.h);
   assert.ok(Math.abs(fit.fitted.width-o.w)<1e-5||Math.abs(fit.fitted.height-o.h)<1e-5,'contain fills at least one true ground dimension');
   checked++;
  }
  assert.equal(JSON.stringify(world),before);
 }
 assert.equal(checked,12);
});
