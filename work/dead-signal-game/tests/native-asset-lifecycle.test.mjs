import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ProductionArt} from '../dist/production-art.js';

// Exercise the actual loader with its real validated metadata and controlled
// fetch/Image completions. No substitute image file or catalog is published.
const source=JSON.parse(await readFile(new URL('../dist/assets/production/survivor-shotgun-idle/metadata.json',import.meta.url),'utf8'));
// Keep exercising the supported legacy PNG-mask lifecycle. The optional baked
// contour bypass is covered by native-contours; original asset files stay intact.
for(const frame of source.frames)delete frame.bodyIdentificationContour;
function fixture({holdImages=false,holdMetadata=false,failImages=false}={}){
  const assets=Object.fromEntries(['keep','drop'].map(id=>[id,{metadata:`${id}/metadata.json`,atlas:`${id}/atlas.png`,bodyAlpha:`${id}/body-alpha.png`}]));
  const manifest={assets,characters:{},bosses:{},enemies:{},environment:{}},images=[],requests=[],changes=[],metadataCompletions=[];
  let hold=holdImages,fail=failImages;
  const response=()=>({ok:true,text:async()=>JSON.stringify(source)});
  const fetchImpl=(url,options)=>{requests.push({url,signal:options.signal});return holdMetadata?new Promise(resolve=>metadataCompletions.push(()=>resolve(response()))):Promise.resolve(response());};
  const ImageCtor=class{
    constructor(){this.naturalWidth=source.atlas.width;this.naturalHeight=source.atlas.height;}
    set src(url){this.url=url;images.push(this);if(!hold)queueMicrotask(()=>fail?this.onerror?.():this.onload?.());}
    finish(){this.onload?.();}
  };
  const art=new ProductionArt({manifest,baseURL:'https://game.example/assets/production/',fetchImpl,ImageCtor,onChange:change=>changes.push(change)});
  return{art,images,requests,changes,metadataCompletions,setHold(value){hold=value;},setFail(value){fail=value;}};
}
async function until(condition){for(let i=0;i<30&&!condition();i++)await Promise.resolve();assert.ok(condition(),'controlled loader reached expected await boundary');}

test('keeping a ready record preserves atlas/mask identity and deduplicated promises',async()=>{
  const f=fixture();assert.equal(await f.art.load('keep'),true);assert.equal(await f.art.loadBodyAlpha('keep'),true);
  assert.equal(await f.art.load('drop'),true);const record=f.art.get('keep'),image=record.image,mask=record.bodyAlpha,promise=record.promise,maskPromise=record.bodyAlphaPromise;
  assert.deepEqual(f.art.releaseUnusedAssets(new Set(['keep'])),['drop']);
  assert.equal(f.art.get('keep'),record);assert.equal(record.image,image);assert.equal(record.bodyAlpha,mask);
  assert.equal(f.art.load('keep'),promise);assert.equal(f.art.loadBodyAlpha('keep'),maskPromise);
  assert.equal(f.requests.length,2);assert.equal(f.images.length,3);assert.equal(f.requests[0].signal.aborted,false);
});

test('released ready image/mask references are cleared and a later load creates a fresh record',async()=>{
  const f=fixture();await f.art.load('drop');await f.art.loadBodyAlpha('drop');const old=f.art.get('drop'),oldImage=old.image,oldMask=old.bodyAlpha;
  assert.deepEqual(f.art.releaseUnusedAssets(['keep']),['drop']);assert.equal(f.art.status('drop'),'idle');assert.equal(f.art.get('drop'),null);
  assert.equal(old.image,null);assert.equal(old.bodyAlpha,null);assert.equal(old.metadata,null);assert.equal(old.status,'released');assert.equal(f.requests[0].signal.aborted,true);
  assert.equal(await f.art.load('drop'),true);assert.equal(await f.art.loadBodyAlpha('drop'),true);
  assert.notEqual(f.art.get('drop'),old);assert.notEqual(f.art.get('drop').image,oldImage);assert.notEqual(f.art.get('drop').bodyAlpha,oldMask);
  assert.equal(f.requests.length,2);assert.equal(f.images.length,4);
});

test('a dropped pending metadata request is aborted and its late response never becomes ready',async()=>{
  const f=fixture({holdMetadata:true}),pending=f.art.load('drop');await until(()=>f.metadataCompletions.length===1);
  assert.deepEqual(f.art.releaseUnusedAssets(['keep']),['drop']);assert.equal(f.requests[0].signal.aborted,true);
  f.metadataCompletions[0]();
  // The fetch spy intentionally ignores abort to exercise the completion guard.
  await until(()=>f.images.length===1);f.images[0].finish();
  assert.equal(await pending,false);assert.equal(f.art.status('drop'),'idle');assert.equal(f.art.records.has('drop'),false);
  assert.equal(f.changes.some(change=>change.id==='drop'&&change.status==='ready'),false);
});

test('a dropped late PNG cannot replace or notify over a new ready record with the same ID',async()=>{
  const f=fixture({holdImages:true}),pending=f.art.load('drop');await until(()=>f.images.length===1);const old=f.art.records.get('drop');
  f.art.releaseUnusedAssets([]);f.setHold(false);assert.equal(await f.art.load('drop'),true);const current=f.art.get('drop');
  assert.notEqual(current,old);const readyBefore=f.changes.filter(change=>change.status==='ready').length;
  f.images[0].finish();assert.equal(await pending,false);assert.equal(f.art.get('drop'),current);assert.equal(old.image,null);
  assert.equal(f.changes.filter(change=>change.status==='ready').length,readyBefore);
});

test('a late body-mask completion is ignored after release and never repopulates a record or emits ready',async()=>{
  const f=fixture();await f.art.load('drop');f.setHold(true);const old=f.art.get('drop'),pending=f.art.loadBodyAlpha('drop');await until(()=>f.images.length===2);
  f.art.releaseUnusedAssets([]);f.images[1].finish();assert.equal(await pending,false);
  assert.equal(f.art.status('drop'),'idle');assert.equal(old.bodyAlpha,null);assert.equal(f.changes.some(change=>change.status==='body-alpha-ready'),false);
  f.setHold(false);assert.equal(await f.art.load('drop'),true);assert.equal(await f.art.loadBodyAlpha('drop'),true);assert.notEqual(f.art.get('drop'),old);
});

test('failed records can be released and reloaded normally',async()=>{
  const f=fixture({failImages:true});assert.equal(await f.art.load('drop'),false);assert.equal(f.art.status('drop'),'failed');const old=f.art.records.get('drop');
  assert.deepEqual(f.art.releaseUnusedAssets([]),['drop']);assert.equal(old.image,null);assert.equal(old.bodyAlpha,null);assert.equal(f.art.status('drop'),'idle');
  f.setFail(false);assert.equal(await f.art.load('drop'),true);assert.notEqual(f.art.get('drop'),old);
});

test('invalid keep collections are atomic and an unloaded registered ID is valid',async()=>{
  const f=fixture();await f.art.load('keep');await f.art.load('drop');await f.art.loadBodyAlpha('drop');
  const records=[...f.art.records],images=records.map(([,record])=>record.image),masks=records.map(([,record])=>record.bodyAlpha),changes=f.changes.length;
  for(const invalid of [undefined,null,'keep',{},42,['keep','unknown'],new Set(['keep','unknown']),['keep',null],['keep',NaN]]){
    assert.throws(()=>f.art.releaseUnusedAssets(invalid),/invalid-asset-keep-ids/);assert.deepEqual([...f.art.records],records);
    for(let i=0;i<records.length;i++){assert.equal(records[i][1].image,images[i]);assert.equal(records[i][1].bodyAlpha,masks[i]);assert.equal(f.requests[i].signal.aborted,false);}
    assert.equal(f.changes.length,changes);
  }
  assert.deepEqual(f.art.releaseUnusedAssets(['keep','keep']),['drop']);assert.deepEqual(f.art.releaseUnusedAssets(['keep','drop']),[]);
});
