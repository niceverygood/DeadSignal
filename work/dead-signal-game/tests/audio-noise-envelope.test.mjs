import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AudioSystem,audioNoiseEnvelopeStats} from '../dist/audio.js';

// The complete before module is the oracle, rather than a second implementation
// of noise(). Only its one relative import is relocated to the original module.
const originalURL=new URL('../dist/audio.js',import.meta.url);
const saved=await readFile(new URL('../../../qa/audio-envelope-20261018/audio-before-envelope.txt',import.meta.url));
assert.equal(createHash('sha256').update(saved).digest('hex'),'b5ab39861cb4128e3fd2b97f5eb682b2390eee5dd20f916e85e81540727e405b');
const originalImport="from './sound-perspective.js'";
assert.equal(saved.toString('utf8').split(originalImport).length,2);
const relocated=saved.toString('utf8').replace(originalImport,`from '${new URL('./sound-perspective.js',originalURL).href}'`);
const {AudioSystem:OriginalAudioSystem}=await import('data:text/javascript;base64,'+Buffer.from(relocated).toString('base64'));
const nativeFloat64Array=globalThis.Float64Array;

function withInstrumentation(seed,operation,{failAllocation=false}={}){
  const randomDescriptor=Object.getOwnPropertyDescriptor(Math,'random');
  const powDescriptor=Object.getOwnPropertyDescriptor(Math,'pow');
  const floatDescriptor=Object.getOwnPropertyDescriptor(globalThis,'Float64Array');
  const monitor={state:seed>>>0,randomCount:0,powCount:0,allocations:[],order:[],failRandomAt:0,failPowAt:0,marker:new Error('sample interruption')};
  Object.defineProperty(Math,'random',{...randomDescriptor,value(){
    monitor.randomCount++;if(monitor.order.length<16)monitor.order.push('random');
    if(monitor.randomCount===monitor.failRandomAt)throw monitor.marker;
    monitor.state=(Math.imul(monitor.state,1664525)+1013904223)>>>0;
    return monitor.state/0x100000000;
  }});
  Object.defineProperty(Math,'pow',{...powDescriptor,value(...args){
    monitor.powCount++;if(monitor.order.length<16)monitor.order.push('pow');
    if(monitor.powCount===monitor.failPowAt)throw monitor.marker;
    return Reflect.apply(powDescriptor.value,Math,args);
  }});
  // Observe optional array allocation, without retaining all curves or PCM.
  Object.defineProperty(globalThis,'Float64Array',{...floatDescriptor,value:class extends nativeFloat64Array{
    constructor(length){if(failAllocation)throw new RangeError('optional allocation failed');super(length);monitor.allocations.push(length);monitor.lastEnvelope=this;}
  }});
  try{return operation(monitor);}
  finally{
    Object.defineProperty(globalThis,'Float64Array',floatDescriptor);
    Object.defineProperty(Math,'pow',powDescriptor);
    Object.defineProperty(Math,'random',randomDescriptor);
  }
}

function context(sampleRate,{panner=true,compressor=true,state='running',bufferFailure=null,channelFailure=null}={}){
  const trace=[],nodes=[],buffers=[];let nextNode=0;
  const c={sampleRate,state,currentTime:1,destination:{id:'destination'},trace,nodes,buffers};
  function param(owner,name){let value=0;return{
    get value(){return value;},set value(next){value=next;trace.push(['value',owner,name,next]);},
    setValueAtTime(...args){trace.push(['setValueAtTime',owner,name,...args]);},
    exponentialRampToValueAtTime(...args){trace.push(['exponentialRampToValueAtTime',owner,name,...args]);},
    setTargetAtTime(...args){trace.push(['setTargetAtTime',owner,name,...args]);}
  };}
  function node(kind){
    const n={id:`n${++nextNode}`,kind,ended:false,disconnectCount:0};nodes.push(n);trace.push(['create',kind,n.id]);
    for(const name of ['gain','pan','frequency','threshold','knee','ratio','attack','release'])n[name]=param(n.id,name);
    n.connect=other=>trace.push(['connect',n.id,other.id]);
    n.disconnect=()=>{n.disconnectCount++;trace.push(['disconnect',n.id]);};
    n.start=(...args)=>trace.push(['start',n.id,...args]);n.stop=(...args)=>trace.push(['stop',n.id,...args]);
    for(const name of ['type','buffer']){let value;Object.defineProperty(n,name,{configurable:true,get(){return value;},set(next){value=next;trace.push(['property',n.id,name,name==='buffer'?next.id:next]);}});}
    return n;
  }
  c.createGain=()=>node('gain');c.createOscillator=()=>node('oscillator');
  c.createBiquadFilter=()=>node('filter');c.createBufferSource=()=>node('buffer-source');
  if(panner)c.createStereoPanner=()=>node('panner');
  if(compressor)c.createDynamicsCompressor=()=>node('compressor');
  c.createBuffer=(channels,length,rate)=>{
    trace.push(['createBuffer',channels,length,rate]);
    if(bufferFailure)throw bufferFailure;
    if(!Number.isSafeInteger(length)||length<=0||!Number.isFinite(rate)||rate<=0)throw new RangeError('invalid audio buffer');
    const b={id:`b${buffers.length+1}`,channels,length,sampleRate:rate,data:new Float32Array(length)};
    b.getChannelData=index=>{trace.push(['getChannelData',b.id,index]);if(channelFailure)throw channelFailure;return b.data;};
    buffers.push(b);return b;
  };
  c.resume=()=>{trace.push(['resume']);c.state='running';return{catch(){trace.push(['resume.catch']);}};};
  return c;
}

function fixture(System,sampleRate,options={}){
  const audio=new System(),contexts=[context(sampleRate,options)],c=contexts[0];
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{AudioContext:class{constructor(){return c;}}}});
  try{audio.unlock();audio.unlock();}finally{if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else delete globalThis.window;}
  audio.listener={x:10,y:20};
  const states=[];
  return{
    audio,contexts,states,
    mark(label){states.push({label,active:audio.active,voiceLimit:audio.voiceLimit,enabled:audio.enabled,volume:audio.volume,last:{...audio.last},perspective:{...audio.perspective}});},
    endAll(){for(const current of contexts)for(const n of current.nodes)if(n.onended&&!n.ended){n.ended=true;n.onended();}},
    replaceContext(rate,opts={}){const next=context(rate,opts);contexts.push(next);audio.ctx=next;audio.master=next.createGain();return next;},
    snapshot(){return{
      states,
      contexts:contexts.map(current=>({state:current.state,sampleRate:current.sampleRate,currentTime:current.currentTime,trace:current.trace,
        nodes:current.nodes.map(n=>({id:n.id,kind:n.kind,type:n.type,buffer:n.buffer?.id,onended:typeof n.onended,ended:n.ended,disconnectCount:n.disconnectCount,params:Object.fromEntries(['gain','pan','frequency','threshold','knee','ratio','attack','release'].map(name=>[name,n[name].value]))})),
        buffers:current.buffers.map(b=>({channels:b.channels,length:b.length,sampleRate:b.sampleRate,pcm:Buffer.from(b.data.buffer,b.data.byteOffset,b.data.byteLength)}))
      }))
    };}
  };
}

function captured(System,sampleRate,script,{seed=0x6d2b79f5,forceFresh=false,contextOptions={},...instrumentOptions}={}){
  return withInstrumentation(seed,monitor=>{
    const f=fixture(System,sampleRate,contextOptions);if(forceFresh)f.audio.forceFreshNoiseEnvelope=true;
    script(f,monitor);const snapshot=f.snapshot();
    return{snapshot,rng:{state:monitor.state,count:monitor.randomCount},powCount:monitor.powCount,allocations:[...monitor.allocations]};
  },instrumentOptions);
}
function assertEquivalent(actual,expected,label){
  assert.deepEqual(actual.rng,expected.rng,`${label}: random count and final state`);
  assert.equal(actual.snapshot.contexts.length,expected.snapshot.contexts.length,label);
  for(let i=0;i<actual.snapshot.contexts.length;i++){
    const a=actual.snapshot.contexts[i],b=expected.snapshot.contexts[i];
    assert.equal(a.buffers.length,b.buffers.length,`${label}: buffer count`);
    for(let j=0;j<a.buffers.length;j++){
      const {pcm:ap,...am}=a.buffers[j],{pcm:bp,...bm}=b.buffers[j];
      assert.deepEqual(am,bm,`${label}: buffer dimensions ${j}`);
      assert.equal(Buffer.compare(ap,bp),0,`${label}: Float32 PCM bytes ${j}`);
    }
    const {buffers:ab,...ag}=a,{buffers:bb,...bg}=b;
    assert.deepEqual(ag,bg,`${label}: graph, automation, filter, pan, delay and cleanup`);
  }
  assert.deepEqual(actual.snapshot.states,expected.snapshot.states,`${label}: play state`);
}

const variants=[
  ['shot',{weapon:'nailgun'}],['shot',{weapon:'shotgun'}],['shot',{}],['explosion',{}],['radio',{}],['lure',{}],['dash',{}],
  ['fire-throw',{}],['fire-fall',{}],['fire',{}],['hurt',{}],['kill',{}],['wall-hit',{material:'metal'}],['wall-hit',{material:'concrete'}],
  ['hit',{shielded:true,weapon:'shotgun',lethal:true}],['hit',{weapon:'nailgun'}],['hit',{weapon:'nailgun',lethal:true}],['hit',{weapon:'shotgun'}],['hit',{weapon:'shotgun',lethal:true}],
  ['reload',{weapon:'nailgun'}],['reload',{weapon:'shotgun'}],
  ...['retrieve','feed','seat','rack','unknown'].map(stage=>['reload-stage',{stage}]),
  ['loaded',{weapon:'nailgun'}],['loaded',{weapon:'shotgun'}],['shock',{}],
  ...['levelup','upgrade','heal','alarmclear','alarm','bosswarn','scream'].map(type=>[type,{}]),
  ['boss-wall',{material:'metal'}],['boss-wall',{material:'concrete'}],['charge',{}],['end',{result:{won:true}}],['end',{result:{won:false}}],['end',{}],['unknown',{}]
];

test('all original play branches retain exact PCM, random stream and voice graph at 44.1/48/96 kHz on cache miss, reuse and forced-original path',()=>{
  // Keep only one event's before/after buffers alive at a time.
  for(const rate of [44100,48000,96000])for(let i=0;i<variants.length;i++){
    const [type,data]=variants[i],label=`${rate}/${type}/${i}`;
    const script=f=>{
      for(let repeat=0;repeat<2;repeat++){
        f.audio.ctx.currentTime=1+repeat*2;f.audio.play(type,{x:240,y:-60,...data});f.mark(`played ${repeat}`);
        f.endAll();f.mark(`ended ${repeat}`);
      }
    };
    const before=captured(OriginalAudioSystem,rate,script);
    const after=captured(AudioSystem,rate,script);
    const forced=captured(AudioSystem,rate,script,{forceFresh:true});
    assertEquivalent(after,before,label);assertEquivalent(forced,before,`${label}/forced`);
    assert.equal(forced.powCount,before.powCount,`${label}: forced-original pow count`);
    assert.equal(forced.allocations.length,0,`${label}: forced-original has no envelope allocation`);
    if(before.rng.count)assert.ok(after.powCount<before.powCount,`${label}: repeat reuses doubles`);
  }
});

test('voice caps, throttle boundaries, mute/suspended state, missing panner and ended cleanup remain the original behavior',()=>{
  const script=f=>{
    const a=f.audio;
    for(let i=0;i<12;i++){a.ctx.currentTime+=.1;a.play('shot',{weapon:'shotgun',x:-400,y:500});}
    f.mark('gunfire cap');assert.equal(a.active,14);
    a.play('hurt');a.play('explosion');f.mark('reserved damage and explosion');assert.equal(a.active,20);
    a.ctx.currentTime+=.1;a.play('shot',{weapon:'shotgun'});a.play('bosswarn');f.mark('hard cap');assert.equal(a.active,22);
    a.noise(.1);a.tone(200);f.mark('direct cap');
    f.endAll();f.mark('all ended');assert.equal(a.active,0);
    for(const [type,limit] of [['hit',.07],['shot',.06],['kill',.1],['explosion',.08],['shock',.1],['scream',1],['wall-hit',.03],['radio',.03]]){
      a.ctx.currentTime+=3;const time=a.ctx.currentTime;
      a.play(type,{weapon:'nailgun',x:1e6,y:0});f.mark(`${type}/first`);f.endAll();
      a.play(type);f.mark(`${type}/same time`);
      a.ctx.currentTime=time+limit/2;a.play(type);f.mark(`${type}/below`);
      a.ctx.currentTime=time+limit;a.play(type);f.mark(`${type}/boundary`);f.endAll();
    }
    a.setEnabled(false);a.ctx.currentTime+=4;a.play('explosion');f.mark('muted');
    a.setEnabled(true);a.ctx.state='suspended';a.play('fire');f.mark('suspended');
    a.ctx.state='running';a.play('fire',{x:NaN,y:10});f.mark('invalid spatial source');f.endAll();
    a.noise(.025,.27,1200,-1,'highpass');a.tone(300,.04,'sine',.11,20,.13);f.mark('direct delay and filter');f.endAll();f.mark('final cleanup');
  };
  for(const options of [{},{panner:false,compressor:false},{state:'suspended'}]){
    const before=captured(OriginalAudioSystem,48000,script,{contextOptions:options});
    const after=captured(AudioSystem,48000,script,{contextOptions:options});
    assertEquivalent(after,before,JSON.stringify(options));
    assert.ok(after.snapshot.contexts.every(c=>c.nodes.filter(n=>n.onended==='function').every(n=>n.disconnectCount===1)));
  }
});

test('cached envelope stores exact Float64 decay only, saves actual pow calls, and survives context replacement without crossing AudioSystem owners',()=>{
  withInstrumentation(774,monitor=>{
    const f=fixture(AudioSystem,48000),a=f.audio,len=2160;
    const phase=()=>({random:monitor.randomCount,pow:monitor.powCount,allocations:monitor.allocations.length});
    const difference=before=>{const after=phase();return Object.fromEntries(Object.keys(after).map(key=>[key,after[key]-before[key]]));};
    let before=phase();a.noise(.045);assert.deepEqual(difference(before),{random:len,pow:len,allocations:1});f.endAll();
    assert.deepEqual(monitor.order.slice(0,8),['random','pow','random','pow','random','pow','random','pow']);
    const envelope=monitor.lastEnvelope;assert.ok(envelope instanceof nativeFloat64Array);assert.equal(envelope.byteLength,len*8);
    for(const i of [0,1,17,len-1])assert.ok(Object.is(envelope[i],Reflect.apply(Object.getOwnPropertyDescriptor(Math,'pow').value,Math,[1-i/len,1.8])));
    assert.ok(Reflect.ownKeys(envelope).every(key=>typeof key==='string'&&/^\d+$/.test(key)),'curve retains numeric elements without context, buffer or node fields');
    monitor.order.length=0;before=phase();a.noise(.045);assert.deepEqual(difference(before),{random:len,pow:0,allocations:0});f.endAll();assert.ok(monitor.order.every(v=>v==='random'));
    f.replaceContext(96000);before=phase();a.noise(.0225);assert.deepEqual(difference(before),{random:len,pow:0,allocations:0});f.endAll();
    a.forceFreshNoiseEnvelope=true;before=phase();a.noise(.0225);assert.deepEqual(difference(before),{random:len,pow:len,allocations:0});f.endAll();a.forceFreshNoiseEnvelope=false;
    const other=fixture(AudioSystem,96000);before=phase();other.audio.noise(.0225);assert.deepEqual(difference(before),{random:len,pow:len,allocations:1});other.endAll();
    assert.deepEqual(audioNoiseEnvelopeStats(a),{entries:1,bytes:len*8,maxEntries:24,maxBytes:1048576});
    assert.deepEqual(audioNoiseEnvelopeStats(other.audio),audioNoiseEnvelopeStats(a));
    const stats=audioNoiseEnvelopeStats(a);assert.ok(Object.isFrozen(stats));assert.ok(Object.values(stats).every(Number.isFinite));
    assert.deepEqual(Reflect.ownKeys(stats),['entries','bytes','maxEntries','maxBytes']);assert.ok(!Object.values(a).includes(envelope));
  });
  const switched=f=>{f.audio.noise(.045);f.endAll();f.replaceContext(96000);f.audio.noise(.0225,.21,4500,.075,'highpass');f.mark('new context');f.endAll();f.mark('ended');};
  assertEquivalent(captured(AudioSystem,48000,switched),captured(OriginalAudioSystem,48000,switched),'context replacement');
});

test('first-arrival admission never exceeds 24 curves or 1 MiB and full/oversized/invalid requests retain the original PCM path without churn',()=>{
  const fullScript=(f,monitor)=>{
    for(let length=1;length<=24;length++){f.audio.noise(length);f.endAll();}
    const stable=audioNoiseEnvelopeStats(f.audio),allocations=monitor.allocations.length,pow=monitor.powCount;
    assert.equal(stable.entries,24);assert.equal(stable.bytes,24*25/2*8);
    for(let repeat=0;repeat<3;repeat++){f.audio.noise(25);f.endAll();}
    assert.equal(monitor.powCount-pow,75);assert.equal(monitor.allocations.length,allocations);assert.deepEqual(audioNoiseEnvelopeStats(f.audio),stable);
    const warm=monitor.powCount;f.audio.noise(1);f.endAll();assert.equal(monitor.powCount,warm);assert.deepEqual(audioNoiseEnvelopeStats(f.audio),stable);
  };
  // Assertions above describe the optimized cache; the oracle executes the same
  // audio calls without cache assertions for a byte/graph/RNG comparison.
  const audioCalls=f=>{for(let length=1;length<=24;length++){f.audio.noise(length);f.endAll();}for(let i=0;i<3;i++){f.audio.noise(25);f.endAll();}f.audio.noise(1);f.endAll();};
  assertEquivalent(captured(AudioSystem,1,fullScript),captured(OriginalAudioSystem,1,audioCalls),'entry admission full');
  const byteScript=f=>{for(const length of [131071,2,2,131071,131073,131073,0,-1,NaN,Infinity]){f.audio.noise(length,.2,700,-2);f.endAll();}};
  const before=captured(OriginalAudioSystem,1,byteScript),after=captured(AudioSystem,1,(f,monitor)=>{
    byteScript(f);assert.deepEqual(audioNoiseEnvelopeStats(f.audio),{entries:1,bytes:131071*8,maxEntries:24,maxBytes:1048576});
    assert.deepEqual(monitor.allocations,[131071],'byte-full and oversized requests are rejected before optional array allocation');
    assert.equal(monitor.powCount,131071+4+131073*2,'cached large curve retained; uncached lengths use original pow');
  });
  assertEquivalent(after,before,'byte admission, oversized and invalid buffers');
});

test('optional allocation and interrupted generation failures preserve original samples/graph and never publish incomplete curves',()=>{
  const ordinary=f=>{for(let i=0;i<2;i++){f.audio.noise(.045,.17,3200,.025,'highpass');f.mark(`voice ${i}`);f.endAll();}};
  const before=captured(OriginalAudioSystem,44100,ordinary);
  const after=captured(AudioSystem,44100,(f,monitor)=>{ordinary(f);assert.equal(audioNoiseEnvelopeStats(f.audio).entries,0);assert.equal(monitor.powCount,Math.floor(44100*.045)*2);},{failAllocation:true});
  assertEquivalent(after,before,'optional Float64 allocation failure');
  for(const failure of ['random','pow']){
    const interrupted=(f,monitor)=>{
      monitor[failure==='random'?'failRandomAt':'failPowAt']=7;f.audio.noise(.025);f.mark('interrupted');
      if(f.audio instanceof AudioSystem)assert.equal(audioNoiseEnvelopeStats(f.audio).entries,0);
      monitor.failRandomAt=0;monitor.failPowAt=0;const pow=monitor.powCount;f.audio.noise(.025);f.mark('retry');
      assert.equal(monitor.powCount-pow,1200,'retry computes a complete curve');f.endAll();f.mark('ended');
    };
    assertEquivalent(captured(AudioSystem,48000,interrupted),captured(OriginalAudioSystem,48000,interrupted),`${failure} interrupted miss`);
  }
  for(const contextOptions of [{bufferFailure:new Error('buffer allocation')},{channelFailure:new Error('channel access')}]){
    const script=(f,monitor)=>{f.audio.noise(.045);f.mark('failed original buffer');assert.equal(monitor.randomCount,0);assert.equal(monitor.powCount,0);assert.equal(monitor.allocations.length,0);};
    assertEquivalent(captured(AudioSystem,48000,script,{contextOptions}),captured(OriginalAudioSystem,48000,script,{contextOptions}),'original buffer failure precedes optional work');
  }
  assert.equal(createHash('sha256').update(saved).digest('hex'),'b5ab39861cb4128e3fd2b97f5eb682b2390eee5dd20f916e85e81540727e405b');
});
