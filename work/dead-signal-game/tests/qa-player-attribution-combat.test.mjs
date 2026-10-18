import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compareCanvasStateCombat} from '../dist/qa-canvas-state-combat.js';

// Independent full before module plus frozen real Game fixture declarations.
// No prior test registrations or timing callbacks are imported or rewritten.
const qa=new URL('../../../qa/player-attribution-20261018/',import.meta.url),base=new URL('../dist/qa-canvas-state-combat.js',import.meta.url),fixtureBase=new URL('./qa-canvas-state-combat.test.mjs',import.meta.url);
const sha=value=>createHash('sha256').update(value).digest('hex');
const rebase=(source,url)=>source.replace(/from\s+(['"])([^'"]+)\1/g,(whole,quote,specifier)=>specifier.startsWith('.')?'from '+quote+new URL(specifier,url).href+quote:whole);
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const beforeBytes=await readFile(new URL('combat-harness-before.txt',qa));assert.equal(beforeBytes.length,41072);assert.equal(sha(beforeBytes),'65a5e97893c4021f6f3e58d2f2474d1c1286a0843f76581bc77be4602a3e8e3b');
const before=await import(moduleURL(rebase(beforeBytes.toString('utf8'),base)));
const fixtureBytes=await readFile(new URL('combat-fixture-before.txt',qa));assert.equal(fixtureBytes.length,24058);assert.equal(sha(fixtureBytes),'5dd93656b65aeb2f3125270adbb973ff5aa9c9e8b216c8840e88cb2997fdd664');
const fixtureSource=fixtureBytes.toString('utf8'),boundary=fixtureSource.indexOf("\ntest('invalid origins");assert.ok(boundary>0);assert.equal(fixtureSource.slice(0,boundary).includes('\ntest('),false);
const declarations=fixtureSource.slice(0,boundary).replace("import {compareCanvasStateCombat} from '../dist/qa-canvas-state-combat.js';",'');
const {environment,address,gate,state,mainUnchanged,ownedImagesAndAssetsRetired,failure,turn}=await import(moduleURL(rebase(declarations,fixtureBase)+'\nexport {environment,address,gate,state,mainUnchanged,ownedImagesAndAssetsRetired,failure,turn};'));
const attrAddress=()=>address('qa&qa-memory=player-attribution&qa-render-attribution=1');
const playerAddress=()=>address('qa&qa-memory=player-attribution&qa-render-attribution=1&qa-player-attribution=1');
const trace=e=>e.draws.map(({state,motion,input,command,time})=>({state,motion,input,command,time}));
function profilerFixture(e,{playerOnly=false,stopFailure=false,endFailure=false}={}){
 const profiles=[];e.testDeps.createRenderAttribution=options=>{
  assert.equal(Object.hasOwn(options,'playerOnly'),playerOnly,'legacy factory options must not gain a playerOnly property');if(playerOnly)assert.equal(options.playerOnly,true);
  const {renderer,limit,maxOutliers}=options;assert.equal(renderer.liveEnemies.renderer.info.render.frame,0);assert.equal(limit,40);assert.equal(maxOutliers,32);
  const profile={stops:0,stopped:false,current:null,samples:[],beginFrame(meta){assert.equal(this.current,null);this.current={...meta,nativeBefore:renderer.liveEnemies.renderer.info.render.frame};},endFrame(){if(!this.current)return;this.samples.push({...this.current,nativeAfter:renderer.liveEnemies.renderer.info.render.frame,stages:{'renderer.render':{calls:1,thrownCalls:0,falseReturns:0,inclusiveMs:1,selfMs:1}}});this.current=null;if(endFailure)throw Error('injected player attribution end failure');},report(){return{enabled:true,stopped:this.stopped,cleanupComplete:this.stopped,samples:this.samples.map(sample=>({...sample})),outliers:[],unmeasured:[],summary:{frames:this.samples.length},note:'Controlled original-call fixture; no native Canvas or performance claim.'};},stop(){if(!this.stopped){this.stopped=true;this.stops++;this.current=null;}if(stopFailure)throw Error('injected player attribution stop failure');return this.report();}};profiles.push(profile);return profile;
 };return profiles;
}

test('both existing default A/B/A and original-only A/A preserve the full independent before report, calls, clock and real Game outputs',async()=>{
 for(const attribution of [false,true]){
  const a=environment(),b=environment(),aImages=[],bImages=[];let unexpected=0;
  const aProfiles=attribution?profilerFixture(a):[],bProfiles=attribution?profilerFixture(b):[];
  if(!attribution)a.testDeps.createRenderAttribution=b.testDeps.createRenderAttribution=()=>{unexpected++;throw Error('default cannot create a profiler');};
  const options=e=>({...gate(attribution?attrAddress():address()),...(attribution?{originalAttribution:true}:{}),document:e.document,testDeps:e.testDeps});
  const old=await before.compareCanvasStateCombat(a.mainRenderer,{...options(a),onImage:image=>aImages.push(image)}),current=await compareCanvasStateCombat(b.mainRenderer,{...options(b),onImage:image=>bImages.push(image)});
  assert.deepEqual(current.report,old.report);assert.deepEqual(bImages,aImages);assert.deepEqual(b.events,a.events);assert.deepEqual(trace(b),trace(a));assert.equal(unexpected,0);assert.equal(b.draws.length,attribution?80:120);assert.equal(Object.hasOwn(current.report,'playerAttribution'),false);
  for(const profile of [...aProfiles,...bProfiles])assert.equal(profile.stops,1);mainUnchanged(a);mainUnchanged(b);ownedImagesAndAssetsRetired(a);ownedImagesAndAssetsRetired(b);
 }
});

test('explicit player request needs both own-data mode options, both exact flags and genuine8851 memory before owner, DOM or factory access',async()=>{
 const invalid=[
  [attrAddress(),true,true],[address('qa&qa-memory=p&qa-player-attribution=1'),true,true],[address('qa&qa-memory=p&qa-render-attribution=1&qa-player-attribution=0'),true,true],
  [address('qa&qa-memory=p&qa-render-attribution=0&qa-player-attribution=1'),true,true],[playerAddress(),false,true],[playerAddress(),undefined,true],
  [new URL('http://localhost:8806/?qa&qa-memory&qa-render-attribution=1&qa-player-attribution=1'),true,true],[new URL('https://localhost:8851/?qa&qa-memory&qa-render-attribution=1&qa-player-attribution=1'),true,true]
 ];
 for(const [location,originalAttribution,playerAttribution]of invalid){let reads=0;const options={...gate(location),originalAttribution,playerAttribution};for(const key of ['document','testDeps'])Object.defineProperty(options,key,{get(){reads++;throw Error('player gate precedes DOM and factory');}});const owner=new Proxy({},{get(){reads++;throw Error('player gate owner');},getOwnPropertyDescriptor(){reads++;throw Error('player gate descriptor');}}),result=await compareCanvasStateCombat(owner,options);assert.equal(result.report.complete,false);assert.equal(reads,0);}
 let reads=0;const location=playerAddress(),options={...gate(location),playerAttribution:true,get originalAttribution(){reads++;throw Error('mode option getter');},get testDeps(){reads++;throw Error('factory getter');}};assert.equal((await compareCanvasStateCombat(new Proxy({},{get(){reads++;throw Error('owner getter');}}),options)).report.complete,false);assert.equal(reads,0);
 const fakeMap={location,query:location.searchParams,storage:new Map(),originalAttribution:true,playerAttribution:true,get document(){reads++;throw Error('fake memory DOM');}};assert.equal((await compareCanvasStateCombat({},fakeMap)).report.complete,false);assert.equal(reads,0);
});

test('player-only mode forwards the narrow option and observes two unprimed normal180 original forty-frame arms with exact Game and RNG equivalence',async()=>{
 const e=environment(),profiles=profilerFixture(e,{playerOnly:true}),images=[],{report}=await compareCanvasStateCombat(e.mainRenderer,{...gate(playerAddress()),originalAttribution:true,playerAttribution:true,document:e.document,testDeps:e.testDeps,onImage:image=>images.push(image)});
 assert.equal(report.complete,true);assert.equal(report.originalAttribution,true);assert.equal(report.playerAttribution,true);assert.equal(report.profileOnly,true);assert.equal(report.performance,null);assert.equal(report.fixture.count,180);assert.deepEqual(report.passes.map(pass=>[pass.arm,pass.mode]),[['A1','original'],['A2','original']]);assert.equal(e.installers.length,0);assert.equal(profiles.length,2);assert.equal(e.draws.length,80);assert.equal(images.length,2);
 const groups=e.renderers.map(renderer=>e.draws.filter(draw=>draw.renderer===renderer));assert.ok(groups.every(group=>group.length===40));assert.deepEqual(groups[1].map(({state,motion,input,command,time})=>({state,motion,input,command,time})),groups[0].map(({state,motion,input,command,time})=>({state,motion,input,command,time})));assert.ok(groups[0].at(-1).state.snapshot.time>4.7);
 for(const key of ['state','events','commands','motion','random','visualRandom'])assert.equal(report.equivalence[key],true,key);assert.equal(report.equivalence.framesCompared,40);assert.deepEqual(report.equivalence.mismatches,[]);assert.equal(report.pixels.originalRepeat.differentComponents,0);
 for(let i=0;i<profiles.length;i++){const profile=profiles[i];assert.equal(profile.stops,1);assert.equal(profile.samples.length,40);assert.equal(profile.samples[0].nativeBefore,0);assert.equal(profile.samples[0].nativeAfter,1);assert.equal(profile.samples.at(-1).nativeAfter,40);assert.equal(report.passes[i].attribution.cleanupComplete,true);assert.equal(report.passes[i].preparation.source.nativeDrawsBefore,0);}
 assert.equal(report.cleanup.complete,true);mainUnchanged(e);ownedImagesAndAssetsRetired(e);
});

test('player observer failure, primary render throw, abort and late model completion preserve original failure and owned-only retirement',async()=>{
 for(const [mode,stopFailure,endFailure]of [['render-failure',false,false],['render-failure',true,false],['render-failure',false,true],['abort-yield',false,false]]){const e=environment(mode),profiles=profilerFixture(e,{playerOnly:true,stopFailure,endFailure}),controller=new AbortController();e.setController(controller);const error=await failure(compareCanvasStateCombat(e.mainRenderer,{...gate(playerAddress()),originalAttribution:true,playerAttribution:true,document:e.document,testDeps:e.testDeps,signal:controller.signal}));assert.match(error.message,/controlled canvas combat render failure|aborted/);assert.ok(profiles.every(profile=>profile.stops===1));if(stopFailure)assert.ok(error.cleanup.errors.some(entry=>String(entry.error).includes('injected player attribution stop failure')));if(endFailure){assert.equal(error.message,'controlled canvas combat render failure');assert.ok(error.cleanup.errors.some(entry=>entry.where==='attribution.endFrame'));}mainUnchanged(e);ownedImagesAndAssetsRetired(e);}
 const late=environment('late-model-failure'),profiles=profilerFixture(late,{playerOnly:true}),error=await failure(compareCanvasStateCombat(late.mainRenderer,{...gate(playerAddress()),originalAttribution:true,playerAttribution:true,document:late.document,testDeps:late.testDeps}));assert.equal(error.message,'controlled canvas combat render failure');assert.equal(profiles[0].stops,1);const rig=late.renderers[0].liveEnemies,checkpoint=state(late.advances[0].game);assert.equal(rig.pending.size,1);late.pending.resolve();await turn();await turn();assert.equal(rig.models.size,0);assert.equal(rig.pending.size,0);assert.equal(rig.lateModelsDisposed,1);assert.equal(error.cleanup.lateScheduled,error.cleanup.lateSettled);assert.deepEqual(state(late.advances[0].game),checkpoint);mainUnchanged(late);ownedImagesAndAssetsRetired(late);
 const e=environment('deferred'),pendingProfiles=profilerFixture(e,{playerOnly:true}),controller=new AbortController(),pending=compareCanvasStateCombat(e.mainRenderer,{...gate(playerAddress()),originalAttribution:true,playerAttribution:true,document:e.document,testDeps:e.testDeps,signal:controller.signal});await turn();assert.equal(pendingProfiles.length,0);controller.abort();assert.match((await failure(pending)).message,/aborted/);e.pending.resolve();await turn();await turn();assert.equal(pendingProfiles.length,0);assert.equal(e.draws.length,0);mainUnchanged(e);ownedImagesAndAssetsRetired(e);
});
