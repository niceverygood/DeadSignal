// Dimension-derived RGBA budget; this is not measured browser/GPU memory.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// Paths are rooted in this portable project, never in an old workstation cwd.
const draft=path.resolve(root,process.env.DEAD_SIGNAL_GAME_DIR||'work/dead-signal-game/dist');
const dryRun=process.argv.includes('--dry-run');
const {productionManifest:manifest}=await import(pathToFileURL(path.join(draft,'production-manifest.js')));
const {productionManifest:baseline}=await import('./baseline-v028-manifest.js');
const {productionLaunchPlan,launchWorld}=await import(pathToFileURL(path.join(draft,'launch-gate.js')));
const {MISSIONS}=await import(pathToFileURL(path.join(draft,'campaign.js')));
const dimensions={};
for(const [id,a] of Object.entries(manifest.assets)){
 const dir=path.join(draft,'assets/production');
 const [metaRaw,png]=await Promise.all([readFile(path.join(dir,a.metadata)),readFile(path.join(dir,a.atlas))]);
 const m=JSON.parse(metaRaw),w=png.readUInt32BE(16),h=png.readUInt32BE(20);
 if(w!==m.atlas.width||h!==m.atlas.height)throw Error(id+' dimensions mismatch');
 dimensions[id]={width:w,height:h,decodedBytes:w*h*4,decodedMiB:w*h*4/1048576,atlasPngBytes:png.length,frames:m.frames.length,samples:m.atlas.samples,packing:m.atlas.packing||null,masksSkippedByContours:m.frames.every(f=>Object.hasOwn(f,'bodyIdentificationContour')),sha256:createHash('sha256').update(png).digest('hex')};
}
const cost=ids=>{const imageBytes=[...new Set(ids)].reduce((sum,id)=>sum+dimensions[id].decodedBytes,0);return {imageBytes,imageMiB:imageBytes/1048576,decodedMaskBytes:0,totalMiB:imageBytes/1048576};};
function plansFor(m){return ['shotgun','nailgun'].flatMap(weapon=>MISSIONS.map(mission=>{const plan=productionLaunchPlan({manifest:m,weapon,mission,world:launchWorld({missionId:mission.id})});if(plan.maskIds.some(id=>!dimensions[id].masksSkippedByContours))throw Error('Unexpected mask decode '+weapon+'/'+mission.id);return {key:weapon+'/'+mission.id,weapon,mission:mission.id,assetIds:plan.assetIds,maskIds:plan.maskIds,cost:cost(plan.assetIds),missing:plan.missing};}));}
const plans=plansFor(manifest),old=plansFor(baseline);const maximum=values=>values.reduce((a,b)=>a.cost.totalMiB>b.cost.totalMiB?a:b);
const steadyMax=maximum(plans),baselineMax=maximum(old);
const transitions=(values)=>values.flatMap(from=>values.map(to=>({from:from.key,to:to.key,assetIds:[...new Set([...from.assetIds,...to.assetIds])],cost:cost([...from.assetIds,...to.assetIds])})));
const transitionMax=maximum(transitions(plans)),baselineTransitionMax=maximum(transitions(old));
const legacy=['shotgun','nailgun'].map(weapon=>{const p=productionLaunchPlan({manifest,weapon,world:launchWorld({stage:0})});if(p.maskIds.some(id=>!dimensions[id].masksSkippedByContours))throw Error('legacy maskdecode');return {weapon,assetIds:p.assetIds,cost:cost(p.assetIds),missing:p.missing};});
const portraitIds=[...new Set(Object.values(manifest.bossPortraits||{}))];const hdIds=[...new Set(Object.values(manifest.bossDetailPortraits||{}))];
const result={format:'dead-signal-v029-dimension-derived-residency-v1',meaning:'Decoded RGBA equivalent from actual PNG IHDR dimensions and real productionLaunchPlan IDs. Not measured browser, compositor, process, RAM or VRAM. Campaign transition assumes one successful old-to-new scene launch; cancelled or failed launches can keep additional images resident.',registeredAssets:Object.keys(dimensions).length,campaignPlans:plans.length,modeledSuccessfulTransitions:plans.length**2,masksDecoded:0,steadyMax,baselineMax,steadyDeltaMiB:steadyMax.cost.totalMiB-baselineMax.cost.totalMiB,transitionMax,baselineTransitionMax,transitionDeltaMiB:transitionMax.cost.totalMiB-baselineTransitionMax.cost.totalMiB,legacy,portraitCatalogExtra:cost(portraitIds),selectedHDPortraitExtraMiB:Math.max(...hdIds.map(id=>dimensions[id].decodedMiB)),plans,dimensions};
const target=path.join(root,'outputs/dead-signal/production-assets/audits/2026-10-16/V029-NATIVE-RESIDENCY-BUDGET.json');
if(!dryRun)await writeFile(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({registeredAssets:result.registeredAssets,steadyMaxMiB:steadyMax.cost.totalMiB,baselineMaxMiB:baselineMax.cost.totalMiB,transitionMaxMiB:transitionMax.cost.totalMiB,baselineTransitionMaxMiB:baselineTransitionMax.cost.totalMiB,masksDecoded:0,portraitCatalogExtraMiB:result.portraitCatalogExtra.totalMiB,selectedHDPortraitExtraMiB:result.selectedHDPortraitExtraMiB,gameDir:path.relative(root,draft).split(path.sep).join('/'),dryRun,reportWritten:!dryRun}));
