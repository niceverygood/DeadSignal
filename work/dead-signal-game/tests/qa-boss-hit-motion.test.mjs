import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Game,WEAPONS} from '../dist/engine.js?v=0.29.0';
import {Renderer} from '../dist/renderer.js';
import {createQAStorage} from '../dist/qa-storage.js';

// Real Game, bullets, HP, navigation, boss phases and the unchanged original
// Renderer.nativeEnemyFrame execute. Assets/native pixels/24-pose service are
// controlled fixtures: only browser execution can prove original GL animation.
const moduleURL=new URL('../dist/qa-boss-hit-motion.js',import.meta.url),deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};},turn=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){for(let n=0;n<60&&!predicate();n++)await turn();assert.ok(predicate(),'owned original load entered');}
let serial=0;
async function environment(mode,run){
 const source=await readFile(moduleURL,'utf8'),symbol=Symbol.for('boss-hit-motion-'+serial++),globals=new Map(['document','requestAnimationFrame'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),rigs=[],arts=[],images=[],progress=[],gate=deferred(),marker=Error('original body read marker');let poseCalls=0,createdCanvases=0;
 function canvas(){createdCanvases++;const image={width:512,height:512,dataset:{},pixels:new Uint8ClampedArray(512*512*4),toDataURL(){return'data:image/mock;base64,'+this.pixels.slice(0,8).join(',');}};image.getContext=()=>({fillStyle:'',font:'',fillRect(){},fillText(){},clearRect(){image.pixels.fill(0);},drawImage(other){image.pixels.set(other.pixels);},getImageData(){if(mode==='read-throw')throw marker;return{data:new Uint8ClampedArray(image.pixels)};}});return image;}
 const manifest={assets:{},bosses:{}};for(const role of ['mid','final']){const key='boss-01-'+role,ids=[key+'-walk',key+'-actions'];manifest.bosses[key]={walk:ids[0],idle:ids[0],actions:ids[1]};for(const id of ids)manifest.assets[id]={worldHeight:60,referenceRadius:role==='mid'?27:45};}
 class ArtFixture{
  constructor(options){Object.assign(this,options);this.records=new Map();arts.push(this);}
  status(id){return this.records.get(id)?.status??'idle';}
  isReady(id){return this.status(id)==='ready';}
  get(id){return this.records.get(id);}
  load(id){assert.ok(this.manifest.assets[id]);assert.equal(this.onChange,null);const record={status:'ready',metadata:{originalFixture:true},image:canvas(),promise:Promise.resolve(true)};this.records.set(id,record);return record.promise;}
  releaseUnusedAssets(keep){for(const [id,record]of this.records)if(!keep.includes(id)){this.records.delete(id);record.status='released';record.metadata=record.image=null;}}
  bossFrame(key,actor,options){assert.ok(this.isReady(this.manifest.bosses[key].walk));return{id:this.manifest.bosses[key].walk,metadata:{projection:{subjectHeight:60},atlas:{samples:1},animation:{}},frame:{sample:0},locomotion:{pose:actor.walkPhase>0?'walk':'idle',phase:actor.walkPhase,moveWeight:actor.attackState==='walk'?1:0,angle:actor.angle},placement:{foot:{x:0,y:0}}};}
 }
 class RigFixture{
  constructor({size}){assert.equal(size,512);this.size=512;this.models=new Map();this.pending=new Map();this.error='';this.lost=false;this.disposals=0;this.losses=0;this.releases=0;this.renderer={domElement:canvas(),info:{render:{frame:0}},dispose:()=>{this.disposals++;},forceContextLoss:()=>{this.losses++;}};this.output=canvas();rigs.push(this);}
  load(key){if(!this.pending.has(key)){const promise=(async()=>{if(mode==='pending')await gate.promise;const vector={values:[0,0,0],toArray(){return[...this.values];}},quaternion={toArray:()=>[0,0,0,1]},scale={toArray:()=>[1,1,1]};this.models.set(key,{bones:[{position:vector,quaternion,scale}]});return true;})();this.pending.set(key,promise);}return this.pending.get(key);}
  releaseUnused(keep){this.releases++;for(const key of this.models.keys())if(!keep.includes(key)){this.models.delete(key);this.pending.delete(key);}}
  frame(key,actor,time,fallback,options){assert.ok(this.models.has(key));assert.equal(this.exactGPUAlphaBounds,false);assert.equal(options.simulationTime,time);this.renderer.info.render.frame++;this.models.get(key).bones[0].position.values[1]=time;this.output.pixels[0]=Math.round(time*100)%256;this.output.pixels[1]=Math.round(actor.x)%256;this.output.pixels[2]=actor.attackState==='walk'?1:actor.attackState==='windup'?2:actor.attackState==='charge'?3:4;this.output.pixels[3]=255;this.diagnostics={key,clip:actor.attackState==='walk'?'walk':actor.attackState==='windup'?'windup':actor.attackState==='charge'?'attack':'idle',sample:Math.round(time*77)%96,sampleDensity:96,continuousSampling:true,moveWeight:fallback.locomotion.moveWeight,hitLayerWeight:actor.hitFlash>0?.5:0};return{...fallback,image:this.output,metadata:{...fallback.metadata,liveRig:true}};}
 }
 const originalArt=new ArtFixture({manifest,baseURL:new URL('http://localhost:8851/assets/production/'),fetchImpl(){},ImageCtor:function OriginalImage(){},timeoutMs:15000,onChange(){assert.fail('original callback');}}),originalRecord={status:'ready',image:{original:true},metadata:Object.freeze({preserved:true})};originalArt.records.set('original-shared',originalRecord);const originalRig={productOriginal:true},renderer={productionArt:originalArt,liveBoss:originalRig,liveBossPromise:Promise.resolve(originalRig),liveEnemies:{productNPC:true},liveEnemiesPromise:null,liveEnemiesLoading:false},owners=Object.getOwnPropertyDescriptors(renderer),recordBefore=Object.getOwnPropertyDescriptors(originalRecord);
 async function inspectOriginalBossPoses(adapter,options){poseCalls++;assert.equal(Object.getPrototypeOf(adapter),Renderer.prototype);assert.notEqual(adapter.productionArt,originalArt);assert.notEqual(adapter.liveBoss,originalRig);assert.equal(adapter.nativeEnemyFrame,Renderer.prototype.nativeEnemyFrame);assert.ok(!options.signal.aborted);return{reports:Array.from({length:24},(_,n)=>({key:'controlled-'+n,originalBrowserEvidence:false})),note:'Controlled pose orchestration only; no GL claim.'};}
 class FrozenWarningFixture extends Game{tick(...args){const result=super.tick(...args);if(this.upgrades.haste===2&&this.boss&&!this.boss.dead){this.boss.attackState='windup';this.boss.attackTime=.9;this.boss.stun=.09;}return result;}}
 globalThis[symbol]={Game:mode==='frozen-warning'?FrozenWarningFixture:Game,WEAPONS,ProductionArt:ArtFixture,LiveBossRig:RigFixture,inspectOriginalBossPoses};
 const shimURL='data:text/javascript;base64,'+Buffer.from('export const {Game,WEAPONS,ProductionArt,LiveBossRig,inspectOriginalBossPoses}=globalThis[Symbol.for('+JSON.stringify(Symbol.keyFor(symbol))+')];').toString('base64'),shims=new Set(['./engine.js?v=0.29.0','./production-art.js?v=0.29.0','./boss-rig/live-boss.js','./qa-boss-pose-audit.js']);
 const rewritten=source.replace(/(from\s*)(['"])(\.\/[^'"]+)\2/g,(match,prefix,quote,specifier)=>prefix+JSON.stringify(shims.has(specifier)?shimURL:new URL(specifier,moduleURL).href));
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(name){assert.equal(name,'canvas');return canvas();}}});Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:callback=>queueMicrotask(()=>callback(0))});const location=new URL('http://localhost:8851/?qa&qa-memory'),query=location.searchParams,storage=createQAStorage(query,()=>assert.fail('persistent storage'));for(const key of ['getItem','setItem','removeItem'])storage[key]=()=>assert.fail('brand gate makes no storage API call');
 try{const module=await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'));return await run({module,renderer,owners,originalArt,originalRig,arts,rigs,images,progress,gate,marker,options:{location,query,storage,onProgress:info=>progress.push(info),onImage:info=>images.push(info)},get poseCalls(){return poseCalls;},get createdCanvases(){return createdCanvases;}});}
 finally{gate.resolve();delete globalThis[symbol];for(const [key,descriptor]of globals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}assert.equal(originalArt.records.get('original-shared'),originalRecord);assert.deepEqual(Object.getOwnPropertyDescriptors(originalRecord),recordBefore);}
}
const restored=env=>{assert.deepEqual(Object.getOwnPropertyDescriptors(env.renderer),env.owners);for(const art of env.arts.slice(1))assert.equal(art.records.size,0);for(const rig of env.rigs){assert.equal(rig.models.size,0);assert.equal(rig.disposals,1);assert.equal(rig.losses,1);}};

test('QA origin/brand/pre-abort guards perform no asset, canvas, Game or main-owner IO',async()=>{
 await environment('normal',async env=>{const before=env.createdCanvases,hostile=new Proxy({}, {get(){assert.fail('guarded owner getter');},getOwnPropertyDescriptor(){assert.fail('guarded descriptor read');}});for(const options of [{...env.options,location:new URL('http://localhost:8806/?qa&qa-memory')},{...env.options,query:new URLSearchParams('qa')},{...env.options,storage:{}}])await assert.rejects(env.module.inspectBossHitMotion(hostile,options),/memory-origin-required/);const controller=new AbortController();controller.abort();await assert.rejects(env.module.inspectBossHitMotion(hostile,{...env.options,signal:controller.signal}),/aborted/);assert.equal(env.rigs.length,0);assert.equal(env.createdCanvases,before);restored(env);});
});

test('four own normal boss fights execute original nativeEnemyFrame, match independent actual Game replay and leave product owners intact',async()=>{
 await environment('normal',async env=>{
  const {report}=await env.module.inspectBossHitMotion(env.renderer,env.options);assert.equal(report.combats.length,4);assert.equal(report.poses.reports.length,24);assert.equal(env.poseCalls,1);assert.equal(env.images.length,4);assert.equal(report.cleanup.complete,true);
  for(const fight of report.combats){assert.equal(fight.initialEnemies,5);assert.equal(fight.initialSpawnClock,1.5);assert.equal(fight.initialPlayer.hp,100);assert.equal(fight.initialPlayer.invul,1);assert.equal(fight.validInitialSnapshot,true);assert.equal(fight.gpuAlphaEnabled,false);assert.ok(fight.travel>0);assert.ok(fight.phases.includes('windup'));assert.ok(fight.bodyChanged);assert.ok(fight.renderCalls>0);assert.ok(fight.captures.length<=10);assert.ok(fight.captures.every(capture=>capture.liveRig&&capture.private512&&capture.bone.boneCount===1));if(fight.sustainedFire){assert.ok(fight.damage>0);assert.ok(fight.bossHitTicks>0);}else assert.equal(fight.damage,0);
   const control=Game.restore(fight.initialSnapshot,{resumePlaying:true});assert.ok(control);const boss=control.boss;let armed=false;
   for(const sample of fight.samples){if(sample.tick>0){if(!armed&&control.time>=.3-1e-9){boss.skillCd=0;armed=true;}control.tick(1/60,{moveX:0,moveY:0,shoot:fight.sustainedFire,fireMode:'manual',aimX:boss.x,aimY:boss.y});control.drainEvents();}for(const key of ['x','y','hp','stun','hitFlash','walkPhase','attackState','attackTime','skillCd'])assert.equal(boss[key],sample[key],'unchanged engine '+fight.bossKey+' '+key+' at '+sample.tick);assert.equal(control.time,sample.time);assert.equal(control.player.hp,sample.playerHp);assert.equal(control.player.ammo,sample.ammo);assert.equal(control.player.reloadTime,sample.reloadTime);}
   assert.equal(control.random.getState(),fight.random);assert.equal(control.visualRandom.getState(),fight.visualRandom);assert.equal(control.state,fight.finalState);
  }restored(env);
 });
});

test('original body read errors, pending abort and external same-value owner changes preserve error/owners and clean only owned late resources',async()=>{
 await environment('read-throw',async env=>{await assert.rejects(env.module.inspectBossHitMotion(env.renderer,env.options),error=>error===env.marker);assert.equal(env.poseCalls,0);restored(env);});
 await environment('pending',async env=>{const controller=new AbortController(),operation=env.module.inspectBossHitMotion(env.renderer,{...env.options,signal:controller.signal});await until(()=>env.rigs[0]?.pending.size>0);controller.abort();await assert.rejects(operation,/aborted/);env.gate.resolve();await turn();restored(env);});
 await environment('pending',async env=>{const operation=env.module.inspectBossHitMotion(env.renderer,env.options);await until(()=>env.rigs[0]?.pending.size>0);const descriptor={...env.owners.liveBoss,writable:false};Object.defineProperty(env.renderer,'liveBoss',descriptor);env.gate.resolve();const error=await operation.then(()=>assert.fail('foreign owner change accepted'),error=>error);assert.match(error.message,/main-owner-changed/);assert.deepEqual(Object.getOwnPropertyDescriptor(env.renderer,'liveBoss'),descriptor);assert.equal(error.cleanup.externalOwnerPreserved,true);for(const key of Object.keys(env.owners))if(key!=='liveBoss')assert.deepEqual(Object.getOwnPropertyDescriptor(env.renderer,key),env.owners[key]);assert.equal(env.rigs[0].models.size,0);assert.equal(env.rigs[0].disposals,1);assert.equal(env.rigs[0].losses,1);});
});

test('early walking and changing body pixels cannot certify a sustained-hit warning whose original attack timer never progresses',async()=>{
 await environment('frozen-warning',async env=>{
  const error=await env.module.inspectBossHitMotion(env.renderer,env.options).then(()=>assert.fail('frozen warning must not pass as live combat'),error=>error);assert.match(error.message,/actual-movement-hit-or-phase-missing/);const frozen=error.combats.at(-1);assert.equal(frozen.sustainedFire,true);assert.equal(frozen.normalEnded,false);assert.ok(frozen.travel>0);assert.ok(frozen.bodyChanged);assert.ok(frozen.phases.includes('windup'));assert.equal(frozen.attackProgress.actualSkillEvents,0);assert.equal(frozen.attackProgress.chargePhase,false);assert.equal(frozen.attackProgress.countdownProgress,false);assert.equal(env.poseCalls,0);restored(env);
 });
});
