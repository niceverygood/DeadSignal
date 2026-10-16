import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { productionManifest } from '../dist/production-manifest.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),web=resolve(root,'dist');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=JSON.parse(await readFile(resolve(root,'release/source-provenance.json'),'utf8'));
const original=resolve(source.sourceFolder,'dist'),modified=new Set(['app.js','audio.js','index.html']);
const unchanged={};
for(const [name,hash] of Object.entries(source.sourceRuntimeFiles))if(!modified.has(name)){
  const bytes=await readFile(resolve(web,name));assert.equal(sha(bytes),hash,name+' changed unexpectedly');unchanged[name]=hash;
}
const nativeAssets={};
for(const [id,a] of Object.entries(productionManifest.assets)){
  const members={};
  for(const key of ['metadata','atlas','bodyAlpha'])if(a[key]){
    const file='assets/production/'+a[key];const bytes=await readFile(resolve(web,file));
    assert.deepEqual(bytes,await readFile(resolve(original,file)),id+' / '+key+' must retain exact original art');members[key]={path:file,bytes:bytes.length,sha256:sha(bytes)};
  }
  nativeAssets[id]=members;
}
const index=await readFile(resolve(web,'index.html'),'utf8');
assert.match(index,/data-release-channel="store"/);assert.match(index,/\.\/mobile-runtime\.js\?v=1\.0\.0/);
const bridge=await readFile(resolve(web,'mobile-runtime.js'),'utf8');assert.match(bridge,/import\("\.\/app\.js\?v=0\.26\.0"\)/);
const files={};async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,entry.name);if(entry.isDirectory())await walk(p);else{const b=await readFile(p);files[relative(web,p)]={bytes:b.length,sha256:sha(b)};}}}await walk(web);
const references=[];
for(const [name] of Object.entries(files))if(/\.(js|html|css)$/.test(name)){
  const text=await readFile(resolve(web,name),'utf8');
  const pattern=/(?:\bfrom\s*|\bimport\s*\(|\b(?:src|href)=)["'](\.\.?\/[^"']+)["']/g;
  for(const m of text.matchAll(pattern)){
    const ref=m[1].split(/[?#]/)[0],target=resolve(dirname(resolve(web,name)),ref);
    assert.ok(target.startsWith(web+'/'),'reference escapes bundled web root: '+name+' '+ref);assert.ok((await stat(target)).isFile(),'missing '+ref);references.push({from:name,to:relative(web,target)});
  }
}
const config=JSON.parse(await readFile(resolve(root,'capacitor.config.json'),'utf8'));
assert.equal(config.webDir,'dist');assert.equal(config.server.url,undefined);assert.equal(config.server.cleartext,undefined);
assert.equal(config.android.webContentsDebuggingEnabled,false);assert.equal(config.ios.webContentsDebuggingEnabled,false);
const report={version:'1.0.0',baseWebVersion:'0.26.0',unchangedRuntimeFiles:unchanged,nativeAssetCount:Object.keys(nativeAssets).length,nativeAssets,webFiles:files,relativeReferences:references.length,externalRuntimeServer:false,artPixelChanges:false,realBilling:false};
await writeFile(resolve(root,'release/web-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({version:report.version,unchangedRuntimeFiles:Object.keys(unchanged).length,nativeAssets:report.nativeAssetCount,webFiles:Object.keys(files).length,relativeReferences:references.length,artPixelChanges:false}));
