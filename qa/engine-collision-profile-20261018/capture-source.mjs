import {readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const qa=new URL('./',import.meta.url),root=new URL('../../',import.meta.url),prior=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8'));
async function row(file){const url=new URL(file,root),hash=createHash('sha256');for await(const bytes of createReadStream(url))hash.update(bytes);return{file,bytes:(await stat(url)).size,sha256:hash.digest('hex')};}
const added=['work/dead-signal-game/dist/qa-engine-direction-candidate.js','work/dead-signal-game/tests/engine-direction-candidate.test.mjs',...['engine-before.txt','previous-source-freeze.json','profile.mjs','analyze-profile.mjs','build-candidate.mjs','quality.mjs','cost.mjs','capture-source.mjs','protocol.json','protocol-review.json','candidate-transform.json'].map(file=>'qa/engine-collision-profile-20261018/'+file)];
const files=[];for(const file of[...new Set([...prior.files.map(row=>row.file),...added])].sort())files.push(await row(file));
const changed=prior.files.filter(old=>{const current=files.find(row=>row.file===old.file);return current.bytes!==old.bytes||current.sha256!==old.sha256;}).map(row=>row.file);assert.deepEqual(changed,[],'all483 previous sources stay exact');
const before=await row('qa/engine-collision-profile-20261018/engine-before.txt'),engine=prior.files.find(row=>row.file==='work/dead-signal-game/dist/engine.js');assert.deepEqual({...before,file:engine.file},engine);
const protection=JSON.parse(await readFile(new URL('../player-runtime-recoil-20261018/source-before.json',qa),'utf8'));for(const saved of[...protection.modules,...protection.models])assert.deepEqual(await row(saved.file),saved);
const report={stage:process.argv[2]??'freeze',files,count:files.length,previous483Changed:changed,productionEngineUnchanged:true,protectedOriginalRecords:22,allProtectedExact:true};if(process.argv[4])assert.deepEqual(files,JSON.parse(await readFile(new URL(process.argv[4],qa),'utf8')).files);
await writeFile(new URL(process.argv[3]??'source-freeze.json',qa),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({count:files.length,changed,productionEngineUnchanged:true,allProtectedExact:true}));
