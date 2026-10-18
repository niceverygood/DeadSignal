import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import v8 from 'node:v8';
import {productionManifest} from '../work/dead-signal-game/dist/production-manifest.js';

export const ORIGINAL_SHA256='b3c2aae00ce820449be98c82c17deb8d52623b01b018d9127d988e9f0337805f';
export const CACHE_CONDITION='one retained frozen result per selected asset ID; no upfront parsed-metadata cache';
export const MEASUREMENT_NOTE='Isolated sequential Node-process legacy/owned/legacy comparison, same ordered local metadata texts and one final-result cache. Only each parse/validate/freeze call is timed; file reads, module import, hashing, freeze verification, memory sampling and output are outside those call intervals. Process CPU includes all process threads, including concurrent JIT/GC work. Memory snapshots and sampled heap maxima are not continuous peak JS heap. resourceUsage.maxRSS is process RSS high-water (Node kilobytes when available), including startup, input, verification and native allocations; it is not pure JS metadata memory or game/GPU/RAM usage. Forced GC, when explicitly requested with --expose-gc and --gc in every worker, is a separate retained-memory diagnostic and does not represent normal app behavior. No PNG decode, rendering, network, Game, browser or persistent save is used.';
const rootURL=new URL('../',import.meta.url),productionURL=new URL('../work/dead-signal-game/dist/production-art.js',import.meta.url),assetURL=new URL('../work/dead-signal-game/dist/assets/production/',import.meta.url),originalURL=new URL('../qa/dense-combat-20261018/production-art-before-owned-json.txt',import.meta.url);
const sha=value=>createHash('sha256').update(value).digest('hex');

export function selectMetadataFiles(manifest=productionManifest,scope='launch'){
 if(!['launch','all'].includes(scope))throw Error('owned-atlas-scope-launch-or-all');
 const ids=scope==='all'?Object.keys(manifest.assets??{}):[...new Set(['walker','runner','gas'].flatMap(type=>{const mapping=manifest.enemies?.[type];if(typeof mapping==='string')return[mapping];if(!mapping||typeof mapping!=='object')throw Error('owned-atlas-launch-roster-missing-'+type);return Object.values(mapping);}))];
 if(!ids.length)throw Error('owned-atlas-empty-metadata-roster');
 return ids.map(id=>{const metadata=manifest.assets?.[id]?.metadata;if(typeof id!=='string'||typeof metadata!=='string'||!metadata.endsWith('/metadata.json'))throw Error('owned-atlas-local-metadata-required-'+id);const url=new URL(metadata,assetURL),path=fileURLToPath(url),within=relative(fileURLToPath(assetURL),path);if(url.protocol!=='file:'||isAbsolute(within)||within==='..'||within.startsWith('..\\')||within.startsWith('../'))throw Error('owned-atlas-metadata-outside-local-assets');return{id,metadata,path};});
}
export function rewriteOriginalModule(source){
 if(sha(source)!==ORIGINAL_SHA256)throw Error('owned-atlas-original-module-sha-mismatch');
 return source.replace(/from (['"])(\.[^'"]+)\1/g,(match,quote,specifier)=>'from '+JSON.stringify(new URL(specifier,productionURL).href)).replaceAll('import.meta.url',JSON.stringify(productionURL.href));
}
export function strictTreeFingerprint(value){
 const digest=createHash('sha256');let objects=0,allFrozen=true;
 function visit(node){
  if(node===null){digest.update('null;');return;}const type=typeof node;
  if(type==='number'){digest.update('number:'+ (Object.is(node,-0)?'-0':String(node))+';');return;}
  if(type!=='object'){digest.update(type+':'+JSON.stringify(node)+';');return;}
  objects++;allFrozen&&=Object.isFrozen(node);
  if(Array.isArray(node)){digest.update('array:'+node.length+'[');for(let index=0;index<node.length;index++){digest.update(Object.hasOwn(node,index)?'own:':'hole:');visit(node[index]);}digest.update(']');}
  else{const keys=Object.keys(node).sort();digest.update('object:'+keys.length+'{');for(const key of keys){digest.update(JSON.stringify(key)+':');visit(node[key]);}digest.update('}');}
 }
 visit(value);return {sha256:digest.digest('hex'),allFrozen,objects};
}
export function captureMemory(){
 const processMemory=process.memoryUsage(),heap=v8.getHeapStatistics();let resource=null;try{resource=process.resourceUsage();}catch{}
 return {process:processMemory,v8Heap:heap,processMaxRssKiB:Number.isFinite(resource?.maxRSS)&&resource.maxRSS>0?resource.maxRSS:null,scope:'Sampled process/V8 counters; maxRSS is process high-water including startup/input/verification, not peak JS heap.'};
}

export async function measureMetadataFiles(files,parse,{readText=path=>readFile(path,'utf8'),now=()=>performance.now(),cpuUsage=previous=>process.cpuUsage(previous),memory=captureMemory,gc=false,gcFunction=undefined}={}){
 if(typeof parse!=='function')throw Error('owned-atlas-parser-unavailable');
 if(gc&&typeof gcFunction!=='function')throw Error('owned-atlas-explicit-expose-gc-required');
 const cache=new Map(),results=[],snapshots={beforeProcessing:memory()};
 if(gc){gcFunction();snapshots.afterExplicitPreGC=memory();}
 let parseWallMs=0,parseCpuMs=0,sampledHeapUsedMax=0,sampledRssMax=0,totalSourceBytes=0,totalFrames=0;
 for(const file of files){
  // One text is read at a time, outside its parser timing. No parsed baseline
  // or duplicate candidate tree is constructed before the measured call.
  const text=await readText(file.path),bytes=Buffer.byteLength(text),sourceSha256=sha(text);let output,error=null;
  const cpuStart=cpuUsage(),start=now();
  try{output=parse(text);}catch(caught){error={name:caught?.name??'Error',message:caught?.message??String(caught)};}
  const wallMs=now()-start,cpuMicroseconds=cpuUsage(cpuStart),cpuMs=(cpuMicroseconds.user+cpuMicroseconds.system)/1000;parseWallMs+=wallMs;parseCpuMs+=cpuMs;totalSourceBytes+=bytes;
  let outputJsonSha256=null,tree=null,frames=0;
  if(!error){cache.set(file.id,output);frames=Array.isArray(output?.frames)?output.frames.length:0;totalFrames+=frames;outputJsonSha256=sha(JSON.stringify(output));tree=strictTreeFingerprint(output);}
  const sampled=memory();sampledHeapUsedMax=Math.max(sampledHeapUsedMax,sampled.process.heapUsed);sampledRssMax=Math.max(sampledRssMax,sampled.process.rss);
  results.push({id:file.id,metadata:file.metadata,sourceBytes:bytes,sourceSha256,frames,outputJsonSha256,strictTreeSha256:tree?.sha256??null,allFrozen:tree?.allFrozen??false,objectCount:tree?.objects??0,error,parseValidateFreezeWallMs:wallMs,parseValidateFreezeCpuMs:cpuMs,cpuMicroseconds});
 }
 snapshots.afterProcessingBeforeGC=memory();
 if(gc){gcFunction();snapshots.afterExplicitRetainedGC=memory();}
 // Read after the optional GC so the final-result Map remains strongly live.
 const retainedResults=cache.size,processHighWaterRssKiB=snapshots.afterExplicitRetainedGC?.processMaxRssKiB??snapshots.afterProcessingBeforeGC.processMaxRssKiB;
 return {cacheCondition:CACHE_CONDITION,retainedResults,files:results,totalSourceBytes,totalFrames,allValid:results.every(result=>!result.error),allFrozen:results.every(result=>!result.error&&result.allFrozen),parseValidateFreezeWallMs:parseWallMs,parseValidateFreezeCpuMs:parseCpuMs,memory:{snapshots,sampledHeapUsedMax,sampledRssMax,processHighWaterRssKiB,processHighWaterRssBytes:processHighWaterRssKiB===null?null:processHighWaterRssKiB*1024,heapMaximumScope:'Maximum of samples after each file verification only; not a continuous JS-heap peak. End heap is separately reported as a snapshot.',gcMode:gc?'explicit forced-GC retained diagnostic':'normal execution; no explicit GC calls'},note:MEASUREMENT_NOTE};
}

export async function runAtlasWorker(mode,{scope='launch',gc=false}={}){
 if(!['legacy','owned'].includes(mode))throw Error('owned-atlas-worker-mode-invalid');
 if(gc&&typeof globalThis.gc!=='function')throw Error('owned-atlas-explicit-expose-gc-required');
 const startMemory=captureMemory(),original=await readFile(originalURL,'utf8'),rewritten=rewriteOriginalModule(original),candidateSource=await readFile(productionURL,'utf8'),importStart=performance.now();
 const module=await import(mode==='legacy'?'data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'):productionURL.href);
 const moduleImportWallMs=performance.now()-importStart,afterModuleMemory=captureMemory(),parse=mode==='legacy'?text=>module.validateAtlasMetadata(JSON.parse(text)):module.parseAtlasMetadata;
 const files=selectMetadataFiles(productionManifest,scope),measurement=await measureMetadataFiles(files,parse,{gc,gcFunction:gc?globalThis.gc:undefined});
 return {mode,scope,nodeVersion:process.version,v8Version:process.versions.v8,nodeFlags:[...process.execArgv],originalModuleSha256:ORIGINAL_SHA256,candidateModuleSha256:sha(candidateSource),moduleImportWallMs,startMemory,afterModuleMemory,...measurement};
}
export function buildWorkerArgs(mode,{scope='launch',gc=false}={}){
 return [...(gc?['--expose-gc']:[]),fileURLToPath(import.meta.url),'--worker',mode,'--scope',scope,...(gc?['--gc']:[])];
}
export function spawnAtlasWorker(mode,options){
 return new Promise((resolveChild,reject)=>{const child=spawn(process.execPath,buildWorkerArgs(mode,options),{cwd:fileURLToPath(rootURL),windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',overflow=false;
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>16*1024*1024){overflow=true;child.kill();}});child.stderr.on('data',chunk=>{stderr+=chunk;});child.on('error',reject);child.on('close',(code,signal)=>{if(overflow){reject(Error('owned-atlas-worker-output-limit'));return;}if(code!==0){reject(Error('owned-atlas-worker-failed-'+mode+'-exit-'+code+'-signal-'+signal+': '+stderr.slice(-4000)));return;}try{resolveChild(JSON.parse(stdout));}catch{reject(Error('owned-atlas-worker-json-invalid: '+stderr.slice(-4000)));}});
 });
}
const comparable=run=>({originalModuleSha256:run.originalModuleSha256,candidateModuleSha256:run.candidateModuleSha256,nodeVersion:run.nodeVersion,v8Version:run.v8Version,nodeFlags:run.nodeFlags,cacheCondition:run.cacheCondition,retainedResults:run.retainedResults,totalSourceBytes:run.totalSourceBytes,totalFrames:run.totalFrames,files:run.files.map(({id,metadata,sourceBytes,sourceSha256,frames,outputJsonSha256,strictTreeSha256,allFrozen,error})=>({id,metadata,sourceBytes,sourceSha256,frames,outputJsonSha256,strictTreeSha256,allFrozen,error}))});
export async function compareOwnedAtlasJSON({scope='launch',gc=false}={},runChild=spawnAtlasWorker){
 const runs=[];for(const [index,mode]of ['legacy','owned','legacy'].entries())runs.push({arm:index===0?'A':index===1?'B':'A-repeat',...await runChild(mode,{scope,gc})});
 const expected=JSON.stringify(comparable(runs[0])),outputsExact=runs.every(run=>JSON.stringify(comparable(run))===expected),allValid=runs.every(run=>run.allValid),allFrozen=runs.every(run=>run.allFrozen);
 return {diagnosticOnly:true,scope:scope==='all'?'all registered metadata asset IDs':'actual walker/runner/gas launch roster, deduplicated asset IDs in catalog order',gcMode:gc?'explicit --expose-gc/--gc in each isolated worker':'normal; no forced GC',cacheCondition:CACHE_CONDITION,processOrder:'sequential A legacy → B owned → A legacy-repeat; each arm is a newly spawned Node process',outputsExact,allValid,allFrozen,runs,note:MEASUREMENT_NOTE};
}
export function parseAtlasCLIArgs(args){
 const options={scope:'launch',gc:false,out:null,worker:null,help:false};
 for(let index=0;index<args.length;index++){const arg=args[index];if(arg==='--help'||arg==='-h'){options.help=true;continue;}if(arg==='--gc'){options.gc=true;continue;}if(!['--scope','--out','--worker'].includes(arg))throw Error('owned-atlas-unknown-option-'+arg);const value=args[++index];if(!value||value.startsWith('--'))throw Error('owned-atlas-option-value-required-'+arg);if(arg==='--scope'){if(!['launch','all'].includes(value))throw Error('owned-atlas-scope-launch-or-all');options.scope=value;}else if(arg==='--worker'){if(!['legacy','owned'].includes(value))throw Error('owned-atlas-worker-mode-invalid');options.worker=value;}else options.out=value;}
 if(options.worker&&options.out)throw Error('owned-atlas-worker-cannot-write-output');return options;
}
const usage='Usage: node tools/qa-owned-atlas-json.mjs [--scope launch|all] [--out NEW_REPORT.json]\nOptional controlled retained-memory diagnostic: node --expose-gc tools/qa-owned-atlas-json.mjs --gc [--scope launch|all] [--out NEW_REPORT.json]\nIndependent child processes run sequentially A/B/A. --out uses exclusive creation and cannot overwrite source or an existing report. Scope all means all registered asset metadata, not unregistered archives. Exit0=valid/frozen/exact outputs; exit1=observable mismatch/validation failure; exit2=CLI/I/O/worker error.';
export async function runAtlasCLI(args,{stdout=value=>console.log(value),stderr=value=>console.error(value),runChild=spawnAtlasWorker}={}){
 try{const options=parseAtlasCLIArgs(args);if(options.help){stdout(usage);return 0;}if(options.gc&&typeof globalThis.gc!=='function')throw Error('owned-atlas-explicit-expose-gc-required');
  const report=options.worker?await runAtlasWorker(options.worker,options):await compareOwnedAtlasJSON(options,runChild),text=JSON.stringify(report,null,2);
  if(options.out)await writeFile(resolve(options.out),text+'\n',{flag:'wx'});stdout(text);return options.worker?0:report.outputsExact&&report.allValid&&report.allFrozen?0:1;
 }catch(error){stderr(JSON.stringify({diagnosticOnly:true,error:error?.message??String(error),usage}));return 2;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await runAtlasCLI(process.argv.slice(2));
