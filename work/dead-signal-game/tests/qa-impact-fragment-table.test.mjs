import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ORIGINAL_IMPACT_SHA256,CANDIDATE_IMPACT_SHA256,parseImpactCLIArgs,compareImpactFragmentTable,runImpactCLI} from '../../../tools/qa-impact-fragment-table.mjs';

// Only parser, comparison and injected child/CLI services are exercised here.
// No original/candidate source loading, process spawning or benchmark is run.
function worker(mode,{iterations=4}={}){
 const state={globalAlpha:.73,globalCompositeOperation:'source-over',fillStyle:'#102030',strokeStyle:'#405060',lineWidth:1.25};
 return{mode,nodeVersion:'v22.mock',v8Version:'mock',platform:'win32',arch:'x64',nodeFlags:[],originalModuleSha256:ORIGINAL_IMPACT_SHA256,candidateModuleSha256:CANDIDATE_IMPACT_SHA256,recipeCount:3,iterations,
  setup:{dependencyImportWallMs:mode==='candidate'?9:1,moduleImportWallMs:mode==='candidate'?4:2},
  measurement:{cold:{callWallMs:mode==='candidate'?2:6,callCpuMs:mode==='candidate'?1:3,returnValue:true,commands:80,checksum:120.125,depth:0,state:{...state}},steady:{calls:iterations,callWallMs:mode==='candidate'?7:13,callCpuMs:mode==='candidate'?3:6,returnChecksum:iterations,commands:iterations*80,scalarChecksum:iterations*120.125},finalState:{...state},depth:0,inputsUnchanged:true,inputSha256:'same-particle-input'},
  proof:{commands:240,commandSha256:'same-command-IEEE64-hash',returns:3,inputSha256:'same-particle-input',inputsUnchanged:true,stateRestored:true,depth:0},valid:true};
}
async function temporary(t){const directory=await mkdtemp(join(tmpdir(),'dead-signal-impact-cli-')),files=[];t.after(async()=>{for(const file of files)try{await unlink(file);}catch{}await rmdir(directory);});return name=>{const file=join(directory,name);files.push(file);return file;};}

test('impact CLI validates integer iteration bounds, duplicate options and output/worker guards before diagnostic work',()=>{
 assert.deepEqual(parseImpactCLIArgs(['--out','new.json']),{iterations:40000,out:'new.json',worker:null,help:false});
 assert.equal(parseImpactCLIArgs(['--out','new.json','--iterations','1']).iterations,1);assert.equal(parseImpactCLIArgs(['--iterations','500000','--out','new.JSON']).iterations,500000);assert.equal(parseImpactCLIArgs(['--worker','original','--iterations','2']).worker,'original');assert.equal(parseImpactCLIArgs(['--help']).help,true);
 for(const value of ['0','500001','9007199254740992'])assert.throws(()=>parseImpactCLIArgs(['--out','new.json','--iterations',value]),/iterations-1-to-500000/);
 for(const value of ['-1','1.5','NaN','Infinity','1e3'])assert.throws(()=>parseImpactCLIArgs(['--out','new.json','--iterations',value]),/iterations-integer/);
 for(const args of [['--out','a.json','--out','b.json'],['--out','a.json','--iterations','2','--iterations','3'],['--worker','original','--worker','candidate']])assert.throws(()=>parseImpactCLIArgs(args),/duplicate-option/);
 assert.throws(()=>parseImpactCLIArgs([]),/new-output-required/);assert.throws(()=>parseImpactCLIArgs(['--out','source.js']),/output-json-required/);assert.throws(()=>parseImpactCLIArgs(['--out']),/option-value-required/);assert.throws(()=>parseImpactCLIArgs(['--worker','candidate','--out','new.json']),/worker-cannot-write/);assert.throws(()=>parseImpactCLIArgs(['--worker','unknown']),/worker-mode/);assert.throws(()=>parseImpactCLIArgs(['--out','new.json','--unknown']),/unknown-option/);
});

test('injected A/B/A is strictly sequential and permits timing-only differences while rejecting numeric/proof/checksum/cleanup changes',async()=>{
 const modes=[],options=[];let active=0,peak=0;
 const report=await compareImpactFragmentTable({iterations:4},async(mode,settings)=>{active++;peak=Math.max(peak,active);modes.push(mode);options.push({...settings});await new Promise(resolve=>setImmediate(resolve));active--;return worker(mode,settings);});
 assert.deepEqual(modes,['original','candidate','original']);assert.deepEqual(options,[{iterations:4},{iterations:4},{iterations:4}]);assert.equal(peak,1);assert.equal(report.outputsExact,true);assert.equal(report.allValid,true);assert.deepEqual(report.runs.map(run=>run.arm),['A','B','A-repeat']);assert.notEqual(report.runs[0].measurement.steady.callWallMs,report.runs[1].measurement.steady.callWallMs);
 const changes=[run=>{run.measurement.cold.commands++;},run=>{run.measurement.steady.commands++;},run=>{run.measurement.steady.scalarChecksum+=.125;},run=>{run.measurement.cold.checksum+=.125;},run=>{run.proof.commandSha256='changed-IEEE64-command';},run=>{run.proof.inputsUnchanged=false;},run=>{run.proof.stateRestored=false;},run=>{run.measurement.depth=1;},run=>{run.measurement.finalState.globalAlpha=.5;},run=>{run.candidateModuleSha256='changed-source';}];
 for(let i=0;i<changes.length;i++){const changed=await compareImpactFragmentTable({iterations:4},async(mode,settings)=>{const result=worker(mode,settings);if(mode==='candidate')changes[i](result);return result;});assert.equal(changed.outputsExact,false,'observable mutation '+i);}
 const invalid=await compareImpactFragmentTable({iterations:4},async(mode,settings)=>{const result=worker(mode,settings);if(mode==='candidate')result.valid=false;return result;});assert.equal(invalid.outputsExact,true,'validity is separately checked from matching command proof');assert.equal(invalid.allValid,false);
 const marker=Error('isolated child rejection');await assert.rejects(compareImpactFragmentTable({iterations:4},async()=>{throw marker;}),error=>error===marker,'comparison must preserve the actual child rejection');
});

test('exclusive existing output and malformed/duplicate arguments prevent any injected source/child work and preserve existing evidence',async t=>{
 const path=await temporary(t),existing=path('existing.json'),uncreated=path('never-created.json'),messages=[],errors=[];await writeFile(existing,'immutable report evidence');let childCalls=0;
 const services={stdout:value=>messages.push(value),stderr:value=>errors.push(value),runChild:async()=>{childCalls++;throw Error('source/worker work must not begin');}};
 assert.equal(await runImpactCLI(['--out',existing,'--iterations','1'],services),2);assert.equal(childCalls,0);assert.equal(await readFile(existing,'utf8'),'immutable report evidence');assert.match(JSON.parse(errors.at(-1)).error,/EEXIST/);
 assert.equal(await runImpactCLI(['--out',existing,'--out',uncreated],services),2);assert.equal(childCalls,0);assert.match(JSON.parse(errors.at(-1)).error,/duplicate-option/);await assert.rejects(readFile(uncreated),{code:'ENOENT'});
 assert.equal(await runImpactCLI(['--out',uncreated,'--iterations','0'],services),2);assert.equal(childCalls,0);await assert.rejects(readFile(uncreated),{code:'ENOENT'});
 assert.equal(await runImpactCLI(['--worker','original','--out',uncreated],services),2);assert.equal(childCalls,0);await assert.rejects(readFile(uncreated),{code:'ENOENT'});
 assert.equal(await runImpactCLI(['--help'],services),0);assert.equal(childCalls,0);assert.match(messages.at(-1),/exclusively reserved before source loading/);assert.equal(await readFile(existing,'utf8'),'immutable report evidence');
});

test('CLI retains mismatch or child-failure evidence with distinct exits and never overwrites the reserved report on later attempts',async t=>{
 const path=await temporary(t),success=path('success.json'),mismatch=path('mismatch.json'),invalid=path('invalid.json'),failure=path('failure.json'),messages=[],errors=[],services={stdout:value=>messages.push(value),stderr:value=>errors.push(value),runChild:async(mode,settings)=>worker(mode,settings)};
 assert.equal(await runImpactCLI(['--out',success,'--iterations','4'],services),0);assert.equal(JSON.parse(await readFile(success,'utf8')).outputsExact,true);
 assert.equal(await runImpactCLI(['--out',mismatch,'--iterations','4'],{...services,runChild:async(mode,settings)=>{const result=worker(mode,settings);if(mode==='candidate')result.proof.commandSha256='intentional-mismatch';return result;}}),1);
 const mismatchText=await readFile(mismatch,'utf8'),mismatchReport=JSON.parse(mismatchText);assert.equal(mismatchReport.outputsExact,false);assert.equal(mismatchReport.runs.length,3);assert.equal(mismatchReport.runs[1].proof.commandSha256,'intentional-mismatch');
 assert.equal(await runImpactCLI(['--out',invalid,'--iterations','4'],{...services,runChild:async(mode,settings)=>{const result=worker(mode,settings);if(mode==='candidate')result.valid=false;return result;}}),1);assert.equal(JSON.parse(await readFile(invalid,'utf8')).allValid,false);
 const modes=[],marker=Error('candidate source/worker failed exactly here');assert.equal(await runImpactCLI(['--out',failure,'--iterations','4'],{...services,runChild:async(mode,settings)=>{modes.push(mode);if(mode==='candidate')throw marker;return worker(mode,settings);}}),2);
 const failedText=await readFile(failure,'utf8'),failedReport=JSON.parse(failedText);assert.deepEqual(modes,['original','candidate']);assert.equal(failedReport.error,marker.message);assert.equal(failedReport.diagnosticOnly,true);assert.equal(JSON.parse(errors.at(-1)).error,marker.message);assert.match(failedReport.note,/not native Canvas/);
 let laterCalls=0;assert.equal(await runImpactCLI(['--out',failure,'--iterations','4'],{...services,runChild:async()=>{laterCalls++;throw Error('must not rerun');}}),2);assert.equal(laterCalls,0);assert.equal(await readFile(failure,'utf8'),failedText);assert.equal(await readFile(mismatch,'utf8'),mismatchText);
});
