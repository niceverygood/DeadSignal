import {readFile,realpath,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const manifest=JSON.parse(await readFile(resolve(root,'.transfer/manifest.json'),'utf8'));
let count=0,bytes=0;
for(const row of manifest.files){
  if(!row.path||row.path.includes('\\')||row.path.split('/').some(p=>p==='..'||p===''))throw new Error('Invalid manifest path');
  const path=await realpath(resolve(root,row.path));
  if(!path.startsWith(root+sep))throw new Error('File escapes the restored workspace: '+row.path);
  const info=await stat(path);
  if(!info.isFile()||info.size!==row.bytes)throw new Error('Missing or changed file: '+row.path);
  const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
  if(hash.digest('hex')!==row.sha256)throw new Error('SHA256 mismatch: '+row.path);
  count++;bytes+=info.size;
  if(count%500===0)console.log('Verified',count,'/',manifest.files.length);
}
console.log(JSON.stringify({status:'passed',version:manifest.version,files:count,bytes,root}));
