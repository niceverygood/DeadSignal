export function nativeAlphaBounds(rgba,width,height,threshold=8,{x=0,y=0,w=width,h=height}={}){
 let left=w,top=h,right=0,bottom=0;
 for(let rowIndex=0;rowIndex<h;rowIndex++){
  const row=(y+rowIndex)*width*4+x*4;let first=0;
  while(first<w&&rgba[row+first*4+3]<threshold)first++;
  if(first===w)continue;
  let last=w-1;while(last>first&&rgba[row+last*4+3]<threshold)last--;
  if(first<left)left=first;if(last+1>right)right=last+1;if(rowIndex<top)top=rowIndex;bottom=rowIndex+1;
 }
 return right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:null;
}
