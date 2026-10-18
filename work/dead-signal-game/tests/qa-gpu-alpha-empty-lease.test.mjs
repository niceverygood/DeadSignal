import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createQAStorage,isQAMemoryStorage} from '../dist/qa-storage.js';

// These controlled service fixtures exercise ownership, cancellation and UI
// contracts before any draw. Original asset/GLSL/RGBA proof belongs to the
// dedicated real-browser button; these tests make no GPU correctness claim.
const sourceURL=new URL('../dist/qa-gpu-alpha-empty-lease.js',import.meta.url);
const location=new URL('http://localhost:8851/?qa&qa-memory');
const query=location.searchParams;
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){for(let n=0;n<40&&!predicate();n++)await turn();assert.ok(predicate(),'asynchronous preparation began');}
let serial=0;
async function environment(service,run){
 const source=await readFile(sourceURL,'utf8'),symbol=Symbol.for('empty-lease-fixture-'+serial++),calls=[];
 const old={originalProduct:true,models:new Map([['preserved',{}]])},renderer={liveEnemies:old,liveEnemiesPromise:Promise.resolve(old),liveEnemiesLoading:false,productionArt:{manifest:{enemies:{walker:{idle:'original-walker'}}},load(...args){calls.push(['art.load',...args]);return Promise.resolve();},enemyFrame(){assert.fail('no drawing before a valid prepared rig');}}};
 const owners=Object.getOwnPropertyDescriptors(renderer),storage=createQAStorage(query,()=>assert.fail('persistent storage'));
 for(const key of ['getItem','setItem','removeItem'])storage[key]=()=>assert.fail('QA brand gate uses no storage API');
 const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(name){calls.push(['createElement',name]);assert.equal(name,'canvas');return{fixtureCanvas:true};}}});
 globalThis[symbol]={prepareNativeEnemyLaunch(...args){calls.push(['prepare',...args]);return service(...args);}};
 const shim='export const {prepareNativeEnemyLaunch}=globalThis[Symbol.for('+JSON.stringify(Symbol.keyFor(symbol))+')];';
 const shimURL='data:text/javascript;base64,'+Buffer.from(shim).toString('base64');
 const rewritten=source.replace(/(from\s*)(['"])(\.\/[^'"]+)\2/g,(match,prefix,quote,specifier)=>prefix+JSON.stringify(specifier==='./boss-rig/native-launch-preparation.js'?shimURL:new URL(specifier,sourceURL).href));
 try{const module=await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'));return await run({module,renderer,old,owners,storage,calls,options:{storage,location,query}});}
 finally{delete globalThis[symbol];if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else delete globalThis.document;}
}
function handleFixture({ready=true,textureValid=true,rig}={}){
 rig??={models:new Map([['enemy-walker',{original:true}]]),gpuAlphaBounds:null};
 return{rig,adopted:false,disposed:false,readyCalls:0,disposeCalls:0,report:{prepared:true,textureUpload:{submitted:textureValid,stateNormalized:true,error:''},shaders:[{ready:true}]},isReady(){this.readyCalls++;return ready;},adopt(){assert.fail('invalid fixture cannot be adopted');},dispose(){this.disposeCalls++;this.disposed=true;this.rig.models.clear();}};
}

test('default, foreign-origin, unbranded and pre-aborted requests have no model, canvas, storage or owner IO',async()=>{
 await environment(()=>assert.fail('guarded service call'),async env=>{
  const hostile=new Proxy({}, {get(){assert.fail('guarded renderer getter');},getOwnPropertyDescriptor(){assert.fail('guarded renderer descriptor');}});
  for(const options of [
   {...env.options,location:new URL('http://localhost:8806/?qa&qa-memory')},
   {...env.options,location:new URL('https://localhost:8851/?qa&qa-memory')},
   {...env.options,location:new URL('http://example.com:8851/?qa&qa-memory')},
   {...env.options,query:new URLSearchParams('qa')},
   {...env.options,query:new URLSearchParams('qa-memory')},
   {...env.options,storage:{getItem(){assert.fail('unbranded storage API');}}}
  ])await assert.rejects(env.module.compareGPUAlphaEmptyLease(hostile,options),/memory-qa-required/);
  assert.equal(env.module.allowGPUAlphaEmptyLease(location,query,env.storage),true);
  const controller=new AbortController();controller.abort();
  await assert.rejects(env.module.compareGPUAlphaEmptyLease(hostile,{...env.options,signal:controller.signal}),/aborted/);
  assert.deepEqual(env.calls,[]);assert.deepEqual(Object.getOwnPropertyDescriptors(env.renderer),env.owners);
 });
});

test('resolved owned handles register before owner/readiness checks, dispose once, and never dispose protected originals',async()=>{
 for(const behavior of ['owner-change','not-ready','invalid-texture','protected']){
  const pending=deferred();let handle;
  await environment(()=>pending.promise,async env=>{
   handle=handleFixture({ready:behavior!=='not-ready',textureValid:behavior!=='invalid-texture',rig:behavior==='protected'?env.old:undefined});
   const operation=env.module.compareGPUAlphaEmptyLease(env.renderer,env.options);
   await until(()=>env.calls.some(call=>call[0]==='prepare'));
   let replacement;
   if(behavior==='owner-change'){replacement={foreignOwner:true};Object.defineProperty(env.renderer,'liveEnemies',{value:replacement,writable:false,configurable:true,enumerable:false});}
   pending.resolve(handle);
   const error=await operation.then(()=>assert.fail('invalid preparation succeeded'),error=>error);
   assert.match(error.message,behavior==='owner-change'?/owner-changed/:behavior==='protected'?/owned-preparation-required/:/original-preparation-required/);
   if(behavior==='protected'){assert.equal(handle.disposeCalls,0);assert.equal(env.old.models.size,1);assert.equal(error.cleanup.ownedRigs,0);}
   else{assert.equal(handle.disposeCalls,1);assert.equal(handle.rig.models.size,0);assert.equal(error.cleanup.ownedRigs,1);assert.equal(error.cleanup.retiredRigs,1);assert.deepEqual(error.cleanup.resources,[{modelsRemaining:0,alphaRawBytes:0}]);}
   assert.equal(handle.adopted,false);
   if(behavior==='owner-change'){assert.deepEqual(Object.getOwnPropertyDescriptor(env.renderer,'liveEnemies'),{value:replacement,writable:false,configurable:true,enumerable:false});assert.equal(error.cleanup.externalOwnersPreserved,true);}
   else assert.deepEqual(Object.getOwnPropertyDescriptors(env.renderer),env.owners);
  });
 }
});

test('abort while prepare is pending cleans late unadopted handles and permits a later isolated request',async()=>{
 const pending=deferred(),controller=new AbortController();let serviceCalls=0;
 await environment(()=>{serviceCalls++;return serviceCalls===1?pending.promise:Promise.resolve(handleFixture({ready:false}));},async env=>{
  const operation=env.module.compareGPUAlphaEmptyLease(env.renderer,{...env.options,signal:controller.signal});
  await until(()=>env.calls.some(call=>call[0]==='prepare'));controller.abort();
  await assert.rejects(operation,/aborted/);
  const late=handleFixture();pending.resolve(late);await turn();
  assert.equal(late.disposeCalls,1);assert.equal(late.rig.models.size,0);assert.equal(late.adopted,false);
  await assert.rejects(env.module.compareGPUAlphaEmptyLease(env.renderer,env.options),/original-preparation-required/);
  assert.equal(serviceCalls,2);assert.deepEqual(Object.getOwnPropertyDescriptors(env.renderer),env.owners);
  const call=env.calls.find(value=>value[0]==='prepare');assert.deepEqual(call[1],['enemy-walker']);assert.equal(call[2].timeoutMs,15000);assert.ok(call[2].signal instanceof AbortSignal);assert.equal(call[2].signal.aborted,true);
 });
});

test('appended browser UI preserves every original byte, rejects protected origins, and shows closed reports with actual supplied PNGs',async()=>{
 const source=await readFile(new URL('../dist/qa-player-rig.js',import.meta.url)),before=await readFile(new URL('../../../qa/gpu-alpha-empty-lease-20261018/qa-player-rig-before-empty-lease.txt',import.meta.url));
 assert.equal(before.length,153015);assert.equal(createHash('sha256').update(before).digest('hex'),'98f9a13e4ae2e9580914663abb03f5f416c93f36a1154ec0931783c8d8f255b2');assert.deepEqual(source.subarray(0,before.length),before);
 const text=source.toString('utf8'),start=text.indexOf('// BEGIN GPU ALPHA EMPTY LEASE UI'),end=text.indexOf('// END GPU ALPHA EMPTY LEASE UI',start);assert.ok(start>0&&end>start);
 const block=text.slice(start,end),storageURL=new URL('../dist/qa-storage.js',import.meta.url).href;
 const module=await import('data:text/javascript;base64,'+Buffer.from('import {createQAStorage} from '+JSON.stringify(storageURL)+';\n'+block).toString('base64'));
 function documentFixture(){const nodes=[],body={append(...children){nodes.push(...children);}},nav={children:[],append(value){this.children.push(value);}};return{nodes,body,nav,createElement(tag){return{tag,style:{},children:[],append(...children){this.children.push(...children);}};},querySelector(selector){assert.equal(selector,'nav');return nav;}};}
 const hostile=new Proxy({}, {get(){assert.fail('invalid-origin DOM/owner IO');}});
 assert.equal(module.installGPUAlphaEmptyLeaseQA({document:hostile,location:new URL('http://localhost:8806/?qa&qa-memory'),status:hostile,read:hostile}),null);
 const document=documentFixture(),status={},old={original:true},renderer={liveEnemies:old,liveEnemiesPromise:Promise.resolve(old)},owners=Object.getOwnPropertyDescriptors(renderer),report={empty:{resourceIdentitiesSame:true},comparisons:[{different:0}],cleanup:{complete:true}};let compares=0;
 const api=module.installGPUAlphaEmptyLeaseQA({document,location,query,status,read:()=>({ready:true,playing:false,renderer}),createStorage:(q,forbidden)=>{assert.equal(q,query);assert.throws(forbidden,/persistent-storage-forbidden/);return createQAStorage(q,forbidden);},loadQA:async()=>({compareGPUAlphaEmptyLease:async(owner,options)=>{compares++;assert.equal(owner,renderer);assert.ok(isQAMemoryStorage(options.storage));assert.equal(api.button.disabled,true);options.onProgress({label:'실제 12셀'});options.onImage({phase:'first-12',src:'data:image/png;base64,original12',alt:'actual original frames'});options.onImage({phase:'private-corpse',src:'data:image/png;base64,privatecorpse',alt:'actual private corpse'});return{report};}})});
 assert.equal(api.button.id,'gpu-alpha-empty-lease-qa');assert.equal(document.nav.children[0],api.button);assert.deepEqual(await api.button.onclick(),{report});assert.equal(compares,1);assert.equal(api.button.disabled,false);
 const images=document.nodes.filter(node=>node.tag==='img');assert.deepEqual(images.map(image=>[image.id,image.src]),[['gpu-alpha-empty-lease-proof','data:image/png;base64,original12'],['gpu-alpha-empty-lease-corpse','data:image/png;base64,privatecorpse']]);
 const details=document.nodes.find(node=>node.tag==='details');assert.equal(details.open,false);const pre=details.children.find(node=>node.tag==='pre');assert.equal(pre.id,'gpu-alpha-empty-lease-report');assert.deepEqual(JSON.parse(pre.textContent),report);assert.match(status.textContent,/GPU 기본 OFF/);assert.deepEqual(Object.getOwnPropertyDescriptors(renderer),owners);
 const failure=Error('actual QA failure');const failed=module.installGPUAlphaEmptyLeaseQA({document,location,query,status,read:()=>({ready:true,playing:false,renderer}),loadQA:async()=>({compareGPUAlphaEmptyLease:async()=>{throw failure;}})});await assert.rejects(failed.button.onclick(),error=>error===failure);assert.equal(failed.button.disabled,false);assert.match(status.textContent,/actual QA failure/);
});
