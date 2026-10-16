import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ProductionArt,ProductionPoseClock} from '../dist/production-art.js';
import {productionManifest} from '../dist/production-manifest.js';
import {measuredPlayerGait,PLAYER_RUN_THRESHOLD,PLAYER_RUN_CYCLE_DISTANCE,PLAYER_WALK_CYCLE_DISTANCE} from '../dist/player-locomotion.js';

const tau=Math.PI*2,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const gait=measuredPlayerGait(1.066666603,.666666687);
const options={gait,runThreshold:PLAYER_RUN_THRESHOLD};

test('measured stride advances from actual distance at 120/60/30/20Hz, independent of the legacy save phase',()=>{
  for(const hz of [120,60,30,20]){
    const clock=new ProductionPoseClock(),actor={x:0,y:0,angle:0,walkPhase:1.7,dashTime:0};clock.select(actor,0,options);
    let result;for(let i=1;i<=hz;i++){actor.x=128*i/hz;result=clock.select(actor,i/hz,options);}
    assert.equal(result.pose,'run');near(result.phase,(128/PLAYER_RUN_CYCLE_DISTANCE*tau)%tau);
    near(result.speed,128);assert.equal(actor.walkPhase,1.7);
  }
});

test('slow analogue input uses the real walking stride; backwards reverses the cycle and sideways keeps stepping',()=>{
  for(const [dx,dy,angle,reverse] of [[1,0,0,false],[-1,0,0,true],[0,1,0,false]]){
    const clock=new ProductionPoseClock(),actor={x:0,y:0,angle,walkPhase:0};clock.select(actor,0,options);
    actor.x=dx*32/60;actor.y=dy*32/60;const selected=clock.select(actor,1/60,options);
    assert.equal(selected.pose,'walk');assert.equal(selected.reverse,reverse);
    const signed=(reverse?-1:1)*32/60/PLAYER_WALK_CYCLE_DISTANCE*tau;
    near(selected.phase,(signed%tau+tau)%tau);assert.notEqual(selected.phase,0);
  }
});

test('pause, wall contact and restoration never advance a foot cycle or mutate actor fields',()=>{
  const clock=new ProductionPoseClock(),actor={x:0,y:0,angle:0,walkPhase:.2};clock.select(actor,0,options);
  actor.x=5;const moving=clock.select(actor,.04,options),before=JSON.stringify(actor);
  for(let i=0;i<30;i++)assert.equal(clock.select(actor,.04,options),moving);
  const blocked=clock.select(actor,.08,options);assert.equal(blocked.pose,'idle');near(blocked.phase,moving.phase);
  near(clock.select(actor,0,options).phase,0);assert.equal(JSON.stringify(actor),before);
});

async function nativeArt(weapon){
  const mappings=productionManifest.characters[`survivor-${weapon}`],assets=Object.fromEntries(await Promise.all(Object.values(mappings).map(async id=>[id,JSON.parse(await fs.readFile(new URL(`../dist/assets/production/${productionManifest.assets[id].metadata}`,import.meta.url),'utf8'))])));
  const ImageCtor=class {set src(url){const entry=Object.entries(productionManifest.assets).find(([,a])=>new URL(url).pathname.endsWith('/'+a.atlas));const m=assets[entry?.[0]];this.naturalWidth=m?.atlas.width||0;this.naturalHeight=m?.atlas.height||0;queueMicrotask(()=>this.onload?.());}};
  const art=new ProductionArt({manifest:productionManifest,baseURL:'https://local.example/assets/production/',ImageCtor,fetchImpl:async url=>{
    const entry=Object.entries(productionManifest.assets).find(([,a])=>new URL(url).pathname.endsWith('/'+a.metadata));return{ok:true,text:async()=>JSON.stringify(assets[entry[0]])};
  }});
  for(const id of Object.values(mappings))assert.equal(await art.load(id),true);
  return {art,mappings};
}

for(const weapon of ['shotgun','nailgun'])test(`${weapon}: moving fire and hit retain all 32 armed locomotion samples, stationary attacks and death still use the rig`,async()=>{
  const {art,mappings}=await nativeArt(weapon),actor={x:1200,y:930,angle:0,walkPhase:0,dashTime:0,hp:100};
  const render=(time,visualAction={})=>art.characterFrame(`survivor-${weapon}`,actor,{simulationTime:time,worldHeight:44,groundedGait:true,runThreshold:PLAYER_RUN_THRESHOLD,visualAction});
  render(0);const samples=new Set();
  for(let i=1;i<=120;i++){
    actor.x=1200+128*i/120;const before=JSON.stringify(actor),frame=render(i/120,{attackState:'charge',attackTime:.11,hitFlash:.08});
    assert.equal(frame.id,mappings.run);assert.equal(frame.metadata.atlas.includesWeapon,true);samples.add(frame.frame.sample);
    assert.equal(JSON.stringify(actor),before);
  }
  assert.equal(samples.size,32);
  const stopped=render(1.1,{attackState:'charge',attackTime:.12});assert.equal(stopped.id,mappings.actions);assert.ok(stopped.frame.sample>=18&&stopped.frame.sample<24);
  actor.x+=2;actor.hp=0;const death=render(1.2,{dead:true});assert.equal(death.id,mappings.actions);assert.ok(death.frame.sample>=26);
});
