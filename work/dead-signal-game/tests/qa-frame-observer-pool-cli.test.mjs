import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,open,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ORIGINAL_PROFILE_SHA256,CANDIDATE_PROFILE_SHA256,OBSERVER_WINDOW_FRAMES,strictObserverDigest,parseObserverCLIArgs,compareFrameObserverPool,runObserverCLI} from '../../../tools/qa-frame-observer-pool.mjs';

// This suite injects primitive child reports. It never loads Game/profiler
// source, creates an actual workload or starts any worker/CPU benchmark.
function worker(mode,{actors=180,windows=2}={}){
 const publicProof={counts:{'game.tick':40,'control.drawEnemy':actors*40},callCount:actors*40+40,sequence:123,scalarChecksum:123.125,syntheticClock:100};
 return{mode,nodeVersion:'v22.mock',v8Version:'mock',platform:'win32',arch:'x64',nodeFlags:[],originalModuleSha256:ORIGINAL_PROFILE_SHA256,candidateModuleSha256:CANDIDATE_PROFILE_SHA256,actors,windows,framesPerWindow:OBSERVER_WINDOW_FRAMES,fixture:{actors,seed:774,baseEnemies:5,weapon:actors===60?'shotgun':'nailgun',spawnClock:1.5},initialSnapshotSha256:'same-initial-'+actors,
  setup:{dependencyImportWallMs:mode==='candidate'?6:2,moduleImportWallMs:mode==='candidate'?1:4},callWallMs:mode==='candidate'?3:9,callCpuMs:mode==='candidate'?2:7,maxRetainedWindowSamples:40,observationTransparent:true,allValid:true,
  unobserved:{stateSha256:'same-state-'+actors,eventSha256:'same-events',publicProof:structuredClone(publicProof),restored:true},
  reports:Array.from({length:windows},(_,window)=>({window,frames:40,callWallMs:mode==='candidate'?2:7,callCpuMs:mode==='candidate'?1:5,clockReads:200,reportSha256:'same-report-'+actors+'-'+window,stateSha256:'same-state-'+actors,eventSha256:'same-events',publicProof:structuredClone(publicProof),stageTotals:{'production.drawFrame.enemy':{calls:actors*40,syntheticCpuMs:actors*5}},unmeasured:[],profileRestored:true,originalsRestored:true,final:{time:2/3,hp:100,enemies:actors,random:112233,visualRandom:445566}}))};
}
async function temporary(t){const directory=await mkdtemp(join(tmpdir(),'dead-signal-frame-observer-cli-')),files=[];t.after(async()=>{for(const file of files)try{await unlink(file);}catch{}await rmdir(directory);});return name=>{const file=join(directory,name);files.push(file);return file;};}

test('observer CLI bounds actors/windows and rejects duplicates or invalid output/worker modes before diagnostic work',()=>{
 assert.deepEqual(parseObserverCLIArgs(['--out','new.json']),{actors:'both',windows:2,out:'new.json',worker:null,help:false});assert.equal(parseObserverCLIArgs(['--out','new.JSON','--actors','60','--windows','1']).windows,1);assert.equal(parseObserverCLIArgs(['--out','new.json','--actors','180','--windows','20']).windows,20);assert.equal(parseObserverCLIArgs(['--worker','original','--actors','60']).worker,'original');assert.equal(parseObserverCLIArgs(['--help']).help,true);
 for(const value of ['0','21','9007199254740992'])assert.throws(()=>parseObserverCLIArgs(['--out','new.json','--windows',value]),/windows-1-to-20/);
 for(const value of ['-1','1.5','NaN','Infinity','1e1'])assert.throws(()=>parseObserverCLIArgs(['--out','new.json','--windows',value]),/windows-integer/);
 for(const value of ['0','61','210','Both'])assert.throws(()=>parseObserverCLIArgs(['--out','new.json','--actors',value]),/actors-60-180-or-both/);
 for(const args of [['--out','a.json','--out','b.json'],['--out','a.json','--actors','60','--actors','180'],['--out','a.json','--windows','1','--windows','2'],['--worker','original','--worker','candidate']])assert.throws(()=>parseObserverCLIArgs(args),/duplicate-option/);
 assert.throws(()=>parseObserverCLIArgs([]),/new-output-required/);assert.throws(()=>parseObserverCLIArgs(['--out','source.js']),/output-json-required/);assert.throws(()=>parseObserverCLIArgs(['--out']),/option-value-required/);assert.throws(()=>parseObserverCLIArgs(['--worker','original']),/worker-no-output-single-actors/);assert.throws(()=>parseObserverCLIArgs(['--worker','candidate','--actors','180','--out','new.json']),/worker-no-output-single-actors/);assert.throws(()=>parseObserverCLIArgs(['--worker','unknown','--actors','60']),/worker-mode/);assert.throws(()=>parseObserverCLIArgs(['--out','new.json','--unknown']),/unknown-option/);
});

test('injected both-count A/B/A work is sequential and timing-only differences do not alter strict proof comparison',async()=>{
 const calls=[];let active=0,peak=0;
 const report=await compareFrameObserverPool({actors:'both',windows:2},async(mode,settings)=>{active++;peak=Math.max(peak,active);calls.push({mode,...settings});await new Promise(resolve=>setImmediate(resolve));active--;return worker(mode,settings);});
 assert.equal(peak,1);assert.deepEqual(calls,[{mode:'original',actors:60,windows:2},{mode:'candidate',actors:60,windows:2},{mode:'original',actors:60,windows:2},{mode:'original',actors:180,windows:2},{mode:'candidate',actors:180,windows:2},{mode:'original',actors:180,windows:2}]);assert.equal(report.outputsExact,true);assert.equal(report.allValid,true);assert.deepEqual(report.comparisons.map(item=>item.actors),[60,180]);for(const comparison of report.comparisons)assert.deepEqual(comparison.runs.map(run=>run.arm),['A','B','A-repeat']);assert.notEqual(report.comparisons[0].runs[0].reports[0].callWallMs,report.comparisons[0].runs[1].reports[0].callWallMs);
 const changes=[run=>{run.reports[0].reportSha256='changed';},run=>{run.reports[0].stateSha256='changed';},run=>{run.reports[0].final.random++;},run=>{run.reports[0].publicProof.counts['control.drawEnemy']++;},run=>{run.reports[0].publicProof.scalarChecksum+=.125;},run=>{run.reports[0].stageTotals['production.drawFrame.enemy'].syntheticCpuMs+=.125;},run=>{run.reports[0].clockReads++;},run=>{run.reports[0].profileRestored=false;},run=>{run.reports[0].originalsRestored=false;},run=>{run.maxRetainedWindowSamples=41;},run=>{run.candidateModuleSha256='changed';}];
 for(let i=0;i<changes.length;i++){const changed=await compareFrameObserverPool({actors:60,windows:1},async(mode,settings)=>{const value=worker(mode,settings);if(mode==='candidate')changes[i](value);return value;});assert.equal(changed.outputsExact,false,'strict observable mutation '+i);}
 const invalid=await compareFrameObserverPool({actors:180,windows:1},async(mode,settings)=>{const value=worker(mode,settings);if(mode==='candidate')value.allValid=false;return value;});assert.equal(invalid.outputsExact,true);assert.equal(invalid.allValid,false,'validity is an independent required result');
 const marker=Error('exact child rejection');await assert.rejects(compareFrameObserverPool({actors:60,windows:1},async()=>{throw marker;}),error=>error===marker);
 assert.notEqual(strictObserverDigest({value:-0}),strictObserverDigest({value:0}),'IEEE digest must not normalize signed zero like JSON');assert.notEqual(strictObserverDigest({value:undefined}),strictObserverDigest({}),'missing proof differs from explicit undefined');assert.equal(strictObserverDigest({b:2,a:1}),strictObserverDigest({a:1,b:2}),'object key insertion order is irrelevant to the proof');
});

test('exclusive existing output and malformed arguments stop all injected source/worker work while preserving existing evidence',async t=>{
 const path=await temporary(t),existing=path('existing.json'),uncreated=path('uncreated.json'),messages=[],errors=[];await writeFile(existing,'immutable observer report');let childCalls=0;
 const services={stdout:value=>messages.push(value),stderr:value=>errors.push(value),runChild:async()=>{childCalls++;throw Error('source/worker work must not start');}};
 assert.equal(await runObserverCLI(['--out',existing,'--actors','60'],services),2);assert.equal(childCalls,0);assert.equal(await readFile(existing,'utf8'),'immutable observer report');assert.match(JSON.parse(errors.at(-1)).error,/EEXIST/);
 assert.equal(await runObserverCLI(['--out',existing,'--out',uncreated],services),2);assert.equal(childCalls,0);assert.match(JSON.parse(errors.at(-1)).error,/duplicate-option/);await assert.rejects(readFile(uncreated),{code:'ENOENT'});
 assert.equal(await runObserverCLI(['--out',uncreated,'--windows','0'],services),2);assert.equal(childCalls,0);await assert.rejects(readFile(uncreated),{code:'ENOENT'});
 assert.equal(await runObserverCLI(['--worker','original','--actors','60','--out',uncreated],services),2);assert.equal(childCalls,0);await assert.rejects(readFile(uncreated),{code:'ENOENT'});
 assert.equal(await runObserverCLI(['--help'],services),0);assert.equal(childCalls,0);assert.match(messages.at(-1),/exclusive creation before source reads or workers/);assert.equal(await readFile(existing,'utf8'),'immutable observer report');
});

test('CLI preserves success/mismatch/failure reports with exit0/1/2 and never reruns or overwrites an existing failure',async t=>{
 const path=await temporary(t),success=path('success.json'),mismatch=path('mismatch.json'),invalid=path('invalid.json'),failure=path('failure.json'),messages=[],errors=[],services={stdout:value=>messages.push(value),stderr:value=>errors.push(value),runChild:async(mode,settings)=>worker(mode,settings)};
 assert.equal(await runObserverCLI(['--out',success,'--actors','60','--windows','1'],services),0);assert.equal(JSON.parse(await readFile(success,'utf8')).outputsExact,true);
 assert.equal(await runObserverCLI(['--out',mismatch,'--actors','60','--windows','1'],{...services,runChild:async(mode,settings)=>{const value=worker(mode,settings);if(mode==='candidate')value.reports[0].reportSha256='intentional-mismatch';return value;}}),1);
 const mismatchText=await readFile(mismatch,'utf8'),mismatchReport=JSON.parse(mismatchText);assert.equal(mismatchReport.outputsExact,false);assert.equal(mismatchReport.comparisons[0].runs.length,3);assert.equal(mismatchReport.comparisons[0].runs[1].reports[0].reportSha256,'intentional-mismatch');
 assert.equal(await runObserverCLI(['--out',invalid,'--actors','180','--windows','1'],{...services,runChild:async(mode,settings)=>{const value=worker(mode,settings);if(mode==='candidate')value.allValid=false;return value;}}),1);assert.equal(JSON.parse(await readFile(invalid,'utf8')).allValid,false);
 const modes=[],marker=Error('candidate source/worker failed here');assert.equal(await runObserverCLI(['--out',failure,'--actors','60','--windows','1'],{...services,runChild:async(mode,settings)=>{modes.push(mode);if(mode==='candidate')throw marker;return worker(mode,settings);}}),2);
 const failedText=await readFile(failure,'utf8'),failedReport=JSON.parse(failedText);assert.deepEqual(modes,['original','candidate']);assert.equal(failedReport.error,marker.message);assert.equal(failedReport.diagnosticOnly,true);assert.equal(JSON.parse(errors.at(-1)).error,marker.message);assert.match(failedReport.note,/not actual production Renderer/);
 let laterCalls=0;assert.equal(await runObserverCLI(['--out',failure,'--actors','60','--windows','1'],{...services,runChild:async()=>{laterCalls++;throw Error('must not rerun');}}),2);assert.equal(laterCalls,0);assert.equal(await readFile(failure,'utf8'),failedText);assert.equal(await readFile(mismatch,'utf8'),mismatchText);
});

test('stdout throwing after a completed report preserves the single valid full report and returns an explicit output failure',async t=>{
 const path=await temporary(t),output=path('stdout-failure.json'),errors=[],marker=Error('stdout failed after report commit');let stdoutText=null;
 const exit=await runObserverCLI(['--out',output,'--actors','60','--windows','1'],{runChild:async(mode,settings)=>worker(mode,settings),stdout(text){stdoutText=text;throw marker;},stderr:value=>errors.push(value)});
 assert.equal(exit,2);const text=await readFile(output,'utf8'),report=JSON.parse(text);assert.equal(report.outputsExact,true);assert.equal(report.allValid,true);assert.equal(report.comparisons[0].runs.length,3);assert.equal(Object.hasOwn(report,'error'),false);assert.equal(text,stdoutText+'\n','the completed report must not be followed or replaced by failure JSON');assert.equal(JSON.parse(errors.at(-1)).error,marker.message);
});

test('an unfinished partial report is replaced from byte0 and truncated to one valid failure JSON',async t=>{
 const path=await temporary(t),output=path('partial-write-failure.json'),errors=[],marker=Error('partial report write failed'),positions=[],truncations=[];let writes=0,closed=false;
 const openOutput=async file=>{
  const handle=await open(file,'wx');
  return{async write(buffer,offset,length,position){positions.push(position);writes++;if(writes===1)return handle.write(buffer,offset,Math.max(1,Math.floor(length*.9)),position);if(writes===2)throw marker;return handle.write(buffer,offset,length,position);},async truncate(length){truncations.push(length);return handle.truncate(length);},async close(){closed=true;return handle.close();}};
 };
 const exit=await runObserverCLI(['--out',output,'--actors','180','--windows','1'],{runChild:async(mode,settings)=>worker(mode,settings),openOutput,stdout(){throw Error('unfinished report must not reach stdout');},stderr:value=>errors.push(value)});
 assert.equal(exit,2);assert.equal(closed,true);const text=await readFile(output,'utf8'),failure=JSON.parse(text);assert.equal(failure.error,marker.message);assert.equal(failure.diagnosticOnly,true);assert.equal(Object.hasOwn(failure,'comparisons'),false);assert.equal(Object.hasOwn(failure,'outputRecoveryError'),false);assert.equal(JSON.parse(errors.at(-1)).error,marker.message);assert.equal(positions[0],0);assert.ok(positions[1]>0);assert.equal(positions[2],0,'failure bytes must replace the partial report at the beginning');assert.deepEqual(truncations,[Buffer.byteLength(text)],'stale partial-report tail must be removed');
});
