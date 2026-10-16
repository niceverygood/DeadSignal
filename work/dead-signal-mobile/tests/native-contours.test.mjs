import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductionArt, bodyIdentificationContour, validateAtlasMetadata} from '../dist/production-art.js';
import {LaunchGate, productionLaunchPlan, preloadLaunchPlan} from '../dist/launch-gate.js';
import {Game} from '../dist/engine.js';

const baseURL = 'https://game.example/assets/production/';
const clone = value => structuredClone(value);

// Serialization/pixel-input fixture only. These tests create no artwork files.
function metadata({contours = 'all', samples = 2} = {}) {
  const frameSize = 128, directions = 8, columns = 4, footPivot = {x:64,y:112};
  const rgba = new Uint8ClampedArray(frameSize * frameSize * 4);
  for (let y = 20; y < 90; y++) for (let x = 40 + Math.abs(55 - y) % 4; x < 87; x++) rgba[(y * frameSize + x) * 4 + 3] = 255;
  const alphaBounds = {x:40,y:20,width:48,height:92}, coreBounds = {x:44,y:25,width:40,height:65};
  const contour = bodyIdentificationContour(rgba, frameSize, frameSize, alphaBounds, coreBounds);
  const frames = Array.from({length:directions*samples}, (_, index) => ({
    index, direction:Math.floor(index/samples), sample:index%samples,
    angle:Math.floor(index/samples)*Math.PI*2/directions,
    rect:{x:index%columns*frameSize,y:Math.floor(index/columns)*frameSize,width:frameSize,height:frameSize},
    footPivot:{...footPivot}, alphaBounds:{...alphaBounds}, coreBounds:{...coreBounds},
    outlineBounds:{x:38,y:18,width:52,height:96}, clipped:false,
    ...(contours === 'none' || contours === 'partial' && index === directions*samples-1 ? {} : {bodyIdentificationContour:clone(contour)}),
  }));
  return {
    format:'meshy-iso-sprite-atlas',version:1,
    projection:{subjectHeight:44,pixelsPerWorld:2,footPivot,azimuthDegrees:45,elevationDegrees:35.26438968275467,cameraScale:Math.sqrt(3/2)},
    atlas:{width:columns*frameSize,height:Math.ceil(frames.length/columns)*frameSize,columns,rows:Math.ceil(frames.length/columns),frameSize,directions,samples,order:'direction-major, sample-minor',transparent:true},
    frames,animation:samples === 1 ? null : {name:'Walking',duration:1,loop:true,samples},
  };
}

function fixture(value = metadata(), {declaredMask = true, failMask = false, holdMask = false} = {}) {
  const requests = [], images = [], changes = [];
  let source = value, maskFails = failMask, maskHeld = holdMask;
  const manifest = {
    assets:{hero:{metadata:'hero/metadata.json',atlas:'hero/atlas.png',...(declaredMask ? {bodyAlpha:'hero/body-alpha.png'} : {})}},
    characters:{'survivor-shotgun':{idle:'hero',walk:'hero',run:'hero'}},bosses:{},enemies:{},environment:{},
  };
  const art = new ProductionArt({manifest,baseURL,
    fetchImpl:async url => {requests.push(url);return {ok:true,text:async()=>JSON.stringify(source)};},
    ImageCtor:class {
      set src(url) {
        this.url=url;this.naturalWidth=source.atlas.width;this.naturalHeight=source.atlas.height;images.push(this);
        this.finish=()=>url.endsWith('body-alpha.png') && maskFails ? this.onerror?.() : this.onload?.();
        if (!(url.endsWith('body-alpha.png') && maskHeld)) queueMicrotask(this.finish);
      }
      get data() {throw new Error('The loader must not read image pixels');}
      getContext() {throw new Error('The loader must not create/read a mask canvas');}
    },
    onChange:change=>changes.push(change),
  });
  return {art,manifest,requests,images,changes,setMetadata:value=>{source=value;},setMaskFailure:value=>{maskFails=value;},setHoldMask:value=>{maskHeld=value;}};
}

const maskImages = f => f.images.filter(image=>image.url.endsWith('body-alpha.png'));
async function until(condition) {
  for (let count=0;count<20 && !condition();count++) await Promise.resolve();
  assert.ok(condition(), 'expected loader phase did not begin');
}

test('actual alpha-derived contour coordinates survive validation, cloning and deep freezing without changing the input', () => {
  const source=metadata(), before=clone(source), validated=validateAtlasMetadata(source), contour=validated.frames[0].bodyIdentificationContour;
  assert.deepEqual(source,before);assert.notEqual(validated,source);
  assert.equal(contour.left.length,70);assert.deepEqual(contour.top,[{x:43,y:20.5},{x:87,y:20.5}]);
  assert.deepEqual(contour.left.at(-1),{x:42,y:89.5});
  assert.ok(Object.isFrozen(contour));assert.ok(Object.isFrozen(contour.left));assert.ok(Object.isFrozen(contour.left[0]));
  assert.throws(()=>{contour.left[0].x=0;},TypeError);
  for (const mode of ['none','partial']) assert.doesNotThrow(()=>validateAtlasMetadata(metadata({contours:mode})));
  const edges=metadata();
  edges.frames.at(-1).bodyIdentificationContour={left:[{x:0,y:0},{x:0,y:128}],right:[{x:128,y:0},{x:128,y:128}],top:[{x:0,y:0},{x:128,y:0}]};
  assert.doesNotThrow(()=>validateAtlasMetadata(edges),'edges are frame-local coordinates, including the final frame of a larger atlas');
});

test('malformed optional contours reject the entire atlas before any PNG is decoded', async () => {
  const corruptions = [
    frame=>{frame.bodyIdentificationContour=null;},
    frame=>{frame.bodyIdentificationContour=[];},
    frame=>{frame.bodyIdentificationContour.extra=true;},
    frame=>{frame.bodyIdentificationContour.left={};},
    frame=>{frame.bodyIdentificationContour.left=frame.bodyIdentificationContour.left.slice(0,1);frame.bodyIdentificationContour.right=frame.bodyIdentificationContour.right.slice(0,1);},
    frame=>{frame.bodyIdentificationContour.left=Array.from({length:129},(_,i)=>({x:30,y:i}));frame.bodyIdentificationContour.right=Array.from({length:129},(_,i)=>({x:80,y:i}));},
    frame=>{frame.bodyIdentificationContour.right.pop();},
    frame=>{frame.bodyIdentificationContour.left[1].x=NaN;},
    frame=>{frame.bodyIdentificationContour.right[1].y=Infinity;},
    frame=>{frame.bodyIdentificationContour.left[1].x=-.1;},
    frame=>{frame.bodyIdentificationContour.right[1].x=128.1;},
    frame=>{frame.bodyIdentificationContour.left[1].y=-1;},
    frame=>{frame.bodyIdentificationContour.left[1].y=frame.bodyIdentificationContour.right[1].y=129;},
    frame=>{frame.bodyIdentificationContour.left[1].z=0;},
    frame=>{frame.bodyIdentificationContour.left[1].x='43';},
    frame=>{frame.bodyIdentificationContour.right[1].y+=.5;},
    frame=>{frame.bodyIdentificationContour.left[1].y=frame.bodyIdentificationContour.right[1].y=20.5;},
    frame=>{frame.bodyIdentificationContour.left[1].y=frame.bodyIdentificationContour.right[1].y=20;},
    frame=>{frame.bodyIdentificationContour.left[1].x=frame.bodyIdentificationContour.right[1].x;},
    frame=>{frame.bodyIdentificationContour.top.reverse();},
    frame=>{frame.bodyIdentificationContour.top[0]={...frame.bodyIdentificationContour.top[0],x:frame.bodyIdentificationContour.top[0].x+1};},
    frame=>{frame.bodyIdentificationContour.top.push({...frame.bodyIdentificationContour.top[1]});},
  ];
  for (const [index,corrupt] of corruptions.entries()) {
    const source=metadata();corrupt(source.frames.at(-1));const before=clone(source);
    assert.throws(()=>validateAtlasMetadata(source),/invalid-atlas-metadata/,`corruption ${index}`);
    assert.deepEqual(source,before);
    const f=fixture(source);
    assert.equal(await f.art.load('hero'),false);assert.equal(f.art.status('hero'),'failed');
    const record=f.art.records.get('hero');assert.equal(record.metadata,null);assert.equal(record.image,null);
    assert.equal(f.images.length,0);assert.equal(f.art.hasIdentificationContours('hero'),false);
  }
});

test('only complete validated tables bypass the declared mask, with a shared ready promise and no pixel read', async () => {
  const f=fixture(metadata(),{failMask:true});
  assert.equal(f.art.hasIdentificationContours('hero'),false);assert.equal(f.art.hasIdentificationContours('missing'),false);
  assert.equal(await f.art.load('hero'),true);assert.equal(f.art.hasIdentificationContours('hero'),true);
  const first=f.art.loadBodyAlpha('hero');
  assert.equal(f.art.loadBodyAlpha('hero'),first);assert.equal(f.art.loadBodyAlpha('hero',{retry:true}),first);
  assert.equal(await first,true);
  const record=f.art.get('hero');assert.equal(record.bodyAlphaStatus,'ready');assert.equal(record.bodyAlpha,null);
  assert.equal(record.bodyAlphaError,null);assert.equal(f.requests.length,1);assert.equal(f.images.length,1);assert.equal(maskImages(f).length,0);
  assert.equal(f.manifest.assets.hero.bodyAlpha,'hero/body-alpha.png','older-data mask registration is preserved');
  assert.deepEqual(f.changes.map(change=>change.status),['loading','ready','body-alpha-ready']);
  const selected=f.art.frame('hero',{foot:{x:300,y:200},angle:Math.PI,phase:Math.PI});
  assert.equal(selected.frame.direction,4);assert.equal(selected.frame.sample,1);assert.equal(selected.bodyAlpha,null);
  assert.equal(selected.frame.bodyIdentificationContour,record.metadata.frames[9].bodyIdentificationContour);
});

test('complete contours work without a mask registration, while old and partial tables still require the existing mask/retry path', async () => {
  const contourOnly=fixture(metadata(),{declaredMask:false});
  assert.equal(await contourOnly.art.load('hero'),true);assert.equal(await contourOnly.art.loadBodyAlpha('hero'),true);assert.equal(contourOnly.images.length,1);
  for (const mode of ['none','partial']) {
    const f=fixture(metadata({contours:mode}),{failMask:true});
    assert.equal(await f.art.load('hero'),true);assert.equal(f.art.hasIdentificationContours('hero'),false);
    const failed=f.art.loadBodyAlpha('hero');assert.equal(f.art.loadBodyAlpha('hero',{retry:true}),failed);
    assert.equal(await failed,false);assert.equal(f.art.get('hero').bodyAlphaStatus,'failed');
    assert.equal(f.art.get('hero').status,'ready');assert.equal(f.art.get('hero').bodyAlpha,null);assert.equal(maskImages(f).length,1);
    f.setMaskFailure(false);assert.equal(f.art.loadBodyAlpha('hero'),failed,'retry remains explicit after a failure');
    const retry=f.art.loadBodyAlpha('hero',{retry:true});assert.notEqual(retry,failed);assert.equal(await retry,true);
    assert.equal(f.art.get('hero').bodyAlphaStatus,'ready');assert.equal(maskImages(f).length,2);assert.equal(f.art.get('hero').bodyAlpha,maskImages(f)[1]);
    assert.equal(f.art.loadBodyAlpha('hero',{retry:true}),retry,'successful legacy masks are not decoded twice');
  }
  const missing=fixture(metadata({contours:'none'}),{declaredMask:false});
  assert.equal(await missing.art.load('hero'),true);assert.equal(await missing.art.loadBodyAlpha('hero'),false);assert.equal(missing.images.length,1);
});

test('mask failure still blocks launch/restore for partial metadata; complete contours unblock it without changing the saved run or RNG', async () => {
  const game=new Game({seed:19044});game.pause();
  const saved=game.snapshot(),events=clone(game.events),random=game.random.getState(),visual=game.visualRandom.getState();
  const f=fixture(metadata({contours:'partial'}),{failMask:true});
  const renderer={productionArt:f.art,preloadProductionPlayer:async()=>f.art.isCharacterReady('survivor-shotgun')};
  const plan=productionLaunchPlan({manifest:f.manifest,weapon:'shotgun',world:game.world});
  assert.deepEqual(plan.maskIds,['hero']);
  const gate=new LaunchGate();let restores=0;
  const request={load:()=>preloadLaunchPlan(renderer,plan),commit:()=>{restores++;return Game.restore(saved);}};
  assert.equal((await gate.run(request)).status,'failed');assert.equal(restores,0);assert.equal(maskImages(f).length,1);
  // An updated valid metadata file can be reloaded after an explicit cache
  // release. It does not require an unavailable old PNG to become healthy.
  f.art.releaseUnusedAssets([]);f.setMetadata(metadata());
  const result=await gate.run(request);
  assert.equal(result.status,'committed');assert.equal(restores,1);assert.equal(result.value.state,'paused');
  assert.equal(maskImages(f).length,1);assert.equal(f.art.hasIdentificationContours('hero'),true);
  assert.deepEqual(game.snapshot(),saved);assert.deepEqual(game.events,events);
  assert.equal(game.random.getState(),random);assert.equal(game.visualRandom.getState(),visual);
});

test('release/reload drops contour eligibility and never reuses a prior record or its readiness promise', async () => {
  const f=fixture();assert.equal(await f.art.load('hero'),true);
  const old=f.art.get('hero'),promise=f.art.loadBodyAlpha('hero');assert.equal(await promise,true);
  assert.deepEqual(f.art.releaseUnusedAssets([]),['hero']);
  assert.equal(f.art.hasIdentificationContours('hero'),false);assert.equal(f.art.get('hero'),null);
  assert.equal(old.metadata,null);assert.equal(old.bodyAlpha,null);assert.equal(await f.art.loadBodyAlpha('hero'),false);
  f.setMetadata(metadata({contours:'none'}));
  assert.equal(await f.art.load('hero'),true);assert.notEqual(f.art.get('hero'),old);assert.equal(f.art.hasIdentificationContours('hero'),false);
  const reloaded=f.art.loadBodyAlpha('hero');assert.notEqual(reloaded,promise);assert.equal(await reloaded,true);assert.equal(maskImages(f).length,1);
  f.art.releaseUnusedAssets([]);f.setMetadata(metadata());
  assert.equal(await f.art.load('hero'),true);assert.equal(f.art.hasIdentificationContours('hero'),true);
  assert.equal(await f.art.loadBodyAlpha('hero'),true);assert.equal(f.art.get('hero').bodyAlpha,null);assert.equal(maskImages(f).length,1);
});

test('late completion of a released legacy mask cannot overwrite or notify readiness for a reloaded contour record', async () => {
  const f=fixture(metadata({contours:'none'}),{holdMask:true});
  assert.equal(await f.art.load('hero'),true);
  const old=f.art.get('hero'),pending=f.art.loadBodyAlpha('hero');await until(()=>maskImages(f).length===1);
  f.art.releaseUnusedAssets([]);f.setMetadata(metadata());
  assert.equal(await f.art.load('hero'),true);const current=f.art.get('hero');assert.notEqual(current,old);
  const ready=f.art.loadBodyAlpha('hero');assert.equal(await ready,true);
  const changes=f.changes.length;maskImages(f)[0].finish();assert.equal(await pending,false);
  assert.equal(f.changes.length,changes);assert.equal(current.bodyAlpha,null);assert.equal(current.bodyAlphaStatus,'ready');
  assert.equal(f.art.loadBodyAlpha('hero'),ready);assert.equal(f.art.hasIdentificationContours('hero'),true);
});
