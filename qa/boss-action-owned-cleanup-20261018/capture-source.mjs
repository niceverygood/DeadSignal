import {readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const qa=new URL('./',import.meta.url),root=new URL('../../',import.meta.url);
const prior=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8'));
async function row(file){const url=new URL(file,root),hash=createHash('sha256');for await(const bytes of createReadStream(url))hash.update(bytes);return{file,bytes:(await stat(url)).size,sha256:hash.digest('hex')};}
const previousEvidence=['decision.json','completion.json','journal-entry.txt','journal-preservation.json','finish.mjs','next-boss-read-audit.json','iab-report.json','iab-native-rgba.json','iab-shotgun.png','iab-nailgun.png','iab-proof.png','iab-console.json','iab-tab-cleanup.json','iab-capture-note.json','focused-component.txt','focused-route.txt','whole-test.txt','verify.txt'].map(file=>'qa/player-cpu-alpha-geometry-20261018/'+file);
const added=[
 ...['qa-boss-action-owned.js','qa-boss-action-owned-ui.js','boss-action-owned-qa.html'].map(file=>'work/dead-signal-game/dist/'+file),
 ...['qa-boss-action-owned.test.mjs','qa-boss-action-owned-ui.test.mjs'].map(file=>'work/dead-signal-game/tests/'+file),
 ...['legacy-helper-before.txt','live-boss-before.txt','action-layer-before.txt','previous-source-freeze.json','protocol.json','capture-source.mjs','analyse-native.mjs'].map(file=>'qa/boss-action-owned-cleanup-20261018/'+file)
];
const files=[];for(const file of [...new Set([...prior.files.map(row=>row.file),...previousEvidence,...added])].sort())files.push(await row(file));
for(const old of prior.files)assert.deepEqual(files.find(row=>row.file===old.file),old,'Previous frozen record changed: '+old.file);
for(const[file,before]of [['work/dead-signal-game/dist/qa-boss-action-layer.js','legacy-helper-before.txt'],['work/dead-signal-game/dist/boss-rig/live-boss.js','live-boss-before.txt'],['work/dead-signal-game/dist/boss-rig/boss-action-layer.js','action-layer-before.txt']])assert.deepEqual({...await row('qa/boss-action-owned-cleanup-20261018/'+before),file},files.find(row=>row.file===file));
const protection=JSON.parse(await readFile(new URL('../player-runtime-recoil-20261018/source-before.json',qa),'utf8'));
for(const saved of [...protection.modules,...protection.models])assert.deepEqual(await row(saved.file),saved);
if(process.argv[4])assert.deepEqual(files,JSON.parse(await readFile(new URL(process.argv[4],qa),'utf8')).files);
const report={stage:process.argv[2]??'freeze',count:files.length,files,previous517Exact:true,previousCompletedEvidence:previousEvidence.length,protectedOriginalRecords:22,allProtectedExact:true,productIntegration:false};
await writeFile(new URL(process.argv[3]??'source-freeze.json',qa),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({count:files.length,previous517Exact:true,allProtectedExact:true,productIntegration:false}));
