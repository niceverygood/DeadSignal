import test from 'node:test';
import assert from 'node:assert/strict';
import {LaunchGate,releaseCommittedLaunch} from '../dist/launch-gate.js';
import {ProductionArt} from '../dist/production-art.js';
import {Game} from '../dist/engine.js';

test('failed, cancelled and obsolete launches preserve the paused game and its images; only committed replacement trims',async()=>{
 for(const outcome of ['failed','cancelled','obsolete','throw','committed']){
  const art=new ProductionArt({manifest:{assets:{old:{},next:{}},characters:{},bosses:{},enemies:{},environment:{}}});
  const oldImage={},nextImage={};art.records.set('old',{status:'ready',image:oldImage});art.records.set('next',{status:'ready',image:nextImage});
  let game=new Game({seed:413});game.pause();const oldGame=game,before=JSON.stringify(game.snapshot()),gate=new LaunchGate();let finish;
  const pending=gate.run({load:()=>new Promise(resolve=>{finish=resolve;}),isCurrent:()=>outcome!=='obsolete',commit:()=>{if(outcome==='throw')throw Error('commitfailed');game=new Game({seed:414});}});
  if(outcome==='cancelled')gate.cancel();finish(outcome!=='failed');
  const result=await pending;releaseCommittedLaunch({productionArt:art},{assetIds:['next']},result);
  if(outcome==='committed'){
   assert.notEqual(game,oldGame);assert.equal(art.records.has('old'),false);assert.equal(art.get('next').image,nextImage);
  }else{
   assert.equal(game,oldGame);assert.equal(JSON.stringify(game.snapshot()),before);assert.equal(art.get('old').image,oldImage);
  }
 }
});

test('a legacy run prepares every later-district native species before committing its first district',async()=>{
 const {productionManifest}=await import('../dist/production-manifest.js');
 const {productionLaunchPlan,launchWorld}=await import('../dist/launch-gate.js');
 const plan=productionLaunchPlan({manifest:productionManifest,weapon:'shotgun',world:launchWorld({stage:0})});
 for(const type of ['walker','runner','shield','screamer','gas','elite','collector'])assert.ok(plan.assetIds.includes(productionManifest.enemies[type]),type);
 const campaign=productionLaunchPlan({manifest:productionManifest,weapon:'shotgun',mission:(await import('../dist/campaign.js')).getMission('mission-01'),world:launchWorld({missionId:'mission-01'})});
 assert.equal(campaign.assetIds.includes(productionManifest.enemies.collector),false,'campaign retains its narrower actual pool');
});
