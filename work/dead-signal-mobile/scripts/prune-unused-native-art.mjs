import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionManifest } from '../dist/production-manifest.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),base=resolve(root,'dist/assets/production');
const folders=new Set(Object.values(productionManifest.assets).flatMap(a=>['metadata','atlas','bodyAlpha'].map(k=>a[k]?.split('/')[0]).filter(Boolean)));
const allowed=new Set(['survivor-shotgun-walk','survivor-shotgun-run','survivor-nailgun-walk','survivor-nailgun-run']);
const removed=[];
for(const d of await readdir(base,{withFileTypes:true}))if(d.isDirectory()&&!folders.has(d.name)){
  if(!allowed.has(d.name))throw Error('Unrecognized unused asset directory: '+d.name);
  const entries=[];for(const file of await readdir(resolve(base,d.name))){const bytes=await readFile(resolve(base,d.name,file));entries.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  removed.push({folder:d.name,members:entries});
}
// These are superseded 8-frame sheets, preserved in the original immutable web
// release. No active atlas, 32-frame sample, contour or image is resampled.
for(const d of removed)await rm(resolve(base,d.folder),{recursive:true});
const prior=resolve(root,'release/excluded-unused-art.json');
if(removed.length)await writeFile(prior,JSON.stringify({nativeCatalogCount:Object.keys(productionManifest.assets).length,excludedOnlySuperseded8FrameSheets:removed,activeArtResampled:false},null,2)+'\n');
console.log(JSON.stringify({activeNativeAssets:Object.keys(productionManifest.assets).length,excludedFolders:removed.map(x=>x.folder),bytesOmitted:removed.flatMap(x=>x.members).reduce((n,x)=>n+x.bytes,0)}));
