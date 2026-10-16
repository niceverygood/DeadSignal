import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'outputs/dead-signal/production-assets');
const outputFlag=process.argv.indexOf('--output');
const draft=path.resolve(root,outputFlag>=0?process.argv[outputFlag+1]:'work/asset-review-rig-draft-20261016/production-assets');
if(!draft.startsWith(root+path.sep))throw new Error('Audit output must stay inside the game workspace');
await fs.mkdir(draft,{recursive:true});
const manifestFlag=process.argv.indexOf('--manifest');
const manifestFile=path.resolve(root,manifestFlag>=0?process.argv[manifestFlag+1]:path.join(out,'review-manifest.json'));
const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const exists=async f=>(await fs.stat(f).catch(()=>null))?.isFile()||false;
const unique=a=>[...new Set(a)];
const smokeFile=path.join(out,'qa/rig-v027/browser-runtime-evidence.json');
const smokeBytes=await exists(smokeFile)?await fs.readFile(smokeFile):null;
const smoke=smokeBytes?JSON.parse(smokeBytes.toString('utf8')):null;
const smokeEvidence=smoke?{href:'qa/rig-v027/browser-runtime-evidence.json',sha256:sha(smokeBytes),recordedAt:smoke.recordedAt}:null;
const drawn=row=>row?.qaReady==='ready'&&row.qaNativePainted==='true'&&row.productionDrawStatus==='native'&&!row.productionError;
const qaActor=asset=>asset.kind==='hero'?'hero:'+asset.id.replace('survivor-',''):asset.kind==='enemy'?'enemy:'+asset.id.replace('enemy-',''):asset.id;
const observedSamples=row=>{try{const values=JSON.parse(row.qaObservedSamples||'[]');return Array.isArray(values)?values.filter(Number.isInteger):[];}catch{return[];}};
const spriteById=new Map(manifest.assets.flatMap(a=>a.sprites.map(s=>[s.id,s])));
const metadataCache=new Map();
async function sourceMetadata(sprite){
  if(!metadataCache.has(sprite.metadata))metadataCache.set(sprite.metadata,JSON.parse(await fs.readFile(path.join(out,sprite.metadata),'utf8')));
  return metadataCache.get(sprite.metadata);
}
const fullPlayback=[];
for(const row of smoke?.fullClipPlayback||[]){
  const sprite=spriteById.get(row.qaAsset),metadata=sprite?await sourceMetadata(sprite):null;
  const segment=metadata?.animation?.clips?.[row.qaClip]||metadata?.animation?.clips?.[row.qaPose];
  const expected=metadata?Array.from({length:segment?.count||metadata.atlas.samples},(_,i)=>(segment?.start||0)+i):[];
  const observed=observedSamples(row),missing=expected.filter(n=>!observed.includes(n));
  fullPlayback.push({actor:row.qaActor,pose:row.qaPose,assetId:row.qaAsset,expectedSamples:expected.length,observedSamples:observed.length,missingSamples:missing,passed:drawn(row)&&expected.length>0&&missing.length===0});
}
const combatActors=unique((smoke?.realCombat||[]).map(row=>row.qaActor));
const combatChecks=combatActors.map(actor=>{
  const rows=smoke.realCombat.filter(r=>r.qaActor===actor),last=rows.find(r=>r.qaClip==='death'&&Number(r.qaSample)===31);
  const observed=last?observedSamples(last):[];
  return{actor,deathAtLastSample:!!last,gameState:last?.qaGameState||null,passed:!!last&&drawn(last)&&Array.from({length:12},(_,i)=>12+i).every(n=>observed.includes(n))&&Array.from({length:6},(_,i)=>26+i).every(n=>observed.includes(n))&&(!actor.endsWith('-final')||last.qaGameState==='victory')};
});
const glbCache=new Map();
async function glb(relative){
  if(glbCache.has(relative))return glbCache.get(relative);
  const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!await exists(file))return null;
  const b=await fs.readFile(file);if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(4)!==2)throw new Error('Unsupported GLB: '+relative);
  const length=b.readUInt32LE(12),type=b.readUInt32LE(16);if(type!==0x4e4f534a)throw new Error('Missing GLB JSON: '+relative);
  const j=JSON.parse(b.toString('utf8',20,20+length));
  const skinnedNodes=(j.nodes||[]).filter(n=>Number.isInteger(n.skin)&&Number.isInteger(n.mesh));
  const weightedNodes=skinnedNodes.filter(n=>(j.meshes?.[n.mesh]?.primitives||[]).some(p=>Number.isInteger(p.attributes?.JOINTS_0)&&Number.isInteger(p.attributes?.WEIGHTS_0)));
  const jointCount=unique((j.skins||[]).flatMap(s=>s.joints||[])).length;
  const clips=(j.animations||[]).map((a,i)=>({name:a.name||'clip-'+i,channels:a.channels?.length||0,targets:unique((a.channels||[]).map(c=>c.target?.path).filter(Boolean))}));
  const value={file:relative.split(path.sep).join('/'),sha256:sha(b),skins:j.skins?.length||0,jointCount,skinnedMeshes:weightedNodes.length,clips};
  glbCache.set(relative,value);return value;
}
function motionKind(name){
  const n=name.toLowerCase();return /walk/.test(n)?'walk':/run/.test(n)?'run':/idle/.test(n)?'idle':/windup/.test(n)?'windup':/attack|shoot|strike|punch|kick/.test(n)?'attack':/death|die|dead/.test(n)?'death':/hit|hurt|impact/.test(n)?'hit':'other';
}
const assets=[];
for(const asset of manifest.assets){
  const actor=['hero','boss','enemy'].includes(asset.kind),metadata=[];
  for(const sprite of asset.sprites){
    const metadataFile=path.join(out,sprite.metadata);if(!await exists(metadataFile))continue;
    const m=await sourceMetadata(sprite);
    const segments=Object.fromEntries(Object.entries(m.animation?.clips||{}).filter(([,c])=>Number.isInteger(c.start)&&Number.isInteger(c.count)&&c.count>0&&c.start>=0&&c.start+c.count<=(m.atlas?.samples||1)));
    metadata.push({id:sprite.id,samples:m.atlas?.samples||1,directions:m.atlas?.directions||1,registered:sprite.registered&&sprite.gameFilesMatch,gameplay:(asset.catalogKeys||[]).includes(sprite.id),animation:m.animation?.name||null,clips:segments,source:m.source?.file||null});
  }
  const evidence=[],activeSources=[];
  for(const source of unique(metadata.map(m=>m.source).filter(Boolean))){
    const found=await glb('work/meshy-sprite-baker/models/'+path.basename(source));if(found){evidence.push(found);if(metadata.some(m=>m.source===source&&m.gameplay&&m.registered))activeSources.push(found);}
  }
  const rigDir=path.join(out,'models',asset.selectedModel+'-rig');
  for(const filename of ['rigged-character.glb','walking.glb','running.glb']){
    const relative=path.relative(root,path.join(rigDir,filename));if(await exists(path.join(root,relative))){const found=await glb(relative);if(found&&!evidence.some(e=>e.sha256===found.sha256))evidence.push(found);}
  }
  // The active atlas may intentionally keep HQ32 locomotion while a newly
  // authored motion GLB waits for a separate combat-output integration.
  const derivedFolder=(asset.kind==='hero'?'survivor':asset.id)+'-motion-v1';
  const derivedFile=path.join(out,'models',derivedFolder,'model.glb');
  let derivedModel=null;
  if(actor&&await exists(derivedFile)){
    const found=await glb(path.relative(root,derivedFile));
    if(found){
      if(!evidence.some(e=>e.sha256===found.sha256))evidence.push(found);
      const provenanceName=await exists(path.join(out,'models',derivedFolder,'rig-provenance.json'))?'rig-provenance.json':await exists(path.join(out,'models',derivedFolder,'motion-provenance.json'))?'motion-provenance.json':null;
      derivedModel={folder:derivedFolder,file:found.file,href:'models/'+derivedFolder+'/model.glb',bytes:(await fs.stat(derivedFile)).size,sha256:found.sha256,rig:{status:found.skins>0&&found.jointCount>0&&found.skinnedMeshes>0?'skin-verified':'unverified',jointCount:found.jointCount,skinnedMeshes:found.skinnedMeshes},clips:found.clips,clipKinds:unique(found.clips.filter(c=>c.channels>0).map(c=>motionKind(c.name)).filter(c=>c!=='other')),activeSourceMatch:activeSources.some(s=>s.sha256===found.sha256),provenanceHref:provenanceName?'models/'+derivedFolder+'/'+provenanceName:null};
    }
  }
  const rigged=evidence.filter(e=>e.skins>0&&e.jointCount>0&&e.skinnedMeshes>0);
  const activeRigged=activeSources.filter(e=>e.skins>0&&e.jointCount>0&&e.skinnedMeshes>0);
  const clips=unique(evidence.flatMap(e=>e.clips.filter(c=>c.channels>0).map(c=>motionKind(c.name))).filter(c=>c!=='other'));
  const gameplay=metadata.filter(m=>m.gameplay&&m.registered),animated=gameplay.filter(m=>m.samples>1&&m.animation);
  const activeClips=unique(animated.flatMap(m=>Object.keys(m.clips).length?Object.keys(m.clips):[motionKind(m.animation)]).filter(c=>c!=='other'));
  const desired=actor?['idle','walk',...(asset.kind==='hero'?['run']:[]),'attack','hit','death']:[];
  const missing=desired.filter(c=>!activeClips.includes(c));
  const storedUnused=clips.filter(c=>!activeClips.includes(c));
  const actorId=qaActor(asset),walkRecords=(smoke?.walkBindings||[]).filter(row=>row.qaActor===actorId),poseRecords=(smoke?.poseBindings||[]).filter(row=>row.qaActor===actorId),threeRecord=(smoke?.actualThreeGlbLoading||[]).find(row=>row.actor===(asset.kind==='hero'?'survivor':asset.id));
  const expectedPoses=asset.kind==='hero'?['attack','hit','death']:['idle','windup','attack','hit','death'];
  const smokeVerification={status:!actor?'not-applicable':walkRecords.length&&walkRecords.every(drawn)&&poseRecords.every(drawn)&&expectedPoses.every(p=>poseRecords.some(r=>r.qaPose===p))&&threeRecord&&!threeRecord.error&&Number(threeRecord.joints)>0&&Number(threeRecord.skins)>0?'passed':smoke?'partial':'not-run',evidence:smokeEvidence,walkDraws:walkRecords.length,stateBindings:poseRecords.length,observedStates:unique(poseRecords.map(row=>row.qaPose)),glbViewerLoaded:!!threeRecord&&!threeRecord.error&&Number(threeRecord.joints)>0&&Number(threeRecord.skins)>0,completePlayback:fullPlayback.filter(row=>row.actor===actorId&&row.passed).length,playbackChecks:fullPlayback.filter(row=>row.actor===actorId),realCombat:combatChecks.find(row=>row.actor===actorId)||null,note:'실제 로드·그리기·동작 연결의 기능 확인입니다. 종합 아트 시각 승인과 구분합니다.'};
  const nextAction=!actor?(asset.nativeRole==='deliverable-no-entity'?'즉시 지면 화염 연출 유지 · 별도 병 투사체는 선택적 후속 작업':'정적 배경·소품으로 유지'):!rigged.length?'원화 실루엣을 보존한 관절·가중치 제작 후 이동/전용 공격 동작 제작':!missing.length?(smokeVerification.status==='passed'?'원화 대조·해부 구조·관절 변형·발 접지 종합 시각 감수':'실제 전투에서 관절 변형·발 접지·공격 전환 검수'):derivedModel?'제작된 전투 클립을 게임에 적용하고 접지·공격 전환 검수':storedUnused.includes('run')?'보관 중인 달리기 클립을 게임 프레임으로 출력하고 전용 공격·피격·사망 동작 제작':'전용 공격·피격·사망 동작과 대기 동작 제작';
  assets.push({id:asset.id,kind:asset.kind,needsWork:actor,priority:actor&&!rigged.length?'high':actor?'medium':'none',activeSources:activeSources.map(e=>({file:e.file,sha256:e.sha256,skins:e.skins,jointCount:e.jointCount,skinnedMeshes:e.skinnedMeshes})),derivedModel,rig:{status:!actor?'not-required':rigged.length?'skin-verified':'missing',activeStatus:!actor?'not-required':activeRigged.length?'skin-verified':'missing',derivedStatus:derivedModel?.rig.status||'not-authored',jointCount:Math.max(0,...rigged.map(r=>r.jointCount)),skinnedMeshes:Math.max(0,...rigged.map(r=>r.skinnedMeshes)),evidence:evidence.map(e=>({file:e.file,sha256:e.sha256,skins:e.skins,jointCount:e.jointCount,skinnedMeshes:e.skinnedMeshes}))},motion:{status:!actor?'not-required':!animated.length?'static':missing.length?'locomotion-only':'clips-exported',activeClips,storedClips:clips,storedUnused,missing,frames:gameplay.map(m=>({id:m.id,samples:m.samples,directions:m.directions,animated:m.samples>1&&!!m.animation,clips:m.clips})),clips:evidence.flatMap(e=>e.clips.map(c=>({...c,file:e.file})))},game:{status:asset.nativeRole==='deliverable-no-entity'?'not-connected':gameplay.length?'catalog-verified':'unverified',assetIds:gameplay.map(m=>m.id),note:asset.id==='throwable-molotov'?'현재 Q는 지면 화염을 즉시 생성하고 image_gen 화염 이미지를 사용합니다. 별도 병 투사체는 없으며 정적 납품 소품의 리깅 결함이 아닙니다.':'카탈로그·렌더 파일 일치는 종합 아트 시각 승인을 뜻하지 않습니다.'},smokeVerification,visualQA:{status:actor?'pending-artist-approval':'not-required',note:actor?'브라우저 기능 검증과 별도로 원화 대조·해부 구조·관절 변형·발 접지의 종합 아트 시각 승인은 대기 중입니다.':'정적 배경·소품은 캐릭터 관절·스킨 검수 대상이 아닙니다.'},nextAction});
}
const actorAssets=assets.filter(a=>['hero','boss','enemy'].includes(a.kind));
const viewerRows=smoke?.actualThreeGlbLoading||[];
const smokeSummary={status:smoke&&actorAssets.every(a=>a.smokeVerification.status==='passed')&&viewerRows.length===32&&viewerRows.every(row=>!row.error&&Number(row.joints)>0&&Number(row.skins)>0)&&fullPlayback.length>0&&fullPlayback.every(row=>row.passed)&&combatChecks.length>0&&combatChecks.every(row=>row.passed)?'passed':smoke?'partial':'not-run',evidence:smokeEvidence,counts:{glbModels:viewerRows.filter(row=>!row.error&&Number(row.joints)>0&&Number(row.skins)>0).length,gameVariants:assets.filter(a=>a.smokeVerification.status==='passed').length,stateBindings:(smoke?.poseBindings||[]).filter(drawn).length,fullPlayback:fullPlayback.filter(row=>row.passed).length,playbackChecks:fullPlayback.length,realCombat:combatChecks.filter(row=>row.passed).length},fullPlayback,realCombat:combatChecks,scope:'실제 GLB 로드·메시 그리기·동작 바인딩·대표 클립과 보스전의 기능 검증입니다. 모든 방향·프레임의 해부 구조와 원화 일치에 대한 종합 아트 승인은 아닙니다.'};
const audit={schemaVersion:1,generatedAt:new Date().toISOString(),source:{manifest:'review-manifest.json',sha256:sha(await fs.readFile(manifestFile)),scope:'실제 GLB 구조, 현재 sprite 출력·등록 및 별도 브라우저 기능 검증 기록. 종합 아트 시각 승인은 별도 대기.'},smokeVerification:smokeSummary,comprehensiveArtistApproval:{status:'pending',note:'원화 대조, 해부 구조, 관절 변형, 발 접지, 모든 방향과 프레임의 종합 시각 감수 대기'},counts:{total:assets.length,actors:actorAssets.length,skinVerified:assets.filter(a=>a.rig.status==='skin-verified').length,missingRig:assets.filter(a=>a.rig.status==='missing').length,staticActors:assets.filter(a=>a.motion.status==='static').length,locomotionOnly:assets.filter(a=>a.motion.status==='locomotion-only').length,missingMotion:assets.filter(a=>a.motion.missing.length).length,needsWork:assets.filter(a=>a.needsWork).length},assets};
await fs.writeFile(path.join(draft,'review-audit.json'),JSON.stringify(audit,null,2)+'\n');
const js='window.productionReviewAudit='+JSON.stringify(audit).replaceAll('<','\\u003c')+';\n';
await fs.writeFile(path.join(draft,'review-audit-data.js'),js);
const page=path.join(draft,'review.html');
if(await exists(page)){
  let html=await fs.readFile(page,'utf8');
  for(const file of ['review-audit-data.js','review-data.js','review.js','review.css'])if(await exists(path.join(draft,file))){
    const stamp=sha(await fs.readFile(path.join(draft,file))).slice(0,12);
    html=html.replace(new RegExp(file.replaceAll('.','\\.')+'(?:\\?[^"\\s]*)?','g'),file+'?v='+stamp);
  }
  await fs.writeFile(page,html);
}
console.log(JSON.stringify(audit.counts));
