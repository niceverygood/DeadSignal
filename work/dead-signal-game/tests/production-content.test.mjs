import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,openSync,readSync,closeSync,statSync,realpathSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
import {productionManifest} from '../dist/production-manifest.js';
import {ProductionArt,extendProductionAssets,validateAtlasMetadata,spriteMuzzlePlacement,spritePlacement} from '../dist/production-art.js';
import {playerGroundingHeight} from '../dist/player-grounding.js';
import {Renderer} from '../dist/renderer.js';
import {productionLaunchPlan} from '../dist/launch-gate.js';
import {matchesEnvironmentRule,validEnvironmentRule} from '../dist/production-rules.js';
import {Game} from '../dist/engine.js';
import {MISSIONS,getBoss} from '../dist/campaign.js';

const assetRoot=realpathSync(fileURLToPath(new URL('../dist/assets/production/',import.meta.url)));
const workspaceRoot=realpathSync(fileURLToPath(new URL('../../../',import.meta.url)));
const outputRoot=realpathSync(fileURLToPath(new URL('../../../outputs/dead-signal/production-assets/sprites/',import.meta.url)));
const frozenRoot=resolve(workspaceRoot,'outputs/dead-signal/playable/v0.26.1/dist/assets/production');
const baselineSource=readFileSync(resolve(workspaceRoot,'outputs/dead-signal/playable/v0.26.1/dist/production-manifest.js'),'utf8');
const baselineManifest=JSON.parse(baselineSource.slice(baselineSource.indexOf('{'),baselineSource.lastIndexOf('}')+1));
const baselineMetadata=id=>JSON.parse(readFileSync(resolve(frozenRoot,baselineManifest.assets[id].metadata),'utf8'));
const portableEvidenceSources=JSON.parse(readFileSync(resolve(workspaceRoot,'.transfer/evidence-source-paths.json'),'utf8'));
function portableEvidenceDirectory(evidence){
  const relative=portableEvidenceSources[evidence.id];
  assert.equal(typeof relative,'string',evidence.id+' has a relocated raw export');
  assert.ok(relative.startsWith('work/asset-enemy-motion-baker-v029/exports/'));
  assert.ok(!relative.includes('\\')&&!relative.split('/').some(part=>part==='..'||part==='.'));
  assert.ok(String(evidence.sourceDirectory).replaceAll('\\','/').endsWith('/'+relative),'historical recorded source and relocated source agree');
  const directory=realpathSync(resolve(workspaceRoot,relative));
  assert.ok(directory.startsWith(workspaceRoot+sep),'raw evidence is read from this restored workspace only');
  return directory;
}
const validated=new Map(),headers=new Map();
const keys=object=>Object.keys(object).sort();
const ids=mapping=>typeof mapping==='string'?[mapping]:[...new Set(Object.values(mapping))];
const bossKeys=MISSIONS.flatMap(mission=>[mission.midBoss,mission.finalBoss]).sort();
const enemyKeys=['walker','runner','shield','screamer','gas','elite','collector'].sort();
const detailMap=Object.fromEntries(bossKeys.map(key=>[key,`${key}-detail-hd`]));
async function fileSHA256(file){const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');}
function assetPath(relative){
  assert.equal(typeof relative,'string');assert.ok(relative.length>0);assert.ok(!/[\\?#]/.test(relative));
  const path=realpathSync(resolve(assetRoot,relative));assert.ok(path.startsWith(assetRoot+sep),`${relative} stays inside actual production assets`);
  assert.ok(statSync(path).isFile()&&statSync(path).size>32,relative);return path;
}
function pngHeader(relative){
  if(headers.has(relative))return headers.get(relative);
  const file=openSync(assetPath(relative),'r'),bytes=Buffer.alloc(33);
  try{assert.equal(readSync(file,bytes,0,bytes.length,0),33);}finally{closeSync(file);}
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10],relative);
  assert.equal(bytes.readUInt32BE(8),13);assert.equal(bytes.toString('ascii',12,16),'IHDR');
  const header={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),bitDepth:bytes[24],colorType:bytes[25]};
  assert.ok(header.width>0&&header.height>0);assert.equal(header.bitDepth,8);assert.equal(header.colorType,6,'actual Canvas PNG retains RGBA channels');
  headers.set(relative,header);return header;
}
function metadata(id){
  if(validated.has(id))return validated.get(id);
  const descriptor=productionManifest.assets[id];assert.ok(descriptor,`registered ${id}`);
  const result=validateAtlasMetadata(JSON.parse(readFileSync(assetPath(descriptor.metadata),'utf8')));
  validated.set(id,result);return result;
}
const capture=game=>JSON.stringify({snapshot:game.snapshot(),world:game.world,player:game.player,enemies:game.enemies,events:game.events,particles:game.particles,random:game.random.getState(),visual:game.visualRandom.getState(),id:game.id});

test('the actual production catalog covers exactly 24 canonical bosses, 7 enemy roles and both armed survivor locomotion/action profiles',()=>{
  const original=JSON.stringify(productionManifest),validatedManifest=extendProductionAssets({assets:{},characters:{},bosses:{},enemies:{},environment:{}},productionManifest);
  assert.deepEqual(keys(validatedManifest.bosses),bossKeys);assert.equal(bossKeys.length,24);
  assert.deepEqual(keys(validatedManifest.enemies),enemyKeys);
  assert.deepEqual(keys(validatedManifest.characters),['survivor-nailgun','survivor-shotgun']);
  for(const poses of Object.values(validatedManifest.characters))assert.deepEqual(keys(poses),['actions','idle','run','walk']);
  for(const section of ['bosses','characters','enemies','environment','bossPortraits','bossDetailPortraits'])for(const mapping of Object.values(validatedManifest[section]))
    for(const id of ids(mapping))assert.ok(Object.hasOwn(productionManifest.assets,id),`${section}:${id}`);
  for(const key of bossKeys)assert.equal(getBoss(key).id,key);
  assert.equal(JSON.stringify(productionManifest),original);
});

test('every registered real metadata/atlas/body-alpha file exists, validates unclipped and agrees with its PNG IHDR dimensions',()=>{
  let atlases=0,masks=0;
  for(const [id,descriptor]of Object.entries(productionManifest.assets)){
    const source=metadata(id),header=pngHeader(descriptor.atlas);atlases++;
    assert.equal(header.width,source.atlas.width,id);assert.equal(header.height,source.atlas.height,id);
    assert.equal(source.atlas.transparent,true);assert.ok(source.frames.every(frame=>frame.clipped===false));
    assert.equal(source.source?.format,'glb',`${id} came from native GLB rendering`);
    assert.equal(source.appearance?.floor,false,id);assert.equal(source.appearance?.shadow,false,id);
    if(descriptor.bodyAlpha){const mask=pngHeader(descriptor.bodyAlpha);masks++;assert.equal(mask.width,source.atlas.width,id);assert.equal(mask.height,source.atlas.height,id);}
  }
  assert.equal(atlases,Object.keys(productionManifest.assets).length);assert.equal(atlases,157);
  assert.equal(Object.keys(productionManifest.assets).filter(id=>id.endsWith('-rig-motion')).length,33,'24bosses+7NPCs+2armed survivor action reels');
  assert.equal(Object.keys(productionManifest.assets).filter(id=>!id.endsWith('-detail-hd')).length,133,'all historical gameplay/thumbnail IDs and33 action reels remain, with31 separate HQ32 locomotion sheets');
  assert.equal(Object.keys(productionManifest.assets).filter(id=>id.endsWith('-locomotion-hq32')).length,31);
  assert.ok(masks>=6);
});

test('all24 HD detail keys map exactly to separate native sheets while the original24 thumbnails retain their72MiB budget',()=>{
  const validatedManifest=extendProductionAssets({assets:{},characters:{},bosses:{},enemies:{},environment:{}},productionManifest);
  assert.deepEqual(productionManifest.bossDetailPortraits,detailMap);
  assert.deepEqual(validatedManifest.bossDetailPortraits,detailMap);
  assert.deepEqual(keys(productionManifest.assets).filter(id=>id.endsWith('-detail-hd')),Object.values(detailMap).sort());
  assert.equal(new Set(Object.values(detailMap)).size,24);
  let thumbnailBytes=0;
  for(const key of bossKeys){
    const detailId=detailMap[key],descriptor=productionManifest.assets[detailId],source=metadata(detailId),header=pngHeader(descriptor.atlas);
    assert.equal(source.atlas.directions,8,detailId);assert.equal(source.atlas.samples,1,detailId);assert.equal(source.atlas.frameSize,512,detailId);
    assert.equal(source.atlas.columns,4,detailId);assert.equal(source.atlas.rows,2,detailId);assert.equal(source.frames.length,8,detailId);
    assert.equal(header.width,2048,detailId);assert.equal(header.height,1024,detailId);assert.equal(header.width*header.height*4,8*1024*1024,'each native HD sheet is8MiB decoded RGBA');
    assert.ok(!Object.hasOwn(descriptor,'bodyAlpha'),'HD portraits must not request an unnecessary decoded body mask');
    assert.ok(!ids(productionManifest.bosses[key]).includes(detailId),'HD is not substituted into gameplay');
    const thumbnailId=productionManifest.bossPortraits[key];assert.notEqual(thumbnailId,detailId);
    const thumbnail=pngHeader(productionManifest.assets[thumbnailId].atlas);thumbnailBytes+=thumbnail.width*thumbnail.height*4;
    assert.equal(metadata(thumbnailId).atlas.frameSize,256,'the existing lightweight thumbnails remain unchanged');
    const original=baselineMetadata(ids(baselineManifest.bosses[key])[0]);
    assert.equal(source.source.file,original.source.file,`${key} HD retains the original approved native source while gameplay adds derived rig clips`);
    assert.ok(Math.abs(source.projection.subjectHeight-original.projection.subjectHeight)<1e-10,key);
    assert.equal(source.appearance.material,'unlit');assert.equal(source.appearance.baseColor,'original GLB map and color factor');
    assert.ok(source.frames.every(frame=>frame.clipped===false&&frame.sample===0&&frame.time===0),detailId);
    for(const frame of source.frames)for(const bounds of[frame.alphaBounds,frame.outlineBounds,frame.coreBounds])if(bounds){
      assert.ok(bounds.x>0&&bounds.y>0&&bounds.x+bounds.width<512&&bounds.y+bounds.height<512,`${detailId}:${frame.index} alpha bounds remain inside the frame`);
    }
    if(getBoss(key).role==='mid'){assert.equal(source.animation.name,'Armature|walking_man|baselayer');assert.equal(source.animation.samples,1);}
    else assert.equal(source.animation,null);
  }
  assert.equal(thumbnailBytes,72*1024*1024,'HD detail registration does not expand the existing thumbnail set');
});

test('all24 native HD game/output copies match pinned export bytes and actual approved GLB provenance, including repaired10final',async()=>{
  const registration=JSON.parse(readFileSync(resolve(workspaceRoot,'work/v020-native-detail-registration-plan.json'),'utf8'));
  assert.equal(registration.records.length,24);assert.deepEqual(registration.additions.bossDetailPortraits,detailMap);
  assert.equal(registration.validation.framesVerified,192);assert.equal(registration.validation.allPixelBodyOutlineCoreBoundsExact,true);
  assert.equal(registration.validation.allFrameBorderAlphaZero,true);
  const pixelReport=resolve(workspaceRoot,registration.validation.pixelReport.file);
  assert.equal(await fileSHA256(pixelReport),registration.validation.pixelReport.sha256,'the actual192-frame alpha-bound evidence remains pinned');
  for(const key of bossKeys){
    const id=detailMap[key],source=metadata(id),record=registration.records.find(record=>record.bossKey===key);
    assert.ok(record);assert.equal(record.assetId,id);assert.equal(record.sourceGLB.matchesApprovedPlan,true);
    const model=realpathSync(resolve(workspaceRoot,record.sourceGLB.file));
    assert.ok(model.startsWith(resolve(workspaceRoot,'work/meshy-sprite-baker/models')+sep));
    assert.equal(await fileSHA256(model),record.sourceGLB.sha256,`${id} retains its actual approved GLB bytes`);
    assert.ok(record.sourceGLB.file.endsWith('/'+source.source.file),id);
    assert.equal(record.files.length,3);
    for(const file of record.files){
      assert.ok(['atlas.png','body-alpha.png','metadata.json'].includes(file.name));
      const gameFile=assetPath(`${id}/${file.name}`),outputFile=realpathSync(resolve(outputRoot,id,file.name));
      assert.ok(outputFile.startsWith(outputRoot+sep));
      assert.equal(statSync(gameFile).size,file.bytes);assert.equal(statSync(outputFile).size,file.bytes);
      assert.equal(await fileSHA256(gameFile),file.sha256,`${id}/${file.name} matches the actual original native export`);
      assert.equal(await fileSHA256(outputFile),file.sha256,`${id}/${file.name} game/output copies are byte-identical`);
    }
    const mask=pngHeader(`${id}/body-alpha.png`);assert.equal(mask.width,2048);assert.equal(mask.height,1024);
  }
  const repaired=metadata('boss-10-final-detail-hd'),record=registration.records.find(record=>record.bossKey==='boss-10-final');
  assert.equal(repaired.source.file,'boss-10-final-repaired-v2.glb');assert.equal(repaired.source.stats.meshes,5);assert.equal(repaired.source.stats.triangles,46183);
  assert.equal(record.sourceGLB.sha256,'11167d631fc9725ee1b9b9d95df66dcf37006256de297fc65776188691fefed0','the rear-X and track repair must not regress to the unapproved generatedv2');
});

test('all24 bosses and7 NPCs bind actual skinned16direction six-action native reels with512frames',()=>{
  const all=[...bossKeys.map(key=>[key,productionManifest.bosses[key]]),...enemyKeys.map(type=>[type,productionManifest.enemies[type]])];
  for(const [key,mapping] of all){
    assert.deepEqual(keys(mapping),['actions','idle','walk'],key);assert.equal(mapping.idle,mapping.walk,key);assert.ok(mapping.actions.endsWith('-rig-motion'),key);assert.ok(mapping.walk.endsWith('-locomotion-hq32'),key);
    const source=metadata(mapping.actions);assert.equal(source.atlas.directions,16,key);assert.equal(source.atlas.samples,32,key);
    assert.equal(source.atlas.frameSize,256,key);assert.equal(source.frames.length,512,key);
    assert.ok(source.source.rig.skins>0&&source.source.rig.bones>=12,key);assert.ok(source.source.stats.skinnedMeshes>0,key);
    assert.equal(source.animation.type,'skeletal-action-reel',key);assert.equal(source.animation.name,'DS_MotionReel',key);
    assert.deepEqual(keys(source.animation.clips),['attack','death','hit','idle','walk','windup']);
    assert.deepEqual(Object.fromEntries(Object.entries(source.animation.clips).map(([name,c])=>[name,[c.start,c.count,c.loop]])),{
      idle:[0,4,true],walk:[4,8,true],windup:[12,6,false],attack:[18,6,false],hit:[24,2,false],death:[26,6,false],
    });
    assert.equal(source.atlas.packing,'trimmed-v1');assert.equal(source.packing.allFramesPixelExact,true);
    assert.equal(source.packing.sourceDecodedBytes,128*1024*1024);assert.equal(source.packing.packedDecodedBytes,source.atlas.width*source.atlas.height*4);
    assert.ok(source.packing.packedDecodedBytes<55*1024*1024,`${key} keeps native256px detail within55MiB by removing transparent padding`);
    for(const hash of[source.packing.sourceAtlasSHA256,source.packing.visiblePixelsSHA256])assert.match(hash,/^[a-f0-9]{64}$/);
    assert.ok(source.frames.every(frame=>frame.untrimmedOffset&&Number.isInteger(frame.untrimmedOffset.x)&&Number.isInteger(frame.untrimmedOffset.y)),key);
  }
});

test('all eight real survivor locomotion and action bindings include their native weapon and finite yawed muzzle in every frame',()=>{
  let poses=0,frames=0;
  for(const weapon of ['shotgun','nailgun'])for(const [pose,id]of Object.entries(productionManifest.characters[`survivor-${weapon}`])){
    const source=metadata(id);poses++;assert.equal(source.atlas.includesWeapon,true,id);assert.equal(source.atlas.directions,16,id);assert.equal(source.atlas.frameSize,256,id);
    assert.equal(source.atlas.samples,pose==='idle'?1:32,id);assert.ok(productionManifest.assets[id].bodyAlpha,id);
    assert.equal(source.nativeWeapon.bodyAlphaIncludesWeapon,false,id);
    for(const frame of source.frames){
      const point=frame.weaponMuzzle;assert.ok(point&&[point.x,point.y,point.z].every(Number.isFinite),`${id}:${frame.index}`);assert.ok(point.z>0&&point.z<source.projection.subjectHeight);
      const muzzle=spriteMuzzlePlacement(source,frame,{foot:{x:0,y:0},worldHeight:44});assert.ok(muzzle);assert.ok([muzzle.height,muzzle.point.x,muzzle.point.y].every(Number.isFinite));frames++;
    }
  }
  assert.equal(poses,8);assert.equal(frames,3104);
});

test('the real portrait map preserves twelve lightweight mid sheets and static finals separately from motion gameplay',()=>{
  assert.deepEqual(keys(productionManifest.bossPortraits),bossKeys);let lightweight=0;
  for(const key of bossKeys){
    const id=productionManifest.bossPortraits[key],source=metadata(id);
    if(getBoss(key).role==='mid'){
      assert.equal(id,`${key}-portrait`);assert.ok(!ids(productionManifest.bosses[key]).includes(id));
      assert.equal(source.atlas.directions,8,id);assert.equal(source.atlas.samples,1,id);assert.equal(source.atlas.frameSize,256,id);
      assert.equal(source.source.file,`${key}-walk.glb`);assert.equal(source.animation.name,'Armature|walking_man|baselayer');
      assert.ok(source.frames.every(frame=>frame.sample===0&&frame.time===0),id);lightweight++;
    }else{assert.equal(id,baselineManifest.bossPortraits[key],`${key} retains its approved static thumbnail`);assert.ok(!ids(productionManifest.bosses[key]).includes(id),'large action sheets never become codex thumbnails');assert.equal(source.atlas.samples,1);assert.equal(source.animation,null);}
  }
  assert.equal(lightweight,12);
});

test('actual catalog portrait selection reads only its real lightweight files, never implicit walking sheets or pixel masks',async()=>{
  const requests=[],images=[],baseURL=new URL('https://local-content.test/assets/production/');
  const relative=url=>{const parsed=new URL(url);assert.equal(parsed.origin,baseURL.origin);assert.ok(parsed.pathname.startsWith(baseURL.pathname));return decodeURIComponent(parsed.pathname.slice(baseURL.pathname.length));};
  // The file-backed browser adapter reads real JSON and only PNG headers. It
  // neither manufactures artwork nor fully decodes these large source images.
  const fetchImpl=async url=>{const path=relative(url);requests.push(path);return{ok:true,text:async()=>readFileSync(assetPath(path),'utf8')};};
  const HeaderImage=class{set src(url){const path=relative(url),header=pngHeader(path);images.push(path);this.path=path;this.naturalWidth=header.width;this.naturalHeight=header.height;queueMicrotask(()=>this.onload?.());}};
  const art=new ProductionArt({manifest:productionManifest,baseURL,fetchImpl,ImageCtor:HeaderImage});
  const draws=[],context=new Proxy({globalAlpha:1,drawImage:image=>draws.push(image.path),createRadialGradient:()=>({addColorStop(){}}),measureText:text=>({width:String(text).length*7})},{get:(object,key)=>key in object?object[key]:()=>{}});
  const canvas={width:180,height:190,getContext:()=>context,getBoundingClientRect:()=>({width:180,height:190})},renderer=Object.assign(Object.create(Renderer.prototype),{productionArt:art});
  const game=new Game({seed:19501,missionId:'mission-01'});game.pause();const before=capture(game);
  for(const key of bossKeys)renderer.nativePortrait(canvas,key);
  assert.ok((await Promise.all([...art.records.values()].map(record=>record.promise))).every(Boolean));
  const wanted=new Set(Object.values(productionManifest.bossPortraits));assert.deepEqual(new Set(art.records.keys()),wanted);
  assert.equal(requests.length,24);assert.equal(images.length,24);assert.ok(!images.some(path=>path.endsWith('body-alpha.png')));
  for(const mission of MISSIONS)for(const id of ids(productionManifest.bosses[mission.midBoss]))assert.equal(art.status(id),'idle',id);
  for(const key of bossKeys)renderer.nativePortrait(canvas,key);assert.equal(draws.length,24);assert.equal(requests.length,24);assert.equal(images.length,24);
  assert.equal(capture(game),before);
});

test('all 184 actual mission buildings match one exact native rule, with 172 common cells and twelve unique landmarks, without state drift',()=>{
  let count=0,common=0,landmarks=0;const landmarkEntries=new Set();
  assert.ok(productionManifest.environmentRules.every(validEnvironmentRule));
  for(const mission of MISSIONS){
    const game=new Game({seed:19520+mission.index,missionId:mission.id}),before=capture(game),world=structuredClone(game.world);
    for(const obstacle of game.world.obstacles.filter(object=>object.kind==='building')){
      const matches=productionManifest.environmentRules.filter(rule=>matchesEnvironmentRule(rule,obstacle,game.world));assert.equal(matches.length,1,`${mission.id}:${obstacle.label}:${obstacle.x},${obstacle.y}`);
      const rule=matches[0];assert.ok(productionManifest.environment[rule.entry]);assert.ok(productionManifest.assets[productionManifest.environment[rule.entry]]);
      for(const key of ['x','y','w','h'])assert.ok(Object.hasOwn(rule,key),`${rule.entry} uses exact immutable geometry`);
      if(rule.entry==='env-common-brick')common++;else{landmarks++;landmarkEntries.add(rule.entry);}count++;
    }
    const plan=productionLaunchPlan({manifest:productionManifest,weapon:game.player.weapon,mission,world:game.world});
    assert.deepEqual(new Set(plan.playerIds),new Set(Object.values(productionManifest.characters['survivor-shotgun'])));
    assert.deepEqual(new Set(plan.maskIds),new Set(plan.playerIds));assert.ok(!plan.assetIds.some(id=>id.endsWith('-portrait')));
    const selectedBosses=new Set([...ids(productionManifest.bosses[mission.midBoss]),...ids(productionManifest.bosses[mission.finalBoss])]);
    const allBossAssets=new Set(Object.values(productionManifest.bosses).flatMap(ids));
    assert.deepEqual(new Set(plan.assetIds.filter(id=>allBossAssets.has(id))),selectedBosses);
    assert.deepEqual(game.world,world);assert.equal(capture(game),before);
  }
  assert.equal(count,184);assert.equal(common,172);assert.equal(landmarks,12);assert.equal(landmarkEntries.size,12);
});

// The approved static codex images remain immutable even though gameplay now
// refers to derived skinned animation GLBs with deliberately different names.
test('all24 original thumbnails and24 HD descriptors and bytes remain pinned to the frozen approved catalog',async()=>{
  assert.deepEqual(productionManifest.bossPortraits,baselineManifest.bossPortraits);
  assert.deepEqual(productionManifest.bossDetailPortraits,baselineManifest.bossDetailPortraits);
  const portraitIds=new Set([...Object.values(baselineManifest.bossPortraits),...Object.values(baselineManifest.bossDetailPortraits)]);
  assert.equal(portraitIds.size,48);
  for(const id of portraitIds){
    const descriptor=productionManifest.assets[id];assert.deepEqual(descriptor,baselineManifest.assets[id],`${id} keeps its paths and revision`);
    for(const field of ['metadata','atlas','bodyAlpha'])if(descriptor[field]){
      const current=assetPath(descriptor[field]),approved=resolve(frozenRoot,descriptor[field]);
      assert.equal(await fileSHA256(current),await fileSHA256(approved),`${id}/${field} approved bytes remain identical`);
    }
    assert.ok(!id.endsWith('-rig-motion'),'a whole animation reel must never be loaded for a static card');
  }
});

function glbInfo(file){
  const fd=openSync(file,'r'),header=Buffer.alloc(20);
  try{
    assert.equal(readSync(fd,header,0,20,0),20);assert.equal(header.toString('ascii',0,4),'glTF');assert.equal(header.readUInt32LE(4),2);
    assert.equal(header.readUInt32LE(16),0x4e4f534a);
    const jsonLength=header.readUInt32LE(12),data=Buffer.alloc(jsonLength);assert.equal(readSync(fd,data,0,jsonLength,20),jsonLength);
    const j=JSON.parse(data.toString('utf8')),chunk=Buffer.alloc(8);assert.equal(readSync(fd,chunk,0,8,20+jsonLength),8);assert.equal(chunk.readUInt32LE(4),0x004e4942);
    return{file,json:j,binOffset:28+jsonLength,binLength:chunk.readUInt32LE(0)};
  }finally{closeSync(fd);}
}
async function rangeSHA256(file,start,length){
  const hash=createHash('sha256');for await(const bytes of createReadStream(file,{start,end:start+length-1}))hash.update(bytes);return hash.digest('hex');
}
function accessorRows(info,index){
  const accessor=info.json.accessors[index],view=info.json.bufferViews[accessor.bufferView];
  const count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[accessor.type];
  const size={5121:1,5123:2,5126:4}[accessor.componentType];assert.ok(count&&size&&!accessor.sparse,'native numeric accessor is supported');
  const stride=view.byteStride||count*size,length=(accessor.count-1)*stride+count*size,buffer=Buffer.alloc(length),fd=openSync(info.file,'r');
  try{assert.equal(readSync(fd,buffer,0,length,info.binOffset+(view.byteOffset||0)+(accessor.byteOffset||0)),length);}finally{closeSync(fd);}
  const value=(row,component)=>{const offset=row*stride+component*size;return accessor.componentType===5126?buffer.readFloatLE(offset):accessor.componentType===5123?buffer.readUInt16LE(offset):buffer.readUInt8(offset);};
  return{accessor,count,value};
}
function actualMotionModel(assetId){
  const modelId=assetId.startsWith('survivor-')?'survivor':assetId.replace(/-rig-motion$/,'');
  const folder=resolve(outputRoot,'../models',`${modelId}-motion-v1`),final=modelId.endsWith('-final');
  const provenance=JSON.parse(readFileSync(resolve(folder,final?'rig-provenance.json':'motion-provenance.json'),'utf8'));
  const original=final?resolve(workspaceRoot,provenance.source):resolve(outputRoot,'..',provenance.sourceWalking);
  return{modelId,provenance,original,derived:resolve(folder,'model.glb'),final};
}

test('all32 actual actor bodies have real weighted joints and six varying GLB clips while original geometry UV textures and binary data remain exact',async()=>{
  const motionIds=keys(productionManifest.assets).filter(id=>id.endsWith('-rig-motion')),visited=new Set();assert.equal(motionIds.length,33);
  for(const id of motionIds){
    const model=actualMotionModel(id);if(visited.has(model.modelId))continue;visited.add(model.modelId);
    assert.equal(await fileSHA256(model.derived),model.provenance.sha256,id);
    const source=metadata(id);assert.equal(await fileSHA256(resolve(workspaceRoot,'work/asset-motion-baker-v027/models',source.source.file)),model.provenance.sha256,`${id} was baked from its actual derived GLB`);
    const before=glbInfo(model.original),after=glbInfo(model.derived);
    assert.equal(await rangeSHA256(model.original,before.binOffset,before.binLength),await rangeSHA256(model.derived,after.binOffset,before.binLength),`${id} retains its original source binary prefix exactly`);
    for(const field of ['materials','images','textures','samplers'])assert.deepEqual(after.json[field],before.json[field],`${id} retains native ${field}`);
    assert.deepEqual(after.json.bufferViews.slice(0,before.json.bufferViews.length),before.json.bufferViews,id);
    assert.deepEqual(after.json.accessors.slice(0,before.json.accessors.length),before.json.accessors,id);
    for(let meshIndex=0;meshIndex<before.json.meshes.length;meshIndex++)for(let primitive=0;primitive<before.json.meshes[meshIndex].primitives.length;primitive++){
      const original=before.json.meshes[meshIndex].primitives[primitive],derived=after.json.meshes[meshIndex].primitives[primitive];
      for(const [attribute,index]of Object.entries(original.attributes))assert.equal(derived.attributes[attribute],index,`${id} original ${attribute} accessor stays exact`);
      assert.equal(derived.indices,original.indices,id);assert.equal(derived.material,original.material,id);
    }
    assert.ok(after.json.skins.length>0,id);const weighted=new Set();
    for(const node of after.json.nodes.filter(node=>node.mesh!==undefined)){
      assert.ok(Number.isInteger(node.skin)&&after.json.skins[node.skin],`${id} actual render mesh references a skin`);
      const skin=after.json.skins[node.skin];assert.ok(skin.joints.length>=12,id);
      for(const primitive of after.json.meshes[node.mesh].primitives){
        const a=primitive.attributes;assert.ok(a.JOINTS_0!==undefined&&a.WEIGHTS_0!==undefined,id);
        const weights=accessorRows(after,a.WEIGHTS_0),joints=accessorRows(after,a.JOINTS_0);assert.equal(weights.accessor.count,after.json.accessors[a.POSITION].count,id);assert.equal(joints.accessor.count,weights.accessor.count,id);
        for(let vertex=0;vertex<weights.accessor.count;vertex++){
          let sum=0;for(let k=0;k<4;k++){const w=weights.value(vertex,k),joint=joints.value(vertex,k);assert.ok(Number.isFinite(w)&&w>=0&&w<=1,id);sum+=w;if(w>1e-7){assert.ok(joint<skin.joints.length,id);weighted.add(skin.joints[joint]);}}
          assert.ok(Math.abs(sum-1)<1e-4,`${id} vertex weights are normalized`);
        }
      }
    }
    assert.ok(weighted.size>=8,`${id} has meaningful anatomical joint coverage`);
    const animations=after.json.animations;
    for(const name of['idle','walk','windup','attack','hit','death']){
      const clip=animations.find(clip=>new RegExp(`^DS_${name}$`,'i').test(clip.name)||(name==='walk'&&clip.name==='Armature|walking_man|baselayer'));
      assert.ok(clip&&clip.channels.length>0,`${id} includes real ${name} channels`);
      const varying=clip.samplers.some(sampler=>{const output=accessorRows(after,sampler.output);for(let row=1;row<output.accessor.count;row++)for(let k=0;k<output.count;k++)if(Math.abs(output.value(row,k)-output.value(0,k))>1e-6)return true;return false;});
      assert.ok(varying,`${id}/${name} changes actual joint transforms`);
    }
    assert.ok(animations.some(clip=>clip.name===source.animation.name),id);
    if(model.final){assert.equal(model.provenance.structuralValidation,'passed');assert.ok(model.provenance.weights.every(row=>row.maxWeightSumError<1e-6));}
    else{assert.deepEqual(model.provenance.structuralIssues,[]);assert.ok(Object.values(model.provenance.preservation).every(Boolean));assert.equal(await fileSHA256(model.original),model.provenance.sourceWalkingSha256);}
  }
  assert.equal(visited.size,32,'24bosses+7NPCs+one native survivor body, with two equipped weapon reels');
});

test('the four packed HQ32 survivor sheets preserve all2048 ground anchors muzzle and body contours at original resolution',async()=>{
  let frames=0;
  const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
  for(const weapon of['shotgun','nailgun'])for(const pose of['walk','run']){
    const id=`survivor-${weapon}-${pose}`,source=metadata(id),baseline=baselineMetadata(id),descriptor=productionManifest.assets[id];
    assert.equal(descriptor.metadata,`${id}-hq32-packed/metadata.json`);assert.equal(source.atlas.packing,'trimmed-v1');assert.equal(source.atlas.samples,32);assert.equal(source.atlas.directions,16);assert.equal(source.atlas.frameSize,256);
    assert.deepEqual(source.source,baseline.source,'original GLB, scale and normalization remain unchanged');assert.deepEqual(source.nativeWeapon,baseline.nativeWeapon);
    assert.equal(source.packing.allFramesPixelExact,true);assert.equal(source.packing.sourceAtlasSHA256,await fileSHA256(resolve(frozenRoot,baselineManifest.assets[id].atlas)));
    assert.ok(source.packing.packedDecodedBytes<28*1024*1024,'transparent packing cuts128MiB original to under28MiB with no pixel resize');
    for(let index=0;index<source.frames.length;index++){
      const a=baseline.frames[index],b=source.frames[index],foot={x:1000,y:1200},old=spritePlacement(baseline,a,{foot,worldHeight:44}),packed=spritePlacement(source,b,{foot,worldHeight:44});
      for(const part of['body','core','outline'])for(const edge of['left','right','top','bottom'])near(old.bounds[part][edge],packed.bounds[part][edge],`${id}/${index}/${part}/${edge}`);
      assert.deepEqual(spriteMuzzlePlacement(source,b,{foot,worldHeight:44}),spriteMuzzlePlacement(baseline,a,{foot,worldHeight:44}));
      assert.equal(playerGroundingHeight({metadata:source,frame:b}),playerGroundingHeight({metadata:baseline,frame:a}));
      for(const side of['left','right','top'])for(let point=0;point<a.bodyIdentificationContour[side].length;point++){
        const pa=a.bodyIdentificationContour[side][point],pb=b.bodyIdentificationContour[side][point];near(old.x+pa.x*old.scale,packed.x+pb.x*packed.scale,'body contour x');near(old.y+pa.y*old.scale,packed.y+pb.y*packed.scale,'body contour y');
      }
      frames++;
    }
  }
  assert.equal(frames,2048);
});

test('all37 newly registered packed atlases and masks match canonical outputs and pinned registration metadata',async()=>{
  const report=JSON.parse(readFileSync(resolve(workspaceRoot,'outputs/dead-signal/production-assets/audits/2026-10-16/runtime-motion-registration.json'),'utf8'));
  assert.equal(report.count,37);assert.equal(report.assets.length,37);assert.equal(report.staticPortraitsPreserved,true);assert.equal(report.humanProfileTouched,false);
  for(const record of report.assets){
    const descriptor=productionManifest.assets[record.id],source=metadata(record.id);assert.equal(descriptor.revision,record.metadataSHA256);
    assert.equal(await fileSHA256(assetPath(descriptor.metadata)),record.metadataSHA256);assert.equal(source.packing.allFramesPixelExact,true);
    for(const field of['metadata','atlas','bodyAlpha'])assert.equal(await fileSHA256(assetPath(descriptor[field])),await fileSHA256(resolve(outputRoot,record.folder,field==='metadata'?'metadata.json':field==='atlas'?'atlas.png':'body-alpha.png')),`${record.id}/${field} matches the verified canonical export`);
  }
});

// Full-density walking is a separate render of the real weighted GLB clip.
// The attack/death sheets, hero, approved portraits and environments retain
// their exact original bytes and descriptors.
test('all31 NPC locomotion sheets have32 real looping poses per direction with fixed native scale root compensation and512 persisted unclipped frames',async()=>{
  const batch=JSON.parse(readFileSync(resolve(workspaceRoot,'work/asset-enemy-motion-baker-v029/batches/locomotion-hq32.json'),'utf8'));
  const report=JSON.parse(readFileSync(resolve(workspaceRoot,'outputs/dead-signal/production-assets/audits/2026-10-16/V029-LOCOMOTION-PIXEL-VERIFICATION.json'),'utf8'));
  assert.equal(batch.jobs.length,31);assert.equal(report.actors,31);assert.equal(report.frames,15872);assert.equal(report.allSavedPixelsVerified,true);
  const actualIds=keys(productionManifest.assets).filter(id=>id.endsWith('-locomotion-hq32'));
  assert.deepEqual(actualIds,batch.jobs.map(job=>job.id).sort());let frames=0;
  for(const job of batch.jobs){
    const id=job.id,m=metadata(id),descriptor=productionManifest.assets[id],evidence=report.assets.find(record=>record.id===id);
    assert.ok(evidence,id);assert.equal(evidence.frames,512,id);assert.equal(evidence.allVisibleRGBAAndMaskPixelsExact,true,id);assert.equal(evidence.projectionAndGroundAnchorsExact,true,id);
    assert.equal(m.atlas.samples,32,id);assert.equal(m.atlas.directions,16,id);assert.equal(m.atlas.frameSize,256,id);assert.equal(m.frames.length,512,id);
    assert.equal(m.animation.loop,true,id);assert.equal(m.animation.name,job.clip,id);assert.equal(m.animation.samples,32,id);assert.ok(!m.animation.clips,'walk is one complete loop, not8frames cut from a reel');
    assert.equal(m.source.file,job.model,id);assert.equal(m.source.scale,job.uniformScale,id);assert.deepEqual(m.source.originPivot,job.originPivot,id);
    assert.equal(m.appearance.material,job.shading,id);assert.equal(m.appearance.baseColor,'original GLB map and color factor',id);
    assert.ok(m.source.rig.skins>0&&m.source.rig.bones>=12&&m.source.stats.skinnedMeshes>0,id);
    assert.equal(m.packing.allFramesPixelExact,true,id);assert.equal(m.packing.sourceDecodedBytes,128*1024*1024,id);
    assert.equal(m.packing.sourceAtlasSHA256,evidence.sourceAtlasSHA256,id);
    assert.equal(await fileSHA256(assetPath(descriptor.metadata)),evidence.metadataSHA256,id);assert.equal(descriptor.revision,evidence.metadataSHA256,id);
    assert.equal(await fileSHA256(assetPath(descriptor.atlas)),evidence.atlasSHA256,id);assert.equal(await fileSHA256(assetPath(descriptor.bodyAlpha)),evidence.bodyMaskSHA256,id);
    assert.equal(await fileSHA256(resolve(portableEvidenceDirectory(evidence),'atlas.png')),evidence.sourceAtlasSHA256,id);assert.equal(await fileSHA256(resolve(portableEvidenceDirectory(evidence),'body-alpha.png')),evidence.sourceBodyMaskSHA256,id);assert.equal(await fileSHA256(resolve(portableEvidenceDirectory(evidence),'metadata.json')),evidence.sourceMetadataSHA256,id);
    const original=JSON.parse(readFileSync(resolve(portableEvidenceDirectory(evidence),'metadata.json'),'utf8'));
    for(const field of['source','projection','animation','appearance','coreRegion'])assert.deepEqual(m[field],original[field],id+'/'+field);
    const actionId=id.replace('-locomotion-hq32','-rig-motion'),action=metadata(actionId);
    assert.equal(m.source.scale,action.source.scale,id);assert.deepEqual(m.source.originPivot,action.source.originPivot,id);assert.ok(Math.abs(m.projection.subjectHeight-action.projection.subjectHeight)<1e-9,id);
    const boss=id.startsWith('boss-'),key=boss?id.replace('-locomotion-hq32',''):id.replace(/^enemy-/,'').replace('-locomotion-hq32','');
    assert.deepEqual(productionManifest[boss?'bosses':'enemies'][key],{idle:id,walk:id,actions:actionId});
    const derived=glbInfo(resolve(workspaceRoot,'work/asset-enemy-motion-baker-v029/models',job.model));
    const source=glbInfo(resolve(workspaceRoot,'work/asset-motion-baker-v027/models',action.source.file));
    for(const field of['meshes','nodes','skins','materials','images','textures'])assert.deepEqual(derived.json[field],source.json[field],id+' preserves '+field);
    assert.equal(await rangeSHA256(derived.file,derived.binOffset,source.binLength),await rangeSHA256(source.file,source.binOffset,source.binLength),id+' original native binary remains unchanged');
    assert.ok(derived.json.animations.some(clip=>clip.name===job.clip),id+' actual baked animation exists');
    if(job.model.includes('-grounded-locomotion-v1')){
      const folder=resolve(outputRoot,'../models',job.model.replace(/\.glb$/,''));const provenance=JSON.parse(readFileSync(resolve(folder,'grounding-provenance.json'),'utf8'));
      assert.equal(await fileSHA256(derived.file),provenance.sha256,id+' renderer used the verified grounded source');assert.equal(await fileSHA256(source.file),provenance.sourceSHA256,id+' grounded source points to the untouched native body');
      for(const field of['originalBinaryPrefixExact','originalGeometrySkinUVTextureExact','originalClipsExact'])assert.equal(provenance[field],true,id+'/'+field);
      const authored=provenance.clips.find(clip=>clip.clip===job.clip);assert.ok(authored,id);assert.equal(authored.legOnlyRotationCorrection,true,id);assert.equal(authored.originalClipPreserved,true,id);assert.ok(authored.minAfter>=0,id+' corrected skinned soles do not penetrate the authored floor');
    }
    for(let index=0;index<m.frames.length;index++){
      const a=original.frames[index],b=m.frames[index];assert.equal(b.index,index);assert.equal(b.direction,Math.floor(index/32));assert.equal(b.sample,index%32);assert.equal(b.time,m.animation.duration*(index%32)/32);assert.equal(b.clipped,false);
      for(const field of['groundBounds','rootCompensation','screenForward','projectedBodyBounds','projectedCoreBounds'])assert.deepEqual(b[field],a[field],id+'/'+index+'/'+field);
      assert.ok(b.bodyIdentificationContour&&b.untrimmedOffset,id+'/'+index+' contains native mask contour and exact crop offset');
      assert.ok(Math.abs(b.footPivot.x+b.untrimmedOffset.x-a.footPivot.x)<1e-9&&Math.abs(b.footPivot.y+b.untrimmedOffset.y-a.footPivot.y)<1e-9,id+'/'+index+' original ground pivot retained');frames++;
    }
    assert.equal(Object.keys(evidence.uniquePosesPerDirection).length,16,id);assert.ok(Object.values(evidence.uniquePosesPerDirection).every(count=>count>=16),id+' dense sampling contains distinct actual skin poses');
  }
  assert.equal(frames,15872);
});

test('all126 prior descriptors and asset bytes plus armed hero portrait and environment mappings remain exact to frozenv028',async()=>{
  const frozen=resolve(workspaceRoot,'outputs/dead-signal/playable/v0.28.0/dist');
  const text=readFileSync(resolve(frozen,'production-manifest.js'),'utf8');const prior=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1));
  assert.equal(Object.keys(prior.assets).length,126);
  for(const section of['characters','bossPortraits','bossDetailPortraits','environment','environmentRules'])assert.deepEqual(productionManifest[section],prior[section],section);
  for(const [id,descriptor]of Object.entries(prior.assets)){
    assert.deepEqual(productionManifest.assets[id],descriptor,id+' descriptor');
    for(const field of['metadata','atlas','bodyAlpha'])if(descriptor[field])assert.equal(await fileSHA256(assetPath(descriptor[field])),await fileSHA256(resolve(frozen,'assets/production',descriptor[field])),id+'/'+field+' frozen bytes');
  }
});
