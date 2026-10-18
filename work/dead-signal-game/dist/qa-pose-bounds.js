export async function comparePoseBounds(renderer,{onImage=()=>{}}={}){
 const rig=renderer.liveEnemies,art=renderer.productionArt,prior={fast:rig.gpuPoseBounds,verify:rig.verifyPoseBounds},reports=[];
 const read=document.createElement('canvas');read.width=read.height=256;const context=read.getContext('2d',{willReadFrequently:true});
 const pixels=image=>{context.clearRect(0,0,256,256);context.drawImage(image,0,0);return context.getImageData(0,0,256,256).data;};
 try{for(const type of ['walker','runner','shield','screamer','gas','elite','collector']){
  const key='enemy-'+type;rig.releaseUnused([key]);if(!await rig.load(key))throw Error(rig.error||'native-model-not-ready');
  const mapping=art.manifest.enemies[type];await Promise.all((typeof mapping==='string'?[mapping]:Object.values(mapping)).map(id=>art.load(id,{retry:true})));
  const jobs=['idle','walk','walk','walk','windup','attack','hit','death'].map((pose,i)=>{
   const actor={id:900+i,type,x:1200,y:930,hp:pose==='death'?0:500,dead:pose==='death',angle:i*.73,attackState:pose==='windup'?'windup':pose==='attack'?'charge':'walk',attackTime:.4,hitFlash:['windup','attack','hit'].includes(pose)?.09:0};
   const options={pose,animationTime:pose==='death'?.45:.1,height:42,actionDurations:{windup:.9,charge:.75}};
   const selected=art.enemyFrame(type,actor,{pose,simulationTime:1.2,animationTime:options.animationTime});if(!selected)throw Error('native-art-not-ready');
   return {actor,fallback:{...selected,locomotion:{pose:pose==='hit'?'walk':pose,phase:2.4,angle:actor.angle,...(pose==='walk'?{moveWeight:[.3,.7,1][i-1]}:{})}},options};
  });
  rig.gpuPoseBounds=false;rig.verifyPoseBounds=false;rig.beginBatch(jobs.length);for(const job of jobs)rig.frame(key,job.actor,1.2,job.fallback,job.options);rig.endBatch();
  for(const job of jobs){const f=rig.frame(key,job.actor,1.2,job.fallback,job.options);job.reference=pixels(f.image);job.placement=JSON.stringify([f.placement.x,f.placement.y,f.placement.width,f.placement.height,f.placement.foot]);}
  rig.boundsStats={samples:0,misses:0,maxExtraPixels:0,maxAreaRatio:0,gpuFrames:0,fallbacks:0};rig.gpuPoseBounds=true;rig.verifyPoseBounds=true;rig.beginBatch(jobs.length);for(const job of jobs)rig.frame(key,job.actor,1.2,job.fallback,job.options);rig.endBatch();
  let different=0,maxDelta=0,alphaDifferent=0,placementSame=true;
  for(const [i,job]of jobs.entries()){const f=rig.frame(key,job.actor,1.2,job.fallback,job.options),actual=pixels(f.image);placementSame&&=JSON.stringify([f.placement.x,f.placement.y,f.placement.width,f.placement.height,f.placement.foot])===job.placement;
   for(let n=0;n<actual.length;n++)if(actual[n]!==job.reference[n]){different++;maxDelta=Math.max(maxDelta,Math.abs(actual[n]-job.reference[n]));if(n%4===3)alphaDifferent++;}
   if(i===5)await onImage(type,f.image.toDataURL());
  }
  reports.push({type,poses:jobs.length,differentRgbaComponents:different,maxDelta,alphaDifferent,placementSame,bounds:{...rig.boundsStats}});
 }}finally{rig.gpuPoseBounds=prior.fast;rig.verifyPoseBounds=prior.verify;}
 return reports;
}
