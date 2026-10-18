// QA-only fresh-process arm. The root executes original/candidate/original.
// No timing observers, snapshots, RNG hooks or changed stress budgets.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const directory=new URL('./',import.meta.url),qaRoot=fileURLToPath(new URL('../',directory));
const gameRoot=new URL('../../work/dead-signal-game/',directory),engineURL=new URL('dist/engine.js',gameRoot),navigationURL=new URL('dist/navigation.js',gameRoot);
export const PINNED_SOURCES=Object.freeze({
 fixture:'6b92a458bcdcbde255eb413e5bf8bf9f313b951f32fd08129944897ccb922df8',
 invocation:'671ae4bf837801fec8165596268504486ff388259e527c2ef1a1852e684938a9',
 callback:'38cbf37b4e66c32a5b2545d127f49f1b8032020baf95fc70a780ac6967ba46b4',
 engine:'72487b352161059b5745a3e5cfc149ff71ae3f7b98c7e310b5d8b3a5345260ce',
 model:'9e066a693078ae8fd7aa01d7bbd39829598e356f8191bf9b725e483d0b88a9ce',
 navigationOriginal:'549e01276b6b670234df5c80507ef30b8f1ec1513be8477281e59b38e21367d9',
 navigationCandidate:'79e3e9d0a15b4d3f1ed12a68b3781379cfb00f51708a4ff9ddad9815b3b5e284'
});
const sha=value=>createHash('sha256').update(value).digest('hex');
const rebase=(source,base)=>source.replace(/from\s*(['"])(\.[^'"]+)\1/g,(_all,quote,specifier)=>`from ${quote}${new URL(specifier,base).href}${quote}`);
const dataURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
function qualify(error){
 const result={name:'UnknownThrownValue',message:'',code:null,stack:null};
 try{result.name=typeof error?.name==='string'?error.name:typeof error;}catch{}
 try{result.message=typeof error?.message==='string'?error.message:String(error);}catch{result.message='unreadable-thrown-value';}
 try{result.code=typeof error?.code==='string'?error.code:null;}catch{}
 try{result.stack=typeof error?.stack==='string'?error.stack.slice(0,16000):null;}catch{}
 return result;
}
export function validateOutputPath(value){
 const output=path.resolve(value),relative=path.relative(qaRoot,output);
 assert.ok(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative),'report must stay in the DeadSignal QA directory');
 assert.equal(path.extname(output).toLowerCase(),'.json','report must be a new named .json file');return output;
}

export async function loadGameArm(arm){
 assert.ok(['original','candidate'].includes(arm),'arm must be original or candidate');
 const [engine,model,fixture,originalNav,candidateNav,productionNav]=await Promise.all([
  readFile(engineURL),readFile(new URL('dist/upgrade-model.js',gameRoot)),readFile(new URL('tests/engine.test.mjs',gameRoot)),
  readFile(new URL('current-navigation.txt',directory)),readFile(new URL('candidate-navigation.mjs',directory)),readFile(navigationURL)
 ]);
 const hashes={engine:sha(engine),model:sha(model),fixture:sha(fixture),navigationOriginal:sha(originalNav),navigationCandidate:sha(candidateNav),navigationProduction:sha(productionNav)};
 for(const key of ['engine','model','fixture','navigationOriginal','navigationCandidate'])assert.equal(hashes[key],PINNED_SOURCES[key],key+' source changed');
 assert.equal(hashes.navigationProduction,PINNED_SOURCES.navigationOriginal,'QA candidate must not be installed in production');
 assert.equal(originalNav.length,12361);assert.equal(candidateNav.length,12503);
 const navigationSource=arm==='original'?originalNav.toString('utf8'):candidateNav.toString('utf8');
 const navModule=await import(dataURL(rebase(navigationSource,navigationURL)+`\n//# sourceURL=${navigationURL.href}?qa-navigation-scalar=${arm}`));
 const navURL=dataURL(rebase(navigationSource,navigationURL)+`\n//# sourceURL=${navigationURL.href}?qa-navigation-scalar=${arm}`);
 const needle="import {Navigation} from './navigation.js';",engineSource=engine.toString('utf8');
 assert.equal(engineSource.split(needle).length,2,'exactly one original Navigation binding must be replaced');
 const rewritten=rebase(engineSource.replace(needle,`import {Navigation} from '${navURL}';`),engineURL)+`\n//# sourceURL=${engineURL.href}?qa-navigation-scalar=${arm}`;
 const module=await import(dataURL(rewritten));
 return {Game:module.Game,Navigation:navModule.Navigation,hashes,rewrittenEngineSHA:sha(rewritten),fixtureSource:fixture.toString('utf8')};
}

export async function runStressArm(arm,out){
 out=validateOutputPath(out);const diagnostics=[];
 const report={tool:'qa-navigation-scalar-exact-stress',arm,status:'preflight',executed:false,assertSuccess:false,
  sourceSHA:null,modelSHA:null,fixtureSHA:null,navigationOriginalSHA:null,navigationCandidateSHA:null,navigationProductionSHA:null,rewrittenEngineSHA:null,
  invocationSHA:null,callbackSHA:null,expectedSHA:PINNED_SOURCES,originalTimeoutMs:20000,originalCPUBudgetMs:15000,originalLoopTicks:24000,
  cpuMs:null,wallMs:null,finalState:null,diagnostics,errors:[],
  acceptancePredeclared:{requiredOrder:['original','candidate','original'],candidateMustPassOriginalCPUBudget:true,candidateCPUUnderBothOriginals:true,minimumCPUImprovementAgainstFasterOriginalPercent:3,otherwise:'park the QA candidate; no production change',scope:'One bracket does not establish statistical confidence, FPS or peak memory.'},
  note:'One exact source-pinned original twenty-minute callback, with only its Game Navigation import redirected in an otherwise original cloned full engine. Both arms use the same dataURL/rebase loader, all other imports point to the production modules. All original callback assertions, input, 24000 ticks and 15000ms CPU budget stay unchanged. No Game/method observers or additional snapshots are executed in timing. CPU/wall come only from the original diagnostic rounded to two decimals; private final Game locals are not exposed. This is not a full-suite pass or a speed claim. Production Navigation remains original. The root must compare fresh-process A/B/A observations, including failures. Candidate scalar swap assumes the actual app unmodified built-in Array iterator; non-number radius retains its original conversion path.'};
 try{
  const loaded=await loadGameArm(arm);Object.assign(report,{sourceSHA:loaded.hashes.engine,modelSHA:loaded.hashes.model,fixtureSHA:loaded.hashes.fixture,navigationOriginalSHA:loaded.hashes.navigationOriginal,navigationCandidateSHA:loaded.hashes.navigationCandidate,navigationProductionSHA:loaded.hashes.navigationProduction,rewrittenEngineSHA:loaded.rewrittenEngineSHA});
  const title='twenty minutes of seeded autopilot keeps entity pools finite and bounded',prefix=`test('${title}', { timeout: 20000 }, `,next="test('run rewards and weapon unlocks survive a real save/load round trip'";
  const start=loaded.fixtureSource.indexOf(prefix),end=loaded.fixtureSource.indexOf(next,start+prefix.length);
  assert.ok(start>=0&&end>start);assert.equal(loaded.fixtureSource.indexOf(prefix,start+prefix.length),-1);
  const invocation=loaded.fixtureSource.slice(start,end).trimEnd();assert.ok(invocation.endsWith(');'));
  const callbackSource=invocation.slice(prefix.length,-2);report.invocationSHA=sha(invocation);report.callbackSHA=sha(callbackSource);
  assert.equal(Buffer.byteLength(invocation),1865);assert.equal(Buffer.byteLength(callbackSource),1762);
  assert.equal(report.invocationSHA,PINNED_SOURCES.invocation);assert.equal(report.callbackSHA,PINNED_SOURCES.callback);
  let callback=null,registrations=0;
  const register=(name,options,fn)=>{registrations++;assert.equal(name,title);assert.deepEqual(options,{timeout:20000});callback=fn;};
  const factory=new Function('test','Game','assert','performance','process',"'use strict';\n"+invocation+`\n//# sourceURL=${new URL('tests/engine.test.mjs',gameRoot).href}?qa-navigation-scalar=${arm}`);
  factory(register,loaded.Game,assert,performance,process);assert.equal(registrations,1);assert.equal(typeof callback,'function');
  report.status='running';report.executed=true;
  callback({diagnostic:message=>{assert.equal(typeof message,'string');diagnostics.push(message);const match=/^Stress wall=(\d+(?:\.\d+)?)ms, CPU=(\d+(?:\.\d+)?)ms$/.exec(message);if(match){report.wallMs=Number(match[1]);report.cpuMs=Number(match[2]);}}});
  report.assertSuccess=true;report.status='passed-original-callback';
 }catch(error){report.status=report.executed?'failed-original-callback':'failed-preflight';report.errors.push(qualify(error));}
 await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);assert.equal(args.length,4,'usage: bench-navigation-scalar.mjs --arm original|candidate --out <new QA report.json>');assert.equal(args[0],'--arm');assert.equal(args[2],'--out');
  const report=await runStressArm(args[1],args[3]);process.stdout.write(JSON.stringify({arm:report.arm,status:report.status,cpuMs:report.cpuMs,wallMs:report.wallMs,out:path.resolve(args[3])})+'\n');if(!report.assertSuccess)process.exitCode=1;
 }catch(error){process.stderr.write(JSON.stringify({status:'report-not-written',error:qualify(error)})+'\n');process.exitCode=1;}
}
