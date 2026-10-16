import {project} from './projection.js?v=0.26.0';

const finite=Number.isFinite,positive=value=>finite(value)&&value>0;
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

export function validateExplosionAtlas(raw){
  const invalid=()=>{throw new Error('invalid-explosion-atlas');};
  if(!raw||raw.format!=='imagegen-explosion-atlas'||raw.version!==1||raw.source?.kind!=='image_gen'||raw.source.isMeshyGLB!==false
    ||typeof raw.source.sha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.source.sha256)||raw.width!==1254||raw.height!==1254||raw.columns!==4||raw.rows!==4
    ||!raw.anchor||![raw.anchor.x,raw.anchor.y].every(value=>finite(value)&&value>=0&&value<=1)||!Array.isArray(raw.frames)||raw.frames.length!==16)invalid();
  for(let index=0;index<16;index++){
    const frame=raw.frames[index],column=index%4,row=Math.floor(index/4),x=Math.floor(column*raw.width/4),y=Math.floor(row*raw.height/4),width=Math.floor((column+1)*raw.width/4)-x,height=Math.floor((row+1)*raw.height/4)-y,rect=frame?.rect,bounds=frame?.alphaBounds;
    if(frame?.index!==index||!rect||rect.x!==x||rect.y!==y||rect.width!==width||rect.height!==height||frame.clipped!==false
      ||!Number.isInteger(frame.borderAlphaMax)||frame.borderAlphaMax<0||frame.borderAlphaMax>=8||!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isInteger)
      ||!positive(bounds.width)||!positive(bounds.height)||bounds.x<=0||bounds.y<=0||bounds.x+bounds.width>=width||bounds.y+bounds.height>=height)invalid();
  }
  return freeze(JSON.parse(JSON.stringify(raw)));
}

const BOUNDS=[[110,140,94,78],[72,104,165,136],[40,81,215,188],[20,32,272,260],[22,22,273,266],[19,12,277,285],[10,10,293,296],[4,4,306,305],[23,6,278,296],[17,4,286,293],[18,1,275,300],[17,11,263,288],[33,16,258,261],[45,20,235,258],[51,35,220,226],[70,42,198,212]];
const BORDERS=[1,1,1,3,1,1,2,4,1,2,2,2,1,1,1,1];
export const EXPLOSION_ATLAS=validateExplosionAtlas({
  format:'imagegen-explosion-atlas',version:1,source:{kind:'image_gen',isMeshyGLB:false,sha256:'8dc57e3e099c12f2f3d953f11b5d606f8ce461dda547c16396a8ea4e76193fb4'},
  width:1254,height:1254,columns:4,rows:4,anchor:{x:.5,y:.57},
  frames:BOUNDS.map(([x,y,width,height],index)=>{
    const column=index%4,row=Math.floor(index/4),sx=Math.floor(column*1254/4),sy=Math.floor(row*1254/4);
    return{index,rect:{x:sx,y:sy,width:Math.floor((column+1)*1254/4)-sx,height:Math.floor((row+1)*1254/4)-sy},alphaBounds:{x,y,width,height},clipped:false,borderAlphaMax:BORDERS[index]};
  }),
});

export function explosionFrame(metadata,life,maxLife){
  const elapsed=finite(life)&&positive(maxLife)?Math.min(1,Math.max(0,(maxLife-life)/maxLife)):0;
  return metadata.frames[Math.min(metadata.frames.length-1,Math.floor(elapsed*metadata.frames.length+1e-9))];
}

export class ExplosionArt{
  constructor({ImageCtor=globalThis.Image,url=new URL('./assets/vfx/explosion-8dc57e3e099c.png',import.meta.url).href,metadata=EXPLOSION_ATLAS,timeoutMs=10000}={}){
    this.ImageCtor=ImageCtor;this.url=url;this.metadata=validateExplosionAtlas(metadata);this.timeoutMs=positive(timeoutMs)?timeoutMs:10000;
    this.status='idle';this.image=null;this.promise=null;this.error=null;
  }
  load({retry=false}={}){
    if(this.promise&&!(retry&&this.status==='failed'))return this.promise;
    this.status='loading';this.error=null;
    this.promise=new Promise(resolve=>{
      let image,timer,settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(image){image.onload=null;image.onerror=null;}this.status=error?'failed':'ready';this.image=error?null:image;this.error=error||null;resolve(!error);};
      try{
        if(typeof this.ImageCtor!=='function'){finish('image-loader-unavailable');return;}
        image=new this.ImageCtor();image.crossOrigin='anonymous';image.decoding='async';
        image.onload=()=>finish(image.naturalWidth===this.metadata.width&&image.naturalHeight===this.metadata.height?null:'explosion-atlas-dimensions-mismatch');
        image.onerror=()=>finish('explosion-atlas-image-failed');timer=setTimeout(()=>finish('explosion-atlas-timeout'),this.timeoutMs);image.src=this.url;
      }catch{finish('explosion-atlas-image-failed');}
    });
    return this.promise;
  }
  drawBurst(context,particle){
    if(!context||typeof context.drawImage!=='function'||particle?.kind!=='shockwave'||![particle.x,particle.y].every(finite)||!positive(particle.radius)||!positive(particle.life)||!positive(particle.maxLife))return false;
    if(this.status!=='ready'){void this.load();return false;}
    const frame=explosionFrame(this.metadata,particle.life,particle.maxLife),rect=frame.rect,center=project(particle.x,particle.y,20);
    // One common pixel scale preserves the source's impact/fireball/smoke growth.
    const scale=Math.min(180,particle.radius*1.2)/(this.metadata.width/4);
    let saved=false;
    try{
      context.save();saved=true;context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
      context.drawImage(this.image,rect.x,rect.y,rect.width,rect.height,center.x-rect.width*this.metadata.anchor.x*scale,center.y-rect.height*this.metadata.anchor.y*scale,rect.width*scale,rect.height*scale);
      return true;
    }catch{return false;}
    finally{if(saved)context.restore();}
  }
}

// One optional image_gen VFX decode; no effect records, timers, or game writes.
export const explosionArt=new ExplosionArt();
