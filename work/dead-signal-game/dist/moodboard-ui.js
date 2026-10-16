// Visual DOM adapter only. No Game, profile, storage, audio, input or RNG access.
const SOURCES=Object.freeze({
  title:new URL('./assets/ui/source-01-title-menu.png',import.meta.url).href,
  safehouse:new URL('./assets/ui/source-02-safehouse-loadout.png',import.meta.url).href,
  upgrade:new URL('./assets/ui/source-06-levelup-upgrades.png',import.meta.url).href,
  equipment:new URL('./assets/ui/source-49-equipment-shop.png',import.meta.url).href
});
const SIZE={width:1672,height:941};
export const MOODBOARD_CROPS=Object.freeze({
  wordmark:{source:'title',x:28,y:7,w:439,h:71},
  signal:{source:'title',x:478,y:9,w:46,h:68},
  charcoal:{source:'title',x:1420,y:102,w:225,h:33},
  amber:{source:'safehouse',x:1287,y:557,w:42,h:43},
  safehouseScene:{source:'safehouse',x:15,y:143,w:1226,h:474},
  workbench:{source:'safehouse',x:549,y:666,w:518,h:232},
  shotgun:{source:'title',x:58,y:786,w:329,h:112},
  nailgun:{source:'title',x:412,y:773,w:177,h:124},
  speaker:{source:'title',x:792,y:770,w:144,h:128},
  molotov:{source:'title',x:634,y:766,w:126,h:132},
  shells:{source:'title',x:233,y:849,w:70,h:45},
  survivor:{source:'safehouse',x:34,y:667,w:117,h:226},
  backpack:{source:'safehouse',x:371,y:667,w:152,h:230},
  pierce:{source:'upgrade',x:424,y:346,w:162,h:164},
  reload:{source:'upgrade',x:635,y:335,w:158,h:175},
  knockback:{source:'upgrade',x:838,y:321,w:170,h:190},
  // Board49's six central cards: item pixels only, below each title and left
  // of the rank circles/buttons. The original charcoal backing is retained.
  equipmentBlackout:{source:'equipment',x:568,y:230,w:140,h:144},
  equipmentMagazine:{source:'equipment',x:856,y:231,w:140,h:144},
  equipmentArmor:{source:'equipment',x:565,y:429,w:142,h:146},
  equipmentField:{source:'equipment',x:854,y:430,w:143,h:146},
  equipmentCore:{source:'equipment',x:568,y:638,w:140,h:140},
  equipmentMagnet:{source:'equipment',x:855,y:638,w:144,h:141},
  hudSpeaker:{source:'safehouse',x:1320,y:348,w:99,h:93},
  hudMolotov:{source:'safehouse',x:1315,y:451,w:126,h:88}
});
const UPGRADE_ART=Object.freeze({pierce:'pierce',reload:'reload',knockback:'knockback',shock:'nailgun',volatile:'molotov',pellets:'shotgun',damage:'shells',haste:'nailgun',magnet:'backpack',health:'survivor',speed:'survivor',fire:'molotov'});
export const EQUIPMENT_MOODBOARD_ART=Object.freeze({
  'blackout-rounds':Object.freeze({crop:'equipmentBlackout',alt:'블랙아웃 탄두 — 구리색 끝이 달린 검은 탄두 두 개'}),
  'storm-magazine':Object.freeze({crop:'equipmentMagazine',alt:'폭풍 탄창 — 파란 금속 드럼 탄창'}),
  'quarantine-armor':Object.freeze({crop:'equipmentArmor',alt:'격리 방호복 — 낡은 올리브색 방호복'}),
  'barrier-field':Object.freeze({crop:'equipmentField',alt:'차단 역장 — 청록색 빛의 육각형 역장 모듈'}),
  'survival-core':Object.freeze({crop:'equipmentCore',alt:'생존 코어 — 검은 의료 가방과 청록색 약병'}),
  'magnetic-recovery':Object.freeze({crop:'equipmentMagnet',alt:'자기장 회수기 — 빨간 말굽형 자석'})
});
export const ARMORY_MOODBOARD_ART=Object.freeze({
  armor:Object.freeze({image:new URL('./assets/ui/armory/armor-reinforcement.png',import.meta.url).href}),
  magazine:Object.freeze({image:new URL('./assets/ui/armory/extended-magazine.png',import.meta.url).href}),
  shotgun:Object.freeze({crop:'shotgun'}),
  nailgun:Object.freeze({crop:'nailgun'}),
  research:Object.freeze({image:new URL('./assets/ui/armory/build-research.png',import.meta.url).href})
});

function crop(document,key,{className='',stretch=false,alt=''}={}){
  const region=MOODBOARD_CROPS[key],frame=document.createElement('span'),image=document.createElement('img');
  if(!region)throw new Error(`Unknown original PNG crop: ${key}`);
  frame.className=`mood-source-crop ${className}`.trim();frame.dataset.moodCrop=key;
  if(!alt)frame.setAttribute('aria-hidden','true');
  frame.style.setProperty('--mood-art-ratio',String(region.w/region.h));
  if(!stretch)frame.style.aspectRatio=`${region.w} / ${region.h}`;
  image.className='mood-source-image';image.alt=alt;image.decoding='async';image.draggable=false;
  image.style.width=`${SIZE.width/region.w*100}%`;image.style.height=`${SIZE.height/region.h*100}%`;
  image.style.left=`${-region.x/region.w*100}%`;image.style.top=`${-region.y/region.h*100}%`;
  image.addEventListener('error',()=>{frame.hidden=true;},{once:true});
  image.src=SOURCES[region.source];frame.append(image);return frame;
}
function grain(element,key='charcoal'){
  if(element.querySelector(':scope > .mood-material'))return;
  element.classList.add('mood-plate');element.prepend(crop(element.ownerDocument,key,{className:'mood-material',stretch:true}));
}
function replaceIcon(element,key){
  const icon=element.querySelector('.card-icon');if(!icon||icon.dataset.moodCrop===key)return;
  icon.classList.add('mood-card-art');icon.dataset.moodCrop=key;
  icon.replaceChildren(crop(element.ownerDocument,key,{className:'mood-prop'}));
}
function addHero(panel){
  if(panel.querySelector(':scope > .mood-safehouse-hero'))return;
  const hero=panel.ownerDocument.createElement('div');hero.className='mood-safehouse-hero';hero.setAttribute('aria-hidden','true');
  for(const[key,className]of[['safehouseScene','mood-room'],['workbench','mood-workbench']]){
    const cell=panel.ownerDocument.createElement('span');cell.className='mood-hero-cell';cell.append(crop(panel.ownerDocument,key,{className}));hero.append(cell);
  }
  const header=panel.querySelector(':scope > .dialog-header');if(header)header.after(hero);else panel.prepend(hero);
}
function addEquipmentArt(card){
  const art=EQUIPMENT_MOODBOARD_ART[card.dataset.equipmentId],canvas=card.querySelector('[data-equipment-portrait]');
  if(!art||!canvas)return;
  if(card.querySelector(':scope > .mood-equipment-portrait'))return;
  const frame=card.ownerDocument.createElement('div');frame.className='mood-equipment-portrait';frame.hidden=true;
  const item=crop(card.ownerDocument,art.crop,{className:'mood-equipment-item',alt:art.alt}),image=item.querySelector('img');
  frame.append(item);canvas.before(frame);
  // The existing canvas remains painted and accessible while the canonical
  // PNG is loading. Only a successful image may replace that preview.
  canvas.classList.remove('mood-equipment-canvas-hidden');canvas.removeAttribute('aria-hidden');
  let settled=false;
  const ready=()=>{if(settled)return;settled=true;frame.hidden=false;canvas.classList.add('mood-equipment-canvas-hidden');canvas.setAttribute('aria-hidden','true');};
  const failed=()=>{
    if(settled)return;settled=true;frame.hidden=true;canvas.classList.remove('mood-equipment-canvas-hidden');canvas.removeAttribute('aria-hidden');
    const shop=card.closest('.equipment-shop');
    if(!shop||shop.querySelector('[data-equipment-art-status]'))return;
    const notice=card.ownerDocument.createElement('p');notice.className='equipment-art-status';notice.dataset.equipmentArtStatus='';notice.setAttribute('role','status');
    notice.textContent='이미지를 불러오지 못했습니다. 상점을 다시 열어주세요.';
    const heading=shop.querySelector('.equipment-catalog-heading');if(heading)heading.after(notice);else shop.append(notice);
  };
  image.addEventListener('load',ready,{once:true});image.addEventListener('error',failed,{once:true});
  if(image.complete){if(image.naturalWidth>0)ready();else failed();}
}
function addArmoryArt(card){
  const key=card.dataset.armoryItem,art=ARMORY_MOODBOARD_ART[key],frame=card.querySelector('[data-armory-art]');
  if(!art||!frame||frame.dataset.armoryReady===key)return;
  // The card's native title describes the illustration; keep that title,
  // prices, disabled state and purchase button as the accessible controls.
  frame.setAttribute('aria-hidden','true');
  if(art.crop)frame.replaceChildren(crop(card.ownerDocument,art.crop,{className:'mood-armory-prop'}));
  else{
    const image=card.ownerDocument.createElement('img');
    image.className='armory-illustration';image.alt='';image.decoding='async';image.draggable=false;
    image.addEventListener('error',()=>{image.hidden=true;},{once:true});
    image.src=art.image;frame.replaceChildren(image);
  }
  frame.dataset.armoryReady=key;
}

// Decorate the persistent HUD once. All game labels, SVG fallback icons,
// cooldown nodes and input targets remain in place and keep their geometry.
export function applyMoodboardHUD(hud){
  if(!hud?.querySelectorAll)return;
  hud.classList.add('moodboard-hud');
  for(const plate of hud.querySelectorAll('.survivor-status,.mission-status,.combat-numbers,.growth-status,.objective-status,.ability-button'))grain(plate);
  // These labels are updated through textContent/querySelector('span') by app;
  // CSS supplies their grain without introducing a competing text/icon node.
  for(const button of hud.querySelectorAll('.hud-menu button'))button.classList.add('mood-plate');
  for(const [id,key]of [['lure-btn','hudSpeaker'],['fire-btn','hudMolotov']]){
    const icon=hud.querySelector(`#${id} .ability-icon`);
    if(!icon||icon.querySelector('.mood-hud-ability-art'))continue;
    const art=crop(hud.ownerDocument,key,{className:'mood-hud-ability-art'}),image=art.querySelector('img');
    const ready=()=>icon.classList.add('mood-hud-ability-ready');
    image.addEventListener('load',ready,{once:true});
    image.addEventListener('error',()=>{art.remove();icon.classList.remove('mood-hud-ability-ready');},{once:true});
    icon.append(art);if(image.complete&&image.naturalWidth>0)ready();
  }
  for(const id of ['touch-controls','controls-hint','toast']){
    const el=hud.ownerDocument.getElementById(id);if(el)el.classList.add('moodboard-controls');
  }
  const shoot=hud.ownerDocument.getElementById('touch-shoot');if(shoot)shoot.classList.add('mood-plate');
}

export function applyMoodboardUI(overlay,state){
  if(!overlay?.querySelectorAll)return;
  overlay.classList.add('moodboard-ui');overlay.dataset.artScreen=state;
  const wordmark=overlay.querySelector('.menu-screen .wordmark');
  if(wordmark&&!wordmark.querySelector('.mood-wordmark-image')){
    wordmark.setAttribute('aria-label','DEAD SIGNAL');
    const art=crop(overlay.ownerDocument,'wordmark',{className:'mood-wordmark-image'}),image=art.querySelector('img');
    const ready=()=>wordmark.classList.add('mood-wordmark-ready');
    image.addEventListener('load',ready,{once:true});image.addEventListener('error',()=>{art.remove();wordmark.classList.remove('mood-wordmark-ready');},{once:true});
    wordmark.append(art);if(image.complete&&image.naturalWidth>0)ready();
  }
  const signal=overlay.querySelector('.menu-screen .signal-bars');
  if(signal&&!signal.querySelector('.mood-signal-image'))signal.replaceChildren(crop(overlay.ownerDocument,'signal',{className:'mood-signal-image'}));
  for(const panel of overlay.querySelectorAll('.panel:not(.menu-screen),.dialog-panel,.upgrade-screen,.shop-screen,.result-screen'))grain(panel);
  for(const plate of overlay.querySelectorAll('.choice-card,.route-node,.mission-node,.mission-dossier,.mission-boss,.boss-roster-card,.boss-dossier,.equipment-card,.equipment-slot,.equipment-preview,.equipment-wallet'))grain(plate);
  for(const button of overlay.querySelectorAll('.primary,.secondary,.menu-actions .ghost')){
    if(!button.querySelector(':scope > .mood-material'))grain(button,button.classList.contains('primary')?'amber':'charcoal');
  }
  if(['loadout','armory'].includes(state)){
    const panel=overlay.querySelector('.panel');if(panel)addHero(panel);
  }
  if(state==='loadout'){
    for(const card of overlay.querySelectorAll('.loadout-grid [data-action="weapon"]')){
      if(['shotgun','nailgun'].includes(card.dataset.value))replaceIcon(card,card.dataset.value);
    }
    const utility=overlay.querySelector('.loadout-grid .choice-card:not([data-action])');
    if(utility){const icon=utility.querySelector('.card-icon');if(icon&&!icon.querySelector('.mood-utility-pair')){
      icon.classList.add('mood-card-art');const pair=overlay.ownerDocument.createElement('span');pair.className='mood-utility-pair';pair.setAttribute('aria-hidden','true');
      pair.append(crop(overlay.ownerDocument,'speaker'),crop(overlay.ownerDocument,'molotov'));icon.replaceChildren(pair);
    }}
  }
  if(state==='armory')for(const card of overlay.querySelectorAll('.armory-card[data-armory-item]'))addArmoryArt(card);
  if(state==='upgrade')for(const card of overlay.querySelectorAll('[data-action="upgrade"]')){
    if(UPGRADE_ART[card.dataset.value])replaceIcon(card,UPGRADE_ART[card.dataset.value]);
  }
  for(const card of overlay.querySelectorAll('.equipment-card[data-equipment-id]'))addEquipmentArt(card);
  // Canonical boss canvases are preserved for the existing model renderer.
}
