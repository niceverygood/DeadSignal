// Read-only mission copy. Alarm elites are optional rewards, so they never
// replace the district gatekeeper or the final collector as the main goal.
import {expeditionGuidance} from './expedition.js';
import {getMission,getBoss} from './campaign.js?v=0.29.0';
const bounded=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const clock=remaining=>{
  const seconds=Math.ceil(Math.max(0,remaining));
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
};
const live=enemy=>enemy&&!enemy.dead&&Number.isFinite(enemy.hp)&&enemy.hp>0;
function targetHealth(enemy,name){
  if(!enemy||!Number.isFinite(enemy.maxHp)||enemy.maxHp<=0)return {detail:`${name}를 찾아 처치하세요`,progress:0};
  const hp=Math.max(0,Math.min(enemy.maxHp,enemy.hp));
  return {detail:`${name} 체력 ${Math.ceil(hp)} / ${Math.ceil(enemy.maxHp)}`,progress:bounded(1-hp/enemy.maxHp)};
}

export function missionGuidance(game){
  const expedition=expeditionGuidance(game);if(expedition)return expedition;
  const mission=getMission(game?.missionId);
  if(mission){
    if(game.state==='victory')return {objective:`${mission.title} 확보 완료`,detail:'두 보스를 처치했습니다. 다음 미션을 준비하세요',progress:1,kind:'complete'};
    const enemy=(Array.isArray(game.enemies)?game.enemies:[]).find(enemy=>live(enemy)&&getBoss(enemy.bossKey));
    if(enemy){const boss=getBoss(enemy.bossKey);return {objective:`${boss.role==='mid'?'중간보스':'최종보스'} ${boss.name} 처치`,...targetHealth(enemy,boss.name),kind:boss.role==='final'?'collector':'gatekeeper'};}
    const duration=Number.isFinite(game.stageDuration)&&game.stageDuration>0?game.stageDuration:mission.parSeconds,elapsed=Number.isFinite(game.stageTime)?Math.max(0,game.stageTime):0;
    const final=game.midBossDefeated===true,boss=getBoss(final?mission.finalBoss:mission.midBoss),threshold=duration*(final?.75:.35),remaining=threshold-elapsed;
    return {objective:`${final?'최종보스':'중간보스'} ${boss.name} 출현까지 생존하세요`,detail:remaining>0?`보스 출현까지 ${clock(remaining)}`:'보스 접근 중',progress:bounded(elapsed/threshold),kind:'survive'};
  }
  if(game?.state==='victory')return {objective:'탈출에 성공했습니다',detail:'작전 완료',progress:1,kind:'complete'};
  if(game?.stageCleared)return {objective:'구역을 확보했습니다',detail:'보급소에서 정비한 뒤 다음 구역으로 이동하세요',progress:1,kind:'cleared'};
  const final=game?.stage===2,enemies=Array.isArray(game?.enemies)?game.enemies:[];
  const collector=live(game?.boss)&&game.boss.type==='collector'?game.boss:enemies.find(enemy=>live(enemy)&&enemy.type==='collector');
  if(game?.stageBossSpawned||(final&&collector)){
    const enemy=final?collector:enemies.find(enemy=>live(enemy)&&enemy.gatekeeper);
    return {objective:final?'수집가를 처치하고 탈출하세요':'봉쇄 정예를 처치해 다음 구역을 여세요',...targetHealth(enemy,final?'수집가':'봉쇄 정예'),kind:final?'collector':'gatekeeper'};
  }
  const duration=Number.isFinite(game?.stageDuration)&&game.stageDuration>0?game.stageDuration:120;
  const elapsed=Number.isFinite(game?.stageTime)?Math.max(0,game.stageTime):0,threshold=duration*(final ? .65 : 1),remaining=threshold-elapsed;
  return {objective:final?'수집가가 나타날 때까지 생존하세요':'봉쇄 정예가 나타날 때까지 생존하세요',detail:remaining>0?`${final?'수집가':'정예'} 출현까지 ${clock(remaining)}`:`${final?'수집가':'봉쇄 정예'} 접근 중`,progress:bounded(elapsed/threshold),kind:'survive'};
}

export function fieldHint(game,profile,coarse=false){
  if(game?.state!=='playing'||profile?.runs!==0||!Number.isFinite(game.time)||game.time<0)return null;
  if(game.time<6&&profile?.options?.fireMode!=='manual')return coarse?'이동 스틱으로 움직이세요. 오토 모드가 좀비를 자동으로 공격합니다.':'WASD로 이동하세요. 오토 모드가 좀비를 자동으로 공격합니다. F로 수동 전환.';
  if(game.time<6)return coarse?'이동 스틱으로 움직이고 사격 버튼으로 공격하세요.':'WASD로 이동하고 마우스로 조준해 사격하세요.';
  if(game.time<12)return coarse?'유인 버튼으로 좀비를 모으고 화염 버튼으로 태우세요.':'E로 좀비를 모으고 Q로 화염병을 던지세요.';
  if(game.time<18)return coarse?'회피 버튼으로 포위에서 빠져나오세요.':'Space로 회피해 포위에서 빠져나오세요.';
  return null;
}
