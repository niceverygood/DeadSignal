// Capture keeps mouse and pen releases attached to the canvas even when the
// pointer leaves it. Only the pointer that began a shot may end that shot.
export function bindPointerFire(canvas,{pointer,impulses,isPlaying,onStart}){
  const releaseCapture=id=>{
    try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch{}
  };
  const end=preservePulse=>{
    const id=pointer.shootId;
    pointer.shoot=false;pointer.shootId=null;
    if(!preservePulse)impulses.fireOnce=false;
    // releasePointerCapture can dispatch lostpointercapture immediately. Clear
    // ownership first so that a normal short click keeps its queued shot.
    if(id!==null&&id!==undefined)releaseCapture(id);
  };
  const owns=event=>pointer.shootId!==null&&pointer.shootId!==undefined&&event.pointerId===pointer.shootId;
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch'||event.button!==0||pointer.shootId!=null||!isPlaying())return;
    onStart?.(event);pointer.shoot=true;pointer.shootId=event.pointerId;impulses.fireOnce=true;
    try{canvas.setPointerCapture(event.pointerId);}catch{end(false);}
  });
  canvas.addEventListener('pointerup',event=>{if(owns(event))end(true);});
  canvas.addEventListener('pointercancel',event=>{if(owns(event))end(false);});
  canvas.addEventListener('lostpointercapture',event=>{if(owns(event))end(false);});
  canvas.addEventListener('pointermove',event=>{if(owns(event)&&(event.buttons&1)===0)end(true);});
  return()=>end(false);
}
