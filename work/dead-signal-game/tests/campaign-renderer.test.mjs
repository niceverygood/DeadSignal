import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS_CATALOG,getBoss} from '../dist/campaign.js';
import {drawBossBody,bossBodyBounds} from '../dist/boss-art.js';
import {Renderer,renderBossPortrait} from '../dist/renderer.js';
import {project} from '../dist/projection.js';
import {Game} from '../dist/engine.js';

function fixture(width=180,height=190,dpr=1){
  const rect={width,height},draws=[],texts=[],clears=[],fillRules=[],ellipses=[],stack=[];let matrix=[1,0,0,1,0,0],points=[];
  const c={globalAlpha:1,lineWidth:1,fillStyle:'',strokeStyle:'',textAlign:'left',font:'',lineCap:'butt',lineJoin:'miter'};
  const point=(x,y)=>({x:matrix[0]*x+matrix[2]*y+matrix[4],y:matrix[1]*x+matrix[3]*y+matrix[5]});
  const record=(kind,values)=>draws.push({kind,values,color:kind==='stroke'?c.strokeStyle:c.fillStyle,alpha:c.globalAlpha});
  c.save=()=>stack.push({matrix:[...matrix],globalAlpha:c.globalAlpha,lineWidth:c.lineWidth,fillStyle:c.fillStyle,strokeStyle:c.strokeStyle,textAlign:c.textAlign,font:c.font,lineCap:c.lineCap,lineJoin:c.lineJoin});
  c.restore=()=>{const state=stack.pop();if(state){matrix=state.matrix;for(const key of Object.keys(state))if(key!=='matrix')c[key]=state[key];}};
  c.setTransform=(...value)=>{matrix=value;};
  c.transform=(a,b,d,e,x,y)=>{const m=[...matrix];matrix=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*d+m[2]*e,m[1]*d+m[3]*e,m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];};
  c.translate=(x,y)=>{matrix[4]+=matrix[0]*x+matrix[2]*y;matrix[5]+=matrix[1]*x+matrix[3]*y;};
  c.scale=(x,y)=>{matrix[0]*=x;matrix[1]*=x;matrix[2]*=y;matrix[3]*=y;};
  c.rotate=angle=>{const a=[...matrix],co=Math.cos(angle),si=Math.sin(angle);matrix[0]=a[0]*co+a[2]*si;matrix[1]=a[1]*co+a[3]*si;matrix[2]=a[2]*co-a[0]*si;matrix[3]=a[3]*co-a[1]*si;};
  c.beginPath=()=>{points=[];};c.moveTo=(x,y)=>points.push(point(x,y));c.lineTo=(x,y)=>points.push(point(x,y));c.closePath=()=>{};
  c.fill=rule=>{fillRules.push(rule);record('fill',points.map(p=>({...p})));};c.stroke=()=>record('stroke',points.map(p=>({...p})));
  c.ellipse=(x,y,rx,ry)=>{ellipses.push({x,y,rx,ry});const p=point(x,y),sx=Math.hypot(matrix[0],matrix[1]),sy=Math.hypot(matrix[2],matrix[3]);points=[{x:p.x-rx*sx,y:p.y-ry*sy},{x:p.x+rx*sx,y:p.y+ry*sy}];};
  const rectangle=(x,y,w,h)=>[point(x,y),point(x+w,y),point(x+w,y+h),point(x,y+h)];
  c.fillRect=(...args)=>record('rect',rectangle(...args));c.strokeRect=(...args)=>record('stroke',rectangle(...args));
  c.clearRect=(...args)=>clears.push(args);c.clip=()=>{};c.setLineDash=()=>{};c.drawImage=()=>{};c.arc=()=>{};
  c.measureText=value=>({width:String(value).length*10});
  c.fillText=(value,x,y,maxWidth)=>texts.push({text:String(value),point:point(x,y),maxWidth});c.strokeText=()=>{};
  c.createRadialGradient=c.createLinearGradient=()=>({addColorStop(){}});
  const canvas={width,height,style:{},clientWidth:width,clientHeight:height,getBoundingClientRect:()=>rect,parentElement:{getBoundingClientRect:()=>rect},getContext:()=>c};
  globalThis.window={devicePixelRatio:dpr};globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>c})};
  return{c,canvas,rect,draws,texts,clears,fillRules,ellipses,reset(){draws.length=0;texts.length=0;clears.length=0;fillRules.length=0;ellipses.length=0;matrix=[1,0,0,1,0,0];stack.length=0;}};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} should equal ${b}`);
const fingerprint=draws=>JSON.stringify(draws.map(({kind,values})=>({kind,values})));

test('all 24 catalog bosses have distinct geometry even with palette and size differences removed',()=>{
  const f=fixture(),shapes=new Set(),catalogBefore=JSON.stringify(BOSS_CATALOG);
  for(const boss of BOSS_CATALOG){
    f.reset();const actor=Object.freeze({r:boss.stats.r,angle:.35,walkPhase:0,attackState:'walk',hp:boss.stats.hp});
    assert.equal(drawBossBody(f.c,boss,actor,0,{shadow:false,effects:false,scale:1}),true);
    assert.ok(f.draws.filter(draw=>draw.kind==='fill'||draw.kind==='rect').length>=12,`${boss.id} must have a detailed figure and occupation equipment`);
    const key=fingerprint(f.draws);assert.ok(!shapes.has(key),`${boss.id} repeats another silhouette`);shapes.add(key);
  }
  assert.equal(shapes.size,24);assert.equal(JSON.stringify(BOSS_CATALOG),catalogBefore);
});

test('catalog head equipment and mechanical limb counts affect the figure beyond its colors',()=>{
  const f=fixture(),base=getBoss('boss-12-final'),actor={r:base.stats.r,angle:.35,walkPhase:0};
  drawBossBody(f.c,base,actor,0,{shadow:false,effects:false,scale:1});const original=fingerprint(f.draws);
  for(const appearance of [{...base.appearance,head:'pressure-helmet'},{...base.appearance,arms:2,legs:2}]){
    f.reset();drawBossBody(f.c,{...base,appearance},actor,0,{shadow:false,effects:false,scale:1});assert.notEqual(fingerprint(f.draws),original);
  }
});

test('every portrait fits its canvas at both pixel ratios and invalid keys clear without changing layout',()=>{
  for(const dpr of [1,2])for(const [width,height]of [[180,190],[128,136]])for(const boss of BOSS_CATALOG){
    const f=fixture(width,height,dpr),before=JSON.stringify(boss);
    assert.equal(renderBossPortrait(f.canvas,boss.id),true);assert.equal(f.canvas.width,width*dpr);assert.equal(f.canvas.height,height*dpr);
    for(const draw of f.draws)for(const p of draw.values){
      assert.ok(p.x>=-1&&p.x<=width*dpr+1,`${boss.id} spills horizontally at ${width}×${height}`);
      assert.ok(p.y>=-1&&p.y<=height*dpr+1,`${boss.id} spills vertically at ${width}×${height}`);
    }
    assert.equal(f.texts.length,0,'Portraits do not duplicate the encyclopedia name, health or skill UI');
    assert.equal(JSON.stringify(boss),before);
    const backing=[f.canvas.width,f.canvas.height],style={...f.canvas.style};f.reset();
    assert.equal(renderBossPortrait(f.canvas,'missing-boss'),false);assert.equal(f.draws.length,0);assert.equal(f.clears.length,1);
    assert.deepEqual([f.canvas.width,f.canvas.height],backing);assert.deepEqual(f.canvas.style,style);
  }
  assert.equal(renderBossPortrait(null,'boss-01-mid'),false);
});

test('live rendering uses canonical characters and names while missing boss keys retain legacy sprites',()=>{
  const f=fixture(1280,720),renderer=new Renderer(f.canvas),game={alarm:{eliteId:null},player:{x:1200,y:930}};
  for(const boss of BOSS_CATALOG){
    f.reset();const e=Object.freeze({id:5,x:1300,y:930,r:boss.stats.r,type:boss.role==='final'?'collector':'elite',bossKey:boss.id,bossRole:boss.role,hp:boss.stats.hp,maxHp:boss.stats.hp,angle:.35,walkPhase:0});
    renderer.drawEnemy(f.c,e,0,game);assert.ok(f.texts.some(text=>text.text===boss.name),boss.id);
  }
  let legacy=0;renderer.drawCollector=()=>legacy++;
  renderer.drawEnemy(f.c,{x:1300,y:930,type:'collector',bossKey:'missing'},0,game);assert.equal(legacy,1);
});

test('a tall campaign silhouette can hide the player where a legacy collector could not',()=>{
  const f=fixture(390,844),renderer=new Renderer(f.canvas),p={x:1200,y:930,hp:100},boss=getBoss('boss-07-final');
  renderer.cameraProjection=project(p.x,p.y);
  const e={x:1300,y:1030,r:boss.stats.r,hp:100,type:'collector',bossKey:boss.id};
  const player={kind:'player',p,depth:project(p.x,p.y).y},enemy={kind:'enemy',e,depth:project(e.x,e.y).y},game={state:'playing',player:p};
  assert.equal(renderer.playerIdentificationNeeded(game,[player,enemy]),true);
  delete e.bossKey;assert.equal(renderer.playerIdentificationNeeded(game,[player,enemy]),false);
  e.bossKey=boss.id;assert.equal(renderer.playerIdentificationNeeded(game,[enemy,player]),false);
  const bounds=bossBodyBounds(boss,e);assert.ok(bounds.coreTop<-100);
});

test('warning geometry uses total line width and a summon boundary remains unfilled',()=>{
  const f=fixture(),renderer=new Renderer(f.canvas),world={width:2400,height:1800};
  const h=Object.freeze({kind:'charge',shape:'line',phase:'warning',x:900,y:900,targetX:1100,targetY:900,r:27,width:54,color:'#e6865d'});
  renderer.drawBossHazard(f.c,h,world);const warning=f.draws.find(draw=>draw.kind==='fill');
  assert.ok(warning);assert.equal(f.ellipses.length,2);
  for(const [cap,centre]of f.ellipses.map((cap,index)=>[cap,project(index?900:1100,900,1)])){
    close(cap.x,centre.x);close(cap.y,centre.y);close(cap.rx,27*Math.sqrt(1.5));close(cap.ry,27/Math.sqrt(2));
  }
  f.reset();renderer.drawBossHazard(f.c,{...h,kind:'summon',shape:'circle',r:165},world);
  assert.equal(f.draws.filter(draw=>draw.kind==='fill'||draw.kind==='rect').length,0,'Summon placement is not painted like damaging ground');
  assert.ok(f.draws.some(draw=>draw.kind==='stroke'));
  f.reset();renderer.drawBossHazard(f.c,{...h,phase:'invalid'},world);assert.equal(f.draws.length,0);
});

test('hostile trails project actual previous positions and long objective names fit inside their plaque',()=>{
  const f=fixture(1280,720),renderer=new Renderer(f.canvas);renderer.cameraProjection=project(1200,930);
  const shot=Object.freeze({x:1220,y:940,px:1200,py:930,r:6,color:'#94b86e'});
  renderer.drawHostileProjectile(f.c,shot);const trail=f.draws.find(draw=>draw.kind==='stroke'),a=project(1200,930,18),b=project(1220,940,18);
  close(trail.values[0].x,a.x);close(trail.values[0].y,a.y);close(trail.values[1].x,b.x);close(trail.values[1].y,b.y);
  const label='택배 집하장장',marker={kind:'collector',label,x:60,y:330,angle:0};marker.plaque=renderer.objectivePlaque(marker,{x:45,y:250,width:990,height:306});
  renderer.objectiveDirectionMarkers=()=>[marker];f.reset();renderer.drawObjectiveDirections(f.c,{});
  const text=f.texts.find(text=>text.text===label);assert.ok(text);assert.equal(text.maxWidth,marker.plaque.width-12);assert.ok(marker.plaque.width>=label.length*10+12);
});

test('annular warnings and active slams preserve the empty centre while fire and contamination become active fields',()=>{
  const f=fixture(),renderer=new Renderer(f.canvas),world={width:2400,height:1800};
  for(const phase of ['warning','active']){
    f.reset();const ring=Object.freeze({kind:'slam',shape:'circle',phase,x:1200,y:930,r:285,innerR:205,time:.5,duration:1,color:'#d89c68'});
    renderer.drawBossHazard(f.c,ring,world);assert.ok(f.fillRules.includes('evenodd'),'The fill rule must cut the safe hole rather than cover it');
    assert.ok(f.ellipses.some(p=>Math.abs(p.rx-285*Math.sqrt(1.5))<1e-7));assert.ok(f.ellipses.some(p=>Math.abs(p.rx-205*Math.sqrt(1.5))<1e-7));
  }
  const pool={kind:'spit',shape:'circle',x:1200,y:930,r:75,time:1,duration:3.5,color:'#94b86e'};
  f.reset();renderer.drawBossHazard(f.c,{...pool,phase:'warning'},world);const warningAlpha=f.draws.find(draw=>draw.kind==='fill'&&draw.color===pool.color).alpha;
  for(const kind of ['spit','fire','mine','storm','leap','pull']){
    f.reset();const active=Object.freeze({...pool,kind,phase:'active'});renderer.drawBossHazard(f.c,active,world);
    assert.ok(f.draws.some(draw=>draw.kind==='fill'&&draw.color===pool.color&&draw.alpha>warningAlpha),`${kind} active field must be distinct from its warning`);
  }
  for(const kind of ['summon','shield'])for(const phase of ['warning','active']){
    f.reset();renderer.drawBossHazard(f.c,{...pool,kind,phase},world);assert.equal(f.draws.filter(draw=>draw.kind==='fill'||draw.kind==='rect').length,0,`${kind} has no damaging fill`);
  }
});

test('repeated campaign rendering never changes checkpoints, combat RNG or active warnings',()=>{
  const f=fixture(390,844),renderer=new Renderer(f.canvas),game=new Game({seed:1742,missionId:'mission-01'});
  const boss=game.spawnMissionBoss('mid');assert.ok(boss);game.player.x=1200;game.player.y=930;boss.x=1250;boss.y=980;
  game.bossHazards.push({id:999,ownerId:boss.id,kind:'charge',shape:'line',x:boss.x,y:boss.y,targetX:1350,targetY:1080,r:27,width:54,time:.8,duration:.9,phase:'warning',damage:0,color:'#e6865d'});
  const before=JSON.stringify({snapshot:game.snapshot(),rng:game.random.getState(),visual:game.visualRandom.getState(),events:game.events,effects:game.particles,hazards:game.bossHazards});
  renderer.makeFloor=()=>{renderer.floor={};};renderer.drawBuildingShadow=renderer.drawObstacle=renderer.drawDecor=()=>{};
  for(let i=0;i<5;i++){f.reset();renderer.render(game,{fireMode:'auto',targetId:null},i*.02);}
  assert.equal(JSON.stringify({snapshot:game.snapshot(),rng:game.random.getState(),visual:game.visualRandom.getState(),events:game.events,effects:game.particles,hazards:game.bossHazards}),before);
});
