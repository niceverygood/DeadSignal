const allowed=new Set(['KeyW','KeyA','KeyS','KeyD','KeyX','Space','Enter','Escape']);
const allowedKeys=new Set(['w','a','s','d','x',' ','enter','escape']);
// Visible, bounded diagnostics for explicit memory-only QA. Never feeds input.
export function installQAInputProbe(doc){
 const output=doc.createElement('output');output.id='qa-input-probe';output.setAttribute('aria-label','검수 입력 전달 기록');output.style.cssText='position:fixed;left:4px;top:4px;z-index:99999;max-width:420px;max-height:45vh;overflow:auto;pointer-events:none;background:#101914ee;color:#e7efdf;font:10px monospace;white-space:pre-wrap;padding:8px';doc.body.append(output);
 const state={events:[],frame:null,maxHold:0,interactingFrames:0};let lastPaint=-Infinity;
 const paint=()=>{output.textContent=JSON.stringify(state,null,2);};
 const event=e=>{const target=e.target?.closest?.('#expedition-action')?.id||e.target?.id||'';if(e.type.startsWith('key')?!(allowed.has(e.code)||allowedKeys.has(String(e.key).toLowerCase())):target!=='expedition-action')return;
  state.events.push({type:e.type,code:e.code,key:e.key,target,trusted:e.isTrusted,time:performance.now()});if(state.events.length>24)state.events.shift();paint();};
 const types=['keydown','keyup','pointerdown','pointerup','pointercancel','lostpointercapture','click'];for(const type of types)doc.addEventListener(type,event,true);
 return {observe(frame){state.frame={...frame,keys:[...(frame.keys||[])]};state.maxHold=Math.max(state.maxHold,frame.hold||0);if(frame.interact)state.interactingFrames++;const now=performance.now();if(now-lastPaint>=200){lastPaint=now;paint();}},
 dispose(){for(const type of types)doc.removeEventListener(type,event,true);output.remove();}};
}
