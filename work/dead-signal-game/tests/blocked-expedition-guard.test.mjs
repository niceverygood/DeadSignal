import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,circleRect} from '../dist/engine.js';
import {EXPEDITIONS,expeditionHasTransport,expeditionTransport} from '../dist/expedition.js';
import {roofSupports} from '../dist/rooftop-world.js';

// Frozen pre-guard control flow. The retained circleRect and roof arithmetic
// are deliberately shared: this change only avoids a null expedition lookup.
function originalBlocked(x,y,r){
 if(this.world.water?.some(w=>circleRect(x,y,r,w)))return true;
 if(expeditionHasTransport(this.expedition?.id)&&circleRect(x,y,r,expeditionTransport(this)))return true;
 if(this.world.rooftop&&!roofSupports(this.world,x,y,r))return true;
 if(x<r+35||y<r+35||x>this.world.width-r-35||y>this.world.height-r-35)return true;
 return this.world.obstacles.some(o=>!o.destroyed&&circleRect(x,y,r,o));
}
function observe(game){return {snapshot:JSON.stringify(game.snapshot()),random:game.random.getState(),visualRandom:game.visualRandom.getState(),events:JSON.stringify(game.events),effects:JSON.stringify([game.particles,game.texts,game.links,game.shake,game.flash]),world:JSON.stringify(game.world)};}
function compare(game,queries,label){
 const before=observe(game);for(const [x,y,r]of queries)assert.equal(game.blocked(x,y,r),originalBlocked.call(game,x,y,r),`${label}: ${x},${y},${r}`);
 assert.deepEqual(observe(game),before,label+' collision queries do not write checkpoints, physics, RNG, events or effects');
}
function queries(game){
 const {width,height}=game.world,points=[[game.player.x,game.player.y,14],[35,35,0],[49,49,14],[49-1e-9,49,14],[49+1e-9,49,14],[width-49,height-49,14],[width-49+1e-9,height-49,14],[width/2,height/2,49]];
 for(const rect of [...game.world.obstacles.slice(0,6),...(game.world.water||[]),...(game.world.rooftop?.platforms||[])]){
  for(const radius of [0,12,14,49])points.push([rect.x+rect.w/2,rect.y+rect.h/2,radius],[rect.x-radius,rect.y+rect.h/2,radius],[rect.x-radius+1e-9,rect.y+rect.h/2,radius],[rect.x+rect.w+radius-1e-9,rect.y+rect.h/2,radius]);
 }
 let value=731;const next=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
 for(let i=0;i<90;i++)points.push([next()*(width+100)-50,next()*(height+100)-50,[0,12,14,19,49][i%5]]);
 for(const radius of [-1,-0,0,1e-12,NaN,Infinity,-Infinity])for(const [x,y]of [[0,0],[game.player.x,game.player.y],[NaN,500],[Infinity,500],[-Infinity,500]])points.push([x,y,radius]);
 return points;
}

test('null, undefined and missing expeditions keep ordinary and campaign collision decisions and checkpoint/RNG state unchanged',()=>{
 for(const options of [{seed:774},{seed:774,missionId:'mission-01',weapon:'nailgun'}])for(const form of ['null','undefined','missing']){
  const game=new Game(options);if(form==='null')game.expedition=null;else if(form==='undefined')game.expedition=undefined;else delete game.expedition;
  assert.ok(game.snapshot());compare(game,queries(game),`${options.missionId??'ordinary'} expedition ${form}`);
 }
});

test('all eleven actual expeditions preserve water, rooftop, world edges and moving transport collision at every mission step',()=>{
 assert.equal(EXPEDITIONS.length,11);let transports=0,water=0,rooftop=0;
 for(const definition of EXPEDITIONS){
  const game=new Game({seed:774,expeditionId:definition.id});const base=queries(game);water+=!!game.world.water;rooftop+=!!game.world.rooftop;
  for(let step=0;step<definition.steps.length;step++)for(const fraction of [0,.5,1-1e-9]){
   game.expedition.step=step;game.expedition.hold=definition.steps[step].duration*fraction;
   if(Object.hasOwn(game.expedition,'prepHold'))game.expedition.prepHold=30;
   if(Object.hasOwn(game.expedition,'bossDefeated'))game.expedition.bossDefeated=step>=2;
   const points=[...base];
   if(expeditionHasTransport(definition.id)){
    const body=expeditionTransport(game);assert.ok(body&&Object.isFrozen(body));transports++;
    for(const radius of [0,1,14,27])points.push([body.x+body.w/2,body.y+body.h/2,radius],[body.x-radius,body.y+body.h/2,radius],[body.x-radius+1e-9,body.y+body.h/2,radius],[body.x+body.w+radius-1e-9,body.y+body.h/2,radius]);
    assert.equal(game.blocked(body.x+body.w/2,body.y+body.h/2,14),true,'the actual transport body remains solid before, during and after escort movement');
   }
   compare(game,points,`${definition.id} step${step} hold${fraction}`);
  }
 }
 assert.ok(transports>12);assert.ok(water>0&&rooftop>0,'real water and roof support branches were covered');
});

test('destroyed, added, replaced, repositioned and sparse obstacles remain live on every query',()=>{
 const game=new Game({seed:774}),obstacle=game.world.obstacles[0];assert.ok(obstacle);const original=game.world.obstacles;
 const points=()=>[[obstacle.x+obstacle.w/2,obstacle.y+obstacle.h/2,14],[900,900,14],[930,900,14],...queries(game).slice(0,20)];
 compare(game,points(),'original');obstacle.destroyed=true;compare(game,points(),'destroyed');obstacle.destroyed=false;compare(game,points(),'restored');
 const added={id:++game.id,kind:'fence',x:880,y:880,w:40,h:40,height:20,hp:30,maxHp:30,destroyed:false};game.world.obstacles.push(added);compare(game,points(),'added');assert.equal(game.blocked(900,900,14),true);
 added.x=1000;compare(game,points(),'moved');added.destroyed=true;compare(game,points(),'added object destroyed');
 game.world.obstacles=[{...added,x:880,destroyed:false}];compare(game,points(),'array and object replacement');
 const sparse=new Array(7);sparse[2]=game.world.obstacles[0];sparse[6]={...added,x:1000,destroyed:false};game.world.obstacles=sparse;compare(game,[[900,900,14],[1020,900,14],[500,500,14]],'sparse original some semantics');
 delete sparse[2];compare(game,[[900,900,14],[1020,900,14],[500,500,14]],'deleted sparse entry');game.world.obstacles=original;
});

test('water short circuit and the expedition, roof, boundary and obstacle getter order stay unchanged',()=>{
 for(const expedition of [null,undefined,{get id(){calls.push('id');return 'unknown-expedition';}}])for(const waterHit of [false,true])for(const position of [[115,115,14],[0,0,14]]){
  var calls=[];
  const fake={get expedition(){calls.push('expedition');return expedition;},world:{get water(){calls.push('water');return waterHit?[{x:-100,y:-100,w:300,h:300}]:[];},get rooftop(){calls.push('rooftop');return null;},get width(){calls.push('width');return 2400;},get height(){calls.push('height');return 1800;},get obstacles(){calls.push('obstacles');return [{get destroyed(){calls.push('destroyed');return false;},x:100,y:100,w:30,h:30}];}}};
  const expected=originalBlocked.call(fake,...position),order=[...calls];calls=[];assert.equal(Game.prototype.blocked.call(fake,...position),expected);assert.deepEqual(calls,order);
  if(waterHit)assert.deepEqual(calls,['water'],'water still returns before reading expedition or other world state');else assert.equal(calls.filter(value=>value==='expedition').length,1);
 }
});

test('normal combat movement, damage effects and saves remain exact against the pre-guard blocked oracle',()=>{
 const ids=[null,EXPEDITIONS.find(e=>e.id.includes('north'))?.id,EXPEDITIONS.find(e=>e.id.includes('roof'))?.id,EXPEDITIONS.find(e=>e.id.includes('sea'))?.id].filter((id,index,all)=>all.indexOf(id)===index);
 for(const expeditionId of ids){
  const original=new Game({seed:774,weapon:'nailgun',...(expeditionId?{expeditionId}:{missionId:'mission-01'})}).snapshot();assert.ok(original);
  const before=Game.restore(original,{resumePlaying:true}),after=Game.restore(original,{resumePlaying:true});assert.ok(before&&after);before.blocked=originalBlocked;
  try{for(let frame=0;frame<24;frame++){
   const input={moveX:.3,moveY:.2,shoot:true,aimX:before.player.x+300,aimY:before.player.y-120,dash:frame===0,molotov:frame===2};before.tick(1/60,input);after.tick(1/60,input);assert.deepEqual(observe(after),observe(before),`${expeditionId??'campaign'} combat frame${frame}`);
  }}finally{delete before.blocked;}
 }
});
