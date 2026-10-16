import {Game} from './engine.js?v=0.29.0';
import {Renderer} from './renderer.js?v=0.29.0';
import {ProductionArt} from './production-art.js?v=0.29.0';
import {productionManifest} from './production-manifest.js?v=0.29.0';
import {productionLaunchPlan,preloadLaunchPlan} from './launch-gate.js?v=0.29.0';
import {effectivePlayerSpeed} from './player-movement.js?v=0.29.0';

const TICK=1/60, DIRECTIONS={forward:{x:0,y:-1},back:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0},diagonal:{x:Math.SQRT1_2,y:-Math.SQRT1_2},none:{x:0,y:0}};
export function reviewInput({movement='forward',strength=1,aim='fixed',fire='off'}={},player){
  const direction=DIRECTIONS[movement]||DIRECTIONS.none,amount=Number.isFinite(+strength)?Math.max(0,Math.min(1,+strength)):0;
  const aimAngle=aim==='heading'&&(direction.x||direction.y)?Math.atan2(direction.y,direction.x):-Math.PI/2;
  return {moveX:direction.x*amount,moveY:direction.y*amount,aimX:player.x+Math.cos(aimAngle)*400,aimY:player.y+Math.sin(aimAngle)*400,shoot:fire==='on'};
}
export function dueReviewTicks(elapsedSeconds,completed,totalTicks=60){
  return Math.max(0,Math.min(4,Math.min(totalTicks,Math.floor(Math.max(0,elapsedSeconds)*60+1e-7))-completed));
}
export function reviewFingerprint(game){
  return JSON.stringify({time:game.time,state:game.state,player:game.player,enemies:game.enemies,bullets:game.bullets,particles:game.particles,corpses:game.corpses,random:game.random.getState(),visual:game.visualRandom.getState()});
}
export function reviewHash(value){let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return(hash>>>0).toString(16).padStart(8,'0');}

function boot(){
 const $=id=>document.getElementById(id),canvas=$('stage'),art=new ProductionArt({manifest:productionManifest}),renderer=new Renderer(canvas,{productionArt:art});
 renderer.atmosphereEnabled=false;renderer.minimapEnabled=false;renderer.shakeEnabled=false;renderer.zoom=1.5;
 const state={game:null,ready:false,serial:0,running:false,paused:false,startedAt:0,wallElapsed:0,doneTicks:0,totalTicks:60,measurement:'move',distance:0,start:null,last:null,observed:new Set(),movementObserved:new Set(),lastDraw:null,frames:0,signature:'',simulationRng:'',renderRngUnchanged:true,shotCount:0,initialAmmo:0,config:null,phaseStart:null,phaseEnd:null};
 const controls=['weapon','movement','strength','aim','fire','collision'];
 const config=()=>Object.fromEntries(controls.map(id=>[id,$(id).value]));
 const characterIds=()=>Object.values(art.manifest.characters[`survivor-${state.game?.player.weapon||$('weapon').value}`]||{});
 const originalDraw=art.drawFrame.bind(art);
 art.drawFrame=(context,selected,options)=>{const painted=originalDraw(context,selected,options);if(painted&&selected&&characterIds().includes(selected.id)){
   state.lastDraw=selected;if(state.running){state.observed.add(`${selected.id}:${selected.frame.sample}`);if(state.measurement==='move'&&state.config?.movement!=='none')state.movementObserved.add(selected.frame.sample);state.frames++;}
 }return painted;};
 const makeFloor=renderer.makeFloor.bind(renderer);let markedFloor=null,markedKey='';
 renderer.makeFloor=game=>{makeFloor(game);if(markedFloor===renderer.floor&&markedKey===renderer.floorKey)return;markedFloor=renderer.floor;markedKey=renderer.floorKey;
  const context=renderer.floor.getContext('2d');context.save();context.strokeStyle='#d6cc9a';context.lineWidth=1;context.globalAlpha=.2;context.beginPath();for(let x=0;x<=game.world.width;x+=40){context.moveTo(x,0);context.lineTo(x,game.world.height);}for(let y=0;y<=game.world.height;y+=40){context.moveTo(0,y);context.lineTo(game.world.width,y);}context.stroke();context.globalAlpha=.75;context.strokeStyle='#e3b962';context.lineWidth=2;context.beginPath();context.arc(1200,930,5,0,Math.PI*2);context.stroke();context.restore();
 };
 function buttons(){for(const id of['one-second','two-seconds','stop-check'])$(id).disabled=!state.ready||state.running;for(const id of controls)$(id).disabled=state.running;$('restart').disabled=state.running;$('pause').disabled=!state.running;$('pause').textContent=state.paused?'계속 진행':'일시정지';}
 function frozen(){state.signature=state.game?reviewFingerprint(state.game):'';}
 function findWall(game,movement){
  const configured=DIRECTIONS[movement],direction=configured&&(configured.x||configured.y)?configured:DIRECTIONS.forward;
  // Use an existing indestructible building. The normal road case never changes
  // map geometry; this case only places the isolated player beside a real wall.
  const walls=game.world.obstacles.filter(o=>o.kind==='building'&&!o.destroyed).sort((a,b)=>Math.hypot(a.x+a.w/2-1200,a.y+a.h/2-930)-Math.hypot(b.x+b.w/2-1200,b.y+b.h/2-930));
  for(const wall of walls){
    let x=wall.x+wall.w/2,y=wall.y+wall.h/2;const r=game.player.r+1;
    if(Math.abs(direction.x)>=Math.abs(direction.y))x=direction.x>0?wall.x-r:wall.x+wall.w+r;
    else y=direction.y>0?wall.y-r:wall.y+wall.h+r;
    if(!game.blocked(x,y,game.player.r)&&game.blocked(x+direction.x*4,y+direction.y*4,game.player.r)){game.player.x=x;game.player.y=y;return true;}
  }return false;
 }
 async function prepare(){const serial=++state.serial;state.running=false;state.paused=false;state.ready=false;canvas.dataset.qaReady='loading';buttons();$('load-state').className='status';$('load-state').textContent='실제 주인공·배경 에셋 로딩 중';
  try{const options=config(),game=new Game({seed:831572,weapon:options.weapon,stageDuration:1e9});game.enemies=[];game.spawnClock=1e9;game.player.invul=9999;game.player.x=1200;game.player.y=930;
   if(options.collision==='on'&&!findWall(game,options.movement))throw new Error('선택한 방향의 기존 벽 위치를 찾지 못했습니다.');
   const direction=reviewInput(options,game.player);game.player.angle=Math.atan2(direction.aimY-game.player.y,direction.aimX-game.player.x);
   const plan=productionLaunchPlan({manifest:art.manifest,weapon:game.player.weapon,world:game.world}),environmentIds=new Set(Object.values(art.manifest.environment||{})),ids=plan.assetIds.filter(id=>plan.playerIds.includes(id)||environmentIds.has(id)),filtered={...plan,assetIds:ids};
   if(!await preloadLaunchPlan(renderer,filtered))throw new Error('실제 네이티브 이미지 로딩 또는 메타데이터 검증 실패');if(serial!==state.serial)return;
   art.releaseUnusedAssets(ids);state.game=game;state.ready=true;state.config=options;state.doneTicks=0;state.totalTicks=60;state.distance=0;state.wallElapsed=0;state.start={x:game.player.x,y:game.player.y};state.last={...state.start};state.lastDraw=null;state.observed.clear();state.movementObserved.clear();state.frames=0;state.shotCount=0;state.renderRngUnchanged=true;state.measurement='move';state.phaseStart=null;state.phaseEnd=null;game.pause();frozen();renderer.cameraReady=false;renderer.lastNow=null;canvas.dataset.qaReady='ready';$('load-state').textContent='실제 네이티브 렌더 준비 완료';$('scene-label').textContent=`${game.player.weapon==='shotgun'?'산탄총':'못총'} · 40단위 바닥 격자 · 별도 검수`;buttons();diagnostics();
  }catch(error){if(serial!==state.serial)return;canvas.dataset.qaReady='failed';$('load-state').className='status error';$('load-state').textContent=error.message;$('diagnostics').textContent=error.stack||error.message;buttons();}
 }
 function begin(seconds=1,measurement='move'){
  if(!state.ready||state.running)return;state.running=true;state.paused=false;state.measurement=measurement;state.config=config();state.totalTicks=Math.round(seconds*60);state.doneTicks=0;state.startedAt=performance.now();state.wallElapsed=0;state.distance=0;state.start={x:state.game.player.x,y:state.game.player.y};state.last={...state.start};state.observed.clear();state.movementObserved.clear();state.frames=0;state.shotCount=0;state.initialAmmo=state.game.player.ammo;state.phaseStart=canvas.dataset.productionGaitPhase||null;state.phaseEnd=state.phaseStart;state.renderRngUnchanged=true;state.game.resume();state.signature='';buttons();diagnostics();
 }
 function end(){state.running=false;state.paused=false;state.game.pause();state.wallElapsed=(performance.now()-state.startedAt)/1000;state.phaseEnd=canvas.dataset.productionGaitPhase||null;frozen();buttons();diagnostics();}
 function pause(){if(!state.running)return;if(!state.paused){state.paused=true;state.wallElapsed=(performance.now()-state.startedAt)/1000;state.game.pause();frozen();}else{state.startedAt=performance.now()-state.wallElapsed*1000;state.paused=false;state.game.resume();state.signature='';}buttons();diagnostics();}
 function diagnostics(){const game=state.game;if(!game)return;const selected=state.lastDraw,p=game.player,metadata=selected?.metadata,sample=selected?.frame.sample??-1,clip=metadata?.animation?.clips?Object.entries(metadata.animation.clips).find(([,span])=>sample>=span.start&&sample<span.start+span.count)?.[0]:metadata?.animation?.name||'',simSeconds=state.doneTicks*TICK,displacement=Math.hypot(p.x-state.start.x,p.y-state.start.y),pauseMatch=(!state.running||state.paused)&&state.signature===reviewFingerprint(game),expected=effectivePlayerSpeed(p)*(state.measurement==='stop'||state.config.movement==='none'?0:+state.config.strength)*simSeconds;
  Object.assign(canvas.dataset,{qaReady:'ready',qaWeapon:p.weapon,qaRunning:String(state.running),qaPaused:String(!state.running||state.paused),qaMeasurement:state.measurement,qaMovement:state.config.movement,qaStrength:state.config.strength,qaAim:state.config.aim,qaFire:state.config.fire,qaCollision:state.config.collision,qaGameState:game.state,qaTicks:String(state.doneTicks),qaTargetTicks:String(state.totalTicks),qaSimulationSeconds:simSeconds.toFixed(6),qaWallSeconds:state.wallElapsed.toFixed(4),qaGameTime:game.time.toFixed(6),qaX:p.x.toFixed(6),qaY:p.y.toFixed(6),qaDistance:state.distance.toFixed(6),qaDisplacement:displacement.toFixed(6),qaExpectedDistance:expected.toFixed(6),qaMeasuredSpeed:(simSeconds?state.distance/simSeconds:0).toFixed(6),qaEffectiveSpeed:effectivePlayerSpeed(p).toFixed(6),qaStoredSpeed:String(p.speed),qaAsset:selected?.id||'',qaClip:clip||'',qaFrame:String(selected?.frame.index??-1),qaSample:String(sample),qaDirection:String(selected?.frame.direction??-1),qaNativePainted:String(!!selected),qaPacking:metadata?.atlas?.packing||'',qaObservedSamples:JSON.stringify([...state.movementObserved].sort((a,b)=>a-b)),qaUniqueNativeFrames:String(state.observed.size),qaRenderedFrames:String(state.frames),qaRngRenderUnchanged:String(state.renderRngUnchanged),qaPauseUnchanged:String(pauseMatch),qaSignature:reviewHash(reviewFingerprint(game)),qaRandomState:JSON.stringify(game.random.getState()),qaVisualRandomState:JSON.stringify(game.visualRandom.getState()),qaShots:String(state.shotCount),qaAmmo:String(p.ammo),qaPhaseStart:String(state.phaseStart??''),qaPhaseEnd:String(state.phaseEnd??'')});
  $('pause-result').textContent=state.running&&!state.paused?'실제 엔진 진행 중':pauseMatch?'정지 검사: 위치·상태·양쪽 RNG 지문이 그대로입니다.':'정지 상태 확인 중';
  $('diagnostics').textContent=`${state.measurement==='stop'?'입력 없는 정지 검사':'실제 이동 검사'} · ${state.running?(state.paused?'일시정지':'진행 중'):'정지'} | ${state.doneTicks}/${state.totalTicks} 고정 틱\n측정 ${simSeconds.toFixed(3)}초 · 실제 화면 시간 ${state.wallElapsed.toFixed(3)}초 | 실제 이동 거리 ${state.distance.toFixed(3)} · 변위 ${displacement.toFixed(3)}\n실측 초당 ${simSeconds?(state.distance/simSeconds).toFixed(3):'0.000'} · 현재 목표 ${effectivePlayerSpeed(p).toFixed(1)} × 입력 ${state.measurement==='stop'?0:state.config.strength} | 저장 속도 ${p.speed}\n현재 네이티브 ${selected?.id||'대기'} | ${clip||'-'} · 방향 ${selected?.frame.direction??'-'} · 샘플 ${sample} | 관찰한 이동 샘플 ${state.movementObserved.size}\n네이티브 관찰 ${state.observed.size}종 / 렌더 ${state.frames}회 · 실제 사격 ${state.shotCount}회 · 탄약 ${p.ammo}/${p.maxAmmo}\n위치 ${p.x.toFixed(3)}, ${p.y.toFixed(3)} · 접지 위상 ${canvas.dataset.productionGaitPhase||'-'} · 역재생 ${canvas.dataset.productionGaitReverse||'-'}\n정지 지문 ${pauseMatch?'동일':'진행 중'} · 렌더 RNG 보존 ${state.renderRngUnchanged} · 상태 ${reviewHash(reviewFingerprint(game))}`;
 }
 for(const id of controls)$(id).addEventListener('change',prepare);$('zoom').addEventListener('change',()=>{renderer.zoom=+$('zoom').value;});$('restart').addEventListener('click',prepare);$('one-second').addEventListener('click',()=>begin(1));$('two-seconds').addEventListener('click',()=>begin(2));$('stop-check').addEventListener('click',()=>begin(1,'stop'));$('pause').addEventListener('click',pause);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running&&!state.paused)pause();});
 new ResizeObserver(()=>renderer.resize()).observe(canvas.parentElement);
 let lastDiagnostic=0;
 function frame(now){
  if(state.ready){
   if(state.running&&!state.paused){state.wallElapsed=(now-state.startedAt)/1000;const due=dueReviewTicks(state.wallElapsed,state.doneTicks,state.totalTicks);
    for(let i=0;i<due;i++){const p=state.game.player,input=state.measurement==='stop'?reviewInput({...state.config,movement:'none',fire:'off'},p):reviewInput(state.config,p),before={x:p.x,y:p.y,ammo:p.ammo};state.game.tick(TICK,input);state.doneTicks++;state.distance+=Math.hypot(p.x-before.x,p.y-before.y);if(p.ammo<before.ammo)state.shotCount+=before.ammo-p.ammo;state.last={x:p.x,y:p.y};}
   }
   const beforeRng=JSON.stringify([state.game.random.getState(),state.game.visualRandom.getState()]);renderer.render(state.game,{},state.game.time);state.renderRngUnchanged&&=beforeRng===JSON.stringify([state.game.random.getState(),state.game.visualRandom.getState()]);
   if(state.running&&!state.paused&&state.doneTicks>=state.totalTicks)end();
   else if(now-lastDiagnostic>=50||!state.running||state.paused){lastDiagnostic=now;diagnostics();}
  }requestAnimationFrame(frame);
 }prepare();requestAnimationFrame(frame);
}
if(typeof document!=='undefined')boot();
