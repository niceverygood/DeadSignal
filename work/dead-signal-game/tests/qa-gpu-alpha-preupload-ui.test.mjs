import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createQAStorage,isQAMemoryStorage} from '../dist/qa-storage.js';

// Exercise the exact new installer in isolation. Importing the full authored
// QA page would execute its unrelated model/DOM setup. The comparison service
// is mocked here; these tests do not render, prepare a rig or prove GPU pixels.
const source=await readFile(new URL('../dist/qa-player-rig.js',import.meta.url),'utf8');
const before=await readFile(new URL('../../../qa/gpu-alpha-preupload-20261018/qa-player-rig-before-preupload.txt',import.meta.url),'utf8');
const begin='// BEGIN GPU ALPHA PREUPLOAD UI',end='// END GPU ALPHA PREUPLOAD UI';
const start=source.indexOf(begin),finish=source.indexOf(end,start);assert.ok(start>=0&&finish>start);
const installerSource=source.slice(start,finish);
const shim='import {createQAStorage} from '+JSON.stringify(new URL('../dist/qa-storage.js',import.meta.url).href)+';\n'+installerSource;
const {installGPUAlphaPreuploadQA}=await import('data:text/javascript;base64,'+Buffer.from(shim).toString('base64'));
const locationFor=suffix=>new URL('http://127.0.0.1:8851/qa-player-rig.html?qa=1&qa-memory=gpu-preupload'+(suffix??''));
const deferred=()=>{let resolve,reject;return {promise:new Promise((done,fail)=>{resolve=done;reject=fail;}),resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function environment({location=locationFor(),wait=Promise.resolve(),compare}={}){
 const nodes=[],appended=[],events=[],status={textContent:''},canvas={identity:'existing QA canvas'},sharedRig={identity:'existing native owner'},sharedPromise=wait;
 const renderer={liveEnemies:sharedRig,liveEnemiesPromise:sharedPromise},initialGame={identity:'original standalone Game',random:774,visualRandom:775},nextGame={identity:'returned isolated Game'};
 const current={ready:true,playing:false,renderer,canvas,game:initialGame};let imports=0,storageCreated=0,storageCalls=0,persistentCalls=0,readCalls=0,gameCommits=0,paints=0;
 const document={createElement(tag){const node={tag,style:{},disabled:false,children:[],append(...children){this.children.push(...children);}};nodes.push(node);return node;},querySelector(selector){assert.equal(selector,'nav');return {append(node){appended.push(node);}};},body:{append(node){appended.push(node);}}};
 const createStorage=(query,persistent)=>{storageCreated++;assert.equal(typeof persistent,'function');const storage=createQAStorage(query,()=>{persistentCalls++;return persistent();});for(const key of ['getItem','setItem','removeItem'])storage[key]=()=>{storageCalls++;throw Error('UI must not call storage methods');};return storage;};
 const comparison=compare??(async()=>({game:nextGame,report:{original56:[{comparisons:[{different:0,geometrySame:true,animationSame:true}]}],reports:[{identicalCombatState:true,identicalEvents:true},{identicalCombatState:true,identicalEvents:true}],note:'mock comparison; not GPU evidence'}}));
 const options={document,location,status,read(){readCalls++;return current;},createStorage,async loadComparison(){imports++;events.push('module');return {compareGPUAlphaPreupload:comparison};},beforeScenario:async info=>{events.push(['scenario',info]);},setGame(game){gameCommits++;current.game=game;events.push('game-commit');},paint(){paints++;assert.equal(renderer.liveEnemies,sharedRig,'the comparison service must restore its owner before the UI paints');assert.equal(renderer.liveEnemiesPromise,sharedPromise);events.push('paint');}};
 return {options,document,status,renderer,canvas,current,initialGame,nextGame,sharedRig,sharedPromise,nodes,appended,events,find:id=>nodes.find(node=>node.id===id),get imports(){return imports;},get storageCreated(){return storageCreated;},get storageCalls(){return storageCalls;},get persistentCalls(){return persistentCalls;},get readCalls(){return readCalls;},get gameCommits(){return gameCommits;},get paints(){return paints;}};
}
function originalWarmup(text){const from=text.indexOf('const gpuWarmupQA='),to=text.indexOf('const catalogIdsQA=',from);assert.ok(from>=0&&to>from);return text.slice(from,to);}

test('the new button is wired to the real helper and preserves the previous GPU warmup UI baseline',()=>{
 assert.equal(createHash('sha256').update(before).digest('hex'),'23eb025c9bd113ac53cc6915b81881548fe36367ac656ba489b4b7bc9c0d135b');
 assert.equal(originalWarmup(source),originalWarmup(before));
 assert.ok(installerSource.includes("loadComparison=()=>import('./qa-gpu-alpha-preupload.js')"));
 assert.ok(source.slice(finish+end.length).includes('installGPUAlphaPreuploadQA({document,location,status,read:()=>({ready,playing,renderer,canvas})'));
 assert.ok(source.slice(finish+end.length).includes("beforeScenario:async({weapon})=>{game=new Game({seed:774,missionId:'mission-01',weapon});await load();}"));
 assert.ok(source.slice(finish+end.length).includes('setGame:current=>{game=current;},paint:()=>paint()'));
 assert.ok(!/\b(?:localStorage|sessionStorage|getItem|setItem|removeItem|saveProfile|loadProfile|snapshot|tick|drainEvents|releaseUnused|forceContextLoss)\b/.test(installerSource),'the UI does not run saves, gameplay, model release or GPU work');
});

test('only explicit http loopback 8851 memory QA installs the button, without preloading a service or allocating storage',()=>{
 const noIO={get createElement(){throw Error('DOM before gate');}},noRead=()=>{throw Error('context before gate');},noFactory=()=>{throw Error('service before gate');};
 for(const address of ['http://127.0.0.1:8806/?qa&qa-memory','http://localhost:8852/?qa&qa-memory','https://localhost:8851/?qa&qa-memory','http://localhost.evil.example:8851/?qa&qa-memory','http://example.com:8851/?qa&qa-memory','http://localhost:8851/?qa','http://localhost:8851/?qa-memory'])assert.equal(installGPUAlphaPreuploadQA({document:noIO,location:new URL(address),read:noRead,createStorage:noFactory,loadComparison:noFactory}),null,address);
 for(const host of ['localhost','127.0.0.1','[::1]']){const env=environment({location:new URL(`http://${host}:8851/qa-player-rig.html?qa&qa-memory`)}),installed=installGPUAlphaPreuploadQA(env.options);assert.equal(installed.button.id,'gpu-alpha-preupload-qa');assert.equal(installed.button.textContent,'공통 텍스처 준비·GPU 알파·60·180적 검수');assert.equal(env.nodes.length,1);assert.equal(env.imports,0);assert.equal(env.storageCreated,0);assert.equal(env.readCalls,0);}
});

test('not-ready, playing and duplicate clicks perform no comparison or storage work',async()=>{
 const gate=deferred();let compareCalls=0;
 const env=environment({compare:async()=>{compareCalls++;await gate.promise;return {game:env.nextGame,report:{original56:[],reports:[]}};}}),{button}=installGPUAlphaPreuploadQA(env.options);
 env.current.ready=false;assert.equal(await button.onclick(),undefined);env.current.ready=true;env.current.playing=true;assert.equal(await button.onclick(),undefined);assert.equal(env.imports,0);assert.equal(env.storageCreated,0);
 env.current.playing=false;const pending=button.onclick();await turn();assert.equal(compareCalls,1);assert.equal(button.disabled,true);assert.equal(await button.onclick(),undefined);assert.equal(env.imports,1);assert.equal(env.storageCreated,1);gate.resolve();await pending;assert.equal(button.disabled,false);assert.equal(env.storageCalls,0);assert.equal(env.persistentCalls,0);
});

test('the UI awaits the existing native promise, passes a private branded Map and publishes only a completed restored comparison',async()=>{
 const nativeReady=deferred(),comparisonDone=deferred();let compareCalls=0,comparisonOptions,privateStorage;
 const env=environment({wait:nativeReady.promise,compare:async(renderer,canvas,options)=>{
  compareCalls++;assert.equal(renderer,env.renderer);assert.equal(canvas,env.canvas);assert.equal(renderer.liveEnemies,env.sharedRig);assert.equal(options.location,env.options.location);assert.equal(options.query.get('qa-memory'),'gpu-preupload');assert.equal(isQAMemoryStorage(options.storage),true);privateStorage=options.storage;comparisonOptions=options;
  const old=renderer.liveEnemies;renderer.liveEnemies={identity:'mock owned comparison rig'};
  try{await options.beforeScenario({count:60,weapon:'shotgun'});options.onProgress({phase:'quality',type:'walker'});assert.equal(env.status.textContent,'walker · 원본56자세 별도 품질 검수');options.onImage({phase:'quality',type:'walker',src:'data:image/mock;base64,original'});options.onProgress({phase:'combat',count:180,weapon:'nailgun',gpuEnabled:true});assert.match(env.status.textContent,/180적.*true/);await comparisonDone.promise;return {game:env.nextGame,report:{original56:[{comparisons:[{different:0,geometrySame:true,animationSame:true}]}],reports:[{identicalCombatState:true,identicalEvents:true}],note:'mock; source pixels and GPU not measured'}};}
  finally{renderer.liveEnemies=old;}
 }}),{button}=installGPUAlphaPreuploadQA(env.options),pending=button.onclick();
 await turn();assert.equal(env.imports,0);assert.equal(env.storageCreated,0);assert.equal(compareCalls,0);assert.equal(button.disabled,true);assert.equal(env.current.game,env.initialGame);
 nativeReady.resolve();await turn();assert.equal(env.imports,1);assert.equal(env.storageCreated,1);assert.equal(compareCalls,1);assert.equal(env.gameCommits,0);assert.equal(env.paints,0);assert.equal(env.find('gpu-alpha-preupload-report'),undefined);assert.ok(env.nodes.some(node=>node.tag==='img'&&node.alt==='GPU 알파 원본 품질 walker'&&node.src==='data:image/mock;base64,original'));
 comparisonDone.resolve();const result=await pending;assert.equal(env.current.game,env.nextGame);assert.equal(env.renderer.liveEnemies,env.sharedRig);assert.equal(env.gameCommits,1);assert.equal(env.paints,1);assert.equal(button.disabled,false);assert.equal(env.find('gpu-alpha-preupload-report').textContent,JSON.stringify(result.report,null,2));assert.equal(env.nodes.find(node=>node.tag==='details').open,undefined,'large raw JSON remains collapsed');assert.match(env.status.textContent,/완료.*동일 true.*56자세 동일 true.*독립 메모리 QA.*앱 저장 미검수.*GPU 기본 OFF/);assert.equal(env.storageCalls,0);assert.equal(env.persistentCalls,0);
 assert.equal(comparisonOptions.beforeScenario,env.options.beforeScenario);assert.deepEqual(env.events.slice(-2),['game-commit','paint']);assert.notEqual(privateStorage,env.initialGame);
});

test('native promise and lazy module failures keep the original Game and error identity and re-enable the button',async()=>{
 for(const phase of ['native','module']){
  const failure=new Error(phase+' failure'),env=environment();
  if(phase==='native')env.renderer.liveEnemiesPromise=Promise.reject(failure);else env.options.loadComparison=async()=>{throw failure;};
  const {button}=installGPUAlphaPreuploadQA(env.options);
  await assert.rejects(button.onclick(),error=>error===failure);assert.equal(button.disabled,false);assert.match(env.status.textContent,new RegExp('중단.*'+phase+' failure'));assert.equal(env.current.game,env.initialGame);assert.equal(env.imports,0);assert.equal(env.storageCreated,0);assert.equal(env.gameCommits,0);assert.equal(env.paints,0);assert.equal(env.storageCalls,0);
 }
});

test('a comparison failure is not published or swallowed and the restored shared owner is untouched by UI cleanup',async()=>{
 const failure=new Error('controlled helper failure');let privateStorage;
 const env=environment({compare:async(renderer,_canvas,options)=>{privateStorage=options.storage;const old=renderer.liveEnemies;renderer.liveEnemies={identity:'mock candidate'};try{options.onProgress({phase:'combat',count:60,gpuEnabled:true});throw failure;}finally{renderer.liveEnemies=old;}}}),{button}=installGPUAlphaPreuploadQA(env.options);
 await assert.rejects(button.onclick(),error=>error===failure);assert.equal(button.disabled,false);assert.equal(env.renderer.liveEnemies,env.sharedRig);assert.equal(env.renderer.liveEnemiesPromise,env.sharedPromise);assert.equal(env.current.game,env.initialGame);assert.equal(env.gameCommits,0);assert.equal(env.paints,0);assert.equal(env.find('gpu-alpha-preupload-report'),undefined);assert.match(env.status.textContent,/검수 중단.*controlled helper failure/);assert.equal(isQAMemoryStorage(privateStorage),true);assert.equal(env.storageCreated,1);assert.equal(env.storageCalls,0);assert.equal(env.persistentCalls,0);
});
