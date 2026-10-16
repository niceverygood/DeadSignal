import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const OUT=path.join(ROOT,'outputs/dead-signal/production-assets');
const WRITE_OUT=process.env.DEAD_SIGNAL_REVIEW_OUTPUT?path.resolve(process.env.DEAD_SIGNAL_REVIEW_OUTPUT):OUT;
const GAME=process.env.DEAD_SIGNAL_REVIEW_GAME ? path.resolve(process.env.DEAD_SIGNAL_REVIEW_GAME) : path.join(ROOT,'work/dead-signal-game/dist');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const exists=async file=>!!(await fs.stat(file).catch(()=>null))?.isFile();
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const rel=file=>path.relative(OUT,file).split(path.sep).join('/');
const knownImage=async relative=>await exists(path.resolve(OUT,relative))?relative:null;
const flatten=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(flatten):[];
const unique=values=>[...new Set(values)];
// A catalog can keep its original action reel as idle/actions while using a
// separately rendered, complete locomotion cycle. Prefer that actual walk
// source for the gallery and its GLB provenance, rather than object key order.
export function preferredReviewBake(sprites,catalog){
  const active=unique(flatten(catalog)),ordered=unique([...(catalog&&typeof catalog==='object'?[catalog.walk,catalog.run,catalog.actions,catalog.idle]:[]),...active].filter(id=>typeof id==='string'));
  return ordered.map(id=>sprites.find(sprite=>sprite.id===id&&sprite.gameFilesMatch)).find(Boolean)
    ||sprites.find(sprite=>active.includes(sprite.id))||sprites[0]||null;
}
const safeLocal=value=>typeof value==='string'&&!value.includes('\\')&&!/^[a-z]+:/i.test(value)&&!value.startsWith('//');
// Final approval is explicit; a filename containing "nine" is not evidence.
const ACCEPTED_FIRE_CAPTURES=new Set(['fire-player-mobile-v023.png','fire-boss08-mid-nine-v023.png','fire-boss08-final-nine-v023.png','fire-player-nine-half-v024.png']);
const HISTORY_FIRE_CAPTURES=new Set(['fire-player-half-v023.png','fire-boss08-final-v023.png','fire-actual-mission03-paused-v023.png']);
const ACCEPTED_V026_CAPTURES=new Set(['armory-illustrations-desktop-v026.png','armory-illustrations-mobile390-bottom-v026.png','armory-illustrations-mobile390-v026.png']);

export async function buildProductionReview(){
  const manifestFile=path.join(GAME,'production-manifest.js');
  const sourceManifest=await fs.readFile(manifestFile);
  const {productionManifest:m}=await import(pathToFileURL(manifestFile).href+'?review='+sha(sourceManifest));
  const {BOSS_CATALOG}=await import(pathToFileURL(path.join(GAME,'campaign.js')).href);
  const scenePlan=await readJSON(path.join(OUT,'../moodboards-50/scene-plan.json'));
  const scenes=scenePlan.scenes;
  const modelFolders=(await fs.readdir(path.join(OUT,'models'),{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name);
  const spriteFolders=(await fs.readdir(path.join(OUT,'sprites'),{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name);
  const imageFiles=(await fs.readdir(path.join(OUT,'qa'))).filter(f=>/\.(png|jpe?g|webp)$/i.test(f)&&!/initial|cache-stale|capture-transient/i.test(f)&&(!/v0?26(?=[^0-9]|$)/i.test(f)||ACCEPTED_V026_CAPTURES.has(f))&&(!f.startsWith('fire-')||ACCEPTED_FIRE_CAPTURES.has(f)||HISTORY_FIRE_CAPTURES.has(f)));
  const qa=imageFiles.sort().map(file=>({src:'qa/'+file,name:file.replace(/\.(png|jpe?g|webp)$/i,'').replaceAll('-',' '),file,...(/^(fire|explosion)-/.test(file)?{provenance:'image_gen-vfx',vfxId:file.startsWith('explosion-')?'explosion':'ground-fire',provenanceLabel:'별도 image_gen VFX · Meshy native 카탈로그에 미포함',acceptedFinal:file.startsWith('explosion-')||ACCEPTED_FIRE_CAPTURES.has(file),captureLabel:file.startsWith('explosion-')?'최종 v0.24 실제 폭발 검수':ACCEPTED_FIRE_CAPTURES.has(file)?'명시적 승인 · 최종 9개 불꽃 배치':file.includes('actual-')?'실제 캠페인 이력 · 최종 VFX 검수 근거 아님':'초기 배치 비교 이력 · 최종 VFX 검수 근거 아님'}:{})}));
  const fileHashCache=new Map();
  const fileHash=async file=>{if(!fileHashCache.has(file))fileHashCache.set(file,fs.readFile(file).then(sha));return fileHashCache.get(file);};

  async function reference(number){const scene=scenes.find(s=>Number(s.id)===number);if(!scene)return null;const src='../moodboards-50/'+scene.filename;return await knownImage(src)?{src,title:scene.title,number}:null;}
  async function inputs(id){const result=[];for(const[side,label]of[['front','정면 입력'],['back','후면 입력']]){const src=await knownImage('inputs/'+id+'-'+side+'.png');if(src)result.push({src,label});}return result;}
  async function models(prefixes){
    const folders=modelFolders.filter(name=>prefixes.some(prefix=>name===prefix||name.startsWith(prefix+'-'))&&!name.endsWith('-rig'));
    const result=[];
    for(const folder of folders){
      const file=path.join(OUT,'models',folder,'model.glb');if(!await exists(file))continue;
      const previews=[];for(const[side,label]of[['front','정면'],['back','후면'],['left','좌측'],['right','우측']]){const src=await knownImage('models/'+folder+'/preview-'+side+'.png');if(src)previews.push({src,label});}
      if(!previews.length){const src=await knownImage('models/'+folder+'/preview.png');if(src)previews.push({src,label:'모델 미리보기'});}
      result.push({folder,label:folder,bytes:(await fs.stat(file)).size,previews,nativeModelPresent:true,repairCandidate:folder.includes('repaired')});
    }
    return result.sort((a,b)=>a.folder.localeCompare(b.folder,undefined,{numeric:true}));
  }
  async function bake(id,label,registered=false){
    const configured=m.assets?.[id]?.metadata;
    const folder=registered&&safeLocal(configured)&&configured.endsWith('/metadata.json')?path.posix.dirname(configured):id;
    const metadataFile=path.join(OUT,'sprites',folder,'metadata.json'),atlasFile=path.join(OUT,'sprites',folder,'atlas.png');
    if(!await exists(metadataFile)||!await exists(atlasFile))return null;
    let data;try{data=await readJSON(metadataFile);}catch{return null;}
    if(data.format!=='meshy-iso-sprite-atlas'||!Array.isArray(data.frames)||!data.frames.length||!data.atlas?.frameSize)return null;
    const info=m.assets?.[id],rootAsset=path.join(GAME,'assets/production');
    let gameFilesMatch=false;
    if(info&&safeLocal(info.atlas)&&safeLocal(info.metadata)){
      const gameAtlas=path.join(rootAsset,info.atlas),gameMeta=path.join(rootAsset,info.metadata);
      if(await exists(gameAtlas)&&await exists(gameMeta))gameFilesMatch=(await fileHash(gameAtlas)===await fileHash(atlasFile))&&(await fileHash(gameMeta)===await fileHash(metadataFile));
    }
    return {id,label,atlas:'sprites/'+folder+'/atlas.png',metadata:'sprites/'+folder+'/metadata.json',bytes:(await fs.stat(atlasFile)).size,
      sha256:await fileHash(atlasFile),registered:!!registered,gameFilesMatch,
      sourceFile:path.basename(data.source?.file||'unknown.glb'),
      atlasInfo:{width:data.atlas.width,height:data.atlas.height,directions:data.atlas.directions,samples:data.atlas.samples,frameSize:data.atlas.frameSize,packing:data.atlas.packing||null},
      projectionFootPivot:data.projection?.footPivot||null,
      animation:data.animation?{duration:data.animation.duration,name:data.animation.name,loop:data.animation.loop,clips:data.animation.clips||null}:null,
      subjectHeight:data.projection?.subjectHeight,frontYawRadians:data.projection?.frontYawRadians??0,
      frames:data.frames.map(f=>({index:f.index,direction:f.direction,sample:f.sample,time:f.time,rect:f.rect,footPivot:f.footPivot||data.projection?.footPivot,alphaBounds:f.combinedAlphaBounds||f.alphaBounds,clipped:!!f.clipped}))};
  }
  function nativeStatus(sprites,activeIds,onlyDeliverable,modelCount){
    if(onlyDeliverable)return {status:'deliverable-only',statusLabel:'납품용 · 미연결'};
    if(activeIds.length&&activeIds.every(id=>sprites.some(b=>b.id===id&&b.registered&&b.gameFilesMatch)))return{status:'native-integrated',statusLabel:'게임 등록'};
    if(sprites.length)return{status:'native-pending',statusLabel:'렌더 후보 · 검수 대기'};
    return{status:'source-pending',statusLabel:modelCount?'원본 준비 · 렌더 대기':'입력 준비 · 모델 대기'};
  }
  const entries=[];
  async function add({id,name,kind,description='',boards=[],inputId=id,modelPrefixes=[id],catalog=null,notes='',qaMatch=()=>false,extraInputs=[],onlyDeliverable=false}){
    const references=(await Promise.all(boards.map(reference))).filter(Boolean);
    const activeIds=unique(flatten(catalog));
    const variants=[];
    if(catalog&&typeof catalog==='object')for(const[label,asset]of Object.entries(catalog)){if(typeof asset==='string'&&!variants.some(v=>v.id===asset)){const pose=label==='idle'&&catalog.walk===asset?'walk':label;variants.push({id:asset,label:{idle:'대기',walk:'걷기',run:'달리기',actions:'전투 동작 릴'}[pose]||pose});}}
    else for(const asset of activeIds)variants.push({id:asset,label:'게임 카메라'});
    if(!variants.length&&spriteFolders.includes(id))variants.push({id,label:'네이티브 후보'});
    if(id==='boss-10-final')for(const candidate of ['boss-10-final-repaired-v2','boss-10-final-repaired'])if(spriteFolders.includes(candidate)&&!activeIds.includes(candidate))variants.push({id:candidate,label:candidate.endsWith('v2')?'수리 v2 후보':'이전 수리 후보'});
    const portrait=m.bossPortraits?.[id],detail=m.bossDetailPortraits?.[id];
    for(const portraitId of flatten(portrait))if(!variants.some(v=>v.id===portraitId))variants.push({id:portraitId,label:'도감 정적 초상'});
    for(const detailId of flatten(detail))if(!variants.some(v=>v.id===detailId))variants.unshift({id:detailId,label:'도감 고해상도 상세'});
    const registeredIds=new Set([...activeIds,...flatten(portrait),...flatten(detail)]);
    const sprites=(await Promise.all(variants.map(v=>bake(v.id,v.label,registeredIds.has(v.id))))).filter(Boolean);
    const modelVariants=await models(modelPrefixes);
    const preferredBake=preferredReviewBake(sprites,catalog),selectionSource=preferredBake?.sourceFile||'';
    const explicitVersion=selectionSource.match(/-v(\d+)(?:-|\.glb)/)?.[1];
    const exactSourceFolder=selectionSource.replace(/\.glb$/i,'').replace(/-rig$/,'');
    let selectedModel=modelVariants.find(v=>v.folder===exactSourceFolder)?.folder||modelVariants.filter(v=>explicitVersion?v.folder.endsWith('-v'+explicitVersion):!v.repairCandidate).at(-1)?.folder||modelVariants.at(-1)?.folder;
    if(id==='boss-10-final'&&!catalog)selectedModel=modelVariants.filter(v=>v.repairCandidate).at(-1)?.folder||selectedModel;
    let modelSourceMatch='version-inferred';
    const nativeSourcePath=path.join(ROOT,'work/meshy-sprite-baker/models',path.basename(selectionSource));
    if(selectionSource&&await exists(nativeSourcePath)){
      const nativeSHA=await fileHash(nativeSourcePath);
      for(const variant of modelVariants){if(await fileHash(path.join(OUT,'models',variant.folder,'model.glb'))===nativeSHA){selectedModel=variant.folder;modelSourceMatch='direct-source-sha256';break;}}
      if(modelSourceMatch!=='direct-source-sha256'){
        const rigFolders=modelFolders.filter(folder=>folder.endsWith('-rig')&&modelVariants.some(v=>v.folder===folder.replace(/-rig$/,'')));
        outer:for(const folder of rigFolders)for(const leaf of['rigged-character.glb','walking.glb','running.glb']){
          const rigFile=path.join(OUT,'models',folder,leaf);if(await exists(rigFile)&&await fileHash(rigFile)===nativeSHA){selectedModel=folder.replace(/-rig$/,'');modelSourceMatch='rig-source-sha256';break outer;}
        }
      }
    }
    const allInputs=await inputs(inputId);for(const[relative,label]of extraInputs){const src=await knownImage(relative);if(src)allInputs.push({src,label});}
    entries.push({id,name,kind,description,notes,references,inputs:allInputs,models:modelVariants,selectedModel,modelSourceMatch,sprites,preferredBakeId:preferredBake?.id||null,
      ...nativeStatus(sprites,activeIds,onlyDeliverable,modelVariants.length),nativeRole:onlyDeliverable?'deliverable-no-entity':'catalog-registration',
      qa:qa.filter(qaMatch),catalogKeys:activeIds});
  }
  for(const weapon of['shotgun','nailgun'])await add({id:'survivor-'+weapon,name:'생존자 · '+(weapon==='shotgun'?'산탄총':'네일건'),kind:'hero',boards:[2,4],inputId:'survivor',modelPrefixes:['survivor','weapon-'+weapon],catalog:m.characters?.['survivor-'+weapon],description:'머스터드 재킷 생존자와 실제 장착 무기 · 대기 / 걷기 / 달리기',extraInputs:[['inputs/weapon-'+weapon+'.png','무기 입력']],notes:'3개 포즈는 각각 실제 native 모델을 게임 카메라로 렌더한 결과입니다. 모델 미리보기의 무기는 단독 원본이며 장착 모습은 게임 카메라 출력에서 확인합니다.',qaMatch:q=>q.file.includes(weapon)||(weapon==='shotgun'&&(q.file.includes('native-survivor')||q.file.includes('survivor-weapon-ready')))});
  for(const boss of BOSS_CATALOG){const number=Number(boss.id.split('-')[1]),board=13+(number-1)*3+(boss.role==='mid'?1:2);await add({id:boss.id,name:`${number}탄 ${boss.role==='mid'?'중간':'최종'} · ${boss.name}`,kind:'boss',boards:[board],catalog:m.bosses?.[boss.id],description:boss.appearance.description,notes:boss.id==='boss-10-final'?(m.bosses?.[boss.id]?'뒤쪽 X는 실제 원본 강철 가로판을 UV 그대로 재사용한 수리본입니다. 몸체와 두 궤도는 첫 수리안과 동일하며, 현재 카탈로그의 실제 출력으로 표시합니다.':'이전 후보는 X 보강재가 가려졌습니다. 두 실제 강철 donor를 다시 고른 수리 v2의 native GPU 검수가 대기 중입니다.'): `특유 스킬: ${boss.skillName} · ${boss.skillDescription}`,qaMatch:q=>q.file.includes('boss-phase-mission-'+String(number).padStart(2,'0')+'-'+boss.role+'-')||q.file.startsWith('fire-boss'+String(number).padStart(2,'0')+'-'+boss.role+'-')||(boss.id==='boss-10-final'?q.file.includes('boss-10-'):boss.id==='boss-01-final'?q.file.includes('native-demolition-boss'):false)});}
  const enemyNames={walker:'보행 감염자',runner:'질주 감염자',shield:'방패 감염자',screamer:'비명 감염자',gas:'가스 감염자',elite:'경보 정예',collector:'수집가'};
  for(const[type,name]of Object.entries(enemyNames))await add({id:'enemy-'+type,name,kind:'enemy',boards:[type==='collector'?10:type==='gas'?8:['shield','screamer','elite'].includes(type)?9:4],catalog:m.enemies?.[type],description:type==='collector'?'탈출역 수집가 · 일반 적 카탈로그의 대형 개체':'각기 다른 실루엣과 장비를 가진 감염자',notes:'기본 보기는 현재 게임의 걷기 연결을 우선합니다. 실제 이동 프레임 수와 원본 GLB는 선택한 출력의 메타데이터에서 확인합니다. 전투 동작 릴과 이동 주기는 별도로 보관합니다.'});
  const environment=[
    ['env-demolition-scaffold-bay','철거 공사장 가설 구조',1],['env-sewers-pump-station','하수 펌프장',2],['env-harbor-container','화물 컨테이너',3],['env-hospital-quarantine-wing','격리병원 병동',4],['env-checkpoint-guardhouse','검문 초소',5],['env-terminal-bus-depot','환승 터미널',6],['env-power-transformer-bank','송전소 변압기',7],['env-refinery-tank-pump','정유 탱크와 펌프',8],['env-armory-bunker','군수창고 벙커',9],['env-scrapyard-compressor','폐차 압축 시설',10],['env-greenhouse-isolation','폐온실 격리동',11],['env-breakwater-control-building','태풍방벽 관제동',12],['env-fence-horizontal','펜스 · 가로',0],['env-fence-vertical','펜스 · 세로',0],['env-broken-car','파손 차량',0],['env-red-fuel-barrel','연료 드럼통',0],['env-amber-worklamp','호박색 작업등',0],['env-common-brick','공통 벽돌 주거·상가',0]];
  for(const[id,name,mission]of environment){const sourceId=id.startsWith('env-fence-')?'env-fence':id;await add({id,name,kind:'environment',boards:mission?[13+(mission-1)*3]:[4,3],inputId:sourceId,modelPrefixes:[sourceId],catalog:m.environment?.[id],description:mission?`${mission}탄의 고유 배경 모듈`:'공통 도시 배경 모듈',notes:id==='env-common-brick'?'공통 건물의 등록 상태는 실제 현재 카탈로그와 PNG 파일을 다시 읽어 표시합니다.': '원본 모델의 비율을 보존하는 native 스프라이트입니다. 실제 게임 배치는 기존 충돌 영역을 유지합니다.',qaMatch:q=>mission?(q.file.includes('environment-mission-'+String(mission).padStart(2,'0')+'-')||q.file.includes('environment-final-mission-'+String(mission).padStart(2,'0')+'-')):id==='env-common-brick'?q.file.includes('common-brick'):q.file.includes('environment-warm-lights')});}
  await add({id:'lure-speaker',name:'휴대용 유인 스피커',kind:'prop',boards:[5,2],catalog:m.environment?.['lure-speaker'],description:'실제 배치되는 유인 스피커 본체',notes:'기존 소리 유인 판정에 연결되는 실제 native 본체입니다.'});
  await add({id:'throwable-molotov',name:'화염병 · 납품 모델',kind:'prop',boards:[2,5],description:'모델과 native 렌더 결과 · 별도 병 투사체 연결 없음',onlyDeliverable:true,notes:'현재 Q 동작은 화염 영역을 즉시 생성합니다. 병 entity가 없으므로 이 모델을 실제 투사체처럼 연결했다고 표시하지 않습니다.'});

  // Raster VFX provenance stays outside the Meshy/native catalog and asset list.
  const vfx=[],fireModule=path.join(GAME,'fire-art.js'),firePNG=path.join(OUT,'vfx/ground-fire-30ee21bfc149.png');
  const bool=value=>value==='true'?true:value==='false'?false:null;
  const num=value=>value!==undefined&&Number.isFinite(Number(value))?Number(value):null;
  const sourceRecord=async(src,label)=>await exists(path.join(OUT,src))?{src,label,sha256:await fileHash(path.join(OUT,src))}:null;
  if(await exists(fireModule)&&await exists(firePNG)){
    const {FIRE_ATLAS}=await import(pathToFileURL(fireModule).href+'?review='+await fileHash(fireModule));
    const gamePNG=path.join(GAME,'assets/vfx/ground-fire-30ee21bfc149.png'),sourceSHA=await fileHash(firePNG),gameFilesMatch=await exists(gamePNG)&&await fileHash(gamePNG)===sourceSHA;
    if(sourceSHA!==FIRE_ATLAS.source.sha256)throw new Error('Original image_gen fire PNG provenance mismatch');
    const evidence=[];
    for(const[file,label]of [['fire-player-browser-v023.json','플레이어 6상태 실제 브라우저 진단'],['fire-boss-browser-v023.json','8탄 중간·최종보스 실제 브라우저 진단'],['fire-player-final-browser-v024.json','최종 v0.24 플레이어 0.5초 · 9개 불꽃 진단']]){
      const evidenceFile=path.join(OUT,'qa',file);if(!await exists(evidenceFile))continue;
      const raw=await readJSON(evidenceFile),records=Array.isArray(raw)?raw:[raw];
      evidence.push({src:'qa/'+file,label,records:records.map(record=>({preset:record.preset??null,role:record.role??null,ready:bool(record.ready),fireArtStatus:record.fireArtStatus,imageCount:num(record.fireImageCount),activeFieldCount:num(record.activeFireFieldCount),spriteDraws:num(record.fireDrawImageCount??record.fireClusterDraws),drawProof:bool(record.fireDrawProof??record.nativeFire),checkpointEquivalent:bool(record.restoreEquivalent),pausedTickUnchanged:bool(record.pausedTickNoChange),rendererDrift:bool(record.rendererDrift),rendererRngDrift:bool(record.rendererRngDrift),errorEmpty:record.error===''}))});
    }
    vfx.push({id:'ground-fire',name:'지면 화염 · image_gen VFX',sourceKind:'image_gen',isMeshyGLB:false,nativeCatalogMember:false,sourceImage:rel(firePNG),sourceSha256:sourceSHA,gameFilesMatch,width:FIRE_ATLAS.width,height:FIRE_ATLAS.height,frameCount:FIRE_ATLAS.frames.length,fps:FIRE_ATLAS.fps,sourceAnalysis:await sourceRecord('vfx/fire-atlas-analysis.json','화염 원본 픽셀 분석'),integratedRecord:await sourceRecord('vfx/HANDOFF.txt','화염 v0.23 통합·검수 기록'),references:[await reference(35)].filter(Boolean),evidence,qa:qa.filter(q=>q.vfxId==='ground-fire'),acceptedCaptureFiles:qa.filter(q=>q.vfxId==='ground-fire'&&q.acceptedFinal).map(q=>q.file),notes:'원화 35를 참고해 생성한 원본 2D VFX입니다. Meshy GLB/native atlas 카탈로그와 별도이며 원본 PNG를 재가공하지 않았습니다. 최종 9개 배치 판정은 명시적으로 승인된 캡처 목록과 브라우저 진단 JSON에 한정합니다. 초기 배치·실제 캠페인 이력은 비교용이며 최종 VFX 검수 근거가 아닙니다.'});
  }
  const explosionModule=path.join(GAME,'explosion-art.js'),explosionPNG=path.join(OUT,'vfx/explosion-one-shot-8dc57e3e099c.png');
  if(await exists(explosionModule)&&await exists(explosionPNG)){
    const {EXPLOSION_ATLAS}=await import(pathToFileURL(explosionModule).href+'?review='+await fileHash(explosionModule));
    const sourceSHA=await fileHash(explosionPNG),gamePNG=path.join(GAME,'assets/vfx/explosion-8dc57e3e099c.png');
    if(sourceSHA!==EXPLOSION_ATLAS.source.sha256)throw new Error('Original image_gen explosion PNG provenance mismatch');
    const gameFilesMatch=await exists(gamePNG)&&await fileHash(gamePNG)===sourceSHA,evidence=[];
    for(const[file,label]of [['explosion-browser-v024.json','단일·실제 3연쇄 기본 8상태'],['explosion-frame10-pause-browser-v024.json','프레임 10·일시정지 3상태'],['explosion-mobile-browser-v024.json','390px DPR2 프레임 10 검수']]){
      const evidenceFile=path.join(OUT,'qa',file);if(!await exists(evidenceFile))continue;
      const raw=await readJSON(evidenceFile),records=Array.isArray(raw)?raw:[raw];
      evidence.push({src:'qa/'+file,label,records:records.map(record=>({kind:record.kind,age:num(record.requestedAge),state:record.gameState,ready:bool(record.ready),imageCount:num(record.imageCount),shockwaveCount:num(record.actualShockwaveCount??record.shockwaveCount),spriteDraws:num(record.drawImageCount),frameSamples:JSON.parse(record.frameSamples||'[]'),drawProof:bool(record.drawProof),hp:num(record.hp),hpPreserved:bool(record.hpPreserved),pausedTickUnchanged:bool(record.pausedTickNoChange),rendererDrift:bool(record.rendererDrift),rendererRngDrift:bool(record.rendererRngDrift),worldFingerprintUnchanged:bool(record.worldFingerprintUnchanged),errorEmpty:record.error===''}))});
    }
    vfx.push({id:'explosion',name:'폭발 · image_gen VFX',sourceKind:'image_gen',isMeshyGLB:false,nativeCatalogMember:false,sourceImage:rel(explosionPNG),sourceSha256:sourceSHA,gameFilesMatch,width:EXPLOSION_ATLAS.width,height:EXPLOSION_ATLAS.height,frameCount:EXPLOSION_ATLAS.frames.length,playback:{kind:'one-shot',lifetimeSeconds:.32},sourceAnalysis:await sourceRecord('vfx/explosion-atlas-analysis-8dc57e3e099c.json','폭발 원본 픽셀·경계 분석'),integratedRecord:await sourceRecord('vfx/explosion-HANDOFF-v024.txt','폭발 v0.24 통합·검수 기록'),references:[await reference(5)].filter(Boolean),evidence,qa:qa.filter(q=>q.vfxId==='explosion'),notes:'원화 05 기반의 재가공 없는 image_gen 원본입니다. 실제 Game.explode의 .32초 shockwave life로 16프레임을 한 번 재생합니다. 단일은 damage0 시각 검사이고, 3연쇄는 기존 차량·드럼통의 실제 파괴입니다. 프레임 10의 가시 몸체 위 여백은 1px이며 희미한 alpha1~4 경계가 남아 있어 완전 투명 gutter라고 표시하지 않습니다. 실제 브라우저 검수이며 실기기 FPS 측정은 아닙니다.'});
  }
  const nativeCatalogAssets=Object.keys(m.assets||{}).length;
  const counts={total:entries.length,nativeIntegrated:entries.filter(a=>a.status==='native-integrated').length,pending:entries.filter(a=>a.status.endsWith('pending')).length,deliverableOnly:entries.filter(a=>a.status==='deliverable-only').length,spriteExports:entries.reduce((sum,a)=>sum+a.sprites.length,0),nativeCatalogAssets,imagegenVfx:vfx.length,screenshots:qa.length,fireQAScreenshots:qa.filter(q=>q.vfxId==='ground-fire').length,explosionQAScreenshots:qa.filter(q=>q.vfxId==='explosion').length};
  const data={version:3,generatedAt:new Date().toISOString(),title:'DEAD SIGNAL · 프로덕션 아트 검수',sourceManifest:{file:'production-manifest.js',sha256:sha(sourceManifest)},counts,assets:entries,vfx,qa,notes:`게임 등록은 현재 production catalog의 연결과 출력 PNG/metadata의 byte 일치를 뜻합니다. 등록 상태가 시각적 최종 승인을 뜻하지는 않습니다. Meshy/native atlas ${nativeCatalogAssets}개와 image_gen VFX ${vfx.length}개를 별도로 집계합니다.`};
  const serialized=JSON.stringify(data,null,2);
  if(/https?:\/\/|msy_[A-Za-z0-9]/i.test(serialized))throw new Error('Review data must not contain remote URLs or credentials');
  if(!WRITE_OUT.startsWith(path.resolve(ROOT)+path.sep))throw new Error('Review output must stay in the workspace');
  await fs.mkdir(WRITE_OUT,{recursive:true});
  await fs.writeFile(path.join(WRITE_OUT,'review-manifest.json'),serialized+'\n');
  await fs.writeFile(path.join(WRITE_OUT,'review-data.js'),'window.productionReview = '+serialized.replaceAll('<','\\u003c')+';\n');
  const reviewFile=path.join(WRITE_OUT,'review.html');
  let reviewPage=await fs.readFile(reviewFile,'utf8');
  for(const file of ['review-data.js','review.js','review.css']){
    const stamp=(await fileHash(path.join(WRITE_OUT,file))).slice(0,12),escaped=file.replaceAll('.','\\.');
    reviewPage=reviewPage.replace(new RegExp('(["\\\'])'+escaped+'(?:\\?[^"\\\']*)?\\1','g'),(_,quote)=>quote+file+'?v='+stamp+quote);
  }
  await fs.writeFile(reviewFile,reviewPage);
  console.log(JSON.stringify({review:path.relative(ROOT,path.join(WRITE_OUT,'review.html')).split(path.sep).join('/'),counts,missingBakes:entries.filter(e=>!e.sprites.length).map(e=>e.id),sourceManifestSHA256:data.sourceManifest.sha256}));
  return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildProductionReview();
