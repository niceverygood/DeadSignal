// Temporary local arrival watcher for this active task; no network or browser operations.
import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url));
let prior='';const end=Date.now()+30*60*1000;
while(Date.now()<end){
 const dir=root+'outputs/dead-signal/production-assets/models/';
 const entries=(await fs.readdir(dir)).filter(s=>s.startsWith('env-')&&s.endsWith('-v1')).sort();
 const inventory=[];
 for(const e of entries){try{const s=await fs.stat(dir+e+'/model.glb');inventory.push(e+':'+s.size+':'+s.mtimeMs);}catch{}}
 const fingerprint=inventory.join('|');
 if(fingerprint!==prior){
  await new Promise(resolve=>setTimeout(resolve,1000));
  const result=await run(process.execPath,['work/meshy-sprite-baker/inspect-environments.mjs'],{cwd:root,maxBuffer:2000000});
  await run(process.execPath,['work/build-env-native-registration.mjs'],{cwd:root,maxBuffer:2000000});
  const measured=JSON.parse(await fs.readFile(root+'work/environment-glb-measurements.json','utf8'));
  console.log(JSON.stringify({inventory:inventory.length,ready:measured.measurements.filter(x=>x.ready).length,summary:measured.measurements.filter(x=>x.ready).map(x=>({id:x.id,fit:x.chosenFit.fitted,yaw:x.chosenFit.frontYawDegrees,gate:x.geometryGate})),errors:measured.measurements.filter(x=>x.error).map(x=>({id:x.id,error:x.error}))}));
  if(measured.measurements.filter(x=>x.ready).length===16)break;
  prior=fingerprint;
 }
 await new Promise(resolve=>setTimeout(resolve,15000));
}
console.log('arrival-watcher-finished');
