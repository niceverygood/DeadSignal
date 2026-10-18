import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),qa=new URL('qa/canvas-state-combat-20261018/',root);
const sourceBytes=await readFile(new URL('../dist/qa-player-rig.js',import.meta.url)),source=sourceBytes.toString('utf8');
const original=await readFile(new URL('current-qa-player-rig.txt',qa));
const previous=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8')).files.find(row=>row.file==='work/dead-signal-game/dist/qa-player-rig.js');
const start=source.indexOf('// BEGIN CANVAS STATE COMBAT UI'),end=source.indexOf('// END CANVAS STATE COMBAT UI',start);assert.ok(start>0&&end>start);
const definition=source.slice(start,end).replace('export function installCanvasStateCombatQA','function installCanvasStateCombatQA');
const install=new Function('createQAStorage',definition+'\nreturn installCanvasStateCombatQA;')(()=>{throw Error('inject test memory only');});
const location={protocol:'http:',hostname:'localhost',port:'8851',search:'?qa&qa-memory=canvas-combat-test&qa-canvas-combat=1'};
class Element{constructor(tag){this.tag=tag;this.children=[];this.style={};this.disabled=false;this.textContent='';}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}}
function fixture(overrides={}){
 const nodes=[],nav=new Element('nav'),body=new Element('body'),listeners=new Set(),counts={loads:0,storage:0,compares:0},renderer={},state={ready:true,playing:false,renderer},status={textContent:''},memory={};
 const document={body,createElement:tag=>{const el=new Element(tag);nodes.push(el);return el;},querySelector:selector=>{assert.equal(selector,'nav');return nav;}};
 const eventTarget={addEventListener:(name,fn)=>{assert.equal(name,'pagehide');listeners.add(fn);},removeEventListener:(name,fn)=>{assert.equal(name,'pagehide');listeners.delete(fn);}};
 const result={report:{complete:true,passes:[],cleanup:{complete:true}}};
 const options={document,location,status,eventTarget,read:()=>({...state}),createStorage:(query,persistent)=>{counts.storage++;assert.ok(query.has('qa-memory'));assert.throws(persistent,/persistent-storage-forbidden/);return memory;},loadQA:async()=>{counts.loads++;return{compareCanvasStateCombat:async(owner,args)=>{counts.compares++;assert.equal(owner,renderer);assert.equal(args.storage,memory);assert.equal(args.signal.aborted,false);args.onProgress({arm:'B',frame:8});for(let i=0;i<4;i++)args.onImage({arm:'arm'+i,src:'data:image/png;base64,AA==',alt:'proof'+i});return result;}};},...overrides};
 return{handle:install(options),options,nodes,nav,body,listeners,counts,state,status,result,byId:id=>nodes.find(el=>el.id===id)};
}
test('combat UI is append-only after the exact prior player QA source and stays out of the product loop',()=>{
 assert.equal(original.length,170464);assert.equal(original.length,previous.bytes);assert.equal(createHash('sha256').update(original).digest('hex'),previous.sha256);
 assert.deepEqual(sourceBytes.subarray(0,original.length),original);
 const added=sourceBytes.subarray(original.length).toString('utf8');assert.match(added,/installCanvasStateCombatQA\(\{document,location,status,read:/);assert.doesNotMatch(added,/requestAnimationFrame\(|localStorage\./);
});
test('off-origin, absent memory and nonexact opt-in reject before DOM, owner, imports or storage',()=>{
 const poison=()=>{throw Error('must stay untouched');};
 for(const current of [{...location,protocol:'https:'},{...location,hostname:'example.com'},{...location,port:'8806'},{...location,search:'?qa&qa-canvas-combat=1'},{...location,search:'?qa-memory=x&qa-canvas-combat=1'},{...location,search:'?qa&qa-memory=x&qa-canvas-combat=true'},{...location,search:'?qa&qa-memory=x'}])assert.equal(install({location:current,document:new Proxy({},{get:poison}),status:new Proxy({},{set:poison}),read:poison,createStorage:poison,loadQA:poison}),null);
});
test('only an explicit ready idle click runs the comparison, preserves its report and bounds proof images',async()=>{
 const f=fixture();assert.deepEqual(f.counts,{loads:0,storage:0,compares:0});assert.equal(f.nav.children.length,1);
 f.state.ready=false;await f.handle.button.onclick();f.state.ready=true;f.state.playing=true;await f.handle.button.onclick();f.state.playing=false;f.handle.button.disabled=true;await f.handle.button.onclick();f.handle.button.disabled=false;
 assert.equal(f.counts.loads,0);assert.equal(await f.handle.button.onclick(),f.result);assert.deepEqual(f.counts,{loads:1,storage:1,compares:1});
 assert.deepEqual(JSON.parse(f.byId('canvas-state-combat-report').textContent),f.result.report);assert.equal(f.byId('canvas-state-combat-proof').children.length,3);assert.deepEqual(f.byId('canvas-state-combat-proof').children.map(el=>el.alt),['proof0','proof1','proof2']);assert.match(f.status.textContent,/비교 완료/);assert.equal(f.listeners.size,0);assert.equal(f.handle.button.disabled,false);
 await f.handle.button.onclick();assert.equal(f.counts.storage,1);assert.equal(f.byId('canvas-state-combat-proof').children.length,3);
});
test('abort or owner replacement during import does not create storage or run a late comparison',async()=>{
 for(const abort of [true,false]){let resolve;const pending=new Promise(r=>resolve=r),f=fixture({loadQA:()=>pending}),run=f.handle.button.onclick();assert.equal(f.handle.button.disabled,true);if(abort)for(const listener of f.listeners)listener();else f.state.renderer={};resolve({compareCanvasStateCombat:()=>{throw Error('comparison must not run');}});assert.equal(await run,undefined);assert.equal(f.counts.storage,0);assert.equal(f.listeners.size,0);assert.equal(f.handle.button.disabled,false);if(!abort)assert.equal(JSON.parse(f.byId('canvas-state-combat-report').textContent).reason,'qa-owner-or-state-changed');}
});
test('in-flight abort suppresses late reports and images, while genuine quality/error reports remain visible',async()=>{
 let resolve,args;const pending=new Promise(r=>resolve=r),f=fixture({loadQA:async()=>({compareCanvasStateCombat:async(_,options)=>{args=options;return pending;}})}),run=f.handle.button.onclick();await Promise.resolve();await Promise.resolve();assert.ok(args);for(const listener of f.listeners)listener();args.onProgress({arm:'late'});args.onImage({src:'late',alt:'late'});resolve({report:{complete:true}});assert.equal(await run,undefined);assert.equal(f.byId('canvas-state-combat-proof').children.length,0);assert.equal(f.byId('canvas-state-combat-report').textContent,'');assert.equal(f.listeners.size,0);assert.equal(f.handle.button.disabled,false);
 const failed=fixture();failed.result.report.complete=false;failed.result.report.reason='whole-scene-pixels-mismatch';await failed.handle.button.onclick();assert.equal(JSON.parse(failed.byId('canvas-state-combat-report').textContent).reason,'whole-scene-pixels-mismatch');assert.match(failed.status.textContent,/미완료 또는 동치/);
 const error=Object.assign(Error('retained-error'),{report:{complete:false,rawFailure:1},cleanup:{complete:false}}),broken=fixture({loadQA:async()=>({compareCanvasStateCombat:async()=>{throw error;}})});await broken.handle.button.onclick();const displayed=JSON.parse(broken.byId('canvas-state-combat-report').textContent);assert.equal(displayed.error,'retained-error');assert.deepEqual(displayed.report,error.report);assert.deepEqual(displayed.cleanup,error.cleanup);assert.equal(broken.listeners.size,0);assert.equal(broken.handle.button.disabled,false);
});
