import test from 'node:test';
import assert from 'node:assert/strict';
import {observeMetadataParser,compareOwnedAtlasJSON,browserHeapSample} from '../dist/qa-owned-atlas-json.js';

test('parser observation retains original receiver, arguments, output/promise/throw identity, samples no input tree and restores its exact method descriptor',()=>{
 const marker=Error('original parse failure'),metadata=Object.freeze({frames:Object.freeze([Object.freeze({original:true})])}),promise=Promise.resolve(metadata),calls=[];
 const parse=function(...args){calls.push([this,args]);if(args[0]==='throw')throw marker;return args[0]==='promise'?promise:metadata;};
 const art=Object.create({parseMetadata:parse}),receiver={foreign:true};let time=0,heap=0;
 const observer=observeMetadataParser(art,{now:()=>time+=.5,memory:()=>({usedJSHeapSize:++heap})});
 assert.throws(()=>observeMetadataParser(art),/parser-already-observed/);
 assert.equal(art.parseMetadata.call(receiver,'original text',17),metadata);assert.equal(art.parseMetadata('promise'),promise);assert.throws(()=>art.parseMetadata('throw'),error=>error===marker);
 assert.equal(calls[0][0],receiver);assert.deepEqual(calls[0][1],['original text',17]);assert.equal(calls[1][0],art);
 const report=observer.stop();assert.equal(report.parseCalls,3);assert.equal(report.parseCallWallMs,1.5);assert.deepEqual(report.samples.map(s=>[s.characters,s.frames,s.threw]),[[13,1,false],[7,null,false],[5,null,true]]);
 assert.equal(Object.hasOwn(art,'parseMetadata'),false);assert.equal(art.parseMetadata,parse);assert.equal(observer.stop().samples,report.samples);
 for(const sample of report.samples)assert.deepEqual(Object.keys(sample),['characters','cpuCallWallMs','threw','frames','heapBefore','heapAfter']);
 const own={};Object.defineProperty(own,'parseMetadata',{value:parse,configurable:true,writable:false,enumerable:true});const descriptor=Object.getOwnPropertyDescriptor(own,'parseMetadata');const p=observeMetadataParser(own);assert.equal(own.parseMetadata('valid'),metadata);p.stop();assert.deepEqual(Object.getOwnPropertyDescriptor(own,'parseMetadata'),descriptor);
});

test('broken observation clocks and memory readers do not change parsing, external replacements survive and unsupported methods are not mutated',()=>{
 const metadata={frames:[]},art={parseMetadata:()=>metadata},original=art.parseMetadata;
 const observer=observeMetadataParser(art,{now(){throw Error('clock');},memory(){throw Error('memory');}});assert.equal(art.parseMetadata('text'),metadata);const sample=observer.samples[0];assert.equal(sample.cpuCallWallMs,null);assert.equal(sample.heapBefore,null);assert.equal(sample.heapAfter,null);
 const external=()=>({replacement:true});art.parseMetadata=external;observer.stop();assert.equal(art.parseMetadata,external);
 const readonly={};Object.defineProperty(readonly,'parseMetadata',{value:original,configurable:false,writable:false});const before=Object.getOwnPropertyDescriptors(readonly);assert.throws(()=>observeMetadataParser(readonly),TypeError);assert.deepEqual(Object.getOwnPropertyDescriptors(readonly),before);
 let getter=0;const accessor={};Object.defineProperty(accessor,'parseMetadata',{get(){getter++;return original;},configurable:true});assert.throws(()=>observeMetadataParser(accessor),/parser-accessor/);assert.equal(getter,0);
 assert.ok(browserHeapSample()===null||typeof browserHeapSample()==='object');
});

test('owned-loader browser comparison rejects user origin before reading renderer, creating assets or invoking load callbacks',async()=>{
 let reads=0,loads=0;const hostile=new Proxy({}, {get(){reads++;throw Error('renderer accessed');},getOwnPropertyDescriptor(){reads++;throw Error('renderer accessed');}}),location=new URL('http://localhost:8806/?qa&qa-memory=owned&qa-loop=1');
 await assert.rejects(compareOwnedAtlasJSON(hostile,hostile,{location,query:location.searchParams,beforeScenario(){loads++;}}),/enemy-grid-memory-origin-required/);assert.equal(reads,0);assert.equal(loads,0);
});
