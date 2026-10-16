import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductionArt,extendProductionAssets} from '../dist/production-art.js';
import {Game} from '../dist/engine.js';

const REV_A='a'.repeat(64),REV_B='b'.repeat(64),baseURL='https://game.example/assets/production/';
function metadata(tag='old',contours=false){
  const frame={index:0,direction:0,sample:0,angle:0,rect:{x:0,y:0,width:128,height:128},footPivot:{x:64,y:112},alphaBounds:{x:40,y:20,width:48,height:92},coreBounds:{x:44,y:25,width:40,height:65},outlineBounds:{x:38,y:18,width:52,height:96},clipped:false};
  if(contours)frame.bodyIdentificationContour={left:[{x:50,y:20.5},{x:49,y:21.5}],right:[{x:70,y:20.5},{x:71,y:21.5}],top:[{x:50,y:20.5},{x:70,y:20.5}]};
  return{format:'meshy-iso-sprite-atlas',version:1,source:{tag},projection:{subjectHeight:44,pixelsPerWorld:2,footPivot:{x:64,y:112},azimuthDegrees:45,elevationDegrees:35.26438968275467,cameraScale:Math.sqrt(3/2)},atlas:{width:128,height:128,columns:1,rows:1,frameSize:128,directions:1,samples:1,order:'direction-major, sample-minor',transparent:true},frames:[frame],animation:null};
}
function catalog(revision){
  return{assets:{hero:{metadata:'hero/metadata.json',atlas:'hero/atlas.png',bodyAlpha:'hero/body-alpha.png',...(revision===undefined?{}:{revision})}},characters:{survivor:{idle:'hero',walk:'hero',run:'hero'}},bosses:{},enemies:{},environment:{}};
}
function fixture({revision,manifest=catalog(revision),holdMasks=false}={}){
  const cache=new Map(),downloads=[],requests=[],images=[],changes=[];let tag='old',contours=false,maskHeld=holdMasks;
  const art=new ProductionArt({manifest,baseURL,
    fetchImpl:async(url,options)=>{requests.push({url,options});if(!cache.has(url)){cache.set(url,JSON.stringify(metadata(tag,contours)));downloads.push(url);}return{ok:true,text:async()=>cache.get(url)};},
    ImageCtor:class{set src(url){this.url=url;if(!cache.has(url)){cache.set(url,`actual-PNG-response-${tag}`);downloads.push(url);}this.contentTag=cache.get(url);this.naturalWidth=128;this.naturalHeight=128;images.push(this);this.finish=()=>this.onload?.();if(!(maskHeld&&new URL(url).pathname.endsWith('body-alpha.png')))queueMicrotask(this.finish);}},
    onChange:change=>changes.push(change),
  });
  return{art,cache,downloads,requests,images,changes,overwriteServer(next,withContours=false){tag=next;contours=withContours;},setHoldMasks:value=>{maskHeld=value;}};
}
async function until(condition){for(let i=0;i<40&&!condition();i++)await Promise.resolve();assert.ok(condition(),'controlled loader did not reach expected phase');}
const capture=game=>JSON.stringify({snapshot:game.snapshot(),events:game.events,random:game.random.getState(),visual:game.visualRandom.getState(),id:game.id});

test('legacy metadata/atlas/mask URLs remain byte-for-byte unchanged and continue using normal HTTP cache policy',async()=>{
  const f=fixture();assert.equal(await f.art.load('hero'),true);assert.equal(await f.art.loadBodyAlpha('hero'),true);
  assert.deepEqual(f.requests.map(request=>request.url),[`${baseURL}hero/metadata.json`]);
  assert.deepEqual(f.images.map(image=>image.url),[`${baseURL}hero/atlas.png`,`${baseURL}hero/body-alpha.png`]);
  assert.ok(!Object.hasOwn(f.requests[0].options,'cache'));assert.equal(f.requests[0].options.mode,'same-origin');assert.equal(f.requests[0].options.credentials,'same-origin');
  assert.equal(f.downloads.length,3);f.art.releaseUnusedAssets([]);f.overwriteServer('new');
  assert.equal(await f.art.load('hero'),true);assert.equal(await f.art.loadBodyAlpha('hero'),true);
  assert.equal(f.downloads.length,3,'unchanged stable URLs remain cacheable; no wall-clock cache bypass is introduced');
  assert.equal(f.art.get('hero').metadata.source.tag,'old');
});

test('one catalog revision versions metadata, atlas and optional mask with exactly one identical safe query token',async()=>{
  const f=fixture({revision:REV_A});assert.equal(await f.art.load('hero'),true);assert.equal(await f.art.loadBodyAlpha('hero'),true);
  assert.deepEqual([f.requests[0].url,...f.images.map(image=>image.url)],['metadata.json','atlas.png','body-alpha.png'].map(name=>`${baseURL}hero/${name}?rev=${REV_A}`));
  for(const url of [...f.requests.map(request=>request.url),...f.images.map(image=>image.url)]){
    const parsed=new URL(url);assert.deepEqual([...parsed.searchParams],[['rev',REV_A]]);assert.equal(parsed.hash,'');assert.equal(parsed.origin,new URL(baseURL).origin);
  }
  const image=f.art.get('hero').image;assert.equal(image.crossOrigin,'anonymous');assert.equal(image.decoding,'async');
  const requestCount=f.requests.length,imageCount=f.images.length;
  assert.equal(await f.art.load('hero'),true);assert.equal(await f.art.loadBodyAlpha('hero',{retry:true}),true);
  assert.equal(f.requests.length,requestCount);assert.equal(f.images.length,imageCount);
});

test('a changed source revision splits cached metadata and repaired PNG URLs, while unchanged revisions retain their cache identity',async()=>{
  const f=fixture({revision:REV_A});await f.art.load('hero');const old=f.art.get('hero');
  assert.equal(f.art.hasIdentificationContours('hero'),false);assert.equal(old.image.contentTag,'actual-PNG-response-old');
  f.overwriteServer('new',true);f.art.releaseUnusedAssets([]);await f.art.load('hero');
  assert.equal(f.art.get('hero').metadata.source.tag,'old','overwriting a file without changing its declared revision intentionally cannot defeat an HTTP cache');
  const cached=f.art.get('hero');f.art.extendManifest({assets:{hero:{...f.art.manifest.assets.hero,revision:REV_B}}});
  assert.equal(f.art.status('hero'),'idle');assert.equal(cached.controller.signal.aborted,true);
  assert.equal(await f.art.load('hero'),true);const current=f.art.get('hero');
  assert.equal(current.metadata.source.tag,'new');assert.equal(current.image.contentTag,'actual-PNG-response-new');assert.equal(f.art.hasIdentificationContours('hero'),true);
  assert.equal(await f.art.loadBodyAlpha('hero'),true);assert.equal(current.bodyAlpha,null);
  assert.equal(f.requests.filter(request=>new URL(request.url).searchParams.get('rev')===REV_B).length,1);
  assert.equal(f.images.filter(image=>new URL(image.url).searchParams.get('rev')===REV_B).length,1,'new complete contours still avoid a mask decode');
});

test('revision validation rejects malformed catalog values before I/O and an invalid extension preserves loaded records atomically',async()=>{
  for(const revision of [null,undefined,false,0,{},[],REV_A.slice(1),REV_A+'a',REV_A.toUpperCase(),'g'.repeat(64),`${REV_A}&other=1`,`${REV_A}#fragment`]){
    const manifest=catalog();manifest.assets.hero.revision=revision;
    assert.throws(()=>new ProductionArt({manifest}),/invalid-asset-revision/);
    assert.throws(()=>extendProductionAssets(catalog(),{assets:{hero:manifest.assets.hero}}),/invalid-asset-revision/);
  }
  const f=fixture({revision:REV_A});await f.art.load('hero');const previous=f.art.manifest,record=f.art.get('hero'),requests=f.requests.length;
  assert.throws(()=>f.art.extendManifest({assets:{hero:{...previous.assets.hero,revision:'bad?rev=1'}}}),/invalid-asset-revision/);
  assert.equal(f.art.manifest,previous);assert.equal(f.art.get('hero'),record);assert.equal(record.controller.signal.aborted,false);assert.equal(f.requests.length,requests);
});

test('revision queries cannot bypass the existing origin/path/extension guards or supplied query/fragment and malformed encoding checks',async()=>{
  const unsafe=extension=>[
    `https://foreign.example/assets/production/hero/file${extension}`,
    `ftp://game.example/assets/production/hero/file${extension}`,
    `javascript:file${extension}`,`//foreign.example/file${extension}`,
    `https://user:pass@game.example/assets/production/hero/file${extension}`,
    `hero/file${extension}?v=1`,`hero/file${extension}?`,`hero/file${extension}#part`,`hero/file${extension}#`,
    `../file${extension}`,`%2e%2e/file${extension}`,`%2e%2e%2ffile${extension}`,
    `hero/%zzfile${extension}`,`hero/%00file${extension}`,`hero/%5cfile${extension}`,`hero/\\file${extension}`,
  ];
  for(const revision of [undefined,REV_A])for(const field of ['metadata','atlas','bodyAlpha'])for(const path of unsafe(field==='metadata'?'.json':'.png')){
    const manifest=catalog(revision);manifest.assets.hero[field]=path;const f=fixture({manifest});
    if(field==='bodyAlpha'){
      assert.equal(await f.art.load('hero'),true);assert.equal(await f.art.loadBodyAlpha('hero'),false);assert.equal(f.images.length,1);assert.equal(f.art.get('hero').bodyAlphaStatus,'failed');
    }else{
      assert.equal(await f.art.load('hero'),false);assert.equal(f.requests.length,0);assert.equal(f.images.length,0);
    }
  }
});

test('updating a revision invalidates only that bundle; a late old mask cannot replace the new revision or notify ready',async()=>{
  const manifest=catalog(REV_A);manifest.assets.keep={metadata:'keep/metadata.json',atlas:'keep/atlas.png'};
  const f=fixture({manifest,holdMasks:true});await f.art.load('hero');await f.art.load('keep');
  const keep=f.art.get('keep'),old=f.art.get('hero'),pending=f.art.loadBodyAlpha('hero');await until(()=>f.images.some(image=>new URL(image.url).pathname.endsWith('body-alpha.png')));
  const oldMask=f.images.at(-1);f.overwriteServer('new');f.setHoldMasks(false);
  f.art.extendManifest({assets:{hero:{...f.art.manifest.assets.hero,revision:REV_B}}});
  assert.equal(f.art.get('keep'),keep);assert.equal(keep.controller.signal.aborted,false);assert.equal(old.controller.signal.aborted,true);
  await f.art.load('hero');await f.art.loadBodyAlpha('hero');const current=f.art.get('hero'),mask=current.bodyAlpha,changes=f.changes.length;
  assert.equal(new URL(mask.url).searchParams.get('rev'),REV_B);oldMask.finish();assert.equal(await pending,false);
  assert.equal(f.art.get('hero'),current);assert.equal(current.bodyAlpha,mask);assert.equal(f.changes.length,changes);
});

test('content revisions leave validated frame geometry, high-quality drawing and active Game/RNG/checkpoint data unchanged',async()=>{
  const plain=fixture(),versioned=fixture({revision:REV_A}),game=new Game({seed:20031,missionId:'mission-01'});game.shoot();game.pause();const before=capture(game);
  await plain.art.load('hero');await versioned.art.load('hero');
  const options={foot:{x:250,y:900},worldHeight:44,angle:1},a=plain.art.frame('hero',options),b=versioned.art.frame('hero',options);
  assert.deepEqual(a.metadata,b.metadata);assert.deepEqual(a.placement,b.placement);assert.deepEqual(a.frame,b.frame);
  const calls=[],context={globalAlpha:1,save(){},restore(){},drawImage(image,...args){calls.push({args,quality:this.imageSmoothingQuality,enabled:this.imageSmoothingEnabled});}};
  assert.equal(plain.art.drawFrame(context,a),true);assert.equal(versioned.art.drawFrame(context,b),true);
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].quality,'high');assert.equal(calls[0].enabled,true);assert.equal(capture(game),before);
});
