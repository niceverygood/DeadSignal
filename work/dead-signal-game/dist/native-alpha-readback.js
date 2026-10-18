// Top-left RGBA for alpha-only consumers. RGB remains WebGL-premultiplied;
// draw the original canvas for colour, never replace it with these bytes.
export class NativeAlphaReadback {
 constructor(){this.capacity=0;this.reads=0;this.fallbacks=0;this.verification={calls:0,different:0,maxDelta:0,pixels:0};}
 read(renderer,width,height){
  try{
   const gl=renderer.getContext?.();
   if(!gl?.readPixels||gl.isContextLost?.()||renderer.getRenderTarget&&renderer.getRenderTarget()!==null||!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0){this.fallbacks++;return null;}
   const length=width*height*4;
   if(this.capacity<length){this.bottom=new Uint8Array(length);this.top=new Uint8Array(length);this.capacity=length;this.width=0;}
   if(this.width!==width||this.height!==height){this.width=width;this.height=height;this.view=this.top.subarray(0,length);this.rows=Array.from({length:height},(_,y)=>this.bottom.subarray((height-y-1)*width*4,(height-y)*width*4));}
   gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,this.bottom);
   if(gl.getError&&gl.getError()!==(gl.NO_ERROR??0)){this.fallbacks++;return null;}
   for(let y=0;y<height;y++)this.top.set(this.rows[y],y*width*4);
   this.reads++;return this.view;
  }catch{this.fallbacks++;return null;}
 }
 compareAlpha(a,b){const v=this.verification;v.calls++;v.pixels+=Math.min(a.length,b.length)/4;for(let i=3;i<Math.min(a.length,b.length);i+=4){const delta=Math.abs(a[i]-b[i]);if(delta){v.different++;v.maxDelta=Math.max(v.maxDelta,delta);}}}
}
