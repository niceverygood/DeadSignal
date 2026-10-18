import {AudioSystem,audioNoiseEnvelopeStats} from './audio.js';
import {createQAStorage,isQAMemoryStorage} from './qa-storage.js';

export const AUDIO_BEFORE_SHA='b5ab39861cb4128e3fd2b97f5eb682b2390eee5dd20f916e85e81540727e405b';
export const AUDIO_ENVELOPE_NOTE='8851 genuine-memory QA only. Native OfflineAudioContext renders eight original noise-layer parameter sets with the same random sequence, filter, gain, panning and compressor. Input AudioBuffer PCM and native rendered output are compared separately and strictly, with original-repeat differences retained. A local createBuffer method shadow records only actual returned buffers; its identical wrapper/array-push overhead is included in all noise call timings. No channel reads or hashes occur inside those timings. Cold and warm phases use fresh AudioBuffers and fresh contexts on the same AudioSystem owner. Graph setup, offline rendering, hashes, PCM comparisons and cache snapshots are outside the intervals. These are noise-layer tests, not the full weapon mix, listening, device latency, normal FPS, process RAM or VRAM. No Game tick, persistent save, paid generation or reused random waveform is used.';
export const NOISE_RECIPES=Object.freeze([
 [.045,.12,3800,0,'lowpass'],[.24,.24,1100,0,'lowpass'],
 [.035,.28,4800,0,'lowpass'],[.48,.5,750,0,'lowpass'],
 [.18,.10,2100,.12,'lowpass'],[.09,.14,1450,0,'lowpass'],
 [.04,.18,3800,0,'highpass'],[.4,.25,1200,.025,'lowpass'],
].map(Object.freeze));

export function allowAudioEnvelopeQA(location,query){
 return location?.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&location.port==='8851'&&query?.has('qa')&&query.has('qa-memory')&&isQAMemoryStorage(createQAStorage(query));
}
export function seededNoiseCalls(callback,seed=774){
 const descriptor=Object.getOwnPropertyDescriptor(Math,'random');
 if(!descriptor||!('value'in descriptor)||!descriptor.writable)throw Error('audio-qa-random-override-unavailable');
 let state=seed>>>0,calls=0;
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;calls++;return state/4294967296;};
 Object.defineProperty(Math,'random',{...descriptor,value:random});
 try{
  const value=callback();if(value&&typeof value.then==='function')throw Error('audio-qa-synchronous-calls-required');
  return{value,random:{calls,state}};
 }finally{Object.defineProperty(Math,'random',descriptor);}
}
export function pcmDifference(first,next){
 if(first.length!==next.length)return{different:null,maxDelta:null,lengthMismatch:true};
 let different=0,maxDelta=0;
 for(let i=0;i<first.length;i++)if(!Object.is(first[i],next[i])){different++;maxDelta=Math.max(maxDelta,Math.abs(first[i]-next[i]));}
 return{different,maxDelta,lengthMismatch:false};
}
export function observeNoiseBuffers(context){
 const descriptor=Object.getOwnPropertyDescriptor(context,'createBuffer');
 if(descriptor&&!('value'in descriptor))throw Error('audio-qa-create-buffer-accessor');
 const original=context.createBuffer;if(typeof original!=='function')throw Error('audio-qa-create-buffer-required');
 const buffers=[];let stopped=false;
 const wrapped=function(...args){const result=original.apply(this,args);buffers.push(result);return result;};
 Object.defineProperty(context,'createBuffer',descriptor?{...descriptor,value:wrapped}:{value:wrapped,writable:true,configurable:true,enumerable:false});
 return{buffers,stop(){if(!stopped){stopped=true;if(Object.getOwnPropertyDescriptor(context,'createBuffer')?.value===wrapped){if(descriptor)Object.defineProperty(context,'createBuffer',descriptor);else delete context.createBuffer;}}return buffers;}};
}
async function sha(bytes){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function originalAudio(){
 const response=await fetch(new URL('./qa-audio-before-envelope.txt',import.meta.url));if(!response.ok)throw Error('audio-qa-original-source-missing');
 const bytes=await response.arrayBuffer();if(await sha(bytes)!==AUDIO_BEFORE_SHA)throw Error('audio-qa-original-source-changed');
 const rewritten=new TextDecoder().decode(bytes).replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,(_,before,path,after)=>before+new URL(path,new URL('./audio.js',import.meta.url)).href+after);
 const url=URL.createObjectURL(new Blob([rewritten],{type:'text/javascript'}));
 try{return(await import(url)).AudioSystem;}finally{URL.revokeObjectURL(url);}
}
async function phase(audio,rate){
 const context=new OfflineAudioContext(2,rate,rate),master=context.createGain(),compressor=context.createDynamicsCompressor();
 master.gain.value=.35;compressor.threshold.value=-12;compressor.knee.value=18;compressor.ratio.value=4;compressor.attack.value=.003;compressor.release.value=.12;
 master.connect(compressor);compressor.connect(context.destination);audio.ctx=context;audio.master=master;audio.perspective={pan:.35,gain:.7};
 const before=audioNoiseEnvelopeStats(audio),timings=[],observer=observeNoiseBuffers(context);let observed;
 try{observed=seededNoiseCalls(()=>{for(const args of NOISE_RECIPES){const start=performance.now();audio.noise(...args);timings.push(performance.now()-start);}},774);}finally{observer.stop();}
 const inputs=observer.buffers.map(buffer=>buffer.getChannelData(0).slice());observer.buffers.length=0;
 const inputHashes=await Promise.all(inputs.map(data=>sha(data.buffer)));
 const after=audioNoiseEnvelopeStats(audio),voicesCreated=audio.active,buffer=await context.startRendering();
 // Let the normal source onended callbacks release their original node graph.
 await new Promise(resolve=>setTimeout(resolve,0));
 const channels=[buffer.getChannelData(0).slice(),buffer.getChannelData(1).slice()];
 const hashes=await Promise.all(channels.map(data=>sha(data.buffer)));
 const report={sampleRate:rate,recipes:NOISE_RECIPES.length,noiseCallWallMs:timings.reduce((a,b)=>a+b,0),timings,random:observed.random,voicesCreated,activeAfterEnded:audio.active,cacheBefore:before,cacheAfter:after,inputPCMHashes:inputHashes,pcmHashes:hashes};
 audio.ctx=null;audio.master=null;return{report,channels,inputs};
}
export async function compareAudioEnvelopes({location=globalThis.location,query=new URLSearchParams(location?.search),sampleRate=48000,onProgress=()=>{}}={}){
 if(!allowAudioEnvelopeQA(location,query))throw Error('audio-envelope-memory-origin-required');
 if(![44100,48000,96000].includes(sampleRate))throw Error('audio-envelope-sample-rate-required');
 if(typeof OfflineAudioContext!=='function')throw Error('audio-envelope-offline-context-unavailable');
 const Original=await originalAudio(),runs=[],reference=[];
 for(const [arm,Class]of [['legacy',Original],['cached',AudioSystem],['legacy-repeat',Original]]){
  const audio=new Class(),phases=[];
  for(const name of ['cold','warm']){
   onProgress({arm,phase:name});const result=await phase(audio,sampleRate),index=name==='cold'?0:1;
   if(arm==='legacy')reference[index]={channels:result.channels,inputs:result.inputs};
   const difference=result.channels.map((channel,i)=>pcmDifference(reference[index].channels[i],channel));
   const inputDifference=result.inputs.length===reference[index].inputs.length?result.inputs.map((channel,i)=>pcmDifference(reference[index].inputs[i],channel)):[{different:null,maxDelta:null,lengthMismatch:true}];
   phases.push({phase:name,...result.report,inputDifference,difference});
  }
  runs.push({arm,phases});
 }
 const pcmExact=runs.every(run=>run.phases.every(p=>p.difference.every(d=>d.different===0&&!d.lengthMismatch)));
 const randomExact=runs.every(run=>run.phases.every((p,i)=>JSON.stringify(p.random)===JSON.stringify(runs[0].phases[i].random)));
 const inputPCMExact=runs.every(run=>run.phases.every(p=>p.inputDifference.length===NOISE_RECIPES.length&&p.inputDifference.every(d=>d.different===0&&!d.lengthMismatch)));
 return{originalSourceSha256:AUDIO_BEFORE_SHA,runs,inputPCMExact,pcmExact,randomExact,allVoicesReleased:runs.every(run=>run.phases.every(p=>p.voicesCreated===NOISE_RECIPES.length&&p.activeAfterEnded===0)),note:AUDIO_ENVELOPE_NOTE};
}
