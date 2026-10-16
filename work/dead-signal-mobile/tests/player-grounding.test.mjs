import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {playerGroundingHeight} from '../dist/player-grounding.js';

// Independent exact skinned-GLB measurements, not alpha-bottom coordinates.
const measured = JSON.parse(readFileSync(new URL('./fixtures/native-ground-contact32.json', import.meta.url), 'utf8'));
function selected(pose, sample, samples = 32) {
  return {metadata:{source:{file:`survivor-v2-${pose}.glb`},atlas:{includesWeapon:true,samples},projection:{subjectHeight:44},animation:{name:pose==='walk'?'Armature|walking_man|baselayer':'Armature|running|baselayer'}},frame:{sample}};
}
test('all 32 walking soles reach the same floor, including the new intermediate below-floor poses', () => {
  for (let i = 0; i < 32; i++) assert.ok(Math.abs(measured.soleHeights32.walk[i] - playerGroundingHeight(selected('walk',i))) < 1e-12);
  assert.ok(playerGroundingHeight(selected('walk',9)) < 0);
  for (let i = 0; i < 8; i++) assert.ok(Math.abs(playerGroundingHeight(selected('walk',i,8))-playerGroundingHeight(selected('walk',i*4))) < 1e-12);
});
test('running keeps its real flight while the 32-frame baseline stays above the measured floor', () => {
  const remaining = measured.soleHeights32.run.map((height,i)=>height-playerGroundingHeight(selected('run',i)));
  assert.ok(Math.min(...remaining) >= 0); assert.ok(Math.max(...remaining) > 2.9);
  for (const mutate of [s=>s.metadata.source.file='other.glb',s=>s.metadata.projection.subjectHeight=88,s=>s.metadata.atlas.samples=16,s=>s.metadata.atlas.includesWeapon=false]) {
    const value=selected('walk',5);mutate(value);assert.equal(playerGroundingHeight(value),0);
  }
});
