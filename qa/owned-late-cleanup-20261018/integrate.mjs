import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const qa=new URL('./',import.meta.url),file=new URL('../../work/dead-signal-game/dist/qa-canvas-state-combat.js',qa);
let source=await readFile(file,'utf8');
assert.equal(source,await readFile(new URL('combat-harness-before.txt',qa),'utf8'));
function replace(before,after,count=1){before=before.replaceAll('\n','\r\n');after=after.replaceAll('\n','\r\n');assert.equal(source.split(before).length,count+1,before.slice(0,120));source=source.replace(before,after);}
replace("originalReadbackProbe=ownData(options,'originalReadbackProbe')===true,arms=", "originalReadbackProbe=ownData(options,'originalReadbackProbe')===true,boundedOwnedCleanup=ownData(options,'boundedOwnedCleanup')===true,arms=");
replace("if(!passedGate(location,query,storage,originalReadbackProbe?", "if(boundedOwnedCleanup&&(!originalReadbackProbe||query?.get('qa-owned-cleanup')!=='1'))return{report:{available:false,complete:false,reason:'8851-genuine-memory-qa-required'}};\n if(!passedGate(location,query,storage,originalReadbackProbe?");
replace("let finished=false,primary=null,abortReject,probeOriginalReadback=null;", "let finished=false,primary=null,abortReject,probeOriginalReadback=null,cleanupTracker=null;\n const followedOwners=new WeakMap();");
replace("if(entry.closed){cleanup.lateSettled++;operation('late.arm',()=>retire(entry,true));}", "if(entry.closed&&!boundedOwnedCleanup){cleanup.lateSettled++;operation('late.arm',()=>retire(entry,true));}",2);
// The same settlement body occurs once on each side of the legacy handler.
replace("if(entry.closed){cleanup.lateSettled++;operation('late.arm',()=>retire(entry,true));}", "if(entry.closed&&!boundedOwnedCleanup){cleanup.lateSettled++;operation('late.arm',()=>retire(entry,true));}");
replace("function operation(where,fn){", `function followOwned(promise,entry,kind,key,retireValue){
  if(!promise||typeof promise.then!=='function'||entry.followed.has(promise))return;
  entry.followed.add(promise);const owner=followedOwners.get(promise);
  if(owner&&owner!==entry){cleanupError('late.shared-owner',Error('qa-owned-cleanup-shared-promise-owner'));return;}
  followedOwners.set(promise,entry);cleanupTracker.follow(promise,{arm:entry.arm,kind,key:String(key)},retireValue);
 }
 function operation(where,fn){`);
replace("entry.followed.add(promise);cleanup.lateScheduled++;\n   const settled=", `if(boundedOwnedCleanup){followOwned(promise,entry,kind,key,()=>{retireRig(rig,entry,kind);for(const [alias,value]of rig.pending instanceof Map?rig.pending:[])if(value===promise)rig.pending.delete(alias);});continue;}
   entry.followed.add(promise);cleanup.lateScheduled++;
   const settled=`);
replace("entry.followed.add(promise);cleanup.lateScheduled++;const settled=", "if(boundedOwnedCleanup){followOwned(promise,entry,'player','pending-load',()=>retirePlayer(player,entry));continue;}\n    entry.followed.add(promise);cleanup.lateScheduled++;const settled=");
replace("cleanup.lateScheduled+=entry.pending.size;", "if(boundedOwnedCleanup){for(const promise of entry.pending)followOwned(promise,entry,'arm','awaited-work',()=>retire(entry,true));}else cleanup.lateScheduled+=entry.pending.size;");
replace("entry.followed.add(promise);cleanup.lateScheduled++;Promise.resolve(promise).then(value=>", "if(boundedOwnedCleanup){followOwned(promise,entry,'renderer',key,(value,fulfilled)=>{if(fulfilled){if(key==='livePlayerPromise')retirePlayer(value,entry);else retireRig(value,entry,'late.'+key);}});continue;}\n     entry.followed.add(promise);cleanup.lateScheduled++;Promise.resolve(promise).then(value=>");
replace("if(originalReadbackProbe){probeOriginalReadback=", `if(boundedOwnedCleanup){
   const factory=deps.createOwnedCleanupTracker??(await waiting(import('./qa-owned-cleanup-tracker.js'),'owned-cleanup-module')).createOwnedCleanupTracker;check();
   if(typeof factory!=='function')throw Error('qa-owned-cleanup-factory-required');
   cleanupTracker=factory({...deps.ownedCleanupTestOptions,timeoutMs:report.injected?(deps.ownedCleanupTestOptions?.timeoutMs??15000):15000});
   report.boundedOwnedCleanup=true;report.note='Opt-in qa-owned-cleanup=1 plus own-data boundedOwnedCleanup:true: event-driven owned late-load retirement with one15second overall cleanup deadline outside all preparation/callback/readback timings. Original pixel and Game gates remain exact. A finalized primitive cleanup snapshot never changes after timeout; installed handlers may retire late resources best-effort. No optimization acceptance. '+report.note;
  }
  if(originalReadbackProbe){probeOriginalReadback=`);
replace("for(const entry of owned)operation('arm.retire',()=>retire(entry));\n  operation('main.owner-proof'", `for(const entry of owned)operation('arm.retire',()=>retire(entry));
  if(boundedOwnedCleanup){
   try{cleanup.drain=cleanupTracker?await cleanupTracker.wait():{complete:false,reason:'tracker-not-created'};}catch(error){cleanupError('late.drain',error);cleanup.drain={complete:false,reason:'wait-failed'};}
   const drain=cleanup.drain;cleanup.lateScheduled=drain.scheduled??0;cleanup.lateSettled=drain.completed??0;
   for(const entry of owned){const row=cleanup.arms.find(row=>row.arm===entry.arm),renderer=entry.renderer;if(!row)continue;
    row.ownedRecordsRemaining=entry.art?.records?.size??0;row.npcModelsRemaining=renderer?.liveEnemies?.models?.size??0;row.bossModelsRemaining=renderer?.liveBoss?.models?.size??0;row.playerModelsRemaining=renderer?.livePlayer?.models?.size??0;
    row.npcPendingRemaining=renderer?.liveEnemies?.pending?.size??0;row.bossPendingRemaining=renderer?.liveBoss?.pending?.size??0;row.playerWeaponsRemaining=renderer?.livePlayer?.weapons?.size??0;row.playerWeaponLoadsRemaining=renderer?.livePlayer?.weaponLoads?.size??0;row.latePending=entry.pending.size;
    row.canvasReleased=entry.canvas.width===0&&entry.canvas.height===0;row.finalAfterDrain=true;
   }
  }
  operation('main.owner-proof'`);
replace("if(originalAttribution)cleanup.complete=cleanup.complete&&cleanup.arms.every", "if(boundedOwnedCleanup)cleanup.complete=cleanup.complete&&cleanup.drain?.success===true&&cleanup.arms.every(arm=>arm.finalAfterDrain&&arm.npcPendingRemaining===0&&arm.bossPendingRemaining===0&&arm.playerWeaponsRemaining===0&&arm.playerWeaponLoadsRemaining===0&&arm.latePending===0);\n  if(originalAttribution)cleanup.complete=cleanup.complete&&cleanup.arms.every");
replace("if(primary){try{Object.defineProperty(primary,'report'", "if(boundedOwnedCleanup){const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};report.cleanup=freeze(JSON.parse(JSON.stringify(cleanup)));}\n if(primary){try{Object.defineProperty(primary,'report'");
replace("Object.defineProperty(primary,'cleanup',{value:cleanup,", "Object.defineProperty(primary,'cleanup',{value:report.cleanup,");
await writeFile(file,source);
console.log('opt-in owned cleanup integrated; legacy branches retained');
