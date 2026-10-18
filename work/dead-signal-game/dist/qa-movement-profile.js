export const MOVEMENT_PROFILE_NOTE='QA observes only original instance move/blocked calls. Counts mode calls no clock, including frame boundaries. Wall mode measures synchronous inclusive method call wall time with observer overhead; nested move/blocked times overlap and must not be summed. This is not presented FPS, GPU time, CPU execution time or heap usage. Nonplayer labels describe receiver/entity identity, not a verified actor class. Outside blocked calls are not attributed to movement. Unattributed updateEnemies work must not be named separation: it also contains grid, navigation, AI, damage, spawning and observation costs. An unfinished frame is omitted when stopped. No tick, movement, collision query, event drain, rendering, storage, RNG, scheduling or other Game call is initiated by this observer.';

const slots=new WeakMap();
const objectLike=value=>value!==null&&(typeof value==='object'||typeof value==='function');
function inheritedMethod(object,key){
  for(let owner=object;owner;owner=Object.getPrototypeOf(owner)){
    const descriptor=Object.getOwnPropertyDescriptor(owner,key);
    if(descriptor)return 'value'in descriptor&&typeof descriptor.value==='function'?descriptor.value:null;
  }
  return null;
}
function subscribe(object,key,listener){
  if(!objectLike(object))return null;
  let methods=slots.get(object),slot=methods?.get(key);
  try{
    if(slot&&Object.getOwnPropertyDescriptor(object,key)?.value!==slot.dispatch)return null;
    if(!slot){
      const descriptor=Object.getOwnPropertyDescriptor(object,key),original=inheritedMethod(object,key);
      if(!original||descriptor&&!('value'in descriptor))return null;
      slot={descriptor,original,listeners:new Set()};
      slot.dispatch=function(...args){
        let firstObserver=null,firstToken=null,overflow=null;
        for(const observer of slot.listeners)try{
          const token=observer.enter(this,args);
          if(!firstObserver){firstObserver=observer;firstToken=token;}
          else(overflow??=[]).push([observer,token]);
        }catch{}
        let result,threw=true;
        try{result=slot.original.apply(this,args);threw=false;return result;}
        finally{
          if(overflow)for(let index=overflow.length-1;index>=0;index--){
            const pair=overflow[index];try{pair[0].leave(pair[1],threw);}catch{}
            pair[0]=null;pair[1]=null;
          }
          if(firstObserver)try{firstObserver.leave(firstToken,threw);}catch{}
          firstObserver=null;firstToken=null;overflow=null;
        }
      };
      Object.defineProperty(object,key,descriptor?{...descriptor,value:slot.dispatch}:{value:slot.dispatch,writable:true,configurable:true,enumerable:false});
      methods??=new Map();slots.set(object,methods);methods.set(key,slot);
    }
  }catch{return null;}
  slot.listeners.add(listener);let attached=true;
  return()=>{
    if(!attached)return;attached=false;slot.listeners.delete(listener);if(slot.listeners.size)return;
    try{if(Object.getOwnPropertyDescriptor(object,key)?.value===slot.dispatch){if(slot.descriptor)Object.defineProperty(object,key,slot.descriptor);else delete object[key];}}catch{}
    methods.delete(key);if(!methods.size)slots.delete(object);
  };
}

/** QA-only composition: reports retain counters and primitive metadata only. */
export function createMovementProfile({read,now=()=>performance.now(),mode='counts',enabled=true,limit=120}={}){
  enabled=!!enabled;
  mode=mode==='wall'?'wall':'counts';
  const maximum=typeof limit==='number'&&Number.isFinite(limit)?Math.max(1,Math.min(120,Math.floor(limit))):120;
  const samples=[],unmeasured=[],missing=new Set(),undo=[];
  let game=null,current=null,report=null,stopped=false,epoch=0,moveReceiver=null,moveKind=null;
  const mark=name=>{if(!missing.has(name)){missing.add(name);unmeasured.push(name);}};
  const clock=()=>{if(stopped)return null;try{const value=now();if(Number.isFinite(value))return value;}catch{}mark('clock');return null;};
  const restore=()=>{while(undo.length)try{undo.pop()();}catch{mark('restore');}};
  function metadata(frame,meta){
    try{
      if(!objectLike(meta))return;
      for(const key of Object.keys(meta)){
        if(key==='frameIndex'||key==='mode'||key==='stages')continue;
        const descriptor=Object.getOwnPropertyDescriptor(meta,key);if(!descriptor||!('value'in descriptor))continue;
        const value=descriptor.value;
        if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))
          Object.defineProperty(frame,key,{value,writable:true,enumerable:true,configurable:true});
      }
    }catch{mark('metadata');}
  }
  const stage=(frame,label)=>frame.stages[label]??={calls:0,thrownCalls:0,wallMs:mode==='wall'?0:null};
  function classify(receiver,args){
    if(receiver!==game)return'foreign';
    try{const descriptor=Object.getOwnPropertyDescriptor(game,'player');if(descriptor&&'value'in descriptor&&args[0]===descriptor.value)return'player';}
    catch{mark('player');}
    return'nonplayer';
  }
  function attach(key){
    const release=subscribe(game,key,{
      enter(receiver,args){
        const frame=current;if(!frame)return null;
        if(key==='blocked'){
          const kind=moveKind!==null&&receiver===moveReceiver?moveKind:'outside',entry=stage(frame,'blocked.'+kind);entry.calls++;
          // Counts-only collision calls reuse their frame's counter object.
          if(mode==='counts')return entry;
          const token={entry,start:null};token.start=clock();return token;
        }
        const kind=classify(receiver,args),entry=stage(frame,'move.'+kind);entry.calls++;
        const token={entry,start:null,previousReceiver:moveReceiver,previousKind:moveKind,epoch};
        if(mode==='wall')token.start=clock();
        if(!stopped&&token.epoch===epoch){moveReceiver=receiver;moveKind=kind;}
        return token;
      },
      leave(token,threw){
        if(!token)return;
        if(key==='blocked'&&mode==='counts'){if(threw)token.thrownCalls++;return;}
        try{
          if(threw)token.entry.thrownCalls++;
          if(mode==='wall'){const end=clock();if(token.start!==null&&end!==null)token.entry.wallMs+=Math.max(0,end-token.start);}
        }finally{
          if(key==='move'){
            if(!stopped&&token.epoch===epoch){moveReceiver=token.previousReceiver;moveKind=token.previousKind;}
            token.previousReceiver=null;token.previousKind=null;token.epoch=null;
          }
          token.entry=null;token.start=null;
        }
      },
    });
    if(release)undo.push(release);else mark(key);
  }
  function sync(next){
    next=objectLike(next)?next:null;if(game===next)return;
    epoch++;moveReceiver=null;moveKind=null;restore();game=next;
    if(game){attach('move');attach('blocked');}
  }
  function beginFrame(meta={}){
    if(!enabled||stopped||current)return null;
    const frame={frameIndex:samples.length,mode,stages:{}};metadata(frame,meta);current=frame;
    let next=null;try{next=typeof read==='function'?read()?.game:null;}catch{mark('context.read');}
    // A read callback may end this frame or stop the observer. Do not reattach
    // after cancellation or overwrite a newer reentrant frame's owner.
    if(stopped)return null;if(current!==frame)return frame;
    try{sync(next);}catch{mark('attach');}
    return frame;
  }
  function endFrame(meta={}){
    if(!current)return null;
    const frame=current;current=null;metadata(frame,meta);
    try{samples.push(frame);}catch{mark('samples');stop();return frame;}
    if(samples.length>=maximum)stop();
    return frame;
  }
  function stop(){
    if(report)return report;stopped=true;current=null;epoch++;moveReceiver=null;moveKind=null;
    restore();game=null;read=null;now=null;
    return report={enabled,mode,samples,unmeasured,note:MOVEMENT_PROFILE_NOTE};
  }
  return{beginFrame,endFrame,stop,samples,unmeasured,note:MOVEMENT_PROFILE_NOTE};
}
