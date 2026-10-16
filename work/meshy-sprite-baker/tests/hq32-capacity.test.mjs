import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {deflateSync} from 'node:zlib';
import {atlasLayout,MAX_ATLAS_SIZE,MAX_ATLAS_PIXELS,MAX_ATLAS_FRAMES} from '../src/atlas.js';
import {normalizeJob,parsePlan} from '../src/batch.js';
import {sampleTime} from '../src/animation.js';
import {saveExport,METADATA_LIMIT} from '../server.mjs';

const readJSON=async url=>JSON.parse(await fs.readFile(url,'utf8'));

test('HQ32 has512 unique256px cells within4096x8192 and the unchanged32MP limit',()=>{
  const layout=atlasLayout({directions:16,samples:32,frameSize:256});
  assert.deepEqual(layout,{total:512,columns:16,rows:32,width:4096,height:8192});
  assert.equal(layout.width*layout.height,MAX_ATLAS_PIXELS);assert.equal(MAX_ATLAS_SIZE,8192);assert.equal(MAX_ATLAS_FRAMES,512);
  const occupied=new Set();
  for(let i=0;i<512;i++){const x=i%layout.columns*256,y=Math.floor(i/layout.columns)*256;assert.ok(x+256<=layout.width&&y+256<=layout.height);occupied.add(x+':'+y);}
  assert.equal(occupied.size,512);
});
test('every previously valid1/4/8/12-sample layout keeps the exact original packing',()=>{
  for(const directions of [8,16])for(const samples of [1,4,8,12])for(const frameSize of [128,256,512]){
    const columns=directions===16?8:4,rows=Math.ceil(directions*samples/columns),width=columns*frameSize,height=rows*frameSize;
    if(width<=8192&&height<=8192&&width*height<=32*1024*1024)assert.deepEqual(atlasLayout({directions,samples,frameSize}),{total:directions*samples,columns,rows,width,height});
  }
});
test('capacity rejects oversize/malformed jobs before rendering while8/16-direction HQ32 fit at256',()=>{
  for(const directions of [8,16])assert.throws(()=>normalizeJob({id:'large',model:'actual.glb',directions,samples:32,frameSize:512}),/32MP/);
  for(const samples of [0,2,31,33,32.5,Infinity])assert.throws(()=>atlasLayout({directions:16,samples,frameSize:256}));
  assert.equal(atlasLayout({directions:8,samples:32,frameSize:256}).height,8192);
  assert.equal(normalizeJob({model:'actual.glb',samples:32}).samples,32);
});
test('four new ready jobs clone the exact real production weapon/rig/camera settings apart from identity and32samples',async()=>{
  const plan=await readJSON(new URL('../batches/hero-hq32-jobs.json',import.meta.url));
  assert.equal(plan.jobs.length,4);assert.equal(new Set(plan.jobs.map(j=>j.exportName)).size,4);
  const originals=[...(await readJSON(new URL('../batches/production-jobs.json',import.meta.url))).jobs,...(await readJSON(new URL('../batches/nailgun-character-jobs.json',import.meta.url))).jobs];
  const settings=job=>{const{id,exportName,samples,...rest}=job;return rest;};
  for(const job of plan.jobs){const id=job.id.replace(/-hq32$/,'');assert.equal(job.exportName,id+'-hq32');assert.equal(job.samples,32);assert.equal(job.ready,true);assert.deepEqual(settings(job),settings(originals.find(j=>j.id===id)));assert.equal(job.weaponReady,true);assert.equal(job.frameSize,256);assert.equal(job.directions,16);await fs.access(new URL('../models/'+job.model,import.meta.url));await fs.access(new URL('../models/'+job.weaponModel,import.meta.url));}
  assert.ok(parsePlan(plan).every(item=>item.status==='pending'));
});
test('32 samples preserve absolute native clip duration with no duplicate looping endpoint',async()=>{
  for(const pose of ['walk','run']){
    const metadata=await readJSON(new URL('../../../outputs/dead-signal/playable/v0.25.0/dist/assets/production/survivor-shotgun-'+pose+'/metadata.json',import.meta.url));
    const times=Array.from({length:32},(_,i)=>sampleTime(metadata.animation,i,32));
    assert.equal(times[0],0);assert.equal(times[31],metadata.animation.duration*31/32);
    assert.equal(new Set(times).size,32);assert.ok(times[31]<metadata.animation.duration);
  }
});
function tinyRGBA(){
  const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return(c^0xffffffff)>>>0;};
  const chunk=(type,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,8+data.length)),8+data.length);return b;};
  const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
  return'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(5))),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
test('export metadata gate accepts512 records above old2MiB and rejects513 or UTF8 above8MiB without HTTP/baking',async t=>{
  // Metadata-cap unit fixture only; this tiny PNG is not a claimed HQ32 bake.
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'hq32-metadata-gate-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const png=tinyRGBA(),metadata={format:'meshy-iso-sprite-atlas',version:1,source:{format:'glb',file:'unit-fixture.glb'},atlas:{width:1,height:1},frames:Array.from({length:512},(_,index)=>({index})),unitTestPadding:'x'.repeat(3*1024*1024)};
  assert.equal(METADATA_LIMIT,8*1024*1024);
  const raw={name:'hq32-unit-metadata',atlas:png,alpha:png,metadata},saved=await saveExport(raw,root);
  assert.equal(JSON.parse(await fs.readFile(path.join(saved.directory,'metadata.json'),'utf8')).frames.length,512);
  await assert.rejects(saveExport({...raw,metadata:{...metadata,frames:[...metadata.frames,{index:512}]}},root),/메타데이터 크기/);
  await assert.rejects(saveExport({...raw,metadata:{...metadata,unitTestPadding:'가'.repeat(Math.ceil(METADATA_LIMIT/3))}},root),/메타데이터 크기/);
});
