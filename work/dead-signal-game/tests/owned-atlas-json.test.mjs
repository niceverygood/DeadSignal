import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ProductionArt,parseAtlasMetadata,validateAtlasMetadata} from '../dist/production-art.js';
import {productionManifest} from '../dist/production-manifest.js';
import {expeditionManifest} from '../dist/expedition-art.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const originalURL=new URL('../dist/production-art.js',import.meta.url);
const saved=await readFile(new URL('../../../qa/dense-combat-20261018/production-art-before-owned-json.txt',import.meta.url));
assert.equal(hash(saved),'b3c2aae00ce820449be98c82c17deb8d52623b01b018d9127d988e9f0337805f','independent oracle source remains byte exact');
const rewritten=saved.toString('utf8').replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,(_,before,path,after)=>before+new URL(path,originalURL).href+after).replace(/import\.meta\.url/g,JSON.stringify(originalURL.href));
const oracle=await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'));
const legacyParse=text=>oracle.validateAtlasMetadata(JSON.parse(text));

function smallMetadata(){return{
 format:'meshy-iso-sprite-atlas',version:1,atlas:{width:8,height:8,columns:1,rows:1,frameSize:8,directions:1,samples:1,order:'direction-major, sample-minor',transparent:true},
 projection:{azimuthDegrees:45,elevationDegrees:35.26438968275467,cameraScale:Math.sqrt(3/2),pixelsPerWorld:1,subjectHeight:1,footPivot:{x:0,y:7}},animation:null,
 frames:[{index:0,direction:0,sample:0,angle:0,rect:{x:0,y:0,width:8,height:8},footPivot:{x:0,y:7},alphaBounds:{x:1,y:1,width:3,height:5},outlineBounds:{x:0,y:0,width:5,height:7},coreBounds:null,clipped:false}]
};}
const text=JSON.stringify(smallMetadata());
const withExtra=extra=>text.slice(0,-1)+',"extra":'+extra+'}';
function outcome(operation){try{return{value:operation(),error:null};}catch(error){return{value:null,error};}}
function assertOutcome(actual,expected,label){
 if(expected.error){assert.ok(actual.error,label+' also rejects');assert.equal(actual.error.constructor,expected.error.constructor,label+' error constructor');assert.equal(actual.error.message,expected.error.message,label+' error message');}
 else{assert.equal(actual.error,null,label+' succeeds');assertTree(actual.value,expected.value,label);}
}
function assertTree(actual,expected,label){
 assert.deepStrictEqual(actual,expected,label+' full parsed data');
 const pending=[[actual,expected]];
 while(pending.length){
  const [a,b]=pending.pop();
  if(b!==null&&typeof b==='object'){
   assert.equal(Object.getPrototypeOf(a),Object.getPrototypeOf(b),label+' prototype');assert.equal(Object.isFrozen(a),true,label+' new node frozen');assert.equal(Object.isFrozen(b),true,label+' original node frozen');
   const keys=Reflect.ownKeys(b);assert.deepStrictEqual(Reflect.ownKeys(a),keys,label+' own key order');for(const key of keys)pending.push([a[key],b[key]]);
  }else assert.equal(Object.is(a,b),true,label+' exact scalar including signed zero');
 }
}

test('every unique original production and runtime-expedition metadata text has identical data, exact scalars, keys, prototypes and deeply frozen nodes',async t=>{
 const runtime=expeditionManifest(productionManifest),paths=new Set([...Object.values(productionManifest.assets),...Object.values(runtime.assets)].map(asset=>asset.metadata));assert.ok(paths.size>100,'complete production catalog is exercised');
 let checked=0;
 // One text and result pair per iteration; do not retain the full catalog trees.
 for(const path of paths){
  const url=new URL('../dist/assets/production/'+path,import.meta.url),bytes=await readFile(url),before=hash(bytes),content=bytes.toString('utf8');
  assertTree(parseAtlasMetadata(content),legacyParse(content),path);assert.equal(hash(await readFile(url)),before,path+' original source bytes unchanged');checked++;
 }
 assert.equal(checked,paths.size);t.diagnostic('Original unique metadata texts compared sequentially: '+checked);
});

test('owned JSON preserves original stringify canonicalization, JSON keys/prototypes, text coercion and malformed/deep rejection semantics',()=>{
 const cases=[text,withExtra('[-0,-1e-4000,1e-4000,1e400,-1e400,1.2345678901234567,null,true,"x"]'),
  text.replace('"x":0','"x":-0'),text.slice(0,-1)+',"__proto__":{"owned":true,"n":-0},"constructor":{"n":1e400},"toJSON":17}',
  withExtra('{"20":"twenty","2":"two","z":0,"a":1,"z":-0}'),withExtra('{"toJSON":{"nested":-0},"array":[{"toJSON":false}]}'),
  ...[1,127,128,129,512].map(depth=>withExtra('['.repeat(depth)+'-0'+']'.repeat(depth))),
  text.replace('"pixelsPerWorld":1','"pixelsPerWorld":1e400'),text.replace('"subjectHeight":1','"subjectHeight":-1e-4000'),
  '',undefined,'null','[]','{}','[1,]','{"format":','\ufeff'+text,text+' trailing'];
 for(const [i,content]of cases.entries())assertOutcome(outcome(()=>parseAtlasMetadata(content)),outcome(()=>legacyParse(content)),'JSON case'+i);
 const normalized=parseAtlasMetadata(cases[1]).extra;assert.equal(Object.is(normalized[0],0),true);assert.equal(Object.is(normalized[1],0),true);assert.equal(normalized[3],null);assert.equal(normalized[4],null);
 const proto=parseAtlasMetadata(cases[3]);assert.equal(Object.getPrototypeOf(proto),Object.prototype);assert.equal(Object.hasOwn(proto,'__proto__'),true);assert.equal(proto.__proto__.owned,true);assert.equal(Object.hasOwn(Object.prototype,'owned'),false);
 const deep=withExtra('['.repeat(20000)+'0'+']'.repeat(20000)),before=outcome(()=>legacyParse(deep)),after=outcome(()=>parseAtlasMetadata(deep));assert.ok(before.error instanceof RangeError,'original deep clone/freeze range limit is retained');assertOutcome(after,before,'deep RangeError');
 for(const parse of [legacyParse,parseAtlasMetadata]){
  let calls=0;const supplied={toString(){calls++;return text;}};assertTree(parse(supplied),legacyParse(text),'JSON text coercion');assert.equal(calls,1);assert.equal(Object.isFrozen(supplied),false);
 }
 assertOutcome(outcome(()=>parseAtlasMetadata(Symbol('text'))),outcome(()=>legacyParse(Symbol('text'))),'symbol coercion');
});

test('public arbitrary-object validator still clones without freezing callers and preserves getters, own toJSON, omissions, cycles and thrown identities',()=>{
 const marker=Error('caller-json-hook');
 const factories=[
  ()=>{const log=[],value=smallMetadata(),nested=Object.assign(Object.create({inherited:3}),{own:-0}),array=[,-0,undefined,()=>{},NaN];Object.defineProperty(value,'extra',{enumerable:true,get(){log.push('extra-get');return{nested,array};}});const height=value.projection.subjectHeight;Object.defineProperty(value.projection,'subjectHeight',{enumerable:true,get(){log.push('height-get');return height;}});return{value,log,external:[nested,array]};},
  ()=>{const log=[],value=Object.assign(Object.create({ignored:'inherited'}),smallMetadata());value.toJSON=function(key){log.push(['toJSON',key]);return{callerReplacement:true,n:-0};};return{value,log,external:[]};},
  ()=>{const log=[],value=smallMetadata();value.extra=Object.create(null);value.extra.value=-0;value.extra.toJSON=17;return{value,log,external:[value.extra]};},
  ()=>{const log=[],value=smallMetadata();value.toJSON=()=>{log.push('throws');throw marker;};return{value,log,external:[]};},
  ()=>{const log=[],value=smallMetadata();Object.defineProperty(value,'extra',{enumerable:true,get(){log.push('throws-get');throw marker;}});return{value,log,external:[]};},
  ()=>{const value=smallMetadata();value.extra=1n;return{value,log:[],external:[]};},
  ()=>{const value=smallMetadata();value.extra=value;return{value,log:[],external:[]};}
 ];
 for(const [i,factory]of factories.entries()){
  const before=factory(),after=factory(),expected=outcome(()=>oracle.validateAtlasMetadata(before.value)),actual=outcome(()=>validateAtlasMetadata(after.value));assertOutcome(actual,expected,'public validator case'+i);assert.deepStrictEqual(after.log,before.log,'getter/toJSON invocation order');
  if(expected.error===marker)assert.equal(actual.error,marker,'original user exception identity');
  for(const object of [after.value,after.value.projection,after.value.frames,...after.external])assert.equal(Object.isFrozen(object),false,'caller object is never frozen');
  if(actual.value)assert.notEqual(actual.value,after.value,'caller ownership is not adopted');
 }
});

function prototypeScenario(prototype,descriptorFactory,content){
 const prior=Object.getOwnPropertyDescriptor(prototype,'toJSON'),calls=[],marker=Error('inherited-json-hook');let result;
 try{Object.defineProperty(prototype,'toJSON',{configurable:true,enumerable:false,...descriptorFactory(calls,marker)});result={old:outcome(()=>legacyParse(content)),oldCalls:calls.splice(0),next:outcome(()=>parseAtlasMetadata(content)),nextCalls:calls.splice(0),marker};}
 finally{if(prior)Object.defineProperty(prototype,'toJSON',prior);else delete prototype.toJSON;}
 assert.deepStrictEqual(Object.getOwnPropertyDescriptor(prototype,'toJSON'),prior,'prototype descriptor is exactly restored even when a hook throws');return result;
}
test('inherited Object/Array toJSON getters, functions and noncallable values preserve the original observation and exception order with guaranteed descriptor restoration',()=>{
 const factories=[
  calls=>({value:function(key){calls.push(['call',key,Array.isArray(this)]);return this;},writable:true}),
  calls=>({get(){calls.push(['get',Array.isArray(this)]);return function(key){calls.push(['call',key,Array.isArray(this)]);return this;};}}),
  calls=>({get(){calls.push(['noncallable-get',Array.isArray(this)]);return 17;}}),
  ()=>({value:17,writable:true}),
  (calls,marker)=>({get(){calls.push('throw-get');throw marker;}}),
  (calls,marker)=>({value:function(){calls.push('throw-call');throw marker;},writable:true}),
  calls=>({value:function(key){calls.push(['transform',key,Array.isArray(this)]);return this.tag==='transform'?{replacement:-0}:this;},writable:true})
 ];
 for(const prototype of [Object.prototype,Array.prototype])for(const [i,factory]of factories.entries())for(const content of [withExtra('{"tag":"transform","n":-0,"items":[1,-0]}'),text.replace('"pixelsPerWorld":1','"pixelsPerWorld":1e400')]){
  const result=prototypeScenario(prototype,factory,content);assertOutcome(result.next,result.old,'inherited hook'+i);assert.deepStrictEqual(result.nextCalls,result.oldCalls,'JSON hook getter/call order remains original');if(result.old.error===result.marker)assert.equal(result.next.error,result.marker);
 }
});

const manifest={version:1,assets:{one:{metadata:'one/metadata.json',atlas:'one/atlas.png'}},characters:{},bosses:{},enemies:{},environment:{}};
async function observeLoad(Class,{forced=false,content=text,imageError=false,badDimensions=false,bodyTimeout=false}={}){
 const events=[],calls={fetch:0,images:0,src:[],parse:0};let art;
 class ImageFixture{constructor(){calls.images++;this.naturalWidth=badDimensions?9:8;this.naturalHeight=8;}set src(url){calls.src.push(url);queueMicrotask(()=>imageError?this.onerror?.():this.onload?.());}}
 art=new Class({manifest,baseURL:'https://atlas.example/assets/',forceLegacyMetadataParse:forced,timeoutMs:bodyTimeout?5:1000,ImageCtor:ImageFixture,fetchImpl:async()=>{calls.fetch++;return{ok:true,text:()=>bodyTimeout?new Promise(()=>{}):Promise.resolve(content)};},onChange:change=>events.push({...change})});
 if(typeof art.parseMetadata==='function'){const method=art.parseMetadata;art.parseMetadata=function(...args){assert.equal(this,art);assert.deepStrictEqual(args,[content]);calls.parse++;return method.apply(this,args);};}
 const result=await art.load('one'),record=art.records.get('one');return{result,events,calls,metadata:record.metadata,error:record.error,errorType:record.errorType??null,status:art.status('one')};
}
test('default and explicitly forced legacy loads retain parser boundary, errors, image allocation and timeout semantics; parseMetadata remains an ordinary instance-method seam',async()=>{
 const cases=[{}, {content:withExtra('[-0,1e400]')},{content:'{"bad":'},{content:text.replace('"pixelsPerWorld":1','"pixelsPerWorld":1e400')},{imageError:true},{badDimensions:true},{bodyTimeout:true},{content:' '.repeat(8*1024*1024+1)}];
 for(const options of cases){
  const expected=await observeLoad(oracle.ProductionArt,options);
  for(const forced of [false,true]){
   const actual=await observeLoad(ProductionArt,{...options,forced});assert.equal(actual.result,expected.result);assert.equal(actual.status,expected.status);assert.equal(actual.error,expected.error);assert.equal(actual.errorType,expected.errorType);assert.deepStrictEqual(actual.events,expected.events);assert.deepStrictEqual({...actual.calls,parse:0},expected.calls,'fetch/image call order and allocation boundary');
   if(expected.metadata)assertTree(actual.metadata,expected.metadata,'loaded atlas');else assert.equal(actual.metadata,null);
   assert.equal(actual.calls.parse,options.bodyTimeout||options.content?.length>8*1024*1024?0:1,'parse is called only after complete in-limit metadata text');
  }
 }
 const sentinel=legacyParse(text),marker=Error('parse-seam-error');
 for(const forced of [false,true]){
  let images=0;class ImageFixture{constructor(){images++;this.naturalWidth=this.naturalHeight=8;}set src(value){queueMicrotask(()=>this.onload?.());}}
  const art=new ProductionArt({manifest,baseURL:'https://atlas.example/',ImageCtor:ImageFixture,fetchImpl:async()=>({ok:true,text:async()=>text}),forceLegacyMetadataParse:forced});
  art.parseMetadata=function(content){assert.equal(this,art);assert.equal(content,text);return sentinel;};assert.equal(await art.load('one'),true);assert.equal(art.get('one').metadata,sentinel,'load commits the exact instance parser result');assert.equal(images,1);
  art.releaseUnusedAssets([]);art.parseMetadata=function(){assert.equal(this,art);throw marker;};assert.equal(await art.load('one'),false);assert.equal(art.records.get('one').error,marker.message);assert.equal(art.records.get('one').errorType,'Error');assert.equal(images,1,'parse exception cannot allocate another image');
 }
});

test('inherited validation fields preserve getter side effects and escapes without freezing captured inputs, retaining functions or changing original exceptions',()=>{
 const marker=Error('inherited-validation-field');
 const cases=[{mode:'undefined'},{mode:'finite'},{mode:'self-delete'},{mode:'throw'},{mode:'invalid-value'},
  {mode:'undefined',earlyInvalid:true},{mode:'undefined',lateInvalid:true},{mode:'structured',key:'weaponPose'},{mode:'structured-data',key:'weaponPose'}];
 function run(parse,entry){
  const key=entry.key||'frontYawRadians',prior=Object.getOwnPropertyDescriptor(Object.prototype,key),calls=[],captured=[],
   external={supported:true,desiredGripHeight:1,right:{position:{x:0,y:0,z:0},requested:{x:0,y:0,z:0},error:0,clamped:false},left:{position:{x:0,y:0,z:0},requested:{x:0,y:0,z:0},error:0,clamped:false},extraMutable:{value:-0}};
  let content=text;if(entry.earlyInvalid)content=content.replace('"pixelsPerWorld":1','"pixelsPerWorld":1e400');if(entry.lateInvalid)content=content.replace('"clipped":false','"clipped":true');
  const descriptor=entry.mode==='structured-data'?{configurable:true,enumerable:false,writable:true,value:external}:{configurable:true,enumerable:false,get(){
   calls.push(Object.keys(this));captured.push(this);this.extraFunction=()=>marker;this.sideNumber=-0;this.foreign=external;
   if(entry.mode==='self-delete')delete Object.prototype[key];
   if(entry.mode==='throw')throw marker;
   return entry.mode==='finite'?.25:entry.mode==='invalid-value'?Infinity:entry.mode==='structured'?external:undefined;
  }};
  let result;
  try{Object.defineProperty(Object.prototype,key,descriptor);result=outcome(()=>parse(content));}
  finally{if(prior)Object.defineProperty(Object.prototype,key,prior);else delete Object.prototype[key];}
  assert.deepStrictEqual(Object.getOwnPropertyDescriptor(Object.prototype,key),prior,'validation-field descriptor restored after every outcome');
  return{result,calls,captured,external};
 }
 for(const entry of cases){
  const before=run(legacyParse,entry),after=run(parseAtlasMetadata,entry);assertOutcome(after.result,before.result,'inherited validation '+entry.mode);assert.deepStrictEqual(after.calls,before.calls,'getter invocation count/order and own-key side effects');
  if(entry.earlyInvalid)assert.equal(after.calls.length,0,'earlier invalid required fields reject before invoking the inherited getter');
  else if(entry.mode!=='structured-data')assert.ok(after.calls.length>0,'the original inherited field is actually read');
  if(entry.mode==='self-delete')assert.equal(after.calls.length,1,'a getter deleting its descriptor cannot erase the remembered clone requirement');
  if(entry.mode==='throw'){assert.equal(before.result.error,marker);assert.equal(after.result.error,marker,'the original getter exception identity survives');}
  for(const observation of [before,after]){
   assert.equal(Object.isFrozen(observation.external),false,'foreign structured data remains caller-owned');assert.equal(Object.isFrozen(observation.external.extraMutable),false);
   for(const raw of observation.captured){assert.equal(Object.isFrozen(raw),false,'captured parsed projection/frame is not frozen by the legacy clone');assert.equal(typeof raw.extraFunction,'function','raw getter mutation remains observable');assert.equal(Object.is(raw.sideNumber,-0),true,'canonicalization does not edit an escaped raw object');assert.equal(raw.foreign,observation.external);}
   if(observation.result.value){
    const output=entry.key==='weaponPose'?observation.result.value.frames[0]:observation.result.value.projection;
    assert.equal(Object.hasOwn(output,'extraFunction'),false,'clone omits the getter-added enumerable function');
    if(observation.captured.length){assert.notEqual(output,observation.captured[0]);assert.equal(Object.is(output.sideNumber,0),true);assert.notEqual(output.foreign,observation.external);assert.equal(Object.isFrozen(output.foreign),true);}
    if(entry.key==='weaponPose')assert.equal(Object.hasOwn(output,'weaponPose'),false,'an inherited structured field is validated but never copied into JSON output');
   }
  }
 }
});
