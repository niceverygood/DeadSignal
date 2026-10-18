import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installBossActionTimelineQA} from '../dist/qa-boss-action-timeline-ui.js';
import {createQAStorage,isQAMemoryStorage} from '../dist/qa-storage.js';

// Stored-image/UI mocks only. No Game, source rig, GPU or PNG decoder runs.
const url=()=>new URL('http://localhost:8851/?qa&qa-memory=timeline-ui&qa-boss-owned-cleanup=1&qa-boss-action-timeline=1');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.attributes=new Map();this.value='';this.disabled=false;this.textHistory=[];this._text='';this.width=0;this.height=0;this.naturalWidth=4096;this.naturalHeight=512;this.draws=[];}
 set textContent(value){this._text=value;this.textHistory.push(value);}
 get textContent(){return this._text;}
 set src(value){this.attributes.set('src',value);}
 get src(){return this.attributes.get('src')??'';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(key,value){this.attributes.set(key,String(value));}
 getAttribute(key){return this.attributes.get(key)??null;}
 removeAttribute(key){this.attributes.delete(key);}
 getContext(kind){assert.equal(kind,'2d');return{clearRect:(...args)=>this.draws.push(['clear',...args]),drawImage:(...args)=>this.draws.push(['draw',...args])};}
 decode(){return Promise.resolve();}
}
function frames(){return[
 ['main',0,'windup',0],['main',.864,'windup',.72],['main',1.2,'recover',0],['main',1.225,'recover',.1],['main',1.4,'recover',.8],['main',1.5,'recover',1],
 ['hit',10,'hit',0],['hit',10.1,'hit',1],['death',20,'death',0],['death',20.1,'death',1],
].map(([branch,time,pose,progress],index)=>({index,cellIndex:index,branch,label:pose+'-'+index,time,elapsedMs:(time-(branch==='main'?0:branch==='hit'?10:20))*1000,pose,progress,hitFlash:branch==='hit'?.2:0,deathAge:branch==='death'?time-20:0}));}
function fixture(overrides={}){
 const nodes=[],replacements=new Map(),listeners=new Set(),rafs=new Map(),counts={storage:0,loads:0,workers:0,decodes:0,scheduled:0,cancelled:0};let nextRAF=1,args;
 const document={body:null,createElement(tag){const node=new Element(tag);nodes.push(node);return node;},getElementById(id){return replacements.get(id)??nodes.find(node=>node.id===id)??null;},querySelector(selector){assert.equal(selector,'nav');return nav;}};
 document.body=document.createElement('body');const nav=document.createElement('nav');
 const eventTarget={addEventListener(name,fn){assert.equal(name,'pagehide');listeners.add(fn);},removeEventListener(name,fn){assert.equal(name,'pagehide');listeners.delete(fn);}};
 const preview={key:'boss-02-final',src:'data:image/png;base64,AA==',width:4096,height:512,cellWidth:512,cellHeight:256,columns:8,rows:2,frames:frames()};
 const manifest=Object.freeze({assets:Object.freeze({})}),result={report:{available:true,complete:true,temporalObservation:{complete:true,pairedFrames:10},cleanup:{complete:true}}};
 const options={document,location:url(),eventTarget,
  createStorage(query,persistent){counts.storage++;assert.throws(persistent,/boss-action-timeline-persistent-storage-forbidden/);return createQAStorage(query,persistent);},
  requestFrame(fn){const id=nextRAF++;rafs.set(id,fn);counts.scheduled++;return id;},cancelFrame(id){rafs.delete(id);counts.cancelled++;},
  decodeImage:async image=>{counts.decodes++;assert.equal(image.id,'boss-action-timeline-atlas');},
  loadModules:async()=>{counts.loads++;return{productionManifest:manifest,compareBossActionLayerOwned:async(caller,input)=>{
   counts.workers++;args=input;assert.equal(caller.productionArt.manifest,manifest);assert.equal(Object.isFrozen(caller),true);assert.equal(Object.isFrozen(caller.productionArt),true);
   assert.equal(isQAMemoryStorage(input.storage),true);assert.deepEqual(input.bossKeys,['boss-02-final']);assert.equal(input.timelineObservation,true);assert.equal(Object.hasOwn(input,'onImage'),false);
   input.onProgress({phase:'timeline',index:0});
   for(let i=0;i<2;i++)input.onTimelineImage({key:'boss-02-final',src:'data:image/png;base64,AA==',alt:'original native sheet'});
   await input.onTimelinePreview(preview);return result;
  }};},...overrides};
 const handle=installBossActionTimelineQA(options);
 return{handle,options,nodes,replacements,listeners,rafs,counts,preview,manifest,result,document,get args(){return args;},byId:id=>document.getElementById('boss-action-timeline-'+id),hide(){for(const fn of [...listeners])fn();},stepRAF(timestamp){const entry=rafs.entries().next().value;assert.ok(entry,'one owned rAF expected');rafs.delete(entry[0]);entry[1](timestamp);}};
}

test('timeline dual gate and memory brand precede all DOM, import, playback or persistent effects',async()=>{
 for(const search of['?qa&qa-memory=x&qa-boss-owned-cleanup=1','?qa&qa-memory=x&qa-boss-action-timeline=1','?qa&qa-memory=x&qa-boss-owned-cleanup=1&qa-boss-action-timeline=true','?qa-memory=x&qa-boss-owned-cleanup=1&qa-boss-action-timeline=1','?qa&qa-boss-owned-cleanup=1&qa-boss-action-timeline=1']){
  const location=url();location.search=search;let reads=0;const options={location};for(const key of['document','eventTarget','createStorage','loadModules','decodeImage','requestFrame','cancelFrame'])Object.defineProperty(options,key,{get(){reads++;throw Error('invalid gate effects');}});
  assert.equal(installBossActionTimelineQA(options),null);assert.equal(reads,0);
 }
 for(const location of[new URL('http://127.0.0.1:8806/'+url().search),new URL('https://localhost:8851/'+url().search),new URL('http://example.com:8851/'+url().search)]){
  assert.equal(installBossActionTimelineQA({location,get document(){assert.fail('unsupported origin touched document');}}),null);
 }
 assert.equal(installBossActionTimelineQA({location:url(),createStorage:()=>new Map(),get document(){assert.fail('forged brand touched document');}}),null);
 const source=await readFile(new URL('../dist/qa-boss-action-timeline-ui.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/import\s.*(?:engine\.js|renderer\.js|qa-player-rig\.js)/);assert.doesNotMatch(source,/localStorage\.|\.tick\s*\(|\.render\s*\(/);
});

test('fixed boss02 lazy capture stores one atlas, shows proof before raw JSON and never autoplays',async()=>{
 const f=fixture();assert.deepEqual(f.counts,{storage:1,loads:0,workers:0,decodes:0,scheduled:0,cancelled:0});assert.equal(f.handle.button.textContent,'내려찍기 동작 연결 검수');
 assert.equal(installBossActionTimelineQA(f.options),null);assert.equal(f.nodes.filter(node=>node.id==='boss-action-timeline-qa').length,1);
 const value=await f.handle.button.onclick();assert.equal(f.counts.workers,1);assert.equal(f.counts.decodes,1);assert.equal(f.counts.scheduled,0);assert.equal(f.handle.previewState().ready,true);assert.equal(f.handle.previewState().frameCount,10);
 assert.equal(f.byId('atlas').hidden,true);assert.equal(f.byId('atlas').getAttribute('src'),f.preview.src);assert.equal(f.byId('preview').width,512);assert.equal(f.byId('preview').height,256);
 assert.equal(f.byId('proof').children.length,1);assert.equal(f.byId('preview').draws.filter(call=>call[0]==='draw').length,1);
 const details=f.nodes.find(node=>node.tagName==='DETAILS');assert.ok(f.document.body.children.indexOf(f.byId('proof'))<f.document.body.children.indexOf(details));
 const shown=JSON.parse(f.byId('report').textContent);assert.equal(shown.temporalObservation.pairedFrames,10);assert.equal(shown.previewUI.running,false);assert.equal(JSON.stringify(shown).includes('data:image'),false);assert.deepEqual(value.report,shown);
 assert.equal(f.byId('report').textHistory.filter(text=>text.startsWith('{')).length,1);assert.equal(f.listeners.size,1,'the UI still owns displayed atlas until stop/pagehide');
 f.handle.stop();assert.equal(f.listeners.size,0);
});

test('play, step, branch and boundary seeks draw only stored cells and pagehide cancels and drops UI resources',async()=>{
 const f=fixture();await f.handle.button.onclick();
 f.handle.peakButton.onclick();assert.equal(f.handle.previewState().currentIndex,1);
 f.handle.transitionButton.onclick();assert.equal(f.handle.previewState().currentIndex,3);
 f.handle.stepButton.onclick();assert.equal(f.handle.previewState().currentIndex,4);
 f.handle.branch.value='hit';f.handle.branch.onchange();assert.equal(f.handle.previewState().currentIndex,6);
 f.handle.playButton.onclick();assert.equal(f.handle.previewState().playing,true);assert.equal(f.rafs.size,1);
 f.stepRAF(1000);f.stepRAF(1200);assert.equal(f.handle.previewState().currentIndex,7);assert.equal(f.handle.previewState().playing,false);assert.equal(f.rafs.size,0);
 f.handle.branch.value='death';f.handle.branch.onchange();assert.equal(f.handle.previewState().currentIndex,8);
 f.handle.playButton.onclick();assert.equal(f.rafs.size,1);f.hide();
 assert.equal(f.rafs.size,0);assert.equal(f.handle.previewState().stopped,true);assert.equal(f.handle.previewState().frameCount,0);assert.equal(f.byId('atlas').getAttribute('src'),null);assert.equal(f.byId('preview').width,0);assert.equal(f.byId('preview').height,0);assert.equal(f.listeners.size,0);
 for(const draw of f.byId('preview').draws.filter(call=>call[0]==='draw')){assert.equal(draw[1],f.byId('atlas'));assert.equal(draw.length,10);assert.equal(draw[4],512);assert.equal(draw[5],256);assert.deepEqual(draw.slice(6),[0,0,512,256]);}
 assert.equal(f.counts.workers,1);assert.equal(f.counts.loads,1);
});

test('duplicates, cancellation and late decode cannot revive preview or overlap a still-retiring worker',async()=>{
 const decoded=deferred(),finished=deferred();let input,loads=0;
 const f=fixture({decodeImage:()=>decoded.promise,loadModules:async()=>{loads++;return{productionManifest:{assets:{}},compareBossActionLayerOwned:async(_,args)=>{input=args;await args.onTimelinePreview(f.preview);await finished.promise;return f.result;}};}});
 const run=f.handle.button.onclick();await flush();assert.ok(input);assert.equal(f.byId('atlas').getAttribute('src'),f.preview.src);
 await f.handle.button.onclick();assert.equal(loads,1);
 f.handle.cancelButton.onclick();assert.equal(input.signal.aborted,true);assert.equal(f.byId('atlas').getAttribute('src'),null);assert.equal(f.byId('preview').width,0);assert.equal(f.handle.button.disabled,true,'owned worker cleanup must settle before another capture');
 decoded.resolve();await flush();await f.handle.button.onclick();assert.equal(loads,1);assert.equal(f.handle.previewState().ready,false);
 finished.resolve();assert.equal(await run,undefined);assert.equal(f.handle.button.disabled,false);assert.equal(f.byId('report').textContent,'');assert.equal(f.handle.previewState().frameCount,0);assert.equal(f.rafs.size,0);f.handle.stop();
});

test('owner replacement cancels decode/playback while decode failures preserve raw worker evidence',async()=>{
 const decoded=deferred();let input;
 const f=fixture({decodeImage:()=>decoded.promise,loadModules:async()=>({productionManifest:{assets:{}},compareBossActionLayerOwned:async(_,args)=>{input=args;await args.onTimelinePreview(f.preview);return f.result;}})});
 const run=f.handle.button.onclick();await flush();const foreign=new Element('img');foreign.src='foreign';f.replacements.set('boss-action-timeline-atlas',foreign);decoded.resolve();assert.equal(await run,undefined);
 assert.equal(input.signal.aborted,true);assert.equal(foreign.src,'foreign');assert.equal(f.handle.previewState().stopped,true);assert.equal(f.byId('report').textContent,'');assert.equal(f.listeners.size,0);
 const raw={complete:false,temporalObservation:{complete:false,frames:3},cleanup:{complete:true}},failure=Error('controlled-png-decode-failure');
 const g=fixture({decodeImage:()=>Promise.reject(failure),loadModules:async()=>({productionManifest:{assets:{}},compareBossActionLayerOwned:async(_,args)=>{try{await args.onTimelinePreview(g.preview);}catch(error){error.bossActionLayerQA=raw;error.cleanup=raw.cleanup;throw error;}return g.result;}})});
 assert.equal(await g.handle.button.onclick(),undefined);const shown=JSON.parse(g.byId('report').textContent);assert.equal(shown.complete,false);assert.equal(shown.error,failure.message);assert.deepEqual(shown.report,raw);assert.deepEqual(shown.cleanup,raw.cleanup);assert.equal(g.handle.previewState().ready,false);assert.equal(g.byId('atlas').getAttribute('src'),null);assert.equal(g.byId('preview').width,0);assert.equal(g.rafs.size,0);g.handle.stop();
 const h=fixture();await h.handle.button.onclick();h.handle.playButton.onclick();h.replacements.set('boss-action-timeline-preview',new Element('canvas'));h.stepRAF(0);assert.equal(h.handle.previewState().stopped,true);assert.equal(h.rafs.size,0);assert.equal(h.listeners.size,0);
});
