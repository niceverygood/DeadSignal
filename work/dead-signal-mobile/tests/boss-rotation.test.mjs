import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {CODEX_BOSS_VIEWS,selectCodexBossView,rotateCodexBossView,codexBossViewAngle,mountCodexRotation,updateCodexRotation,captureCodexScroll,restoreCodexScroll} from '../dist/codex-scroll.js';
import {Renderer,renderBossPortrait} from '../dist/renderer.js';
import {ProductionArt,selectAtlasFrame} from '../dist/production-art.js';
import {productionManifest} from '../dist/production-manifest.js';
import {Game} from '../dist/engine.js';
import {getBoss} from '../dist/campaign.js';
import {bossCodexHTML} from '../dist/campaign-ui.js';

const keys=['boss-01-mid','boss-10-final'];
const snapshotAssets=new URL('../../../outputs/dead-signal/playable/v0.20.0/dist/assets/production/',import.meta.url);
const actualMetadata=id=>JSON.parse(readFileSync(new URL(`${id}/metadata.json`,snapshotAssets),'utf8'));
const detail=key=>productionManifest.bossDetailPortraits[key],regular=key=>productionManifest.bossPortraits[key];
const gameCapture=game=>JSON.stringify({snapshot:game.snapshot(),events:game.events,particles:game.particles,texts:game.texts,links:game.links,random:game.random.getState(),visual:game.visualRandom.getState(),id:game.id});
const microtasks=async condition=>{for(let i=0;i<80&&!condition();i++)await Promise.resolve();assert.ok(condition(),'controlled loader did not reach expected state');};
const settled=art=>Promise.all([...art.records.values()].map(record=>record.promise));

function canvasFixture(key,{large=false}={}){
  const images=[],fills=[],stack=[];let transform=[1,0,0,1,0,0];
  const raw={globalAlpha:1,save(){stack.push([...transform]);},restore(){transform=stack.pop()||transform;},setTransform(...args){transform=args;},
    translate(x,y){transform[4]+=x*transform[0];transform[5]+=y*transform[3];},scale(x,y){transform[0]*=x;transform[3]*=y;},
    drawImage(image,...args){images.push({id:image.id,args,transform:[...transform]});},fill(){fills.push(1);},fillRect(){fills.push(1);},measureText:()=>({width:0}),createRadialGradient:()=>({addColorStop(){}})};
  const context=new Proxy(raw,{get:(object,key)=>key in object?object[key]:()=>{}});
  const canvas={dataset:{bossPortrait:key},style:{},classList:{contains:value=>large&&value==='large'},width:large?360:180,height:large?400:190,
    getContext:()=>context,getBoundingClientRect:()=>({width:large?360:180,height:large?400:190}),parentElement:{getBoundingClientRect:()=>({width:1280,height:720})}};
  return {canvas,images,fills};
}
function fixture({holdHD=false,fail=[],yaw=null,missingHD=false}={}){
  const requests=[],images=[],failed=new Set(fail),small=canvasFixture(keys[0]),large=canvasFixture(keys[0],{large:true});
  const manifest=structuredClone(productionManifest);if(missingHD)delete manifest.bossDetailPortraits;
  const metadata=id=>{const value=actualMetadata(id);if(yaw!==null)value.projection.frontYawRadians=yaw;return value;};
  const fetchImpl=async url=>{const id=new URL(url).pathname.split('/').at(-2);requests.push(id);return{ok:true,text:async()=>JSON.stringify(metadata(id))};};
  const ImageCtor=class{set src(url){this.id=new URL(url).pathname.split('/').at(-2);const m=metadata(this.id);this.naturalWidth=m.atlas.width;this.naturalHeight=m.atlas.height;images.push(this);this.finish=()=>failed.has(this.id)?this.onerror?.():this.onload?.();if(!(holdHD&&this.id.endsWith('-detail-hd')))queueMicrotask(this.finish);}};
  const art=new ProductionArt({manifest,baseURL:'https://local.invalid/assets/production/',fetchImpl,ImageCtor});
  globalThis.window={devicePixelRatio:2};
  const renderer=new Renderer(small.canvas,{productionArt:art});
  return {art,renderer,requests,images,small,large,complete(id){const image=images.findLast(image=>image.id===id);assert.ok(image);image.finish();}};
}

test('all 24 immutable native HD tables resolve named front/back to actual frame1/frame5; yaw is read without mutating metadata',()=>{
  assert.equal(CODEX_BOSS_VIEWS.length,8);assert.equal(new Set(CODEX_BOSS_VIEWS).size,8);
  for(const id of Object.values(productionManifest.bossDetailPortraits)){
    const m=actualMetadata(id),before=JSON.stringify(m);
    assert.deepEqual([m.atlas.directions,m.atlas.samples,m.atlas.frameSize],[8,1,512]);
    assert.equal(m.projection.frontYawRadians,0);
    const directions=Array.from({length:8},(_,step)=>selectAtlasFrame(m,{angle:codexBossViewAngle(m,step),stationary:true}).direction);
    assert.deepEqual(directions,[1,2,3,4,5,6,7,0]);assert.equal(JSON.stringify(m),before);
    if(id===detail('boss-10-final')){
      assert.deepEqual(m.frames[1].rect,{x:512,y:0,width:512,height:512});
      assert.deepEqual(m.frames[5].rect,{x:512,y:512,width:512,height:512});
    }
  }
  for(const yaw of [Math.PI/2,-Math.PI/2,Math.PI/4]){
    const m=actualMetadata(detail(keys[0]));m.projection.frontYawRadians=yaw;
    for(const step of [0,4]){
      const angle=codexBossViewAngle(m,step),theta=Math.PI/2-angle+yaw;
      const nativeX=Math.cos(theta)-Math.sin(theta),nativeZ=Math.sin(theta)+Math.cos(theta);
      assert.ok(Math.abs(nativeX)<1e-12);assert.equal(Math.sign(nativeZ),step===0?1:-1);
    }
  }
  assert.equal(codexBossViewAngle({projection:{}},0),Math.PI/4);
  for(const step of [-1,8,.5,NaN,'0',null])assert.equal(codexBossViewAngle({projection:{frontYawRadians:0}},step),null);
  for(const yaw of [NaN,Infinity,'0'])assert.equal(codexBossViewAngle({projection:{frontYawRadians:yaw}},0),null);
  assert.equal(codexBossViewAngle(null,0),null);
});

test('view state wraps in both directions, resets only a new boss, and remains separate immutable UI data',()=>{
  const first=selectCodexBossView(keys[0]),before=JSON.stringify(first);
  assert.ok(Object.isFrozen(first));assert.deepEqual(first,{bossKey:keys[0],step:0});
  let view=first;for(let i=0;i<8;i++)view=rotateCodexBossView(view,1);
  assert.deepEqual(view,first);assert.equal(JSON.stringify(first),before);
  view=rotateCodexBossView(first,-1);assert.equal(view.step,7);
  assert.equal(selectCodexBossView(keys[0],view),view);
  assert.deepEqual(selectCodexBossView(keys[1],view),{bossKey:keys[1],step:0});
  for(const delta of [0,2,.5,'1',NaN])assert.equal(rotateCodexBossView(first,delta),null);
  assert.equal(selectCodexBossView('invalid'),null);
});

test('ready HD rotation reuses the identical native image for eight unique directions while small thumbnails keep the original angle',async()=>{
  const f=fixture(),key=keys[0];
  f.renderer.nativePortrait(f.large.canvas,key,{rotationStep:0});await settled(f.art);
  const requests=[...f.requests],images=f.images.length,record=f.art.get(detail(key));
  for(let step=0;step<8;step++){
    assert.equal(renderBossPortrait(f.large.canvas,key,{renderer:f.renderer,rotationStep:step}),true);
    const direction=[1,2,3,4,5,6,7,0][step],frame=record.metadata.frames[direction];
    assert.equal(f.large.canvas.dataset.productionPortraitDirection,String(direction));
    assert.equal(f.large.canvas.dataset.productionPortraitRotation,'ready');
    assert.deepEqual(f.large.images.at(-1).args.slice(0,4),[frame.rect.x,frame.rect.y,512,512]);
    assert.equal(f.large.images.at(-1).id,detail(key));
    assert.equal(f.art.get(detail(key)).image,record.image);
    f.renderer.nativePortrait(f.small.canvas,key,{rotationStep:step});
    assert.equal(f.small.canvas.dataset.productionPortraitDirection,'0');
    assert.equal(f.small.canvas.dataset.productionPortraitAsset,regular(key));
  }
  assert.deepEqual(f.requests,requests);assert.equal(f.images.length,images);
  assert.ok(!f.requests.some(id=>id.endsWith('-walk')));assert.equal(f.art.get(detail(key)).bodyAlpha,null);
});

test('renderer reads the ready HD yaw and existing callers still retain their .35 view without an explicit UI step',async()=>{
  const f=fixture({yaw:Math.PI/2}),key=keys[0];f.renderer.nativePortrait(f.large.canvas,key,{rotationStep:0});await settled(f.art);
  f.renderer.nativePortrait(f.large.canvas,key,{rotationStep:0});assert.equal(f.large.canvas.dataset.productionPortraitDirection,'3');
  f.renderer.nativePortrait(f.large.canvas,key,{rotationStep:4});assert.equal(f.large.canvas.dataset.productionPortraitDirection,'7');
  f.renderer.nativePortrait(f.large.canvas,key);assert.equal(f.large.canvas.dataset.productionPortraitDirection,'0');
  f.renderer.nativePortrait(f.large.canvas,key,{rotationStep:8});assert.equal(f.large.canvas.dataset.productionPortraitDirection,'0');
});

test('a failed canvas context never leaves rotation enabled for an image that could not be drawn',async()=>{
  const f=fixture(),key=keys[0];f.renderer.nativePortrait(f.large.canvas,key,{rotationStep:0});await settled(f.art);
  f.large.canvas.getContext=()=>null;
  assert.equal(f.renderer.nativePortrait(f.large.canvas,key,{rotationStep:0}),false);
  assert.equal(f.large.canvas.dataset.productionPortraitRotation,'unavailable');
  assert.equal(f.large.canvas.dataset.productionPortraitDirection,'');
});

test('HD loading/failure leaves the existing image and angle fallback intact, without retries, walking sheets or masks',async()=>{
  const key=keys[1],f=fixture({holdHD:true});
  f.renderer.nativePortrait(f.small.canvas,key);await settled(f.art);
  f.renderer.nativePortrait(f.large.canvas,key,{rotationStep:4});await microtasks(()=>f.images.some(image=>image.id===detail(key)));
  assert.equal(f.large.canvas.dataset.productionPortraitAsset,regular(key));assert.equal(f.large.canvas.dataset.productionPortraitDirection,'1');
  assert.equal(f.large.canvas.dataset.productionPortraitRotation,'loading');
  const count=f.requests.length;for(let i=0;i<9;i++)f.renderer.nativePortrait(f.large.canvas,key,{rotationStep:i%8});
  assert.equal(f.requests.length,count);f.complete(detail(key));await settled(f.art);
  f.renderer.nativePortrait(f.large.canvas,key,{rotationStep:4});assert.equal(f.large.canvas.dataset.productionPortraitDirection,'5');
  const bad=fixture({fail:[detail(key)]});bad.renderer.nativePortrait(bad.large.canvas,key,{rotationStep:0});await settled(bad.art);
  const failedCount=bad.requests.length;for(let i=0;i<8;i++)bad.renderer.nativePortrait(bad.large.canvas,key,{rotationStep:i});
  assert.equal(bad.large.canvas.dataset.productionPortraitRotation,'failed');assert.equal(bad.large.canvas.dataset.productionPortraitAsset,regular(key));
  assert.equal(bad.large.canvas.dataset.productionPortraitDirection,'1');assert.equal(bad.requests.length,failedCount);
  const absent=fixture({missingHD:true});absent.renderer.nativePortrait(absent.large.canvas,key,{rotationStep:0});await settled(absent.art);
  absent.renderer.nativePortrait(absent.large.canvas,key,{rotationStep:4});assert.equal(absent.large.canvas.dataset.productionPortraitRotation,'unavailable');
  assert.deepEqual(absent.requests,[regular(key)]);
});

const scrollNode=(props={})=>({scrollLeft:0,scrollTop:0,scrollWidth:390,clientWidth:390,scrollHeight:2400,clientHeight:780,...props});
function domView(){
  const page=scrollNode(),doc={scrollingElement:page,activeElement:null},root=scrollNode({ownerDocument:doc,replacements:0,controls:null}),focuses=[];
  function focused(node,name){node.focus=options=>{doc.activeElement=node;focuses.push({name,options});};return node;}
  function install(key=keys[0]){
    root.selected=key;root.controls=null;
    root.panel=scrollNode();root.roster=scrollNode({clientHeight:155,scrollHeight:155,scrollWidth:3000});
    root.cards=keys.map(key=>focused({dataset:{action:'boss-detail',value:key}},key));
    root.roster.querySelectorAll=selector=>selector==='[data-action="boss-detail"]'?root.cards:[];
    root.panel.querySelector=selector=>selector==='.boss-roster'?root.roster:null;
    root.small=keys.map(key=>canvasFixture(key));root.large=canvasFixture(key,{large:true});
    root.close=focused({},'close');
    root.art={insertAdjacentHTML(where,html){assert.equal(where,'afterend');root.controlsHTML=html;
      const current={textContent:''},status={textContent:''};
      const buttons=[-1,1].map(value=>focused({dataset:{action:'boss-rotate',value:String(value)},disabled:true},`rotate:${value}`));
      const labels=CODEX_BOSS_VIEWS.map((text,step)=>({textContent:text,dataset:{bossRotationStep:String(step)},attributes:{},classList:{toggle(name,value){this[name]=value;}},setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];}}));
      root.controls={buttons,labels,current,status,querySelectorAll:selector=>selector==='[data-action="boss-rotate"]'?buttons:selector==='[data-boss-rotation-step]'?labels:[],querySelector:selector=>selector==='[data-boss-rotation-current]'?current:selector==='[data-boss-rotation-status]'?status:null};
    }};
  }
  root.install=install;install();
  root.querySelector=selector=>({'.codex-panel':root.panel,'.codex-panel .boss-dossier-art':root.art,'[data-boss-rotation-controls]':root.controls,'.codex-panel .boss-portrait.large':root.large.canvas,'button:not(:disabled)':root.close}[selector]||null);
  root.querySelectorAll=selector=>selector==='[data-boss-portrait]'?[...root.small.map(f=>f.canvas),root.large.canvas]:[];
  Object.defineProperty(root,'innerHTML',{get(){return root.html||'';},set(html){root.html=html;root.replacements++;const key=html.match(/class="boss-portrait large" data-boss-portrait="([^"]+)"/)?.[1]||keys[0];install(key);root.scrollTop=page.scrollTop=0;}});
  const positions=()=>[root.scrollLeft,root.scrollTop,root.panel.scrollLeft,root.panel.scrollTop,root.roster.scrollLeft,root.roster.scrollTop,page.scrollLeft,page.scrollTop];
  return{root,page,doc,focuses,positions,setPositions(){root.scrollTop=88.25;root.panel.scrollTop=612.5;root.roster.scrollLeft=1184.75;page.scrollTop=176.125;}};
}

function appHarness(options={}){
  const f=fixture(options),d=domView(),game=new Game({seed:22001,missionId:'mission-01'});game.shoot();game.pause();
  const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),fields=new Map(),handlers={},counts={reset:0,checkpoint:0,audio:0,cancel:0,invalidations:0};
  // The harness extracts app functions, so execute their actual store-channel
  // declaration too. Keep the mobile gate enabled rather than bypassing it.
  const releaseDeclaration=source.split('\n').find(line=>line.startsWith('const storeRelease='));
  assert.equal(releaseDeclaration,"const storeRelease=document.documentElement.dataset.releaseChannel==='store';");
  d.doc.documentElement={dataset:{releaseChannel:'store'}};
  const state={...f,...d,screen:'codex',bossSelection:keys[0],bossPortraitView:selectCodexBossView(keys[0]),overlay:d.root,game,profile:{campaign:{}},hud:{hidden:false},coarse:false,hintToast:false,lastHintShown:null,toastTimer:0,lastUI:'codex',directionLayoutDirty:false,titleArtReady:false,
    getBoss,bossCodexHTML,renderBossPortrait,selectCodexBossView,rotateCodexBossView,mountCodexRotation,updateCodexRotation,captureCodexScroll,restoreCodexScroll,
    renderSchedule:{invalidate(){counts.invalidations++;}},launchGate:{cancel(){counts.cancel++;}},audio:{unlock(){counts.audio++;}},
    resetInput(){counts.reset++;},checkpoint(){counts.checkpoint++;},applyMoodboardUI(){},updateLaunchUI(){},updateHUD(){},uiKey:()=>state.screen||game.state,
    document:d.doc,$(id){if(!fields.has(id))fields.set(id,{hidden:false,textContent:'',classList:{toggle(){}}});return fields.get(id);},
  };
  d.root.addEventListener=(type,handler)=>handlers[type]=handler;
  const range=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
  const context=vm.createContext(state);
  vm.runInContext([releaseDeclaration,range('function paintBossPortraits()','\nconst esc='),range('function renderUI(','\nfunction uiKey()'),range('function action(name,value)','\noverlay.addEventListener('),source.split('\n').find(line=>line.startsWith("overlay.addEventListener('click'"))].join('\n'),context);
  assert.equal(vm.runInContext('storeRelease',context),true);
  f.renderer.onProductionChange=change=>{if(change.status==='ready'||change.status==='failed')vm.runInContext('paintBossPortraits()',context);};
  vm.runInContext('renderUI()',context);
  return{...f,...d,state,counts,context,paint:()=>vm.runInContext('paintBossPortraits()',context),
    click(button){handlers.click({target:{closest:selector=>selector==='button[data-action]'?button:null}});},
    select(key){vm.runInContext(`action('boss-detail',${JSON.stringify(key)})`,context);}};
}

test('two accessible controls and all eight visible names mount once; loading and failure keep buttons disabled',()=>{
  const d=domView(),view=selectCodexBossView(keys[0]);assert.equal(mountCodexRotation(d.root),true);const controls=d.root.controls;
  assert.equal(mountCodexRotation(d.root),false);assert.equal(d.root.controls,controls);
  assert.equal((d.root.controlsHTML.match(/data-action="boss-rotate"/g)||[]).length,2);
  for(const label of CODEX_BOSS_VIEWS)assert.ok(d.root.controlsHTML.includes(`>${label}</li>`));
  assert.ok(d.root.controlsHTML.includes('aria-live="polite"'));assert.ok(d.root.controlsHTML.includes('왼쪽으로 45도'));assert.ok(d.root.controlsHTML.includes('오른쪽으로 45도'));
  d.root.large.canvas.dataset.productionPortraitRotation='loading';assert.equal(updateCodexRotation(d.root,view),false);assert.ok(controls.buttons.every(b=>b.disabled));
  assert.equal(controls.current.textContent,'회전 준비 중');assert.ok(controls.labels.every(label=>!label.attributes['aria-current']));
  d.root.large.canvas.dataset.productionPortraitRotation='failed';assert.equal(updateCodexRotation(d.root,view),false);assert.ok(controls.buttons.every(b=>b.disabled));
  assert.equal(controls.current.textContent,'기본 보기');assert.ok(controls.labels.every(label=>!label.attributes['aria-current']));
  d.root.large.canvas.dataset.productionPortraitRotation='ready';assert.equal(updateCodexRotation(d.root,view),true);assert.ok(controls.buttons.every(b=>!b.disabled));
  assert.equal(controls.current.textContent,'정면 · 1 / 8');assert.equal(controls.labels[0].attributes['aria-current'],'true');
  d.root.large.canvas.dataset.productionPortraitRotation='loading';updateCodexRotation(d.root,{...view,step:4});
  assert.equal(controls.current.textContent,'회전 준비 중');assert.ok(controls.labels.every(label=>!label.attributes['aria-current']),'a retained rear request must not label the fixed front-quarter fallback as rear');
});

test('the real delegated rotation click retains canvas/control identity, focus and four scroll positions with zero Game/RNG/save/input/audio side effects',async()=>{
  const f=appHarness();await settled(f.art);f.paint();f.setPositions();
  const canvas=f.root.large.canvas,controls=f.root.controls,button=controls.buttons[1],replacements=f.root.replacements,positions=f.positions(),profileBefore=JSON.stringify(f.state.profile),gameBefore=gameCapture(f.state.game);
  button.focus({preventScroll:true});const active=f.doc.activeElement,focuses=f.focuses.length,before={...f.counts},requests=f.requests.length,images=f.images.length;
  for(const thumb of f.root.small)thumb.images.length=0;
  for(let i=0;i<19;i++)f.click(button);
  assert.equal(f.state.bossPortraitView.step,3);assert.equal(canvas.dataset.productionPortraitDirection,'4');assert.equal(controls.current.textContent,'뒤 오른쪽 · 4 / 8');
  assert.equal(f.root.large.canvas,canvas);assert.equal(f.root.controls,controls);assert.equal(f.root.replacements,replacements);
  assert.equal(f.doc.activeElement,active);assert.equal(f.focuses.length,focuses);assert.deepEqual(f.positions(),positions);
  for(const key of ['reset','checkpoint','audio','cancel'])assert.equal(f.counts[key],before[key],key);
  assert.equal(gameCapture(f.state.game),gameBefore);assert.equal(JSON.stringify(f.state.profile),profileBefore);
  assert.equal(f.requests.length,requests);assert.equal(f.images.length,images);assert.ok(f.root.small.every(thumb=>thumb.images.length===0));
  const step=f.state.bossPortraitView.step;f.paint();assert.equal(f.state.bossPortraitView.step,step);assert.equal(canvas.dataset.productionPortraitDirection,'4','normal loader/resize repaint preserves current view');
});

test('rotation is inert outside the codex, for disabled/loading controls and for malformed values; a new selected boss resets to front',async()=>{
  const f=appHarness({holdHD:true});await microtasks(()=>f.images.some(image=>image.id===detail(keys[0])));
  f.paint();assert.ok(f.root.controls.buttons.every(button=>button.disabled));
  const before={...f.counts},initial=f.state.bossPortraitView;
  f.click(f.root.controls.buttons[1]);assert.equal(f.state.bossPortraitView,initial);assert.deepEqual(f.counts,before);
  f.complete(detail(keys[0]));await settled(f.art);f.paint();f.click(f.root.controls.buttons[1]);assert.equal(f.state.bossPortraitView.step,1);
  f.state.screen='campaign';f.click(f.root.controls.buttons[1]);assert.equal(f.state.bossPortraitView.step,1);
  f.state.screen='codex';f.click({dataset:{action:'boss-rotate',value:'200'},disabled:false});assert.equal(f.state.bossPortraitView.step,1);
  f.select(keys[0]);assert.equal(f.state.bossPortraitView.step,1,'same boss selection keeps the UI view');
  const gameBefore=gameCapture(f.state.game),profileBefore=JSON.stringify(f.state.profile);f.select(keys[1]);
  assert.deepEqual({...f.state.bossPortraitView},{bossKey:keys[1],step:0});assert.equal(f.root.large.canvas.dataset.bossPortrait,keys[1]);
  await microtasks(()=>f.images.some(image=>image.id===detail(keys[1])));assert.ok(f.root.controls.buttons.every(button=>button.disabled));
  f.complete(detail(keys[1]));await settled(f.art);f.paint();
  assert.equal(f.root.controls.current.textContent,'정면 · 1 / 8');assert.equal(f.root.large.canvas.dataset.productionPortraitDirection,'1');
  assert.equal(gameCapture(f.state.game),gameBefore);assert.equal(JSON.stringify(f.state.profile),profileBefore);
});
