import {readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const qa=new URL('./',import.meta.url),root=new URL('../../',import.meta.url);
const prior=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8'));
async function row(file){const url=new URL(file,root),hash=createHash('sha256');for await(const bytes of createReadStream(url))hash.update(bytes);return{file,bytes:(await stat(url)).size,sha256:hash.digest('hex')};}
const added=[
 'work/dead-signal-game/dist/player-alpha-geometry.js',
 'work/dead-signal-game/dist/qa-player-alpha-geometry.js',
 'work/dead-signal-game/dist/player-alpha-geometry-qa.html',
 'work/dead-signal-game/tests/player-alpha-geometry.test.mjs',
 'work/dead-signal-game/tests/player-alpha-geometry-qa.test.mjs',
 ...['player-before.txt','bounds-before.txt','art-before.txt','previous-source-freeze.json','protocol.json','protocol-review.json','capture-source.mjs','analyse-native.mjs'].map(file=>'qa/player-cpu-alpha-geometry-20261018/'+file)
];
const files=[];for(const file of [...new Set([...prior.files.map(row=>row.file),...added])].sort())files.push(await row(file));
for(const old of prior.files)assert.deepEqual(files.find(row=>row.file===old.file),old,'Previous frozen record changed: '+old.file);
for(const[file,before]of [['work/dead-signal-game/dist/player-rig/live-player.js','player-before.txt'],['work/dead-signal-game/dist/native-alpha-bounds.js','bounds-before.txt'],['work/dead-signal-game/dist/production-art.js','art-before.txt']])assert.deepEqual({...await row('qa/player-cpu-alpha-geometry-20261018/'+before),file},files.find(row=>row.file===file));
const protection=JSON.parse(await readFile(new URL('../player-runtime-recoil-20261018/source-before.json',qa),'utf8'));
for(const saved of [...protection.modules,...protection.models])assert.deepEqual(await row(saved.file),saved);
if(process.argv[4])assert.deepEqual(files,JSON.parse(await readFile(new URL(process.argv[4],qa),'utf8')).files);
const report={stage:process.argv[2]??'freeze',count:files.length,files,previous504Exact:true,protectedOriginalRecords:22,allProtectedExact:true,productIntegration:false};
await writeFile(new URL(process.argv[3]??'source-freeze.json',qa),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({count:files.length,previous504Exact:true,allProtectedExact:true,productIntegration:false}));
