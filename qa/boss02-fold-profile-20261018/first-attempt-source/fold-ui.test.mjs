import test from 'node:test';
import assert from 'node:assert/strict';
import {installBossActionTimelineQA} from '../dist/qa-boss-action-timeline-ui.js';
import {createQAStorage,isQAMemoryStorage} from '../dist/qa-storage.js';

// UI orchestration only: stored PNG strings and metadata, no rig/Canvas pixels.
const prefix='boss-action-timeline-';
const location=fold=>new URL('http://localhost:8851/?qa&qa-memory=fold-ui&qa-boss-owned-cleanup=1&qa-boss-action-timeline=1'+(fold===undefined?'':'&qa-boss02-fold='+fold));
function deferred(){let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};}
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.attributes=new Map();this.disabled=false;this.value='';this.width=0;this.height=0;this.naturalWidth=4096;this.naturalHeight=256;this.textContent='';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(key,value){this.attributes.set(key,String(value));}
 getAttribute(key){return this.attributes.get(key)??null;}
 removeAttribute(key){this.attributes.delete(key);}
 set src(value){this.attributes.set('src',value);}
 get src(){return this.getAttribute('src')??'';}
 getContext(){return{clearRect(){},drawImage(){}};}
}
const preview={key:'boss-02-final',src:'data:image/png;base64,AA==',width:4096,height:256,cellWidth:512,cellHeight:256,columns:8,rows:1,frames:[
 {index:0,cellIndex:0,branch:'main',label:'peak',time:.864,elapsedMs:864,pose:'windup',progress:.72,hitFlash:0,deathAge:0},
 {index:1,cellIndex:1,branch:'main',label:'transition',time:1.225,elapsedMs:1225,pose:'recover',progress:.1,hitFlash:0,deathAge:0},
]};
const peaks={key:'boss-02-final',src:'data:image/png;base64,AQ==',alt:'fold four-angle native peaks',width:1024,height:2048};
function fixture(fold,worker){
 const body=new Element('body'),nav=new Element('nav'),listeners=new Set();body.append(nav);
 const walk=node=>[node,...node.children.flatMap(walk)];
 const document={body,createElement:tag=>new Element(tag),querySelector:selector=>{assert.equal(selector,'nav');return nav;},getElementById:id=>walk(body).find(node=>node.id===id)??null};
 let calls=0,args;
 const result={report:{complete:true,temporalObservation:{pairedFrames:2},...(fold==='1'?{candidateProfile:'boss02-fold-v1',foldPeakObservation:{complete:true}}:{}),cleanup:{complete:true}}};
 const handle=installBossActionTimelineQA({document,location:location(fold),
  createStorage:(query,persistent)=>createQAStorage(query,persistent),decodeImage:async()=>{},
  eventTarget:{addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)},
  loadModules:async()=>({productionManifest:Object.freeze({assets:Object.freeze({})}),compareBossActionLayerOwned:async(caller,input)=>{
   calls++;args=input;assert.equal(Object.isFrozen(caller),true);assert.equal(Object.isFrozen(caller.productionArt),true);assert.equal(isQAMemoryStorage(input.storage),true);
   input.onTimelineImage({key:'boss-02-final',src:'data:image/png;base64,Ag==',alt:'original timeline contact'});
   await input.onTimelinePreview(preview);
   if(worker)return worker(input,result);
   if(input.onFoldPeaksImage){input.onFoldPeaksImage(peaks);input.onFoldPeaksImage(peaks);}
   return result;
  }}),
 });
 return{handle,result,document,body,listeners,get calls(){return calls;},get args(){return args;},byId:suffix=>document.getElementById(prefix+suffix)};
}

test('only exact fold query adds the new own option/callback; the original contact and stored preview remain first and unchanged',async()=>{
 for(const flag of[undefined,'0','true','1']){
  const f=fixture(flag),result=await f.handle.button.onclick();assert.equal(f.calls,1);assert.deepEqual(f.args.bossKeys,['boss-02-final']);assert.equal(f.args.timelineObservation,true);
  const active=flag==='1';assert.equal(Object.hasOwn(f.args,'boss02FoldProfile'),active);assert.equal(Object.hasOwn(f.args,'onFoldPeaksImage'),active);
  if(active){assert.equal(f.args.boss02FoldProfile,true);assert.equal(f.byId('fold-peaks').src,peaks.src);assert.equal(f.byId('fold-peaks').alt,peaks.alt);assert.equal(f.byId('proof').children[1],f.byId('fold-peaks'));assert.equal(result.report.candidateProfile,'boss02-fold-v1');}
  else assert.equal(f.byId('fold-peaks'),null);
  assert.equal(f.byId('proof').children.length,active?2:1);assert.equal(f.byId('proof').children[0].alt,'original timeline contact');
  assert.equal(f.byId('atlas').src,preview.src);assert.equal(f.handle.previewState().frameCount,2);assert.equal(f.handle.previewState().playing,false);
  assert.equal(result.report.complete,true);assert.equal(JSON.stringify(result.report).includes('data:image'),false);
  f.handle.stop();assert.equal(f.byId('proof').children.length,0);assert.equal(f.byId('atlas').src,'');assert.equal(f.listeners.size,0);
 }
});

test('fold callback failure retains worker raw evidence and cancellation cannot append a late second image',async()=>{
 const raw={complete:false,candidateProfile:'boss02-fold-v1',foldPeakObservation:{complete:false,nativeSamples:3},cleanup:{complete:true}};
 const failed=fixture('1',async input=>{try{input.onFoldPeaksImage({...peaks,height:1024});}catch(error){error.bossActionLayerQA=raw;throw error;}});
 assert.equal(await failed.handle.button.onclick(),undefined);const shown=JSON.parse(failed.byId('report').textContent);
 assert.equal(shown.complete,false);assert.deepEqual(shown.report,raw);assert.deepEqual(shown.cleanup,raw.cleanup);assert.match(shown.error,/fold-peaks-shape-invalid/);
 assert.equal(failed.byId('fold-peaks'),null);assert.equal(failed.handle.previewState().ready,false);failed.handle.stop();
 const pending=deferred();let entered;
 const late=fixture('1',async(input,result)=>{entered=input;await pending.promise;input.onFoldPeaksImage(peaks);return result;});
 const run=late.handle.button.onclick();for(let i=0;i<12&&!entered;i++)await Promise.resolve();assert.ok(entered);
 late.handle.cancelButton.onclick();assert.equal(entered.signal.aborted,true);assert.equal(late.byId('proof').children.length,0);assert.equal(late.handle.button.disabled,true);
 pending.resolve();assert.equal(await run,undefined);assert.equal(late.byId('fold-peaks'),null);assert.equal(late.byId('proof').children.length,0);assert.equal(late.handle.previewState().frameCount,0);assert.equal(late.handle.button.disabled,false);late.handle.stop();
});
