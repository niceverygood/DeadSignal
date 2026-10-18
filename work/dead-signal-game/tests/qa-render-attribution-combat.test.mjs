import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compareCanvasStateCombat} from '../dist/qa-canvas-state-combat.js';

// Reuse only helper declarations from the frozen, previously passing actual
// 180-enemy fixture; none of its test registrations are imported or rewritten.
// The independent full old combat module remains the default-mode oracle.
const qa=new URL('../../../qa/render-attribution-20261018/',import.meta.url),oldModuleURL=new URL('../dist/qa-canvas-state-combat.js',import.meta.url),fixtureBase=new URL('./qa-canvas-state-combat.test.mjs',import.meta.url);
const sha=value=>createHash('sha256').update(value).digest('hex');
const rebase=(source,base)=>source.replace(/from\s+(['"])([^'"]+)\1/g,(whole,quote,specifier)=>specifier.startsWith('.')?'from '+quote+new URL(specifier,base).href+quote:whole);
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const originalBytes=await readFile(new URL('combat-harness-before.txt',qa));assert.equal(originalBytes.length,37171);assert.equal(sha(originalBytes),'3b3ae5ca126f3a3c840bd73138ea9fac3eb770056288a74837eafc94cffbf92d');
const original=await import(moduleURL(rebase(originalBytes.toString('utf8'),oldModuleURL)));
const fixtureBytes=await readFile(new URL('combat-fixture-before.txt',qa));assert.equal(fixtureBytes.length,24058);assert.equal(sha(fixtureBytes),'5dd93656b65aeb2f3125270adbb973ff5aa9c9e8b216c8840e88cb2997fdd664');
const fixtureSource=fixtureBytes.toString('utf8'),boundary=fixtureSource.indexOf("\ntest('invalid origins");assert.ok(boundary>0);assert.equal(fixtureSource.slice(0,boundary).includes('\ntest('),false);
const declarations=fixtureSource.slice(0,boundary).replace("import {compareCanvasStateCombat} from '../dist/qa-canvas-state-combat.js';",'');
const helpers=await import(moduleURL(rebase(declarations,fixtureBase)+'\nexport {environment,address,gate,state,mainUnchanged,ownedImagesAndAssetsRetired,failure,turn};'));
const {environment,address,gate,state,mainUnchanged,ownedImagesAndAssetsRetired,failure,turn}=helpers;
const attributionAddress=()=>address('qa&qa-memory=attribution&qa-render-attribution=1');

function addProfiler(e,{stopFailure=false,endFailure=false}={}){
 const profiles=[];e.testDeps.createRenderAttribution=({renderer,limit,maxOutliers})=>{
  assert.equal(renderer.liveEnemies.renderer.info.render.frame,0);assert.ok(limit===undefined||limit===40);assert.ok(maxOutliers===undefined||maxOutliers===32);
  const profile={renderer,stopped:false,stops:0,current:null,samples:[],beginFrame(meta){assert.equal(this.current,null);this.current={...meta,nativeBefore:renderer.liveEnemies.renderer.info.render.frame};},endFrame(){if(!this.current)return;this.samples.push({...this.current,nativeAfter:renderer.liveEnemies.renderer.info.render.frame,stages:{'renderer.render':{calls:1,inclusiveMs:1,selfMs:1,thrownCalls:0,falseReturns:0}}});this.current=null;if(endFailure)throw Error('injected attribution end failure');},report(){return{enabled:true,stopped:this.stopped,cleanupComplete:this.stopped,samples:this.samples.map(sample=>({...sample})),outliers:[],unmeasured:[],summary:{frames:this.samples.length},note:'Injected original-call observer fixture, not Canvas/performance evidence.'};},stop(){if(!this.stopped){this.stopped=true;this.stops++;this.current=null;}if(stopFailure)throw Error('injected attribution stop failure');return this.report();}};
  profiles.push(profile);return profile;
 };return profiles;
}

test('default A/B/A protocol, full report, pixels and actual Game outputs are exactly the frozen whole-module original without constructing attribution',async()=>{
 const before=environment(),after=environment();let factories=0;
 before.testDeps.createRenderAttribution=after.testDeps.createRenderAttribution=()=>{factories++;throw Error('default must not construct attribution');};
 const beforeImages=[],afterImages=[];
 const a=await original.compareCanvasStateCombat(before.mainRenderer,{...gate(address()),document:before.document,testDeps:before.testDeps,onImage:image=>beforeImages.push(image)});
 const b=await compareCanvasStateCombat(after.mainRenderer,{...gate(address()),document:after.document,testDeps:after.testDeps,onImage:image=>afterImages.push(image)});
 assert.equal(factories,0);assert.deepEqual(b.report,a.report);assert.deepEqual(afterImages,beforeImages);assert.deepEqual(after.events,before.events);assert.equal(after.draws.length,120);
 const trace=e=>e.draws.map(({state,motion,input,command,time})=>({state,motion,input,command,time}));assert.deepEqual(trace(after),trace(before));assert.equal(Object.hasOwn(b.report,'originalAttribution'),false);assert.equal(Object.hasOwn(b.report,'profileOnly'),false);mainUnchanged(before);mainUnchanged(after);ownedImagesAndAssetsRetired(before);ownedImagesAndAssetsRetired(after);
});

test('explicit attribution requires its own exact flag and genuine memory before reading the owner, document, dependencies or profiler factory',async()=>{
 for(const location of [address('qa&qa-memory=attr&qa-canvas-combat=1'),address('qa&qa-memory=attr&qa-render-attribution=0'),address('qa&qa-render-attribution=1'),new URL('http://localhost:8806/?qa&qa-memory&qa-render-attribution=1'),new URL('https://localhost:8851/?qa&qa-memory&qa-render-attribution=1')]){
  let reads=0;const options={...gate(location),originalAttribution:true};for(const key of ['document','testDeps'])Object.defineProperty(options,key,{get(){reads++;throw Error('attribution gate must precede factories and DOM');}});
  const result=await compareCanvasStateCombat(new Proxy({},{get(){reads++;throw Error('attribution owner guard');},getOwnPropertyDescriptor(){reads++;throw Error('attribution descriptor guard');}}),options);assert.equal(result.report.complete,false);assert.equal(reads,0);
 }
 let reads=0;const location=attributionAddress(),result=await compareCanvasStateCombat(new Proxy({},{get(){reads++;throw Error('fake map owner');}}),{location,query:location.searchParams,storage:new Map(),originalAttribution:true,get testDeps(){reads++;throw Error('fake map factory');}});assert.equal(result.report.complete,false);assert.equal(reads,0);
});

test('original-only attribution observes two actual normal180 forty-frame arms with no prime, no Canvas candidate and unchanged state/events/RNG',async()=>{
 const e=environment(),profiles=addProfiler(e),images=[],{report}=await compareCanvasStateCombat(e.mainRenderer,{...gate(attributionAddress()),originalAttribution:true,document:e.document,testDeps:e.testDeps,onImage:image=>images.push(image)});
 assert.equal(report.complete,true);assert.equal(report.originalAttribution,true);assert.equal(report.profileOnly,true);assert.equal(report.performance,null);assert.equal(report.fixture.count,180);assert.deepEqual(report.passes.map(pass=>[pass.arm,pass.mode]),[['A1','original'],['A2','original']]);assert.equal(e.installers.length,0);assert.equal(profiles.length,2);assert.equal(e.draws.length,80);assert.equal(images.length,2);
 const groups=e.renderers.map(renderer=>e.draws.filter(draw=>draw.renderer===renderer));assert.ok(groups.every(group=>group.length===40));assert.deepEqual(groups[1].map(({state,motion,input,command,time})=>({state,motion,input,command,time})),groups[0].map(({state,motion,input,command,time})=>({state,motion,input,command,time})));assert.ok(e.draws.every(draw=>draw.state.snapshot.time>0));assert.ok(groups[0].at(-1).state.snapshot.time>4.7);
 for(const key of ['state','events','commands','motion','random','visualRandom'])assert.equal(report.equivalence[key],true,key);assert.equal(report.equivalence.framesCompared,40);assert.deepEqual(report.equivalence.mismatches,[]);assert.equal(report.pixels.originalRepeat.differentComponents,0);
 for(let i=0;i<profiles.length;i++){const profile=profiles[i];assert.equal(profile.stops,1);assert.equal(profile.samples.length,40);assert.equal(profile.samples[0].nativeBefore,0);assert.equal(profile.samples[0].nativeAfter,1);assert.equal(profile.samples.at(-1).nativeAfter,40);assert.equal(report.passes[i].attribution.stopped,true);assert.equal(report.passes[i].attribution.cleanupComplete,true);assert.equal(report.passes[i].samples.length,40);assert.equal(report.passes[i].preparation.source.nativeDrawsBefore,0);}
 assert.equal(report.cleanup.complete,true);mainUnchanged(e);ownedImagesAndAssetsRetired(e);
});

test('render throws, observer cleanup throws and aborted late loads preserve the primary failure and retire only owned resources',async()=>{
 for(const [mode,stopFailure,endFailure]of [['render-failure',false,false],['render-failure',true,false],['render-failure',false,true],['abort-yield',false,false]]){const e=environment(mode),profiles=addProfiler(e,{stopFailure,endFailure}),controller=new AbortController();e.setController(controller);const error=await failure(compareCanvasStateCombat(e.mainRenderer,{...gate(attributionAddress()),originalAttribution:true,document:e.document,testDeps:e.testDeps,signal:controller.signal}));assert.match(error.message,/controlled canvas combat render failure|aborted/);assert.ok(profiles.every(profile=>profile.stops===1));if(stopFailure)assert.ok(error.cleanup.errors.some(entry=>String(entry.error).includes('injected attribution stop failure')));if(endFailure){assert.equal(error.message,'controlled canvas combat render failure');assert.ok(error.cleanup.errors.some(entry=>entry.where==='attribution.endFrame'));}mainUnchanged(e);ownedImagesAndAssetsRetired(e);}
 const e=environment('late-model-failure'),profiles=addProfiler(e),error=await failure(compareCanvasStateCombat(e.mainRenderer,{...gate(attributionAddress()),originalAttribution:true,document:e.document,testDeps:e.testDeps}));assert.equal(error.message,'controlled canvas combat render failure');assert.equal(profiles.length,1);assert.equal(profiles[0].stops,1);const rig=e.renderers[0].liveEnemies,before=state(e.advances[0].game);assert.equal(rig.pending.size,1);e.pending.resolve();await turn();await turn();assert.equal(rig.models.size,0);assert.equal(rig.pending.size,0);assert.equal(rig.lateModelsDisposed,1);assert.deepEqual(state(e.advances[0].game),before);assert.equal(error.cleanup.lateScheduled,error.cleanup.lateSettled);mainUnchanged(e);ownedImagesAndAssetsRetired(e);
 const preparing=environment('deferred'),pendingProfiles=addProfiler(preparing),controller=new AbortController(),pending=compareCanvasStateCombat(preparing.mainRenderer,{...gate(attributionAddress()),originalAttribution:true,document:preparing.document,testDeps:preparing.testDeps,signal:controller.signal});await turn();assert.equal(pendingProfiles.length,0);controller.abort();assert.match((await failure(pending)).message,/aborted/);preparing.pending.resolve();await turn();await turn();assert.equal(pendingProfiles.length,0,'late preparation must not create an observer or resume rendering');assert.equal(preparing.draws.length,0);mainUnchanged(preparing);ownedImagesAndAssetsRetired(preparing);
});
