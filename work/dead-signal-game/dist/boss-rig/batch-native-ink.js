const OFFSETS=[[-3,0],[3,0],[0,-3],[0,3],[-2,-2],[2,-2],[-2,2],[2,2]];
const MAX_PIXELS=12*256*256;
// A separate temporary atlas: the original single-cell ink remains256px and
// private output slots never expose a neighboring actor's atlas pixels.
export class BatchNativeInk {
  constructor({createImage=()=>document.createElement('canvas')}={}){this.createImage=createImage;this.image=null;this.context=null;this.preparations=0;this.cells=0;}
  prepare(source,width,height,size){
    if(size!==256||![width,height].every(v=>Number.isInteger(v)&&v>0&&v%size===0)||width>4*size||width*height>MAX_PIXELS||!source||source.width<width||source.height<height){this.release();return null;}
    if(!this.image){this.image=this.createImage();this.context=this.image.getContext('2d');}
    if(!this.context){this.release();return null;}
    if(this.image.width!==width||this.image.height!==height){this.image.width=width;this.image.height=height;}
    const c=this.context;c.clearRect(0,0,width,height);c.drawImage(source,0,0,width,height,0,0,width,height);
    c.globalCompositeOperation='source-in';c.fillStyle='#181c1e';c.fillRect(0,0,width,height);c.globalCompositeOperation='source-over';this.preparations++;return this;
  }
  draw(context,source,size,x,y){
    if(!this.image||size!==256||![x,y].every(v=>Number.isInteger(v)&&v>=0&&v%size===0)||x+size>this.image.width||y+size>this.image.height)return false;
    context.clearRect(0,0,size,size);
    for(const [dx,dy]of OFFSETS)context.drawImage(this.image,x,y,size,size,dx,dy,size,size);
    context.drawImage(source,x,y,size,size,0,0,size,size);this.cells++;return true;
  }
  get rawBytes(){return this.image?this.image.width*this.image.height*4:0;}
  release(){if(this.image){this.image.width=this.image.height=1;}this.image=null;this.context=null;}
}
