import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

export const ORIGINAL_AUDIO_SHA256='b5ab39861cb4128e3fd2b97f5eb682b2390eee5dd20f916e85e81540727e405b';
export const AUDIO_ENVELOPE_NOTE='Independent sequential Node original/cached/original processes call the actual AudioSystem.noise with the same seeded Math.random stream, sample rate, cold/steady recipes and fresh basic fake AudioBuffer/nodes. Only synchronous noise calls are timed; PCM/graph hashing, cache inspection, onended cleanup, scheduling and output are outside call timing. Timings include the identical fake allocation/graph/RNG-counter overhead and process CPU can include other process threads. This is not native Web Audio rendering, audible-quality, browser overlap, GPU, FPS, game or persistent-save evidence. Every voice retains its original fresh AudioBuffer/source/filter/gain/panner graph; only the candidate envelope cache differs. Cache bytes are source-reported Float64 weight storage, not measured heap or process memory. A bounded first-arrival cache need not admit every duration, particularly in the optional96k working-set diagnostic; steady does not assert all hits or any fixed speedup. Only the current call buffers/nodes are retained by the fake; output contains digests and primitive counts, never PCM or node objects.';
const rootURL=new URL('../',import.meta.url),audioURL=new URL('../work/dead-signal-game/dist/audio.js',import.meta.url),originalURL=new URL('../qa/audio-envelope-20261018/audio-before-envelope.txt',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const validSeed=value=>Number.isInteger(value)&&value>=0&&value<=0xffffffff;
const validateOptions=({sampleRate=48000,steadyCalls=300,seed=774}={})=>{
 if(![44100,48000,96000].includes(sampleRate))throw Error('audio-envelope-sample-rate-44100-48000-or-96000');
 if(!Number.isInteger(steadyCalls)||steadyCalls<1||steadyCalls>3000)throw Error('audio-envelope-steady-calls-1-to-3000');
 if(!validSeed(seed))throw Error('audio-envelope-seed-uint32');
 return{sampleRate,steadyCalls,seed};
};

// Actual noise recipes from AudioSystem.play, including the sole highpass and
// delayed explosions/fire. The fixture RNG is separate from the noise RNG.
export const COMMON_NOISE_RECIPES=Object.freeze([
 [.045,.12,3800,0,'lowpass'],[.045,.4,5200,0,'lowpass'],[.24,.24,1100,0,'lowpass'],
 [.035,.28,4800,0,'lowpass'],[.48,.5,750,0,'lowpass'],[.18,.10,2100,.12,'lowpass'],
 [.1,.08,2200,0,'lowpass'],[.16,.12,3200,0,'lowpass'],[.3,.12,650,0,'lowpass'],
 [.04,.18,3800,0,'highpass'],[.4,.25,1200,.025,'lowpass'],[.09,.1,1200,0,'lowpass'],
 [.045,.12,5200,0,'lowpass'],[.075,.12,1850,0,'lowpass'],[.035,.08,4200,0,'lowpass'],
 [.09,.14,1450,0,'lowpass'],[.045,.14,1450,0,'lowpass'],[.16,.11,680,0,'lowpass'],
 [.04,.07,4600,0,'lowpass'],[.04,.07,2100,0,'lowpass'],[.045,.055,1250,0,'lowpass'],
 [.035,.09,3800,0,'lowpass'],[.055,.10,2400,0,'lowpass'],[.04,.085,4300,0,'lowpass'],
 [.025,.07,4400,0,'lowpass'],[.025,.07,2600,0,'lowpass'],[.1,.1,6000,0,'lowpass'],
 [.12,.2,2800,0,'lowpass'],[.12,.2,850,0,'lowpass'],[.25,.3,500,0,'lowpass'],
 [.12,.15,1000,0,'lowpass']
].map(recipe=>Object.freeze(recipe)));

export function seededNoiseRandom(seed=774){
 if(!validSeed(seed))throw Error('audio-envelope-seed-uint32');let state=seed>>>0,calls=0;
 return{random(){state=(Math.imul(state,1664525)+1013904223)>>>0;calls++;return state/4294967296;},snapshot:()=>({state,calls})};
}
export function makeNoisePhases({steadyCalls=300,seed=774}={}){
 validateOptions({steadyCalls,seed});
 const seen=new Set(),cold=COMMON_NOISE_RECIPES.filter(recipe=>!seen.has(recipe[0])&&seen.add(recipe[0]));
 const order=seededNoiseRandom((seed^0xa53c91e7)>>>0),steady=[];
 // Each shuffled block contains every actual recipe. Thus default 300 calls
 // exercise every duration/gain/filter/delay instead of accidentally omitting it.
 while(steady.length<steadyCalls){const block=[...COMMON_NOISE_RECIPES];for(let i=block.length-1;i>0;i--){const j=Math.floor(order.random()*(i+1));[block[i],block[j]]=[block[j],block[i]];}steady.push(...block.slice(0,steadyCalls-steady.length));}
 const decorate=recipes=>recipes.map((args,index)=>({args:[...args],pan:(index%5-2)*.3,perspectiveGain:.5+(index%4)*.2}));
 return[{name:'cold-build',recipes:decorate(cold)},{name:'steady',recipes:decorate(steady)}];
}
export function rewriteOriginalAudio(source){
 if(hash(source)!==ORIGINAL_AUDIO_SHA256)throw Error('audio-envelope-original-sha-mismatch');
 return source.replace(/from (['"])(\.[^'"]+)\1/g,(match,quote,specifier)=>'from '+JSON.stringify(new URL(specifier,audioURL).href)).replaceAll('import.meta.url',JSON.stringify(audioURL.href));
}

// A lightweight functional graph, not a DSP emulator. Logs hold only current
// call nodes/buffers and scalar operations. consume() drops those references.
export function createNoiseContext(sampleRate=48000){
 if(!Number.isInteger(sampleRate)||sampleRate<=0)throw Error('audio-envelope-fake-sample-rate-invalid');
 let nextID=0,current=null;const totals={buffers:0,bufferBytes:0,sources:0,filters:0,gains:0,panners:0,channelReads:0,connects:0,disconnects:0,starts:0};
 const emit=(...args)=>{if(current)current.operations.push(args);};
 function node(type,counter){
  totals[counter]++;const value={type,id:++nextID,connect(target){totals.connects++;emit('connect',this.id,target?.id??null);return target;},disconnect(){totals.disconnects++;emit('disconnect',this.id);}};
  if(current)current.nodes.push(value);emit('create',type,value.id);return value;
 }
 const context={sampleRate,currentTime:1,state:'running',destination:{type:'destination',id:0},
  createBuffer(channels,length,rate){
   if(!Number.isInteger(channels)||channels<=0||!Number.isInteger(length)||length<=0||rate!==sampleRate)throw Error('audio-envelope-fake-buffer-invalid');
   const data=Array.from({length:channels},()=>new Float32Array(length));totals.buffers++;totals.bufferBytes+=channels*length*4;
   const buffer={numberOfChannels:channels,length,sampleRate:rate,duration:length/rate,getChannelData(channel){if(!Number.isInteger(channel)||channel<0||channel>=channels)throw Error('audio-envelope-channel-invalid');totals.channelReads++;emit('channel',channel);return data[channel];}};
   if(current)current.buffers.push({buffer,data});emit('buffer',channels,length,rate);return buffer;
  },
  createBufferSource(){const value=node('source','sources');value.buffer=null;value.onended=null;value.start=function(time){totals.starts++;emit('start',this.id,time);};return value;},
  createBiquadFilter(){return Object.assign(node('filter','filters'),{type:'lowpass',frequency:{value:350}});},
  createGain(){return Object.assign(node('gain','gains'),{gain:{value:1}});},
  createStereoPanner(){return Object.assign(node('panner','panners'),{pan:{value:0}});}
 };
 const counts=()=>({...totals});
 return{context,counts,begin(){if(current)throw Error('audio-envelope-call-already-open');current={nodes:[],buffers:[],operations:[]};},
  consume(audio){
   if(!current)throw Error('audio-envelope-no-current-call');const call=current;current=null;
   const activeBeforeEnd=audio.active,source=call.nodes.find(value=>Object.hasOwn(value,'buffer')),buffer=call.buffers[0];
   const graph={operations:call.operations,nodes:call.nodes.map(value=>({id:value.id,kind:Object.hasOwn(value,'buffer')?'source':Object.hasOwn(value,'frequency')?'filter':Object.hasOwn(value,'gain')?'gain':'panner',filterType:Object.hasOwn(value,'frequency')?value.type:undefined,frequency:value.frequency?.value,gain:value.gain?.value,pan:value.pan?.value,buffer:Object.hasOwn(value,'buffer')?(value.buffer===buffer?.buffer?'current':null):undefined})),activeBeforeEnd,activeAfterEnd:null};
   // onended is not fired synchronously by start; invoke the original callback
   // outside timing to prevent fake voice-limit skips on subsequent recipes.
   current=call;try{for(const value of call.nodes)if(typeof value.onended==='function'){const ended=value.onended;value.onended=null;ended();}}finally{current=null;}
   graph.activeAfterEnd=audio.active;
   const problems=[];if(call.buffers.length!==1)problems.push('expected-one-fresh-buffer');if(call.nodes.length!==4||!source||source.buffer!==buffer?.buffer)problems.push('expected-source-filter-gain-panner');if(activeBeforeEnd!==1||audio.active!==0)problems.push('voice-lifecycle');if(call.operations.filter(op=>op[0]==='disconnect').length!==4)problems.push('original-cleanup');
   return{graph,pcm:buffer?.data[0]??new Float32Array(0),buffer:{channels:buffer?.buffer.numberOfChannels??0,length:buffer?.buffer.length??0,sampleRate:buffer?.buffer.sampleRate??null},problems};
  },pendingReferences:()=>current?current.nodes.length+current.buffers.length:0};
}
const subtract=(after,before)=>Object.fromEntries(Object.keys(after).map(key=>[key,after[key]-before[key]]));
const cacheSnapshot=(reader,owner)=>{if(typeof reader!=='function')return null;const value=reader(owner);return{entries:value.entries,bytes:value.bytes,maxEntries:value.maxEntries,maxBytes:value.maxBytes};};
export function measureNoisePhases(AudioSystem,{sampleRate=48000,seed=774,phases=makeNoisePhases({seed}),cacheStats,now=()=>performance.now(),cpuUsage=previous=>process.cpuUsage(previous)}={}){
 if(typeof AudioSystem!=='function')throw Error('audio-envelope-audio-system-required');
 const fake=createNoiseContext(sampleRate),audio=new AudioSystem(),random=seededNoiseRandom(seed),originalRandom=Math.random;
 audio.ctx=fake.context;audio.master=fake.context.createGain();const setupCounts=fake.counts(),results=[];let globalIndex=0;
 try{
  Math.random=random.random;
  for(const phase of phases){
   const beforeCounts=fake.counts(),beforeRandom=random.snapshot(),pcmDigest=createHash('sha256'),graphDigest=createHash('sha256'),calls=[];
   let callWallMs=0,callCpuMs=0;
   for(const recipe of phase.recipes){
    audio.perspective={pan:recipe.pan,gain:recipe.perspectiveGain};fake.context.currentTime=1+globalIndex*.7;globalIndex++;fake.begin();let error=null;
    const cpuStart=cpuUsage(),start=now();
    try{audio.noise(...recipe.args);}catch(caught){error={name:caught?.name??'Error',message:caught?.message??String(caught)};}
    const wallMs=now()-start,usage=cpuUsage(cpuStart),cpuMs=(usage.user+usage.system)/1000;callWallMs+=wallMs;callCpuMs+=cpuMs;
    const observed=fake.consume(audio),bytes=Buffer.from(observed.pcm.buffer,observed.pcm.byteOffset,observed.pcm.byteLength),pcmSha256=hash(bytes),graphJSON=JSON.stringify(observed.graph),graphSha256=hash(graphJSON);
    pcmDigest.update(JSON.stringify(observed.buffer));pcmDigest.update(bytes);graphDigest.update(graphJSON);
    calls.push({args:[...recipe.args],pan:recipe.pan,perspectiveGain:recipe.perspectiveGain,buffer:observed.buffer,pcmSha256,graphSha256,random:random.snapshot(),error,problems:observed.problems,callWallMs:wallMs,callCpuMs:cpuMs});
   }
   results.push({name:phase.name,calls:phase.recipes.length,callWallMs,callCpuMs,pcmSha256:pcmDigest.digest('hex'),graphSha256:graphDigest.digest('hex'),randomBefore:beforeRandom,randomAfter:random.snapshot(),nodes:subtract(fake.counts(),beforeCounts),cache:cacheSnapshot(cacheStats,audio),allValid:calls.every(call=>!call.error&&!call.problems.length),callResults:calls});
  }
 }finally{Math.random=originalRandom;}
 return{sampleRate,seed,setupCounts,phases:results,random:random.snapshot(),nodes:subtract(fake.counts(),setupCounts),allValid:results.length>0&&results.every(phase=>phase.allValid),retainedFakeReferences:fake.pendingReferences(),note:AUDIO_ENVELOPE_NOTE};
}

export async function runAudioWorker(mode,options={}){
 if(!['original','cached'].includes(mode))throw Error('audio-envelope-worker-mode-invalid');const settings=validateOptions(options);
 const original=await readFile(originalURL,'utf8'),rewritten=rewriteOriginalAudio(original),candidateSource=await readFile(audioURL,'utf8');
 const module=await import(mode==='original'?'data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'):audioURL.href);
 if(mode==='cached'&&typeof module.audioNoiseEnvelopeStats!=='function')throw Error('audio-envelope-candidate-cache-api-required');
 const phases=makeNoisePhases(settings),lengths=[...new Set(phases[0].recipes.map(recipe=>Math.floor(recipe.args[0]*settings.sampleRate)))],measurement=measureNoisePhases(module.AudioSystem,{...settings,phases,cacheStats:module.audioNoiseEnvelopeStats});
 return{mode,nodeVersion:process.version,v8Version:process.versions.v8,platform:process.platform,arch:process.arch,nodeFlags:[...process.execArgv],originalModuleSha256:ORIGINAL_AUDIO_SHA256,candidateModuleSha256:hash(candidateSource),steadyCalls:settings.steadyCalls,workingSet:{distinctLengths:lengths.length,idealAllCurveBytes:lengths.reduce((sum,length)=>sum+length*8,0),scope:'Source-weight byte arithmetic only; admitted cache bytes are reported separately after each phase.'},...measurement};
}
export function buildAudioWorkerArgs(mode,options={}){
 const {sampleRate,steadyCalls,seed}=validateOptions(options);if(!['original','cached'].includes(mode))throw Error('audio-envelope-worker-mode-invalid');
 return[fileURLToPath(import.meta.url),'--worker',mode,'--sample-rate',String(sampleRate),'--steady-calls',String(steadyCalls),'--seed',String(seed)];
}
export function spawnAudioWorker(mode,options){
 return new Promise((resolveChild,reject)=>{const child=spawn(process.execPath,buildAudioWorkerArgs(mode,options),{cwd:fileURLToPath(rootURL),windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',overflow=false;
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>16*1024*1024){overflow=true;child.kill();}});child.stderr.on('data',chunk=>{stderr+=chunk;});child.on('error',reject);child.on('close',(code,signal)=>{if(overflow){reject(Error('audio-envelope-worker-output-limit'));return;}if(code!==0){reject(Error('audio-envelope-worker-failed-'+mode+'-exit-'+code+'-signal-'+signal+': '+stderr.slice(-4000)));return;}try{resolveChild(JSON.parse(stdout));}catch{reject(Error('audio-envelope-worker-json-invalid: '+stderr.slice(-4000)));}});
 });
}
const comparable=run=>({nodeVersion:run.nodeVersion,v8Version:run.v8Version,platform:run.platform,arch:run.arch,nodeFlags:run.nodeFlags,originalModuleSha256:run.originalModuleSha256,candidateModuleSha256:run.candidateModuleSha256,sampleRate:run.sampleRate,seed:run.seed,steadyCalls:run.steadyCalls,workingSet:run.workingSet,setupCounts:run.setupCounts,random:run.random,nodes:run.nodes,retainedFakeReferences:run.retainedFakeReferences,phases:run.phases.map(({name,calls,pcmSha256,graphSha256,randomBefore,randomAfter,nodes,allValid,callResults})=>({name,calls,pcmSha256,graphSha256,randomBefore,randomAfter,nodes,allValid,callResults:callResults.map(({callWallMs,callCpuMs,...proof})=>proof)}))});
export async function compareAudioEnvelope(options={},runChild=spawnAudioWorker){
 const settings=validateOptions(options),runs=[];
 for(const [index,mode]of ['original','cached','original'].entries())runs.push({arm:index===0?'A':index===1?'B':'A-repeat',...await runChild(mode,settings)});
 const expected=JSON.stringify(comparable(runs[0])),outputsExact=runs.every(run=>JSON.stringify(comparable(run))===expected),allValid=runs.every(run=>run.allValid),cache=runs[1].phases.map(phase=>({phase:phase.name,...phase.cache}));
 const cacheBounded=cache.every(value=>Number.isInteger(value.entries)&&value.entries>0&&value.entries<=value.maxEntries&&Number.isFinite(value.bytes)&&value.bytes>0&&value.bytes<=value.maxBytes);
 return{diagnosticOnly:true,...settings,processOrder:'sequential A immutable original → B cached candidate → A immutable original-repeat; each arm is a new isolated Node process',outputsExact,allValid,cacheBounded,candidateCache:cache,runs,note:AUDIO_ENVELOPE_NOTE};
}
export function parseAudioCLIArgs(args){
 const options={sampleRate:48000,steadyCalls:300,seed:774,worker:null,out:null,help:false};
 for(let index=0;index<args.length;index++){const arg=args[index];if(arg==='--help'||arg==='-h'){options.help=true;continue;}if(!['--sample-rate','--steady-calls','--seed','--worker','--out'].includes(arg))throw Error('audio-envelope-unknown-option-'+arg);const value=args[++index];if(!value||value.startsWith('--'))throw Error('audio-envelope-option-value-required-'+arg);if(arg==='--worker'){if(!['original','cached'].includes(value))throw Error('audio-envelope-worker-mode-invalid');options.worker=value;}else if(arg==='--out')options.out=value;else{if(!/^\d+$/.test(value))throw Error('audio-envelope-integer-required-'+arg);options[arg==='--sample-rate'?'sampleRate':arg==='--steady-calls'?'steadyCalls':'seed']=Number(value);}}
 validateOptions(options);if(options.worker&&options.out)throw Error('audio-envelope-worker-cannot-write-output');return options;
}
const usage='Usage: node tools/qa-audio-envelope.mjs [--sample-rate 44100|48000|96000] [--steady-calls 1..3000] [--seed UINT32] [--out NEW_REPORT.json]\nDefault:16 unique common-duration cold calls, then300 seeded recipe calls at48000Hz. Optional96000Hz is a bounded-cache working-set diagnostic; steady does not imply every duration is cached. Three isolated original/cached/original processes run sequentially without forcedGC. --out exclusively creates a new file; no existing report/source can be overwritten. Exit0=exact PCM/RNG/graph+valid voices+bounded candidate cache; exit1=oracle/validity mismatch; exit2=CLI/I/O/worker error. Fake-node CPU/callwall is not native/browser audio or FPS evidence.';
export async function runAudioCLI(args,{stdout=value=>console.log(value),stderr=value=>console.error(value),runChild=spawnAudioWorker}={}){
 try{const options=parseAudioCLIArgs(args);if(options.help){stdout(usage);return 0;}const report=options.worker?await runAudioWorker(options.worker,options):await compareAudioEnvelope(options,runChild),text=JSON.stringify(report,null,2);if(options.out)await writeFile(resolve(options.out),text+'\n',{flag:'wx'});stdout(text);return options.worker?0:report.outputsExact&&report.allValid&&report.cacheBounded?0:1;}
 catch(error){stderr(JSON.stringify({diagnosticOnly:true,error:error?.message??String(error),usage}));return 2;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await runAudioCLI(process.argv.slice(2));
