import { spawnSync } from 'node:child_process';
import { readFile, readdir, access, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'../../outputs/dead-signal/mobile/v1.0.0/DeadSignal-Mobile-1.0.0-source.zip');
const skip=new Set(['node_modules','build','.gradle','.git','xcuserdata','DerivedData','.swiftpm','.DS_Store']);
const generatedCopies=new Set(['android/app/src/main/assets/public','ios/App/App/public','release/source-package-files.json']);
let exists=false;try{await access(output);exists=true;}catch{}if(exists)throw Error('Source artifact already exists; preserve it instead of updating a ZIP in place.');
const files=[];async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(skip.has(entry.name))continue;const p=resolve(dir,entry.name),path=relative(root,p);if(generatedCopies.has(path)||entry.name==='local.properties'||/\.(keystore|jks|p12|mobileprovision|xcuserstate)$/.test(entry.name)||entry.name.startsWith('.env'))continue;if(entry.isDirectory())await walk(p);else if(entry.isFile())files.push(path);else if(entry.isSymbolicLink())throw Error('Unexpected symlink in source package: '+path);}}await walk(root);files.sort();
const hashes={};for(const file of files){const b=await readFile(resolve(root,file));hashes[file]={bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}
const manifest=resolve(root,'release/source-package-files.json');await writeFile(manifest,JSON.stringify({version:'1.0.0',excluded:['node_modules','build caches','local SDK paths','signing keys/certificates','user profile files','generated native public copies (restored by npx cap sync)'],files:hashes},null,2)+'\n');files.push('release/source-package-files.json');
// Standard zip keeps executable bits for Gradle and native build scripts.
const zipped=spawnSync('/usr/bin/zip',['-q','-3',output,'-@'],{cwd:root,input:files.join('\n')+'\n',encoding:'utf8',maxBuffer:1024*1024});if(zipped.status!==0)throw Error(zipped.stderr||'source zip failed');
const check=spawnSync('/usr/bin/unzip',['-tq',output],{encoding:'utf8',maxBuffer:1024*1024});if(check.status!==0)throw Error(check.stderr||check.stdout||'source zip CRC failed');
const b=await readFile(output),report={version:'1.0.0',files:files.length,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),crcVerified:true,signingSecretsIncluded:false,nodeModulesIncluded:false,archive:output};await writeFile(resolve(root,'../../outputs/dead-signal/mobile/v1.0.0/source-package.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
