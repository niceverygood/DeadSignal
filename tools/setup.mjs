import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js22 or newer is required.');
const projects=['work/meshy-sprite-baker','work/asset-motion-baker-v027','work/asset-enemy-motion-baker-v029','outputs/dead-signal/production-assets/rig-lab'];
if(process.argv.includes('--mobile'))projects.push('work/dead-signal-mobile');
for(const project of projects){
  console.log('Restoring locked dependencies:',project);
  const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:resolve(root,project),stdio:'inherit',shell:process.platform==='win32'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
console.log('Dependencies ready. Game: npm start. Art gallery: npm run review. No paid generation or old registration script was run.');
