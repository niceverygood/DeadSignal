import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='qa/boss-action-layer-20261018',norm=p=>p.replaceAll('\\','/');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const paths=execFileSync('rg',['--files','-uu','tools','work/dead-signal-game/dist','work/dead-signal-game/tests'],{encoding:'utf8'}).trim().split(/\r?\n/).map(norm).filter(p=>/\.(?:js|mjs|html)$/.test(p));
const rows=paths.map(path=>({path,sha256:hash(path)}));
if(process.argv.includes('--freeze')){
 if(fs.existsSync(`${dir}/action-layer-source-freeze.json`))throw Error('freeze already exists');
 fs.writeFileSync(`${dir}/action-layer-source-freeze.json`,JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify({runtime:process.version,entries:rows.length}));
}else{
 const current=new Map(rows.map(r=>[r.path,r.sha256]));
 const compare=path=>{const old=new Map(read(path).map(r=>[norm(r.path),r.sha256]));return{baseline:old.size,current:current.size,changed:[...old].filter(([p,h])=>current.has(p)&&current.get(p)!==h).map(([path,before])=>({path,before,after:current.get(path)})),missing:[...old.keys()].filter(p=>!current.has(p)),added:[...current.keys()].filter(p=>!old.has(p))};};
 const preserved=[['engine.js','3551287930debc315d25fd6ef9c5c51e0bf41af98f22f872ea485e5a6888df79'],['renderer.js','621492d00a0fe0a50083de3c07237f1e8100939c1ce75b6ac9f1eeab477f80b3'],['boss-rig/boss-pose.js','dbe72923e154d3df09a574c8118ef39f51be400e671f1fb9434c2220cb404076'],['enemy-locomotion.js','10b681927a3b080d47373aa91af53b6c201b0477b30511b9e66ad85c88023a35'],['actor-interpolation.js','ca3c22b0409bc4b296331658f57fb786a64e1efbd2c044fb34d3582a4b7f40cc'],['production-art.js','017c977b477d6f2d37067dfea48dbafa50166661cc93274bc549ab9354250c5d']].map(([path,before])=>({path,before,after:hash('work/dead-signal-game/dist/'+path),same:hash('work/dead-signal-game/dist/'+path)===before}));
 const ui=fs.readFileSync('work/dead-signal-game/dist/qa-player-rig.js'),before=fs.readFileSync(`${dir}/qa-player-rig-before-action.txt`);
 const live=fs.readFileSync('work/dead-signal-game/dist/boss-rig/live-boss.js','utf8');
 const result={at:new Date().toISOString(),runtime:process.version,freeze:compare(`${dir}/action-layer-source-freeze.json`),previous:compare('qa/boss-motion-20261018/boss-motion-source-freeze.json'),preserved,qaFullPrefixPreserved:ui.subarray(0,before.length).equals(before),qaBeforeBytes:before.length,qaAfterBytes:ui.length,bossActionLayerDefaultEnabled:live.includes('this.bossActionLayerEnabled=true;'),liveBossBeforeSHA:hash(`${dir}/live-boss-before-action.txt`),liveBossAfterSHA:hash('work/dead-signal-game/dist/boss-rig/live-boss.js'),equipmentBeforeSHA:hash('qa/boss-motion-20261018/equipment-engine-test-before.txt'),equipmentAfterSHA:hash('work/dead-signal-game/tests/equipment-engine.test.mjs')};
 fs.writeFileSync(`${dir}/action-layer-final-check.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
