import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const qa=new URL('./',import.meta.url),raw=JSON.parse(await readFile(new URL(process.argv[2]||'browser-result.json',qa),'utf8')),outer=raw.result??raw,report=outer.report??outer;
assert.equal(report.originalAttribution,true);assert.equal(report.profileOnly,true);assert.equal(report.injected,false);assert.equal(report.performance,null);assert.deepEqual(report.passes.map(pass=>pass.arm),['A1','A2']);
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return{count:values.length,sumMs:values.reduce((a,b)=>a+b,0),medianMs:sorted[Math.floor(sorted.length*.5)]??0,p95Ms:sorted[Math.floor(sorted.length*.95)]??0,maxMs:sorted.at(-1)??0};};
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<=1e-6,label+' timing arithmetic differs');
const stageSummary=frames=>{const names=[...new Set(frames.flatMap(frame=>Object.keys(frame.stages)))];return Object.fromEntries(names.map(name=>[name,{calls:frames.reduce((sum,frame)=>sum+(frame.stages[name]?.calls??0),0),inclusive:stats(frames.map(frame=>frame.stages[name]?.inclusiveMs??0)),self:stats(frames.map(frame=>frame.stages[name]?.selfMs??0))}]));};
const bucketSummary=frames=>{const names=[...new Set(frames.flatMap(frame=>Object.keys(frame.buckets)))];return Object.fromEntries(names.map(name=>[name,stats(frames.map(frame=>frame.buckets[name]?.selfMs??0))]));};
const arms=report.passes.map(pass=>{
 const profile=pass.attribution,frames=profile.samples;assert.equal(frames.length,40);assert.equal(profile.stopped,true);assert.equal(profile.cleanupComplete,true);assert.equal(pass.installer,null);assert.ok(profile.outliers.length<=32);
 for(let index=0;index<frames.length;index++){
  const frame=frames[index];assert.equal(frame.frameIndex,index);assert.equal(frame.frame,index);assert.equal(frame.renderCalls,1);assert.equal(frame.stages['renderer.render'].calls,1);assert.ok(frame.readinessBefore&&frame.readinessAfter);
  const selfSum=Object.values(frame.buckets).reduce((sum,bucket)=>sum+bucket.selfMs,0);close(selfSum,frame.stages['renderer.render'].inclusiveMs,pass.arm+'.frame'+index+'.exclusiveBuckets');
  for(const stage of Object.values(frame.stages)){assert.ok(stage.selfMs>=0&&stage.inclusiveMs>=0);assert.ok(stage.selfMs<=stage.inclusiveMs+1e-6);}
 }
 const finalRender=frames.at(-1).readinessAfter;assert.equal(pass.runtimeNative.maxModels,Math.max(...frames.map(frame=>frame.readinessAfter.npcModels)));
 return{arm:pass.arm,firstCallbackMs:pass.samples[0].callbackMs,all40Callback:stats(pass.samples.map(sample=>sample.callbackMs)),steady30Callback:stats(pass.samples.slice(10).map(sample=>sample.callbackMs)),readbackMs:pass.readbackMs,first:frames[0],all40Stages:stageSummary(frames),steady30Stages:stageSummary(frames.slice(10)),all40Buckets:bucketSummary(frames),steady30Buckets:bucketSummary(frames.slice(10)),outliers:profile.outliers,unmeasured:profile.unmeasured,restoration:profile.restoration,nativeRuntime:pass.runtimeNative,finalReadiness:finalRender,finalState:pass.finalState};
});
assert.equal(report.equivalence.framesCompared,40);assert.deepEqual(report.equivalence.mismatches,[]);for(const key of ['state','events','commands','motion','random','visualRandom'])assert.equal(report.equivalence[key],true);assert.deepEqual(arms[0].finalState,arms[1].finalState);
const result={scope:'Two original180-enemy fixed-work arms,40×.12 catch-up/interpolation/actualRenderer each. Outer profiler overhead and synchronous waits included. No optimization candidate or product adoption; no presented FPS or peak-memory claim. Parent-inclusive times overlap; only self buckets partition an observed render.',error:outer.error??report.error??null,equivalenceExact:true,strictPixels:report.pixels,cleanup:report.cleanup,arms};
await writeFile(new URL('analysis.json',qa),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({scope:result.scope,error:result.error,equivalenceExact:true,strictPixels:result.strictPixels,cleanupComplete:report.cleanup.complete,arms:arms.map(arm=>({arm:arm.arm,firstCallbackMs:arm.firstCallbackMs,firstBuckets:arm.first.buckets,all40Callback:arm.all40Callback,steady30Callback:arm.steady30Callback,steady30Buckets:arm.steady30Buckets,nativeRuntime:arm.nativeRuntime,unmeasured:arm.unmeasured}))},null,2));
