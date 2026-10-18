const APPLY=Reflect.apply,OWN=Object.getOwnPropertyDescriptor;
const RESOLVE=Promise.resolve,THEN=Promise.prototype.then;
const MAX_COUNT=Number.MAX_SAFE_INTEGER;

export const OWNED_CLEANUP_NOTE='Event-driven QA-owned cleanup bookkeeping only. Register each owned Promise before wait, or synchronously/asynchronously within a retirement that has not yet completed. Promise/thenable identity is deduplicated across this tracker: only its first accepted retirement runs. A fulfilled/rejected producer is not complete until its retirement (including any returned Promise and newly registered followers) finishes. Producer rejection alone is not a cleanup failure. Capacity is a lifetime entry bound, including completed entries; rejected capacity registrations are not observed and remain the caller\'s cleanup responsibility. The first wait uses one overall deadline with no polling and returns one fixed immutable report. Timeout does not cancel producer/retirement Promises; already accepted and later capacity-eligible followers continue best-effort, and later snapshots may differ from that fixed wait result. Work registered after an already completed wait cannot retroactively change its result. Reports retain primitive labels/status only, not values, raw errors, resources or Promises. This tracker performs no rendering, Game, storage or GPU operation.';

const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
function own(value,key){try{const d=object(value)?OWN(value,key):null;return d&&'value'in d?d.value:undefined;}catch{return undefined;}}
function primitive(value){return value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number'&&Number.isFinite(value);}
function labelOf(label){const result={arm:null,kind:null,key:null};for(const key of ['arm','kind','key']){const value=own(label,key);if(primitive(value))result[key]=typeof value==='string'?value.slice(0,120):value;}return result;}
function message(error){const value=typeof error==='string'?error:own(error,'message');return typeof value==='string'?value.slice(0,180):'cleanup observation or retirement failed';}
function increment(value){return value<MAX_COUNT?value+1:value;}
function freezeReport(report){for(const entry of report.entries){Object.freeze(entry.label);Object.freeze(entry);}for(const entry of report.pending){Object.freeze(entry.label);Object.freeze(entry);}for(const error of report.errors){if(error.label)Object.freeze(error.label);Object.freeze(error);}Object.freeze(report.entries);Object.freeze(report.pending);Object.freeze(report.errors);Object.freeze(report.wait);return Object.freeze(report);}

/** Each tracker is one bounded owned-resource cleanup job, not a scheduler. */
export function createOwnedCleanupTracker({now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,timeoutMs=15000,maxEntries=256}={}){
 const deadlineMs=typeof timeoutMs==='number'&&Number.isFinite(timeoutMs)?Math.max(1,Math.min(60000,Math.floor(timeoutMs))):15000;
 const capacity=typeof maxEntries==='number'&&Number.isFinite(maxEntries)?Math.max(1,Math.min(256,Math.floor(maxEntries))):256;
 const seen=new WeakMap(),entries=[],active=new Set(),errors=[];
 let scheduled=0,settled=0,callbackEntered=0,completed=0,fulfilled=0,rejected=0,retireFailed=0,duplicates=0,overflowed=0,invalid=0,observerFailures=0,totalErrors=0,lateRegistrations=0;
 let overflow=false,timedOut=false,waitStarted=false,waitResolved=false,startedAt=null,deadlineAt=null,waitPromise=null,resolveWait=null,waitResult=null,timer=null;
 let timersScheduled=0,timersCleared=0,timersFired=0,timerCleanupComplete=true;

 function error(stage,error,entry=null,observer=false){
  totalErrors=increment(totalErrors);if(observer)observerFailures=increment(observerFailures);
  if(errors.length<32)errors.push({stage,entryId:entry?.id??null,label:entry?{...entry.label}:null,message:message(error)});
 }
 function clock(stage){try{if(typeof now!=='function')throw new Error('clock is not callable');const value=APPLY(now,undefined,[]);if(typeof value!=='number'||!Number.isFinite(value))throw new Error('clock returned a non-finite value');return value;}catch(cause){error(stage,cause,null,true);return null;}}
 function status(){return timedOut?'timeout':overflow?'overflow':retireFailed?'retire-failed':observerFailures||invalid?'observer-failed':active.size?'pending':'complete';}
 function snapshotAt(at){
  const elapsedMs=at!==null&&startedAt!==null&&Number.isFinite(at-startedAt)?Math.max(0,at-startedAt):waitStarted?null:0;
  const list=entries.map(entry=>({id:entry.id,label:{...entry.label},status:entry.status,fulfilled:entry.fulfilled}));
  return freezeReport({complete:active.size===0,success:active.size===0&&completed===scheduled&&!timedOut&&!overflow&&!retireFailed&&!observerFailures&&!invalid&&timerCleanupComplete,status:status(),timedOut,overflow,capacity,scheduled,settled,callbackEntered,completed,active:active.size,fulfilled,rejected,retireFailed,duplicates,overflowed,invalid,observerFailures,totalErrors,lateRegistrations,entries:list,pending:list.filter(entry=>entry.status==='pending'||entry.status==='retiring').map(entry=>({...entry,label:{...entry.label}})),errors:errors.map(entry=>({...entry,label:entry.label?{...entry.label}:null})),wait:{started:waitStarted,finished:waitResolved,timeoutMs:deadlineMs,startedAt,deadlineAt,elapsedMs,timerActive:!!timer?.armed,timersScheduled,timersCleared,timersFired,timerCleanupComplete},note:OWNED_CLEANUP_NOTE});
 }
 function snapshot(){return snapshotAt(waitStarted?clock('snapshot.clock'):null);}
 function clearOwnTimer(){
  const token=timer;timer=null;if(!token||!token.armed)return;token.armed=false;
  try{if(typeof clearTimer!=='function')throw new Error('clearTimer is not callable');APPLY(clearTimer,undefined,[token.handle]);timersCleared=increment(timersCleared);}catch(cause){timerCleanupComplete=false;error('timer.clear',cause,null,true);}
  token.handle=null;
 }
 function finishWait(){
  if(!waitStarted||waitResolved)return;
  waitResolved=true;clearOwnTimer();const at=clock('wait.completion.clock');
  // A synchronous retirement can overrun while the event loop delays its timer.
  if(at!==null&&deadlineAt!==null&&at>=deadlineAt)timedOut=true;
  if(at!==null&&startedAt!==null&&at<startedAt)error('wait.completion.clock','clock moved backwards',null,true);
  waitResult=snapshotAt(at);const finish=resolveWait;resolveWait=null;finish(waitResult);
 }
 function finish(entry,failed,cause){
  if(entry.status!=='retiring')return;
  entry.retire=null;entry.status=failed?'retire-failed':'completed';completed=increment(completed);
  if(failed){retireFailed=increment(retireFailed);error('retire',cause,entry);}
  active.delete(entry);if(!active.size&&waitStarted&&!waitResolved)finishWait();
 }
 function settle(entry,value,isFulfilled){
  if(entry.status!=='pending')return;
  entry.status='retiring';entry.fulfilled=isFulfilled;settled=increment(settled);callbackEntered=increment(callbackEntered);
  if(isFulfilled)fulfilled=increment(fulfilled);else rejected=increment(rejected);
  const retire=entry.retire;entry.retire=null;let result;
  try{result=APPLY(retire,undefined,[value,isFulfilled]);}catch(cause){finish(entry,true,cause);return;}
  if(!object(result)){finish(entry,false);return;}
  try{const retirement=APPLY(RESOLVE,Promise,[result]);APPLY(THEN,retirement,[()=>{finish(entry,false);},cause=>{finish(entry,true,cause);}]);}catch(cause){finish(entry,true,cause);}
 }
 function follow(promise,label,retire){
  if(object(promise)&&seen.has(promise)){duplicates=increment(duplicates);return false;}
  if(!object(promise)||typeof retire!=='function'){invalid=increment(invalid);error('follow.invalid','follow requires an object Promise/thenable and callable retirement',null,true);return false;}
  if(entries.length>=capacity){overflow=true;overflowed=increment(overflowed);if(overflowed===1)error('follow.overflow','cleanup tracker lifetime capacity exceeded');return false;}
  const entry={id:entries.length+1,label:labelOf(label),status:'pending',fulfilled:null,retire};
  seen.set(promise,entry);entries.push(entry);active.add(entry);scheduled=increment(scheduled);if(waitResolved)lateRegistrations=increment(lateRegistrations);
  try{const observed=APPLY(RESOLVE,Promise,[promise]);APPLY(THEN,observed,[value=>{settle(entry,value,true);},cause=>{settle(entry,cause,false);}]);}catch(cause){error('follow.observe',cause,entry,true);settle(entry,cause,false);}
  return true;
 }
 function wait(){
  if(waitPromise)return waitPromise;
  waitPromise=new Promise(resolve=>{resolveWait=resolve;});waitStarted=true;startedAt=clock('wait.clock');deadlineAt=startedAt!==null&&Number.isFinite(startedAt+deadlineMs)?startedAt+deadlineMs:null;
  if(!active.size){finishWait();return waitPromise;}
  if(observerFailures){finishWait();return waitPromise;}
  const token={armed:true,handle:null};timer=token;timersScheduled=increment(timersScheduled);
  try{
   if(typeof setTimer!=='function')throw new Error('setTimer is not callable');
   token.handle=APPLY(setTimer,undefined,[()=>{if(!token.armed||waitResolved)return;token.armed=false;timer=null;timersFired=increment(timersFired);timedOut=true;finishWait();},deadlineMs]);
  }catch(cause){token.armed=false;timer=null;timerCleanupComplete=false;error('timer.set',cause,null,true);finishWait();}
  return waitPromise;
 }
 return{follow,wait,snapshot};
}
