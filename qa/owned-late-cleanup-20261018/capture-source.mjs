import {readFile,writeFile,stat,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const qa=new URL('./',import.meta.url),root=new URL('../../',import.meta.url),prior=JSON.parse(await readFile(new URL('previous-source-freeze.json',qa),'utf8'));
const changedAllowed=['work/dead-signal-game/dist/qa-canvas-state-combat.js','work/dead-signal-game/dist/qa-player-rig.js'].sort();
async function row(file){const url=new URL(file,root),hash=createHash('sha256');for await(const bytes of createReadStream(url))hash.update(bytes);return{file,bytes:(await stat(url)).size,sha256:hash.digest('hex')};}
const added=['work/dead-signal-game/dist/qa-owned-cleanup-tracker.js',...['qa-owned-cleanup-tracker.test.mjs','qa-owned-cleanup-combat.test.mjs','qa-owned-cleanup-ui.test.mjs'].map(file=>'work/dead-signal-game/tests/'+file),...['integrate.mjs','capture-source.mjs','protocol.json','combat-harness-before.txt','qa-ui-script-before.txt','previous-source-freeze.json'].map(file=>'qa/owned-late-cleanup-20261018/'+file)];
const files=[];for(const file of[...new Set([...prior.files.map(row=>row.file),...added])].sort())files.push(await row(file));
const changed=prior.files.filter(old=>{const current=files.find(row=>row.file===old.file);return current.bytes!==old.bytes||current.sha256!==old.sha256;}).map(row=>row.file).sort();assert.deepEqual(changed,changedAllowed);
for(const[file,before]of[[changedAllowed[0],'combat-harness-before.txt'],[changedAllowed[1],'qa-ui-script-before.txt']])assert.deepEqual({...await row('qa/owned-late-cleanup-20261018/'+before),file},prior.files.find(row=>row.file===file));
const ui=await readFile(new URL(changedAllowed[1],root)),beforeUI=await readFile(new URL('qa-ui-script-before.txt',qa));assert.ok(ui.subarray(0,beforeUI.length).equals(beforeUI));
const protection=JSON.parse(await readFile(new URL('../player-runtime-recoil-20261018/source-before.json',qa),'utf8'));for(const saved of[...protection.modules,...protection.models])assert.deepEqual(await row(saved.file),saved);
const report={stage:process.argv[2]??'freeze',files,count:files.length,previous473Changed:changed,oldUIPrefixBytes:beforeUI.length,oldUIPrefixExact:true,protectedOriginalRecords:22,allProtectedExact:true};
if(process.argv[4])assert.deepEqual(files,JSON.parse(await readFile(new URL(process.argv[4],qa),'utf8')).files);
await writeFile(new URL(process.argv[3]??'source-freeze.json',qa),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({count:files.length,changed,oldUIPrefixExact:true,allProtectedExact:true}));
