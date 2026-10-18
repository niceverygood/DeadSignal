import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {ROOF_SURFACE} from '../../work/dead-signal-game/dist/rooftop-world.js';

export const ORIGINAL_NAVIGATION_SHA256='549e01276b6b670234df5c80507ef30b8f1ec1513be8477281e59b38e21367d9';
export const CANDIDATE_NAVIGATION_SHA256='79e3e9d0a15b4d3f1ed12a68b3781379cfb00f51708a4ff9ddad9815b3b5e284';
export const NAVIGATION_SCALAR_NOTE='QA candidate only; production Navigation remains unchanged. The immutable full original and candidate retain their original relative roof import bytes. Always rebase those specifiers to the actual dist/navigation.js URL before dataURL loading; candidate-navigation.mjs is source evidence, not a directly importable standalone module. Two changes only: local-number swap instead of array destructuring, and one radius squared after the existing LOS bounds for primitive numbers; non-number private-call radius keeps the original per-obstacle multiplication and coercion order. Exact numeric/point/rect getter tests assume ordinary Math and Array intrinsics. Deliberately overridden global array iteration is separately demonstrated to differ, since the original destructuring invokes that iterator; universal monkeypatch equivalence is not claimed. This oracle has no Game ticks, renderer, browser, GPU, performance timing or pass claim until actually run.';
const baseURL=new URL('../../work/dead-signal-game/dist/navigation.js',import.meta.url),hash=value=>createHash('sha256').update(value).digest('hex');
const oldSwap='if (first > last) [first, last] = [last, first];';
const newSwap='if (first > last) { const swap = first; first = last; last = swap; }';
const oldBounds='    const minY = Math.min(from.y, target.y) - radius, maxY = Math.max(from.y, target.y) + radius;';
const newBounds=oldBounds+'\n    const numericRadius = typeof radius === \'number\', r2 = numericRadius ? radius * radius : null;';
const oldTest='segmentRectDistanceSquared(from, target, rect) < radius * radius';
const newTest='segmentRectDistanceSquared(from, target, rect) < (numericRadius ? r2 : radius * radius)';

export async function loadNavigationScalarSources(){
 const originalBytes=await readFile(new URL('./current-navigation.txt',import.meta.url)),candidateBytes=await readFile(new URL('./candidate-navigation.mjs',import.meta.url));
 assert.equal(hash(originalBytes),ORIGINAL_NAVIGATION_SHA256,'frozen full original changed');assert.equal(hash(candidateBytes),CANDIDATE_NAVIGATION_SHA256,'QA candidate changed');
 const original=originalBytes.toString('utf8'),candidate=candidateBytes.toString('utf8');
 for(const old of [oldSwap,oldBounds,oldTest])assert.equal(original.split(old).length-1,1,'one approved source match');
 assert.equal(candidate,original.replace(oldSwap,newSwap).replace(oldBounds,newBounds).replace(oldTest,newTest),'only the approved scalar changes');
 assert.equal(candidate.replace(newSwap,oldSwap).replace(newBounds,oldBounds).replace(newTest,oldTest),original,'independent full-source inverse');
 return {original,candidate,originalSha256:hash(originalBytes),candidateSha256:hash(candidateBytes),originalBytes:originalBytes.length,candidateBytes:candidateBytes.length};
}
export function navigationScalarModuleURL(source,{exposeInternals=false}={}){
 const relocated=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_match,_quote,specifier)=>'from '+JSON.stringify(new URL(specifier,baseURL).href)).replaceAll('import.meta.url',JSON.stringify(baseURL.href));
 const suffix=exposeInternals?'\nexport const __qaNavigationInternals={segmentIntersectsRect,segmentRectDistanceSquared};\n':'';
 return 'data:text/javascript;base64,'+Buffer.from(relocated+suffix).toString('base64');
}
export async function loadNavigationScalarModules(){const sources=await loadNavigationScalarSources();const original=await import(navigationScalarModuleURL(sources.original,{exposeInternals:true})),candidate=await import(navigationScalarModuleURL(sources.candidate,{exposeInternals:true}));return{sources,original,candidate};}

function exactNumber(actual,expected,label='number'){
 assert.ok(Object.is(actual,expected),label+': Object.is');const a=Buffer.allocUnsafe(8),b=Buffer.allocUnsafe(8);a.writeDoubleLE(actual);b.writeDoubleLE(expected);assert.deepEqual(a,b,label+': Float64 bits');
}
function vector(actual,expected,label){exactNumber(actual.x,expected.x,label+' x');exactNumber(actual.y,expected.y,label+' y');}
function exactTree(actual,expected,label='tree'){
 if(typeof expected==='number'){exactNumber(actual,expected,label);return;}
 if(expected===null||typeof expected!=='object'){assert.equal(actual,expected,label);return;}
 assert.equal(Array.isArray(actual),Array.isArray(expected),label+' shape');assert.deepEqual(Object.keys(actual),Object.keys(expected),label+' keys');for(const key of Object.keys(expected))exactTree(actual[key],expected[key],label+'.'+key);
}
function navigationState(nav){
 return {revision:nav.revision,active:nav.active.map(rect=>({...rect})),grids:[...nav.grids].map(([radius,grid])=>[radius,{radius:grid.radius,cell:grid.cell,cols:grid.cols,rows:grid.rows,size:grid.size,clear:Array.from(grid.clear),edges:Array.from(grid.edges),components:Array.from(grid.components),fields:[...grid.fields].map(([key,field])=>[key,{goal:field.goal,...(field.distances?{distances:Array.from(field.distances),next:Array.from(field.next)}:{})}])}])};
}
const wall=(x,y,w,h,kind='building')=>({x,y,w,h,kind,destroyed:false});
const radii=[12,14,15,18,19,27,49];

async function registerOracle(){
 const {sources,original,candidate}=await loadNavigationScalarModules(),O=original.Navigation,C=candidate.Navigation,oi=original.__qaNavigationInternals,ci=candidate.__qaNavigationInternals;
 await test('frozen full original/candidate differ only in the two scoped scalar changes',()=>{assert.equal(sources.originalBytes,12361);assert.equal(sources.candidateBytes,12503);assert.equal(sources.original.split("from './rooftop-world.js'").length,2);assert.equal(sources.candidate.split("from './rooftop-world.js'").length,2);});
 await test('slab and rounded-rectangle numeric results retain Object.is and Float64 bits at boundaries, reversed axes and extreme values',()=>{
  const pairs=[[{x:100,y:100},{x:400,y:400}],[{x:400,y:400},{x:100,y:100}],[{x:200,y:0},{x:200,y:500}],[{x:500,y:200},{x:0,y:200}],[{x:0,y:-0},{x:-0,y:0}],[{x:200,y:250},{x:200+1e-13,y:251}],[{x:200,y:250},{x:200+1e-12,y:251}],[{x:-Number.MAX_VALUE,y:Number.MIN_VALUE},{x:Number.MAX_VALUE,y:0}],[{x:Infinity,y:1},{x:-Infinity,y:2}],[{x:NaN,y:1},{x:4,y:NaN}]];
  const rectangles=[wall(200,200,80,40),wall(200,200,0,40),wall(200,200,80,0),wall(-0,0,1,1),wall(0,0,Number.MIN_VALUE,Number.MIN_VALUE),wall(-Number.MAX_VALUE,0,Number.MAX_VALUE,1),wall(NaN,0,1,1)];
  for(const [a,b]of pairs)for(const rect of rectangles){assert.equal(ci.segmentIntersectsRect(a,b,rect),oi.segmentIntersectsRect(a,b,rect));exactNumber(ci.segmentRectDistanceSquared(a,b,rect),oi.segmentRectDistanceSquared(a,b,rect));}
  const map={width:960,height:720,obstacles:[wall(300,300,100,100)]},on=new O(structuredClone(map)),cn=new C(structuredClone(map));
  for(const r of [0,-0,Number.MIN_VALUE,1e-12,...radii,NaN,Infinity,-Infinity])for(const [a,b]of pairs.slice(0,6))assert.equal(cn._los(a,b,r,false,true,true),on._los(a,b,r,false,true,true),'private numeric LOS');
 });
 await test('point/rectangle getters, throwing getters and non-number private-radius coercion keep exact read order and original exception identity',()=>{
  const sentinel=Error('controlled original getter throw');
  const capture=(module,kind,throwAt=Infinity)=>{const log=[];let reads=0;const observed=(label,values)=>new Proxy(values,{get(target,key){if(typeof key==='string'){log.push(label+'.'+key);if(++reads===throwAt)throw sentinel;}return Reflect.get(target,key);}}),a=observed('a',{x:400,y:350}),b=observed('b',{x:100,y:200}),rect=observed('rect',wall(230,270,50,40));let result,error;
   try{if(kind==='slab')result=module.__qaNavigationInternals.segmentIntersectsRect(a,b,rect);else{const nav=new module.Navigation({width:960,height:720,obstacles:[]});nav.active=[rect,observed('second',wall(220,210,20,20))];let conversions=0;const radius={[Symbol.toPrimitive](hint){log.push('radius.'+hint+'.'+(++conversions));return conversions%2?14:14.125;}};result=nav._los(a,b,radius,false,true,true);}}catch(caught){error=caught;}return{result,error,log};};
  for(const kind of ['slab','los'])for(const throwAt of [Infinity,1,4,11,20]){const a=capture(original,kind,throwAt),b=capture(candidate,kind,throwAt);assert.equal(b.result,a.result);assert.equal(b.error,a.error);assert.deepEqual(b.log,a.log);if(a.error)assert.equal(a.error,sentinel);}
  for(const type of ['wrapped','string','undefined','null','symbol','bigint']){const captureRadius=module=>{const nav=new module.Navigation({width:960,height:720,obstacles:[]});nav.active=[wall(230,270,50,40),wall(220,210,20,20)];const radius=type==='wrapped'?new Number(14):type==='string'?'14':type==='undefined'?undefined:type==='null'?null:type==='symbol'?Symbol('radius'):14n;try{return{result:nav._los({x:400,y:350},{x:100,y:200},radius,false,true,true)};}catch(error){return{error:error.name,message:error.message};}};assert.deepEqual(captureRadius(candidate),captureRadius(original),type);}
 });
 await test('seven radii preserve direction bits, all grid/field cells and LRU order through mutable worlds and explicit invalidation',()=>{
  const first={width:960,height:720,obstacles:[wall(400,140,110,320),wall(400,350,300,110),wall(650,100,60,90,'car')]},a=structuredClone(first),b=structuredClone(first),on=new O(a),cn=new C(b),targets=[{x:620,y:260},{x:620,y:560},{x:414,y:300},{x:700,y:100},{x:200,y:100},{x:760,y:600}],from={x:300,y:280};
  const check=label=>{for(const r of radii)for(const target of targets){vector(cn.direction(from,target,r),on.direction(from,target,r),label);assert.equal(cn.lineOfSight(from,target,r),on.lineOfSight(from,target,r));exactTree(navigationState(cn),navigationState(on),label);}};
  check('cold');check('warm');
  const phases=[m=>{m.obstacles[0].destroyed=true;},m=>{m.obstacles[0].destroyed=false;},m=>{m.obstacles.push(wall(100,450,50,100,'fence'));},m=>{m.obstacles.pop();},m=>{m.water=[wall(100,100,80,90,'water')];},m=>{m.water.push(wall(180,100,80,90,'water'));},m=>{m.width=1008;m.height=768;},m=>{m.obstacles=m.obstacles.map(rect=>({...rect,x:rect.x+8}));}];
  for(const [index,mutate]of phases.entries()){mutate(a);mutate(b);check('mutation '+index);}
  // Same-length geometry replacement is deliberately not an implicit fix for
  // the original revision contract. Both owners explicitly invalidate next.
  on.invalidate();cn.invalidate();check('explicit invalidation');
  for(const r of [0,1,2,...radii,49,14]){vector(cn.direction(from,targets[0],r),on.direction(from,targets[0],r),'radius LRU');exactTree(navigationState(cn),navigationState(on));}
  assert.equal(cn.grids.size,8);for(const grid of cn.grids.values())assert.ok(grid.fields.size<=4);
 });
 await test('original rooftop platforms and water clearance preserve routes and rejected void segments at every supported crowd radius',()=>{
  for(const roof of [false,true]){const world=roof?{width:2400,height:1800,obstacles:[wall(930,840,100,80)],rooftop:ROOF_SURFACE}:{width:960,height:720,obstacles:[wall(400,140,110,320)],water:[wall(400,460,180,130,'water')]},on=new O(structuredClone(world)),cn=new C(structuredClone(world)),pairs=roof?[[{x:1020,y:1030},{x:1600,y:930}],[{x:1020,y:1030},{x:1390,y:760}],[{x:1250,y:900},{x:1510,y:900}]]:[[{x:300,y:280},{x:620,y:560}],[{x:300,y:280},{x:500,y:500}]];
   for(const r of radii)for(const [from,target]of pairs){vector(cn.direction(from,target,r),on.direction(from,target,r),'surface direction');for(const allowVoid of [false,true])assert.equal(cn.lineOfSight(from,target,r,{allowVoid}),on.lineOfSight(from,target,r,{allowVoid}));exactTree(navigationState(cn),navigationState(on));}
  }
 });
 await test('scope explicitly excludes adversarial global Array iterator overrides instead of claiming universal side-effect equivalence',()=>{
  const before=Object.getOwnPropertyDescriptor(Array.prototype,Symbol.iterator),sentinel=Error('controlled array iterator'),a={x:400,y:350},b={x:100,y:200},rect=wall(230,270,50,40);let oldError,newError,newValue;
  try{Object.defineProperty(Array.prototype,Symbol.iterator,{configurable:true,get(){throw sentinel;}});try{oi.segmentIntersectsRect(a,b,rect);}catch(error){oldError=error;}try{newValue=ci.segmentIntersectsRect(a,b,rect);}catch(error){newError=error;}}
  finally{Object.defineProperty(Array.prototype,Symbol.iterator,before);}
  assert.equal(oldError,sentinel);assert.equal(newError,undefined);assert.equal(typeof newValue,'boolean');
 });
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await registerOracle();
