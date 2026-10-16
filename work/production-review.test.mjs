import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {productionManifest as production} from './dead-signal-game/dist/production-manifest.js';

const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'outputs/dead-signal/production-assets');
const data=JSON.parse(await fs.readFile(path.join(out,'review-manifest.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const refs=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(refs):[];

test('the actual gallery covers both weapon loadouts, all24 bosses,7 enemies,17 environment modules plus common brick and two tactical props',()=>{
 assert.equal(data.assets.length,53);assert.equal(new Set(data.assets.map(a=>a.id)).size,53);
 assert.equal(data.assets.filter(a=>a.kind==='hero').length,2);assert.equal(data.assets.filter(a=>a.kind==='boss').length,24);
 assert.equal(data.assets.filter(a=>a.kind==='enemy').length,7);assert.equal(data.assets.filter(a=>a.kind==='environment').length,18);
 for(const hero of data.assets.filter(a=>a.kind==='hero'))assert.equal(hero.sprites.filter(b=>b.registered).length,3);
 const molotov=data.assets.find(a=>a.id==='throwable-molotov');assert.equal(molotov.status,'deliverable-only');assert.equal(molotov.nativeRole,'deliverable-no-entity');
 assert.equal(data.counts.nativeIntegrated,data.assets.filter(a=>a.status==='native-integrated').length);
});

test('every displayed reference/input/model preview/QA and native atlas path is a real local file without API or GLB browser sources',async()=>{
 const images=[];for(const a of data.assets){images.push(...a.references.map(r=>r.src),...a.inputs.map(i=>i.src),...a.models.flatMap(m=>m.previews.map(p=>p.src)),...a.sprites.map(s=>s.atlas));}
 images.push(...data.qa.map(q=>q.src));
 for(const src of new Set(images)){assert.ok(!/^(https?:|\/\/)/i.test(src));assert.ok(!src.endsWith('.glb'));const file=path.resolve(out,src);assert.ok(file.startsWith(path.join(root,'outputs/dead-signal')+path.sep));assert.equal((await fs.stat(file)).isFile(),true,src);}
 assert.ok(!/https?:\/\/|msy_[a-z0-9]/i.test(JSON.stringify(data)));
 const page=await fs.readFile(path.join(out,'review.html'),'utf8');assert.match(page,/connect-src 'none'/);assert.ok(!/https?:\/\//.test(page));
});

test('registered status requires actual catalog reference and byte-identical game/render files; generated candidates cannot pass by merely existing',async()=>{
 for(const a of data.assets.filter(a=>a.status==='native-integrated')){
  const catalog=a.kind==='hero'?production.characters?.[a.id]:a.kind==='boss'?production.bosses?.[a.id]:a.kind==='enemy'?production.enemies?.[a.id.replace('enemy-','')]:production.environment?.[a.id];
  const ids=[...new Set(refs(catalog))];assert.ok(ids.length,a.id);
  for(const id of ids){const sprite=a.sprites.find(s=>s.id===id),source=production.assets[id];assert.ok(sprite?.registered&&sprite.gameFilesMatch,id);
   const game=path.join(root,'work/dead-signal-game/dist/assets/production');
   assert.equal(hash(await fs.readFile(path.join(game,source.atlas))),sprite.sha256);
   assert.equal(hash(await fs.readFile(path.join(game,source.metadata))),hash(await fs.readFile(path.join(out,sprite.metadata||`sprites/${id}/metadata.json`))));
  }
 }
});

test('canvas frame metadata matches actual PNG dimensions and every direction/sample addresses a real native frame',async()=>{
 for(const a of data.assets)for(const s of a.sprites){
  const file=await fs.open(path.join(out,s.atlas));const header=Buffer.alloc(24);try{await file.read(header,0,24,0);}finally{await file.close();}
  assert.equal(header.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(header.readUInt32BE(16),s.atlasInfo.width);assert.equal(header.readUInt32BE(20),s.atlasInfo.height);
  assert.equal(s.frames.length,s.atlasInfo.directions*s.atlasInfo.samples);
  const pairs=new Set();for(const f of s.frames){assert.ok(f.direction>=0&&f.direction<s.atlasInfo.directions);assert.ok(f.sample>=0&&f.sample<s.atlasInfo.samples);pairs.add(f.direction+':'+f.sample);assert.ok(f.rect.x>=0&&f.rect.y>=0&&f.rect.x+f.rect.width<=s.atlasInfo.width&&f.rect.y+f.rect.height<=s.atlasInfo.height);assert.ok(Number.isFinite(f.footPivot.x)&&Number.isFinite(f.footPivot.y));}
  assert.equal(pairs.size,s.frames.length);
 }
});

test('review UI requests only the selected atlas, ignores an old pose load, and freezes animated samples while hidden',async()=>{
 const code=await fs.readFile(path.join(out,'review.js'),'utf8'),nodes=new Map(),requests=[],draws=[];
 const context2D={setTransform(){},clearRect(){},drawImage(...args){draws.push(args);},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 const element=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,checked:false,listeners:{},addEventListener(name,handler){this.listeners[name]=handler;},getBoundingClientRect(){return{width:520,height:430};},getContext(){return context2D;},classList:{toggle(){}},showModal(){},close(){}});
  return nodes.get(id);
 };
 const atlasInfo=new Map(data.assets.flatMap(a=>a.sprites.map(b=>[b.atlas,b.atlasInfo])));
 class NativeImage{
  set src(value){this.url=value;requests.push(this);}
  finish(){const a=atlasInfo.get(this.url);this.naturalWidth=a.width;this.naturalHeight=a.height;this.onload();}
 }
 const document={hidden:false,getElementById:element,querySelectorAll(){return[];},addEventListener(){}};
 let nextTick=null;
 const sandbox={window:{productionReview:structuredClone(data),addEventListener(){}},document,location:{hash:''},history:{replaceState(){}},Image:NativeImage,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame(fn){nextTick=fn;},devicePixelRatio:1};
 vm.runInNewContext(code,sandbox,{filename:'production-review-ui'});
 assert.equal(requests.length,1,'Opening gallery must not eagerly load all native atlases');
 assert.match(requests[0].url,/survivor-shotgun-idle/);requests[0].finish();await Promise.resolve();await Promise.resolve();
 const pose=element('pose');pose.value='1';pose.listeners.change();pose.value='2';pose.listeners.change();
 assert.equal(requests.length,3,'Only user-selected pose changes may create further native loads');
 const beforeOld=draws.length;requests[1].finish();await Promise.resolve();await Promise.resolve();assert.equal(draws.length,beforeOld,'Stale walking load cannot overwrite selected running pose');
 requests[2].finish();await Promise.resolve();await Promise.resolve();assert.equal(draws.at(-1)[0].url,requests[2].url);
 element('direction').value='10';element('direction').listeners.input();
 const run=data.assets[0].sprites[2],first=run.frames.find(f=>f.direction===10&&f.sample===0);
 assert.deepEqual(draws.at(-1).slice(1,5),[first.rect.x,first.rect.y,first.rect.width,first.rect.height]);
 element('play').listeners.click();nextTick(0);nextTick(150);nextTick(300);
 const afterAdvance=draws.length;assert.ok(afterAdvance>beforeOld);
 document.hidden=true;nextTick(3000);nextTick(4000);assert.equal(draws.length,afterAdvance,'Hidden gallery cannot advance the animation');
 document.hidden=false;nextTick(5000);assert.equal(draws.length,afterAdvance,'Resuming visibility does not jump by hidden elapsed time');
});
