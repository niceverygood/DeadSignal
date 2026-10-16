import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {project} from '../dist/projection.js';
import {Renderer} from '../dist/renderer.js';
import {edgePosition} from '../dist/directions.js';
import directionLayouts from './fixtures/directions-hud.json' with {type:'json'};

function canvasFixture(width=1280,height=720){
  const rect={width,height};const gradient={addColorStop(){}};
  const imageDraws=[],createdCanvases=[];
  const ctx=new Proxy({globalAlpha:1,createRadialGradient:()=>gradient,createLinearGradient:()=>gradient,measureText:s=>({width:String(s).length*7}),drawImage:(...args)=>imageDraws.push(args)},{get:(o,k)=>k in o?o[k]:(()=>{})});
  const canvas={style:{},parentElement:{getBoundingClientRect:()=>rect},getContext:()=>ctx,width:0,height:0};
  globalThis.window={devicePixelRatio:3};globalThis.document={createElement:()=>{const made={width:0,height:0,getContext:()=>ctx};createdCanvases.push(made);return made;}};
  return{canvas,rect,ctx,imageDraws,createdCanvases};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} must match ${b}`);

function minimapTrace(ctx){
  const trace={translations:[],rotations:[],ellipses:[],rects:[],polygons:[]};let points=[];
  ctx.translate=(x,y)=>trace.translations.push({x,y});ctx.rotate=angle=>trace.rotations.push(angle);
  ctx.beginPath=()=>{points=[];};ctx.moveTo=(x,y)=>points.push({x,y});ctx.lineTo=(x,y)=>points.push({x,y});
  ctx.fill=()=>trace.polygons.push({points:points.map(p=>({...p})),color:ctx.fillStyle});
  ctx.ellipse=(x,y,rx,ry)=>trace.ellipses.push({x,y,rx,ry});
  ctx.strokeRect=(x,y,width,height)=>trace.rects.push({x,y,width,height,color:ctx.strokeStyle});
  trace.reset=()=>{for(const value of Object.values(trace))if(Array.isArray(value))value.length=0;};
  return trace;
}

function directionTrace(ctx){
  let matrix=[1,0,0,1,0,0],pathPoints=[];const stack=[],draws=[];
  const point=(x,y)=>({x:matrix[0]*x+matrix[2]*y+matrix[4],y:matrix[1]*x+matrix[3]*y+matrix[5]});
  const record=(points,pad=0)=>{if(points.length)draws.push({left:Math.min(...points.map(p=>p.x))-pad,top:Math.min(...points.map(p=>p.y))-pad,right:Math.max(...points.map(p=>p.x))+pad,bottom:Math.max(...points.map(p=>p.y))+pad});};
  const rectangle=(x,y,w,h,pad=0)=>record([point(x,y),point(x+w,y),point(x+w,y+h),point(x,y+h)],pad);
  ctx.save=()=>stack.push([...matrix]);ctx.restore=()=>{matrix=stack.pop()||[1,0,0,1,0,0];};
  ctx.translate=(x,y)=>{matrix[4]+=matrix[0]*x+matrix[2]*y;matrix[5]+=matrix[1]*x+matrix[3]*y;};
  ctx.rotate=angle=>{const c=Math.cos(angle),s=Math.sin(angle),[a,b,d,e]=matrix;matrix[0]=a*c+d*s;matrix[1]=b*c+e*s;matrix[2]=d*c-a*s;matrix[3]=e*c-b*s;};
  ctx.beginPath=()=>{pathPoints=[];};ctx.moveTo=(x,y)=>pathPoints.push(point(x,y));ctx.lineTo=(x,y)=>pathPoints.push(point(x,y));
  ctx.fill=()=>record(pathPoints);ctx.stroke=()=>record(pathPoints,(ctx.lineWidth||1)/2);
  ctx.fillRect=(x,y,w,h)=>rectangle(x,y,w,h);ctx.strokeRect=(x,y,w,h)=>rectangle(x,y,w,h,(ctx.lineWidth||1)/2);
  ctx.fillText=(text,x,y)=>{const width=ctx.measureText(text).width,left=ctx.textAlign==='left'?x:ctx.textAlign==='right'?x-width:x-width/2;rectangle(left,y-5,width,10);};
  return{draws,reset(){draws.length=0;matrix=[1,0,0,1,0,0];stack.length=0;}};
}
const overlaps=(a,b)=>a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom;
function directionScene(renderer,{stage=0,mandatory={x:renderer.width+500,y:renderer.height/2},alarm=null}={}){
  const player={x:1200,y:930,angle:0};renderer.cameraProjection=project(player.x,player.y);
  const make=(id,screen,role)=>({...renderer.screenToWorld(screen.x,screen.y,22),id,type:role==='collector'?'collector':'elite',hp:330,dead:false,gatekeeper:role==='gatekeeper'});
  const enemies=[];if(alarm)enemies.push(make(2,alarm,'alarm'));if(mandatory)enemies.push(make(1,mandatory,stage===2?'collector':'gatekeeper'));
  return{state:'playing',stage,player,enemies,alarm:{active:!!alarm,eliteId:alarm?2:null}};
}

function identificationFixture(width=1280,height=720,dpr=2){
  const fixture=canvasFixture(width,height);window.devicePixelRatio=dpr;
  // Cached floor painting has its own context, as it does in the browser.
  document.createElement=()=>{const gradient={addColorStop(){}};
    const context=new Proxy({globalAlpha:1,createRadialGradient:()=>gradient,createLinearGradient:()=>gradient,measureText:text=>({width:String(text).length*7})},{get:(o,k)=>k in o?o[k]:(()=>{})});
    return{width:0,height:0,getContext:()=>context};
  };
  const renderer=new Renderer(fixture.canvas);renderer.atmosphereEnabled=false;renderer.minimapEnabled=false;
  return{...fixture,renderer};
}
function identificationTrace(ctx,dpr){
  let matrix=[1,0,0,1,0,0],phase=null,points=[],ellipse=null;const stack=[],fills=[],strokes=[];
  ctx.globalAlpha=1;ctx.lineWidth=1;ctx.strokeStyle='#000';ctx.fillStyle='#000';
  const point=(x,y)=>({x:matrix[0]*x+matrix[2]*y+matrix[4],y:matrix[1]*x+matrix[3]*y+matrix[5]});
  const multiply=(a,b,c,d,e,f)=>{const m=matrix;matrix=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];};
  ctx.setTransform=(...values)=>{matrix=[...values];};ctx.transform=multiply;ctx.translate=(x,y)=>multiply(1,0,0,1,x,y);ctx.scale=(x,y)=>multiply(x,0,0,y,0,0);
  ctx.rotate=angle=>multiply(Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),0,0);
  ctx.save=()=>stack.push({matrix:[...matrix],alpha:ctx.globalAlpha,width:ctx.lineWidth,stroke:ctx.strokeStyle,fill:ctx.fillStyle});
  ctx.restore=()=>{const state=stack.pop();if(!state)return;matrix=state.matrix;ctx.globalAlpha=state.alpha;ctx.lineWidth=state.width;ctx.strokeStyle=state.stroke;ctx.fillStyle=state.fill;};
  ctx.beginPath=()=>{points=[];ellipse=null;};ctx.moveTo=(x,y)=>points.push(point(x,y));ctx.lineTo=(x,y)=>points.push(point(x,y));
  ctx.ellipse=(x,y,rx,ry,rotation=0)=>{ellipse={center:point(x,y)};
    for(let i=0;i<32;i++){const angle=i*Math.PI/16,dx=Math.cos(angle)*rx,dy=Math.sin(angle)*ry;points.push(point(x+dx*Math.cos(rotation)-dy*Math.sin(rotation),y+dx*Math.sin(rotation)+dy*Math.cos(rotation)));}
  };
  const record=()=>({phase,points:points.map(p=>({x:p.x/dpr,y:p.y/dpr})),ellipse:ellipse?{center:{x:ellipse.center.x/dpr,y:ellipse.center.y/dpr}}:null,alpha:ctx.globalAlpha,color:ctx.strokeStyle,cssWidth:ctx.lineWidth*Math.hypot(matrix[0],matrix[1])/dpr});
  ctx.fill=()=>{if(phase)fills.push(record());};ctx.stroke=()=>{if(phase)strokes.push(record());};
  return{fills,strokes,start(next){phase=next;},stop(){phase=null;},reset(){fills.length=0;strokes.length=0;}};
}
function identificationGame(type='walker',dx=10,dy=10){
  const game=new Game({seed:3951});game.enemies=[];game.world.obstacles=[];game.world.decor=[];game.spawnClock=1e9;game.player.invul=0;
  const enemy=game.spawnEnemy(type,0,{x:1430,y:930});assert.ok(enemy);game.move(enemy,game.player.x+dx-enemy.x,game.player.y+dy-enemy.y);enemy.speed=0;
  return{game,enemy};
}
function trackIdentification(renderer,trace){
  const order=[],player=renderer.drawPlayer.bind(renderer),enemy=renderer.drawEnemy.bind(renderer),particle=renderer.drawParticle.bind(renderer),outline=renderer.drawPlayerIdentification.bind(renderer),text=renderer.drawText.bind(renderer),cursor=renderer.drawCursor.bind(renderer);
  renderer.drawPlayer=(...args)=>{order.push('player');trace?.start('player');player(...args);trace?.stop();};
  renderer.drawEnemy=(...args)=>{order.push('enemy');enemy(...args);};renderer.drawParticle=(...args)=>{order.push('particle');particle(...args);};
  renderer.drawPlayerIdentification=(...args)=>{order.push('outline');trace?.start('outline');outline(...args);trace?.stop();};
  renderer.drawText=(...args)=>{order.push('text');text(...args);};renderer.drawCursor=(...args)=>{order.push('cursor');cursor(...args);};
  return order;
}

function healthWarningTrace(ctx,getDpr){
  let matrix=[1,0,0,1,0,0];const stack=[],gradients=[],fills=[];
  const multiply=(a,b,c,d,e,f)=>{const m=matrix;matrix=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];};
  const point=(x,y)=>({x:(matrix[0]*x+matrix[2]*y+matrix[4])/getDpr(),y:(matrix[1]*x+matrix[3]*y+matrix[5])/getDpr()});
  ctx.globalAlpha=1;ctx.fillStyle='#000';
  ctx.setTransform=(...values)=>{matrix=[...values];};ctx.transform=multiply;ctx.translate=(x,y)=>multiply(1,0,0,1,x,y);ctx.scale=(x,y)=>multiply(x,0,0,y,0,0);
  ctx.rotate=angle=>multiply(Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),0,0);
  ctx.save=()=>stack.push({matrix:[...matrix],alpha:ctx.globalAlpha,fill:ctx.fillStyle});
  ctx.restore=()=>{const state=stack.pop();if(state){matrix=state.matrix;ctx.globalAlpha=state.alpha;ctx.fillStyle=state.fill;}};
  ctx.createRadialGradient=(...args)=>{const gradient={args,matrix:[...matrix],stops:[],addColorStop(offset,color){this.stops.push({offset,color});}};gradients.push(gradient);return gradient;};
  ctx.fillRect=(x,y,width,height)=>{const points=[point(x,y),point(x+width,y),point(x+width,y+height),point(x,y+height)];
    fills.push({fill:ctx.fillStyle,alpha:ctx.globalAlpha,left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))});
  };
  return{gradients,fills,matrix:()=>[...matrix],resetFills(){fills.length=0;}};
}
function warningAlphaAt(gradient,x,y,dpr){
  const [a,b,c,d,e,f]=gradient.matrix,det=a*d-b*c,dx=x*dpr-e,dy=y*dpr-f;
  const localX=(d*dx-c*dy)/det,localY=(-b*dx+a*dy)/det;
  const t=(Math.hypot(localX-gradient.args[3],localY-gradient.args[4])-gradient.args[2])/(gradient.args[5]-gradient.args[2]);
  const alpha=stop=>Number(stop.color.match(/,([\d.]+)\)$/)[1]),stops=gradient.stops;
  if(t<=stops[0].offset)return alpha(stops[0]);
  for(let i=1;i<stops.length;i++)if(t<=stops[i].offset){const previous=stops[i-1],next=stops[i];return alpha(previous)+(alpha(next)-alpha(previous))*(t-previous.offset)/(next.offset-previous.offset);}
  return alpha(stops.at(-1));
}

test('critical screen feedback skips inactive scenes and invalid or healthy values without allocating a gradient',()=>{
  const{renderer,ctx}=identificationFixture(),trace=healthWarningTrace(ctx,()=>renderer.dpr),player=Object.freeze({hp:30,maxHp:100});
  for(const state of ['menu','paused','upgrade','supply','route','event','dead','victory',undefined])renderer.drawHealthWarning(ctx,Object.freeze({state,player}));
  renderer.drawHealthWarning(ctx,null);
  for(const player of [{hp:0,maxHp:100},{hp:31,maxHp:100},{hp:30,maxHp:0},{hp:NaN,maxHp:100},{hp:1,maxHp:Infinity}])renderer.drawHealthWarning(ctx,{state:'playing',player:Object.freeze(player)});
  assert.equal(trace.fills.length,0);assert.equal(trace.gradients.length,0);assert.equal(renderer.healthWarningGradient,null);
  renderer.drawHealthWarning(ctx,Object.freeze({state:'playing',player}));assert.equal(trace.fills.length,1);assert.equal(trace.gradients.length,1);
});

test('actual critical rendering keeps a transparent center and static screen edges beneath objective markers regardless of visual options',()=>{
  for(const [width,height,dpr] of [[390,844,1],[1280,720,2],[844,390,2]]){
    const{renderer,ctx}=identificationFixture(width,height,dpr),trace=healthWarningTrace(ctx,()=>renderer.dpr),{game}=identificationGame();
    game.shoot();game.hurtPlayer(70);assert.equal(game.player.hp,30);assert.ok(game.snapshot());
    Object.freeze(game.player);Object.freeze(game.particles);Object.freeze(game.texts);Object.freeze(game.links);Object.freeze(game.events);
    const capture=()=>JSON.stringify({checkpoint:game.snapshot(),random:game.random.getState(),visual:game.visualRandom.getState(),particles:game.particles,texts:game.texts,links:game.links,events:game.events,shake:game.shake,flash:game.flash});
    const order=[];for(const [method,name] of [['drawAtmosphere','atmosphere'],['drawHealthWarning','warning'],['drawObjectiveDirections','directions'],['drawMinimap','minimap']]){
      const original=renderer[method].bind(renderer);renderer[method]=(...args)=>{order.push(name);return original(...args);};
    }
    let gradient;
    for(const atmosphere of [false,true])for(const motion of [false,true])for(const shake of [false,true])for(const time of [0,37.25]){
      renderer.atmosphereEnabled=atmosphere;renderer.motionEnabled=motion;renderer.shakeEnabled=shake;game.time=time;
      const before=capture();trace.resetFills();order.length=0;renderer.render(game,{},time+1.37);
      const warning=trace.fills.filter(fill=>fill.fill===renderer.healthWarningGradient);assert.equal(warning.length,1);
      const paint=warning[0];close(paint.left,0);close(paint.top,0);close(paint.right,width);close(paint.bottom,height);close(paint.alpha,1);
      gradient??=renderer.healthWarningGradient;assert.equal(renderer.healthWarningGradient,gradient,'Time, HP and visual options must not animate or recreate the warning');
      for(const [x,y] of [[width/2,height/2],[width/3,height/3],[width*2/3,height*2/3]])close(warningAlphaAt(gradient,x,y,dpr),0);
      for(const [x,y] of [[0,height/2],[width,height/2],[width/2,0],[width/2,height],[0,0],[width,height]]){
        const alpha=warningAlphaAt(gradient,x,y,dpr);assert.ok(alpha>0&&alpha<=.25,'Edges need a restrained dark tint while the central fight remains transparent');
      }
      for(const stop of gradient.stops){const [red,green,blue]=stop.color.match(/rgba\((\d+),(\d+),(\d+),/).slice(1).map(Number);assert.ok(red>green*2&&red>blue*2);}
      assert.ok(order.indexOf('warning')<order.indexOf('directions')&&order.indexOf('directions')<order.indexOf('minimap'));
      if(atmosphere)assert.ok(order.indexOf('atmosphere')<order.indexOf('warning'));
      assert.equal(capture(),before,'Warning rendering must preserve checkpoint stats, both RNG streams, damage flash and all event/effect queues');
    }
    assert.equal(trace.gradients.filter(item=>item===gradient).length,1);
  }
});

test('critical gradients reuse their viewport cache and resize or DPR changes replace it once without leaking canvas state',()=>{
  const{renderer,rect,ctx}=identificationFixture(390,844,1),trace=healthWarningTrace(ctx,()=>renderer.dpr);
  const scene=hp=>Object.freeze({state:'playing',player:Object.freeze({hp,maxHp:100})});
  renderer.drawHealthWarning(ctx,scene(30));const first=renderer.healthWarningGradient;
  renderer.drawHealthWarning(ctx,scene(1));assert.equal(renderer.healthWarningGradient,first);assert.equal(trace.gradients.length,1);
  trace.resetFills();renderer.drawHealthWarning(ctx,scene(30.01));assert.equal(trace.fills.length,0);assert.equal(trace.gradients.length,1);
  let previous=first,allocations=1;
  for(const [width,height,dpr] of [[390,844,1],[1280,720,1],[1280,720,2],[844,390,2]]){
    rect.width=width;rect.height=height;window.devicePixelRatio=dpr;renderer.resize();assert.equal(renderer.healthWarningGradient,null);
    ctx.setTransform(1.5,0,0,1.5,71,93);ctx.globalAlpha=.23;ctx.fillStyle='#abc';const matrix=trace.matrix();trace.resetFills();
    renderer.drawHealthWarning(ctx,scene(30));const current=renderer.healthWarningGradient;assert.notEqual(current,previous);allocations++;
    assert.equal(trace.gradients.length,allocations);assert.deepEqual(trace.matrix(),matrix);assert.equal(ctx.globalAlpha,.23);assert.equal(ctx.fillStyle,'#abc');
    const paint=trace.fills[0];close(paint.left,0);close(paint.top,0);close(paint.right,width);close(paint.bottom,height);
    close(warningAlphaAt(current,width/2,height/2,dpr),0);assert.ok(warningAlphaAt(current,width/2,0,dpr)>0);
    renderer.drawHealthWarning(ctx,scene(2));assert.equal(renderer.healthWarningGradient,current);assert.equal(trace.gradients.length,allocations);previous=current;
  }
});

test('the actual camera inverse accounts for its screen offset, zoom and sprite height',()=>{
  const{canvas}=canvasFixture();const renderer=new Renderer(canvas);renderer.camera={x:1080,y:870};renderer.cameraProjection=project(1080,870);
  for(const zoom of [.88,1,1.26])for(const z of [0,22,115])for(const p of [{x:1200,y:930},{x:240,y:440},{x:2090,y:1590}]){
    renderer.zoom=zoom;const screen=renderer.worldToScreen(p.x,p.y,z),back=renderer.screenToWorld(screen.x,screen.y,z);close(back.x,p.x);close(back.y,p.y);
  }
});

test('resizing retains pointer accuracy and limits the backing canvas pixel ratio',()=>{
  const{canvas,rect}=canvasFixture();const renderer=new Renderer(canvas);renderer.cameraProjection=project(1200,930);
  for(const[width,height]of [[390,844],[1280,720],[1920,1080]]){rect.width=width;rect.height=height;renderer.resize();assert.equal(canvas.width,width*2);assert.equal(canvas.height,height*2);const screen=renderer.worldToScreen(1300,1000,22),back=renderer.screenToWorld(screen.x,screen.y,22);close(back.x,1300);close(back.y,1000);}
});

test('automatic brackets follow only a living selected body and manual mode retains its pointer marker',()=>{
  const{canvas,ctx}=canvasFixture(),renderer=new Renderer(canvas),game=new Game({seed:290});
  game.enemies=[];const target=game.spawnEnemy('walker',0,{x:1430,y:930});assert.ok(target);
  game.spawnEnemy('walker',0,{x:1390,y:930});renderer.cameraProjection=project(game.player.x,game.player.y);
  const points=[],dots=[];let strokes=0;
  ctx.moveTo=(x,y)=>points.push({x,y});ctx.lineTo=(x,y)=>points.push({x,y});
  ctx.ellipse=(x,y)=>dots.push({x,y});ctx.stroke=()=>strokes++;
  const draw=input=>{points.length=0;dots.length=0;strokes=0;renderer.drawCursor(ctx,game,input);};
  const pointer={aimX:1100,aimY:800},automatic={...pointer,fireMode:'auto',targetId:target.id};
  for(const targetId of [null,999999]){
    draw({...automatic,targetId});assert.equal(strokes,0);assert.equal(points.length,0);assert.equal(dots.length,0);
  }
  const before=JSON.stringify({player:game.player,enemies:game.enemies,random:game.random.getState(),visual:game.visualRandom.getState(),events:game.events});
  draw(automatic);assert.ok(strokes>0&&points.length>0);assert.equal(dots.length,0,'Automatic targeting uses brackets without the manual center dot');
  const center=()=>({x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,y:(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2});
  let expected=project(target.x,target.y,22);close(center().x,expected.x);close(center().y,expected.y);
  assert.equal(JSON.stringify({player:game.player,enemies:game.enemies,random:game.random.getState(),visual:game.visualRandom.getState(),events:game.events}),before);
  target.x+=60;draw(automatic);expected=project(target.x,target.y,22);close(center().x,expected.x);close(center().y,expected.y);
  target.dead=true;draw(automatic);assert.equal(strokes,0);assert.equal(points.length,0);
  target.dead=false;target.hp=0;draw(automatic);assert.equal(strokes,0);assert.equal(points.length,0);
  draw({...automatic,fireMode:'manual'});assert.ok(strokes>0);assert.equal(dots.length,1);
  expected=project(pointer.aimX,pointer.aimY,22);close(dots[0].x,expected.x);close(dots[0].y,expected.y);
  game.state='paused';draw({...automatic,fireMode:'manual'});assert.equal(strokes,0);assert.equal(dots.length,0);
});

test('the player outline appears once for a front body occluder and skips behind, dead, culled and feet-only bodies',()=>{
  const scenarios=[...['walker','elite','collector'].map(type=>({type,dx:10,dy:10,expected:1})),
    {type:'walker',dx:-10,dy:-10,expected:0},{type:'walker',dx:10,dy:10,dead:true,expected:0},
    {type:'walker',dx:10,dy:10,hp:0,expected:0},{type:'walker',dx:1100,dy:-530,expected:0},
    {type:'walker',dx:30,dy:30,expected:0},{type:'collector',dx:100,dy:100,expected:0}];
  for(const scenario of scenarios){
    const{renderer}=identificationFixture(),{game,enemy}=identificationGame(scenario.type,scenario.dx,scenario.dy),order=trackIdentification(renderer);
    if(scenario.dead)enemy.dead=true;if(scenario.hp!==undefined)enemy.hp=scenario.hp;
    renderer.render(game,{},1);assert.equal(order.filter(pass=>pass==='outline').length,scenario.expected,JSON.stringify(scenario));
  }
  const{renderer}=identificationFixture(),{game,enemy}=identificationGame();
  const second={...enemy,id:enemy.id+1,type:'elite',r:27,maxHp:330,hp:330};game.enemies.push(second);
  const order=trackIdentification(renderer);renderer.render(game,{},1);
  assert.equal(order.filter(pass=>pass==='enemy').length,2);assert.equal(order.filter(pass=>pass==='outline').length,1,'Multiple overlapping front bodies must not produce repeated outline passes');
});

test('the outline follows particles and precedes text and cursor only in alive nonterminal scenes',()=>{
  const{renderer,ctx}=identificationFixture(),trace=identificationTrace(ctx,renderer.dpr),{game,enemy}=identificationGame();
  game.shoot();game.float(game.player.x,game.player.y,'FIELD','#eee');const order=trackIdentification(renderer,trace);let drawables;
  const needed=renderer.playerIdentificationNeeded.bind(renderer);renderer.playerIdentificationNeeded=(current,list)=>{drawables=list;return needed(current,list);};
  for(const state of ['playing','paused','upgrade','supply','route','event']){
    game.state=state;order.length=0;trace.reset();renderer.render(game,{aimX:1300,aimY:930},1);
    assert.equal(order.filter(pass=>pass==='outline').length,1);
    const outline=order.indexOf('outline');assert.ok(order.indexOf('player')<order.indexOf('enemy'));assert.ok(order.lastIndexOf('particle')<outline);
    assert.ok(outline<order.indexOf('text')&&order.indexOf('text')<order.indexOf('cursor'));
    assert.equal(trace.fills.filter(record=>record.phase==='outline').length,0);
  }
  for(const state of ['menu','dead','victory']){
    game.state=state;order.length=0;renderer.render(game,{},1);assert.equal(order.includes('outline'),false);
  }
  game.state='playing';const hp=game.player.hp;
  for(const value of [0,-1,NaN,Infinity]){
    game.player.hp=value;assert.equal(needed(game,drawables),false);trace.reset();renderer.drawPlayerIdentification(ctx,game.player);
    assert.equal(trace.strokes.filter(record=>record.phase==='outline').length,0);
  }
  game.player.hp=hp;const enemyHp=enemy.hp;
  for(const value of [0,-1,NaN,Infinity]){enemy.hp=value;assert.equal(needed(game,drawables),false);}enemy.hp=enemyHp;
  assert.equal(needed(game,[{kind:'enemy',e:enemy}]),false,'A body not following the actual player draw entry cannot trigger identification');
  renderer.cameraProjection=project(game.player.x+10000,game.player.y+10000);assert.equal(needed(game,drawables),false,'An entirely offscreen player core must not be outlined');
});

test('head, coat and backpack outline paths share the actual camera transform and keep constant CSS width across DPR and resize',()=>{
  for(const dpr of [1,2]){
    const{renderer,rect,ctx}=identificationFixture(390,844,dpr),trace=identificationTrace(ctx,dpr),{game}=identificationGame();trackIdentification(renderer,trace);
    renderer.camera={x:1180,y:920};renderer.cameraProjection=project(1180,920);renderer.cameraReady=true;game.shake=10;
    for(const [width,height] of [[390,844],[1280,720]])for(const angle of [0,Math.PI]){
      rect.width=width;rect.height=height;renderer.resize();game.player.angle=angle;trace.reset();const now=.7;
      renderer.render(game,{},now);const outline=trace.strokes.filter(record=>record.phase==='outline'),normal=trace.fills.filter(record=>record.phase==='player');
      assert.equal(renderer.dpr,dpr);assert.equal(outline.length,5);assert.equal(trace.fills.filter(record=>record.phase==='outline').length,0);
      for(const contour of outline){
        assert.equal(contour.color,'#ded6b4');close(contour.alpha,.68);close(contour.cssWidth,1.3);
        assert.ok(normal.some(part=>part.points.length===contour.points.length&&part.points.every((point,i)=>Math.abs(point.x-contour.points[i].x)<1e-8&&Math.abs(point.y-contour.points[i].y)<1e-8)),'Each identifying contour must match its already drawn head, cap, visor, coat or backpack');
      }
      const cap=outline.filter(contour=>contour.ellipse)[1].ellipse.center,expected=renderer.worldToScreen(game.player.x,game.player.y,39);
      expected.x+=Math.sin(now*77)*10;expected.y+=Math.cos(now*93)*10*.65;close(cap.x,expected.x);close(cap.y,expected.y);
      const ground=renderer.worldToScreen(game.player.x,game.player.y);ground.x+=Math.sin(now*77)*10;ground.y+=Math.cos(now*93)*10*.65;
      for(const contour of outline)for(const point of contour.points){
        assert.ok(point.x>=ground.x-16*renderer.zoom-1e-8&&point.x<=ground.x+16*renderer.zoom+1e-8);
        assert.ok(point.y>=ground.y-45*renderer.zoom-1e-8&&point.y<=ground.y-15*renderer.zoom+1e-8,'The body outline must exclude boots, weapon and ground rings');
      }
    }
  }
});

test('repeated adaptive outline rendering and camera following preserve checkpoints, both RNG streams and effect queues',()=>{
  const{renderer}=identificationFixture(),{game,enemy}=identificationGame();game.shoot();game.float(game.player.x,game.player.y,'SIGNAL','#eee');
  renderer.camera={x:1200,y:930};renderer.cameraProjection=project(1200,930);renderer.cameraReady=true;
  game.move(game.player,60,0);game.move(enemy,60,0);
  const capture=()=>JSON.stringify({checkpoint:game.snapshot(),particles:game.particles,texts:game.texts,links:game.links,events:game.events,shake:game.shake,flash:game.flash});
  assert.ok(game.snapshot());assert.ok(game.particles.length&&game.events.length&&game.texts.length);const before=capture(),cameraX=renderer.camera.x;
  Object.freeze(game.player);Object.freeze(enemy);Object.freeze(game.enemies);Object.freeze(game.particles);Object.freeze(game.texts);Object.freeze(game.links);Object.freeze(game.events);
  const order=trackIdentification(renderer);for(let i=0;i<20;i++)renderer.render(game,{},1+i/60);
  assert.equal(order.filter(pass=>pass==='outline').length,20);assert.ok(renderer.camera.x>cameraX);
  assert.equal(capture(),before,'Identification must not change timers, body phase, gameplay or visual RNG, audio events or effects');
});

test('objective directions hide visible or dead targets and preserve offscreen roles and screen headings',()=>{
  const{canvas,ctx}=canvasFixture(),renderer=new Renderer(canvas),trace=directionTrace(ctx);
  for(const [kind,label,stage] of [['gatekeeper','봉쇄 정예',0],['collector','수집가',2],['alarm','경보 정예',0]]){
    const scene=screen=>directionScene(renderer,kind==='alarm'?{stage,mandatory:null,alarm:screen}:{stage,mandatory:screen});
    const visible=scene({x:640,y:360});assert.deepEqual(renderer.objectiveDirectionMarkers(visible),[]);
    trace.reset();renderer.drawObjectiveDirections(ctx,visible);assert.equal(trace.draws.length,0);
    for(const screen of [{x:-500,y:360},{x:1780,y:360},{x:640,y:-500},{x:640,y:1220}]){
      const game=scene(screen),markers=renderer.objectiveDirectionMarkers(game);assert.equal(markers.length,1);
      const marker=markers[0],player=renderer.worldToScreen(game.player.x,game.player.y,22),target=renderer.worldToScreen(game.enemies[0].x,game.enemies[0].y,22);
      assert.equal(marker.kind,kind);assert.equal(marker.label,label);close(marker.angle,Math.atan2(target.y-player.y,target.x-player.x));
      trace.reset();renderer.drawObjectiveDirections(ctx,game);assert.ok(trace.draws.length>=5,'A direction must draw its arrow, role symbol and plaque');
      for(const box of trace.draws)assert.ok(box.left>=marker.bounds.left-1e-8&&box.top>=marker.bounds.top-1e-8&&box.right<=marker.bounds.right+1e-8&&box.bottom<=marker.bounds.bottom+1e-8,'The reported marker bounds must contain every drawn component');
      game.enemies[0].dead=true;assert.deepEqual(renderer.objectiveDirectionMarkers(game),[]);
    }
    const game=scene({x:1780,y:360});game.enemies[0].hp=0;assert.deepEqual(renderer.objectiveDirectionMarkers(game),[]);
    game.enemies[0].hp=330;
    for(const state of ['paused','upgrade','supply','route','event','dead','victory']){game.state=state;assert.deepEqual(renderer.objectiveDirectionMarkers(game),[]);}
  }
});

test('whole direction markers avoid measured HUDs on portrait, desktop and touch landscape screens',()=>{
  // Captured from the real source QA DOM with the initial field toast visible.
  for(const [name,layout] of Object.entries(directionLayouts)){
    const{canvas,ctx}=canvasFixture(layout.width,layout.height),renderer=new Renderer(canvas),trace=directionTrace(ctx);
    renderer.touchMode=layout.touch;renderer.directionExclusions=structuredClone(layout.zones);
    const obstacles=[...layout.zones];
    if(layout.width>=900&&layout.height>=560)obstacles.push({id:'minimap',left:layout.width-204,top:140,right:layout.width-26,bottom:300});
    for(const stage of [0,2])for(const [dx,dy] of [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]]){
      const target={x:layout.width/2+dx*2000,y:layout.height/2+dy*2000},alarm={x:layout.width/2-dx*2000,y:layout.height/2-dy*2000};
      const game=directionScene(renderer,{stage,mandatory:target,alarm}),markers=renderer.objectiveDirectionMarkers(game);
      assert.ok(markers.length>=1,`${name}, stage${stage}, direction${dx},${dy}: available HUD-safe space must show the mandatory objective`);
      assert.equal(markers[0].kind,stage===2?'collector':'gatekeeper');assert.ok(markers.length<=2);
      for(const marker of markers){
        const box=marker.bounds;
        assert.ok(box.left>=5&&box.top>=5&&box.right<=layout.width-5&&box.bottom<=layout.height-5);
        for(const zone of obstacles)assert.ok(!overlaps(box,zone),`${name}/${marker.kind} overlaps ${zone.id}`);
      }
      if(markers.length===2)assert.ok(!overlaps(markers[0].bounds,markers[1].bounds),`${name}: objective plaques must not overlap each other`);
      trace.reset();renderer.drawObjectiveDirections(ctx,game);assert.ok(trace.draws.length>0);
      for(const box of trace.draws){
        assert.ok(markers.some(marker=>box.left>=marker.bounds.left-1e-8&&box.top>=marker.bounds.top-1e-8&&box.right<=marker.bounds.right+1e-8&&box.bottom<=marker.bounds.bottom+1e-8),`${name}: all painted arrows, upright role symbols, plaques and text must fit a checked marker box`);
        for(const zone of obstacles)assert.ok(!overlaps(box,zone),`${name}: painted marker overlaps ${zone.id}`);
      }
    }
  }
});

test('same-direction objective markers keep mandatory priority and omit optional marks when only one slot is free',()=>{
  const{canvas}=canvasFixture(),renderer=new Renderer(canvas),target={x:1780,y:360};
  const game=directionScene(renderer,{mandatory:target,alarm:target});
  let markers=renderer.objectiveDirectionMarkers(game);assert.deepEqual(markers.map(marker=>marker.kind),['gatekeeper','alarm']);
  assert.equal(markers[0].angle,markers[1].angle);assert.ok(!overlaps(markers[0].bounds,markers[1].bounds));
  assert.ok(Math.hypot(markers[1].x-markers[0].x,markers[1].y-markers[0].y)>=34,'The optional mark must leave room around the mandatory one');
  const main=markers[0].bounds,left=main.left-8,right=main.right+8,top=main.top-8,bottom=main.bottom+8;
  renderer.directionExclusions=[{id:'left',left:0,top:0,right:left,bottom:renderer.height},{id:'right',left:right,top:0,right:renderer.width,bottom:renderer.height},{id:'top',left,top:0,right,bottom:top},{id:'bottom',left,top:bottom,right,bottom:renderer.height}];
  markers=renderer.objectiveDirectionMarkers(game);assert.deepEqual(markers.map(marker=>marker.kind),['gatekeeper'],'The one available slot belongs to the mandatory objective');
  renderer.directionExclusions=[{id:'full',left:0,top:0,right:renderer.width,bottom:renderer.height}];
  assert.deepEqual(renderer.objectiveDirectionMarkers(game),[],'Covering the HUD is worse than omitting a marker when no slot exists');
});

test('objective arrows recompute after resize, remain steady during viewport shake, and leave real combat state unchanged',()=>{
  const{canvas,rect,ctx}=canvasFixture(),renderer=new Renderer(canvas),game=new Game({seed:3761});game.enemies=[];
  const gate=game.spawnEnemy('elite',0,{x:1300,y:1700});assert.ok(gate);assert.equal(gate.x,1300);assert.equal(gate.y,1700);
  gate.gatekeeper=true;game.stageBossSpawned=true;renderer.minimapEnabled=false;renderer.atmosphereEnabled=false;
  renderer.camera={x:game.player.x,y:game.player.y};renderer.cameraProjection=project(game.player.x,game.player.y);renderer.cameraReady=true;
  const first=renderer.objectiveDirectionMarkers(game);assert.equal(first.length,1);
  const capture=()=>JSON.stringify({checkpoint:game.snapshot(),particles:game.particles,texts:game.texts,links:game.links,events:game.events,shake:game.shake,flash:game.flash});
  assert.ok(game.snapshot());
  for(const shake of [0,10]){
    game.shake=shake;const before=capture();renderer.render(game,{},1+shake/10);assert.equal(capture(),before);
    assert.deepEqual(renderer.objectiveDirectionMarkers(game),first,'Directions use the stable camera projection rather than combat shake');
  }
  rect.width=1600;rect.height=900;renderer.resize();const resized=renderer.objectiveDirectionMarkers(game);assert.equal(resized.length,1);
  const player=renderer.worldToScreen(game.player.x,game.player.y,22),target=renderer.worldToScreen(gate.x,gate.y,22),expected=edgePosition(player,target,renderer.width,renderer.height,renderer.objectiveSafeRect(game));
  close(resized[0].x,expected.x);close(resized[0].y,expected.y);close(resized[0].angle,expected.angle);
  assert.notDeepEqual({x:resized[0].x,y:resized[0].y},{x:first[0].x,y:first[0].y});
  const before=capture();renderer.drawObjectiveDirections(ctx,game);assert.equal(capture(),before);
});

test('hidden minimaps and noncombat or small screens skip terrain preparation and drawing',()=>{
  const cases=[{enabled:false,width:1280,height:720,state:'playing'},
    {enabled:true,width:899,height:720,state:'playing'},{enabled:true,width:1280,height:559,state:'playing'},
    ...['paused','upgrade','supply','route','event','menu','dead','victory'].map(state=>({enabled:true,width:1280,height:720,state}))];
  for(const scenario of cases){
    const{canvas,ctx,imageDraws,createdCanvases}=canvasFixture(scenario.width,scenario.height);
    const renderer=new Renderer(canvas),game=new Game({seed:290});renderer.minimapEnabled=scenario.enabled;game.state=scenario.state;
    const trace=minimapTrace(ctx);renderer.drawMinimap(ctx,game);
    assert.equal(renderer.minimapCanvas,null);assert.equal(createdCanvases.length,0);assert.equal(imageDraws.length,0);assert.equal(trace.translations.length,0);
  }
  const{canvas,ctx,imageDraws,createdCanvases}=canvasFixture(900,560),renderer=new Renderer(canvas),game=new Game({seed:290});
  renderer.minimapEnabled=true;renderer.drawMinimap(ctx,game);const cached=renderer.minimapCanvas;
  assert.ok(cached);assert.equal(createdCanvases.length,1);assert.equal(imageDraws.length,1);
  renderer.minimapEnabled=false;renderer.drawMinimap(ctx,game);assert.equal(imageDraws.length,1);
  renderer.minimapEnabled=true;renderer.drawMinimap(ctx,game);
  assert.equal(renderer.minimapCanvas,cached);assert.equal(createdCanvases.length,1);assert.equal(imageDraws.length,2);
});

test('minimap terrain is reused for dynamic actors and exits and rebuilt once for destruction, district and resize',()=>{
  const{canvas,rect,ctx,createdCanvases}=canvasFixture(),renderer=new Renderer(canvas),game=new Game({seed:290});renderer.minimapEnabled=true;
  const initial=JSON.stringify(game.snapshot());assert.notEqual(initial,'null');
  renderer.drawMinimap(ctx,game);assert.equal(JSON.stringify(game.snapshot()),initial,'Preparing terrain must not mutate the world or consume RNG');
  let cached=renderer.minimapCanvas;assert.equal(createdCanvases.length,1);
  const trace=minimapTrace(ctx);renderer.drawMinimap(ctx,game);const closedColor=trace.rects.at(-1).color;
  game.player.x+=40;game.player.angle=Math.PI/2;game.world.exit.open=true;game.placeLure(game.player.x,game.player.y);
  trace.reset();renderer.drawMinimap(ctx,game);
  assert.equal(renderer.minimapCanvas,cached);assert.equal(createdCanvases.length,1);
  const player=renderer.minimapProjection.project(game.player.x,game.player.y),last=trace.translations.at(-1);
  close(last.x,player.x);close(last.y,player.y);close(trace.rotations.at(-1),renderer.minimapProjection.heading(game.player.angle));
  const exit=renderer.minimapProjection.project(game.world.exit.x,game.world.exit.y),marker=trace.rects.at(-1);
  close(marker.x+marker.width/2,exit.x);close(marker.y+marker.height/2,exit.y);assert.notEqual(marker.color,closedColor,'Opening the exit must update its dynamic marker');
  const lure=renderer.minimapProjection.project(game.lure.x,game.lure.y);
  assert.ok(trace.ellipses.some(p=>Math.abs(p.x-lure.x)<1e-8&&Math.abs(p.y-lure.y)<1e-8),'The live lure must use the same minimap projection');
  const car=game.world.obstacles.find(o=>o.kind==='car');car.destroyed=true;renderer.drawMinimap(ctx,game);
  assert.notEqual(renderer.minimapCanvas,cached);cached=renderer.minimapCanvas;assert.equal(createdCanvases.length,2);
  renderer.drawMinimap(ctx,game);assert.equal(renderer.minimapCanvas,cached);assert.equal(createdCanvases.length,2);
  const previousWorld=game.world;game.advanceStage();assert.notEqual(game.world,previousWorld);renderer.drawMinimap(ctx,game);
  assert.notEqual(renderer.minimapCanvas,cached);cached=renderer.minimapCanvas;assert.equal(createdCanvases.length,3);
  renderer.drawMinimap(ctx,game);assert.equal(renderer.minimapCanvas,cached);assert.equal(createdCanvases.length,3);
  rect.width=1400;rect.height=800;renderer.resize();trace.reset();renderer.drawMinimap(ctx,game);
  assert.notEqual(renderer.minimapCanvas,cached);cached=renderer.minimapCanvas;assert.equal(createdCanvases.length,4);
  close(trace.translations[0].x,renderer.width-178-26);close(trace.translations[0].y,140);
  renderer.drawMinimap(ctx,game);assert.equal(renderer.minimapCanvas,cached);assert.equal(createdCanvases.length,4);
  const capture=()=>JSON.stringify({checkpoint:game.snapshot(),particles:game.particles,texts:game.texts,links:game.links,events:game.events,shake:game.shake,flash:game.flash});
  assert.ok(game.snapshot());const before=capture();for(let i=0;i<5;i++)renderer.drawMinimap(ctx,game);
  assert.equal(capture(),before,'Minimap rendering must preserve combat, both RNG streams and queued effects');assert.equal(createdCanvases.length,4);
});

test('living alarm, blockade and collector markers use different shapes and dead markers disappear dynamically',()=>{
  const{canvas,ctx,createdCanvases}=canvasFixture(),renderer=new Renderer(canvas),game=new Game({seed:290});game.enemies=[];renderer.minimapEnabled=true;
  const spawn=(type,x,y)=>{const enemy=game.spawnEnemy(type,0,{x,y});assert.ok(enemy);assert.equal(enemy.x,x);assert.equal(enemy.y,y);return enemy;};
  const alarm=spawn('elite',1390,930),gate=spawn('elite',1200,680),collector=spawn('collector',1300,1170),ordinary=spawn('walker',1430,930);
  gate.gatekeeper=true;game.stageBossSpawned=true;game.alarm={active:true,time:30,cooldown:0,count:1,eliteId:alarm.id};
  const dead=spawn('walker',1360,930);dead.dead=true;const zero=spawn('walker',1460,930);zero.hp=0;
  renderer.drawMinimap(ctx,game);const cached=renderer.minimapCanvas,trace=minimapTrace(ctx);
  renderer.drawMinimap(ctx,game);
  const symbolFor=enemy=>{
    const center=renderer.minimapProjection.project(enemy.x,enemy.y);
    return trace.polygons.find(({points})=>points.length>=3&&Math.abs((Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2-center.x)<1e-8&&Math.abs((Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2-center.y)<1);
  };
  assert.equal(symbolFor(alarm)?.points.length,3,'Optional alarm elite is a triangle');
  assert.equal(symbolFor(gate)?.points.length,4,'Required blockade elite is a diamond');
  assert.equal(symbolFor(collector)?.points.length,6,'Final collector is a hexagon');
  assert.equal(trace.ellipses.length,1,'Only the living ordinary enemy uses a horde dot');
  const dot=renderer.minimapProjection.project(ordinary.x,ordinary.y);close(trace.ellipses[0].x,dot.x);close(trace.ellipses[0].y,dot.y);
  alarm.dead=true;gate.dead=true;collector.hp=0;trace.reset();renderer.drawMinimap(ctx,game);
  assert.equal(symbolFor(alarm),undefined);assert.equal(symbolFor(gate),undefined);assert.equal(symbolFor(collector),undefined);
  assert.equal(renderer.minimapCanvas,cached);assert.equal(createdCanvases.length,1,'Enemy lifecycle must not repaint terrain');
});

test('the camera follows in seconds and environment rendering preserves combat, both RNG streams and effect queues',()=>{
  const{canvas}=canvasFixture();const renderer=new Renderer(canvas),game=new Game({seed:290});renderer.render(game,{},1);const first=renderer.camera.x;
  game.tick(.05,{shoot:true,lure:true,molotov:true,aimX:1450,aimY:930,targetX:1360,targetY:980});
  game.player.x+=200;
  const raw=game.snapshot();assert.ok(raw,'A populated live run must remain checkpointable');
  assert.ok(game.particles.length&&game.events.length,'The read-only check must include populated effect and audio queues');
  const capture=()=>JSON.stringify({checkpoint:game.snapshot(),particles:game.particles,texts:game.texts,links:game.links,events:game.events,shake:game.shake,flash:game.flash});
  const before=capture(),rain=renderer.rain,puddles=renderer.puddles;
  for(let i=1;i<=30;i++){
    renderer.atmosphereEnabled=i%4<2;renderer.motionEnabled=i%2===0;
    renderer.render(game,{},1+i/60);
    assert.equal(renderer.rain,rain);assert.equal(renderer.puddles,puddles);
    assert.ok(renderer.puddleCount<=24,'Decorative water must keep its fixed pool bound');
  }
  assert.equal(rain.length,72*4);assert.equal(puddles.length,24*4);
  assert.ok(renderer.camera.x-first>150,'camera should settle toward the moving player within half a second');
  assert.ok(renderer.camera.x<=game.player.x,'camera must not overshoot');assert.equal(capture(),before);
});

test('environment and reduced-motion switches suppress rain and ripples while retaining static atmosphere',()=>{
  const{canvas,ctx}=canvasFixture();const renderer=new Renderer(canvas),game=new Game({seed:290});renderer.render(game,{},1);
  let strokes=0,segments=0,fog=0,ripples=0;
  ctx.stroke=()=>strokes++;ctx.lineTo=()=>segments++;ctx.fillRect=()=>fog++;ctx.ellipse=()=>ripples++;
  renderer.atmosphereEnabled=false;
  renderer.drawAtmosphere(ctx,game,3);renderer.drawPuddles(ctx,game,3);
  assert.deepEqual({strokes,segments,fog,ripples},{strokes:0,segments:0,fog:0,ripples:0});
  renderer.atmosphereEnabled=true;renderer.motionEnabled=false;
  renderer.drawAtmosphere(ctx,game,3);
  assert.equal(strokes,0);assert.equal(segments,0);assert.equal(fog,1,'Static fog should remain when motion is disabled');
  renderer.motionEnabled=true;renderer.drawAtmosphere(ctx,game,4);
  assert.equal(strokes,1);assert.equal(segments,72,'Rain uses its bounded stroke pool');
  renderer.puddleCount=1;renderer.puddles.set([game.player.x,game.player.y,30,10]);
  renderer.motionEnabled=false;renderer.drawPuddles(ctx,game,3);assert.equal(ripples,0);
  renderer.motionEnabled=true;renderer.drawPuddles(ctx,game,4);assert.equal(ripples,1);
});

test('optional asphalt loading falls back safely and replaces only the cached floor after a valid image arrives',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'Image');
  const setImage=value=>Object.defineProperty(globalThis,'Image',{configurable:true,writable:true,value});
  try{
    const game=new Game({seed:290});
    for(const Image of [undefined,class{constructor(){throw new Error('Image unavailable');}}]){
      setImage(Image);const{canvas}=canvasFixture();const renderer=new Renderer(canvas);
      assert.equal(renderer.textureStatus,'fallback');assert.equal(renderer.asphaltImage,null);
      assert.doesNotThrow(()=>renderer.render(game,{},1));assert.ok(renderer.floor);
    }
    let material;
    setImage(class{constructor(){material=this;this.naturalWidth=0;this.naturalHeight=0;}});
    const{canvas,imageDraws}=canvasFixture(),renderer=new Renderer(canvas);
    assert.equal(renderer.textureStatus,'loading');assert.match(material.src,/assets\/asphalt-painted-v1\.png$/);
    renderer.render(game,{},1);material.onload();
    assert.equal(renderer.textureStatus,'fallback');assert.equal(renderer.asphaltImage,null);
    assert.doesNotThrow(()=>renderer.render(game,{},2));
    renderer.loadAsphaltMaterial();material.onerror();
    assert.equal(renderer.textureStatus,'fallback');assert.equal(renderer.asphaltImage,null);
    assert.doesNotThrow(()=>renderer.render(game,{},3));
    const fallbackFloor=renderer.floor;renderer.loadAsphaltMaterial();
    material.naturalWidth=1024;material.naturalHeight=1024;material.onload();
    assert.equal(renderer.textureStatus,'ready');assert.equal(renderer.asphaltImage,material);assert.equal(renderer.floorKey,'');
    renderer.atmosphereEnabled=false;renderer.render(game,{},4);
    assert.notEqual(renderer.floor,fallbackFloor,'Loading material must invalidate an already painted floor');
    const paints=imageDraws.filter(args=>args[0]===material).length;
    assert.ok(paints>0,'Street material remains present with optional atmosphere disabled');
    renderer.render(game,{},5);
    assert.equal(imageDraws.filter(args=>args[0]===material).length,paints,'Unchanged floors should reuse the painted cache');
  }finally{
    if(descriptor)Object.defineProperty(globalThis,'Image',descriptor);else delete globalThis.Image;
  }
});
