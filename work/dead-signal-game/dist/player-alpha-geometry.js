const SIZE=256,RGBA_BYTES=SIZE*SIZE*4,EDGE_LENGTH=SIZE*2;
const APPLY=Reflect.apply,NO_ARGS=Object.freeze([]);
const typedArrayPrototype=Object.getPrototypeOf(Uint8ClampedArray.prototype);
const nativeTag=Object.getOwnPropertyDescriptor(typedArrayPrototype,Symbol.toStringTag).get;
const nativeLength=Object.getOwnPropertyDescriptor(typedArrayPrototype,'length').get;
const nativeByteLength=Object.getOwnPropertyDescriptor(typedArrayPrototype,'byteLength').get;
const nativeByteOffset=Object.getOwnPropertyDescriptor(typedArrayPrototype,'byteOffset').get;
const nativeBuffer=Object.getOwnPropertyDescriptor(typedArrayPrototype,'buffer').get;
const bufferByteLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const bufferResizable=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'resizable')?.get;

// Intrinsic getters inspect actual internal brands, not caller-controlled
// .length/.buffer/constructor/Symbol.toStringTag properties or instanceof.
function fixedViewBuffer(view,tag,length,bytes){
  try{
    if(APPLY(nativeTag,view,NO_ARGS)!==tag
      ||APPLY(nativeLength,view,NO_ARGS)!==length
      ||APPLY(nativeByteLength,view,NO_ARGS)!==bytes)throw new TypeError();
    const buffer=APPLY(nativeBuffer,view,NO_ARGS);
    // The ArrayBuffer getter rejects SharedArrayBuffer. Nonzero view length
    // plus native buffer size rejects detached storage; RAB is excluded too.
    const capacity=APPLY(bufferByteLength,buffer,NO_ARGS);
    if(bufferResizable&&APPLY(bufferResizable,buffer,NO_ARGS)
      ||capacity<APPLY(nativeByteOffset,view,NO_ARGS)+bytes)throw new TypeError();
    return buffer;
  }catch{
    throw new TypeError('fixed-player-alpha-geometry-invalid-view');
  }
}

/**
 * Fixed original-player CPU geometry only: a stable, attached, nonshared,
 * nonresizable native Uint8ClampedArray RGBA view and Uint16Array row scratch.
 * All 256 scratch pairs are replaced with [left,rightExclusive], or [256,0].
 * Scratch alone is reused; every returned bound, array and point is fresh.
 * No Canvas/GPU, asset, pose, clock, Game or random operation is performed.
 */
export function scanFixedPlayerAlphaGeometry(rgba,rowEdges){
  const pixelsBuffer=fixedViewBuffer(rgba,'Uint8ClampedArray',RGBA_BYTES,RGBA_BYTES);
  const edgesBuffer=fixedViewBuffer(rowEdges,'Uint16Array',EDGE_LENGTH,EDGE_LENGTH*2);
  // Conservative even for disjoint views: no scratch write may alias any
  // storage belonging to the caller's original colour/alpha buffer.
  if(pixelsBuffer===edgesBuffer)throw new TypeError('fixed-player-alpha-geometry-aliased-storage');

  let left=SIZE,top=SIZE,right=0,bottom=0;
  for(let y=0;y<SIZE;y++){
    const row=y*SIZE*4,edge=y*2;
    let first=0;
    while(first<SIZE&&rgba[row+first*4+3]<8)first++;
    if(first===SIZE){rowEdges[edge]=SIZE;rowEdges[edge+1]=0;continue;}
    let last=SIZE-1;
    while(last>first&&rgba[row+last*4+3]<8)last--;
    const end=last+1;
    rowEdges[edge]=first;rowEdges[edge+1]=end;
    if(first<left)left=first;
    if(end>right)right=end;
    if(y<top)top=y;
    bottom=y+1;
  }

  const alphaBounds=right>left&&bottom>top
    ?{x:left,y:top,width:right-left,height:bottom-top}
    :{x:SIZE,y:SIZE,width:1,height:1};
  const coreBounds={x:alphaBounds.x,y:alphaBounds.y,width:alphaBounds.width,height:alphaBounds.height*.72};
  const contourLeft=[],contourRight=[];
  const firstRow=Math.max(0,Math.floor(alphaBounds.y));
  const lastRow=Math.min(SIZE,Math.floor(coreBounds.y+coreBounds.height));
  for(let y=firstRow;y<lastRow;y++){
    const edge=y*2,first=rowEdges[edge],end=rowEdges[edge+1];
    if(first>=end)continue;
    contourLeft.push({x:first,y:y+.5});
    contourRight.push({x:end,y:y+.5});
  }
  const bodyIdentificationContour=contourLeft.length>1
    ?{left:contourLeft,right:contourRight,top:[contourLeft[0],contourRight[0]]}
    :null;
  return{alphaBounds,coreBounds,bodyIdentificationContour};
}
