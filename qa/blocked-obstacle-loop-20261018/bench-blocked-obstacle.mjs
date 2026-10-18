// QA-only fresh-process arm; the root runs original/candidate/original once.
// No Game/method observers, extra snapshots or changed stress assertions.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFile,mkdir,open,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const directory=new URL('./',import.meta.url),qaRoot=fileURLToPath(new URL('../',directory));
const gameRoot=new URL('../../work/dead-signal-game/',directory),engineURL=new URL('dist/engine.js',gameRoot);
export const PINNED_SOURCES=Object.freeze({
 fixture:'6b92a458bcdcbde255eb413e5bf8bf9f313b951f32fd08129944897ccb922df8',
 invocation:'671ae4bf837801fec8165596268504486ff388259e527c2ef1a1852e684938a9',
 callback:'38cbf37b4e66c32a5b2545d127f49f1b8032020baf95fc70a780ac6967ba46b4',
 engine:'72487b352161059b5745a3e5cfc149ff71ae3f7b98c7e310b5d8b3a5345260ce',
 candidate:'d12df8316e258d8254f89d18a4c887db67d0ab0391ce19513f062009eaf62335',
 model:'9e066a693078ae8fd7aa01d7bbd39829598e356f8191bf9b725e483d0b88a9ce',
 navigation:'549e01276b6b670234df5c80507ef30b8f1ec1513be8477281e59b38e21367d9',
 grid:'938bed7097a7cd0db0659744bb1a18747f1ddeb943ae810633abf2fce4b21da7'
});
const sha=value=>createHash('sha256').update(value).digest('hex');
const relativeImports=source=>[...source.matchAll(/from\s*(['"])(\.[^'"]+)\1/g)].map(match=>match[2]);
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
function inside(root,target,allowRoot=false){
 const relative=path.relative(root,target);
 return (allowRoot||relative!=='')&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);
}
export function validateOutputPath(value){
 assert.equal(typeof value,'string','report path must be a string');assert.ok(value.length,'report path must not be empty');
 const output=path.resolve(value);
 assert.ok(inside(qaRoot,output),'report must stay in the DeadSignal QA directory');
 assert.equal(path.extname(output).toLowerCase(),'.json','report must be a new named .json file');return output;
}
export function parseArgs(args){
 assert.equal(args.length,4,'usage: bench-blocked-obstacle.mjs --arm original|candidate --out <new QA report.json>');
 assert.equal(args[0],'--arm');assert.equal(args[2],'--out');assert.ok(['original','candidate'].includes(args[1]),'arm must be original or candidate');
 return {arm:args[1],out:validateOutputPath(args[3])};
}
async function reserveOutput(output){
 // Check existing ancestors before mkdir so a QA-directory junction cannot
 // redirect report creation elsewhere. wx also refuses an existing file/link.
 const root=await realpath(qaRoot),parent=path.dirname(output);let ancestor=parent;
 for(;;){
  try{assert.ok(inside(root,await realpath(ancestor),true),'resolved report parent must stay in QA');break;}
  catch(error){if(error?.code!=='ENOENT')throw error;const next=path.dirname(ancestor);assert.notEqual(next,ancestor);ancestor=next;}
 }
 await mkdir(parent,{recursive:true});assert.ok(inside(root,await realpath(parent),true),'resolved report parent must stay in QA');
 return open(output,'wx');
}
async function writeReport(file,report){
 const buffer=Buffer.from(JSON.stringify(report,null,2)+'\n');let offset=0;
 while(offset<buffer.length){const {bytesWritten}=await file.write(buffer,offset,buffer.length-offset,offset);assert.ok(bytesWritten>0,'report write made no progress');offset+=bytesWritten;}
 await file.truncate(buffer.length);
}

export async function loadGameArm(arm){
 assert.ok(['original','candidate'].includes(arm),'arm must be original or candidate');
 const [original,candidate,productionEngine,model,fixture,frozenFixture,grid,frozenGrid,navigation]=await Promise.all([
  readFile(new URL('current-engine.txt',directory)),readFile(new URL('candidate-engine.mjs',directory)),readFile(engineURL),
  readFile(new URL('dist/upgrade-model.js',gameRoot)),readFile(new URL('tests/engine.test.mjs',gameRoot)),readFile(new URL('stress-fixture.txt',directory)),
  readFile(new URL('dist/enemy-separation-grid.js',gameRoot)),readFile(new URL('current-grid-helper.txt',directory)),readFile(new URL('dist/navigation.js',gameRoot))
 ]);
 const hashes={engine:sha(productionEngine),engineOriginal:sha(original),engineCandidate:sha(candidate),model:sha(model),fixture:sha(fixture),fixtureFrozen:sha(frozenFixture),grid:sha(grid),gridFrozen:sha(frozenGrid),navigation:sha(navigation)};
 for(const key of ['engine','model','fixture','grid','navigation'])assert.equal(hashes[key],PINNED_SOURCES[key],key+' production source changed');
 assert.equal(hashes.engineOriginal,PINNED_SOURCES.engine);assert.equal(hashes.engineCandidate,PINNED_SOURCES.candidate);
 assert.equal(hashes.fixtureFrozen,PINNED_SOURCES.fixture);assert.equal(hashes.gridFrozen,PINNED_SOURCES.grid);
 assert.equal(original.length,59149);assert.equal(candidate.length,59591);assert.equal(frozenFixture.length,29739);assert.equal(frozenGrid.length,3866);
 assert.ok(original.equals(productionEngine),'production engine must remain byte exact original');assert.ok(fixture.equals(frozenFixture));assert.ok(grid.equals(frozenGrid));
 const originalSource=original.toString('utf8'),candidateSource=candidate.toString('utf8'),imports=relativeImports(originalSource);
 const declarationBefore='const TYPES = {',declarationAfter='const nativeObstacleSome=Array.prototype.some,applyObstacleSome=Reflect.apply;\nconst TYPES = {';
 const callBefore='return this.world.obstacles.some(o=>!o.destroyed&&circleRect(x,y,r,o));';
 const callAfter='const obstacles=this.world.obstacles,some=obstacles.some;if(some===nativeObstacleSome&&Array.isArray(obstacles)){let length=+obstacles.length;length=length>0?Math.min(Math.trunc(length),Number.MAX_SAFE_INTEGER):0;for(let i=0;i<length;i++){if(!(i in obstacles))continue;const o=obstacles[i];if(!o.destroyed&&circleRect(x,y,r,o))return true;}return false;}return applyObstacleSome(some,obstacles,[o=>!o.destroyed&&circleRect(x,y,r,o)]);';
 assert.equal(originalSource.split(declarationBefore).length,2);assert.equal(originalSource.split(callBefore).length,2);
 assert.equal(candidateSource.split(declarationAfter).length,2);assert.equal(candidateSource.split(callAfter).length,2);
 assert.equal(candidateSource,originalSource.replace(declarationBefore,declarationAfter).replace(callBefore,callAfter),'only the two approved blocked-callback source transformations are allowed');
 assert.equal(candidateSource.replace(declarationAfter,declarationBefore).replace(callAfter,callBefore),originalSource,'candidate inverse must restore the whole original module exactly');
 assert.ok(imports.length>0);assert.deepEqual(relativeImports(candidateSource),imports,'all original imports must keep their exact order and specifiers');
 const source=arm==='original'?originalSource:candidateSource;
 const rewritten=rebase(source,engineURL)+`\n//# sourceURL=${engineURL.href}?qa-blocked-obstacle=${arm}`;
 const module=await import(dataURL(rewritten));
 return {Game:module.Game,hashes,rewrittenEngineSHA:sha(rewritten),fixtureSource:fixture.toString('utf8'),relativeImportCount:imports.length,candidateTransformVerified:true};
}

export async function runStressArm(arm,out){
 assert.ok(['original','candidate'].includes(arm),'arm must be original or candidate');out=validateOutputPath(out);
 // Reserve BEFORE source reads/imports or any Game work. Never overwrite a
 // prior result, including a failed result from an earlier observation.
 const file=await reserveOutput(out),diagnostics=[];
 const report={tool:'qa-blocked-obstacle-exact-stress',arm,status:'preflight',executed:false,assertSuccess:false,
  sourceSHA:null,engineOriginalSHA:null,engineCandidateSHA:null,engineProductionSHA:null,modelSHA:null,fixtureSHA:null,gridSHA:null,navigationSHA:null,rewrittenEngineSHA:null,relativeImportCount:null,candidateTransformVerified:false,
  invocationSHA:null,callbackSHA:null,expectedSHA:PINNED_SOURCES,originalTimeoutMs:20000,originalCPUBudgetMs:15000,originalLoopTicks:24000,
  cpuMs:null,wallMs:null,finalState:null,diagnostics,errors:[],
  acceptancePredeclared:{requiredOrder:['original','candidate','original'],candidateMustPassOriginalCPUBudget:true,candidateCPUUnderBothOriginals:true,minimumCPUImprovementAgainstFasterOriginalPercent:3,otherwise:'park the QA candidate; no production change',scope:'One bracket does not establish statistical confidence, FPS or peak memory.'},
  note:'One exact source-pinned original twenty-minute callback receives a full original or QA-candidate engine, through the same dataURL/rebase loader and identical original relative-import URLs. All original callback input, 24000 ticks, assertions and CPU<15000ms budget remain unchanged. The original registration timeout option is checked at 20000ms; this CLI invokes the extracted synchronous callback directly, without a node:test watchdog. No method observers, extra snapshots, allocation/RNG counters or changed health/cadence occur inside timing. CPU/wall are the original diagnostic rounded to two decimals; private final Game locals are not exposed. This is not an npm-test/full-suite pass. The root must compare one sequential fresh-process A/B/A bracket including failures. Production engine/navigation/grid stay original. Candidate scope is only the final obstacles.some callback in blocked. Normal arrays using the captured original Array.prototype.some receive an indexed scan with one native-compatible length conversion/snapshot, original HasProperty-before-Get holes/inherited-index behavior, and the original destroyed/circleRect short-circuit. Custom some methods and non-arrays receive the unchanged original callback through captured Reflect.apply with original receiver. Water/transport/roof/border checks, geometry math, AI, grid/navigation, damping, inputs, events, IDs, RNG and saves remain unchanged. Normal unmodified Array/Math/Reflect intrinsics are assumed. Custom some identity is checked before Array.isArray, retaining custom-callable fallback even if its getter revokes an array Proxy. Native TypeError message/stack equality across different call forms is not claimed; original controlled thrown values are propagated unchanged. There are no new persistent caches or hotpath measurement counters, and no memory/FPS claim.'};
 try{
  try{
   assert.ok(Number(process.versions.node.split('.')[0])>=22,'Node.js 22 or newer is required');
   const loaded=await loadGameArm(arm);Object.assign(report,{sourceSHA:arm==='original'?loaded.hashes.engineOriginal:loaded.hashes.engineCandidate,engineOriginalSHA:loaded.hashes.engineOriginal,engineCandidateSHA:loaded.hashes.engineCandidate,engineProductionSHA:loaded.hashes.engine,modelSHA:loaded.hashes.model,fixtureSHA:loaded.hashes.fixture,gridSHA:loaded.hashes.grid,navigationSHA:loaded.hashes.navigation,rewrittenEngineSHA:loaded.rewrittenEngineSHA,relativeImportCount:loaded.relativeImportCount,candidateTransformVerified:loaded.candidateTransformVerified});
   const title='twenty minutes of seeded autopilot keeps entity pools finite and bounded',prefix=`test('${title}', { timeout: 20000 }, `,next="test('run rewards and weapon unlocks survive a real save/load round trip'";
   const start=loaded.fixtureSource.indexOf(prefix),end=loaded.fixtureSource.indexOf(next,start+prefix.length);
   assert.ok(start>=0&&end>start);assert.equal(loaded.fixtureSource.indexOf(prefix,start+prefix.length),-1);
   const invocation=loaded.fixtureSource.slice(start,end).trimEnd();assert.ok(invocation.endsWith(');'));
   const callbackSource=invocation.slice(prefix.length,-2);report.invocationSHA=sha(invocation);report.callbackSHA=sha(callbackSource);
   assert.equal(Buffer.byteLength(invocation),1865);assert.equal(Buffer.byteLength(callbackSource),1762);
   assert.equal(report.invocationSHA,PINNED_SOURCES.invocation);assert.equal(report.callbackSHA,PINNED_SOURCES.callback);
   let callback=null,registrations=0;
   const register=(name,options,fn)=>{registrations++;assert.equal(name,title);assert.deepEqual(options,{timeout:20000});callback=fn;};
   const factory=new Function('test','Game','assert','performance','process',"'use strict';\n"+invocation+`\n//# sourceURL=${new URL('tests/engine.test.mjs',gameRoot).href}?qa-blocked-obstacle=${arm}`);
   factory(register,loaded.Game,assert,performance,process);assert.equal(registrations,1);assert.equal(typeof callback,'function');
   report.status='running';report.executed=true;
   const returned=callback({diagnostic:message=>{assert.equal(typeof message,'string');diagnostics.push(message);const match=/^Stress wall=(\d+(?:\.\d+)?)ms, CPU=(\d+(?:\.\d+)?)ms$/.exec(message);if(match){report.wallMs=Number(match[1]);report.cpuMs=Number(match[2]);}}});
   assert.equal(returned,undefined,'the frozen original callback is synchronous');assert.ok(report.cpuMs!==null&&report.wallMs!==null,'original timing diagnostic is required');
   report.assertSuccess=true;report.status='passed-original-callback';
  }catch(error){report.status=report.executed?'failed-original-callback':'failed-preflight';report.errors.push(qualify(error));}
  await writeReport(file,report);return report;
 }finally{await file.close();}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let completed=false;
 try{
  const args=parseArgs(process.argv.slice(2)),report=await runStressArm(args.arm,args.out);completed=true;
  process.stdout.write(JSON.stringify({arm:report.arm,status:report.status,cpuMs:report.cpuMs,wallMs:report.wallMs,out:args.out})+'\n');if(!report.assertSuccess)process.exitCode=1;
 }catch(error){process.stderr.write(JSON.stringify({status:completed?'output-failed-report-preserved':'report-not-completed',error:qualify(error)})+'\n');process.exitCode=1;}
}
