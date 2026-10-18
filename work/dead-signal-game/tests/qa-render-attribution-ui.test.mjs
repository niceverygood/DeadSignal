import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),qa=new URL('qa/render-attribution-20261018/',root);
const bytes=await readFile(new URL('../dist/qa-player-rig.js',import.meta.url)),source=bytes.toString('utf8'),original=await readFile(new URL('current-qa-player-rig.txt',qa));
const before=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8')).files.find(row=>row.file==='work/dead-signal-game/dist/qa-player-rig.js');
const start=source.indexOf('// BEGIN RENDER ATTRIBUTION UI'),end=source.indexOf('// END RENDER ATTRIBUTION UI',start);assert.ok(start>0&&end>start);
const install=new Function('createQAStorage',source.slice(start,end).replace('export function installRenderAttributionQA','function installRenderAttributionQA')+'\nreturn installRenderAttributionQA;')(()=>{throw Error('memory-only');});
const location={protocol:'http:',hostname:'localhost',port:'8851',search:'?qa&qa-memory=attribution-test&qa-render-attribution=1'};
class Element{constructor(tag){this.tag=tag;this.children=[];this.style={};this.disabled=false;this.textContent='';}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}}
function fixture(overrides={}){
 const nodes=[],nav=new Element('nav'),body=new Element('body'),listeners=new Set(),counts={loads:0,storage:0,runs:0},owner={},state={ready:true,playing:false,renderer:owner},status={textContent:''},result={report:{complete:true,passes:[]}};
 const document={body,createElement:tag=>{const e=new Element(tag);nodes.push(e);return e;},querySelector:key=>{assert.equal(key,'nav');return nav;}},eventTarget={addEventListener:(name,fn)=>{assert.equal(name,'pagehide');listeners.add(fn);},removeEventListener:(name,fn)=>{assert.equal(name,'pagehide');listeners.delete(fn);}};
 const options={document,location,status,eventTarget,read:()=>({...state}),createStorage:(query,persistent)=>{assert.ok(query.has('qa-memory'));assert.throws(persistent,/persistent-storage-forbidden/);counts.storage++;return{};},loadQA:async()=>{counts.loads++;return{compareCanvasStateCombat:async(renderer,args)=>{assert.equal(renderer,owner);assert.equal(args.originalAttribution,true);counts.runs++;args.onProgress({arm:'A2',frame:3});for(let i=0;i<3;i++)args.onImage({src:'data:image/png;base64,AA==',alt:'A'+i});return result;}};},...overrides};
 return{handle:install(options),options,nodes,nav,body,listeners,counts,state,status,result,byId:id=>nodes.find(el=>el.id===id)};
}
test('attribution UI preserves the entire prior QA source and is absent unless the precise isolated gate passes',()=>{
 assert.equal(original.length,173665);assert.equal(original.length,before.bytes);assert.equal(createHash('sha256').update(original).digest('hex'),before.sha256);assert.deepEqual(bytes.subarray(0,original.length),original);
 const poison=()=>{throw Error('no side effects before gate');};
 for(const loc of [{...location,port:'8806'},{...location,hostname:'example.com'},{...location,protocol:'https:'},{...location,search:'?qa&qa-render-attribution=1'},{...location,search:'?qa-memory=x&qa-render-attribution=1'},{...location,search:'?qa&qa-memory=x&qa-render-attribution=true'},{...location,search:'?qa&qa-memory=x&qa-canvas-combat=1'}])assert.equal(install({location:loc,document:new Proxy({},{get:poison}),read:poison,loadQA:poison,createStorage:poison}),null);
 assert.doesNotMatch(source.slice(start,end),/requestAnimationFrame\(|localStorage\./);
});
test('only a ready idle click imports the original-only harness, with bounded images and memory reuse',async()=>{
 const f=fixture();assert.deepEqual(f.counts,{loads:0,storage:0,runs:0});f.state.ready=false;await f.handle.button.onclick();f.state.ready=true;f.state.playing=true;await f.handle.button.onclick();f.state.playing=false;f.handle.button.disabled=true;await f.handle.button.onclick();f.handle.button.disabled=false;assert.equal(f.counts.loads,0);
 assert.equal(await f.handle.button.onclick(),f.result);assert.deepEqual(f.counts,{loads:1,storage:1,runs:1});assert.equal(f.byId('render-attribution-proof').children.length,2);assert.deepEqual(JSON.parse(f.byId('render-attribution-report').textContent),f.result.report);assert.match(f.status.textContent,/완료/);assert.equal(f.listeners.size,0);assert.equal(f.handle.button.disabled,false);
 await f.handle.button.onclick();assert.equal(f.counts.storage,1);assert.equal(f.byId('render-attribution-proof').children.length,2);
});
test('owner replacement and pagehide during import never start a late comparison',async()=>{
 for(const aborted of [true,false]){let resolve;const pending=new Promise(r=>resolve=r),f=fixture({loadQA:()=>pending}),run=f.handle.button.onclick();if(aborted)for(const hide of f.listeners)hide();else f.state.renderer={};resolve({compareCanvasStateCombat:()=>{throw Error('must not run');}});assert.equal(await run,undefined);assert.equal(f.counts.storage,0);assert.equal(f.listeners.size,0);assert.equal(f.handle.button.disabled,false);}
});
test('in-flight cancellation suppresses late UI while genuine failure reports and cleanup stay available',async()=>{
 let resolve,args;const pending=new Promise(r=>resolve=r),f=fixture({loadQA:async()=>({compareCanvasStateCombat:async(_,o)=>{args=o;return pending;}})}),run=f.handle.button.onclick();await Promise.resolve();await Promise.resolve();for(const hide of f.listeners)hide();args.onImage({src:'late'});resolve({report:{complete:true}});assert.equal(await run,undefined);assert.equal(f.byId('render-attribution-proof').children.length,0);assert.equal(f.byId('render-attribution-report').textContent,'');
 const error=Object.assign(Error('strict-original-AA-diff'),{report:{complete:false,rawPixels:27},cleanup:{complete:true}}),broken=fixture({loadQA:async()=>({compareCanvasStateCombat:async()=>{throw error;}})});await broken.handle.button.onclick();const shown=JSON.parse(broken.byId('render-attribution-report').textContent);assert.equal(shown.error,error.message);assert.deepEqual(shown.report,error.report);assert.deepEqual(shown.cleanup,error.cleanup);assert.equal(broken.listeners.size,0);assert.equal(broken.handle.button.disabled,false);
});
