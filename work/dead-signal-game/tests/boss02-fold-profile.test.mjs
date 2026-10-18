import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {BOSS_CATALOG} from '../dist/campaign.js';
import {createBossActionLayer,createBoss02FoldActionLayer} from '../dist/boss-rig/boss-action-layer.js';

// Real vendor bones/quaternions, controlled skin/clip fixtures. This proves
// source/runtime invariants, not original-asset pixels or natural motion.
const DEG=Math.PI/180,KEY='boss-02-final',PROFILE='boss02-fold-v1';
const layerURL=new URL('../dist/boss-rig/boss-action-layer.js',import.meta.url);
const liveURL=new URL('../dist/boss-rig/live-boss.js',import.meta.url);
const vendorURL=new URL('../dist/player-rig/vendor/three.module.js',import.meta.url);
const beforeURL=new URL('../../../qa/boss02-fold-profile-20261018/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const rebase=(source,base)=>source.replace(/(\bfrom\s+)(['"])(\.[^'"]+)\2/g,(_,prefix,quote,path)=>prefix+quote+new URL(path,base).href+quote);
const near=(actual,expected,tolerance=1e-11)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const state=bone=>({name:bone.name,position:bone.position.toArray(),quaternion:bone.quaternion.toArray(),scale:bone.scale.toArray()});
const restState=f=>f.sampler.restTransforms.map(row=>({position:row.position.toArray(),quaternion:row.quaternion.toArray(),scale:row.scale.toArray()}));
const fixed=f=>f.bones.filter(bone=>/^(DS_Root|DS_Leg_|DS_Foot_)/.test(bone.name)).map(bone=>({...state(bone),world:bone.matrixWorld.toArray()}));
function fixture(pairs=2,{rotatedRest=false}={}){
 const bones=[],add=(name,parent,x,y,z)=>{const bone=new THREE.Bone();bone.name=name;bone.position.set(x,y,z);if(parent)parent.add(bone);bones.push(bone);return bone;};
 const root=add('DS_Root',null,0,0,0),thorax=add('DS_Thorax',root,0,.64,0);add('DS_Head',thorax,0,.36,0);
 for(let pair=0;pair<pairs;pair++)for(const side of[-1,1]){
  const arm=add(`DS_Arm_${pair}_${side}`,thorax,side*.38,.18-pair*.21,0),forearm=add(`DS_Forearm_${pair}_${side}`,arm,side*.266,-.1485,0);
  if(rotatedRest){arm.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),side*.13);forearm.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),side*-.07);}
 }
 for(const side of[-1,1]){const leg=add('DS_Leg_0_'+side,root,side*.247,.36,0);add('DS_Foot_0_'+side,leg,side*.19,-.29,0);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.8,.7,0,.8,.7,0,0,0,0],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,.5,0],2));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([3,0,0,0,5,0,0,0,0,0,0,0],4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
 const material=new THREE.MeshBasicMaterial({map:new THREE.Texture()}),mesh=new THREE.SkinnedMesh(geometry,material);mesh.add(root);mesh.bind(new THREE.Skeleton(bones));mesh.updateMatrixWorld(true);
 const clips=['idle','walk','windup','attack','hit','death'].map(name=>new THREE.AnimationClip('DS_'+name,1,[]));
 const restTransforms=bones.map(object=>({object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()}));
 const sampler={root:mesh,skins:[mesh],restTransforms,clips};
 function authored(x=0){for(const row of restTransforms){row.object.position.copy(row.position);row.object.quaternion.copy(row.quaternion);row.object.scale.copy(row.scale);if(/^DS_(Arm|Forearm)_/.test(row.object.name))row.object.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),x));}mesh.updateMatrixWorld(true);}
 const source=()=>({rest:restState({sampler}),attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([key,attribute])=>[key,{attribute,array:attribute.array,values:Array.from(attribute.array)}])),geometry:mesh.geometry,material:mesh.material,map:material.map,skeleton:mesh.skeleton,clips:sampler.clips.map(clip=>({clip,name:clip.name,duration:clip.duration,tracks:clip.tracks}))});
 return{root,thorax,bones,geometry,material,mesh,sampler,authored,source};
}
let loaded;
async function sources(){
 if(!loaded)loaded=(async()=>{
  const[oldLayer,oldLive,currentLayer,currentLive]=await Promise.all([readFile(new URL('layer-before.txt',beforeURL)),readFile(new URL('live-boss-before.txt',beforeURL)),readFile(layerURL),readFile(liveURL)]);
  assert.equal(oldLayer.length,6701);assert.equal(sha(oldLayer),'1f5e80093788c91c8e1ada85ee18c5930c518781f66c6473f2b816a0a86e0e1b');
  assert.equal(oldLive.length,22579);assert.equal(sha(oldLive),'c9c9b93cc20dad6b63bcbcda7997ced15883b810f8fe674d3384fee502290cfa');
  assert.equal(sha(currentLayer),'93389ded0f943d541874eb1bb1946823f8de9a047b263a747069b6b3a7f09465');
  assert.equal(sha(currentLive),'ab559ea236319cc004ab69069ec8ced30648a9c60160ffb2fb049de8fdea54bb');
  const before=oldLayer.toString('utf8'),after=currentLayer.toString('utf8'),liveBefore=oldLive.toString('utf8'),liveAfter=currentLive.toString('utf8');
  const marker='\n// A separate cache and cloned entries keep the existing factory/layers intact.';assert.equal(after.split(marker).length,2);
  const originalZ="   const extraZ=entry.role==='torso'?0:entry.side*entry.weight*(entry.role==='arm'?SHOULDER:FOREARM)*raise;";
  const candidateZ=`   let extraZ=entry.role==='torso'?0:entry.side*entry.weight*(entry.role==='arm'?SHOULDER:FOREARM)*raise;
   // Dormant boss02-only profile. Keep the exact original expression above for
   // the default entries, both signed zeroes, and the unchanged contact endpoint.
   if(entry.peak!==undefined&&entry.role!=='torso'&&raise!==0&&raise!==-.4){
    const base=entry.role==='arm'?SHOULDER:FOREARM,peak=entry.peak,m=Math.min(base,peak);
    const mapped=raise>=0?m*raise+(peak-m)*raise*raise:base*raise+(m-base)*raise*(raise+.4)/.4;
    extraZ=entry.side*entry.weight*mapped;
   }`;
  assert.equal(after.split(candidateZ).length,2);
  assert.equal(after.slice(0,after.indexOf(marker)).replace('const foldCaches=new WeakMap();\n','').replace(candidateZ,originalZ),before,'default layer recovers the full original with only explicit profile additions removed');
  const inverseLive=liveAfter.replace('import {createBossActionLayer,createBoss02FoldActionLayer}', 'import {createBossActionLayer}').replace('const actionProfiles=new WeakMap();\n','').replace("constructor({size=512,registryFile='registry.json',bossActionProfile}={})", "constructor({size=512,registryFile='registry.json'}={})").replace("    if(bossActionProfile==='boss02-fold-v1')actionProfiles.set(this,bossActionProfile);\n",'').replace("const actions=actionProfiles.get(this)==='boss02-fold-v1'&&key==='boss-02-final'?createBoss02FoldActionLayer(sampler,key):createBossActionLayer(sampler,key);",'const actions=createBossActionLayer(sampler,key);');
  assert.equal(inverseLive,liveBefore,'the original load/frame/cache/history/composition body stays exact outside the private constructor profile choice');
  const original=await import(moduleURL(rebase(before,layerURL)));
  return{before,after,liveBefore,liveAfter,originalFactory:original.createBossActionLayer};
 })();return loaded;
}

test('full original layer/live sources are independently invertible and every default final-key pose remains bit-exact against the saved whole module',async()=>{
 const{originalFactory}=await sources();
 for(const boss of BOSS_CATALOG.filter(boss=>boss.role==='final')){
  const a=fixture(),b=fixture(),original=originalFactory(a.sampler,boss.id),current=createBossActionLayer(b.sampler,boss.id);
  for(const name of['idle','windup','attack','hit','death'])for(const progress of[-0,.23,.72,1]){
   a.authored(-.11);b.authored(-.11);const expected={...original.apply({name,progress})},actual={...current.apply({name,progress})};
   assert.deepEqual(actual,expected);assert.deepEqual(b.bones.map(state),a.bones.map(state),boss.id+' '+name+' '+progress);
  }
 }
});

test('fold is boss02-only, independently cached, clones legacy entries and never changes a legacy layer cache or unsupported sampler',()=>{
 let reads=0;const hostile=new Proxy({}, {get(){reads++;throw Error('unsupported sampler');}});
 for(const key of['boss-01-final','boss-02-mid','boss-06-final','enemy-walker',null,undefined])assert.equal(createBoss02FoldActionLayer(hostile,key).supported,false);
 assert.equal(reads,0);
 const f=fixture(),legacy=createBossActionLayer(f.sampler,KEY),before=legacy.entries.map(entry=>({...entry})),fold=createBoss02FoldActionLayer(f.sampler,KEY);
 assert.equal(fold.supported,true);assert.equal(fold.profile,PROFILE);assert.notEqual(fold,legacy);assert.notEqual(fold.entries,legacy.entries);assert.equal(createBoss02FoldActionLayer(f.sampler,KEY),fold);assert.equal(createBossActionLayer(f.sampler,KEY),legacy);
 assert.notEqual(createBoss02FoldActionLayer(fixture().sampler,KEY),fold);
 for(let i=0;i<legacy.entries.length;i++){assert.notEqual(fold.entries[i],legacy.entries[i]);assert.equal(fold.entries[i].bone,legacy.entries[i].bone);assert.equal(Object.hasOwn(legacy.entries[i],'peak'),false);assert.deepEqual(legacy.entries[i],before[i]);}
 const missing=fixture();missing.sampler.restTransforms=missing.sampler.restTransforms.filter(row=>row.object.name!=='DS_Forearm_0_1');assert.equal(createBoss02FoldActionLayer(missing.sampler,KEY).supported,false);
 f.authored();fold.apply({name:'windup',progress:.72});for(let i=0;i<legacy.entries.length;i++)assert.deepEqual(legacy.entries[i],before[i]);
});

test('actual Quaternion peak gives pair0 30/32 degrees and remaining pairs 8/4 weighted, with exact old zero/contact endpoints and planted feet',()=>{
 const f=fixture(3),fold=createBoss02FoldActionLayer(f.sampler,KEY),legacy=createBossActionLayer(f.sampler,KEY),source=f.source();f.authored();const planted=fixed(f);
 const d=fold.apply({name:'windup',progress:.72});f.mesh.updateMatrixWorld(true);assert.equal(d.active,true);assert.equal(d.appliedBones,13);
 for(const entry of fold.entries){if(entry.role==='torso')continue;const upper=/_0_/.test(entry.bone.name),expected=(entry.role==='arm'?(upper?30:8):(upper?32:4))*DEG*entry.weight*entry.side;
  near(entry.bone.quaternion.z,Math.sin(expected*.5));near(entry.bone.quaternion.w,Math.cos(expected*.5));near(entry.bone.quaternion.x,0);near(entry.bone.quaternion.y,0);
 }
 assert.deepEqual(fixed(f),planted);assert.deepEqual(f.source(),source);
 for(const authored of[0,-0,-.11])for(const[name,progress]of[['windup',0],['windup',-0],['windup',1],['attack',0],['attack',1]]){
  f.authored(authored);const expected={...legacy.apply({name,progress})},pose=f.bones.map(state);f.authored(authored);const actual={...fold.apply({name,progress})};assert.deepEqual(actual,expected);assert.deepEqual(f.bones.map(state),pose,'unchanged signed-zero/contact/final endpoint '+name+'/'+progress);
 }
 assert.deepEqual(f.source(),source);
});

test('fold map joins at zero without a derivative jump and fresh samples remain deterministic, bounded and source/rest preserving',()=>{
 const f=fixture(2,{rotatedRest:true}),layer=createBoss02FoldActionLayer(f.sampler,KEY),saved=f.source();
 for(const name of['windup','attack'])for(let i=0;i<=80;i++){
  f.authored(i%2?.8:-.19);const planted=fixed(f),d=layer.apply({name,progress:i/80});f.mesh.updateMatrixWorld(true);
  assert.equal(d.active,true);assert.ok(d.maxCombinedAngle<=40*DEG+1e-12);assert.deepEqual(fixed(f),planted);
  for(const entry of layer.entries){near(entry.bone.quaternion.length(),1);const rest=f.sampler.restTransforms.find(row=>row.object===entry.bone);assert.ok(entry.bone.quaternion.angleTo(rest.quaternion)<=40*DEG+1e-7);}
  assert.deepEqual(f.source(),saved);
 }
 f.authored(-.11);const diagnostic=layer.apply({name:'windup',progress:.72}),expected=f.bones.map(state);
 for(let i=0;i<12;i++){f.authored(-.11);assert.equal(layer.apply({name:'windup',progress:.72}),diagnostic);assert.deepEqual(f.bones.map(state),expected);}
 for(const name of['idle','walk','hit','death']){f.authored(.14);const original=f.bones.map(state);assert.equal(layer.apply({name,progress:.72}).active,false);assert.deepEqual(f.bones.map(state),original);}
 const plain=fixture(),fold=createBoss02FoldActionLayer(plain.sampler,KEY),legacy=createBossActionLayer(plain.sampler,KEY);
 const progressFor=raise=>{let low=.72,high=1;for(let i=0;i<60;i++){const p=(low+high)/2;plain.authored();const value=legacy.apply({name:'windup',progress:p}).shoulderRaise/(20*DEG);if(value>raise)low=p;else high=p;}return(low+high)/2;};
 const epsilon=1e-5,values=[];for(const raise of[-epsilon,0,epsilon]){plain.authored();fold.apply({name:'windup',progress:progressFor(raise)});values.push(fold.entries.filter(entry=>entry.role!=='torso').map(entry=>2*Math.atan2(entry.bone.quaternion.z,entry.bone.quaternion.w)));}
 for(let i=0;i<values[0].length;i++)near((values[1][i]-values[0][i])/epsilon,(values[2][i]-values[1][i])/epsilon,2e-5);
 assert.deepEqual(f.source(),saved);
});

function controlledVendor(){return moduleURL(`export * from ${JSON.stringify(vendorURL.href)};
export class WebGLRenderer{constructor(){this.domElement=document.createElement('canvas');}setSize(w,h){this.domElement.width=w;this.domElement.height=h;}setPixelRatio(){}dispose(){}}`);}
async function controlledLive(source){
 const vendor=controlledVendor();source=source.replace("from '../player-rig/vendor/three.module.js'",'from '+JSON.stringify(vendor));
 return import(moduleURL(rebase(source.replaceAll('import.meta.url',JSON.stringify(liveURL.href)),liveURL)));
}
async function withRuntime(run){
 const documentDescriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),fetchDescriptor=Object.getOwnPropertyDescriptor(globalThis,'fetch');
 const config={file:'controlled-original.glb',source:{scale:1,originPivot:{x:0,y:0,z:0}},projection:{subjectHeight:2},clips:{idle:{},windup:{},attack:{},hit:{},death:{}}};
 const make=()=>{const canvas={width:0,height:0,addEventListener(){},removeEventListener(){}};canvas.getContext=()=>({canvas,clearRect(){},drawImage(){}});return canvas;};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:name=>{assert.equal(name,'canvas');return make();}}});
 Object.defineProperty(globalThis,'fetch',{configurable:true,value:async()=>({ok:true,json:async()=>({bosses:{[KEY]:config,'boss-06-final':config}})})});
 try{return await run();}finally{if(documentDescriptor)Object.defineProperty(globalThis,'document',documentDescriptor);else delete globalThis.document;if(fetchDescriptor)Object.defineProperty(globalThis,'fetch',fetchDescriptor);else delete globalThis.fetch;}
}

test('actual constructor/load privately selects only the explicit boss02 profile; default/invalid/other-key paths retain original model selection and no new own fields',async()=>{
 const{liveBefore,liveAfter}=await sources();await withRuntime(async()=>{
  const[{LiveBossRig:Original},{LiveBossRig:Current}]=await Promise.all([controlledLive(liveBefore),controlledLive(liveAfter)]);
  const prepare=async(Type,options,key=KEY)=>{const rig=new Type(options),calls=[];rig.loader={loadAsync:async url=>{calls.push(url);const f=fixture();return{scene:f.mesh,animations:f.sampler.clips};}};const ready=rig.load(key);assert.equal(rig.load(key),ready);assert.equal(await ready,true);assert.equal(calls.length,1);return{rig,model:rig.models.get(key)};};
  const old=await prepare(Original,{}),normal=await prepare(Current,{}),invalid=await prepare(Current,{bossActionProfile:'boss02-fold-v0'}),chosen=await prepare(Current,{bossActionProfile:PROFILE}),other=await prepare(Current,{bossActionProfile:PROFILE},'boss-06-final');
  for(const item of[normal,invalid,chosen,other]){assert.deepEqual(Object.keys(item.rig),Object.keys(old.rig));assert.equal(Object.hasOwn(item.rig,'bossActionProfile'),false);assert.equal(item.rig.bossActionLayerEnabled,false,'profile selection does not enable a product action layer');}
  assert.equal(normal.model.actionLayer.profile,undefined);assert.equal(invalid.model.actionLayer.profile,undefined);assert.equal(other.model.actionLayer.profile,undefined);assert.equal(chosen.model.actionLayer.profile,PROFILE);
  assert.equal(chosen.model.actionLayer,createBoss02FoldActionLayer(chosen.model.sampler,KEY));assert.equal(normal.model.actionLayer,createBossActionLayer(normal.model.sampler,KEY));
  for(const item of[normal,invalid]){for(const row of item.model.sampler.restTransforms){row.object.quaternion.copy(row.quaternion);row.object.position.copy(row.position);}item.model.actionLayer.apply({name:'windup',progress:.72});}
  assert.deepEqual(normal.model.bones.map(state),invalid.model.bones.map(state),'unrecognized profile never alters actual load/factory behavior');
 });
});
