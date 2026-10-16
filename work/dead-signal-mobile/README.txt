DEAD SIGNAL 모바일 1.0.0 (빌드 1)

검증된 웹 v0.26.0에서 분리한 iOS / Android 출시 후보 프로젝트입니다.
기존 웹 게임의 파일과 브라우저 저장 데이터는 변경하지 않았습니다.
앱 식별자 초안: kr.bottlecorp.deadsignal
게임 언어: 한국어
지원 기준: Android 7.0(API 24) 이상 / iOS·iPadOS 16.0 이상.
결제: 우선 무료 플레이 후보. 실제 결제·광고 SDK 미포함, 테스트 강화칩 상점은 표시와 액션 모두 차단.

현재 상태
Android: 디버그 서명 테스트 APK와 배포 서명 전 Release AAB 빌드 성공.
iOS: Simulator 앱과 배포 서명 전 기기용 Release xcarchive 빌드 성공.
스토어 업로드·심사 제출·공개 출시를 수행하지 않았습니다.
네이티브 UI / 실제 기기 성능·음향·멀티터치 / 16KB Android 실행은 미검증입니다.
현재 컴퓨터 조작 도구에서 Simulator와 qemu 앱을 선택할 수 없었습니다.
모바일 Chromium 미리보기에서는 출격·자동 전투·개조·저장/새로고침/이어하기와 개인정보 화면을 확인했습니다.
정확한 검증 범위는 release 및 출력 qa 폴더의 JSON을 참고하세요.

재빌드
Node 22 이상, Xcode 27 또는 호환 Xcode 26 이상, Android SDK 36, JDK 21이 필요합니다.
1. npm ci
2. npm run build:bridge
3. npx cap sync
4. iOS: ios/scripts/build-ios.sh (unsigned / Simulator)
5. Android: JAVA_HOME과 ANDROID_HOME을 자신의 설치 경로로 설정하고 android 폴더에서
   ./gradlew :app:assembleDebug :app:bundleRelease :app:lintRelease --console=plain --no-daemon --max-workers=2
새로운 웹 기능은 이 프로젝트의 dist에 적용한 뒤 동기화합니다.
소스 ZIP의 중복 네이티브 public 폴더는 생략했으며, 3번의 npx cap sync가 dist에서 다시 만듭니다.
기존 사용자 웹 게임은 별도 work/dead-signal-game에 있습니다.
release 검증 도구 일부는 원래 워크스페이스의 과거 검증 자료를 참조합니다.
소스 ZIP 단독에서 모든 과거 회귀 검사가 완전 독립적으로 실행된다는 주장은 하지 않습니다.

게임 조작
왼쪽 조이스틱으로 이동. 기본 오토 모드는 자동 조준·발사.
위쪽 모드 버튼으로 수동 사격 전환. 아래쪽 버튼으로 유인·화염병·회피.
앱을 벗어나면 입력 해제·일시정지·저장·오디오 중단. 앱 복귀로 전투가 자동 재개되지 않습니다.
이어하기 또는 개조 선택으로 플레이를 이어갑니다.
설정 > 개인정보 처리방침에서 기기 내 저장과 삭제 안내를 볼 수 있습니다.

출시 전 필요한 실제 입력
배포할 Google / Apple 개발자 계정과 최종 패키지 ID.
Android 업로드 키, Apple 배포 인증서·프로비저닝. 키/암호는 소스나 채팅에 저장하지 않습니다.
고객지원 연락처와 공개 HTTPS 개인정보 처리방침 URL.
스토어 연령등급 질문, 지역별 게임 등급 요건, 실제 기기 검수 및 네이티브 스크린샷.
무료/유료/인앱결제 정책 확정. 인앱결제 선택 시 별도의 공식 Billing/StoreKit 구현·검증 필요.
unsigned AAB와 xcarchive는 그대로 스토어에 제출할 수 없습니다.
시뮬레이터 앱 ZIP은 iPhone 설치용 IPA가 아닙니다.

아트
93개 활성 네이티브 자산과 32프레임 애니메이션을 원본 그대로 포함했습니다.
현재 연결되지 않는 구형 8프레임 시트 4개만 모바일 복사본에서 제외했습니다.
원본은 웹 v0.26.0 스냅샷에 보존되어 있습니다.
새 앱 아이콘은 내장 image_gen으로 제작, 배포 크기는 공식 @capacitor/assets로 생성했습니다.
원본과 프롬프트: resources/icon.png 및 resources/icon-prompt.txt.
홍보 이미지와 소개문은 outputs/dead-signal/mobile/v1.0.0/store에 있습니다.

개인정보·비밀
앱에 광고·분석·추적·실제 결제나 외부 서버 연결을 추가하지 않았습니다.
WebView 원격 디버깅과 평문 통신을 끕니다. Android는 네트워크 권한을 포함하지 않습니다.
개인정보 안내와 스토어 신고는 실제 서비스 운영 방식이 바뀌면 갱신해야 합니다.
서명 키, 인증서, 사용자 브라우저 프로필은 이 프로젝트와 소스 ZIP에 포함하지 않습니다.
