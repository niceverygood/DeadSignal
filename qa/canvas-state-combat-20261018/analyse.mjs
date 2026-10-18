import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const here=new URL('./',import.meta.url),raw=JSON.parse(await readFile(new URL(process.argv[2]||'browser-result.json',here),'utf8'));
const shown=raw.result??raw,report=shown.report??shown;
assert.equal(report.injected,false,'actual browser evidence must not use injected dependencies');
const passes=report.passes??[],summary=[],timingSerializationDeltas=[];
function timingEqual(actual,expected,label){const delta=actual-expected;assert.ok(Math.abs(delta)<=8*Number.EPSILON*Math.max(1,Math.abs(actual),Math.abs(expected)),label);if(delta)timingSerializationDeltas.push({label,actual,expected,delta});}
function statsEqual(actual,expected,label){for(const key of Object.keys(actual))if(key==='sumMs')timingEqual(actual[key],expected[key],label+'.'+key);else assert.equal(actual[key],expected[key],label+'.'+key);}
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return{count:values.length,medianMs:sorted[Math.floor(sorted.length*.5)]??0,p95Ms:sorted[Math.floor(sorted.length*.95)]??0,maxMs:sorted.at(-1)??0,sumMs:values.reduce((a,b)=>a+b,0)};};
for(const pass of passes){
 assert.ok(['A1','B','A2'].includes(pass.arm));
 for(const sample of pass.samples){for(const key of ['simulationMs','interpolationMs','renderMs','callbackMs'])assert.ok(Number.isFinite(sample[key])&&sample[key]>=0);assert.equal(sample.frame,pass.samples.indexOf(sample));assert.equal(sample.tickCount,sample.commands.length);}
 if(pass.samples.length===40){
  const timing=stats(pass.samples.map(sample=>sample.callbackMs));statsEqual(timing,pass.all40Summary.callbackMs,pass.arm+'.callbacks');
  assert.ok(pass.samples.some(sample=>sample.nativeSelected>0));
  if(pass.mode==='manual')assert.ok(pass.installer.candidateUsed>0&&pass.installer.bakedNpcManualCalls>0);else assert.equal(pass.installer.candidateUsed,0);
  const drainInclusive=stats([...pass.samples.map(sample=>sample.callbackMs),pass.readbackMs]);statsEqual(drainInclusive,pass.drainInclusiveSummary,pass.arm+'.drain');
  summary.push({arm:pass.arm,mode:pass.mode,firstMs:pass.samples[0].callbackMs,all40:timing,steady30:stats(pass.samples.slice(10).map(sample=>sample.callbackMs)),drainInclusive,readbackMs:pass.readbackMs,callbackSumPlusReadbackMs:timing.sumMs+pass.readbackMs,manualCalls:pass.installer.bakedNpcManualCalls,nativeFrames:pass.samples.at(-1).nativeRenderFrame,finalState:pass.finalState});
 }
}
let performance=null;
if(summary.length===3){
 assert.deepEqual(summary.map(pass=>pass.arm),['A1','B','A2']);
 assert.deepEqual(summary[0].finalState,summary[1].finalState);assert.deepEqual(summary[0].finalState,summary[2].finalState);
 const [a,b,a2]=summary,fasterOriginalMs=Math.min(a.callbackSumPlusReadbackMs,a2.callbackSumPlusReadbackMs),improvementFraction=fasterOriginalMs?1-b.callbackSumPlusReadbackMs/fasterOriginalMs:0;
 const callbackTailsNoWorse=b.all40.p95Ms<=Math.min(a.all40.p95Ms,a2.all40.p95Ms)&&b.all40.maxMs<=Math.min(a.all40.maxMs,a2.all40.maxMs);
 const drainTailsNoWorse=b.drainInclusive.p95Ms<=Math.min(a.drainInclusive.p95Ms,a2.drainInclusive.p95Ms)&&b.drainInclusive.maxMs<=Math.min(a.drainInclusive.maxMs,a2.drainInclusive.maxMs);
 const tailsNoWorse=callbackTailsNoWorse&&drainTailsNoWorse;
 performance={fasterOriginalMs,candidateMs:b.callbackSumPlusReadbackMs,improvementFraction,callbackTailsNoWorse,drainTailsNoWorse,tailsNoWorse,costCriterionPassed:improvementFraction>=.03&&tailsNoWorse};
 timingEqual(report.performance.improvementFraction,improvementFraction,'improvementFraction');assert.equal(report.performance.tailsNoWorse,tailsNoWorse);
}
const pixelsExact=report.pixels!==null&&Object.values(report.pixels).every(diff=>diff.dimensionsEqual&&diff.differentComponents===0&&diff.maxDelta===0);
const equivalenceExact=report.equivalence?.framesCompared===80&&report.equivalence.mismatches.length===0&&['state','events','commands','motion','random','visualRandom'].every(key=>report.equivalence[key]===true);
const actualAccepted=report.complete&&report.cleanup.complete&&pixelsExact&&equivalenceExact&&performance?.costCriterionPassed===true;
if(report.performance)assert.equal(report.performance.accepted,actualAccepted);
const analysis={scope:'180 original enemies; actual simulation/interpolation/Renderer; 40 fixed .12-second callbacks per A/B/A arm. CPU call-wall and final readback; excludes app HUD/audio/persistence. Not FPS or peak-memory evidence.',error:shown.error??report.error??null,timingSerializationDeltas,timingNote:'DOM result transport rounded some aggregate timing numbers by one ULP. Only arithmetic timing recomputation allows eight machine epsilons; all game/state/RNG/event and pixel criteria remain exact and unchanged.',passes:summary,equivalenceExact,pixelsExact,pixels:report.pixels,cleanupComplete:report.cleanup?.complete??false,performance,actualAccepted,decision:actualAccepted?'eligible-for-separate-product-adoption-review':'retain-QA-only; no product adoption'};
await writeFile(new URL('analysis.json',here),JSON.stringify(analysis,null,2)+'\n');
console.log(JSON.stringify(analysis,null,2));
