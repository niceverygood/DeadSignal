import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const draft = dirname(fileURLToPath(import.meta.url));
export const BASE_HASHES = Object.freeze({
  'app.js': '85838a51f33641822baa2508d0713003624504091ee32e3d6c6c67f02da79b78',
  'index.html': '92e4366d5e522ac05218a3993ffd1bbba88b746cee2bfbd9ae45b527f75c053c',
  'audio.js': 'af86f24465658a4b1ccf5fa90b54f77b73b0e6420c875049112d8e7860696b5a'
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Expected exactly one source anchor: ${before.slice(0, 90)}`);
  return source.replace(before, after);
}
export function patchMobileApp(source) {
  source = replaceOnce(source, "import {AudioSystem} from './audio.js?v=0.26.0';", "import {AudioSystem} from './audio.js?v=0.26.0';\nimport {mobilePrivacyHTML} from './mobile-privacy.js?v=1.0.0';");
  source = replaceOnce(source, "const query=new URLSearchParams(location.search),qaStorage=", "const storeRelease=document.documentElement.dataset.releaseChannel==='store';\nconst query=new URLSearchParams(location.search),qaStorage=");
  source = replaceOnce(source, "const coarse=matchMedia('(pointer: coarse)').matches", "const coarse=document.documentElement.dataset.nativeRuntime==='true'||matchMedia('(pointer: coarse)').matches");
  source = replaceOnce(source, "${btn('강화 상점','equipment','secondary')}", "${storeRelease?'':btn('강화 상점','equipment','secondary')}");
  source = replaceOnce(source, "${getMission(selection.missionId)?btn('강화 장비 선택','equipment','secondary'):''}", "${!storeRelease&&getMission(selection.missionId)?btn('강화 장비 선택','equipment','secondary'):''}");
  source = replaceOnce(source, '${i+1} 키로 선택', "${coarse?'눌러서 선택':`${i+1} 키로 선택`}");
  source = replaceOnce(source, "function action(name,value){", "function action(name,value){if(storeRelease&&(name==='equipment'||name.startsWith('gear-')))return;");
  source = replaceOnce(source, "else if(name==='close'){screen=null;", "else if(name==='mobile-privacy'){if(game.state==='playing')game.pause();screen='mobile-privacy';renderUI();}else if(name==='close'){if(screen==='mobile-privacy'){screen='settings';renderUI();return;}screen=null;");
  source = replaceOnce(source, "<div class=\"panel-actions\">${btn('돌아가기','close')}</div></section>`;", "<div class=\"panel-actions\">${btn('개인정보 처리방침','mobile-privacy','secondary')}${btn('돌아가기','close')}</div></section>`;");
  source = replaceOnce(source, "  applyMoodboardUI(overlay,state);if(state==='codex')", "  else if(state==='mobile-privacy')overlay.innerHTML=`<section class=\"dialog-panel mobile-privacy-panel\">${header('PRIVACY','개인정보 처리방침','데드 시그널 모바일 앱의 데이터 처리 안내입니다.')}${mobilePrivacyHTML}<div class=\"panel-actions\">${btn('설정으로 돌아가기','close')}</div></section>`;\n  applyMoodboardUI(overlay,state);if(state==='codex')");
  source = replaceOnce(source, "if(screen==='settings')action('close');", "if(screen==='settings'||screen==='mobile-privacy')action('close');");
  source = replaceOnce(source, "function pause(){launchGate.cancel();if(game.state==='playing'){resetInput();game.pause();screen=null;checkpoint();renderUI();}}", `function pause(){launchGate.cancel();if(game.state==='playing'){resetInput();game.pause();screen=null;checkpoint();renderUI();}}
function suspendMobileSession(){launchGate.cancel();resetInput();if(game.state==='playing'){game.pause();screen=null;}checkpoint();renderUI();audio.suspend();}
function mobileBack(){
  if(launchGate.busy){launchGate.cancel();resetInput();renderUI();return true;}
  if(screen==='mobile-privacy'){screen='settings';resetInput();renderUI();return true;}
  if(screen&&screen!=='menu'){screen=null;if(['menu','victory','dead'].includes(game.state))screen='menu';resetInput();renderUI();return true;}
  if(game.state==='playing'){pause();return true;}
  if(!['menu','victory','dead'].includes(game.state)){resetInput();checkpoint();return true;}
  return false;
}
window.addEventListener('dead-signal:app-state',event=>{if(event.detail?.isActive===false)suspendMobileSession();});
window.addEventListener('dead-signal:back',event=>{if(mobileBack())event.preventDefault();});`);
  source = replaceOnce(source, "window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});", "window.addEventListener('blur',suspendMobileSession);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendMobileSession();});");
  source = replaceOnce(source, "window.addEventListener('pagehide',()=>{pause();checkpoint();});", "window.addEventListener('pagehide',suspendMobileSession);");
  source = replaceOnce(source, '기록은 이 브라우저에 저장됩니다.', '기록은 이 기기에 저장됩니다.');
  source = replaceOnce(source, '기록과 진행 중인 작전은 이 브라우저에 저장됩니다.', '기록과 진행 중인 작전은 이 기기에 저장됩니다.');
  return source;
}
export function patchMobileAudio(source) {
  source = replaceOnce(source, "if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});", "if(['suspended','interrupted'].includes(this.ctx.state))this.ctx.resume().catch(()=>{});");
  return replaceOnce(source, '  setEnabled(value){', "  suspend(){try{if(this.ctx&&typeof this.ctx.suspend==='function')return Promise.resolve(this.ctx.suspend()).catch(()=>{});}catch{}return Promise.resolve();}\n  setEnabled(value){");
}
export function patchMobileIndex(source) {
  source = replaceOnce(source, '<html lang="ko">', '<html lang="ko" data-release-channel="store">');
  source = replaceOnce(source, '    <link rel="stylesheet" href="./moodboard-ui.css?v=0.26.0" />', '    <link rel="stylesheet" href="./moodboard-ui.css?v=0.26.0" />\n    <link rel="stylesheet" href="./mobile.css?v=1.0.0" />');
  return source;
}
