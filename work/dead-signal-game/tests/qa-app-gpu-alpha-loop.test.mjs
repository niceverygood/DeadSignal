import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js?v=0.29.0';
import {advanceSimulation} from '../dist/simulation.js';
import {createQAStorage,isQAMemoryStorage} from '../dist/qa-storage.js';

// Exact QA bootstrap/installer sources, with explicit local observation seams.
// Actual Game proves scheduling transparency; fake GPU snapshots only prove
// metadata transport. No native preparation, GL, audio or browser is executed.
const appURL=new URL('../dist/app.js',import.meta.url),loopURL=new URL('../dist/qa-app-loop.js',import.meta.url);
const app=await readFile(appURL,'utf8'),loop=await readFile(loopURL,'utf8');
const originalApp=await readFile(new URL('../../../qa/app-gpu-alpha-20261018/app-before-gpu-alpha.txt',import.meta.url),'utf8');
const originalLoop=await readFile(new URL('../../../qa/app-gpu-alpha-20261018/qa-app-loop-before-gpu-alpha.txt',import.meta.url),'utf8');
const sha=text=>createHash('sha256').update(text).digest('hex');
const locationFor=(suffix='')=>new URL('http://127.0.0.1:8851/index.html?qa&qa-memory=app-gpu&qa-loop=1&qa-loop-count=180'+suffix);
const memory=query=>createQAStorage(query,()=>{throw Error('persistent storage forbidden');});
const state=game=>structuredClone({snapshot:game.snapshot(),random:game.random.getState(),visualRandom:game.visualRandom.getState(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash});
let serial=0;
const dataURL=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
function section(text,from,to){const start=text.indexOf(from),end=text.indexOf(to,start);assert.ok(start>=0&&end>start,from);return text.slice(start,end);}
async function bootstrap(text,{location=locationFor(),storage=memory(location.searchParams),fixture={count:180,snapshotValid:true}}={}){
 const calls=[],controller={mode:location.searchParams.get('qa-loop-gpu-alpha'),snapshot:()=>({testMetadataOnly:true}),stop(){}},profile={},actorInterpolation={},renderer={identity:'existing renderer'};
 const key='__appGPUAlphaBootstrap'+serial++,services={seedAppLoopQA(p,s,options){calls.push(['seed',p,s,options]);return fixture;},installAppGPUAlphaLaunchQA(r,options){calls.push(['install',r,options]);return controller;}};globalThis[key]=services;
 const stub=dataURL('const services=globalThis['+JSON.stringify(key)+'];export const {seedAppLoopQA,installAppGPUAlphaLaunchQA}=services;');
 let source=section(text,'let qaLoopModule=',"if(query.has('qa-memory')&&");
 for(const path of ['./qa-app-loop.js','./qa-app-gpu-alpha-launch.js'])source=source.replaceAll("'"+path+"'",JSON.stringify(stub));
 const moduleSource='import {isQAMemoryStorage} from '+JSON.stringify(new URL('../dist/qa-storage.js',import.meta.url).href)+';export async function execute({location,query,qaStorage,profile,actorInterpolation,renderer}){'+source+'return {qaLoopModule,qaLoopFixture,'+(text===originalApp?'qaGPUAlphaLaunch:null':'qaGPUAlphaLaunch')+'};}';
 try{const module=await import(dataURL(moduleSource)),result=await module.execute({location,query:location.searchParams,qaStorage:storage,profile,actorInterpolation,renderer});return{result,calls,controller,profile,actorInterpolation,renderer,storage,location};}finally{delete globalThis[key];}
}
function surface(){
 const nodes=new Map();for(const name of ['start','stop','status','report','proof'])nodes.set('#qa-loop-'+name,{textContent:'',src:'',listeners:new Map(),addEventListener(event,fn){this.listeners.set(event,fn);},click(){return this.listeners.get('click')?.();}});
 const panel={style:{},querySelector:key=>nodes.get(key)};return {nodes,document:{createElement:()=>panel,body:{append(node){assert.equal(node,panel);}}}};
}
async function environment({original=false,gpu=false}={},run){
 const dom=surface(),game=new Game({seed:774,missionId:'mission-01',weapon:'nailgun'}),events=[],factoryCalls=[],profiles=[];
 const gpuState={mode:'exact',nativeRendererFrame:3,reads:1,cells:12,readBytes:48,leaseActive:true,testMetadataOnly:true};
 const current={game,screen:null,accumulator:0,lastFrame:0,hidden:false},calls={frames:0,renders:0,events:[]},receiver={},token={returned:true};let simulation=advanceSimulation,clock=0,clockCalls=0;
 const renderer={liveEnemies:{identity:'existing rig'},canvas:{toDataURL:()=> 'data:image/mock;base64,proof'},render(){calls.renders++;return token;}},originalRender=renderer.render;
 const binding={name:'simulation.advance',get:()=>simulation,set:value=>{simulation=value;}};
 const read=()=>({...current,...(gpu?{gpuAlphaLaunch:structuredClone(gpuState)}:{})});
 const frame=function(now,argument){assert.equal(this,receiver);assert.equal(argument,token);calls.frames++;const delta=current.lastFrame?Math.min(.12,(now-current.lastFrame)/1000):0;current.lastFrame=now;current.accumulator+=delta;
  const result=simulation(game,{fireMode:'manual',shoot:true,aimX:game.player.x+350,aimY:game.player.y-250,moveX:.25,moveY:0},current.accumulator);current.accumulator=result.accumulator;calls.events.push(...structuredClone(game.drainEvents()));
  if(gpu){gpuState.nativeRendererFrame++;gpuState.reads++;gpuState.cells+=12;gpuState.readBytes+=48;gpuState.leaseActive=false;}return renderer.render();
 };
 const service=name=>{factoryCalls.push(name);const p={samples:[],beginFrame(meta){events.push(name+'.begin');this.current={...meta};},endFrame(){events.push(name+'.end');this.samples.push(this.current);this.current=null;},stop(){events.push(name+'.stop');return {samples:this.samples,unmeasured:[]};}};profiles.push(p);return p;};
 const key='__appGPUAlphaLoopServices'+serial++,services={createNativeFrameProfile:()=>service('native'),createFrameCostProfile:()=>service('cost'),createMovementProfile:()=>service('movement')};globalThis[key]=services;
 const stub=dataURL('const services=globalThis['+JSON.stringify(key)+'];export const {createNativeFrameProfile,createFrameCostProfile,createMovementProfile}=services;');
 const rewritten=(original?originalLoop:loop).replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_match,_quote,path)=>'from '+JSON.stringify(['./qa-native-frame-profile.js','./qa-frame-cost-profile.js','./qa-movement-profile.js'].includes(path)?stub:new URL(path,loopURL).href));
 let module;try{module=await import(dataURL(rewritten));}finally{delete globalThis[key];}
 const performanceDescriptor=Object.getOwnPropertyDescriptor(globalThis,'performance');Object.defineProperty(globalThis,'performance',{configurable:true,value:{now(){clockCalls++;return clock+=.125;}}});
 const env={module,dom,game,current,calls,events,factoryCalls,profiles,renderer,receiver,token,frame,read,binding,gpuState,install(suffix=''){const location=locationFor(suffix);this.installed=module.installAppLoopQA({document:dom.document,location,query:location.searchParams,storage:memory(location.searchParams),read,bindings:[binding],methods:[{object:renderer,key:'render',name:'renderer.render'}],renderer,fixture:{count:180,snapshotValid:true}});return this.installed;},assertRestored(){assert.equal(binding.get(),advanceSimulation);assert.equal(renderer.render,originalRender);assert.equal(Object.hasOwn(game,'tick'),false);assert.equal(Object.hasOwn(game,'drainEvents'),false);},get clockCalls(){return clockCalls;}};
 try{return await run(env);}finally{env.installed?.probe.stop('test-finally');if(performanceDescriptor)Object.defineProperty(globalThis,'performance',performanceDescriptor);else delete globalThis.performance;}
}
function manualRun(env){const installed=env.install('&qa-loop-cost=1&qa-loop-movement=counts'),wrapped=installed.wrapFrame(env.frame);env.dom.nodes.get('#qa-loop-start').click();for(const now of [1000,2000,3000])assert.equal(wrapped.call(env.receiver,now,env.token),env.token);env.dom.nodes.get('#qa-loop-stop').click();env.assertRestored();return{report:installed.probe.report,state:state(env.game),calls:structuredClone(env.calls),events:[...env.events],clockCalls:env.clockCalls};}

test('the original artifacts and product callback, launch commits and native adoption paths remain unchanged',()=>{
 assert.equal(sha(originalApp),'7c5108fd901e46cc99e2f77792c6c08481689a5b45410ff027a1929e1d158847');assert.equal(sha(originalLoop),'6e8c44d81248b9b4ec9e5036ca5cb247d2e2f96d272a924557f629c5762eb377');
 for(const [from,to]of [['function frame(now)', 'if(qaLoopModule&&qaLoopFixture)'],['async function start()', 'function persist()'],['async function continueRun()', 'function renderUI(']])assert.equal(section(app,from,to),section(originalApp,from,to),from);
 assert.ok(app.includes("...(qaGPUAlphaLaunch?{gpuAlphaLaunch:qaGPUAlphaLaunch.snapshot()}:{})"));
 assert.ok(app.includes("window.addEventListener('pagehide',()=>{pause();checkpoint();qaGPUAlphaLaunch?.stop();});"));
});

test('the exact app bootstrap installs the helper only after a valid guarded fixture and recognized mode',async()=>{
 for(const mode of ['cpu','exact']){const env=await bootstrap(app,{location:locationFor('&qa-loop-gpu-alpha='+mode)});assert.deepEqual(env.calls.map(call=>call[0]),['seed','install']);const [_name,renderer,options]=env.calls[1];assert.equal(renderer,env.renderer);assert.equal(options.storage,env.storage);assert.equal(options.fixture,env.result.qaLoopFixture);assert.equal(options.location,env.location);assert.equal(options.query,env.location.searchParams);assert.equal(env.result.qaGPUAlphaLaunch,env.controller);}
 for(const mode of ['', '&qa-loop-gpu-alpha=unknown','&qa-loop-gpu-alpha=EXACT']){const env=await bootstrap(app,{location:locationFor(mode)});assert.deepEqual(env.calls.map(call=>call[0]),['seed']);assert.equal(env.result.qaGPUAlphaLaunch,null);}
 const noFixture=await bootstrap(app,{location:locationFor('&qa-loop-gpu-alpha=exact'),fixture:null});assert.deepEqual(noFixture.calls.map(call=>call[0]),['seed']);assert.equal(noFixture.result.qaGPUAlphaLaunch,null);
 const trap={get getItem(){throw Error('persistent read');},get setItem(){throw Error('persistent write');}};
 for(const location of [new URL('http://127.0.0.1:8806/?qa&qa-memory&qa-loop=1&qa-loop-gpu-alpha=exact'),new URL('http://example.com:8851/?qa&qa-memory&qa-loop=1&qa-loop-gpu-alpha=exact'),new URL('http://localhost:8851/?qa&qa-memory&qa-loop-gpu-alpha=exact')])assert.deepEqual((await bootstrap(app,{location})).calls,[]);
 assert.deepEqual((await bootstrap(app,{storage:trap,location:locationFor('&qa-loop-gpu-alpha=exact')})).calls,[]);assert.equal(isQAMemoryStorage(trap),false);
 const baseline=await bootstrap(originalApp),candidate=await bootstrap(app);assert.deepEqual(candidate.actorInterpolation,baseline.actorInterpolation);assert.deepEqual(candidate.result.qaLoopFixture,baseline.result.qaLoopFixture);assert.equal(candidate.result.qaGPUAlphaLaunch,null);
});

test('without GPU or autostart flags the complete old manual report, clocks and actual Game results stay identical',async()=>{
 const baseline=await environment({original:true},manualRun),candidate=await environment({},manualRun);assert.deepEqual(candidate,baseline);
 for(const context of [candidate.report.initialContext,candidate.report.finalContext,...candidate.report.samples.flatMap(sample=>[sample.before,sample.after])])assert.equal(Object.hasOwn(context,'gpuAlphaLaunch'),false);
});

test('autostart lets the original callback drain pending resume events before observing the next playing callback once',async()=>{
 await environment({},env=>{
  const installed=env.install('&qa-loop-autostart=1&qa-loop-cost=1&qa-loop-movement=counts'),wrapped=installed.wrapFrame(env.frame);
  env.current.screen='menu';assert.equal(wrapped.call(env.receiver,1000,env.token),env.token);assert.equal(installed.probe.active,false);assert.deepEqual(env.factoryCalls,[]);
  env.current.screen=null;env.game.pause();wrapped.call(env.receiver,2000,env.token);assert.equal(installed.probe.active,false);env.current.hidden=true;wrapped.call(env.receiver,3000,env.token);assert.equal(installed.probe.active,false);
  env.current.hidden=false;env.game.resume();assert.deepEqual(env.game.events,[{type:'resume'}]);const beforeCalls=env.calls.frames;assert.equal(wrapped.call(env.receiver,4000,env.token),env.token);assert.equal(env.calls.frames,beforeCalls+1,'one original callback naturally processes resume');assert.equal(installed.probe.active,false);assert.deepEqual(env.factoryCalls,[]);assert.equal(env.game.events.length,0);assert.ok(env.calls.events.some(event=>event.type==='resume'));
  assert.equal(wrapped.call(env.receiver,5000,env.token),env.token);assert.equal(installed.probe.active,true);assert.deepEqual(env.factoryCalls,['native','cost','movement']);assert.equal(installed.probe.samples.length,1);assert.equal(installed.probe.samples[0].frame,0);assert.equal(installed.probe.samples[0].rawDeltaMs,1000);assert.equal(installed.probe.samples[0].clampedDeltaMs,120);assert.ok(installed.probe.samples[0].tickCount>=7&&installed.probe.samples[0].tickCount<=8);
  const reported=installed.probe.stop('manual');assert.equal(reported.samples.length,1);assert.equal(reported.autostart.startedAutomatically,true);assert.match(reported.autostart.note,/첫 재개 이벤트 처리 뒤 playing callback 자동 1회/);assert.ok(!reported.eventStream.some(event=>event.type==='resume'||event.type==='pause'),'pre-probe events are observed by the original app, not deleted or replay-filtered');env.assertRestored();assert.equal(wrapped.call(env.receiver,6000,env.token),env.token);assert.equal(installed.probe.samples.length,1);assert.deepEqual(env.factoryCalls,['native','cost','movement'],'automatic start is not retriggered after stop');
  assert.equal(env.calls.frames,6);assert.equal(env.calls.renders,6);
 });
});

test('automatic observation preserves actual catch-up state/events and optional pre-probe GPU counters as snapshots',async()=>{
 const schedule=[1000,2000,3000];
 const run=async(auto,gpu)=>environment({gpu},env=>{
  const installed=env.install((auto?'&qa-loop-autostart=1':'')+'&qa-loop-cost=1'),wrapped=installed.wrapFrame(env.frame);if(!auto)env.dom.nodes.get('#qa-loop-start').click();
  for(const now of schedule)assert.equal(wrapped.call(env.receiver,now,env.token),env.token);const report=installed.probe.stop('test-complete');env.assertRestored();return{report,state:state(env.game),calls:structuredClone(env.calls)};
 });
 const baseline=await run(false,false),candidate=await run(true,true);assert.deepEqual(candidate.state,baseline.state);assert.deepEqual(candidate.calls,baseline.calls);assert.deepEqual(candidate.report.tickSchedule,baseline.report.tickSchedule);assert.deepEqual(candidate.report.eventStream,baseline.report.eventStream);assert.equal(candidate.report.callbacks,3);
 assert.equal(candidate.report.initialContext.gpuAlphaLaunch.nativeRendererFrame,3,'native work may precede the first playing observation');assert.equal(candidate.report.initialContext.gpuAlphaLaunch.reads,1);assert.equal(candidate.report.samples[0].before.gpuAlphaLaunch.cells,12);assert.equal(candidate.report.samples[0].after.gpuAlphaLaunch.cells,24);assert.equal(candidate.report.samples[0].before.gpuAlphaLaunch.leaseActive,true);assert.equal(candidate.report.samples[0].after.gpuAlphaLaunch.leaseActive,false);assert.equal(candidate.report.finalContext.gpuAlphaLaunch.readBytes,192);assert.notEqual(candidate.report.samples[0].before.gpuAlphaLaunch,candidate.report.samples[0].after.gpuAlphaLaunch);
});

test('manual start consumes the one-shot autostart and external methods survive stop; thrown original callbacks keep identity',async()=>{
 await environment({},env=>{
  const installed=env.install('&qa-loop-autostart=1'),wrapped=installed.wrapFrame(env.frame);env.dom.nodes.get('#qa-loop-start').click();wrapped.call(env.receiver,1000,env.token);
  const replacement=()=>env.token;env.renderer.render=replacement;installed.probe.stop('external');assert.equal(env.renderer.render,replacement);wrapped.call(env.receiver,2000,env.token);assert.deepEqual(env.factoryCalls,['native']);assert.equal(installed.probe.samples.length,1);assert.equal(env.binding.get(),advanceSimulation);
 });
 await environment({},env=>{
  const installed=env.install('&qa-loop-autostart=1&qa-loop-cost=1&qa-loop-movement=counts'),failure=new Error('original callback failure');let callbacks=0;
  const wrapped=installed.wrapFrame(function(now,argument){callbacks++;assert.equal(this,env.receiver);assert.equal(argument,env.token);throw failure;});assert.throws(()=>wrapped.call(env.receiver,1000,env.token),error=>error===failure);assert.equal(callbacks,1);assert.equal(installed.probe.report.reason,'frame-error');assert.equal(installed.probe.report.samples.length,1);assert.deepEqual(env.factoryCalls,['native','cost','movement']);env.assertRestored();
 });
});

test('pagehide keeps original pause/checkpoint calls and only stops the optional QA controller',async()=>{
 const callback=app.match(/window\.addEventListener\('pagehide',\(\)=>\{([^\n]+)\}\);/);assert.ok(callback);
 const module=await import(dataURL('export function hide(pause,checkpoint,qaGPUAlphaLaunch){'+callback[1]+'}'));
 const calls=[];module.hide(()=>calls.push('pause'),()=>calls.push('checkpoint'),null);assert.deepEqual(calls,['pause','checkpoint']);calls.length=0;module.hide(()=>calls.push('pause'),()=>calls.push('checkpoint'),{stop(){calls.push('stop');},dispose(){throw Error('adopted product rig must not be disposed by app integration');}});assert.deepEqual(calls,['pause','checkpoint','stop']);
});
