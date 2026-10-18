import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {Game} from '../work/dead-signal-game/dist/engine.js';

export const REPLAY_NOTE='Diagnostic replay of recorded original Game.tick arguments and one observed event drain after each app callback. Restore/resume happen before timing; the bootstrap resume event is separated from the observation boundary. No renderer, interpolation, HUD, audio, browser scheduling or storage is executed. Node call-wall/CPU timings are not browser frame costs, GPU execution or presented FPS. Checkpoints omit initial particles/texts/links, shake/flash, the pending event queue and navigation caches; a later-time trace can therefore diverge. No UI actions, RNG correction, HP changes, synthetic invulnerability, automatic upgrade choices or numerical tolerances are applied. Exact means strict JSON structural equality (array order preserved); a mismatch is reported, never repaired. V8 CPU profiles also include import/restore/validation/reporting overhead outside the timed replay; distinguish those call trees from Game.tick.';

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const json=value=>JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?value.map(stable):plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))??'<undefined>').digest('hex');
const valueSummary=value=>Array.isArray(value)?{type:'array',length:value.length}:plain(value)?{type:'object',keys:Object.keys(value)}:value;
function firstDifference(expected,actual,path='$'){
 if(isDeepStrictEqual(expected,actual))return null;
 if(Array.isArray(expected)&&Array.isArray(actual)){
  const length=Math.max(expected.length,actual.length);
  for(let i=0;i<length;i++){if(i>=expected.length||i>=actual.length)return {path:path+'.length',expected:expected.length,actual:actual.length};const difference=firstDifference(expected[i],actual[i],`${path}[${i}]`);if(difference)return difference;}
 }else if(plain(expected)&&plain(actual)){
  for(const key of [...new Set([...Object.keys(expected),...Object.keys(actual)])]){
   if(!Object.hasOwn(expected,key)||!Object.hasOwn(actual,key))return {path:path+'.'+key,expected:Object.hasOwn(expected,key)?valueSummary(expected[key]):'<missing>',actual:Object.hasOwn(actual,key)?valueSummary(actual[key]):'<missing>'};
   const difference=firstDifference(expected[key],actual[key],path+'.'+key);if(difference)return difference;
  }
 }
 return {path,expected:valueSummary(expected),actual:valueSummary(actual)};
}
const comparison=(expected,actual)=>({exact:isDeepStrictEqual(expected,actual),expectedSha256:hash(expected),actualSha256:hash(actual),firstDifference:firstDifference(expected,actual)});
const gameContext=game=>({state:game.state,time:game.time,hp:game.player.hp,kills:game.kills,enemies:game.enemies.length,random:game.random.getState(),visualRandom:game.visualRandom.getState()});
const CONTEXT_FIELDS=['state','time','hp','kills','enemies','random','visualRandom'];
function validateGameContext(context,label){
 if(!plain(context)||CONTEXT_FIELDS.some(key=>!Object.hasOwn(context,key)))throw Error('app-replay-original-game-context-required-'+label);
 if(typeof context.state!=='string'||!context.state.length||!Number.isFinite(context.time)||context.time<0||!Number.isFinite(context.hp)||context.hp<0||!['kills','enemies'].every(key=>Number.isInteger(context[key])&&context[key]>=0)||!['random','visualRandom'].every(key=>Number.isInteger(context[key])&&context[key]>=0&&context[key]<=0xFFFFFFFF))throw Error('app-replay-original-game-context-invalid-'+label);
}
const comparableContext=(context,actual)=>Object.fromEntries(Object.keys(actual).filter(key=>Object.hasOwn(context??{},key)).map(key=>[key,context[key]]));
const actualContext=(context,actual)=>Object.fromEntries(Object.keys(actual).filter(key=>Object.hasOwn(context??{},key)).map(key=>[key,actual[key]]));

export function validateAppTickTrace(trace){
 if(!plain(trace)||!plain(trace.initialSnapshot)||!plain(trace.finalSnapshot)||!Array.isArray(trace.tickSchedule)||!Array.isArray(trace.eventStream)||!Array.isArray(trace.samples)||!trace.samples.length||trace.samples.length>160)throw Error('app-replay-original-trace-shape-required');
 if(trace.initialSnapshot.state!=='playing')throw Error('app-replay-playing-observation-boundary-required');
 validateGameContext(trace.initialContext,'initial');validateGameContext(trace.finalContext,'final');
 const frames=trace.samples.map((sample,index)=>{
  if(!plain(sample)||sample.frame!==index||!Number.isInteger(sample.tickCount)||sample.tickCount<0||!Number.isInteger(sample.eventCount)||sample.eventCount<0||sample.stages?.['events.drain']?.calls!==1)throw Error('app-replay-single-post-catchup-drain-evidence-required-frame-'+index);
  validateGameContext(sample.before,'before-frame-'+index);validateGameContext(sample.after,'after-frame-'+index);
  return {sample,ticks:[]};
 });
 if(trace.tickSchedule.length>10000)throw Error('app-replay-tick-schedule-limit');
 let previousFrame=-1;
 for(const tick of trace.tickSchedule){
  if(!plain(tick)||!Number.isInteger(tick.frame)||tick.frame<previousFrame||!frames[tick.frame]||!Number.isFinite(tick.dt)||tick.dt<=0||tick.dt>.12||!plain(tick.command))throw Error('app-replay-original-ordered-tick-arguments-required');
  previousFrame=tick.frame;frames[tick.frame].ticks.push({dt:tick.dt,command:json(tick.command)});
 }
 for(const {sample,ticks}of frames)if(sample.tickCount!==ticks.length)throw Error('app-replay-tick-count-mismatch-frame-'+sample.frame);
 if(frames.reduce((sum,{sample})=>sum+sample.eventCount,0)!==trace.eventStream.length)throw Error('app-replay-event-count-mismatch');
 return frames;
}

export function replayAppTickTrace(trace,{now=()=>performance.now(),cpuUsage=previous=>process.cpuUsage(previous)}={}){
 const schedule=validateAppTickTrace(trace),game=Game.restore(trace.initialSnapshot);
 if(!game)throw Error('app-replay-initial-checkpoint-not-restorable');
 // The observation begins after Continue/Resume. Its checkpoint says playing,
 // while the original restore API intentionally pauses it. Resume once, then
 // keep that bootstrap event separate instead of forging a recorded event.
 game.resume();const bootstrapEvents=game.drainEvents(),initial=gameContext(game),initialSnapshot=game.snapshot();
 const frames=[],eventStream=[],cpuStart=cpuUsage(),start=now();
 for(const {sample,ticks}of schedule){
  const before=gameContext(game),tickStart=now();
  for(const tick of ticks)game.tick(tick.dt,tick.command);
  const tickWallMs=now()-tickStart,drainStart=now(),events=game.drainEvents(),drainWallMs=now()-drainStart;
  eventStream.push(...json(events));frames.push({frame:sample.frame,tickCount:ticks.length,eventCount:events.length,tickWallMs,drainWallMs,before,after:gameContext(game),recordedTickWallMs:sample.stages?.['simulation.tick']?.cpuMs??null});
 }
 const loopWallMs=now()-start,cpuMicroseconds=cpuUsage(cpuStart),finalSnapshot=game.snapshot(),final=gameContext(game);
 const checks={initialSnapshot:comparison(trace.initialSnapshot,initialSnapshot),initialContext:comparison(comparableContext(trace.initialContext,initial),actualContext(trace.initialContext,initial)),finalSnapshot:comparison(trace.finalSnapshot,finalSnapshot),randomState:comparison(trace.finalSnapshot.randomState,game.random.getState()),visualRandomState:comparison(trace.finalSnapshot.visualRandomState,game.visualRandom.getState()),finalContext:comparison(comparableContext(trace.finalContext,final),actualContext(trace.finalContext,final)),eventStream:comparison(trace.eventStream,eventStream)};
 const expectedFrames=schedule.map(({sample})=>({frame:sample.frame,tickCount:sample.tickCount,eventCount:sample.eventCount,before:comparableContext(sample.before,initial),after:comparableContext(sample.after,initial)}));
 const observedFrames=frames.map(frame=>({frame:frame.frame,tickCount:frame.tickCount,eventCount:frame.eventCount,before:actualContext(trace.samples[frame.frame].before,frame.before),after:actualContext(trace.samples[frame.frame].after,frame.after)}));
 checks.frameContextsAndDrains=comparison(expectedFrames,observedFrames);
 return {diagnosticOnly:true,exact:Object.values(checks).every(check=>check.exact),frames:frames.length,ticks:trace.tickSchedule.length,events:eventStream.length,bootstrapEvents,bootstrapPolicy:'Original restore() pauses a playing checkpoint; resume() is called once and its bootstrap event is drained outside the recorded observation. The prior pending event queue is not present in the checkpoint. No event is inserted into or removed from the compared recorded stream.',checks,metrics:{loopWallMs,cpuMs:(cpuMicroseconds.user+cpuMicroseconds.system)/1000,cpuMicroseconds,timingScope:'Recorded Game.tick loops, one original drain per callback, recorded-event JSON copies, clock reads and small per-frame observation records only. Restore, input validation/cloning, final checkpoint, comparisons, hashing and output are outside this interval. No warmup is added.'},frameTimings:frames,finalSnapshot,eventStream,note:REPLAY_NOTE};
}

export function parseReplayArgs(args){
 const options={input:null,out:null,repeat:1,help:false};
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(arg==='--help'||arg==='-h'){options.help=true;continue;}
  if(arg==='--out'||arg==='--repeat'){const value=args[++i];if(!value||value.startsWith('--'))throw Error('app-replay-option-value-required-'+arg);if(arg==='--out')options.out=value;else{options.repeat=Number(value);if(!Number.isInteger(options.repeat)||options.repeat<1||options.repeat>100)throw Error('app-replay-repeat-range-1-to-100');}continue;}
  if(arg.startsWith('-')||options.input)throw Error('app-replay-unexpected-argument-'+arg);options.input=arg;
 }
 if(!options.help&&!options.input)throw Error('app-replay-trace-path-required');
 if(options.input&&options.out&&resolve(options.input)===resolve(options.out))throw Error('app-replay-input-must-not-be-overwritten');
 return options;
}
const usage='Usage: node [--cpu-prof --cpu-prof-dir=NEW_DIRECTORY] tools/qa-app-tick-replay.mjs TRACE.json [--repeat 1..100] [--out NEW_REPORT.json]\nV8 flags belong before this script. Each repeat restores the same original checkpoint independently; none is a warmup. --out creates a new file exclusively and never overwrites trace evidence. Exit 0: exact; 1: observed mismatch; 2: unsupported input or I/O error.';
export async function runReplayCLI(args,{stdout=value=>console.log(value),stderr=value=>console.error(value)}={}){
 try{
  const options=parseReplayArgs(args);if(options.help){stdout(usage);return 0;}
  const text=await readFile(options.input,'utf8');if(Buffer.byteLength(text)>16*1024*1024)throw Error('app-replay-trace-exceeds-16-MiB');const trace=JSON.parse(text),runs=[];
  for(let i=0;i<options.repeat;i++)runs.push({run:i+1,...replayAppTickTrace(trace)});
  const report={input:resolve(options.input),repeat:options.repeat,exact:runs.every(run=>run.exact),runs,note:REPLAY_NOTE},output=JSON.stringify(report,null,2);
  if(options.out)await writeFile(options.out,output+'\n',{flag:'wx'});stdout(output);return report.exact?0:1;
 }catch(error){stderr(JSON.stringify({diagnosticOnly:true,error:error?.message??String(error),usage}));return 2;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await runReplayCLI(process.argv.slice(2));
