import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='qa/app-gpu-alpha-20261018';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const norm=p=>p.replaceAll('\\','/');
const currentPaths=execFileSync('rg',['--files','-uu','tools','work/dead-signal-game/dist','work/dead-signal-game/tests'],{encoding:'utf8'}).trim().split(/\r?\n/).map(norm).filter(p=>/\.(?:js|mjs|html)$/.test(p));
const current=new Map(currentPaths.map(p=>[p,hash(p)]));
function compare(path){
  const rows=read(path),old=new Map(rows.map(r=>[norm(r.path),r.sha256]));
  return {baselineEntries:old.size,currentEntries:current.size,changed:[...old].filter(([p,h])=>current.has(p)&&current.get(p)!==h).map(([path,sha256])=>({path,before:sha256,after:current.get(path)})),missing:[...old.keys()].filter(p=>!current.has(p)),added:[...current.keys()].filter(p=>!old.has(p))};
}
const out={createdAt:new Date().toISOString(),runtime:process.version,freeze:compare(`${dir}/app-gpu-alpha-source-freeze.json`),previousTask:compare('qa/gpu-alpha-preupload-20261018/gpu-alpha-preupload-source-freeze.json'),replay:read(`${dir}/app-gpu-replay-numeric-differences.json`).map(({arm,exact,differenceCount,maxAbsoluteNumericDelta,differences})=>({arm,exact,differenceCount,maxAbsoluteNumericDelta,fields:[...new Set(differences.map(d=>d.path.replace(/\[\d+\]/g,'[]')))]})),engines:['engine.js','renderer.js','boss-rig/live-boss.js','native-launch-owner.js','boss-rig/native-launch-preparation.js'].map(p=>({path:p,sha256:hash(`work/dead-signal-game/dist/${p}`)})),verify:{exit:1,runtime:'v22.23.3',reason:'Existing immutable manifest .gitignore mismatch; manifest not modified.'},tests:{pass:1056,fail:0,cancelled:0,skipped:0,durationMs:185916.7116,exit:0,stressCpuMs:12296,stressWallMs:15977.41,cpuBudgetMs:15000}};
fs.writeFileSync(`${dir}/app-gpu-alpha-final-check.json`,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
for(const arm of ['cpu-a','exact-b','cpu-repeat']){const report=read(`${dir}/app-gpu-${arm}-browser.json`);console.log(arm,JSON.stringify({topKeys:Object.keys(report),costKeys:Object.keys(report.cost??{}),initialGPU:report.initialContext?.gpuAlphaLaunch,finalGPU:report.finalContext?.gpuAlphaLaunch}));}
