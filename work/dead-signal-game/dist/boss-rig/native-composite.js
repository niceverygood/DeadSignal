import {nativeAlphaBounds} from '../native-alpha-bounds.js';
const OFFSETS=[[-3,0],[3,0],[0,-3],[0,3],[-2,-2],[2,-2],[-2,2],[2,2]];

// Alpha8 is the gameplay visibility measurement. Composition must retain even
// alpha1 antialiasing; using the visibility rectangle here loses faint pixels.
export function nativeCompositeRegion(pixels,width,height,size,x=0,y=0){
  if(!pixels)return null;
  return nativeAlphaBounds(pixels,width,height,1,{x,y,w:size,h:size});
}
export function composeNativeFrame(context,inkContext,ink,source,size,x=0,y=0,region=null){
  const r=region||{x:0,y:0,width:size,height:size};
  inkContext.clearRect(0,0,size,size);
  inkContext.drawImage(source,x+r.x,y+r.y,r.width,r.height,r.x,r.y,r.width,r.height);
  inkContext.globalCompositeOperation='source-in';inkContext.fillStyle='#181c1e';inkContext.fillRect(0,0,size,size);inkContext.globalCompositeOperation='source-over';
  context.clearRect(0,0,size,size);
  for(const [dx,dy]of OFFSETS)context.drawImage(ink,r.x,r.y,r.width,r.height,r.x+dx,r.y+dy,r.width,r.height);
  context.drawImage(source,x+r.x,y+r.y,r.width,r.height,r.x,r.y,r.width,r.height);
}
