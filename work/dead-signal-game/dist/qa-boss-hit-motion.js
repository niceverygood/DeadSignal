import {Game,WEAPONS} from './engine.js?v=0.29.0';
import {getBoss} from './campaign.js?v=0.29.0';
import {Renderer} from './renderer.js';
import {ProductionArt} from './production-art.js?v=0.29.0';
import {LiveBossRig} from './boss-rig/live-boss.js';
import {Cache} from './player-rig/vendor/three.module.js';
import {isQAMemoryStorage} from './qa-storage.js';
import {inspectOriginalBossPoses} from './qa-boss-pose-audit.js';

const active=new WeakSet(),ownerKeys=['productionArt','liveBoss','liveBossPromise','liveEnemies','liveEnemiesPromise','liveEnemiesLoading'];
const objectLike=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const sameDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));
const text=error=>{try{return typeof error?.message==='string'?error.message:'boss-hit-motion-failed';}catch{return'boss-hit-motion-failed';}};
const primitiveDiagnostics=diagnostics=>Object.fromEntries(Object.entries(diagnostics??{}).filter(([,value])=>value===null||['string','boolean'].includes(typeof value)||typeof value==='number'&&Number.isFinite(value)));
const difference=(a,b)=>{let different=0,maxDelta=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)different++;maxDelta=Math.max(maxDelta,d);}return{different,maxDelta};};
function hashBytes(bytes){let hash=2166136261;for(const value of bytes)hash=Math.imul(hash^value,16777619);return(hash>>>0).toString(16).padStart(8,'0');}
function boneHash(model){const buffer=new ArrayBuffer(8),view=new DataView(buffer);let hash=2166136261,count=0;for(const bone of model?.bones??[])for(const value of [...bone.position.toArray(),...bone.quaternion.toArray(),...bone.scale.toArray()]){view.setFloat64(0,value,true);for(let n=0;n<8;n++)hash=Math.imul(hash^view.getUint8(n),16777619);count++;}return{hash:(hash>>>0).toString(16).padStart(8,'0'),boneCount:model?.bones?.length??0,components:count};}
const runtime=(game,boss)=>JSON.stringify({time:game.time,state:game.state,player:game.player,boss:{id:boss.id,x:boss.x,y:boss.y,hp:boss.hp,stun:boss.stun,hitFlash:boss.hitFlash,walkPhase:boss.walkPhase,attackState:boss.attackState,attackTime:boss.attackTime,skillCd:boss.skillCd,dead:boss.dead},events:game.events,random:game.random.getState(),visualRandom:game.visualRandom.getState()});

export function allowBossHitMotion(location,query,storage){return location?.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&location.port==='8851'&&query?.has('qa')&&query.has('qa-memory')&&isQAMemoryStorage(storage);}

// The corridor is searched in the original generated world. No obstacles,
// navigation, HP, invulnerability, bullet damage, ammunition or AI are replaced.
function clearPositions(game,radius){
 const distance=270;
 for(let y=180;y<game.world.height-180;y+=70)for(let x=180;x<game.world.width-180;x+=70)for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const bx=x+Math.cos(angle)*distance,by=y+Math.sin(angle)*distance;if(game.blocked(x,y,game.player.r+2)||game.blocked(bx,by,radius+3))continue;
  let clear=true;for(let n=0;n<=18;n++)if(game.blocked(x+(bx-x)*n/18,y+(by-y)*n/18,radius+3)){clear=false;break;}
  if(clear)return{player:{x,y},boss:{x:bx,y:by},distance};
 }
 throw Error('boss-hit-motion-original-clear-corridor-unavailable');
}

export async function inspectBossHitMotion(renderer,{storage,location=globalThis.location,query=new URLSearchParams(location?.search??''),signal,onProgress=()=>{},onImage=()=>{}}={}){
 if(!allowBossHitMotion(location,query,storage))throw Error('boss-hit-motion-memory-origin-required');
 if(!objectLike(renderer)||active.has(renderer))throw Error('boss-hit-motion-already-active');
 if(signal?.aborted)throw Error('boss-hit-motion-aborted');
 if(Cache.enabled!==false)throw Error('boss-hit-motion-independent-image-cache-required');
 const owners=new Map(ownerKeys.map(key=>[key,Object.getOwnPropertyDescriptor(renderer,key)]));for(const descriptor of owners.values())if(descriptor&&!('value'in descriptor))throw Error('boss-hit-motion-data-owner-required');
 const originalArt=owners.get('productionArt')?.value;if(!originalArt?.manifest)throw Error('boss-hit-motion-original-manifest-required');
 const controller=new AbortController(),cleanup={modelsRemaining:null,recordsRemaining:null,rawAlphaBytes:0,lateReleasesScheduled:0,lateReleasesSettled:0,errors:[],mainOwnerDescriptorsUnchanged:false,externalOwnerPreserved:false,complete:false},combats=[];let art=null,rig=null,adapter=null,finished=false,completed=false,released=false,rejectCancelled;
 const cancelled=new Promise((resolve,reject)=>{rejectCancelled=reject;});cancelled.catch(()=>{});
 const ownersCurrent=()=>ownerKeys.every(key=>sameDescriptor(Object.getOwnPropertyDescriptor(renderer,key),owners.get(key)));
 const check=()=>{if(finished||controller.signal.aborted||signal?.aborted)throw Error('boss-hit-motion-aborted');if(!ownersCurrent())throw Error('boss-hit-motion-main-owner-changed');if(rig&&(rig.lost||rig.error))throw Error(rig.error||'boss-hit-motion-owned-context-lost');};
 const wait=promise=>Promise.race([Promise.resolve(promise),cancelled]);
 const cleanupError=(where,error)=>cleanup.errors.push({where,error:text(error)});
 function release(){
  if(released)return;released=true;const pending=[];try{pending.push(...(rig?.pending?.values?.()??[]));}catch(error){cleanupError('pending',error);}try{for(const record of art?.records?.values?.()??[])if(record.promise)pending.push(record.promise);}catch(error){cleanupError('record.pending',error);}
  for(const [label,operation]of [['art.release',()=>art?.releaseUnusedAssets([])],['rig.release',()=>rig?.releaseUnused([])],['rig.alpha',()=>rig?.releaseExactGPUAlpha?.()],['renderer.dispose',()=>rig?.renderer.dispose()],['renderer.context-loss',()=>rig?.renderer.forceContextLoss()]])try{operation();}catch(error){cleanupError(label,error);}
  cleanup.recordsRemaining=art?.records.size??0;cleanup.modelsRemaining=rig?.models.size??0;cleanup.rawAlphaBytes=rig?.gpuAlphaBounds?.rawBytes||0;cleanup.lateReleasesScheduled=pending.length;
  for(const promise of pending)Promise.resolve(promise).then(()=>{try{rig?.releaseUnused([]);art?.releaseUnusedAssets([]);}catch(error){cleanupError('late.release',error);}cleanup.lateReleasesSettled++;cleanup.modelsRemaining=rig?.models.size??0;cleanup.recordsRemaining=art?.records.size??0;},()=>{cleanup.lateReleasesSettled++;});
 }
 const abort=()=>{if(finished||controller.signal.aborted)return;controller.abort();release();rejectCancelled(Error('boss-hit-motion-aborted'));};
 async function load(key){
  check();const mapping=art.manifest.bosses?.[key],ids=[...new Set(typeof mapping==='string'?[mapping]:Object.values(mapping??{}))];if(!ids.length||ids.length>2)throw Error('boss-hit-motion-two-original-atlases-required');
  rig.releaseUnused([key]);art.releaseUnusedAssets(ids);const ready=await wait(Promise.all([rig.load(key),...ids.map(id=>art.load(id))]));check();if(!ready.every(Boolean)||!rig.models.has(key)||!ids.every(id=>art.isReady(id)))throw Error('boss-hit-motion-original-load-failed');return ids;
 }
 function bodyPixels(image,read){read.width=read.height=512;const context=read.getContext('2d',{willReadFrequently:true});if(!context)throw Error('boss-hit-motion-read-canvas-required');context.clearRect(0,0,512,512);context.drawImage(image,0,0);return context.getImageData(0,0,512,512).data;}
 async function combat(role,sustained){
  check();const game=new Game({seed:774,missionId:'mission-01',weapon:'nailgun'}),catalog=getBoss(game.mission[role==='mid'?'midBoss':'finalBoss']),positions=clearPositions(game,catalog.stats.r),initialPlayer={hp:game.player.hp,maxHp:game.player.maxHp,invul:game.player.invul,ammo:game.player.ammo,maxAmmo:game.player.maxAmmo},initialEnemies=game.enemies.length,initialSpawnClock=game.spawnClock;
  Object.assign(game.player,positions.player);if(role==='final'){game.midBossSpawned=true;game.midBossDefeated=true;game.defeatedBossIds=[game.mission.midBoss];}
  const boss=game.spawnMissionBoss(role);if(!boss||boss.bossKey!==catalog.id)throw Error('boss-hit-motion-normal-boss-spawn-failed');Object.assign(boss,positions.boss);boss.angle=Math.atan2(game.player.y-boss.y,game.player.x-boss.x);if(sustained)game.upgrades.haste=2;
  if(game.blocked(boss.x,boss.y,boss.r+2)||game.blocked(game.player.x,game.player.y,game.player.r+2))throw Error('boss-hit-motion-original-placement-blocked');
  const initialSnapshot=game.snapshot();if(!initialSnapshot)throw Error('boss-hit-motion-valid-normal-checkpoint-required');
  onProgress({bossKey:boss.bossKey,phase:sustained?'정상 못총 속사2 · 실제 탄환 피격':'정상 보스 AI · 무사격 이동'});check();const ids=await load(boss.bossKey),read=document.createElement('canvas'),sheet=document.createElement('canvas');sheet.width=1024;sheet.height=858;const sheetContext=sheet.getContext('2d');sheetContext.fillStyle='#203138';sheetContext.fillRect(0,0,1024,858);sheetContext.font='12px sans-serif';sheetContext.fillStyle='#f2e1c2';
  const samples=[],captures=[],events=[],captureTimes=[0,.3,.7,1.2,1.8,2.5,3];let nextCapture=0,previousPhase='',previousPixels=null,firstDrawCount=rig.renderer.info.render.frame,previousPosition={x:boss.x,y:boss.y},travel=0,hits=0,bossHitTicks=0,damage=0,skillTimingArmed=false;
  for(let tick=0;tick<=180;tick++){
   check();if(tick>0){if(!skillTimingArmed&&game.time>=.3-1e-9){boss.skillCd=0;skillTimingArmed=true;}const hpBefore=boss.hp;game.tick(1/60,{moveX:0,moveY:0,shoot:sustained,fireMode:'manual',aimX:boss.x,aimY:boss.y});const lostHp=Math.max(0,hpBefore-boss.hp);damage+=lostHp;if(lostHp>0)bossHitTicks++;const drained=game.drainEvents();hits+=drained.filter(event=>event.type==='hit').length;events.push(...drained);}
   travel+=Math.hypot(boss.x-previousPosition.x,boss.y-previousPosition.y);previousPosition={x:boss.x,y:boss.y};
   const terminal=boss.dead||game.state!=='playing',timed=nextCapture<captureTimes.length&&game.time>=captureTimes[nextCapture]-1e-9,phaseChanged=previousPhase!==boss.attackState,wantCapture=captures.length<10&&(timed||phaseChanged||terminal),snapshot=wantCapture?game.snapshot():null,before=runtime(game,boss);
   const selected=Renderer.prototype.nativeEnemyFrame.call(adapter,boss,game.time,game,catalog);check();
   if(runtime(game,boss)!==before||snapshot&&JSON.stringify(game.snapshot())!==JSON.stringify(snapshot))throw Error('boss-hit-motion-render-mutated-game');
   if(!selected?.metadata?.liveRig||selected.image.width!==512||selected.image.height!==512||selected.image===rig.renderer.domElement||rig.diagnostics?.key!==boss.bossKey)throw Error('boss-hit-motion-original-private512-live-frame-required');
   const diagnostic=primitiveDiagnostics(rig.diagnostics),sample={tick,time:game.time,x:boss.x,y:boss.y,hp:boss.hp,stun:boss.stun,hitFlash:boss.hitFlash,walkPhase:boss.walkPhase,attackState:boss.attackState,attackTime:boss.attackTime,skillCd:boss.skillCd,playerHp:game.player.hp,ammo:game.player.ammo,reloadTime:game.player.reloadTime,nearbyOriginalEnemies:game.enemies.filter(enemy=>enemy!==boss&&!enemy.dead&&Math.hypot(enemy.x-boss.x,enemy.y-boss.y)<250).length,locomotion:selected.locomotion?{pose:selected.locomotion.pose,phase:selected.locomotion.phase,moveWeight:selected.locomotion.moveWeight,angle:selected.locomotion.angle}:null,diagnostic,liveRig:true,private512:true};samples.push(sample);
   if(wantCapture){const pixels=bodyPixels(selected.image,read),rgba={hash:hashBytes(pixels),...(previousPixels?difference(previousPixels,pixels):{different:null,maxDelta:null})},bone=boneHash(rig.models.get(boss.bossKey)),n=captures.length;sheetContext.drawImage(selected.image,n%4*256,Math.floor(n/4)*286,256,256);sheetContext.fillText(game.time.toFixed(2)+'s '+boss.attackState+' / '+diagnostic.clip,n%4*256+5,Math.floor(n/4)*286+273);captures.push({...sample,rgba,bone,validSnapshot:!!snapshot,renderSnapshotSame:snapshot?JSON.stringify(game.snapshot())===JSON.stringify(snapshot):null});previousPixels=pixels;if(timed)while(nextCapture<captureTimes.length&&game.time>=captureTimes[nextCapture]-1e-9)nextCapture++;}
   previousPhase=boss.attackState;if(terminal)break;if(tick%8===0)await wait(new Promise(requestAnimationFrame));
  }
  const renderCalls=rig.renderer.info.render.frame-firstDrawCount,phases=[...new Set(samples.map(sample=>sample.attackState))],nativeClips=[...new Set(samples.map(sample=>sample.diagnostic.clip))],bodyChanged=captures.some(capture=>capture.rgba.different>0),normalEnded=boss.dead||game.state!=='playing',outcome=boss.dead?'boss-defeated':game.state!=='playing'?'normal-'+game.state:'three-seconds-complete';
  const attackProgress={actualSkillEvents:events.filter(event=>event.type==='bossskill'&&event.bossKey===boss.bossKey).length,chargePhase:phases.includes('charge'),nativeAttackClip:nativeClips.includes('attack'),countdownProgress:samples.some((sample,index)=>index>0&&['windup','charge'].includes(sample.attackState)&&sample.attackState===samples[index-1].attackState&&sample.attackTime<samples[index-1].attackTime),ordinaryHitStunZero:samples.every(sample=>sample.stun===0)};
  const report={bossKey:boss.bossKey,role,sustainedFire:sustained,haste:sustained?2:0,weapon:'nailgun',weaponDamage:WEAPONS.nailgun.damage,initialPlayer,initialBossHp:initialSnapshot.enemies.find(enemy=>enemy.id===boss.id).hp,initialBossMaxHp:boss.maxHp,initialEnemies,initialSpawnClock,positions,validInitialSnapshot:true,initialSnapshot,skillTimingFixture:{armed:skillTimingArmed,atSeconds:.3,skillCd:0,note:'Explicit own-QA timing isolation: preserve the normal first .3s walk, then make the next original skill eligible by setting only this owned boss skillCd=0. Original windup/duration/recovery/skill damage and AI remain unchanged. Final role bootstraps the already-defeated mid-boss flags; it is not story completion.'},samples,captures,events,hits,bossHitTicks,damage,travel,phases,nativeClips,bodyChanged,renderCalls,outcome,normalEnded,finalState:game.state,playerHp:game.player.hp,bossHp:boss.hp,ammo:game.player.ammo,reloadTime:game.player.reloadTime,random:game.random.getState(),visualRandom:game.visualRandom.getState(),originalAtlasIDs:ids,rigError:rig.error||'',gpuAlphaEnabled:rig.exactGPUAlphaBounds===true};
  report.attackProgress=attackProgress;combats.push(report);if(renderCalls<=0||!bodyChanged||travel<=0||sustained&&(!bossHitTicks||damage<=0)&&!normalEnded||!normalEnded&&(!phases.includes('windup')||!attackProgress.actualSkillEvents||!attackProgress.chargePhase||!attackProgress.nativeAttackClip||sustained&&(!attackProgress.countdownProgress||!attackProgress.ordinaryHitStunZero)))throw Error('boss-hit-motion-actual-movement-hit-or-phase-missing');
  await wait(onImage({bossKey:boss.bossKey,phase:'combat',src:sheet.toDataURL(),alt:catalog.name+' · '+(sustained?'정상 못총 속사2 실제 피격':'무사격 정상 AI')+' · 원본512 body 연속 캡처'}));check();
 }
 active.add(renderer);
 try{
  signal?.addEventListener?.('abort',abort,{once:true});if(signal?.aborted)abort();check();
  art=new ProductionArt({manifest:originalArt.manifest,baseURL:originalArt.baseURL,fetchImpl:originalArt.fetchImpl,ImageCtor:originalArt.ImageCtor,timeoutMs:originalArt.timeoutMs,onChange:null});
  rig=new LiveBossRig({size:512});if(rig===owners.get('liveBoss')?.value||rig.size!==512)throw Error('boss-hit-motion-owned-original512-required');Object.assign(rig,{exactGPUAlphaBounds:false,verifyExactGPUAlphaBounds:false,gpuPoseBounds:false,directAlphaReadback:false,cropNativeComposite:false,batchInkComposite:false});
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;canvas.dataset??={};adapter=Object.create(Renderer.prototype);Object.assign(adapter,{productionArt:art,liveBoss:rig,canvas,onProductionChange:null,motionEnabled:true});
  for(const role of ['mid','final'])for(const sustained of [false,true])await combat(role,sustained);
  const poses=await wait(inspectOriginalBossPoses(adapter,{signal:controller.signal,onProgress:info=>{check();return onProgress({bossKey:info.bossKey??info.key,phase:info.phase??'24종 원본 동작'});},onImage:info=>{check();return onImage({...info,bossKey:info.bossKey??info.key});}}));check();completed=true;
  return{report:{combats,poses,cleanup,note:'Explicit8851 genuine-memory original-asset probe. The supplied storage is a brand gate only. Four fresh own mission-01 Games test boss01 mid/final with normal HP, initial invulnerability, ammunition, reload, damage, original five enemies/spawning/navigation/world and AI: no firing versus real nailgun sustained fire with the ordinary haste2 upgrade. Only valid clear positions and the explicitly reported .3s skill-cooldown timing fixture are set. Death, upgrade or other normal terminal outcomes stop sampling without artificial survival. Every simulation step is1/60 and calls the unchanged Renderer.nativeEnemyFrame on a private adapter and original512 LiveBossRig; no main Game/renderer owner is assigned. Private original512 RGBA changes, live clip diagnostics, physical motion, attack phase/timer progress and actual hit events are reported; contact sheets display scaled copies only. Separate24-boss controlled-actor pose audit is not24 actual fights or story completion. Original geometry/UV/texture/clip quality, NPC12/256 and product GPU defaultOFF remain unchanged. No paid assets, persistent save, presented FPS, performance or total-memory claim.'}};
 }catch(error){try{if(objectLike(error)){Object.defineProperty(error,'cleanup',{value:cleanup,enumerable:true});Object.defineProperty(error,'combats',{value:combats,enumerable:true});}}catch{}throw error;}
 finally{finished=true;try{signal?.removeEventListener?.('abort',abort);}catch{}try{controller.abort();}catch{}release();active.delete(renderer);cleanup.mainOwnerDescriptorsUnchanged=ownersCurrent();cleanup.externalOwnerPreserved=!cleanup.mainOwnerDescriptorsUnchanged;cleanup.complete=cleanup.errors.length===0&&cleanup.modelsRemaining===0&&cleanup.recordsRemaining===0&&cleanup.rawAlphaBytes===0&&cleanup.mainOwnerDescriptorsUnchanged;if(completed&&!cleanup.complete){const error=Error('boss-hit-motion-cleanup-failed');error.cleanup=cleanup;throw error;}}
}
