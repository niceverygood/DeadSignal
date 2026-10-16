DEAD SIGNAL — 독립 개발용 저장소

웹 v0.29.0 / 모바일 소스 v1.0.0(웹 v0.26.0 기반)
저장소: https://github.com/niceverygood/DeadSignal
기본 분기: main

이 저장소 전체를 받아 Codex 프로젝트로 열고 CONTINUE_PROMPT.txt 내용을 새 대화에 붙여넣으세요. 같은 Codex 계정 로그인만으로 이전 컴퓨터의 로컬 파일·서버·플레이 저장이 이전되지는 않습니다.

처음 받기
Git, Git LFS, Node.js 22 이상과 npm이 필요합니다.
Git LFS 설치 안내: https://git-lfs.com/
Node.js 설치 안내: https://nodejs.org/
설치는 현재 운영체제에 맞게 하세요. 설치 후 터미널에서 git --version, git lfs version, node --version, npm --version을 확인합니다.

git lfs install
git clone https://github.com/niceverygood/DeadSignal.git
cd DeadSignal
git lfs pull
git lfs fsck
npm run verify
npm run setup
npm test
npm start

게임: http://127.0.0.1:8806/index.html?qa=1
이미 clone한 작업 폴더에서는 다시 clone하지 말고 Git 상태·원격·분기를 확인하세요. 원격 변경을 받을 때 현재 작업을 보존하고, 충돌이나 미커밋 변경을 reset/clean으로 지우지 마세요. git pull --ff-only와 git lfs pull로 갱신하되 필요한 병합은 검토해서 처리합니다.

게임은 루트 npm start로 실행합니다. Python이나 아트 도구 설치 없이도 실행할 수 있습니다. npm run setup은 갤러리·리그·베이커의 잠긴 의존성을 복원합니다. LFS 파일을 받지 않으면 PNG·GLB가 포인터 텍스트로 남아 게임 이미지와 리그가 열리지 않습니다. 설치가 끝나도 실제 브라우저 실행과 오류 검수는 별도로 필요합니다.

별도 터미널에서 npm run review를 실행합니다.
갤러리: http://127.0.0.1:8812/production-assets/review.html
실제 3D 리그: http://127.0.0.1:8812/production-assets/rig-viewer.html?id=enemy-shield
포트가 사용 중이면 npm start -- --port 8851 또는 node tools/serve.mjs --review --port 8852처럼 다른 빈 포트를 사용하세요. 다른 서버를 종료하지 마세요. 사용자 플레이와 QA에는 별도 origin을 사용하세요.

주요 폴더
work/dead-signal-game: 최신 웹 게임과 테스트
outputs/dead-signal/production-assets: 모델, 스프라이트, 갤러리, 리그와 검수 기록
outputs/dead-signal/moodboards-50: 승인 디자인 기준 무드보드
work/meshy-sprite-baker, work/asset-motion-baker-v027, work/asset-enemy-motion-baker-v029: 제작·렌더 도구
work/dead-signal-mobile: 별도 모바일 소스
.transfer: 이관 기준 해시, 복원 검수 결과와 도구 안내

현재 포함 사항
31종 NPC의 16방향×32샘플 보행, 19개 접지 교정 리그, 신규 보행 15,872프레임, 활성 에셋 157개를 포함합니다. 원본 모델 195개와 무드보드 50장, 제작·리깅·검수 자료를 함께 보존했습니다. 주인공 실제 기본 이동/회피 속도는 128/400이며 기존 성장·장비 비율과 적 이동 속도·공격 판정을 유지합니다.

검수 범위
이전 Mac의 별도 복원본에서 웹 테스트 524개, 모바일 소스 테스트 479개와 실제 웹/리그 화면을 확인했습니다. .transfer/VALIDATION.json과 .transfer/READY.json은 당시 증거입니다. 파일 안의 gitPush:false는 당시 이관 검수 상태이며 현재 원격 상태는 Git에서 확인하세요. 다른 물리 컴퓨터·운영체제 및 모바일 실기기 검증은 이어받은 환경에서 수행해야 합니다.
npm run verify는 이관 기준 SHA-256을 확인합니다. 의도적으로 개발 파일을 수정한 뒤에는 해당 파일의 해시가 달라지는 것이 정상입니다. 첫 복원 전에 검수하고, 이후 실패를 무조건 manifest 재생성으로 감추지 마세요.

모바일과 선택 설치
npm run setup -- --mobile
npm --prefix work/dead-signal-mobile test
모바일 폴더에서 npm run build:bridge와 npx cap sync로 네이티브 public 복사본을 복원합니다. Android 개발에는 JDK 21과 Android SDK 36, iOS 개발에는 macOS와 호환 Xcode가 필요합니다. 모바일 소스는 아직 웹 v0.29와 통합되지 않았습니다. 서명·계정·스토어 제출·실기기 검수는 포함하지 않습니다.
Python 아트 제작 도구가 필요하면 Python 3.11 이상 가상환경과 requirements-asset-tools.txt의 Pillow/numpy를 설치하세요. macOS/Linux는 .venv/bin/python, Windows는 .venv\Scripts\python.exe를 사용합니다. 자세한 경로와 read-only dry-run은 .transfer/TOOLS.txt에 있습니다.

보존과 다음 작업
AGENTS.md와 HANDOFF.txt를 읽고 수정하세요. 원본 디자인·메시·UV·텍스처·클립, 역사 증거와 사용자 플레이 기록을 보존합니다. 이전 브라우저 localStorage는 Git에 포함되지 않습니다. 키·토큰·서명자료·브라우저 프로필도 포함하지 않습니다. automation-7을 재개하거나 유료 Meshy 요청·결제·충전을 하지 마세요.
다음 개선은 주인공 전용 옆걸음·독립 상체 조준, 최종보스 정밀 접지, 모바일 이식과 실기기 메모리·성능 검수입니다. 이미지 디코드 용량 추정 526.91MiB/758.29MiB는 실측 RAM·VRAM·FPS가 아닙니다. 이미 등록된 카탈로그에 과거 integrate_motion_assets.py나 integrate_locomotion.py를 재실행하지 마세요.
