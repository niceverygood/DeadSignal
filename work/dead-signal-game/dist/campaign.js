// Campaign content is data: simulation, interface and portraits share one catalog.
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const pool = (...weights) => ['walker', 'runner', 'shield', 'screamer', 'gas']
  .map((type, i) => ({ type, weight: weights[i] || 0 })).filter(entry => entry.weight > 0);
const appearance = (silhouette, head, prop, back, arms, legs, description) =>
  ({ silhouette, head, prop, back, arms, legs, description });
const palette = (body, accent, skin) => ({ body, accent, skin });
const stats = (hp, speed, r, damage, xp) => ({ hp, speed, r, damage, xp });

const CONTENT = [
  {
    title: '철거 공사장', subtitle: '끊어진 공사 방송을 따라 첫 봉쇄선을 돌파한다.', theme: 'demolition', accent: '#d4a45b',
    enemyPool: pool(76, 18, 0, 0, 6), family: 'charge',
    mid: {
      name: '추격 반장', title: '안전모를 쓴 현장 감독',
      skillName: '안전선 돌진', skillDescription: '노란 예고선을 남기고 직선으로 돌진한다.', counter: '예고선 옆으로 회피한 뒤 멈춘 등을 공격하세요.',
      appearance: appearance('runner-heavy', 'hardhat', 'road-sign', 'warning-lamp', 2, 2, '갈라진 안전모, 도로 표지판 팔, 등에 달린 노란 경광등'),
      palette: palette('#8b724e', '#e1b45d', '#8c9a7e'), stats: stats(360, 68, 27, 17, 45),
      skill: { kind: 'charge', cooldown: 6, windup: .9, recovery: 1.2, speed: 390, duration: .65, damage: 21 }
    },
    final: {
      name: '철거 감독관', title: '콘크리트 팔의 거인',
      skillName: '연속 철거', skillDescription: '큰 경고선을 따라 두 번 돌진하고 긴 빈틈을 드러낸다.', counter: '첫 돌진 뒤 멈추지 말고 두 번째 선까지 피하세요.',
      appearance: appearance('bulldozer', 'welding-mask', 'concrete-hammer', 'demolition-frame', 4, 2, '용접 가면 아래 작은 머리, 네 개의 콘크리트 팔, 철골 등뼈'),
      palette: palette('#78654a', '#f3bb62', '#748575'), stats: stats(900, 52, 45, 24, 110),
      skill: { kind: 'charge', cooldown: 7, windup: 1.15, recovery: 1.65, speed: 440, duration: .75, count: 2, damage: 27 }
    }
  },
  {
    title: '하수처리장', subtitle: '수로가 막히기 전에 배수 시설의 감염원을 제거한다.', theme: 'sewers', accent: '#82a799',
    enemyPool: pool(65, 12, 10, 0, 13), family: 'slam',
    mid: {
      name: '맨홀 작업자', title: '뚜껑을 든 배수공',
      skillName: '맨홀 낙하', skillDescription: '원형 예고 영역에 맨홀 뚜껑을 내리찍는다.', counter: '발밑 원이 채워지기 전에 원 밖으로 이동하세요.',
      appearance: appearance('manhole-brute', 'gas-mask', 'manhole-cover', 'drain-pipes', 2, 2, '방독면, 둥근 맨홀 방패, 어깨에서 솟은 배수관'),
      palette: palette('#526f65', '#b3c8a0', '#899582'), stats: stats(380, 54, 31, 18, 50),
      skill: { kind: 'slam', cooldown: 5.8, windup: 1, recovery: 1.25, radius: 150, damage: 24 }
    },
    final: {
      name: '준설 기사', title: '오니 탱크를 진 거인',
      skillName: '수로 파쇄', skillDescription: '넓은 충격파를 내리친 뒤 바깥 원에 한 번 더 충격을 보낸다.', counter: '안쪽 원을 벗어난 뒤 두 번째 원의 빈 공간을 찾으세요.',
      appearance: appearance('dredger', 'pressure-helmet', 'pile-driver', 'sludge-tank', 4, 4, '압력 잠수모, 말뚝 팔, 거대한 오니 탱크와 네 다리'),
      palette: palette('#435e54', '#9fb59a', '#748b78'), stats: stats(930, 44, 49, 24, 125),
      skill: { kind: 'slam', cooldown: 7, windup: 1.2, recovery: 1.6, radius: 205, count: 2, damage: 29 }
    }
  },
  {
    title: '화물 부두', subtitle: '쌓인 컨테이너 사이에서 감염 화물의 하역을 중단시킨다.', theme: 'harbor', accent: '#8baab8',
    enemyPool: pool(56, 14, 14, 10, 6), family: 'summon',
    mid: {
      name: '컨테이너 반장', title: '갈고리로 신호하는 하역공',
      skillName: '하역 호출', skillDescription: '신호 깃발을 들고 주변에 작업 좀비를 불러낸다.', counter: '소환 예고가 뜨면 반장에게 화력을 집중하세요.',
      appearance: appearance('crane-worker', 'cap', 'cargo-hook', 'container-cage', 2, 2, '항만 모자, 갈고리 손, 등에 걸친 컨테이너 창살'),
      palette: palette('#526e7d', '#d49b69', '#829b91'), stats: stats(400, 58, 28, 18, 52),
      skill: { kind: 'summon', cooldown: 8, windup: 1.2, recovery: 1, count: 3, radius: 165, summonType: 'walker' }
    },
    final: {
      name: '하역 지휘관', title: '지게차와 붙은 현장 책임자',
      skillName: '야간 하역조', skillDescription: '양팔의 깃발을 흔들어 보행자와 질주자를 함께 소환한다.', counter: '빠른 질주자부터 처리하고 소환이 끝난 지휘관을 노리세요.',
      appearance: appearance('forklift-foreman', 'captain-hat', 'signal-flags', 'forklift-mast', 4, 4, '선장 모자, 네 신호 팔, 지게차 마스트와 바퀴 다리'),
      palette: palette('#425c70', '#f0b37c', '#78958f'), stats: stats(960, 48, 44, 25, 120),
      skill: { kind: 'summon', cooldown: 8.8, windup: 1.45, recovery: 1.3, count: 5, radius: 215, summonType: 'runner', maxSummons: 12 }
    }
  },
  {
    title: '격리병원', subtitle: '닫힌 병동을 통과해 전염성 수액의 근원을 끊는다.', theme: 'hospital', accent: '#a8c7bd',
    enemyPool: pool(53, 12, 9, 13, 13), family: 'spit',
    mid: {
      name: '수액 간호사', title: '수액대를 끄는 병동 순찰자',
      skillName: '오염 수액', skillDescription: '느린 수액 탄을 뱉어 떨어진 곳에 오염 웅덩이를 남긴다.', counter: '투사체를 옆으로 피하고 남은 웅덩이를 돌아가세요.',
      appearance: appearance('iv-nurse', 'nurse-cap', 'iv-stand', 'fluid-bags', 2, 2, '찢어진 간호모, 수액대 팔, 등에 매달린 녹색 수액 주머니'),
      palette: palette('#8eaaa0', '#b8dcad', '#8caa8d'), stats: stats(420, 62, 25, 19, 55),
      skill: { kind: 'spit', cooldown: 4.6, windup: .8, recovery: .7, projectileSpeed: 275, radius: 9, duration: 2.4, damage: 12, puddleRadius: 75, puddleDuration: 3.5, puddleDamage: 6 }
    },
    final: {
      name: '격리 병동장', title: '흡인관을 펼친 수술실 괴물',
      skillName: '격리 구역', skillDescription: '세 갈래 수액 탄을 발사해 여러 오염 웅덩이를 남긴다.', counter: '발사 전에 옆길을 확보하고 웅덩이 사이로 이동하세요.',
      appearance: appearance('quarantine-chief', 'surgical-hood', 'oxygen-mask', 'suction-tubes', 4, 2, '수술 두건, 산소 마스크, 네 팔과 부채처럼 펼친 흡인관'),
      palette: palette('#718d86', '#c2e6a8', '#829c80'), stats: stats(990, 49, 42, 25, 125),
      skill: { kind: 'spit', cooldown: 5.5, windup: 1.1, recovery: 1, projectileSpeed: 305, radius: 12, duration: 2.8, count: 3, spread: .38, damage: 16, puddleRadius: 90, puddleDuration: 4.5, puddleDamage: 8 }
    }
  },
  {
    title: '검문구역', subtitle: '버려진 검문대를 지키는 진압대를 뒤로 돌파한다.', theme: 'checkpoint', accent: '#91a4ba',
    enemyPool: pool(44, 14, 26, 10, 6), family: 'shield',
    mid: {
      name: '방패 순찰대원', title: '검문을 멈추지 않는 경비',
      skillName: '방패 진형', skillDescription: '정면 방패를 세워 앞에서 오는 탄환을 크게 줄인다.', counter: '방패가 향한 방향을 피해 측면과 등을 공격하세요.',
      appearance: appearance('riot-patrol', 'riot-helmet', 'riot-shield', 'radio', 2, 2, '진압 헬멧, 긴 방패, 어깨 무전기의 붉은 표시등'),
      palette: palette('#4b617a', '#9cbace', '#82958d'), stats: stats(440, 49, 32, 19, 60),
      skill: { kind: 'shield', cooldown: 6.5, windup: .6, recovery: .85, duration: 3, reduction: .18, arc: 1.9 }
    },
    final: {
      name: '진압 대장', title: '바리케이드를 몸에 두른 대장',
      skillName: '봉쇄 진형', skillDescription: '두 겹 방패로 정면을 막고 앞으로 압박한다.', counter: '회피로 크게 옆을 돌아 사이렌이 꺼지는 빈틈을 노리세요.',
      appearance: appearance('armored-captain', 'visor-helmet', 'barricade-shield', 'siren-array', 4, 2, '넓은 바이저, 네 방패 팔, 등에 둘러진 붉고 푸른 사이렌'),
      palette: palette('#3e536e', '#c7d6e1', '#778b83'), stats: stats(1020, 43, 49, 26, 140),
      skill: { kind: 'shield', cooldown: 7.5, windup: .85, recovery: 1.3, duration: 3.5, reduction: .1, arc: 2.2 }
    }
  },
  {
    title: '환승터미널', subtitle: '멈춘 버스 사이에서 감염 택배의 이동을 차단한다.', theme: 'terminal', accent: '#c7a888',
    enemyPool: pool(38, 32, 12, 10, 8), family: 'leap',
    mid: {
      name: '배달 질주자', title: '배달 가방을 멘 도약자',
      skillName: '급행 배송', skillDescription: '착지점을 표시한 뒤 플레이어 쪽으로 크게 뛰어든다.', counter: '착지 원을 벗어나고 내려온 뒤의 짧은 빈틈을 공격하세요.',
      appearance: appearance('courier-sprinter', 'bike-helmet', 'delivery-bag', 'wheel-rack', 2, 2, '자전거 헬멧, 커다란 배달 가방, 접힌 바퀴와 긴 다리'),
      palette: palette('#8b6751', '#ecc99b', '#899a83'), stats: stats(460, 74, 26, 20, 58),
      skill: { kind: 'leap', cooldown: 5.5, windup: .8, recovery: 1.1, range: 310, radius: 100, duration: .5, damage: 24 }
    },
    final: {
      name: '택배 집하장장', title: '상자 다리로 걷는 분류 괴물',
      skillName: '연속 집하', skillDescription: '큰 상자 몸을 두 번 던져 착지점마다 충격을 남긴다.', counter: '두 번째 착지까지 이동을 이어가고 긴 회복 시간을 이용하세요.',
      appearance: appearance('parcel-spider', 'parcel-mask', 'package-claws', 'sorting-cage', 4, 4, '상자 가면, 네 포장 갈고리, 분류 창살과 거미 같은 네 다리'),
      palette: palette('#755744', '#e5b887', '#7e927e'), stats: stats(1050, 62, 42, 26, 125),
      skill: { kind: 'leap', cooldown: 7, windup: 1, recovery: 1.55, range: 375, radius: 145, duration: .55, count: 2, damage: 28 }
    }
  },
  {
    title: '송전소', subtitle: '아직 켜진 송전 시설에서 감염된 전류를 차단한다.', theme: 'power', accent: '#b7c6e0',
    enemyPool: pool(40, 18, 16, 14, 12), family: 'beam',
    mid: {
      name: '검침 기사', title: '전압 탐침을 든 순찰자',
      skillName: '전압 측정', skillDescription: '가느다란 예고선 뒤에 직선 전류를 발사한다.', counter: '예고선의 옆으로 빠르게 이동하세요.',
      appearance: appearance('meter-reader', 'protective-visor', 'voltage-probe', 'battery-case', 2, 2, '절연 바이저, 긴 전압 탐침, 등에 얹힌 배터리 상자'),
      palette: palette('#65748a', '#c4dcfa', '#8a9a9d'), stats: stats(480, 58, 28, 20, 62),
      skill: { kind: 'beam', cooldown: 5.4, windup: 1.15, recovery: 1.05, range: 670, width: 34, duration: .3, damage: 25 }
    },
    final: {
      name: '송전 정비장', title: '변압기 코일을 진 전류 거인',
      skillName: '교차 송전', skillDescription: '넓은 전류 두 갈래를 순서대로 방출한다.', counter: '첫 선을 피한 뒤 다음 선의 방향을 확인하고 이동하세요.',
      appearance: appearance('power-conductor', 'insulator-crown', 'conductor-arms', 'transformer-coils', 6, 2, '애자 왕관, 여섯 도체 팔, 어깨 높이의 변압기 코일'),
      palette: palette('#4c5c75', '#d0e5ff', '#789296'), stats: stats(1080, 47, 46, 27, 130),
      skill: { kind: 'beam', cooldown: 6.6, windup: 1.35, recovery: 1.45, range: 800, width: 48, duration: .4, count: 2, spread: .55, damage: 29 }
    }
  },
  {
    title: '폐정유시설', subtitle: '새어 나오는 연료가 도시 전체에 번지기 전에 불길을 끊는다.', theme: 'refinery', accent: '#d89673',
    enemyPool: pool(35, 16, 16, 12, 21), family: 'fire',
    mid: {
      name: '화염 진압대원', title: '연료 호스를 끄는 소방수',
      skillName: '역류 화염', skillDescription: '호스가 향한 곳에 화염 지대를 남긴다.', counter: '호스의 예고 방향에서 벗어나 불이 꺼진 길로 돌아가세요.',
      appearance: appearance('burned-firefighter', 'fire-helmet', 'fire-hose', 'fuel-tank', 2, 2, '그을린 소방모, 늘어진 호스 팔, 새는 연료 탱크'),
      palette: palette('#986646', '#f1aa68', '#999179'), stats: stats(500, 55, 30, 21, 65),
      skill: { kind: 'fire', cooldown: 6, windup: 1, recovery: 1, radius: 100, duration: 4.5, count: 2, damage: 12 }
    },
    final: {
      name: '소각 담당관', title: '굴뚝을 짊어진 이동 소각로',
      skillName: '소각 통로', skillDescription: '여러 화염 지대를 일렬로 만들어 이동할 길을 좁힌다.', counter: '불이 깔리기 전에 옆길로 이동하고 불 사이에 멈추지 마세요.',
      appearance: appearance('incinerator', 'furnace-grille', 'flame-vents', 'incinerator-stack', 4, 4, '화덕 철창 얼굴, 네 화염 배기 팔, 굴뚝과 짧고 굵은 네 다리'),
      palette: palette('#80503c', '#ffbe79', '#8b8570'), stats: stats(1110, 44, 48, 27, 135),
      skill: { kind: 'fire', cooldown: 7.2, windup: 1.3, recovery: 1.35, radius: 115, duration: 5.5, count: 4, damage: 15 }
    }
  },
  {
    title: '군수창고', subtitle: '불안정한 탄약 더미 속에서 남은 봉쇄 병기를 해체한다.', theme: 'armory', accent: '#b6b797',
    enemyPool: pool(30, 20, 24, 12, 14), family: 'mine',
    mid: {
      name: '폭발물 처리반', title: '폭약 주머니를 두른 처리공',
      skillName: '지연 폭약', skillDescription: '표시된 곳에 잠시 뒤 폭발하는 폭약을 설치한다.', counter: '작은 폭약 표식을 확인하고 폭발 반경을 벗어나세요.',
      appearance: appearance('bomb-disposal', 'eod-helmet', 'charge-satchel', 'blast-plates', 2, 2, '두꺼운 방폭 헬멧, 폭약 주머니 팔, 겹겹이 쌓인 방호판'),
      palette: palette('#697450', '#d5d9aa', '#8c9b7a'), stats: stats(520, 48, 32, 21, 68),
      skill: { kind: 'mine', cooldown: 5.8, windup: .85, recovery: .95, radius: 115, duration: 2.1, count: 2, damage: 27 }
    },
    final: {
      name: '탄약 관리관', title: '탄창 회전대를 진 군수 괴물',
      skillName: '탄약 살포', skillDescription: '여러 폭약을 고리 모양으로 설치해 퇴로를 막는다.', counter: '고리 사이의 빈 곳으로 빠져나오고 폭발 뒤에 접근하세요.',
      appearance: appearance('ammunition-hauler', 'ammo-crate', 'grenade-belts', 'ammo-carousel', 4, 4, '탄약 상자 머리, 수류탄 띠 팔, 회전 탄창과 네 방폭 다리'),
      palette: palette('#53613e', '#e0d7a7', '#7d9175'), stats: stats(1140, 43, 48, 28, 140),
      skill: { kind: 'mine', cooldown: 7, windup: 1.1, recovery: 1.3, radius: 135, duration: 2.3, count: 5, ringRadius: 230, damage: 31 }
    }
  },
  {
    title: '폐차압축장', subtitle: '구부러진 견인선과 압축기 사이로 마지막 작업 신호를 추적한다.', theme: 'scrapyard', accent: '#bd9b91',
    enemyPool: pool(28, 22, 24, 14, 12), family: 'pull',
    mid: {
      name: '견인 기사', title: '사슬을 휘두르는 견인공',
      skillName: '견인 사슬', skillDescription: '예고선에 사슬을 던져 맞은 생존자를 끌어당긴다.', counter: '사슬 선을 옆으로 피하고 회피를 남겨 두세요.',
      appearance: appearance('tow-driver', 'truck-cap', 'tow-chain', 'winch-drum', 2, 2, '기름 묻은 운전모, 긴 사슬 팔, 등에 단 윈치 드럼'),
      palette: palette('#776257', '#dec2a1', '#8c9481'), stats: stats(540, 55, 31, 22, 70),
      skill: { kind: 'pull', cooldown: 6, windup: 1.1, recovery: 1.2, range: 440, width: 38, force: 210, duration: .65, damage: 16 }
    },
    final: {
      name: '압축 작업반장', title: '집게와 압축판으로 걷는 반장',
      skillName: '고철 흡입', skillDescription: '넓은 예고 영역 안의 생존자를 끌어들인 뒤 압축판을 닫는다.', counter: '빨려드는 동안 바깥으로 이동하고 마지막 순간 회피하세요.',
      appearance: appearance('compactor', 'crusher-jaw', 'grabber-claws', 'press-frame', 4, 4, '압축기 턱, 네 집게 팔, 넓은 압축판 등과 궤도 같은 네 다리'),
      palette: palette('#66514a', '#d5b39a', '#7e8c7c'), stats: stats(1170, 43, 49, 28, 145),
      skill: { kind: 'pull', cooldown: 7.5, windup: 1.3, recovery: 1.6, radius: 280, force: 250, duration: 1.1, damage: 30 }
    }
  },
  {
    title: '폐온실', subtitle: '유리 지붕 아래 자란 감염 포자가 도시로 퍼지는 것을 막는다.', theme: 'greenhouse', accent: '#a8ba81',
    enemyPool: pool(27, 18, 18, 18, 19), family: 'spread',
    mid: {
      name: '농약 살포원', title: '분무기를 든 온실 관리원',
      skillName: '부채 분무', skillDescription: '정면으로 부채 모양의 느린 독성 탄을 뿌린다.', counter: '탄 사이의 틈으로 이동하거나 살포원의 옆으로 돌아가세요.',
      appearance: appearance('sprayer', 'filter-mask', 'spray-wand', 'pesticide-tank', 2, 2, '여과 마스크, 긴 분무기 팔, 터진 농약 탱크'),
      palette: palette('#738354', '#d0d894', '#93a779'), stats: stats(560, 57, 29, 22, 72),
      skill: { kind: 'spread', cooldown: 4.8, windup: .9, recovery: .8, count: 5, spread: 1.3, projectileSpeed: 235, radius: 10, duration: 2.8, damage: 17 }
    },
    final: {
      name: '격리 재배사', title: '덩굴과 포자 부채의 정원사',
      skillName: '포자 만개', skillDescription: '넓은 포자 부채를 두 번 펼쳐 다른 방향의 탄막을 만든다.', counter: '첫 탄막의 틈을 통과하고 두 번째 부채의 방향을 확인하세요.',
      appearance: appearance('bloom-grower', 'flower-crown', 'spore-fans', 'greenhouse-vines', 6, 4, '포자 꽃 왕관, 여섯 부채 팔, 등에서 자란 덩굴과 뿌리 다리'),
      palette: palette('#5c7142', '#dde4a4', '#819773'), stats: stats(1200, 46, 47, 29, 145),
      skill: { kind: 'spread', cooldown: 6, windup: 1.2, recovery: 1.25, count: 9, waves: 2, spread: 2.05, projectileSpeed: 255, radius: 12, duration: 3.2, damage: 20 }
    }
  },
  {
    title: '태풍방벽', subtitle: '폭풍 속 마지막 등대를 끄고 해안 탈출로를 확보한다.', theme: 'breakwater', accent: '#a9bbd0',
    enemyPool: pool(22, 26, 20, 16, 16), family: 'storm',
    mid: {
      name: '방벽 관측관', title: '기상계를 짊어진 해안 감시자',
      skillName: '낙뢰 관측', skillDescription: '주변 세 지점을 표시한 뒤 차례로 낙뢰를 떨어뜨린다.', counter: '밝아지는 낙뢰 원을 확인하고 표시가 없는 곳으로 이동하세요.',
      appearance: appearance('barrier-observer', 'rain-hood', 'wind-gauge', 'weather-mast', 2, 2, '젖은 우비 후드, 풍속계 팔, 높은 기상 관측 마스트'),
      palette: palette('#596f88', '#cedcf1', '#869b9d'), stats: stats(580, 59, 31, 23, 75),
      skill: { kind: 'storm', cooldown: 6.5, windup: 1.1, recovery: 1.1, count: 3, radius: 100, duration: 1.5, damage: 25 }
    },
    final: {
      name: '등대 지기', title: '등대 렌즈를 얼굴로 단 폭풍 거인',
      skillName: '마지막 폭풍', skillDescription: '넓은 범위에 낙뢰를 순서대로 떨어뜨리며 안전한 길을 바꾼다.', counter: '가장 먼저 터진 원을 지나 다음 낙뢰의 빈 곳으로 이동하세요.',
      appearance: appearance('lighthouse-keeper', 'lamp-lens', 'lightning-rods', 'lighthouse-tower', 6, 4, '빛나는 등대 렌즈 얼굴, 여섯 피뢰침 팔, 등대 탑과 네 방벽 다리'),
      palette: palette('#405773', '#e0eafb', '#759397'), stats: stats(1250, 45, 49, 30, 160),
      skill: { kind: 'storm', cooldown: 8, windup: 1.3, recovery: 1.65, count: 6, radius: 130, duration: 2.1, damage: 30 }
    }
  }
];

const missionId = index => `mission-${String(index + 1).padStart(2, '0')}`;
const bossId = (index, role) => `boss-${String(index + 1).padStart(2, '0')}-${role}`;
const MAP_PALETTES = [
  ['#4c473e', '#575244', '#877457', '#73634c', '#8e8066', '#29251f'],
  ['#354942', '#425c52', '#6f8879', '#506c5d', '#718c79', '#1b3029'],
  ['#394954', '#465c6a', '#7e98a4', '#586f80', '#7d94a0', '#1b2d3a'],
  ['#4b5752', '#5d6d64', '#9faf9e', '#87978b', '#afbbb0', '#293d34'],
  ['#414959', '#4e5c70', '#8b99aa', '#5f6d83', '#8b9aad', '#242e42'],
  ['#584b42', '#6a5a4c', '#ac977d', '#8b7560', '#b4a18a', '#382b21'],
  ['#424b61', '#52607c', '#99abc9', '#677996', '#a5b5cf', '#222d47'],
  ['#5c4034', '#714e3b', '#b38964', '#986548', '#b58862', '#3c211b'],
  ['#444b37', '#555f44', '#939a76', '#738059', '#a1a780', '#28321c'],
  ['#544340', '#69524d', '#a58b7d', '#7d6259', '#a08779', '#322020'],
  ['#46523a', '#586749', '#93a378', '#768359', '#a5b885', '#25361d'],
  ['#344656', '#415b72', '#849daf', '#52758c', '#92afbf', '#182c43']
].map(([asphalt, road, curb, wall, roof, fog], index) =>
  ({ asphalt, road, curb, wall, roof, fog, accent: CONTENT[index].accent }));

export const MISSIONS = freeze(CONTENT.map((entry, index) => ({
  id: missionId(index), index, title: entry.title, subtitle: entry.subtitle,
  theme: entry.theme, accent: entry.accent, mapPalette: MAP_PALETTES[index], enemyPool: entry.enemyPool,
  midBoss: bossId(index, 'mid'), finalBoss: bossId(index, 'final'),
  unlockAfter: index ? missionId(index - 1) : null, parSeconds: 120
})));
export const BOSS_CATALOG = freeze(CONTENT.flatMap((entry, index) => ['mid', 'final'].map(role => ({
  id: bossId(index, role), missionId: missionId(index), role, family: entry.family, ...entry[role]
}))));

const missionsById = new Map(MISSIONS.map(mission => [mission.id, mission]));
const bossesById = new Map(BOSS_CATALOG.map(boss => [boss.id, boss]));

export function getMission(idOrIndex) {
  if (Number.isInteger(idOrIndex)) return MISSIONS[idOrIndex] || null;
  return typeof idOrIndex === 'string' ? missionsById.get(idOrIndex) || null : null;
}
export function getBoss(key) {
  return typeof key === 'string' ? bossesById.get(key) || null : null;
}
export function missionScaling(index = 0) {
  const value = Number.isFinite(index) ? Math.max(0, Math.min(MISSIONS.length - 1, Math.floor(index))) : 0;
  const round = n => Math.round(n * 10000) / 10000;
  return { hp: round(1 + value * .17), damage: round(1 + value * .05), spawn: round(1 + value * .075), speed: round(1 + value * .04) };
}
