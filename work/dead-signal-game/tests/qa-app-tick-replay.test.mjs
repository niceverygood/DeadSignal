import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Game} from '../dist/engine.js';
import {AppLoopProbe} from '../dist/qa-app-loop.js';
import {replayAppTickTrace,validateAppTickTrace,parseReplayArgs,runReplayCLI,REPLAY_NOTE} from '../../../tools/qa-app-tick-replay.mjs';

// Actual Game and actual observer protocol, with cheap frame services and an
// injected clock. This establishes replay equality, never browser performance.
function recordedTrace(){
 const game=Game.restore(new Game({seed:774,missionId:'mission-01',weapon:'nailgun'}).snapshot(),{resumePlaying:true}),context={game,screen:null,lastFrame:1,accumulator:0,hidden:false},schedule=[7,8,0,7];let clock=0;
 const probe=new AppLoopProbe({read:()=>context,now:()=>clock+=.125,limit:schedule.length,maxCallbacks:schedule.length}),frame=probe.wrapFrame(function(now,index){context.lastFrame=now;for(let i=0;i<schedule[index];i++)game.tick(1/60,{moveX:0,moveY:0,aimX:1500,aimY:850,shoot:true,dash:false,molotov:false,lure:false,reload:false,fireMode:'manual'});game.drainEvents();});
 assert.equal(probe.start(),true);for(let i=0;i<schedule.length;i++)frame((i+1)*1000,i);const trace=probe.stop();assert.ok(trace.eventStream.length);assert.equal(Object.hasOwn(game,'tick'),false);assert.equal(Object.hasOwn(game,'drainEvents'),false);return trace;
}
const clockOptions=()=>{let clock=0;return {now:()=>clock+=.01,cpuUsage:previous=>previous?{user:1000,system:250}:{user:10,system:20}};};

test('original observer tick arguments, post-catchup drains, final checkpoint and both RNGs replay exactly without mutating trace input',()=>{
 const trace=recordedTrace(),before=JSON.stringify(trace),report=replayAppTickTrace(trace,clockOptions());assert.equal(report.exact,true);assert.equal(report.ticks,22);assert.equal(report.frames,4);assert.equal(report.events,trace.eventStream.length);assert.deepEqual(report.finalSnapshot,trace.finalSnapshot);assert.deepEqual(report.eventStream,trace.eventStream);assert.deepEqual(report.bootstrapEvents,[{type:'resume'}]);assert.ok(Object.values(report.checks).every(check=>check.exact&&check.firstDifference===null));assert.equal(report.metrics.cpuMs,1.25);assert.equal(report.frameTimings[2].tickCount,0);assert.equal(report.frameTimings[2].eventCount,0);assert.equal(JSON.stringify(trace),before);assert.match(REPLAY_NOTE,/not browser frame costs/);assert.match(REPLAY_NOTE,/pending event queue and navigation caches/);
});

test('checkpoint, RNG, frame and recorded-event mismatches are exposed strictly without changing HP, inventing drains or filtering events',()=>{
 const trace=recordedTrace();trace.finalSnapshot.player.hp--;trace.finalSnapshot.randomState^=1;trace.eventStream[0].type='intentionally changed recorded event';trace.samples.at(-1).after.hp--;const before=JSON.stringify(trace),report=replayAppTickTrace(trace,clockOptions());assert.equal(report.exact,false);assert.equal(report.checks.finalSnapshot.exact,false);assert.equal(report.checks.randomState.exact,false);assert.equal(report.checks.eventStream.exact,false);assert.equal(report.checks.frameContextsAndDrains.exact,false);assert.match(report.checks.eventStream.firstDifference.path,/\[0\]\.type/);assert.notEqual(report.finalSnapshot.player.hp,trace.finalSnapshot.player.hp);assert.equal(JSON.stringify(trace),before);
 const pending=recordedTrace();pending.eventStream.unshift({type:'resume'});pending.samples[0].eventCount++;const unfiltered=replayAppTickTrace(pending,clockOptions());assert.equal(unfiltered.exact,false,'an unrecorded initial queue cannot be reconstructed from a checkpoint');assert.equal(unfiltered.checks.eventStream.exact,false);assert.notDeepEqual(unfiltered.eventStream,pending.eventStream);
});

test('ambiguous event-drain evidence, invalid ordering/counts and unrestorable checkpoints fail instead of claiming an exact replay',()=>{
 for(const mode of ['multiple-drains','missing-drain','ticks','events','order','dt','checkpoint','paused']){const trace=recordedTrace();if(mode==='multiple-drains')trace.samples[0].stages['events.drain'].calls=2;if(mode==='missing-drain')delete trace.samples[0].stages['events.drain'];if(mode==='ticks')trace.samples[0].tickCount++;if(mode==='events')trace.samples[0].eventCount++;if(mode==='order')trace.tickSchedule[1].frame=3;if(mode==='dt')trace.tickSchedule[0].dt=NaN;if(mode==='checkpoint')trace.initialSnapshot.player.hp=-1;if(mode==='paused')trace.initialSnapshot.state='paused';assert.throws(()=>replayAppTickTrace(trace,clockOptions()),/app-replay-/,mode);}
 assert.throws(()=>validateAppTickTrace({}),/trace-shape/);
});

test('initial, final and every before/after context must contain real supported game fields before replay can claim context equality',()=>{
 for(const mode of ['initial-missing','final-empty','before-missing','after-empty','before-rng-missing','after-hp-invalid']){const trace=recordedTrace();if(mode==='initial-missing')delete trace.initialContext;if(mode==='final-empty')trace.finalContext={};if(mode==='before-missing')delete trace.samples[1].before;if(mode==='after-empty')trace.samples[2].after={};if(mode==='before-rng-missing')delete trace.samples[0].before.visualRandom;if(mode==='after-hp-invalid')trace.samples[0].after.hp='100';const before=JSON.stringify(trace);let replayClockCalls=0;assert.throws(()=>replayAppTickTrace(trace,{now(){replayClockCalls++;throw Error('replay started without context evidence');},cpuUsage(){replayClockCalls++;throw Error('replay started without context evidence');}}),/app-replay-original-game-context-(required|invalid)-/,mode);assert.equal(replayClockCalls,0,mode);assert.equal(JSON.stringify(trace),before,mode);}
});

test('CLI creates reports exclusively, preserves original evidence, reports mismatches as exit1 and invalid input/I/O as exit2',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'dead-signal-tick-replay-')),input=join(directory,'trace.json'),output=join(directory,'report.json'),mismatch=join(directory,'mismatch.json'),messages=[],errors=[];
 t.after(async()=>{for(const path of [input,output,mismatch])try{await unlink(path);}catch{}await rmdir(directory);});const trace=recordedTrace(),source=JSON.stringify(trace);await writeFile(input,source);const sinks={stdout:value=>messages.push(value),stderr:value=>errors.push(value)};
 assert.equal(await runReplayCLI([input,'--out',output],sinks),0);const originalReport=await readFile(output,'utf8');assert.equal(JSON.parse(originalReport).exact,true);assert.equal(await readFile(input,'utf8'),source);assert.equal(await runReplayCLI([input,'--out',output],sinks),2,'an existing report must not be overwritten');assert.equal(await readFile(output,'utf8'),originalReport);
 trace.finalSnapshot.player.hp--;await writeFile(mismatch,JSON.stringify(trace));assert.equal(await runReplayCLI([mismatch],sinks),1);assert.equal(JSON.parse(messages.at(-1)).exact,false);assert.equal(await runReplayCLI([join(directory,'missing.json')],sinks),2);assert.equal(await runReplayCLI(['--help'],sinks),0);assert.match(messages.at(-1),/--cpu-prof/);assert.ok(errors.length>=2);assert.throws(()=>parseReplayArgs([input,'--out',input]),/must-not-be-overwritten/);assert.throws(()=>parseReplayArgs([input,'--repeat','0']),/repeat-range/);assert.deepEqual(parseReplayArgs([input,'--repeat','2']),{input,out:null,repeat:2,help:false});
});
