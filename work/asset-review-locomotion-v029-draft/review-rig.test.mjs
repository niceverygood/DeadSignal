import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const manifest=JSON.parse(await fs.readFile(path.join(here,'production-assets/review-manifest.json'),'utf8'));
const audit=JSON.parse(await fs.readFile(path.join(here,'production-assets/review-audit.json'),'utf8'));
const code=await fs.readFile(path.join(here,'production-assets/review.js'),'utf8');
const pixelNear=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
const gameplaySprite=(data,id)=>{const a=data.assets.find(a=>a.id===id);return a.sprites.find(s=>a.catalogKeys.includes(s.id)&&s.animation&&s.atlasInfo.samples>1)||a.sprites.find(s=>a.catalogKeys.includes(s.id));};

function app(hash='',data=structuredClone(manifest),report=structuredClone(audit)){
  const nodes=new Map(),requests=[],draws=[],markers=[];let next=1;
  const raf=new Map();
  const ctx={setTransform(){},clearRect(){},drawImage(...a){draws.push(a);},beginPath(){},moveTo(...a){markers.push(a);},lineTo(){},stroke(){}};
  const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,checked:false,listeners:{},addEventListener(e,fn){this.listeners[e]=fn;},getBoundingClientRect(){return{width:520,height:430};},getContext(){return ctx;},classList:{toggle(){}},showModal(){},close(){}});return nodes.get(id);};
  const atlasInfo=new Map(data.assets.flatMap(a=>a.sprites.map(b=>[b.atlas,b.atlasInfo])));
  class NativeImage{set src(url){this.url=url;requests.push(this);}finish(){Object.assign(this,{naturalWidth:atlasInfo.get(this.url).width,naturalHeight:atlasInfo.get(this.url).height});this.onload();}}
  const document={hidden:false,getElementById:el,querySelectorAll(){return[];},addEventListener(){}};
  vm.runInNewContext(code,{window:{productionReview:data,productionReviewAudit:report,addEventListener(){}},document,location:{hash},history:{replaceState(){}},Image:NativeImage,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame(fn){const id=next++;raf.set(id,fn);return id;},cancelAnimationFrame(id){raf.delete(id);},devicePixelRatio:1});
  return{el,nodes,requests,draws,markers,raf,document,async load(i=0){requests[i].finish();await Promise.resolve();await Promise.resolve();},tick(time){const entry=raf.entries().next().value;if(entry){raf.delete(entry[0]);entry[1](time);}}};
}

test('rig confidence requires actual weighted GLB evidence and static scenery is not treated as an unrigged actor',()=>{
  assert.equal(audit.assets.length,53);assert.equal(audit.counts.actors,33);
  for(const a of audit.assets){
    if(a.rig.status==='skin-verified')assert.ok(a.rig.evidence.some(e=>e.skins>0&&e.jointCount>0&&e.skinnedMeshes>0));
    if(a.kind==='environment'){assert.equal(a.rig.status,'not-required');assert.equal(a.needsWork,false);}
  }
  assert.equal(audit.assets.find(a=>a.id==='throwable-molotov').game.status,'not-connected');
});

test('opening a middle boss selects the animated gameplay bake rather than its static encyclopedia portrait',async()=>{
  const a=app('#boss-01-mid');assert.equal(a.requests.length,1);
  assert.equal(a.requests[0].url,gameplaySprite(manifest,'boss-01-mid').atlas);
  await a.load();assert.equal(a.el('play').disabled,false);
  assert.match(a.el('asset-detail').innerHTML,/관절·스킨 확인/);assert.match(a.el('asset-detail').innerHTML,/전용 공격/);
  assert.match(a.el('asset-detail').innerHTML,/도감 고해상도 상세 · 정적 1프레임/);
});

test('a new registered HQ32 walk is the first real UI image even when a retained action reel comes earlier',async()=>{
  const data=structuredClone(manifest),asset=data.assets.find(a=>a.id==='boss-01-mid'),original=gameplaySprite(data,asset.id),walk=structuredClone(original);
  walk.id='boss-01-mid-grounded-walk-hq32';walk.atlas='sprites/'+walk.id+'/atlas.png';walk.label='걷기 · 접지 32프레임';walk.animation={name:'DS_GroundedWalk',duration:1.0666666,loop:true,clips:null};
  asset.sprites.push(walk);asset.catalogKeys.push(walk.id);asset.preferredBakeId=walk.id;
  const state=app('#boss-01-mid',data);assert.equal(state.requests.length,1);assert.equal(state.requests[0].url,walk.atlas);await state.load();assert.equal(state.el('play').disabled,false);
  assert.match(state.el('smoke-overview').innerHTML,/v0\.27 검수 기록/);assert.match(state.el('smoke-overview').innerHTML,/현재 선택한 새 출력의 검수 통과를 뜻하지 않습니다/);
});

test('v029 summary displays only captured walking / GLB / sample counts while retained v027 proof stays separate',()=>{
 const state=app('#boss-01-mid'),html=state.el('smoke-overview').innerHTML;
 assert.match(html,/v0\.27 검수 기록/);assert.match(html,/v0\.29 · 보행·모델 로드 기능 확인/);assert.match(html,/실제 보행 31\/31종/);assert.match(html,/접지 GLB 로드 19\/19종/);assert.match(html,/모두 관찰한 캐릭터 16종/);assert.match(html,/90·180도 회전 2\/2건 확인/);assert.match(html,/공격 예고 방향 1\/1건 확인/);
 assert.match(state.el('asset-detail').innerHTML,/관찰한 이동 샘플 32\/32개/);
 const report=structuredClone(audit);delete report.supplementalLocomotionVerification;for(const asset of report.assets)delete asset.supplementalLocomotionVerification;const pending=app('#boss-01-mid',structuredClone(manifest),report);assert.match(pending.el('smoke-overview').innerHTML,/v0\.29 이동 보충 검수 · 기록 대기/);assert.ok(!pending.el('smoke-overview').innerHTML.includes('실제 보행 31/31종'));
});

test('pending-only filtering and search combine without dropping the selected detailed inspection',()=>{
  const a=app('#boss-10-final');a.el('pending-only').checked=true;a.el('pending-only').listeners.change();
  assert.equal(a.el('filter-result').textContent,`${audit.counts.needsWork}개 표시 / 전체 ${manifest.assets.length}개`);
  assert.ok(!a.el('asset-list').innerHTML.includes('data-asset="env-common-brick"'));
  a.el('search').value='boss-10-final';a.el('search').listeners.input();
  assert.match(a.el('filter-result').textContent,/1개 표시/);assert.match(a.el('asset-detail').innerHTML,/boss-10-final/);assert.match(a.el('asset-detail').innerHTML,/검수/);
});

test('a combined atlas obeys clip ranges, stops a death clip on the last frame, and can replay it',async()=>{
  const d=structuredClone(manifest),r=structuredClone(audit),asset=d.assets.find(a=>a.id==='boss-01-mid'),sprite=gameplaySprite(d,asset.id);
  const segments={idle:{start:0,count:2,duration:.2,loop:true},walk:{start:2,count:2,duration:.2,loop:true},death:{start:4,count:4,duration:.4,loop:false}};
  r.assets.find(a=>a.id===asset.id).motion.frames.find(s=>s.id===sprite.id).clips=segments;
  const a=app('#boss-01-mid',d,r);await a.load();
  assert.equal(a.el('clip').value,'walk');assert.equal(a.el('sample').value,2);
  assert.match(a.el('clip').innerHTML,/사망 · 4프레임 · 1회/);
  a.el('clip').value='death';a.el('clip').listeners.change();assert.equal(a.el('sample').min,4);assert.equal(a.el('sample').max,7);
  a.el('play').listeners.click();for(const t of [0,100,200,300,400,500])a.tick(t);
  assert.equal(a.el('sample').value,7);assert.equal(a.raf.size,0);assert.equal(a.el('play').textContent,'재생');
  a.el('play').listeners.click();assert.equal(a.el('sample').value,4);a.tick(600);a.tick(700);assert.equal(a.el('sample').value,5);
});

test('only chosen atlases load, stale pose completion cannot replace the current image, and hidden pages stop animation',async()=>{
  const a=app();await a.load();a.el('pose').value='0';a.el('pose').listeners.change();a.el('pose').value='2';a.el('pose').listeners.change();
  assert.equal(a.requests.length,3);const before=a.draws.length;await a.load(1);assert.equal(a.draws.length,before);await a.load(2);
  assert.equal(a.draws.at(-1)[0].url,a.requests[2].url);
  a.el('play').listeners.click();a.tick(0);a.tick(100);const count=a.draws.length;a.document.hidden=true;a.tick(200);assert.equal(a.draws.length,count);assert.equal(a.raf.size,0);
});

test('lossless trimmed cells keep the original pixel scale and common foot position across differently cropped poses',async()=>{
  const d=structuredClone(manifest),r=structuredClone(audit),asset=d.assets.find(a=>a.id==='boss-01-mid'),sprite=gameplaySprite(d,asset.id);
  sprite.atlasInfo.packing=null;sprite.animation.clips=null;r.assets.find(a=>a.id===asset.id).motion.frames.find(f=>f.id===sprite.id).clips={};
  const reference=structuredClone(sprite.projectionFootPivot||sprite.frames[0].footPivot);
  for(const f of sprite.frames){f.rect={x:0,y:0,width:256,height:256};f.footPivot=structuredClone(reference);}
  const original=app('#boss-01-mid',structuredClone(d),structuredClone(r));await original.load();
  const full=original.draws.at(-1),scale=full[7]/256;
  sprite.atlasInfo.packing='trimmed-v1';sprite.projectionFootPivot=reference;
  const crops=[{x:40,y:18,width:150,height:190},{x:12,y:46,width:206,height:150}];
  for(const [i,c]of crops.entries()){
    const frame=sprite.frames.find(f=>f.direction===0&&f.sample===i);frame.rect={x:700+i*210,y:500,width:c.width,height:c.height};frame.footPivot={x:reference.x-c.x,y:reference.y-c.y};
  }
  const packed=app('#boss-01-mid',d,r);await packed.load();packed.el('pivot').checked=true;packed.el('pivot').listeners.change();
  for(const [i,c]of crops.entries()){
    packed.el('sample').value=String(i);packed.el('sample').listeners.input();const draw=packed.draws.at(-1);
    assert.equal(draw[7]/c.width,scale,'Trimming cannot make a pose larger');assert.equal(draw[8]/c.height,scale);
    pixelNear(draw[5],full[5]+c.x*scale);pixelNear(draw[6],full[6]+c.y*scale);
    // The first opaque pixel before cropping has identical screen coordinates.
    pixelNear(draw[5]+7*scale,full[5]+(c.x+7)*scale);pixelNear(draw[6]+9*scale,full[6]+(c.y+9)*scale);
    const footMarker=packed.markers.at(-2);pixelNear(footMarker[0]+9,full[5]+reference.x*scale);pixelNear(footMarker[1],full[6]+reference.y*scale);
  }
});

test('a trimmed atlas without its canonical foot reference fails visibly instead of silently centering each crop',async()=>{
  const d=structuredClone(manifest),sprite=gameplaySprite(d,'boss-01-mid');
  sprite.atlasInfo.packing='trimmed-v1';delete sprite.projectionFootPivot;
  const a=app('#boss-01-mid',d);await a.load();assert.equal(a.draws.length,0);assert.equal(a.el('stage-state').hidden,false);assert.match(a.el('stage-state').textContent,/발 기준점이 없습니다/);
});

test('a newly authored hero rig exposes stored attack clips without claiming they are active in the retained HQ32 movement atlas',()=>{
  const r=structuredClone(audit),hero=r.assets.find(a=>a.id==='survivor-shotgun');
  // Isolate the legitimate intermediate state in which only retained HQ32
  // movement is connected while the new action GLB is authored separately.
  hero.motion.activeClips=['walk','run'];hero.motion.storedUnused=['idle','windup','attack','hit','death'];hero.motion.status='locomotion-only';hero.derivedModel.activeSourceMatch=false;
  assert.equal(hero.derivedModel.folder,'survivor-motion-v1');assert.equal(hero.derivedModel.rig.status,'skin-verified');
  assert.ok(hero.derivedModel.clipKinds.includes('attack'));assert.ok(hero.derivedModel.clipKinds.includes('death'));assert.ok(hero.motion.storedUnused.includes('attack'));
  assert.equal(hero.derivedModel.activeSourceMatch,false);assert.ok(!hero.motion.activeClips.includes('attack'));
  assert.ok(hero.motion.frames.some(f=>f.samples===32));
  const a=app('#survivor-shotgun',structuredClone(manifest),r);assert.match(a.el('asset-detail').innerHTML,/models\/survivor-motion-v1\/model.glb/);
  assert.match(a.el('asset-detail').innerHTML,/현재 게임 atlas의 원본과 별도/);assert.match(a.el('asset-detail').innerHTML,/보관 중 · 게임 미적용/);
});

test('authored models without preview PNGs still expose the real GLB download and retain the separate gameplay output',()=>{
  const d=structuredClone(manifest),asset=d.assets.find(a=>a.id==='boss-10-final');
  const derived=audit.assets.find(a=>a.id===asset.id).derivedModel;
  asset.models.push({folder:derived.folder,bytes:derived.bytes,previews:[]});asset.selectedModel=derived.folder;
  const a=app('#boss-10-final',d);assert.match(a.el('asset-detail').innerHTML,/이 수정본의 모델 미리보기 PNG는 없습니다/);
  assert.match(a.el('asset-detail').innerHTML,/href="models\/boss-10-final-motion-v1\/model.glb" download/);
  assert.equal(a.requests[0].url,asset.sprites.find(s=>asset.catalogKeys.includes(s.id)).atlas);
});

test('real browser smoke proof is shown separately from pending comprehensive artist approval',async()=>{
  const proof=JSON.parse(await fs.readFile(path.join(root,'outputs/dead-signal/production-assets/qa/rig-v027/browser-runtime-evidence.json'),'utf8'));
  const summary=audit.smokeVerification;assert.equal(summary.status,'passed');
  assert.equal(summary.counts.glbModels,proof.actualThreeGlbLoading.length);assert.equal(summary.counts.gameVariants,33);assert.equal(summary.counts.stateBindings,proof.poseBindings.length);
  assert.equal(summary.counts.fullPlayback,20);assert.equal(summary.counts.playbackChecks,20);assert.equal(summary.counts.realCombat,3);
  assert.ok(summary.fullPlayback.every(row=>row.passed&&row.missingSamples.length===0));
  assert.equal(audit.comprehensiveArtistApproval.status,'pending');
  for(const a of audit.assets.filter(a=>['hero','boss','enemy'].includes(a.kind))){assert.equal(a.smokeVerification.status,'passed');assert.equal(a.visualQA.status,'pending-artist-approval');}
  const appState=app('#boss-10-final');assert.match(appState.el('smoke-overview').innerHTML,/브라우저 기능 검증 기록/);assert.match(appState.el('asset-detail').innerHTML,/종합 아트 시각 승인 대기/);
});

test('the intentionally static molotov deliverable is not a missing-rig task and clearly describes the ground-fire implementation',()=>{
  const prop=audit.assets.find(a=>a.id==='throwable-molotov');assert.equal(prop.rig.status,'not-required');assert.equal(prop.motion.status,'not-required');assert.equal(prop.needsWork,false);assert.equal(prop.smokeVerification.status,'not-applicable');
  assert.match(prop.game.note,/별도 병 투사체는 없/);assert.match(prop.game.note,/image_gen 화염 이미지/);
  const a=app('#throwable-molotov');assert.match(a.el('asset-detail').innerHTML,/즉시 지면 화염/);assert.ok(!a.el('asset-detail').innerHTML.includes('<h3>리깅 없음</h3>'));
});
