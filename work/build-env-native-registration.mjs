// Read-only source/world allocation audit. Writes a proposed registry only, never game files.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCity} from './dead-signal-game/dist/world.js';
import {getMission} from './dead-signal-game/dist/campaign.js';
import {matchesEnvironmentRule,validEnvironmentRule} from './dead-signal-game/dist/production-rules.js';
import {productionManifest as currentManifest} from './dead-signal-game/dist/production-manifest.js';
import {validateAtlasMetadata} from './dead-signal-game/dist/production-art.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const plan=JSON.parse(await fs.readFile('work/production-environment-plan.json','utf8'));
const progress=JSON.parse(await fs.readFile('work/environment-input-progress.json','utf8'));
const measured=JSON.parse(await fs.readFile('work/environment-glb-measurements.json','utf8'));
const worlds=plan.landmarks.map(l=>{let next=1;return createCity({missionId:l.missionId,seed:15043,random:()=>.5,nextId:()=>next++});});
const copySelector=o=>Object.fromEntries(['kind','variant','label','x','y','w','h','height'].filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
const exact=(o,s)=>Object.entries(s).filter(([k])=>k!=='missionId').every(([k,v])=>o[k]===v);
const environment={},assets={},landmarks=[],shared=[],rules=[];
for(const l of plan.landmarks){
 const world=worlds.find(w=>w.missionId===l.missionId),sel={...l.nativeMapping.selector,variant:l.nativeMapping.variant};
 const found=world.obstacles.filter(o=>exact(o,sel));if(found.length!==1)throw new Error('Canonical placement must match exactly once: '+l.id);
 const o=found[0],input=progress.assets.find(a=>a.planId===l.id),entry='env-'+input.slug;
 const m=measured.measurements.find(m=>m.id===entry);environment[entry]=entry;
 assets[entry]={metadata:entry+'/metadata.json',atlas:entry+'/atlas.png',bodyAlpha:entry+'/body-alpha.png',modelReady:m?.ready===true,spriteReady:false,reviewStatus:'pending'};
 const selector=copySelector(o),rule={theme:world.theme,variant:String(o.variant||''),...selector,entry};rules.push(rule);
 const broad=world.obstacles.filter(p=>p.kind===o.kind&&p.variant===o.variant),label=world.obstacles.filter(p=>p.kind===o.kind&&p.variant===o.variant&&p.label===o.label);
 landmarks.push({entry,missionId:world.missionId,theme:world.theme,selector,actualIdForEvidenceOnly:o.id,selectorMatchingCount:1,broadVariantMatchingCount:broad.length,labelOnlyMatchingCount:label.length,originalCollisionHeight:o.height,measuredFittedArtHeight:m?.chosenFit?.fitted?.height||null,policy:'Replace this exact canonical instance only. Leave all other buildings on the established renderer.',rule});
}
for(const world of worlds){
 for(const o of world.obstacles){
  let entry=null;
  if(o.kind==='car'&&o.variant==='civilian')entry='env-broken-car';
  if(o.kind==='barrel')entry='env-red-fuel-barrel';
  if(o.kind==='fence')entry=o.w>o.h?'env-fence-horizontal':'env-fence-vertical';
  if(!entry)continue;
  const selector=copySelector(o),rule={theme:world.theme,variant:String(o.variant||''),...selector,entry};rules.push(rule);
  shared.push({entry,missionId:world.missionId,selector,actualIdForEvidenceOnly:o.id,angle:o.angle??0,policy:o.kind==='fence'?'Separate rigid-yaw horizontal/vertical exports; no scale-axis distortion.':'Exact current campaign allocation; destroyed keeps original wreckage path.'});
 }
 for(const d of world.decor.filter(d=>d.kind==='lamp')){
  const entry='env-amber-worklamp',selector=copySelector(d),rule={theme:world.theme,variant:String(d.variant||''),...selector,entry};rules.push(rule);
  shared.push({entry,missionId:world.missionId,selector,angle:d.angle??0,policy:'Existing point decor, non-colliding. Actual native art height only; atmosphere/light anchors require root visual QA.'});
 }
}
for(const entry of new Set(shared.map(s=>s.entry))){
 const modelId=entry.startsWith('env-fence-')?'env-fence':entry,m=measured.measurements.find(m=>m.id===modelId);environment[entry]=entry;
 assets[entry]={metadata:entry+'/metadata.json',atlas:entry+'/atlas.png',bodyAlpha:entry+'/body-alpha.png',modelReady:m?.ready===true,spriteReady:false,reviewStatus:'pending',...(entry==='env-amber-worklamp'?{worldHeight:80}:{})};
}
for(const [entry,asset]of Object.entries(assets)){
 try{
  const md=validateAtlasMetadata(JSON.parse(await fs.readFile('outputs/dead-signal/production-assets/sprites/'+entry+'/metadata.json','utf8')));
  await fs.access('outputs/dead-signal/production-assets/sprites/'+entry+'/atlas.png');
  await fs.access('outputs/dead-signal/production-assets/sprites/'+entry+'/body-alpha.png');
  asset.spriteReady=true;asset.nativeFrames=md.frames.length;
  asset.reviewStatus=currentManifest.environment?.[entry]===entry?'root_registered_actual_asset':'native_bake_available_root_review_pending';
 }catch{}
}
const renderer=await fs.readFile('work/dead-signal-game/dist/renderer.js'),worldBytes=await fs.readFile('work/dead-signal-game/dist/world.js');
for(const rule of rules){if(!validEnvironmentRule(rule))throw new Error('Invalid actual selector: '+JSON.stringify(rule));const match=worlds.flatMap(w=>[...w.obstacles,...w.decor].filter(o=>matchesEnvironmentRule(rule,o,w)));if(match.length!==1)throw new Error('Exact actual matcher must select one current instance: '+JSON.stringify({rule,matches:match.length}));}
const report={schemaVersion:1,status:'proposed_registration_not_applied',executableUnderAuditedRenderer:true,sourceAudit:{rendererSHA256:hash(renderer),worldSHA256:hash(worldBytes),scope:'Actual createCity campaign allocations, deterministic read-only fixture random; no Game/RNG/save mutation'},currentContract:{acceptedSelectors:['theme','kind','variant','entry','label','x','y','w','h','height'],numericTolerance:1e-5,missingExactSelectors:[],verification:'All206 proposed rules pass the actual production-rules validator and each selects exactly one current allocation. Manifest application remains root-owned.'},requiredSelectorPolicy:{allSpecifiedFieldsMustMatch:true,absentOptionalFieldsDoNotConstrain:true,numericFields:['x','y','w','h','height'],stringFields:['theme','kind','variant','label'],invalidSelectorFailsClosed:true,idPolicy:'Do not use generated obstacle IDs as permanent art keys; recorded IDs are evidence only.',priority:'First exact rule wins; unknown or unloaded native asset retains established path.'},nativeTransformPolicy:{preserveOriginalGLB:true,uniformFootprintContain:true,no2DAxisStretch:true,noGeometryAxisStretch:true,groundPivot:'Actual raw geometry centre X/Z and minY, recorded in baker job',height:'Actual native geometry height after one footprint-contain scale. Original obstacle height/physics/save remains untouched.',directions:'Static8 directions; car16. Current world objects contain no angle field and selectangle0. Fence uses separate rigid-yaw orientation exports. Root plans full-module repeated segment fits for long colliders; no half-panel cuts.'},landmarkCount:landmarks.length,sharedPlacementCount:shared.length,landmarks,shared,proposedManifest:{assets,environment,environmentRules:rules},excluded:{barrier:'No current campaign allocation',crate:'No current campaign allocation',patrolCar:'Retains existing renderer; no approved patrol variant',legacy3stage:'Rules are explicit campaign themes only; all legacy layouts retained',otherBuildings:'All noncanonical instances retained'},reviewGates:['Root verifies textured native front orientation and material fidelity before registration.','Measured height mismatch remains recorded. Root explicitly accepted all source geometry as uniform-footprint render candidates, with final camera/material QA still pending; no axis stretch.','Fence horizontal/vertical GLB rigid yaw must be individually baked and checked. Root approved full-module repeated segment rendering for long fences: each segment gets one uniform contain fit, original physics remains unchanged.','All copied sprites must pass actual atlas metadata/alpha/clipping checks before spriteReady can change.']};
await fs.writeFile('work/env-native-registration.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({canonical:landmarks.length,shared:shared.length,rules:rules.length,ambiguousLabels:landmarks.filter(l=>l.labelOnlyMatchingCount>1).map(l=>({entry:l.entry,count:l.labelOnlyMatchingCount})),carAngles:[...new Set(shared.filter(s=>s.selector.kind==='car').map(s=>s.angle))],fenceHorizontal:shared.filter(s=>s.entry==='env-fence-horizontal').length,fenceVertical:shared.filter(s=>s.entry==='env-fence-vertical').length,applied:false}));
