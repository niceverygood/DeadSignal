import {nativeAlphaBounds} from './native-alpha-bounds.js';
import {bodyIdentificationContour} from './production-art.js?v=0.29.0';
// Original full scans retained only for exactness and CPU-cost QA comparisons.
export function legacyBodyContour(rgba,width,height,body,core,threshold=8){
 if(!rgba||rgba.length!==width*height*4||!body||!Number.isInteger(width)||width<=0||!Number.isInteger(height)||height<=0)return null;
 const left=[],right=[],top=Math.max(0,Math.floor(body.y)),bottom=Math.min(height,Math.floor(core?core.y+core.height:body.y+body.height*.72)),x0=Math.max(0,Math.floor(body.x)),x1=Math.min(width,Math.ceil(body.x+body.width));
 for(let y=top;y<bottom;y++){let min=-1,max=-1;for(let x=x0;x<x1;x++)if(rgba[(y*width+x)*4+3]>=threshold){if(min<0)min=x;max=x;}if(min>=0){left.push({x:min,y:y+.5});right.push({x:max+1,y:y+.5});}}
 return left.length>1?{left,right,top:[left[0],right[0]]}:null;
}
export function scanHeroMask(rgba,width,height,optimized=true){
 let bounds;if(optimized)bounds=nativeAlphaBounds(rgba,width,height)||{x:width,y:height,width:1,height:1};else{let left=width,top=height,right=0,bottom=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]>=8){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}bounds={x:left,y:top,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};}
 const core={x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height*.72};
 return {bounds,contour:(optimized?bodyIdentificationContour:legacyBodyContour)(rgba,width,height,bounds,core)};
}
export function benchmarkHeroMask(rgba,width,height){
 const old=scanHeroMask(rgba,width,height,false),next=scanHeroMask(rgba,width,height,true),results=[];
 for(const optimized of [false,true]){const times=[];let checksum=0;for(let i=0;i<120;i++){const start=performance.now();for(let j=0;j<8;j++){const value=scanHeroMask(rgba,width,height,optimized);checksum+=value.bounds.width+(value.contour?.left.length||0);}if(i>=20)times.push((performance.now()-start)/8);}times.sort((a,b)=>a-b);results.push({optimized,medianMs:times[50],p95Ms:times[95],checksum,scansPerSample:8});}
 return {width,height,identical:JSON.stringify(old)===JSON.stringify(next),bounds:next.bounds,contourRows:next.contour?.left.length||0,results,note:'CPU mask scans only on identical actual rendered RGBA; not whole-frame cost or FPS'};
}
