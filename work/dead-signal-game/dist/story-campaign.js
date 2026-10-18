// Original Dead Signal narrative. Planned expeditions are explicitly separated
// from the twelve playable city missions; save IDs and combat catalog stay stable.
export const STORY_PREMISE=Object.freeze({title:'마지막 신호',protagonist:'한도윤',contact:'서윤서',opening:'발병 사흘째, 구조대원 한도윤은 대피소에서 동생의 이름이 지워진 명단을 발견한다. 폐기된 무전기에서 한 문장이 반복된다. “백신은 있어요. 하지만 여기에는 없어요.”',promise:'사람을 구하던 손으로 길을 열고, 마지막 감염체를 쓰러뜨려 백신을 가져온다.'});
export const EXPEDITION_ACTS=Object.freeze([
 {id:'act-01',title:'꺼진 도시',route:['거리','대형마트','건물 옥상','격리병원','화물 부두'],question:'방송 속 목소리는 살아 있는 사람인가?',revelation:'백신으로 알려진 것은 감염을 늦추는 불완전한 억제제다.',handoff:'원형 균주가 보관된 북쪽 시설의 운송 좌표',mainHours:10,optionalHours:6},
 {id:'act-02',title:'침묵의 경계',route:['북한 접경 철도','폐쇄 도시','산악 터널','지하 냉동 연구소'],question:'왜 이 시설은 발병 전에 봉쇄되었나?',revelation:'연구진은 생존자를 구하려다 실패했고 마지막 균주만 냉동 보존했다.',handoff:'이스라엘 협력 연구소의 배양 프로토콜과 탈출 수송기',mainHours:12,optionalHours:6},
 {id:'act-03',title:'성벽 너머',route:['이스라엘 공항','피난 시장','성벽 통제소','옥상 연결로','사막 중계소'],question:'안전한 도시라는 방송은 누구를 위한 것인가?',revelation:'방벽 안에서도 감염이 번진다. 연구자 윤서는 아직 생존해 있다.',handoff:'생산 설비로 향하는 해상 통로와 살아 있는 연구자',mainHours:12,optionalHours:6},
 {id:'act-04',title:'검은 항로',route:['봉쇄 항구','구조선','침수 기관실','검역 섬'],question:'백신 한 상자를 위해 배의 사람들을 버릴 수 있는가?',revelation:'냉장고의 약은 위조품이다. 진짜 생산 원액은 폭풍 해역의 시설에 있다.',handoff:'시설 출입키와 항해 가능한 구조선',mainHours:10,optionalHours:6},
 {id:'act-05',title:'태풍의 심장',route:['해상 채굴 시설','해저 연결 터널','생산 실험동','냉각 코어'],question:'원액을 회수하면 시설의 격리는 유지될 수 있는가?',revelation:'시설을 장악한 감염체가 냉각 계통과 융합했다. 몸속 보호 캡슐에 마지막 백신 원액이 있다.',handoff:'배양 검증을 마친 백신과 최종 격리실 좌표',mainHours:12,optionalHours:6},
 {id:'act-06',title:'새벽의 신호',route:['최종 격리실','붕괴하는 플랫폼','대피선','첫 접종소'],question:'마지막 백신을 가지고 살아서 돌아갈 수 있는가?',revelation:'최종 보스 “성가대”를 쓰러뜨리고 보호 캡슐의 원액을 회수한다. 도윤은 구조 방송을 다시 켠다.',handoff:'접종과 생산법을 함께 전달한다. 동생의 생사는 구조 명단에서 확인하는 후일담으로 남긴다.',mainHours:8,optionalHours:6}
].map(Object.freeze));
export const CAMPAIGN_SCOPE=Object.freeze({status:'expansion-planned',mainHours:64,optionalHours:36,totalTargetHours:100,chaptersTarget:72,playableCityMissions:12,note:'100시간은 콘텐츠 제작 목표다. 현재 구현되거나 실측된 플레이 시간이 아니다.'});
const beats=[
 ['발병 사흘째','마트로 가던 피난민의 마지막 무전이 공사장 확성기에 남았다. 도윤은 식량보다 먼저 방송 배터리를 찾는다.','첫 봉쇄선을 돌파해 대피소 무전 채널을 복구한다.','지하 배수로를 통해 병원으로 가던 구조대의 경로'],
 ['물 아래의 목소리','복구된 채널에서 아이의 기침과 물소리가 들린다. 지상 도로는 막혔고 구조대는 배수로로 사라졌다.','배수 시설의 출구를 열어 구조대 기록을 회수한다.','병원 냉장 화물이 부두로 반출된 기록'],
 ['비어 있는 냉장고','선박의 냉장 컨테이너에는 약 대신 깨진 유리병과 환자 번호표가 있다. 반출 지시자는 아직 병원에 있다.','화물 송장을 확보하고 격리병원으로 돌아갈 길을 연다.','서윤서 연구자의 병동 호출 번호'],
 ['발열 기록','윤서는 백신을 찾고 있다는 말에 대답하지 않는다. 대신 감염이 늦어진 환자의 혈액 검사를 보내온다.','병원의 검사 기록을 지켜 억제제와 백신을 구분한다.','검문구역으로 이송된 유일한 생존 피험자'],
 ['통과할 수 없는 이름','검문 기록에 동생의 이름이 있다. 통과 시각도 있다. 도윤은 살아 있다는 증거가 아닌데도 그 종이를 접어 넣는다.','이송 차량의 통과 기록을 확보한다.','환승터미널에서 끊어진 이송 차량 신호'],
 ['출발하지 못한 버스','대피 버스의 행선지는 모두 지워졌다. 차량 무전은 송전소가 살아나야 해독할 수 있다.','터미널 통신 릴레이를 되찾는다.','송전소 비상 전력 회로 위치'],
 ['불을 켜는 대가','도시에 불이 돌아오자 건물의 감염자들이 동시에 고개를 든다. 윤서는 전력 복구보다 송신을 멈추라고 말한다.','무리를 버티며 해독 전원을 확보한다.','바다로 향하는 연료 운송 계획'],
 ['남은 연료','정유시설의 불길 뒤로 구조선의 연료 탱크가 보인다. 도윤은 탈출 좌석보다 냉장 전력을 먼저 챙긴다.','구조선과 냉장고를 가동할 연료를 확보한다.','군수창고의 방수 운송 캡슐 번호'],
 ['밀봉된 증거','캡슐은 비어 있다. 그 안의 기록에는 북쪽 시설과 해외 협력 연구소의 이름이 연결되어 있다.','폭발 위험을 뚫고 기록과 방수 캡슐을 회수한다.','폐차압축장에 남은 냉장 수송차'],
 ['다시 움직이는 것','압축기 아래에서 수송차의 냉각 장치가 아직 돌아간다. 배터리 잔량은 부족하지만 이제 약을 운반할 수 있다.','냉장 장치를 회수하고 탈출 통로를 연다.','폐온실의 생존 연구자가 숨긴 균주 식별 기록'],
 ['살아 있는 표본','윤서는 자신도 감염되었다고 고백한다. 도윤은 무전을 끄지 않는다. 치료는 사람에게 돌아가기 위한 약속이 된다.','균주 식별 기록을 확보해 다음 시설의 좌표를 검증한다.','태풍방벽 너머 출항 가능한 마지막 구조선'],
 ['도시의 마지막 밤','방벽이 열리면 바닷물이 밀려온다. 도윤은 마지막 봉쇄자를 쓰러뜨리고 구조선으로 건너간다. 백신은 아직 없다. 이제 찾아갈 곳이 있다.','최종 봉쇄자를 처치하고 원정 좌표를 회수한다.','북한의 원형 균주 시설과 이스라엘의 배양 연구소']
];
export const CITY_STORY=Object.freeze(beats.map(([title,briefing,objective,lead],i)=>Object.freeze({missionId:`mission-${String(i+1).padStart(2,'0')}`,title,briefing,objective,lead})));
export const storyForMission=id=>CITY_STORY.find(chapter=>chapter.missionId===id)||null;
export function storyDossier(id,{cleared=false,escape=String}={}){const s=storyForMission(id);if(!s)return '';return `<section class="story-dossier" aria-label="작전 이야기"><p class="eyebrow">LAST SIGNAL / ${escape(s.title)}</p><p>${escape(s.briefing)}</p><p><strong>이번 작전의 목적</strong> · ${escape(s.objective)}</p>${cleared?`<p class="success">확보한 단서 · ${escape(s.lead)}</p>`:'<p class="muted">작전을 완료하면 다음 목적지의 단서가 기록됩니다.</p>'}</section>`;}

const escapeStory=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function storyResultHTML(game){const story=storyForMission(game?.missionId),result=game?.result;if(!story||!result?.won||!result.defeatedBossIds?.includes(game.mission?.finalBoss))return '';return '<section class="story-dossier story-result" aria-label="확보한 이야기 단서"><p class="eyebrow">RECOVERED / '+escapeStory(story.title)+'</p><p>'+escapeStory(story.lead)+'</p><p class="muted">'+(game.mission.index===11?'도시편 완료 · 다음 원정을 위한 좌표를 확보했습니다.':'이 단서가 다음 작전으로 이어집니다.')+'</p></section>';}
