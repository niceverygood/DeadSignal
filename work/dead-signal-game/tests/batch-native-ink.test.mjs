import test from 'node:test';
import assert from 'node:assert/strict';
import {BatchNativeInk} from '../dist/boss-rig/batch-native-ink.js';
import {composeNativeFrame} from '../dist/boss-rig/native-composite.js';

const SIZE=256;
// Integer, unscaled Canvas2D alpha semantics only. Actual color/antialiasing and
// browser upload costs are covered by the separate native browser comparison.
function alphaCanvas(width=1,height=1){
 let w=width,h=height,alpha=new Uint8Array(w*h);
 const calls={clear:0,fill:0,draw:0},canvas={get width(){return w;},set width(value){w=value;reset();},get height(){return h;},set height(value){h=value;reset();},get alpha(){return alpha;},getContext(kind){assert.equal(kind,'2d');return context;}};
 const context={globalCompositeOperation:'source-over',fillStyle:'#000000',
  clearRect(x,y,rw,rh){calls.clear++;for(let row=Math.max(0,y);row<Math.min(h,y+rh);row++)alpha.fill(0,row*w+Math.max(0,x),row*w+Math.min(w,x+rw));},
  fillRect(){calls.fill++;assert.equal(this.globalCompositeOperation,'source-in','the original opaque ink preserves source alpha');},
  drawImage(source,...args){
   calls.draw++;assert.equal(this.globalCompositeOperation,'source-over');
   const [sx,sy,sw,sh,dx,dy,dw,dh]=args.length===2?[0,0,source.width,source.height,args[0],args[1],source.width,source.height]:args;
   assert.ok([sx,sy,sw,sh,dx,dy,dw,dh].every(Number.isInteger));assert.equal(sw,dw);assert.equal(sh,dh);
   assert.ok(sx>=0&&sy>=0&&sx+sw<=source.width&&sy+sh<=source.height,'source rectangle stays inside its atlas');
   for(let row=0;row<sh;row++)for(let col=0;col<sw;col++){
    const x=dx+col,y=dy+row;if(x<0||y<0||x>=w||y>=h)continue;
    const incoming=source.alpha[(sy+row)*source.width+sx+col],i=y*w+x;alpha[i]=Math.round(incoming+alpha[i]*(255-incoming)/255);
   }
  },
 };
 function reset(){alpha=new Uint8Array(w*h);context.globalCompositeOperation='source-over';context.fillStyle='#000000';}
 return {canvas,context,calls};
}
function fillCell(canvas,index,value){const x=index%4*SIZE,y=Math.floor(index/4)*SIZE;for(let row=0;row<SIZE;row++)canvas.alpha.fill(value,(y+row)*canvas.width+x,(y+row)*canvas.width+x+SIZE);}
function outputFor(source,index,helper){
 const output=alphaCanvas(SIZE,SIZE),ink=alphaCanvas(SIZE,SIZE),baseline=alphaCanvas(SIZE,SIZE),x=index%4*SIZE,y=Math.floor(index/4)*SIZE;
 composeNativeFrame(baseline.context,ink.context,ink.canvas,source,SIZE,x,y);
 assert.equal(helper.draw(output.context,source,SIZE,x,y),true);assert.deepEqual(output.canvas.alpha,baseline.canvas.alpha,'atlas cell '+index+' exactly retains the original outline alpha');
 assert.equal(output.calls.draw,9,'eight original outline offsets plus the original body');assert.equal(output.calls.clear,1);
 assert.notEqual(output.canvas,helper.image,'output remains a private single-cell surface');return output.canvas;
}

test('one atlas ink preparation retains faint alpha and all four cell boundaries beside opaque neighbors',()=>{
 const source=alphaCanvas(4*SIZE,3*SIZE).canvas;source.alpha.fill(255);fillCell(source,5,0);
 const shades=[1,7,8,128,255],left=SIZE,top=SIZE;
 for(let i=0;i<SIZE;i++){
  source.alpha[top*source.width+left+i]=shades[i%shades.length];
  source.alpha[(top+SIZE-1)*source.width+left+i]=shades[(i+1)%shades.length];
  source.alpha[(top+i)*source.width+left]=shades[(i+2)%shades.length];
  source.alpha[(top+i)*source.width+left+SIZE-1]=shades[(i+3)%shades.length];
 }
 for(let i=0;i<shades.length;i++)source.alpha[(top+30+i*17)*source.width+left+30+i*23]=shades[i];
 const before=source.alpha.slice(),created=[],helper=new BatchNativeInk({createImage:()=>{const s=alphaCanvas();created.push(s);return s.canvas;}});
 assert.equal(helper.prepare(source,source.width,source.height,SIZE),helper);
 assert.equal(helper.preparations,1);assert.equal(helper.rawBytes,3*1024*1024);assert.equal(created.length,1);
 assert.deepEqual(created[0].calls,{clear:1,fill:1,draw:1},'upload and tint the atlas once');
 const outputs=Array.from({length:12},(_,index)=>outputFor(source,index,helper));
 assert.equal(helper.cells,12);assert.equal(new Set(outputs).size,12);assert.deepEqual(source.alpha,before,'preparation and cell draws never write the original atlas');
 const retained=outputs[5].alpha.slice();source.alpha.fill(0);helper.prepare(source,source.width,source.height,SIZE);helper.release();
 assert.deepEqual(outputs[5].alpha,retained,'later atlas reuse and release cannot change a completed private output');
});

test('12 to 5 to 12 capacity changes clear prior ink and unused cells without retaining more than one atlas',()=>{
 const created=[],helper=new BatchNativeInk({createImage:()=>{const s=alphaCanvas();created.push(s);return s.canvas;}});
 const first=alphaCanvas(4*SIZE,3*SIZE).canvas;first.alpha.fill(255);helper.prepare(first,first.width,first.height,SIZE);outputFor(first,11,helper);
 const image=helper.image,middle=alphaCanvas(4*SIZE,2*SIZE).canvas;for(let cell=0;cell<5;cell++)fillCell(middle,cell,[1,7,8,128,255][cell]);
 helper.prepare(middle,middle.width,middle.height,SIZE);assert.equal(helper.image,image);assert.equal(helper.rawBytes,2*1024*1024);assert.deepEqual(helper.image.alpha,middle.alpha);
 for(const cell of [0,4,5,7])outputFor(middle,cell,helper);
 const final=alphaCanvas(4*SIZE,3*SIZE).canvas;final.alpha[final.alpha.length-1]=1;helper.prepare(final,final.width,final.height,SIZE);
 assert.equal(helper.image,image);assert.deepEqual(helper.image.alpha,final.alpha,'old opaque cells cannot survive atlas growth');
 for(const cell of [0,5,11])outputFor(final,cell,helper);
 final.alpha.fill(0);helper.prepare(final,final.width,final.height,SIZE);assert.ok(helper.image.alpha.every(a=>a===0),'unchanged atlas dimensions still clear every old pixel');
 assert.equal(created.length,1);assert.equal(helper.preparations,4);assert.deepEqual(created[0].calls,{clear:4,fill:4,draw:4});
 assert.ok(helper.rawBytes<=3*1024*1024);
});

test('unsupported sizes and oversized atlases allocate nothing, and release shrinks and discards its surface',()=>{
 let allocations=0;const helper=new BatchNativeInk({createImage:()=>{allocations++;return alphaCanvas().canvas;}});
 const source={width:2048,height:2048};
 for(const [width,height,size]of [[512,512,512],[1024,1024,256],[1280,256,256],[257,256,256],[0,256,256],[256,-1,256],[NaN,256,256]]){
  assert.equal(helper.prepare(source,width,height,size),null);assert.equal(allocations,0);assert.equal(helper.rawBytes,0);
 }
 assert.equal(helper.prepare(null,256,256,SIZE),null);assert.equal(helper.prepare({width:255,height:256},256,256,SIZE),null);assert.equal(allocations,0);
 const valid=alphaCanvas(SIZE,SIZE).canvas;valid.alpha[0]=7;helper.prepare(valid,SIZE,SIZE,SIZE);assert.equal(allocations,1);
 const image=helper.image,output=alphaCanvas(SIZE,SIZE);output.canvas.alpha.fill(128);const before=output.canvas.alpha.slice();
 for(const [size,x,y]of [[512,0,0],[256,-1,0],[256,1,0],[256,0,1],[256,256,0],[256,0,256]])assert.equal(helper.draw(output.context,valid,size,x,y),false);
 assert.deepEqual(output.canvas.alpha,before);assert.equal(output.calls.draw,0);assert.equal(helper.cells,0);
 helper.release();assert.equal(image.width,1);assert.equal(image.height,1);assert.equal(helper.image,null);assert.equal(helper.context,null);assert.equal(helper.rawBytes,0);
 assert.equal(helper.draw(output.context,valid,SIZE,0,0),false);helper.release();assert.equal(allocations,1);
 helper.prepare(valid,SIZE,SIZE,SIZE);const next=helper.image;assert.equal(allocations,2);assert.notEqual(next,image);
 assert.equal(helper.prepare(source,1024,1024,SIZE),null);assert.equal(next.width,1);assert.equal(next.height,1);assert.equal(helper.image,null);assert.equal(helper.rawBytes,0);
});
