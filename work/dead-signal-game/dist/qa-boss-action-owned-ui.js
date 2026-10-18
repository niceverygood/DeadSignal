import {createQAStorage,isQAMemoryStorage} from './qa-storage.js';

const installed=new WeakSet();
const KEYS=Object.freeze(Array.from({length:12},(_,index)=>'boss-'+String(index+1).padStart(2,'0')+'-final'));
function allowed(location,query){try{return location?.protocol==='http:'&&['localhost','127.0.0.1','[::1]','::1'].includes(location.hostname)&&location.port==='8851'&&query.has('qa')&&query.has('qa-memory')&&query.get('qa-boss-owned-cleanup')==='1';}catch{return false;}}
const errorText=error=>{try{return String(error?.message??error);}catch{return'boss-action-owned-ui-failed';}};
async function loadOriginalModules(){
 const [manifest,worker]=await Promise.all([import('./production-manifest.js?v=0.29.0'),import('./qa-boss-action-owned.js')]);
 return{productionManifest:manifest.productionManifest,compareBossActionLayerOwned:worker.compareBossActionLayerOwned};
}

// Standalone UI only. It imports no Game, Renderer or original QA-page module.
// Its protected caller contains only the original manifest; every actual rig,
// model, canvas, action flag and late retirement belongs to the worker.
export function installBossActionOwnedQA(options={}){
 const location=options.location??globalThis.location,query=options.query??new URLSearchParams(location?.search??'');
 if(!allowed(location,query))return null;
 const createStorage=options.createStorage??createQAStorage;
 const storage=createStorage(query,()=>{throw Error('boss-action-owned-persistent-storage-forbidden');});
 if(!isQAMemoryStorage(storage))return null;
 const {document=globalThis.document,eventTarget=globalThis,loadModules=loadOriginalModules}=options;
 if(!document||typeof document!=='object'||installed.has(document)||document.getElementById?.('boss-action-owned-qa'))return null;
 const select=document.createElement('select');select.id='boss-action-owned-key';select.setAttribute('aria-label','검수할 최종 보스 한 종류');
 for(let index=0;index<KEYS.length;index++){const option=document.createElement('option');option.value=KEYS[index];option.textContent=String(index+1).padStart(2,'0')+' · 최종 보스';select.append(option);}
 select.value='boss-02-final';
 const button=document.createElement('button');button.id='boss-action-owned-qa';button.textContent='선택한 최종 보스 · 상체 동작·소유 자원 검수';
 const status=document.createElement('p');status.id='boss-action-owned-status';status.textContent='준비 완료 · 원본 보스 한 종류만 별도 소유 · 제품 후보 기본 OFF 유지';
 const details=document.createElement('details'),summary=document.createElement('summary'),output=document.createElement('pre'),proof=document.createElement('div');
 summary.textContent='원본·상체 후보 7단계 품질 · 실제 전투·성능 검수가 아님 · 종료 정리 최대 15초';output.id='boss-action-owned-report';proof.id='boss-action-owned-proof';details.append(summary,output);
 (document.querySelector('nav')??document.body).append(select,button);document.body.append(status,proof,details);
 const nodes=[select,button,status,output,proof];
 const owned=()=>nodes.every(node=>document.getElementById(node.id)===node);
 let running=false;
 button.onclick=async()=>{
  if(running||button.disabled||!owned())return;
  const key=select.value;if(!KEYS.includes(key)){output.textContent=JSON.stringify({complete:false,reason:'registered-final-boss-key-required',key});status.textContent='개별 최종 보스 한 종류를 선택하세요.';return;}
  running=true;button.disabled=true;select.disabled=true;proof.replaceChildren();
  const controller=new AbortController(),hide=()=>controller.abort();eventTarget.addEventListener?.('pagehide',hide,{once:true});
  const current=()=>{if(controller.signal.aborted)return false;if(!owned()||select.value!==key){controller.abort();return false;}return true;};
  status.textContent=key+' · 원본 모델과 별도 소유 리그 준비';
  try{
   const {productionManifest,compareBossActionLayerOwned}=await loadModules();
   if(controller.signal.aborted)return;
   if(!owned()||select.value!==key){output.textContent=JSON.stringify({complete:false,reason:'qa-ui-owner-or-selection-changed',key});status.textContent='보스 검수 중단 · 화면 또는 선택 변경';return;}
   if(!productionManifest||typeof productionManifest!=='object'||typeof compareBossActionLayerOwned!=='function')throw Error('boss-action-owned-original-modules-required');
   const caller=Object.freeze({productionArt:Object.freeze({manifest:productionManifest})});
   const result=await compareBossActionLayerOwned(caller,{document,location,query,storage,signal:controller.signal,bossKeys:[key],
    onProgress:info=>{if(current())status.textContent=key+' · '+(info.phase??'검수')+' · '+(info.angleIndex??info.index??'');},
    onImage:info=>{if(!current()||proof.children.length>=1)return;const image=document.createElement('img');image.src=info.src;image.alt=info.alt??(key+' 원본·상체 후보 7단계');image.style.maxWidth='100%';image.style.maxHeight='1000px';image.style.width='auto';proof.append(image);},
   });
   if(!current())return;
   output.textContent=JSON.stringify(result.report,null,2);
   status.textContent=result.report.complete===true?key+' 검수 완료 · 품질·최종 정리 기록 확인 · 제품 채택 없음':key+' 검수 미완료 · 품질·정리 원시 기록 확인';
   return result;
  }catch(error){
   if(!current())return;
   const report=error?.bossActionLayerQA??error?.report??null;
   output.textContent=JSON.stringify({complete:false,reason:'boss-action-owned-qa-failed',key,error:errorText(error),report,cleanup:error?.cleanup??report?.cleanup??null},null,2);
   status.textContent=key+' 검수 중단 · 원시 실패·정리 기록 유지';
  }finally{eventTarget.removeEventListener?.('pagehide',hide);controller.abort();running=false;button.disabled=false;select.disabled=false;}
 };
 installed.add(document);return{button,select,status};
}
