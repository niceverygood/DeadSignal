import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,openSync,readSync,closeSync,statSync,realpathSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
import {productionManifest} from '../dist/production-manifest.js';
import {ProductionArt,extendProductionAssets,validateAtlasMetadata,spriteMuzzlePlacement} from '../dist/production-art.js';
import {Renderer} from '../dist/renderer.js';
import {productionLaunchPlan} from '../dist/launch-gate.js';
import {matchesEnvironmentRule,validEnvironmentRule} from '../dist/production-rules.js';
import {Game} from '../dist/engine.js';
import {MISSIONS,getBoss} from '../dist/campaign.js';

const assetRoot=realpathSync(fileURLToPath(new URL('../dist/assets/production/',import.meta.url)));
const workspaceRoot=realpathSync(fileURLToPath(new URL('../../../',import.meta.url)));
const outputRoot=realpathSync(fileURLToPath(new URL('../../../outputs/dead-signal/production-assets/sprites/',import.meta.url)));
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

test('the actual production catalog covers exactly 24 canonical bosses, 7 enemy roles and both three-pose armed survivors',()=>{
  const original=JSON.stringify(productionManifest),validatedManifest=extendProductionAssets({assets:{},characters:{},bosses:{},enemies:{},environment:{}},productionManifest);
  assert.deepEqual(keys(validatedManifest.bosses),bossKeys);assert.equal(bossKeys.length,24);
  assert.deepEqual(keys(validatedManifest.enemies),enemyKeys);
  assert.deepEqual(keys(validatedManifest.characters),['survivor-nailgun','survivor-shotgun']);
  for(const poses of Object.values(validatedManifest.characters))assert.deepEqual(keys(poses),['idle','run','walk']);
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
  assert.equal(atlases,Object.keys(productionManifest.assets).length);assert.equal(atlases,93);
  assert.equal(Object.keys(productionManifest.assets).filter(id=>!id.endsWith('-detail-hd')).length,69,'all69 original gameplay/thumbnail assets remain registered and validated above');
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
    const original=metadata(ids(productionManifest.bosses[key])[0]);
    assert.equal(source.source.file,original.source.file,`${key} keeps its approved native GLB source`);
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

test('actual middle bosses and all seven enemy types retain 16-direction eight-sample walking data; final boss mappings stay static',()=>{
  for(const key of bossKeys){
    const boss=getBoss(key);
    for(const id of ids(productionManifest.bosses[key])){
      const source=metadata(id);assert.equal(source.atlas.directions,16,key);assert.equal(source.atlas.frameSize,256,key);
      if(boss.role==='mid'){
        assert.equal(source.atlas.samples,8,key);assert.equal(source.animation.name,'Armature|walking_man|baselayer',key);assert.equal(source.animation.loop,true,key);
      }else{assert.equal(source.atlas.samples,1,key);assert.equal(source.animation,null,key);}
    }
  }
  for(const type of enemyKeys){
    const mapping=productionManifest.enemies[type];assert.equal(typeof mapping,'string',type);
    const source=metadata(mapping);assert.equal(source.atlas.directions,16,type);assert.equal(source.atlas.samples,8,type);assert.equal(source.atlas.frameSize,256,type);
    assert.equal(source.animation.name,'Armature|walking_man|baselayer',type);assert.equal(source.animation.loop,true,type);
  }
});

test('all six real survivor poses include their native weapon and finite yawed muzzle in every frame',()=>{
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
  assert.equal(poses,6);assert.equal(frames,2080);
});

test('the real portrait map has twelve lightweight first-frame sheets and reuses exact final assets',()=>{
  assert.deepEqual(keys(productionManifest.bossPortraits),bossKeys);let lightweight=0;
  for(const key of bossKeys){
    const id=productionManifest.bossPortraits[key],source=metadata(id);
    if(getBoss(key).role==='mid'){
      assert.equal(id,`${key}-portrait`);assert.ok(!ids(productionManifest.bosses[key]).includes(id));
      assert.equal(source.atlas.directions,8,id);assert.equal(source.atlas.samples,1,id);assert.equal(source.atlas.frameSize,256,id);
      assert.equal(source.source.file,`${key}-walk.glb`);assert.equal(source.animation.name,'Armature|walking_man|baselayer');
      assert.ok(source.frames.every(frame=>frame.sample===0&&frame.time===0),id);lightweight++;
    }else assert.ok(ids(productionManifest.bosses[key]).includes(id),`${key} reuses its existing static native image`);
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
