import {Renderer} from './renderer.js?v=0.29.0&dense=20261018-4';
import {ProductionArt} from './production-art.js?v=0.29.0';
import {captureNativeCanvasAPI,createCanvasStateCandidate} from './qa-canvas-state.js';

// QA-owned Renderer/Art only: the gated utility owns and retires these instances.
// Nothing is installed on a prototype or on arbitrary selections at draw time.
const APPLY=Reflect.apply,DESCRIPTOR=Object.getOwnPropertyDescriptor,PROTO=Object.getPrototypeOf;
const FACTORY=Renderer.prototype.nativeEnemyFrame,DRAW=ProductionArt.prototype.drawFrame;
const FACTORY_DESCRIPTOR=Object.freeze({...DESCRIPTOR(Renderer.prototype,'nativeEnemyFrame')});
const DRAW_DESCRIPTOR=Object.freeze({...DESCRIPTOR(ProductionArt.prototype,'drawFrame')});
const ownData=(object,key)=>{try{const descriptor=object&&DESCRIPTOR(object,key);return descriptor&&'value'in descriptor?descriptor.value:undefined;}catch{}};
const sameDescriptor=(a,b)=>!a&&!b||!!a&&!!b&&['value','writable','get','set','enumerable','configurable'].every(key=>Object.hasOwn(a,key)===Object.hasOwn(b,key)&&Object.is(a[key],b[key]));

export function installCanvasStateCandidate({renderer,mode='original',api}={}){
 mode=mode==='original'||mode==='manual'?mode:'unsupported';
 let art=null,context=null,candidate=null,pendingBaked=new WeakSet();
 let available=false,stopped=false,reason='not-installed',factoryExpected=null,drawExpected=null,factoryInstalled=false,drawInstalled=false;
 let factoryRestored=false,drawRestored=false,cleanupComplete=false;
 const counts={factoryCalls:0,bakedReturned:0,certified:0,drawCalls:0,candidateUsed:0,fallback:0,falseReturns:0,bakedNpcManualCalls:0,ownerMismatchCalls:0};
 let directFallback=0,directFalse=0;
 const add=(name,amount=1)=>{counts[name]=Math.min(Number.MAX_SAFE_INTEGER,counts[name]+amount);};
 function syncCandidate(){
  if(!candidate){counts.fallback=directFallback;counts.falseReturns=directFalse;return;}
  const stats=candidate.report();counts.candidateUsed=stats.candidateUsed;
  // The only candidate call site is the consumed final baked-NPC ticket below.
  // Read its counters per report, avoiding another report allocation per draw.
  counts.bakedNpcManualCalls=stats.candidateUsed;
  counts.fallback=Math.min(Number.MAX_SAFE_INTEGER,directFallback+stats.fallback);
  counts.falseReturns=Math.min(Number.MAX_SAFE_INTEGER,directFalse+stats.falseReturns);
 }
 function originalsCurrent(){
  try{return PROTO(renderer)===Renderer.prototype&&PROTO(art)===ProductionArt.prototype&&ownData(renderer,'productionArt')===art&&ownData(renderer,'ctx')===context&&sameDescriptor(DESCRIPTOR(Renderer.prototype,'nativeEnemyFrame'),FACTORY_DESCRIPTOR)&&sameDescriptor(DESCRIPTOR(ProductionArt.prototype,'drawFrame'),DRAW_DESCRIPTOR)&&sameDescriptor(DESCRIPTOR(renderer,'nativeEnemyFrame'),factoryExpected)&&sameDescriptor(DESCRIPTOR(art,'drawFrame'),drawExpected);}catch{return false;}
 }
 function mismatch(){
  add('ownerMismatchCalls');available=false;reason='owner-or-method-changed';
  pendingBaked=new WeakSet();
 }
 function drawOriginal(receiver,args){
  directFallback=Math.min(Number.MAX_SAFE_INTEGER,directFallback+1);
  const result=APPLY(DRAW,receiver,args);if(result===false)directFalse=Math.min(Number.MAX_SAFE_INTEGER,directFalse+1);return result;
 }
 function factory(...args){
  if(stopped)return APPLY(FACTORY,this,args);
  add('factoryCalls');const selected=APPLY(FACTORY,this,args);
  if(args[3])return selected;
  if(this!==renderer){add('ownerMismatchCalls');return selected;}
  if(!available||!originalsCurrent()){mismatch();return selected;}
  const metadata=ownData(selected,'metadata');
  if(ownData(metadata,'format')==='meshy-iso-sprite-atlas'&&ownData(metadata,'liveRig')!==true){
   add('bakedReturned');pendingBaked.add(selected);
   if(mode==='manual'&&candidate.certify(selected))add('certified');
  }
  return selected;
 }
 function drawFrame(...args){
  if(stopped)return APPLY(DRAW,this,args);
  add('drawCalls');
  // The original arm has identical lifecycle wrappers and counters, but no
  // certification, candidate guard or manual state path.
  if(mode==='original')return drawOriginal(this,args);
  const selected=args[1],pending=pendingBaked.has(selected);
  if(!pending)return drawOriginal(this,args);
  if(this!==art||args[0]!==context){add('ownerMismatchCalls');return drawOriginal(this,args);}
  pendingBaked.delete(selected); // hit-light reuses of this body stay original.
  if(!available||!originalsCurrent()){mismatch();return drawOriginal(this,args);}
  if(!(args.length===2||args.length===3&&args[2]===undefined))return drawOriginal(this,args);
  return APPLY(candidate.drawFrame,this,args);
 }
 function restore(object,key,expected){
  try{if(sameDescriptor(DESCRIPTOR(object,key),expected)){delete object[key];return DESCRIPTOR(object,key)===undefined;}}catch{}
  return false;
 }
 function report(){if(!stopped)syncCandidate();return{available,mode,stopped,reason,...counts,factoryRestored,drawRestored,cleanupComplete};}
 function stop(){
  if(stopped)return report();
  syncCandidate();stopped=true;
  drawRestored=!drawInstalled||restore(art,'drawFrame',drawExpected);
  factoryRestored=!factoryInstalled||restore(renderer,'nativeEnemyFrame',factoryExpected);
  let released=true;try{candidate?.stop();}catch{released=false;}
  cleanupComplete=drawRestored&&factoryRestored&&released;
  candidate=renderer=art=context=api=pendingBaked=factoryExpected=drawExpected=null;
  return report();
 }
 try{
  if(mode==='unsupported'){reason='mode-unavailable';return{report,stop};}
  art=ownData(renderer,'productionArt');context=ownData(renderer,'ctx');
  if(!renderer||!art||!context||PROTO(renderer)!==Renderer.prototype||PROTO(art)!==ProductionArt.prototype||!sameDescriptor(DESCRIPTOR(Renderer.prototype,'nativeEnemyFrame'),FACTORY_DESCRIPTOR)||!sameDescriptor(DESCRIPTOR(ProductionArt.prototype,'drawFrame'),DRAW_DESCRIPTOR)){reason='original-qa-owner-required';return{report,stop};}
  if(DESCRIPTOR(renderer,'nativeEnemyFrame')||DESCRIPTOR(art,'drawFrame')){reason='existing-method-override';return{report,stop};}
  if(mode==='manual'){
   if(api===undefined)api=captureNativeCanvasAPI();
   if(!api){reason='native-api-unavailable';return{report,stop};}
   candidate=createCanvasStateCandidate({context,original:DRAW,api,mode:'manual'});
  }
  factoryExpected={value:factory,writable:true,enumerable:false,configurable:true};
  drawExpected={value:drawFrame,writable:true,enumerable:false,configurable:true};
  Object.defineProperty(renderer,'nativeEnemyFrame',factoryExpected);factoryInstalled=true;
  Object.defineProperty(art,'drawFrame',drawExpected);drawInstalled=true;
  available=true;reason='installed';
 }catch{available=false;reason='installation-failed';stop();}
 return{report,stop};
}
