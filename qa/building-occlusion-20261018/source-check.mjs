import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='qa/building-occlusion-20261018';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const paths=execFileSync('rg',['--files','-uu','tools','work/dead-signal-game/dist','work/dead-signal-game/tests'],{encoding:'utf8'}).trim().split(/\r?\n/).map(p=>p.replaceAll('\\','/')).filter(p=>/\.(?:js|mjs|html|css)$/.test(p)).sort();
const rows=paths.map(path=>({path,sha256:hash(path)}));
const suffix=process.argv.includes('--after-control')?'-after-control':process.argv.includes('--after-native')?'-after-native':process.argv.includes('--after-legal')?'-after-legal':'';
const file=dir+'/combined-source-freeze'+suffix+'.json';
if(process.argv.includes('--freeze')){
 fs.writeFileSync(file,JSON.stringify(rows,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({runtime:process.version,entries:rows.length,includesCSS:true}));
}else{
 const before=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')),now=new Map(rows.map(r=>[r.path,r.sha256])),old=new Map(before.map(r=>[r.path,r.sha256]));
 const changed=before.filter(r=>now.has(r.path)&&now.get(r.path)!==r.sha256),missing=before.filter(r=>!now.has(r.path)),added=rows.filter(r=>!old.has(r.path));
 const preserved=[['boss-rig/boss-pose.js','dbe72923e154d3df09a574c8118ef39f51be400e671f1fb9434c2220cb404076'],['enemy-locomotion.js','10b681927a3b080d47373aa91af53b6c201b0477b30511b9e66ad85c88023a35'],['actor-interpolation.js','ca3c22b0409bc4b296331658f57fb786a64e1efbd2c044fb34d3582a4b7f40cc'],['production-art.js','017c977b477d6f2d37067dfea48dbafa50166661cc93274bc549ab9354250c5d']].map(([path,sha256])=>({path,sha256,same:hash('work/dead-signal-game/dist/'+path)===sha256}));
 const result={at:new Date().toISOString(),runtime:process.version,entries:rows.length,changed,missing,added,preserved,bossActionLayerDefaultEnabled:fs.readFileSync('work/dead-signal-game/dist/boss-rig/live-boss.js','utf8').includes('this.bossActionLayerEnabled=true;'),note:'This combined phase intentionally changes engine upgrade progression, app upgrade UI, world-depth/renderer occlusion and boss action integration. Earlier phase hashes are not claimed unchanged.'};
 fs.writeFileSync(dir+'/combined-final-check'+suffix+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 if(changed.length||missing.length||added.length||preserved.some(r=>!r.same))process.exitCode=1;
}
