import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const sourceBytes=await readFile(new URL('../dist/qa-player-rig.js',import.meta.url));
const original=await readFile(new URL('../../../qa/canvas-state-20261018/current-qa-player-rig.txt',import.meta.url));
const source=sourceBytes.toString('utf8'),start=source.indexOf('// BEGIN CANVAS STATE PIXEL UI'),end=source.indexOf('// END CANVAS STATE PIXEL UI',start);
assert.ok(start>0&&end>start);
const definition=source.slice(start,end).replace('export function installCanvasStatePixelQA','function installCanvasStatePixelQA');
const install=new Function('createQAStorage',definition+'\nreturn installCanvasStatePixelQA;')(()=>{throw Error('explicit test storage only');});
const good={protocol:'http:',hostname:'localhost',port:'8851',search:'?qa=1&qa-memory=canvas-state-ui-test&qa-canvas-state=1'};
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.disabled=false;this.textContent='';}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
}
function fixture(overrides={}){
 const nodes=[],nav=new Element('nav'),body=new Element('body'),listeners=new Map(),counts={loads:0,compares:0,storage:0,reads:0};
 const renderer={},state={ready:true,playing:false,renderer};
 const document={body,querySelector:selector=>{assert.equal(selector,'nav');return nav;},createElement:tag=>{const node=new Element(tag);nodes.push(node);return node;}};
 const eventTarget={addEventListener:(name,fn)=>{assert.equal(name,'pagehide');listeners.set(fn,name);},removeEventListener:(name,fn)=>{assert.equal(name,'pagehide');listeners.delete(fn);}};
 const memory={},status={textContent:''},result={complete:true,cases:[{complete:true}],images:[{src:'data:image/png;base64,AA==',alt:'proof1'},{src:'data:image/png;base64,AA==',alt:'proof2'},{src:'ignored',alt:'proof3'}],cleanup:{complete:true}};
 const options={document,location:good,status,eventTarget,read:()=>{counts.reads++;return {...state};},createStorage:(query,persistent)=>{counts.storage++;assert.ok(query.has('qa-memory'));assert.throws(persistent,/persistent-storage-forbidden/);return memory;},loadQA:async()=>{counts.loads++;return{compareCanvasStatePixels:arg=>{counts.compares++;assert.equal(arg.renderer,renderer);assert.equal(arg.document,document);assert.equal(arg.storage,memory);assert.equal(arg.location,good);return result;}};},...overrides};
 const handle=install(options);
 return{handle,options,nodes,nav,body,listeners,counts,state,result,status,byId:id=>nodes.find(node=>node.id===id)};
}

test('new QA UI is append-only after the exact original 167556-byte player-rig script',()=>{
 assert.equal(original.length,167556);
 assert.equal(createHash('sha256').update(original).digest('hex'),'a398cf929cf8382134b17228521600e8c4747880d99b49f94ded4047e98f70bc');
 assert.deepEqual(sourceBytes.subarray(0,original.length),original);
 assert.ok(sourceBytes.subarray(original.length).toString('utf8').includes('installCanvasStatePixelQA({document,location,status,read:()=>({ready,playing,renderer})})'));
});

test('origin, memory and exact flag gate reject before DOM, owner, storage or helper inspection',()=>{
 const poison=()=>{throw Error('must remain untouched');};
 for(const location of [{...good,protocol:'https:'},{...good,hostname:'example.com'},{...good,port:'8806'},{...good,search:'?qa&qa-canvas-state=1'},{...good,search:'?qa-memory=x&qa-canvas-state=1'},{...good,search:'?qa&qa-memory=x&qa-canvas-state=true'},{...good,search:'?qa&qa-memory=x'}]){
  assert.equal(install({location,document:new Proxy({},{get:poison}),status:new Proxy({},{set:poison}),read:poison,createStorage:poison,loadQA:poison}),null);
 }
});

test('only an explicit ready, idle click imports the utility and creates genuine isolated storage once',async()=>{
 const f=fixture();assert.deepEqual(f.counts,{loads:0,compares:0,storage:0,reads:0});assert.equal(f.nav.children.length,1);
 f.state.ready=false;assert.equal(await f.handle.button.onclick(),undefined);f.state.ready=true;f.state.playing=true;assert.equal(await f.handle.button.onclick(),undefined);f.state.playing=false;
 f.handle.button.disabled=true;assert.equal(await f.handle.button.onclick(),undefined);f.handle.button.disabled=false;
 const result=await f.handle.button.onclick();assert.equal(result,f.result);assert.equal(f.counts.loads,1);assert.equal(f.counts.storage,1);assert.equal(f.counts.compares,1);
 assert.equal(f.handle.button.disabled,false);assert.equal(f.listeners.size,0);assert.match(f.status.textContent,/일치/);
 const saved=JSON.parse(f.byId('canvas-state-pixel-report').textContent);assert.equal(Object.hasOwn(saved,'images'),false);assert.equal(saved.complete,true);
 const images=f.byId('canvas-state-pixel-proof').children;assert.equal(images.length,2);assert.deepEqual(images.map(node=>node.alt),['proof1','proof2']);
 await f.handle.button.onclick();assert.equal(f.counts.storage,1);assert.equal(f.byId('canvas-state-pixel-proof').children.length,2,'proof DOM stays bounded');
});

test('late imports after pagehide or owner replacement never run the candidate or access persistence',async()=>{
 for(const abort of [true,false]){
  let resolve;const promise=new Promise(r=>resolve=r);const f=fixture({loadQA:()=>promise}),pending=f.handle.button.onclick();
  assert.equal(f.handle.button.disabled,true);assert.equal(f.listeners.size,1);
  if(abort)for(const listener of f.listeners.keys())listener();else f.state.renderer={};
  resolve({compareCanvasStatePixels:()=>{throw Error('late comparison must not run');}});assert.equal(await pending,undefined);
  assert.equal(f.counts.storage,0);assert.equal(f.handle.button.disabled,false);assert.equal(f.listeners.size,0);
  if(!abort)assert.equal(JSON.parse(f.byId('canvas-state-pixel-report').textContent).reason,'qa-owner-or-state-changed');
 }
});

test('quality failure is displayed as failure and a thrown helper is contained with button/listener cleanup',async()=>{
 const f=fixture();f.result.complete=false;const failed=await f.handle.button.onclick();assert.equal(failed.complete,false);assert.match(f.status.textContent,/미완료 또는 차이/);assert.equal(JSON.parse(f.byId('canvas-state-pixel-report').textContent).complete,false);
 const g=fixture({loadQA:async()=>({compareCanvasStatePixels:()=>{throw Error('retained-quality-failure');}})});assert.equal(await g.handle.button.onclick(),undefined);
 const report=JSON.parse(g.byId('canvas-state-pixel-report').textContent);assert.equal(report.complete,false);assert.equal(report.error,'retained-quality-failure');assert.equal(g.handle.button.disabled,false);assert.equal(g.listeners.size,0);
});
