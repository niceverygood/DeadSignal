import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as production from '../dist/projection.js';

const ORIGINAL_SHA256='b7f066e335fcd89c7cf67fc523b1e62b3094ca0a61cd438bf21c822edeb42082';
const CANDIDATE_SHA256='64a0b970e58c6c082e4256ecfd47b41b3bc672b1740a7cd11f74f7154bb1dee9';
const originalBytes=readFileSync(new URL('../../../qa/dense-cpu-next-20261018/projection-before-ground-depth.txt',import.meta.url));
const candidateBytes=readFileSync(new URL('../../../qa/dense-cpu-next-20261018/projection-candidate-ground-depth.txt',import.meta.url));
assert.equal(createHash('sha256').update(originalBytes).digest('hex'),ORIGINAL_SHA256,'Only the independently captured pre-edit projection module is an oracle');
assert.equal(createHash('sha256').update(candidateBytes).digest('hex'),CANDIDATE_SHA256,'The unadopted QA candidate is independently byte-frozen');
const original=await import('data:text/javascript;base64,'+originalBytes.toString('base64'));
const candidate=await import('data:text/javascript;base64,'+candidateBytes.toString('base64'));
const {ISO_C,ISO_S,project,projectGroundDepth,unproject,screenVectorToWorld}=candidate;

function bits(value){const buffer=new ArrayBuffer(8),view=new DataView(buffer);view.setFloat64(0,value,false);return view.getBigUint64(0,false).toString(16).padStart(16,'0');}
function fromBits(value){const view=new DataView(new ArrayBuffer(8));view.setBigUint64(0,value,false);return view.getFloat64(0,false);}
function exact(actual,expected,label){assert.equal(Object.is(actual,expected),true,label+' Object.is');assert.equal(bits(actual),bits(expected),label+' Float64 bits');}
function exactPoint(actual,expected,label){assert.deepEqual(Object.keys(actual),Object.keys(expected),label+' shape');exact(actual.x,expected.x,label+' x');exact(actual.y,expected.y,label+' y');}
function outcome(fn){try{return{returned:true,value:fn()};}catch(error){return{returned:false,error};}}
function compareOperands(make,label){
 // This API always requests ground z=default0; extra caller arguments cannot
 // turn a sorting depth into an elevated projection.
 const aLog=[],bLog=[],aArgs=make(aLog),bArgs=make(bLog),a=outcome(()=>original.project(aArgs[0],aArgs[1]).y),b=outcome(()=>projectGroundDepth(...bArgs));
 assert.deepEqual(bLog,aLog,label+' conversion/getter order');assert.equal(b.returned,a.returned,label+' return/throw');
 if(a.returned)exact(b.value,a.value,label);else{assert.equal(b.error.constructor,a.error.constructor,label+' error class');assert.equal(b.error.name,a.error.name,label+' error name');assert.equal(b.error.message,a.error.message,label+' error message');}
 return{a,b,log:aLog};
}

test('SHA-frozen QA candidate and original remain independent while existing production projection behavior stays unchanged',()=>{
 assert.equal(originalBytes.length,527);assert.equal(createHash('sha256').update(originalBytes).digest('hex'),ORIGINAL_SHA256);assert.equal(Object.hasOwn(original,'projectGroundDepth'),false);
 assert.equal(candidateBytes.length,807);assert.equal(createHash('sha256').update(candidateBytes).digest('hex'),CANDIDATE_SHA256);assert.equal(Object.hasOwn(candidate,'projectGroundDepth'),true);
 exact(ISO_C,original.ISO_C,'ISO_C');exact(ISO_S,original.ISO_S,'ISO_S');assert.equal(project.toString(),original.project.toString());assert.equal(unproject.toString(),original.unproject.toString());assert.equal(screenVectorToWorld.toString(),original.screenVectorToWorld.toString());
 exact(production.ISO_C,original.ISO_C,'production ISO_C');exact(production.ISO_S,original.ISO_S,'production ISO_S');
 assert.equal(production.project.toString(),original.project.toString());assert.equal(production.unproject.toString(),original.unproject.toString());assert.equal(production.screenVectorToWorld.toString(),original.screenVectorToWorld.toString());
 assert.equal(projectGroundDepth.length,2);assert.equal(project.length,2);assert.equal(unproject.length,2);
});

test('ground depth preserves Object.is and Float64 bits across the complete cross-product of representative numeric classes',()=>{
 const positiveBits=[0n,1n,2n,0x000fffffffffffffn,0x0010000000000000n,0x0010000000000001n,0x3c90000000000000n,0x3ca0000000000000n,0x3fdfffffffffffffn,0x3fe0000000000000n,0x3fefffffffffffffn,0x3ff0000000000000n,0x3ff0000000000001n,0x4000000000000000n,0x433fffffffffffffn,0x4340000000000000n,0x4340000000000001n,0x7fd0000000000000n,0x7feffffffffffffen,0x7fefffffffffffffn,0x7ff0000000000000n,0x7ff8000000000000n,0x7ff8000000000042n,0x7ff0000000000001n];
 const values=positiveBits.flatMap(value=>[fromBits(value),fromBits(value|0x8000000000000000n)]);
 values.push(49,930,1200,1800,2400,.1,.3,1/60,-1/60,Number.MAX_SAFE_INTEGER,Number.MIN_SAFE_INTEGER);
 for(let x=0;x<values.length;x++)for(let y=0;y<values.length;y++)exact(projectGroundDepth(values[x],values[y]),original.project(values[x],values[y]).y,`numeric[${x},${y}]`);
 exact(projectGroundDepth(-0,-0),-0,'negative-zero ground');exact(projectGroundDepth(-0,0),0,'mixed-zero ground');exact(projectGroundDepth(Number.MIN_VALUE,0),0,'subnormal underflow');exact(projectGroundDepth(Number.MAX_VALUE,Number.MAX_VALUE),Infinity,'addition overflow remains before scale');
});

test('seeded finite Float64 pairs and cancellation boundaries retain the original add/multiply/subtract order',()=>{
 let state=0x5ab19837;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
 for(let i=0;i<2048;i++){
  const xBits=(BigInt(next())<<32n)|BigInt(next()),yBits=(BigInt(next())<<32n)|BigInt(next());
  const x=fromBits((xBits&~0x7ff0000000000000n)|(BigInt(i%2047)<<52n)),y=fromBits((yBits&~0x7ff0000000000000n)|(BigInt((i*23)%2047)<<52n));
  exact(projectGroundDepth(x,y),original.project(x,y).y,'finite pair '+i);exact(projectGroundDepth(x,-x),original.project(x,-x).y,'cancellation '+i);
 }
});

test('missing/default arguments, primitive non-numbers, BigInt/Symbol and wrapped values preserve the full original project fallback',()=>{
 const primitives=[undefined,null,false,true,'','0','-0','12.75','1e309','not-a-number',0n,1n,-1n,Symbol('coordinate')];
 for(let i=0;i<primitives.length;i++)for(const other of [0,-0,2,undefined,null,'4',1n])compareOperands(()=>[primitives[i],other],`primitive x${i}/${typeof other}`);
 for(let i=0;i<primitives.length;i++)compareOperands(()=>[2,primitives[i]],'primitive y'+i);
 for(const args of [[],[1],[undefined,undefined],[null,null],[1,2,900],[1,2,undefined]])compareOperands(()=>args,'arguments length '+args.length+'/'+args.map(value=>typeof value).join(','));
 for(const make of [()=>new Number(-0),()=>new Number(12.5),()=>new String('7'),()=>Object(2n),()=>Object(Symbol('wrapped')),()=>[],()=>[3],()=>[3,4],()=>({}),()=>Object.create(null)]){
  compareOperands(()=>[make(),2],'wrapped/object x');compareOperands(()=>[2,make()],'wrapped/object y');
 }
});

test('non-number fallback retains ToPrimitive hints, getter reads and left-to-right throws from the otherwise discarded horizontal calculation',()=>{
 const result=compareOperands(log=>{
  const operand=(name,numberValue,defaultValue)=>({get [Symbol.toPrimitive](){log.push(name+'.get@@toPrimitive');return hint=>{log.push(name+'.call:'+hint);return hint==='number'?numberValue:defaultValue;};}});
  return[operand('x',5,'6'),operand('y',2,'7')];
 },'hints');assert.deepEqual(result.log,['x.get@@toPrimitive','x.call:number','y.get@@toPrimitive','y.call:number','x.get@@toPrimitive','x.call:default','y.get@@toPrimitive','y.call:default']);exact(result.b.value,33.5,'string addition remains before numeric scale');
 compareOperands(log=>{
  const operand=name=>({get [Symbol.toPrimitive](){log.push(name+'.get@@toPrimitive');return undefined;},get valueOf(){log.push(name+'.getValueOf');return()=>{log.push(name+'.valueOf');return {};};},get toString(){log.push(name+'.getToString');return()=>{log.push(name+'.toString');return name==='x'?'8':'2';};}});
  return[operand('x'),operand('y')];
 },'ordinary conversion getters');
 for(const stop of ['x.number','y.number','x.default','y.default']){
  const marker=Error('exact '+stop),checked=compareOperands(log=>{
   const operand=name=>({get [Symbol.toPrimitive](){log.push(name+'.getter');return hint=>{const at=name+'.'+hint;log.push(at);if(at===stop)throw marker;return 3;};}});
   return[operand('x'),operand('y')];
  },'throw '+stop);assert.equal(checked.a.error,marker);assert.equal(checked.b.error,marker);
 }
 const getterMarker=Error('getter failure'),getter=compareOperands(log=>[{get [Symbol.toPrimitive](){log.push('x.getter');throw getterMarker;}},{get [Symbol.toPrimitive](){log.push('y.must-not-read');return()=>2;}}],'throwing getter');assert.equal(getter.b.error,getterMarker);assert.deepEqual(getter.log,['x.getter']);
 compareOperands(log=>[{get [Symbol.toPrimitive](){log.push('non-callable getter');return 42;}},2],'non-callable @@toPrimitive');
 compareOperands(log=>[{[Symbol.toPrimitive](hint){log.push('x:'+hint);return 1n;}},{[Symbol.toPrimitive](hint){log.push('y:'+hint);return 2n;}}],'BigInt horizontal multiplication throws before default hints');
 compareOperands(log=>[{[Symbol.toPrimitive](hint){log.push('x:'+hint);return Symbol('primitive');}},{[Symbol.toPrimitive](hint){log.push('y:'+hint);return 2;}}],'Symbol subtraction throws before y conversion');
});

test('helper calls leave original project/unproject/vector results and caller-owned conversion objects unchanged',()=>{
 const points=[[0,0],[-0,-0],[Number.MIN_VALUE,-Number.MIN_VALUE],[1200,930],[-150.75,1820.5],[Number.MAX_VALUE,Number.MAX_VALUE],[Infinity,-Infinity],[NaN,3]];
 for(const [x,y]of points)for(const z of [undefined,0,-0,14,22,260,null]){
  const projectedBefore=project(x,y,z),inverseBefore=unproject(x,y,z);projectGroundDepth(x,y);
  exactPoint(project(x,y,z),original.project(x,y,z),'project '+bits(x)+'/'+bits(y));exactPoint(unproject(x,y,z),original.unproject(x,y,z),'unproject '+bits(x)+'/'+bits(y));exactPoint(project(x,y,z),projectedBefore,'project unchanged after helper');exactPoint(unproject(x,y,z),inverseBefore,'unproject unchanged after helper');exactPoint(production.project(x,y,z),original.project(x,y,z),'production project');exactPoint(production.unproject(x,y,z),original.unproject(x,y,z),'production unproject');
 }
 for(const [x,y]of [[0,0],[-0,-0],[1,-1],[.3,.7],[-.2,0],[Infinity,1],[NaN,2]]){exactPoint(screenVectorToWorld(x,y),original.screenVectorToWorld(x,y),'vector unchanged');exactPoint(production.screenVectorToWorld(x,y),original.screenVectorToWorld(x,y),'production vector');}
 const x=Object.freeze({valueOf(){return 3;}}),y=Object.freeze({valueOf(){return 5;}}),xKeys=Reflect.ownKeys(x),yKeys=Reflect.ownKeys(y);exact(projectGroundDepth(x,y),original.project(x,y).y,'frozen conversion objects');assert.deepEqual(Reflect.ownKeys(x),xKeys);assert.deepEqual(Reflect.ownKeys(y),yKeys);assert.equal(Object.isFrozen(x),true);assert.equal(Object.isFrozen(y),true);
});
