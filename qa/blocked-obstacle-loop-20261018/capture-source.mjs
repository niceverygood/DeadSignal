import {readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url),qa=new URL('./',import.meta.url),before=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8'));
const paths=new Set(before.files.map(row=>row.file));
for(const file of ['candidate-engine.mjs','current-engine.txt','current-grid-helper.txt','stress-fixture.txt','blocked-obstacle-oracle.mjs','verify-blocked-obstacle-game.mjs','bench-blocked-obstacle.mjs','capture-source.mjs'])paths.add('qa/blocked-obstacle-loop-20261018/'+file);
async function row(file){const url=new URL(file,root),hash=createHash('sha256');for await(const bytes of createReadStream(url))hash.update(bytes);return{file,bytes:(await stat(url)).size,sha256:hash.digest('hex')};}
const files=[];for(const file of [...paths].sort())files.push(await row(file));
const changes=[];for(const previous of before.files){const current=files.find(item=>item.file===previous.file);if(current.sha256!==previous.sha256||current.bytes!==previous.bytes)changes.push(previous.file);}
assert.deepEqual(changes,[],'No product or previous QA source changes are allowed in this QA-candidate phase');
for(const [source,snapshot]of [['work/dead-signal-game/dist/engine.js','current-engine.txt'],['work/dead-signal-game/dist/enemy-separation-grid.js','current-grid-helper.txt'],['work/dead-signal-game/tests/engine.test.mjs','stress-fixture.txt']]){const saved=await row('qa/blocked-obstacle-loop-20261018/'+snapshot),prior=before.files.find(row=>row.file===source);assert.equal(saved.sha256,prior.sha256);assert.equal(saved.bytes,prior.bytes);}
const protectedBefore=JSON.parse(await readFile(new URL('../player-runtime-recoil-20261018/source-before.json',import.meta.url),'utf8'));for(const saved of [...protectedBefore.modules,...protectedBefore.models])assert.deepEqual(await row(saved.file),saved);
const result={stage:process.argv[2]||'capture',count:files.length,files,previous415Changed:changes,originalEngineAndGridAndStressExact:true,protectedOriginalRecords:22,allProtectedExact:true};
await writeFile(new URL(process.argv[3]||'source-freeze.json',qa),JSON.stringify(result,null,2)+'\n');if(process.argv[4])assert.deepEqual(files,JSON.parse(await readFile(new URL(process.argv[4],qa),'utf8')).files,'source changes occurred during CPU QA');console.log(JSON.stringify({stage:result.stage,count:result.count,previous415Changed:changes,allProtectedExact:true}));
