import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {preferredReviewBake} from '../build-production-review.mjs';
import {GROUNDED_IDS,preferredRigClip,validateRegistry} from './production-assets/rig-viewer-state.js';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),assets=path.join(root,'outputs/dead-signal/production-assets');
const registry=JSON.parse(await fs.readFile(path.join(here,'production-assets/rig-viewer-registry.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function parseGLB(bytes){const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+jsonLength));return {json,binary:bytes.subarray(28+jsonLength)};}

test('gallery selects the actual registered walk source ahead of its retained action reel and static HD portrait',()=>{
 const poses={idle:'old-actions',walk:'grounded-walk',actions:'old-actions'},sprites=[{id:'hd-portrait',gameFilesMatch:true,sourceFile:'original-hd.glb'},{id:'old-actions',gameFilesMatch:true,sourceFile:'motion-v1.glb'},{id:'grounded-walk',gameFilesMatch:true,sourceFile:'grounded-locomotion-v1.glb'}];
 assert.equal(preferredReviewBake(sprites,poses).sourceFile,'grounded-locomotion-v1.glb');
 sprites[2].gameFilesMatch=false;assert.equal(preferredReviewBake(sprites,poses).id,'old-actions','An unintegrated walk candidate must not displace a verified catalog source');
 assert.equal(preferredReviewBake(sprites,'hd-portrait').id,'hd-portrait');assert.equal(preferredReviewBake([],poses),null);
});
test('viewer prefers grounded walking, the runner grounded running, and the custom final boss walking without dropping any original clip',()=>{
 const clips=['Armature|walking_man|baselayer','DS_Idle','DS_MotionReel','DS_GroundedWalk','DS_GroundedRun'].map(name=>({name})),before=JSON.stringify(clips);
 assert.equal(preferredRigClip(clips,'boss-01-mid').name,'DS_GroundedWalk');assert.equal(preferredRigClip(clips,'enemy-runner').name,'DS_GroundedRun');assert.equal(JSON.stringify(clips),before);
 assert.equal(preferredRigClip([{name:'DS_idle'},{name:'DS_walk'}],'boss-10-final').name,'DS_walk');assert.equal(preferredRigClip([]),null);
});
test('32 viewer records include precisely 19 grounded humanoids with weighted skins, original textures and exactly retained old clips',async()=>{
 assert.equal(validateRegistry(registry).length,32);assert.equal(GROUNDED_IDS.length,19);assert.equal(registry.groundedLocomotionModels,19);
 for(const record of registry.models){
  const bytes=await fs.readFile(path.join(assets,record.model));assert.equal(hash(bytes),record.sha256,record.id);const {json:current,binary}=parseGLB(bytes);assert.ok(current.skins.length);assert.ok(current.images.length);assert.equal(current.animations.length,record.clips.length);
  if(!GROUNDED_IDS.includes(record.id)){assert.ok(record.model.endsWith(record.id+'-motion-v1/model.glb'));continue;}
  assert.ok(record.model.endsWith(record.id+'-grounded-locomotion-v1/model.glb'));
  const oldBytes=await fs.readFile(path.join(assets,'models',record.id+'-motion-v1/model.glb')),old=parseGLB(oldBytes),provenance=JSON.parse(await fs.readFile(path.join(assets,record.provenance),'utf8'));
  assert.equal(hash(oldBytes),provenance.sourceSHA256);assert.equal(hash(bytes),provenance.sha256);
  for(const field of['meshes','skins','nodes','materials','images','textures','samplers','scenes','scene'])assert.deepEqual(current[field],old.json[field],record.id+' '+field);
  assert.ok(binary.subarray(0,old.binary.length).equals(old.binary),record.id+' original binary prefix');assert.deepEqual(current.bufferViews.slice(0,old.json.bufferViews.length),old.json.bufferViews);assert.deepEqual(current.accessors.slice(0,old.json.accessors.length),old.json.accessors);
  assert.deepEqual(current.animations.slice(0,old.json.animations.length),old.json.animations);assert.ok(record.clips.some(c=>c.name==='DS_GroundedWalk'));assert.ok(record.clips.some(c=>c.name==='DS_GroundedRun'));
 }
});
test('viewer rejects swapped grounded paths, mismatched provenance, ungrounded finals and made-up default clips',()=>{
 for(const mutate of[
  r=>{r.models.find(m=>m.id==='boss-01-mid').model='models/boss-02-mid-grounded-locomotion-v1/model.glb';},
  r=>{r.models.find(m=>m.id==='boss-01-mid').provenance='models/boss-02-mid-grounded-locomotion-v1/grounding-provenance.json';},
  r=>{r.models.find(m=>m.id==='boss-01-final').model='models/boss-01-final-grounded-locomotion-v1/model.glb';},
  r=>{r.models[0].preferredClip='Imaginary_Reload';},
  r=>{r.models.find(m=>m.id==='boss-01-mid').clips=r.models.find(m=>m.id==='boss-01-mid').clips.filter(c=>c.name!=='DS_GroundedWalk');}
 ]){const invalid=structuredClone(registry);mutate(invalid);assert.throws(()=>validateRegistry(invalid));}
});
test('retained 33-character / 161-binding QA has its original v027 evidence bytes and is never rewritten as v029 approval',async()=>{
 const current=await fs.readFile(path.join(here,'production-assets/review-audit.json')),original=await fs.readFile(path.join(here,'before-shared-apply/review-audit.json'));
 const audit=JSON.parse(current),baseline=JSON.parse(original),source=await fs.readFile(path.join(assets,audit.smokeVerification.evidence.href));assert.deepEqual(audit.smokeVerification,baseline.smokeVerification);assert.deepEqual(audit.comprehensiveArtistApproval,baseline.comprehensiveArtistApproval);for(const actor of audit.assets)assert.deepEqual(actor.smokeVerification,baseline.assets.find(a=>a.id===actor.id).smokeVerification);assert.equal(hash(source),audit.smokeVerification.evidence.sha256);assert.equal(audit.smokeVerification.counts.gameVariants,33);assert.equal(audit.smokeVerification.counts.stateBindings,161);assert.match(audit.smokeVerification.evidence.href,/rig-v027/);
});
