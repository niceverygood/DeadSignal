import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ALLOWED_IDS,resolveModelId,validateRegistry,allowedResource,makePlayback,togglePlayback,seekPlayback,advancePlayback,makeTextOption} from './production-assets/rig-viewer-state.js';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const registry=JSON.parse(await fs.readFile(path.join(here,'production-assets/rig-viewer-registry.json'),'utf8'));
const base='http://127.0.0.1:8812/production-assets/rig-viewer.html';

test('viewer registry contains exactly32 actual weighted GLBs with embedded original textures and byte-exact hashes',async()=>{
  const records=validateRegistry(registry);assert.equal(records.length,32);assert.equal(ALLOWED_IDS.length,32);
  for(const r of records){
    const b=await fs.readFile(path.join(root,'outputs/dead-signal/production-assets',r.model));
    assert.equal(crypto.createHash('sha256').update(b).digest('hex'),r.sha256);
    const n=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+n));
    assert.ok(g.skins.length&&r.jointCount>0&&r.skinnedMeshes>0);assert.equal(g.animations.length,r.clips.length);
    assert.ok(!(g.buffers||[]).some(x=>x.uri));assert.ok(!(g.images||[]).some(x=>x.uri));
    assert.ok((await fs.stat(path.join(root,'outputs/dead-signal/production-assets',r.provenance))).isFile());
  }
});

test('query and registry allowlists reject traversal, unknown IDs, remote URLs, duplicate models and swapped paths',()=>{
  assert.equal(resolveModelId('?id=boss-10-final'),'boss-10-final');assert.equal(resolveModelId(''),'boss-10-final');
  for(const search of ['?id=../boss-01-final','?id=https://example.com/model.glb','?id=boss-13-final','?id=%3Cscript%3E'])assert.throws(()=>resolveModelId(search));
  const records=validateRegistry(registry);assert.equal(allowedResource(records[0].model,base,records).origin,'http://127.0.0.1:8812');
  for(const url of ['https://example.com/model.glb','../../work/secret.json','models/survivor-motion-v1/../../secret.json','javascript:alert(1)'])assert.throws(()=>allowedResource(url,base,records));
  const bad=structuredClone(registry);bad.models[0].model='https://example.com/model.glb';assert.throws(()=>validateRegistry(bad));
  const duplicate=structuredClone(registry);duplicate.models[1]=duplicate.models[0];assert.throws(()=>validateRegistry(duplicate));
});

test('asset and clip labels become native text options, preserving hostile markup as inert text',()=>{
  class TextOption{constructor(label,value){this.textContent=label;this.value=value;}}
  const hostile='<img src=x onerror=alert(1)> & "clip"';
  const option=makeTextOption(hostile,'<script>',TextOption);assert.equal(option.textContent,hostile);assert.equal(option.value,'<script>');assert.equal(option.children,undefined);
});

test('one-shot playback clamps at the final pose, replay resets, seeking pauses, and hidden pages stop without time jumps',()=>{
  let state=togglePlayback(makePlayback({duration:.25,loop:false}));
  state=advancePlayback(state,.1);state=advancePlayback(state,.1);state=advancePlayback(state,.1);assert.equal(state.time,.25);assert.equal(state.playing,false);
  state=togglePlayback(state);assert.equal(state.time,0);assert.equal(state.playing,true);
  state=seekPlayback(state,.15);assert.equal(state.time,.15);assert.equal(state.playing,false);
  state=togglePlayback(state);state=advancePlayback(state,50,false);assert.equal(state.time,.15);assert.equal(state.playing,false);
  assert.deepEqual(advancePlayback(state,50,true),state);
});

test('looping clips stay within their own duration and a zero-duration bind pose cannot play',()=>{
  let state=togglePlayback(makePlayback({duration:.2,loop:true}));
  for(let i=0;i<100;i++){state=advancePlayback(state,.1);assert.ok(state.time>=0&&state.time<.2);assert.equal(state.playing,true);}
  assert.equal(togglePlayback(makePlayback()).playing,false);
});

test('the local import map has a valid CSP hash and no remote module endpoint',async()=>{
  const html=await fs.readFile(path.join(here,'production-assets/rig-viewer.html'),'utf8');
  const inline=html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1],hash=crypto.createHash('sha256').update(inline).digest('base64');
  assert.ok(html.includes("'sha256-"+hash+"'"));const imports=JSON.parse(inline).imports;
  for(const value of Object.values(imports))assert.ok(value.startsWith('/production-assets/rig-lab/node_modules/three/'));
  assert.ok(!/https?:\/\//.test(html));
});
