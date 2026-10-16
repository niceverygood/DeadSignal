import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../dist/renderer.js';
import {project,unproject} from '../dist/projection.js';
import {Game} from '../dist/engine.js';
import {Navigation} from '../dist/navigation.js';
import {getBoss} from '../dist/campaign.js';
import {warnAdditionalBoss,resolveAdditionalBoss,updateBossHazards} from '../dist/boss-patterns.js';

const TAU=Math.PI*2;
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const fingerprint=game=>JSON.stringify({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,hazards:game.bossHazards,random:game.random.getState(),visual:game.visualRandom.getState(),id:game.id});

// This records complete Canvas paths, including partial ellipse arcs. It does
// not replace an arc by its full bounding rectangle or generate artwork.
function context(matrix=[1,0,0,1,0,0]){
  const fills=[],strokes=[],clips=[],stack=[];let current={points:[],local:[],arcs:[],closed:false},dash=[2,3],transform=[...matrix],clipDepth=2;
  const c={globalAlpha:.41,lineWidth:4.5,fillStyle:'#123456',strokeStyle:'#abcdef',lineCap:'round',lineJoin:'bevel'};
  const props=()=>({globalAlpha:c.globalAlpha,lineWidth:c.lineWidth,fillStyle:c.fillStyle,strokeStyle:c.strokeStyle,lineCap:c.lineCap,lineJoin:c.lineJoin});
  const state=()=>({...props(),matrix:[...transform],dash:[...dash],clipDepth,stackDepth:stack.length});
  c.save=()=>stack.push({...props(),transform:[...transform],dash:[...dash],clipDepth});
  c.restore=()=>{const saved=stack.pop();assert.ok(saved,'balanced canvas restore');for(const key of Object.keys(props()))c[key]=saved[key];transform=saved.transform;dash=saved.dash;clipDepth=saved.clipDepth;};
  c.beginPath=()=>{current={points:[],local:[],arcs:[],closed:false};};
  const add=(x,y)=>{current.local.push({x,y});current.points.push({x:transform[0]*x+transform[2]*y+transform[4],y:transform[1]*x+transform[3]*y+transform[5]});};
  c.moveTo=c.lineTo=add;c.closePath=()=>{current.closed=true;};
  c.ellipse=(x,y,rx,ry,rotation,start,end,anticlockwise=false)=>{
    current.arcs.push({x,y,rx,ry,rotation,start,end,anticlockwise});
    let delta=end-start;if(anticlockwise){while(delta>0)delta-=TAU;delta=Math.max(-TAU,delta);}else{while(delta<0)delta+=TAU;delta=Math.min(TAU,delta);}
    const steps=Math.max(1,Math.ceil(Math.abs(delta)/Math.PI*128));
    for(let index=0;index<=steps;index++){
      const angle=start+delta*index/steps,a=rx*Math.cos(angle),b=ry*Math.sin(angle);
      add(x+Math.cos(rotation)*a-Math.sin(rotation)*b,y+Math.sin(rotation)*a+Math.cos(rotation)*b);
    }
  };
  const record=()=>({points:structuredClone(current.points),local:structuredClone(current.local),arcs:structuredClone(current.arcs),closed:current.closed,alpha:c.globalAlpha,color:c.fillStyle,lineWidth:c.lineWidth,dash:[...dash]});
  c.fill=()=>fills.push(record());c.stroke=()=>strokes.push({...record(),color:c.strokeStyle});
  c.clip=()=>{clips.push(record());clipDepth++;};c.setLineDash=value=>{dash=[...value];};
  return{c,fills,strokes,clips,state};
}
function render(hazard,world={width:2400,height:1800},matrix){
  const trace=context(matrix),before=trace.state(),renderer=Object.create(Renderer.prototype);
  renderer.drawBossHazard(trace.c,hazard,world);assert.deepEqual(trace.state(),before,'Canvas state must be restored');
  assert.equal(trace.fills.length,1,'the capsule has one fill, including both caps; no overlapping alpha layers');
  return{...trace,fill:trace.fills[0],worldBoundary:trace.fills[0].local.map(point=>unproject(point.x,point.y,1))};
}
function setupBeam(angle=0,origin={x:1200,y:900}){
  const game=new Game({seed:21011,missionId:'mission-07'});game.world.obstacles=[];game.navigation=new Navigation(game.world);
  const enemy=game.spawnMissionBoss('mid'),boss=getBoss(enemy.bossKey);
  Object.assign(enemy,{...origin,stun:0});
  Object.assign(game.player,{x:origin.x+Math.cos(angle)*695,y:origin.y+Math.sin(angle)*695,invul:0});
  warnAdditionalBoss(game,enemy,boss);
  const warning=game.bossHazards.find(hazard=>hazard.kind==='beam');assert.ok(warning);
  return{game,enemy,boss,warning};
}
function distanceToEdge(point,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
  return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
}
function discTouchesPolygon(point,radius,polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if(distanceToEdge(point,a,b)<=radius)return true;
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

test('the actual 7th-mission beam endpoint hit is covered by the rendered round cap in both warning and active phases',()=>{
  const f=setupBeam(0,{x:500,y:900}),{game,warning}=f;
  close(warning.targetX,1170);close(warning.width,34);assert.equal(game.player.r,14);
  const before=fingerprint(game),warn=render(warning,game.world);
  close(Math.max(...warn.worldBoundary.map(point=>point.x)),1187);
  assert.equal(discTouchesPolygon(game.player,game.player.r,warn.worldBoundary),true);
  assert.equal(fingerprint(game),before);assert.equal(game.player.x-game.player.r-warning.targetX,11,'the prior flat rectangle left this visible gap');
  resolveAdditionalBoss(game,f.enemy,f.boss);warning.time=.01;
  updateBossHazards(game,.02);assert.equal(game.player.hp,67,'same actual skill, damage and collision behavior');assert.equal(warning.phase,'active');
  const active=render(warning,game.world);
  assert.deepEqual(active.fill.local,warn.fill.local);assert.equal(warn.fill.alpha,.13);assert.equal(active.fill.alpha,.22);
});

test('all eight world headings project the two exact outer semicircles and preserve total width',()=>{
  for(let direction=0;direction<8;direction++){
    const {game,warning}=setupBeam(direction*Math.PI/4),trace=render(warning,game.world),radius=warning.width/2;
    assert.equal(trace.fill.arcs.length,2);assert.equal(trace.fill.closed,true);
    for(const point of trace.worldBoundary)close(distanceToEdge(point,{x:warning.x,y:warning.y},{x:warning.targetX,y:warning.targetY}),radius);
    const endpoints=[project(warning.targetX,warning.targetY,1),project(warning.x,warning.y,1)];
    trace.fill.arcs.forEach((arc,index)=>{close(arc.x,endpoints[index].x);close(arc.y,endpoints[index].y);close(arc.rx,radius*Math.sqrt(1.5));close(arc.ry,radius/Math.sqrt(2));assert.equal(arc.anticlockwise,true);});
  }
});

test('visible capsule overlap agrees with actual Game hazard damage beside, beyond and behind every heading',()=>{
  for(let direction=0;direction<8;direction++){
    const angle=direction*Math.PI/4,f=setupBeam(angle),{game,warning}=f,trace=render(warning,game.world),forward={x:Math.cos(angle),y:Math.sin(angle)},normal={x:-Math.sin(angle),y:Math.cos(angle)};
    resolveAdditionalBoss(game,f.enemy,f.boss);
    const locations=[
      {end:true,along:25,side:0,hit:true},{end:true,along:30,side:0,hit:true},{end:true,along:32,side:0,hit:false},
      {end:true,along:20,side:20,hit:true},{end:true,along:23,side:23,hit:false},
      {end:false,along:-25,side:0,hit:true},{end:false,along:200,side:30,hit:true},{end:false,along:200,side:32,hit:false},
    ];
    for(const location of locations){
      const origin=location.end?{x:warning.targetX,y:warning.targetY}:{x:warning.x,y:warning.y};
      Object.assign(game.player,{x:origin.x+forward.x*location.along+normal.x*location.side,y:origin.y+forward.y*location.along+normal.y*location.side,hp:100,invul:0});
      const hazard={...warning,phase:'active',time:warning.activeDuration,duration:warning.activeDuration,tickClock:0};game.bossHazards=[hazard];
      const visible=discTouchesPolygon(game.player,game.player.r,trace.worldBoundary);
      updateBossHazards(game,.01);
      assert.equal(game.player.hp<100,location.hit,`actual damage ${direction}: ${JSON.stringify(location)}`);
      assert.equal(visible,location.hit,`rendered capsule ${direction}: ${JSON.stringify(location)}`);
    }
  }
});

test('wall and map-edge clipping keep the same collision endpoint and round cap extent',()=>{
  for(const wall of [true,false]){
    const f=setupBeam(),{game,enemy,boss}=f;
    Object.assign(enemy,{x:wall?1200:2220,y:900});Object.assign(game.player,{x:wall?1800:2300,y:900});
    if(wall)game.world.obstacles=[{id:999,kind:'building',x:1350,y:800,w:60,h:200,hp:Infinity,maxHp:Infinity,destroyed:false}];
    game.navigation=new Navigation(game.world);warnAdditionalBoss(game,enemy,boss);
    const hazard=game.bossHazards.find(item=>item.kind==='beam'),geometry=JSON.stringify(hazard),trace=render(hazard,game.world),extent=Math.max(...trace.worldBoundary.map(point=>point.x));
    close(extent,hazard.targetX+hazard.width/2);assert.equal(JSON.stringify(hazard),geometry);
    if(wall){assert.ok(extent<=1350);assert.ok(extent>1349.99);}else close(extent,game.world.width-35);
  }
});

test('camera/zoom/DPR/shake preserve the capsule projection and caller Canvas state, with one fill and no doubled seam',()=>{
  const {game,warning}=setupBeam(Math.PI/4);
  for(const [width,height,dpr,zoom,shake]of [[390,844,1,.88,0],[390,844,2,.88,4],[1280,720,2,1.26,-3]])for(const phase of ['warning','active']){
    const matrix=[dpr*zoom,0,0,dpr*zoom,width/2+shake,height/2-shake],trace=render({...warning,phase},game.world,matrix);
    assert.equal(trace.fills.length,1);assert.equal(trace.strokes.length,2,'one capsule outline plus existing centre line');assert.equal(trace.clips.length,1);
    trace.fill.local.forEach((point,index)=>{close(trace.fill.points[index].x,matrix[0]*point.x+matrix[4]);close(trace.fill.points[index].y,matrix[3]*point.y+matrix[5]);});
    const round=trace.fill.arcs[0];close(round.rx/round.ry,Math.sqrt(3));
  }
});

test('a zero-length line is the same finite world disc as its physical capsule and expired or invalid hazards paint nothing',()=>{
  const f=setupBeam(),{game,warning}=f,hazard={...warning,targetX:warning.x,targetY:warning.y};
  const trace=render(hazard,game.world);assert.equal(trace.fill.arcs.length,1);assert.equal(trace.strokes.length,1);
  for(const point of trace.worldBoundary)close(Math.hypot(point.x-hazard.x,point.y-hazard.y),hazard.width/2);
  Object.assign(game.player,{x:hazard.x+25,y:hazard.y,hp:100,invul:0});resolveAdditionalBoss(game,f.enemy,f.boss);
  game.bossHazards=[{...hazard,phase:'active',time:.3,duration:.3,tickClock:0}];updateBossHazards(game,.01);
  assert.equal(game.player.hp,67);assert.equal(discTouchesPolygon(game.player,game.player.r,trace.worldBoundary),true);
  for(const bad of [{...hazard,time:0},{...hazard,targetX:NaN},{...hazard,phase:'invalid'}]){
    const empty=context(),before=empty.state();Object.create(Renderer.prototype).drawBossHazard(empty.c,bad,game.world);
    assert.equal(empty.fills.length,0);assert.deepEqual(empty.state(),before);
  }
});

test('repeated warning/active drawing never changes actual Game checkpoints, RNG streams, timers, skill damage or effect queues',()=>{
  const {game,warning}=setupBeam(Math.PI/4);game.pause();const before=fingerprint(game),random=Math.random,now=Date.now;
  assert.ok(game.snapshot(),'the source fixture retains a valid real campaign checkpoint');
  try{Math.random=()=>{throw Error('telegraphs cannot use random');};Date.now=()=>{throw Error('telegraphs cannot use wall time');};
    for(let i=0;i<12;i++)for(const phase of ['warning','active'])render(Object.freeze({...warning,phase}),game.world);
  }finally{Math.random=random;Date.now=now;}
  assert.equal(fingerprint(game),before);
});
