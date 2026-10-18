import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Game} from '../dist/engine.js';
import {createQAStorage} from '../dist/qa-storage.js';

const loopURL=new URL('../dist/qa-app-loop.js',import.meta.url);
const current=await readFile(loopURL,'utf8');
const original=await readFile(new URL('../../../qa/sprite-call-cost-20261018/current-qa-app-loop.txt',import.meta.url),'utf8');
const dataURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const profileModules=new Set(['./qa-native-frame-profile.js','./qa-frame-cost-profile.js','./qa-movement-profile.js','./qa-sprite-call-profile.js','./qa-sprite-call-pixels.js']);

async function harness(source,run,{spriteStopThrows=false}={}){
 const trace=[],factories=[],key='__spriteLoopTest_'+Math.random().toString(36).slice(2);let pixelCalls=0;
 const factory=kind=>options=>{factories.push(kind);return{beginFrame(){trace.push(kind+'.begin');},endFrame(){trace.push(kind+'.end');},stop(){trace.push(kind+'.stop');if(kind==='sprite'&&spriteStopThrows)throw Error('injected sprite stop failure');return{enabled:true,kind};}};};
 globalThis[key]={native:factory('native'),cost:factory('cost'),movement:factory('movement'),sprite:factory('sprite'),pixels(){pixelCalls++;return{complete:true,cases:[],images:[{src:'data:image/png;base64,AA==',alt:'separate pixel proof'}]};}};
 const stub=dataURL(`const f=globalThis[${JSON.stringify(key)}]; export const createNativeFrameProfile=f.native,createFrameCostProfile=f.cost,createMovementProfile=f.movement,createSpriteCallProfile=f.sprite,compareSpriteCallPixels=f.pixels;`);
 const rewritten=source.replace(/from\s*(['"])(\.[^'"]+)\1/g,(_all,q,path)=>`from ${JSON.stringify(profileModules.has(path)?stub:new URL(path,loopURL).href)}`);
 let module;try{module=await import(dataURL(rewritten));}finally{delete globalThis[key];}
 const nodes=new Map();for(const id of ['qa-loop-start','qa-loop-stop','qa-loop-status','qa-loop-report','qa-loop-proof','qa-sprite-pixels','qa-sprite-pixel-report','qa-sprite-pixel-proof'])nodes.set('#'+id,{textContent:'',src:'',disabled:id==='qa-sprite-pixels',children:[],events:new Map(),addEventListener(event,fn){this.events.set(event,fn);},click(){if(!this.disabled)return this.events.get('click')?.();},replaceChildren(){this.children=[];},append(node){this.children.push(node);}});
 const document={appended:0,createElement(tag){if(tag==='img')return{style:{}};return{innerHTML:'',style:{},querySelector(key){if(key.startsWith('#qa-sprite-')&&!this.innerHTML.includes('id="'+key.slice(1)+'"'))return null;return nodes.get(key);}};},body:{append(){document.appended++;}}};
 const game=new Game({seed:774,weapon:'nailgun'}),calls=[],renderer={canvas:{toDataURL(){calls.push('proof');return'data:image/png;base64,AA==';}},render(){calls.push('render');}};
 const initial=structuredClone(game.snapshot()),receiver={},token={identity:'original-frame-result'};
 const read=()=>({game,screen:null,hidden:false,lastFrame:0});
 const frame=function(now,value){assert.equal(this,receiver);assert.equal(value,token);game.tick(1/60,{moveX:.5,moveY:0,shoot:true});calls.push(...game.drainEvents().map(event=>event.type));renderer.render();return token;};
 let installed=null;
 const env={module,nodes,document,game,renderer,trace,factories,calls,initial,read,receiver,token,frame,get pixelCalls(){return pixelCalls;},
  install(suffix=''){const location=new URL('http://localhost:8851/?qa=1&qa-memory=sprite-install&qa-loop=1'+suffix),storage=createQAStorage(location.searchParams,()=>assert.fail('persistent storage access'));installed=module.installAppLoopQA({document,location,query:location.searchParams,storage,read,renderer,fixture:{count:180,snapshotValid:true},bindings:[],methods:[]});return installed;},
  runFrames(){nodes.get('#qa-loop-start').click();const wrapped=installed.wrapFrame(frame);for(const now of [1000,2000,3000])assert.equal(wrapped.call(receiver,now,token),token);nodes.get('#qa-loop-stop').click();return{snapshot:structuredClone(game.snapshot()),random:game.random.getState(),visualRandom:game.visualRandom.getState(),events:structuredClone(game.events),calls:[...calls],report:installed.probe.report};}};
 try{return await run(env);}finally{installed?.probe.stop('test-finally');}
}

test('default QA loop keeps the original game/events/RNG, profile ordering and report shape without creating a sprite observer',async()=>{
 const run=env=>{env.install('&qa-loop-cost=1&qa-loop-movement=counts');return{...env.runFrames(),trace:env.trace,factories:env.factories};};
 const a=await harness(original,run),b=await harness(current,run);
 for(const key of ['snapshot','random','visualRandom','events','calls','trace','factories'])assert.deepEqual(b[key],a[key],key);
 assert.equal(Object.hasOwn(b.report,'spriteCalls'),false);assert.deepEqual(Object.keys(b.report),Object.keys(a.report));assert.deepEqual(b.factories,['native','cost','movement']);
});

test('only the exact optional flag creates the sprite observer; nested begin/end/stop order preserves the original frame and game',async()=>{
 const baseline=await harness(current,env=>{env.install('&qa-loop-cost=1&qa-loop-movement=counts');return env.runFrames();});
 for(const flag of ['', '0','true','01','unknown'])await harness(current,env=>{env.install('&qa-loop-sprite-calls='+flag);env.runFrames();assert.equal(env.factories.includes('sprite'),false);});
 await harness(current,env=>{
  env.install('&qa-loop-cost=1&qa-loop-movement=counts&qa-loop-sprite-calls=1');const result=env.runFrames();
  for(const key of ['snapshot','random','visualRandom','events','calls'])assert.deepEqual(result[key],baseline[key],key);
  assert.deepEqual(env.factories,['native','cost','sprite','movement']);
  assert.deepEqual(env.trace.slice(0,8),['native.begin','cost.begin','sprite.begin','movement.begin','movement.end','sprite.end','cost.end','native.end']);
  assert.ok(env.trace.indexOf('sprite.stop')<env.trace.indexOf('cost.stop'));assert.equal(result.report.spriteCalls.kind,'sprite');assert.equal(result.report.memoryOnly,true);
 });
});

test('outside the exact genuine-memory 8851 gate, no DOM, renderer, read, storage or optional observer access occurs',async()=>{
 await harness(current,env=>{
  let accesses=0;const denied=new Proxy({}, {get(){accesses++;throw Error('outside gate read');}}),query=new URLSearchParams('qa=1&qa-memory=x&qa-loop=1&qa-loop-sprite-calls=1');
  const real=createQAStorage(query,()=>assert.fail('persistent storage access'));
  for(const address of ['http://localhost:8806/','http://localhost:8852/','https://localhost:8851/','http://localhost.evil.test:8851/'])assert.equal(env.module.installAppLoopQA({document:denied,renderer:denied,read:()=>assert.fail('outside read'),location:new URL(address),query,storage:real}),null);
  for(const missing of ['qa','qa-memory','qa-loop']){const q=new URLSearchParams(query);q.delete(missing);assert.equal(env.module.installAppLoopQA({document:denied,renderer:denied,location:new URL('http://localhost:8851/'),query:q,storage:real}),null);}
  assert.equal(env.module.installAppLoopQA({document:denied,renderer:denied,location:new URL('http://localhost:8851/'),query,storage:denied}),null);
  assert.equal(accesses,0);assert.equal(env.document.appended,0);assert.deepEqual(env.factories,[]);
 });
});

test('an unexpected sprite stop failure does not prevent existing cost/native cleanup or proof/report delivery',async()=>{
 await harness(current,env=>{env.install('&qa-loop-cost=1&qa-loop-sprite-calls=1');const result=env.runFrames();assert.ok(env.trace.includes('cost.stop'));assert.ok(env.trace.includes('native.stop'));assert.equal(result.report.spriteCalls.error,'sprite-observer-stop-failed');assert.equal(env.nodes.get('#qa-loop-status').textContent.startsWith('기록 완료'),true);assert.ok(env.nodes.get('#qa-loop-report').textContent);},{spriteStopThrows:true});
});

test('the separate pixel action stays disabled until observation ends and never runs in the measured callback',async()=>{
 await harness(current,env=>{env.install('&qa-loop-sprite-calls=1');const button=env.nodes.get('#qa-sprite-pixels');assert.equal(button.disabled,true);button.click();assert.equal(env.pixelCalls,0);env.runFrames();assert.equal(env.pixelCalls,0);assert.equal(button.disabled,false);button.click();assert.equal(env.pixelCalls,1);assert.equal(JSON.parse(env.nodes.get('#qa-sprite-pixel-report').textContent).complete,true);assert.equal(Object.hasOwn(JSON.parse(env.nodes.get('#qa-sprite-pixel-report').textContent),'images'),false);assert.equal(env.nodes.get('#qa-sprite-pixel-proof').children.length,1);});
 await harness(current,env=>{env.install();env.runFrames();assert.equal(env.nodes.get('#qa-sprite-pixels').events.size,0);assert.equal(env.pixelCalls,0);});
});
