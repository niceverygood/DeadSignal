import fs from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(fs.readFileSync('.transfer/manifest.json','utf8'));
const selected=manifest.files.filter(row=>/^work\/dead-signal-game\/dist\/assets\/production\/boss-[^/]+\/[^/]+$/.test(row.path));
const rows=[];
for(const row of selected){
 let bytes=null,sha256=null,error=null;
 try{bytes=fs.statSync(row.path).size;const hash=createHash('sha256');for await(const chunk of fs.createReadStream(row.path))hash.update(chunk);sha256=hash.digest('hex');}catch(value){error=value?.message??String(value);}
 rows.push({path:row.path,expectedBytes:row.bytes,bytes,expectedSHA256:row.sha256,sha256,same:bytes===row.bytes&&sha256===row.sha256,error});
}
const registry=JSON.parse(fs.readFileSync('work/dead-signal-game/dist/boss-rig/registry.json','utf8'));
const models=[];
const hashFile=async path=>{const hash=createHash('sha256');for await(const chunk of fs.createReadStream(path))hash.update(chunk);return hash.digest('hex');};
for(const [key,config] of Object.entries(registry.bosses)){
 const original=config.original,delivered='work/dead-signal-game/dist/boss-rig/'+config.file,originalRow=manifest.files.find(row=>row.path===original);
 let originalSHA=null,deliveredSHA=null,error=null;
 try{originalSHA=await hashFile(original);deliveredSHA=await hashFile(delivered);}catch(value){error=value?.message??String(value);}
 models.push({key,original,delivered,registrySHA:config.sha256,manifestSHA:originalRow?.sha256??null,originalSHA,deliveredSHA,same:!!originalRow&&originalSHA===originalRow.sha256&&deliveredSHA===originalSHA&&config.sha256===originalSHA,error});
}
const result={at:new Date().toISOString(),runtime:process.version,note:'Read-only independent subset of the existing immutable transfer manifest. This does not change the manifest or replace npm run verify, whose existing .gitignore mismatch is recorded separately. The 24 current registry originals are checked against their historical manifest entries, registry SHA and delivered model copies. Original GLBs include geometry, UV, texture and authored skin/animation data. New non-model files absent from that historical manifest are outside this subset.',files:rows.length,modelGLBs:models.length,bytes:rows.reduce((sum,r)=>sum+(r.bytes??0),0),mismatches:[...rows,...models].filter(r=>!r.same),rows,models};
fs.writeFileSync('qa/boss-motion-20261018/original-boss-assets-check.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,rows:undefined,models:undefined},null,2));
if(result.modelGLBs!==24||result.mismatches.length)process.exitCode=1;
