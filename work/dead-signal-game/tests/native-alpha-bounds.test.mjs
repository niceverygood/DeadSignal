import test from 'node:test';import assert from 'node:assert/strict';import {nativeAlphaBounds} from '../dist/native-alpha-bounds.js';import {alphaBounds} from '../../meshy-sprite-baker/src/atlas.js';
test('edge scan agrees with original full pixel bounds for sparse islands, cutouts and exact threshold pixels',()=>{
 for(let seed=1;seed<=80;seed++){const w=17+seed%21,h=13+seed%29,p=new Uint8ClampedArray(w*h*4);let n=seed;for(let i=3;i<p.length;i+=4){n=(Math.imul(n,1664525)+1013904223)>>>0;p[i]=n%7===0?8:n%13===0?255:7;}assert.deepEqual(nativeAlphaBounds(p,w,h),alphaBounds(p,w,h));}
});
test('single pixels on every border and empty frames keep exact clipping and empty semantics',()=>{
 const w=256,h=128;for(const [x,y]of [[0,0],[255,0],[0,127],[255,127],[128,64]]){const p=new Uint8ClampedArray(w*h*4);p[(y*w+x)*4+3]=8;assert.deepEqual(nativeAlphaBounds(p,w,h),{x,y,width:1,height:1});p[(y*w+x)*4+3]=7;assert.equal(nativeAlphaBounds(p,w,h),null);}
});

test('batch-cell regions produce the same local bounds as individually cropped RGBA frames',()=>{
 const width=128,height=96,p=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)if((x*7+y*11)%9===0)p[(y*width+x)*4+3]=255;
 for(const [x,y,w,h]of [[0,0,32,32],[32,0,32,32],[64,32,32,32],[96,64,32,32]]){const crop=new Uint8ClampedArray(w*h*4);for(let row=0;row<h;row++)crop.set(p.subarray(((y+row)*width+x)*4,((y+row)*width+x+w)*4),row*w*4);assert.deepEqual(nativeAlphaBounds(p,width,height,8,{x,y,w,h}),alphaBounds(crop,w,h));}
});
