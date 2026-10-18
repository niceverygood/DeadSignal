import {Game} from './engine.js?v=0.29.0';
export async function comparePlayerSkinUpdates(renderer,{onImage=()=>{}}={}){
 const reports=[],read=document.createElement('canvas');read.width=read.height=256;const c=read.getContext('2d',{willReadFrequently:true});
 for(const weapon of ['shotgun','nailgun']){
  if(!await renderer.preloadProductionPlayer(weapon))throw Error('original-player-not-ready');
  const rig=renderer.livePlayer,prior=rig.forceRedundantSkinUpdates,passes=[],sampler=rig.models.get('run').sampler,update=sampler.updateSkinPose;let calls=0;
  sampler.updateSkinPose=function(...args){calls++;return update.apply(this,args);};
  try{for(const force of [true,false,true]){
   rig.forceRedundantSkinUpdates=force;const game=new Game({seed:774,weapon,missionId:'mission-01'});game.enemies=[];game.spawnClock=1e9;renderer.cameraReady=false;const frames=[];
   const input={shoot:false,fireMode:'manual',aimX:1400,aimY:930},draw=()=>renderer.render(game,{},game.time);
   const advance=(n,dt,extra={})=>{for(let i=0;i<n;i++){game.tick(dt,{...input,...extra});game.drainEvents();draw();}};
   const capture=async name=>{c.clearRect(0,0,256,256);c.drawImage(rig.canvas,0,0);frames.push({name,pixels:c.getImageData(0,0,256,256).data,geometry:JSON.stringify([rig.last.selected.frame,rig.last.selected.placement]),calls,save:JSON.stringify(game.snapshot())});if(!force)await onImage(weapon,name,rig.canvas.toDataURL());await new Promise(requestAnimationFrame);};
   calls=0;for(let i=0;i<72;i++)game.tick(1/60,input);draw();await capture('idle');
   advance(18,1/60,{moveX:1,moveY:.2});await capture('move');
   advance(1,1/240,{shoot:true});await capture('shot');
   game.hurtPlayer(8,{x:game.player.x-20,y:game.player.y});advance(4,1/240);await capture('hit');
   game.reload();advance(20,1/120);await capture('reload');
   game.throwFire(game.player.x+170,game.player.y-60);advance(30,1/240);await capture('throw');
   passes.push(frames);
  }}finally{sampler.updateSkinPose=update;rig.forceRedundantSkinUpdates=prior;}
  const comparisons=passes.slice(1).map((pass,index)=>pass.map((b,i)=>{const a=passes[0][i];let different=0,maxDelta=0;for(let n=0;n<a.pixels.length;n++){const d=Math.abs(a.pixels[n]-b.pixels[n]);if(d)different++;maxDelta=Math.max(maxDelta,d);}return {name:b.name,optimized:index===0,different,maxDelta,geometrySame:a.geometry===b.geometry,identicalSnapshot:a.save===b.save,baselineSkinCalls:a.calls,actualSkinCalls:b.calls};}));
  reports.push({weapon,comparisons});
 }
 return reports;
}
