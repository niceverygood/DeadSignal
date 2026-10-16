import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyMoodboardUI, EQUIPMENT_MOODBOARD_ART, MOODBOARD_CROPS } from '../dist/moodboard-ui.js';
import { equipmentShopHTML } from '../dist/equipment-ui.js';
import { renderEquipmentPortrait } from '../dist/equipment-art.js';

class Node {
  constructor(tag, document) {
    this.tagName=tag;this.ownerDocument=document;this.children=[];this.parentElement=null;this.dataset={};this.attributes=new Map();this.listeners=new Map();this.className='';this.hidden=false;
    this.style={setProperty(name,value){this[name]=value;}};
    const names=()=>this.className.split(/\s+/).filter(Boolean);
    this.classList={add:(...values)=>{this.className=[...new Set([...names(),...values])].join(' ');},remove:(...values)=>{this.className=names().filter(name=>!values.includes(name)).join(' ');},contains:value=>names().includes(value)};
  }
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  before(node){const parent=this.parentElement;node.parentElement=parent;parent.children.splice(parent.children.indexOf(this),0,node);}
  after(node){const parent=this.parentElement;node.parentElement=parent;parent.children.splice(parent.children.indexOf(this)+1,0,node);}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  removeAttribute(name){this.attributes.delete(name);}
  addEventListener(type,callback,{once=false}={}){const list=this.listeners.get(type)||[];list.push({callback,once});this.listeners.set(type,list);}
  emit(type){for(const entry of [...(this.listeners.get(type)||[])]){if(entry.once)this.listeners.set(type,this.listeners.get(type).filter(item=>item!==entry));entry.callback({target:this});}}
  matches(selector){
    if(selector==='img')return this.tagName==='img';
    if(selector==='[data-equipment-portrait]')return Object.hasOwn(this.dataset,'equipmentPortrait');
    if(selector==='[data-equipment-art-status]')return Object.hasOwn(this.dataset,'equipmentArtStatus');
    if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));
    return false;
  }
  querySelector(selector){
    if(selector.startsWith(':scope > '))return this.children.find(child=>child.matches(selector.slice(9)))||null;
    for(const child of this.children){if(child.matches(selector))return child;const descendant=child.querySelector(selector);if(descendant)return descendant;}
    return null;
  }
  closest(selector){let node=this;while(node){if(node.matches(selector))return node;node=node.parentElement;}return null;}
}
function view({imageState='loading',profile={chips:1000,items:{'blackout-rounds':1,'quarantine-armor':3},equipped:{weapon:'blackout-rounds',armor:'quarantine-armor'},testChipsClaimed:true}}={}){
  const before=JSON.stringify(profile),html=equipmentShopHTML(profile),images=[];
  const document={createElement(tag){const node=new Node(tag,document);if(tag==='img'){images.push(node);node.complete=imageState!=='loading';node.naturalWidth=imageState==='ready'?1672:0;node.naturalHeight=imageState==='ready'?941:0;}return node;}};
  const shop=new Node('section',document);shop.className='panel equipment-shop';
  const heading=new Node('div',document);heading.className='equipment-catalog-heading';shop.append(heading);
  const cards=Object.keys(EQUIPMENT_MOODBOARD_ART).map(id=>{
    const card=new Node('article',document);card.className='equipment-card';card.dataset.equipmentId=id;
    const article=html.match(new RegExp(`<article[^>]*data-equipment-id="${id}"[\\s\\S]*?<\\/article>`))[0];
    const canvas=new Node('canvas',document);canvas.className='equipment-portrait';canvas.dataset.equipmentPortrait=id;canvas.width=360;canvas.height=180;canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label',article.match(/<canvas[^>]*aria-label="([^"]+)"/)[1]);
    canvas.getBoundingClientRect=()=>({width:360,height:180});canvas.drawCalls=[];
    const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get(object,key){if(key in object)return object[key];return (...args)=>canvas.drawCalls.push([key,...args]);}});
    canvas.getContext=()=>context;
    const controls=[...article.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match=>{const button=new Node('button',document);button.html=match[0];button.disabled=/\sdisabled(?:>|\s)/.test(button.html);button.dataset.action=button.html.match(/data-action="([^"]+)"/)[1];button.dataset.value=id;return button;});
    card.append(canvas,...controls);shop.append(card);
    return {card,canvas,controls,controlState:controls.map(button=>({html:button.html,disabled:button.disabled,action:button.dataset.action,value:button.dataset.value}))};
  });
  const overlay=new Node('div',document);overlay.append(shop);
  overlay.querySelectorAll=selector=>selector==='.equipment-card[data-equipment-id]'?cards.map(item=>item.card):[];
  const unchanged=()=>{
    assert.equal(JSON.stringify(profile),before);
    for(const item of cards){assert.deepEqual(item.controls.map(button=>({html:button.html,disabled:button.disabled,action:button.dataset.action,value:button.dataset.value})),item.controlState);assert.ok(item.controls.every(button=>item.card.children.includes(button)));}
  };
  const paint=()=>{applyMoodboardUI(overlay,'equipment');for(const {canvas,card} of cards)assert.equal(renderEquipmentPortrait(canvas,card.dataset.equipmentId),true);};
  return {overlay,shop,cards,images,paint,unchanged};
}
const preview=item=>item.card.querySelector(':scope > .mood-equipment-portrait');
const fallbackVisible=item=>{assert.equal(preview(item).hidden,true);assert.equal(item.canvas.classList.contains('mood-equipment-canvas-hidden'),false);assert.equal(item.canvas.attributes.has('aria-hidden'),false);assert.equal(item.canvas.attributes.get('role'),'img');assert.ok(item.canvas.attributes.get('aria-label'));assert.ok(item.canvas.drawCalls.length>10,'the actual local canvas painter remains available');};

test('all six loading shop images keep the actual painted canvas accessible without replacing purchase/equip controls',()=>{
  const f=view();f.paint();assert.equal(f.images.length,6);
  for(const item of f.cards)fallbackVisible(item);
  assert.equal(f.shop.querySelector('[data-equipment-art-status]'),null);f.unchanged();
});
test('PNG failures preserve all six previews and create one shared retry notice, including repeated decoration',()=>{
  const f=view();f.paint();for(const image of f.images)image.emit('error');
  for(const item of f.cards)fallbackVisible(item);
  const notice=f.shop.querySelector('[data-equipment-art-status]');assert.ok(notice);assert.equal(notice.attributes.get('role'),'status');assert.match(notice.textContent,/상점을 다시 열어주세요/);
  const wrappers=f.cards.map(preview);f.paint();f.paint();
  assert.equal(f.images.length,6);assert.deepEqual(f.cards.map(preview),wrappers);
  assert.equal(f.shop.children.filter(child=>child.dataset.equipmentArtStatus==='').length,1);assert.equal(f.shop.querySelector('[data-equipment-art-status]'),notice);
  for(const item of f.cards)fallbackVisible(item);f.unchanged();
});
test('successful images replace the fallback exactly once while preserving original Board49 crop coordinates and source URL',()=>{
  const cropBefore=JSON.stringify(MOODBOARD_CROPS),f=view();f.paint();
  for(let i=0;i<f.cards.length;i++){
    const item=f.cards[i],image=f.images[i],registered=EQUIPMENT_MOODBOARD_ART[item.card.dataset.equipmentId],region=MOODBOARD_CROPS[registered.crop];
    assert.match(image.src,/\/assets\/ui\/source-49-equipment-shop\.png$/);
    assert.equal(image.style.left,`${-region.x/region.w*100}%`);assert.equal(image.style.top,`${-region.y/region.h*100}%`);assert.equal(image.style.width,`${1672/region.w*100}%`);assert.equal(image.style.height,`${941/region.h*100}%`);
    image.complete=true;image.naturalWidth=1672;image.naturalHeight=941;image.emit('load');
    assert.equal(preview(item).hidden,false);assert.equal(item.canvas.classList.contains('mood-equipment-canvas-hidden'),true);assert.equal(item.canvas.attributes.get('aria-hidden'),'true');assert.equal(image.alt,registered.alt);
  }
  const wrappers=f.cards.map(preview);f.paint();assert.equal(f.images.length,6);assert.deepEqual(f.cards.map(preview),wrappers);assert.equal(JSON.stringify(MOODBOARD_CROPS),cropBefore);f.unchanged();
});
test('already complete cached successes and failures settle immediately; reopening after a failure can recover',()=>{
  const loaded=view({imageState:'ready'});loaded.paint();for(const item of loaded.cards){assert.equal(preview(item).hidden,false);assert.equal(item.canvas.attributes.get('aria-hidden'),'true');}loaded.unchanged();
  const broken=view({imageState:'failed'});broken.paint();for(const item of broken.cards)fallbackVisible(item);assert.equal(broken.shop.children.filter(child=>child.dataset.equipmentArtStatus==='').length,1);broken.unchanged();
  const reopened=view();reopened.paint();for(const image of reopened.images){image.naturalWidth=1672;image.emit('load');}
  for(const item of reopened.cards)assert.equal(preview(item).hidden,false);assert.equal(reopened.shop.querySelector('[data-equipment-art-status]'),null);reopened.unchanged();
});
test('the canonical flex portrait explicitly obeys hidden while its image is unavailable',async()=>{
  const css=await readFile(new URL('../dist/moodboard-ui.css',import.meta.url),'utf8');
  assert.match(css,/\.moodboard-ui \.mood-equipment-portrait\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});
