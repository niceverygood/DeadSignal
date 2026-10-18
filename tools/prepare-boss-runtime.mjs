import {mkdir,readFile,copyFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {productionManifest} from '../work/dead-signal-game/dist/production-manifest.js';
const root=new URL('../',import.meta.url),out=new URL('work/dead-signal-game/dist/boss-rig/',root);
await mkdir(new URL('models/',out),{recursive:true});
const registry={version:1,source:'unchanged original GLBs; continuous native skeletal rendering',bosses:{}};
for(const [key,mapping] of Object.entries(productionManifest.bosses)){
  const metadata=JSON.parse(await readFile(new URL('work/dead-signal-game/dist/assets/production/'+productionManifest.assets[mapping.walk].metadata,root),'utf8'));
  const actions=JSON.parse(await readFile(new URL('work/dead-signal-game/dist/assets/production/'+productionManifest.assets[mapping.actions].metadata,root),'utf8'));
  const original=new URL('work/meshy-sprite-baker/models/'+metadata.source.file,root),bytes=await readFile(original);
  await copyFile(original,new URL('models/'+key+'.glb',out));
  registry.bosses[key]={file:'models/'+key+'.glb',original:'work/meshy-sprite-baker/models/'+metadata.source.file,
    sha256:createHash('sha256').update(bytes).digest('hex'),source:metadata.source,projection:metadata.projection,
    walkName:metadata.animation.name,clips:actions.animation.clips,
    sampleDensity:{idle:64,walk:96,windup:64,attack:64,hit:48,death:64}};
}
await writeFile(new URL('registry.json',out),JSON.stringify(registry,null,2)+'\n');
console.log('Original boss runtime prepared:',Object.keys(registry.bosses).length,'models. No original assets overwritten.');
