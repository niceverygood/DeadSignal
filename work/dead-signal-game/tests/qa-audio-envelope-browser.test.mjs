import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {allowAudioEnvelopeQA,seededNoiseCalls,pcmDifference,observeNoiseBuffers,compareAudioEnvelopes,AUDIO_BEFORE_SHA} from '../dist/qa-audio-envelope.js';

test('offline audio comparison requires the genuine 8851 memory QA before source fetch or AudioContext access',async()=>{
 const original=globalThis.fetch;let fetches=0;globalThis.fetch=()=>{fetches++;throw Error('unexpected fetch');};
 try{for(const url of ['http://localhost:8806/?qa&qa-memory=1','http://localhost:8851/?qa','https://localhost:8851/?qa&qa-memory=1','http://example.com:8851/?qa&qa-memory=1']){const location=new URL(url);assert.equal(allowAudioEnvelopeQA(location,location.searchParams),false);await assert.rejects(compareAudioEnvelopes({location,query:location.searchParams}),/memory-origin-required/);}assert.equal(fetches,0);}
 finally{globalThis.fetch=original;}
 const location=new URL('http://localhost:8851/?qa&qa-memory=1');assert.equal(allowAudioEnvelopeQA(location,location.searchParams),true);
});
test('seeded noise observation preserves exact Math.random descriptor even on throws and rejects asynchronous callbacks',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Math,'random'),marker=Error('original');
 const a=seededNoiseCalls(()=>[Math.random(),Math.random(),Math.random()]),b=seededNoiseCalls(()=>[Math.random(),Math.random(),Math.random()]);assert.deepEqual(a,b);assert.equal(a.random.calls,3);
 assert.throws(()=>seededNoiseCalls(()=>{Math.random();throw marker;}),e=>e===marker);assert.deepEqual(Object.getOwnPropertyDescriptor(Math,'random'),descriptor);
 assert.throws(()=>seededNoiseCalls(()=>Promise.resolve()),/synchronous-calls-required/);assert.deepEqual(Object.getOwnPropertyDescriptor(Math,'random'),descriptor);
});
test('native offline browser oracle is the byte exact independent original; PCM comparison catches scalar and length differences',async()=>{
 const saved=await readFile(new URL('../../../qa/audio-envelope-20261018/audio-before-envelope.txt',import.meta.url)),served=await readFile(new URL('../dist/qa-audio-before-envelope.txt',import.meta.url));assert.equal(createHash('sha256').update(saved).digest('hex'),AUDIO_BEFORE_SHA);assert.deepEqual(served,saved);
 assert.deepEqual(pcmDifference(new Float32Array([0,.5]),new Float32Array([0,.5])),{different:0,maxDelta:0,lengthMismatch:false});assert.equal(pcmDifference(new Float32Array([0]),new Float32Array([-0])).different,1);assert.equal(pcmDifference([0],[0,1]).lengthMismatch,true);assert.equal(pcmDifference([0,.5],[0,.25]).maxDelta,.25);
});
test('actual buffer observer never reads channels in noise calls, preserves this/arguments/return/throws and restores exact method ownership',()=>{
 const marker=Error('buffer failure'),calls=[],buffer={getChannelData(){throw Error('untimed reads only');}},original=function(...args){calls.push([this,args]);if(args[1]===0)throw marker;return buffer;};
 const context=Object.create({createBuffer:original}),receiver={},observer=observeNoiseBuffers(context);assert.equal(context.createBuffer.call(receiver,1,17,48000),buffer);assert.throws(()=>context.createBuffer(1,0,48000),e=>e===marker);assert.deepEqual(calls[0],[receiver,[1,17,48000]]);assert.deepEqual(observer.buffers,[buffer]);assert.equal(observer.stop(),observer.buffers);assert.equal(Object.hasOwn(context,'createBuffer'),false);observer.stop();
 const own={};Object.defineProperty(own,'createBuffer',{value:original,writable:false,configurable:true,enumerable:true});const descriptor=Object.getOwnPropertyDescriptor(own,'createBuffer'),owned=observeNoiseBuffers(own);own.createBuffer(1,1,48000);owned.stop();assert.deepEqual(Object.getOwnPropertyDescriptor(own,'createBuffer'),descriptor);
 const external=()=>null,next=observeNoiseBuffers(context);context.createBuffer=external;next.stop();assert.equal(context.createBuffer,external);
});
