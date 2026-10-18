// Future dist/upgrade-status-view.js. Pure display: no input, Game mutation,
// RNG, storage, image loading, clocks or duplicated combat/growth formulas.
import {getUpgradeCharacterStats,getUpgradeDisplay,UPGRADES,WEAPONS} from './upgrade-model.js';
import {MOODBOARD_CROPS} from './moodboard-ui.js?v=0.29.0';

const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const number=(value,digits=0)=>Number.isFinite(value)?new Intl.NumberFormat('ko-KR',{maximumFractionDigits:digits}).format(value):'—';
const ART={pierce:'pierce',reload:'reload',knockback:'knockback',shock:'nailgun',volatile:'molotov',pellets:'shotgun',damage:'shells',haste:'nailgun',magnet:'backpack',health:'survivor',speed:'survivor',fire:'molotov'};
const ART_SOURCES={title:new URL('./assets/ui/source-01-title-menu.png',import.meta.url).href,safehouse:new URL('./assets/ui/source-02-safehouse-loadout.png',import.meta.url).href,upgrade:new URL('./assets/ui/source-06-levelup-upgrades.png',import.meta.url).href};
function artMarkup(key,className){
 const crop=MOODBOARD_CROPS[key];if(!crop||!ART_SOURCES[crop.source])return'';
 return `<span class="mood-source-crop ${escape(className)}" data-mood-crop="${escape(key)}" aria-hidden="true" style="--mood-art-ratio:${crop.w/crop.h}"><img class="mood-source-image" src="${escape(ART_SOURCES[crop.source])}" alt="" decoding="async" draggable="false" style="width:${1672/crop.w*100}%;height:${941/crop.h*100}%;left:${-crop.x/crop.w*100}%;top:${-crop.y/crop.h*100}%"></span>`;
}
function displayCopy(display){
 if(!display)return null;
 return {id:display.id,name:display.name,icon:display.icon,rank:display.rank,nextRank:display.nextRank,currentEffects:[...display.currentEffects],nextEffects:[...display.nextEffects],summary:display.summary};
}
export function createUpgradeStatusView(game){
 const raw=getUpgradeCharacterStats(game),choices=game.choices.map((choice,index)=>{const display=displayCopy(getUpgradeDisplay(game,choice.id));if(!display)throw Error('upgrade-status-choice-unavailable');return {...display,shortcut:index+1};});
 const owned=UPGRADES.filter(item=>Number.isSafeInteger(game.upgrades[item.id])&&game.upgrades[item.id]>0).map(item=>displayCopy(getUpgradeDisplay(game,item.id))).filter(Boolean);
 const stats=[
  {id:'health',label:'현재 체력',value:`${number(raw.hp,1)} / ${number(raw.maxHp,1)}`,hint:'HP'},
  {id:'damage',label:'탄환 피해',value:number(raw.bulletDamage,2),hint:`1발당 · 한 번에 ${number(raw.pellets)}발`},
  {id:'fire',label:'발사 간격',value:`${number(raw.fireInterval,3)}초`,hint:'재장전 시간 제외'},
  {id:'reload',label:'재장전',value:`${number(raw.reloadDuration,3)}초`,hint:'현재 무기'},
  {id:'movement',label:'이동 속도',value:number(raw.moveSpeed,1),hint:'회피 속도 제외'},
  {id:'mitigation',label:'피해 경감',value:`${number(raw.mitigation*100,1)}%`,hint:'장착 방어 장비'},
 ];
 return {level:game.player.level,weaponName:WEAPONS[game.player.weapon]?.name||'현재 무기',rawStats:{...raw},stats,choices,owned};
}
function choiceMarkup(choice){
 const id=escape(choice.id),current=choice.currentEffects.map(escape).join(' · '),next=choice.nextEffects.map(escape).join(' · ');
 return `<button type="button" class="choice-card upgrade-choice" data-action="upgrade" data-value="${id}" aria-label="${escape(choice.name)}, 현재 ${number(choice.rank)}단계, 선택 시 ${number(choice.nextRank)}단계" aria-describedby="upgrade-effects-${id}"><span class="upgrade-choice-key" aria-hidden="true">${choice.shortcut}</span><span class="card-icon" aria-hidden="true">${escape(choice.icon)}</span><span class="upgrade-choice-content"><span class="upgrade-choice-ranks"><span>현재 ${number(choice.rank)}단계</span><i aria-hidden="true">→</i><b>${number(choice.nextRank)}단계</b></span><span class="card-title">${escape(choice.name)}</span><span class="card-desc">${escape(choice.summary)}</span><span class="upgrade-choice-effect" id="upgrade-effects-${id}"><small>현재 · ${current}</small><strong>다음 · ${next}</strong></span><span class="card-meta">${choice.shortcut} 키 또는 터치로 선택</span></span></button>`;
}
function ownedMarkup(owned,compact){
 const skills=owned.map(skill=>`<li class="upgrade-owned-skill" title="${escape(skill.currentEffects.join(' · '))}">${artMarkup(ART[skill.id],'upgrade-owned-art')}<span class="upgrade-owned-name">${escape(skill.name)}</span><span class="upgrade-owned-rank" aria-label="현재 ${number(skill.rank)}단계"><small>RANK</small>${number(skill.rank)}</span></li>`).join('');
 return `<details class="upgrade-owned"${compact?'':' open'}><summary>보유 개조 ${number(owned.length)}<span>현재 단계 · 펼쳐서 빌드 확인</span></summary>${owned.length?`<ul class="upgrade-owned-grid" aria-label="현재 보유한 스킬과 단계">${skills}</ul>`:'<p class="upgrade-owned-empty">아직 선택한 개조가 없습니다. 이번 선택으로 빌드를 시작하세요.</p>'}</details>`;
}
export function upgradeStatusHTML(game,{compact=false}={}){
 const view=createUpgradeStatusView(game),long=String(view.level).length>3;
 return `<section class="upgrade-screen upgrade-status-screen" role="dialog" aria-modal="true" aria-labelledby="upgrade-status-title"><header class="upgrade-level-header"><div class="upgrade-level-badge${long?' level-long':''}" aria-label="현재 레벨 ${number(view.level)}"><span aria-hidden="true">LV</span><strong aria-hidden="true">${number(view.level)}</strong></div><div class="upgrade-level-copy"><p class="eyebrow">LEVEL UP / CHOOSE YOUR BUILD</p><h2 id="upgrade-status-title">무기 개조 선택</h2><p>하나를 선택하면 전투가 이어집니다.</p></div><div class="upgrade-current-character">${artMarkup('survivor','upgrade-hero-art')}<div><small>CURRENT LOADOUT</small><b>${escape(view.weaponName)}</b></div></div></header><dl class="upgrade-character-stats" aria-label="현재 캐릭터 능력치">${view.stats.map(stat=>`<div class="upgrade-stat upgrade-stat-${stat.id}"><dt>${stat.label}</dt><dd>${escape(stat.value)}</dd><small>${stat.hint}</small></div>`).join('')}</dl><div class="upgrade-section-heading"><h3>다음 개조</h3><p>현재 단계와 다음 효과를 비교하세요.</p></div><div class="choice-grid" role="group" aria-label="세 가지 개조 중 하나 선택">${view.choices.map(choiceMarkup).join('')}</div>${ownedMarkup(view.owned,compact)}<p class="upgrade-status-footnote">탄환 피해는 적 방어 적용 전 1발 기준입니다.</p></section>`;
}
