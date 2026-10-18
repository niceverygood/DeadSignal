import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {relative,sep} from 'node:path';
const root=new URL('../',import.meta.url);
const output=new URL('work/dead-signal-game/dist/player-rig/',root);
const three=new URL('work/meshy-sprite-baker/node_modules/three/',root);
await mkdir(new URL('vendor/',output),{recursive:true});
await mkdir(new URL('models/',output),{recursive:true});
const records=[];
async function copy(source,destination){
  const bytes=await readFile(source);
  await copyFile(source,destination);
  records.push({source:relative(fileURLToPath(root),fileURLToPath(source)).split(sep).join('/'),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
}
for(const name of ['three.module.js','three.core.js'])await copy(new URL('build/'+name,three),new URL('vendor/'+name,output));
await copy(new URL('LICENSE',three),new URL('vendor/THREE-LICENSE.txt',output));
for(const [path,name] of [['loaders/GLTFLoader.js','GLTFLoader.js'],['utils/BufferGeometryUtils.js','BufferGeometryUtils.js'],['utils/SkeletonUtils.js','SkeletonUtils.js']]){
  const source=await readFile(new URL('examples/jsm/'+path,three),'utf8');
  await writeFile(new URL('vendor/'+name,output),source.replaceAll("from 'three'","from './three.module.js'").replaceAll("'../utils/","'./"));
}
for(const name of ['animation.js','weapon-pose.js','weapon-attachment.js']){
  const source=await readFile(new URL('work/meshy-sprite-baker/src/'+name,root),'utf8');
  await writeFile(new URL(name,output),source.replaceAll("from 'three'","from './vendor/three.module.js'"));
}
for(const name of ['survivor-v2-walk.glb','survivor-v2-run.glb','survivor-rig-motion.glb','weapon-shotgun.glb','weapon-nailgun.glb','throwable-molotov.glb','env-common-brick.glb'])await copy(new URL('work/meshy-sprite-baker/models/'+name,root),new URL('models/'+name,output));
const config={};
for(const weapon of ['shotgun','nailgun']){
  const metadata=JSON.parse(await readFile(new URL(`work/dead-signal-game/dist/assets/production/survivor-${weapon}-run-hq32-packed/metadata.json`,root),'utf8'));
  config[weapon]=metadata.nativeWeapon.config;
}
await writeFile(new URL('weapon-config.json',output),JSON.stringify(config,null,2)+'\n');
await writeFile(new URL('provenance.json',output),JSON.stringify({three:'0.186.1',method:'byte copies of original models; browser-local imports of existing baker IK and sampler',records},null,2)+'\n');
console.log('Original player rig runtime prepared locally. No source models or historical evidence changed.');
