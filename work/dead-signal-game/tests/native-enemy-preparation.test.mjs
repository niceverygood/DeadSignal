import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Renderer} from '../dist/renderer.js';
import {Game} from '../dist/engine.js';
import {ProductionArt,validateAtlasMetadata,spritePlacement} from '../dist/production-art.js';
import {productionManifest} from '../dist/production-manifest.js';
import {BOSS_CATALOG} from '../dist/campaign.js';
import {project} from '../dist/projection.js';
import {ENEMY_MOTION_PROFILES} from '../dist/enemy-motion-profiles.js';
import {enemyGroundingHeight} from '../dist/enemy-locomotion.js';
import {nativeActionSelection} from '../dist/native-action-animation.js';
import {drawNativeHitLight} from '../dist/native-hit-light.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const saved=await readFile(new URL('../../../qa/dense-combat-20261018/native-enemy-preparation-before-method.txt',import.meta.url));
assert.equal(hash(saved),'2d9778070ea1405b7ba9da82301a0c5d1368d8c818ca541919fb369ba989d74f','the independent oracle is the byte-exact saved original method');
const num=(n,fallback=0)=>Number.isFinite(n)?n:fallback,clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const original=new Function('num','clamp','project','ENEMY_MOTION_PROFILES','enemyGroundingHeight','nativeActionSelection','spritePlacement',`return ({${saved.toString('utf8')}}).nativeEnemyFrame;`)(num,clamp,project,ENEMY_MOTION_PROFILES,enemyGroundingHeight,nativeActionSelection,spritePlacement);

// Metadata and frame rectangles are real. Images are identity/dimension records;
// no PNG/GLB decode, WebGL renderer, shader, paid request or browser is involved.
async function originalCatalog(section,key){
 const mapping=productionManifest[section][key],ids=[...new Set(typeof mapping==='string'?[mapping]:Object.values(mapping))],records=[],files=[];
 for(const id of ids){
  const url=new URL('../dist/assets/production/'+productionManifest.assets[id].metadata,import.meta.url),bytes=await readFile(url),metadata=validateAtlasMetadata(JSON.parse(bytes));
  records.push([id,{status:'ready',metadata,image:Object.freeze({id,naturalWidth:metadata.atlas.width,naturalHeight:metadata.atlas.height}),bodyAlpha:null}]);files.push({url,hash:hash(bytes)});
 }
 return{records,files};
}
function artWith(catalog){const art=new ProductionArt({manifest:productionManifest,fetchImpl:null,ImageCtor:null});for(const [id,record]of catalog.records)art.records.set(id,{...record});return art;}
function capture(game,actor){return JSON.stringify({actor,time:game.time,random:game.random.getState(),visual:game.visualRandom.getState()});}

function controlledFixture(catalog,scenario,actor,game,error){
 const trace=[],record=name=>(...args)=>trace.push([name,...args]),art=artWith(catalog);
 const seed=art.enemyFrame('walker',actor,{simulationTime:game.time,enemyMotion:{cycleDistance:50,scale:1,turnRate:8}});
 const selected={...seed,locomotion:Object.freeze({pose:'walk',phase:.35})},live=Object.freeze({originalLiveOutput:true});
 const clips=catalog.records.find(([,r])=>r.metadata.animation?.clips)?.[1].metadata.animation.clips;
 const backing=new Map(scenario.missing?[]:[['enemy-walker',{config:{clips}}]]);let gets=0;
 const rig={models:{has(key){trace.push(['has',key]);return backing.has(key);},get(key){gets++;return backing.get(key);}},diagnostics:{clip:'walk',sampleDensity:32},
  load(...args){assert.equal(this,rig);trace.push(['load',...args]);if(scenario.loadError)throw error;},
  frame(...args){assert.equal(this,rig);trace.push(['frame',...args]);if(scenario.frameError)throw error;return scenario.live?live:null;}
 };
 const fakeArt={manifest:art.manifest,enemyFrame(...args){assert.equal(this,fakeArt);trace.push(['actorFrame',...args]);if(scenario.actorError)throw error;return scenario.noSelected?null:selected;}};
 const renderer=Object.assign(Object.create(Renderer.prototype),{productionArt:fakeArt,motionEnabled:scenario.motion!==false,enemyLiveFrames:scenario.budget??0,
  liveEnemySelection:scenario.selection==='none'?null:new Set(scenario.selection==='in'?[actor]:[]),liveEnemies:rig,
  requestProductionCatalog(...args){assert.equal(this,renderer);trace.push(['catalog',...args]);if(scenario.requestError)throw error;},productionDataset:record('dataset')});
 return{renderer,trace,live,getCount:()=>gets};
}
function invoke(method,fixture,actor,game){try{return{value:method.call(fixture.renderer,actor,game.time,game),error:null};}catch(error){return{value:null,error};}}

test('saved original oracle, default preparation and explicit legacy mode preserve live selection, capacity, load/frame order, arguments, outputs and errors',async()=>{
 const catalog=await originalCatalog('enemies','walker'),scenarios=[
  {name:'selected',selection:'in',live:true},{name:'selected far',selection:'in',far:true,live:true},
  {name:'unselected nearby',selection:'out'},{name:'empty Set nearby',selection:'empty'},
  {name:'last slot',selection:'in',budget:11,live:true},{name:'exhausted Set',selection:'in',budget:12},{name:'over capacity',selection:'in',budget:13},
  {name:'no Set nearby',selection:'none',live:true},{name:'no Set far idle',selection:'none',far:true},
  {name:'no Set far hit',selection:'none',far:true,hit:true,live:true},{name:'no Set far attack',selection:'none',far:true,attack:true,live:true},
  {name:'exhausted no Set',selection:'none',budget:12},{name:'motion disabled',selection:'in',motion:false},
  {name:'missing selected model',selection:'in',missing:true},{name:'missing unselected model',selection:'out',missing:true},
  {name:'no baked selection',selection:'in',noSelected:true},{name:'caught original live error',selection:'in',frameError:true},
  {name:'request error',selection:'in',requestError:true},{name:'actor selection error',selection:'in',actorError:true},
  {name:'original load error',selection:'in',missing:true,loadError:true}
 ];
 let skipped=0;
 for(const scenario of scenarios){
  const actor={id:17,type:'walker',x:scenario.far?1000:100,y:scenario.far?1000:200,r:14,hp:100,maxHp:100,angle:.25,walkPhase:1,attackState:'walk',attackCd:scenario.attack?.8:0,hitFlash:scenario.hit?.12:0},
   game={time:1,world:Object.freeze({epoch:scenario.name}),player:{x:100,y:250}},error=Error('original-'+scenario.name),before=JSON.stringify({actor,game});
  const baseline=controlledFixture(catalog,scenario,actor,game,error),candidate=controlledFixture(catalog,scenario,actor,game,error),legacy=controlledFixture(catalog,scenario,actor,game,error);legacy.renderer.forceLegacyEnemyPreparation=true;
  const expected=invoke(original,baseline,actor,game),actual=invoke(Renderer.prototype.nativeEnemyFrame,candidate,actor,game),forced=invoke(Renderer.prototype.nativeEnemyFrame,legacy,actor,game);
  for(const [label,f,result]of [['default',candidate,actual],['forced legacy',legacy,forced]]){
   assert.equal(result.error,expected.error,scenario.name+' '+label+' original exception identity');assert.deepEqual(result.value,expected.value,scenario.name+' '+label+' selected frame/placement');assert.deepEqual(f.trace,baseline.trace,scenario.name+' '+label+' observable call order and all args');assert.equal(f.renderer.enemyLiveFrames,baseline.renderer.enemyLiveFrames,scenario.name+' '+label+' live budget');
   if(result.value?.originalLiveOutput)assert.equal(result.value,f.live,'live return identity');
  }
  assert.equal(legacy.getCount(),baseline.getCount(),scenario.name+' explicit legacy eagerly computes the same original pose');
  const removesUnused=baseline.getCount()>0&&(scenario.selection!=='none'||(scenario.budget??0)>=12);
  assert.equal(candidate.getCount(),removesUnused?0:baseline.getCount(),scenario.name+' only unused pose lookup is removed');if(removesUnused)skipped++;
  assert.equal(JSON.stringify({actor,game}),before,scenario.name+' does not write actors or epoch');
 }
 assert.ok(skipped>=8,'selected, excluded and exhausted branches actually skip unused preparation');
});

test('all seven real enemy and 24 boss catalogs retain original continuous movement/action/death frames, bounds, pivots, clocks and source bytes',async()=>{
 const roster=[...Object.keys(productionManifest.enemies).map(key=>({section:'enemies',key,boss:null})),...BOSS_CATALOG.map(boss=>({section:'bosses',key:boss.id,boss}))];assert.equal(roster.length,31);
 let comparisons=0,nonzeroGrounding=0,actionFrames=0;
 for(const [index,item]of roster.entries()){
  const catalog=await originalCatalog(item.section,item.key),game=new Game({seed:774+index,missionId:item.boss?.missionId});game.enemies=[];game.boss=null;
  const actor=game.spawnEnemy(item.boss?.role==='final'?'collector':item.boss?'elite':item.key,450,null,item.boss?.stats);assert.ok(actor,item.key+' actual engine actor');if(item.boss)Object.assign(actor,{bossKey:item.key,bossRole:item.boss.role});
  const arms=[false,false,true].map((legacy,i)=>{
   const art=artWith(catalog),trace=[],rig={models:new Map([['enemy-'+item.key,{config:{clips:catalog.records.find(([,r])=>r.metadata.animation?.clips)?.[1].metadata.animation.clips}}]]),diagnostics:{clip:'walk',sampleDensity:32},load(...args){trace.push(['load',...args]);},frame(...args){assert.equal(this,rig);trace.push(['frame',...args]);return null;}};
   const renderer=Object.assign(Object.create(Renderer.prototype),{productionArt:art,motionEnabled:true,forceLegacyEnemyPreparation:legacy,liveEnemies:item.boss?null:rig,liveBoss:item.boss?rig:null,enemyLiveFrames:0,liveEnemySelection:new Set([actor]),requestProductionCatalog(...args){trace.push(['catalog',...args]);},productionDataset(...args){trace.push(['dataset',...args]);}});
   return{art,renderer,trace,method:i===0?original:Renderer.prototype.nativeEnemyFrame};
  });
  const metadataBefore=catalog.records.map(([id,r])=>[id,hash(JSON.stringify(r.metadata))]);
  const steps=[{dt:0},{dt:.05,dx:2},{dt:.05,dy:3,angle:1.8},{dt:0},{dt:.05,angle:3,attackState:'windup',attackTime:.45},{dt:.05,dx:-2,attackState:'charge',attackTime:.2},{dt:.05,attackState:'recover',attackTime:.3},{dt:.05,attackState:'walk',hitFlash:.12,stun:.2,vx:-60},{dt:.05,hitFlash:.04},{dt:.05,hitFlash:0,stun:0,vx:0},{dt:.05,hp:0,dead:true}];
  for(const [stepIndex,step]of steps.entries()){
   game.time+=step.dt;if(step.dx||step.dy)game.move(actor,step.dx||0,step.dy||0);for(const [key,value]of Object.entries(step))if(!['dt','dx','dy'].includes(key))actor[key]=value;
   const before=capture(game,actor);for(const arm of arms){arm.trace.length=0;arm.renderer.enemyLiveFrames=stepIndex%4===2?12:0;arm.renderer.liveEnemySelection=stepIndex%3===1?new Set():new Set([actor]);}
   const values=arms.map(arm=>arm.method.call(arm.renderer,actor,game.time,game,item.boss));assert.ok(values[0],item.key+' has actual original baked selection');
   for(let i=1;i<arms.length;i++){assert.deepEqual(values[i],values[0],item.key+' step'+stepIndex+' full original selection');assert.deepEqual(arms[i].trace,arms[0].trace,item.key+' step'+stepIndex+' rig input/order');assert.equal(arms[i].renderer.enemyLiveFrames,arms[0].renderer.enemyLiveFrames);comparisons++;}
   assert.equal(capture(game,actor),before,item.key+' rendering leaves simulation and both RNG streams unchanged');assert.equal(Object.isFrozen(values[0].metadata),true);assert.equal(Object.isFrozen(values[0].frame),true);
   if(values[0].placement.groundingHeight)nonzeroGrounding++;if(values[0].metadata.animation?.clips)actionFrames++;
   for(const arm of arms)assert.ok(arm.art.enemyPoseClock?.actors.has(actor),'original actor remains the locomotion history key');
  }
  assert.deepEqual(catalog.records.map(([id,r])=>[id,hash(JSON.stringify(r.metadata))]),metadataBefore,item.key+' source metadata is unchanged');
  for(const file of catalog.files)assert.equal(hash(await readFile(file.url)),file.hash,item.key+' original metadata file byte hash unchanged');
 }
 assert.equal(comparisons,31*11*2);assert.ok(nonzeroGrounding>0,'actual grounded walk placement is exercised');assert.ok(actionFrames>0,'actual authored action/death metadata is exercised');
});

function canvasFixture(throwImage=false){
 const calls=[],stack=[],c={globalAlpha:.37,globalCompositeOperation:'source-over',imageSmoothingEnabled:false,imageSmoothingQuality:'low',
  save(){stack.push([this.globalAlpha,this.globalCompositeOperation,this.imageSmoothingEnabled,this.imageSmoothingQuality]);calls.push(['save']);},
  restore(){[this.globalAlpha,this.globalCompositeOperation,this.imageSmoothingEnabled,this.imageSmoothingQuality]=stack.pop();calls.push(['restore']);},
  beginPath(){calls.push(['beginPath']);},ellipse(...args){calls.push(['ellipse',...args]);},clip(){calls.push(['clip']);},
  drawImage(...args){calls.push(['drawImage',...args,this.globalAlpha,this.globalCompositeOperation,this.imageSmoothingEnabled,this.imageSmoothingQuality]);if(throwImage)throw Error('canvas-copy-failed');}
 };return{c,calls,stack};
}
test('no-hit preparation skips Canvas entirely while actual native hit pixels, alpha/clip passes, draw failures and Canvas state match the unchanged helper',async()=>{
 const catalog=await originalCatalog('enemies','walker'),art=artWith(catalog),actor={id:9,x:100,y:200,r:14,angle:.3,hp:100},native=art.enemyFrame('walker',actor,{simulationTime:1});assert.ok(native);
 const renderer=Object.assign(Object.create(Renderer.prototype),{productionArt:art}),impact={targetId:9,x:100,y:200,z:30,angle:.8,weapon:'shotgun'};
 const cases=[...[-1,-0,0,NaN,Infinity,undefined].map(remaining=>({remaining,native,impact})),{remaining:.12,native:null,impact},{remaining:.12,native,impact:null},{remaining:.12,native,impact},{remaining:.04,native,impact},{remaining:.12,native,impact,throwImage:true}];
 for(const forceLegacy of [false,true])for(const entry of cases){
  renderer.forceLegacyEnemyPreparation=forceLegacy;
  const baseline=canvasFixture(entry.throwImage),candidate=canvasFixture(entry.throwImage),expected=drawNativeHitLight(baseline.c,entry.native,entry.remaining,entry.impact,(c,frame)=>art.drawFrame(c,frame));
  assert.equal(renderer.drawNativeHitFlash(candidate.c,entry.native,entry.remaining,entry.impact),expected);assert.deepEqual(candidate.calls,baseline.calls,'the identical original image/rectangle, alpha and screen/clip sequence is retained');assert.equal(candidate.stack.length,0);assert.equal(candidate.c.globalAlpha,.37);assert.equal(candidate.c.globalCompositeOperation,'source-over');assert.equal(candidate.c.imageSmoothingEnabled,false);assert.equal(candidate.c.imageSmoothingQuality,'low');
  if(!entry.native||!Number.isFinite(entry.remaining)||entry.remaining<=0)assert.deepEqual(candidate.calls,[],'invalid/no hit performs no Canvas operation');
 }
});
