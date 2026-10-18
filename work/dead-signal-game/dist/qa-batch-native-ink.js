import {BatchNativeInk} from './boss-rig/batch-native-ink.js';
export function compareBatchInkEdges(){
 const size=256,source=document.createElement('canvas');source.width=1024;source.height=768;const sc=source.getContext('2d',{willReadFrequently:true}),data=sc.createImageData(source.width,source.height);
 for(let cell=0;cell<12;cell++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=((Math.floor(cell/4)*size+y)*source.width+cell%4*size+x)*4;data.data[i]=(cell*31+x)%256;data.data[i+1]=(cell*67+y)%256;data.data[i+2]=(x+y+cell*13)%256;
  data.data[i+3]=x===0||y===0||x===size-1||y===size-1||(x+y)%37===0?[1,7,8,128,255][(cell+x+y)%5]:0;
 }
 sc.putImageData(data,0,0);const ink=document.createElement('canvas');ink.width=ink.height=size;const ic=ink.getContext('2d'),helper=new BatchNativeInk(),read=document.createElement('canvas');read.width=read.height=size;const rc=read.getContext('2d',{willReadFrequently:true});
 const pixels=image=>{rc.clearRect(0,0,size,size);rc.drawImage(image,0,0);return rc.getImageData(0,0,size,size).data;},reports=[];
 helper.prepare(source,source.width,source.height,size);const rawBytes=helper.rawBytes;
 try{for(let cell=0;cell<12;cell++){
  const x=cell%4*size,y=Math.floor(cell/4)*size,a=document.createElement('canvas'),b=document.createElement('canvas');a.width=a.height=b.width=b.height=size;const ac=a.getContext('2d'),bc=b.getContext('2d');
  ic.clearRect(0,0,size,size);ic.drawImage(source,x,y,size,size,0,0,size,size);ic.globalCompositeOperation='source-in';ic.fillStyle='#181c1e';ic.fillRect(0,0,size,size);ic.globalCompositeOperation='source-over';
  for(const [dx,dy]of [[-3,0],[3,0],[0,-3],[0,3],[-2,-2],[2,-2],[-2,2],[2,2]])ac.drawImage(ink,dx,dy);ac.drawImage(source,x,y,size,size,0,0,size,size);
  if(!helper.draw(bc,source,size,x,y))throw Error('batch-ink-edge-copy-failed');const before=pixels(a),after=pixels(b);let different=0,maxDelta=0;for(let i=0;i<before.length;i++){const d=Math.abs(before[i]-after[i]);if(d)different++;maxDelta=Math.max(maxDelta,d);}reports.push({cell,different,maxDelta});
 }}finally{helper.release();}
 return {reports,extraInkRawBytes:rawBytes,rawBytesAfterRelease:helper.rawBytes};
}
