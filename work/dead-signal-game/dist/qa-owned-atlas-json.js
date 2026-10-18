import {ProductionArt} from './production-art.js?v=0.29.0';
import {compareEnemyGridReuse} from './qa-enemy-grid-reuse.js';

export const OWNED_JSON_BROWSER_NOTE='Browser QA owns a fresh original ProductionArt per arm and restores the prior loader. The prior loader remains alive during comparison, so these are not product peak-memory measurements. Only the actual synchronous parseMetadata call is timed; fetch/PNG decode/preload/render preparation are separate. performance.memory samples may be unavailable, rounded or process-wide, include garbage and other owners, and are not continuous peak/live heap, total RAM or VRAM. No forced browser GC or texture/clip/frame/source reduction is used. Combat uses the normal pooled physics grid and renderer preparation in every arm.';
const finiteOrNull=value=>Number.isFinite(value)?value:null;
export function browserHeapSample(){
 try{const memory=globalThis.performance?.memory;return memory?{usedJSHeapSize:finiteOrNull(memory.usedJSHeapSize),totalJSHeapSize:finiteOrNull(memory.totalJSHeapSize),jsHeapSizeLimit:finiteOrNull(memory.jsHeapSizeLimit)}:null;}catch{return null;}
}
const safely=read=>{try{return read();}catch{return null;}};
const observedParsers=new WeakSet();

// A local method shadow observes the actual parser without retaining its input
// string or returned metadata tree. Original return/throw/receiver are preserved.
export function observeMetadataParser(art,{now=()=>performance.now(),memory=browserHeapSample}={}){
 if(observedParsers.has(art))throw Error('owned-json-qa-parser-already-observed');
 const descriptor=Object.getOwnPropertyDescriptor(art,'parseMetadata');
 if(descriptor&&!('value'in descriptor))throw Error('owned-json-qa-parser-accessor');
 const original=art.parseMetadata;if(typeof original!=='function')throw Error('owned-json-qa-parser-required');
 const samples=[];let stopped=false;
 const wrapped=function(...args){
  const before=safely(memory),start=finiteOrNull(safely(now));let result,threw=true;
  try{result=original.apply(this,args);threw=false;return result;}
  finally{
   const end=finiteOrNull(safely(now)),after=safely(memory);
   try{samples.push({characters:typeof args[0]==='string'?args[0].length:null,cpuCallWallMs:start!==null&&end!==null?Math.max(0,end-start):null,threw,frames:threw?null:result?.frames?.length??null,heapBefore:before,heapAfter:after});}catch{}
  }
 };
 Object.defineProperty(art,'parseMetadata',descriptor?{...descriptor,value:wrapped}:{value:wrapped,writable:true,configurable:true,enumerable:false});
 observedParsers.add(art);
 return{samples,stop(){if(!stopped){stopped=true;try{if(Object.getOwnPropertyDescriptor(art,'parseMetadata')?.value===wrapped){if(descriptor)Object.defineProperty(art,'parseMetadata',descriptor);else delete art.parseMetadata;}}finally{observedParsers.delete(art);}}return{samples,parseCalls:samples.length,parseCallWallMs:samples.reduce((sum,s)=>sum+(s.cpuCallWallMs??0),0)};}};
}

export async function compareOwnedAtlasJSON(renderer,canvas,{beforeScenario=async()=>{},onProgress=()=>{},...options}={}){
 return compareEnemyGridReuse(renderer,canvas,{...options,metadataParse:true,nativePreparation:false,observeCosts:false,beforeScenario,onProgress,beforeArm:async({game,reuse})=>{
  const prior=renderer.productionArt;
  const art=new ProductionArt({manifest:prior.manifest,baseURL:prior.baseURL,fetchImpl:prior.fetchImpl,ImageCtor:prior.ImageCtor,timeoutMs:prior.timeoutMs,onChange:prior.onChange,forceLegacyMetadataParse:!reuse});
  const report={mode:reuse?'owned':'legacy',heapBeforeLoad:browserHeapSample(),heapAfterLoad:null,heapAfterRelease:null,readyIDs:[],parser:null,loadCallWallMs:null,priorOwnerRestored:false,cleanupErrors:[],rendererPreparationLegacy:renderer.forceLegacyEnemyPreparation===true,note:OWNED_JSON_BROWSER_NOTE};
  const observer=observeMetadataParser(art);let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;for(const [stage,operation]of [['parser-observer',()=>{report.parser=observer.stop();}],['restore-loader',()=>{if(renderer.productionArt===art)renderer.productionArt=prior;report.priorOwnerRestored=renderer.productionArt===prior;if(!report.priorOwnerRestored)throw Error('owned-json-loader-owner-changed');}],['release-assets',()=>art.releaseUnusedAssets([])]])try{operation();}catch(error){report.cleanupErrors.push({stage,error:error.message});}report.heapAfterRelease=browserHeapSample();};
  renderer.productionArt=art;
  try{
   onProgress({phase:'original-metadata-load',reuse});const start=performance.now();await beforeScenario(game);report.loadCallWallMs=performance.now()-start;
   report.heapAfterLoad=browserHeapSample();report.readyIDs=[...art.records].filter(([,record])=>record.status==='ready').map(([id])=>id).sort();report.parser=observer.stop();
   if(!report.parser.parseCalls||report.parser.samples.some(sample=>sample.threw))throw Error('owned-json-actual-original-parse-required');
   return{report,dispose};
  }catch(error){dispose();throw error;}
 }});
}
