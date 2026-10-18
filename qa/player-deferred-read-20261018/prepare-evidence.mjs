import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),qa=new URL('./',import.meta.url);
await mkdir(qa,{recursive:true});
const pairs=[['work/dead-signal-game/dist/qa-canvas-state-combat.js','combat-harness-before.txt'],['work/dead-signal-game/dist/qa-player-rig.js','qa-ui-script-before.txt'],['work/dead-signal-game/tests/qa-canvas-state-combat.test.mjs','combat-fixture-before.txt']];
const copies=[];
for(const[source,target]of pairs){const bytes=await readFile(new URL(source,root));await writeFile(new URL(target,qa),bytes,{flag:'wx'});copies.push({source,target,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await copyFile(new URL('../player-alpha-rows-20261018/source-freeze.json',qa),new URL('previous-source-freeze.json',qa));
await writeFile(new URL('before-copies.json',qa),JSON.stringify(copies,null,2)+'\n',{flag:'wx'});
await writeFile(new URL('start.json',qa),JSON.stringify({startedUTC:'2026-10-18T05:48:01Z',deadline:'2026-10-19T00:00:00+09:00',task:'QA-only defer original player body Canvas fullRGBA read and pure bounds/core calculation until after armed colour GL render and composition',defaultProductChanged:false,gateDeclaredBeforeMeasurement:{wholeCanvas:'strict exact AA/AB/BA',game:'literal80 frame/effects/motion/events/commands/twoRNG comparisons',usage:'fresh owned unprimed original/deferred/original; B>=40 and zero fallback/unexpected/ownerMismatch',total:'preparation+callback40+finalReadback >=3% lower than fasterA',first:'callback0 no worse than eitherA',steady:'last30 callback median/p95/max/sum no worse than eitherA',tails:'all40 and drain41 p95/max no worse than eitherA',cleanup:'all owned handles/models/records retired, original owners/images/cache/saves untouched'},noNewMeshyRequests:true,noPublication:true,noKeyStorage:true,rootSoleCPUAndGPUExecutor:true},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(copies));
