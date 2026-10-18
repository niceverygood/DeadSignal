import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {ROOF_SURFACE} from '../../work/dead-signal-game/dist/rooftop-world.js';

export const ORIGINAL_NAVIGATION_SHA256='549e01276b6b670234df5c80507ef30b8f1ec1513be8477281e59b38e21367d9';
export const CANDIDATE_NAVIGATION_SHA256='03ca2abc2140a45b443e54116c77904aadfe2e4039e793ddad6c83383dae5810';
export const NAVIGATION_BFS_NOTE='QA-only BFS candidate; production source and previous scalar candidate are unchanged. Each popped node reads this._neighbors once at the original call point. The captured original method takes the identical mask/n0..7/index arithmetic and writes inline; every other callable receives original this/grid/current and a fresh original arrow via captured Reflect.apply. Getter/prototype changes between nodes, callback retention, own function.call overrides and legitimate callable overrides are covered. No descriptor scan, world/path/cadence/array/cache change or new public instance state is introduced. Normal intrinsics at module evaluation are assumed; noncallable TypeError wording/stack and adversarial intrinsic/call-stack observations are not claimed identical. Conditional fallback closures can still require V8 lexical contexts, so source removal of calls is not a measured allocation/heap/CPU/FPS claim. This oracle has no Game, rendering or timing workload and must actually run before any pass claim. Both evidence modules retain original relative roof imports; use the loader below to rebase to dist/navigation.js.';
const baseURL=new URL('../../work/dead-signal-game/dist/navigation.js',import.meta.url),hash=value=>createHash('sha256').update(value).digest('hex');
const importLine="import {roofSupports,roofSegmentSupports} from './rooftop-world.js';";
const oldGrid=`      while (read < write) {
        const current = queue[read++];
        this._neighbors(grid, current, next => {
          if (grid.components[next] < 0) { grid.components[next] = component; queue[write++] = next; }
        });
      }`;
const newGrid=`      while (read < write) {
        const current = queue[read++], visitNeighbors = this._neighbors;
        if (visitNeighbors === DEFAULT_NEIGHBOR_VISITOR) {
          const mask = grid.edges[current];
          for (let n = 0; n < 8; n++) if (mask & (1 << n)) {
            const [dx, dy] = NEIGHBORS[n], next = current + dx + dy * grid.cols;
            if (grid.components[next] < 0) { grid.components[next] = component; queue[write++] = next; }
          }
        } else CALL_NEIGHBORS(visitNeighbors, this, [grid, current, next => {
          if (grid.components[next] < 0) { grid.components[next] = component; queue[write++] = next; }
        }]);
      }`;
const oldField=`    while (read < write) {
      const current = queue[read++];
      this._neighbors(grid, current, neighbor => {
        if (distances[neighbor] === UNREACHABLE) {
          distances[neighbor] = distances[current] + 1;
          next[neighbor] = current;
          queue[write++] = neighbor;
        }
      });
    }`;
const newField=`    while (read < write) {
      const current = queue[read++], visitNeighbors = this._neighbors;
      if (visitNeighbors === DEFAULT_NEIGHBOR_VISITOR) {
        const mask = grid.edges[current];
        for (let n = 0; n < 8; n++) if (mask & (1 << n)) {
          const [dx, dy] = NEIGHBORS[n], neighbor = current + dx + dy * grid.cols;
          if (distances[neighbor] === UNREACHABLE) {
            distances[neighbor] = distances[current] + 1;
            next[neighbor] = current;
            queue[write++] = neighbor;
          }
        }
      } else CALL_NEIGHBORS(visitNeighbors, this, [grid, current, neighbor => {
        if (distances[neighbor] === UNREACHABLE) {
          distances[neighbor] = distances[current] + 1;
          next[neighbor] = current;
          queue[write++] = neighbor;
        }
      }]);
    }`;

export async function loadNavigationBFSSources(){
 const originalBytes=await readFile(new URL('./current-navigation.txt',import.meta.url)),candidateBytes=await readFile(new URL('./candidate-navigation.mjs',import.meta.url));assert.equal(hash(originalBytes),ORIGINAL_NAVIGATION_SHA256);assert.equal(hash(candidateBytes),CANDIDATE_NAVIGATION_SHA256);
 const original=originalBytes.toString('utf8'),candidate=candidateBytes.toString('utf8'),eol=/\r\n|\n/.exec(original)[0],lines=text=>text.replaceAll('\n',eol),og=lines(oldGrid),ng=lines(newGrid),of=lines(oldField),nf=lines(newField),ni=importLine+eol+'const CALL_NEIGHBORS = Reflect.apply;',tail=eol+'const DEFAULT_NEIGHBOR_VISITOR = Navigation.prototype._neighbors;'+eol;
 for(const part of [importLine,og,of])assert.equal(original.split(part).length-1,1,'unique original BFS source block');
 assert.equal(candidate,original.replace(og,ng).replace(of,nf).replace(importLine,ni)+tail,'only two BFS call sites and captured intrinsics');
 assert.ok(candidate.endsWith(tail));const inverse=candidate.slice(0,-tail.length).replace(ng,og).replace(nf,of).replace(ni,importLine);assert.deepEqual(Buffer.from(inverse),originalBytes,'inverse bytes exactly restore complete original');
 return {original,candidate,originalBytes:originalBytes.length,candidateBytes:candidateBytes.length,originalSha256:hash(originalBytes),candidateSha256:hash(candidateBytes)};
}
export function navigationBFSModuleURL(source){const relocated=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_match,_quote,specifier)=>'from '+JSON.stringify(new URL(specifier,baseURL).href)).replaceAll('import.meta.url',JSON.stringify(baseURL.href));return'data:text/javascript;base64,'+Buffer.from(relocated).toString('base64');}
export async function loadNavigationBFSModules(){const sources=await loadNavigationBFSSources(),original=await import(navigationBFSModuleURL(sources.original)),candidate=await import(navigationBFSModuleURL(sources.candidate));return{sources,original,candidate};}

function exactNumber(actual,expected,label='number'){assert.ok(Object.is(actual,expected),label+' Object.is');const a=Buffer.allocUnsafe(8),b=Buffer.allocUnsafe(8);a.writeDoubleLE(actual);b.writeDoubleLE(expected);assert.deepEqual(a,b,label+' IEEE64');}
function exactTree(actual,expected,label='state'){if(typeof expected==='number'){exactNumber(actual,expected,label);return;}if(expected===null||typeof expected!=='object'){assert.equal(actual,expected,label);return;}assert.equal(Array.isArray(actual),Array.isArray(expected),label+' shape');assert.deepEqual(Object.keys(actual),Object.keys(expected),label+' keys');for(const key of Object.keys(expected))exactTree(actual[key],expected[key],label+'.'+key);}
function gridState(grid){return{radius:grid.radius,cell:grid.cell,cols:grid.cols,rows:grid.rows,size:grid.size,clear:Array.from(grid.clear),edges:Array.from(grid.edges),components:Array.from(grid.components),fields:[...grid.fields].map(([key,field])=>[key,{goal:field.goal,...(field.distances?{distances:Array.from(field.distances),next:Array.from(field.next)}:{})}])};}
function navState(nav){return{revision:nav.revision,active:nav.active.map(rect=>({...rect})),grids:[...nav.grids].map(([radius,grid])=>[radius,gridState(grid)])};}
const wall=(x,y,w,h,kind='building')=>({x,y,w,h,kind,destroyed:false}),radii=[12,14,15,18,19,27,49];
function fakeFieldGrid(){return{radius:14,cell:56,cols:8,rows:1,size:8,clear:new Uint8Array(8).fill(1),edges:new Uint8Array([1,17,17,16,0,0,0,0]),components:new Int32Array(8).fill(0),fields:new Map()};}

function observeBFS(module,site,mode,marker){
 const nav=new module.Navigation({width:224,height:224,obstacles:[]}),native=module.Navigation.prototype._neighbors,log=[],callbacks=[];let reads=0,ownCallReads=0,seenGrid=null,error=null;
 nav._clear=()=>true;nav._los=()=>true;nav._nearest=()=>0;
 const custom=function(grid,current,visit){seenGrid=grid;log.push(['call',current,this===nav,typeof visit]);callbacks.push(visit);if(mode==='callback-throw'&&current===2)throw marker;return Reflect.apply(native,this,[grid,current,neighbor=>{log.push(['visit',current,neighbor]);visit(neighbor);}]);};
 Object.defineProperty(custom,'call',{configurable:true,get(){ownCallReads++;throw marker;}});
 if(mode==='custom'||mode==='callback-throw')Object.defineProperty(nav,'_neighbors',{configurable:true,writable:true,value:custom});
 else if(mode!=='default')Object.defineProperty(nav,'_neighbors',{configurable:true,get(){log.push(['get',++reads]);if(mode==='getter-throw'&&reads===3)throw marker;return mode==='getter-mixed'&&reads%3===0?custom:native;}});
 try{if(site==='grid')seenGrid=nav._grid(14);else{seenGrid=fakeFieldGrid();nav._field(seenGrid,{x:100,y:100},0);}}
 catch(caught){error=caught;}
 const beforeRetained=seenGrid?gridState(seenGrid):null;
 if(site==='field'&&!error&&callbacks.length){callbacks[0](7);callbacks.at(-1)(6);}
 return{log,error,beforeRetained,afterRetained:seenGrid?gridState(seenGrid):null,nav:navState(nav),callbackCount:callbacks.length,callbacksDistinct:new Set(callbacks).size===callbacks.length,ownCallReads};
}

async function registerOracle(){
 const {sources,original,candidate}=await loadNavigationBFSModules(),O=original.Navigation,C=candidate.Navigation;
 await test('full original is pinned, BFS inverse is byte exact, and parked scalar changes are absent',()=>{assert.equal(sources.originalBytes,12361);assert.equal(sources.candidateBytes,13407);assert.equal(C.prototype._neighbors.toString(),O.prototype._neighbors.toString());assert.ok(sources.candidate.includes('if (first > last) [first, last] = [last, first];'));assert.equal(sources.candidate.includes('numericRadius'),false);});
 await test('component/field BFS preserves all typed writes, order, one method-getter read, custom this/arguments, throws and retained fresh callbacks',()=>{
  const marker=Error('controlled BFS observer throw');
  for(const site of ['grid','field'])for(const mode of ['default','custom','getter-default','getter-mixed','getter-throw','callback-throw']){const a=observeBFS(original,site,mode,marker),b=observeBFS(candidate,site,mode,marker);assert.equal(b.error,a.error,site+' '+mode+' exception identity');assert.deepEqual(b.log,a.log,site+' '+mode+' method/neighbor order');exactTree(b.beforeRetained,a.beforeRetained);exactTree(b.afterRetained,a.afterRetained);exactTree(b.nav,a.nav);assert.equal(b.callbackCount,a.callbackCount);assert.equal(b.callbacksDistinct,true);assert.equal(a.callbacksDistinct,true);assert.equal(b.ownCallReads,0);assert.equal(a.ownCallReads,0);if(mode==='getter-default'&&!a.error)assert.ok(a.log.length>1,'getter must observe more than one popped node');if(site==='field'&&mode==='custom'){assert.ok(a.callbackCount>1);assert.equal(a.afterRetained.fields[0][1].next[7],0);assert.equal(a.afterRetained.fields[0][1].next[6],3);}}
 });
 await test('a prototype method replacement during an edges read affects the next original node; noncallable fallback preserves TypeError class/read count',()=>{
  const run=module=>{const Nav=module.Navigation,saved=Object.getOwnPropertyDescriptor(Nav.prototype,'_neighbors'),native=saved.value,nav=new Nav({width:224,height:224,obstacles:[]}),grid=fakeFieldGrid(),edges=grid.edges,log=[];let reads=0;nav._clear=()=>true;nav._nearest=()=>0;
   const custom=function(g,current,visit){log.push(['custom',current,this===nav]);return Reflect.apply(native,this,[g,current,visit]);};
   Object.defineProperty(grid,'edges',{configurable:true,get(){log.push(['edges',++reads]);if(reads===2)Object.defineProperty(Nav.prototype,'_neighbors',{...saved,value:custom});return edges;}});
   let result;try{nav._field(grid,{x:100,y:100},0);result={log,state:gridState(grid)};}finally{Object.defineProperty(Nav.prototype,'_neighbors',saved);}return result;};
  const a=run(original),b=run(candidate);assert.deepEqual(b.log,a.log);exactTree(b.state,a.state);assert.ok(a.log.some(entry=>entry[0]==='custom'&&entry[1]===2));
  const noncallable=module=>{const nav=new module.Navigation({width:224,height:224,obstacles:[]}),grid=fakeFieldGrid();nav._clear=()=>true;nav._nearest=()=>0;let reads=0;Object.defineProperty(nav,'_neighbors',{get(){reads++;return 17;}});try{nav._field(grid,{x:100,y:100},0);assert.fail('noncallable must throw');}catch(error){return{kind:error.name,reads};}};assert.deepEqual(noncallable(candidate),noncallable(original));assert.equal(noncallable(original).kind,'TypeError');
 });
 await test('seven real radii retain complete components/distances/next/field and grid LRU state across mutable worlds, failed fields and invalidation',()=>{
  const first={width:960,height:720,obstacles:[wall(400,140,110,320),wall(400,350,300,110),wall(650,100,60,90,'car')]},a=structuredClone(first),b=structuredClone(first),on=new O(a),cn=new C(b),targets=[{x:620,y:260},{x:620,y:560},{x:414,y:300},{x:700,y:100},{x:200,y:100},{x:760,y:600}],from={x:300,y:280};
  const check=label=>{for(const r of radii)for(const target of targets){exactTree(cn.direction(from,target,r),on.direction(from,target,r),label);assert.equal(cn.lineOfSight(from,target,r),on.lineOfSight(from,target,r));}exactTree(navState(cn),navState(on),label);};check('cold');check('warm');
  const phases=[m=>{m.obstacles[0].destroyed=true;},m=>{m.obstacles[0].destroyed=false;},m=>{m.obstacles.push(wall(100,450,50,100,'fence'));},m=>{m.obstacles.pop();},m=>{m.water=[wall(100,100,80,90,'water')];},m=>{m.water.push(wall(180,100,80,90,'water'));},m=>{m.width=1008;m.height=768;},m=>{m.obstacles=m.obstacles.map(rect=>({...rect,x:rect.x+8}));}];for(const [index,mutate]of phases.entries()){mutate(a);mutate(b);check('mutation '+index);}on.invalidate();cn.invalidate();check('explicit invalidation');
  for(const r of [0,1,2,...radii,49,14]){exactTree(cn.direction(from,targets[0],r),on.direction(from,targets[0],r));exactTree(navState(cn),navState(on));}assert.equal(cn.grids.size,8);for(const grid of cn.grids.values())assert.ok(grid.fields.size<=4);
  const failed=Nav=>{const nav=new Nav({width:224,height:224,obstacles:[]}),grid=fakeFieldGrid();nav._clear=()=>true;nav._nearest=()=>-1;for(let i=0;i<7;i++)assert.equal(nav._field(grid,{x:i*56,y:20},0),null);return gridState(grid);};const fa=failed(O),fb=failed(C);exactTree(fb,fa);assert.equal(fa.fields.length,4);assert.ok(fa.fields.every(entry=>entry[1].goal===-1));
 });
 await test('controlled repeated corner/blocked-target path queries preserve every direction and position bit without Game or cadence changes',()=>{
  for(const target of [{x:620,y:260},{x:414,y:300}]){const world={width:960,height:720,obstacles:[wall(400,140,110,320),wall(400,350,300,110)]},on=new O(structuredClone(world)),cn=new C(structuredClone(world)),a={x:300,y:280},b={...a};for(let step=0;step<360;step++){const od=on.direction(a,target,14),cd=cn.direction(b,target,14);exactTree(cd,od);const distance=Math.hypot(target.x-a.x,target.y-a.y),stride=Math.min(3,distance);a.x+=od.x*stride;a.y+=od.y*stride;b.x+=cd.x*stride;b.y+=cd.y*stride;exactTree(b,a);assert.equal(cn._clear(b,14),on._clear(a,14));if(step%60===0)exactTree(navState(cn),navState(on));if(distance<4||(!od.x&&!od.y))break;}exactTree(navState(cn),navState(on));}
 });
 await test('original rooftop and water worlds retain every radius route, rejected void segment and BFS cache output',()=>{
  for(const roof of [false,true]){const world=roof?{width:2400,height:1800,obstacles:[wall(930,840,100,80)],rooftop:ROOF_SURFACE}:{width:960,height:720,obstacles:[wall(400,140,110,320)],water:[wall(400,460,180,130,'water')]},on=new O(structuredClone(world)),cn=new C(structuredClone(world)),pairs=roof?[[{x:1020,y:1030},{x:1600,y:930}],[{x:1020,y:1030},{x:1390,y:760}],[{x:1250,y:900},{x:1510,y:900}]]:[[{x:300,y:280},{x:620,y:560}],[{x:300,y:280},{x:500,y:500}]];for(const r of radii)for(const [from,target]of pairs){exactTree(cn.direction(from,target,r),on.direction(from,target,r));for(const allowVoid of [false,true])assert.equal(cn.lineOfSight(from,target,r,{allowVoid}),on.lineOfSight(from,target,r,{allowVoid}));}exactTree(navState(cn),navState(on));}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await registerOracle();
