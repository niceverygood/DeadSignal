const finite=Number.isFinite;
const position=node=>node?Object.freeze({left:finite(node.scrollLeft)?Math.max(0,node.scrollLeft):0,top:finite(node.scrollTop)?Math.max(0,node.scrollTop):0}):null;
const validPosition=value=>value===null||value&&finite(value.left)&&value.left>=0&&finite(value.top)&&value.top>=0;
const targets=root=>{
  const panel=root?.querySelector?.('.codex-panel'),roster=panel?.querySelector?.('.boss-roster');
  return panel&&roster?{overlay:root,panel,roster,page:root.ownerDocument?.scrollingElement||null}:null;
};

/** Snapshot only an existing codex-to-codex selection. The result owns no DOM
 * references and reads no globals, profile, Game, RNG or browser clock. */
export function captureCodexScroll(root,{screen,action,selectedKey=null}={}){
  if(screen!=='codex'||action!=='boss-detail')return null;
  const nodes=targets(root);if(!nodes)return null;
  const positions=Object.freeze(Object.fromEntries(Object.entries(nodes).map(([key,node])=>[key,position(node)])));
  return Object.freeze({kind:'codex-scroll',positions,selectedKey:typeof selectedKey==='string'?selectedKey:null});
}

function restorePosition(node,value){
  if(!node||!value)return;
  const clamp=(amount,total,visible)=>finite(total)&&finite(visible)?Math.min(amount,Math.max(0,total-visible)):amount;
  node.scrollLeft=clamp(value.left,node.scrollWidth,node.clientWidth);
  node.scrollTop=clamp(value.top,node.scrollHeight,node.clientHeight);
}

/** Call synchronously after the replacement DOM, portrait sizes and normal
 * focus work. A shorter dossier is clamped to its new actual scroll extent. */
export function restoreCodexScroll(root,snapshot,{screen}={}){
  if(screen!=='codex'||snapshot?.kind!=='codex-scroll'||!snapshot.positions
    || !['overlay','panel','roster','page'].every(key=>Object.hasOwn(snapshot.positions,key)&&validPosition(snapshot.positions[key]))
    || !['overlay','panel','roster'].every(key=>snapshot.positions[key]!==null))return false;
  const nodes=targets(root);if(!nodes)return false;
  if(snapshot.selectedKey){
    const button=[...(nodes.roster.querySelectorAll?.('[data-action="boss-detail"]')||[])].find(node=>node.dataset?.value===snapshot.selectedKey);
    button?.focus?.({preventScroll:true});
  }
  // Focus first; restoring inner-to-outer also covers engines that scroll an
  // ancestor despite preventScroll. No delayed callback can outlive this UI.
  for(const key of ['roster','panel','overlay','page'])restorePosition(nodes[key],snapshot.positions[key]);
  return true;
}

// Detail portrait view is ephemeral UI state. It never belongs to a campaign,
// profile, Game snapshot, animation clock or production asset record.
export const CODEX_BOSS_VIEWS=Object.freeze(['정면','앞 오른쪽','오른쪽 측면','뒤 오른쪽','후면','뒤 왼쪽','왼쪽 측면','앞 왼쪽']);
const validView=step=>Number.isInteger(step)&&step>=0&&step<8;
export function selectCodexBossView(bossKey,previous=null){
  if(typeof bossKey!=='string'||!/^boss-\d{2}-(mid|final)$/.test(bossKey))return null;
  if(previous?.bossKey===bossKey&&validView(previous.step))return previous;
  return Object.freeze({bossKey,step:0});
}
export function rotateCodexBossView(view,delta){
  if(!view||!validView(view.step)||![-1,1].includes(delta))return null;
  return Object.freeze({bossKey:view.bossKey,step:(view.step+delta+8)%8});
}
export function codexBossViewAngle(metadata,step){
  if(!validView(step)||!metadata?.projection)return null;
  const yaw=metadata.projection.frontYawRadians??0;
  if(!finite(yaw))return null;
  // The approved models face native +Z. Baker rotation is PI/2-angle+yaw,
  // with its camera at (+X,+Y,+Z). Step0 therefore faces that camera at
  // PI/4+yaw; step4 is the native -Z rear. Quantize through the atlas selector.
  return Math.PI/4+yaw+step*Math.PI/4;
}

/** Mount once per replacement dossier; subsequent rotation only changes text,
 * disabled state and selected labels, retaining focus and all scroll nodes. */
export function mountCodexRotation(root){
  const art=root?.querySelector?.('.codex-panel .boss-dossier-art');
  if(!art||root.querySelector('[data-boss-rotation-controls]'))return false;
  art.insertAdjacentHTML('afterend',`<section data-boss-rotation-controls aria-label="보스 360도 보기" style="margin:0 0 16px;min-width:0"><div style="display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;gap:8px"><button type="button" class="secondary" data-action="boss-rotate" data-value="-1" aria-label="보스 모습을 왼쪽으로 45도 회전" disabled style="min-width:44px;min-height:44px;padding:8px">↶</button><output data-boss-rotation-current aria-live="polite" aria-atomic="true" style="text-align:center;font-size:12px;white-space:nowrap">회전 준비 중</output><button type="button" class="secondary" data-action="boss-rotate" data-value="1" aria-label="보스 모습을 오른쪽으로 45도 회전" disabled style="min-width:44px;min-height:44px;padding:8px">↷</button></div><ol aria-label="회전 시점 순서" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;list-style:none;margin:8px 0 6px;padding:0">${CODEX_BOSS_VIEWS.map((label,step)=>`<li class="badge" data-boss-rotation-step="${step}" style="min-width:0;text-align:center;font-size:9px;white-space:nowrap;padding:5px 2px">${label}</li>`).join('')}</ol><p data-boss-rotation-status style="height:16px;margin:0;font-size:10px;color:#aab5a5">회전 모습을 불러오는 중</p></section>`);
  return true;
}
export function updateCodexRotation(root,view){
  const controls=root?.querySelector?.('[data-boss-rotation-controls]');
  if(!controls||!view||!validView(view.step))return false;
  const portrait=root.querySelector('.codex-panel .boss-portrait.large'),matches=portrait?.dataset?.bossPortrait===view.bossKey;
  const status=matches?portrait.dataset.productionPortraitRotation:'unavailable',ready=status==='ready';
  for(const button of controls.querySelectorAll('[data-action="boss-rotate"]'))button.disabled=!ready;
  const current=controls.querySelector('[data-boss-rotation-current]');
  if(current)current.textContent=ready?`${CODEX_BOSS_VIEWS[view.step]} · ${view.step+1} / 8`:status==='loading'?'회전 준비 중':'기본 보기';
  for(const label of controls.querySelectorAll('[data-boss-rotation-step]')){
    const active=ready&&Number(label.dataset.bossRotationStep)===view.step;
    label.classList.toggle('gold',active);
    if(active)label.setAttribute('aria-current','true');else label.removeAttribute('aria-current');
  }
  const message=controls.querySelector('[data-boss-rotation-status]');
  if(message)message.textContent=ready?'좌우 버튼으로 여덟 방향을 확인하세요.':status==='loading'?'회전 모습을 불러오는 중':'회전 보기를 사용할 수 없습니다.';
  return ready;
}
