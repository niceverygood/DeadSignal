import {readFile,writeFile} from 'node:fs/promises';
const qa=new URL('./',import.meta.url),mode=process.argv[2];
if(!['quality','cost'].includes(mode))throw Error('quality-or-cost-required');
const wrapper=JSON.parse(await readFile(new URL('browser-'+mode+'.json',qa),'utf8')),report=wrapper.passes?wrapper:wrapper.report;
if(!report?.passes)throw Error('raw-report-required');
const passes=report.passes.map(pass=>({arm:pass.arm,mode:pass.mode,preparationMs:pass.preparation.preparationMs,loadMs:pass.preparation.loadAndNativePreparationMs,firstMs:pass.firstFrame?.callbackMs??null,all40:pass.all40Summary?.callbackMs??null,steady30:pass.steady30Summary?.callbackMs??null,readbackMs:pass.readbackMs,totalMs:pass.totalPreparationAndCombatAndReadbackMs??null,samples:pass.samples.length,playerDraws:pass.playerDraws??null,player:pass.playerDeferredRead,finalState:pass.finalState,runtimeNative:pass.runtimeNative??null}));
const analysis={mode,complete:report.complete,error:report.error??wrapper.error??null,passes,pixels:report.pixels,performance:report.performance,equivalence:report.equivalence,cleanup:report.cleanup,note:report.note};
await writeFile(new URL(mode+'-analysis.json',qa),JSON.stringify(analysis,null,2)+'\n');
console.log(JSON.stringify({mode,complete:analysis.complete,error:analysis.error,passes:passes.map(pass=>({...pass,player:{available:pass.player?.available,reason:pass.player?.reason,used:pass.player?.used,fallbacks:pass.player?.fallbacks,verification:pass.player?.verification,cleanup:pass.player?.cleanupComplete,renderFingerprint:pass.player?.renderFingerprint}})),pixels:analysis.pixels,performance:analysis.performance,equivalence:{...analysis.equivalence,mismatches:analysis.equivalence.mismatches?.slice(0,3)},cleanup:analysis.cleanup}));
