export const ALLOWED_IDS=Object.freeze(['survivor',...Array.from({length:12},(_,i)=>['boss-'+String(i+1).padStart(2,'0')+'-mid','boss-'+String(i+1).padStart(2,'0')+'-final']).flat(),...['walker','runner','shield','screamer','gas','elite','collector'].map(id=>'enemy-'+id)]);
export const GROUNDED_IDS=Object.freeze(ALLOWED_IDS.filter(id=>id.startsWith('enemy-')||/^boss-\d{2}-mid$/.test(id)));
export function preferredRigClip(clips,id=''){
  const named=name=>clips.find(clip=>clip.name===name);
  return (id==='enemy-runner'?named('DS_GroundedRun'):null)||named('DS_GroundedWalk')||named('DS_walk')
    ||clips.find(clip=>/walk/i.test(clip.name)&&!/MotionReel/i.test(clip.name))
    ||clips.find(clip=>/run|idle/i.test(clip.name)&&!/MotionReel/i.test(clip.name))||clips[0]||null;
}
export function resolveModelId(search){
  const id=new URLSearchParams(search).get('id');
  if(!id)return 'boss-10-final';
  if(!ALLOWED_IDS.includes(id))throw new Error('허용된 캐릭터 주소가 아닙니다. 목록에서 선택해 주세요.');
  return id;
}
export function validateRegistry(value){
  if(value?.schemaVersion!==1||!Array.isArray(value.models)||value.models.length!==ALLOWED_IDS.length)throw new Error('리깅 목록 형식이 올바르지 않습니다.');
  const seen=new Set();
  for(const m of value.models){
    const grounded=GROUNDED_IDS.includes(m.id)&&m.model===`models/${m.id}-grounded-locomotion-v1/model.glb`,legacy=m.model===`models/${m.id}-motion-v1/model.glb`;
    const allowedProvenance=grounded?m.provenance===`models/${m.id}-grounded-locomotion-v1/grounding-provenance.json`:[`models/${m.id}-motion-v1/rig-provenance.json`,`models/${m.id}-motion-v1/motion-provenance.json`].includes(m.provenance);
    if(!ALLOWED_IDS.includes(m.id)||seen.has(m.id)||!(grounded||legacy)||!allowedProvenance||!/^[a-f0-9]{64}$/.test(m.sha256)||!(m.jointCount>0)||!(m.skinnedMeshes>0)||!Array.isArray(m.clips)||!m.clips.length)throw new Error('허용되지 않은 리깅 파일이 목록에 있습니다.');
    seen.add(m.id);
    if(m.clips.some(c=>typeof c.name!=='string'||!c.name||!Number.isFinite(c.duration)||c.duration<=0||c.duration>300||!(c.tracks>0)))throw new Error('클립 정보가 올바르지 않습니다.');
    if(grounded&&!['DS_GroundedWalk','DS_GroundedRun'].every(name=>m.clips.some(c=>c.name===name)))throw new Error('접지 모델의 새 이동 클립이 없습니다.');
    if(m.preferredClip!==undefined&&!m.clips.some(c=>c.name===m.preferredClip))throw new Error('기본 이동 클립이 원본에 없습니다.');
  }
  return value.models;
}
export function allowedResource(relative,base,records){
  if(!records.some(m=>m.model===relative||m.provenance===relative))throw new Error('목록에 없는 파일은 열 수 없습니다.');
  // The same reviewed viewer can be staged in /review-v029/ while models stay
  // at their immutable canonical paths. The exact registry allowlist still
  // rejects traversal and arbitrary local/remote resources before resolution.
  const url=new URL('/production-assets/'+relative,base),origin=new URL(base).origin;
  if(url.origin!==origin||!url.pathname.includes('/production-assets/models/'))throw new Error('같은 사이트의 검증된 모델만 열 수 있습니다.');
  return url;
}
export function makePlayback(clip=null){return{time:0,duration:clip?.duration||0,loop:clip?.loop===true,playing:false};}
export function makeTextOption(label,value,OptionType=globalThis.Option){return new OptionType(String(label),String(value));}
export function togglePlayback(state){
  if(state.duration<=0)return{...state,playing:false};
  return{...state,time:!state.playing&&state.time>=state.duration?0:state.time,playing:!state.playing};
}
export function seekPlayback(state,time){return{...state,time:Math.min(state.duration,Math.max(0,Number(time)||0)),playing:false};}
export function advancePlayback(state,delta,visible=true){
  if(!visible)return{...state,playing:false};
  if(!state.playing||state.duration<=0)return state;
  const time=state.time+Math.min(.1,Math.max(0,Number(delta)||0));
  return state.loop?{...state,time:time%state.duration}:{...state,time:Math.min(time,state.duration),playing:time<state.duration};
}
