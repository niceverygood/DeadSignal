import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='qa/gpu-alpha-empty-lease-20261018';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const norm=p=>p.replaceAll('\\','/');
const paths=execFileSync('rg',['--files','-uu','tools','work/dead-signal-game/dist','work/dead-signal-game/tests'],{encoding:'utf8'}).trim().split(/\r?\n/).map(norm).filter(p=>/\.(?:js|mjs|html)$/.test(p));
const current=paths.map(path=>({path,sha256:hash(path)}));
if(process.argv.includes('--freeze')){
 if(fs.existsSync(`${dir}/empty-lease-source-freeze.json`))throw Error('freeze already exists');
 fs.writeFileSync(`${dir}/empty-lease-source-freeze.json`,JSON.stringify(current,null,2)+'\n');
 console.log(JSON.stringify({runtime:process.version,frozen:current.length}));
}else{
 const now=new Map(current.map(r=>[r.path,r.sha256]));
 const compare=p=>{const rows=read(p),old=new Map(rows.map(r=>[norm(r.path),r.sha256]));return{baseline:old.size,current:now.size,changed:[...old].filter(([p,h])=>now.has(p)&&now.get(p)!==h).map(([path,before])=>({path,before,after:now.get(path)})),missing:[...old.keys()].filter(p=>!now.has(p)),added:[...now.keys()].filter(p=>!old.has(p))};};
 const uiBefore=fs.readFileSync(`${dir}/qa-player-rig-before-empty-lease.txt`),uiAfter=fs.readFileSync('work/dead-signal-game/dist/qa-player-rig.js');
 const report={at:new Date().toISOString(),runtime:process.version,freeze:compare(`${dir}/empty-lease-source-freeze.json`),previous:compare('qa/app-gpu-alpha-20261018/app-gpu-alpha-source-freeze.json'),uiFullPrefixPreserved:uiAfter.subarray(0,uiBefore.length).equals(uiBefore),uiBeforeBytes:uiBefore.length,uiAfterBytes:uiAfter.length,beforeRig:hash(`${dir}/live-boss-before-empty-lease.txt`),afterRig:hash('work/dead-signal-game/dist/boss-rig/live-boss.js')};
 fs.writeFileSync(`${dir}/empty-lease-final-check.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
