import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compareCanvasStateCombat} from '../dist/qa-canvas-state-combat.js';
import {createOwnedCleanupTracker} from '../dist/qa-owned-cleanup-tracker.js';
const qa=new URL('../../../qa/owned-late-cleanup-20261018/',import.meta.url),base=new URL('../dist/qa-canvas-state-combat.js',import.meta.url);
const moduleURL=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const rebase=(s,url)=>s.replace(/from\s+(['"])([^'"]+)\1/g,(whole,q,spec)=>spec.startsWith('.')?'from '+q+new URL(spec,url).href+q:whole);
const prior=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8')),beforeBytes=await readFile(new URL('combat-harness-before.txt',qa)),beforeRow=prior.files.find(row=>row.file.endsWith('/dist/qa-canvas-state-combat.js'));
assert.equal(beforeBytes.length,beforeRow.bytes);assert.equal(createHash('sha256').update(beforeBytes).digest('hex'),beforeRow.sha256);
const before=await import(moduleURL(rebase(beforeBytes.toString('utf8'),base)));
const fixtureURL=new URL('../../../qa/player-deferred-read-20261018/combat-fixture-before.txt',import.meta.url),fixtureBase=new URL('./qa-canvas-state-combat.test.mjs',import.meta.url),fixture=await readFile(fixtureURL,'utf8'),boundary=fixture.indexOf("\ntest('invalid origins");assert.ok(boundary>0);
const declarations=fixture.slice(0,boundary).replace("import {compareCanvasStateCombat} from '../dist/qa-canvas-state-combat.js';",'');
const {environment,address,gate,state,mainUnchanged,ownedImagesAndAssetsRetired,failure,turn}=await import(moduleURL(rebase(declarations,fixtureBase)+'\nexport {environment,address,gate,state,mainUnchanged,ownedImagesAndAssetsRetired,failure,turn};'));
const location=()=>address('qa&qa-memory=owned-cleanup-test&qa-original-readback=1&qa-owned-cleanup=1');
function setup(e,extra={}){e.testDeps.createOwnedCleanupTracker=createOwnedCleanupTracker;e.testDeps.ownedCleanupTestOptions={timeoutMs:100,...extra};e.testDeps.probeOriginalReadback=()=>({complete:true,stable:true,injected:true});return{...gate(location()),originalReadbackProbe:true,boundedOwnedCleanup:true,document:e.document,testDeps:e.testDeps};}

test('bounded retirement requires exact opt-in plus original-only genuine memory before owner or dependency reads',async()=>{
 for(const [url,extra] of [[address(),{}],[address('qa&qa-memory=x&qa-original-readback=1'),{}],[location(),{originalReadbackProbe:false}],[new URL('http://localhost:8806/?qa&qa-memory=x&qa-original-readback=1&qa-owned-cleanup=1'),{}],[location(),{playerDeferredRead:true}]]){
  let reads=0;const opts={...gate(url),originalReadbackProbe:true,boundedOwnedCleanup:true,...extra};for(const key of ['document','testDeps'])Object.defineProperty(opts,key,{get(){reads++;throw Error('dependency before gate');}});
  const result=await compareCanvasStateCombat(new Proxy({},{get(){reads++;throw Error('owner before gate');},getOwnPropertyDescriptor(){reads++;throw Error('owner before gate');}}),opts);assert.equal(result.report.available,false);assert.equal(reads,0);
 }
 let calls=0;const e=environment('render-failure');e.testDeps.probeOriginalReadback=()=>({complete:true,stable:true,injected:true});e.testDeps.createOwnedCleanupTracker=()=>{calls++;throw Error('disabled tracker');};
 const opts={...gate(address('qa&qa-memory=x&qa-original-readback=1')),originalReadbackProbe:true,document:e.document,testDeps:e.testDeps,get boundedOwnedCleanup(){throw Error('own accessor must not execute');}};
 const oldEnv=environment('render-failure');oldEnv.testDeps.probeOriginalReadback=e.testDeps.probeOriginalReadback;const old=await failure(before.compareCanvasStateCombat(oldEnv.mainRenderer,{...gate(address('qa&qa-memory=x&qa-original-readback=1')),originalReadbackProbe:true,document:oldEnv.document,testDeps:oldEnv.testDeps}));
 const current=await failure(compareCanvasStateCombat(e.mainRenderer,opts));assert.equal(current.message,old.message);assert.deepEqual(current.report,old.report);assert.deepEqual(e.events,oldEnv.events);assert.equal(calls,0);assert.equal(Object.hasOwn(current.report,'boundedOwnedCleanup'),false);mainUnchanged(e);mainUnchanged(oldEnv);
});

test('fulfilled retained native promises drain after80 original callbacks without extra ticks, pixels or battle-clock cost',async()=>{
 const e=environment(),Original=e.testDeps.Renderer;e.testDeps.Renderer=class extends Original{render(...args){super.render(...args);if(!this.liveEnemies.pending.has('retained'))this.liveEnemies.pending.set('retained',Promise.resolve('loaded'));}};
 const {report}=await compareCanvasStateCombat(e.mainRenderer,setup(e));assert.equal(report.complete,true);assert.equal(e.draws.length,80);assert.equal(e.advances.length,80);assert.equal(e.installers.length,0);assert.equal(report.equivalence.framesCompared,40);assert.deepEqual(report.equivalence.mismatches,[]);assert.equal(report.pixels.originalRepeat.differentComponents,0);assert.equal(report.performance.accepted,false);
 assert.equal(report.cleanup.complete,true);assert.equal(report.cleanup.drain.success,true);assert.equal(report.cleanup.drain.scheduled,2);assert.equal(report.cleanup.drain.completed,2);assert.equal(report.cleanup.drain.active,0);assert.ok(report.cleanup.arms.every(row=>row.finalAfterDrain&&row.npcPendingRemaining===0));assert.ok(Object.isFrozen(report.cleanup));
 for(const pass of report.passes){assert.equal(pass.sumPlusReadbackMs,pass.all40Summary.callbackMs.sumMs+pass.readbackMs);assert.equal(pass.drainInclusiveSummary.count,41);}
 mainUnchanged(e);ownedImagesAndAssetsRetired(e);
});

test('a late on-demand model retires once while preserving the primary render error and Game state',async()=>{
 const e=environment('late-model-failure'),opts=setup(e,{timeoutMs:1000}),running=compareCanvasStateCombat(e.mainRenderer,opts);running.catch(()=>{});await turn();await turn();const rig=e.renderers[0].liveEnemies,beforeState=state(e.advances[0].game);assert.equal(rig.pending.size,1);assert.equal(rig.models.size,0);e.pending.resolve();const error=await failure(running);
 assert.equal(error.message,'controlled canvas combat render failure');assert.equal(error.cleanup.complete,true);assert.equal(error.cleanup.drain.success,true);assert.equal(rig.lateModelsDisposed,1);assert.equal(rig.pending.size,0);assert.equal(rig.models.size,0);assert.deepEqual(state(e.advances[0].game),beforeState);assert.equal(e.advances.length,1);mainUnchanged(e);ownedImagesAndAssetsRetired(e);
});

test('deadline leaves immutable pending evidence, late best-effort retirement cannot rewrite the saved failure, and abort does not cancel cleanup drain',async()=>{
 const e=environment('late-model-failure'),error=await failure(compareCanvasStateCombat(e.mainRenderer,setup(e,{timeoutMs:5})));assert.equal(error.message,'controlled canvas combat render failure');assert.equal(error.cleanup.complete,false);assert.equal(error.cleanup.drain.timedOut,true);assert.equal(error.cleanup.drain.active,1);assert.equal(error.cleanup.drain.pending[0].label.key,'enemy-elite');const saved=JSON.stringify(error.report),rig=e.renderers[0].liveEnemies;e.pending.resolve();await turn();await turn();assert.equal(rig.lateModelsDisposed,1);assert.equal(rig.models.size,0);assert.equal(rig.pending.size,0);assert.equal(JSON.stringify(error.report),saved);mainUnchanged(e);ownedImagesAndAssetsRetired(e);
 const a=environment('deferred'),controller=new AbortController(),opts=setup(a,{timeoutMs:1000}),running=compareCanvasStateCombat(a.mainRenderer,{...opts,signal:controller.signal});running.catch(()=>{});await turn();controller.abort();await turn();a.pending.resolve();const aborted=await failure(running);assert.match(aborted.message,/aborted/);assert.equal(aborted.cleanup.drain.success,true);assert.equal(a.advances.length,0);mainUnchanged(a);ownedImagesAndAssetsRetired(a);
});

test('registration and final snapshot faults preserve the primary error, protected owner proof and finalized failure',async()=>{
 const e=environment('late-model-failure'),opts=setup(e);e.testDeps.createOwnedCleanupTracker=()=>({follow(){throw Error('controlled tracker registration failure');},async wait(){e.pending.resolve();await turn();await turn();return{success:false,complete:true,scheduled:0,completed:0};}});
 const error=await failure(compareCanvasStateCombat(e.mainRenderer,opts));assert.equal(error.message,'controlled canvas combat render failure');assert.ok(error.cleanup.errors.some(row=>row.where==='late.registration'));assert.equal(error.cleanup.mainOwnersUnchanged,true);assert.equal(error.cleanup.complete,false);assert.equal(e.renderers[0].liveEnemies.lateModelsDisposed,1);assert.ok(Object.isFrozen(error.cleanup));mainUnchanged(e);ownedImagesAndAssetsRetired(e);
 const a=environment('render-failure'),snapshotOpts=setup(a);a.testDeps.createOwnedCleanupTracker=()=>({follow(){return true;},async wait(){Object.defineProperty(a.renderers[0].liveEnemies,'raw',{get(){throw Error('controlled final snapshot failure');}});return{success:true,complete:true,scheduled:0,completed:0};}});
 const failed=await failure(compareCanvasStateCombat(a.mainRenderer,snapshotOpts));assert.equal(failed.message,'controlled canvas combat render failure');assert.ok(failed.cleanup.errors.some(row=>row.where==='late.final-snapshot.A1'));assert.equal(failed.cleanup.mainOwnersUnchanged,true);assert.equal(failed.cleanup.arms[0].finalAfterDrain,false);assert.equal(failed.cleanup.complete,false);assert.ok(Object.isFrozen(failed.cleanup));mainUnchanged(a);ownedImagesAndAssetsRetired(a);
});
