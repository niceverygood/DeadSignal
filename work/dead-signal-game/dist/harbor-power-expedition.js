import {createSeaWorld} from './sea-world.js';
export const HARBOR_POWER_EXPEDITION=Object.freeze({
 id:'last-signal-harbor-power-04b',title:'마지막 신호 · 항만 침수 전력',theme:'harbor',requires:'last-signal-north-04',optional:true,
 routeDetail:'선택 분기 · 냉각 배터리 차량 호위와 부두 교차 승인',
 subtitle:'침수된 항만의 비상 전력을 복구하고 냉각 배터리 차량을 부두로 호위한다.',
 opening:'윤서, 부두 무전에 같은 이름이 계속 들려. K-17 운송 기사야. 마지막 배에 전력이 없어서 아무도 출항하지 못하고 있어. 차량의 예비 냉각 배터리를 옮길 수 있다면 항로도, 원액을 옮길 방법도 살릴 수 있어.',
 instructions:'운송 명단 → 비상 전력 → 배터리 충전 방어 → 부두 정예 → 차량 호위 → 교차 승인 → 이송 기록 → 부두 출구',
 debrief:'배터리 차량과 항만 전력 인계 기록을 확보했습니다. 끊긴 무전의 주인은 끝까지 배터리를 지켰습니다. 그의 이름을 지우지 않고 이송 기록에 남겼습니다. 완성 백신은 아직 없습니다. 이제 해상 항로에서 K-17 원액의 목적지를 추적합니다.'
});
export const HARBOR_POWER_STEPS=Object.freeze([
 {id:'harbor-list',short:'운송 명단',title:'끊긴 기사 무전의 운송 명단',action:'운송 기사 기록 회수',x:1120,y:1340,radius:58,duration:3,clue:'기사는 차량을 버리지 않았어요. 부두가 잠기기 전에 예비 배터리를 충전하려던 거예요. 북쪽 분전함을 찾아요.'},
 {id:'harbor-power',short:'비상 전력',title:'항만 비상 분전함 복구',action:'침수 회로 분리',x:1180,y:1140,radius:58,duration:3,clue:'전력은 돌아왔지만 배터리 온도가 불안정해요. 충전이 끝날 때까지 분전함 주변을 지켜요.'},
 {id:'harbor-charge',short:'충전 방어',title:'냉각 예비 배터리 충전 방어',action:'배터리 충전 방어',kind:'defend',x:1180,y:1140,radius:150,duration:40,clue:'배터리 충전 완료. 부두로 가는 길에 정예 감염자가 있어요. 차량을 움직이기 전에 길을 열어요.'},
 {id:'harbor-clear',short:'부두 정예',title:'배터리 차량의 부두 진입로 확보',action:'부두 정예 제거',kind:'clear',guard:true,guardAt:{x:1830,y:1040},x:1700,y:1040,radius:145,duration:1,clue:'부두 진입로를 확보했어요. 차량 앞으로 서면 견인이 멈춰요. 옆에서 호위하며 감염자를 밀어내요.'},
 {id:'harbor-escort',short:'차량 호위',title:'냉각 배터리 차량을 부두까지 호위',action:'배터리 차량 견인',kind:'escort',x:1180,y:1040,radius:150,clearance:72,duration:32,path:[{x:1180,y:1040},{x:1400,y:1030},{x:1660,y:1010},{x:1900,y:960}],clue:'차량이 부두에 도착했어요. 양쪽 승인 채널을 번갈아 연결해야 전력을 인계할 수 있어요.'},
 {id:'harbor-approve',short:'교차 승인',title:'부두 양안 전력 인계 승인',action:'전력 인계 신호 송신',kind:'relay',x:1950,y:950,radius:90,duration:24,interval:6,zones:[{x:1950,y:950},{x:2190,y:975}],clue:'전력 인계가 승인됐어요. 기사의 마지막 이송 기록을 회수해요. K-17의 다음 항구가 남아 있을 거예요.'},
 {id:'harbor-records',short:'이송 기록',title:'기사의 마지막 해상 이송 기록',action:'항만 인계 기록 복사',x:1740,y:1135,radius:58,duration:3,clue:'기사의 이름과 배터리 번호를 기록했다. 백신은 아직 없다. 해상 송장에는 하이파 연구 화물의 인계 채널이 남아 있다.'},
 {id:'harbor-extract',short:'부두 출구',title:'전력을 확보한 부두로 복귀',action:'해상 추적 출항 준비',x:2190,y:975,radius:58,duration:3,clue:'기사의 기록과 냉각 배터리 차량을 확보했다. 해상 항로에서 K-17 원액의 행선지를 계속 추적한다.'}
].map(Object.freeze));
export function createHarborPowerWorld(options){const world=createSeaWorld(options);world.expeditionId=HARBOR_POWER_EXPEDITION.id;return world;}
