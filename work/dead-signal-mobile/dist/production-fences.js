// Split the rendering cell only. Gameplay retains its original obstacle and
// collision polygon; each repeated section uses the same complete native mesh.
export function nativeFenceCells(obstacle, nativeFootprint) {
  const {x,y,w,h}=obstacle||{};
  if(obstacle?.kind!=='fence'||![x,y,w,h,nativeFootprint?.width,nativeFootprint?.height].every(Number.isFinite)
    ||w<=0||h<=0||nativeFootprint.width<=0||nativeFootprint.height<=0)return null;
  const horizontal=w>=h;
  const length=horizontal?w:h,depth=horizontal?h:w;
  const nativeLength=horizontal?nativeFootprint.width:nativeFootprint.height;
  const nativeDepth=horizontal?nativeFootprint.height:nativeFootprint.width;
  const capacity=nativeLength*depth/nativeDepth;
  const count=Math.max(1,Math.ceil(length/capacity-1e-7));
  if(count>16)return null;
  return Array.from({length:count},(_,i)=>horizontal
    ?{x:x+i*w/count,y,w:w/count,h}
    :{x,y:y+i*h/count,w,h:h/count});
}
