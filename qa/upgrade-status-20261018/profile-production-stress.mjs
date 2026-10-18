// Root-run diagnostic, not a test-suite runner or a replacement CPU budget.
// Example: node --cpu-prof --cpu-prof-dir <fresh QA directory>
//   --cpu-prof-name production-stress.cpuprofile profile-production-stress.mjs
//   --out <fresh QA directory>/production-stress.json
// The single actual test invocation/callback is extracted byte-for-byte. No
// Game wrapper, method observer, snapshot, RNG hook or per-tick instrumentation
// is installed. Original private callback locals deliberately stay private.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const qaRoot=fileURLToPath(new URL('../',import.meta.url));
const gameRoot=fileURLToPath(new URL('../../work/dead-signal-game/',import.meta.url));
const fixturePath=path.join(gameRoot,'tests','engine.test.mjs');
const enginePath=path.join(gameRoot,'dist','engine.js');
const modelPath=path.join(gameRoot,'dist','upgrade-model.js');
const TITLE='twenty minutes of seeded autopilot keeps entity pools finite and bounded';
const PREFIX=`test('${TITLE}', { timeout: 20000 }, `;
const NEXT="test('run rewards and weapon unlocks survive a real save/load round trip'";
const EXPECTED={
 fixture:'6b92a458bcdcbde255eb413e5bf8bf9f313b951f32fd08129944897ccb922df8',
 invocation:'671ae4bf837801fec8165596268504486ff388259e527c2ef1a1852e684938a9',
 callback:'38cbf37b4e66c32a5b2545d127f49f1b8032020baf95fc70a780ac6967ba46b4',
 engine:'72487b352161059b5745a3e5cfc149ff71ae3f7b98c7e310b5d8b3a5345260ce',
 model:'9e066a693078ae8fd7aa01d7bbd39829598e356f8191bf9b725e483d0b88a9ce'
};
const sha=value=>createHash('sha256').update(value).digest('hex');
function qualifiedError(value){
 const result={name:'UnknownThrownValue',message:'',code:null,stack:null};
 try{result.name=typeof value?.name==='string'?value.name:typeof value;}catch{}
 try{result.message=typeof value?.message==='string'?value.message:String(value);}catch{result.message='unreadable-thrown-value';}
 try{result.code=typeof value?.code==='string'?value.code:null;}catch{}
 try{result.stack=typeof value?.stack==='string'?value.stack.slice(0,16000):null;}catch{}
 return result;
}
function outputPath(){
 const args=process.argv.slice(2);assert.equal(args.length,2,'usage: profile-production-stress.mjs --out <new QA report.json>');
 assert.equal(args[0],'--out');const target=path.resolve(args[1]),relative=path.relative(qaRoot,target);
 assert.ok(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative),'output must stay in the DeadSignal QA directory');
 assert.equal(path.extname(target).toLowerCase(),'.json','output must be a new named .json report');return target;
}

async function main(){
 const out=outputPath(),diagnostics=[];
 const report={
  tool:'exact-production-stress-cpu-profile',testTitle:TITLE,
  invocationSHA:null,fixtureSHA:null,sourceSHA:null,modelSHA:null,callbackSHA:null,
  expectedSHA:EXPECTED,sourcePaths:{fixture:fixturePath,engine:enginePath,model:modelPath},
  originalTimeoutMs:20000,originalCPUBudgetMs:15000,originalLoopTicks:24000,
  executed:false,assertSuccess:false,status:'preflight',cpuMs:null,wallMs:null,
  timingPrecision:'Only the actual original t.diagnostic values, rounded by that test to two decimals; no additional timing observer.',
  finalState:null,diagnostics,errors:[],
  note:'One source-pinned existing twenty-minute callback only. Its original assertions, 24000 ticks, input, spawning, upgrade selections and 15000ms CPU budget are unchanged. This is not the whole test suite or proof of its pass. No per-tick observers or checkpoint/hash snapshots are added. finalState is null because the exact original callback does not expose its local Game; no observer was added to retrieve it. Node --cpu-prof adds profiler overhead, so this diagnostic does not replace unprofiled validation. No storage or browser is accessed.'
 };
 try{
  const fixture=await readFile(fixturePath),engine=await readFile(enginePath),model=await readFile(modelPath);
  report.fixtureSHA=sha(fixture);report.sourceSHA=sha(engine);report.modelSHA=sha(model);
  assert.equal(report.fixtureSHA,EXPECTED.fixture,'actual test source changed');
  assert.equal(report.sourceSHA,EXPECTED.engine,'production engine source changed');
  assert.equal(report.modelSHA,EXPECTED.model,'shared upgrade model source changed');
  const source=fixture.toString('utf8'),start=source.indexOf(PREFIX),next=source.indexOf(NEXT,start+PREFIX.length);
  assert.ok(start>=0&&next>start,'original stress invocation boundaries unavailable');
  assert.equal(source.indexOf(PREFIX,start+PREFIX.length),-1,'stress invocation must be unique');
  const invocation=source.slice(start,next).trimEnd();
  assert.ok(invocation.startsWith(PREFIX)&&invocation.endsWith(');'));
  const callbackSource=invocation.slice(PREFIX.length,-2);
  report.invocationSHA=sha(invocation);report.callbackSHA=sha(callbackSource);
  assert.equal(Buffer.byteLength(invocation),1865);assert.equal(Buffer.byteLength(callbackSource),1762);
  assert.equal(report.invocationSHA,EXPECTED.invocation,'original invocation bytes changed');
  assert.equal(report.callbackSHA,EXPECTED.callback,'original callback bytes changed');
  const {Game}=await import(pathToFileURL(enginePath).href);
  let callback=null,registrations=0;
  // Rebase only the actual invocation's free bindings; all callback bytes and
  // expressions remain the existing test, including its original final assert.
  const register=(title,options,fn)=>{registrations++;assert.equal(title,TITLE);assert.deepEqual(options,{timeout:20000});assert.equal(typeof fn,'function');callback=fn;};
  const originalInvocation=new Function('test','Game','assert','performance','process',"'use strict';\n"+invocation+`\n//# sourceURL=${pathToFileURL(fixturePath).href}?production-stress-only`);
  originalInvocation(register,Game,assert,performance,process);
  assert.equal(registrations,1);assert.equal(typeof callback,'function');
  report.status='running';report.executed=true;
  callback({diagnostic:value=>{assert.equal(typeof value,'string');diagnostics.push(value);const match=/^Stress wall=(\d+(?:\.\d+)?)ms, CPU=(\d+(?:\.\d+)?)ms$/.exec(value);if(match){report.wallMs=Number(match[1]);report.cpuMs=Number(match[2]);}}});
  report.assertSuccess=true;report.status='passed-original-callback';
 }catch(error){
  report.status=report.executed?'failed-original-callback':'failed-preflight';report.errors.push(qualifiedError(error));
 }
 // Failure reports are also create-only. Never replace an earlier observation.
 await mkdir(path.dirname(out),{recursive:true});
 await writeFile(out,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});
 process.stdout.write(JSON.stringify({out,status:report.status,assertSuccess:report.assertSuccess,cpuMs:report.cpuMs,wallMs:report.wallMs})+'\n');
 if(!report.assertSuccess)process.exitCode=1;
}

try{await main();}catch(error){process.stderr.write(JSON.stringify({status:'report-not-written',error:qualifiedError(error)})+'\n');process.exitCode=1;}
