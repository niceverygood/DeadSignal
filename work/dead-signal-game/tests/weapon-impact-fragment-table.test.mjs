import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as impact from '../dist/weapon-impact.js';
import {Game} from '../dist/engine.js';
import {SEA_EXPEDITION,ROOF_EXPEDITION} from '../dist/expedition.js';

const ORIGINAL_SHA256='a83043664f378b645bdad3c8e19a47077b3824bba629a3a6462bb6b597896dc0';
const originalURL=new URL('../../../qa/dense-cpu-next-20261018/weapon-impact-before-fragment-table.txt',import.meta.url),productionURL=new URL('../dist/weapon-impact.js',import.meta.url),originalBytes=readFileSync(originalURL);
assert.equal(createHash('sha256').update(originalBytes).digest('hex'),ORIGINAL_SHA256,'The oracle is the independently saved full original module');
const originalSource=originalBytes.toString('utf8').replace(/from (['"])(\.[^'"]+)\1/g,(match,quote,specifier)=>'from '+JSON.stringify(new URL(specifier,productionURL).href));
const original=await import('data:text/javascript;base64,'+Buffer.from(originalSource).toString('base64'));

// These are Canvas command/state oracles, not raster pixels, native Canvas
// timings or GPU evidence. Fixed tables assume normal Math intrinsics at import.
function bits(value){const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,value,false);return view.getBigUint64(0,false).toString(16).padStart(16,'0');}
function strict(actual,expected,label='value'){
 if(typeof expected==='number'){assert.equal(typeof actual,'number',label);assert.equal(Object.is(actual,expected),true,label+' Object.is');assert.equal(bits(actual),bits(expected),label+' Float64');return;}
 if(expected===null||typeof expected!=='object'){assert.equal(actual,expected,label);return;}
 assert.equal(actual!==null&&typeof actual==='object',true,label+' object');assert.deepEqual(Object.keys(actual),Object.keys(expected),label+' keys');for(const key of Object.keys(expected))strict(actual[key],expected[key],label+'.'+key);
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function canvas({failure=null,marker=Error('original Canvas failure')}={}){
 const events=[],stack=[],counts=new Map();let gradientID=0;
 let state={globalAlpha:.61,globalCompositeOperation:'xor',fillStyle:'#445566',strokeStyle:'#112233',lineWidth:3.125,transform:[]};
 const token=value=>value&&typeof value==='object'&&value.gradientID?{gradientID:value.gradientID}:value;
 const snapshot=()=>Object.fromEntries(Object.entries(state).map(([key,value])=>[key,key==='transform'?value.map(operation=>[...operation]):token(value)]));
 const emit=(name,args=[])=>{events.push({name,args:args.map(token)});const n=(counts.get(name)||0)+1;counts.set(name,n);if(failure?.name===name&&failure.nth===n)throw marker;};
 const methods={
  save(){emit('save');stack.push({...state,transform:state.transform.map(operation=>[...operation])});},
  restore(){emit('restore');if(stack.length)state=stack.pop();},
  translate(...args){emit('translate',args);state.transform.push(['translate',...args]);},
  rotate(...args){emit('rotate',args);state.transform.push(['rotate',...args]);},
  createRadialGradient(...args){emit('createRadialGradient',args);const gradient={gradientID:++gradientID,addColorStop(...stop){emit('gradient.addColorStop',[gradient.gradientID,...stop]);}};return gradient;}
 };
 for(const name of ['beginPath','closePath','moveTo','lineTo','ellipse','arc','fill','stroke','fillRect','clip'])methods[name]=(...args)=>emit(name,args);
 const context=new Proxy(methods,{get(object,key){if(Object.hasOwn(state,key))return state[key];return object[key];},set(object,key,value){if(!Object.hasOwn(state,key))throw Error('unrecognized Canvas setter '+String(key));emit('set.'+String(key),[value]);state[key]=value;return true;}});
 const initial=snapshot();return{context,events,initial,state:snapshot,depth:()=>stack.length};
}
function run(module,name,args,options){const c=canvas(options);let value,error=null;try{value=module[name](c.context,...args);}catch(caught){error=caught;}return{c,value,error};}
function equivalent(name,args,label,options){
 const before=structuredClone(args),a=run(original,name,args,options),b=run(impact,name,args,options);
 strict(b.c.events,a.c.events,label+' commands/setters/stops');strict(b.c.state(),a.c.state(),label+' final Canvas state');assert.equal(b.c.depth(),a.c.depth(),label+' save stack');assert.equal(b.value,a.value,label+' return');assert.equal(b.error,a.error,label+' throw identity');strict(args,before,label+' supplied input unchanged');return{a,b};
}
const particle=(extra={})=>({kind:'weapon-impact',weapon:'nailgun',x:1200.25,y:930.125,z:18,angle:.7,maxLife:.24,life:.24,hits:1,shielded:false,lethal:false,...extra});

test('independent full original SHA and public envelope/material/muzzle/impact functions remain unchanged',()=>{
 assert.equal(originalBytes.length,6017);assert.equal(createHash('sha256').update(originalBytes).digest('hex'),ORIGINAL_SHA256);
 for(const name of ['weaponImpactEnvelope','drawMaterialImpact','drawWeaponMuzzle','drawWeaponImpact'])assert.equal(impact[name].toString(),original[name].toString(),name+' source unchanged');
 for(const weapon of ['nailgun','shotgun'])for(const shielded of [false,true])for(const lethal of [false,true])for(const hits of [0,1,4,9])for(const age of [0,.19,.38,.8,1]){
  const p=freeze(particle({weapon,shielded,lethal,hits,life:.3*(1-age),maxLife:.3})),before=structuredClone(p);strict(impact.weaponImpactEnvelope(p),original.weaponImpactEnvelope(p),'envelope');strict(p,before,'envelope input');
 }
});

test('both fragment families preserve exact Canvas methods, setters and gradient stops through contact/ring/late/dead phases',()=>{
 for(const weapon of ['nailgun','shotgun'])for(const shielded of [false,true])for(const lethal of [false,true])for(const hits of [0,1,4,9])for(const angle of [-Math.PI,-.7,-0,.7,Math.PI])for(const age of [0,.19,.37,.8,1]){
  const p=freeze(particle({weapon,shielded,lethal,hits,angle,maxLife:.3,life:.3*(1-age)})),label=[weapon,shielded,lethal,hits,angle,age].join('/'),{a,b}=equivalent('drawWeaponImpact',[p,null],label);
  assert.equal(a.error,null,label);assert.equal(b.c.depth(),0,label+' normal cleanup');strict(b.c.state(),b.c.initial,label+' caller state restored');assert.equal(b.value,age===1?false:true,label+' lifetime');
 }
 for(const extra of [{life:0},{life:-1},{kind:'spark'},{maxLife:0,life:.01},{maxLife:.0001,life:.0001},{z:0,angle:0},{z:-0,angle:-0},{hits:undefined},{weapon:'unknown',shielded:true}])equivalent('drawWeaponImpact',[freeze(particle(extra)),null],'edge '+JSON.stringify(extra));
});

test('organic airborne/landed ground, water and roof responses retain the original visible commands without moving a particle',()=>{
 const worlds=[null,freeze({water:[{x:-1000,y:-1000,w:2000,h:2000}]}),freeze({rooftop:{platforms:[{x:1000,y:1000,w:20,h:20}]}}),freeze({rooftop:{platforms:[{x:-1000,y:-1000,w:2000,h:2000}]}})];
 for(const weapon of ['nailgun','shotgun'])for(const lethal of [false,true])for(const life of [.9,.2])for(let i=0;i<worlds.length;i++){
  const p=freeze(particle({x:0,y:0,weapon,lethal,life,maxLife:1})),{b}=equivalent('drawWeaponImpact',[p,worlds[i]],'organic '+[weapon,lethal,life,i].join('/'));assert.equal(b.error,null);assert.equal(b.c.depth(),0);
  if(life===.2){const fills=b.c.events.filter(event=>event.name==='fill').length;assert.equal(fills,i===1||i===2?0:lethal?12:weapon==='shotgun'?9:5,'landed surface support');}
 }
});

test('metal/concrete and muzzle paths remain exact for both weapons and all representative directions/ages',()=>{
 for(const surface of ['metal','concrete','wood'])for(const weapon of ['nailgun','shotgun'])for(const angle of [-Math.PI,-0,.7,Math.PI])for(const age of [0,.2,.5,.85,1]){
  const p=freeze(particle({surface,weapon,angle,maxLife:.2,life:.2*(1-age)}));for(const name of ['drawMaterialImpact','drawWeaponImpact']){const {b}=equivalent(name,[p],'material '+[name,surface,weapon,angle,age].join('/'));assert.equal(b.error,null);assert.equal(b.c.depth(),0);strict(b.c.state(),b.c.initial,'material restores caller');}
 }
 for(const weapon of ['nailgun','shotgun'])for(const angle of [-Math.PI,-0,.7,Math.PI])for(const recoil of [-1,-0,0,.00001,.06,.12,.3,NaN]){
  const p=freeze({point:{x:12.5,y:-0},angle,weapon,recoil}),{b}=equivalent('drawWeaponMuzzle',[p],'muzzle '+[weapon,angle,recoil].join('/'));assert.equal(b.error,null);assert.equal(b.c.depth(),0);strict(b.c.state(),b.c.initial,'muzzle restores caller');
 }
 equivalent('drawWeaponMuzzle',[freeze({point:null,weapon:'shotgun',angle:0,recoil:.1})],'missing muzzle point');
});

test('drawing actual engine-created impacts leaves complete game/checkpoint/events and both RNG streams unchanged',()=>{
 const priorRandom=Math.random;let randomCalls=0;
 try{
  for(const weapon of ['nailgun','shotgun'])for(const expedition of [null,SEA_EXPEDITION,ROOF_EXPEDITION]){
   const game=new Game({seed:774,weapon,...(expedition?{expeditionId:expedition.id}:{})}),enemy=game.spawnEnemy('walker',300);assert.ok(enemy);Object.assign(enemy,{hp:500,maxHp:500});game.damageEnemy(enemy,10,{x:45,y:0},{x:enemy.x-40,y:enemy.y});
   const p=game.particles.find(value=>value.kind==='weapon-impact');assert.ok(p);
   const state=()=>structuredClone({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,random:game.random.getState(),visualRandom:game.visualRandom.getState(),id:game.id,state:game.state});
   const before=state();Math.random=()=>{randomCalls++;throw Error('presentation must not consume random');};
   const {b}=equivalent('drawWeaponImpact',[p,game.world],'actual game '+weapon+'/'+(expedition?.id??'street'));assert.equal(b.error,null);strict(state(),before,'game/RNG/events unchanged');Math.random=priorRandom;
  }
 }finally{Math.random=priorRandom;}
 assert.equal(randomCalls,0);
});

test('Canvas exceptions retain original throw identity, exact preceding commands and original cleanup including nested follow-through behavior',()=>{
 const cases=[
  {name:'drawWeaponImpact',p:particle(),failure:{name:'ellipse',nth:1},depth:0},
  {name:'drawWeaponImpact',p:particle({shielded:true}),failure:{name:'gradient.addColorStop',nth:2},depth:0},
  // The original private follow-through has no own finally. Preserve that
  // existing stack behavior here rather than silently fixing unrelated code.
  {name:'drawWeaponImpact',p:particle({shielded:true}),failure:{name:'rotate',nth:1},depth:1},
  {name:'drawWeaponImpact',p:particle({shielded:true}),failure:{name:'stroke',nth:2},depth:1},
  {name:'drawMaterialImpact',p:particle({surface:'metal'}),failure:{name:'stroke',nth:3},depth:0},
  {name:'drawMaterialImpact',p:particle({surface:'concrete'}),failure:{name:'fillRect',nth:1},depth:0},
  {name:'drawWeaponMuzzle',p:{point:{x:1,y:2},angle:.7,weapon:'shotgun',recoil:.1},failure:{name:'gradient.addColorStop',nth:1},depth:0}
 ];
 for(const entry of cases){const marker=Error('Canvas '+entry.failure.name+'/'+entry.failure.nth),{a,b}=equivalent(entry.name,[freeze(entry.p)],'throw '+entry.name+'/'+entry.failure.name,{failure:entry.failure,marker});assert.equal(a.error,marker);assert.equal(b.error,marker);assert.equal(b.c.depth(),entry.depth);}
});

test('after imports, normal-intrinsic runtime observation proves fixed fragment trig and repeated age-power calls are removed',()=>{
 const cos=Math.cos,sin=Math.sin,pow=Math.pow;let active=null;
 // Forward exactly to the normal functions. This is a call-count observer,
 // not a promise of equivalence under adversarial Math replacement at import.
 try{
  Math.cos=function(...args){if(active)active.cos++;return Reflect.apply(cos,this,args);};Math.sin=function(...args){if(active)active.sin++;return Reflect.apply(sin,this,args);};Math.pow=function(...args){if(active)active.pow++;return Reflect.apply(pow,this,args);};
  for(const [weapon,fragments]of [['nailgun',6],['shotgun',10]]){
   const p=freeze(particle({weapon,shielded:true,life:.2,maxLife:.3})),counts=[];
   for(const module of [original,impact]){active={cos:0,sin:0,pow:0};const result=run(module,'drawWeaponImpact',[p]);assert.equal(result.error,null);counts.push(active);active=null;}
   assert.deepEqual(counts[1],{cos:17,sin:18,pow:4});assert.equal(counts[0].cos-counts[1].cos,fragments*2);assert.equal(counts[0].sin-counts[1].sin,fragments*2);assert.equal(counts[0].cos+counts[0].sin-counts[1].cos-counts[1].sin,fragments*4,'24/40 fixed trig calls only');assert.equal(counts[0].pow-counts[1].pow,fragments-1,'5/9 identical age-power calls only');
  }
 }finally{active=null;Math.cos=cos;Math.sin=sin;Math.pow=pow;}
});
