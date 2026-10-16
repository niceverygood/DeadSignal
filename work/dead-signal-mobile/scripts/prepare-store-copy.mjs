import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'../../outputs/dead-signal/mobile/v1.0.0/store');await mkdir(out,{recursive:true});
const metadata={
 version:'1.0.0',build:1,packageIdDraft:'kr.bottlecorp.deadsignal',languageInGame:'ko',
 monetization:{prepared:'free',userDecision:'pending; free initial release assumed',realInAppPurchases:false,ads:false,testPremiumShopVisible:false},
 ko:{name:'데드 시그널',subtitle:'소음으로 모으고, 연쇄로 돌파하라',shortDescription:'소음탄으로 좀비를 모으고 화염과 번개로 돌파하는 생존 액션 로그라이크',
 description:'총성이 좀비를 부르는 도시에서 살아남으세요.\n\n소음탄으로 무리를 유인하고, 화염병과 무기 개조를 조합해 포위를 돌파하세요. 비스듬한 3/4 시점의 전장에서 이동과 회피, 탄창 관리가 생존을 가릅니다.\n\n철거 공사장부터 태풍방벽까지 이어지는 12개 미션에 순서대로 도전합니다. 각 미션에는 중간보스와 최종보스가 등장하며, 24종의 보스는 돌진·독액·광선·화염·낙뢰 등 서로 다른 패턴을 사용합니다. 보스 도감에서 특징과 대응법을 확인하세요.\n\n산탄총과 전기 못총, 12종 무기 개조를 조합해 나만의 빌드를 만듭니다. 회수한 부품으로 안전가옥의 방호복과 탄창을 보강하고 다음 출격을 준비하세요.\n\n터치 조이스틱으로 이동하며 기본 오토 모드에서는 자동으로 조준하고 사격합니다. 수동 모드도 선택할 수 있습니다. 앱을 벗어나면 전투가 일시정지되고, 저장된 작전은 이어하기로 불러올 수 있습니다.\n\n게임 코드와 이미지는 앱에 포함됩니다. 이 버전은 로그인, 광고, 실제 결제 기능을 포함하지 않습니다. 기록은 기기 안에 저장되며 클라우드 동기화나 웹 버전 기록의 자동 이전은 제공하지 않습니다.',
 keywords:'좀비,로그라이크,생존,액션,오토슈팅,보스,오프라인,탄막',whatsNew:'데드 시그널 모바일 첫 버전. 터치 조작, 12개 미션과 24종 보스, 자동 저장·이어하기를 제공합니다.'},
 en:{name:'DEAD SIGNAL',subtitle:'Lure the horde. Break the siege.',shortDescription:'Lure zombie hordes and chain fire, lightning and upgrades in a survival roguelike.',
 description:'Survive a city that reacts to every gunshot. Lure zombie hordes with noise devices, then break through with fire, lightning and weapon upgrades.\n\nExplore 12 sequential missions and face a mid-boss and final boss in each. Learn the patterns of 24 bosses in the codex. Combine a shotgun or electric nailgun with 12 weapon upgrades, then reinforce armor and magazines using recovered parts.\n\nMove with touch controls and switch between automatic and manual firing. Leaving the app pauses the operation; continue from a locally saved run.\n\nGame interface language: Korean. This version includes no login, advertisements or real-money purchases. Game code and artwork are bundled in the app. Progress is stored on the device; cloud sync and automatic transfer of browser saves are not provided.'},
 categories:{apple:['Games / Action','Games / Role Playing'],google:'GAME_ACTION'},
 releaseInputsStillRequired:['Publishing developer account and final app identifier','Distribution signing and store app record','Public privacy-policy URL and customer-support contact','Content rating questionnaire and local game rating requirements','Genuine native phone/tablet screenshots at accepted sizes','Physical-device performance, audio and multi-touch validation'],
 privacyDraft:{dataCollectedByGame:false,dataSharedByGame:false,tracking:false,login:false,sensitivePermissions:false,storage:'device-local gameplay/profile/settings',OSProcessing:'OS/store diagnostics and backup subject to platform policy'},
 contentRatingAnswersDraft:{zombieCombat:true,cartoonOrFantasyViolence:'frequent',realisticViolence:'review actual artwork and effects before final questionnaire',bloodEffects:true,gambling:false,lootBoxPurchases:false,chatOrUserGeneratedContent:false,unrestrictedWebAccess:false,childDirected:false,finalRating:'not assigned; complete each store questionnaire'}
};
await writeFile(resolve(out,'listing.json'),JSON.stringify(metadata,null,2)+'\n');
for(const language of ['ko','en'])await writeFile(resolve(out,'listing-'+language+'.txt'),Object.entries(metadata[language]).map(([k,v])=>k+'\n'+v).join('\n\n')+'\n');
await writeFile(resolve(out,'review-notes.txt'),`DEAD SIGNAL 1.0.0 review notes (draft)

Complete bundled offline canvas game in a native Capacitor container. No remote website dependency or downloadable code update. The interface is Korean. No login or review account is required.

Start: Campaign > first mission > Prepare > Start. Left touch joystick moves. Automatic fire is enabled by default. The mode button switches to manual fire. Bottom ability buttons activate lure, fire and dash.

Progress: the active operation is saved locally. Leaving the app pauses and saves. Reopening never resumes combat automatically. Select Continue, then Resume.

Settings > 개인정보 처리방침 opens the bundled privacy explanation. No ads, analytics, tracking or real-money billing. Test-chip premium screens from the web prototype are hidden and their action handlers are guarded. Armor and magazine reinforcement uses parts earned in play.

Before submission: verify distribution signing, public support/privacy URLs, final rating questionnaire, actual native screenshots and physical-device QA. A build does not establish App Review approval or public release.
`);
await writeFile(resolve(out,'sources.txt'),`Official references checked 2026-10-16 (Asia/Seoul)
https://capacitorjs.com/docs/getting-started
https://capacitorjs.com/docs/updating/8-0
https://developer.apple.com/news/upcoming-requirements/?id=04282026a
https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
https://support.google.com/googleplay/android-developer/answer/9866151?hl=en
https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
https://developer.android.com/google/play/requirements/target-sdk
https://developer.android.com/guide/practices/page-sizes
`);
await copyFile(resolve(root,'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'),resolve(out,'apple-app-icon-1024.png'));
console.log(JSON.stringify({storeCopyPrepared:true,koLengths:Object.fromEntries(Object.entries(metadata.ko).map(([k,v])=>[k,v.length])),uploaded:false}));
