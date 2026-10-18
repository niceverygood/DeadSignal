import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {project} from '../dist/projection.js';
import {buildingActorOrder,sortWorldDrawables} from '../dist/world-depth.js';
import {actorHorizontalInterval} from '../dist/actor-occlusion-bounds.js';
import {ProductionArt,spritePlacement} from '../dist/production-art.js';
import {Renderer} from '../dist/renderer.js';
import {getBoss} from '../dist/campaign.js?v=0.29.0';
import * as THREE from '../dist/player-rig/vendor/three.module.js';

const beforeURL=new URL('../../../qa/building-occlusion-20261018/world-depth-before-building-occlusion.txt',import.meta.url),before=await readFile(beforeURL,'utf8');assert.equal(createHash('sha256').update(before).digest('hex'),'64ca43095c709717abd1e5ee7fef4c6d9d27dfd80ed31d0f18c9b034bcccb294');
const oldURL=new URL('../dist/world-depth.js',import.meta.url),old=await import('data:text/javascript;base64,'+Buffer.from(before.replace(/from\s*(['"])(\.\/[^'"]+)\1/g,(m,q,specifier)=>'from '+JSON.stringify(new URL(specifier,oldURL).href))).toString('base64'));
const wall={kind:'building',x:200,y:200,w:80,h:220,height:100};
const item=(actor,kind='enemy')=>({kind,[kind==='player'?'p':'e']:actor,depth:project(actor.x,actor.y).y});
const actorOf=item=>item.p??item.e??item.corpse;
const overlap=(a,b)=>a.left<b.right&&b.left<a.right;
const normalized=interval=>interval&&Number.isFinite(interval.left)&&Number.isFinite(interval.right)&&interval.left<interval.right?interval:{left:-Infinity,right:Infinity};
function oracleEdges(items,intervals){
 const edges=[],actors=items.map((value,index)=>actorOf(value)?index:null).filter(value=>value!==null),obstacles=items.map((value,index)=>value.kind==='obstacle'?index:null).filter(value=>value!==null);
 // Deliberately quadratic independent specification; production uses the
 // interval frontier. Every overlapping original actor pair must stay ordered.
 for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)if(overlap(normalized(intervals.get(items[actors[i]])),normalized(intervals.get(items[actors[j]]))))edges.push([actors[i],actors[j]]);
 for(let i=1;i<obstacles.length;i++)edges.push([obstacles[i-1],obstacles[i]]);
 for(const a of actors)for(const b of obstacles){const order=buildingActorOrder(items[b].o,actorOf(items[a]));if(order)edges.push(order>0?[b,a]:[a,b]);}return edges;
}
function possible(count,edges){const degree=Array(count).fill(0),next=Array.from({length:count},()=>[]);for(const [a,b]of edges){degree[b]++;next[a].push(b);}const queue=degree.flatMap((value,index)=>value===0?[index]:[]);for(let i=0;i<queue.length;i++)for(const b of next[queue[i]])if(--degree[b]===0)queue.push(b);return queue.length===count;}

test('legal front/rear actors of one long building no longer lose occlusion constraints to an irrelevant global actor chain',()=>{
 const front=item({x:300,y:150,r:45}),rear=item({x:170,y:350,r:14}),building={kind:'obstacle',o:wall,depth:350},input=[front,rear,building],saved=JSON.stringify(input),game=Object.create(Game.prototype);game.world={width:2400,height:1800,obstacles:[wall]};game.expedition=null;
 assert.equal(game.blocked(front.e.x,front.e.y,front.e.r),false);assert.equal(game.blocked(rear.e.x,rear.e.y,rear.e.r),false);assert.equal(buildingActorOrder(wall,front.e),1);assert.equal(buildingActorOrder(wall,rear.e),-1);assert.ok(input[0].depth<input[1].depth&&input[1].depth<input[2].depth);assert.equal(old.sortWorldDrawables(input).cycle,true);
 const intervals=new Map([[front,{left:project(front.e.x,front.e.y).x-90,right:project(front.e.x,front.e.y).x+90}],[rear,{left:project(rear.e.x,rear.e.y).x-60,right:project(rear.e.x,rear.e.y).x+60}]]),result=sortWorldDrawables(input,value=>intervals.get(value));
 assert.equal(result.cycle,false);assert.deepEqual(result.items,[rear,building,front]);assert.ok(result.rescue);assert.equal(JSON.stringify(input),saved);assert.equal(result.items[2],front);
 assert.equal(sortWorldDrawables(input,()=>null).items,input,'unknown whole-draw envelopes keep the original conservative fallback');assert.equal(sortWorldDrawables(input,()=>({left:0,right:1})).cycle,true,'actually overlapping actors cannot silently swap');
 for(const [point,order]of [[{x:330,y:300,r:45},1],[{x:240,y:450,r:14},1],[{x:170,y:300,r:14},-1],[{x:240,y:170,r:14},-1],[{x:170,y:170,r:14},-1]]){assert.equal(game.blocked(point.x,point.y,point.r),false);assert.equal(buildingActorOrder(wall,point),order);}
});

test('non-cyclic output is exact to the frozen original; rescue preserves every independently specified overlap pair and building edge over seeded fixtures',()=>{
 let seed=19081;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};let rescued=0,unchanged=0;
 for(let trial=0;trial<160;trial++){
  const input=[item({x:300,y:150,r:45}),item({x:170,y:350,r:14})];for(let i=0;i<18;i++)input.push(item({x:60+random()*430,y:60+random()*480,r:14}));input.push({kind:'obstacle',o:trial%5===0?{...wall,destroyed:true}:wall,depth:350});input.sort((a,b)=>a.depth-b.depth);
  const intervals=new Map(input.filter(actorOf).map((value,index)=>{const centre=project(actorOf(value).x,actorOf(value).y).x,width=8+random()*80;return[value,(index+trial)%31===0?null:{left:centre-width,right:centre+width}];})),baseline=old.sortWorldDrawables(input);let reads=0;const actual=sortWorldDrawables(input,value=>{reads++;return intervals.get(value);});
  if(!baseline.cycle){assert.deepEqual(actual,baseline);assert.equal(reads,0);unchanged++;continue;}
  const edges=oracleEdges(input,intervals),canOrder=possible(input.length,edges);assert.equal(actual.cycle,!canOrder);if(!canOrder){assert.equal(actual.items,input);continue;}
  rescued++;const positions=new Map(actual.items.map((value,index)=>[value,index]));assert.equal(new Set(actual.items).size,input.length);for(const [a,b]of edges)assert.ok(positions.get(input[a])<positions.get(input[b]),'independent overlapping actor/building constraint');assert.ok(actual.rescue.actorEdges<=3*input.length);assert.ok(actual.rescue.frontierVisits<=3*input.length);assert.ok(actual.rescue.segmentsCreated<=3*input.length);
 }
 assert.ok(rescued>0);assert.ok(unchanged>0);
});

test('frontier graph size stays bounded for many disjoint actors and unknown envelopes form conservative overlap chains',()=>{
 const front=item({x:300,y:150,r:45}),rear=item({x:170,y:350,r:14}),input=[front,rear];for(let i=0;i<1500;i++)input.push(item({x:1000+i,y:1000,r:14}));input.push({kind:'obstacle',o:wall,depth:350});input.sort((a,b)=>a.depth-b.depth);
 const intervals=new Map(input.filter(actorOf).map((value,index)=>[value,{left:index*20,right:index*20+8}]));const result=sortWorldDrawables(input,value=>intervals.get(value));assert.equal(result.cycle,false);assert.ok(result.rescue);assert.ok(result.rescue.actorEdges<=3*input.length);assert.ok(result.rescue.frontierVisits<=3*input.length);assert.ok(result.rescue.segmentsCreated<=3*input.length);assert.ok(result.rescue.maxSegments<=2*input.length+1);
 assert.equal(sortWorldDrawables(input,()=>null).cycle,true);assert.equal(sortWorldDrawables(input,()=>({left:-10,right:10})).cycle,true);
});

function metadata(){return{projection:{subjectHeight:44,pixelsPerWorld:2},atlas:{samples:2},frames:[{rect:{x:0,y:0,width:64,height:80},footPivot:{x:-5,y:75}},{rect:{x:0,y:0,width:10,height:80},footPivot:{x:75,y:75}}]};}
function boundsFixture(kind='enemy'){
 const boss=getBoss('boss-01-final'),key=kind==='player'?'survivor-shotgun':kind==='boss'?boss.id:'elite',section=kind==='player'?'characters':kind==='boss'?'bosses':'enemies',ids=[key+'-walk',key+'-actions'],manifest={version:1,assets:Object.fromEntries(ids.map(id=>[id,{metadata:id+'/metadata.json',atlas:id+'/atlas.png',referenceRadius:kind==='boss'?45:27,worldHeight:kind==='boss'?88:44}])),[section]:{[key]:{walk:ids[0],idle:ids[0],actions:ids[1]}}},art=new ProductionArt({manifest,fetchImpl:()=>assert.fail('no loading')});for(const id of ids)art.records.set(id,{status:'ready',image:{width:256,height:256},metadata:metadata()});
 const actor=kind==='player'?{x:300,y:150,r:14,weapon:'shotgun',hp:100,invul:0,reloadTime:1,dashTime:1,dashX:-.7,dashY:.7}:kind==='boss'?{x:300,y:150,r:45,type:'collector',bossKey:boss.id,hp:800,maxHp:900,hitFlash:.1,stun:.1,burn:1,attackState:'windup',angle:.7}:{x:300,y:150,r:27,type:'elite',hp:20,maxHp:100,hitFlash:.1,stun:.1,burn:1,gatekeeper:true,angle:.7};
 const r=Object.create(Renderer.prototype);Object.assign(r,{productionArt:art,zoom:1,nativeActorFrames:new WeakMap(),nativePlayerShots:new WeakMap(),nativeHitLights:new Map(),productionDataset(){}});const config={projection:{subjectHeight:kind==='boss'?88:44,pixelsPerWorld:2.25,footPivot:{x:128,y:205}}};r.liveBoss={size:512,models:new Map([[boss.id,{config}]])};r.liveEnemies={size:256,models:new Map([['enemy-elite',{config}]])};r.livePlayer={ready:true,camera:new THREE.OrthographicCamera(-128/(3*Math.sqrt(1.5)),128/(3*Math.sqrt(1.5)),1,-1)};
 return{r,actor,art,item:kind==='player'?item(actor,'player'):item(actor),boss};
}

test('horizontal certificates enclose all cropped pivots, native256/512 full cells and actual native draw accessories; unknown paths stay conservative',()=>{
 for(const kind of ['player','enemy','boss']){
  const {r,actor,art,item:value,boss}=boundsFixture(kind),before=JSON.stringify(actor),q=project(actor.x,actor.y),interval=actorHorizontalInterval(value,r,{alarm:null});assert.ok(interval);const width=kind==='boss'?512:256,density=kind==='player'?3:kind==='boss'?4.5:2.25,pivot=width/2,rect={x:0,y:0,width,height:width},selected={id:'native',image:{width,height:width},metadata:{projection:{subjectHeight:44,pixelsPerWorld:density}},frame:{rect,footPivot:{x:pivot,y:width*.8}},placement:{x:q.x-pivot/density,y:q.y-width*.8/density,width:width/density,height:width/density,bounds:{body:{left:q.x-10,right:q.x+10,top:q.y-90,bottom:q.y+4}}}};
  for(const record of art.records.values())for(const frame of record.metadata.frames){const placement=spritePlacement(record.metadata,frame,{foot:q,worldHeight:kind==='boss'?88:44});assert.ok(interval.left<=placement.x&&interval.right>=placement.x+placement.width);}
  let min=Infinity,max=-Infinity,lineWidth=1;const stack=[];const mark=(left,right)=>{min=Math.min(min,left);max=Math.max(max,right);};const c={globalAlpha:1,font:'10px sans-serif',textAlign:'start',save(){stack.push({lineWidth,font:this.font,align:this.textAlign});},restore(){const saved=stack.pop();lineWidth=saved.lineWidth;this.font=saved.font;this.textAlign=saved.align;},get lineWidth(){return lineWidth;},set lineWidth(value){lineWidth=value;},beginPath(){},closePath(){},clip(){},fill(){},stroke(){},setLineDash(){},moveTo(x){mark(x-lineWidth/2,x+lineWidth/2);},lineTo(x){mark(x-lineWidth/2,x+lineWidth/2);},ellipse(x,y,rx){mark(x-rx-lineWidth/2,x+rx+lineWidth/2);},fillRect(x,y,w){mark(x,x+w);},strokeRect(x,y,w){mark(x-lineWidth/2,x+w+lineWidth/2);},drawImage(...args){const x=args.length===9?args[5]:args[1],w=args.length===9?args[7]:args[3]??args[0].width;mark(x,x+w);},fillText(text,x,y,maxWidth){const fontSize=Number(/(\d+)px/.exec(this.font)?.[1]??10),w=maxWidth??text.length*fontSize;mark(this.textAlign==='center'?x-w/2:x,this.textAlign==='center'?x+w/2:x+w);},createRadialGradient(){return{addColorStop(){}};}};
  r.nativeEnemyFrame=()=>selected;r.nativePlayerFrame=()=>selected;const game={time:1,alarm:null};if(kind==='player')r.drawPlayer(c,actor,game,1);else if(kind==='boss')r.drawCampaignBoss(c,actor,1,game,boss);else assert.equal(r.drawNativeEnemy(c,actor,1,game),true);
  assert.ok(interval.left<=min&&interval.right>=max,kind+' whole native body, shadows, burn/glow, HP/label/stun or dash/RELOAD');assert.equal(stack.length,0);assert.equal(JSON.stringify(actor),before);
  r.zoom=.5;assert.equal(actorHorizontalInterval(value,r,game),null);r.zoom=1;art.records.clear();assert.equal(actorHorizontalInterval(value,r,game),null);
 }
 assert.equal(actorHorizontalInterval({kind:'decor'},new Proxy({}, {get(){assert.fail('irrelevant owner read');}})),null);
});
