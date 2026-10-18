export async function compareWalkTextureLoading(renderer,{onImage=()=>{}}={}){
 const rig=renderer.liveEnemies,art=renderer.productionArt,prior={decode:rig.forceWalkTextureDecode,crop:rig.cropNativeComposite,batch:rig.batchInkComposite},reports=[];
 rig.cropNativeComposite=false;rig.batchInkComposite=false;
 const read=document.createElement('canvas');read.width=read.height=256;const c=read.getContext('2d',{willReadFrequently:true});
 const pixels=image=>{c.clearRect(0,0,256,256);c.drawImage(image,0,0);return c.getImageData(0,0,256,256).data;};
 try{for(const type of ['walker','runner','shield','screamer','gas','elite','collector']){
  const key='enemy-'+type,mapping=art.manifest.enemies[type];await Promise.all((typeof mapping==='string'?[mapping]:Object.values(mapping)).map(id=>art.load(id,{retry:true})));
  const jobs=['idle','walk','walk','walk','windup','attack','hit','death'].map((pose,i)=>{
   const actor={id:950+i,type,x:1200,y:930,hp:pose==='death'?0:500,dead:pose==='death',angle:i*.73,attackState:pose==='windup'?'windup':pose==='attack'?'charge':'walk',attackTime:.4,hitFlash:['windup','attack','hit'].includes(pose)?.09:0},options={pose,animationTime:pose==='death'?.45:.1,height:42,actionDurations:{windup:.9,charge:.75}},selected=art.enemyFrame(type,actor,{pose,simulationTime:1.2,animationTime:options.animationTime});if(!selected)throw Error('native-art-not-ready');
   return {actor,options,fallback:{...selected,locomotion:{pose:pose==='hit'?'walk':pose,phase:2.4,angle:actor.angle,...(pose==='walk'?{moveWeight:[.3,.7,1][i-1]}:{})}}};
  });
  const passes=[],loads=[];
  for(const forceDecode of [true,false]){
   rig.releaseUnused([]);rig.forceWalkTextureDecode=forceDecode;const skipped=rig.clipLoader.skippedTextures,start=performance.now();if(!await rig.load(key))throw Error(rig.error||'original-walk-model-not-ready');const loadMs=performance.now()-start;
   rig.beginBatch(jobs.length);for(const j of jobs)rig.frame(key,j.actor,1.2,j.fallback,j.options);rig.endBatch();
   passes.push(jobs.map(j=>{const f=rig.frames.get(j.actor).selected;return {pixels:pixels(f.image),geometry:JSON.stringify([f.frame.alphaBounds,f.frame.coreBounds,f.placement]),animation:JSON.stringify(f.metadata.animation)};}));
   const images=new Set();rig.models.get(key).root.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){const data=m.map?.source?.data;if(data)images.add(data);}});
   loads.push({forceDecode,loadMs,skippedWalkTextures:rig.clipLoader.skippedTextures-skipped,visibleTextureSizes:[...images].map(i=>[i.width,i.height]).sort(),clips:rig.models.get(key).sampler.clips.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length}))});
   if(!forceDecode)await onImage(type,rig.frames.get(jobs[5].actor).selected.image.toDataURL());
  }
  let different=0,maxDelta=0,geometrySame=true,animationSame=true;for(let i=0;i<jobs.length;i++){const a=passes[0][i],b=passes[1][i];geometrySame&&=a.geometry===b.geometry;animationSame&&=a.animation===b.animation;for(let n=0;n<a.pixels.length;n++){const d=Math.abs(a.pixels[n]-b.pixels[n]);if(d)different++;maxDelta=Math.max(maxDelta,d);}}
  reports.push({type,poses:jobs.length,different,maxDelta,geometrySame,animationSame,loads,visibleTexturesSame:JSON.stringify(loads[0].visibleTextureSizes)===JSON.stringify(loads[1].visibleTextureSizes),clipsSame:JSON.stringify(loads[0].clips)===JSON.stringify(loads[1].clips)});
 }}finally{rig.forceWalkTextureDecode=prior.decode;rig.cropNativeComposite=prior.crop;rig.batchInkComposite=prior.batch;if(!prior.batch)rig.batchInk.release();}
 return reports;
}
