import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductionArt,extendProductionAssets} from '../dist/production-art.js';
import {Renderer} from '../dist/renderer.js';
import {Game} from '../dist/engine.js';
import {getBoss} from '../dist/campaign.js';

const MiB=1024*1024;
// Validated metadata + Canvas/Image spies measure requests and placement only.
// No fake image file is generated or registered in the production catalog.
function metadata({walking=false,portrait=false}={}){
  const directions=portrait?8:16,samples=walking?8:1,frameSize=256,columns=8,rows=Math.ceil(directions*samples/columns);
  const footPivot={x:128,y:224};
  return{format:'meshy-iso-sprite-atlas',version:1,
    projection:{subjectHeight:68,pixelsPerWorld:2,footPivot,azimuthDegrees:45,elevationDegrees:35.26438968275467,cameraScale:Math.sqrt(3/2),frontYawRadians:0},
    atlas:{width:columns*frameSize,height:rows*frameSize,columns,rows,frameSize,directions,samples,order:'direction-major, sample-minor',transparent:true},
    animation:walking?{name:'Armature|walking_man|baselayer',duration:1.066667,loop:true,samples}:null,
    frames:Array.from({length:directions*samples},(_,index)=>({index,direction:Math.floor(index/samples),sample:index%samples,angle:Math.floor(index/samples)*Math.PI*2/directions,
      rect:{x:index%columns*frameSize,y:Math.floor(index/columns)*frameSize,width:frameSize,height:frameSize},footPivot:{...footPivot},
      alphaBounds:{x:70,y:40,width:110,height:180},coreBounds:{x:80,y:65,width:90,height:110},outlineBounds:{x:68,y:38,width:114,height:184},clipped:false}))};
}
function catalog({portraits=true}={}){
  const manifest={assets:{},characters:{},bosses:{},enemies:{},environment:{},...(portraits?{bossPortraits:{}}:{})};
  for(let i=1;i<=12;i++){
    const prefix=`boss-${String(i).padStart(2,'0')}`,mid=`${prefix}-mid`,final=`${prefix}-final`,walk=`${mid}-walk`,portrait=`${mid}-portrait`;
    for(const id of [walk,final,portrait])manifest.assets[id]={metadata:`${id}/metadata.json`,atlas:`${id}/atlas.png`,bodyAlpha:`${id}/body-alpha.png`};
    manifest.bosses[mid]=i%2?{idle:walk,walk,run:walk}:walk;manifest.bosses[final]=final;
    if(portraits){manifest.bossPortraits[mid]=portrait;manifest.bossPortraits[final]=final;}
  }
  return manifest;
}
function canvasFixture(){
  const calls={images:[],fills:[],texts:[]},stack=[];let matrix=[1,0,0,1,0,0];
  const multiply=(a,b,c,d,e,f)=>{const m=matrix;matrix=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];};
  const raw={globalAlpha:1,fillStyle:'',strokeStyle:'',imageSmoothingEnabled:false,imageSmoothingQuality:'low',
    save(){stack.push({matrix:[...matrix],alpha:this.globalAlpha});},restore(){const old=stack.pop();if(old){matrix=old.matrix;this.globalAlpha=old.alpha;}},
    setTransform(...args){matrix=args;},translate(x,y){multiply(1,0,0,1,x,y);},scale(x,y){multiply(x,0,0,y,0,0);},
    rotate(angle){multiply(Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),0,0);},
    drawImage(image,...args){calls.images.push({id:image.id,args,matrix:[...matrix]});},fill(){calls.fills.push(this.fillStyle);},fillRect(){calls.fills.push(this.fillStyle);},
    fillText(text){calls.texts.push(String(text));},measureText(text){return{width:String(text).length*7};},createRadialGradient(){return{addColorStop(){}};}};
  const context=new Proxy(raw,{get:(object,key)=>key in object?object[key]:()=>{}});
  const canvas={style:{},dataset:{},width:180,height:190,getContext:()=>context,getBoundingClientRect:()=>({width:180,height:190}),parentElement:{getBoundingClientRect:()=>({width:1280,height:720})}};
  return{canvas,context,calls,reset(){for(const values of Object.values(calls))values.length=0;}};
}
function fixture({portraits=true,failId=null,repaint=false}={}){
  const manifest=catalog({portraits}),requests=[],images=[],changes=[],originalChanges=[],f=canvasFixture();
  const forId=id=>metadata({walking:id.endsWith('-walk'),portrait:id.endsWith('-portrait')});
  const fetchImpl=async url=>{requests.push(url);return{ok:true,text:async()=>JSON.stringify(forId(url.split('/').at(-2)))};};
  const ImageCtor=class{set src(url){this.id=url.split('/').at(-2);const source=forId(this.id);this.naturalWidth=source.atlas.width;this.naturalHeight=source.atlas.height;images.push({id:this.id,url,width:this.naturalWidth,height:this.naturalHeight});queueMicrotask(()=>this.id===failId?this.onerror?.():this.onload?.());}};
  const art=new ProductionArt({manifest,baseURL:'https://game.example/assets/production/',fetchImpl,ImageCtor,onChange:change=>originalChanges.push(change)});
  globalThis.window={devicePixelRatio:2};let renderer;
  renderer=new Renderer(f.canvas,{productionArt:art,onProductionChange:change=>{changes.push(change);if(repaint&&change.status==='ready')renderer.nativePortrait(f.canvas,change.id.replace(/-portrait$/,''));}});
  return{...f,renderer,art,manifest,requests,images,changes,originalChanges};
}
const allKeys=()=>Array.from({length:12},(_,i)=>`boss-${String(i+1).padStart(2,'0')}`).flatMap(prefix=>[`${prefix}-mid`,`${prefix}-final`]);
const loaded=art=>Promise.all([...art.records.values()].map(record=>record.promise));
const capture=game=>JSON.stringify({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,random:game.random.getState(),visual:game.visualRandom.getState(),id:game.id});

test('optional portrait catalog is an immutable explicit asset map; invalid extensions are atomic',()=>{
  const base=catalog({portraits:false}),before=structuredClone(base);
  assert.equal(Object.hasOwn(extendProductionAssets(base),'bossPortraits'),false);
  const extended=extendProductionAssets(base,{bossPortraits:{'boss-01-mid':'boss-01-mid-portrait','boss-01-final':'boss-01-final'}});
  assert.equal(extended.bossPortraits['boss-01-mid'],'boss-01-mid-portrait');assert.ok(Object.isFrozen(extended.bossPortraits));assert.deepEqual(base,before);
  assert.deepEqual(extendProductionAssets(extended,{bossPortraits:{'boss-01-mid':null}}).bossPortraits,{'boss-01-final':'boss-01-final'});
  for(const invalid of [null,[],{'boss-01-mid':['boss-01-mid-portrait']},{'boss-01-mid':{idle:'boss-01-mid-portrait'}},{'boss-01-mid':'missing'},{'bad/key':'boss-01-mid-portrait'},JSON.parse('{"__proto__":"boss-01-mid-portrait"}')])
    assert.throws(()=>extendProductionAssets(base,{bossPortraits:invalid}),/invalid-boss-portraits/);
  const art=new ProductionArt({manifest:extended}),previous=art.manifest;
  assert.throws(()=>art.extendManifest({assets:{'boss-01-mid-portrait':null}}),/invalid-boss-portraits/);assert.equal(art.manifest,previous);assert.equal(art.records.size,0);
});

test('opening all 24 portraits fetches only 12 small mid sheets and reused static finals, never walking atlases or masks',async()=>{
  const f=fixture(),game=new Game({seed:19061,missionId:'mission-01'});game.pause();const before=capture(game);
  for(const key of allKeys())f.renderer.nativePortrait(f.canvas,key);
  assert.equal(f.calls.images.length,0,'legacy art stays visible until the requested native PNG becomes ready');
  assert.equal(f.art.records.size,24);assert.ok((await loaded(f.art)).every(Boolean));
  assert.equal(f.requests.length,24);assert.equal(f.images.length,24);
  assert.ok(!f.requests.some(url=>url.includes('-walk/')));assert.ok(!f.images.some(image=>image.url.endsWith('body-alpha.png')));
  assert.equal(f.images.filter(image=>image.id.endsWith('-portrait')).length,12);
  assert.equal(f.images.reduce((sum,image)=>sum+image.width*image.height*4,0),72*MiB,'uncompressed RGBA contract: 24MiB mids + 48MiB reused finals; not 384MiB walking mids');
  f.reset();for(const key of allKeys())assert.equal(f.renderer.nativePortrait(f.canvas,key),true);
  assert.equal(f.calls.images.length,24);assert.equal(f.calls.texts.length,0);assert.equal(f.requests.length,24);assert.equal(f.images.length,24);
  assert.equal(capture(game),before);
});

test('an absent optional catalog causes zero codex fetches but permits an already loaded gameplay boss to be reused',async()=>{
  const f=fixture({portraits:false});for(const key of allKeys())f.renderer.nativePortrait(f.canvas,key);
  assert.equal(f.requests.length,0);assert.equal(f.images.length,0);assert.equal(f.art.records.size,0);assert.ok(f.calls.fills.length>0);
  assert.equal(await f.art.load('boss-01-mid-walk'),true);const requests=f.requests.length,images=f.images.length;f.reset();
  assert.equal(f.renderer.nativePortrait(f.canvas,'boss-01-mid'),true);assert.equal(f.calls.images.length,1);assert.equal(f.calls.images[0].id,'boss-01-mid-walk');
  assert.equal(f.requests.length,requests);assert.equal(f.images.length,images);
});

test('a failed explicit portrait retains legacy art without falling through to a full walking request',async()=>{
  const f=fixture({failId:'boss-01-mid-portrait'});f.renderer.nativePortrait(f.canvas,'boss-01-mid');assert.deepEqual(await loaded(f.art),[false]);
  assert.equal(f.art.status('boss-01-mid-portrait'),'failed');f.reset();
  for(let i=0;i<5;i++)f.renderer.nativePortrait(f.canvas,'boss-01-mid');
  assert.equal(f.calls.images.length,0);assert.ok(f.calls.fills.length>0);assert.equal(f.requests.length,1);assert.equal(f.images.length,1);
  assert.equal(f.art.status('boss-01-mid-walk'),'idle');
});

test('existing loader notifications repaint the small portrait and preserve the prior onChange observer',async()=>{
  const f=fixture({repaint:true});f.renderer.nativePortrait(f.canvas,'boss-01-mid');await loaded(f.art);
  assert.deepEqual(f.originalChanges.map(({id,status})=>[id,status]),[['boss-01-mid-portrait','loading'],['boss-01-mid-portrait','ready']]);
  assert.deepEqual(f.changes.map(({id,status})=>[id,status]),[['boss-01-mid-portrait','loading'],['boss-01-mid-portrait','ready']]);
  assert.equal(f.calls.images.length,1);assert.equal(f.calls.images[0].id,'boss-01-mid-portrait');assert.equal(f.requests.length,1);
});

test('ready small portraits fit their real outline at DPR2 and repeated paints never consume Game RNG or effects',async()=>{
  const f=fixture(),game=new Game({seed:19062,missionId:'mission-01'});game.shoot();game.pause();const before=capture(game);
  f.renderer.nativePortrait(f.canvas,'boss-01-mid');await loaded(f.art);f.reset();
  const random=Math.random,now=Date.now;
  try{Math.random=()=>{throw Error('portrait cannot use random');};Date.now=()=>{throw Error('portrait cannot use wall clock');};
    for(let i=0;i<3;i++)assert.equal(f.renderer.nativePortrait(f.canvas,'boss-01-mid'),true);
  }finally{Math.random=random;Date.now=now;}
  assert.equal(f.calls.images.length,3);assert.deepEqual(f.calls.images[0],f.calls.images[2]);
  const painted=f.calls.images[0],[,,sw,sh,dx,dy,dw,dh]=painted.args,m=painted.matrix;
  for(const [x,y]of [[68,38],[182,222]]){
    const xx=dx+x/sw*dw,yy=dy+y/sh*dh,px=(m[0]*xx+m[2]*yy+m[4])/2,py=(m[1]*xx+m[3]*yy+m[5])/2;
    assert.ok(px>=12-1e-7&&px<=168+1e-7);assert.ok(py>=12-1e-7&&py<=178+1e-7);
  }
  assert.equal(capture(game),before);
  const boss=getBoss('boss-01-mid'),enemy={x:1200,y:930,angle:0,r:boss.stats.r,bossKey:boss.id,walkPhase:0};
  assert.equal(f.renderer.nativeEnemyFrame(enemy,game.time,game,boss),null,'the lightweight codex image never becomes gameplay art');
  assert.equal(f.art.status('boss-01-mid-walk'),'loading','gameplay still requests its own original walking catalog');
  await loaded(f.art);assert.ok(f.renderer.nativeEnemyFrame(enemy,game.time,game,boss));assert.equal(capture(game),before);
});
