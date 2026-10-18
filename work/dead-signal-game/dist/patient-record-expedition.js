import {createHospitalWorld} from './hospital-world.js';
export const PATIENT_RECORD_EXPEDITION=Object.freeze({id:'last-signal-patient-record-03b',title:'마지막 신호 · 환자 대조 기록',theme:'hospital',requires:'last-signal-hospital-03',optional:true,routeDetail:'선택 분기 · 검체 방어·두 정예 통로·교차 대조',subtitle:'환자 번호표와 냉동 검체를 대조해 억제제의 한계를 확인한다.',opening:'윤서, 병원 명단에서 같은 사람이 두 번 퇴원했어. 첫 번째는 살아서, 두 번째는 운송 화물로. 윤서는 한참 대답하지 않는다. 도윤 씨, 약 이름을 믿지 말아요. 누구에게서 나온 검체인지 찾아야 해요. 살아 돌아갈 수 있는 치료인지, 여기서 확인해야 해요.',instructions:'번호표 → 냉동 검체 → 배양 방어 → 격리 통로 정예 → 연구 통로 정예 → 양쪽 단말 대조 → 내성 기록 → 봉인 → 북쪽 이송 출구',debrief:'환자 041의 검체는 억제제에 잠시 반응했지만 감염은 멈추지 않았습니다. 두 번의 퇴원 기록은 치료 성공이 아니라 냉동 시설로 이송된 흔적이었습니다. 도윤은 번호표를 버리지 않습니다. 윤서는 북쪽 원형 균주와 이 기록을 대조하겠다고 약속합니다. 완성 백신은 아직 없습니다.'});
export const PATIENT_RECORD_STEPS=Object.freeze([
{id:'patient-tag',short:'환자 번호표',title:'중복 퇴원 환자의 번호표 회수',action:'퇴원 기록 대조',x:1100,y:1200,radius:58,duration:3,clue:'환자 041의 두 번째 퇴원 시각에는 구급차가 없었다. 냉동 화물의 검체 번호가 남아 있다.'},
{id:'patient-sample',short:'냉동 검체',title:'041번 냉동 검체의 인계 장치 복구',action:'검체 보존 전원 연결',x:1120,y:980,radius:58,duration:4,clue:'검체는 살아 있어요. 세포 반응을 기록하는 동안 보존 전원 주변을 지켜요.'},
{id:'patient-culture',short:'배양 방어',title:'검체 세포 반응 기록 방어',action:'검체 반응 기록',kind:'defend',x:1120,y:980,radius:150,duration:45,clue:'억제제로 열은 내렸지만 감염 반응은 남아 있어요. 격리 통로의 환자 기록함을 확인해야 해요.'},
{id:'patient-isolation',short:'격리 통로',title:'격리 기록함의 정예 감염자 처치',action:'격리 통로 정예 제거',kind:'clear',guard:true,guardAt:{x:1780,y:890},x:1750,y:920,radius:180,duration:1,clue:'기록함은 연구동 단말과 한 쌍이에요. 연구 통로에도 감염자가 있어요. 두 단말을 모두 열어야 해요.'},
{id:'patient-research',short:'연구 통로',title:'연구 단말의 정예 감염자 처치',action:'연구 통로 정예 제거',kind:'clear',guard:true,guardAt:{x:1350,y:1250},x:1330,y:1210,radius:180,duration:1,clue:'두 통로를 확보했어요. 단말 A와 B를 번갈아 연결해 환자 번호와 검체 번호가 같은지 확인해요.'},
{id:'patient-crosscheck',short:'교차 대조',title:'환자·검체 단말 교차 대조',action:'검체 번호 대조',kind:'relay',x:1120,y:980,radius:85,duration:24,interval:6,zones:[{x:1120,y:980},{x:1330,y:1210}],clue:'두 기록은 같은 환자예요. 치료 성공으로 발표된 숫자는 감염 지연 시간이었어요. 원래 검사 보고서를 회수해요.'},
{id:'patient-resistance',short:'내성 기록',title:'억제제 내성 검사 원본 회수',action:'내성 검사 보고서 복사',x:1300,y:780,radius:58,duration:4,clue:'원형 균주 K-17은 억제제를 견뎠다. 환자 041은 치료된 것이 아니라 북쪽 시설로 이송되었다.'},
{id:'patient-seal',short:'검체 봉인',title:'검체와 원본 보고서 봉인',action:'검체 운송 봉인',x:1100,y:1200,radius:58,duration:4,clue:'번호표와 검체를 함께 봉인했다. 사람을 화물 번호로 바꾼 기록을 끝까지 추적한다. 백신은 아직 없다.'},
{id:'patient-extract',short:'북쪽 이송',title:'검체를 들고 북쪽 이송 경로로 복귀',action:'북쪽 이송 출구 확보',x:1200,y:1460,radius:58,duration:3,clue:'환자 041의 대조 기록을 확보했다. 북쪽 냉동 시설의 원형 균주와 비교할 증거를 가지고 떠난다.'}
].map(Object.freeze));
export function createPatientRecordWorld(options){const world=createHospitalWorld(options);world.expeditionId=PATIENT_RECORD_EXPEDITION.id;return world;}
