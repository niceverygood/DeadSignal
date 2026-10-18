import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Game} from '../../work/dead-signal-game/dist/engine.js';

const captured=JSON.parse(await readFile(new URL('./browser-recoil.json',import.meta.url),'utf8'));
const url=new URL(captured.url);
assert.equal(url.origin,'http://localhost:8851');
assert.equal(url.pathname,'/qa-player-rig.html');
assert.ok(url.searchParams.get('qa-memory'));
assert.deepEqual(captured.console,[]);
assert.deepEqual(captured.reports.map(r=>r.weapon),['shotgun','nailgun']);
const summary=[];
for(const report of captured.reports){
 assert.equal(report.records.length,6);
 const initialAmmo=new Game({seed:774,weapon:report.weapon}).player.ammo;
 let peak=0,maxGrip=0,maxSupport=0,maxAim=0;
 for(const [index,frame] of report.records.entries()){
  assert.equal(frame.identicalSnapshot,true);
  assert.ok(Number.isFinite(frame.physicalRecoil.applied)&&frame.physicalRecoil.applied>=0&&frame.physicalRecoil.applied<=1.1);
  assert.ok(Math.abs(frame.physicalRecoil.applied-frame.physicalRecoil.retraction)<1e-8);
  assert.ok(frame.gripError<1e-5&&frame.supportError<1e-4&&frame.aimErrorDegrees<1e-5);
  assert.ok(Object.values(frame.muzzle).every(Number.isFinite));
  assert.ok(frame.firstBullet&&Object.values(frame.firstBullet.muzzle).every(Number.isFinite));
  assert.ok(Number.isFinite(frame.firstBullet.height));
  assert.equal(frame.ammo,initialAmmo-1);
  if(index)assert.ok(frame.time>report.records[index-1].time);
  peak=Math.max(peak,frame.physicalRecoil.applied);
  maxGrip=Math.max(maxGrip,frame.gripError);maxSupport=Math.max(maxSupport,frame.supportError);maxAim=Math.max(maxAim,frame.aimErrorDegrees);
 }
 assert.ok(peak>(report.weapon==='shotgun'?1:.3));
 assert.equal(report.records.at(-1).physicalRecoil.applied,0);
 assert.equal(report.autoReload.ammo,0);assert.ok(report.autoReload.reloadTime>0&&report.autoReload.physicalRecoil.applied>0);
 assert.ok(report.autoReload.gripError<1e-5&&report.autoReload.aimError<1e-5);
 assert.equal(report.autoReload.identicalSnapshot,true);
 summary.push({weapon:report.weapon,frames:report.records.length,peakRetraction:peak,maxGripError:maxGrip,maxSupportError:maxSupport,maxAimErrorDegrees:maxAim,returnedToZero:true,lastShotReloadRecoil:report.autoReload.physicalRecoil.applied});
}
const result={status:'passed',fixture:'existing actual original two-weapon QA button; seed774; enemies isolated',url:captured.url,summary,consoleWarningsAndErrors:0,limits:['single original idle aim; does not certify dense-battle frame cost or all character motion','numeric feet/geometry preservation is covered separately by unchanged original rig tests']};
await writeFile(new URL('./browser-validation.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
