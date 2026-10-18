const turn=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const lists=['enemies','bullets','hostileProjectiles','particles','pickups','corpses','throwables'];
const fields=['elapsed','height','attackTime','hitFlash','attackCd','reloadTime','skillCd','fallElapsed','life','recoil'];
const countdowns=['life','recoil','hitFlash','attackCd','reloadTime','skillCd'];
function captureActor(previous,actor,game,stats){
  if(!actor||!Number.isFinite(actor.x)||!Number.isFinite(actor.y))return;
  let record=previous.get(actor);
  if(record){
    record.x=actor.x;record.y=actor.y;record.angle=actor.angle;record.time=game.time;record.elapsed=actor.elapsed;record.height=actor.height;record.fallElapsed=actor.fallElapsed;record.attackTime=actor.attackTime;record.attackState=actor.attackState;record.hitFlash=actor.hitFlash;record.attackCd=actor.attackCd;record.reloadTime=actor.reloadTime;record.skillCd=actor.skillCd;record.life=actor.life;record.recoil=actor.recoil;
    if(stats)stats.reused++;
  }else{
    record={x:actor.x,y:actor.y,angle:actor.angle,time:game.time,elapsed:actor.elapsed,height:actor.height,fallElapsed:actor.fallElapsed,attackTime:actor.attackTime,attackState:actor.attackState,hitFlash:actor.hitFlash,attackCd:actor.attackCd,reloadTime:actor.reloadTime,skillCd:actor.skillCd,life:actor.life,recoil:actor.recoil};
    previous.set(actor,record);if(stats)stats.created++;
  }
}
// Persistent render proxies keep animation-clock identity stable. Neither the
// authoritative actors nor their checkpoint/RNG state ever receives a write.
export class ActorInterpolation {
  constructor(){this.previous=new WeakMap();this.proxies=new WeakMap();this.game=null;this.view=null;this.lastTime=null;this.reuseCapture=true;this.captureStats=null;}
  capture(game){
    if(this.game!==game){this.game=game;this.previous=new WeakMap();this.proxies=new WeakMap();this.view=Object.create(game);}
    const stats=this.captureStats;if(stats)stats.captures++;
    if(this.reuseCapture){
      captureActor(this.previous,game.player,game,stats);
      for(const name of lists)for(const actor of game[name]||[])captureActor(this.previous,actor,game,stats);
    }else{
      // QA baseline preserves the original flattened traversal and allocations.
      for(const actor of [game.player,...lists.flatMap(name=>game[name]||[])])if(actor&&Number.isFinite(actor.x)&&Number.isFinite(actor.y)){
        this.previous.set(actor,{x:actor.x,y:actor.y,angle:actor.angle,time:game.time,elapsed:actor.elapsed,height:actor.height,fallElapsed:actor.fallElapsed,attackTime:actor.attackTime,attackState:actor.attackState,hitFlash:actor.hitFlash,attackCd:actor.attackCd,reloadTime:actor.reloadTime,skillCd:actor.skillCd,life:actor.life,recoil:actor.recoil});
        if(stats)stats.created++;
      }
    }
    this.lastTime=game.time;this.priorFlash=game.flash;
    this.priorExpedition=game.expedition?{id:game.expedition.id,step:game.expedition.step,hold:game.expedition.hold,prepHold:game.expedition.prepHold,time:game.time}:null;
  }
  sample(game,alpha,step){
    if(this.game!==game||!this.view)return game;
    const playing=game.state==='playing',fraction=playing?Math.max(0,Math.min(1,alpha)):1;
    const actorView=actor=>{
      if(!actor||!Number.isFinite(actor.x)||!Number.isFinite(actor.y))return actor;
      let proxy=this.proxies.get(actor);if(!proxy){proxy=Object.create(actor);this.proxies.set(actor,proxy);}
      const prior=this.previous.get(actor),continuous=prior&&game.time>=prior.time&&game.time-prior.time<=step*1.01&&Math.hypot(actor.x-prior.x,actor.y-prior.y)<100;
      const amount=continuous?fraction:1;
      proxy.x=prior?prior.x+(actor.x-prior.x)*amount:actor.x;proxy.y=prior?prior.y+(actor.y-prior.y)*amount:actor.y;
      // Shield arcs/attack telegraphs must retain their exact dangerous angle.
      const exact=actor===game.player||actor.type==='shield'||actor.attackState==='windup'||actor.attackState==='charge';
      proxy.angle=continuous&&!exact&&Number.isFinite(prior.angle)&&Number.isFinite(actor.angle)?prior.angle+turn(prior.angle,actor.angle)*amount:actor.angle;
      for(const field of fields){const before=prior?.[field],after=actor[field];const sameState=(field!=='attackTime'||prior?.attackState===actor.attackState)&&(!countdowns.includes(field)||after<=before&&before-after<=step*1.01);proxy[field]=continuous&&sameState&&Number.isFinite(before)&&Number.isFinite(after)&&Math.abs(after-before)<=step*(field==='height'?800:200)?before+(after-before)*amount:after;}
      return proxy;
    };
    this.view.player=actorView(game.player);
    for(const name of lists)this.view[name]=(game[name]||[]).map(actorView);
    this.view.time=playing&&this.lastTime!==null&&game.time-this.lastTime<=step*1.01?this.lastTime+(game.time-this.lastTime)*fraction:game.time;
    this.view.flash=playing&&Number.isFinite(this.priorFlash)&&game.flash<=this.priorFlash&&this.priorFlash-game.flash<=step*1.01&&game.time-this.lastTime<=step*1.01?this.priorFlash+(game.flash-this.priorFlash)*fraction:game.flash;
    if(game.expedition){
      if(this.expeditionSource!==game.expedition){this.expeditionSource=game.expedition;this.expeditionProxy=Object.create(game.expedition);}
      const prior=this.priorExpedition,current=game.expedition;
      const continuous=prior&&prior.id===current.id&&prior.step===current.step&&game.time-prior.time<=step*1.01&&Math.abs(current.hold-prior.hold)<=step*1.01;
      this.expeditionProxy.hold=continuous?prior.hold+(current.hold-prior.hold)*fraction:current.hold;
      if(Number.isFinite(current.prepHold))this.expeditionProxy.prepHold=continuous&&Number.isFinite(prior?.prepHold)&&Math.abs(current.prepHold-prior.prepHold)<=step*1.01?prior.prepHold+(current.prepHold-prior.prepHold)*fraction:current.prepHold;
      this.view.expedition=this.expeditionProxy;
    }else this.view.expedition=game.expedition;
    return this.view;
  }
}
