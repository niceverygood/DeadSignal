export async function compareNativeComposite(renderer,{onImage=()=>{},beforePass=()=>{},mode='crop'}={}){
 const rig=renderer.liveEnemies,art=renderer.productionArt,property=mode==='gpuAlpha'?'exactGPUAlphaBounds':mode==='batchInk'?'batchInkComposite':'cropNativeComposite',keys=['cropNativeComposite','batchInkComposite','exactGPUAlphaBounds','verifyExactGPUAlphaBounds','gpuPoseBounds','directAlphaReadback','minGPUAlphaCells'],prior=Object.fromEntries(keys.map(key=>[key,rig[key]])),reports=[];
 for(const key of keys)rig[key]=false;
 rig.minGPUAlphaCells=1; // Explicit all-cell correctness fixture, independent of the production threshold.
 const read=document.createElement('canvas');read.width=read.height=256;const c=read.getContext('2d',{willReadFrequently:true});
 const pixels=image=>{c.clearRect(0,0,256,256);c.drawImage(image,0,0);return c.getImageData(0,0,256,256).data;};
 try{for(const type of ['walker','runner','shield','screamer','gas','elite','collector']){
  const key='enemy-'+type;rig.releaseUnused([key]);if(!await rig.load(key))throw Error(rig.error||'native-model-not-ready');
  const mapping=art.manifest.enemies[type];await Promise.all((typeof mapping==='string'?[mapping]:Object.values(mapping)).map(id=>art.load(id,{retry:true})));
  const jobs=['idle','walk','walk','walk','windup','attack','hit','death'].map((pose,i)=>{
   const actor={id:900+i,type,x:1200,y:930,hp:pose==='death'?0:500,dead:pose==='death',angle:i*.73,attackState:pose==='windup'?'windup':pose==='attack'?'charge':'walk',attackTime:.4,hitFlash:['windup','attack','hit'].includes(pose)?.09:0};
   const options={pose,animationTime:pose==='death'?.45:.1,height:42,actionDurations:{windup:.9,charge:.75}},selected=art.enemyFrame(type,actor,{pose,simulationTime:1.2,animationTime:options.animationTime});if(!selected)throw Error('native-art-not-ready');
   return {actor,options,fallback:{...selected,locomotion:{pose:pose==='hit'?'walk':pose,phase:2.4,angle:actor.angle,...(pose==='walk'?{moveWeight:[.3,.7,1][i-1]}:{})}}};
  });
  const passes=[],memory=[];
  for(const crop of [false,true,false]){
   rig[property]=crop;rig.verifyExactGPUAlphaBounds=mode==='gpuAlpha'&&crop;await beforePass({type,enabled:crop,jobs});rig.beginBatch(jobs.length);for(const j of jobs)rig.frame(key,j.actor,1.2,j.fallback,j.options);rig.endBatch();
   memory.push({enabled:crop,extraInkRawBytes:rig.batchInk?.rawBytes||0,extraGPUAlphaRawBytes:rig.gpuAlphaBounds?.rawBytes||0,gpuCopyRawBytes:rig.gpuRaw?rig.gpuRaw.width*rig.gpuRaw.height*4:0,gpuAlphaStats:{...rig.gpuAlphaStats},preparations:rig.batchInk?.preparations||0,cells:rig.batchInk?.cells||0,outputsPrivate:jobs.every(j=>rig.frames.get(j.actor).selected.image!==rig.batchInk?.image&&rig.frames.get(j.actor).selected.image.width===256)});
   passes.push(jobs.map(j=>{const f=rig.frames.get(j.actor).selected;return {pixels:pixels(f.image),geometry:JSON.stringify([f.frame.alphaBounds,f.frame.coreBounds,f.placement]),animation:JSON.stringify(f.metadata.animation)};}));
   if(crop)await onImage(type,rig.frames.get(jobs[5].actor).selected.image.toDataURL());
  }
  const comparisons=passes.slice(1).map((pass,index)=>{let different=0,maxDelta=0,geometrySame=true,animationSame=true;for(let i=0;i<jobs.length;i++){const a=passes[0][i],b=pass[i];geometrySame&&=a.geometry===b.geometry;animationSame&&=a.animation===b.animation;for(let n=0;n<a.pixels.length;n++){const d=Math.abs(a.pixels[n]-b.pixels[n]);if(d)different++;maxDelta=Math.max(maxDelta,d);}}return {enabled:index===0,different,maxDelta,geometrySame,animationSame};});
  reports.push({type,poses:jobs.length,mode,comparisons,memory});
 }}finally{Object.assign(rig,prior);if(!prior.batchInkComposite)rig.batchInk?.release();if(!prior.exactGPUAlphaBounds)rig.releaseExactGPUAlpha();}
 return reports;
}
