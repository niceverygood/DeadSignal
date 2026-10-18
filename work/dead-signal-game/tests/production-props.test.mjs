import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {ProductionArt} from '../dist/production-art.js';
import {project} from '../dist/projection.js';
import {Renderer} from '../dist/renderer.js';
import {PRODUCTION_LURE_ENTRY,DEFAULT_LURE_WORLD_HEIGHT,nativeLureFrame,drawNativeLure} from '../dist/production-props.js';

// Serialized atlas-contract data verifies selection and paint math only. These
// test doubles never produce PNGs or register substitute game artwork.
function metadata(){
  const size=128,directions=16,columns=4;
  return {format:'meshy-iso-sprite-atlas',version:1,
    projection:{subjectHeight:44,pixelsPerWorld:2,footPivot:{x:64,y:110},azimuthDegrees:45,elevationDegrees:35.26438968275467,cameraScale:Math.sqrt(3/2),frontYawRadians:0},
    atlas:{width:512,height:512,columns,rows:4,frameSize:size,directions,samples:1,order:'direction-major, sample-minor',transparent:true,alphaThreshold:8},animation:null,
    frames:Array.from({length:directions},(_,index)=>({index,direction:index,sample:0,angle:index*Math.PI*2/directions,
      rect:{x:index%columns*size,y:Math.floor(index/columns)*size,width:size,height:size},footPivot:{x:64,y:110},
      alphaBounds:{x:40,y:22,width:48,height:90},coreBounds:{x:44,y:28,width:40,height:75},outlineBounds:{x:38,y:20,width:52,height:94},clipped:false}))};
}
function fixture({registered=true,height,failPNG=false,delayed=false}={}){
  const source=metadata(),requests=[];let release;
  const held=delayed?new Promise(resolve=>{release=resolve;}):Promise.resolve();
  const assets={'speaker-atlas':{metadata:'speaker-atlas/metadata.json',atlas:'speaker-atlas/atlas.png',...(height===undefined?{}:{worldHeight:height})},
    'bottle-atlas':{metadata:'bottle-atlas/metadata.json',atlas:'bottle-atlas/atlas.png'}};
  const manifest={assets,characters:{},bosses:{},enemies:{},environment:{...(registered?{[PRODUCTION_LURE_ENTRY]:'speaker-atlas'}:{}),'throwable-molotov':'bottle-atlas'},environmentRules:[]};
  const fetchImpl=async url=>{requests.push(url);await held;return{ok:true,text:async()=>JSON.stringify(source)};};
  const ImageCtor=class{set src(url){this.url=url;this.naturalWidth=source.atlas.width;this.naturalHeight=source.atlas.height;queueMicrotask(()=>failPNG?this.onerror?.():this.onload?.());}};
  const art=new ProductionArt({manifest,baseURL:'https://game.example/assets/production/',fetchImpl,ImageCtor});
  const calls=[],stack=[];
  const context={globalAlpha:.42,imageSmoothingEnabled:false,imageSmoothingQuality:'low',
    save(){stack.push({alpha:this.globalAlpha,smoothing:this.imageSmoothingEnabled,quality:this.imageSmoothingQuality});},
    restore(){const old=stack.pop();this.globalAlpha=old.alpha;this.imageSmoothingEnabled=old.smoothing;this.imageSmoothingQuality=old.quality;},
    drawImage(image,...args){calls.push({image,args,alpha:this.globalAlpha});}};
  return{art,requests,calls,context,release,source};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function gameWithLure(){const game=new Game({seed:19043});assert.equal(game.placeLure(game.player.x+80,game.player.y+35),true);return game;}
const capture=game=>JSON.stringify({checkpoint:game.snapshot(),player:game.player,lure:game.lure,fires:game.fires,bullets:game.bullets,events:game.events,
  particles:game.particles,texts:game.texts,links:game.links,random:game.random.getState(),visual:game.visualRandom.getState(),id:game.id});

test('an unregistered speaker keeps legacy fallback and performs no eager asset request',()=>{
  const f=fixture({registered:false}),game=gameWithLure(),before=capture(game);
  assert.equal(nativeLureFrame(f.art,game.lure),null);assert.equal(drawNativeLure(f.context,f.art,game.lure),false);
  assert.equal(f.calls.length,0);assert.deepEqual(f.requests,[]);assert.equal(capture(game),before);
});

test('only a successfully loaded speaker is selectable; a pending atlas never claims the draw',async()=>{
  const f=fixture({delayed:true}),game=gameWithLure();
  assert.equal(drawNativeLure(f.context,f.art,game.lure),false);
  const loading=f.art.load('speaker-atlas');await Promise.resolve();assert.equal(f.art.status('speaker-atlas'),'loading');
  for(let i=0;i<5;i++)assert.equal(drawNativeLure(f.context,f.art,game.lure),false);
  assert.equal(f.requests.length,1);assert.equal(f.calls.length,0);f.release();assert.equal(await loading,true);
  assert.equal(drawNativeLure(f.context,f.art,game.lure),true);assert.equal(f.calls.length,1);
  assert.equal(f.requests.length,1,'selection is synchronous and never loads the unrelated Molotov');
});

test('a real E lure paints once at its baked ground pivot and preserves the active game and context',async()=>{
  const f=fixture(),game=gameWithLure();await f.art.load('speaker-atlas');const before=capture(game);
  const selected=nativeLureFrame(f.art,game.lure),foot=project(game.lure.x,game.lure.y);
  assert.equal(selected.id,'speaker-atlas');assert.equal(selected.frame.index,0);
  near(selected.placement.foot.x,foot.x);near(selected.placement.foot.y,foot.y);
  near(selected.placement.x+selected.frame.footPivot.x*selected.placement.scale,foot.x);
  near(selected.placement.y+selected.frame.footPivot.y*selected.placement.scale,foot.y);
  near(selected.placement.scale*selected.metadata.projection.pixelsPerWorld*selected.metadata.projection.subjectHeight,DEFAULT_LURE_WORLD_HEIGHT);
  assert.equal(game.lure.radius,550,'the attraction radius stays engine-owned and is not a body footprint');
  assert.equal(drawNativeLure(f.context,f.art,game.lure),true);assert.equal(f.calls.length,1);near(f.calls[0].alpha,.42);
  near(f.context.globalAlpha,.42);assert.equal(f.context.imageSmoothingEnabled,false);assert.equal(f.context.imageSmoothingQuality,'low');
  assert.equal(capture(game),before,'no ID, RNG, event, noise, save or physical state changes during drawing');
});

test('explicit reviewed height and orientation use atlas metadata; pause and checkpoint restore freeze the same body',async()=>{
  const f=fixture({height:22}),game=gameWithLure();await f.art.load('speaker-atlas');game.pause();
  const before=capture(game),frame=nativeLureFrame(f.art,game.lure);
  for(let i=0;i<4;i++){game.tick(.05,{moveX:1,shoot:true,lure:true,molotov:true});assert.equal(drawNativeLure(f.context,f.art,game.lure),true);assert.equal(nativeLureFrame(f.art,game.lure).frame.index,frame.frame.index);}
  assert.equal(capture(game),before);
  const restored=Game.restore(game.snapshot());assert.ok(restored);assert.equal(restored.state,'paused');
  const resumed=nativeLureFrame(f.art,restored.lure);assert.deepEqual(resumed.placement,frame.placement);
  near(resumed.placement.scale*resumed.metadata.projection.pixelsPerWorld*resumed.metadata.projection.subjectHeight,22);
  const angled=Object.freeze({...restored.lure,angle:Math.PI/2}),copy=JSON.stringify(angled);
  assert.equal(nativeLureFrame(f.art,angled).frame.direction,4);assert.equal(JSON.stringify(angled),copy);
});

test('PNG failure and Canvas paint failure both leave the legacy caller responsible for its body',async()=>{
  const failed=fixture({failPNG:true}),game=gameWithLure();assert.equal(await failed.art.load('speaker-atlas'),false);
  assert.equal(drawNativeLure(failed.context,failed.art,game.lure),false);assert.equal(failed.calls.length,0);
  const ready=fixture();assert.equal(await ready.art.load('speaker-atlas'),true);const before=capture(game);
  ready.context.drawImage=()=>{throw new Error('Canvas unavailable');};
  assert.equal(drawNativeLure(ready.context,ready.art,game.lure),false);near(ready.context.globalAlpha,.42);
  assert.equal(capture(game),before);
});

test('Q launches a separate bottle then creates area fire; neither enters the speaker branch',async()=>{
  const f=fixture(),game=gameWithLure();await f.art.load('speaker-atlas');await f.art.load('bottle-atlas');
  assert.equal(game.throwFire(game.player.x+80,game.player.y),true);assert.equal(game.fires.length,0);const projectile=game.throwables[0];assert.ok(projectile);game.updateMolotovs(1);assert.equal(game.fires.length,1);
  game.shoot();assert.ok(game.bullets.length>0);const before=capture(game);
  for(const entity of [projectile,...game.fires,...game.bullets]){assert.equal(nativeLureFrame(f.art,entity),null);assert.equal(drawNativeLure(f.context,f.art,entity),false);}
  assert.equal(f.calls.length,0);assert.equal(capture(game),before);
});

test('expired or invalid lures cannot leave a phantom native object',async()=>{
  const f=fixture(),game=gameWithLure();await f.art.load('speaker-atlas');const original={...game.lure};
  for(const lure of [null,{}, {...original,x:NaN},{...original,y:Infinity},{...original,time:0},{...original,time:-1},{...original,time:9},{...original,duration:0},{...original,radius:0}])
    assert.equal(drawNativeLure(f.context,f.art,lure),false);
  game.enemies=[];game.spawnClock=1e9;for(let i=0;i<180&&game.lure;i++)game.tick(.05,{});
  assert.equal(game.lure,null);assert.equal(drawNativeLure(f.context,f.art,game.lure),false);assert.equal(f.calls.length,0);
});

function lureTrace(){
  const draws=[],stack=[];let shape=null;
  const context={globalAlpha:1,fillStyle:'',strokeStyle:'',lineWidth:1,imageSmoothingEnabled:false,
    save(){stack.push({alpha:this.globalAlpha,fill:this.fillStyle,stroke:this.strokeStyle,width:this.lineWidth});},
    restore(){const state=stack.pop();this.globalAlpha=state.alpha;this.fillStyle=state.fill;this.strokeStyle=state.stroke;this.lineWidth=state.width;},
    beginPath(){shape=null;},ellipse(...args){shape=args;},
    stroke(){draws.push({kind:'stroke',shape,color:this.strokeStyle,width:this.lineWidth,alpha:this.globalAlpha});},
    fill(){draws.push({kind:'fill',shape,color:this.fillStyle,alpha:this.globalAlpha});},
    fillRect(...args){const color=typeof this.fillStyle==='object'?{args:[...this.fillStyle.args],stops:this.fillStyle.stops.map(stop=>[...stop])}:this.fillStyle;draws.push({kind:'rect',args,color,alpha:this.globalAlpha});},
    strokeRect(...args){draws.push({kind:'border',args,color:this.strokeStyle,width:this.lineWidth});},
    createRadialGradient(...args){return{args,stops:[],addColorStop(at,color){this.stops.push([at,color]);}};},
    drawImage(image,...args){draws.push({kind:'image',url:image.url,args,alpha:this.globalAlpha});}};
  return{context,draws};
}
function lureRenderer(art,game){
  // Run the real drawLure, culling and catalog methods without a DOM canvas;
  // these are its normal camera dimensions and actual production loader.
  return Object.assign(Object.create(Renderer.prototype),{productionArt:art,width:1280,height:720,zoom:1,cameraProjection:project(game.player.x,game.player.y)});
}

test('the actual renderer swaps one speaker body while preserving all three sound waves, glow and ground shadow',async()=>{
  const game=gameWithLure(),ready=fixture(),missing=fixture({registered:false});await ready.art.load('speaker-atlas');
  const native=lureTrace(),legacy=lureTrace(),before=capture(game);
  const renderer=lureRenderer(ready.art,game);lureRenderer(missing.art,game).drawLure(legacy.context,game.lure,game.time);
  renderer.drawLure(native.context,game.lure,game.time);
  assert.equal(native.draws.filter(draw=>draw.kind==='image').length,1);
  assert.equal(legacy.draws.filter(draw=>draw.kind==='image').length,0);
  assert.deepEqual(native.draws.filter(draw=>draw.kind==='stroke').slice(0,3),legacy.draws.filter(draw=>draw.kind==='stroke').slice(0,3));
  assert.equal(native.draws.filter(draw=>draw.kind==='stroke').length,3,'only sound waves retain strokes; legacy body/grille are skipped');
  assert.deepEqual(native.draws.filter(draw=>draw.kind==='rect'),legacy.draws.filter(draw=>draw.kind==='rect'&&typeof draw.color==='object'),'the original glow is unchanged');
  assert.deepEqual(native.draws.filter(draw=>draw.kind==='fill'),legacy.draws.filter(draw=>draw.kind==='fill'&&draw.color==='#142a33'),'exactly the existing ground shadow remains');
  assert.equal(native.draws.at(-1).kind,'image','body is drawn after ground effects');
  const first=structuredClone(native.draws);native.draws.length=0;renderer.drawLure(native.context,game.lure,9999);
  assert.deepEqual(native.draws,first,'wall-clock redraws cannot animate or duplicate the stationary body');
  assert.equal(capture(game),before);
});

test('real renderer PNG failure keeps its full legacy speaker; offscreen culling performs no body draw or fetch',async()=>{
  const game=gameWithLure(),failed=fixture({failPNG:true}),missing=fixture({registered:false});assert.equal(await failed.art.load('speaker-atlas'),false);
  const failedTrace=lureTrace(),legacyTrace=lureTrace(),before=capture(game);
  const renderer=lureRenderer(failed.art,game);renderer.drawLure(failedTrace.context,game.lure,game.time);
  lureRenderer(missing.art,game).drawLure(legacyTrace.context,game.lure,game.time);
  assert.deepEqual(failedTrace.draws,legacyTrace.draws);assert.ok(failedTrace.draws.some(draw=>draw.kind==='rect'&&draw.color==='#d29343'));
  const count=failed.requests.length;failedTrace.draws.length=0;renderer.cameraProjection=project(9000,9000);renderer.drawLure(failedTrace.context,game.lure,9999);
  assert.deepEqual(failedTrace.draws,[]);assert.equal(failed.requests.length,count);assert.equal(capture(game),before);
});
