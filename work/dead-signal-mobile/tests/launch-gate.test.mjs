import test from 'node:test';
import assert from 'node:assert/strict';
import {LaunchGate,launchWorld,productionLaunchPlan,preloadLaunchPlan} from '../dist/launch-gate.js';
import {Game} from '../dist/engine.js';
import {getMission,MISSIONS} from '../dist/campaign.js';
import {ProductionArt} from '../dist/production-art.js';
import {Renderer} from '../dist/renderer.js';

const delayed=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const catalog=()=>({assets:{idle:{bodyAlpha:'idle/body-alpha.png'},walk:{bodyAlpha:'walk/body-alpha.png'},run:{bodyAlpha:'run/body-alpha.png'},mid:{},final:{},walker:{},runner:{},gas:{},elite:{},tower:{},brick:{},other:{}},characters:{'survivor-shotgun':{idle:'idle',walk:'walk',run:'run'}},bosses:{'boss-01-mid':'mid','boss-01-final':'final','boss-07-final':'tower'},enemies:{walker:'walker',runner:'runner',gas:'gas',elite:'elite',shield:'other'},environment:{brick:'brick',unused:'other'},environmentRules:[{theme:'demolition',kind:'building',variant:'brick',entry:'brick'},{theme:'lighthouse',kind:'building',variant:'*',entry:'unused'}]});

test('delayed readiness commits one new Game/run ID only once; loading cannot mutate the existing checkpoint/RNG/events',async()=>{
  const active=new Game({seed:19011,missionId:'mission-01',equipment:{}});active.pause();
  const before=active.snapshot(),events=structuredClone(active.events),rng=active.random.getState(),visual=active.visualRandom.getState();
  const readiness=delayed(),states=[],gate=new LaunchGate({onChange:state=>states.push(state)});
  let loads=0,constructors=0,runIds=0,current=active;
  const request={load:()=>{loads++;return readiness.promise;},commit:()=>{constructors++;current=new Game({seed:19012,missionId:'mission-01'});runIds++;}};
  const pending=gate.run(request);
  assert.equal(gate.busy,true);
  assert.equal((await gate.run(request)).status,'busy');
  assert.equal(loads,1);assert.equal(constructors,0);assert.equal(runIds,0);
  assert.deepEqual(active.snapshot(),before);assert.deepEqual(active.events,events);
  assert.equal(active.random.getState(),rng);assert.equal(active.visualRandom.getState(),visual);
  readiness.resolve(true);
  assert.equal((await pending).status,'committed');
  assert.equal(constructors,1);assert.equal(runIds,1);assert.notEqual(current,active);
  assert.deepEqual(states.map(state=>[state.busy,state.status]),[[true,'loading'],[false,'committed']]);
  assert.equal(gate.busy,false);
});

test('selection/navigation cancellation retains cached loads and cannot commit or unlock a newer request',async()=>{
  const old=delayed(),newer=delayed(),gate=new LaunchGate();let commits=0;
  const first=gate.run({load:()=>old.promise,commit:()=>commits++});
  gate.cancel();assert.equal(gate.busy,false);
  const second=gate.run({load:()=>newer.promise,commit:()=>commits++});
  old.resolve(true);assert.equal((await first).status,'cancelled');
  assert.equal(gate.busy,true);assert.equal(commits,0);
  newer.resolve(true);assert.equal((await second).status,'committed');assert.equal(commits,1);
  const third=delayed();let selected='shotgun';
  const changed=gate.run({load:()=>third.promise,isCurrent:()=>selected==='shotgun',commit:()=>commits++});
  selected='nailgun';third.resolve(true);assert.equal((await changed).status,'cancelled');assert.equal(commits,1);
});

test('failed/rejected assets never replace a save; retry can restore a legacy neutral-equipment run after readiness',async()=>{
  const saved=new Game({seed:19013,weapon:'nailgun',mode:'standard',route:'police'});saved.player.hp=61;saved.pause();
  const envelope={id:'old-run-id',game:saved.snapshot()},before=structuredClone(envelope),gate=new LaunchGate();
  let restores=0,active=null;
  const commit=()=>{restores++;active=Game.restore(envelope.game);};
  assert.equal((await gate.run({load:async()=>false,commit})).status,'failed');
  assert.equal((await gate.run({load:async()=>{throw new Error('image failed');},commit})).status,'failed');
  assert.equal(restores,0);assert.equal(active,null);assert.deepEqual(envelope,before);
  const delay=delayed(),retry=gate.run({load:()=>delay.promise,commit});
  assert.equal(restores,0);delay.resolve(true);assert.equal((await retry).status,'committed');
  assert.equal(restores,1);assert.equal(envelope.id,'old-run-id');assert.equal(active.player.hp,61);
  assert.equal(active.player.weapon,'nailgun');assert.equal(active.state,'paused');
  assert.equal(active.equipmentStats.damage,1);assert.equal(active.remainingRevives,0);
  assert.deepEqual(envelope,before);
});

test('operation plan includes chosen player, only two mission bosses, actual pool/alarm assets and first matching world rules',()=>{
  const manifest=catalog(),mission=getMission('mission-01'),world=launchWorld({missionId:mission.id});
  const before=structuredClone(manifest),worldBefore=structuredClone(world);
  const plan=productionLaunchPlan({manifest,weapon:'shotgun',mission,world});
  assert.deepEqual(new Set(plan.assetIds),new Set(['idle','walk','run','mid','final','walker','runner','gas','elite','brick']));
  assert.deepEqual(plan.playerIds,['idle','walk','run']);assert.deepEqual(plan.maskIds,['idle','walk','run']);
  assert.ok(!plan.assetIds.includes('tower'));assert.ok(!plan.assetIds.includes('other'));
  assert.deepEqual(manifest,before);assert.deepEqual(world,worldBefore);
  const noPlayer=productionLaunchPlan({manifest,weapon:'nailgun',mission,world});
  assert.equal(noPlayer.character,null);assert.ok(!noPlayer.assetIds.includes('idle'));
  assert.throws(()=>productionLaunchPlan({manifest,weapon:'nailgun',mission,world,strictCoverage:true}),/coverage/);
  const broken=catalog();broken.bosses[mission.midBoss]='not-registered';
  assert.throws(()=>productionLaunchPlan({manifest:broken,weapon:'shotgun',mission,world}),/registered/);
});

test('environment rule plan matches actual world vocabularies for all twelve maps and legacy routes without consuming Game state',()=>{
  const keys=world=>[...new Set([...world.obstacles,...world.decor].map(object=>`${world.theme}:${object.kind}:${object.variant||''}`))].sort();
  for(const mission of MISSIONS){
    const actual=new Game({seed:19014+mission.index,missionId:mission.id});const before=actual.snapshot();
    assert.deepEqual(keys(launchWorld({missionId:mission.id})),keys(actual.world));
    assert.deepEqual(actual.snapshot(),before);
  }
  for(const route of ['hospital','police'])for(let stage=0;stage<3;stage++){
    const actual=new Game({seed:19015,route});actual.stage=stage;actual.world=actual.makeWorld();
    assert.deepEqual(keys(launchWorld({route,stage})),keys(actual.world));
  }
});

test('preloader fetches only deduplicated planned IDs, retries failures and blocks a declared mask failure',async()=>{
  const calls=[],manifest=catalog(),mission=getMission('mission-01'),plan=productionLaunchPlan({manifest,weapon:'shotgun',mission,world:launchWorld({missionId:mission.id})});
  let failed='mid',maskFailed=false;
  const renderer={productionArt:{load:async(id,options)=>{calls.push(['asset',id,options.retry]);return id!==failed;},loadBodyAlpha:async(id,options)=>{calls.push(['mask',id,options.retry]);return !maskFailed;}},preloadProductionPlayer:async weapon=>{calls.push(['character',weapon]);return true;}};
  assert.equal(await preloadLaunchPlan(renderer,plan),false);
  assert.equal(calls.filter(([type])=>type==='asset').length,plan.assetIds.length);
  assert.ok(calls.filter(([type])=>type==='asset').every(call=>call[2]===true));
  failed=null;maskFailed=true;calls.length=0;
  assert.equal(await preloadLaunchPlan(renderer,plan),false);assert.equal(calls.filter(([type])=>type==='mask').length,3);
  maskFailed=false;calls.length=0;assert.equal(await preloadLaunchPlan(renderer,plan),true);
  assert.ok(!calls.some(call=>call[1]==='other'||call[1]==='tower'));
  const empty=productionLaunchPlan({manifest:{assets:{},characters:{},bosses:{},enemies:{},environment:{}},weapon:'shotgun',world:launchWorld()});
  calls.length=0;assert.equal(await preloadLaunchPlan(renderer,empty),true);assert.deepEqual(calls,[]);
});

test('registered enemies, bosses and speaker remain required atlases but only selected player poses require pixel masks',async()=>{
  const manifest=catalog();manifest.assets.speaker={};manifest.environment['lure-speaker']='speaker';
  for(const [id,asset] of Object.entries(manifest.assets))asset.bodyAlpha=`${id}/body-alpha.png`;
  const game=new Game({seed:19031,missionId:'mission-01'});game.pause();
  const before=game.snapshot(),events=structuredClone(game.events),rng=game.random.getState(),visual=game.visualRandom.getState();
  const plan=productionLaunchPlan({manifest,weapon:'shotgun',mission:game.mission,world:game.world});
  assert.deepEqual(plan.maskIds,['idle','walk','run']);
  for(const id of ['mid','final','walker','runner','gas','elite','brick','speaker'])assert.ok(plan.assetIds.includes(id));
  const masks=[],assets=[];
  const renderer={productionArt:{load:async id=>{assets.push(id);return true;},loadBodyAlpha:async id=>{masks.push(id);return plan.playerIds.includes(id);}},preloadProductionPlayer:async()=>true};
  assert.equal(await preloadLaunchPlan(renderer,plan),true,'broken unused nonplayer masks do not block a run');
  assert.deepEqual(masks,['idle','walk','run']);assert.deepEqual(new Set(assets),new Set(plan.assetIds));
  assert.deepEqual(game.snapshot(),before);assert.deepEqual(game.events,events);assert.equal(game.random.getState(),rng);assert.equal(game.visualRandom.getState(),visual);
});

function nativeMaskFixture(){
  const manifest=catalog(),requests=[],images=[],failMasks=new Set();
  manifest.assets.speaker={};manifest.environment['lure-speaker']='speaker';
  for(const [id,asset] of Object.entries(manifest.assets))Object.assign(asset,{metadata:`${id}/metadata.json`,atlas:`${id}/atlas.png`,bodyAlpha:`${id}/body-alpha.png`});
  // Serialization fixture only; no replacement artwork or image files created.
  const frame={index:0,direction:0,sample:0,angle:0,rect:{x:0,y:0,width:128,height:128},footPivot:{x:64,y:112},alphaBounds:{x:40,y:20,width:48,height:92},coreBounds:{x:44,y:25,width:40,height:65},outlineBounds:{x:38,y:18,width:52,height:96},clipped:false};
  const metadata={format:'meshy-iso-sprite-atlas',version:1,projection:{subjectHeight:44,pixelsPerWorld:2,footPivot:frame.footPivot,azimuthDegrees:45,elevationDegrees:35.26438968275467,cameraScale:Math.sqrt(3/2)},atlas:{width:128,height:128,columns:1,rows:1,frameSize:128,directions:1,samples:1,order:'direction-major, sample-minor',transparent:true},frames:[frame],animation:null};
  const fetchImpl=async url=>{requests.push(url);return{ok:true,text:async()=>JSON.stringify(metadata)};};
  const ImageCtor=class{set src(url){images.push(url);const id=url.split('/').at(-2),failed=url.endsWith('body-alpha.png')&&failMasks.has(id);this.naturalWidth=128;this.naturalHeight=128;queueMicrotask(()=>failed?this.onerror?.():this.onload?.());}};
  const art=new ProductionArt({manifest,baseURL:'https://game.example/assets/production/',fetchImpl,ImageCtor});
  const renderer=Object.assign(Object.create(Renderer.prototype),{productionArt:art,canvas:{dataset:{}}});
  return{art,renderer,manifest,requests,images,failMasks};
}

test('actual loader leaves unused failed masks alone while a failed survivor mask blocks restore and remains retryable',async()=>{
  const f=nativeMaskFixture(),game=new Game({seed:19032,missionId:'mission-01'});game.pause();
  const before=game.snapshot(),events=structuredClone(game.events),rng=game.random.getState(),visual=game.visualRandom.getState();
  const plan=productionLaunchPlan({manifest:f.manifest,weapon:game.player.weapon,mission:game.mission,world:game.world});
  for(const id of plan.assetIds.filter(id=>!plan.playerIds.includes(id)))f.failMasks.add(id);
  assert.equal(await preloadLaunchPlan(f.renderer,plan),true);
  assert.deepEqual(f.images.filter(url=>url.endsWith('body-alpha.png')).map(url=>url.split('/').at(-2)).sort(),['idle','run','walk']);
  assert.equal(await f.art.loadBodyAlpha('mid'),false,'the declared nonplayer file really is broken');
  assert.equal(f.art.get('mid').bodyAlphaStatus,'failed');assert.equal(f.art.get('mid').status,'ready');
  const count=f.images.length;assert.equal(await preloadLaunchPlan(f.renderer,plan),true);assert.equal(f.images.length,count,'ready player masks and failed nonplayer masks cause no new PNG decode');
  assert.deepEqual(game.snapshot(),before);assert.deepEqual(game.events,events);assert.equal(game.random.getState(),rng);assert.equal(game.visualRandom.getState(),visual);

  const blocked=nativeMaskFixture();blocked.failMasks.add('idle');const gate=new LaunchGate();let restores=0;
  const request={load:()=>preloadLaunchPlan(blocked.renderer,plan),commit:()=>{restores++;return Game.restore(before);}};
  assert.equal((await gate.run(request)).status,'failed');assert.equal(restores,0);
  assert.equal(blocked.art.get('idle').bodyAlphaStatus,'failed');
  blocked.failMasks.delete('idle');const result=await gate.run(request);
  assert.equal(result.status,'committed');assert.equal(restores,1);assert.equal(result.value.state,'paused');
  assert.equal(blocked.art.get('idle').bodyAlphaStatus,'ready');assert.deepEqual(game.snapshot(),before);
});
