import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareOriginalImageDecode} from '../dist/qa-image-decode-preparation.js';
import {ProductionArt,validateAtlasMetadata} from '../dist/production-art.js';

const originalBytes=await readFile(new URL('../../../qa/image-decode-20261018/production-art-before-image-decode.txt',import.meta.url));
assert.equal(originalBytes.length,45528);
assert.equal(createHash('sha256').update(originalBytes).digest('hex'),'017c977b477d6f2d37067dfea48dbafa50166661cc93274bc549ab9354250c5d');
assert.deepEqual(await readFile(new URL('../dist/production-art.js',import.meta.url)),originalBytes,'decode preparation leaves the original production image/selection/drawing implementation byte-exact');
const artURL=new URL('../dist/production-art.js',import.meta.url);
const originalSource=originalBytes.toString('utf8').replace(/(from\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,(_all,prefix,specifier,suffix)=>prefix+new URL(specifier,artURL).href+suffix).replaceAll('import.meta.url',JSON.stringify(artURL.href));
const {ProductionArt:OriginalProductionArt}=await import('data:text/javascript;base64,'+Buffer.from(originalSource).toString('base64'));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));

function images(){
 const states=new WeakMap(),events=[];let constructions=0;
 class ImageElement{
  constructor(id){constructions++;states.set(this,{id,src:`http://localhost:8851/assets/production/${id}/atlas.png`,currentSrc:`http://localhost:8851/assets/production/${id}/atlas.png`,naturalWidth:4096,naturalHeight:1024,width:4096,height:1024,complete:true,pixels:new Uint8Array([1,2,3,0,4,5,6,7,8,9,10,8,11,12,13,255]),decode:()=>Promise.resolve(),reads:0});}
  get src(){const state=states.get(this);state.reads++;return state.src;}
  get currentSrc(){const state=states.get(this);state.reads++;return state.currentSrc;}
  get naturalWidth(){const state=states.get(this);state.reads++;return state.naturalWidth;}
  get naturalHeight(){const state=states.get(this);state.reads++;return state.naturalHeight;}
  get width(){const state=states.get(this);state.reads++;return state.width;}
  get height(){const state=states.get(this);state.reads++;return state.height;}
  get complete(){const state=states.get(this);state.reads++;return state.complete;}
  decode(){assert.ok(states.has(this),'the original image is the decode receiver');const state=states.get(this);events.push(state.id);return state.decode();}
 }
 return{ImageElement,states,events,constructions:()=>constructions};
}
function metadata(){
 const pivot={x:256,y:394.0415506214063};
 return validateAtlasMetadata({format:'meshy-iso-sprite-atlas',version:1,projection:{azimuthDegrees:45,elevationDegrees:35.26438968275467,cameraScale:Math.sqrt(3/2),pixelsPerWorld:6.274615937336651,footPivot:pivot,subjectHeight:44},atlas:{width:4096,height:1024,columns:8,rows:2,frameSize:512,directions:16,samples:1,order:'direction-major, sample-minor',transparent:true},animation:null,frames:Array.from({length:16},(_,index)=>({index,direction:index,sample:0,angle:index*Math.PI*2/16,rect:{x:index%8*512,y:Math.floor(index/8)*512,width:512,height:512},footPivot:{...pivot},alphaBounds:{x:186,y:122,width:187,height:313},outlineBounds:{x:183,y:119,width:193,height:319},coreBounds:{x:214,y:178,width:131,height:170},clipped:false}))});
}
function fixture(ids=['a','b']){
 const mock=images(),records=new Map(),art={records};
 for(const id of ids)records.set(id,{status:'ready',image:new mock.ImageElement(id),metadata:metadata()});
 return{...mock,records,art,options:{ImageElement:mock.ImageElement},forbidden:new Set([art,records,...[...records.values()].flatMap(record=>[record,record.image,record.metadata,record.metadata.atlas,record.metadata.frames])])};
}
function primitiveReport(report,forbidden){
 const seen=new Set();function inspect(value){if(value===null||['string','boolean','undefined'].includes(typeof value))return;if(typeof value==='number'){assert.ok(Number.isFinite(value));return;}assert.equal(typeof value,'object');assert.equal(forbidden.has(value),false,'report must retain no image/record/metadata/art refs');assert.equal(seen.has(value),false,'report has no cyclic or repeated owner objects');seen.add(value);assert.ok(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype);for(const key of Object.keys(value))inspect(value[key]);}inspect(report);assert.ok(report.entries.length<=2);assert.equal(typeof report.note,'string');
}
function imageSnapshot(f,image){const state=f.states.get(image);return{src:state.src,currentSrc:state.currentSrc,naturalWidth:state.naturalWidth,naturalHeight:state.naturalHeight,width:state.width,height:state.height,complete:state.complete,pixels:Array.from(state.pixels),prototype:Object.getPrototypeOf(image),own:Object.getOwnPropertyDescriptors(image)};}
function sourceSnapshot(f){return [...f.records].map(([id,record])=>({id,record,image:record.image,metadata:record.metadata,metadataText:JSON.stringify(record.metadata),imageState:imageSnapshot(f,record.image)}));}
function assertSources(f,before){const after=sourceSnapshot(f);assert.deepEqual(after,before);for(let i=0;i<after.length;i++){assert.equal(after[i].record,before[i].record);assert.equal(after[i].image,before[i].image);assert.equal(after[i].metadata,before[i].metadata);}}
function assertFallback(report,f){assert.equal(report.ready,false);assert.equal(report.status,'fallback');assert.ok(report.error);assert.ok(report.entries.every(entry=>entry.ready===false));primitiveReport(report,f.forbidden);}

test('at most two unique ready originals decode sequentially with original receiver/order, no image or external resource creation and primitive diagnostics',async()=>{
 const f=fixture(),first=deferred(),second=deferred(),before=sourceSnapshot(f),constructed=f.constructions();f.states.get(f.records.get('a').image).decode=()=>first.promise;f.states.get(f.records.get('b').image).decode=()=>second.promise;
 const descriptors=new Map(),external=[];
 for(const [key,value]of [['fetch',()=>{external.push('fetch');throw Error('unexpected fetch');}],['createImageBitmap',()=>{external.push('bitmap');throw Error('unexpected bitmap');}],['document',{createElement(){external.push('canvas');throw Error('unexpected canvas');}}]]){descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 descriptors.set('localStorage',Object.getOwnPropertyDescriptor(globalThis,'localStorage'));Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){external.push('storage');throw Error('unexpected storage');}});
 try{
  const pending=prepareOriginalImageDecode(f.art,['a','a','b'],f.options);await turn();assert.deepEqual(f.events,['a'],'the second decode waits for original first completion');first.resolve();await turn();assert.deepEqual(f.events,['a','b']);second.resolve();const report=await pending;
  assert.equal(report.ready,true);assert.equal(report.status,'ready');assert.equal(report.error,'');assert.equal(report.attempted,2);assert.equal(report.completed,2);assert.deepEqual(report.entries.map(entry=>entry.id),['a','b']);assert.ok(report.entries.every(entry=>entry.ready&&entry.attempted));assert.equal(report.totalRawEstimate,2*4096*1024*4);assert.equal(f.constructions(),constructed);assert.deepEqual(external,[]);primitiveReport(report,f.forbidden);assertSources(f,before);
 }finally{for(const [key,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
 const shared=fixture();shared.records.get('b').image=shared.records.get('a').image;const report=await prepareOriginalImageDecode(shared.art,['b','a','b'],shared.options);assert.equal(report.ready,true);assert.deepEqual(shared.events,['a']);assert.equal(report.attempted,1);assert.equal(report.completed,1);assert.equal(report.totalRawEstimate,4096*1024*4);assert.deepEqual(report.entries.map(entry=>entry.id),['b','a']);assert.ok(report.entries.every(entry=>entry.ready));primitiveReport(report,shared.forbidden);
});

test('invalid IDs, unknown getters, image overrides and unsupported default/native prototypes refuse before decode without invoking untrusted accessors',async()=>{
 const cases=['empty','three','bad-id','id-getter','records-getter','map-impostor','status-getter','image-getter','metadata-getter','atlas-getter','dimension-getter','own-decode-getter','own-decode-function','own-src-getter','own-width-data','prototype-decode-getter','prototype-image-subclass','invalid-dimensions','incomplete'];
 for(const mode of cases){
  const f=fixture(['a','b','c']);let ids=['a','b'],getterCalls=0,overrideCalls=0;
  const getter=()=>{getterCalls++;throw Error('unknown '+mode);},record=f.records.get('a'),image=record.image;
  if(mode==='empty')ids=[];if(mode==='three')ids=['a','b','c'];if(mode==='bad-id')ids=['a',''];if(mode==='id-getter')Object.defineProperty(ids,'0',{get:getter,configurable:true});
  if(mode==='records-getter')Object.defineProperty(f.art,'records',{get:getter,configurable:true});if(mode==='map-impostor')f.art.records={get:getter};
  for(const [name,key]of [['status-getter','status'],['image-getter','image'],['metadata-getter','metadata']])if(mode===name)Object.defineProperty(record,key,{get:getter,configurable:true});
  if(mode==='atlas-getter')record.metadata={get atlas(){return getter();}};if(mode==='dimension-getter')record.metadata={atlas:{get width(){return getter();},height:1024}};
  if(mode==='own-decode-getter')Object.defineProperty(image,'decode',{get:getter});if(mode==='own-decode-function')image.decode=()=>{overrideCalls++;throw Error('own decoder');};if(mode==='own-src-getter')Object.defineProperty(image,'src',{get:getter});if(mode==='own-width-data')Object.defineProperty(image,'width',{value:4096});
  if(mode==='prototype-decode-getter')Object.defineProperty(f.ImageElement.prototype,'decode',{get:getter,configurable:true});if(mode==='prototype-image-subclass')Object.setPrototypeOf(image,Object.create(f.ImageElement.prototype));
  if(mode==='invalid-dimensions')f.states.get(image).naturalWidth=0;if(mode==='incomplete')f.states.get(image).complete=false;
  const report=await prepareOriginalImageDecode(f.art,ids,f.options);assertFallback(report,f);assert.deepEqual(f.events,[],mode+' never begins decoder work');assert.equal(getterCalls,0,mode+' does not invoke unknown getters');assert.equal(overrideCalls,0);
 }
 const f=fixture(),descriptor=Object.getOwnPropertyDescriptor(globalThis,'HTMLImageElement');Object.defineProperty(globalThis,'HTMLImageElement',{configurable:true,writable:true,value:f.ImageElement});
 try{assertFallback(await prepareOriginalImageDecode(f.art,['a']),f);assert.deepEqual(f.events,[],'a mocked global class is not accepted as a default native browser constructor');}finally{if(descriptor)Object.defineProperty(globalThis,'HTMLImageElement',descriptor);else delete globalThis.HTMLImageElement;}
 const actualMap=fixture();let mapGetterCalls=0;Object.defineProperty(actualMap.records,'get',{get(){mapGetterCalls++;throw Error('own Map.get getter');}});
 const originalRecord=Map.prototype.get.call(actualMap.records,'a');const report=await prepareOriginalImageDecode(actualMap.art,['a'],actualMap.options);assert.equal(report.ready,true);assert.equal(mapGetterCalls,0,'the genuine Map intrinsic bypasses an untrusted own get accessor');assert.deepEqual(actualMap.events,['a']);assert.equal(Map.prototype.get.call(actualMap.records,'a'),originalRecord);primitiveReport(report,actualMap.forbidden);
});

test('decode rejection, synchronous throw and trusted prototype getter failures preserve sources and refuse partial readiness',async()=>{
 for(const mode of ['reject-first','throw-first','reject-second','throw-second','source-getter-throw']){
  const f=fixture(),marker=Error('original-'+mode),before=sourceSnapshot(f),target=mode.includes('second')?'b':'a';
  if(mode==='source-getter-throw')Object.defineProperty(f.ImageElement.prototype,'currentSrc',{get(){throw marker;},configurable:true});
  else f.states.get(f.records.get(target).image).decode=()=>{if(mode.startsWith('throw'))throw marker;return Promise.reject(marker);};
  const report=await prepareOriginalImageDecode(f.art,['a','b'],f.options);assertFallback(report,f);assert.ok(report.error.includes(marker.message)||report.entries.some(entry=>entry.error.includes(marker.message)));assertSources(f,before);
  if(mode.includes('second')){assert.deepEqual(f.events,['a','b']);assert.equal(report.completed,1);assert.equal(report.attempted,2);}else if(mode!=='source-getter-throw')assert.deepEqual(f.events,['a']);
 }
 const f=fixture(),marker=Error('original-owner-callback-throw'),before=sourceSnapshot(f);const report=await prepareOriginalImageDecode(f.art,['a'],{...f.options,ownerCurrent(){throw marker;}});assertFallback(report,f);assert.equal(report.error,marker.message);assert.deepEqual(f.events,[]);assertSources(f,before);
});

test('abort, timeout and owner/source generations cannot become READY after late original decode completion or rejection',async()=>{
 for(const mode of ['preabort','abort','timeout','owner','map','record','image','metadata','src','currentSrc','width','height','complete','prototype-decode']){
  const f=fixture(),gate=deferred(),controller=new AbortController(),image=f.records.get('a').image,state=f.states.get(image);state.decode=()=>gate.promise;let current=true;
  if(mode==='preabort')controller.abort();
  const pending=prepareOriginalImageDecode(f.art,['a','b'],{...f.options,signal:controller.signal,timeoutMs:mode==='timeout'?1:15000,ownerCurrent:()=>current});
  if(mode!=='preabort')await turn();
  if(mode==='abort')controller.abort();if(mode==='owner')current=false;if(mode==='map')f.art.records=new Map(f.records);if(mode==='record')f.records.set('a',{...f.records.get('a')});if(mode==='image')f.records.get('a').image=new f.ImageElement('replacement');if(mode==='metadata')f.records.get('a').metadata=metadata();if(mode==='src')state.src+='?different-generation';if(mode==='currentSrc')state.currentSrc+='?different-generation';if(mode==='width')state.naturalWidth++;if(mode==='height')state.height++;if(mode==='complete')state.complete=false;if(mode==='prototype-decode')Object.defineProperty(f.ImageElement.prototype,'decode',{configurable:true,value:()=>Promise.resolve()});
  if(!['preabort','abort','timeout'].includes(mode))gate.resolve();
  const report=await pending;assertFallback(report,f);const frozen=JSON.stringify(report),reads=state.reads,calls=f.events.length;
  gate.resolve();await turn();assert.equal(JSON.stringify(report),frozen,'late completion cannot mutate the finalized fallback report');assert.equal(f.events.length,calls,'late completion cannot start another original decode');assert.equal(state.reads,reads,'cancelled pending work makes no late source getter reads');
  if(mode==='preabort')assert.deepEqual(f.events,[]);else assert.deepEqual(f.events,['a']);
 }
 const f=fixture(),gate=deferred(),controller=new AbortController();f.states.get(f.records.get('a').image).decode=()=>gate.promise;const pending=prepareOriginalImageDecode(f.art,['a'],{...f.options,signal:controller.signal});await turn();controller.abort();const report=await pending;gate.reject(Error('late original decoder rejection'));await turn();assertFallback(report,f);
});

function canvas(image,throwAt=null){
 const calls=[],stack=[],marker={originalCanvasError:throwAt};let state={globalAlpha:.8,imageSmoothingEnabled:false,imageSmoothingQuality:'low'};
 const context=new Proxy({save(){calls.push(['save']);stack.push({...state});if(throwAt==='save')throw marker;},restore(){calls.push(['restore']);state=stack.pop()??state;if(throwAt==='restore')throw marker;},drawImage(...args){assert.equal(args[0],image);calls.push(['drawImage','original-image',...args.slice(1)]);if(throwAt==='draw')throw marker;}},{get(target,key){return Object.hasOwn(state,key)?state[key]:target[key];},set(_target,key,value){calls.push(['set',key,value]);state[key]=value;if(throwAt===key)throw marker;return true;}});
 return{context,calls,marker,resultState:()=>({...state}),stack};
}
test('preparing originals leaves full pinned ProductionArt frame selection, metadata, source RGBA and every Canvas command/state/exception unchanged',async()=>{
 const f=fixture(),before=sourceSnapshot(f),manifest={assets:{a:{metadata:'a/metadata.json',atlas:'a/atlas.png'}},characters:{},bosses:{},enemies:{},environment:{},environmentRules:[]},image=f.records.get('a').image;
 const current=new ProductionArt({manifest,ImageCtor:f.ImageElement}),original=new OriginalProductionArt({manifest,ImageCtor:f.ImageElement});current.records=f.records;original.records=f.records;
 function traces(){
  const output=[];
  for(const angle of [0,.7,Math.PI,-Math.PI/2])for(const alpha of [1,.4,0])for(const failure of [null,'save','globalAlpha','imageSmoothingQuality','draw','restore']){
   const pair=[];for(const art of [original,current]){const selected=art.frame('a',{angle,foot:{x:230,y:1065},worldHeight:44}),c=canvas(image,failure);let result,error;try{result=art.drawFrame(c.context,selected,{alpha});}catch(cause){assert.equal(cause,c.marker);error='original-restore-error';}pair.push({result,error,frame:structuredClone(selected.frame),placement:structuredClone(selected.placement),metadata:JSON.stringify(selected.metadata),calls:c.calls,state:c.resultState(),stack:c.stack.length});}assert.deepEqual(pair[1],pair[0]);output.push(pair[0]);
  }
  for(const art of [original,current]){const c=canvas(image),selected=art.frame('a',{angle:.7,foot:{x:230,y:1065},worldHeight:44});let getters=0;Object.defineProperty(selected,'image',{get(){getters++;c.context.globalAlpha=.21;return image;}});assert.equal(art.drawFrame(c.context,selected),true);assert.equal(getters,1);assert.equal(c.resultState().globalAlpha,.8,'the original selected getter is still evaluated inside save/restore');output.push(c.calls);}
  return output;
 }
 const expected=traces(),report=await prepareOriginalImageDecode(current,['a'],f.options);assert.equal(report.ready,true);assert.deepEqual(traces(),expected);assertSources(f,before);assert.deepEqual(Array.from(f.states.get(image).pixels),before[0].imageState.pixels);primitiveReport(report,f.forbidden);
});
