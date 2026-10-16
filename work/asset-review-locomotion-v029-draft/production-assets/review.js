(() => {
  'use strict';
  const data=window.productionReview;
  if(!data?.assets?.length){document.getElementById('asset-detail').textContent='검수 데이터가 없습니다. 빌더를 다시 실행해 주세요.';return;}
  const $=id=>document.getElementById(id);
  const audit=window.productionReviewAudit;
  const auditMap=new Map((audit?.assets||[]).map(a=>[a.id,a]));
  const motionNames={idle:'대기',walk:'걷기',run:'달리기',windup:'공격 준비',attack:'전용 공격',hit:'피격',death:'사망'};
  const motionLabel=items=>items.map(i=>motionNames[i]||i).join(' · ');
  function evidenceFor(asset){return auditMap.get(asset.id);}
  function actualMotion(b){return !!b.animation&&b.atlasInfo.samples>1;}
  function defaultBakeIndex(asset){const preferred=asset.sprites.findIndex(s=>s.id===asset.preferredBakeId&&(asset.catalogKeys||[]).includes(s.id)&&actualMotion(s));if(preferred>=0)return preferred;const gameplay=asset.sprites.findIndex(s=>(asset.catalogKeys||[]).includes(s.id)&&actualMotion(s));return gameplay>=0?gameplay:Math.max(0,asset.sprites.findIndex(s=>(asset.catalogKeys||[]).includes(s.id)));}
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kinds=[['all','전체'],['hero','생존자'],['boss','보스'],['enemy','감염자'],['environment','환경'],['prop','전술 도구']];
  let selected=data.assets.find(a=>a.id===decodeURIComponent(location.hash.slice(1)))||data.assets[0];
  let category='all',query='',pendingOnly=false,currentBake=null,currentImage=null,direction=0,sample=0,playing=false,phase=0,previousTime=null,currentClip=null,loadVersion=0,resizeObserver=null,animationFrame=null;
  const images=new Map();
  $('asset-count').textContent=data.counts.total;
  $('qa-count').textContent=data.qa.length;
  $('updated').textContent=new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(data.generatedAt));
  $('summary').innerHTML=[['nativeCatalogAssets','Meshy native atlas'],['imagegenVfx','별도 image_gen VFX'],['screenshots','실행 캡처']].map(([key,label])=>`<div class="metric"><b>${data.counts[key]}</b><span>${label}</span></div>`).join('');
  $('registration-note').textContent=data.notes+' · 게임 등록과 리깅/동작 완료는 구분합니다.';
  const smoke=audit?.smokeVerification;
  const capturedRevision=smoke?.evidence?.href?.match(/v(\d{3})(?=[-/\.])/i)?.[1],captureLabel=capturedRevision?`v${Number(capturedRevision[0])}.${capturedRevision.slice(1)} 검수 기록`:'저장된 검수 기록';
  $('smoke-overview').innerHTML=smoke?.evidence?`<div class="smoke-heading"><div><span class="eyebrow">BROWSER FUNCTION CHECK / ${escape(captureLabel)}</span><h2>${smoke.status==='passed'?'브라우저 기능 검증 기록':'브라우저 기능 검증 일부 확인'}</h2></div><span class="artist-pending">종합 아트 시각 승인 대기</span></div><p class="smoke-counts">실제 GLB ${smoke.counts.glbModels}종 · 게임 캐릭터 ${smoke.counts.gameVariants}종 · 동작 연결 ${smoke.counts.stateBindings}건 · 전체 구간 재생 ${smoke.counts.fullPlayback}/${smoke.counts.playbackChecks}건 · 보스전 ${smoke.counts.realCombat}종</p><p class="smoke-scope">${escape(smoke.scope)} 이 숫자는 연결된 ${escape(captureLabel)}에 한정하며 현재 선택한 새 출력의 검수 통과를 뜻하지 않습니다.</p><a href="${escape(smoke.evidence.href)}">실제 브라우저 검증 기록 ↗</a>`:'<p class="smoke-scope">브라우저 기능 검증 기록 대기 · 종합 아트 시각 승인과 별도입니다.</p>';
  $('smoke-overview').innerHTML+=supplementalLocomotionHTML(audit?.supplementalLocomotionVerification);
  $('pending-count').textContent=audit?.counts.needsWork??'—';
  const c=audit?.counts;
  $('pipeline-overview').innerHTML=c?`<div class="pipeline-overview-heading"><div><span class="eyebrow">RIG & MOTION AUDIT</span><h2>동작 제작 현황</h2><p>등록된 이미지와 실제 리깅·게임 동작을 나누어 확인합니다.</p></div><a class="audit-download" href="review-audit.json" download>전체 점검 기록 ↓</a></div><div class="pipeline-metrics"><div><b>${c.missingRig}</b><span>리깅 없는 캐릭터</span></div><div><b>${c.skinVerified}</b><span>관절·스킨 확인</span></div><div><b>${c.locomotionOnly}</b><span>이동 동작만 적용</span></div><div><b>${c.missingMotion}</b><span>추가 동작 제작·적용 대상</span></div></div><p class="audit-scope">검사 대상 ${c.total}개 · 캐릭터 ${c.actors}개. 관절·가중치가 있는 GLB와 현재 출력의 프레임을 확인했습니다. 실제 전투의 변형·접지·동작 전환 검수는 별도입니다.</p>`:'<p class="audit-scope">리깅 점검 데이터를 불러오지 못했습니다. 게임 등록 상태만으로 동작 완료를 판단하지 마세요.</p>';

  function renderCategories(){
    $('categories').innerHTML=kinds.map(([id,label])=>`<button type="button" class="category ${id===category?'active':''}" data-category="${id}" aria-pressed="${id===category}">${label}<span>${id==='all'?data.assets.length:data.assets.filter(a=>a.kind===id).length}</span></button>`).join('');
  }
  function renderNav(){
    const matches=data.assets.filter(a=>(category==='all'||a.kind===category)&&(!pendingOnly||evidenceFor(a)?.needsWork)&&(!query||(a.name+' '+a.id+' '+a.description).toLocaleLowerCase().includes(query)));
    $('filter-result').textContent=`${matches.length}개 표시 / 전체 ${data.assets.length}개`;
    $('asset-list').innerHTML=matches.length?matches.map(a=>`<button type="button" class="asset-row ${a.id===selected?.id?'active':''}" data-asset="${escape(a.id)}" ${a.id===selected?.id?'aria-current="true"':''}><span class="index">${String(data.assets.indexOf(a)+1).padStart(2,'0')}</span><span class="row-text">${escape(a.name)}<small>${escape(a.id)}</small><em class="row-pipeline">${escape(evidenceFor(a)?.rig.status==='missing'?'리깅·동작 제작 필요':evidenceFor(a)?.motion.status==='locomotion-only'?'이동 있음 · 전투 동작 필요':evidenceFor(a)?.motion.status==='static'&&evidenceFor(a)?.derivedModel?'리깅 제작 · 게임 동작 대기':evidenceFor(a)?.motion.status==='clips-exported'?'동작 출력 · 실제 검수 대기':evidenceFor(a)?.game.status==='not-connected'?'정적 납품 소품':'정적 에셋')}</em></span><i class="status-dot ${a.status}" title="${escape(a.statusLabel)}"></i></button>`).join(''):'<p class="no-results">검색 결과가 없습니다.</p>';
  }
  function img(src,label,className=''){
    return `<img src="${escape(src)}" alt="${escape(label)}" class="${className}" loading="lazy" decoding="async" data-enlarge="${escape(src)}" data-caption="${escape(label)}">`;
  }
  function cardTitle(number,title,right=''){return `<div class="card-title"><h3><span class="step-number">${number}</span>${title}</h3>${right}</div>`;}
  function qaHTML(items){
    return items.map(q=>`<figure>${img(q.src,q.name)}<figcaption><b>${escape(q.file.includes('boss-10-repaired-direction')?'이전 수리 후보 · X 개선 전':q.name)}</b>${escape(q.file)}${q.provenanceLabel?`<br>${escape(q.provenanceLabel)}<br>${escape(q.captureLabel)}`:''}</figcaption></figure>`).join('');
  }
  function vfxHTML(){
    return(data.vfx||[]).map(v=>`<div class="section-heading"><h3>${escape(v.name)}</h3><small>native 카탈로그와 별도 집계</small></div><article class="card"><div class="card-title"><h3>별도 image_gen 원본</h3><small>${v.width} × ${v.height} · ${v.frameCount} frames · ${v.playback?.kind==='one-shot'?'1회 · '+v.playback.lifetimeSeconds+'초':v.fps+' fps'}</small></div><div class="qa-grid"><figure>${img(v.sourceImage,v.name+' · 재가공 없는 원본 16프레임 PNG')}<figcaption><b>image_gen 원본 PNG · Meshy GLB 아님</b>${escape(v.sourceImage)}<br>SHA256 ${escape(v.sourceSha256)}</figcaption></figure>${v.references.map(r=>`<figure>${img(r.src,r.title)}<figcaption><b>${escape(r.title)}</b>원화 참고 ${r.number}번</figcaption></figure>`).join('')}</div><p class="notes">${escape(v.notes)}<br>현재 게임 PNG와 원본 byte 일치: ${v.gameFilesMatch?'확인':'미확인'}<br>${[v.sourceAnalysis,v.integratedRecord,...v.evidence].filter(Boolean).map(e=>`<a href="${escape(e.src)}">${escape(e.label)}</a>`).join(' · ')}</p></article><div class="section-heading"><h3>${v.id==='explosion'?'폭발':'화염'} 실제 QA 캡처 ${v.qa.length}장</h3><small>${v.id==='explosion'?'실제 단일·3연쇄 및 프레임 10':'최종 배치와 초기 이력 구분'}</small></div><div class="qa-grid">${qaHTML(v.qa)}</div>`).join('');
  }
  function referencesHTML(asset){
    if(!asset.references.length)return'<div class="empty">연결된 원본 무드보드 없음</div>';
    const first=asset.references[0];return `<div class="reference-stage" id="reference-stage">${img(first.src,first.title)}</div><div class="ref-tabs">${asset.references.map((r,i)=>`<button type="button" class="mini-button ${i===0?'active':''}" data-reference="${i}">${escape(r.title)}</button>`).join('')}</div>`;
  }
  function modelHTML(asset){
    const model=asset.models.find(m=>m.folder===asset.selectedModel)||asset.models.at(-1);
    if(!model)return'<div class="empty">실제 GLB 원본이 아직 없습니다.</div>';
    if(!model.previews.length)return `<div class="empty">${escape(model.folder)}<br>실제 GLB 있음 · ${formatBytes(model.bytes)}<br>이 수정본의 모델 미리보기 PNG는 없습니다.<br>아래 실행 캡처와 네이티브 후보 출력에서 검수합니다.<br><a class="model-download" href="models/${encodeURIComponent(model.folder)}/model.glb" download>원본 GLB 내려받기 ↓</a></div>`;
    return `<div class="image-grid">${model.previews.map(p=>`<figure>${img(p.src,model.folder+' · '+p.label)}<figcaption><span>${p.label}</span><span>실제 모델 미리보기</span></figcaption></figure>`).join('')}</div>`;
  }
  function formatBytes(bytes){return bytes>=1024*1024?(bytes/1024/1024).toFixed(1)+' MB':Math.round(bytes/1024)+' KB';}
  function nativeHTML(asset){
    return `<div class="native-stage"><span class="stage-label">ORIGINAL NATIVE RENDER / FIXED GAME CAMERA</span><canvas id="native-canvas" aria-label="실제 모델의 게임 카메라 렌더 프레임"></canvas><div class="stage-state" id="stage-state">${asset.sprites.length?'선택한 렌더를 불러오는 중':'아직 native PNG 출력이 없습니다.<br>원본 모델 상태를 왼쪽에서 확인하세요.'}</div><div class="native-caption"><span id="frame-caption"></span><span id="file-caption"></span></div></div>
    <div class="controls"><div class="controls-line clip-controls"><label class="control-label" for="clip">클립</label><select id="clip" disabled aria-label="동작 클립 선택"><option>구간 정보 없음</option></select></div><div class="controls-line"><label class="control-label" for="pose">동작</label><select id="pose" ${asset.sprites.length?'':'disabled'}>${asset.sprites.map((b,i)=>`<option value="${i}">${escape(b.label)}${actualMotion(b)?' · '+b.atlasInfo.samples+'프레임':' · 정적 1프레임'}${!(asset.catalogKeys||[]).includes(b.id)?' · 도감/후보':''}</option>`).join('')}</select><button type="button" id="play" class="transport" disabled>재생</button><label class="pivot-label"><input id="pivot" type="checkbox">발 기준점</label></div><div class="controls-line"><label class="control-label" for="direction">방향</label><input type="range" id="direction" value="0" min="0" max="15" step="1"><output id="direction-value" class="control-value">00 / 16</output></div><div class="controls-line"><label class="control-label" for="sample">프레임</label><input type="range" id="sample" value="0" min="0" max="0" step="1" disabled><output id="sample-value" class="control-value">01 / 01</output></div><div class="direction-presets" id="direction-presets"></div></div>
    <div class="facts"><div class="fact"><small>DIRECTIONS × SAMPLES</small><span id="fact-frames">—</span></div><div class="fact"><small>HEIGHT / WORLD</small><span id="fact-height">—</span></div><div class="fact"><small>ATLAS FILE</small><span id="fact-bytes">—</span></div></div>`;
  }
  function pipelineHTML(asset){
    const a=evidenceFor(asset);if(!a)return '<p class="audit-scope">이 에셋의 리깅 점검 기록이 없습니다.</p>';
    const rig=a.rig.activeStatus==='missing'&&a.derivedModel?.rig.status==='skin-verified'?['리깅 제작 · 적용 대기',`새 GLB ${a.derivedModel.rig.jointCount}개 관절 · 현재 게임 출력은 정적`]:a.rig.status==='not-required'?['정적 에셋','이 배경·소품에는 캐릭터 관절이 필요하지 않습니다.']:a.rig.status==='skin-verified'?['관절·스킨 확인',`${a.rig.jointCount}개 관절 · 가중치 연결된 메시 ${a.rig.skinnedMeshes}개`]:['리깅 없음','현재 출력의 실제 GLB에서 관절·스킨을 찾지 못했습니다.'];
    const motion=a.motion.status==='clips-exported'?['동작 프레임 출력',`출력 구간: ${motionLabel(a.motion.activeClips)}`]:a.motion.status==='not-required'?['정적 출력','방향별 원본 이미지를 사용합니다.']:a.motion.status==='static'?['정적 1프레임','방향 회전은 가능하지만 캐릭터 동작이 없습니다.']:['이동 동작만 적용',`현재 사용: ${motionLabel(a.motion.activeClips)}`];
    const game=asset.id==='throwable-molotov'?['즉시 지면 화염',a.game.note]:a.game.status==='catalog-verified'?['게임 파일 등록','카탈로그에 연결된 출력 파일 일치 기록 있음']:a.game.status==='not-connected'?['정적 납품 소품','별도 투사체 엔티티에 연결되지 않은 보관용 모델입니다.']:['연결 확인 필요','게임 출력 연결을 다시 확인해야 합니다.'];
    return `<section class="asset-pipeline" aria-label="${escape(asset.name)} 제작 단계"><div class="pipeline-cards"><article class="pipeline-card ${a.rig.status==='missing'?'needs-work':''}"><small>01 / RIG</small><h3>${rig[0]}</h3><p>${escape(rig[1])}</p></article><article class="pipeline-card ${a.motion.status==='static'?'needs-work':''}"><small>02 / MOTION</small><h3>${motion[0]}</h3><p>${escape(motion[1])}</p></article><article class="pipeline-card"><small>03 / GAME</small><h3>${game[0]}</h3><p>${escape(game[1])}</p></article><article class="pipeline-card ${a.needsWork?'needs-work':''}"><small>04 / NEXT</small><h3>${a.needsWork?'개선 필요':'정적 에셋 유지'}</h3><p>${escape(a.nextAction)}</p></article></div>${a.motion.storedUnused.length?`<p class="motion-gap"><b>보관 중 · 게임 미적용</b> ${escape(motionLabel(a.motion.storedUnused))} 클립</p>`:''}${a.motion.missing.length?`<p class="motion-gap"><b>추가 제작·적용</b> ${escape(motionLabel(a.motion.missing))}</p>`:''}<p class="pipeline-note">${escape(a.visualQA.note)}</p></section>`;
  }
  function derivedModelHTML(asset){
    const a=evidenceFor(asset),model=a?.derivedModel;if(!model)return '';
    const authored=model.rig.status==='skin-verified';
    return `<section class="derived-model" aria-label="새로 제작한 리깅과 동작 GLB"><div class="derived-heading"><div><span class="eyebrow">AUTHORED RIG / MOTION</span><h3>보관된 전투 리깅·동작 원본</h3></div><span class="derived-state">${authored?'관절·스킨 구조 확인':'구조 확인 필요'}</span></div><p class="derived-file">${escape(model.folder)} · ${formatBytes(model.bytes)} · 관절 ${model.rig.jointCount}개</p><p class="derived-clips"><b>보관된 클립</b> ${escape(motionLabel(model.clipKinds))}</p><p class="derived-integration">${model.activeSourceMatch?'현재 게임에 연결된 출력 중 이 원본 GLB와 byte 일치하는 항목이 있습니다. 새 이동 출력과 실제 접지 검수는 별도입니다.':'현재 게임 atlas의 원본과 별도입니다. GLB 제작과 게임 적용 상태를 구분합니다.'}</p><div class="derived-links"><a class="rig-view-link" href="rig-viewer.html?id=${asset.kind==='hero'?'survivor':encodeURIComponent(asset.id)}">현재 3D 리깅·이동 보기 ↗</a><a class="model-download" href="${escape(model.href)}" download>리깅·동작 GLB 내려받기 ↓</a>${model.provenanceHref?`<a href="${escape(model.provenanceHref)}">제작·보존 기록 ↗</a>`:''}</div><details><summary>클립 이름과 원본 확인</summary><p class="derived-source">현재 atlas 원본: ${a.activeSources.map(source=>escape(source.file.split('/').at(-1))).join(' · ')||'확인 대기'}</p><p class="derived-source">새 GLB SHA256: ${escape(model.sha256)}</p><ul>${model.clips.map(clip=>`<li>${escape(clip.name)} <small>${clip.channels} tracks</small></li>`).join('')}</ul></details></section>`;
  }
  function assetSmokeHTML(asset){
    const s=evidenceFor(asset)?.smokeVerification;if(!s||s.status==='not-applicable')return '';
    return `<section class="asset-smoke" aria-label="실제 브라우저 기능 확인"><div><b>${escape(captureLabel)} · ${s.status==='passed'?'브라우저 기능 확인':'브라우저 기능 확인 대기'}</b><span>종합 아트 시각 승인 대기</span></div><p>실제 GLB ${s.glbViewerLoaded?'로드 확인':'로드 미확인'} · 이동 출력 ${s.walkDraws}건 · 상태 연결 ${s.stateBindings}건${s.completePlayback?' · 전체 구간 재생 '+s.completePlayback+'개':''}${s.realCombat?.passed?' · 실제 보스전 전환 확인':''}</p>${s.evidence?`<a href="${escape(s.evidence.href)}">검증 기록 ↗</a>`:''}</section>`;
  }
  function supplementalLocomotionHTML(summary){
    if(!summary?.evidence)return '<section class="asset-smoke locomotion-summary" aria-label="v0.29 이동 보충 검수"><div><b>v0.29 이동 보충 검수 · 기록 대기</b><span>종합 아트 시각 승인 대기</span></div><p>31종의 새 보행 출력과 19종의 접지 GLB를 확인할 실제 브라우저 기록을 기다리고 있습니다. 기존 v0.27 검수 수치를 새 출력의 통과 수치로 사용하지 않습니다.</p></section>';
    const counts=summary.counts,features=summary.features||[];
    return `<section class="asset-smoke locomotion-summary" aria-label="v0.29 이동 보충 검수"><div><b>v0.29 · ${summary.status==='passed'?'보행·모델 로드 기능 확인':'보행·모델 로드 일부 확인'}</b><span>종합 아트 시각 승인 대기</span></div><p>실제 보행 ${counts.controlledActors}/${counts.expectedActors}종 · 수정된 접지 GLB 로드 ${counts.groundedGlbModels}/${counts.expectedGroundedGlbModels}종 · 32개 이동 샘플을 모두 관찰한 캐릭터 ${counts.completeCycleObservedActors}종</p><p>${features.map(feature=>`${escape(feature.label)} ${feature.observed?`${feature.passed}/${feature.observed}건 확인`:'기록 대기'}`).join(' · ')}</p><p>${escape(summary.scope)} 피격·넉백 건수는 실제 엔진 경로와 출력의 관찰이며 모든 순간의 발 접지 승인이 아닙니다.</p><a href="${escape(summary.evidence.href)}">v0.29 실제 브라우저 이동 기록 ↗</a></section>`;
  }
  function assetLocomotionHTML(asset){
    if(!['boss','enemy'].includes(asset.kind))return '';
    const summary=audit?.supplementalLocomotionVerification,row=evidenceFor(asset)?.supplementalLocomotionVerification||summary?.actors?.find(actor=>actor.id===asset.id);
    if(!summary?.evidence||!row)return '<section class="asset-smoke" aria-label="v0.29 개별 이동 검수"><div><b>v0.29 · 이 캐릭터의 이동 기록 대기</b><span>종합 아트 시각 승인 대기</span></div></section>';
    return `<section class="asset-smoke" aria-label="v0.29 개별 이동 검수"><div><b>v0.29 · ${row.status==='passed'?'실제 보행 기능 확인':'실제 보행 일부 확인'}</b><span>종합 아트 시각 승인 대기</span></div><p>관찰한 이동 샘플 ${row.observedSampleCount}/${row.availableSamples}개 · ${row.ticks} 실제 틱 · 이동 거리 ${Number(row.distance).toFixed(2)} · 초당 ${Number(row.measuredSpeed).toFixed(2)} · ${row.completeCycleObserved?'한 주기 전체 샘플 관찰':'한 주기 전체 샘플 검수와 구분'}</p><p>수정 GLB 로드 ${row.groundedModelStatus==='passed'?'확인':row.groundedModelStatus==='not-applicable'?'기존 전용 리그 유지':'기록 대기'} · ${row.featureCoverage?.length?`부가 경로 ${row.featureCoverage.length}종 확인`:'부가 경로 기록 대기'} · 원화 대조·해부 구조·전체 방향의 시각 감수는 별도입니다.</p><a href="${escape(summary.evidence.href)}">이동 검수 원본 기록 ↗</a></section>`;
  }
  function renderAsset(asset){
    selected=asset;loadVersion++;currentImage=null;currentBake=null;playing=false;phase=0;sample=0;syncAnimation();
    resizeObserver?.disconnect();$('qa-detail').hidden=true;$('asset-detail').hidden=false;
    const kind=kinds.find(([id])=>id===asset.kind)?.[1]||asset.kind;
    $('asset-detail').innerHTML=`<div class="detail-header"><div><span class="eyebrow">${escape(kind.toUpperCase())} / ${escape(asset.id)}</span><h2>${escape(asset.name)}</h2><p class="description">${escape(asset.description)}</p></div><span class="badge ${asset.status}"><span class="status-dot ${asset.status}"></span>${escape(asset.status==='native-integrated'?'게임 파일 등록':asset.statusLabel)}</span></div>
    ${pipelineHTML(asset)}${assetSmokeHTML(asset)}${assetLocomotionHTML(asset)}
    <div class="comparison"><div class="stack"><article class="card">${cardTitle('01','무드보드','<small>CANONICAL REFERENCE</small>')}${referencesHTML(asset)}</article><article class="card">${cardTitle('02','모델 제작 입력','<small>원본 PNG · 확대 가능</small>')}<div class="image-grid input-grid">${asset.inputs.map(p=>`<figure>${img(p.src,asset.name+' · '+p.label)}<figcaption>${escape(p.label)}</figcaption></figure>`).join('')||'<div class="empty">입력 이미지 대기</div>'}</div></article></div><div class="stack"><article class="card">${cardTitle('04','게임 카메라 출력','<small>실제 native atlas</small>')}${nativeHTML(asset)}<p class="notes">${escape(asset.notes||'실제 출력 파일을 방향별로 비교하세요.')}</p></article><article class="card">${cardTitle('03','실제 3D 모델',`<select id="model-variant" class="model-select" aria-label="모델 버전 선택">${asset.models.map(m=>`<option value="${escape(m.folder)}" ${m.folder===asset.selectedModel?'selected':''}>${escape(m.folder)}</option>`).join('')}</select>`)}<div id="model-stage">${modelHTML(asset)}</div>${derivedModelHTML(asset)}</article></div></div>
    ${asset.qa.length?`<div class="section-heading"><h3>실제 실행 화면</h3><small>캡처 시점의 결과 · 클릭하여 원본 확대</small></div><div class="qa-grid">${qaHTML(asset.qa)}</div>`:''}
    <p class="asset-foot">원본 모델 ${asset.models.length}개 · 실제 렌더 ${asset.sprites.length}개 · <code>${escape(asset.id)}</code>${asset.nativeRole==='deliverable-no-entity'?' · 게임 본체 entity 연결 없음':''}</p>`;
    resizeObserver=new ResizeObserver(()=>paint());resizeObserver.observe($('native-canvas'));
    $('clip').addEventListener('change',()=>{const clips=clipSegments(currentBake);setClip(clips[$('clip').value]||null);paint();});
    $('pose').addEventListener('change',()=>loadBake(Number($('pose').value)));
    $('model-variant').addEventListener('change',()=>{asset.selectedModel=$('model-variant').value;$('model-stage').innerHTML=modelHTML(asset);});
    $('play').addEventListener('click',()=>{if(!playing&&currentClip?.loop===false&&phase>=currentClip.duration){phase=0;sample=currentClip.start;updateLabels();paint();}playing=!playing;$('play').textContent=playing?'일시 정지':'재생';previousTime=null;syncAnimation();});
    $('direction').addEventListener('input',()=>{direction=Number($('direction').value);updateLabels();paint();});
    $('sample').addEventListener('input',()=>{playing=false;$('play').textContent='재생';sample=Number($('sample').value);phase=((sample-(currentClip?.start||0))/(currentClip?.count||currentBake?.atlasInfo.samples||1))*(currentClip?.duration||currentBake?.animation?.duration||1);syncAnimation();updateLabels();paint();});
    $('pivot').addEventListener('change',paint);
    if(asset.sprites.length){const index=defaultBakeIndex(asset);$('pose').value=index;loadBake(index);}else{$('direction').disabled=true;paint();}
    renderNav();history.replaceState(null,'','#'+encodeURIComponent(asset.id));
  }
  async function loadBake(index){
    const bake=selected.sprites[index];if(!bake)return;
    const token=++loadVersion;currentBake=bake;currentImage=null;sample=0;phase=0;playing=false;syncAnimation();
    const {directions,samples}=bake.atlasInfo;
    const clips=clipSegments(bake);$('clip').innerHTML=Object.keys(clips).length?Object.entries(clips).map(([name,c])=>`<option value="${escape(name)}">${escape(motionNames[name]||name)} · ${c.count}프레임${c.loop?' · 반복':' · 1회'}</option>`).join(''):'<option value="">구간 정보 없음</option>';$('clip').disabled=!Object.keys(clips).length;const firstClip=clips.walk?'walk':Object.keys(clips)[0];$('clip').value=firstClip||'';currentClip=clips[firstClip]||null;direction=Math.min(direction,directions-1);
    $('direction').max=directions-1;$('direction').value=direction;$('direction').disabled=false;
    $('sample').min=currentClip?.start||0;$('sample').max=currentClip?currentClip.start+currentClip.count-1:samples-1;sample=currentClip?.start||0;$('sample').value=sample;$('sample').disabled=samples===1;
    $('play').disabled=samples===1;$('play').textContent=samples===1?'정적 1프레임':'재생';
    $('fact-frames').textContent=`${directions} × ${samples}`;$('fact-height').textContent=Number(bake.subjectHeight||0).toFixed(1);$('fact-bytes').textContent=formatBytes(bake.bytes);
    $('direction-presets').innerHTML=Array.from({length:Math.min(8,directions)},(_,i)=>{const d=Math.round(i*directions/8);return `<button type="button" data-direction="${d}">${String(d).padStart(2,'0')} · ${Math.round(d/directions*360)}°</button>`;}).join('');
    $('stage-state').hidden=false;$('stage-state').textContent='선택한 렌더를 불러오는 중';updateLabels();paint();
    try{
      let pending=images.get(bake.atlas);
      if(!pending){pending=new Promise((resolve,reject)=>{const image=new Image();image.decoding='async';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Image unavailable'));image.src=bake.atlas;});images.set(bake.atlas,pending);while(images.size>2)images.delete(images.keys().next().value);}
      const image=await pending;if(token!==loadVersion)return;
      if(image.naturalWidth!==bake.atlasInfo.width||image.naturalHeight!==bake.atlasInfo.height)throw new Error('Atlas dimensions mismatch');
      currentImage=image;$('stage-state').hidden=true;updateLabels();paint();syncAnimation();
    }catch{if(token!==loadVersion)return;images.delete(bake.atlas);$('stage-state').textContent='이 렌더 파일을 불러오지 못했습니다.\n현재 출력 경로를 확인해 주세요.';$('stage-state').hidden=false;currentImage=null;syncAnimation();paint();}
  }
  function clipSegments(bake){
    if(!bake)return{};
    const raw=evidenceFor(selected)?.motion.frames.find(f=>f.id===bake.id)?.clips||bake.animation?.clips||{};
    return Object.fromEntries(Object.entries(raw).filter(([,c])=>Number.isInteger(c.start)&&Number.isInteger(c.count)&&c.start>=0&&c.count>0&&c.start+c.count<=bake.atlasInfo.samples&&Number(c.duration)>0));
  }
  function setClip(clip){currentClip=clip;sample=clip?.start||0;phase=0;playing=false;previousTime=null;$('play').textContent='재생';$('sample').min=clip?.start||0;$('sample').max=clip?clip.start+clip.count-1:(currentBake?.atlasInfo.samples||1)-1;syncAnimation();updateLabels();}
  function updateLabels(){
    if(!currentBake)return;const a=currentBake.atlasInfo;
    $('direction-value').textContent=`${String(direction).padStart(2,'0')} / ${a.directions}`;$('sample-value').textContent=`${String(sample+1).padStart(2,'0')} / ${String(a.samples).padStart(2,'0')}`;
    $('sample').value=sample;$('direction').value=direction;
    $('frame-caption').textContent=`방향 ${String(direction).padStart(2,'0')} · ${Math.round(direction/a.directions*360)}° / 프레임 ${sample+1}`;
    $('file-caption').textContent=currentBake.registered&&currentBake.gameFilesMatch?'게임 파일과 일치':selected.nativeRole==='deliverable-no-entity'?'납품용 출력':'후보 출력';
  }
  function paint(){
    const canvas=$('native-canvas');if(!canvas)return;
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const dpr=Math.min(2,devicePixelRatio||1),width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
    if(!currentImage||!currentBake)return;
    const frame=currentBake.frames.find(f=>f.direction===direction&&f.sample===sample);if(!frame)return;
    const r=frame.rect,packed=currentBake.atlasInfo.packing==='trimmed-v1',frameSize=packed?Number(currentBake.atlasInfo.frameSize):null;
    const reference=currentBake.projectionFootPivot||currentBake.projection?.footPivot;
    if(packed&&(!Number.isFinite(frameSize)||frameSize<=0||!Number.isFinite(reference?.x)||!Number.isFinite(reference?.y)||!Number.isFinite(frame.footPivot?.x)||!Number.isFinite(frame.footPivot?.y))){
      $('stage-state').textContent='압축 출력의 원본 프레임 크기 또는 발 기준점이 없습니다. 검수 데이터를 다시 생성해 주세요.';$('stage-state').hidden=false;return;
    }
    // Packed cells keep the original virtual frame size. Centering each cropped
    // cell would rescale the actor and make its feet jump between samples.
    const scale=Math.min((rect.width-40)/(packed?frameSize:r.width),(rect.height-55)/(packed?frameSize:r.height)),dw=r.width*scale,dh=r.height*scale;
    const baseX=(rect.width-(packed?frameSize*scale:dw))/2,baseY=(rect.height-(packed?frameSize*scale:dh))/2;
    const x=baseX+(packed?reference.x-frame.footPivot.x:0)*scale,y=baseY+(packed?reference.y-frame.footPivot.y:0)*scale;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(currentImage,r.x,r.y,r.width,r.height,x,y,dw,dh);
    if($('pivot')?.checked&&frame.footPivot){const px=x+frame.footPivot.x*scale,py=y+frame.footPivot.y*scale;ctx.strokeStyle='#e6b96a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px-9,py);ctx.lineTo(px+9,py);ctx.moveTo(px,py-9);ctx.lineTo(px,py+9);ctx.stroke();}
  }
  function canAnimate(){return playing&&!document.hidden&&!!currentImage&&currentBake?.atlasInfo.samples>1;}
  function syncAnimation(){
    if(canAnimate()){if(animationFrame===null)animationFrame=requestAnimationFrame(tick);}
    else{if(animationFrame!==null)cancelAnimationFrame(animationFrame);animationFrame=null;previousTime=null;}
  }
  function tick(time){
    animationFrame=null;
    if(!canAnimate()){previousTime=null;return;}
    if(previousTime!==null){phase+=Math.min(.1,(time-previousTime)/1000);const duration=currentClip?.duration||currentBake.animation?.duration||1,count=currentClip?.count||currentBake.atlasInfo.samples,start=currentClip?.start||0,loop=currentClip?currentClip.loop!==false:true,local=loop?phase%duration:Math.min(phase,duration),next=start+Math.min(count-1,Math.floor(local/duration*count));if(next!==sample){sample=next;updateLabels();paint();}if(!loop&&phase>=duration){playing=false;$('play').textContent='재생';}}
    previousTime=time;syncAnimation();
  }
  $('categories').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;category=button.dataset.category;renderCategories();renderNav();});
  $('asset-list').addEventListener('click',event=>{const button=event.target.closest('[data-asset]');if(button)renderAsset(data.assets.find(a=>a.id===button.dataset.asset));});
  $('pending-only').addEventListener('change',()=>{pendingOnly=$('pending-only').checked;renderNav();});
  $('search').addEventListener('input',()=>{query=$('search').value.trim().toLocaleLowerCase();renderNav();});
  $('qa-library').addEventListener('click',()=>{playing=false;currentImage=null;currentBake=null;loadVersion++;syncAnimation();resizeObserver?.disconnect();$('asset-detail').hidden=true;$('qa-detail').hidden=false;$('qa-detail').innerHTML=`<div class="detail-header"><div><span class="eyebrow">ACTUAL GAME / CAPTURE LIBRARY</span><h2>실제 실행 화면</h2><p class="description">제작 중인 게임과 모델의 원본 캡처 ${data.qa.length}장입니다. 파일 이름의 버전과 시점을 함께 확인하세요. image_gen VFX ${data.counts.imagegenVfx}개는 ${data.counts.nativeCatalogAssets}개 Meshy/native atlas와 별도입니다.</p></div><span class="badge">PNG 원본</span></div>${vfxHTML()}<div class="section-heading"><h3>native·기타 실행 캡처</h3><small>캡처 시점의 결과</small></div><div class="qa-grid">${qaHTML(data.qa.filter(q=>q.provenance!=='image_gen-vfx'))}</div>`;});
  $('asset-detail').addEventListener('click',event=>{const d=event.target.closest('[data-direction]');if(d){direction=Number(d.dataset.direction);updateLabels();paint();}const ref=event.target.closest('[data-reference]');if(ref){const r=selected.references[Number(ref.dataset.reference)];$('reference-stage').innerHTML=img(r.src,r.title);document.querySelectorAll('[data-reference]').forEach(b=>b.classList.toggle('active',b===ref));}});
  document.addEventListener('click',event=>{const image=event.target.closest('[data-enlarge]');if(image){$('dialog-image').src=image.dataset.enlarge;$('dialog-image').alt=image.dataset.caption;$('dialog-caption').textContent=image.dataset.caption;$('image-dialog').showModal();}});
  $('close-dialog').addEventListener('click',()=>$('image-dialog').close());
  $('image-dialog').addEventListener('click',event=>{if(event.target===$('image-dialog'))$('image-dialog').close();});
  window.addEventListener('hashchange',()=>{const asset=data.assets.find(a=>a.id===decodeURIComponent(location.hash.slice(1)));if(asset&&asset.id!==selected.id)renderAsset(asset);});
  document.addEventListener('visibilitychange',syncAnimation);
  renderCategories();renderAsset(selected);
})();
