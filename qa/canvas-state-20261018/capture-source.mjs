import {readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url),qa=new URL('./',import.meta.url);
const before=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8'));
const paths=new Set(before.files.map(row=>row.file));
for(const file of ['work/dead-signal-game/dist/qa-canvas-state.js','work/dead-signal-game/dist/qa-canvas-state-pixels.js','work/dead-signal-game/tests/qa-canvas-state.test.mjs','work/dead-signal-game/tests/qa-canvas-state-ui.test.mjs','work/dead-signal-game/tests/qa-canvas-state-pixels-gates.test.mjs','qa/canvas-state-20261018/current-qa-player-rig.txt','qa/canvas-state-20261018/capture-source.mjs'])paths.add(file);
async function row(file){const url=new URL(file,root),hash=createHash('sha256');for await(const bytes of createReadStream(url))hash.update(bytes);return{file,bytes:(await stat(url)).size,sha256:hash.digest('hex')};}
const files=[];for(const file of [...paths].sort())files.push(await row(file));
const changes=[];for(const previous of before.files){const current=files.find(item=>item.file===previous.file);if(current.sha256!==previous.sha256||current.bytes!==previous.bytes)changes.push(previous.file);}
assert.deepEqual(changes,['work/dead-signal-game/dist/qa-player-rig.js']);
const frozenOriginal=await readFile(new URL('current-qa-player-rig.txt',qa)),currentQA=await readFile(new URL('work/dead-signal-game/dist/qa-player-rig.js',root));
assert.deepEqual(currentQA.subarray(0,frozenOriginal.length),frozenOriginal);
const protectedBefore=JSON.parse(await readFile(new URL('../player-runtime-recoil-20261018/source-before.json',import.meta.url),'utf8'));
for(const original of [...protectedBefore.modules,...protectedBefore.models])assert.deepEqual(await row(original.file),original);
const result={stage:process.argv[2]||'capture',count:files.length,files,previous364Changed:changes,originalQAPrefixBytes:frozenOriginal.length,originalQAPrefixExact:true,protectedOriginalRecords:22,allProtectedExact:true};
await writeFile(new URL(process.argv[3]||'source-freeze.json',qa),JSON.stringify(result,null,2)+'\n');
if(process.argv[4])assert.deepEqual(files,JSON.parse(await readFile(new URL(process.argv[4],qa),'utf8')).files,'source changes occurred during browser/full QA');
console.log(JSON.stringify({stage:result.stage,count:result.count,previous364Changed:changes,originalQAPrefixExact:true,allProtectedExact:true}));
