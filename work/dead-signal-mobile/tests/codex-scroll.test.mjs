import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {captureCodexScroll,restoreCodexScroll,selectCodexBossView} from '../dist/codex-scroll.js';
import {Game} from '../dist/engine.js';
import {getBoss} from '../dist/campaign.js';
import {bossCodexHTML} from '../dist/campaign-ui.js';

const keys=['boss-01-mid','boss-04-final','boss-12-final'];
const node=(values={})=>({scrollLeft:0,scrollTop:0,scrollWidth:390,clientWidth:390,scrollHeight:1800,clientHeight:780,...values});
function view(){
  const page=node({clientHeight:844,scrollHeight:2000}),ownerDocument={scrollingElement:page,activeElement:null},focuses=[];
  const root=node({clientHeight:844,scrollHeight:1400,ownerDocument,visible:true,painted:false,focusFault:false});
  root.install=({short=false,codex=true}={})=>{
    root.visible=codex;root.painted=false;
    const panel=node({clientWidth:360,scrollWidth:360,scrollHeight:short?900:1800});
    const roster=node({clientWidth:330,scrollWidth:short?1200:3000,clientHeight:155,scrollHeight:155});
    const makeButton=key=>({dataset:{action:'boss-detail',value:key},focus(options){focuses.push({key,options});ownerDocument.activeElement=this;if(root.focusFault){roster.scrollLeft=0;panel.scrollTop=0;root.scrollTop=0;page.scrollTop=0;}}});
    const buttons=keys.map(makeButton),close={focus(options){focuses.push({key:'close',options});ownerDocument.activeElement=this;}};
    roster.querySelectorAll=selector=>selector==='[data-action="boss-detail"]'?buttons:[];
    panel.querySelector=selector=>selector==='.boss-roster'?roster:null;
    Object.assign(root,{panel,roster,buttons,close});
  };
  root.querySelector=selector=>selector==='.codex-panel'?(root.visible?root.panel:null):selector==='button:not(:disabled)'?root.close:null;
  Object.defineProperty(root,'innerHTML',{set(html){root.html=html;root.install({codex:html.includes('class="panel codex-panel"')});root.scrollLeft=0;root.scrollTop=0;page.scrollLeft=0;page.scrollTop=0;},get(){return root.html||'';}});
  root.install();
  const setPositions=()=>{root.scrollTop=88.25;root.panel.scrollTop=612.5;root.roster.scrollLeft=1184.75;page.scrollTop=176.125;};
  const positions=()=>({overlay:{left:root.scrollLeft,top:root.scrollTop},panel:{left:root.panel.scrollLeft,top:root.panel.scrollTop},roster:{left:root.roster.scrollLeft,top:root.roster.scrollTop},page:{left:page.scrollLeft,top:page.scrollTop}});
  return{root,page,focuses,setPositions,positions};
}
const capture=game=>JSON.stringify({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,random:game.random.getState(),visual:game.visualRandom.getState(),id:game.id});

test('an existing codex selection captures fractional coordinates as immutable data without keeping or changing DOM nodes',()=>{
  const f=view();f.setPositions();const before=f.positions();
  const snapshot=captureCodexScroll(f.root,{screen:'codex',action:'boss-detail',selectedKey:keys[1]});
  assert.deepEqual(snapshot.positions,before);assert.deepEqual(f.positions(),before);assert.equal(snapshot.selectedKey,keys[1]);
  assert.ok(Object.isFrozen(snapshot));assert.ok(Object.isFrozen(snapshot.positions.panel));
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)),snapshot);assert.equal(f.focuses.length,0);
  assert.throws(()=>{snapshot.positions.roster.left=0;},TypeError);
});

test('fresh replacement nodes regain inner-to-outer scroll positions after selected-card focus, even when focus scrolls an ancestor',()=>{
  const f=view();f.setPositions();const oldPanel=f.root.panel,oldRoster=f.root.roster,before=f.positions();
  const snapshot=captureCodexScroll(f.root,{screen:'codex',action:'boss-detail',selectedKey:keys[1]});
  f.root.install();f.root.scrollTop=f.page.scrollTop=0;f.root.focusFault=true;
  assert.notEqual(f.root.panel,oldPanel);assert.notEqual(f.root.roster,oldRoster);
  assert.equal(restoreCodexScroll(f.root,snapshot,{screen:'codex'}),true);assert.deepEqual(f.positions(),before);
  assert.deepEqual(f.focuses,[{key:keys[1],options:{preventScroll:true}}]);
  assert.equal(oldPanel.scrollTop,612.5);assert.equal(oldRoster.scrollLeft,1184.75,'detached old elements are never written during restore');
});

test('a shorter dossier or resized roster clamps to fresh real bounds rather than creating horizontal or vertical overflow',()=>{
  const f=view();f.setPositions();const snapshot=captureCodexScroll(f.root,{screen:'codex',action:'boss-detail'});
  f.root.install({short:true});f.page.scrollHeight=f.page.clientHeight;f.root.scrollHeight=f.root.clientHeight;
  assert.equal(restoreCodexScroll(f.root,snapshot,{screen:'codex'}),true);
  assert.equal(f.root.panel.scrollTop,120);assert.equal(f.root.roster.scrollLeft,870);assert.equal(f.page.scrollTop,0);assert.equal(f.root.scrollTop,0);
  f.root.roster.scrollWidth=f.root.roster.clientWidth;
  restoreCodexScroll(f.root,snapshot,{screen:'codex'});assert.equal(f.root.roster.scrollLeft,0,'a desktop roster without overflow cannot retain a mobile-only offset');
});

test('initial entry, other actions/screens, missing codex DOM and malformed coordinates never restore or focus anything',()=>{
  const forbidden={querySelector(){throw Error('other UI must not be inspected');}};
  for(const screen of ['menu','campaign','equipment','settings','playing',null])assert.equal(captureCodexScroll(forbidden,{screen,action:'boss-detail'}),null);
  for(const action of ['codex','close','campaign','start'])assert.equal(captureCodexScroll(forbidden,{screen:'codex',action}),null);
  const f=view();f.setPositions();const snapshot=captureCodexScroll(f.root,{screen:'codex',action:'boss-detail'}),before=f.positions();
  assert.equal(restoreCodexScroll(forbidden,snapshot,{screen:'campaign'}),false);
  for(const bad of [null,{...snapshot,kind:'other'},{...snapshot,positions:{}},{...snapshot,positions:{...snapshot.positions,panel:null}},{...snapshot,positions:{...snapshot.positions,panel:{left:0,top:NaN}}},{...snapshot,positions:{...snapshot.positions,roster:{left:-1,top:0}}}])
    assert.equal(restoreCodexScroll(f.root,bad,{screen:'codex'}),false);
  assert.deepEqual(f.positions(),before);assert.equal(f.focuses.length,0);
  f.root.visible=false;assert.equal(captureCodexScroll(f.root,{screen:'codex',action:'boss-detail'}),null);
  assert.equal(restoreCodexScroll(f.root,snapshot,{screen:'codex'}),false);assert.equal(f.focuses.length,0);
});

test('elastic negative or nonfinite offsets become safe zeroes without requiring global window or document',()=>{
  const f=view();f.root.roster.scrollLeft=-12;f.root.panel.scrollTop=Infinity;f.root.scrollTop=NaN;
  const snapshot=captureCodexScroll(f.root,{screen:'codex',action:'boss-detail'});
  assert.equal(snapshot.positions.roster.left,0);assert.equal(snapshot.positions.panel.top,0);assert.equal(snapshot.positions.overlay.top,0);
  f.root.install();assert.equal(restoreCodexScroll(f.root,snapshot,{screen:'codex'}),true);
  assert.ok(Object.values(f.positions()).every(position=>Number.isFinite(position.left)&&Number.isFinite(position.top)));
});

// Execute the real draft app functions with small browser ports. This checks
// the actual action -> DOM replacement -> portrait -> focus/restore ordering,
// rather than duplicating that control flow inside the tests.
function appHarness({screen='codex'}={}){
  const f=view(),game=new Game({seed:20021,missionId:'mission-01'});game.shoot();game.pause();
  const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  // These app functions depend on the store-channel constant declared outside
  // the extracted range. Evaluate the real declaration against a store DOM.
  const releaseDeclaration=source.split('\n').find(line=>line.startsWith('const storeRelease='));
  assert.equal(releaseDeclaration,"const storeRelease=document.documentElement.dataset.releaseChannel==='store';");
  f.root.ownerDocument.documentElement={dataset:{releaseChannel:'store'}};
  const renderStart=source.indexOf('function renderUI('),renderEnd=source.indexOf('\nfunction uiKey()',renderStart);
  const actionStart=source.indexOf('function action(name,value)'),actionEnd=source.indexOf('\noverlay.addEventListener(',actionStart);
  assert.ok(renderStart>=0&&renderEnd>renderStart&&actionStart>=0&&actionEnd>actionStart);
  const fields=new Map(),state={...f,game,overlay:f.root,screen,bossSelection:keys[0],bossPortraitView:selectCodexBossView(keys[0]),selectCodexBossView,mountCodexRotation(){},profile:{campaign:{}},hud:{hidden:false},coarse:false,hintToast:false,lastHintShown:null,toastTimer:0,lastUI:screen,directionLayoutDirty:false,titleArtReady:false,
    renderSchedule:{invalidate(){}},launchGate:{cancel(){}},audio:{unlock(){}},resets:0,checkpoints:0,restores:0,
    getBoss,bossCodexHTML,captureCodexScroll,
    restoreCodexScroll(root,snapshot,options){assert.equal(root.painted,true,'restore must follow portrait sizing');if(snapshot)state.restores++;return restoreCodexScroll(root,snapshot,options);},
    resetInput(){state.resets++;},checkpoint(){state.checkpoints++;},applyMoodboardUI(){},paintBossPortraits(){f.root.painted=true;},updateLaunchUI(){},updateHUD(){},uiKey:()=>state.screen||game.state,
    document:f.root.ownerDocument,$(id){if(!fields.has(id))fields.set(id,{hidden:false,textContent:'',classList:{toggle(){}}});return fields.get(id);},
  };
  const context=vm.createContext(state);
  vm.runInContext(`${releaseDeclaration}\n${source.slice(renderStart,renderEnd)}\n${source.slice(actionStart,actionEnd)}`,context);
  assert.equal(vm.runInContext('storeRelease',context),true);
  return{...f,game,state,select:key=>vm.runInContext(`action('boss-detail',${JSON.stringify(key)})`,context)};
}

test('the real app boss-selection action preserves the current mobile roster and page scroll after repeated DOM replacements, without Game/RNG/save drift',()=>{
  const f=appHarness();f.setPositions();const before=f.positions(),gameBefore=capture(f.game);f.root.focusFault=true;
  f.select(keys[1]);assert.deepEqual(f.positions(),before);assert.equal(f.state.bossSelection,keys[1]);assert.equal(f.state.screen,'codex');
  assert.equal(f.focuses.at(-1).key,keys[1]);assert.equal(f.state.restores,1);assert.equal(f.state.checkpoints,1);assert.equal(f.state.resets,2);
  // A second selection uses the user's newest scroll position, not a retained
  // snapshot from the previous boss or an asynchronous restoration callback.
  f.root.roster.scrollLeft=2033.25;f.root.panel.scrollTop=411.125;const latest=f.positions();
  f.select(keys[2]);assert.deepEqual(f.positions(),latest);assert.equal(f.focuses.at(-1).key,keys[2]);
  assert.equal(f.state.restores,2);assert.equal(f.state.checkpoints,2);assert.equal(capture(f.game),gameBefore);
});

test('the real campaign-to-codex boss entry keeps first-entry focus and fresh scroll instead of restoring the previous modal',()=>{
  const f=appHarness({screen:'campaign'});f.setPositions();const gameBefore=capture(f.game);
  f.select(keys[1]);assert.equal(f.state.screen,'codex');assert.equal(f.state.bossSelection,keys[1]);assert.equal(f.state.restores,0);
  assert.equal(f.root.panel.scrollTop,0);assert.equal(f.root.roster.scrollLeft,0);assert.equal(f.root.scrollTop,0);assert.equal(f.page.scrollTop,0);
  assert.equal(f.focuses.at(-1).key,'close');assert.equal(f.state.checkpoints,1);assert.equal(capture(f.game),gameBefore);
});
