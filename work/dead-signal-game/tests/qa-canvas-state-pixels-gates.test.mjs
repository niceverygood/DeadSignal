import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCanvasStatePixels} from '../dist/qa-canvas-state-pixels.js';
import {createQAStorage} from '../dist/qa-storage.js';

const location={protocol:'http:',hostname:'localhost',port:'8851',search:'?qa&qa-memory=test&qa-canvas-state=1'};
const query=new URLSearchParams(location.search);
const storage=createQAStorage(query,()=>{throw Error('persistent store must never be acquired');});
const poison=()=>{throw Error('owner or document must not be inspected');};
function inputs(change={}){
 const options={location,query,storage,...change};
 Object.defineProperty(options,'renderer',{get:poison});Object.defineProperty(options,'document',{get:poison});
 return options;
}
test('pixel utility rejects wrong origin and missing/excessively broad flag before any owner or DOM read',()=>{
 for(const change of [{location:{...location,protocol:'https:'}},{location:{...location,hostname:'example.com'}},{location:{...location,port:'8806'}},{query:new URLSearchParams('qa&qa-memory=test')},{query:new URLSearchParams('qa&qa-memory=test&qa-canvas-state=true')},{query:new URLSearchParams('qa-memory=test&qa-canvas-state=1')},{query:new URLSearchParams('qa&qa-canvas-state=1')}]){
  const report=compareCanvasStatePixels(inputs(change));assert.equal(report.available,false);assert.equal(report.complete,false);assert.deepEqual(report.cases,[]);assert.deepEqual(report.images,[]);
 }
});
test('genuine memory-storage branding is required; lookalikes and missing stores do not touch their methods',()=>{
 for(const fake of [null,undefined,{},new Proxy({},{get:poison}),{get getItem(){poison();},get setItem(){poison();}}]){
  const report=compareCanvasStatePixels(inputs({storage:fake}));assert.equal(report.available,false);assert.equal(report.complete,false);assert.deepEqual(report.cases,[]);
 }
});
test('unavailable actual native inputs cannot become a successful synthetic quality result',()=>{
 const report=compareCanvasStatePixels({location,query,storage,renderer:{},document:{createElement:()=>{throw Error('no native canvas in this numeric test');}}});
 assert.equal(report.available,true);assert.equal(report.complete,false);
 assert.equal(storage.getItem('profile'),null);
 assert.ok(!report.cases.some(item=>item.complete===true));
});
