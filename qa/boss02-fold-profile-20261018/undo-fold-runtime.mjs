function once(source,changed,original){if(typeof source!=='string'||source.split(changed).length!==2)throw Error('fold-runtime-exact-inverse-required');return source.replace(changed,original);}
const candidateZ=`   let extraZ=entry.role==='torso'?0:entry.side*entry.weight*(entry.role==='arm'?SHOULDER:FOREARM)*raise;
   // Dormant boss02-only profile. Keep the exact original expression above for
   // the default entries, both signed zeroes, and the unchanged contact endpoint.
   if(entry.peak!==undefined&&entry.role!=='torso'&&raise!==0&&raise!==-.4){
    const base=entry.role==='arm'?SHOULDER:FOREARM,peak=entry.peak,m=Math.min(base,peak);
    const mapped=raise>=0?m*raise+(peak-m)*raise*raise:base*raise+(m-base)*raise*(raise+.4)/.4;
    extraZ=entry.side*entry.weight*mapped;
   }`;
const factory=`
// A separate cache and cloned entries keep the existing factory/layers intact.
// This is an explicit QA profile, not an anatomical hinge or product approval.
export function createBoss02FoldActionLayer(sampler,key){
 if(key!=='boss-02-final')return unsupported;
 const cached=foldCaches.get(sampler);if(cached)return cached;
 const original=createBossActionLayer(sampler,key);if(!original.supported)return original;
 const entries=original.entries.map(entry=>{
  const copy={...entry};
  if(entry.role!=='torso'){
   const upper=/^DS_(?:Arm|Forearm)_0_/.test(entry.bone.name);
   copy.peak=(entry.role==='arm'?(upper?30:8):(upper?32:4))*DEG;
  }
  return copy;
 });
 const layer=new BossActionLayer(entries,original.kind);layer.profile='boss02-fold-v1';foldCaches.set(sampler,layer);return layer;
}
`;
export function undoFoldLayer(source){source=once(source,'const foldCaches=new WeakMap();\n','');source=once(source,candidateZ,"   const extraZ=entry.role==='torso'?0:entry.side*entry.weight*(entry.role==='arm'?SHOULDER:FOREARM)*raise;");return once(source,factory,'');}
export function undoFoldLive(source){for(const [changed,original]of [
 ['import {createBossActionLayer,createBoss02FoldActionLayer}','import {createBossActionLayer}'],
 ['const actionProfiles=new WeakMap();\n',''],
 ["constructor({size=512,registryFile='registry.json',bossActionProfile}={})","constructor({size=512,registryFile='registry.json'}={})"],
 ["    if(bossActionProfile==='boss02-fold-v1')actionProfiles.set(this,bossActionProfile);\n",''],
 ["const actions=actionProfiles.get(this)==='boss02-fold-v1'&&key==='boss-02-final'?createBoss02FoldActionLayer(sampler,key):createBossActionLayer(sampler,key);",'const actions=createBossActionLayer(sampler,key);'],
 ])source=once(source,changed,original);return source;}
