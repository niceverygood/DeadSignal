import {readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const qa=new URL('./',import.meta.url),root=new URL('../../',import.meta.url),prior=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8'));
async function row(file){const url=new URL(file,root),hash=createHash('sha256');for await(const bytes of createReadStream(url))hash.update(bytes);return{file,bytes:(await stat(url)).size,sha256:hash.digest('hex')};}
const allowed=['work/dead-signal-game/dist/qa-canvas-state-combat.js','work/dead-signal-game/dist/qa-player-rig.js'].sort();
const added=[...['qa-deferred-bounded-combat.test.mjs','qa-deferred-bounded-ui.test.mjs'].map(file=>'work/dead-signal-game/tests/'+file),...['combat-harness-before.txt','qa-ui-script-before.txt','previous-source-freeze.json','capture-source.mjs','protocol.json','protocol-review.json'].map(file=>'qa/deferred-read-bounded-cost-20261018/'+file)];
const files=[];for(const file of[...new Set([...prior.files.map(row=>row.file),...added])].sort())files.push(await row(file));
const changed=prior.files.filter(old=>{const current=files.find(row=>row.file===old.file);return current.bytes!==old.bytes||current.sha256!==old.sha256;}).map(row=>row.file).sort();assert.deepEqual(changed,allowed);
for(const[file,before]of[[allowed[0],'combat-harness-before.txt'],[allowed[1],'qa-ui-script-before.txt']])assert.deepEqual({...await row('qa/deferred-read-bounded-cost-20261018/'+before),file},prior.files.find(row=>row.file===file));
const beforeUI=await readFile(new URL('qa-ui-script-before.txt',qa)),ui=await readFile(new URL(allowed[1],root));assert.ok(ui.subarray(0,beforeUI.length).equals(beforeUI));
const protection=JSON.parse(await readFile(new URL('../player-runtime-recoil-20261018/source-before.json',qa),'utf8'));for(const saved of[...protection.modules,...protection.models])assert.deepEqual(await row(saved.file),saved);
const report={stage:process.argv[2]??'freeze',count:files.length,files,previous496Changed:changed,oldUIPrefixBytes:beforeUI.length,oldUIPrefixExact:true,protectedOriginalRecords:22,allProtectedExact:true};if(process.argv[4])assert.deepEqual(files,JSON.parse(await readFile(new URL(process.argv[4],qa),'utf8')).files);
await writeFile(new URL(process.argv[3]??'source-freeze.json',qa),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({count:files.length,changed,oldUIPrefixExact:true,allProtectedExact:true}));
