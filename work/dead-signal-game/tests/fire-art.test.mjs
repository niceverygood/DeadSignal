import {FireGround} from '../dist/fire-ground.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FireArt,FIRE_ATLAS,validateFireAtlas,fireFrame} from '../dist/fire-art.js';
import {groundFireArt as sharedFireArt} from '../dist/fire-art.js?v=0.29.0';
import {Renderer} from '../dist/renderer.js';
import {Game} from '../dist/engine.js';
import {getBoss} from '../dist/campaign.js';
import {unproject} from '../dist/projection.js';
import {warnAdditionalBoss,resolveAdditionalBoss,updateBossHazards} from '../dist/boss-patterns.js';

const sourcePNG=readFileSync(new URL('../dist/assets/vfx/ground-fire-30ee21bfc149.png',import.meta.url));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const fingerprint=game=>JSON.stringify({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,fires:game.fires,hazards:game.bossHazards,random:game.random.getState(),visual:game.visualRandom.getState(),id:game.id});

function imageFixture({fail=false,width=1254,height=1254,pending=false}={}){
  const images=[];let failed=fail;
  const ImageCtor=class{constructor(){images.push(this);this.naturalWidth=width;this.naturalHeight=height;}set src(url){this.url=url;this.finish=()=>failed?this.onerror?.():this.onload?.();if(!pending)queueMicrotask(this.finish);}};
  return{ImageCtor,images,setFailure:value=>{failed=value;}};
}
function context(){
  const images=[],fills=[],ellipses=[],rects=[],stack=[];let path=[],dash=[];
  const c={globalAlpha:.61,fillStyle:'#123456',strokeStyle:'#abcdef',lineWidth:3,imageSmoothingEnabled:false,imageSmoothingQuality:'low'};
  const state=()=>({globalAlpha:c.globalAlpha,fillStyle:c.fillStyle,strokeStyle:c.strokeStyle,lineWidth:c.lineWidth,imageSmoothingEnabled:c.imageSmoothingEnabled,imageSmoothingQuality:c.imageSmoothingQuality,dash:[...dash],stack:stack.length});
  c.save=()=>stack.push(state());c.restore=()=>{const saved=stack.pop();assert.ok(saved);for(const key of ['globalAlpha','fillStyle','strokeStyle','lineWidth','imageSmoothingEnabled','imageSmoothingQuality'])c[key]=saved[key];dash=saved.dash;};
  c.beginPath=()=>{path=[];};c.moveTo=(...args)=>path.push(['moveTo',...args]);c.lineTo=(...args)=>path.push(['lineTo',...args]);c.closePath=()=>path.push(['close']);
  c.ellipse=(...args)=>{ellipses.push(args);path.push(['ellipse',...args]);};c.fill=()=>fills.push({path:structuredClone(path),color:c.fillStyle,alpha:c.globalAlpha});c.stroke=()=>{};c.clip=()=>{};
  c.setLineDash=value=>{dash=[...value];};c.createRadialGradient=()=>({addColorStop(){}});c.fillRect=(...args)=>rects.push(args);
  c.drawImage=(image,...args)=>images.push({image,args,alpha:c.globalAlpha,quality:c.imageSmoothingQuality,smoothing:c.imageSmoothingEnabled});
  return{c,images,fills,ellipses,rects,state,reset(){images.length=fills.length=ellipses.length=rects.length=0;}};
}
const polygonFills=f=>f.fills.filter(fill=>fill.path.filter(command=>command[0]==='lineTo').length>=2);
async function readyArt(){const f=imageFixture(),art=new FireArt({ImageCtor:f.ImageCtor});assert.equal(await art.load(),true);return{...f,art};}
function renderer(art){return Object.assign(Object.create(Renderer.prototype),{fireGround:new FireGround(()=>{const c=context().c;c.setTransform=()=>{};return {getContext:()=>c};}),fireArt:art,motionEnabled:true,visible:()=>true});}

test('the actual untouched RGBA PNG has the recorded digest and its 313/314px sixteen-frame metadata covers it exactly',()=>{
  assert.equal(createHash('sha256').update(sourcePNG).digest('hex'),FIRE_ATLAS.source.sha256);
  assert.equal(sourcePNG.length,1286281);assert.equal(sourcePNG.readUInt32BE(16),1254);assert.equal(sourcePNG.readUInt32BE(20),1254);assert.equal(sourcePNG[25],6);
  assert.equal(FIRE_ATLAS.width*FIRE_ATLAS.height*4,6290064);assert.equal(FIRE_ATLAS.source.kind,'image_gen');assert.equal(FIRE_ATLAS.source.isMeshyGLB,false);
  assert.deepEqual(new Set(FIRE_ATLAS.frames.map(frame=>frame.rect.width)),new Set([313,314]));
  assert.equal(FIRE_ATLAS.frames.reduce((sum,frame)=>sum+frame.rect.width*frame.rect.height,0),1254*1254);
  for(const frame of FIRE_ATLAS.frames){assert.equal(frame.clipped,false);assert.ok(frame.alphaBounds.width>200);assert.ok(frame.alphaBounds.height>150);assert.equal(frame.footPivot.y,frame.alphaBounds.y+frame.alphaBounds.height);}
  assert.ok(Object.isFrozen(FIRE_ATLAS.frames[0].footPivot));
});

test('metadata rejects missing/overlapping/nonfinite/clipped frames and invalid foot pivots without mutating the input',()=>{
  const mutations=[
    value=>value.frames.pop(),value=>{value.frames[1].index=0;},value=>{value.frames[1].rect.x--;},value=>{value.frames[0].rect.width=314;},
    value=>{value.frames[0].clipped=true;},value=>{value.frames[0].alphaBounds.x=-1;},value=>{value.frames[0].alphaBounds.width=Infinity;},
    value=>{value.frames[0].footPivot.x=NaN;},value=>{value.frames[0].footPivot.y--;},value=>{value.source.kind='meshy';},value=>{value.source.isMeshyGLB=true;},value=>{value.fps=0;},
  ];
  for(const mutate of mutations){const value=structuredClone(FIRE_ATLAS);mutate(value);const before=structuredClone(value);assert.throws(()=>validateFireAtlas(value),/invalid-fire-atlas/);assert.deepEqual(value,before);}
});

test('one image load is shared by repeat callers; PNG errors, dimension mismatches and timeouts safely retain explicit retry behavior',async()=>{
  const f=imageFixture({pending:true}),art=new FireArt({ImageCtor:f.ImageCtor});const pending=art.load();assert.equal(art.load(),pending);assert.equal(art.load({retry:true}),pending);assert.equal(f.images.length,1);
  f.images[0].finish();assert.equal(await pending,true);assert.equal(art.status,'ready');assert.equal(art.load({retry:true}),pending);assert.equal(f.images.length,1);
  assert.equal(f.images[0].crossOrigin,'anonymous');assert.equal(f.images[0].decoding,'async');assert.ok(f.images[0].url.endsWith('ground-fire-30ee21bfc149.png'));
  const failed=imageFixture({fail:true}),bad=new FireArt({ImageCtor:failed.ImageCtor});const original=bad.load();assert.equal(await original,false);assert.equal(bad.status,'failed');assert.equal(bad.image,null);
  failed.setFailure(false);assert.equal(bad.load(),original);assert.equal(await bad.load({retry:true}),true);assert.equal(failed.images.length,2);
  const wrong=new FireArt({ImageCtor:imageFixture({width:1253}).ImageCtor});assert.equal(await wrong.load(),false);assert.equal(wrong.error,'fire-atlas-dimensions-mismatch');
  const timeout=new FireArt({ImageCtor:imageFixture({pending:true}).ImageCtor,timeoutMs:5});assert.equal(await timeout.load(),false);assert.equal(timeout.error,'fire-atlas-timeout');
  assert.equal(await new FireArt({ImageCtor:null}).load(),false);
});

test('time-based sixteen-frame playback loops exactly, handles clock boundaries and uses no random or wall clock',()=>{
  const random=Math.random,now=Date.now;
  try{Math.random=()=>{throw Error('fire art cannot use random');};Date.now=()=>{throw Error('fire art cannot use wall clock');};
    for(let index=0;index<16;index++){assert.equal(fireFrame(FIRE_ATLAS,index/16).index,index);assert.equal(fireFrame(FIRE_ATLAS,1+index/16).index,index);}
    assert.equal(fireFrame(FIRE_ATLAS,1/16-1e-7).index,0);assert.equal(fireFrame(FIRE_ATLAS,1/16).index,1);assert.equal(fireFrame(FIRE_ATLAS,0,3).index,3);
    for(const time of [-1,NaN,Infinity])assert.equal(fireFrame(FIRE_ATLAS,time).index,0);
    assert.ok(fireFrame(FIRE_ATLAS,1e300));
  }finally{Math.random=random;Date.now=now;}
});

test('exact variable source rectangles draw nine connected clusters with stable ground pivots and no accumulating image cache',async()=>{
  const f=await readyArt(),trace=context(),before=trace.state(),r=95,x=1200,y=900;
  const footprints=[];
  for(let sample=0;sample<16;sample++){
    trace.reset();assert.equal(f.art.drawClusters(trace.c,{x,y,r,age:sample/16}),true);assert.equal(trace.images.length,9);assert.deepEqual(trace.state(),before);
    const feet=[];
    for(const draw of trace.images){
      const [sx,sy,sw,sh,dx,dy,dw,dh]=draw.args,frame=FIRE_ATLAS.frames.find(frame=>frame.rect.x===sx&&frame.rect.y===sy);
      assert.ok(frame);assert.equal(sw,frame.rect.width);assert.equal(sh,frame.rect.height);const scale=dw/sw;close(dh/sh,scale);
      close(frame.alphaBounds.width*scale,44);assert.ok(frame.alphaBounds.height*scale>=30&&frame.alphaBounds.height*scale<44.5,'the original flame body is readable without growing beyond roughly survivor height');
      feet.push({x:dx+frame.footPivot.x*scale,y:dy+frame.footPivot.y*scale});assert.equal(draw.quality,'high');assert.equal(draw.smoothing,true);
    }
    assert.ok(feet.every((point,index)=>index===0||point.y>=feet[index-1].y));footprints.push(feet);
  }
  for(const feet of footprints)feet.forEach((point,index)=>{close(point.x,footprints[0][index].x);close(point.y,footprints[0][index].y);});
  for(let count=0;count<48;count++)assert.equal(f.art.drawClusters(trace.c,{x,y,r,age:count/16}),true);
  assert.equal(f.images.length,1);assert.equal(f.art.image,f.images[0]);
});

test('larger flame bodies retain nine ground anchors while small fields and explicit widths stay bounded',async()=>{
  const f=await readyArt(),trace=context(),state=trace.state();
  const scenarios=[{r:95,clusterWidth:100,width:44},{r:95,clusterWidth:32,width:32},{r:20,width:9.6}];
  for(const scenario of scenarios){
    trace.reset();assert.equal(f.art.drawClusters(trace.c,{x:1200,y:900,...scenario}),true);assert.equal(trace.images.length,9);
    for(const draw of trace.images){
      const [sx,sy,sw,,dx,dy,dw]=draw.args,frame=FIRE_ATLAS.frames.find(frame=>frame.rect.x===sx&&frame.rect.y===sy),scale=dw/sw;
      close(frame.alphaBounds.width*scale,scenario.width);
      assert.ok(Number.isFinite(dx+frame.footPivot.x*scale)&&Number.isFinite(dy+frame.footPivot.y*scale));
    }
    assert.deepEqual(trace.state(),state);
  }
  assert.equal(f.images.length,1);
});

test('the connected field has one centre and eight evenly spaced ground anchors, dispersed frames and no per-draw trigonometry',async()=>{
  const f=await readyArt(),trace=context(),x=1200,y=900,r=95,sin=Math.sin,cos=Math.cos;
  try{
    Math.sin=()=>{throw Error('cluster offsets must be precomputed');};Math.cos=Math.sin;
    assert.equal(f.art.drawClusters(trace.c,{x,y,r,age:0}),true);
  }finally{Math.sin=sin;Math.cos=cos;}
  assert.equal(trace.images.length,9);
  const feet=trace.images.map(draw=>{
    const [sx,sy,sw,,dx,dy,dw]=draw.args,frame=FIRE_ATLAS.frames.find(frame=>frame.rect.x===sx&&frame.rect.y===sy),scale=dw/sw;
    return unproject(dx+frame.footPivot.x*scale,dy+frame.footPivot.y*scale);
  });
  const centre=feet.filter(point=>Math.hypot(point.x-x,point.y-y)<1e-7),ring=feet.filter(point=>Math.hypot(point.x-x,point.y-y)>1e-7);
  assert.equal(centre.length,1);assert.equal(ring.length,8);
  for(const point of ring)assert.ok(Math.hypot(point.x-x,point.y-y)<r*.7);assert.ok(new Set(ring.map(point=>(Math.hypot(point.x-x,point.y-y)/r).toFixed(2))).size>=5,'irregular fuel patches have unequal radii');
  const angles=ring.map(point=>Math.atan2(point.y-y,point.x-x)).sort((a,b)=>a-b);
  assert.ok(angles.at(-1)-angles[0]>Math.PI,'patches cover both sides of the original fire field');
  assert.equal(new Set(trace.images.map(draw=>draw.args.slice(0,2).join(':'))).size,9,'neighbours use dispersed original frames');
  assert.equal(f.images.length,1);
});

test('actual thrown fire keeps its ground extent and save state while replacing only triangle flames; pause and reduced motion freeze the sprite sample',async()=>{
  const f=await readyArt(),view=renderer(f.art),trace=context(),game=new Game({seed:23011});
  assert.equal(game.throwFire(game.player.x+100,game.player.y),true);assert.equal(game.fires.length,0);game.updateMolotovs(1);const fire=game.fires[0];game.pause();const before=fingerprint(game),state=trace.state();
  view.drawFire(trace.c,fire,10);assert.equal(trace.images.length,11);assert.equal(polygonFills(trace).length,0);assert.deepEqual(trace.state(),state);
  close(trace.images[0].args[2]*150/320,fire.r*Math.sqrt(1.5));close(trace.images[0].args[3]*86.60254/200,fire.r/Math.sqrt(2));
  const first=trace.images.map(draw=>draw.args);trace.reset();view.drawFire(trace.c,fire,1000);assert.deepEqual(trace.images.map(draw=>draw.args),first,'paused game age ignores the render wall-clock argument');
  view.motionEnabled=false;trace.reset();view.drawFire(trace.c,{...fire,time:fire.time-.5},1001);assert.deepEqual(trace.images.map(draw=>draw.args),first);
  assert.equal(fingerprint(game),before);
});

test('actual boss fire warning and damage field geometry stay intact and only its active flame body uses the nine sprites',async()=>{
  const f=await readyArt(),view=renderer(f.art),trace=context(),game=new Game({seed:23012,missionId:'mission-08'});
  const enemy=game.spawnMissionBoss('mid'),boss=getBoss(enemy.bossKey);Object.assign(enemy,{x:1200,y:900,stun:0});Object.assign(game.player,{x:1400,y:900,invul:0});warnAdditionalBoss(game,enemy,boss);
  const hazard=game.bossHazards.find(item=>item.kind==='fire'),before=fingerprint(game);view.drawBossHazard(trace.c,hazard,game.world);
  assert.equal(trace.images.length,0);close(trace.ellipses[0][2],hazard.r*Math.sqrt(1.5));assert.equal(fingerprint(game),before);
  resolveAdditionalBoss(game,enemy,boss);hazard.time=.01;updateBossHazards(game,.02);assert.equal(hazard.phase,'active');const activeBefore=fingerprint(game);
  trace.reset();view.drawBossHazard(trace.c,hazard,game.world);assert.equal(trace.images.length,9);assert.equal(polygonFills(trace).length,0);
  close(trace.ellipses[0][2],hazard.r*Math.sqrt(1.5));close(trace.ellipses[0][3],hazard.r/Math.sqrt(2));assert.equal(fingerprint(game),activeBefore);
});

test('unavailable optional art preserves original fire fallback and a runtime singleton shares one decode across renderers',async()=>{
  const failed=imageFixture({fail:true}),art=new FireArt({ImageCtor:failed.ImageCtor});await art.load();
  const view=renderer(art),trace=context(),fire={x:1200,y:900,r:95,time:5,duration:5};view.drawFire(trace.c,fire,10);
  assert.equal(trace.images.length,2);assert.equal(polygonFills(trace).length,54);assert.equal(failed.images.length,1);
  view.drawFire(trace.c,fire,11);assert.equal(failed.images.length,1,'cosmetic failures do not retry each frame');
  const saved=Object.fromEntries(['ImageCtor','image','status','promise','error'].map(key=>[key,sharedFireArt[key]])),shared=imageFixture({pending:true});
  try{
    Object.assign(sharedFireArt,{ImageCtor:shared.ImageCtor,image:null,status:'idle',promise:null,error:null});
    const a=renderer(null),b=renderer(null);a.drawFire(context().c,fire,10);b.drawFire(context().c,fire,10);assert.equal(shared.images.length,1);
    shared.images[0].finish();assert.equal(await sharedFireArt.load(),true);const one=context(),two=context();a.drawFire(one.c,fire,10);b.drawFire(two.c,fire,10);
    assert.equal(one.images.length,11);assert.equal(two.images.length,11);assert.equal(shared.images.length,1);
  }finally{Object.assign(sharedFireArt,saved);}
});

test('repeated loaded VFX renders preserve actual Game timers/RNG/effects and Canvas state without reading random or wall clock',async()=>{
  const f=await readyArt(),view=renderer(f.art),game=new Game({seed:23013});game.throwFire(game.player.x,game.player.y);game.updateMolotovs(1);game.pause();const before=fingerprint(game),random=Math.random,now=Date.now;
  try{Math.random=()=>{throw Error('VFX cannot use random');};Date.now=()=>{throw Error('VFX cannot read wall clock');};
    for(let index=0;index<20;index++){const trace=context(),state=trace.state();view.drawFire(trace.c,game.fires[0],index*100);assert.equal(trace.images.length,11);assert.deepEqual(trace.state(),state);}
  }finally{Math.random=random;Date.now=now;}
  assert.equal(fingerprint(game),before);assert.equal(f.images.length,1);
});

test('native flame clusters can be restricted to supported surfaces without changing canvas state or substituting fallback polygons',async()=>{const f=await readyArt(),trace=context(),before=trace.state();assert.equal(f.art.drawClusters(trace.c,{x:1200,y:900,r:95,contains:()=>false}),true);assert.equal(trace.images.length,0);assert.deepEqual(trace.state(),before);trace.reset();assert.equal(f.art.drawClusters(trace.c,{x:1200,y:900,r:95,contains:(x,y)=>x<=1200}),true);assert.ok(trace.images.length>0&&trace.images.length<9);assert.deepEqual(trace.state(),before);});
