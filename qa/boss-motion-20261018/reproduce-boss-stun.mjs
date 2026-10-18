// Read-only, bounded simulation audit. Run only when the coordinating task
// allows CPU work: node qa/boss-motion-20261018/reproduce-boss-stun.mjs [output.json]
// No renderer, assets, audio, storage, browser or paid service is used here.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const engineURL=new URL('../../work/dead-signal-game/dist/engine.js',import.meta.url);
const beforeURL=new URL('./engine-before-boss-hit.txt',import.meta.url);
const output=process.argv[2]?resolve(process.argv[2]):new URL('./boss-stun-reproduction.json',import.meta.url);
const BEFORE_SHA='4fa744ce8b245b8bcc5219214c881cbb73354bcfeed4357ac83929e714862b43';
const CANDIDATE_SHA='3551287930debc315d25fd6ef9c5c51e0bf41af98f22f872ea485e5a6888df79';
const DT=1/60,MAIN_TICKS=180,LEGACY_TICKS=120,HIT_EVERY=5,HIT_DAMAGE=.1;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const errorValue=error=>({name:typeof error?.name==='string'?error.name:'Error',message:typeof error?.message==='string'?error.message:String(error),stack:typeof error?.stack==='string'?error.stack:''});
const report={createdAt:new Date().toISOString(),runtime:process.version,status:'running',
  note:'Controlled direct-impact stress, not actual bullet combat or visual/FPS proof. Original whole engine is independently SHA-pinned and only relative import URLs are rebased. The candidate changes campaign-boss ordinary hit impulse/stun admission and busy-path legacy impulse decay.',
  recipe:{seed:774,missionId:'mission-01',dt:DT,mainTicks:MAIN_TICKS,mainSeconds:MAIN_TICKS*DT,hitEveryTicks:HIT_EVERY,hitInterval:HIT_EVERY*DT,directImpactDamage:HIT_DAMAGE,directImpulse:{x:0,y:0},
    referenceCadence:{weapon:'nailgun',baseDelay:.105,hasteLevel:2,fireRateWithoutEquipment:1.3,nominalDelay:.105/1.3,quantizedTicks:Math.ceil((.105/1.3)/DT),note:'Cadence is derived from the original nailgun/haste formula. No shoot(), bullet collision, magazine, upgraded-damage or reload claim; each direct .1 hit isolates hit-stop without killing normal-HP bosses.'},
    fixture:'Original 2400x1800 world dimensions; ordinary enemies isolated and spawnClock=1e9; solid obstacles/decor removed and Navigation rebuilt. Player/boss positions use Game.move with blocked checks. skillCd=0 is an explicit immediate-pattern probe. No HP/maxHP increase, no added invulnerability, no normal movement-speed/damage/attack-duration override.'},
  sources:{before:{path:beforeURL.pathname,sha256:BEFORE_SHA},candidate:{path:engineURL.pathname,sha256:CANDIDATE_SHA}},cases:[],proofs:[],errors:[]};

try{
  const before=await readFile(beforeURL),candidate=await readFile(engineURL);
  assert.equal(hash(before),BEFORE_SHA,'preserved independent whole original engine bytes');
  assert.equal(hash(candidate),CANDIDATE_SHA,'candidate source remains frozen at the approved two-site patch');
  const rebased=before.toString('utf8').replace(/(from\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,(_all,prefix,specifier,suffix)=>prefix+new URL(specifier,engineURL).href+suffix);
  const [{Game:OriginalGame},{Game:CandidateGame},{Navigation},{getBoss}]=await Promise.all([
    import('data:text/javascript;base64,'+Buffer.from(rebased).toString('base64')),
    import(engineURL.href),import(new URL('./navigation.js',engineURL).href),import(new URL('./campaign.js?v=0.29.0',engineURL).href),
  ]);

  function fixture(Class,role,legacy){
    const game=new Class({seed:774,missionId:'mission-01',weapon:'nailgun',stageDuration:1e9});
    const initialPlayerHP=game.player.hp,initialPlayerMaxHP=game.player.maxHp,initialInvul=game.player.invul;
    game.enemies=[];game.spawnClock=1e9;game.world.obstacles=[];game.world.decor=[];game.navigation=new Navigation(game.world);
    game.move(game.player,1000-game.player.x,900-game.player.y);
    assert.equal(game.blocked(game.player.x,game.player.y,game.player.r),false,'legal player placement');
    let boss=game.spawnMissionBoss('mid');assert.ok(boss,'normal middle-boss spawn');
    let prerequisiteMidDefeated=false;
    if(role==='final'){
      // Use the engine's normal defeat gate. This setup is a direct prerequisite
      // defeat, not a claimed player shot; its pickup/corpse/effects are isolated.
      game.damageEnemy(boss,boss.hp);assert.equal(game.midBossDefeated,true);
      prerequisiteMidDefeated=true;game.enemies=game.enemies.filter(enemy=>!enemy.dead);
      game.pickups=[];game.corpses=[];game.particles=[];game.texts=[];game.links=[];
      boss=game.spawnMissionBoss('final');assert.ok(boss,'normal final-boss spawn after mid defeat');
    }
    game.move(boss,1200-boss.x,900-boss.y);
    assert.equal(game.blocked(boss.x,boss.y,boss.r),false,'legal normal-radius boss placement');
    assert.equal(game.blocked(game.player.x,game.player.y,game.player.r),false);
    const catalog=getBoss(boss.bossKey);assert.ok(catalog);
    assert.equal(boss.maxHp,Math.ceil(catalog.stats.hp*game.campaignScale.hp));
    assert.equal(boss.hp,boss.maxHp,'normal campaign boss HP');
    assert.equal(game.player.hp,initialPlayerHP);assert.equal(game.player.maxHp,initialPlayerMaxHP);assert.equal(game.player.invul,initialInvul);
    boss.skillCd=0;
    if(legacy){boss.vx=180;boss.vy=-90;}
    game.drainEvents();assert.ok(game.snapshot(),'legal initial checkpoint');
    return {game,boss,catalog,setup:{prerequisiteMidDefeated,initialPlayerHP,initialPlayerMaxHP,initialInvul,addedHP:0,addedInvulnerability:0,normalBossHP:boss.hp,bossRadius:boss.r,blockedPlayer:false,blockedBoss:false,legacyImpulse:legacy?{x:180,y:-90}:null}};
  }

  function scenario(Class,engine,role,mode){
    const legacy=mode==='legacy-busy-impulse',stress=mode==='controlled-direct-impact-stress';
    const {game,boss,catalog,setup}=fixture(Class,role,legacy),ticks=legacy?LEGACY_TICKS:MAIN_TICKS;
    const origin={x:boss.x,y:boss.y},initialBossHP=boss.hp,initialPlayerHP=game.player.hp,events=[],history=[];
    let directHits=0,performedTicks=0,movedDistance=0,minStunAfterHit=Infinity,allSnapshotsValid=true,priorX=boss.x,priorY=boss.y;
    function capture(tick){
      const snapshot=game.snapshot();allSnapshotsValid&&=!!snapshot;
      history.push({tick,time:game.time,state:game.state,x:boss.x,y:boss.y,stun:boss.stun,vx:boss.vx,vy:boss.vy,attackState:boss.attackState,attackTime:boss.attackTime,skillCd:boss.skillCd,hitFlash:boss.hitFlash,bossHP:boss.hp,playerHP:game.player.hp,playerInvul:game.player.invul,warningCount:events.filter(event=>event.type==='bosswarn').length,skillCount:events.filter(event=>event.type==='bossskill').length,snapshotValid:!!snapshot});
    }
    capture(0);
    let caughtOutput=null;
    try{
      for(let tick=0;tick<ticks;tick++){
        assert.equal(game.state,'playing','normal player HP must keep the bounded probe playing');
        if(stress&&tick%HIT_EVERY===0){
          // The non-null zero vector intentionally takes the exact ordinary
          // impact branch while isolating the hit-stop from physical impulse.
          game.damageEnemy(boss,HIT_DAMAGE,{x:0,y:0},{x:game.player.x,y:game.player.y});directHits++;
        }
        game.tick(DT,{moveX:0,moveY:0,shoot:false,fireMode:'manual',aimX:boss.x,aimY:boss.y});
        performedTicks=tick+1;events.push(...game.drainEvents());
        movedDistance+=Math.hypot(boss.x-priorX,boss.y-priorY);priorX=boss.x;priorY=boss.y;
        if(stress&&directHits)minStunAfterHit=Math.min(minStunAfterHit,boss.stun);
        const valid=!!game.snapshot();allSnapshotsValid&&=valid;assert.ok(valid,'checkpoint contract on every actual tick');
        if((tick+1)%15===0||tick===ticks-1)capture(tick+1);
      }
    }catch(error){caughtOutput=errorValue(error);capture(performedTicks);}
    const checkpoint=game.snapshot(),warningCount=events.filter(event=>event.type==='bosswarn').length,skillCount=events.filter(event=>event.type==='bossskill').length;
    const entry={engine,bossKey:catalog.id,bossName:catalog.name,role,mode,seconds:ticks*DT,requestedTicks:ticks,performedTicks,skill:{...catalog.skill},scaledContactDamage:boss.damage,setup,directHits,initialBossHP,remainingBossHP:boss.hp,bossDamage:initialBossHP-boss.hp,playerDamage:initialPlayerHP-game.player.hp,
      origin,final:{time:game.time,state:game.state,x:boss.x,y:boss.y,stun:boss.stun,vx:boss.vx,vy:boss.vy,attackState:boss.attackState,attackTime:boss.attackTime,skillCd:boss.skillCd,hitFlash:boss.hitFlash,playerHP:game.player.hp,bossHP:boss.hp},
      movedDistance,displacement:Math.hypot(boss.x-origin.x,boss.y-origin.y),minStunAfterHit:Number.isFinite(minStunAfterHit)?minStunAfterHit:null,warningCount,skillCount,hitEvents:events.filter(event=>event.type==='hit').length,
      snapshotValid:!!checkpoint,allSnapshotsValid,checkpointSHA256:checkpoint?hash(JSON.stringify(checkpoint)):null,randomState:game.random.getState(),visualRandomState:game.visualRandom.getState(),
      attackSequence:events.filter(event=>['bosswarn','bossskill'].includes(event.type)),history,caughtOutput,
      note:legacy?'Explicit saved-impulse fixture vx=180, vy=-90 over two seconds entirely owned by the real warning/charge/recovery. Both classes perform the normal charge and damage; the comparison isolates busy-state decay, not a new movement policy.':stress?'Direct .1 impact every five ticks; normal HP, no artificial invulnerability or real-bullet claim.':'No impact calls; normal warning, charge, recovery and contact behavior.'};
    report.cases.push(entry);return {entry,checkpoint,events};
  }

  for(const role of ['mid','final']){
    const beforeNoHit=scenario(OriginalGame,'before',role,'no-hit'),afterNoHit=scenario(CandidateGame,'after',role,'no-hit');
    const beforeStress=scenario(OriginalGame,'before',role,'controlled-direct-impact-stress'),afterStress=scenario(CandidateGame,'after',role,'controlled-direct-impact-stress');
    const beforeLegacy=scenario(OriginalGame,'before',role,'legacy-busy-impulse'),afterLegacy=scenario(CandidateGame,'after',role,'legacy-busy-impulse');
    const unchangedNoHit=JSON.stringify(beforeNoHit.checkpoint)===JSON.stringify(afterNoHit.checkpoint)&&JSON.stringify(beforeNoHit.events)===JSON.stringify(afterNoHit.events);
    const originalLock=beforeStress.entry.minStunAfterHit>0&&beforeStress.entry.warningCount===0&&beforeStress.entry.skillCount===0&&beforeStress.entry.movedDistance===0;
    const candidateProgress=afterStress.entry.minStunAfterHit===0&&afterStress.entry.warningCount>0&&afterStress.entry.skillCount>0&&afterStress.entry.movedDistance>0;
    const directDamageUnchanged=beforeStress.entry.remainingBossHP===afterStress.entry.remainingBossHP&&beforeStress.entry.directHits===36&&afterStress.entry.directHits===36&&beforeStress.entry.hitEvents===36&&afterStress.entry.hitEvents===36;
    const legacyBusySameCombat=beforeLegacy.entry.playerDamage===afterLegacy.entry.playerDamage&&JSON.stringify(beforeLegacy.entry.attackSequence)===JSON.stringify(afterLegacy.entry.attackSequence)&&beforeLegacy.entry.final.x===afterLegacy.entry.final.x&&beforeLegacy.entry.final.y===afterLegacy.entry.final.y;
    const legacyImpulseDecayed=beforeLegacy.entry.final.vx===180&&beforeLegacy.entry.final.vy===-90&&Math.abs(afterLegacy.entry.final.vx)<.00001&&Math.abs(afterLegacy.entry.final.vy)<.00001;
    const proof={role,unchangedNoHit,originalLock,candidateProgress,directDamageUnchanged,legacyBusySameCombat,legacyImpulseDecayed,allCheckpointsValid:[beforeNoHit,afterNoHit,beforeStress,afterStress,beforeLegacy,afterLegacy].every(item=>item.entry.allSnapshotsValid&&!item.entry.caughtOutput)};
    report.proofs.push(proof);
  }
  // Gather both roles before asserting the audit's expected behavior so a
  // failed proof still leaves the complete bounded raw evidence in the file.
  for(const proof of report.proofs)for(const [name,value]of Object.entries(proof))if(name!=='role')assert.equal(value,true,proof.role+' '+name);
  report.status='passed';
}catch(error){report.status='failed';report.errors.push(errorValue(error));process.exitCode=1;}
await writeFile(output,JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify({status:report.status,output:String(output),sources:report.sources,proofs:report.proofs,errors:report.errors,cases:report.cases.map(({engine,bossKey,mode,movedDistance,warningCount,skillCount,remainingBossHP,playerDamage,final,caughtOutput})=>({engine,bossKey,mode,movedDistance,warningCount,skillCount,remainingBossHP,playerDamage,final,caughtOutput}))},null,2));