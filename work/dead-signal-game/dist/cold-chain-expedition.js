import {createCity} from './world.js?v=0.29.0';
export const COLD_CHAIN_EXPEDITION=Object.freeze({
 id:'last-signal-cold-chain-01b',title:'마지막 신호 · 마트 냉각 우회',requires:'last-signal-city-01',optional:true,
 subtitle:'마트 외부 냉각 설비를 살려 백신 운송에 쓸 빈 냉각 용기를 확보한다.',
 opening:'윤서, 마트 뒤편 비상 냉각 장치가 아직 살아 있어. 약을 찾아도 옮기는 동안 상하면 끝이야. 옥상으로 가기 전에 운송 용기부터 확보할게.',
 instructions:'전력 분리 → 냉각 전원 유지 → 통로 정예 제거 → 예비 배터리 회수 → 용기 봉인 방어 → 옥상 계단',
 debrief:'배터리와 빈 냉각 용기를 확보했습니다. 용기 안에는 백신이 없습니다. 하지만 병원 기록을 따라 원액을 찾았을 때, 살아 있는 상태로 옮길 수 있는 방법을 마련했습니다. 옥상 중계 신호를 따라 다음 단서를 추적합니다.'
});
export const COLD_CHAIN_STEPS=Object.freeze([
 {id:'cold-isolate',short:'전력 분리',title:'마트 비상 회로 분리',action:'냉각 회로 연결',x:1050,y:840,radius:58,duration:2.4,clue:'전력은 돌아왔어요. 냉각 압력이 안정될 때까지 마트 입구 설비를 지켜요.'},
 {id:'cold-power',short:'전원 유지',title:'마트 냉각 전원 유지',action:'냉각 전원 유지 방어',kind:'defend',x:1675,y:1045,radius:155,duration:24,clue:'전원 소리에 통로 감염자가 나왔어요. 예비 배터리를 꺼내기 전에 저 정예를 쓰러뜨려야 해요.'},
 {id:'cold-clear',short:'통로 정예',title:'냉각 설비 통로 정리',action:'통로 정예 제거',kind:'clear',guard:true,guardAt:{x:1850,y:1045},x:1675,y:1045,radius:170,duration:1,clue:'통로가 열렸어요. 예비 배터리를 가져오면 도시 전력이 끊겨도 용기를 유지할 수 있어요.'},
 {id:'cold-battery',short:'예비 배터리',title:'냉각 예비 배터리 회수',action:'배터리 연결부 분리',x:1450,y:930,radius:58,duration:3,clue:'배터리를 확보했다. 처음 전원을 연결한 곳으로 돌아가 냉각 용기를 봉인한다.'},
 {id:'cold-seal',short:'용기 봉인',title:'운송 용기 냉각·봉인 방어',action:'냉각 용기 봉인 방어',kind:'defend',x:1050,y:840,radius:160,duration:30,clue:'빈 냉각 용기가 밀봉됐어요. 백신을 찾은 건 아니에요. 이제 찾은 원액을 살려서 옮길 준비가 된 거예요.'},
 {id:'cold-extract',short:'옥상 계단',title:'냉각 용기를 확보해 옥상으로',action:'운송 용기 이동 준비',x:1200,y:510,radius:58,duration:3,clue:'마트 외부 설비에서 빈 냉각 용기와 예비 배터리를 확보했다. 옥상 중계 신호를 따라 병원의 이송 기록으로 향한다.'}
].map(Object.freeze));

export function createColdChainWorld({nextId,seed=0}){const world=createCity({stage:0,route:'hospital',random:()=>.5,nextId,seed});world.expeditionId=COLD_CHAIN_EXPEDITION.id;world.decor=world.decor.filter(d=>d.kind==='lamp');return world;}
