import {project} from './projection.js';
import {actorHorizontalInterval} from './actor-occlusion-bounds.js';
const actorOf=item=>item.kind==='player'?item.p:item.kind==='enemy'?item.e:item.kind==='corpse'?item.corpse:null;
function orderGraph(items,edges,indegree){const ready=[];for(let i=0;i<items.length;i++)if(!indegree[i])ready.push(i);const result=[];while(ready.length){let pick=0;for(let i=1;i<ready.length;i++)if(ready[i]<ready[pick])pick=i;const index=ready.splice(pick,1)[0];result.push(items[index]);for(const next of edges[index])if(--indegree[next]===0)ready.push(next);}return result;}
function overlaps(o,p){const q=project(p.x,p.y),r=Math.max(14,p.r||14),height=Math.max(44,r*3),left=project(o.x,o.y+o.h).x,right=project(o.x+o.w,o.y).x,top=(o.x+o.y)/2-(o.height||120),bottom=(o.x+o.w+o.y+o.h)/2;return q.x+r*1.5>left&&q.x-r*1.5<right&&q.y+r*.5>top&&q.y-height<bottom;}
export function buildingActorOrder(o,p){
 if(!o||!p||o.kind!=='building'||o.destroyed||!overlaps(o,p))return 0;
 // Camera rays travel toward +X,+Y: east/south exterior points cannot be
 // hidden by this solid volume, even when a long facade's far corner is deeper.
 if(p.x>=o.x+o.w||p.y>=o.y+o.h)return 1;
 if(p.x>o.x&&p.y>o.y)return 0; // no invented order for hypothetical interior actors
 const near=Math.max(0,o.x-p.x,o.y-p.y),far=Math.min(o.x+o.w-p.x,o.y+o.h-p.y,o.height||120);
 return far>=near?-1:0;
}
export function sortWorldDrawables(items,intervalSource=null,game=null){
 const count=items.length,edges=Array.from({length:count},()=>[]),indegree=new Uint16Array(count),actors=[],obstacles=[];
 const add=(a,b)=>{if(a===b||edges[a].includes(b))return;edges[a].push(b);indegree[b]++;};
 for(let i=0;i<count;i++){if(actorOf(items[i]))actors.push(i);if(items[i].kind==='obstacle')obstacles.push(i);}
 // Keep actor-to-actor and obstacle-to-obstacle ordering exactly stable.
 for(const list of [actors,obstacles])for(let i=1;i<list.length;i++)add(list[i-1],list[i]);
 let constraints=0;for(const a of actors)for(const b of obstacles){const order=buildingActorOrder(items[b].o,actorOf(items[a]));if(order){add(order>0?b:a,order>0?a:b);constraints++;}}
 const result=orderGraph(items,edges,indegree);
 if(result.length===count)return{items:result,constraints,cycle:false};
 if(intervalSource){
  // Only rescue an already-cyclic painter graph. At every common screen-X,
  // remember the last actor: previous -> last -> current preserves every
  // overlapping pair, while certified horizontally-disjoint draws may swap.
  // Each removed frontier segment is visited once; each insertion creates at
  // most three replacements. No production all-actor-pairs graph is built.
  for(const edge of edges)edge.length=0;indegree.fill(0);
  for(let i=1;i<obstacles.length;i++)add(obstacles[i-1],obstacles[i]);
  let frontier=[],actorEdges=0,segmentsCreated=0,maxSegments=0,unknownIntervals=0,frontierVisits=0;
  const lower=(value,right)=>{let lo=0,hi=frontier.length;while(lo<hi){const mid=(lo+hi)>>>1;if(right?frontier[mid].right<=value:frontier[mid].left<value)lo=mid+1;else hi=mid;}return lo;};
  for(const index of actors){
   let interval;try{interval=typeof intervalSource==='function'?intervalSource(items[index]):actorHorizontalInterval(items[index],intervalSource,game);}catch{}
   let left=interval?.left,right=interval?.right;if(!Number.isFinite(left)||!Number.isFinite(right)||left>=right){left=-Infinity;right=Infinity;unknownIntervals++;}
   const first=lower(left,true),end=lower(right,false),owners=new Set();for(let i=first;i<end;i++){owners.add(frontier[i].owner);frontierVisits++;}
   for(const owner of owners){add(owner,index);actorEdges++;}
   const replacement=[];if(first<end&&frontier[first].left<left)replacement.push({left:frontier[first].left,right:left,owner:frontier[first].owner});replacement.push({left,right,owner:index});if(first<end&&frontier[end-1].right>right)replacement.push({left:right,right:frontier[end-1].right,owner:frontier[end-1].owner});
   segmentsCreated+=replacement.length;frontier.splice(first,end-first,...replacement);maxSegments=Math.max(maxSegments,frontier.length);
  }
  for(const a of actors)for(const b of obstacles){const order=buildingActorOrder(items[b].o,actorOf(items[a]));if(order)add(order>0?b:a,order>0?a:b);}
  const rescued=orderGraph(items,edges,indegree);if(rescued.length===count)return{items:rescued,constraints,cycle:false,rescue:{actorEdges,segmentsCreated,maxSegments,unknownIntervals,frontierVisits}};
 }
 // Conflicting multi-volume dependencies retain the complete original order.
 // Never drop an actor or partially apply an impossible painter ordering.
 return {items:result.length===count?result:items,constraints,cycle:result.length!==count};
}
