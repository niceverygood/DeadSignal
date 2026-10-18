import {ChargeWallFeedback} from '../dist/charge-wall-feedback.js';
import {FireGround} from '../dist/fire-ground.js';
import {ImpactMarks} from '../dist/impact-marks.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../dist/renderer.js';
import {Game} from '../dist/engine.js';
import {ExplosionArt} from '../dist/explosion-art.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const capture=game=>JSON.stringify({snapshot:game.snapshot(),particles:game.particles,texts:game.texts,events:game.events,links:game.links,random:game.random.getState(),visual:game.visualRandom.getState(),id:game.id});
async function readyArt(){
  const images=[];class ImageCtor{constructor(){this.naturalWidth=this.naturalHeight=1254;images.push(this);}set src(value){this.url=value;queueMicrotask(()=>this.onload?.());}}
  const art=new ExplosionArt({ImageCtor});assert.equal(await art.load(),true);return{art,images};
}
function scene(){
  const game=new Game({seed:24051,stageDuration:1e9}),templates=game.world.obstacles.filter(o=>o.kind==='building').slice(0,2);
  game.world.obstacles=[];game.world.decor=[];game.enemies=[];game.spawnClock=1e9;game.player.x=1200;game.player.y=900;
  game.explode(1200,900,150,0,false);for(let tick=0;tick<16;tick++)game.tick(.01,{});
  const back=game.spawnEnemy('walker',0,{x:1450,y:900}),front=game.spawnEnemy('walker',0,{x:1500,y:900});
  game.move(back,1170-back.x,870-back.y);game.move(front,1230-front.x,930-front.y);back.speed=front.speed=0;
  game.world.obstacles=[{...templates[0],x:1000,y:650,w:100,h:100},{...templates[1],x:1180,y:960,w:180,h:180}];
  assert.ok(game.snapshot());return{game,back,front,anchor:game.particles.find(p=>p.kind==='shockwave')};
}
function fixture(art,{width=1280,height=720,dpr=1,zoom=1,throwImage=false}={}){
  const order=[],images=[],polygons=[],strokes=[],glows=[],actors=[],attempts=[],stack=[];let matrix=[1,0,0,1,0,0],path=[];
  const raw={globalAlpha:1,fillStyle:'#000',strokeStyle:'#000',lineWidth:1,imageSmoothingEnabled:false,imageSmoothingQuality:'low'};
  const state=()=>({matrix:[...matrix],alpha:raw.globalAlpha,fill:raw.fillStyle,stroke:raw.strokeStyle,width:raw.lineWidth,smoothing:raw.imageSmoothingEnabled,quality:raw.imageSmoothingQuality});
  const multiply=(a,b,c,d,e,f)=>{const m=matrix;matrix=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];};
  raw.save=()=>stack.push(state());raw.restore=()=>{const saved=stack.pop();assert.ok(saved);matrix=saved.matrix;raw.globalAlpha=saved.alpha;raw.fillStyle=saved.fill;raw.strokeStyle=saved.stroke;raw.lineWidth=saved.width;raw.imageSmoothingEnabled=saved.smoothing;raw.imageSmoothingQuality=saved.quality;};
  raw.setTransform=(...values)=>{matrix=[...values];};raw.transform=multiply;raw.translate=(x,y)=>multiply(1,0,0,1,x,y);raw.scale=(x,y)=>multiply(x,0,0,y,0,0);
  raw.beginPath=()=>{path=[];};raw.moveTo=(...values)=>path.push(['move',...values]);raw.lineTo=(...values)=>path.push(['line',...values]);raw.closePath=()=>path.push(['close']);raw.ellipse=(...values)=>path.push(['ellipse',...values]);
  raw.fill=()=>{if(path.filter(point=>point[0]==='line').length>1)polygons.push({color:raw.fillStyle,alpha:raw.globalAlpha,path:structuredClone(path)});};raw.stroke=()=>strokes.push({path:structuredClone(path),color:raw.strokeStyle,width:raw.lineWidth,alpha:raw.globalAlpha});
  raw.createRadialGradient=()=>({addColorStop(){}});raw.fillRect=(...args)=>glows.push({args,alpha:raw.globalAlpha});
  raw.drawImage=(image,...args)=>{if(image===art.image){attempts.push(image);if(throwImage)throw Error('atlas unavailable');order.push('native');images.push({image,args,matrix:[...matrix],alpha:raw.globalAlpha});}};
  const ctx=new Proxy(raw,{get:(object,key)=>key in object?object[key]:(()=>{})});
  const view=Object.assign(Object.create(Renderer.prototype),{chargeWallFeedback:new ChargeWallFeedback(),fireGround:new FireGround(),impactMarks:new ImpactMarks(),ctx,width,height,dpr,zoom,offsetY:28,lastNow:null,cameraReady:true,camera:{x:1200,y:900},cameraProjection:{x:0,y:0},floor:{},explosionArt:art,shakeEnabled:false,atmosphereEnabled:false,minimapEnabled:false,nativeParticleShots:new WeakMap(),nativePlayerShots:new WeakMap()});
  view.visible=()=>true;view.makeFloor=()=>{};
  for(const method of ['drawBuildingShadow','drawExit','drawCorpse','drawTelegraph','drawBossHazard','drawFire','drawLure','drawPickup','drawDecor','drawBullet','drawHostileProjectile','drawLink','drawPlayerIdentification','drawText','drawCursor','drawHealthWarning','drawObjectiveDirections','drawMinimap'])view[method]=()=>{};
  view.playerIdentificationNeeded=()=>false;
  const actor=label=>{order.push(label);actors.push({label,matrix:[...matrix],alpha:raw.globalAlpha});};
  view.drawObstacle=(c,o)=>actor(o.y<900?'back-roof':'front-roof');view.drawEnemy=(c,e)=>actor(e.y<900?'back-enemy':'front-enemy');view.drawPlayer=()=>actor('player');
  const particle=Renderer.prototype.drawParticle;view.drawParticle=(...args)=>{order.push(`particle:${args[1].kind}`);return particle.apply(view,args);};
  return{view,ctx,order,images,polygons,strokes,glows,actors,attempts,state,reset(){for(const list of [order,images,polygons,strokes,glows,actors,attempts])list.length=0;},stackSize:()=>stack.length};
}

test('a real explosion body sorts between background and foreground geometry, once, while ring/glow remain in the particle pass',async()=>{
  const{art,images}=await readyArt(),{game}=scene(),f=fixture(art),before=capture(game);f.view.render(game,{},.16);
  const position=label=>f.order.indexOf(label);
  assert.equal(f.images.length,1);assert.equal(f.attempts.length,1);assert.ok(position('back-roof')<position('back-enemy'));assert.ok(position('back-enemy')<position('native'));
  assert.ok(position('native')<position('player'));assert.ok(position('native')<position('front-enemy'));assert.ok(position('front-enemy')<position('front-roof'));assert.ok(position('front-roof')<position('particle:shockwave'));
  assert.equal(f.polygons.filter(p=>['#df792f','#ffd475'].includes(p.color)).length,0);assert.ok(f.strokes.some(stroke=>stroke.color==='#ffc06b'));assert.ok(f.glows.length>0);
  assert.equal(images.length,1);assert.equal(f.stackSize(),0);assert.equal(capture(game),before);
});

test('unavailable art keeps the original post-geometry fallback, and a failed depth draw attempts the image only once',async()=>{
  const unavailable=new ExplosionArt({ImageCtor:null});await unavailable.load();const{game}=scene(),fallback=fixture(unavailable);fallback.view.render(game,{},.16);
  assert.equal(fallback.images.length,0);assert.equal(fallback.polygons.filter(p=>['#df792f','#ffd475'].includes(p.color)).length,2);assert.ok(fallback.order.indexOf('front-roof')<fallback.order.indexOf('particle:shockwave'));
  const{art}=await readyArt(),broken=fixture(art,{throwImage:true});broken.view.render(game,{},.16);
  assert.equal(broken.attempts.length,1,'failed native drawing must not retry in the particle pass');assert.equal(broken.images.length,0);assert.equal(broken.polygons.filter(p=>['#df792f','#ffd475'].includes(p.color)).length,2);
  assert.deepEqual(broken.strokes,fallback.strokes);assert.deepEqual(broken.glows,fallback.glows);assert.equal(broken.stackSize(),0);
});

test('camera/zoom/DPR keep the body in the same world transform and equal-depth actors stay above it',async()=>{
  const{art}=await readyArt(),{game}=scene();
  for(const options of [{width:1280,height:720,dpr:1,zoom:1},{width:390,height:844,dpr:2,zoom:.8},{width:1280,height:720,dpr:2,zoom:1.4}]){
    const f=fixture(art,options);f.view.camera={x:1190,y:880};f.view.render(game,{},10);assert.equal(f.images.length,1);
    const player=f.actors.find(actor=>actor.label==='player');assert.deepEqual(f.images[0].matrix,player.matrix);close(f.images[0].alpha,game.particles.find(p=>p.kind==='shockwave').life/.32);
    assert.ok(f.order.indexOf('native')<f.order.indexOf('player'));assert.equal(player.alpha,1,'native life alpha must not leak to later actors');assert.equal(f.stackSize(),0);
  }
});

test('repeated paused/upgrade renders depth-sort every live burst once without changing Game/RNG or allocating another image',async()=>{
  const{art,images}=await readyArt(),{game}=scene();game.explode(1300,980,80,0,false);const f=fixture(art);
  for(const state of ['playing','paused','upgrade']){
    if(state==='paused')game.pause();
    if(state==='upgrade'){game.resume();game.gainXP(game.player.xpNext);game.tick(0,{});}
    assert.equal(game.state,state);assert.ok(game.snapshot());const before=capture(game);
    for(let frame=0;frame<10;frame++){f.reset();f.view.render(game,{},frame);assert.equal(f.images.length,2);assert.equal(f.attempts.length,2);assert.equal(f.stackSize(),0);}
    assert.equal(capture(game),before);
  }
  assert.equal(images.length,1);
});

test('boss wall dust joins world depth before foreground roof and after background geometry',async()=>{const {art}=await readyArt(),{game}=scene(),f=fixture(art),before=capture(game);const p={x:1200,y:900,z:22,born:game.time,maxLife:.45};f.view.chargeWallFeedback={items:[p],observe(){},drawItem(){f.order.push('wall-impact');}};f.view.render(game,{},.16);assert.equal(f.order.filter(x=>x==='wall-impact').length,1);assert.ok(f.order.indexOf('back-roof')<f.order.indexOf('wall-impact'));assert.ok(f.order.indexOf('wall-impact')<f.order.indexOf('front-roof'));assert.equal(capture(game),before);assert.equal(f.stackSize(),0);});
