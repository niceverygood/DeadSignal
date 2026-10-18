import assert from 'node:assert/strict';
import {access,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Game} from '../../work/dead-signal-game/dist/engine.js';

const outputURL=new URL(process.argv[2]||'./ground-depth-node-diagnostic.json',import.meta.url);
try{await access(outputURL);throw new Error('Refusing to overwrite existing diagnostic evidence: '+outputURL.href);}catch(error){if(error.code!=='ENOENT')throw error;}

const originalBytes=await readFile(new URL('./projection-before-ground-depth.txt',import.meta.url));
const originalSha256=createHash('sha256').update(originalBytes).digest('hex');
assert.equal(originalSha256,'b7f066e335fcd89c7cf67fc523b1e62b3094ca0a61cd438bf21c822edeb42082');
const legacy=await import('data:text/javascript;base64,'+originalBytes.toString('base64'));
const candidateBytes=await readFile(new URL('./projection-candidate-ground-depth.txt',import.meta.url));
const candidateSha256=createHash('sha256').update(candidateBytes).digest('hex');
assert.equal(candidateSha256,'64a0b970e58c6c082e4256ecfd47b41b3bc672b1740a7cd11f74f7154bb1dee9');
const {projectGroundDepth}=await import('data:text/javascript;base64,'+candidateBytes.toString('base64'));
const originalDepth=(x,y)=>legacy.project(x,y).y;
const game=new Game({seed:774,weapon:'nailgun',stageDuration:1e9});
while(game.enemies.length<180)game.spawnEnemy(game.enemies.length%3===0?'runner':'walker',430);
const points=[...game.enemies.map(e=>[e.x,e.y]),[game.player.x,game.player.y],
 ...game.world.obstacles.map(o=>[o.x+o.w,o.y+o.h]),...(game.world.decor||[]).map(d=>[d.x,d.y])];
for(const [x,y]of points)assert.ok(Object.is(originalDepth(x,y),projectGroundDepth(x,y)));
const before=JSON.stringify(game.snapshot()),rng=[game.random.getState(),game.visualRandom.getState()];

// Independent drivers keep each arm's timed call site separate. Both arms return
// only depth scalars, as the real renderer does; object escape is not forced.
// This is a Node projection microbenchmark, with no Canvas/WebGL/browser or
// tick/render loop. V8 may already scalar-replace the original temporary object.
const driver=calculate=>new Function('calculate','points','rounds',
 'let sum=0;for(let r=0;r<rounds;r++)for(let i=0;i<points.length;i++)sum+=calculate(points[i][0],points[i][1]);return sum;').bind(null,calculate,points);
const rounds=20000,trials=[];
for(let trial=0;trial<3;trial++){
 const arms=[];
 for(const [name,calculate]of [['original',originalDepth],['scalar',projectGroundDepth],['original-repeat',originalDepth]]){
  const run=driver(calculate);run(200);
  const cpuStart=process.cpuUsage(),start=performance.now(),checksum=run(rounds),wallMs=performance.now()-start,cpu=process.cpuUsage(cpuStart);
  arms.push({name,wallMs,cpuMs:(cpu.user+cpu.system)/1000,checksum,calls:points.length*rounds});
 }
 assert.ok(arms.every(arm=>Object.is(arm.checksum,arms[0].checksum)));
 trials.push({trial:trial+1,arms});
}
assert.equal(JSON.stringify(game.snapshot()),before);
assert.deepEqual([game.random.getState(),game.visualRandom.getState()],rng);
const result={diagnosticOnly:true,originalSha256,candidateSha256,points:points.length,rounds,trials,numericDepthExact:true,checksumsExact:true,gameUnchanged:true,
 note:'Node numeric depth-call microbenchmark only. Coordinates come from one original 180-enemy Game and its world. No Canvas commands, image decode, native rendering, actual FPS, heap, RAM or VRAM is measured. Original object escape is not forced and V8 may eliminate it already. Timings include runtime/environment variability; syntactic removal does not establish allocation savings. This script now loads the same byte-exact saved candidate because the mixed CPU result did not support default adoption; the original evidence JSON is not overwritten.'};
await writeFile(outputURL,JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify(result,null,2));
