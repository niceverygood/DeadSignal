import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeCatalogIds} from '../dist/native-catalog-ids.js';
import {ProductionArt} from '../dist/production-art.js';
import {productionManifest} from '../dist/production-manifest.js';
import {Renderer} from '../dist/renderer.js';

const original=mapping=>[...new Set(typeof mapping==='string'?[mapping]:Object.values(mapping))];

test('real frozen production character and enemy mappings keep original ID order and reuse only their immutable enumerations',()=>{
 const art=new ProductionArt({manifest:productionManifest}),cache=new NativeCatalogIds();let checked=0;
 for(const section of ['characters','enemies'])for(const mapping of Object.values(art.manifest[section])){
  assert.equal(Object.isFrozen(mapping),true);const expected=original(mapping),ids=cache.get(mapping);
  assert.deepEqual(ids,expected);assert.equal(Object.isFrozen(ids),true);
  for(let i=0;i<24;i++)assert.equal(cache.get(mapping),ids,'same frozen mapping reuses its list without enumerating per actor');
  checked++;
 }
 assert.ok(checked>=8,'both real catalogs were exercised');assert.ok(cache.stats.hits>=checked*24);assert.ok(cache.stats.enumerations<=checked);
});

test('mutable mappings, added/deleted values and replacement identities immediately preserve native enumeration semantics',()=>{
 const cache=new NativeCatalogIds(),mapping={idle:'a',walk:'b',attack:'a'};
 const first=cache.get(mapping),second=cache.get(mapping);assert.deepEqual(first,['a','b']);assert.notEqual(second,first,'mutable mappings are never reused');
 mapping.hit='c';assert.deepEqual(cache.get(mapping),original(mapping));delete mapping.idle;mapping.walk='d';assert.deepEqual(cache.get(mapping),['d','a','c']);
 const frozen=Object.freeze({...mapping}),ids=cache.get(frozen);assert.equal(cache.get(frozen),ids);
 const replacement=Object.freeze({...mapping,walk:'replacement'}),next=cache.get(replacement);assert.notEqual(next,ids);assert.deepEqual(next,original(replacement));
 assert.throws(()=>ids.push('external'),TypeError);assert.throws(()=>{ids[0]='external';},TypeError);assert.deepEqual(cache.get(frozen),original(frozen));
 const array=['b',,'a','b'];assert.deepEqual(cache.get(array),['b','a']);array[1]='inserted';assert.deepEqual(cache.get(array),original(array));
});

test('QA bypass enumerates afresh without replacing the reusable immutable cache',()=>{
 const cache=new NativeCatalogIds(),mapping=Object.freeze({idle:'a',attack:'b',run:'a'}),cached=cache.get(mapping);
 const before={...cache.stats},bypass=cache.get(mapping,true);assert.deepEqual(bypass,cached);assert.notEqual(bypass,cached);assert.equal(Object.isFrozen(bypass),true);assert.equal(cache.stats.enumerations,before.enumerations+1);assert.equal(cache.stats.hits,before.hits);assert.equal(cache.get(mapping),cached);
 const cachedString=cache.get('enemy-walker'),bypassedString=cache.get('enemy-walker',true);assert.deepEqual(bypassedString,['enemy-walker']);assert.notEqual(bypassedString,cachedString);assert.equal(cache.get('enemy-walker'),cachedString);
 const fresh=new NativeCatalogIds();fresh.get(mapping,true);assert.equal(fresh.stats.hits,0);assert.equal(fresh.stringIds.size,0);assert.equal(fresh.objectIds.has(mapping),false);
});

test('string IDs use one frozen list per actual ID and evict within a fixed retention cap',()=>{
 const cache=new NativeCatalogIds({maxStringEntries:2}),a=cache.get('a'),b=cache.get('b');assert.equal(cache.get('a'),a);assert.equal(cache.get('b'),b);assert.equal(cache.stringIds.size,2);
 assert.deepEqual(cache.get('c'),['c']);assert.equal(cache.stringIds.size,2);assert.equal(cache.stringIds.has('a'),false);assert.equal(cache.get('b'),b);
 const nextA=cache.get('a');assert.notEqual(nextA,a);assert.deepEqual(nextA,['a']);assert.equal(cache.stringIds.size,2);
 const disabled=new NativeCatalogIds({maxStringEntries:0});assert.notEqual(disabled.get('a'),disabled.get('a'));assert.equal(disabled.stringIds.size,0);
 const bounded=new NativeCatalogIds();for(let i=0;i<300;i++)bounded.get('actual-id-'+i);assert.equal(bounded.stringIds.size,256);
});

test('numeric key order, rare values, duplicate object identity and primitive inputs retain Object.values plus Set behavior',()=>{
 const one={mutable:true},other={mutable:true},symbol=Symbol('id');
 const mapping=Object.freeze({20:'twenty',2:'two',z:one,a:one,b:other,c:NaN,d:NaN,e:-0,f:0,g:undefined,h:null,i:symbol,j:symbol,k:1n,l:false});
 const cache=new NativeCatalogIds(),ids=cache.get(mapping);assert.deepEqual(ids,original(mapping));assert.equal(ids[2],one);assert.equal(ids[3],other);assert.notEqual(ids[2],ids[3]);assert.equal(Object.is(ids[5],0),true);assert.equal(Object.isFrozen(one),false);one.mutable='still mutable';assert.equal(cache.get(mapping)[2].mutable,'still mutable');
 const inherited=Object.create({ignored:'prototype'});Object.assign(inherited,{one:'first',two:'second'});inherited[Symbol('ignored')]='symbol-key';Object.defineProperty(inherited,'hidden',{value:'non-enumerable'});Object.freeze(inherited);assert.deepEqual(cache.get(inherited),['first','second']);
 for(const value of [0,NaN,true,false,1n,Symbol('primitive'),new String('aba'),function catalog(){}])assert.deepEqual(cache.get(value),original(value));
 for(const value of [null,undefined])assert.throws(()=>cache.get(value),TypeError);
});

test('frozen enumerable accessors stay live and preserve subsequent getter exceptions',()=>{
 const cache=new NativeCatalogIds();let value='first',reads=0;
 const mapping=Object.freeze({get idle(){reads++;if(value==='throw')throw Error('original-getter-failure');return value;},walk:'walk'});
 assert.deepEqual(cache.get(mapping),['first','walk']);value='second';assert.deepEqual(cache.get(mapping),['second','walk']);assert.equal(reads,2);assert.equal(cache.objectIds.has(mapping),false);assert.equal(cache.stats.hits,0);
 value='throw';assert.throws(()=>cache.get(mapping),/original-getter-failure/);assert.equal(reads,3);
 const ignored=Object.freeze(Object.defineProperty({idle:'plain'},'hidden',{get(){throw Error('non-enumerable getter must not run');}}));const ids=cache.get(ignored);assert.equal(cache.get(ignored),ids);assert.deepEqual(ids,['plain']);
});

test('actual Renderer catalog requests preserve loader calls, pending masks, notifications and replacement manifests against the original Set iterator',async()=>{
 const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done;}),resolve:value=>resolve(value)};};
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 async function observe(forceCatalogEnumeration){
  const calls=[],pendingImages=[],pendingLoads=new Map(),externalMask=deferred();
  class ImageFixture{
   constructor(){this.naturalWidth=this.naturalHeight=1;}
   set src(url){calls.push(['image',url]);pendingImages.push(()=>this.onload?.());}
  }
  const manifest={version:1,assets:Object.fromEntries(['idle','ready','loading','failed','hero-idle','mask-ready','mask-pending','mask-existing','mask-no-path'].map(id=>[id,['hero-idle','mask-ready','mask-pending','mask-existing'].includes(id)?{bodyAlpha:id+'.png'}:{}])),
   enemies:{walker:{idle:'idle',walk:'ready',windup:'loading',attack:'failed',death:'absent-asset',duplicate:'idle'}},
   characters:{survivor:{idle:'hero-idle',run:'mask-ready',walk:'mask-pending',attack:'mask-existing',extra:'mask-no-path',missing:'absent-asset'}},environment:{single:'ready'},bosses:{}};
  const art=new ProductionArt({manifest,baseURL:'https://catalog.example/assets/',ImageCtor:ImageFixture,fetchImpl:null,onChange:change=>calls.push(['art-change',change.id,change.status])});
  const metadata={atlas:{width:1,height:1},frames:[{}]},ready=()=>({status:'ready',metadata,image:{original:true},bodyAlpha:null});
  art.records.set('ready',ready());art.records.set('loading',{status:'loading'});art.records.set('failed',{status:'failed'});art.records.set('mask-ready',ready());art.records.set('mask-pending',{...ready(),bodyAlphaPromise:externalMask.promise});art.records.set('mask-existing',{...ready(),bodyAlpha:{already:true}});art.records.set('mask-no-path',ready());
  for(const name of ['status','isReady','get','loadBodyAlpha']){const method=art[name];art[name]=function(id,...args){calls.push([name,id]);return method.call(this,id,...args);};}
  // Control only network completion. Readiness queries and mask loading use the
  // real ProductionArt methods, including the real image promise/notifications.
  art.load=function(id){calls.push(['load',id]);const pending=deferred(),record={status:'loading',metadata:null,image:null,bodyAlpha:null,promise:pending.promise};this.records.set(id,record);this.notify(id,record);pendingLoads.set(id,()=>{Object.assign(record,ready());this.notify(id,record);pending.resolve(true);});return pending.promise;};
  const renderer=Object.create(Renderer.prototype);Object.assign(renderer,{productionArt:art,forceCatalogEnumeration,onProductionChange:change=>calls.push(['renderer-change',change.id,change.status])});
  const request=(section,key)=>renderer.requestProductionCatalog(section,key);
  request('enemies','walker');request('enemies','walker');request('characters','survivor');request('characters','survivor');request('environment','single');request('enemies','missing-key');
  assert.deepEqual(calls.filter(call=>call[0]==='load'),[['load','idle'],['load','hero-idle']],'idle loads once, loading/failed/missing entries do not start a new request');
  assert.deepEqual(calls.filter(call=>call[0]==='loadBodyAlpha'),[['loadBodyAlpha','mask-ready']],'an existing promise/image and a missing bodyAlpha path prevent duplicate mask loads');
  assert.equal(calls.some(call=>call[1]==='absent-asset'),false,'missing assets receive no record/status/load calls');
  assert.equal(calls.some(call=>call[0]==='renderer-change'),false,'pending requests do not announce readiness');
  for(const resolve of pendingLoads.values())resolve();pendingLoads.clear();await flush();
  assert.deepEqual(calls.filter(call=>call[0]==='loadBodyAlpha'),[['loadBodyAlpha','mask-ready'],['loadBodyAlpha','hero-idle']],'an asynchronously ready character still starts its original mask load');
  request('characters','survivor');assert.equal(calls.filter(call=>call[0]==='loadBodyAlpha').length,2,'mask promises stay deduplicated while image completion is pending');
  for(const complete of pendingImages.splice(0))complete();externalMask.resolve(true);await flush();
  assert.deepEqual(calls.filter(call=>call[0]==='renderer-change'),[['renderer-change','mask-ready','body-alpha-ready'],['renderer-change','hero-idle','body-alpha-ready']]);
  request('characters','survivor');request('enemies','walker');
  const oldEnemyMapping=art.manifest.enemies.walker;
  art.extendManifest({assets:{replacement:{},'new-mask':{bodyAlpha:'new-mask.png'}},enemies:{walker:{walk:'replacement',idle:'ready',again:'replacement'}},characters:{survivor:{idle:'new-mask',run:'mask-existing'}}});
  assert.notEqual(art.manifest.enemies.walker,oldEnemyMapping);assert.equal(Object.isFrozen(art.manifest.enemies.walker),true);
  request('enemies','walker');request('enemies','walker');request('characters','survivor');
  assert.deepEqual(calls.filter(call=>call[0]==='load').slice(-2),[['load','replacement'],['load','new-mask']],'replacement mapping starts the new IDs even after old mappings were cached');
  for(const resolve of pendingLoads.values())resolve();pendingLoads.clear();await flush();for(const complete of pendingImages.splice(0))complete();await flush();
  request('characters','survivor');
  assert.deepEqual(calls.filter(call=>call[0]==='renderer-change').at(-1),['renderer-change','new-mask','body-alpha-ready']);
  assert.equal(calls.filter(call=>call[0]==='loadBodyAlpha'&&call[1]==='mask-pending').length,0);
  const stats=renderer.productionCatalogIds?.stats??{enumerations:0,hits:0};
  return {calls,stats:{...stats},records:[...art.records].map(([id,record])=>({id,status:record.status,mask:!!record.bodyAlpha,pending:!!record.bodyAlphaPromise}))};
 }
 const cached=await observe(false),original=await observe(true);assert.deepEqual(cached.calls,original.calls,'every observable readiness, loading, callback and event stays in original order');assert.deepEqual(cached.records,original.records);assert.ok(cached.stats.hits>=6,'repeated immutable catalogs actually use the cache');assert.equal(original.stats.enumerations,0,'the timing baseline keeps the direct original Set iterator');assert.equal(original.stats.hits,0);
});
