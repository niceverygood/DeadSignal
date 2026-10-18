// Six declared fold-only worker edits. Importing performs no IO or runtime work.
const gate=" const foldEnabled=timelineEnabled&&descriptor(options,'boss02FoldProfile')?.value===true;\n if(foldEnabled&&query.get('qa-boss02-fold')!=='1')return{report:{available:false,complete:false,reason:'boss02-fold-gate-required'}};\n";
const hook=[
 '  if(foldEnabled){',
 "   const {observeBossFoldPeaks}=await wait(import('./qa-boss-fold-peaks.js')),image=descriptor(options,'onFoldPeaksImage');need(!image||Object.hasOwn(image,'value')&&typeof image.value==='function','fold-peaks-data-callback-required');",
 "   try{foldPeakObservation=await wait(observeBossFoldPeaks({rig,art,adapter,boss:finals[0],document,check,wait,yieldUI,registerSurface:surface=>{need(!protectedResources.has(surface),'owned-fold-peaks-surface-required');ownedSurfaces.add(surface);},onImage:image?.value,Renderer,helpers:{originalModelSnapshot,verifyOriginalModel,handPoints,projectedHands,protectedPoints,protectedPositions,actorFixture,layerEvidence,byteDifference,sameNumbers,primitive}}));check();}",
 "   catch(error){let partial;try{partial=error&&descriptor(error,'bossFoldPeaks')?.value;}catch{}foldPeakObservation=partial||{complete:false,error:errorText(error)};throw error;}",
 '  }',
].join('\n')+'\n';
const changes=[
 [gate,''],
 [' let foldPeakObservation=null;\n',''],
 ["new LiveBossRig(foldEnabled?{size:SIZE,bossActionProfile:'boss02-fold-v1'}:{size:SIZE})","new LiveBossRig({size:SIZE})"],
 ["   if(foldEnabled)need(rig.models.get(finals[0].id)?.actionLayer?.profile==='boss02-fold-v1','boss02-fold-profile-required');\n",''],
 [hook,''],
 ["...(foldEnabled?{candidateProfile:'boss02-fold-v1',foldPeakObservation}:{}),",''],
];
export function undoFoldWorker(source){
 if(typeof source!=='string')throw TypeError('fold-worker-source-string-required');
 for(const[changed,original]of changes){if(source.split(changed).length!==2)throw Error('fold-worker-six-edit-inverse-mismatch');source=source.replace(changed,original);}return source;
}
