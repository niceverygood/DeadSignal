// A normal release preserves a tap queued between simulation steps. A cancelled
// gesture or unexpected capture loss must discard that pending shot instead.
export function endTouchFire(touch,impulses,event){
  if(event.pointerId!==touch.shootId)return false;
  touch.shoot=false;touch.shootId=null;
  if(event.type!=='pointerup')impulses.fireOnce=false;
  return true;
}
