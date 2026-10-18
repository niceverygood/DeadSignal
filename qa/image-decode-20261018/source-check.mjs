import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='qa/image-decode-20261018',norm=p=>p.replaceAll('\\','/');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const paths=execFileSync('rg',['--files','-uu','tools','work/dead-signal-game/dist','work/dead-signal-game/tests'],{encoding:'utf8'}).trim().split(/\r?\n/).map(norm).filter(p=>/\.(?:js|mjs|html)$/.test(p));
const rows=paths.map(path=>({path,sha256:hash(path)}));
if(process.argv.includes('--freeze')){
 if(fs.existsSync(`${dir}/image-decode-source-freeze.json`))throw Error('freeze already exists');
 fs.writeFileSync(`${dir}/image-decode-source-freeze.json`,JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify({runtime:process.version,entries:rows.length}));
}else{
 const current=new Map(rows.map(r=>[r.path,r.sha256]));
 const compare=path=>{const old=new Map(read(path).map(r=>[norm(r.path),r.sha256]));return{baseline:old.size,current:current.size,changed:[...old].filter(([p,h])=>current.has(p)&&current.get(p)!==h).map(([path,before])=>({path,before,after:current.get(path)})),missing:[...old.keys()].filter(p=>!current.has(p)),added:[...current.keys()].filter(p=>!old.has(p))};};
 const before=fs.readFileSync(`${dir}/qa-player-rig-before-image-decode.txt`),after=fs.readFileSync('work/dead-signal-game/dist/qa-player-rig.js');
 const result={at:new Date().toISOString(),runtime:process.version,freeze:compare(`${dir}/image-decode-source-freeze.json`),previous:compare('qa/gpu-alpha-empty-lease-20261018/empty-lease-source-freeze.json'),uiFullPrefixPreserved:after.subarray(0,before.length).equals(before),uiBeforeBytes:before.length,uiAfterBytes:after.length,productionArtUnchanged:fs.readFileSync(`${dir}/production-art-before-image-decode.txt`).equals(fs.readFileSync('work/dead-signal-game/dist/production-art.js')),productionArtSHA:hash('work/dead-signal-game/dist/production-art.js')};
 fs.writeFileSync(`${dir}/image-decode-final-check.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
