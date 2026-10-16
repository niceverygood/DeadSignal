import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {MISSIONS,getBoss} from '../dist/campaign.js';
import {missionGuidance} from '../dist/guidance.js';
import {objectiveTargets} from '../dist/directions.js';

test('mission countdowns use the real mid and final thresholds independently of legacy district flags',()=>{
  for(const mode of ['quick','standard']){
    const game=new Game({missionId:MISSIONS[0].id,seed:1649,mode}),duration=mode==='quick'?120:180;
    assert.equal(game.stageDuration,duration);game.time=game.stageTime=duration*.35-.1;
    const initial=missionGuidance(game);assert.equal(initial.kind,'survive');assert.ok(initial.objective.includes(getBoss(MISSIONS[0].midBoss).name));assert.ok(initial.detail.endsWith('00:01'));
    game.time=game.stageTime=duration*.35+.1;assert.equal(missionGuidance(game).detail,'보스 접근 중');
    const mid=game.spawnMissionBoss('mid');assert.ok(mid);game.damageEnemy(mid,mid.maxHp+1);assert.equal(game.state,'playing');assert.equal(game.midBossDefeated,true);
    game.time=game.stageTime=duration*.75-.1;const next=missionGuidance(game);assert.ok(next.objective.includes(getBoss(MISSIONS[0].finalBoss).name));assert.ok(next.detail.endsWith('00:01'));
  }
});

test('all 24 real mission bosses own guidance and offscreen priority ahead of optional alarms',()=>{
  for(const mission of MISSIONS){
    const game=new Game({missionId:mission.id,seed:1739+mission.index}),mid=game.spawnMissionBoss('mid');assert.ok(mid);
    for(const role of ['mid','final']){
      const boss=role==='mid'?mid:game.spawnMissionBoss('final');assert.ok(boss);
      const catalog=getBoss(boss.bossKey),alarm=game.spawnEnemy('elite',490);assert.ok(alarm);game.alarm.active=true;game.alarm.eliteId=alarm.id;
      const hp=boss.hp;game.damageEnemy(boss,hp/2);assert.equal(boss.dead,false);const checkpoint=JSON.stringify(game.snapshot()),random=game.random.getState(),visual=game.visualRandom.getState();
      const guidance=missionGuidance(game),targets=objectiveTargets(game);assert.ok(guidance.objective.includes(catalog.name));assert.equal(guidance.kind,role==='mid'?'gatekeeper':'collector');assert.equal(guidance.progress,.5);assert.equal(targets[0].enemy,boss);assert.equal(targets[0].label,catalog.name);assert.equal(targets[1].enemy,alarm);
      assert.equal(JSON.stringify(game.snapshot()),checkpoint);assert.equal(game.random.getState(),random);assert.equal(game.visualRandom.getState(),visual);
      game.pause();assert.deepEqual(objectiveTargets(game),[]);assert.deepEqual(missionGuidance(game),guidance);game.resume();game.damageEnemy(boss,boss.hp+1);
      if(role==='mid'){assert.equal(game.midBossDefeated,true);game.alarm.active=false;}
    }
    assert.equal(game.state,'victory');assert.equal(missionGuidance(game).progress,1);assert.equal(missionGuidance(game).kind,'complete');assert.deepEqual(objectiveTargets(game),[]);
  }
});
