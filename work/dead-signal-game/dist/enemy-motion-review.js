import {Game} from './engine.js?v=0.29.0';
import {Renderer} from './renderer.js?v=0.29.0';
import {ProductionArt} from './production-art.js?v=0.29.0';
import {productionManifest} from './production-manifest.js?v=0.29.0';
import {BOSS_CATALOG,getBoss,getMission} from './campaign.js?v=0.29.0';
import {productionLaunchPlan,preloadLaunchPlan} from './launch-gate.js?v=0.29.0';

const TICK=1/60,TAU=Math.PI*2;
const names={walker:'보행자',runner:'질주자',shield:'방패병',screamer:'비명자',gas:'가스 운반자',elite:'정예',collector:'수집자'};
export const NPC_REVIEW_CHOICES=Object.freeze([...BOSS_CATALOG.map(b=>Object.freeze({id:b.id,name:`${String(getMission(b.missionId).index+1).padStart(2,'0')} · ${b.role==='mid'?'중간':'최종'} · ${b.name}`,kind:'boss',missionId:b.missionId,role:b.role})),...Object.entries(names).map(([type,name])=>Object.freeze({id:`enemy:${type}`,name:`일반 적 · ${name}`,kind:'enemy',type}))]);
export const npcReviewIds=mapping=>typeof mapping==='string'?[mapping]:Object.values(mapping||{});
export function dueNpcReviewTicks(elapsed,completed,total=60){return Math.max(0,Math.min(4,Math.min(total,Math.floor(Math.max(0,elapsed)*60+1e-7))-completed));}
export function npcReviewFingerprint(game){return JSON.stringify({time:game.time,state:game.state,player:game.player,enemies:game.enemies,corpses:game.corpses,bullets:game.bullets,particles:game.particles,hazards:game.bossHazards,projectiles:game.hostileProjectiles,world:game.world.obstacles.map(o=>({id:o.id,x:o.x,y:o.y,w:o.w,h:o.h,hp:o.hp,destroyed:o.destroyed})),random:game.random.getState(),visual:game.visualRandom.getState()});}
export function npcReviewHash(value){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return(h>>>0).toString(16).padStart(8,'0');}
export function npcAngleDifference(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}

function legalRoad(game,actor,angle){
 const travel=Math.max(100,actor.speed*2.1),dx=Math.cos(angle),dy=Math.sin(angle);
 for(let ring=0;ring<9;ring++)for(let index=0;index<(ring?32:1);index++){
  const a=index/32*TAU,x=1200+Math.cos(a)*ring*55,y=930+Math.sin(a)*ring*55;
  let clear=true;for(let d=0;d<=travel;d+=12)if(game.blocked(x+dx*d,y+dy*d,actor.r+2)){clear=false;break;}
  if(clear){actor.x=x;actor.y=y;return true;}
 }
 // A legitimate road point still allows a collision test if this district has
 // no sufficiently long straight corridor for a large final boss.
 for(let ring=0;ring<9;ring++)for(let index=0;index<32;index++){const a=index/32*TAU,x=1200+Math.cos(a)*ring*55,y=930+Math.sin(a)*ring*55;if(!game.blocked(x,y,actor.r+2)){actor.x=x;actor.y=y;return false;}}
 throw new Error('기존 맵에서 적의 충돌 반경을 수용할 도로를 찾지 못했습니다.');
}
export function placeNpcAtWall(game,actor,angle){
 const dx=Math.cos(angle),dy=Math.sin(angle),walls=game.world.obstacles.filter(o=>o.kind==='building'&&!o.destroyed).sort((a,b)=>Math.hypot(a.x+a.w/2-1200,a.y+a.h/2-930)-Math.hypot(b.x+b.w/2-1200,b.y+b.h/2-930));
 for(const wall of walls){let x=wall.x+wall.w/2,y=wall.y+wall.h/2;const r=actor.r+.01;if(Math.abs(dx)>=Math.abs(dy))x=dx>0?wall.x-r:wall.x+wall.w+r;else y=dy>0?wall.y-r:wall.y+wall.h+r;
  if(!game.blocked(x,y,actor.r)&&game.blocked(x+dx*2,y+dy*2,actor.r)){actor.x=x;actor.y=y;return true;}}
 return false;
}
export function createNpcReviewScene(id,{direction=12,collision='off'}={}){
 const choice=NPC_REVIEW_CHOICES.find(c=>c.id===id);if(!choice)throw new Error('invalid-review-actor');
 const game=new Game({seed:764208,weapon:'shotgun',...(choice.kind==='boss'?{missionId:choice.missionId}:{}),stageDuration:1e9});game.enemies=[];game.spawnClock=1e9;game.player.invul=9999;let actor;
 if(choice.kind==='boss'){actor=game.spawnMissionBoss('mid');if(choice.role==='final'){game.damageEnemy(actor,actor.hp);actor=game.spawnMissionBoss('final');game.corpses=[];game.pickups=[];game.particles=[];game.texts=[];}}
 else actor=game.spawnEnemy(choice.type,400);
 if(!actor)throw new Error('실제 엔진에서 선택한 적을 생성하지 못했습니다.');
 actor.angle=Number(direction)*Math.PI/8;actor.skillCd=3;const clearCorridor=legalRoad(game,actor,actor.angle);
 if(collision==='on'&&!placeNpcAtWall(game,actor,actor.angle))throw new Error('선택한 방향에서 기존 건물 벽을 찾지 못했습니다.');
 // The actual AI sees the real, invulnerable player. Place it ahead on a legal
 // point; the camera will follow the selected NPC without moving that target.
 const ahead={x:actor.x+Math.cos(actor.angle)*240,y:actor.y+Math.sin(actor.angle)*240};
 if(!game.blocked(ahead.x,ahead.y,game.player.r)){game.player.x=ahead.x;game.player.y=ahead.y;}else{game.player.x=1200;game.player.y=930;}
 game.player.angle=actor.angle+Math.PI;return {game,actor,choice,clearCorridor};
}
export function controlledNpcReviewTick(game,actor,{angle=actor.angle,strength=1,stop=false}={},dt=TICK){
 if(game.state!=='playing')return;game.time+=dt;game.stageTime+=dt;
 actor.angle=angle;actor.attackState='walk';actor.attackCd=0;actor.hitFlash=Math.max(0,actor.hitFlash-dt);actor.stun=Math.max(0,actor.stun-dt);
 if(!stop&&!actor.dead){const amount=Math.min(1,Math.max(0,Number(strength)||0))*actor.speed*dt;game.move(actor,Math.cos(angle)*amount,Math.sin(angle)*amount);}
}

function boot(){
 const $=id=>document.getElementById(id),canvas=$('stage'),art=new ProductionArt({manifest:productionManifest}),renderer=new Renderer(canvas,{productionArt:art});
 renderer.atmosphereEnabled=false;renderer.minimapEnabled=false;renderer.shakeEnabled=false;renderer.zoom=1.5;
 for(const [label,choices]of [['보스',NPC_REVIEW_CHOICES.filter(c=>c.kind==='boss')],['일반 적',NPC_REVIEW_CHOICES.filter(c=>c.kind==='enemy')]]){const group=document.createElement('optgroup');group.label=label;for(const choice of choices){const option=document.createElement('option');option.value=choice.id;option.textContent=choice.name;group.append(option);}$('actor').append(group);}
 for(let i=0;i<16;i++){const option=document.createElement('option');option.value=String(i);option.textContent=`방향 ${i} · ${i*22.5}°`;$('direction').append(option);}$('direction').value='12';
 const controls=['actor','mode','direction','strength','collision','target'],config=()=>Object.fromEntries(controls.map(id=>[id,$(id).value]));
 const state={game:null,actor:null,corpse:null,choice:null,config:null,ready:false,serial:0,running:false,paused:false,total:60,ticks:0,started:0,wall:0,renderClock:0,simulationStart:0,renderStart:0,measurement:'move',angle:0,distance:0,start:null,lastDraw:null,candidate:null,observed:new Set(),native:new Set(),locomotionSamples:new Set(),rendered:0,signature:'',renderRng:true,tickRng:true,startRng:'',phaseStart:'',phaseEnd:'',turnStart:0,turnMaxStep:0,turnPrevious:null,renderAngleStart:'',renderAngleEnd:'',clearCorridor:false};
 const rng=()=>JSON.stringify([state.game.random.getState(),state.game.visualRandom.getState()]);
 const freeze=()=>{state.signature=npcReviewFingerprint(state.game);};
 const nativeEnemy=renderer.nativeEnemyFrame.bind(renderer);renderer.nativeEnemyFrame=(actor,...args)=>{const selected=nativeEnemy(actor,...args);if(actor===state.actor)state.candidate=selected;return selected;};
 const nativeCorpse=renderer.nativeCorpseFrame.bind(renderer);renderer.nativeCorpseFrame=(corpse,...args)=>{const selected=nativeCorpse(corpse,...args);if(corpse===state.corpse)state.candidate=selected;return selected;};
 const draw=art.drawFrame.bind(art);art.drawFrame=(context,selected,options)=>{const painted=draw(context,selected,options);if(painted&&selected===state.candidate){state.lastDraw=selected;if(state.running&&!state.paused){state.observed.add(selected.frame.sample);state.native.add(`${selected.id}:${selected.frame.direction}:${selected.frame.sample}`);state.rendered++;if(selected.locomotion?.pose&&selected.locomotion.pose!=='idle'&&(!selected.metadata.animation?.clips||clip(selected)==='walk'))state.locomotionSamples.add(selected.frame.sample);}}
  return painted;};
 const makeFloor=renderer.makeFloor.bind(renderer);let marked=null,key='';renderer.makeFloor=game=>{makeFloor(game);if(marked===renderer.floor&&key===renderer.floorKey)return;marked=renderer.floor;key=renderer.floorKey;const c=marked.getContext('2d');c.save();c.strokeStyle='#d6cc9a';c.lineWidth=1;c.globalAlpha=.22;c.beginPath();for(let x=0;x<=game.world.width;x+=40){c.moveTo(x,0);c.lineTo(x,game.world.height);}for(let y=0;y<=game.world.height;y+=40){c.moveTo(0,y);c.lineTo(game.world.width,y);}c.stroke();c.restore();};
 const resize=renderer.resize.bind(renderer);renderer.resize=()=>{resize();renderer.zoom=Number($('zoom').value);};new ResizeObserver(()=>renderer.resize()).observe(canvas.parentElement);
 function buttons(){for(const id of['one-second','two-seconds','stop-check','turn-90','turn-180','damage','knockback','kill','skill'])$(id).disabled=!state.ready||state.running||!!state.actor?.dead;for(const id of [...controls,'previous','next','restart'])$(id).disabled=state.running;$('pause').disabled=!state.running;$('pause').textContent=state.paused?'계속 진행':'일시정지';}
 async function prepare(){const serial=++state.serial;state.running=false;state.paused=false;state.ready=false;canvas.dataset.qaReady='loading';$('load-state').className='status';$('load-state').textContent='선택한 적과 실제 배경 이미지 로딩 중';buttons();
  try{const options=config(),scene=createNpcReviewScene(options.actor,options),{game,actor,choice}=scene,plan=productionLaunchPlan({manifest:art.manifest,weapon:'shotgun',mission:game.missionId?getMission(game.missionId):null,world:game.world});
   const selectedMapping=choice.kind==='boss'?art.manifest.bosses[choice.id]:art.manifest.enemies[choice.type],ids=new Set([...plan.playerIds,...npcReviewIds(selectedMapping)]),environmentIds=new Set(Object.values(art.manifest.environment||{}));for(const id of plan.assetIds)if(environmentIds.has(id))ids.add(id);
   const filtered={...plan,assetIds:[...ids]};if(!await preloadLaunchPlan(renderer,filtered))throw new Error('실제 네이티브 이미지 로딩 또는 메타데이터 검증 실패');if(serial!==state.serial)return;art.releaseUnusedAssets(filtered.assetIds);
   Object.assign(state,{...scene,config:options,ready:true,ticks:0,total:60,wall:0,renderClock:0,simulationStart:0,renderStart:0,distance:0,start:{x:actor.x,y:actor.y},lastDraw:null,candidate:null,rendered:0,measurement:'move',angle:actor.angle,renderRng:true,tickRng:true,phaseStart:'',phaseEnd:'',turnMaxStep:0,turnPrevious:null,renderAngleStart:'',renderAngleEnd:''});state.observed.clear();state.native.clear();state.locomotionSamples.clear();game.pause();freeze();renderer.cameraReady=false;renderer.lastNow=null;canvas.dataset.qaReady='ready';$('load-state').textContent='실제 네이티브 렌더 준비 완료';$('scene-label').textContent=`${choice.name} · 40단위 격자 · ${options.mode==='walk'?'실제 충돌 통제 이동':'실전 AI'}`;buttons();diagnostics();
  }catch(error){if(serial!==state.serial)return;canvas.dataset.qaReady='failed';$('load-state').className='status error';$('load-state').textContent=error.message;$('diagnostics').textContent=error.stack||error.message;buttons();}
 }
 function begin(seconds=1,measurement='move',turn=0){if(!state.ready||state.running||state.actor.dead&&measurement!=='death')return;
  if(measurement==='stop')$('mode').value='walk';state.config=config();state.running=true;state.paused=false;state.measurement=measurement;state.total=Math.round(seconds*60);state.ticks=0;state.started=performance.now();state.wall=0;state.distance=0;state.simulationStart=state.game.time;state.renderStart=state.renderClock;state.start={x:state.actor.x,y:state.actor.y};state.observed.clear();state.native.clear();state.locomotionSamples.clear();state.rendered=0;state.renderRng=true;state.tickRng=true;state.startRng=rng();state.phaseStart=String(state.lastDraw?.locomotion?.phase??'');state.phaseEnd=state.phaseStart;state.turnStart=state.actor.angle;state.angle+=turn;state.turnMaxStep=0;state.turnPrevious=state.lastDraw?.locomotion?.angle??state.lastDraw?.frame.angle??null;state.renderAngleStart=String(state.turnPrevious??'');state.renderAngleEnd=state.renderAngleStart;
  if(turn&&state.config.mode==='combat')for(const distance of[240,180,120,300]){const x=state.actor.x+Math.cos(state.angle)*distance,y=state.actor.y+Math.sin(state.angle)*distance;if(!state.game.blocked(x,y,state.game.player.r)){state.game.player.x=x;state.game.player.y=y;break;}}
  $('scene-label').textContent=`${state.choice.name} · 40단위 격자 · ${state.config.mode==='walk'?'실제 충돌 통제 이동':'실전 AI'}`;state.game.resume();state.signature='';buttons();diagnostics();}
 function end(){state.running=false;state.paused=false;state.game.pause();state.wall=(performance.now()-state.started)/1000;state.phaseEnd=String(state.lastDraw?.locomotion?.phase??'');freeze();buttons();diagnostics();}
 function pause(){if(!state.running)return;if(!state.paused){state.paused=true;state.wall=(performance.now()-state.started)/1000;state.game.pause();freeze();}else{state.started=performance.now()-state.wall*1000;state.paused=false;state.game.resume();state.signature='';}buttons();diagnostics();}
 function actualAction(action){if(!state.ready||state.running||state.actor.dead)return;const g=state.game,a=state.actor;g.resume();if(action==='damage'||action==='knockback')g.damageEnemy(a,Math.max(1,a.maxHp*.05),action==='knockback'?{x:-Math.cos(a.angle)*95,y:-Math.sin(a.angle)*95}:null);if(action==='kill'){g.damageEnemy(a,a.hp);state.corpse=g.corpses.find(c=>c.seed===a.id)||null;}if(action==='skill')a.skillCd=0;g.pause();$('mode').value='combat';
  // A killed actor still gets a bounded actual engine run to animate its corpse.
  if(action==='kill')begin(2,'death');else begin(action==='skill'?2:1,action);
 }
 function clip(selected){const spans=selected?.metadata?.animation?.clips,sample=selected?.frame.sample;return spans?Object.entries(spans).find(([,v])=>sample>=v.start&&sample<v.start+v.count)?.[0]||'':selected?.metadata?.animation?.name||'';}
 function diagnostics(){if(!state.game||!state.ready)return;const g=state.game,a=state.actor,s=state.lastDraw,l=s?.locomotion,m=s?.metadata,t=state.ticks*TICK,pauseMatch=(!state.running||state.paused)&&state.signature===npcReviewFingerprint(g),distance=Math.hypot(a.x-state.start.x,a.y-state.start.y),actualAngle=l?.angle??s?.frame.angle??null;
  Object.assign(canvas.dataset,{qaReady:'ready',qaActor:state.choice.id,qaMode:state.config.mode,qaRunning:String(state.running),qaPaused:String(!state.running||state.paused),qaMeasurement:state.measurement,qaTicks:String(state.ticks),qaTargetTicks:String(state.total),qaSimulationSeconds:t.toFixed(6),qaActualSimulationSeconds:(g.time-state.simulationStart).toFixed(6),qaTerminalVisualSeconds:(state.renderClock-state.renderStart).toFixed(6),qaTerminalState:String(['victory','dead'].includes(g.state)),qaWallSeconds:state.wall.toFixed(4),qaGameTime:g.time.toFixed(6),qaGameState:g.state,qaX:a.x.toFixed(6),qaY:a.y.toFixed(6),qaDistance:state.distance.toFixed(6),qaDisplacement:distance.toFixed(6),qaMeasuredSpeed:(t?state.distance/t:0).toFixed(6),qaStoredSpeed:String(a.speed),qaExpectedDistance:String(state.config.mode==='walk'&&state.measurement==='move'?a.speed*Number(state.config.strength)*t:''),qaStrength:state.config.strength,qaCollision:state.config.collision,qaClearCorridor:String(state.clearCorridor),qaTarget:state.config.target,qaAsset:s?.id||'',qaClip:clip(s),qaFrame:String(s?.frame.index??-1),qaSample:String(s?.frame.sample??-1),qaDirection:String(s?.frame.direction??-1),qaSamples:String(m?.atlas.framesPerDirection??m?.atlas.samples??m?.animation?.samples??(m?.frames.length&&m?.atlas?.directions?m.frames.length/m.atlas.directions:0)),qaFrames:String(m?.frames.length||0),qaSource:m?.source?.file||'',qaPacking:m?.atlas.packing||'',qaNativePainted:String(!!s),qaObservedSamples:JSON.stringify([...state.observed].sort((a,b)=>a-b)),qaObservedLocomotionSamples:JSON.stringify([...state.locomotionSamples].sort((a,b)=>a-b)),qaUniqueNativeFrames:String(state.native.size),qaRenderedFrames:String(state.rendered),qaGait:l?.pose||'',qaGaitPhase:String(l?.phase??''),qaGaitSpeed:String(l?.speed??''),qaGaitCycleDistance:String(l?.cycleDistance??''),qaGaitTurning:String(l?.turning??''),qaGaitKnocked:String(l?.knocked??''),qaGaitActionFacing:String(l?.actionFacing??''),qaRenderedAngle:String(actualAngle??''),qaSimulationAngle:String(a.angle),qaPhaseStart:state.phaseStart,qaPhaseEnd:state.phaseEnd,qaTurnStart:String(state.turnStart),qaTurnMaxRenderedStep:String(state.turnMaxStep),qaTurnRenderedStart:state.renderAngleStart,qaTurnRenderedEnd:state.renderAngleEnd,qaRngRenderUnchanged:String(state.renderRng),qaRngControlledTickUnchanged:String(state.config.mode==='walk'?state.tickRng:'not-applicable-actual-ai'),qaRandomState:JSON.stringify(g.random.getState()),qaVisualRandomState:JSON.stringify(g.visualRandom.getState()),qaPauseUnchanged:String(pauseMatch),qaSignature:npcReviewHash(npcReviewFingerprint(g)),qaAttackState:a.attackState,qaZoom:String(renderer.zoom)});
  $('pause-result').textContent=state.running&&!state.paused?'실제 엔진 진행 중':pauseMatch?'정지 검사: 위치·전투 상태·양쪽 RNG 지문이 그대로입니다.':'정지 상태 확인 중';
  $('diagnostics').textContent=`${state.choice.name} | ${state.config.mode==='walk'?'실제 Game.move · AI 격리':'실제 Game.tick · AI·스킬'} | ${state.measurement} · ${state.running?(state.paused?'일시정지':'진행'):'정지'}\n${state.ticks}/${state.total} 틱 · 요청 ${t.toFixed(3)}초 · 엔진 진행 ${(g.time-state.simulationStart).toFixed(3)}초 / 화면 ${state.wall.toFixed(3)}초 | 이동 거리 ${state.distance.toFixed(3)} · 변위 ${distance.toFixed(3)}\n실측 초당 ${t?(state.distance/t).toFixed(3):'0.000'} · 저장 속도 ${a.speed.toFixed(3)} · 통제 입력 ${state.config.strength}\n네이티브 ${s?.id||'대기'} | ${clip(s)||'-'} · 방향 ${s?.frame.direction??'-'} · 샘플 ${s?.frame.sample??'-'} / 전체 ${m?.frames.length||0} 프레임\n직접 관찰 ${state.native.size}종 · 샘플 ${state.observed.size}개 · 이동 샘플 ${state.locomotionSamples.size}개 / 렌더 ${state.rendered}회\n접지 ${l?.pose||'-'} · 위상 ${l?.phase?.toFixed?.(4)||'-'} · 측정 속도 ${l?.speed?.toFixed?.(3)||'-'} · 보폭 ${l?.cycleDistance?.toFixed?.(3)||'-'}\n게임 각도 ${a.angle.toFixed(4)} · 이미지 각도 ${actualAngle?.toFixed?.(4)||'-'} · 최대 화면 회전 차이 ${state.turnMaxStep.toFixed(4)}rad\n공격 ${a.attackState} · ${m?.atlas.packing||'-'} · 정지 지문 ${pauseMatch?'동일':'진행 중'} · 렌더 RNG 보존 ${state.renderRng} · 확대 ${renderer.zoom*100}%\n원본 ${m?.source?.file||'-'} | 저장 데이터 접근 없음 · ${npcReviewHash(npcReviewFingerprint(g))}`;
 }
 for(const id of controls)$(id).addEventListener('change',prepare);$('zoom').addEventListener('change',()=>{renderer.zoom=Number($('zoom').value);diagnostics();});$('restart').addEventListener('click',prepare);$('one-second').addEventListener('click',()=>begin(1));$('two-seconds').addEventListener('click',()=>begin(2));$('stop-check').addEventListener('click',()=>begin(1,'stop'));$('pause').addEventListener('click',pause);$('turn-90').addEventListener('click',()=>begin(1,'turn',Math.PI/2));$('turn-180').addEventListener('click',()=>begin(1,'turn',Math.PI));for(const id of['damage','knockback','kill','skill'])$(id).addEventListener('click',()=>actualAction(id));
 for(const [id,delta]of [['previous',-1],['next',1]])$(id).addEventListener('click',()=>{const i=NPC_REVIEW_CHOICES.findIndex(c=>c.id===$('actor').value);$('actor').value=NPC_REVIEW_CHOICES[(i+delta+NPC_REVIEW_CHOICES.length)%NPC_REVIEW_CHOICES.length].id;prepare();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running&&!state.paused)pause();});
 let lastDiagnostic=0;
 function frame(now){if(state.ready){
   if(state.running&&!state.paused){state.wall=(now-state.started)/1000;const due=dueNpcReviewTicks(state.wall,state.ticks,state.total);for(let i=0;i<due;i++){const a=state.actor,g=state.game,before={x:a.x,y:a.y},beforeRng=rng();
     if(state.config.mode==='walk'&&['move','turn','stop'].includes(state.measurement))controlledNpcReviewTick(g,a,{angle:state.angle,strength:state.config.strength,stop:state.measurement==='stop'});
     else{const moving=state.config.target==='moving',angle=state.angle+Math.PI/2;g.tick(TICK,{moveX:moving?Math.cos(angle)*.5:0,moveY:moving?Math.sin(angle)*.5:0,aimX:a.x,aimY:a.y});}
     state.tickRng&&=beforeRng===rng();state.ticks++;state.renderClock+=TICK;state.distance+=Math.hypot(a.x-before.x,a.y-before.y);
   }}
   // Center the selected NPC using render-only camera state. No actor, target,
   // simulation direction, save field, or RNG is changed for camera framing.
   renderer.camera={x:state.actor.x,y:state.actor.y};renderer.cameraReady=true;renderer.lastNow=state.renderClock;state.candidate=null;state.lastDraw=null;const beforeRng=rng();renderer.render(state.game,{},state.renderClock);state.renderRng&&=beforeRng===rng();
   const angle=state.lastDraw?.locomotion?.angle??state.lastDraw?.frame.angle;if(state.running&&!state.paused&&Number.isFinite(angle)){if(Number.isFinite(state.turnPrevious))state.turnMaxStep=Math.max(state.turnMaxStep,Math.abs(npcAngleDifference(angle,state.turnPrevious)));state.turnPrevious=angle;state.renderAngleEnd=String(angle);}
   if(state.running&&!state.paused&&state.ticks>=state.total)end();else if(now-lastDiagnostic>=50||!state.running||state.paused){lastDiagnostic=now;diagnostics();}
  }requestAnimationFrame(frame);}
 prepare();requestAnimationFrame(frame);
}
if(typeof document!=='undefined')boot();
