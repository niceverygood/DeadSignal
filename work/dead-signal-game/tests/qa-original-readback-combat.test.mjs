import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compareCanvasStateCombat} from '../dist/qa-canvas-state-combat.js';
const qa=new URL('../../../qa/original-readback-probe-20261018/',import.meta.url),base=new URL('../dist/qa-canvas-state-combat.js',import.meta.url);
const moduleURL=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const rebase=(s,url)=>s.replace(/from\s+(['"])([^'"]+)\1/g,(whole,quote,spec)=>spec.startsWith('.')?'from '+quote+new URL(spec,url).href+quote:whole);
const prior=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8'));
const oldBytes=await readFile(new URL('combat-harness-before.txt',qa)),oldRow=prior.files.find(row=>row.file.endsWith('/dist/qa-canvas-state-combat.js'));
assert.equal(oldBytes.length,oldRow.bytes);assert.equal(createHash('sha256').update(oldBytes).digest('hex'),oldRow.sha256);
const before=await import(moduleURL(rebase(oldBytes.toString('utf8'),base)));
const supportURL=new URL('./qa-player-deferred-read-combat.test.mjs',import.meta.url),support=await readFile(supportURL,'utf8'),boundary=support.indexOf("\ntest('all five previous modes");assert.ok(boundary>0);
const supportSource=support.slice(0,boundary).replaceAll('import.meta.url',JSON.stringify(supportURL.href));
const helpers=await import(moduleURL(rebase(supportSource,supportURL)+'\nexport {environment,address,gate,state,mainUnchanged,ownedImagesAndAssetsRetired,failure,trace,oldProfiler,oldPreparation,oldRowInstaller,deferredInstaller};'));
const {environment,address,gate,state,mainUnchanged,ownedImagesAndAssetsRetired,failure,trace,oldProfiler,oldPreparation,oldRowInstaller,deferredInstaller}=helpers;
const probeAddress=()=>address('qa&qa-memory=original-readback-test&qa-original-readback=1');
function installProbe(e,{unstable=false,mutateGame=false,error=null,secondaryExport=false,malformed=false}={}){
 const probes=[];
 for(const key of ['installCanvasStateCandidate','createRenderAttribution','prepareFreshPlayerLaunch','installPlayerAlphaRows','installPlayerDeferredRead'])e.testDeps[key]=()=>{throw Error('original probe cannot install another experiment');};
 e.testDeps.probeOriginalReadback=(renderer,primary,options)=>{
  assert.deepEqual(options,{readFloor:true,injected:true});assert.equal(e.events.at(-1)[0],'readback','primary read directly precedes probe');e.events.push(['probe',renderer.index]);
  const last=e.draws.at(-1);assert.equal(last.renderer,renderer);assert.equal(e.draws.filter(draw=>draw.renderer===renderer).length,40);
  assert.deepEqual(primary,renderer.canvas.pixels);const again=renderer.ctx.getImageData(0,0,renderer.canvas.width,renderer.canvas.height).data;assert.deepEqual(again,primary);
  probes.push({renderer,primaryCopy:new Uint8ClampedArray(primary),game:state(last.game)});
  if(error)throw error;if(mutateGame)last.game.player.hp--;if(secondaryExport)renderer.canvas.toDataURL=()=>{throw Error('controlled secondary PNG failure');};
  return{complete:malformed?'yes':!unstable,stable:malformed?'yes':!unstable,injected:true,reason:unstable?'r0-r1-differ':null,readSequence:['R1'],comparisons:{r0r1:{differentComponents:unstable?1:0,maxDelta:unstable?1:0}}};
 };return probes;
}
const options=e=>({...gate(probeAddress()),originalReadbackProbe:true,document:e.document,testDeps:e.testDeps});

test('disabled probe preserves all eight prior modes against full pinned harness, including reports/clocks/Game/pixels and cleanup',async()=>{
 for(const mode of ['default','original-attribution','player-attribution','player-preparation','player-alpha-rows','player-alpha-rows-verify','player-deferred-read','player-deferred-read-verify']){
  const a=environment(),b=environment(),aImages=[],bImages=[];const attributed=mode.includes('attribution'),player=mode==='player-attribution',prepared=mode==='player-preparation',rows=mode.startsWith('player-alpha-rows'),deferred=mode.startsWith('player-deferred-read'),verify=mode.endsWith('-verify');
  for(const e of[a,b]){if(attributed)oldProfiler(e,player);if(prepared)oldPreparation(e);if(rows)oldRowInstaller(e);if(deferred)deferredInstaller(e);e.testDeps.probeOriginalReadback=()=>{throw Error('disabled diagnostic must not load or read');};}
  const flag=deferred?'qa-player-deferred-read':rows?'qa-player-alpha-rows':prepared?'qa-player-preparation':attributed?'qa-render-attribution':'qa-canvas-combat';
  const location=address('qa&qa-memory=legacy&'+flag+'=1'+(player?'&qa-player-attribution=1':'')+(verify?'&'+flag+'-verify=1':''));
  const opts=e=>({...gate(location),...(attributed?{originalAttribution:true}:{}),...(player?{playerAttribution:true}:{}),...(prepared?{playerPreparation:true}:{}),...(rows?{playerAlphaRows:true,...(verify?{playerAlphaRowsVerify:true}:{})}:{}),...(deferred?{playerDeferredRead:true,...(verify?{playerDeferredReadVerify:true}:{})}:{}),document:e.document,testDeps:e.testDeps});
  const old=await before.compareCanvasStateCombat(a.mainRenderer,{...opts(a),onImage:image=>aImages.push(image)}),current=await compareCanvasStateCombat(b.mainRenderer,{...opts(b),...(mode==='default'?{originalReadbackProbe:false}:{}),onImage:image=>bImages.push(image)});
  assert.deepEqual(current.report,old.report,mode);assert.deepEqual(b.events,a.events,mode);assert.deepEqual(trace(b),trace(a),mode);assert.deepEqual(bImages,aImages,mode);assert.equal(Object.hasOwn(current.report,'originalReadbackProbe'),false);mainUnchanged(a);mainUnchanged(b);ownedImagesAndAssetsRetired(a);ownedImagesAndAssetsRetired(b);
 }
});

test('exact isolated own-data mode and branded-memory gate rejects mixed modes/accessors before owner or DOM reads',async()=>{
 const mixed=['originalAttribution','playerAttribution','playerPreparation','playerAlphaRows','playerAlphaRowsVerify','playerDeferredRead','playerDeferredReadVerify'];
 for(const [location,extra] of [[address(),{}],[address('qa&qa-memory=x&qa-original-readback=true'),{}],[new URL('http://localhost:8806/?qa&qa-memory=x&qa-original-readback=1'),{}],[new URL('https://localhost:8851/?qa&qa-memory=x&qa-original-readback=1'),{}],...mixed.map(key=>[probeAddress(),{[key]:true}])]){
  let reads=0;const opts={...gate(location),originalReadbackProbe:true,...extra};for(const key of['document','testDeps'])Object.defineProperty(opts,key,{get(){reads++;throw Error('gate before dependency');}});
  const result=await compareCanvasStateCombat(new Proxy({},{get(){reads++;throw Error('owner before gate');},getOwnPropertyDescriptor(){reads++;throw Error('owner descriptor before gate');}}),opts);assert.equal(result.report.available,false);assert.equal(reads,0);
 }
 let reads=0;const opts={...gate(probeAddress()),get originalReadbackProbe(){reads++;throw Error('own accessor never invoked');}};assert.equal((await compareCanvasStateCombat({},opts)).report.available,false);assert.equal(reads,0);
 const location=probeAddress();assert.equal((await compareCanvasStateCombat({}, {location,query:location.searchParams,storage:new Map(),originalReadbackProbe:true})).report.available,false);
});

test('two original arms retain primary R0, forty literal callbacks and strict AA without candidate or extra draw; extra reads never performance-accept',async()=>{
 const e=environment(),probes=installProbe(e),images=[],{report}=await compareCanvasStateCombat(e.mainRenderer,{...options(e),onImage:image=>images.push(image)});
 assert.equal(report.complete,true);assert.equal(report.qualityOnly,true);assert.equal(report.originalReadbackProbe,true);assert.deepEqual(report.passes.map(p=>[p.arm,p.mode]),[['A1','original'],['A2','original']]);assert.equal(e.draws.length,80);assert.equal(e.advances.length,80);assert.equal(e.installers.length,0);assert.equal(probes.length,2);assert.equal(images.length,2);assert.ok(images.every(image=>/primary R0 동등 미인증/.test(image.alt)));
 assert.deepEqual(trace(e).slice(40),trace(e).slice(0,40));assert.equal(report.equivalence.framesCompared,40);assert.deepEqual(report.equivalence.mismatches,[]);assert.equal(report.pixels.originalRepeat.differentComponents,0);assert.equal(report.pixels.originalRepeat.maxDelta,0);assert.equal(report.performance.accepted,false);assert.equal(report.performance.adopted,false);assert.equal(report.performance.qualityOnly,true);
 for(const p of report.passes){assert.equal(p.samples.length,40);assert.equal(p.originalReadbackGameUnchanged,true);assert.equal(p.preparation.originalLaunchWaitLimitMs,60000);assert.equal(p.installer,null);assert.equal(p.originalReadback.injected,true);assert.ok(p.runtimeNative.maxModels>=1);}
 const boundaries=e.events.filter(event=>['readback','probe','export'].includes(event[0]));assert.deepEqual(boundaries.map(event=>event[0]),['readback','probe','readback','export','readback','probe','readback','export']);assert.equal(report.cleanup.complete,true);mainUnchanged(e);ownedImagesAndAssetsRetired(e);
});

test('unstable readback stops before second arm; independent strict AA, Game mutation and read errors preserve failure and ownership cleanup',async()=>{
 for(const mode of ['unstable','mutate-game','read-error','strict-AA','secondary-export','malformed']){
  const e=environment(),marker=Error('controlled original read failure'),images=[],probes=installProbe(e,{unstable:mode==='unstable'||mode==='secondary-export',mutateGame:mode==='mutate-game',error:mode==='read-error'?marker:null,secondaryExport:mode==='secondary-export',malformed:mode==='malformed'});
  if(mode==='strict-AA'){const Original=e.testDeps.Renderer;e.testDeps.Renderer=class extends Original{render(...args){const value=super.render(...args);if(e.renderers.length===2)this.canvas.pixels[0]^=1;return value;}};}
  const error=await failure(compareCanvasStateCombat(e.mainRenderer,{...options(e),onImage:image=>images.push(image)}));
  assert.equal(error.report.performance.accepted,false);assert.equal(error.cleanup.complete,true);assert.equal(e.installers.length,0);
  if(mode==='strict-AA'){assert.match(error.message,/whole-canvas-pixels-differ/);assert.equal(e.draws.length,80);assert.equal(images.length,2);assert.equal(error.report.pixels.originalRepeat.differentComponents,1);assert.equal(error.report.passes.every(p=>p.originalReadback.stable),true);}
  else{assert.equal(e.draws.length,40);assert.equal(probes.length,1);assert.equal(error.report.passes.length,1);assert.equal(images.length,mode==='read-error'||mode==='secondary-export'?0:1);if(mode==='read-error')assert.equal(error,marker);else assert.match(error.message,mode==='mutate-game'?/game-mutated/:/unstable-or-incomplete/);if(mode==='secondary-export')assert.equal(error.report.passes[0].originalReadbackSecondaryError,'controlled secondary PNG failure');}
  mainUnchanged(e);ownedImagesAndAssetsRetired(e);
 }
 const e=environment('abort-yield'),controller=new AbortController();e.setController(controller);const probes=installProbe(e),error=await failure(compareCanvasStateCombat(e.mainRenderer,{...options(e),signal:controller.signal}));assert.match(error.message,/aborted/);assert.equal(probes.length,0);mainUnchanged(e);ownedImagesAndAssetsRetired(e);
});
