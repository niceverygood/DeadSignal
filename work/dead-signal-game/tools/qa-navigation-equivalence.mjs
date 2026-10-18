import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {MISSIONS} from '../dist/campaign.js';
import {ROOF_EXPEDITION_ID} from '../dist/rooftop-world.js';
// Explicit local baseline argument, never an old computer's path or remote code.
if(!process.argv[2])throw new Error('Pass a preserved pre-change navigation source');
let source=await fs.readFile(process.argv[2],'utf8');
source=source.replace(/from '(\.\/[^']+)'/g,(_,ref)=>`from '${new URL('../dist/'+ref.slice(2),import.meta.url).href}'`);
const {Navigation:Baseline}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let state=774;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
const maps=[{name:'legacy',options:{}},...MISSIONS.map(m=>({name:m.id,options:{missionId:m.id}})),{name:'roof',options:{expeditionId:ROOF_EXPEDITION_ID}}];
let queries=0;
for(const entry of maps){
  const world=new Game({seed:774,...entry.options}).world,a=new Navigation(world),b=new Baseline(world);
  for(let i=0;i<400;i++){
    if(i===200){world.obstacles[0].destroyed=true;}
    const from={x:40+random()*(world.width-80),y:40+random()*(world.height-80)},target={x:40+random()*(world.width-80),y:40+random()*(world.height-80)},r=[0,12,14,18,27,49][i%6];
    assert.equal(a.lineOfSight(from,target,r),b.lineOfSight(from,target,r),entry.name+' LOS '+i);
    assert.equal(a.lineOfSight(from,target,r,{allowVoid:true}),b.lineOfSight(from,target,r,{allowVoid:true}),entry.name+' firing '+i);
    assert.deepEqual(a.direction(from,target,r),b.direction(from,target,r),entry.name+' direction '+i);
    queries+=3;
  }
}
console.log(JSON.stringify({maps:maps.map(m=>m.name),queries,identical:true,destructionChecked:true}));
