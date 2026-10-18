import {EXPEDITIONS,normalizeExpeditionProgress,validExpeditionState,expeditionTarget} from './expedition.js';
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The existing completed chapters and saved objective index are the evidence.
// Unlocked chapters, partial holds and uncompleted clues add no records.
export function storyJournalModel(progress,{activeGame=null}={}){
 const state=normalizeExpeditionProgress(progress),active=validExpeditionState(activeGame?.expedition)?activeGame:null;
 const chapters=EXPEDITIONS.flatMap(definition=>{
  const cleared=state.cleared.includes(definition.id),current=active?.expedition.id===definition.id;
  if(!cleared&&!current)return [];
  const count=cleared?definition.steps.length:active.expedition.step;
  return [{id:definition.id,title:definition.title.replace('마지막 신호 · ',''),optional:!!definition.optional,cleared,current,
   clues:definition.steps.slice(0,count).map((step,index)=>({id:step.id,title:step.title,text:step.clue,number:index+1}))}];
 });
 return {chapters,count:chapters.reduce((n,c)=>n+c.clues.length,0),current:active?{title:EXPEDITIONS.find(d=>d.id===active.expedition.id).title,objective:expeditionTarget(active)?.title}:null};
}
export function storyJournalHTML(progress,options={}){
 const model=storyJournalModel(progress,options);
 return `<section class="panel campaign-panel story-journal" aria-label="회수한 원정 기록"><p class="eyebrow">K-17 / FIELD RECORDS</p><h2>회수 기록</h2><p class="muted">거리에서 마지막 격리소까지, 확보한 단서를 경로별로 정리합니다.</p><div class="campaign-summary"><span>회수한 단서 ${model.count}개</span></div>${model.current?`<aside class="journal-current"><strong>${escape(model.current.title)}</strong><p>현재 목표 · ${escape(model.current.objective||'원정 목표 확인')}</p></aside>`:''}${model.count===0?'<p class="journal-empty">아직 회수한 단서가 없습니다. 원정 목표를 완료하면 들었던 무전과 확보한 기록을 여기서 다시 읽을 수 있습니다.</p>':''}<div class="journal-chapters">${model.chapters.filter(c=>c.clues.length).map(chapter=>`<details class="journal-chapter" ${chapter.current?'open':''}><summary><strong>${escape(chapter.title)}</strong><span>${chapter.cleared?'회수 완료':'진행 중'} · 단서 ${chapter.clues.length}개${chapter.optional?' · 선택 경로':''}</span></summary><ol>${chapter.clues.map(clue=>`<li><h3>${escape(clue.title)}</h3><p>${escape(clue.text)}</p></li>`).join('')}</ol></details>`).join('')}</div><div class="panel-actions"><span class="muted">기록을 읽는 동안 작전은 진행되지 않습니다.</span><button data-action="records-back" class="secondary">돌아가기</button></div></section>`;
}
