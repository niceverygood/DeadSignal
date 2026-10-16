import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ExplosionArt,EXPLOSION_ATLAS,validateExplosionAtlas,explosionFrame} from '../dist/explosion-art.js';
import {explosionArt as sharedExplosionArt} from '../dist/explosion-art.js?v=0.29.0';
import {Renderer} from '../dist/renderer.js';
import {Game} from '../dist/engine.js';
import {project} from '../dist/projection.js';

const sourcePNG=readFileSync(new URL('../dist/assets/vfx/explosion-8dc57e3e099c.png',import.meta.url));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const fingerprint=game=>JSON.stringify({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,random:game.random.getState(),visual:game.visualRandom.getState(),id:game.id,result:game.result});
function imageFixture({fail=false,width=1254,height=1254,pending=false}={}){
  const images=[];let failed=fail;
  const ImageCtor=class{constructor(){images.push(this);this.naturalWidth=width;this.naturalHeight=height;}set src(url){this.url=url;this.finish=()=>failed?this.onerror?.():this.onload?.();if(!pending)queueMicrotask(this.finish);}};
  return{ImageCtor,images,setFailure:value=>{failed=value;}};
}
function context(){
  const images=[],fills=[],ellipses=[],strokes=[],rects=[],stack=[];let path=[];
  const c={globalAlpha:.61,fillStyle:'#123456',strokeStyle:'#abcdef',lineWidth:3,imageSmoothingEnabled:false,imageSmoothingQuality:'low'};
  const keys=Object.keys(c),state=()=>Object.fromEntries([...keys.map(key=>[key,c[key]]),['stack',stack.length]]);
  c.save=()=>stack.push(state());c.restore=()=>{const saved=stack.pop();assert.ok(saved);for(const key of keys)c[key]=saved[key];};
  c.beginPath=()=>{path=[];};c.moveTo=(...args)=>path.push(['moveTo',...args]);c.lineTo=(...args)=>path.push(['lineTo',...args]);c.closePath=()=>path.push(['close']);
  c.ellipse=(...args)=>{ellipses.push(args);path.push(['ellipse',...args]);};c.fill=()=>fills.push({path:structuredClone(path),color:c.fillStyle,alpha:c.globalAlpha});
  c.stroke=()=>strokes.push({path:structuredClone(path),color:c.strokeStyle,width:c.lineWidth,alpha:c.globalAlpha});
  c.createRadialGradient=()=>({addColorStop(){}});c.fillRect=(...args)=>rects.push({args,alpha:c.globalAlpha});
  c.drawImage=(image,...args)=>images.push({image,args,alpha:c.globalAlpha,smoothing:c.imageSmoothingEnabled,quality:c.imageSmoothingQuality});
  return{c,images,fills,ellipses,strokes,rects,state,reset(){images.length=fills.length=ellipses.length=strokes.length=rects.length=0;}};
}
const polygons=trace=>trace.fills.filter(fill=>fill.path.filter(command=>command[0]==='lineTo').length>=2);
async function readyArt(){const f=imageFixture(),art=new ExplosionArt({ImageCtor:f.ImageCtor});assert.equal(await art.load(),true);return{...f,art};}
function renderer(art){return Object.assign(Object.create(Renderer.prototype),{explosionArt:art,visible:()=>true,nativeParticleShots:new WeakMap(),nativePlayerShots:new WeakMap()});}
function gameFixture(){const game=new Game({seed:24041,stageDuration:1e9});game.world.obstacles=[];game.enemies=[];game.spawnClock=1e9;return game;}
const shockwave=()=>({kind:'shockwave',x:1200,y:900,vx:0,vy:0,radius:150,life:.32,maxLife:.32,size:1,color:'#ffc06b'});

test('the exact image_gen PNG and all sixteen uneven rectangles match their recorded bounds and provenance',()=>{
  assert.equal(sourcePNG.length,1941313);assert.equal(createHash('sha256').update(sourcePNG).digest('hex'),EXPLOSION_ATLAS.source.sha256);
  assert.equal(sourcePNG.readUInt32BE(16),1254);assert.equal(sourcePNG.readUInt32BE(20),1254);assert.equal(sourcePNG[25],6);
  assert.equal(EXPLOSION_ATLAS.width*EXPLOSION_ATLAS.height*4,6290064);assert.equal(EXPLOSION_ATLAS.source.kind,'image_gen');assert.equal(EXPLOSION_ATLAS.source.isMeshyGLB,false);
  assert.deepEqual(new Set(EXPLOSION_ATLAS.frames.map(frame=>frame.rect.width)),new Set([313,314]));
  assert.equal(EXPLOSION_ATLAS.frames.reduce((sum,frame)=>sum+frame.rect.width*frame.rect.height,0),1254*1254);
  assert.equal(EXPLOSION_ATLAS.frames[0].alphaBounds.width,94);assert.equal(EXPLOSION_ATLAS.frames[7].alphaBounds.width,306);
  for(const frame of EXPLOSION_ATLAS.frames){assert.equal(frame.clipped,false);assert.ok(frame.borderAlphaMax<8);assert.ok(frame.alphaBounds.x>0&&frame.alphaBounds.y>0);}
  assert.ok(Object.isFrozen(EXPLOSION_ATLAS.frames[0].alphaBounds));
});

test('invalid, overlapping, clipped and nonfinite metadata is rejected without changing its input',()=>{
  const mutations=[value=>value.frames.pop(),value=>{value.frames[1].index=0;},value=>{value.frames[1].rect.x--;},value=>{value.frames[0].rect.width++;},
    value=>{value.frames[0].clipped=true;},value=>{value.frames[0].alphaBounds.x=-1;},value=>{value.frames[0].alphaBounds.y=0;},value=>{value.frames[0].alphaBounds.width=203;},value=>{value.frames[0].alphaBounds.height=Infinity;},value=>{value.frames[0].borderAlphaMax=8;},
    value=>{value.anchor.x=NaN;},value=>{value.anchor.y=1.01;},value=>{value.source.kind='meshy';},value=>{value.source.sha256='invalid';},value=>{value.width=1255;}];
  for(const mutate of mutations){const value=structuredClone(EXPLOSION_ATLAS);mutate(value);const before=structuredClone(value);assert.throws(()=>validateExplosionAtlas(value),/invalid-explosion-atlas/);assert.deepEqual(value,before);}
});

test('one optional image load is deduplicated and failures, dimensions and timeouts retain safe explicit retry',async()=>{
  const f=imageFixture({pending:true}),art=new ExplosionArt({ImageCtor:f.ImageCtor}),pending=art.load();assert.equal(art.load(),pending);assert.equal(art.load({retry:true}),pending);assert.equal(f.images.length,1);
  f.images[0].finish();assert.equal(await pending,true);assert.equal(art.load({retry:true}),pending);assert.equal(f.images.length,1);
  assert.equal(f.images[0].crossOrigin,'anonymous');assert.equal(f.images[0].decoding,'async');assert.ok(f.images[0].url.endsWith('explosion-8dc57e3e099c.png'));
  const failed=imageFixture({fail:true}),bad=new ExplosionArt({ImageCtor:failed.ImageCtor});const original=bad.load();assert.equal(await original,false);assert.equal(bad.image,null);
  failed.setFailure(false);assert.equal(bad.load(),original);assert.equal(await bad.load({retry:true}),true);assert.equal(failed.images.length,2);
  const wrong=new ExplosionArt({ImageCtor:imageFixture({width:1253}).ImageCtor});assert.equal(await wrong.load(),false);assert.equal(wrong.error,'explosion-atlas-dimensions-mismatch');
  const timeout=new ExplosionArt({ImageCtor:imageFixture({pending:true}).ImageCtor,timeoutMs:5});assert.equal(await timeout.load(),false);assert.equal(timeout.error,'explosion-atlas-timeout');
  assert.equal(await new ExplosionArt({ImageCtor:null}).load(),false);
});

test('the existing .32 second life traverses sixteen frames once, clamps at the end and reads no random or wall clock',()=>{
  const random=Math.random,now=Date.now;
  try{Math.random=()=>{throw Error('no random');};Date.now=()=>{throw Error('no wall clock');};
    for(let index=0;index<16;index++)assert.equal(explosionFrame(EXPLOSION_ATLAS,.32*(1-index/16),.32).index,index);
    assert.equal(explosionFrame(EXPLOSION_ATLAS,.32,.32).index,0);assert.equal(explosionFrame(EXPLOSION_ATLAS,.22,.32).index,5);
    for(const life of [0,-.32,-100])assert.equal(explosionFrame(EXPLOSION_ATLAS,life,.32).index,15);
    for(const args of [[Infinity,.32],[NaN,.32],[.2,0],[.2,Infinity]])assert.equal(explosionFrame(EXPLOSION_ATLAS,...args).index,0);
  }finally{Math.random=random;Date.now=now;}
});

test('one fixed whole-cell scale retains the source expansion and common centre without per-frame width normalizing',async()=>{
  const f=await readyArt(),trace=context(),state=trace.state(),particle=shockwave(),scales=[],visibleWidths=[];
  for(let index=0;index<16;index++){
    trace.reset();particle.life=.32*(1-index/16);assert.equal(f.art.drawBurst(trace.c,particle),true);assert.equal(trace.images.length,1);
    const draw=trace.images[0],[sx,sy,sw,sh,dx,dy,dw,dh]=draw.args,frame=EXPLOSION_ATLAS.frames[index],scale=dw/sw,center=project(particle.x,particle.y,20);
    assert.deepEqual([sx,sy,sw,sh],Object.values(frame.rect));close(dh/sh,scale);close(dx+dw*.5,center.x);close(dy+dh*.57,center.y);
    close(scale,180/313.5);scales.push(scale);visibleWidths.push(frame.alphaBounds.width*scale);assert.deepEqual(trace.state(),state);
  }
  assert.ok(visibleWidths[7]>visibleWidths[0]*3,'the fireball actually expands rather than retaining the first flash width');
  assert.ok(visibleWidths[15]<visibleWidths[7]);for(const scale of scales)close(scale,scales[0]);assert.equal(f.images.length,1);
  trace.reset();particle.radius=50;assert.equal(f.art.drawBurst(trace.c,particle),true);close(trace.images[0].args[6]/trace.images[0].args[2],60/313.5);
  for(const invalid of [{...particle,life:0},{...particle,maxLife:0},{...particle,x:NaN},{...particle,radius:-1},{...particle,kind:'smoke'}])assert.equal(f.art.drawBurst(trace.c,invalid),false);
});

test('actual Game.explode retains its particle counts, damage result and short anchor life while its smoke tail continues',async()=>{
  const f=await readyArt(),view=renderer(f.art),trace=context(),game=gameFixture();game.explode(600,600,150,0,false);
  assert.equal(game.particles.length,43);for(const [kind,count] of [['ember',22],['spark',12],['smoke',8],['shockwave',1]])assert.equal(game.particles.filter(p=>p.kind===kind).length,count);
  const anchor=game.particles.find(p=>p.kind==='shockwave'),before=fingerprint(game);view.drawParticle(trace.c,anchor,0,game);assert.equal(trace.images.length,1);assert.equal(fingerprint(game),before);
  let previous=-1;
  for(let tick=0;tick<16;tick++){
    if(game.particles.includes(anchor)){trace.reset();view.drawParticle(trace.c,anchor,tick*100,game);const draw=trace.images[0];assert.ok(draw);const frame=EXPLOSION_ATLAS.frames.find(frame=>frame.rect.x===draw.args[0]&&frame.rect.y===draw.args[1]);assert.ok(frame.index>=previous);previous=frame.index;}
    game.tick(.02,{});
  }
  assert.ok(!game.particles.includes(anchor));assert.equal(f.art.drawBurst(trace.c,anchor),false);assert.equal(game.particles.filter(p=>p.kind==='smoke').length,8);
  for(let tick=0;tick<16;tick++)game.tick(.05,{});assert.equal(game.particles.length,0);assert.equal(f.images.length,1);
  const combat=gameFixture(),enemy=combat.spawnEnemy('walker',0,{x:620,y:600});combat.explode(600,600,150,100,false);
  assert.equal(enemy.dead,true);assert.equal(combat.kills,1);const result=fingerprint(combat),blast=combat.particles.find(p=>p.kind==='shockwave');
  for(let count=0;count<20;count++)view.drawParticle(context().c,blast,count,combat);assert.equal(fingerprint(combat),result,'repainting a real damaging blast must never apply damage or grant kills again');
});

test('only the shockwave centre triangles change; the exact ring, glow, alpha, other particles and Canvas state remain intact',async()=>{
  const f=await readyArt(),native=renderer(f.art),failed=new ExplosionArt({ImageCtor:null});await failed.load();const fallback=renderer(failed);
  for(const life of [.32,.16,.05]){
    const particle={...shockwave(),life},a=context(),b=context(),state=a.state();native.drawParticle(a.c,particle,7,null);fallback.drawParticle(b.c,particle,7,null);
    assert.equal(a.images.length,1);close(a.images[0].alpha,life/.32);assert.deepEqual(a.strokes,b.strokes);assert.deepEqual(a.rects,b.rects);assert.equal(polygons(a).length,0);
    assert.equal(polygons(b).length,life/.32>.35?2:0);assert.deepEqual(a.state(),state);assert.deepEqual(b.state(),state);
  }
  for(const kind of ['smoke','ember','spark']){const particle={...shockwave(),kind,size:3},a=context(),b=context();native.drawParticle(a.c,particle,7,null);fallback.drawParticle(b.c,particle,7,null);assert.equal(a.images.length,0);assert.deepEqual(a.fills,b.fills);assert.deepEqual(a.strokes,b.strokes);}
  const broken=context(),state=broken.state();broken.c.drawImage=()=>{throw Error('draw unavailable');};native.drawParticle(broken.c,shockwave(),7,null);assert.equal(polygons(broken).length,2);assert.deepEqual(broken.state(),state);
});

test('paused and upgrade renders retain their actual frame and checkpoint/RNG; restore keeps the existing empty cosmetic pool',async()=>{
  const f=await readyArt(),view=renderer(f.art),game=gameFixture();game.explode(600,600,150,0,false);game.tick(.06,{});game.pause();const anchor=game.particles.find(p=>p.kind==='shockwave'),before=fingerprint(game),a=context(),b=context();
  view.drawParticle(a.c,anchor,1,game);for(let tick=0;tick<20;tick++)game.tick(.05,{});view.drawParticle(b.c,anchor,1000,game);assert.deepEqual(a.images,b.images);assert.equal(fingerprint(game),before);
  const restored=Game.restore(game.snapshot());assert.equal(restored.particles.length,0);assert.equal(restored.state,'paused');
  game.resume();game.gainXP(game.player.xpNext);game.tick(0,{});assert.equal(game.state,'upgrade');const upgraded=fingerprint(game),trace=context(),random=Math.random,now=Date.now;
  try{Math.random=()=>{throw Error('no random');};Date.now=()=>{throw Error('no wall clock');};for(let count=0;count<20;count++){view.drawParticle(trace.c,anchor,count*1000,game);game.tick(.05,{});}}finally{Math.random=random;Date.now=now;}
  assert.equal(fingerprint(game),upgraded);assert.equal(f.images.length,1);
});

test('real Renderer construction warms one shared image, and later renderers reuse it without new decoding',async()=>{
  const saved=Object.fromEntries(['ImageCtor','image','status','promise','error'].map(key=>[key,sharedExplosionArt[key]])),shared=imageFixture({pending:true});
  const resize=Renderer.prototype.resize,asphalt=Renderer.prototype.loadAsphaltMaterial;
  try{
    Object.assign(sharedExplosionArt,{ImageCtor:shared.ImageCtor,image:null,status:'idle',promise:null,error:null});Renderer.prototype.resize=function(){};Renderer.prototype.loadAsphaltMaterial=function(){};
    const a=new Renderer({getContext:()=>context().c}),b=new Renderer({getContext:()=>context().c});assert.equal(a.explosionArt,sharedExplosionArt);assert.equal(b.explosionArt,sharedExplosionArt);assert.equal(shared.images.length,1);
    shared.images[0].finish();assert.equal(await sharedExplosionArt.load(),true);a.visible=b.visible=()=>true;const one=context(),two=context();a.drawParticle(one.c,shockwave(),0,null);b.drawParticle(two.c,shockwave(),0,null);
    assert.equal(one.images.length,1);assert.equal(two.images.length,1);assert.equal(shared.images.length,1);
  }finally{Object.assign(sharedExplosionArt,saved);Renderer.prototype.resize=resize;Renderer.prototype.loadAsphaltMaterial=asphalt;}
});
