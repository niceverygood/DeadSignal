import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {objectiveTargets,edgePosition} from '../dist/directions.js';

const enemy=(id,extra={})=>({id,type:'elite',hp:100,x:500,y:500,dead:false,...extra});
const live=(enemies,extra={})=>({state:'playing',stage:0,enemies,alarm:{active:false,eliteId:null},...extra});
const near=(actual,expected)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-8,`${actual} should match ${expected}`);
const rect={x:20,y:30,width:360,height:240};
function onEdge(point,safe=rect){
  assert.ok(point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.angle));
  assert.ok(point.x>=safe.x-1e-8&&point.x<=safe.x+safe.width+1e-8&&point.y>=safe.y-1e-8&&point.y<=safe.y+safe.height+1e-8);
  assert.ok(Math.abs(point.x-safe.x)<1e-8||Math.abs(point.x-safe.x-safe.width)<1e-8||Math.abs(point.y-safe.y)<1e-8||Math.abs(point.y-safe.y-safe.height)<1e-8,'The marker must land on a safe edge');
}

test('mandatory objectives lead one alarm target regardless of enemy array order',()=>{
  for(const stage of [0,1]){
    const alarm=enemy(1),ordinary=enemy(2),gate=enemy(3,{gatekeeper:true}),extraGate=enemy(4,{gatekeeper:true});
    const game=live([alarm,ordinary,gate,extraGate],{stage,alarm:{active:true,eliteId:alarm.id}});
    assert.deepEqual(objectiveTargets(game),[{enemy:gate,kind:'gatekeeper',label:'봉쇄 정예'},{enemy:alarm,kind:'alarm',label:'경보 정예'}]);
  }
  const gate=enemy(1,{gatekeeper:true}),alarm=enemy(2),collector=enemy(3,{type:'collector'});
  assert.deepEqual(objectiveTargets(live([gate,alarm,collector],{stage:2,alarm:{active:true,eliteId:alarm.id}})),[{enemy:collector,kind:'collector',label:'수집가'},{enemy:alarm,kind:'alarm',label:'경보 정예'}]);
  assert.deepEqual(objectiveTargets(live([collector])),[],'The final collector is a mandatory objective only in the final district');
});

test('a mandatory role wins over a same-ID optional alarm and duplicate target copies',()=>{
  const gate=enemy(7,{gatekeeper:true}),copy=enemy(7);
  const targets=objectiveTargets(live([copy,gate],{alarm:{active:true,eliteId:7}}));
  assert.deepEqual(targets,[{enemy:gate,kind:'gatekeeper',label:'봉쇄 정예'}]);
  const collector=enemy(8,{type:'collector',gatekeeper:true});
  assert.deepEqual(objectiveTargets(live([collector],{stage:2,alarm:{active:true,eliteId:8}})),[{enemy:collector,kind:'collector',label:'수집가'}]);
});

test('dead, zero-health, invalid-position and wrong-role enemies cannot become objectives',()=>{
  for(const extra of [{dead:true},{hp:0},{hp:-1},{hp:NaN},{x:NaN},{y:Infinity},{id:0},{type:'walker'}]){
    const target=enemy(5,{gatekeeper:true,...extra});
    assert.deepEqual(objectiveTargets(live([target])),[]);
    assert.deepEqual(objectiveTargets(live([target],{alarm:{active:true,eliteId:target.id}})),[]);
  }
});

test('inactive, missing or dead alarm references are omitted without hiding the mandatory target',()=>{
  const gate=enemy(1,{gatekeeper:true}),alarm=enemy(2);
  for(const data of [{active:false,eliteId:2},{active:true,eliteId:999},{active:true,eliteId:null}]){
    assert.deepEqual(objectiveTargets(live([gate,alarm],{alarm:data})).map(target=>target.kind),['gatekeeper']);
  }
  alarm.dead=true;assert.deepEqual(objectiveTargets(live([gate,alarm],{alarm:{active:true,eliteId:2}})).map(target=>target.kind),['gatekeeper']);
  alarm.dead=false;assert.deepEqual(objectiveTargets(live([alarm],{alarm:{active:true,eliteId:2}})),[{enemy:alarm,kind:'alarm',label:'경보 정예'}]);
});

test('pause, choices and terminal states provide no directional objectives',()=>{
  const gate=enemy(1,{gatekeeper:true}),alarm=enemy(2);
  for(const state of ['paused','upgrade','supply','route','event','menu','dead','victory',undefined]){
    assert.deepEqual(objectiveTargets(live([gate,alarm],{state,alarm:{active:true,eliteId:2}})),[]);
  }
  assert.deepEqual(objectiveTargets(),[]);assert.deepEqual(objectiveTargets(null),[]);
});

test('targets inside the actual viewport including its boundary do not get an edge marker',()=>{
  for(const target of [{x:0,y:0},{x:400,y:0},{x:400,y:300},{x:0,y:300},{x:10,y:150},{x:200,y:150}]){
    assert.equal(edgePosition({x:200,y:150},target,400,300,rect),null);
  }
  const target={x:450,y:150};assert.ok(edgePosition({x:200,y:150},target,400,300,rect));
  assert.equal(edgePosition({x:200,y:150},target,600,300,{x:20,y:30,width:560,height:240}),null,'A resized viewport can reveal the target');
});

test('all eight screen directions retain their angle and hit the correct safe edge',()=>{
  const player={x:200,y:150};
  for(const [x,y,edgeX,edgeY] of [[0,-1,200,30],[1,0,380,150],[0,1,200,270],[-1,0,20,150],[1,-1,320,30],[1,1,320,270],[-1,1,80,270],[-1,-1,80,30]]){
    const marker=edgePosition(player,{x:player.x+x*1000,y:player.y+y*1000},400,300,rect);onEdge(marker);
    near(marker.x,edgeX);near(marker.y,edgeY);near(Math.cos(marker.angle),x/Math.hypot(x,y));near(Math.sin(marker.angle),y/Math.hypot(x,y));
    near((marker.x-player.x)*y-(marker.y-player.y)*x,0);
  }
});

test('diagonal rays land exactly on a safe corner without division artifacts',()=>{
  const square={x:20,y:20,width:360,height:360},player={x:200,y:200};
  for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
    const marker=edgePosition(player,{x:200+x*1000,y:200+y*1000},400,400,square);onEdge(marker,square);
    near(marker.x,x<0?20:380);near(marker.y,y<0?20:380);
  }
});

test('an external player keeps its original ray when it crosses the safe box and has a bounded fallback when it misses',()=>{
  const crossing=edgePosition({x:0,y:150},{x:1000,y:450},400,300,rect);onEdge(crossing);near(crossing.x,380);near(crossing.y,264);
  const through=edgePosition({x:-100,y:150},{x:500,y:150},400,300,rect);near(through.x,380);near(through.y,150);
  for(const [player,target] of [[{x:10,y:10},{x:-100,y:-100}],[{x:500,y:350},{x:700,y:500}],[{x:500,y:150},{x:1000,y:-100}]]){
    const marker=edgePosition(player,target,400,300,rect);onEdge(marker);near(marker.angle,Math.atan2(target.y-player.y,target.x-player.x));
  }
});

test('small or clipped safe rectangles stay finite while NaN, zero rays and invalid viewports are rejected',()=>{
  const player={x:40,y:30},target={x:1000,y:-1000};
  for(const safe of [{x:10,y:10,width:60,height:40},{x:-50,y:-50,width:180,height:150},{x:100,y:100,width:10,height:10},{x:70,y:50,width:-60,height:-40},{x:NaN,y:Infinity,width:NaN,height:NaN},undefined]){
    const marker=edgePosition(player,target,80,60,safe);assert.ok(marker);
    assert.ok(Number.isFinite(marker.x)&&Number.isFinite(marker.y)&&Number.isFinite(marker.angle));
    assert.ok(marker.x>=0&&marker.x<=80&&marker.y>=0&&marker.y<=60);
  }
  for(const invalid of [undefined,null,{x:NaN,y:0},{x:0,y:Infinity}]){
    assert.equal(edgePosition(invalid,target,80,60,rect),null);assert.equal(edgePosition(player,invalid,80,60,rect),null);
  }
  for(const [width,height] of [[0,60],[80,0],[-1,60],[NaN,60],[80,Infinity]])assert.equal(edgePosition(player,target,width,height,rect),null);
  assert.equal(edgePosition({x:1000,y:1000},{x:1000,y:1000},80,60,rect),null);
});

test('objective selection and edge math preserve game snapshots, RNG and caller objects',()=>{
  const game=new Game({seed:3761});game.enemies=[];
  const gate=game.spawnEnemy('elite',0,{x:1430,y:930}),alarm=game.spawnEnemy('elite',0,{x:1400,y:930});assert.ok(gate&&alarm);
  gate.gatekeeper=true;game.stageBossSpawned=true;game.alarm={active:true,time:30,cooldown:0,count:1,eliteId:alarm.id};
  const before=JSON.stringify(game.snapshot());assert.notEqual(before,'null');
  Object.freeze(game.player);for(const target of game.enemies)Object.freeze(target);Object.freeze(game.enemies);
  const player=Object.freeze({x:200,y:150}),target=Object.freeze({x:900,y:-200}),safe=Object.freeze({...rect});
  for(let i=0;i<100;i++){
    const targets=objectiveTargets(game);assert.equal(targets[0].enemy,gate);assert.equal(targets[1].enemy,alarm);
    onEdge(edgePosition(player,target,400,300,safe));
  }
  assert.equal(JSON.stringify(game.snapshot()),before);
  assert.deepEqual(player,{x:200,y:150});assert.deepEqual(target,{x:900,y:-200});assert.deepEqual(safe,rect);
});
