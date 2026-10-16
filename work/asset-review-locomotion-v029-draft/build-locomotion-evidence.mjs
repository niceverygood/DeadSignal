import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const NPC_IDS=Object.freeze([...Array.from({length:12},(_,i)=>['boss-'+String(i+1).padStart(2,'0')+'-mid','boss-'+String(i+1).padStart(2,'0')+'-final']).flat(),...['walker','runner','shield','screamer','gas','elite','collector'].map(type=>'enemy-'+type)]);
export const GROUNDED_NPC_IDS=Object.freeze(NPC_IDS.filter(id=>id.startsWith('enemy-')||id.endsWith('-mid')));
export const normalizeNpcActor=id=>typeof id==='string'?id.replace(/^enemy:/,'enemy-'):'';
const yes=value=>value===true||value==='true';
const numbers=value=>{try{const result=typeof value==='string'?JSON.parse(value):value;return Array.isArray(result)?[...new Set(result.filter(n=>Number.isInteger(n)&&n>=0&&n<32))].sort((a,b)=>a-b):[];}catch{return[];}};
const finite=value=>value!==undefined&&value!==''&&Number.isFinite(Number(value));
const actualSeconds=row=>finite(row.qaActualSimulationSeconds)?Number(row.qaActualSimulationSeconds):Number(row.qaSimulationSeconds);
const evidencePath='qa/enemy-motion-v029/browser-enemy-motion-evidence.json';
const errorFree=row=>(row.error===undefined||row.error==='')&&(row.productionError===undefined||row.productionError==='');
const nativeDraw=row=>yes(row.qaNativePainted)&&yes(row.qaRngRenderUnchanged)&&yes(row.qaPauseUnchanged)&&(!yes(row.qaRunning)||yes(row.qaPaused))&&errorFree(row);
const completeTicks=row=>[60,120].includes(Number(row.qaTargetTicks))&&Number(row.qaTicks)===Number(row.qaTargetTicks);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function controlledCheck(row){
 const id=normalizeNpcActor(row.qaActor),samples=numbers(row.qaObservedLocomotionSamples||row.qaObservedSamples),passed=NPC_IDS.includes(id)&&row.qaMode==='walk'&&row.qaMeasurement==='move'&&nativeDraw(row)&&completeTicks(row)
  &&row.qaAsset===id+'-locomotion-hq32'&&Number(row.qaSamples)===32&&Number(row.qaFrames)===512&&row.qaPacking==='trimmed-v1'
  &&yes(row.qaRngControlledTickUnchanged)&&actualSeconds(row)>=.999&&Number(row.qaDistance)>0&&samples.length>1;
 return {id,qaActor:row.qaActor,status:passed?'passed':'partial',assetId:row.qaAsset||'',ticks:Number(row.qaTicks)||0,simulationSeconds:actualSeconds(row)||0,distance:Number(row.qaDistance)||0,measuredSpeed:Number(row.qaMeasuredSpeed)||0,cycleDistance:Number(row.qaGaitCycleDistance)||0,observedSamples:samples,observedSampleCount:samples.length,availableSamples:32,completeCycleObserved:passed&&samples.length===32,source:row.qaSource||''};
}
function groundedCheck(row){
 const id=normalizeNpcActor(row.actor||row.qaActor||row.id),source=String(row.source||row.model||row.modelHref||'').replace(/^\/production-assets\//,''),clips=Array.isArray(row.clips)?row.clips.map(c=>typeof c==='string'?c:c.name):[];
 const defaultClip=row.clip||row.selectedClip||'',expectedDefault=id==='enemy-runner'?'DS_GroundedRun':'DS_GroundedWalk';
 // The actual viewer publishes its source, positive joint count and chosen
 // clip only after SHA-256 verification, GLB parsing, and weighted skin gates.
 // Retain exactly those observed UI fields. Optional skin/texture/clip-list
 // fields may be validated when captured, but must never be invented.
 const capturedSkinOK=row.skins===undefined||Number(row.skins)>0,capturedTextureOK=row.textures===undefined||Number(row.textures)>0;
 const observedClipOK=clips.length?['DS_GroundedWalk','DS_GroundedRun'].every(name=>clips.includes(name)):defaultClip===expectedDefault;
 const passed=GROUNDED_NPC_IDS.includes(id)&&source===`models/${id}-grounded-locomotion-v1/model.glb`&&row.error===''&&Number(row.joints)>0&&capturedSkinOK&&capturedTextureOK&&observedClipOK;
 return {id,status:passed?'passed':'partial',source,joints:Number(row.joints)||0,skins:row.skins===undefined?null:Number(row.skins)||0,textures:row.textures===undefined?null:Number(row.textures)||0,defaultClip,error:row.error||'',clips:clips.length?clips:null,scope:'실제 뷰어의 SHA 검증·가중치 스킨 게이트를 통과한 소스·관절·클립 UI 관찰입니다. 미기록 필드는 추정하지 않습니다.'};
}
const FEATURE_DEFINITIONS=Object.freeze([
 {id:'wall',label:'벽 앞 정지',applies:r=>r.qaCollision==='on'&&r.qaMode==='walk'&&r.qaMeasurement==='move',verify:r=>Number(r.qaDistance)<=.02&&r.qaGait==='idle'},
 {id:'stop',label:'입력 해제·밀림',applies:r=>r.qaMeasurement==='stop',verify:r=>Number(r.qaDistance)<=.000001&&r.qaGait==='idle'&&yes(r.qaRngControlledTickUnchanged)},
 {id:'turn',label:'90·180도 회전',applies:r=>r.qaMeasurement==='turn',verify:r=>finite(r.qaTurnMaxRenderedStep)&&Number(r.qaTurnMaxRenderedStep)>0&&Number(r.qaTurnMaxRenderedStep)<Math.PI/2},
 {id:'hit',label:'실제 피격 경로',requireComplete:false,applies:r=>r.qaMeasurement==='damage',verify:r=>r.qaMode==='combat'},
 {id:'knockback',label:'실제 넉백 경로',requireComplete:false,applies:r=>r.qaMeasurement==='knockback',verify:r=>r.qaMode==='combat'},
 {id:'death',label:'사망 마지막 포즈',applies:r=>r.qaMeasurement==='death',verify:r=>r.qaClip==='death'&&Number(r.qaSample)===31},
 {id:'ai',label:'실전 추적·스킬',applies:r=>r.qaMode==='combat'&&['move','skill'].includes(r.qaMeasurement),verify:r=>actualSeconds(r)>.5},
 {id:'attack-facing',label:'공격 예고 방향',requireComplete:false,applies:r=>yes(r.qaGaitActionFacing),verify:r=>finite(r.qaRenderedAngle)&&finite(r.qaSimulationAngle)&&Math.abs(Math.atan2(Math.sin(Number(r.qaRenderedAngle)-Number(r.qaSimulationAngle)),Math.cos(Number(r.qaRenderedAngle)-Number(r.qaSimulationAngle))))<.00001},
]);

export function summarizeLocomotionEvidence(raw=null,{sha256=null,href=evidencePath}={}){
 const pending={version:'0.29.0',status:'not-run',evidence:null,counts:{controlledActors:0,expectedActors:31,groundedGlbModels:0,expectedGroundedGlbModels:19,completeCycleObservedActors:0,specialCaseRecords:0,verifiedSpecialCaseRecords:0},actors:[],groundedModels:[],features:FEATURE_DEFINITIONS.map(f=>({id:f.id,label:f.label,status:'not-run',observed:0,passed:0,actors:[]})),missingActors:[...NPC_IDS],missingGroundedModels:[...GROUNDED_NPC_IDS],scope:'v0.29의 실제 보행 출력·수정 GLB 로드 기능 검수입니다. 관찰 프레임 수는 실제 기록만 집계하며, 모든 방향·프레임의 종합 아트 승인을 뜻하지 않습니다.'};
 if(!raw)return pending;
 if(!Array.isArray(raw.controlledMotion)||!Array.isArray(raw.specialCases)||!Array.isArray(raw.actualGroundedGlbLoading)||!Number.isFinite(Date.parse(raw.recordedAt)))throw new Error('invalid-v029-browser-evidence');
 if(!/^qa\/enemy-motion-v029\/[a-z0-9-]+\.json$/.test(href)||sha256!==null&&!/^[a-f0-9]{64}$/.test(sha256))throw new Error('invalid-v029-browser-evidence-reference');
 const controlled=new Map();for(const row of raw.controlledMotion){const check=controlledCheck(row);if(NPC_IDS.includes(check.id))controlled.set(check.id,check);}
 const grounded=new Map();for(const row of raw.actualGroundedGlbLoading){const check=groundedCheck(row);if(GROUNDED_NPC_IDS.includes(check.id))grounded.set(check.id,check);}
 const cases=raw.specialCases.filter(row=>NPC_IDS.includes(normalizeNpcActor(row.qaActor))),features=FEATURE_DEFINITIONS.map(feature=>{const rows=cases.filter(feature.applies),passed=rows.filter(row=>nativeDraw(row)&&(feature.requireComplete===false?Number(row.qaTicks)>0:completeTicks(row))&&feature.verify(row));return {id:feature.id,label:feature.label,status:!rows.length?'not-run':passed.length===rows.length?'passed':'partial',observed:rows.length,passed:passed.length,actors:[...new Set(passed.map(row=>normalizeNpcActor(row.qaActor)))],note:['hit','knockback'].includes(feature.id)?'실제 엔진 경로와 그리기를 관찰한 건수입니다. 종료 시점의 한 장면으로 전 구간 발 접지를 승인하지 않습니다.':undefined};});
 const actors=[...controlled.values()].map(actor=>({...actor,groundedModelStatus:grounded.get(actor.id)?.status||(!GROUNDED_NPC_IDS.includes(actor.id)?'not-applicable':'not-run'),featureCoverage:features.filter(feature=>feature.actors.includes(actor.id)).map(feature=>feature.id)})),groundedModels=[...grounded.values()],passedActors=actors.filter(a=>a.status==='passed'),passedModels=groundedModels.filter(m=>m.status==='passed');
 return {...pending,status:passedActors.length===31&&passedModels.length===19?'passed':'partial',recordedAt:raw.recordedAt,limits:typeof raw.limits==='string'?raw.limits:null,evidence:{href,sha256,recordedAt:raw.recordedAt},counts:{controlledActors:passedActors.length,expectedActors:31,groundedGlbModels:passedModels.length,expectedGroundedGlbModels:19,completeCycleObservedActors:passedActors.filter(a=>a.completeCycleObserved).length,specialCaseRecords:cases.length,verifiedSpecialCaseRecords:cases.filter(row=>nativeDraw(row)&&completeTicks(row)).length},actors,groundedModels,features,missingActors:NPC_IDS.filter(id=>!passedActors.some(a=>a.id===id)),missingGroundedModels:GROUNDED_NPC_IDS.filter(id=>!passedModels.some(m=>m.id===id))};
}

export async function readLocomotionEvidence(file=path.join(root,'outputs/dead-signal/production-assets',evidencePath)){
 let bytes;try{bytes=await fs.readFile(file);}catch(error){if(error.code==='ENOENT')return summarizeLocomotionEvidence();throw error;}
 return summarizeLocomotionEvidence(JSON.parse(bytes),{sha256:hash(bytes)});
}
export function supplementReviewAudit(audit,summary){
 // Keep legacy smokeVerification and its original v027 evidence unchanged.
 return {...audit,supplementalLocomotionVerification:summary,assets:audit.assets.map(asset=>({...asset,supplementalLocomotionVerification:summary.actors.find(actor=>actor.id===asset.id)||null}))};
}
async function main(){
 const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];},evidenceFile=arg('--evidence'),summary=await readLocomotionEvidence(evidenceFile?path.resolve(evidenceFile):undefined);
 if(process.argv.includes('--apply')){const output=path.resolve(arg('--output')||path.join(root,'work/asset-review-locomotion-v029-draft/production-assets'));if(!output.startsWith(root+path.sep))throw new Error('Output must stay in the workspace');const file=path.join(output,'review-audit.json'),audit=JSON.parse(await fs.readFile(file,'utf8')),updated=supplementReviewAudit(audit,summary),serialized=JSON.stringify(updated,null,2),script='window.productionReviewAudit = '+serialized.replaceAll('<','\\u003c')+';\n';await fs.writeFile(file,serialized+'\n');await fs.writeFile(path.join(output,'review-audit-data.js'),script);
  const htmlFile=path.join(output,'review.html');let html;try{html=await fs.readFile(htmlFile,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}if(html!==undefined)await fs.writeFile(htmlFile,html.replace(/review-audit-data\.js(?:\?[^"\s]*)?/g,'review-audit-data.js?v='+hash(script).slice(0,12)));
 }
 console.log(JSON.stringify({status:summary.status,counts:summary.counts,applied:process.argv.includes('--apply')}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
