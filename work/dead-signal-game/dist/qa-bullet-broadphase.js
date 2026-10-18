import {Game} from './engine.js?v=0.29.0';
export const newBulletStats=()=>({rectCandidates:0,rectRejected:0,rectTests:0,circleCandidates:0,circleRejected:0,circleTests:0});
const percentile=(values,p)=>values.sort((a,b)=>a-b)[Math.floor(values.length*p)]??0;
const combatState=game=>JSON.stringify({snapshot:game.snapshot(),particles:game.particles,texts:game.texts,links:game.links,shake:game.shake,flash:game.flash,random:game.random.getState(),visualRandom:game.visualRandom.getState()});
export async function compareBulletBroadphase(renderer,canvas,{count=60,weapon='shotgun',mode='rect',legacyBulletComparison=true,onPass=()=>{},onProgress=()=>{},onImage=()=>{},onFrameStart=()=>{},onFrameEnd=()=>{},framePacing='batch8',frames=110,radius=210,radiusSpread=32,input={moveX:.3,moveY:.2,shoot:true,fireMode:'manual',aimX:1400,aimY:930}}={}){
 if(!['batch8','raf'].includes(framePacing))throw Error('dense-frame-pacing-invalid');
 const original=new Game({seed:774,missionId:'mission-01',weapon});original.enemies=[];original.spawnClock=1e9;
 // Explicit density fixture; every actor retains normal HP/speed/AI and spawns
 // through the engine API, at a legal point outside its150-unit spawn guard.
 for(let i=0;i<count;i++){
  let at=null;for(let n=0;n<32&&!at;n++){const a=(i/count+n/32)*Math.PI*2,r=radius+(i%5)*radiusSpread;if(!original.blocked(original.player.x+Math.cos(a)*r,original.player.y+Math.sin(a)*r,16))at={x:original.player.x+Math.cos(a)*r,y:original.player.y+Math.sin(a)*r};}
  if(!at||!original.spawnEnemy('walker',radius,at))throw Error('dense-spawn-not-ready-'+i);
 }
 const snapshot=original.snapshot();if(!snapshot||snapshot.enemies.length!==count)throw Error('dense-valid-checkpoint-required');
 const passes=[],states=[],eventStreams=[],pixelFrames=[],read=document.createElement('canvas');read.width=canvas.width;read.height=canvas.height;const rc=read.getContext('2d',{willReadFrequently:true});
 let finalGame;
 for(const force of [true,false,true]){
  const game=Game.restore(snapshot,{resumePlaying:true});if(!game)throw Error('dense-checkpoint-restore');game.forceBulletNarrowPhase=legacyBulletComparison?force:false;game.bulletBoundsMode=mode;game.bulletCollisionStats=newBulletStats();renderer.cameraReady=false;if(framePacing==='raf')renderer.lastNow=null;await onPass(force,game);
  const samples=[],events=[],update=game.updateBullets,passStart=performance.now();let bulletMs=0,previousRaf=null,previousFrameStart=null;
  game.updateBullets=function(...args){const start=performance.now();try{return update.apply(this,args);}finally{bulletMs=performance.now()-start;}};
  try{onProgress(force,count,weapon);for(let i=0;i<frames;i++){
   if(framePacing==='raf'&&document.hidden)throw Error('dense-raf-tab-hidden');
   let rafTimestamp=null,rafIntervalMs=null,rafWaitMs=null;
   if(framePacing==='raf'){const waiting=performance.now();rafTimestamp=await new Promise(requestAnimationFrame);rafWaitMs=performance.now()-waiting;if(document.hidden)throw Error('dense-raf-tab-hidden');if(previousRaf!==null)rafIntervalMs=rafTimestamp-previousRaf;previousRaf=rafTimestamp;}
   if(game.state==='upgrade')game.chooseUpgrade(game.choices[0].id);if(game.state!=='playing')throw Error('dense-normal-combat-ended-'+i);
   const callbackStart=performance.now(),frameStartIntervalMs=previousFrameStart===null?null:callbackStart-previousFrameStart;previousFrameStart=callbackStart;
   const meta={frame:i,force,warmup:i<10,framePacing,rafTimestamp,rafIntervalMs,rafWaitMs,frameStartIntervalMs,hidden:document.hidden===true};
   const stats=game.bulletCollisionStats,before={...stats},start=performance.now();let nativeProfile;
   let tickMs,eventMs,renderMs,combinedMs;
   try{onFrameStart(meta,game);const tickStart=performance.now();game.tick(1/60,input);tickMs=performance.now()-tickStart;const eventStart=performance.now();events.push(...game.drainEvents());eventMs=performance.now()-eventStart;const drawStart=performance.now();renderer.render(game,{},game.time);renderMs=performance.now()-drawStart;combinedMs=performance.now()-start;}
   finally{nativeProfile=onFrameEnd({...meta,callbackCpuMs:performance.now()-callbackStart},game);}
   if(i>=10)samples.push({...meta,tickMs,eventMs,bulletMs,renderMs,combinedMs,nativeProfile,stats:Object.fromEntries(Object.keys(stats).map(key=>[key,stats[key]-before[key]]))});
   if(framePacing==='batch8'&&i%8===0)await new Promise(requestAnimationFrame);
  }}finally{delete game.updateBullets;}
  const passWorkEnd=performance.now();
  rc.clearRect(0,0,read.width,read.height);rc.drawImage(canvas,0,0);pixelFrames.push(rc.getImageData(0,0,read.width,read.height).data);onImage(force,canvas.toDataURL());
  const totals=Object.fromEntries(Object.keys(newBulletStats()).map(key=>[key,samples.reduce((n,s)=>n+s.stats[key],0)]));
  const summary=Object.fromEntries(['tickMs','eventMs','bulletMs','renderMs','combinedMs',...(framePacing==='raf'?['rafIntervalMs','rafWaitMs','frameStartIntervalMs']:[])].map(key=>[key,{median:percentile(samples.map(s=>s[key]).filter(Number.isFinite),.5),p95:percentile(samples.map(s=>s[key]).filter(Number.isFinite),.95),max:Math.max(0,...samples.map(s=>s[key]).filter(Number.isFinite))}]));
  const saved=game.snapshot();if(!saved)throw Error('dense-final-checkpoint-invalid');
  passes.push({force,frames:samples.length,renderedFrames:frames,fixedTicks:frames,simulationSeconds:game.time-snapshot.time,wallSeconds:(passWorkEnd-passStart)/1000,framePacing,renderTimeSource:'game.time',cameraLastNowReset:framePacing==='raf',canvas:{width:canvas.width,height:canvas.height,dpr:renderer.dpr},initialEnemies:count,finalEnemies:game.enemies.length,kills:game.kills,hp:game.player.hp,summary,totals,samples});states.push(combatState(game));eventStreams.push(JSON.stringify(events));finalGame=game;
 }
 const pixels=pixelFrames.slice(1).map((data,i)=>{let different=0,maxDelta=0;for(let n=0;n<data.length;n++){const d=Math.abs(data[n]-pixelFrames[0][n]);if(d)different++;maxDelta=Math.max(maxDelta,d);}return {force:passes[i+1].force,different,maxDelta};});
 finalGame.forceBulletNarrowPhase=false;finalGame.bulletBoundsMode='rect';finalGame.bulletCollisionStats=null;
 return {game:finalGame,report:{count,weapon,mode,legacyBulletComparison,framePacing,passes,pixels,identicalCombatState:states.every(s=>s===states[0]),identicalEvents:eventStreams.every(s=>s===eventStreams[0]),note:'Actual Game.tick, normal bullets/HP/AI/offered upgrades, explicit dense spawn isolation. Legacy bullet baseline is used only when legacyBulletComparison=true; otherwise both passes retain default bullet rules and onPass controls the renderer experiment. One fixed1/60 tick per render; raf mode waits before every render, batch8 keeps historical eight-render yields. This is a paced fixed-workload comparison: no product-loop catch-up, interpolation, HUD, audio or persistence. Render time is game.time for deterministic camera/shake. Call wall times include instrumentation; combined includes event draining and render. rAF callback intervals include browser scheduling and are not presented FPS or actual GPU execution. QA data stays in memory.'}};
}
