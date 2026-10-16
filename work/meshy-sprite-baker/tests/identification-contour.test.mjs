import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {bodyIdentificationContour} from '../src/atlas.js';
import {bodyIdentificationContour as gameContour} from '../../dead-signal-game/dist/production-art.js';
import {METADATA_LIMIT,saveExport} from '../server.mjs';

test('pre-weapon row contour preserves threshold8, exclusive torso cutoff, half-pixel Y and maxX+1 edges',()=>{
 const rgba=new Uint8ClampedArray(8*8*4),put=(x,y,alpha)=>{rgba[(y*8+x)*4+3]=alpha;};
 put(2,1,7);put(3,1,8);put(1,2,255);put(5,2,8);put(2,4,9);put(0,5,255);
 const before=rgba.slice(),body={x:0,y:1.2,width:8,height:6},core={x:0,y:1.2,width:8,height:3.8};
 const expected={left:[{x:3,y:1.5},{x:1,y:2.5},{x:2,y:4.5}],right:[{x:4,y:1.5},{x:6,y:2.5},{x:3,y:4.5}],top:[{x:3,y:1.5},{x:4,y:1.5}]};
 assert.deepEqual(bodyIdentificationContour(rgba,8,8,body,core),expected);
 assert.deepEqual(bodyIdentificationContour(rgba,8,8,body,core),gameContour(rgba,8,8,body,core));
 assert.deepEqual(rgba,before);assert.equal(bodyIdentificationContour(rgba,7,8,body,core),null);
 assert.equal(bodyIdentificationContour(new Uint8ClampedArray(8*8*4),8,8,body,core),null);
});

test('all544 actual hero frame contours are stored only in enriched copies and proved exact against original JS pixels',async()=>{
 const report=JSON.parse(await fs.readFile(new URL('../../native-contour-derivation-report.json',import.meta.url),'utf8'));
 assert.equal(report.framesVerified,544);assert.equal(report.preservation.allSHA256Unchanged,true);
 assert.equal(report.preservation.pngFiles,36);assert.equal(report.preservation.originalBakerExportFiles,18);
 for(const asset of report.assets){
  const metadata=JSON.parse(await fs.readFile(new URL('../../dead-signal-game/dist/assets/production/'+asset.id+'/metadata.json',import.meta.url),'utf8'));
  assert.equal(metadata.frames.length,asset.frames);assert.ok(metadata.frames.every(f=>f.bodyIdentificationContour?.left.length>1));
  assert.equal(asset.allOriginalJSComparisonsExact,true);assert.equal(asset.allFutureBakerComparisonsExact,true);
  assert.ok(asset.enrichedMetadataBytes<METADATA_LIMIT);
 }
});

test('full actual animated metadata with contours exports below2MiB; UTF8 overflow is rejected even when UTF16 length is smaller',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'native-contour-export-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const base=new URL('../../dead-signal-game/dist/assets/production/survivor-shotgun-walk/',import.meta.url);
 const[metadataBytes,atlas,alpha]=await Promise.all(['metadata.json','atlas.png','body-alpha.png'].map(file=>fs.readFile(new URL(file,base))));
 const metadata=JSON.parse(metadataBytes),uri=bytes=>'data:image/png;base64,'+bytes.toString('base64');
 assert.ok(metadataBytes.length>512000,'The actual complete contour payload exceeds the old metadata cap');
 const raw={name:'actual-contour-validation',metadata,atlas:uri(atlas),alpha:uri(alpha)};
 const saved=await saveExport(raw,directory),savedBytes=await fs.readFile(path.join(saved.directory,'metadata.json'));
 assert.ok(savedBytes.length<=METADATA_LIMIT);assert.deepEqual(JSON.parse(savedBytes),metadata);
 const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(sha(await fs.readFile(path.join(saved.directory,'atlas.png'))),sha(atlas));
 assert.equal(sha(await fs.readFile(path.join(saved.directory,'body-alpha.png'))),sha(alpha));
 const oversized={...metadata,utf8SizeTest:'가'.repeat(Math.ceil(METADATA_LIMIT/3))};
 assert.ok(JSON.stringify(oversized).length<METADATA_LIMIT);assert.ok(Buffer.byteLength(JSON.stringify(oversized),'utf8')>METADATA_LIMIT);
 await assert.rejects(saveExport({...raw,metadata:oversized},directory),/메타데이터 크기/);
});
