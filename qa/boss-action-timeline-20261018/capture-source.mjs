import {readFile,writeFile,stat,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const qa=new URL('./',import.meta.url),root=new URL('../../',import.meta.url);
const prior=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8'));
async function row(file){const url=new URL(file,root),hash=createHash('sha256');for await(const bytes of createReadStream(url))hash.update(bytes);return{file,bytes:(await stat(url)).size,sha256:hash.digest('hex')};}
const changed='work/dead-signal-game/dist/qa-boss-action-owned.js';
const previousEvidence=(await readdir(new URL('../boss-action-owned-cleanup-20261018/',qa))).filter(file=>!file.startsWith('.')).map(file=>'qa/boss-action-owned-cleanup-20261018/'+file);
const added=[...['qa-boss-action-timeline.js','qa-boss-action-timeline-ui.js','boss-action-timeline-qa.html'].map(file=>'work/dead-signal-game/dist/'+file),...['qa-boss-action-timeline.test.mjs','qa-boss-action-timeline-ui.test.mjs'].map(file=>'work/dead-signal-game/tests/'+file),...['owned-worker-before.txt','action-layer-before.txt','previous-source-freeze.json','protocol.json','capture-source.mjs','analyse-native.mjs'].map(file=>'qa/boss-action-timeline-20261018/'+file)];
const files=[];for(const file of [...new Set([...prior.files.map(row=>row.file),...previousEvidence,...added])].sort())files.push(await row(file));
for(const old of prior.files)if(old.file!==changed)assert.deepEqual(files.find(row=>row.file===old.file),old,'Previous frozen record changed: '+old.file);
const backup=await row('qa/boss-action-timeline-20261018/owned-worker-before.txt');assert.deepEqual({...backup,file:changed},prior.files.find(row=>row.file===changed));
const protection=JSON.parse(await readFile(new URL('../player-runtime-recoil-20261018/source-before.json',qa),'utf8'));for(const saved of [...protection.modules,...protection.models])assert.deepEqual(await row(saved.file),saved);
if(process.argv[4])assert.deepEqual(files,JSON.parse(await readFile(new URL(process.argv[4],qa),'utf8')).files);
const report={stage:process.argv[2]??'freeze',count:files.length,files,previous547ExactExceptDeclaredOwnedWorker:true,intentionalChangedSource:changed,previousCompletedEvidence:previousEvidence.length,protectedOriginalRecords:22,allProtectedExact:true,productIntegration:false};
await writeFile(new URL(process.argv[3]??'source-freeze.json',qa),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({count:files.length,previous547ExactExceptDeclaredOwnedWorker:true,allProtectedExact:true,productIntegration:false}));
