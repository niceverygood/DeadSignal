import {EQUIPMENT,EQUIPMENT_SLOTS,TEST_CHIPS,getEquipment,normalizeEquipment,equipmentOffer,equipmentStats,equipmentDescription} from './equipment.js?v=0.29.0';

const SLOT_NAMES={weapon:'무기 강화',armor:'방호 장비',utility:'보조 장비'};
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const amount=value=>new Intl.NumberFormat('ko-KR').format(Math.max(0,Math.floor(Number.isFinite(value)?value:0)));
const positive=(value,fallback,max)=>Number.isInteger(value)&&value>0?Math.min(max,value):fallback;
const percent=value=>`${Number((value*100).toFixed(1))}%`;
const increase=value=>`+${percent(value-1)}`;

function effectText(item,rank){
  if(item.id!=='storm-magazine')return equipmentDescription(item.id,rank);
  const stats=equipmentStats({items:{[item.id]:rank},equipped:{[item.slot]:item.id}});
  return `사격 속도 ${increase(stats.fireRate)} · 재장전 시간 ${percent(1-1/stats.fireRate)} 단축 · 산탄총 +${stats.ammoBonus.shotgun} / 못총 +${stats.ammoBonus.nailgun}발`;
}
function action(label,name,{value,disabled=false,classes='',aria,describedby}={}){
  return `<button type="button" class="${escape(classes)}" data-action="${escape(name)}"${value===undefined?'':` data-value="${escape(value)}"`}${aria?` aria-label="${escape(aria)}"`:''}${describedby?` aria-describedby="${escape(describedby)}"`:''}${disabled?' disabled':''}>${escape(label)}</button>`;
}
function equippedSlot(premium,slot){
  const item=getEquipment(premium.equipped[slot]),rank=item?premium.items[item.id]:0;
  return `<div class="equipment-slot${item?' has-equipment':''}"><div class="equipment-slot-heading"><span>${SLOT_NAMES[slot]}</span>${item?action('해제','gear-unequip',{value:slot,classes:'equipment-unset',aria:`${SLOT_NAMES[slot]} ${item.name} 장착 해제`}):'<span class="equipment-empty-label">미장착</span>'}</div><strong>${item?`${escape(item.name)} <small>${rank}강</small>`:'장비를 선택하세요'}</strong><p>${item?escape(effectText(item,rank)):'아래에서 구입한 장비를 장착할 수 있습니다.'}</p></div>`;
}
function stat(label,value,detail=''){
  return `<div class="equipment-stat"><dt>${escape(label)}</dt><dd>${escape(value)}</dd>${detail?`<p>${escape(detail)}</p>`:''}</div>`;
}
function card(premium,item){
  const offer=equipmentOffer(premium,item.id),nextRank=offer.rank+1,noteId=`equipment-note-${item.id}`;
  const status=offer.equipped?'장착 중':offer.rank?`${offer.rank}강 보유`:'미보유';
  const progress=Array.from({length:item.costs.length},(_,index)=>`<span class="${index<offer.rank?'filled':''}" aria-hidden="true"></span>`).join('');
  const costLabel=offer.maxed?'최대 5강':`${offer.rank?'다음 강화':'1강 구입'} · ${amount(offer.cost)}칩`;
  const availability=offer.maxed?'최대 강화 완료':offer.canBuy?'구입·강화할 수 있습니다.':`테스트 강화칩 ${amount(offer.shortage)}개 부족`;
  return `<article class="equipment-card${offer.equipped?' equipped':''}" data-equipment-id="${escape(item.id)}" aria-labelledby="equipment-title-${escape(item.id)}">
    <div class="equipment-card-meta"><span>${SLOT_NAMES[item.slot]} · ${escape(item.rarity)}</span><span class="equipment-status">${status}</span></div>
    <canvas class="equipment-portrait" width="360" height="180" data-equipment-portrait="${escape(item.id)}" data-equipment-rank="${offer.rank}" role="img" aria-label="${escape(item.name)} 장비 외형">${escape(item.name)}</canvas>
    <h3 id="equipment-title-${escape(item.id)}">${escape(item.name)}</h3><p class="equipment-card-description">${escape(item.description)}</p>
    <div class="equipment-rank-line"><span>${offer.rank?`현재 ${offer.rank}강`:'현재 미보유'}${offer.maxed?'':` → ${nextRank}강`}</span><span class="equipment-rank-dots" aria-label="${offer.rank} / 5강">${progress}</span></div>
    <dl class="equipment-effects">${offer.rank?`<div><dt>현재 효과</dt><dd>${escape(effectText(item,offer.rank))}</dd></div>`:''}${offer.maxed?'':`<div class="next-effect"><dt>${nextRank}강 효과</dt><dd>${escape(effectText(item,nextRank))}</dd></div>`}</dl>
    <div class="equipment-card-footer"><p id="${noteId}" class="equipment-availability${!offer.maxed&&!offer.canBuy?' shortage':''}">${escape(availability)}</p>
      ${action(costLabel,'gear-buy',{value:item.id,disabled:!offer.canBuy,classes:'primary equipment-buy',aria:offer.maxed?`${item.name} 최대 5강 완료`:`${item.name} ${nextRank}강 ${offer.rank?'강화':'구입'}, 테스트 강화칩 ${amount(offer.cost)}개`,describedby:noteId})}
      ${action(offer.equipped?'장착 중':offer.rank?'이 장비 장착':'구입 후 장착','gear-equip',{value:item.id,disabled:!offer.rank||offer.equipped,classes:'secondary equipment-equip',aria:offer.equipped?`${item.name} 장착 중`:`${item.name} ${SLOT_NAMES[item.slot]}에 장착`})}
    </div>
  </article>`;
}

export function equipmentShopHTML(raw,{baseHp=100,baseAmmo,weaponName,weaponId='shotgun'}={}){
  const premium=normalizeEquipment(raw),stats=equipmentStats(premium),weapon=weaponId==='nailgun'?'nailgun':'shotgun';
  const name=typeof weaponName==='string'&&weaponName.trim()?weaponName.trim().slice(0,48):weapon==='nailgun'?'전기 못총':'산탄총';
  const totalHp=positive(baseHp,100,10000)+stats.hpBonus,totalAmmo=positive(baseAmmo,weapon==='nailgun'?24:6,120)+stats.ammoBonus[weapon];
  return `<section class="panel equipment-shop" aria-labelledby="equipment-shop-title">
    <div class="dialog-header equipment-shop-header"><div><p class="eyebrow">SAFEHOUSE / EQUIPMENT</p><h2 id="equipment-shop-title">강화 장비 체험 상점</h2><p>테스트 강화칩으로 장비를 구입하고 5강까지 강화하세요. 무기·방호·보조 슬롯에 각각 하나씩 장착합니다.</p></div>${action('×','close',{classes:'close-button',aria:'강화 장비 상점 닫기'})}</div>
    <div class="equipment-wallet"><div><span class="equipment-test-badge">체험 상점 · 실제 결제 없음</span><p>보유 테스트 강화칩 <strong data-equipment-chips>${amount(premium.chips)}</strong></p><small>테스트칩은 이 브라우저에서 한 번 받을 수 있습니다.</small></div>${premium.testChipsClaimed?'<span class="equipment-claimed">✓ 테스트칩 지급 완료</span>':action(`테스트칩 ${amount(TEST_CHIPS)} 받기`,'gear-test-chips',{classes:'primary equipment-claim',aria:`테스트 강화칩 ${amount(TEST_CHIPS)}개 한 번 받기`})}</div>
    <div class="equipment-catalog-heading"><h3>강화 장비 6종</h3><p>장착 효과는 다음 새 캠페인부터 적용됩니다.</p></div><div class="equipment-grid">${EQUIPMENT.map(item=>card(premium,item)).join('')}</div>
    <div class="equipment-preview"><div class="equipment-preview-heading"><h3>다음 새 캠페인에 사용할 장비</h3><span>슬롯별 1개 장착</span></div><div class="equipment-slots">${EQUIPMENT_SLOTS.map(slot=>equippedSlot(premium,slot)).join('')}</div>
      <dl class="equipment-stats" aria-label="새 캠페인 시작 능력치">
        ${stat('시작 최대 체력',amount(totalHp),'안전가옥 보강 포함')}
        ${stat(`${name} 탄창`,`${amount(totalAmmo)}발`,'안전가옥 보강 포함')}
        ${stat('탄환 피해',`×${stats.damage.toFixed(2)}`)}
        ${stat('사격 속도',increase(stats.fireRate),`재장전 시간 ${percent(1-1/stats.fireRate)} 단축`)}
        ${stat('받는 피해 감소',percent(stats.mitigation))}
        ${stat('치명상 복구',`${stats.revives}회`,stats.revives?`발동 시 체력 ${percent(stats.reviveHeal)} 회복`:'이번 새 작전에 사용할 복구 횟수')}
        ${stat('경험치 획득',increase(stats.xp),`회수 범위 +${stats.pickupRadius}`)}
        ${stat('이동 속도',increase(stats.movement))}
      </dl><p class="equipment-application-note">장착 설정은 다음 새 캠페인에 적용됩니다. 이어하기는 출발 당시 장비를 유지합니다.</p>
    </div>
    <div class="panel-actions equipment-shop-actions"><span class="muted">구입한 장비와 강화 단계는 이 브라우저에 저장됩니다.</span>${action('작전 지도로','campaign',{classes:'secondary'})}</div>
  </section>`;
}
