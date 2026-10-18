import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,WEAPONS} from '../dist/engine.js';
import {BULLET_BOUNDS_MARGIN,boundedBulletSegment,bulletCircleMayOverlap,bulletRectMayOverlap,segmentRectNoAlloc} from '../dist/bullet-broadphase.js';
import {firingIntent} from '../dist/firing.js';
import {NORTH_EXPEDITION,expeditionTransport} from '../dist/expedition.js';

// Frozen pre-optimization arithmetic is the behavioral oracle, including its
// inclusive boundaries and unusual floating-point/custom-input semantics.
function oldCircle(x1,y1,x2,y2,x,y,r){const dx=x2-x1,dy=y2-y1,fx=x1-x,fy=y1-y,a=dx*dx+dy*dy,c=fx*fx+fy*fy-r*r;if(c<=0)return 0;if(a===0)return null;const b=2*(fx*dx+fy*dy),disc=b*b-4*a*c;if(disc<0)return null;const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;}
function oldRect(x1,y1,x2,y2,o,pad=3){let lo=0,hi=1;for(const [start,delta,min,max]of [[x1,x2-x1,o.x-pad,o.x+o.w+pad],[y1,y2-y1,o.y-pad,o.y+o.h+pad]]){if(Math.abs(delta)<1e-9){if(start<min||start>max)return null;}else{let a=(min-start)/delta,b=(max-start)/delta;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;}}return lo;}
function box(s){return [Math.min(s[0],s[2])-BULLET_BOUNDS_MARGIN,Math.min(s[1],s[3])-BULLET_BOUNDS_MARGIN,Math.max(s[0],s[2])+BULLET_BOUNDS_MARGIN,Math.max(s[1],s[3])+BULLET_BOUNDS_MARGIN];}
const circleCandidate=(s,c)=>!boundedBulletSegment(...s)||bulletCircleMayOverlap(...box(s),...c);
const rectCandidate=(s,o)=>!boundedBulletSegment(...s)||bulletRectMayOverlap(...box(s),o);
function random(seed){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}

test('scalar slabs stay Object.is exact and swept AABBs never reject original hits across numeric boundaries and 100000 deterministic cases',()=>{
 const segments=[[0,0,0,0],[0,0,100,0],[100,0,0,0],[0,0,0,100],[0,0,100,100],[0,0,1e-12,0],[0,0,1e-4,0],[0,0,1e9,0],[-8192,0,0,0],[8192,0,8192,10],[0,0,NaN,1],[Infinity,0,1,1]];
 const circles=[[0,0,3],[50,3,3],[100,0,3],[103,0,3],[50,3+1e-12,3],[50,3-1e-12,3],[5e8,4,3],[0,0,-3],[0,0,0],[0,0,2.999],[0,0,Infinity],[0,0,NaN],[NaN,0,3],[0,0,513],[8193,0,3]];
 const rects=[{x:20,y:3,w:10,h:10},{x:20,y:3+1e-12,w:10,h:10},{x:103,y:-5,w:10,h:10},{x:0,y:0,w:0,h:0},{x:10,y:10,w:-20,h:20},{x:0,y:0,w:Infinity,h:20},{x:NaN,y:0,w:10,h:20},{x:8193,y:0,w:20,h:20}];
 for(const s of segments){for(const c of circles)if(oldCircle(...s,...c)!==null)assert.equal(circleCandidate(s,c),true);for(const o of rects){const t=oldRect(...s,o);assert.ok(Object.is(segmentRectNoAlloc(...s,o),t),'scalar numeric boundary including null/NaN');if(t!==null)assert.equal(rectCandidate(s,o),true);}}
 for(const delta of [0,1e-12,1e-9-1e-15,1e-9,1e-9+1e-15,1e-4-1e-12,1e-4,8192,8192+1e-8]){
  const s=[0,0,delta,10],o={x:3,y:5,w:0,h:0};assert.ok(Object.is(segmentRectNoAlloc(...s,o),oldRect(...s,o)),'scalar stationary-axis threshold');if(oldRect(...s,o)!==null)assert.equal(rectCandidate(s,o),true);
 }
 for(const s of [[-0,-0,0,0],[0,0,-0,-0],[1,1,-1,-1],[NaN,0,1,1],[-Infinity,0,Infinity,0],[1e200,1e200,-1e200,-1e200],['0',0,'100',0]])for(const pad of [-3,-0,0,3,NaN,Infinity,-Infinity])for(const o of [...rects,{x:-0,y:-0,w:-0,h:-0},{x:Infinity,y:-Infinity,w:3,h:3}])assert.ok(Object.is(segmentRectNoAlloc(...s,o,pad),oldRect(...s,o,pad)),'scalar preserves signed-zero, nonfinite, custom padding and coercion arithmetic');
 const readOrder=run=>{const order=[],o={get x(){order.push('x');return 50;},get y(){order.push('y');return 50;},get w(){order.push('w');return 10;},get h(){order.push('h');return 10;}};return{value:run(0,0,1,0,o),order};};
 const oldOrder=readOrder(oldRect),newOrder=readOrder(segmentRectNoAlloc);assert.ok(Object.is(newOrder.value,oldOrder.value));assert.deepEqual(newOrder.order,oldOrder.order,'both axis bounds are evaluated before any slab rejection');assert.deepEqual(oldOrder.order,['x','x','w','y','y','h']);
 assert.equal(boundedBulletSegment(0,0,0,0),false);assert.equal(boundedBulletSegment(0,0,1e-12,0),false);assert.equal(boundedBulletSegment(0,0,1e9,0),false);
 assert.equal(boundedBulletSegment(0,0,8192,0),true);assert.equal(boundedBulletSegment(8193,0,8194,0),false);
 assert.notEqual(oldCircle(0,0,1e9,0,5e8,4,3),null,'extreme cancellation is preserved through fallback rather than geometrically corrected');
 const next=random(731),totals={circleHits:0,rectHits:0,circleRejected:0,rectRejected:0};
 for(let i=0;i<100000;i++){
  const x=next()*6000-3000,y=next()*6000-3000,dx=next()*1200-600,dy=next()*1200-600,s=[x,y,x+dx,y+dy],along=next(),r=3+next()*509;
  const c=i%3===0?[x+dx*along,y+dy*along,r]:[next()*8000-4000,next()*8000-4000,r];
  const o=i%3===0?{x:x+dx*along-20,y:y+dy*along-20,w:40,h:40}:{x:next()*8000-4000,y:next()*8000-4000,w:next()*400,h:next()*400};
  const circleHit=oldCircle(...s,...c)!==null,rectT=oldRect(...s,o),rectHit=rectT!==null,cm=circleCandidate(s,c),rm=rectCandidate(s,o);
  assert.ok(Object.is(segmentRectNoAlloc(...s,o),rectT),'scalar equals the original oracle case '+i);
  if(circleHit){totals.circleHits++;assert.equal(cm,true,'circle oracle case '+i);}if(rectHit){totals.rectHits++;assert.equal(rm,true,'rect oracle case '+i);}
  if(!cm)totals.circleRejected++;if(!rm)totals.rectRejected++;
 }
 assert.ok(totals.circleHits>30000&&totals.rectHits>30000,'the oracle covers many real intersections');assert.ok(totals.circleRejected>50000&&totals.rectRejected>50000,'the candidate actually rejects separated targets');
});

const fresh=(options={})=>{const g=new Game({seed:774,...options});g.enemies=[];g.bullets=[];g.world.obstacles=[];g.spawnClock=1e9;g.player.x=1000;g.player.y=900;g.player.invul=100;g.drainEvents();return g;};
function enemy(g,type,x,y){const e=g.spawnEnemy(type,450);assert.ok(e);Object.assign(e,{x,y,speed:0});return e;}
function obstacle(g,kind,x,y,w,h,hp){const o={id:++g.id,kind,x,y,w,h,hp,maxHp:hp,destroyed:false};g.world.obstacles.push(o);return o;}
function bullet(g,{x=1000,y=900,vx=2000,vy=0,pierce=0,hits=[]}={}){const w=WEAPONS[g.player.weapon],b={id:++g.id,x,y,px:x,py:y,vx,vy,life:w.life,damage:w.damage,pierce,hits:new Set(hits),color:w.color,weapon:g.player.weapon};g.bullets.push(b);return b;}
const stats=()=>({rectCandidates:0,rectRejected:0,rectTests:0,circleCandidates:0,circleRejected:0,circleTests:0});
function pair(g,boundsMode){const raw=g.snapshot();assert.ok(raw,'the source fixture must be a valid checkpoint');const a=Game.restore(raw,{resumePlaying:true}),b=Game.restore(raw,{resumePlaying:true});assert.ok(a&&b);a.forceBulletNarrowPhase=true;b.forceBulletNarrowPhase=false;if(boundsMode!==undefined){a.bulletBoundsMode=boundsMode;b.bulletBoundsMode=boundsMode;}a.bulletCollisionStats=stats();b.bulletCollisionStats=stats();return[a,b];}
function compare(a,b,label){
 const left=a.snapshot(),right=b.snapshot();assert.ok(left,label+' baseline checkpoint is valid');assert.ok(right,label+' optimized checkpoint is valid');assert.deepEqual(right,left,label+' gameplay, save and both RNG streams');
 for(const name of ['forceBulletNarrowPhase','bulletCollisionStats','bulletBoundsMode']){assert.equal(Object.hasOwn(right,name),false,'QA controls are not saved');assert.equal(Object.hasOwn(left,name),false);}
 for(const name of ['events','particles','links','texts','shake','flash'])assert.deepEqual(b[name],a[name],label+' '+name+' order and values');
 return right;
}

test('rect/all/off paired real combat preserves guidance, piercing, shield/stun/burn and shock/volatile explosions across seeds and weapons',()=>{
 const coverage={hit:false,shield:false,shock:false,explosion:false,burn:false,stun:false,rejected:0},modeCounts=Object.fromEntries(['rect','all','off'].map(mode=>[mode,stats()]));
 for(const boundsMode of ['rect','all','off'])for(const seed of [774,19341])for(const weapon of ['shotgun','nailgun'])for(const pierce of [0,1,3]){
  const g=fresh({seed,weapon});g.upgrades={...(pierce?{pierce}:{}),shock:3,volatile:3,fire:2,knockback:2,reload:2};
  for(let i=0;i<12;i++)enemy(g,['shield','walker','gas','elite'][i%4],1040+i*27,900+(i%2?8:0));
  g.enemies[0].angle=Math.PI;g.enemies[2].hp=24;
  for(let i=0;i<8;i++)enemy(g,'walker',400+i*35,500);
  obstacle(g,'barrel',1190,887,10,26,20);obstacle(g,'building',1480,810,50,180,Infinity);
  for(let i=0;i<12;i++)obstacle(g,'fence',200+i*30,200,10,20,Infinity);
  g.fires.push({x:1100,y:900,r:90,time:3,duration:3,emberClock:0});const [a,b]=pair(g,boundsMode);
  for(let frame=0;frame<45;frame++){
   if(a.state==='upgrade'){const choice=a.choices[0].id;assert.equal(a.chooseUpgrade(choice),true);assert.equal(b.chooseUpgrade(choice),true);}
   const mode=frame%3===0?'auto':'manual',inputs={mode,shoot:true,aimX:1450,aimY:900};const ai=firingIntent(a,inputs),bi=firingIntent(b,inputs);assert.deepEqual(bi,ai,'original aim assistance is unchanged');
   a.tick(.02,ai);b.tick(.02,bi);
   if(frame%5===0||frame===44)compare(a,b,boundsMode+' '+seed+' '+weapon+' pierce '+pierce+' frame '+frame);
   for(const event of a.events){coverage.hit||=event.type==='hit';coverage.shield||=event.type==='hit'&&event.shielded;coverage.shock||=event.type==='shock';coverage.explosion||=event.type==='explosion';}
   coverage.burn||=a.enemies.some(e=>e.burn>0);coverage.stun||=a.enemies.some(e=>e.stun>0||e.vx!==0||e.vy!==0);
  }
  const saved=compare(a,b,'final real combat '+boundsMode),restored=Game.restore(saved,{resumePlaying:true});assert.ok(restored);assert.deepEqual(restored.snapshot(),saved);assert.equal(restored.bulletCollisionStats??null,null);assert.equal(restored.forceBulletNarrowPhase??false,false);assert.equal(restored.bulletBoundsMode??'rect','rect');
  assert.equal(a.bulletCollisionStats.rectRejected,0);assert.equal(a.bulletCollisionStats.circleRejected,0);
  for(const kind of ['rect','circle'])assert.equal(b.bulletCollisionStats[kind+'Candidates'],b.bulletCollisionStats[kind+'Rejected']+b.bulletCollisionStats[kind+'Tests']);
  coverage.rejected+=b.bulletCollisionStats.rectRejected+b.bulletCollisionStats.circleRejected;
  for(const key of Object.keys(modeCounts[boundsMode]))modeCounts[boundsMode][key]+=b.bulletCollisionStats[key];
 }
 for(const key of ['hit','shield','shock','explosion','burn','stun'])assert.equal(coverage[key],true,key+' behavior was actually exercised');assert.ok(coverage.rejected>1000,'separated targets skip real narrow-phase work');
 assert.ok(modeCounts.rect.rectRejected>1000);assert.equal(modeCounts.rect.circleRejected,0,'rect mode always retains original circle arithmetic');assert.ok(modeCounts.all.rectRejected>1000&&modeCounts.all.circleRejected>1000);assert.equal(modeCounts.off.rectRejected,0);assert.equal(modeCounts.off.circleRejected,0,'off mode runs every original narrow phase with scalar slabs');
});

test('paired hits retain stable ties, prior pierce hits, same-tick destruction and the immutable escort vehicle',()=>{
 for(const boundsMode of ['rect','all','off',undefined])for(const scenario of ['wall-tie','enemy-tie','pierce-history','destroyed-between-bullets','transport']){
  const g=fresh({weapon:'nailgun',...(scenario==='transport'?{expeditionId:NORTH_EXPEDITION.id}:{})});let first,second,wall,transport;
  if(scenario==='wall-tie'){first=enemy(g,'walker',1064,900);wall=obstacle(g,'building',1050,880,10,40,Infinity);bullet(g);}
  if(scenario==='enemy-tie'){first=enemy(g,'walker',1050,900);second=enemy(g,'walker',1050,900);bullet(g);}
  if(scenario==='pierce-history'){first=enemy(g,'walker',1040,900);second=enemy(g,'walker',1080,900);bullet(g,{pierce:1,hits:[first.id]});}
  if(scenario==='destroyed-between-bullets'){first=enemy(g,'elite',1080,900);wall=obstacle(g,'barrel',1050,893,8,14,15);bullet(g);bullet(g,{pierce:1});}
  if(scenario==='transport'){
   // Keep the real expedition's safe player spawn so restore remains valid.
   g.player.x=g.world.spawn.x;g.player.y=g.world.spawn.y;transport=expeditionTransport(g);assert.ok(transport&&Object.isFrozen(transport));
   first=enemy(g,'walker',transport.x+transport.w+40,transport.y+transport.h/2);bullet(g,{x:transport.x-40,y:transport.y+transport.h/2});
  }
  const [a,b]=pair(g,boundsMode),before=a.enemies.map(e=>({id:e.id,hp:e.hp}));a.updateBullets(.05);b.updateBullets(.05);const saved=compare(a,b,(boundsMode??'restored-default')+' '+scenario);
  const hp=id=>a.enemies.find(e=>e.id===id)?.hp;
  if(scenario==='wall-tie'){assert.equal(hp(first.id),before[0].hp);assert.ok(a.events.some(e=>e.type==='wall-hit'));}
  if(scenario==='enemy-tie'){assert.equal(hp(first.id),before[0].hp-15);assert.equal(hp(second.id),before[1].hp);}
  if(scenario==='pierce-history'){assert.equal(hp(first.id),before[0].hp);assert.equal(hp(second.id),before[1].hp-15);assert.ok(saved.bullets[0].hits.includes(first.id)&&saved.bullets[0].hits.includes(second.id));}
  if(scenario==='destroyed-between-bullets'){assert.equal(a.world.obstacles.find(o=>o.id===wall.id).destroyed,true);assert.ok(a.events.some(e=>e.type==='explosion'));assert.ok(saved.bullets.some(shot=>shot.hits.includes(first.id)),'the later bullet passes the newly destroyed prop and records its surviving target');}
  if(scenario==='transport'){assert.equal(hp(first.id),before[0].hp);assert.equal(expeditionTransport(a).hp,Infinity);assert.equal(expeditionTransport(a).destroyed,false);assert.ok(a.events.some(e=>e.type==='wall-hit'&&e.material==='metal'));assert.equal(saved.bullets.length,0);}
 }
});
