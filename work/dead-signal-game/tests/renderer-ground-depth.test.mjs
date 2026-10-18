import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {ProductionArt} from '../dist/production-art.js';
import {FireGround} from '../dist/fire-ground.js';
import {ImpactMarks} from '../dist/impact-marks.js';
import {NORTH_EXPEDITION,NORTH_STEPS} from '../dist/expedition.js';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const rendererBytes=await readFile(new URL('../../../qa/dense-cpu-next-20261018/renderer-before-ground-depth.txt',import.meta.url));
const projectionBytes=await readFile(new URL('../../../qa/dense-cpu-next-20261018/projection-before-ground-depth.txt',import.meta.url));
const candidateRendererBytes=await readFile(new URL('../../../qa/dense-cpu-next-20261018/renderer-candidate-ground-depth.txt',import.meta.url));
const candidateProjectionBytes=await readFile(new URL('../../../qa/dense-cpu-next-20261018/projection-candidate-ground-depth.txt',import.meta.url));
assert.equal(digest(rendererBytes),'621492d00a0fe0a50083de3c07237f1e8100939c1ce75b6ac9f1eeab477f80b3','the independent whole renderer oracle is the pinned original bytes');
assert.equal(digest(projectionBytes),'b7f066e335fcd89c7cf67fc523b1e62b3094ca0a61cd438bf21c822edeb42082','the oracle projection cannot import the candidate helper');
assert.equal(digest(candidateRendererBytes),'ba7abd1349c86fbdafb32d2d8d941d78f2a2278aa2611e1ca3b3c3a1e81fa600','the QA-only candidate renderer is pinned independently of production');
assert.equal(digest(candidateProjectionBytes),'64a0b970e58c6c082e4256ecfd47b41b3bc672b1740a7cd11f74f7154bb1dee9','the QA-only candidate projection is pinned independently of production');
const dataModule=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const projectionURL=dataModule(projectionBytes.toString('utf8'));
const candidateProjectionURL=dataModule(candidateProjectionBytes.toString('utf8'));
const rendererURL=new URL('../dist/renderer.js',import.meta.url);
// Only module specifiers change. The whole original class, all its methods and
// its original project implementation execute independently of the candidate.
const rewriteRenderer=(bytes,projectionModule)=>bytes.toString('utf8').replace(/(from\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,(_all,before,specifier,after)=>
  before+(specifier.startsWith('./projection.js')?projectionModule:new URL(specifier,rendererURL).href)+after);
const originalSource=rewriteRenderer(rendererBytes,projectionURL);
const {Renderer:OriginalRenderer}=await import(dataModule(originalSource));
const {Renderer}=await import(dataModule(rewriteRenderer(candidateRendererBytes,candidateProjectionURL)));
const {project:originalProject}=await import(projectionURL);
const EMPTY_MANIFEST={version:1,assets:{},characters:{},bosses:{},enemies:{},environment:{},environmentRules:[]};
const FLOOR=Object.freeze({surface:'already-prepared-original-floor'});
const CORPSE_IMAGE=Object.freeze({surface:'controlled-native-corpse-image'});
const EXPLOSION_IMAGE=Object.freeze({surface:'controlled-original-explosion-image'});

function canvasTrace(){
  const calls=[],stack=[],methods=new Map(),gradientIDs=new WeakMap();let gradients=0;
  let state={globalAlpha:1,globalCompositeOperation:'source-over',fillStyle:'#000',strokeStyle:'#000',lineWidth:1,imageSmoothingEnabled:false,imageSmoothingQuality:'low'};
  const value=input=>gradientIDs.has(input)?['gradient',gradientIDs.get(input)]:Array.isArray(input)?input.map(value):input;
  const record=(name,args=[])=>calls.push([name,...args.map(value)]);
  methods.set('save',()=>{record('save');stack.push({...state});});
  methods.set('restore',()=>{record('restore');assert.ok(stack.length,'native drawing state must balance');state=stack.pop();});
  methods.set('measureText',text=>{record('measureText',[text]);return{width:String(text).length*7};});
  for(const name of ['createRadialGradient','createLinearGradient'])methods.set(name,(...args)=>{
    const gradient={},id=++gradients;gradientIDs.set(gradient,id);record(name,args);
    gradient.addColorStop=(...stops)=>record('gradient.addColorStop',[id,...stops]);return gradient;
  });
  const context=new Proxy({}, {
    get(_target,key){
      if(Object.hasOwn(state,key))return state[key];
      if(!methods.has(key))methods.set(key,(...args)=>record(key,args));
      return methods.get(key);
    },
    set(_target,key,next){record('set:'+String(key),[next]);state[key]=next;return true;},
  });
  return{context,calls,stack,state:()=>Object.fromEntries(Object.entries(state).map(([key,next])=>[key,value(next)])),reset(){calls.length=0;}};
}

function gameState(game){
  return structuredClone({snapshot:game.snapshot(),world:game.world,player:game.player,enemies:game.enemies,corpses:game.corpses,
    particles:game.particles,bullets:game.bullets,hostileProjectiles:game.hostileProjectiles,pickups:game.pickups,
    throwables:game.throwables,fires:game.fires,links:game.links,texts:game.texts,events:game.events,
    random:game.random.getState(),visualRandom:game.visualRandom.getState(),id:game.id});
}

function scene(count,{transport=false,ties=false,cycle=false}={}){
  const game=new Game({seed:98431,stageDuration:1e9});game.enemies=[];game.spawnClock=1e9;
  game.player.x=1200;game.player.y=900;game.player.recoil=0;game.player.invul=0;
  // Real generated world records and real Game actors remain in the scene. A
  // bounded selection isolates painter ordering without repainting a floor.
  game.world.obstacles=game.world.obstacles.slice(0,4);game.world.decor=game.world.decor.slice(0,6);game.world.exit=null;
  const types=['walker','runner','shield','screamer','gas','elite'];
  for(let index=0;index<count;index++){
    const type=cycle&&index===0?'elite':count>3&&index===count-1?'collector':types[index%types.length];
    const actor=game.spawnEnemy(type,400,{x:1200,y:900});assert.ok(actor);
    Object.assign(actor,{x:1080+(index%15)*16,y:800+Math.floor(index/15)*14,angle:index*.37,walkPhase:index*.19,
      attackState:type==='collector'?'windup':'walk',attackTime:.3,hitFlash:index%13===0?.05:0,burn:index%17===0?.2:0,stun:index%19===0?.1:0});
  }
  game.corpses=[{id:70001,type:'walker',x:1175,y:905,time:8,duration:12,angle:.3,seed:4,nativeTest:true},
    {id:70002,type:'gas',x:1260,y:880,time:7,duration:12,angle:2,seed:7}];
  game.particles=[{id:71001,kind:'shockwave',x:1210,y:890,z:22,radius:85,life:.22,maxLife:.32,size:3},
    {id:71002,kind:'weapon-impact',targetId:game.enemies[0]?.id,x:1180,y:890,z:25,weapon:'shotgun',angle:.3,life:.2,maxLife:.3,hits:2},
    {id:71003,kind:'blood',x:1200,y:900,z:14,vx:4,vy:2,life:.12,maxLife:.2,size:3}];
  game.texts=[{id:72001,x:1200,y:900,life:.5,text:'ORIGINAL',color:'#eee'}];
  if(transport)game.expedition={id:NORTH_EXPEDITION.id,step:NORTH_STEPS.findIndex(step=>step.kind==='escort'),hold:12};
  if(ties){
    for(const actor of game.enemies)Object.assign(actor,{x:1200,y:900,hitFlash:0,burn:0,stun:0});
    game.corpses=game.corpses.slice(0,1);Object.assign(game.corpses[0],{x:1190,y:910});
    game.world.obstacles=[{id:73001,kind:'car',x:1150,y:850,w:50,h:50,hp:100,maxHp:100,destroyed:false}];
    game.world.decor=[{id:73002,kind:'lamp',x:1180,y:920}];
    game.particles=game.particles.slice(0,1);
  }
  if(cycle){
    game.world.obstacles=[{id:74001,kind:'building',x:1100,y:800,w:80,h:220,height:100,hp:100,maxHp:100,destroyed:false}];
    game.world.decor=[];game.corpses=[];game.particles=[];game.texts=[];
    Object.assign(game.enemies[0],{x:1195,y:770});
    Object.assign(game.enemies[1],{x:1070,y:920,r:14});
  }
  return game;
}

function fixture(RendererClass,game,{dpr=1,zoom=1,width=1280,height=720}={}){
  const trace=canvasTrace(),order=[],art=new ProductionArt({manifest:EMPTY_MANIFEST,fetchImpl:null,ImageCtor:null});
  const renderer=Object.assign(Object.create(RendererClass.prototype),{
    ctx:trace.context,canvas:{dataset:{}},width,height,dpr,zoom,offsetY:28,lastNow:null,cameraReady:true,camera:{x:1200,y:900},cameraProjection:{x:0,y:0},
    productionArt:art,nativeActorFrames:new WeakMap(),nativeBuildingBlocks:new WeakMap(),nativePlayerShots:new WeakMap(),nativeBulletShots:new WeakMap(),
    nativeParticleShots:new WeakMap(),nativeCorpseEndClocks:new WeakMap(),nativePlayerEndClocks:new WeakMap(),nativeContours:new WeakMap(),
    fireGround:new FireGround(),impactMarks:new ImpactMarks(),fireArt:{status:'failed'},floor:FLOOR,shakeEnabled:true,atmosphereEnabled:false,minimapEnabled:false,motionEnabled:true,
    directionExclusions:[],touchMode:false,healthWarningGradient:null,healthWarningKey:'',
  });
  renderer.visible=()=>true;renderer.makeFloor=()=>{};
  // These boundaries represent already prepared image surfaces; all surrounding
  // Renderer drawing methods and the complete render/sort loop remain real.
  renderer.nativeCorpseFrame=corpse=>corpse.nativeTest?{
    image:CORPSE_IMAGE,frame:{rect:{x:3,y:5,width:42,height:31}},placement:{x:originalProject(corpse.x,corpse.y).x-20,y:originalProject(corpse.x,corpse.y).y-25,width:42,height:31},
  }:null;
  renderer.explosionArt={status:'ready',drawBurst(context,particle){const q=originalProject(particle.x,particle.y,22);context.drawImage(EXPLOSION_IMAGE,0,0,48,48,q.x-24,q.y-48,48,48);return true;}};
  const charge={id:75001,x:1200,y:900,z:22,born:game.time,maxLife:.45};
  renderer.chargeWallFeedback={items:[charge],observe(){},drawItem(context,particle){order.push(['charge',particle.id]);context.fillRect(particle.x,particle.y,3,4);}};
  for(const [name,kind]of [['drawEnemy','enemy'],['drawPlayer','player'],['drawObstacle','obstacle'],['drawDecor','decor'],['drawNativeCorpse','corpse'],['drawExplosionBody','explosion']]){
    const original=RendererClass.prototype[name];
    renderer[name]=function(context,item,...rest){order.push([kind,item.id??'player']);return original.call(this,context,item,...rest);};
  }
  return{renderer,trace,order};
}

function compare(game,options={},expectedCycle=null){
  const baseline=fixture(OriginalRenderer,game,options),candidate=fixture(Renderer,game,options),before=gameState(game);
  for(const now of [1,1+1/60]){
    baseline.trace.reset();candidate.trace.reset();baseline.order.length=0;candidate.order.length=0;
    baseline.renderer.render(game,{fireMode:'auto',targetId:null},now);
    assert.deepEqual(gameState(game),before,'the original renderer does not change Game, world, actors, events or either RNG');
    candidate.renderer.render(game,{fireMode:'auto',targetId:null},now);
    assert.deepEqual(gameState(game),before,'the candidate renderer does not change Game, world, actors, events or either RNG');
    // deepStrictEqual compares numerical leaves with Object.is, including -0;
    // there is no rounding, command filtering, hash-only check or epsilon.
    assert.deepEqual(candidate.trace.calls,baseline.trace.calls,'all Canvas methods, arguments, state setters and gradient stops retain exact order and values');
    assert.deepEqual(candidate.order,baseline.order,'complete actor/corpse/obstacle/decor/transport/explosion order');
    assert.deepEqual(candidate.renderer.depthOrder,baseline.renderer.depthOrder,'painter constraints and cycle fallback');
    assert.deepEqual(candidate.trace.state(),baseline.trace.state(),'caller Canvas state');
    assert.equal(candidate.trace.stack.length,0);assert.equal(baseline.trace.stack.length,0);
    assert.ok(candidate.trace.calls.length>100,'actual drawing methods execute');
    assert.equal(candidate.order.filter(([kind])=>kind==='enemy').length,game.enemies.length,'no dense actor is omitted');
    if(expectedCycle!==null)assert.equal(candidate.renderer.depthOrder.cycle,expectedCycle);
  }
  return candidate;
}

test('60/180 actual Game actors preserve the whole original render trace, depth order and both RNG streams',()=>{
  for(const count of [60,180]){
    const game=scene(count),result=compare(game,{dpr:count===60?1:2,zoom:count===60?.88:1.26});
    assert.ok(result.order.some(([kind])=>kind==='corpse'),'a real native corpse drawing pass is exercised');
    assert.ok(result.order.some(([kind])=>kind==='explosion'),'a prepared explosion joins world depth');
    assert.ok(result.order.some(([kind])=>kind==='decor'));assert.ok(result.order.some(([kind])=>kind==='obstacle'));
  }
});

test('transport, stable equal depths and conflicting building constraints retain original complete painter behavior',()=>{
  const transport=compare(scene(12,{transport:true}),{width:390,height:844,dpr:2,zoom:.8});
  assert.ok(transport.order.some(([kind,id])=>kind==='obstacle'&&id==='expedition-transport'),'the actual expedition transport is inserted and drawn');
  const game=scene(3,{ties:true}),tied=compare(game,{},false);
  assert.deepEqual(tied.order,[['corpse',70001],['charge',75001],['explosion',71001],['obstacle',73001],['decor',73002],
    ...game.enemies.map(actor=>['enemy',actor.id]),['player','player']],'same-depth source order stays stable');
  const cyclic=compare(scene(2,{cycle:true}),{},true);
  assert.ok(cyclic.renderer.depthOrder.constraints>=2,'actual geometry creates conflicting painter dependencies');
  assert.equal(cyclic.order.filter(([kind])=>kind==='enemy').length,2,'cycle fallback keeps every actor');
});
