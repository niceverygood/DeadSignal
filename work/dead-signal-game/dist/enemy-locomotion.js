const TAU=Math.PI*2,finite=Number.isFinite;
const wrap=angle=>((angle%TAU)+TAU)%TAU;
export function shortestTurn(from,to){return Math.atan2(Math.sin(to-from),Math.cos(to-from));}

// Visual history belongs to the renderer, never an enemy/save or either RNG.
export class EnemyLocomotionClock {
  constructor(){this.actors=new WeakMap();}
  select(actor,time=0,{cycleDistance=60,turnRate=5,scale=1}={}){
    if(!actor||!finite(actor.x)||!finite(actor.y)||!finite(time))return {pose:'idle',phase:0,angle:0,speed:0};
    const previous=this.actors.get(actor);
    if(previous&&time===previous.time)return previous.selection;
    const advanced=previous&&time>previous.time,dt=advanced?time-previous.time:0;
    const dx=advanced?actor.x-previous.x:0,dy=advanced?actor.y-previous.y:0,distance=Math.hypot(dx,dy),moving=distance>.001;
    const actionFacing=['windup','charge'].includes(actor.attackState);
    const lockedFacing=actionFacing||actor.type==='shield';
    const aimed=finite(actor.angle)?actor.angle:0;
    // Avoid pathfinding's abrupt 22/45/90-degree snaps while walking. Warnings
    // and active attacks keep the exact simulation angle so the art remains
    // honest about the dangerous direction and shield coverage.
    const knocked=actor.stun>0||Math.hypot(actor.vx||0,actor.vy||0)>10;
    const target=moving&&!actionFacing&&!knocked?Math.atan2(dy,dx):aimed;
    let angle=advanced?previous.selection.angle:aimed;
    if(lockedFacing||!advanced)angle=aimed;
    else if(moving){const limit=Math.max(.1,turnRate)*dt;angle+=Math.max(-limit,Math.min(limit,shortestTurn(angle,target)));}
    angle=wrap(angle);
    const stride=Math.max(1,cycleDistance*Math.max(.1,scale));
    // Stagger the herd without random draws. A restored actor gets the same
    // initial cycle; ordinary paused redraws return the same immutable object.
    const offset=((Math.imul((actor.id||actor.seed||0)|0,1103515245)>>>0)%1024)/1024*TAU;
    const prior=advanced?previous.selection.phase:offset;
    const reverse=moving&&(dx*Math.cos(angle)+dy*Math.sin(angle))/distance<-.35;
    // A knockback slides the body, rather than making stunned legs sprint.
    const phase=moving&&!knocked&&!actionFacing?wrap(prior+(reverse?-1:1)*distance*TAU/stride):prior;
    const selection=Object.freeze({pose:moving?'walk':'idle',phase,angle,speed:dt?distance/dt:0,
      cycleDistance:stride,reverse,turning:Math.abs(shortestTurn(angle,target))>.04,knocked,actionFacing});
    this.actors.set(actor,{x:actor.x,y:actor.y,time,selection});return selection;
  }
  reset(actor){if(actor&&typeof actor==='object')this.actors.delete(actor);}
}

export function enemyGroundingHeight(selected,profile,scale=1){
  if(!selected||!profile?.soleHeights||selected.metadata.animation?.clips
    ||selected.metadata.atlas.samples!==32||!Number.isInteger(selected.frame?.sample))return 0;
  const height=profile.subjectHeight||selected.metadata.projection.subjectHeight;
  const value=profile.grounding.includes('preserve-flight')?profile.groundingBaseline:profile.soleHeights[selected.frame.sample];
  return finite(value)?Math.max(-height*.04,Math.min(height*.04,value))*scale:0;
}
