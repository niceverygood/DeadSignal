import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {nativeAlphaBounds} from '../../work/dead-signal-game/dist/native-alpha-bounds.js';
import {bodyIdentificationContour} from '../../work/dead-signal-game/dist/production-art.js';
import {scanFixedPlayerAlphaGeometry} from '../../work/dead-signal-game/dist/player-alpha-geometry.js';
const qa=new URL('./',import.meta.url),read=name=>readFile(new URL(name,qa));
const reportBytes=await read('iab-report.json'),rawBytes=await read('iab-native-rgba.json');
const report=JSON.parse(reportBytes),raw=JSON.parse(rawBytes),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(report.injected,false);assert.equal(report.complete,true);assert.equal(report.captured,12);assert.equal(report.glDraws,24);assert.equal(report.bodyCaptureReads,12);assert.equal(report.rawBytes,3145728);assert.equal(report.cleanup.complete,true);assert.equal(report.rowScratchReleased,true);
assert.equal(raw.frames.length,12);assert.equal(raw.byteLength,3145728);assert.equal(raw.width,256);assert.equal(raw.height,256);assert.equal(raw.format,'RGBA8');
const rowEdges=new Uint16Array(512),inputs=[];
for(let index=0;index<12;index++){
 const frame=raw.frames[index],sample=report.samples[index],bytes=Buffer.from(frame.rgbaBase64,'base64');assert.equal(bytes.length,262144);assert.equal(frame.weapon,sample.weapon);assert.equal(frame.index,sample.index);assert.equal(frame.poseLabel,sample.poseLabel);
 const pixels=Uint8ClampedArray.from(bytes),before=pixels.slice(),alphaBounds=nativeAlphaBounds(pixels,256,256)||{x:256,y:256,width:1,height:1},coreBounds={x:alphaBounds.x,y:alphaBounds.y,width:alphaBounds.width,height:alphaBounds.height*.72};
 const original={alphaBounds,coreBounds,bodyIdentificationContour:bodyIdentificationContour(pixels,256,256,alphaBounds,coreBounds)},candidate=scanFixedPlayerAlphaGeometry(pixels,rowEdges);
 assert.deepEqual(original,sample.originalGeometry);assert.deepEqual(candidate,original);assert.deepEqual(pixels,before);if(candidate.bodyIdentificationContour){const c=candidate.bodyIdentificationContour;assert.equal(c.top[0],c.left[0]);assert.equal(c.top[1],c.right[0]);}
 assert.equal(sample.glDraws,2);assert.equal(sample.exactSelectedGeometry,true);assert.equal(sample.exactFusedGeometry,true);
 inputs.push({weapon:frame.weapon,index:frame.index,poseLabel:frame.poseLabel,bytes:bytes.length,sha256:sha(bytes),geometryExact:true,inputUnchanged:true});
}
const arms=report.performance.arms;assert.deepEqual(arms.map(a=>a.arm),['A1','B','A2']);
for(const arm of arms){assert.equal(arm.calls,2400);assert.equal(arm.warmupCalls,120);assert.equal(arm.batches.length,12);assert.equal(arm.batches.reduce((sum,b)=>sum+b.wallMs,0),arm.summary.sumMs);assert.ok(arm.batches.every(b=>b.calls===200));}
const fasterA=Math.min(arms[0].summary.sumMs,arms[2].summary.sumMs),b=arms[1].summary.sumMs,improvement=(fasterA-b)/fasterA;
assert.equal(improvement,report.performance.improvementFraction);assert.equal(report.performance.requiredImprovementFraction,.1);assert.equal(report.performance.cpuHelperWin,improvement>=.1);assert.equal(report.performance.adopted,false);assert.equal(report.performance.wholeFrameEvidence,false);
const decision={status:'native12-component-comparison-complete-product-not-integrated',inputs,sourceGeometryAndFusedExact12:true,offlineLiteralInputByteChecks12:true,nativeBodyCaptureReads12:true,originalGLDraws24:true,microCallsPerArm:2400,microWarmupsPerArm:120,microArmSumWallMs:arms.map(a=>({arm:a.arm,wallMs:a.summary.sumMs})),improvementFraction:improvement,cpuHelperWin:report.performance.cpuHelperWin,productIntegrated:false,wholeFrameEvidence:false,cleanup:report.cleanup,note:'Native current geometry and pure CPU component only. No helper substitution into the live raster, wholeCanvas A/B, whole-frame FPS, process CPU or peak RAM/VRAM evidence. No benchmark retry.',evidence:[{file:'iab-report.json',bytes:reportBytes.length,sha256:sha(reportBytes)},{file:'iab-native-rgba.json',bytes:rawBytes.length,sha256:sha(rawBytes)}]};
await writeFile(new URL('decision.json',qa),JSON.stringify(decision,null,2)+'\n');console.log(JSON.stringify({status:decision.status,geometryExact12:true,micro:decision.microArmSumWallMs,improvementFraction:improvement,cpuHelperWin:decision.cpuHelperWin,cleanupComplete:report.cleanup.complete}));
