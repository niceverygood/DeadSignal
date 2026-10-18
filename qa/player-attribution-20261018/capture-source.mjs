import {readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url),qa=new URL('./',import.meta.url),before=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8'));
const paths=new Set(before.files.map(row=>row.file));
for(const file of ['work/dead-signal-game/tests/qa-player-attribution.test.mjs','work/dead-signal-game/tests/qa-player-attribution-combat.test.mjs','work/dead-signal-game/tests/qa-player-attribution-ui.test.mjs','qa/player-attribution-20261018/current-qa-player-rig.txt','qa/player-attribution-20261018/combat-harness-before.txt','qa/player-attribution-20261018/profiler-before.txt','qa/player-attribution-20261018/combat-fixture-before.txt','qa/player-attribution-20261018/capture-source.mjs','qa/player-attribution-20261018/analyse.mjs'])paths.add(file);
async function row(file){const url=new URL(file,root),hash=createHash('sha256');for await(const bytes of createReadStream(url))hash.update(bytes);return{file,bytes:(await stat(url)).size,sha256:hash.digest('hex')};}
const files=[];for(const file of [...paths].sort())files.push(await row(file));
const changes=[];for(const previous of before.files){const current=files.find(item=>item.file===previous.file);if(current.sha256!==previous.sha256||current.bytes!==previous.bytes)changes.push(previous.file);}
assert.deepEqual(changes,['work/dead-signal-game/dist/qa-canvas-state-combat.js','work/dead-signal-game/dist/qa-player-rig.js','work/dead-signal-game/dist/qa-render-attribution.js']);
const original=await readFile(new URL('current-qa-player-rig.txt',qa)),current=await readFile(new URL('work/dead-signal-game/dist/qa-player-rig.js',root));assert.equal(original.length,176911);assert.deepEqual(current.subarray(0,original.length),original);
for(const [source,snapshot]of [['work/dead-signal-game/dist/qa-canvas-state-combat.js','combat-harness-before.txt'],['work/dead-signal-game/dist/qa-render-attribution.js','profiler-before.txt']]){const saved=await row('qa/player-attribution-20261018/'+snapshot),prior=before.files.find(row=>row.file===source);assert.equal(saved.sha256,prior.sha256);assert.equal(saved.bytes,prior.bytes);}
assert.equal((await row('qa/player-attribution-20261018/combat-fixture-before.txt')).sha256,'5dd93656b65aeb2f3125270adbb973ff5aa9c9e8b216c8840e88cb2997fdd664');
const protectedBefore=JSON.parse(await readFile(new URL('../player-runtime-recoil-20261018/source-before.json',import.meta.url),'utf8'));for(const saved of [...protectedBefore.modules,...protectedBefore.models])assert.deepEqual(await row(saved.file),saved);
const result={stage:process.argv[2]||'capture',count:files.length,files,previous389Changed:changes,originalQAPrefixBytes:original.length,originalQAPrefixExact:true,oldHarnessAndProfilerExact:true,oldFixtureExact:true,protectedOriginalRecords:22,allProtectedExact:true};
await writeFile(new URL(process.argv[3]||'source-freeze.json',qa),JSON.stringify(result,null,2)+'\n');if(process.argv[4])assert.deepEqual(files,JSON.parse(await readFile(new URL(process.argv[4],qa),'utf8')).files,'source changes occurred during browser/full QA');console.log(JSON.stringify({stage:result.stage,count:result.count,previous389Changed:changes,originalQAPrefixExact:true,allProtectedExact:true}));
