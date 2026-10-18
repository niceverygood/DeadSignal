import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BOSS_CATALOG} from '../dist/campaign.js?v=0.29.0';
import {observeBossFoldPeaks} from '../dist/qa-boss-fold-peaks.js';
import {compareBossActionLayerOwned} from '../dist/qa-boss-action-owned.js';
import {createQAStorage} from '../dist/qa-storage.js';
import {undoFoldWorker} from '../../../qa/boss02-fold-profile-20261018/undo-fold-worker.mjs';

// Controlled orchestration/source oracle only: no actual GLB, Canvas RGBA,
// WebGL, natural-motion, performance or product-adoption claim.
const boss=BOSS_CATALOG.find(value=>value.id==='boss-02-final');
const PROFILE='boss02-fold-v1';
const address=()=>new URL('http://localhost:8851/qa-player-rig.html?qa=1&qa-memory=fold-tests&qa-boss-owned-cleanup=1&qa-boss-action-timeline=1&qa-boss02-fold=1');
function frozen(value){if(value===null||typeof value!=='object')return;assert.ok(Object.isFrozen(value));for(const child of Object.values(value))frozen(child);}
function primitiveDTO(value,forbidden){if(value===null||typeof value!=='object'){assert.ok(value===null||['string','boolean'].includes(typeof value)||typeof value==='number'&&Number.isFinite(value));return;}assert.equal(forbidden.has(value),false);assert.ok(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype);for(const d of Object.values(Object.getOwnPropertyDescriptors(value))){assert.ok(Object.hasOwn(d,'value'));primitiveDTO(d.value,forbidden);}}
function fixture(config={}){
 const calls=[],surfaces=[],registered=new Set(),outputs=[],rgba=[new Uint8ClampedArray(512*512*4),new Uint8ClampedArray(512*512*4)],marker=Error('controlled peak interruption');
 const model={actionLayer:{profile:config.profile??PROFILE},originalGeometry:{},originalImage:{}},rig={size:512,models:new Map([[boss.id,model]]),frames:new WeakMap(),renderer:{info:{render:{frame:0}}},bossActionLayerEnabled:false,camera:{},diagnostics:null,current:null};
 const flagBefore=Object.getOwnPropertyDescriptor(rig,'bossActionLayerEnabled');let version=0,reads=0,yields=0,sourceChecks=0,stopped=false;
 const image={width:512,height:512,getContext(kind,options){assert.equal(kind,'2d');assert.deepEqual(options,{willReadFrequently:true});return{getImageData(...args){assert.deepEqual(args,[0,0,512,512]);reads++;return{data:rgba[rig.bossActionLayerEnabled?1:0]};}};}};
 class Renderer{nativeEnemyFrame(actor,time,game,key){
  assert.equal(this,adapter);assert.equal(key,boss);const enabled=rig.bossActionLayerEnabled;rig.current={actor,time,enabled};
  calls.push({actor,time,world:game.world,enabled});rig.renderer.info.render.frame+=config.noGL?0:1;
  if(config.nativeThrowsAt===calls.length)throw config.primary;
  rig.diagnostics={key:boss.id,clip:config.wrongClip?'attack':'windup',continuousSampling:true,clipped:config.clipped===true,bossActionsEnabled:enabled,bossActionsActive:enabled,bossActionsBones:enabled?9:0,bossActionsMaxRadians:enabled?(config.excessAngle?41:.3):0,bossActionsKind:'slam'};
  rgba[enabled?1:0][0]=enabled?7:0;
  const selected={image,metadata:{liveRig:config.nonNative!==true,boundsKind:'alpha'},frame:{alphaBounds:{x:80,y:60,width:280,height:400}},placement:{bounds:{body:{left:1,top:2,right:3,bottom:4}}}};
  rig.frames.set(actor,{selected});if(config.foreignFlagAt===calls.length)Object.defineProperty(rig,'bossActionLayerEnabled',{value:enabled,enumerable:false,writable:true,configurable:true});return selected;
 }}
 const adapter=Object.create(Renderer.prototype),art={original:true},draws=[];
 const document={createElement(tag){assert.equal(tag,'canvas');const canvas={width:0,height:0};surfaces.push(canvas);canvas.getContext=(kind,options)=>{assert.equal(kind,'2d');assert.deepEqual(options,{alpha:true});return{drawImage(...args){assert.ok(registered.has(canvas),'register scratch before any draw');assert.equal(args[0],image);draws.push(args);}};canvas.toDataURL=kind=>{assert.equal(kind,'image/png');assert.equal(calls.length,8);return'data:image/png;base64,CONTROLLED';};return canvas;}};
 const helpers={
  originalModelSnapshot(value){assert.equal(value,model);return{model,version};},
  verifyOriginalModel(saved){sourceChecks++;assert.equal(saved.model,model);if(saved.version!==version)throw marker;return{unchanged:true,bytesCompared:1234};},
  handPoints(value){assert.equal(value,model);return[{bone:{name:'DS_Forearm_0_1'}}];},
  projectedHands(){return[{bone:'DS_Forearm_0_1',kind:'dominant-forearm-skin-vertex',vertexIndex:3,dominantWeight:1,x:rig.current.actor.angle,y:200+(rig.current.enabled?5:0),z:.1}];},
  protectedPoints(){return[{bone:'DS_Root'},{bone:'DS_Foot_0_-1'},{bone:'DS_Foot_0_1'}];},
  protectedPositions(){return[0,0,0,1,0,0,config.feetMismatch&&rig.current.enabled?3:2,0,0];},
  actorFixture(key,id,angle){assert.equal(key,boss);return{id,x:1400,y:900,r:boss.stats.r,hp:boss.stats.hp,angle};},
  layerEvidence(d,enabled,pose,kind){assert.equal(d.bossActionsEnabled,enabled);assert.equal(d.bossActionsActive,enabled);assert.equal(d.clip,pose);assert.equal(kind,'slam');assert.ok(Number.isFinite(d.bossActionsMaxRadians)&&d.bossActionsMaxRadians<=40*Math.PI/180);assert.equal(d.bossActionsBones,enabled?9:0);return{bossActionsEnabled:enabled,bossActionsActive:enabled,bossActionsBones:d.bossActionsBones,bossActionsMaxRadians:d.bossActionsMaxRadians,bossActionsKind:kind};},
  byteDifference(a,b){assert.equal(a.length,512*512*4);assert.equal(b.length,a.length);return{differentComponents:a[0]===b[0]?0:1,maxDelta:Math.abs(a[0]-b[0])};},
  sameNumbers(a,b){return a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));},
  primitive(value){return Object.fromEntries(Object.entries(value).filter(([,item])=>item===null||['boolean','string'].includes(typeof item)||typeof item==='number'&&Number.isFinite(item)));},
 };
 const options={rig,art,adapter,boss,document,Renderer,helpers,check(){if(stopped)throw marker;},wait:value=>Promise.resolve(value),async yieldUI(){yields++;if(config.failAtYield===yields){stopped=true;throw marker;}},registerSurface(surface){registered.add(surface);},onImage(info){outputs.push(info);if(config.sourceMutation)version++;if(config.outputThrows)throw config.primary??marker;}};
 return{options,rig,model,art,image,rgba,calls,surfaces,registered,outputs,draws,marker,flagBefore,get reads(){return reads;},get yields(){return yields;},get sourceChecks(){return sourceChecks;},mutate(){version++;}};
}

test('four original headings use fresh A/B actors, eight native512 peak calls and one owned contact after all samples',async()=>{
 const f=fixture(),report=await observeBossFoldPeaks(f.options);assert.equal(report.complete,true);assert.equal(report.profile,PROFILE);assert.equal(report.nativeSamples,8);assert.equal(report.nativeGLSubmissions,8);assert.equal(report.angles.length,4);assert.equal(f.calls.length,8);assert.equal(f.reads,8);assert.equal(f.yields,4);assert.equal(f.sourceChecks,2);
 assert.equal(new Set(f.calls.map(call=>call.actor)).size,8);assert.equal(new Set(f.calls.map(call=>call.actor.id)).size,8);assert.equal(new Set(f.calls.map(call=>call.world)).size,1);
 for(let angle=0;angle<4;angle++)for(let arm=0;arm<2;arm++){
  const call=f.calls[angle*2+arm];assert.equal(call.enabled,arm===1);assert.equal(call.actor.angle,.35+angle*Math.PI/2);assert.equal(call.actor.attackState,'windup');assert.equal(call.actor.attackTime,boss.skill.windup*(1-.72));assert.equal(call.actor.hitFlash,0);assert.equal(call.actor.dead,false);assert.equal(call.time,50);
  assert.deepEqual(f.draws[angle*2+arm].slice(1),[0,0,512,512,arm*512,angle*512,512,512]);
 }
 assert.equal(f.surfaces.length,1);assert.ok(f.registered.has(f.surfaces[0])&&f.registered.has(f.image));assert.deepEqual(f.surfaces.map(c=>[c.width,c.height]),[[1024,2048]]);assert.equal(f.outputs.length,1);assert.deepEqual([f.outputs[0].key,f.outputs[0].width,f.outputs[0].height],[boss.id,1024,2048]);assert.ok(report.angles.every(row=>row.pose==='windup'&&row.progress===.72&&row.feetAndHipsExact&&row.rgbaDifference.differentComponents===1));
 assert.deepEqual(Object.getOwnPropertyDescriptor(f.rig,'bossActionLayerEnabled'),f.flagBefore);assert.equal(report.flagRestored,true);assert.deepEqual(report.sourceBeforeAfter,{unchanged:true,bytesCompared:1234});frozen(report);primitiveDTO(report,new Set([f.rig,f.model,f.art,f.image,...f.rgba,...f.surfaces,...f.calls.map(c=>c.actor)]));
});

test('profile/native/GL/clip,40degree, alpha and foot failures cannot create a successful peak report',async()=>{
 for(const config of[{profile:'wrong'},{nonNative:true},{noGL:true},{wrongClip:true},{clipped:true},{excessAngle:true},{feetMismatch:true}]){
  const f=fixture(config);await assert.rejects(observeBossFoldPeaks(f.options),error=>{assert.equal(error.bossFoldPeaks.complete,false);frozen(error.bossFoldPeaks);return true;});assert.equal(f.outputs.length,0);assert.deepEqual(Object.getOwnPropertyDescriptor(f.rig,'bossActionLayerEnabled'),f.flagBefore);
 }
});

test('interruption/output failures preserve primary identity and frozen partial proof; callback source mutation is rechecked',async()=>{
 const f=fixture({failAtYield:1});await assert.rejects(observeBossFoldPeaks(f.options),error=>{assert.equal(error,f.marker);assert.equal(error.bossFoldPeaks.angles.length,1);assert.equal(error.bossFoldPeaks.nativeSamples,2);assert.equal(error.bossFoldPeaks.flagRestored,true);frozen(error.bossFoldPeaks);return true;});assert.equal(f.outputs.length,0);
 const primary=Error('original image callback rejected'),g=fixture({outputThrows:true,primary});await assert.rejects(observeBossFoldPeaks(g.options),error=>{assert.equal(error,primary);assert.equal(error.bossFoldPeaks.nativeSamples,8);assert.equal(error.bossFoldPeaks.complete,false);assert.equal(error.bossFoldPeaks.flagRestored,true);return true;});assert.equal(g.outputs.length,1);
 const h=fixture({sourceMutation:true});let partial;await assert.rejects(observeBossFoldPeaks(h.options),error=>{assert.equal(error,h.marker);partial=error.bossFoldPeaks;assert.deepEqual(partial.sourceBeforeAfter,{unchanged:false});assert.ok(partial.cleanupErrors.includes('source-check-failed'));assert.equal(partial.complete,false);return true;});const text=JSON.stringify(partial);h.mutate();assert.equal(JSON.stringify(partial),text);frozen(partial);
 for(const primary of[null,0,undefined]){const p=fixture({nativeThrowsAt:2,primary});let threw=false;try{await observeBossFoldPeaks(p.options);}catch(error){threw=true;assert.equal(error,primary);}assert.equal(threw,true);assert.deepEqual(Object.getOwnPropertyDescriptor(p.rig,'bossActionLayerEnabled'),p.flagBefore);}
});

test('an external same-value flag descriptor survives cleanup and produces an explicit failed restoration',async()=>{
 const f=fixture({foreignFlagAt:1});await assert.rejects(observeBossFoldPeaks(f.options),error=>{assert.equal(error.bossFoldPeaks.flagRestored,false);assert.ok(error.bossFoldPeaks.cleanupErrors.includes('flag-restore-failed'));assert.equal(error.bossFoldPeaks.complete,false);return true;});assert.equal(Object.getOwnPropertyDescriptor(f.rig,'bossActionLayerEnabled').enumerable,false);assert.equal(f.outputs.length,0);
});

test('fold mode requires the exact nested timeline/key/origin/memory flags before owner/DOM/dependency/callback reads',async()=>{
 for(const kind of['origin','fold-flag','timeline-flag','key','keys','forged-memory','key-getter']){
  const url=address();if(kind==='origin')url.port='8806';if(kind==='fold-flag')url.searchParams.delete('qa-boss02-fold');if(kind==='timeline-flag')url.searchParams.delete('qa-boss-action-timeline');
  let reads=0;const poison=()=>{reads++;throw Error('must gate before IO');},options={location:url,query:url.searchParams,storage:kind==='forged-memory'?new Map():createQAStorage(url.searchParams,poison),timelineObservation:true,boss02FoldProfile:true,bossKeys:kind==='key'?['boss-06-final']:kind==='keys'?['boss-02-final','boss-06-final']:['boss-02-final']};
  if(kind==='key-getter')Object.defineProperty(options,'bossKeys',{get:poison});for(const key of['document','testDeps','signal','onImage','onProgress','onTimelineImage','onTimelinePreview','onFoldPeaksImage'])Object.defineProperty(options,key,{get:poison});
  const result=await compareBossActionLayerOwned(new Proxy({},{get:poison,getOwnPropertyDescriptor:poison}),options);assert.equal(result.report.available,false);assert.equal(result.report.complete,false);assert.equal(reads,0,kind);
 }
});

test('six declared opt-in edits reverse to the pinned whole worker; original default and timeline-without-fold reports stay exact',async()=>{
 const folder=new URL('../../../qa/boss02-fold-profile-20261018/',import.meta.url),beforeBytes=await readFile(new URL('worker-before.txt',folder)),before=beforeBytes.toString('utf8'),sourceURL=new URL('../dist/qa-boss-action-owned.js',import.meta.url),source=await readFile(sourceURL,'utf8');
 assert.equal(beforeBytes.length,45435);assert.equal(createHash('sha256').update(beforeBytes).digest('hex'),'6c592b3ade5ca836c8afd6251eca1c92ce622e9ce317b7d3ef49881b815fb3e9');
 const gate=" const foldEnabled=timelineEnabled&&descriptor(options,'boss02FoldProfile')?.value===true;\n if(foldEnabled&&query.get('qa-boss02-fold')!=='1')return{report:{available:false,complete:false,reason:'boss02-fold-gate-required'}};\n";
 const hook=[
  '  if(foldEnabled){',
  "   const {observeBossFoldPeaks}=await wait(import('./qa-boss-fold-peaks.js')),image=descriptor(options,'onFoldPeaksImage');need(!image||Object.hasOwn(image,'value')&&typeof image.value==='function','fold-peaks-data-callback-required');",
  "   try{foldPeakObservation=await wait(observeBossFoldPeaks({rig,art,adapter,boss:finals[0],document,check,wait,yieldUI,registerSurface:surface=>{need(!protectedResources.has(surface),'owned-fold-peaks-surface-required');ownedSurfaces.add(surface);},onImage:image?.value,Renderer,helpers:{originalModelSnapshot,verifyOriginalModel,handPoints,projectedHands,protectedPoints,protectedPositions,actorFixture,layerEvidence,byteDifference,sameNumbers,primitive}}));check();}",
  "   catch(error){let partial;try{partial=error&&descriptor(error,'bossFoldPeaks')?.value;}catch{}foldPeakObservation=partial||{complete:false,error:errorText(error)};throw error;}",
  '  }',
 ].join('\n')+'\n';
 const changes=[[gate,''],[' let foldPeakObservation=null;\n',''],["new LiveBossRig(foldEnabled?{size:SIZE,bossActionProfile:'boss02-fold-v1'}:{size:SIZE})","new LiveBossRig({size:SIZE})"],["   if(foldEnabled)need(rig.models.get(finals[0].id)?.actionLayer?.profile==='boss02-fold-v1','boss02-fold-profile-required');\n",''],[hook,''],["...(foldEnabled?{candidateProfile:'boss02-fold-v1',foldPeakObservation}:{}),",'']];
 let restored=source;for(const[changed,original]of changes){assert.equal(restored.split(changed).length,2,'one declared fold edit');restored=restored.replace(changed,original);}assert.equal(restored,before,'whole original worker bytes, including helpers and8458-character quality loop, stay exact outside six declared opt-in edits');assert.equal(undoFoldWorker(source),before);assert.throws(()=>undoFoldWorker(before),/six-edit-inverse-mismatch/);assert.throws(()=>undoFoldWorker(null),TypeError);
 const old=await import('data:text/javascript;base64,'+Buffer.from(before.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_all,quote,path)=>'from '+quote+new URL(path,sourceURL).href+quote)).toString('base64'));
 async function aborted(run,timeline){const url=address(),controller=new AbortController();controller.abort();const log=[],query={has(key){log.push('has:'+key);return url.searchParams.has(key);},get(key){log.push('get:'+key);return url.searchParams.get(key);}},options={location:url,query,storage:createQAStorage(url.searchParams,()=>assert.fail('save')),signal:controller.signal,document:{createElement(){assert.fail('aborted before DOM');}}};if(timeline)Object.assign(options,{timelineObservation:true,bossKeys:['boss-02-final']});for(const key of['boss02FoldProfile','onFoldPeaksImage'])Object.defineProperty(options,key,{get(){assert.fail('non-opt-in accessor called');}});let error;try{await run({},options);}catch(cause){error=cause;}assert.match(error.message,/aborted/);assert.equal(Object.hasOwn(error.bossActionLayerQA,'foldPeakObservation'),false);assert.equal(Object.hasOwn(error.bossActionLayerQA,'candidateProfile'),false);return{report:error.bossActionLayerQA,log};}
 for(const timeline of[false,true])assert.deepEqual(await aborted(compareBossActionLayerOwned,timeline),await aborted(old.compareBossActionLayerOwned,timeline));
});
