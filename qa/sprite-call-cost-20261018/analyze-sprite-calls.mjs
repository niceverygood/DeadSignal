// Offline saved-browser-report analysis only. Imports no game/browser modules.
// node analyze-sprite-calls.mjs --off off.json --on on.json --out new-analysis.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const qaRoot=fileURLToPath(new URL('../',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const finite=Number.isFinite;
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const labels=['drawFrame','save','restore','drawImage','globalAlpha.get','globalAlpha.set','imageSmoothingEnabled.set','imageSmoothingQuality.set'];
function summarize(values){
 const sorted=values.filter(finite).toSorted((a,b)=>a-b),count=sorted.length;
 return {count,median:count?sorted[Math.min(count-1,Math.floor(count*.5))]:null,p95:count?sorted[Math.min(count-1,Math.floor(count*.95))]:null,max:count?sorted[count-1]:null,total:count?sorted.reduce((a,b)=>a+b,0):0};
}
function scalarContext(context){
 if(!isObject(context))return null;
 const fields=['state','screen','time','hp','kills','enemies','random','visualRandom','accumulator','lastFrame','saveClock','hudClock','hidden','focused','visibility','audioState','reuseCapture','nativeSelected','playerLive','gpuEnabled','rigError'];
 return Object.fromEntries(fields.filter(key=>context[key]===null||['string','number','boolean'].includes(typeof context[key])).map(key=>[key,context[key]]));
}
function stageTable(samples,valueKey){
 const names=[...new Set(samples.flatMap(sample=>Object.keys(sample?.stages||{})))].sort();
 return Object.fromEntries(names.map(name=>{
  const rows=samples.map(sample=>sample?.stages?.[name]),walls=rows.map(row=>finite(row?.[valueKey])?row[valueKey]:0),calls=rows.map(row=>finite(row?.calls)?row.calls:0);
  return [name,{callbackWallMs:summarize(walls),callbackCalls:summarize(calls),observedCallbacks:rows.filter(Boolean).length,totalCalls:calls.reduce((a,b)=>a+b,0),thrownCalls:rows.reduce((n,row)=>n+(finite(row?.thrownCalls)?row.thrownCalls:0),0),callbackMeanCallWallMs:summarize(rows.filter(row=>row?.calls>0&&finite(row?.[valueKey])).map(row=>row[valueKey]/row.calls))}];
 }));
}
function objectReferenceFields(value,trail='',found=[]){
 if(!value||typeof value!=='object')return found;
 for(const [key,item]of Object.entries(value)){
  const next=trail?trail+'.'+key:key;
  if(['actor','game','receiver','args','result','image','metadata','canvas','context','selected'].includes(key)&&item!==null&&typeof item==='object')found.push(next);
  if(item&&typeof item==='object')objectReferenceFields(item,next,found);
 }
 return found;
}
function urlGate(url,enabled){
 if(typeof url!=='string')return {provided:false,valid:null,reason:'URL not provided; origin/query gate cannot be independently certified from a JSON report.'};
 try{
  const parsed=new URL(url),q=parsed.searchParams,base=parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)&&parsed.port==='8851'&&q.has('qa')&&q.has('qa-memory')&&q.get('qa-loop')==='1';
  return {provided:true,valid:base&&(enabled?q.get('qa-loop-sprite-calls')==='1':q.get('qa-loop-sprite-calls')!=='1'),url,enabledFlag:q.get('qa-loop-sprite-calls')};
 }catch{return {provided:true,valid:false,url,reason:'Invalid capture URL.'};}
}
function analyzeCapture(root,arm){
 const wrapped=isObject(root?.report),report=wrapped?root.report:root;
 assert.ok(isObject(report)&&Array.isArray(report.samples),'an AppLoop report with samples is required');
 const enabled=arm==='on',issues=[],warnings=[],gate=urlGate(wrapped?root.url:root.url??report.captureURL,enabled);
 const issue=(condition,message)=>{if(!condition)issues.push(message);};
 issue(report.memoryOnly===true,'memoryOnly must be true (this JSON flag is not a replacement for the source genuine-Map gate).');
 issue(report.fixture?.count===180,'fixture.count must be180.');issue(report.fixture?.seed===774,'fixture.seed must be774.');
 issue(report.fixture?.weapon==='nailgun','fixture.weapon must be nailgun.');issue(report.fixture?.snapshotValid===true,'fixture.snapshotValid must be true.');
 issue(report.playingFrames===40,'The run must complete40 playing callbacks.');issue(report.reason==='playing-limit','The run must stop at the normal playing limit.');
 issue(report.samples.length===report.callbacks,'samples and callback count must agree.');
 issue(!report.observerError,'AppLoop observerError must be absent.');
 if(gate.provided)issue(gate.valid,'The capture URL must satisfy the8851 loopback/qa/qa-memory/qa-loop=1 and intended sprite flag.');else warnings.push(gate.reason);
 const playing=report.samples.filter(sample=>sample?.before?.state==='playing'&&!sample.before.screen&&!sample.before.hidden);
 issue(playing.length===40,'The saved before-context must certify40 playing callbacks.');
 issue(report.samples.every(sample=>finite(sample?.frameCpuMs)&&sample.frameCpuMs>=0),'Every callback must have a finite nonnegative frameCpuMs.');
 issue(report.samples.every(sample=>!sample?.error),'Callback errors must be absent.');
 if(report.unmeasured?.length)warnings.push('AppLoop unmeasured labels are present.');
 const sprite=report.spriteCalls;
 if(enabled){issue(sprite?.enabled===true,'Enabled arm requires spriteCalls.enabled===true.');issue(!sprite?.error,'Sprite observer stop/error fallback must not be treated as a measured report.');issue(Array.isArray(sprite?.samples),'Enabled sprite samples are required.');}
 else issue(sprite==null,'Off arm must omit spriteCalls or contain null.');
 let spriteSummary=null;
 if(isObject(sprite)&&Array.isArray(sprite.samples)){
  issue(sprite.samples.length<=80,'Sprite retained sample bound80 was exceeded.');issue((sprite.outliers?.length??0)<=32,'Sprite outlier bound32 was exceeded.');
  const spriteSamples=sprite.samples,callbacks=new Set(report.samples.map(sample=>sample.frame));
  issue(spriteSamples.every(sample=>Number.isInteger(sample.callback)&&callbacks.has(sample.callback)),'Sprite samples must map to actual AppLoop callback indices.');
  issue(new Set(spriteSamples.map(sample=>sample.callback)).size===spriteSamples.length,'Duplicate sprite callback indices.');
  const spriteCallbacks=new Set(spriteSamples.map(sample=>sample.callback));
  issue(playing.every(sample=>spriteCallbacks.has(sample.frame)),'Sprite samples must cover every one of the40 playing callbacks; a total-callback retention stop may otherwise truncate the playing window.');
  issue(objectReferenceFields({samples:spriteSamples,outliers:sprite.outliers||[]}).length===0,'Sprite report contains structured source/actor/context reference fields.');
  for(const sample of spriteSamples)for(const [name,stage]of Object.entries(sample.stages||{})){
   issue(labels.includes(name),'Unknown sprite stage '+name);issue(Number.isInteger(stage?.calls)&&stage.calls>=0,name+' calls must be nonnegative integer.');
   issue(Number.isInteger(stage?.thrownCalls)&&stage.thrownCalls>=0&&stage.thrownCalls<=stage.calls,name+' thrownCalls must be bounded by calls.');
   issue(finite(stage?.wallMs)&&stage.wallMs>=0,name+' wallMs must be finite and nonnegative.');
  }
  const stage=stageTable(spriteSamples,'wallMs'),drawCalls=stage.drawFrame?.totalCalls??0,imageCalls=stage.drawImage?.totalCalls??0;
  issue(drawCalls>0,'No original ProductionArt.drawFrame calls were observed.');issue(imageCalls>0,'No original ctx.drawImage calls were observed.');
  if(sprite.unmeasured?.length)warnings.push('Sprite unmeasured labels are present; missing stages must not be treated as zero-cost work.');
  const differences=spriteSamples.map(sample=>{const parent=sample.stages?.drawFrame,child=sample.stages?.drawImage;return finite(parent?.wallMs)&&finite(child?.wallMs)?parent.wallMs-child.wallMs:NaN;});
  spriteSummary={samples:spriteSamples.length,stages:stage,drawFrameMinusDrawImageCallbackMs:summarize(differences),outliers:sprite.outliers||[],unmeasured:sprite.unmeasured||[],note:sprite.note??null};
 }
 return {arm,valid:issues.length===0,issues,warnings,gate,fixture:report.fixture??null,reason:report.reason,callbacks:report.callbacks,playingFrames:report.playingFrames,
  initialContext:scalarContext(report.initialContext),finalContext:scalarContext(report.finalContext),
  observedAncillaryProfiles:{native:!!report.native,cost:!!report.cost,movement:!!report.movement,movementMode:report.movement?.mode??null},
  frame:Object.fromEntries(['frameCpuMs','rawDeltaMs','clampedDeltaMs','discardedWallMs','tickCount','eventCount','storageWrites','audioCalls'].map(key=>[key,summarize(playing.map(sample=>sample[key]))])),
  appStages:stageTable(playing,'cpuMs'),costStages:report.cost?.samples?stageTable(report.cost.samples,'cpuMs'):null,
  spriteCalls:spriteSummary,unmeasured:report.unmeasured||[],storageWrites:report.storageWrites,audioCalls:report.audioCalls};
}
function outputPath(value){const out=path.resolve(value),relative=path.relative(qaRoot,out);assert.ok(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative),'output must stay under the DeadSignal QA directory');assert.equal(path.extname(out).toLowerCase(),'.json');return out;}
function qualify(error){return {name:typeof error?.name==='string'?error.name:typeof error,message:typeof error?.message==='string'?error.message:String(error)};}

export async function analyzeSpriteCalls({off,on,out}){
 out=outputPath(out);const result={tool:'offline-sprite-call-browser-report-analyzer',status:'preflight',valid:false,inputs:{off:path.resolve(off),on:path.resolve(on)},arms:{},comparability:{},errors:[],
  note:'Saved browser JSON only; no Game, browser, Canvas, clocks or storage are invoked. A(off)/B(on) is an instrumentation-overhead/control observation, not a product optimization or FPS/GPU/memory result. Frame/raw-delta and nested CPU call wall timings are callback distributions; nested stages overlap and must not be summed. A per-callback mean call duration is not a per-call percentile, and retained top32 outliers cannot reconstruct the full call-duration distribution. drawFrame minus drawImage is only an arithmetic inclusive-call diagnostic, including wrapper/clock overhead and other work, not exclusive geometry time. Actual rAF schedules, focus, catch-up ticks and events can differ across passes; cross-pass HP/RNG equality is not a valid oracle. memoryOnly in JSON records the app decision but does not itself prove genuine storage branding; that source gate and browser origin require separate verification.'};
 for(const [arm,file]of [['off',off],['on',on]])try{
  const bytes=await readFile(file);assert.ok(bytes.length<=20000000,'input report exceeds20MB');result.inputs[arm+'SHA256']=sha(bytes);result.arms[arm]=analyzeCapture(JSON.parse(bytes.toString('utf8')),arm);
 }catch(error){result.errors.push({arm,...qualify(error)});}
 if(result.arms.off&&result.arms.on){
  const a=result.arms.off,b=result.arms.on;
  result.comparability.sameFixture=['count','seed','weapon','baseEnemies','spawnClock'].every(key=>Object.is(a.fixture?.[key],b.fixture?.[key]));
  result.comparability.sameAncillaryProfiles=JSON.stringify(a.observedAncillaryProfiles)===JSON.stringify(b.observedAncillaryProfiles);
  const delta=(left,right)=>finite(left)&&finite(right)?left-right:null;
  result.comparability.onMinusOffFrameCallbackMs={median:delta(b.frame.frameCpuMs.median,a.frame.frameCpuMs.median),p95:delta(b.frame.frameCpuMs.p95,a.frame.frameCpuMs.p95),max:delta(b.frame.frameCpuMs.max,a.frame.frameCpuMs.max)};
  result.comparability.schedule={offTickCounts:a.frame.tickCount,onTickCounts:b.frame.tickCount,offRawDeltaMs:a.frame.rawDeltaMs,onRawDeltaMs:b.frame.rawDeltaMs};
  if(!result.comparability.sameFixture)result.errors.push({message:'Off/on fixture settings differ.'});
  if(!result.comparability.sameAncillaryProfiles)result.errors.push({message:'Off/on ancillary observer options differ; this does not isolate the sprite observer.'});
  result.valid=a.valid&&b.valid&&result.errors.length===0;
 }
 result.status=result.valid?'valid-off-on-diagnostic':'invalid-or-incomplete-diagnostic';
 await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n',{encoding:'utf8',flag:'wx'});return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);assert.equal(args.length,6,'usage: analyze-sprite-calls.mjs --off off.json --on on.json --out new-analysis.json');assert.equal(args[0],'--off');assert.equal(args[2],'--on');assert.equal(args[4],'--out');const report=await analyzeSpriteCalls({off:args[1],on:args[3],out:args[5]});process.stdout.write(JSON.stringify({status:report.status,valid:report.valid,out:path.resolve(args[5])})+'\n');if(!report.valid)process.exitCode=1;}
 catch(error){process.stderr.write(JSON.stringify({status:'analysis-not-written',error:qualify(error)})+'\n');process.exitCode=1;}
}
