import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductionArt,extendProductionAssets} from '../dist/production-art.js';
import {Renderer} from '../dist/renderer.js';
import {Game} from '../dist/engine.js';
import {productionLaunchPlan} from '../dist/launch-gate.js';

const MiB=1024*1024;
const keys=Array.from({length:12},(_,index)=>`boss-${String(index+1).padStart(2,'0')}`).flatMap(prefix=>[`${prefix}-mid`,`${prefix}-final`]);
const regular=key=>key.endsWith('-mid')?`${key}-portrait`:key;
const detail=key=>`${key}-detail`;
const capture=game=>JSON.stringify({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,random:game.random.getState(),visual:game.visualRandom.getState(),id:game.id});

// Only contract fixtures/Canvas spies; no artwork is generated or registered
// in the real production manifest by this draft suite.
function metadata(id){
  const walking=id.endsWith('-walk'),hd=id.endsWith('-detail'),portrait=hd||id.endsWith('-portrait');
  const directions=portrait?8:16,samples=walking?8:1,frameSize=hd?512:256,columns=8,rows=Math.ceil(directions*samples/columns),ratio=frameSize/256;
  const footPivot={x:128*ratio,y:224*ratio};
  return{format:'meshy-iso-sprite-atlas',version:1,
    projection:{subjectHeight:68,pixelsPerWorld:2*ratio,footPivot,azimuthDegrees:45,elevationDegrees:35.26438968275467,cameraScale:Math.sqrt(3/2)},
    atlas:{width:columns*frameSize,height:rows*frameSize,columns,rows,frameSize,directions,samples,order:'direction-major, sample-minor',transparent:true},
    animation:walking?{name:'Walking',duration:1.066667,loop:true,samples}:null,
    frames:Array.from({length:directions*samples},(_,index)=>({index,direction:Math.floor(index/samples),sample:index%samples,angle:Math.floor(index/samples)*Math.PI*2/directions,
      rect:{x:index%columns*frameSize,y:Math.floor(index/columns)*frameSize,width:frameSize,height:frameSize},footPivot:{...footPivot},
      alphaBounds:{x:70*ratio,y:40*ratio,width:110*ratio,height:180*ratio},coreBounds:{x:80*ratio,y:65*ratio,width:90*ratio,height:110*ratio},outlineBounds:{x:68*ratio,y:38*ratio,width:114*ratio,height:184*ratio},clipped:false}))};
}
function catalog({hd=true}={}){
  const manifest={assets:{},characters:{},bosses:{},enemies:{},environment:{},bossPortraits:{},...(hd?{bossDetailPortraits:{}}:{})};
  for(const key of keys){
    const walk=`${key}-walk`,small=regular(key),large=detail(key);
    for(const id of [walk,small,large])manifest.assets[id]={metadata:`${id}/metadata.json`,atlas:`${id}/atlas.png`,bodyAlpha:`${id}/body-alpha.png`};
    manifest.bosses[key]=key.endsWith('-mid')?{idle:walk,walk,run:walk}:key;
    manifest.bossPortraits[key]=small;if(hd)manifest.bossDetailPortraits[key]=large;
  }
  for(const [section,key,id]of [['characters','survivor','player'],['enemies','walker','normal'],['environment','brick','building']]){
    manifest.assets[id]={metadata:`${id}/metadata.json`,atlas:`${id}/atlas.png`};
    manifest[section][key]=section==='characters'?{idle:id,walk:id,run:id}:id;
  }
  return manifest;
}
function canvasFixture(large=false){
  const calls={images:[],fills:[],texts:[]},stack=[];let matrix=[1,0,0,1,0,0];
  const multiply=(a,b,c,d,e,f)=>{const m=matrix;matrix=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];};
  const raw={globalAlpha:1,
    save(){stack.push({matrix:[...matrix],alpha:this.globalAlpha});},restore(){const old=stack.pop();if(old){matrix=old.matrix;this.globalAlpha=old.alpha;}},
    setTransform(...args){matrix=args;},translate(x,y){multiply(1,0,0,1,x,y);},scale(x,y){multiply(x,0,0,y,0,0);},rotate(angle){multiply(Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),0,0);},
    drawImage(image,...args){calls.images.push({id:image.id,args,matrix:[...matrix]});},fill(){calls.fills.push(this.fillStyle);},fillRect(){calls.fills.push(this.fillStyle);},fillText(text){calls.texts.push(String(text));},
    measureText:text=>({width:String(text).length*7}),createRadialGradient:()=>({addColorStop(){}})};
  const context=new Proxy(raw,{get:(object,key)=>key in object?object[key]:()=>{}}),width=large?360:180,height=large?400:190;
  const canvas={style:{},dataset:{},width,height,classList:{contains:value=>large&&value==='large'},getContext:()=>context,getBoundingClientRect:()=>({width,height}),parentElement:{getBoundingClientRect:()=>({width:1280,height:720})}};
  return{canvas,calls,width,height,reset(){for(const list of Object.values(calls))list.length=0;}};
}
function fixture({hd=true,holdHD=false,repaint=false,fail=[]}={}){
  const manifest=catalog({hd}),requests=[],images=[],changes=[],failIds=new Set(fail),thumb=canvasFixture(),large=canvasFixture(true);
  let selected=null,renderer;
  const fetchImpl=async(url,options)=>{const id=url.split('/').at(-2);requests.push({id,url,signal:options.signal});return{ok:true,text:async()=>JSON.stringify(metadata(id))};};
  const ImageCtor=class{set src(url){this.id=url.split('/').at(-2);this.url=url;const source=metadata(this.id);this.naturalWidth=source.atlas.width;this.naturalHeight=source.atlas.height;images.push(this);this.finish=()=>failIds.has(this.id)?this.onerror?.():this.onload?.();if(!(holdHD&&this.id.endsWith('-detail')))queueMicrotask(this.finish);}};
  const art=new ProductionArt({manifest,baseURL:'https://game.example/assets/production/',fetchImpl,ImageCtor});
  globalThis.window={devicePixelRatio:2};
  renderer=new Renderer(thumb.canvas,{productionArt:art,onProductionChange:change=>{changes.push(change);if(repaint&&selected&&change.status==='ready')renderer.nativePortrait(large.canvas,selected);}});
  return{art,renderer,manifest,requests,images,changes,thumb,large,failIds,
    select(key){selected=key;return renderer.nativePortrait(large.canvas,key);},
    complete(id){const image=images.findLast(image=>image.id===id);assert.ok(image,`no pending image ${id}`);image.finish();},
  };
}
const loaded=art=>Promise.all([...art.records.values()].map(record=>record.promise));
const optionalHDRecords=art=>[...art.records].filter(([id])=>id.endsWith('-detail'));
async function until(condition){for(let i=0;i<40&&!condition();i++)await Promise.resolve();assert.ok(condition(),'controlled image loader did not reach its expected phase');}

test('optional detail map validates registered string IDs atomically and leaves both catalog defaults unchanged',()=>{
  const base=catalog({hd:false}),before=structuredClone(base);
  assert.equal(Object.hasOwn(extendProductionAssets(base),'bossDetailPortraits'),false);
  const next=extendProductionAssets(base,{bossDetailPortraits:{[keys[0]]:detail(keys[0])}});
  assert.equal(next.bossDetailPortraits[keys[0]],detail(keys[0]));assert.ok(Object.isFrozen(next.bossDetailPortraits));assert.deepEqual(base,before);
  assert.deepEqual(extendProductionAssets(next,{bossDetailPortraits:{[keys[0]]:null}}).bossDetailPortraits,{});
  for(const invalid of [null,[],{[keys[0]]:[detail(keys[0])]},{[keys[0]]:{idle:detail(keys[0])}},{[keys[0]]:'missing'},{'bad/key':detail(keys[0])},JSON.parse('{"__proto__":"boss-01-mid-detail"}')])
    assert.throws(()=>extendProductionAssets(base,{bossDetailPortraits:invalid}),/invalid-boss-detail-portraits/);
  const art=new ProductionArt({manifest:next}),previous=art.manifest;
  assert.throws(()=>art.extendManifest({assets:{[detail(keys[0])]:null}}),/invalid-boss-detail-portraits/);
  assert.equal(art.manifest,previous);assert.equal(art.records.size,0);assert.deepEqual(next.bossPortraits,base.bossPortraits);
});

test('opening 24 small thumbnails keeps the 72MiB existing path and never requests any HD, walking sheet or mask',async()=>{
  const f=fixture(),game=new Game({seed:20011,missionId:'mission-01'});game.pause();const before=capture(game);
  for(const key of keys)f.renderer.nativePortrait(f.thumb.canvas,key);
  assert.ok((await loaded(f.art)).every(Boolean));
  assert.equal(f.requests.length,24);assert.equal(f.images.length,24);assert.equal(optionalHDRecords(f.art).length,0);
  assert.ok(!f.requests.some(request=>request.id.endsWith('-detail')||request.id.endsWith('-walk')));
  assert.ok(!f.images.some(image=>image.url.endsWith('body-alpha.png')));
  assert.equal(f.images.reduce((sum,image)=>sum+image.naturalWidth*image.naturalHeight*4,0),72*MiB);
  f.thumb.reset();for(const key of keys)f.renderer.nativePortrait(f.thumb.canvas,key);
  assert.equal(f.thumb.calls.images.length,24);assert.equal(f.requests.length,24);
  const baseline=structuredClone(f.manifest);delete baseline.bossDetailPortraits;
  const options={weapon:game.player.weapon,mission:game.mission,world:game.world};
  assert.deepEqual(productionLaunchPlan({...options,manifest:f.manifest}),productionLaunchPlan({...options,manifest:baseline}));
  assert.equal(capture(game),before);
});

test('one selected large canvas lazily loads one HD sheet while painting its ready small fallback and repainting from normal notifications',async()=>{
  const f=fixture({holdHD:true,repaint:true}),key=keys[0];
  f.renderer.nativePortrait(f.thumb.canvas,key);await loaded(f.art);
  f.large.reset();assert.equal(f.select(key),true);await until(()=>f.images.some(image=>image.id===detail(key)));
  assert.equal(f.large.calls.images.at(-1).id,regular(key));assert.equal(f.large.canvas.dataset.productionPortraitAsset,regular(key));
  for(let i=0;i<8;i++)f.select(key);
  assert.equal(optionalHDRecords(f.art).length,1);assert.equal(f.requests.filter(request=>request.id.endsWith('-detail')).length,1);
  assert.equal(f.requests.some(request=>request.id.endsWith('-walk')),false);
  f.complete(detail(key));await loaded(f.art);
  assert.equal(f.large.calls.images.at(-1).id,detail(key));assert.equal(f.large.canvas.dataset.productionPortraitAsset,detail(key));
  assert.equal(f.large.canvas.dataset.productionPortrait,'native');assert.equal(f.images.some(image=>image.url.endsWith('body-alpha.png')),false);
  assert.equal(f.changes.filter(change=>change.id===detail(key)&&change.status==='ready').length,1);
});

test('missing optional detail coverage keeps the existing large portrait and releases the previous optional HD selection',async()=>{
  const noHD=fixture({hd:false}),first=keys[0],second=keys[1];
  noHD.select(first);await loaded(noHD.art);noHD.select(first);
  assert.equal(noHD.large.canvas.dataset.productionPortraitAsset,regular(first));
  assert.deepEqual(noHD.requests.map(request=>request.id),[regular(first)]);
  const partial=fixture();partial.art.extendManifest({bossDetailPortraits:{[second]:null}});
  partial.select(first);await loaded(partial.art);assert.ok(partial.art.get(detail(first)));
  partial.select(second);await loaded(partial.art);partial.select(second);
  assert.equal(optionalHDRecords(partial.art).length,0);assert.equal(partial.art.status(detail(first)),'idle');
  assert.equal(partial.large.canvas.dataset.productionPortraitAsset,regular(second));
  assert.equal(partial.art.status(`${second}-walk`),'idle');
});

test('seven rapid selections evict only earlier HD records and ignore their late PNG completion without evicting gameplay or regular sheets',async()=>{
  const f=fixture({holdHD:true,repaint:true}),selected=keys.slice(0,7);
  for(const key of selected)f.renderer.nativePortrait(f.thumb.canvas,key);
  await Promise.all(['player','normal','building',`${keys[0]}-walk`].map(id=>f.art.load(id)));await loaded(f.art);
  const kept=new Map(f.art.records),old=[];
  for(const key of selected){
    f.select(key);await until(()=>f.images.some(image=>image.id===detail(key)));
    assert.deepEqual(optionalHDRecords(f.art).map(([id])=>id),[detail(key)]);
    old.push({key,record:f.art.get(detail(key))||f.art.records.get(detail(key)),promise:f.art.records.get(detail(key)).promise});
  }
  for(const [id,record]of kept){assert.equal(f.art.records.get(id),record);assert.ok(record.image);assert.equal(record.controller.signal.aborted,false);}
  for(const item of old.slice(0,-1)){
    assert.equal(item.record.status,'released');assert.equal(f.requests.find(request=>request.id===detail(item.key)).signal.aborted,true);
    f.complete(detail(item.key));assert.equal(await item.promise,false);
    assert.equal(f.art.status(detail(item.key)),'idle');
    assert.equal(f.changes.some(change=>change.id===detail(item.key)&&change.status==='ready'),false);
  }
  const last=selected.at(-1);f.complete(detail(last));assert.equal(await old.at(-1).promise,true);
  assert.deepEqual(optionalHDRecords(f.art).map(([id])=>id),[detail(last)]);
  assert.equal(f.large.canvas.dataset.productionPortraitAsset,detail(last));
  const current=f.art.get(detail(last));assert.equal(current.image.naturalWidth*current.image.naturalHeight*4,8*MiB);
  assert.equal(f.images.some(image=>image.url.endsWith('body-alpha.png')),false);
});

test('failed HD remains a nonempty regular portrait, and a failed regular sheet still permits HD or the existing legacy fallback',async()=>{
  const key=keys[0],f=fixture({fail:[detail(key)]});
  f.renderer.nativePortrait(f.thumb.canvas,key);await loaded(f.art);f.select(key);await loaded(f.art);f.large.reset();
  for(let i=0;i<4;i++)assert.equal(f.select(key),true);
  assert.equal(f.large.calls.images.length,4);assert.ok(f.large.calls.images.every(image=>image.id===regular(key)));
  assert.equal(f.large.canvas.dataset.productionPortraitAsset,regular(key));assert.equal(f.requests.filter(request=>request.id===detail(key)).length,1);
  assert.equal(f.art.status(`${key}-walk`),'idle');
  const badSmall=fixture({holdHD:true,fail:[regular(key)]});
  badSmall.renderer.nativePortrait(badSmall.thumb.canvas,key);await loaded(badSmall.art);
  assert.equal(badSmall.select(key),true);await until(()=>badSmall.images.some(image=>image.id===detail(key)));
  assert.equal(badSmall.large.canvas.dataset.productionPortrait,'legacy');assert.ok(badSmall.large.calls.fills.length>0);
  badSmall.complete(detail(key));await loaded(badSmall.art);badSmall.large.reset();assert.equal(badSmall.select(key),true);
  assert.equal(badSmall.large.calls.images.at(-1).id,detail(key));
  const bothBad=fixture({fail:[regular(key),detail(key)]});bothBad.select(key);await loaded(bothBad.art);bothBad.large.reset();
  assert.equal(bothBad.select(key),true);assert.equal(bothBad.large.canvas.dataset.productionPortrait,'legacy');assert.ok(bothBad.large.calls.fills.length>0);
  assert.equal(bothBad.art.status(`${key}-walk`),'idle');
});

test('HD IDs also used by gameplay or regular portraits are protected from detail-only eviction',async()=>{
  const f=fixture(),first=keys[0],second=keys[1],third=keys[2];
  f.art.extendManifest({enemies:{walker:detail(first)},bossPortraits:{[second]:detail(second)}});
  await f.art.load(detail(first));await f.art.load(detail(second));
  const gameplay=f.art.get(detail(first)),small=f.art.get(detail(second));
  f.select(third);await loaded(f.art);
  assert.equal(f.art.get(detail(first)),gameplay);assert.equal(f.art.get(detail(second)),small);
  assert.equal(gameplay.controller.signal.aborted,false);assert.equal(small.controller.signal.aborted,false);
  assert.equal(f.art.get(detail(third)).status,'ready');
});

test('the selected 512px HD outline fits a DPR2 detail canvas while repeated paints preserve Game checkpoint/RNG/effects',async()=>{
  const f=fixture(),key=keys[0],game=new Game({seed:20012,missionId:'mission-01'});game.shoot();game.pause();const before=capture(game);
  f.select(key);await loaded(f.art);f.large.reset();const random=Math.random,now=Date.now;
  try{Math.random=()=>{throw Error('portrait cannot consume random');};Date.now=()=>{throw Error('portrait cannot read wall time');};
    for(let i=0;i<3;i++)assert.equal(f.select(key),true);
  }finally{Math.random=random;Date.now=now;}
  assert.equal(f.large.canvas.width,720);assert.equal(f.large.canvas.height,800);
  assert.equal(f.large.calls.images.length,3);assert.deepEqual(f.large.calls.images[0],f.large.calls.images[2]);
  const painted=f.large.calls.images[0],[,,sw,sh,dx,dy,dw,dh]=painted.args,m=painted.matrix;
  for(const [x,y]of [[136,76],[364,444]]){
    const xx=dx+x/sw*dw,yy=dy+y/sh*dh,px=(m[0]*xx+m[2]*yy+m[4])/2,py=(m[1]*xx+m[3]*yy+m[5])/2;
    assert.ok(px>=12-1e-7&&px<=348+1e-7);assert.ok(py>=12-1e-7&&py<=388+1e-7);
  }
  assert.equal(painted.id,detail(key));assert.equal(f.large.canvas.dataset.productionPortraitAsset,detail(key));
  assert.equal(capture(game),before);assert.equal(optionalHDRecords(f.art).length,1);
});
