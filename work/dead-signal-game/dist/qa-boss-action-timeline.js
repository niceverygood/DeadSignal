// Opt-in owned QA only. This observes original native sampling; it never ticks
// gameplay, changes clips, or asserts a new natural-motion threshold.
const SIZE=512,LIMIT=192,ANGLE=.35,own=Object.getOwnPropertyDescriptor;
const need=(value,message)=>{if(!value)throw Error('boss-action-timeline-'+message);};
const finite=Number.isFinite;
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function snapshot(value){return freeze(JSON.parse(JSON.stringify(value)));}
function sameDescriptor(a,b){return !a&&!b||!!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&Object.is(a[key],b[key]));}
function times(duration,hz,extra){const result=[];for(let i=0;i<=Math.round(duration*hz);i++)result.push(Math.min(duration,i/hz));result.push(duration,...extra);return [...new Set(result)].sort((a,b)=>a-b);}

export function createBossActionTimelinePlan(boss,{hz=60}={}){
 need(boss?.id==='boss-02-final'&&boss.skill?.kind==='slam','boss02-final-required');
 const windup=boss.skill.windup,recovery=boss.skill.recovery;
 need(finite(windup)&&windup>0&&finite(recovery)&&recovery>0,'finite-durations-required');
 need(Number.isInteger(hz)&&hz>0&&hz<=240,'finite-hz-required');
 const samples=[],start=10;
 const add=(branch,pose,time,elapsedMs,progress,extra={})=>samples.push({index:samples.length,cellIndex:samples.length,branch,label:branch+' '+pose+' '+elapsedMs.toFixed(3)+'ms',time,elapsedMs,pose,progress,attackState:pose==='recover'?'recover':'windup',attackTime:pose==='recover'?recovery*(1-progress):windup*(1-progress),expectedClip:pose==='recover'?'attack':pose==='death'?'death':'windup',hitFlash:0,deathAge:null,primer:false,...extra});
 for(const elapsed of times(windup,hz,[.70,.72,.74,.99,1].map(p=>windup*p)))add('main','windup',start+elapsed,elapsed*1000,elapsed/windup);
 for(const elapsed of times(recovery,hz,[0,.0125,.025,.05,.075,.1]))add('main','recover',start+windup+elapsed,(windup+elapsed)*1000,elapsed/recovery);
 const hitStart=start+windup+recovery+1;
 for(const [elapsed,hitFlash,primer]of [[0,0,true],[.012,.12,false],[.024,.108,false],[.072,.06,false],[.132,0,false]])add('hit','windup',hitStart+elapsed,elapsed*1000,.70+elapsed/windup,{hitFlash,primer});
 const deathStart=hitStart+.132+1;
 add('death','windup',deathStart,0,.74,{primer:true});
 for(const age of [0,.025,.05,.075,.1])add('death','death',deathStart+age,age*1000,null,{attackState:'walk',attackTime:0,expectedClip:'death',deathAge:age});
 need(samples.length<=LIMIT,'paired-frame-limit-exceeded');
 need(samples.every((sample,index)=>finite(sample.time)&&(!index||sample.time>=samples[index-1].time)),'nondecreasing-clock-required');
 const rows=Math.ceil(samples.length/8),atlasWidth=4096,atlasHeight=rows*256;
 need(rows<=24&&atlasWidth*atlasHeight*4<=96*1024*1024,'atlas-byte-limit-exceeded');
 return freeze({bossKey:boss.id,angle:ANGLE,hz,windupSeconds:windup,recoverySeconds:recovery,pairedFrameLimit:LIMIT,columns:8,cellWidth:512,cellHeight:256,rows,atlasWidth,atlasHeight,atlasRGBABytes:atlasWidth*atlasHeight*4,samples});
}

export async function observeBossActionTimeline({rig,art,adapter,boss,document,check,wait,yieldUI,registerSurface,onImage=()=>{},onPreview=()=>{},Renderer,helpers}){
 const plan=createBossActionTimelinePlan(boss),model=rig.models.get(boss.id);
 need(model&&rig.size===SIZE,'loaded-original512-required');
 need([check,wait,yieldUI,registerSurface,onImage,onPreview].every(value=>typeof value==='function'),'callbacks-required');
 const {originalModelSnapshot,verifyOriginalModel,handPoints,projectedHands,protectedPoints,protectedPositions,localBonePose,actorFixture,layerEvidence,byteDifference,sameNumbers,primitive}=helpers;
 const originalFlag=own(rig,'bossActionLayerEnabled');need(originalFlag&&Object.hasOwn(originalFlag,'value'),'own-flag-required');
 let expectedFlag=originalFlag,failed=false,primary,atlas=null,contact=null;
 const report={complete:false,bossKey:boss.id,plan,frames:[],protectedExact:true,sourceBeforeAfter:null,flagRestored:false,cleanupErrors:[],preview:{pairedFrames:plan.samples.length,columns:8,rows:plan.rows,width:plan.atlasWidth,height:plan.atlasHeight,cellWidth:512,cellHeight:256,rawRGBAEstimate:plan.atlasRGBABytes},contact:{pairs:3,nativeCells:6,width:1024,height:1536},note:'Controlled same-actor/epoch native512 QA timeline, not Game simulation, actual fights, FPS, peak memory, or a natural-motion certification. A/B ids differ; each arm keeps its own stable actor and the same epoch. Recovery is the original saved recover countdown, not an invented active charge. Hit samples use the original upper-body hit layer. Death uses a new corpse with seed equal to its live actor id and the existing pose history. Death A/B pixels may differ while a previous upper-body pose bridges. Atlas halves are downscaled256 previews only; contact cells retain original512. No PNG or raw RGBA is retained in this report.'};
 const before=originalModelSnapshot(model),hands=handPoints(model),protectedBones=protectedPoints(model),epoch={},game={world:epoch,state:'playing',time:10},actors={};
 need(protectedBones.length>=3,'protected-root-feet-required');
 for(const [branch,offset]of [['main',0],['hit',10],['death',20]])actors[branch]=[actorFixture(boss,910000+offset,ANGLE),actorFixture(boss,910001+offset,ANGLE)];
 const corpses=[null,null],previous=[null,null],contactIndices=[plan.samples.findIndex(s=>s.branch==='main'&&s.pose==='windup'&&Math.abs(s.progress-.72)<1e-12),plan.samples.findIndex(s=>s.branch==='main'&&s.pose==='windup'&&s.progress===1),plan.samples.findIndex(s=>s.branch==='main'&&s.pose==='recover'&&Math.abs(s.elapsedMs-(plan.windupSeconds*1000+75))<1e-9)];
 const flag=value=>{need(sameDescriptor(own(rig,'bossActionLayerEnabled'),expectedFlag),'flag-owner-changed');rig.bossActionLayerEnabled=value;expectedFlag=own(rig,'bossActionLayerEnabled');};
 const current=()=>{check();need(rig.models.get(boss.id)===model&&sameDescriptor(own(rig,'bossActionLayerEnabled'),expectedFlag),'model-or-flag-changed');};
 function maxStep(a,b){if(!a)return 0;need(a.length===b.length,'bone-count-changed');let max=0;for(let i=0;i<b.length;i++)max=Math.max(max,Math.abs(b[i]-a[i]));return max;}
 try{
  current();need(contactIndices.every(index=>index>=0),'contact-samples-required');
  atlas=document.createElement('canvas');registerSurface(atlas);atlas.width=plan.atlasWidth;atlas.height=plan.atlasHeight;
  contact=document.createElement('canvas');registerSurface(contact);contact.width=1024;contact.height=1536;
  const ac=atlas.getContext('2d',{alpha:true}),cc=contact.getContext('2d',{alpha:true});need(ac&&cc,'canvas-context-required');
  ac.imageSmoothingEnabled=true;ac.imageSmoothingQuality='high';
  for(const sample of plan.samples){
   current();const pair=[];game.time=sample.time;
   for(let arm=0;arm<2;arm++){
    flag(arm===1);const alive=actors[sample.branch][arm];let actor=alive;
    Object.assign(alive,{attackState:sample.attackState,attackTime:sample.attackTime,hitFlash:sample.hitFlash,dead:false,hp:boss.stats.hp});
    const framesBefore=rig.renderer.info.render.frame;let selected;
    if(sample.deathAge!==null){
     if(!corpses[arm])corpses[arm]={...alive,id:undefined,seed:alive.id,dead:true,hp:0,duration:12,time:12};
     actor=corpses[arm];actor.time=12-sample.deathAge;
     selected=Renderer.prototype.nativeCorpseFrame.call(adapter,actor,game,sample.time);
    }else selected=Renderer.prototype.nativeEnemyFrame.call(adapter,actor,sample.time,game,boss);
    current();need(selected?.image?.width===SIZE&&selected.image.height===SIZE&&selected.metadata?.liveRig&&rig.frames.get(actor)?.selected===selected,'actual-private512-required');
    registerSurface(selected.image);
    const d=rig.diagnostics,draws=rig.renderer.info.render.frame-framesBefore;
    need(draws>0&&d?.key===boss.id&&d.clip===sample.expectedClip&&d.continuousSampling,'actual-native-clip-required');
    need(sample.deathAge!==0||d.deathBridgeWeight===1,'death-history-bridge-required');
    const layer=layerEvidence(d,arm===1,d.clip,boss.skill.kind),bounds=selected.frame.alphaBounds;
    need(bounds&&[bounds.x,bounds.y,bounds.width,bounds.height].every(finite)&&bounds.x>=0&&bounds.y>=0&&bounds.width>0&&bounds.height>0&&bounds.x+bounds.width<=SIZE&&bounds.y+bounds.height<=SIZE&&selected.metadata.boundsKind==='alpha'&&d.clipped!==true,'unclipped-alpha-required');
    const rgba=selected.image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,SIZE,SIZE).data;
    need(rgba.length===SIZE*SIZE*4,'rgba-required');
    const bones=localBonePose(model),feet=protectedPositions(protectedBones),points=projectedHands(hands,rig.camera),prior=previous[arm];
    const record={clip:d.clip,attackState:actor.attackState,attackTime:actor.attackTime,hitFlash:actor.hitFlash??0,dead:actor.dead===true,nativeGLSubmissions:draws,layer,diagnostic:primitive(d),alphaBounds:{...bounds},hands:points,boneStepMaxComponent:prior?.branch===sample.branch?maxStep(prior.bones,bones):0,handStepMaxPixels:prior?.branch===sample.branch?Math.max(0,...points.map((p,i)=>Math.hypot(p.x-prior.hands[i].x,p.y-prior.hands[i].y))):0,deathBridgeWeight:finite(d.deathBridgeWeight)?d.deathBridgeWeight:0};
    previous[arm]={branch:sample.branch,bones,hands:points};pair.push({record,feet,rgba});
    const x=sample.index%8*512+arm*256,y=Math.floor(sample.index/8)*256;ac.drawImage(selected.image,0,0,SIZE,SIZE,x,y,256,256);
    const row=contactIndices.indexOf(sample.index);if(row>=0)cc.drawImage(selected.image,0,0,SIZE,SIZE,arm*SIZE,row*SIZE,SIZE,SIZE);
   }
   need(sameNumbers(pair[0].feet,pair[1].feet),'root-feet-world-position-changed');
   report.frames.push({...sample,original:pair[0].record,candidate:pair[1].record,feetAndHipsExact:true,rgbaDifference:byteDifference(pair[0].rgba,pair[1].rgba)});
   if(sample.index%4===3)await yieldUI();
  }
  current();report.sourceBeforeAfter=verifyOriginalModel(before);
  await wait(onImage({key:boss.id,src:contact.toDataURL('image/png'),alt:'보스02 원본·상체 후보: 예고 정점·경계·전환75ms 원본512 비교',width:1024,height:1536}));current();
  await wait(onPreview({key:boss.id,src:atlas.toDataURL('image/png'),width:plan.atlasWidth,height:plan.atlasHeight,cellWidth:512,cellHeight:256,columns:8,rows:plan.rows,frames:plan.samples}));current();
  report.complete=true;
 }catch(error){failed=true;primary=error;}
 finally{
  try{if(sameDescriptor(own(rig,'bossActionLayerEnabled'),expectedFlag)){Object.defineProperty(rig,'bossActionLayerEnabled',originalFlag);report.flagRestored=true;}else throw Error('boss-action-timeline-flag-owner-changed');}catch(error){report.cleanupErrors.push('flag-restore-failed');if(!failed){failed=true;primary=error;}}
  try{report.sourceBeforeAfter=verifyOriginalModel(before);}catch(error){report.sourceBeforeAfter={unchanged:false};report.cleanupErrors.push('source-check-failed');if(!failed){failed=true;primary=error;}}
 }
 report.complete=report.complete&&!failed&&report.flagRestored&&report.cleanupErrors.length===0;
 const result=snapshot(report);
 if(failed){try{Object.defineProperty(primary,'bossActionTimeline',{value:result,configurable:true});}catch{}throw primary;}
 return result;
}
