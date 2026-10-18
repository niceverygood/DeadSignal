import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='qa/boss-motion-20261018',norm=p=>p.replaceAll('\\','/');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const paths=execFileSync('rg',['--files','-uu','tools','work/dead-signal-game/dist','work/dead-signal-game/tests'],{encoding:'utf8'}).trim().split(/\r?\n/).map(norm).filter(p=>/\.(?:js|mjs|html)$/.test(p));
const rows=paths.map(path=>({path,sha256:hash(path)}));
if(process.argv.includes('--freeze')){
 if(fs.existsSync(`${dir}/boss-motion-source-freeze.json`))throw Error('freeze already exists');
 fs.writeFileSync(`${dir}/boss-motion-source-freeze.json`,JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify({runtime:process.version,entries:rows.length}));
}else{
 const current=new Map(rows.map(r=>[r.path,r.sha256]));
 const compare=path=>{const old=new Map(read(path).map(r=>[norm(r.path),r.sha256]));return{baseline:old.size,current:current.size,changed:[...old].filter(([p,h])=>current.has(p)&&current.get(p)!==h).map(([path,before])=>({path,before,after:current.get(path)})),missing:[...old.keys()].filter(p=>!current.has(p)),added:[...current.keys()].filter(p=>!old.has(p))};};
 const same=(before,after)=>fs.readFileSync(before).equals(fs.readFileSync(after));
 const ui=fs.readFileSync('work/dead-signal-game/dist/qa-player-rig.js'),bossBefore=fs.readFileSync(`${dir}/qa-player-rig-before-boss-probe.txt`),decodeBefore=fs.readFileSync('qa/image-decode-20261018/qa-player-rig-before-image-decode.txt');
 const preserved=[['live-boss-before-motion.txt','boss-rig/live-boss.js'],['boss-pose-before-motion.txt','boss-rig/boss-pose.js'],['renderer-before-motion.txt','renderer.js'],['enemy-locomotion-before-motion.txt','enemy-locomotion.js'],['actor-interpolation-before-motion.txt','actor-interpolation.js']].map(([before,after])=>({path:after,same:same(`${dir}/${before}`,`work/dead-signal-game/dist/${after}`),sha256:hash(`work/dead-signal-game/dist/${after}`)}));
 preserved.push({path:'production-art.js',same:same('qa/image-decode-20261018/production-art-before-image-decode.txt','work/dead-signal-game/dist/production-art.js'),sha256:hash('work/dead-signal-game/dist/production-art.js')});
 const engine=fs.readFileSync('work/dead-signal-game/dist/engine.js','utf8'),engineReversed=engine.replace('if(knock){if(!e.bossKey){e.vx+=knock.x;e.vy+=knock.y;e.stun=.09;}','if(knock){e.vx+=knock.x;e.vy+=knock.y;e.stun=.09;').replace('if(e.bossKey){if(updateCampaignBoss(this,e,dt)){e.vx*=Math.exp(-dt*9);e.vy*=Math.exp(-dt*9);continue;}}','if(e.bossKey){if(updateCampaignBoss(this,e,dt))continue;}');
 const result={at:new Date().toISOString(),runtime:process.version,freeze:compare(`${dir}/boss-motion-source-freeze.json`),previous:compare('qa/gpu-alpha-empty-lease-20261018/empty-lease-source-freeze.json'),bossUIPrefixPreserved:ui.subarray(0,bossBefore.length).equals(bossBefore),decodeUIPrefixPreserved:ui.subarray(0,decodeBefore.length).equals(decodeBefore),uiBeforeBossBytes:bossBefore.length,uiBeforeDecodeBytes:decodeBefore.length,uiAfterBytes:ui.length,preserved,engineOnlyTwoIntentionalEdits:engineReversed===fs.readFileSync(`${dir}/engine-before-boss-hit.txt`,'utf8'),engineBeforeSHA:hash(`${dir}/engine-before-boss-hit.txt`),engineAfterSHA:hash('work/dead-signal-game/dist/engine.js')};
 fs.writeFileSync(`${dir}/boss-motion-final-check.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
