import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePlayerAlphaGeometry,installPlayerAlphaGeometryQA} from '../dist/qa-player-alpha-geometry.js';
import {createQAStorage,isQAMemoryStorage} from '../dist/qa-storage.js';

// These route/UI fixtures do not create a Canvas, native rig or GPU. A capture
// stub is explicitly injected; it proves orchestration, never native quality.
const validURL=()=>new URL('http://127.0.0.1:8851/?qa&qa-memory=alpha-geometry-test&qa-player-alpha-geometry=1');
const invalidURLs=()=>[
  new URL('http://127.0.0.1:8806/?qa&qa-memory=x&qa-player-alpha-geometry=1'),
  new URL('https://127.0.0.1:8851/?qa&qa-memory=x&qa-player-alpha-geometry=1'),
  new URL('http://example.com:8851/?qa&qa-memory=x&qa-player-alpha-geometry=1'),
  new URL('http://localhost:8851/?qa-memory=x&qa-player-alpha-geometry=1'),
  new URL('http://localhost:8851/?qa&qa-player-alpha-geometry=1'),
  new URL('http://localhost:8851/?qa&qa-memory=x'),
  new URL('http://localhost:8851/?qa&qa-memory=x&qa-player-alpha-geometry=true'),
];
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function flush(){for(let index=0;index<8;index++)await Promise.resolve();}
class Element{
  constructor(tag,document){this.tagName=tag.toUpperCase();this.document=document;this.children=[];this.style={};this.dataset={};this.disabled=false;this.textHistory=[];this._textContent='';this.className='';this.hidden=false;this.open=false;}
  get textContent(){return this._textContent;}
  set textContent(value){this._textContent=value;this.textHistory.push(value);}
  append(...nodes){this.children.push(...nodes);}
  appendChild(node){this.children.push(node);return node;}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(key,value){this[key]=String(value);}
  remove(){this.removed=true;}
}
function uiFixture(overrides={}){
  const nodes=[],listeners=new Map(),counts={loads:0,storage:0,captures:0};
  const document={
    body:null,
    createElement(tag){const node=new Element(tag,document);nodes.push(node);return node;},
    getElementById(id){return nodes.find(node=>node.id===id)??null;},
    querySelector(selector){if(selector==='nav')return null;if(selector.startsWith('#'))return this.getElementById(selector.slice(1));return null;},
  };
  document.body=document.createElement('body');
  const eventTarget={
    addEventListener(name,fn){assert.equal(name,'pagehide');if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
  };
  const pixels=new Uint8ClampedArray(256*256*4);pixels.set([10,20,30,8],(55*256+91)*4);
  const result={report:{available:true,complete:true,injected:true,performance:{accepted:false},cleanup:{complete:true}},rawFrames:[{weapon:'nailgun',index:0,poseLabel:'idle',rgba:pixels}]};
  let captureArgs;
  const options={
    document,location:validURL(),eventTarget,
    createStorage(query,persistent){counts.storage++;assert.ok(query.has('qa-memory'));if(typeof persistent==='function')assert.throws(persistent,/persistent|storage|forbidden/i);return createQAStorage(query,()=>{assert.fail('persistent storage must never be used');});},
    loadCapture:async()=>{
      counts.loads++;
      return{capturePlayerAlphaGeometry:async args=>{
        counts.captures++;captureArgs=args;assert.equal(args.document,document);assert.equal(isQAMemoryStorage(args.storage),true);assert.ok(args.signal instanceof AbortSignal);
        args.onProgress?.({phase:'capture',index:3,total:12});
        for(let index=0;index<5;index++)args.onImage?.({src:'data:image/png;base64,AA==',alt:'controlled '+index});
        return result;
      }};
    },
    ...overrides,
  };
  const handle=installPlayerAlphaGeometryQA(options);
  return{handle,options,document,nodes,listeners,counts,result,pixels,get captureArgs(){return captureArgs;},byId:id=>document.getElementById(id),hide(){for(const fn of[...(listeners.get('pagehide')??[])])fn();}};
}
const activeListeners=f=>[...f.listeners.values()].reduce((count,items)=>count+items.size,0);

test('worker and installer reject unsupported origins/flags before DOM, dependencies, source loads or persistent storage',async()=>{
  for(const location of invalidURLs()){
    let reads=0;
    const poison=()=>{reads++;throw Error('gate must precede all capture effects');};
    const options={location,query:location.searchParams};
    for(const key of['document','testDeps','now','onProgress','onImage','createStorage','loadCapture','eventTarget'])Object.defineProperty(options,key,{get:poison});
    assert.equal(installPlayerAlphaGeometryQA(options),null);
    const result=await capturePlayerAlphaGeometry(options);
    assert.equal(result.report.available,false);
    assert.equal(result.report.complete,false);
    assert.equal(reads,0);
  }
});

test('a forged storage object cannot pass the worker brand gate or reach its injected rig dependencies',async()=>{
  const location=validURL();
  for(const storage of[new Map(),{},null,undefined]){
    let reads=0;
    const options={location,query:location.searchParams,storage};
    for(const key of['document','testDeps','now','onProgress','onImage'])Object.defineProperty(options,key,{get(){reads++;throw Error('genuine memory gate before capture dependencies');}});
    const result=await capturePlayerAlphaGeometry(options);
    assert.equal(result.report.available,false);
    assert.equal(result.report.complete,false);
    assert.equal(reads,0);
  }
  let constructors=0;
  const testDeps={Cache:{enabled:true}};
  for(const key of['LivePlayerRig','ProductionArt','createOwnedCleanupTracker'])Object.defineProperty(testDeps,key,{get(){constructors++;throw Error('shared-cache refusal before owned construction');}});
  const storage=createQAStorage(location.searchParams,()=>assert.fail('no persistent storage'));
  let captured;
  await assert.rejects(capturePlayerAlphaGeometry({location,query:location.searchParams,storage,document:{},testDeps}),error=>{
    captured=error;
    assert.equal(error.message,'player-alpha-geometry-shared-three-cache-unsupported');
    return true;
  });
  assert.equal(constructors,0);
  assert.equal(captured.report.available,true);
  assert.equal(captured.report.injected,true);
  assert.equal(captured.report.complete,false);
  assert.equal(captured.report.captured,0);
  assert.deepEqual(captured.rawFrames,[]);
});

test('one idle click lazily captures into genuine memory and exports rawRGBA once with at most two proof images',async()=>{
  const f=uiFixture();
  assert.ok(f.handle?.button);
  assert.equal(f.counts.loads,0);assert.equal(f.counts.storage,1);assert.equal(f.counts.captures,0);
  f.handle.button.disabled=true;await f.handle.button.onclick();f.handle.button.disabled=false;
  assert.equal(f.counts.loads,0,'a disabled button must not launch a capture');
  const value=await f.handle.button.onclick();
  assert.deepEqual(value,{report:f.result.report});
  assert.deepEqual({loads:f.counts.loads,storage:f.counts.storage,captures:f.counts.captures},{loads:1,storage:1,captures:1});
  assert.equal(f.handle.button.disabled,false);assert.equal(activeListeners(f),0);
  const shown=JSON.parse(f.byId('player-alpha-geometry-report').textContent);
  assert.deepEqual(shown,f.result.report);
  assert.equal(f.byId('player-alpha-geometry-proof').children.length,2);
  const raw=JSON.parse(f.byId('player-alpha-geometry-raw').textContent);
  assert.deepEqual({version:raw.version,width:raw.width,height:raw.height,format:raw.format},{version:1,width:256,height:256,format:'RGBA8'});
  assert.equal(raw.frames.length,1);
  assert.equal(raw.frames[0].weapon,'nailgun');assert.equal(raw.frames[0].index,0);assert.equal(raw.frames[0].poseLabel,'idle');
  assert.deepEqual(new Uint8ClampedArray(Buffer.from(raw.frames[0].rgbaBase64,'base64')),f.pixels);
  assert.equal(f.nodes.filter(node=>node.id==='player-alpha-geometry-raw').length,1,'one raw export surface per installed route');
  assert.equal(f.byId('player-alpha-geometry-raw').textHistory.filter(Boolean).length,1,'one nonempty raw export per capture');
  assert.match(f.byId('player-alpha-geometry-status').textContent,/완료/);
  const before=f.nodes.length,duplicate=installPlayerAlphaGeometryQA(f.options);
  assert.ok(duplicate===null||duplicate===f.handle,'duplicate route must not create an unrelated controller');
  assert.equal(f.nodes.length,before);
  assert.equal(f.counts.loads,1);
});

test('duplicate in-flight clicks and pagehide during import abort without starting a late worker or updating proof/raw UI',async()=>{
  const pending=deferred();let workers=0;
  const f=uiFixture({loadCapture:()=>{f.counts.loads++;return pending.promise;}});
  const run=f.handle.button.onclick();
  assert.equal(f.handle.button.disabled,true);
  await f.handle.button.onclick();
  assert.equal(f.counts.loads,1);
  f.hide();
  pending.resolve({capturePlayerAlphaGeometry:async()=>{workers++;return f.result;}});
  await run;
  assert.equal(workers,0);assert.equal(f.counts.storage,1);
  assert.equal(f.byId('player-alpha-geometry-proof').children.length,0);
  assert.equal(f.byId('player-alpha-geometry-raw').textContent,'');
  assert.equal(f.byId('player-alpha-geometry-report').textContent,'');
  assert.equal(f.handle.button.disabled,false);assert.equal(activeListeners(f),0);
});

test('pagehide after capture starts suppresses late output, while a real failed capture preserves its partial report/cleanup/raw once',async()=>{
  const pending=deferred();let args;
  const f=uiFixture({loadCapture:async()=>({capturePlayerAlphaGeometry:async value=>{args=value;return pending.promise;}})});
  const run=f.handle.button.onclick();await flush();assert.ok(args);
  f.hide();assert.equal(args.signal.aborted,true);
  args.onProgress?.({phase:'late'});args.onImage?.({src:'late-native-image',alt:'late'});
  pending.resolve(f.result);await run;
  assert.equal(f.byId('player-alpha-geometry-proof').children.length,0);
  assert.equal(f.byId('player-alpha-geometry-raw').textContent,'');
  assert.equal(f.byId('player-alpha-geometry-report').textContent,'');
  assert.equal(activeListeners(f),0);

  const marker=Object.assign(Error('controlled partial native capture failure'),{
    report:{available:true,complete:false,error:'controlled partial native capture failure',cleanup:{complete:false,latePending:1}},
    cleanup:{complete:false,latePending:1},
    rawFrames:[{weapon:'shotgun',index:4,poseLabel:'attack',rgba:new Uint8ClampedArray(256*256*4)}],
  });
  const broken=uiFixture({loadCapture:async()=>({capturePlayerAlphaGeometry:async()=>{throw marker;}})});
  await broken.handle.button.onclick();
  const shown=JSON.parse(broken.byId('player-alpha-geometry-report').textContent);
  assert.equal(shown.error,marker.message);
  assert.deepEqual(shown.report,marker.report);
  assert.deepEqual(shown.report.cleanup,marker.cleanup);
  const raw=JSON.parse(broken.byId('player-alpha-geometry-raw').textContent);
  assert.equal(raw.frames.length,1);assert.equal(raw.frames[0].weapon,'shotgun');
  assert.equal(Buffer.from(raw.frames[0].rgbaBase64,'base64').length,256*256*4);
  assert.equal(broken.byId('player-alpha-geometry-raw').textHistory.filter(Boolean).length,1);
  assert.equal(broken.handle.button.disabled,false);assert.equal(activeListeners(broken),0);
  assert.equal(broken.nodes.filter(node=>node.id==='player-alpha-geometry-raw').length,1);
});
