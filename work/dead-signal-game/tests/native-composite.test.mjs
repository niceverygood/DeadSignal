import test from 'node:test';import assert from 'node:assert/strict';
import {nativeCompositeRegion,composeNativeFrame} from '../dist/boss-rig/native-composite.js';
import {nativeAlphaBounds} from '../dist/native-alpha-bounds.js';
function surface(width,height){
 const image={width,height,alpha:new Uint8Array(width*height)},context={globalCompositeOperation:'source-over',clearRect(){image.alpha.fill(0);},fillRect(){},drawImage(source,...a){
  const [sx,sy,sw,sh,dx,dy,dw,dh]=a.length===2?[0,0,source.width,source.height,a[0],a[1],source.width,source.height]:a;
  assert.equal(sw,dw);assert.equal(sh,dh);
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const tx=dx+x,ty=dy+y;if(tx<0||ty<0||tx>=width||ty>=height)continue;const src=source.alpha[(sy+y)*source.width+sx+x],i=ty*width+tx;image.alpha[i]=Math.round(src+image.alpha[i]*(255-src)/255);}
 }};return{image,context};
}
test('composition bounds retain alpha1/alpha7 islands which original visibility deliberately excludes',()=>{
 const size=16,width=32,pixels=new Uint8Array(width*size*4);pixels[(3*width+20)*4+3]=255;pixels[(1*width+17)*4+3]=1;pixels[(14*width+30)*4+3]=7;
 const visibility=nativeAlphaBounds(pixels,width,size,8,{x:16,y:0,w:size,h:size});assert.deepEqual(visibility,{x:4,y:3,width:1,height:1});assert.deepEqual(nativeCompositeRegion(pixels,width,size,size,16,0),{x:1,y:1,width:14,height:14});assert.equal(nativeCompositeRegion(null,width,size,size),null);
});
test('cropped outline and body match full-cell alpha composition including faint borders, sparse islands and adjacent atlas cells',()=>{
 const size=16,width=48,height=32;
 for(let seed=1;seed<=60;seed++){
  const source=surface(width,height).image,pixels=new Uint8Array(width*height*4);let n=seed;
  for(let i=0;i<source.alpha.length;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;const x=i%width,y=Math.floor(i/width);source.alpha[i]=x<16||x>=32?255:(x+y+seed)%9===0?[1,7,8,128,255][n%5]:0;pixels[i*4+3]=source.alpha[i];}
  for(const oy of [0,16]){
   const ink=surface(size,size),baseline=surface(size,size),candidate=surface(size,size),region=nativeCompositeRegion(pixels,width,height,size,16,oy);
   composeNativeFrame(baseline.context,ink.context,ink.image,source,size,16,oy);
   composeNativeFrame(candidate.context,ink.context,ink.image,source,size,16,oy,region);
   assert.deepEqual(candidate.image.alpha,baseline.image.alpha,`seed ${seed} offset ${oy}`);
  }
 }
});
