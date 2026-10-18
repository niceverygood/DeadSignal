import {ProductionArt} from './production-art.js?v=0.29.0';
import {productionManifest} from './production-manifest.js?v=0.29.0';
import {createQAStorage} from './qa-storage.js';
import {allowBuildingOcclusion} from './qa-building-occlusion.js';

const query=new URLSearchParams(location.search),button=document.querySelector('#compare'),status=document.querySelector('#status'),report=document.querySelector('#report'),images=document.querySelector('#images');
const eligible=location.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&location.port==='8851'&&query.has('qa')&&query.has('qa-memory');
const storage=eligible?createQAStorage(query,()=>{throw Error('building-qa-persistent-storage-forbidden');}):null;
if(!allowBuildingOcclusion(location,query,storage))status.textContent='8851의 qa·qa-memory 검수 환경이 필요합니다.';
else{
 // This dedicated caller only owns an asset host. The comparison itself owns
 // and draws the real Renderer; no unrelated QA scene or GPU rig is preloaded.
 const host={productionArt:new ProductionArt({manifest:productionManifest})};
 button.disabled=false;status.textContent='준비 완료 · 비교할 때 필요한 원본만 불러옵니다.';
 button.onclick=async()=>{
  if(button.disabled)return;
  const controller=new AbortController(),hide=()=>controller.abort();
  button.disabled=true;images.replaceChildren();report.textContent='';
  window.addEventListener('pagehide',hide,{once:true});
  try{
   const {compareBuildingOcclusion}=await import('./qa-building-occlusion.js');
   const result=await compareBuildingOcclusion(host,null,{location,query,storage,signal:controller.signal,
    onProgress:info=>{status.textContent=`${info.kind??''} ${info.face??''} · ${info.phase??''}`;},
    onImage:info=>{if(controller.signal.aborted)return;const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src=info.src;image.alt=info.alt;image.dataset.kind=info.kind;image.dataset.face=info.face;caption.textContent=info.alt;figure.append(image,caption);images.append(figure);}
   });
   if(controller.signal.aborted)return;
   report.textContent=JSON.stringify({...result.report,caller:'dedicated original-asset host; actual world drawing is performed by the helper-owned production Renderer'},null,2);
   status.textContent=`비교 완료 · ${result.report.rescuedCases}개 정렬 충돌 해결 · ${result.report.changedUpperBodyCases}개 상체 가림 변화 · 원본 body RGBA 유지`;
  }catch(error){if(!controller.signal.aborted){report.textContent=JSON.stringify({error:error?.message??String(error),qa:error?.buildingOcclusionQA??null},null,2);status.textContent='비교 중단 · '+(error?.message??String(error));}}
  finally{window.removeEventListener('pagehide',hide);controller.abort();button.disabled=false;}
 };
}
