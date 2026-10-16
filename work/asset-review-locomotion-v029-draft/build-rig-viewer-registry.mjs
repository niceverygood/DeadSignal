import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {GROUNDED_IDS,preferredRigClip} from './production-assets/rig-viewer-state.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const assets=path.join(root,'outputs/dead-signal/production-assets');
const outputFlag=process.argv.indexOf('--output');
const output=path.resolve(root,outputFlag<0?'work/asset-review-locomotion-v029-draft/production-assets':process.argv[outputFlag+1]);
const groundedLocomotion=process.argv.includes('--grounded-locomotion');
if(!output.startsWith(root+path.sep))throw new Error('Output must stay in the workspace');
const review=JSON.parse(await fs.readFile(path.join(assets,'review-manifest.json'),'utf8'));
const ids=['survivor',...Array.from({length:12},(_,i)=>['boss-'+String(i+1).padStart(2,'0')+'-mid','boss-'+String(i+1).padStart(2,'0')+'-final']).flat(),...['walker','runner','shield','screamer','gas','elite','collector'].map(e=>'enemy-'+e)];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const exists=async f=>(await fs.stat(f).catch(()=>null))?.isFile();
const records=[];
for(const id of ids){
  const grounded=groundedLocomotion&&GROUNDED_IDS.includes(id),folder=id+(grounded?'-grounded-locomotion-v1':'-motion-v1'),file=path.join(assets,'models',folder,'model.glb'),bytes=await fs.readFile(file);
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2)throw new Error('Not a GLB: '+id);
  const n=bytes.readUInt32LE(12),j=JSON.parse(bytes.toString('utf8',20,20+n));
  if((j.buffers||[]).some(b=>b.uri)||(j.images||[]).some(image=>image.uri))throw new Error('Only embedded original textures/buffers are allowed: '+id);
  if((j.extensionsRequired||[]).some(ext=>ext!=='KHR_materials_unlit'))throw new Error('Unconfigured GLB decoder extension: '+id);
  const skins=j.skins||[],joints=new Set(skins.flatMap(s=>s.joints||[]));
  const weighted=(j.nodes||[]).filter(node=>Number.isInteger(node.skin)&&Number.isInteger(node.mesh)&&(j.meshes?.[node.mesh]?.primitives||[]).some(p=>Number.isInteger(p.attributes?.JOINTS_0)&&Number.isInteger(p.attributes?.WEIGHTS_0)));
  if(!skins.length||!joints.size||!weighted.length)throw new Error('No real weighted skin: '+id);
  const clips=(j.animations||[]).map(a=>{const duration=Math.max(0,...(a.samplers||[]).map(s=>j.accessors?.[s.input]?.max?.[0]||0));return{name:a.name,duration,tracks:a.channels?.length||0,loop:/walk|run|idle/i.test(a.name)&&!/MotionReel/i.test(a.name)};});
  if(clips.some(c=>!c.name||c.duration<=0||c.tracks===0))throw new Error('Invalid native clip: '+id);
  const provenanceFile=grounded?'grounding-provenance.json':await exists(path.join(assets,'models',folder,'rig-provenance.json'))?'rig-provenance.json':'motion-provenance.json';
  const provenance=JSON.parse(await fs.readFile(path.join(assets,'models',folder,provenanceFile),'utf8'));
  if(grounded){
    if(provenance.sha256!==sha(bytes)||provenance.originalBinaryPrefixExact!==true||provenance.originalGeometrySkinUVTextureExact!==true||provenance.originalClipsExact!==true)throw new Error('Grounded model original preservation evidence mismatch: '+id);
    const original=await fs.readFile(path.join(assets,'models',id+'-motion-v1/model.glb'));
    if(sha(original)!==provenance.sourceSHA256)throw new Error('Grounded source model hash mismatch: '+id);
    const originalJSON=JSON.parse(original.toString('utf8',20,20+original.readUInt32LE(12)));
    if(!originalJSON.animations.every((clip,index)=>JSON.stringify(clip)===JSON.stringify(j.animations[index])))throw new Error('Original native animation changed: '+id);
  }
  const reviewAsset=review.assets.find(a=>a.id===id);
  records.push({id,name:id==='survivor'?'생존자 · 원본 공통 리그':reviewAsset?.name||id,kind:id==='survivor'?'hero':id.startsWith('boss-')?'boss':'enemy',model:'models/'+folder+'/model.glb',bytes:bytes.length,sha256:sha(bytes),provenance:'models/'+folder+'/'+provenanceFile,jointCount:joints.size,skinnedMeshes:weighted.length,embeddedTextures:j.images?.length||0,clips,preferredClip:preferredRigClip(clips,id)?.name,preservation:provenance.preservation||(grounded?{originalBinaryPrefixExact:provenance.originalBinaryPrefixExact,originalGeometrySkinUVTextureExact:provenance.originalGeometrySkinUVTextureExact,originalClipsExact:provenance.originalClipsExact}:{originalBinaryBytesUnchanged:provenance.originalBinaryBytesUnchanged||null}),note:grounded?'발·다리 접지 이동 클립을 추가한 실제 GLB입니다. 기존 메시·스킨·텍스처·원본 동작을 보존했습니다. 게임 atlas 적용·브라우저 검수와 구분합니다.':'실제 제작 GLB의 관절 변형 검수용입니다. 게임 atlas 적용·실제 전투 검수와 구분합니다.'});
}
const registry={schemaVersion:1,generatedAt:new Date().toISOString(),modelCount:records.length,groundedLocomotionModels:records.filter(record=>record.model.includes('-grounded-locomotion-v1/')).length,models:records};
await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'rig-viewer-registry.json'),JSON.stringify(registry,null,2)+'\n');
console.log(JSON.stringify({models:records.length,weightedSkinModels:records.filter(r=>r.jointCount&&r.skinnedMeshes).length,externalResources:0,output:path.relative(root,output)}));
