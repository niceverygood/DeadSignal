import {NativeCatalogIds} from './native-catalog-ids.js';
import {compareBulletBroadphase} from './qa-bullet-broadphase.js';

const percentile=(values,p)=>values.sort((a,b)=>a-b)[Math.floor(values.length*p)]??0;
export async function compareCatalogIds(renderer,canvas,{beforeScenario=async()=>{},onProgress=()=>{},onImage=()=>{},frames=110,scenarios=[[60,'shotgun'],[180,'nailgun']]}={}){
 const rig=renderer.liveEnemies,priorGpu=rig?.exactGPUAlphaBounds,priorForce=Object.getOwnPropertyDescriptor(renderer,'forceCatalogEnumeration'),priorRequest=Object.getOwnPropertyDescriptor(renderer,'requestProductionCatalog'),originalRequest=renderer.requestProductionCatalog,reports=[];
 let current=null,finalGame;
 const wrapped=function(...args){const start=performance.now();if(current&&this.forceCatalogEnumeration===true&&this.productionArt.manifest[args[0]]?.[args[1]])current.originalEnumerations++;try{return originalRequest.apply(this,args);}finally{if(current){current.catalogCpuMs+=performance.now()-start;current.catalogCalls++;}}};
 renderer.requestProductionCatalog=wrapped;if(rig)rig.exactGPUAlphaBounds=false;
 try{
  if(rig){rig.releaseUnused(['enemy-walker']);if(!await rig.load('enemy-walker'))throw Error('catalog-walker-not-ready');}
  for(const [count,weapon]of scenarios){
   await beforeScenario({count,weapon});const cachePasses=[];
   const result=await compareBulletBroadphase(renderer,canvas,{count,weapon,frames,legacyBulletComparison:false,
    onPass:force=>{renderer.forceCatalogEnumeration=force;const cache=renderer.productionCatalogIds??=new NativeCatalogIds();cache.stats.enumerations=cache.stats.hits=0;},
    onProgress:force=>onProgress({count,weapon,cacheEnabled:!force}),
    onFrameStart:()=>{current={catalogCpuMs:0,catalogCalls:0,originalEnumerations:0,enumerationsBefore:renderer.productionCatalogIds.stats.enumerations,hitsBefore:renderer.productionCatalogIds.stats.hits};},
    onFrameEnd:()=>{const sample=current;sample.cachedEnumerations=renderer.productionCatalogIds.stats.enumerations-sample.enumerationsBefore;sample.cacheHits=renderer.productionCatalogIds.stats.hits-sample.hitsBefore;delete sample.enumerationsBefore;delete sample.hitsBefore;current=null;return sample;},
    onImage:(force,src)=>{cachePasses.push({cacheEnabled:!force,cacheStats:{...renderer.productionCatalogIds.stats}});onImage({count,weapon,cacheEnabled:!force,src});}
   });
   finalGame=result.game;result.report.passes.forEach((pass,i)=>{const samples=pass.samples.map(s=>s.nativeProfile);Object.assign(pass,cachePasses[i],{catalog:{medianCpuMs:percentile(samples.map(s=>s.catalogCpuMs),.5),p95CpuMs:percentile(samples.map(s=>s.catalogCpuMs),.95),maxCpuMs:Math.max(0,...samples.map(s=>s.catalogCpuMs)),calls:samples.reduce((n,s)=>n+s.catalogCalls,0),originalEnumerations:samples.reduce((n,s)=>n+s.originalEnumerations,0),cachedEnumerations:samples.reduce((n,s)=>n+s.cachedEnumerations,0),cacheHits:samples.reduce((n,s)=>n+s.cacheHits,0)}});});reports.push(result.report);
  }
  return {game:finalGame,report:{reports,note:'Only immutable catalog ID enumeration is cached. Loading/readiness/body-alpha checks, original character frames and all game rules remain active in both arms. Baseline uses the original Object.values + Set iterator, with no added frozen-array construction. Instrumented CPU call wall time; no heap/VRAM reduction or FPS measurement. Historical batch8 pacing is used for this fixed-workload comparison. GPU-alpha experiment stays OFF.'}};
 }finally{
  current=null;if(renderer.requestProductionCatalog===wrapped){if(priorRequest)Object.defineProperty(renderer,'requestProductionCatalog',priorRequest);else delete renderer.requestProductionCatalog;}
  if(priorForce)Object.defineProperty(renderer,'forceCatalogEnumeration',priorForce);else delete renderer.forceCatalogEnumeration;
  if(rig){rig.exactGPUAlphaBounds=priorGpu;if(!priorGpu)rig.releaseExactGPUAlpha();}
 }
}
