import {HAIFA_TRANSFER_EXPEDITION,HAIFA_TRANSFER_STEPS} from './haifa-transfer-expedition.js';
export {HAIFA_TRANSFER_EXPEDITION,HAIFA_TRANSFER_STEPS} from './haifa-transfer-expedition.js';
import {PATIENT_RECORD_EXPEDITION,PATIENT_RECORD_STEPS} from './patient-record-expedition.js';
export {PATIENT_RECORD_EXPEDITION,PATIENT_RECORD_STEPS} from './patient-record-expedition.js';
import {HARBOR_POWER_EXPEDITION,HARBOR_POWER_STEPS} from './harbor-power-expedition.js';
export {HARBOR_POWER_EXPEDITION,HARBOR_POWER_STEPS} from './harbor-power-expedition.js';
import {COLD_CHAIN_EXPEDITION,COLD_CHAIN_STEPS} from './cold-chain-expedition.js';
export {COLD_CHAIN_EXPEDITION,COLD_CHAIN_STEPS} from './cold-chain-expedition.js';
import {FINALE_EXPEDITION_ID} from './finale-world.js';
import {ISRAEL_EXPEDITION_ID} from './israel-world.js';
import {ROOF_EXPEDITION_ID} from './rooftop-world.js';
import {HOSPITAL_EXPEDITION_ID} from './hospital-world.js';
import {NORTH_EXPEDITION_ID} from './north-world.js';
import {SEA_EXPEDITION_ID} from './sea-world.js';
import {escortPoint,escortBlocked,escortBlockReason,transportBody} from './escort.js';
export const CITY_EXPEDITION=Object.freeze({id:'last-signal-city-01',title:'마지막 신호 · 도시 원정',subtitle:'거리의 무전을 복구하고, 마트의 의약품을 회수해 옥상 계단으로 향한다.'});
export const EXPEDITION_STEPS=Object.freeze([
 Object.freeze({id:'radio',title:'거리 중계기 복구',action:'무전 배터리 연결',x:1050,y:840,radius:58,duration:2.5,clue:'마트 냉장 보관함의 위치를 수신했다.'}),
 Object.freeze({id:'medicine',title:'마트 입구 의약품 회수',action:'냉장 보관함 회수',x:1675,y:1045,radius:58,duration:3.2,clue:'억제제와 병원 이송 기록을 회수했다. 백신은 아직 없다.'}),
 Object.freeze({id:'stairs',title:'옥상 계단 접근',action:'대피 계단 문 열기',x:1200,y:510,radius:58,duration:2,clue:'옥상 접근로를 확보했다. 다음 구간의 구조 신호를 추적한다.'})
]);

export const ROOF_EXPEDITION=Object.freeze({id:ROOF_EXPEDITION_ID,title:'마지막 신호 · 옥상 중계',subtitle:'옥상 두 동과 좁은 연결교를 건너 중계 신호를 전송한다.',requires:CITY_EXPEDITION.id});
export const ROOF_STEPS=Object.freeze([Object.freeze({id:'roof-power',title:'옥상 비상 전원 연결',action:'발전기 재가동',x:1030,y:950,radius:58,duration:2.8,clue:'옥상 중계기에 전원이 들어왔다. 연결교 너머 송신대로 이동한다.'}),Object.freeze({id:'roof-transmit',title:'중계 신호 전송 방어',action:'중계기 방어',kind:'defend',x:1730,y:1000,radius:170,duration:35,clue:'병원 피난 채널을 수신했다. 계단 출구로 이동한다.'}),Object.freeze({id:'roof-extract',title:'병원 방향 대피 계단',action:'대피 경로 개방',x:1870,y:850,radius:58,duration:2.8,clue:'옥상 신호 전송을 완료하고 병원 방향 이동 경로를 확보했다.'})]);
export const HOSPITAL_EXPEDITION=Object.freeze({id:HOSPITAL_EXPEDITION_ID,title:'마지막 신호 · 병원 냉각 기록',theme:'hospital',subtitle:'병원 격리동 바깥에서 이송 명단과 냉각 기록을 회수하고, 연구 화물의 행선지를 추적한다.',requires:ROOF_EXPEDITION.id,
 opening:'병원 피난 채널이 여기서 끊겼다. 윤서, 이송 명단부터 찾을게. 백신이라는 표찰보다 냉각 기록을 믿어야겠어.',
 instructions:'분류 명단 회수 → 냉각 전원 복구 → 격리 통로 정예 제거 → 연구 기록 회수 → 이송 출구',
 debrief:'이송 명단과 온도 기록의 화물 번호가 일치합니다. 서울에는 완성된 백신이 없습니다. 원액 운송 기록은 북쪽 검역 화물망을 가리킵니다.'});
export const HOSPITAL_STEPS=Object.freeze([
 Object.freeze({id:'hospital-triage',short:'명단',title:'응급 분류 명단 확인',action:'이송 명단 복구',x:1100,y:1220,radius:58,duration:2.2,clue:'완성 백신이 아니라 배양 원액을 옮겼어요. 냉각 기록과 화물 번호를 대조해야 해요.'}),
 Object.freeze({id:'hospital-power',short:'냉각 전원',title:'냉각 기록 전원 복구',action:'기록 장치 전원 연결',x:1090,y:950,radius:58,duration:3,clue:'격리동 기록 장치가 켜졌어요. 전원 소리에 정예 감염자가 통로로 나왔어요. 먼저 쓰러뜨려요.'}),
 Object.freeze({id:'hospital-clear',short:'격리 통로',title:'격리 통로 정예 제거',action:'정예 감염자 제거',kind:'clear',guard:true,guardAt:{x:1740,y:860},x:1770,y:780,radius:140,duration:1,clue:'통로가 열렸어요. 격리동 외부 기록함에서 온도 기록을 회수해요.'}),
 Object.freeze({id:'hospital-records',short:'연구 기록',title:'격리동 연구 기록 회수',action:'냉각 이송 기록 복사',x:1770,y:780,radius:58,duration:3.5,clue:'화물 K-17, 북부 검역 회랑. 이건 백신이 아니라 배양 원액의 운송 경로예요. 기록을 가지고 이송 출구로 돌아와요.'}),
 Object.freeze({id:'hospital-extract',short:'이송 출구',title:'병원 이송 출구 확보',action:'검역 화물 경로 저장',x:1200,y:1460,radius:58,duration:2.8,clue:'병원 기록을 확보했다. 북부 검역 화물망으로 이어지는 경로를 추적한다. 백신 원액의 위치는 아직 확인되지 않았다.'})
]);
export const NORTH_EXPEDITION=Object.freeze({id:NORTH_EXPEDITION_ID,title:'마지막 신호 · 북한 검역 회랑',theme:'checkpoint',requires:HOSPITAL_EXPEDITION.id,
 subtitle:'병원 송장을 따라 북한 검역 화물망에 진입한다. 냉각 기록을 실은 차량을 견인해 해상 이송 증거를 확보한다.',
 opening:'K-17 화물열차의 흔적을 따라 북한 검역 회랑에 도착했다. 윤서, 철문 전원을 살리고 기록 차량을 견인할게. 이번에는 화물과 함께 움직여야 해.',
 instructions:'견인 전원 연결 → K-17 송장 확보 → 냉각 기록 차량 호위 → 해상 이송 증거 회수',
 debrief:'견인한 차량의 냉각 기록과 해상 송장이 일치합니다. 배양 원액 대조표의 발신지는 이스라엘 하이파의 격리 배양 시설입니다. 다음 단서는 해상 이송망에 있습니다.'});
export const NORTH_STEPS=Object.freeze([
 Object.freeze({id:'north-power',short:'견인 전원',title:'검역 견인 전원 연결',action:'견인 장치 전원 연결',x:1050,y:1320,radius:58,duration:2.4,clue:'견인 장치가 살아났어요. 폐차 안의 냉각 기록을 이송 지점까지 옮길 수 있어요.'}),
 Object.freeze({id:'north-manifest',short:'K-17 송장',title:'K-17 냉각 화물 송장 확인',action:'차량 송장 대조',x:900,y:1300,radius:75,duration:2.2,clue:'같은 K-17이에요. 차량 곁에서 이동하며 가까이 붙은 감염자를 제거해요. 떨어지거나 길이 막히면 견인이 멈춰요.'}),
 Object.freeze({id:'north-escort',short:'차량 호위',title:'냉각 기록 차량 호위',action:'냉각 기록 차량 호위',kind:'escort',x:900,y:1300,radius:150,clearance:80,duration:30,path:Object.freeze([{x:900,y:1300},{x:1200,y:1300},{x:1200,y:900},{x:1700,y:900}].map(Object.freeze)),clue:'냉각 기록 차량이 이송 지점에 도착했어요. 이제 해상 송장의 발신지를 대조해요.'}),
 Object.freeze({id:'north-extract',short:'해상 송장',title:'해상 이송 증거 회수',action:'배양 원액 이송망 저장',x:1840,y:1010,radius:58,duration:2.8,clue:'해상 송장의 발신지는 이스라엘 하이파 격리 배양 시설이다. 완성 백신은 아직 없다. 원액 대조표를 따라 해상 이송망으로 향한다.'})
]);
export const SEA_EXPEDITION=Object.freeze({id:SEA_EXPEDITION_ID,title:'마지막 신호 · 해상 이송 항만',theme:'harbor',requires:NORTH_EXPEDITION.id,
 subtitle:'K-17의 선적 번호를 확인하고 두 부두 중계기를 오가며 출항 승인을 송신한다. 이스라엘 배양 시설로 향하는 항로를 확보한다.',
 opening:'북한 검역망의 해상 송장이 이 항만으로 이어졌다. 윤서, K-17 선적 번호부터 확인할게. 출항 채널 두 곳이 번갈아 응답하고 있어.',
 instructions:'선적 번호 확인 → 부두 전원 복구 → 두 중계기 교차 송신 → 승선 통로 정예 제거 → 항로 확보',
 debrief:'K-17 냉각 화물의 선적 기록과 하이파 배양 시설의 승인 코드를 대조했습니다. 윤서의 연구 기록에 원액 대조표가 남아 있습니다. 이제 이스라엘 격리 배양 시설로 향할 항로가 열렸습니다.'});
export const SEA_STEPS=Object.freeze([
 Object.freeze({id:'sea-manifest',short:'선적 번호',title:'K-17 선적 번호 대조',action:'해상 송장 확인',x:1430,y:820,radius:58,duration:2.5,clue:'선적 번호가 맞아요. 하이파 승인 코드도 남아 있어요. 부두 전원부터 연결해요.'}),
 Object.freeze({id:'sea-power',short:'부두 전원',title:'부두 통신 전원 복구',action:'부두 전력 연결',x:1100,y:1290,radius:58,duration:2.8,clue:'두 중계기가 번갈아 응답해요. 채널이 바뀌면 반대편으로 이동해요. 이미 보낸 승인 자료는 유지돼요.'}),
 Object.freeze({id:'sea-relay',short:'교차 송신',title:'출항 승인 교차 송신',action:'출항 승인 송신',kind:'relay',x:1050,y:900,radius:140,duration:32,interval:8,zones:Object.freeze([{x:1050,y:900},{x:1770,y:940}].map(Object.freeze)),clue:'출항 승인이 전송됐어요. 마지막 정예 감염자가 승선 통로를 막았어요. 부두 난간 안쪽으로 이동해요.'}),
 Object.freeze({id:'sea-clear',short:'승선 통로',title:'승선 통로 정예 제거',action:'승선 통로 정예 제거',kind:'clear',guard:true,guardAt:{x:2170,y:975},x:2120,y:975,radius:140,duration:1,clue:'승선 통로가 열렸어요. 끝 중계기에서 항로와 냉각 화물 기록을 저장해요.'}),
 Object.freeze({id:'sea-depart',short:'항로 확보',title:'이스라엘 항로 확보',action:'하이파 항로 저장',x:2190,y:975,radius:58,duration:3,clue:'하이파 격리 배양 시설의 항로와 승인 코드를 확보했다. 이스라엘에서 살아 있는 원액 대조표를 찾아야 한다. 완성 백신은 아직 없다.'})
]);
export const ISRAEL_EXPEDITION=Object.freeze({id:ISRAEL_EXPEDITION_ID,title:'마지막 신호 · 하이파 배양 시설',theme:'hospital',requires:SEA_EXPEDITION.id,
 subtitle:'항만 승인 코드로 하이파 격리 배양 시설에 진입한다. 살아 있는 원액과 K-17 대조표의 일치 여부를 검증한다.',
 opening:'하이파에 도착했다. 격리동 불빛이 아직 켜져 있다. 윤서, 네 서명이 표본 봉인에 있어. 누군가 우리보다 먼저 배양실을 열었어.',
 instructions:'봉인 번호 대조 → 배양 전원 연결 → 표본 분석 방어 → 냉각 통로 정예 제거 → 원액 대조표 회수 → 최종 격리소 좌표 확보',
 debrief:'원액은 살아 있습니다. 하지만 해독 단백질의 마지막 계통은 성가대 격리소에 남아 있습니다. 윤서의 서명은 감염 이전에 표본을 보존하려 남긴 구조 신호였습니다. 이제 최종 격리소의 문을 열 좌표와 배양 열쇠를 확보했습니다.'});
export const ISRAEL_STEPS=Object.freeze([
 {id:'israel-seal',short:'표본 봉인',title:'K-17 표본 봉인 대조',action:'봉인 번호 확인',x:1100,y:1220,radius:58,duration:2.5,clue:'제 서명이 맞아요. 감염 전에 남긴 봉인이에요. 살아 있는 표본인지 전원을 복구해 확인해야 해요.'},
 {id:'israel-power',short:'배양 전원',title:'배양 장치 전원 복구',action:'배양 전원 연결',x:1090,y:950,radius:58,duration:3,clue:'배양 장치가 켜졌어요. 분석 중엔 표본을 떠날 수 없어요. 분석대 곁에서 감염자를 막아요.'},
 {id:'israel-analysis',short:'표본 분석',title:'원액 대조 분석 방어',action:'표본 분석 방어',kind:'defend',x:1770,y:780,radius:160,duration:40,clue:'K-17과 배양 원액이 일치해요. 냉각 통로를 막은 정예를 쓰러뜨리고 대조표를 가져와요.'},
 {id:'israel-clear',short:'냉각 통로',title:'냉각 통로 정예 제거',action:'정예 감염자 제거',kind:'clear',guard:true,guardAt:{x:1740,y:860},x:1770,y:780,radius:140,duration:1,clue:'통로가 열렸어요. 대조표의 마지막 행을 확인해요. 해독 계통의 보관 장소가 남아 있을 거예요.'},
 {id:'israel-record',short:'원액 대조표',title:'살아 있는 원액 대조표 회수',action:'원액 대조표 복사',x:1770,y:780,radius:58,duration:3.5,clue:'마지막 계통은 성가대 격리소. 최종 보관체가 해독 단백질을 품고 있어요. 아직 백신은 완성되지 않았어요.'},
 {id:'israel-exit',short:'최종 좌표',title:'최종 격리소 좌표 확보',action:'배양 열쇠와 좌표 저장',x:1900,y:1040,radius:58,duration:3,clue:'살아 있는 원액 대조표와 성가대 격리소 좌표를 확보했다. 최종 보관체를 쓰러뜨려 해독 계통을 회수해야 백신을 완성할 수 있다.'}
].map(Object.freeze));
export const FINALE_EXPEDITION=Object.freeze({id:FINALE_EXPEDITION_ID,title:'마지막 신호 · 성가대 격리소',theme:'hospital',requires:ISRAEL_EXPEDITION.id,vaccineEnding:true,
 subtitle:'하이파 배양 열쇠로 마지막 격리소를 연다. 최종 보관체를 쓰러뜨리고 해독 계통과 백신 원액을 회수한다.',
 opening:'격리소의 송신기는 같은 구조 신호만 반복하고 있다. 성가대라는 이름은 이 목소리들 때문이었군. 윤서, 마지막 봉인을 열게. 이번엔 살아서 돌아간다.',
 instructions:'냉각 정화 방어 → 배양 열쇠 연결 → 최종 보관체 처치 → 백신 원액 회수 → 냉각 운송 출구',
 debrief:'보관체에서 회수한 해독 계통이 K-17 원액과 일치했습니다. 도윤은 첫 백신 원액을 냉각 용기에 담고 격리소를 빠져나옵니다. 윤서의 무전 너머로 처음 새로운 목소리가 들립니다. 살아 있습니까? 도윤은 대답합니다. 살아 있습니다. 백신을 가지고 돌아갑니다.'});
export const FINALE_PREPARATION=Object.freeze({id:'finale-preparation',preparation:true,short:'냉각 정화',title:'봉인 냉각 장치 정화 방어',action:'냉각 정화 방어',kind:'defend',x:1100,y:1220,radius:160,duration:30});
export const FINALE_STEPS=Object.freeze([
 {id:'finale-key',short:'배양 열쇠',title:'마지막 격리 봉인 해제',action:'배양 열쇠 연결',x:1100,y:1220,radius:58,duration:3,clue:'봉인이 풀렸어요. 최종 보관체가 움직여요. 돌진 예고선을 벗어나 멈춘 틈을 노려요.'},
 {id:'finale-boss',short:'최종 보관체',title:'성가대 최종 보관체 처치',action:'최종 보관체 처치',kind:'clear',finalBoss:true,guardAt:{x:1770,y:860},x:1770,y:780,radius:200,duration:1,clue:'보관체가 쓰러졌어요. 해독 계통이 살아 있어요. 냉각 장치에서 백신 원액을 회수해요.'},
 {id:'finale-vaccine',short:'백신 회수',title:'첫 백신 원액 회수',action:'냉각 용기 봉인',x:1770,y:780,radius:58,duration:4,clue:'백신 원액을 냉각 용기에 봉인했다. 운송 출구까지 살아서 돌아가야 한다.'},
 {id:'finale-extract',short:'백신 운송',title:'백신 원액과 함께 탈출',action:'냉각 운송 경로 확보',x:1200,y:1480,radius:58,duration:3,clue:'최종 보관체를 처치하고 첫 백신 원액을 확보해 격리소를 탈출했다. 이제 남은 생존자들에게 돌아간다.'}
].map(Object.freeze));
export const relayChannel=(target,hold)=>Math.min(Math.ceil(target.duration/target.interval)-1,Math.floor((hold+1e-8)/target.interval))%target.zones.length;
export const EXPEDITIONS=Object.freeze([Object.freeze({...CITY_EXPEDITION,steps:EXPEDITION_STEPS,nextId:ROOF_EXPEDITION.id}),Object.freeze({...ROOF_EXPEDITION,steps:ROOF_STEPS,nextId:HOSPITAL_EXPEDITION.id}),Object.freeze({...HOSPITAL_EXPEDITION,steps:HOSPITAL_STEPS,nextId:NORTH_EXPEDITION.id}),Object.freeze({...NORTH_EXPEDITION,steps:NORTH_STEPS,nextId:SEA_EXPEDITION.id}),Object.freeze({...SEA_EXPEDITION,steps:SEA_STEPS,nextId:ISRAEL_EXPEDITION.id}),Object.freeze({...ISRAEL_EXPEDITION,steps:ISRAEL_STEPS,nextId:FINALE_EXPEDITION.id}),Object.freeze({...FINALE_EXPEDITION,steps:FINALE_STEPS}),Object.freeze({...COLD_CHAIN_EXPEDITION,steps:COLD_CHAIN_STEPS,nextId:ROOF_EXPEDITION.id}),Object.freeze({...HARBOR_POWER_EXPEDITION,steps:HARBOR_POWER_STEPS,nextId:SEA_EXPEDITION.id}),Object.freeze({...PATIENT_RECORD_EXPEDITION,steps:PATIENT_RECORD_STEPS,nextId:NORTH_EXPEDITION.id}),Object.freeze({...HAIFA_TRANSFER_EXPEDITION,steps:HAIFA_TRANSFER_STEPS,nextId:FINALE_EXPEDITION.id})]);
export const getExpedition=id=>EXPEDITIONS.find(e=>e.id===id)||null;
export const expeditionHasTransport=id=>!!getExpedition(id)?.steps.some(t=>t.kind==='escort');
export const newExpedition=(id=CITY_EXPEDITION.id)=>getExpedition(id)?{id,step:0,hold:0,...(id===FINALE_EXPEDITION_ID?{bossDefeated:false,prepHold:0}:{})}:null;
export function validExpeditionState(s){const definition=getExpedition(s?.id);return !!definition&&Object.getPrototypeOf(s)===Object.prototype&&Object.keys(s).length===(s.id===FINALE_EXPEDITION_ID?(Object.hasOwn(s,'prepHold')?5:4):3)&&(s.id!==FINALE_EXPEDITION_ID||typeof s.bossDefeated==='boolean'&&(s.step<2||s.bossDefeated))&&(s.id!==FINALE_EXPEDITION_ID||!Object.hasOwn(s,'prepHold')||Number.isFinite(s.prepHold)&&s.prepHold>=0&&s.prepHold<=30&&(s.step===0||s.prepHold===30)&&(s.prepHold===30||s.hold===0))&&Number.isInteger(s.step)&&s.step>=0&&s.step<definition.steps.length&&Number.isFinite(s.hold)&&s.hold>=0&&s.hold<definition.steps[s.step].duration;}
export function expeditionBlockerCount(game,target=expeditionTarget(game)){return (target?.blockers||[]).filter(b=>!game.world.obstacles.some(o=>o.x===b.x&&o.y===b.y&&o.destroyed)).length;}
export function expeditionGuardCount(game){let count=0;for(const e of game?.enemies||[])if((e.gatekeeper||game?.expedition?.id===FINALE_EXPEDITION_ID&&e.type==='collector')&&!e.dead)count++;return count;}
export function expeditionTarget(game){if(game?.expedition?.id===FINALE_EXPEDITION_ID&&game.expedition.step===0&&Number.isFinite(game.expedition.prepHold)&&game.expedition.prepHold<30)return FINALE_PREPARATION;const target=getExpedition(game?.expedition?.id)?.steps[game.expedition.step];if(target?.kind==='relay'){const channel=relayChannel(target,game.expedition.hold);return {...target,...target.zones[channel],channel};}return target?.kind==='escort'?{...target,...escortPoint(target,game.expedition.hold)}:target||null;}
export const expeditionHold=(game,target=expeditionTarget(game))=>target?.preparation?game.expedition.prepHold:game.expedition.hold;
const transportCache=new WeakMap();
export function expeditionTransport(game){const s=game?.expedition;if(!s)return null;const cached=transportCache.get(game);if(cached&&cached.id===s.id&&cached.step===s.step&&cached.hold===s.hold)return cached.body;const definition=getExpedition(game?.expedition?.id);let index=definition?.steps.findLastIndex((t,i)=>t.kind==='escort'&&i<=s.step)??-1;if(index<0)index=definition?.steps.findIndex(t=>t.kind==='escort')??-1;if(index<0)return null;const target=definition.steps[index],elapsed=game.expedition.step===index?game.expedition.hold:game.expedition.step>index?target.duration:0,p=escortPoint(target,elapsed);const body=Object.freeze({id:'expedition-transport',transport:true,kind:'car',variant:'cold-transport',...transportBody(p),height:27,angle:p.angle,hp:Infinity,maxHp:Infinity,destroyed:false,label:'K-17 / COLD CHAIN'});transportCache.set(game,{id:s.id,step:s.step,hold:s.hold,body});return body;}
export function expeditionGuidance(game){const target=expeditionTarget(game),definition=getExpedition(game?.expedition?.id);if(!definition)return null;if(!target)return {objective:'원정 목표 완료',detail:'다음 목적지의 단서를 확보했습니다.',progress:1,kind:'complete'};const distance=Math.hypot(game.player.x-target.x,game.player.y-target.y),near=distance<=target.radius,hold=expeditionHold(game,target);return {objective:target.title,detail:target.kind==='relay'?(near?'승인 송신 중':'반대편 중계기로 이동하세요')+' · 채널 '+(target.channel===0?'A':'B')+' · '+Math.floor(hold/target.duration*100)+'%':target.kind==='escort'?(near?(escortBlocked(game,target)?escortBlockReason(game,target)==='player'?'차량 앞을 비우고 옆에서 호위하세요':'견인로가 막혔습니다 · 차량 주변 정리':'견인 중 · 차량 곁에서 이동하세요'):'차량 곁으로 복귀하세요 · 견인 일시정지')+' · '+Math.floor(hold/target.duration*100)+'%':target.kind==='breach'?(expeditionBlockerCount(game,target)>0?'F 수동 사격으로 차단 차량 파괴 · 남은 '+expeditionBlockerCount(game,target)+'대':near?'차단 차량 제거 · 견인로 확인 중':'차단 지점으로 이동하세요'):target.kind==='clear'?(expeditionGuardCount(game)>0?(target.finalBoss?'최종 보관체를 처치하세요':'통로 정예를 처치하세요')+' · 남은 '+expeditionGuardCount(game)+'마리':near?'통로 확보 · 기록함 접근 중':'금색 임무 지점으로 이동하세요'):target.kind==='defend'?(near?(target.preparation?'냉각 정화 중 · 범위를 지키며 감염자를 막으세요':target.action+' 중 · 범위를 지키며 감염자를 막으세요'):hold>0?'전송 범위로 복귀하세요':'송신대 방어 범위로 이동하세요')+(near?' · 남은 '+Math.ceil(target.duration-hold)+'초':''):near?target.action+' · X 또는 임무 버튼 길게 누르기'+(game.flash>0?' · 피격 후 다시 시도':''):'목표까지 '+Math.ceil(distance)+'m · 금색 표식으로 이동',progress:game.expedition.id===FINALE_EXPEDITION_ID&&game.expedition.step===0&&Number.isFinite(game.expedition.prepHold)?(target.preparation?hold/target.duration*.75:.75+hold/target.duration*.25)/definition.steps.length:(game.expedition.step+hold/target.duration)/definition.steps.length,kind:'expedition'};}
export function updateExpedition(game,dt,input){const target=expeditionTarget(game);if(!target||game.state!=='playing')return;if(target.preparation){const s=game.expedition,near=Math.hypot(game.player.x-target.x,game.player.y-target.y)<=target.radius;s.prepHold=near?Math.min(target.duration,s.prepHold+dt):Math.max(0,s.prepHold-dt*.35);if(s.prepHold>=target.duration){game.addNoise(8);game.emit('expedition-prepared',{id:target.id});}return;}const s=game.expedition,near=Math.hypot(game.player.x-target.x,game.player.y-target.y)<=target.radius,can=target.kind==='relay'?near:target.kind==='escort'?near&&!escortBlocked(game,target,dt):target.kind==='breach'?near&&expeditionBlockerCount(game,target)===0:target.kind==='clear'?near&&expeditionGuardCount(game)===0:target.kind==='defend'?near:near&&input.interact===true&&game.flash<=0&&game.player.dashTime<=0;
 const before=s.hold;s.hold=can?Math.min(target.duration,s.hold+dt):Math.max(0,s.hold-dt*(['escort','relay'].includes(target.kind)?0:target.kind==='defend'?.35:1.8));
 if(target.kind==='relay'&&s.hold<target.duration-1e-8&&relayChannel(target,before)!==relayChannel(target,s.hold))game.emit('expedition-relay',{channel:relayChannel(target,s.hold),step:s.step});
 if(s.hold+1e-8<target.duration)return;const upcoming=getExpedition(s.id).steps[s.step+1];if(upcoming?.guard||upcoming?.finalBoss){const guard=game.spawnEnemy(upcoming.finalBoss?'collector':'elite',400,upcoming.guardAt);if(!guard){s.hold=target.duration-1e-6;return;}if(upcoming.finalBoss){guard.hp=guard.maxHp=1800;guard.damage=20;game.emit('boss',{final:true});}else guard.gatekeeper=true;game.emit('expedition-guard',{x:guard.x,y:guard.y});}s.step++;s.hold=0;game.addNoise(18);game.emit('expedition-step',{step:s.step,id:target.id,clue:target.clue,x:target.x,y:target.y});
 if(s.step===getExpedition(s.id).steps.length){game.end(true);return;}
 for(let i=0;i<2+s.step;i++)game.spawnEnemy(s.step===1?'walker':'runner',400+i*35);
}


export function normalizeExpeditionProgress(raw){const cleared=EXPEDITIONS.filter(e=>Array.isArray(raw?.cleared)&&raw.cleared.includes(e.id)).map(e=>e.id),bestTimes={};for(const id of cleared){const time=raw?.bestTimes?.[id];if(Number.isFinite(time)&&time>=0&&time<=1e9)bestTimes[id]=time;}return {cleared,bestTimes};}
export function planExpeditionCompletion(raw,result){const definition=getExpedition(result?.expeditionId);if(!definition||definition.vaccineEnding&&result.vaccineRecovered!==true||result.won!==true||result.objectivesCompleted!==definition.steps.length||!Number.isFinite(result.time)||result.time<0||result.time>1e9)return null;const progress=normalizeExpeditionProgress(raw),old=progress.bestTimes[definition.id];return {cleared:EXPEDITIONS.filter(e=>progress.cleared.includes(e.id)||e.id===definition.id).map(e=>e.id),bestTimes:{...progress.bestTimes,[definition.id]:old===undefined?result.time:Math.min(old,result.time)}};}

export function expeditionUnlocked(progress,id){const definition=getExpedition(id);return !!definition&&(!definition.requires||normalizeExpeditionProgress(progress).cleared.includes(definition.requires));}
