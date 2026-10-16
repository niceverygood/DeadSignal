import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game} from '../dist/engine.js';
import {ProductionArt,validateAtlasMetadata} from '../dist/production-art.js';
import {productionManifest} from '../dist/production-manifest.js';
import {Renderer} from '../dist/renderer.js';
const assetRoot=new URL('../dist/assets/production/',import.meta.url);
const metadata=validateAtlasMetadata(JSON.parse(fs.readFileSync(new URL('env-common-brick/metadata.json',assetRoot))));
const image=Object.freeze({fixture:'drawImage identity sentinel; actual PNG is not decoded by this Node geometry test'});
const matrix=[
  {name:'left empty atlas/volume margin',x:1365,y:460,blocked:false,fade:[]},
  {name:'left visible body occluder',x:1410,y:460,blocked:false,fade:[0]},
  {name:'two visible body occluders',x:1600,y:485,blocked:false,fade:[2,4]},
  {name:'far right rear',x:1775,y:460,blocked:false,fade:[]},
  {name:'right visible body occluder',x:1785,y:600,blocked:false,fade:[4]},
  {name:'right front clear',x:1775,y:765,blocked:false,fade:[]},
  {name:'left front clear',x:1410,y:765,blocked:false,fade:[]},
  // This is a read-only hypothetical point, not an actor placed inside a wall.
  {name:'blocked interior control',x:1600,y:600,blocked:true,fade:[2,3,5]},
];
function fixture(){
  const game=new Game({seed:19253,missionId:'mission-01'}),o=game.world.obstacles.find(o=>o.id===11&&o.x===1430&&o.y===535);
  assert.ok(o);assert.equal(o.label,'SITE OFFICE');
  const art=new ProductionArt({manifest:productionManifest,fetchImpl:()=>{throw Error('Node test must not load resources');}});
  const record={id:'env-common-brick',status:'ready',metadata,image,bodyAlpha:null};art.records.set(record.id,record);
  const r=Object.create(Renderer.prototype);r.productionArt=art;r.nativeBuildingBlocks=new WeakMap();r.nativeActorFrames=new WeakMap();r.requestProductionCatalog=()=>{};
  const native=r.nativeObstacleFrame(o,game),block=r.nativeBuildingBlock(o,native,'env-common-brick');
  assert.equal(block.sections.length,6);return{game,o,art,record,r,native,block};
}
function fingerprint(game){return JSON.stringify({snapshot:game.snapshot(),world:game.world,random:game.random.getState(),visual:game.visualRandom.getState(),events:game.events});}
function context(){const stack=[],draws=[];return{globalAlpha:.8,draws,save(){stack.push(this.globalAlpha);},restore(){assert.ok(stack.length);this.globalAlpha=stack.pop();},drawImage(...args){draws.push({alpha:this.globalAlpha,image:args[0],args:args.slice(1)});},get stackDepth(){return stack.length;}};}

test('actual SITE OFFICE six-section PNG/body and physics matrix contains both ends, two occluders and a blocked control',()=>{
  const {game,r,block}=fixture(),before=fingerprint(game),sections=JSON.stringify(block.sections);
  for(const item of matrix){const p={x:item.x,y:item.y,r:game.player.r};
    assert.equal(game.blocked(p.x,p.y,p.r),item.blocked,item.name);
    assert.deepEqual(block.sections.flatMap((s,i)=>r.nativeBuildingSectionOccludesPlayer(s,p)?[i]:[]),item.fade,item.name);
  }
  assert.equal(fingerprint(game),before);assert.equal(JSON.stringify(block.sections),sections);
});

test('actual drawObstacle scopes alpha to each native section and restores context/cache/record identities',()=>{
  const {game,o,r,block,art,record,native}=fixture(),before=fingerprint(game),metadataBefore=JSON.stringify(metadata);
  // Read-only render probes use the actual game world, real cached sections
  // and legal point inputs. They are not browser-play evidence or saved actors.
  for(const item of matrix.filter(x=>!x.blocked)){
    const c=context(),probe={world:game.world,player:{...game.player,x:item.x,y:item.y}};
    r.drawObstacle(c,o,probe);assert.equal(c.draws.length,6,item.name);
    for(let i=0;i<6;i++){assert.equal(c.draws[i].image,image);assert.equal(c.draws[i].alpha,item.fade.includes(i)?.8*.27:.8,`${item.name} section ${i}`);}
    assert.equal(c.globalAlpha,.8);assert.equal(c.stackDepth,0);assert.equal(r.nativeBuildingBlock(o,native,'env-common-brick'),block);
    assert.equal(art.records.get('env-common-brick'),record);assert.equal(art.records.size,1);
  }
  assert.equal(fingerprint(game),before);assert.equal(JSON.stringify(metadata),metadataBefore);
});

test('body bounds reject empty PNG padding and invalid inputs while front-facing clear positions stay opaque',()=>{
  const {r,block}=fixture(),s=block.sections[0],p={x:1365,y:460,r:14};
  assert.equal(r.occludesPlayer(s.placement.footprint.target,p,block.worldHeight),true,'old volume alone would fade this section');
  assert.equal(r.nativeBuildingSectionOccludesPlayer(s,p),false,'actual PNG body bounds do not cover the player');
  for(const bad of [null,{}, {...s,placement:null},{...s,placement:{...s.placement,bounds:{body:null}}},{...s,placement:{...s.placement,bounds:{body:{left:NaN,top:0,right:2,bottom:3}}}}])assert.equal(r.nativeBuildingSectionOccludesPlayer(bad,p),false);
  assert.equal(r.nativeBuildingSectionOccludesPlayer(s,null),false);
});

