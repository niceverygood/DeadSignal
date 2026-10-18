export const NATIVE_UPLOAD_PROFILE_NOTE='QA observation of original native GL, renderer.initTexture and loaded skeleton.computeBoneTexture calls only. CPU call wall times include synchronous waits and observer overhead; nested stages overlap and must not be added. This does not measure GPU execution, presented FPS, upload bytes, RAM or VRAM. Setup retrieves the existing context once without GL queries, draws, reads, allocations or uploads of its own.';

// Share one dispatcher per method across overlapping observers. The original
// method keeps its receiver/arguments and executes exactly once, including when
// it throws. The last observer restores its exact original own descriptor only
// if no external code has replaced the dispatcher in the meantime.
const methodSlots=new WeakMap();
function subscribe(object,key,observer){
  let methods=methodSlots.get(object),slot=methods?.get(key);
  try{
    if(slot&&object[key]!==slot.dispatch)return null;
    if(!slot){
      const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];
      if(typeof original!=='function')return null;
      slot={descriptor,original,observers:new Set()};
      slot.dispatch=function(...args){
        const entered=[];
        for(const listener of slot.observers)try{entered.push([listener,listener.enter()]);}catch{}
        try{return slot.original.apply(this,args);}
        finally{for(let i=entered.length-1;i>=0;i--){const [listener,token]=entered[i];try{listener.leave(token);}catch{}}}
      };
      const next=descriptor&&'value'in descriptor?{...descriptor,value:slot.dispatch}:{configurable:descriptor?.configurable??true,enumerable:descriptor?.enumerable??false,writable:true,value:slot.dispatch};
      Object.defineProperty(object,key,next);methods??=new Map();methodSlots.set(object,methods);methods.set(key,slot);
    }
  }catch{return null;}
  slot.observers.add(observer);let attached=true;
  return()=>{
    if(!attached)return;attached=false;slot.observers.delete(observer);if(slot.observers.size)return;
    try{if(Object.getOwnPropertyDescriptor(object,key)?.value===slot.dispatch){if(slot.descriptor)Object.defineProperty(object,key,slot.descriptor);else delete object[key];}}catch{}
    methods.delete(key);if(!methods.size)methodSlots.delete(object);
  };
}

const glMethods=[
  'createTexture','deleteTexture','texStorage2D','texImage2D','texSubImage2D','generateMipmap',
  'compileShader','linkProgram','getProgramParameter','getShaderParameter','getProgramInfoLog','getShaderInfoLog',
  'getActiveUniform','getUniformLocation','getActiveAttrib','getAttribLocation',
  'bufferData','bufferSubData','createBuffer','createVertexArray','bindVertexArray','vertexAttribPointer','vertexAttribIPointer','enableVertexAttribArray',
  'drawElements','drawArrays','activeTexture','pixelStorei','bindTexture'
];

export function createNativeUploadProfile(rig,{now=()=>performance.now(),enabled=true}={}){
  const samples=[],unmeasured=[],undo=[],watched=new WeakMap();let current=null,stopped=false;
  const clock=()=>{try{const value=now();return Number.isFinite(value)?value:null;}catch{return null;}};
  function observe(object,key,name){
    if(!object||(typeof object!=='object'&&typeof object!=='function')){unmeasured.push(name);return;}
    let keys=watched.get(object);if(keys?.has(key))return;keys??=new Set();keys.add(key);watched.set(object,keys);
    const restore=subscribe(object,key,{
      enter(){return current?{frame:current,start:clock()}:null;},
      leave(token){
        if(!token)return;const end=clock(),entry=token.frame.stages[name]??={cpuMs:0,calls:0};entry.calls++;
        if(token.start!==null&&end!==null)entry.cpuMs+=Math.max(0,end-token.start);
      }
    });
    if(restore)undo.push(restore);else unmeasured.push(name);
  }
  if(enabled){
    const renderer=rig?.renderer;let gl;
    // This is the only setup context access. No capability/error/timer query or
    // initialization is issued; every subsequent GL entry is an original call.
    try{gl=renderer?.getContext?.();}catch{}
    if(gl)for(const key of glMethods)observe(gl,key,'gl.'+key);else unmeasured.push('gl.context-unavailable');
    observe(renderer,'initTexture','texture.init');
    // Touch only already loaded subjects and existing Skeleton instances. Do
    // not compute a bone texture, request a model, update a pose or reparent it.
    try{
      for(const model of rig?.models?.values?.()||[]){
        if(typeof model?.subject?.traverse!=='function'){unmeasured.push('skin.subject-traversal-unavailable');continue;}
        model.subject.traverse(object=>{if(object?.skeleton)observe(object.skeleton,'computeBoneTexture','skin.computeBoneTexture');});
      }
    }catch{unmeasured.push('skin.subject-traversal-failed');}
  }
  function beginFrame(meta={}){
    if(!enabled||stopped)return null;if(current)throw Error('native-upload-profile-frame-already-open');
    current={...meta,stages:{},startCpu:clock()};return current;
  }
  function endFrame(meta={}){
    if(!current)return null;const frame=current,end=clock();current=null;
    const start=frame.startCpu;delete frame.startCpu;Object.assign(frame,meta);frame.frameCpuMs=start!==null&&end!==null?Math.max(0,end-start):0;samples.push(frame);return frame;
  }
  function stop(){
    if(!stopped){stopped=true;current=null;for(const restore of undo.reverse())try{restore();}catch{unmeasured.push('observer-restore-failed');}}
    return {enabled,samples,unmeasured,note:NATIVE_UPLOAD_PROFILE_NOTE};
  }
  return {beginFrame,endFrame,samples,unmeasured,stop,note:NATIVE_UPLOAD_PROFILE_NOTE};
}
