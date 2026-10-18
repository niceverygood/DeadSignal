import test from 'node:test';import assert from 'node:assert/strict';import {drawOrganicSpray,drawMolotovTrail} from '../dist/combat-detail.js';import {createMolotov,advanceMolotov} from '../dist/molotov.js';
import {organicSprayDroplet} from '../dist/combat-detail.js';
test('airborne blood remains visible but landed droplets do not float on water or beyond a roof',()=>{
 let fills=0;const c=new Proxy({save(){},restore(){},fill(){fills++;}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)}),p={kind:'weapon-impact',x:0,y:0,z:18,angle:0,life:.2,maxLife:1,weapon:'shotgun'};
 for(const world of [{water:[{x:-1000,y:-1000,w:2000,h:2000}]},{rooftop:{platforms:[{x:1000,y:1000,w:20,h:20}]}}]){fills=0;drawOrganicSpray(c,p,world);assert.equal(fills,0);drawOrganicSpray(c,{...p,life:.9},world);assert.equal(fills,9);}
});
test('physical blood droplets start at the actual hit height, follow shot direction and stop on ground contact',()=>{
 const p={kind:'weapon-impact',x:1200,y:930,z:18,angle:0,life:.3,maxLife:.3,weapon:'shotgun'},before=JSON.stringify(p);
 const start=organicSprayDroplet(p,4,9);assert.equal(start.x,p.x);assert.equal(start.y,p.y);assert.equal(start.z,18);
 const at=t=>organicSprayDroplet({...p,life:p.maxLife-t},4,9),early=at(.08),late=at(.16),land=at(start.landing),settled=at(.3);
 assert.ok(early.x>p.x);assert.equal(early.y,p.y);assert.ok(late.z<early.z);assert.ok(late.z>=0);assert.equal(land.z,0);assert.equal(settled.z,0);assert.equal(settled.x,land.x);assert.equal(settled.y,land.y);assert.equal(settled.landed,true);
 const reverse=organicSprayDroplet({...p,angle:Math.PI,life:.22},4,9);assert.ok(reverse.x<p.x);assert.deepEqual(at(.08),early);assert.equal(JSON.stringify(p),before);
});
test('organic hit detail excludes armor and materials, keeps immutable particle and balanced canvas',()=>{
 let depth=0,fills=0;const c=new Proxy({save(){depth++;},restore(){depth--;},fill(){fills++;}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});const p={kind:'weapon-impact',x:10,y:20,life:.15,maxLife:.3,weapon:'shotgun',angle:.5};const before=JSON.stringify(p);assert.equal(drawOrganicSpray(c,p),true);assert.equal(fills,9);assert.equal(drawOrganicSpray(c,{...p,shielded:true}),false);assert.equal(drawOrganicSpray(c,{...p,surface:'metal'}),false);assert.equal(depth,0);assert.equal(JSON.stringify(p),before);
});
test('wick smoke follows the actual Molotov arc and disappears during falling and before release',()=>{
 let depth=0,strokes=0;const c=new Proxy({save(){depth++;},restore(){depth--;},stroke(){strokes++;}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});const p={x:100,y:100},item=createMolotov(p,300,100);assert.equal(drawMolotovTrail(c,item),false);advanceMolotov(item,.4,p);const before=JSON.stringify(item);assert.equal(drawMolotovTrail(c,item),true);assert.equal(strokes,10);assert.equal(depth,0);assert.equal(JSON.stringify(item),before);assert.equal(drawMolotovTrail(c,{...item,fallElapsed:.1}),false);
});
