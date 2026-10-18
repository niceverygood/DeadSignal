// QA-only independent whole before module. Importing this file runs no Game.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Navigation} from '../../work/dead-signal-game/dist/navigation.js';
import {enemyGridAllocationStats} from '../../work/dead-signal-game/dist/enemy-separation-grid.js';
import {ROOF_EXPEDITION,SEA_EXPEDITION,NORTH_EXPEDITION} from '../../work/dead-signal-game/dist/expedition.js';

const directory=new URL('./',import.meta.url),gameRoot=new URL('../../work/dead-signal-game/',directory),engineURL=new URL('dist/engine.js',gameRoot),helperURL=new URL('dist/enemy-separation-grid.js',gameRoot),qaRoot=fileURLToPath(new URL('../',directory));
export const PINNED_SOURCES=Object.freeze({engine:'72487b352161059b5745a3e5cfc149ff71ae3f7b98c7e310b5d8b3a5345260ce',candidate:'25729a8d916a153859542f62288e73279866ed6d4ed06c390218274e0e2f694b',grid:'938bed7097a7cd0db0659744bb1a18747f1ddeb943ae810633abf2fce4b21da7',fixture:'6b92a458bcdcbde255eb413e5bf8bf9f313b951f32fd08129944897ccb922df8',model:'9e066a693078ae8fd7aa01d7bbd39829598e356f8191bf9b725e483d0b88a9ce',navigation:'549e01276b6b670234df5c80507ef30b8f1ec1513be8477281e59b38e21367d9'});
const sha=value=>createHash('sha256').update(value).digest('hex'),moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const rebase=(source,base)=>source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_all,quote,specifier)=>'from '+quote+new URL(specifier,base).href+quote);
const helperImport="import {acquireEnemyGrid,recordFreshEnemyGrid} from './enemy-separation-grid.js';";
const inspectedExport='\nexport const __qaOwners=owners;\n';
const declaration='    let neighborhoods;\n    try{\n    neighborhoods=new Map();',oldFinally='    }finally{lease?.release();}',newFinally='    }finally{try{try{if(neighborhoods)for(const slots of neighborhoods.values())slots.length=0;}finally{neighborhoods?.clear();}}finally{lease?.release();}}';
const expectedBlock=`      let neighborhood=null;
      if(compact&&Number.isInteger(cx)&&Number.isInteger(cy)&&cx>=-32768&&cx<32768&&cy>=-32768&&cy<32768){
        const key=cx*65536+cy;neighborhood=neighborhoods.get(key);
        if(!neighborhood&&neighborhoods.size<256){
          neighborhood=new Array(9);let slot=0;
          for(let gx=cx-1;gx<=cx+1;gx++)for(let gy=cy-1;gy<=cy+1;gy++)neighborhood[slot++]=grid.get(compact?gx*65536+gy:gx+','+gy);
          neighborhoods.set(key,neighborhood);
        }
      }
      if(neighborhood){
        for(let slot=0;slot<9;slot++){
          const neighbors=neighborhood[slot];if(!neighbors?.length)continue;
          for(const other of neighbors){if(other===e||other.dead)continue;const ox=e.x-other.x,oy=e.y-other.y,d2=ox*ox+oy*oy,min=e.r+other.r-3;if(d2<min*min&&d2>.01){const d=Math.sqrt(d2);sx+=ox/d*(min-d)*3;sy+=oy/d*(min-d)*3;}}
        }
      }else{
        for(let gx=cx-1;gx<=cx+1;gx++)for(let gy=cy-1;gy<=cy+1;gy++){
          const neighbors=grid.get(compact?gx*65536+gy:gx+','+gy);if(!neighbors?.length)continue;
          for(const other of neighbors){if(other===e||other.dead)continue;const ox=e.x-other.x,oy=e.y-other.y,d2=ox*ox+oy*oy,min=e.r+other.r-3;if(d2<min*min&&d2>.01){const d=Math.sqrt(d2);sx+=ox/d*(min-d)*3;sy+=oy/d*(min-d)*3;}}
        }
      }
`;
function once(source,needle){assert.equal(source.split(needle).length,2,'one approved source match: '+needle.slice(0,60));}
export async function loadSources(){
 const [originalBytes,candidateBytes,gridBytes,fixtureBytes,production,helper,fixture,model,navigation]=await Promise.all([readFile(new URL('current-engine.txt',directory)),readFile(new URL('candidate-engine.mjs',directory)),readFile(new URL('current-grid-helper.txt',directory)),readFile(new URL('stress-fixture.txt',directory)),readFile(engineURL),readFile(helperURL),readFile(new URL('tests/engine.test.mjs',gameRoot)),readFile(new URL('dist/upgrade-model.js',gameRoot)),readFile(new URL('dist/navigation.js',gameRoot))]);
 const hashes={engine:sha(originalBytes),candidate:sha(candidateBytes),grid:sha(gridBytes),fixture:sha(fixtureBytes),model:sha(model),navigation:sha(navigation)};for(const key of Object.keys(PINNED_SOURCES))assert.equal(hashes[key],PINNED_SOURCES[key],key+' SHA changed');assert.deepEqual(production,originalBytes,'production engine remains whole original');assert.deepEqual(helper,gridBytes,'production grid helper unchanged');assert.deepEqual(fixture,fixtureBytes,'original stress callback file unchanged');assert.equal(originalBytes.length,59149);assert.equal(candidateBytes.length,60233);assert.equal(gridBytes.length,3866);assert.equal(fixtureBytes.length,29739);
 const original=originalBytes.toString('utf8'),candidate=candidateBytes.toString('utf8'),start=original.indexOf('      for(let gx=cx-1;gx<=cx+1;gx++)for(let gy=cy-1;gy<=cy+1;gy++){'),end=original.indexOf('      if(e.vx||e.vy)',start);assert.ok(start>=0&&end>start);const oldBlock=original.slice(start,end);assert.equal(Buffer.byteLength(oldBlock),399);once(candidate,declaration);once(candidate,expectedBlock);once(candidate,newFinally);once(original,oldFinally);assert.equal(candidate.replace(declaration,'    try{').replace(expectedBlock,oldBlock).replace(newFinally,oldFinally),original,'only three independently scoped source replacements; AI/math and other bytes remain original');
 const pair=oldBlock.slice(oldBlock.indexOf('for(const other of neighbors)'),oldBlock.indexOf('\n      }')).trim();assert.ok(pair);assert.equal(expectedBlock.split(pair).length,3,'fast and fallback preserve the exact original sequential pair body');
 return{original,candidate,grid:gridBytes.toString('utf8'),hashes,bytes:{engine:originalBytes.length,candidate:candidateBytes.length,grid:gridBytes.length,fixture:fixtureBytes.length}};
}
export async function loadModules({inspectGrid=false}={}){
 const sources=await loadSources();let helperModule=null,helperModuleURL=null;
 if(inspectGrid){const inspected=sources.grid+inspectedExport;assert.equal(inspected.slice(0,-inspectedExport.length),sources.grid);assert.equal(inspected.slice(-inspectedExport.length),inspectedExport);helperModuleURL=moduleURL(rebase(inspected,helperURL));helperModule=await import(helperModuleURL);}
 const load=async(arm,source)=>{if(inspectGrid){once(source,helperImport);source=source.replace(helperImport,"import {acquireEnemyGrid,recordFreshEnemyGrid} from '"+helperModuleURL+"';");}return import(moduleURL(rebase(source,engineURL)+'\n//# sourceURL='+engineURL.href+'?qa-enemy-neighborhood='+arm+(inspectGrid?'&inspect-grid=1':'')));};
 return{sources,original:await load('original',sources.original),candidate:await load('candidate',sources.candidate),stats:inspectGrid?helperModule.enemyGridAllocationStats:enemyGridAllocationStats,owners:helperModule?.__qaOwners??null};
}
export function validateOutputPath(value){const out=path.resolve(value),relative=path.relative(qaRoot,out);assert.ok(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));assert.equal(path.extname(out).toLowerCase(),'.json');return out;}
export function qualify(error){const result={name:'UnknownThrownValue',message:'',stack:null};try{result.name=typeof error?.name==='string'?error.name:typeof error;}catch{}try{result.message=typeof error?.message==='string'?error.message:String(error);}catch{result.message='unreadable-thrown-value';}try{result.stack=typeof error?.stack==='string'?error.stack.slice(0,12000):null;}catch{}return result;}
export function captureGame(g){return structuredClone({snapshot:g.snapshot(),state:g.state,player:g.player,enemies:g.enemies,world:g.world,bullets:g.bullets.map(b=>({...b,hits:[...b.hits]})),particles:g.particles,corpses:g.corpses,texts:g.texts,links:g.links,pickups:g.pickups,fires:g.fires,throwables:g.throwables,lure:g.lure,alarm:g.alarm,hostileProjectiles:g.hostileProjectiles,bossHazards:g.bossHazards,events:g.events,random:g.random.getState(),visualRandom:g.visualRandom.getState(),result:g.result,time:g.time,stageTime:g.stageTime,id:g.id,kills:g.kills,parts:g.parts,pendingLevels:g.pendingLevels,choices:g.choices,combo:g.combo,comboTime:g.comboTime,noise:g.noise,shake:g.shake,flash:g.flash,spawnClock:g.spawnClock,bossId:g.boss?.id??null,expedition:g.expedition});}
const types=['walker','runner','shield','screamer','gas','elite','collector'],step=1/60;
function empty(Game,options={}){const g=new Game({seed:774,weapon:'nailgun',...options});g.enemies=[];g.world.obstacles=[];g.navigation=new Navigation(g.world);g.spawnClock=1e9;return g;}
function add(g,type,x,y){const e=g.spawnEnemy(type,450);assert.ok(e);Object.assign(e,{x,y});return e;}
function check(a,b,stats,label){assert.deepEqual(captureGame(b),captureGame(a),label);for(const g of [a,b]){const report=stats(g);assert.equal(report.retainedActors,0,label+' releases all live actors');assert.ok(report.retainedBuckets<=256);}}

export async function runOracle(out){
 out=validateOutputPath(out);const report={tool:'qa-enemy-neighborhood-oracle',passed:false,sourceSHA:null,cases:[],errors:[],note:'Independent full original and candidate modules; approved three source replacements only. Unmodified Map/Array/Math intrinsics. The inspection helper differs only by an appended private owners export in both arms; the actual full-Game and CPU proofs use production helper. Controlled isolated arenas/coordinates and private existing-array mutations exercise lifecycle semantics, not normal spawning or performance. Private Map membership/value replacement during a pair callback is explicitly unsupported by the memo scope and is not claimed equivalent. No speed/FPS/heap/visual claim.'};
 try{
  const m=await loadModules(),O=m.original.Game,C=m.candidate.Game;report.sourceSHA=m.sources.hashes;
  const record=(name,run)=>{run();report.cases.push({name,passed:true});};
  record('same-cell/all-nine boundaries/all-seven types/order/forceFresh/noncompact/bounded edges',()=>{
   for(const fresh of [false,true])for(const mode of ['same','nine','strings','min','max','outside-low','outside-high']){const make=Game=>{const g=empty(Game);g.forceFreshEnemyGrid=fresh;if(mode==='strings')g.world.width=55*32768+1;const base=mode==='min'?-32768:mode==='max'?32767:mode==='outside-low'?-32769:mode==='outside-high'?32768:14;for(let i=0;i<28;i++)add(g,types[i%7],base*55+(mode==='nine'?(i%3-1)*55:0)+3+i%4,base*55+(mode==='nine'?(Math.floor(i/3)%3-1)*55:0)+3+Math.floor(i/4)%4);return g;};const a=make(O),b=make(C),keys=Object.keys(b);for(let tick=0;tick<3;tick++){a.updateEnemies(step);b.updateEnemies(step);check(a,b,m.stats,mode+'/'+fresh);}assert.deepEqual(Object.keys(b),keys,'no public Game memo fields');}
  });
  record('live actor getter reads and sequential earlier movement remain original',()=>{
   const make=Game=>{const g=empty(Game),log=[];for(let i=0;i<8;i++){const e=add(g,types[i%6],800+i%4*12,700+Math.floor(i/4)*12);for(const key of ['x','y','r','dead']){let value=e[key];Object.defineProperty(e,key,{enumerable:true,configurable:true,get(){log.push(e.id+'.'+key);return value;},set(next){value=next;}});}}const move=g.move;g.move=function(...args){log.push('move.'+args[0].id);return Reflect.apply(move,this,args);};return{g,log};};const a=make(O),b=make(C);for(let tick=0;tick<3;tick++){a.g.updateEnemies(step);b.g.updateEnemies(step);assert.deepEqual(b.log,a.log);check(a.g,b.g,m.stats,'live reads');assert.deepEqual(b.log,a.log);}
  });
  record('burn/fire/death/gas explosion/collector obstacle destruction/same-tick screamer spawn',()=>{
   // Keep the positive scream probe outside the real gas/car damage chain;
   // otherwise the normally vulnerable screamer dies before its update turn.
   const make=Game=>{const g=empty(Game),gas=add(g,'gas',950,750);g.damageEnemy(gas,gas.hp-7);Object.assign(gas,{burn:1,burnTick:0});for(let i=0;i<8;i++)add(g,types[i%6],970+i*14,760+i%3*15);const scream=add(g,'screamer',1800,1300);scream.skillCd=0;const collector=add(g,'collector',1220,900);Object.assign(collector,{attackState:'charge',attackTime:.9,angle:0,skillCd:5});g.world.obstacles.push({id:++g.id,x:930,y:730,w:22,h:45,kind:'car',hp:1,maxHp:1,destroyed:false},{id:++g.id,x:1230,y:880,w:30,h:50,kind:'fence',hp:1,maxHp:1,destroyed:false});g.fires.push({x:980,y:760,r:30,time:1,emberClock:.1});g.placeLure(1000,780);return g;};const a=make(O),b=make(C);for(let tick=0;tick<6;tick++){a.updateEnemies(step);b.updateEnemies(step);check(a,b,m.stats,'effects');}assert.ok(b.events.some(e=>e.type==='kill'));assert.ok(b.events.some(e=>e.type==='explosion'));assert.ok(b.events.some(e=>e.type==='scream'));assert.ok(b.world.obstacles.every(o=>o.destroyed));
  });
  record('reentrant update and original thrown movement identity release all grid references',()=>{
   const make=Game=>{const g=empty(Game);for(let i=0;i<8;i++)add(g,types[i%6],800+i%4*16,700+Math.floor(i/4)*16);const move=g.move;let nested=false;g.move=function(...args){const result=Reflect.apply(move,this,args);if(!nested){nested=true;this.updateEnemies(0);}return result;};return g;};const a=make(O),b=make(C);a.updateEnemies(step);b.updateEnemies(step);check(a,b,m.stats,'reentrant');assert.equal(m.stats(b).acquisitions,2);assert.equal(m.stats(b).mapsCreated,2);
   const marker=Error('controlled original move failure'),x=empty(O),y=empty(C);for(const g of [x,y]){add(g,'walker',800,700);g.move=()=>{throw marker;};let error;try{g.updateEnemies(step);}catch(e){error=e;}assert.equal(error,marker);assert.equal(m.stats(g).retainedActors,0);}assert.deepEqual(captureGame(y),captureGame(x));
  });
  record('capacity bound and repeated actor references preserve original visits without leaked public fields',()=>{
   const make=Game=>{const g=empty(Game);for(let i=0;i<210;i++)add(g,types[i%6],200+i*55,500);const template=g.enemies[0];for(let i=210;i<260;i++)g.enemies.push({...template,id:++g.id,x:200+i*55,y:500});g.enemies.push(g.enemies[0]);return g;};const a=make(O),b=make(C),keys=Object.keys(b);a.updateEnemies(step);b.updateEnemies(step);check(a,b,m.stats,'isolated over-normal-cap');assert.deepEqual(Object.keys(b),keys);assert.equal(b.enemies.length,261);
  });
  record('normal210 cap replacement during a contact callback preserves the original active array iterator',()=>{
   const make=Game=>{const g=empty(Game);for(let i=0;i<210;i++)add(g,'walker',i===0?g.player.x+20:650+i%15*22,i===0?g.player.y:500+Math.floor(i/15)*22);let replaced=false;const hurt=g.hurtPlayer;g.hurtPlayer=function(...args){const result=Reflect.apply(hurt,this,args);if(!replaced){replaced=true;assert.ok(this.spawnEnemy('elite',450));}return result;};return g;};const a=make(O),b=make(C),first=b.enemies[0];a.updateEnemies(step);b.updateEnemies(step);check(a,b,m.stats,'cap replacement');assert.equal(b.enemies.length,210);assert.equal(b.enemies.includes(first),false);assert.equal(b.enemies.at(-1).type,'elite');
  });
  record('roof/water/transport worlds, restore and owner transition retain physical outcomes',()=>{
   for(const expedition of [ROOF_EXPEDITION,SEA_EXPEDITION,NORTH_EXPEDITION]){const a=new O({seed:774,weapon:'nailgun',expeditionId:expedition.id}),b=new C({seed:774,weapon:'nailgun',expeditionId:expedition.id});for(let i=0;i<8;i++){a.tick(step,{moveX:.2,moveY:0,shoot:false});b.tick(step,{moveX:.2,moveY:0,shoot:false});check(a,b,m.stats,expedition.id);}const sa=a.snapshot(),sb=b.snapshot();assert.ok(sa);assert.deepEqual(sb,sa);const ar=O.restore(sa,{resumePlaying:true}),br=C.restore(sb,{resumePlaying:true});assert.ok(ar&&br);assert.equal(m.stats(br).mapsCreated,0);ar.tick(step,{shoot:false});br.tick(step,{shoot:false});check(ar,br,m.stats,'restored');}
  });
  const inspected=await loadModules({inspectGrid:true});
  record('stable alias references plus empty-to-nonempty existing bucket arrays retain visits and length checks',()=>{
   const make=Game=>{const g=empty(Game),first=add(g,'walker',800,700),other=add(g,'runner',806,704),emptyBucket=[],observed=[];let initialized=false,filled=false,attack=first.attackCd,radius=first.r;Object.defineProperty(first,'attackCd',{enumerable:true,configurable:true,get(){if(!initialized){initialized=true;const grid=inspected.owners.get(g).grid,cx=Math.floor(first.x/55),cy=Math.floor(first.y/55),key=(x,y)=>x*65536+y,bucket=[other];grid.set(key(cx-1,cy-1),bucket);grid.set(key(cx-1,cy),emptyBucket);grid.set(key(cx-1,cy+1),bucket);observed.push(bucket,emptyBucket);}return attack;},set(value){attack=value;}});Object.defineProperty(first,'r',{enumerable:true,configurable:true,get(){if(initialized&&!filled){filled=true;emptyBucket.push(other);}return radius;},set(value){radius=value;}});return{g,observed,filled:()=>filled};};const a=make(inspected.original.Game),b=make(inspected.candidate.Game);a.g.updateEnemies(step);b.g.updateEnemies(step);check(a.g,b.g,inspected.stats,'existing arrays');assert.equal(a.filled(),true);assert.equal(b.filled(),true);assert.ok(a.observed.every(bucket=>bucket.length===0));assert.ok(b.observed.every(bucket=>bucket.length===0));
  });
  report.passed=true;
 }catch(error){report.errors.push(qualify(error));}
 await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const args=process.argv.slice(2);assert.deepEqual(args.slice(0,1),['--out']);assert.equal(args.length,2);const report=await runOracle(args[1]);process.stdout.write(JSON.stringify({passed:report.passed,cases:report.cases.length,out:path.resolve(args[1])})+'\n');if(!report.passed)process.exitCode=1;}catch(error){process.stderr.write(JSON.stringify({status:'report-not-written',error:qualify(error)})+'\n');process.exitCode=1;}}
