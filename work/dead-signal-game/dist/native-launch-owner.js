const untouched=rig=>!rig||rig.renderer?.info?.render?.frame===0&&rig.renderer?.info?.memory?.textures===0&&!rig.batch&&!rig.lost;

function retire(rig){
  if(!rig)return;
  const pending=[...(rig.pending?.values?.()||[])];
  try{rig.releaseUnused([]);}catch{}
  try{rig.renderer?.dispose();}catch{}
  try{rig.renderer?.forceContextLoss();}catch{}
  // GLTF decoding has no cancellation API. Release any late CPU model owned
  // by the retired rig without touching the new renderer or original files.
  for(const promise of pending)Promise.resolve(promise).then(()=>{try{rig.releaseUnused([]);}catch{}},()=>{});
}

export async function prepareRendererNativeLaunch(renderer,keys,{signal,prepare}={}){
  if(signal?.aborted||!keys?.length)return null;
  const expectedPromise=renderer.liveEnemiesPromise,expectedRig=renderer.liveEnemies;
  let old;
  try{old=expectedPromise?await expectedPromise:expectedRig;}catch{return null;}
  if(signal?.aborted||expectedRig&&old!==expectedRig||renderer.liveEnemiesPromise!==expectedPromise||renderer.liveEnemies!==expectedRig&&!(!expectedRig&&renderer.liveEnemies===old)||!untouched(old))return null;
  const owner=renderer.liveEnemies;
  try{
    prepare??=(await import('./boss-rig/native-launch-preparation.js')).prepareNativeEnemyLaunch;
    const candidate=await prepare(keys,{signal,existingRig:old});
    if(!candidate)return null;
    if(signal?.aborted||renderer.liveEnemies!==owner||renderer.liveEnemiesPromise!==expectedPromise||!untouched(old)){
      candidate.dispose();return null;
    }
    return {candidate,expectedRig:owner,expectedPromise,old,signal,report:candidate.report,disposed:false,adopted:false,
      dispose(){if(this.disposed)return;this.disposed=true;try{this.candidate.dispose();}catch{}}};
  }catch{return null;}
}

// Called only inside the launch gate's synchronous successful Game commit.
// A failed or cancelled preparation never changes the live owner or its cache.
export function adoptRendererNativeLaunch(renderer,handle){
  if(!handle||handle.disposed||handle.adopted)return false;
  let rig;
  try{
    if(handle.signal?.aborted||renderer.liveEnemies!==handle.expectedRig||renderer.liveEnemiesPromise!==handle.expectedPromise||!untouched(handle.old)||!handle.candidate.isReady()){
      handle.dispose();return false;
    }
    rig=handle.candidate.adopt();
  }catch{handle.dispose();return false;}
  if(!rig){handle.dispose();return false;}
  handle.adopted=true;
  renderer.liveEnemies=rig;renderer.liveEnemiesPromise=Promise.resolve(rig);renderer.liveEnemiesLoading=true;
  renderer.nativeLaunchReport={...handle.report,adopted:true};
  retire(handle.old);
  return true;
}
