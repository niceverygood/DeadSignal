import test from 'node:test';
import assert from 'node:assert/strict';
import {NPC_IDS,GROUNDED_NPC_IDS,normalizeNpcActor,summarizeLocomotionEvidence,supplementReviewAudit,readLocomotionEvidence} from './build-locomotion-evidence.mjs';
const row=id=>({qaActor:id.replace(/^enemy-/,'enemy:'),qaMode:'walk',qaMeasurement:'move',qaNativePainted:'true',qaRngRenderUnchanged:'true',qaRngControlledTickUnchanged:'true',qaPauseUnchanged:'true',qaRunning:'false',qaPaused:'true',qaTicks:'120',qaTargetTicks:'120',qaSimulationSeconds:'2',qaActualSimulationSeconds:'2',qaAsset:id+'-locomotion-hq32',qaSamples:'32',qaFrames:'512',qaPacking:'trimmed-v1',qaDistance:'100',qaMeasuredSpeed:'50',qaGait:'walk',qaGaitCycleDistance:'70',qaObservedLocomotionSamples:JSON.stringify(Array.from({length:24},(_,i)=>i)),qaSource:id+'-grounded-locomotion-v1.glb'});
const glb=id=>({actor:id,source:`models/${id}-grounded-locomotion-v1/model.glb`,joints:'24',skins:'1',textures:'1',error:'',clips:['Armature|walking_man|baselayer','DS_GroundedWalk','DS_GroundedRun']});
const proof=()=>({recordedAt:'2026-10-16T10:00:00.000Z',controlledMotion:NPC_IDS.map(row),specialCases:[],actualGroundedGlbLoading:GROUNDED_NPC_IDS.map(glb)});

test('missing actual v029 evidence stays pending and cannot inherit the old 33 / 161 proof',async()=>{
 const pending=summarizeLocomotionEvidence();assert.equal(pending.status,'not-run');assert.equal(pending.evidence,null);assert.equal(pending.counts.controlledActors,0);assert.equal(pending.missingActors.length,31);
 const absent=await readLocomotionEvidence('/tmp/nonexistent-dead-signal-v029-browser-evidence.json');assert.deepEqual(absent,pending);
 assert.equal(normalizeNpcActor('enemy:walker'),'enemy-walker');assert.equal(normalizeNpcActor('boss-01-mid'),'boss-01-mid');
});
test('all31 actual native walking records and19 corrected GLB loads are counted once, without inventing full32-frame coverage',()=>{
 const source=proof(),summary=summarizeLocomotionEvidence(source,{sha256:'a'.repeat(64)});assert.equal(summary.status,'passed');assert.equal(summary.counts.controlledActors,31);assert.equal(summary.counts.groundedGlbModels,19);assert.equal(summary.counts.completeCycleObservedActors,0);assert.ok(summary.actors.every(a=>a.observedSampleCount===24));
 source.controlledMotion.push(row('enemy-walker'));assert.equal(summarizeLocomotionEvidence(source).counts.controlledActors,31);
 source.controlledMotion[0].qaObservedLocomotionSamples=JSON.stringify(Array.from({length:32},(_,i)=>i));assert.equal(summarizeLocomotionEvidence(source).counts.completeCycleObservedActors,1);
});
test('native flags, old action reels, incomplete ticks, RNG drift and a swapped old GLB cannot pass new locomotion proof',()=>{
 for(const mutate of[
  p=>p.controlledMotion[0].qaNativePainted='false',p=>p.controlledMotion[0].qaAsset='boss-01-mid-rig-motion',p=>p.controlledMotion[0].qaTicks='119',p=>p.controlledMotion[0].qaRngRenderUnchanged='false',p=>p.controlledMotion[0].qaRngControlledTickUnchanged='false',p=>p.controlledMotion[0].qaObservedLocomotionSamples='[]',
 ]){const p=proof();mutate(p);const result=summarizeLocomotionEvidence(p);assert.equal(result.status,'partial');assert.equal(result.counts.controlledActors,30);}
 const p=proof();p.actualGroundedGlbLoading[0].source='models/boss-01-mid-motion-v1/model.glb';assert.equal(summarizeLocomotionEvidence(p).counts.groundedGlbModels,18);
 p.actualGroundedGlbLoading[0]=glb('boss-01-mid');p.actualGroundedGlbLoading[0].clips=['DS_GroundedWalk'];assert.equal(summarizeLocomotionEvidence(p).counts.groundedGlbModels,18);
 assert.throws(()=>summarizeLocomotionEvidence({...proof(),recordedAt:'invalid'}));assert.throws(()=>summarizeLocomotionEvidence(proof(),{href:'https://example.com/proof.json'}));
});
test('feature evidence distinguishes real stopped collision, smooth turns, terminal death, mid-action warning angle and AI',()=>{
 const p=proof(),base=row('boss-01-mid');p.specialCases=[
  {...base,qaCollision:'on',qaDistance:'0',qaGait:'idle'},
  {...base,qaMeasurement:'stop',qaDistance:'0',qaGait:'idle'},
  {...base,qaMeasurement:'turn',qaTurnMaxRenderedStep:'.12'},
  {...base,qaMode:'combat',qaMeasurement:'damage'},
  {...base,qaMode:'combat',qaMeasurement:'knockback'},
  {...base,qaMode:'combat',qaMeasurement:'death',qaClip:'death',qaSample:'31',qaActualSimulationSeconds:'0'},
  {...base,qaMode:'combat',qaMeasurement:'skill'},
  {...base,qaMode:'combat',qaMeasurement:'skill',qaTicks:'30',qaRunning:'true',qaPaused:'true',qaGaitActionFacing:'true',qaRenderedAngle:String(Math.PI*2),qaSimulationAngle:'0'},
 ];
 const result=summarizeLocomotionEvidence(p);assert.ok(result.features.every(feature=>feature.passed>0));assert.equal(result.features.find(f=>f.id==='attack-facing').passed,1);
 p.specialCases[0].qaDistance='9';p.specialCases[2].qaTurnMaxRenderedStep=String(Math.PI);p.specialCases[7].qaRenderedAngle='1';const partial=summarizeLocomotionEvidence(p);for(const feature of['wall','turn','attack-facing'])assert.equal(partial.features.find(f=>f.id===feature).status,'partial');
});
test('a supplemental audit leaves original v027 proof and comprehensive art approval byte-for-byte equivalent',()=>{
 const original={smokeVerification:{counts:{gameVariants:33,stateBindings:161},evidence:{href:'qa/rig-v027/browser-runtime-evidence.json'}},comprehensiveArtistApproval:{status:'pending'},assets:[{id:'boss-01-mid',smokeVerification:{status:'passed'}},{id:'survivor-shotgun'}]},before=JSON.stringify(original),summary=summarizeLocomotionEvidence(proof()),updated=supplementReviewAudit(original,summary);
 assert.equal(JSON.stringify(original),before);assert.deepEqual(updated.smokeVerification,original.smokeVerification);assert.deepEqual(updated.comprehensiveArtistApproval,original.comprehensiveArtistApproval);assert.equal(updated.assets[0].supplementalLocomotionVerification.status,'passed');assert.equal(updated.assets[1].supplementalLocomotionVerification,null);
});

test('actual captured v029 fields count31 walk draws,19 gated viewer loads and16 full cycles without inventing unobserved skin fields',async()=>{
 const summary=await readLocomotionEvidence();assert.equal(summary.status,'passed');assert.equal(summary.counts.controlledActors,31);assert.equal(summary.counts.groundedGlbModels,19);assert.equal(summary.counts.completeCycleObservedActors,16);assert.equal(summary.counts.specialCaseRecords,16);assert.equal(summary.evidence.sha256.length,64);
 for(const record of summary.groundedModels){assert.equal(record.status,'passed');assert.equal(record.skins,null);assert.equal(record.textures,null);assert.equal(record.clips,null);assert.equal(record.defaultClip,record.id==='enemy-runner'?'DS_GroundedRun':'DS_GroundedWalk');}
 assert.equal(summary.features.find(f=>f.id==='turn').passed,2);assert.equal(summary.features.find(f=>f.id==='death').passed,4);assert.equal(summary.features.find(f=>f.id==='attack-facing').passed,1);
});
