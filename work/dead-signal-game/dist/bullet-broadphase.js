// Reject only plainly separated targets in the ordinary game coordinate range.
// Leave extreme/custom values to the original floating-point narrow phase.
export const BULLET_BOUNDS_MARGIN=1e-4;
const LIMIT=8192;
const coordinate=n=>typeof n==='number'&&n>=-LIMIT&&n<=LIMIT;
export function boundedBulletSegment(x1,y1,x2,y2){
  if(!coordinate(x1)||!coordinate(y1)||!coordinate(x2)||!coordinate(y2))return false;
  const span=Math.max(Math.abs(x2-x1),Math.abs(y2-y1));
  return span>=1e-4&&span<=LIMIT;
}
export function bulletCircleMayOverlap(minX,minY,maxX,maxY,x,y,r){
  if(!coordinate(x)||!coordinate(y)||typeof r!=='number'||!(r>=3&&r<=512))return true;
  return !(maxX<x-r||minX>x+r||maxY<y-r||minY>y+r);
}
export function bulletRectMayOverlap(minX,minY,maxX,maxY,o){
  if(!coordinate(o.x)||!coordinate(o.y)||typeof o.w!=='number'||typeof o.h!=='number'||!(o.w>=0&&o.w<=LIMIT&&o.h>=0&&o.h<=LIMIT))return true;
  return !(maxX<o.x-3||minX>o.x+o.w+3||maxY<o.y-3||minY>o.y+o.h+3);
}
// Same arithmetic/evaluation order as the original two-axis slab test, without
// creating nested arrays/iterators for every obstacle and every bullet.
export function segmentRectNoAlloc(x1,y1,x2,y2,o,pad=3){
  let lo=0,hi=1;
  const dx=x2-x1,minX=o.x-pad,maxX=o.x+o.w+pad,dy=y2-y1,minY=o.y-pad,maxY=o.y+o.h+pad;
  if(Math.abs(dx)<1e-9){if(x1<minX||x1>maxX)return null;}
  else{let a=(minX-x1)/dx,b=(maxX-x1)/dx;if(a>b){const swap=a;a=b;b=swap;}lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;}
  if(Math.abs(dy)<1e-9){if(y1<minY||y1>maxY)return null;}
  else{let a=(minY-y1)/dy,b=(maxY-y1)/dy;if(a>b){const swap=a;a=b;b=swap;}lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;}
  return lo;
}
