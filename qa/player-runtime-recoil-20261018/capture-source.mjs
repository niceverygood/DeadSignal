import {readFile,writeFile,stat,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url),qa=new URL('./',import.meta.url);
const old=JSON.parse(await readFile(new URL('../sprite-call-cost-20261018/source-freeze.json',import.meta.url),'utf8'));
const paths=new Set(old.files.map(row=>row.file));
for(const path of ['tools/prepare-player-runtime.mjs','tools/player-runtime-sources.mjs','work/dead-signal-game/player-rig-src/weapon-pose.js','work/dead-signal-game/tests/player-runtime-recoil-source.test.mjs'])paths.add(path);
for(const entry of await readdir(new URL('work/dead-signal-game/dist/player-rig/',root),{withFileTypes:true}))if(entry.isFile()&&/\.(?:js|json)$/.test(entry.name))paths.add('work/dead-signal-game/dist/player-rig/'+entry.name);
async function row(file){const url=new URL(file,root),hash=createHash('sha256');for await(const chunk of createReadStream(url))hash.update(chunk);return{file,bytes:(await stat(url)).size,sha256:hash.digest('hex')};}
const files=[];for(const file of [...paths].sort())files.push(await row(file));
const before=JSON.parse(await readFile(new URL('source-before.json',qa),'utf8'));
for(const record of [...before.modules,...before.models])assert.deepEqual(await row(record.file),record,'original model, baker, live rig, engine, renderer and recoil test must stay unchanged');
const previousChanges=[];for(const record of old.files){const current=files.find(item=>item.file===record.file);if(current.sha256!==record.sha256||current.bytes!==record.bytes)previousChanges.push(record.file);}
assert.deepEqual(previousChanges,['work/dead-signal-game/dist/player-rig/weapon-pose.js'],'only the intentionally repaired generated player IK changes within the previous 358-file freeze');
const result={stage:process.argv[2]||'capture',count:files.length,files,protectedBeforeRecords:before.modules.length+before.models.length,protectedAllExact:true,previous358SourceChanges:previousChanges,ignoredGeneratedPlayerRigIncluded:true};
const destination=new URL(process.argv[3]||'source-freeze.json',qa);await writeFile(destination,JSON.stringify(result,null,2)+'\n');
if(process.argv[4]){
 const frozen=JSON.parse(await readFile(new URL(process.argv[4],qa),'utf8'));
 assert.deepEqual(result.files,frozen.files,'no source or ignored player runtime changes may occur during the full test');
}
console.log(JSON.stringify({stage:result.stage,count:result.count,protectedAllExact:true,previous358SourceChanges:previousChanges,ignoredGeneratedPlayerRigIncluded:true}));
