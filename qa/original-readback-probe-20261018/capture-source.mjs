import {readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const qa=new URL('./',import.meta.url),root=new URL('../../',import.meta.url),prior=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8'));
const allowed=['work/dead-signal-game/dist/qa-canvas-state-combat.js','work/dead-signal-game/dist/qa-player-rig.js'];
const added=['work/dead-signal-game/dist/qa-canvas-readback-probe.js',...['qa-original-readback-probe.test.mjs','qa-original-readback-combat.test.mjs','qa-original-readback-ui.test.mjs'].map(file=>'work/dead-signal-game/tests/'+file),...['prepare.mjs','integrate.mjs','capture-source.mjs','combat-harness-before.txt','combat-fixture-before.txt','qa-ui-script-before.txt','previous-source-freeze.json','start.json','protocol.json','review.json','helper-source-review.json','focused-test-review.json'].map(file=>'qa/original-readback-probe-20261018/'+file)];
async function row(file){const url=new URL(file,root),hash=createHash('sha256');for await(const bytes of createReadStream(url))hash.update(bytes);return{file,bytes:(await stat(url)).size,sha256:hash.digest('hex')};}
const files=[];for(const file of[...new Set([...prior.files.map(row=>row.file),...added])].sort())files.push(await row(file));
const changed=prior.files.filter(old=>{const current=files.find(row=>row.file===old.file);return current.bytes!==old.bytes||current.sha256!==old.sha256;}).map(row=>row.file).sort();assert.deepEqual(changed,[...allowed].sort(),'only the isolated QA harness and appended UI may differ');
for(const[file,before]of[[allowed[0],'combat-harness-before.txt'],[allowed[1],'qa-ui-script-before.txt']]){const saved=await row('qa/original-readback-probe-20261018/'+before),old=prior.files.find(row=>row.file===file);assert.equal(saved.bytes,old.bytes);assert.equal(saved.sha256,old.sha256);}
const ui=await readFile(new URL(allowed[1],root)),beforeUI=await readFile(new URL('qa-ui-script-before.txt',qa));assert.ok(ui.subarray(0,beforeUI.length).equals(beforeUI),'entire190616-byte QA prefix remains exact');
const protection=JSON.parse(await readFile(new URL('../player-runtime-recoil-20261018/source-before.json',qa),'utf8'));for(const saved of[...protection.modules,...protection.models])assert.deepEqual(await row(saved.file),saved);
const report={stage:process.argv[2]||'capture',count:files.length,files,previous457Changed:changed,allowedQAChanges:allowed,oldQAPrefixBytes:beforeUI.length,oldQAPrefixExact:true,protectedOriginalRecords:22,allProtectedExact:true};
await writeFile(new URL(process.argv[3]||'source-freeze.json',qa),JSON.stringify(report,null,2)+'\n');if(process.argv[4])assert.deepEqual(files,JSON.parse(await readFile(new URL(process.argv[4],qa),'utf8')).files,'source changed during QA');console.log(JSON.stringify({stage:report.stage,count:files.length,changed,oldQAPrefixExact:true,allProtectedExact:true}));
