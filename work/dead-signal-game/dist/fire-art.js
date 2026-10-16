import {project} from './projection.js?v=0.29.0';

const finite=Number.isFinite,positive=value=>finite(value)&&value>0;
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const FIRE_CLUSTER_OFFSETS=freeze([[0,0],...Array.from({length:8},(_,index)=>[Math.cos(index*Math.PI/4),Math.sin(index*Math.PI/4)])]);

export function validateFireAtlas(raw){
  const invalid=()=>{throw new Error('invalid-fire-atlas');};
  if(!raw||raw.format!=='imagegen-ground-fire-atlas'||raw.version!==1||raw.source?.kind!=='image_gen'||raw.source.isMeshyGLB!==false
    ||typeof raw.source.sha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.source.sha256)
    ||!Number.isInteger(raw.width)||!Number.isInteger(raw.height)||raw.width<4||raw.height<4||raw.width>2048||raw.height>2048
    ||raw.columns!==4||raw.rows!==4||!positive(raw.fps)||raw.fps>30||!Array.isArray(raw.frames)||raw.frames.length!==16)invalid();
  for(let index=0;index<16;index++){
    const frame=raw.frames[index],column=index%4,row=Math.floor(index/4),x=Math.floor(column*raw.width/4),y=Math.floor(row*raw.height/4),width=Math.floor((column+1)*raw.width/4)-x,height=Math.floor((row+1)*raw.height/4)-y;
    const rect=frame?.rect,bounds=frame?.alphaBounds,pivot=frame?.footPivot;
    if(frame?.index!==index||!rect||rect.x!==x||rect.y!==y||rect.width!==width||rect.height!==height||frame.clipped!==false
      ||!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isInteger)||!positive(bounds.width)||!positive(bounds.height)
      ||bounds.x<0||bounds.y<0||bounds.x+bounds.width>width||bounds.y+bounds.height>height
      ||!pivot||!finite(pivot.x)||!finite(pivot.y)||pivot.x<bounds.x||pivot.x>bounds.x+bounds.width||pivot.y!==bounds.y+bounds.height)invalid();
  }
  return freeze(JSON.parse(JSON.stringify(raw)));
}

export const FIRE_ATLAS=validateFireAtlas({
  "format": "imagegen-ground-fire-atlas",
  "version": 1,
  "source": {
    "kind": "image_gen",
    "sha256": "30ee21bfc149380e1c56c519f3acd119dc19d5f6d29ddb9c2288207e3bc3237b",
    "moodboard": "35-mission-08-mid-boss.png",
    "isMeshyGLB": false
  },
  "width": 1254,
  "height": 1254,
  "columns": 4,
  "rows": 4,
  "fps": 16,
  "frames": [
    {
      "index": 0,
      "rect": {
        "x": 0,
        "y": 0,
        "width": 313,
        "height": 313
      },
      "alphaBounds": {
        "x": 47,
        "y": 92,
        "width": 225,
        "height": 174
      },
      "footPivot": {
        "x": 154.634301,
        "y": 266
      },
      "clipped": false
    },
    {
      "index": 1,
      "rect": {
        "x": 313,
        "y": 0,
        "width": 314,
        "height": 313
      },
      "alphaBounds": {
        "x": 46,
        "y": 98,
        "width": 229,
        "height": 168
      },
      "footPivot": {
        "x": 157.002594,
        "y": 266
      },
      "clipped": false
    },
    {
      "index": 2,
      "rect": {
        "x": 627,
        "y": 0,
        "width": 313,
        "height": 313
      },
      "alphaBounds": {
        "x": 47,
        "y": 106,
        "width": 227,
        "height": 161
      },
      "footPivot": {
        "x": 155.048038,
        "y": 267
      },
      "clipped": false
    },
    {
      "index": 3,
      "rect": {
        "x": 940,
        "y": 0,
        "width": 314,
        "height": 313
      },
      "alphaBounds": {
        "x": 43,
        "y": 97,
        "width": 227,
        "height": 169
      },
      "footPivot": {
        "x": 156.136797,
        "y": 266
      },
      "clipped": false
    },
    {
      "index": 4,
      "rect": {
        "x": 0,
        "y": 313,
        "width": 313,
        "height": 314
      },
      "alphaBounds": {
        "x": 45,
        "y": 70,
        "width": 230,
        "height": 196
      },
      "footPivot": {
        "x": 155.091919,
        "y": 266
      },
      "clipped": false
    },
    {
      "index": 5,
      "rect": {
        "x": 313,
        "y": 313,
        "width": 314,
        "height": 314
      },
      "alphaBounds": {
        "x": 43,
        "y": 67,
        "width": 231,
        "height": 199
      },
      "footPivot": {
        "x": 154.630312,
        "y": 266
      },
      "clipped": false
    },
    {
      "index": 6,
      "rect": {
        "x": 627,
        "y": 313,
        "width": 313,
        "height": 314
      },
      "alphaBounds": {
        "x": 43,
        "y": 62,
        "width": 232,
        "height": 204
      },
      "footPivot": {
        "x": 153.713668,
        "y": 266
      },
      "clipped": false
    },
    {
      "index": 7,
      "rect": {
        "x": 940,
        "y": 313,
        "width": 314,
        "height": 314
      },
      "alphaBounds": {
        "x": 41,
        "y": 50,
        "width": 235,
        "height": 217
      },
      "footPivot": {
        "x": 154.345075,
        "y": 267
      },
      "clipped": false
    },
    {
      "index": 8,
      "rect": {
        "x": 0,
        "y": 627,
        "width": 313,
        "height": 313
      },
      "alphaBounds": {
        "x": 44,
        "y": 44,
        "width": 232,
        "height": 223
      },
      "footPivot": {
        "x": 155.014775,
        "y": 267
      },
      "clipped": false
    },
    {
      "index": 9,
      "rect": {
        "x": 313,
        "y": 627,
        "width": 314,
        "height": 313
      },
      "alphaBounds": {
        "x": 49,
        "y": 42,
        "width": 228,
        "height": 226
      },
      "footPivot": {
        "x": 154.849574,
        "y": 268
      },
      "clipped": false
    },
    {
      "index": 10,
      "rect": {
        "x": 627,
        "y": 627,
        "width": 313,
        "height": 313
      },
      "alphaBounds": {
        "x": 41,
        "y": 70,
        "width": 232,
        "height": 197
      },
      "footPivot": {
        "x": 152.822929,
        "y": 267
      },
      "clipped": false
    },
    {
      "index": 11,
      "rect": {
        "x": 940,
        "y": 627,
        "width": 314,
        "height": 313
      },
      "alphaBounds": {
        "x": 44,
        "y": 91,
        "width": 232,
        "height": 176
      },
      "footPivot": {
        "x": 154.714409,
        "y": 267
      },
      "clipped": false
    },
    {
      "index": 12,
      "rect": {
        "x": 0,
        "y": 940,
        "width": 313,
        "height": 314
      },
      "alphaBounds": {
        "x": 46,
        "y": 79,
        "width": 228,
        "height": 187
      },
      "footPivot": {
        "x": 155.796832,
        "y": 266
      },
      "clipped": false
    },
    {
      "index": 13,
      "rect": {
        "x": 313,
        "y": 940,
        "width": 314,
        "height": 314
      },
      "alphaBounds": {
        "x": 47,
        "y": 74,
        "width": 228,
        "height": 192
      },
      "footPivot": {
        "x": 157.655556,
        "y": 266
      },
      "clipped": false
    },
    {
      "index": 14,
      "rect": {
        "x": 627,
        "y": 940,
        "width": 313,
        "height": 314
      },
      "alphaBounds": {
        "x": 46,
        "y": 83,
        "width": 227,
        "height": 182
      },
      "footPivot": {
        "x": 155.709307,
        "y": 265
      },
      "clipped": false
    },
    {
      "index": 15,
      "rect": {
        "x": 940,
        "y": 940,
        "width": 314,
        "height": 314
      },
      "alphaBounds": {
        "x": 47,
        "y": 86,
        "width": 223,
        "height": 179
      },
      "footPivot": {
        "x": 156.789442,
        "y": 265
      },
      "clipped": false
    }
  ]
});

export function fireFrame(metadata,timeSeconds=0,phase=0){
  const duration=metadata.frames.length/metadata.fps,time=finite(timeSeconds)?Math.max(0,timeSeconds)%duration:0;
  const offset=finite(phase)?Math.trunc(phase)%metadata.frames.length:0;
  return metadata.frames[(Math.floor(time*metadata.fps)+offset+metadata.frames.length)%metadata.frames.length];
}

export class FireArt{
  constructor({ImageCtor=globalThis.Image,url=new URL('./assets/vfx/ground-fire-30ee21bfc149.png',import.meta.url).href,metadata=FIRE_ATLAS,timeoutMs=10000}={}){
    this.ImageCtor=ImageCtor;this.url=url;this.metadata=validateFireAtlas(metadata);this.timeoutMs=positive(timeoutMs)?timeoutMs:10000;
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
        image.onload=()=>finish(image.naturalWidth===this.metadata.width&&image.naturalHeight===this.metadata.height?null:'fire-atlas-dimensions-mismatch');
        image.onerror=()=>finish('fire-atlas-image-failed');timer=setTimeout(()=>finish('fire-atlas-timeout'),this.timeoutMs);image.src=this.url;
      }catch{finish('fire-atlas-image-failed');}
    });
    return this.promise;
  }
  drawClusters(context,{x,y,r,age=0,alpha=1,clusterWidth=44}={}){
    if(!context||typeof context.drawImage!=='function'||!finite(x)||!finite(y)||!positive(r)||!positive(clusterWidth)||!positive(alpha))return false;
    if(this.status!=='ready'){void this.load();return false;}
    const width=Math.min(44,clusterWidth,r*.48);
    const clusters=FIRE_CLUSTER_OFFSETS.map(([dx,dy],index)=>({index,foot:project(x+dx*r*.48,y+dy*r*.48)})).sort((a,b)=>a.foot.y-b.foot.y||a.index-b.index);
    let saved=false,drawn=0;
    try{
      context.save();saved=true;context.globalAlpha*=Math.min(1,alpha);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
      for(const cluster of clusters){
        const frame=fireFrame(this.metadata,age,cluster.index*3),rect=frame.rect,scale=width/frame.alphaBounds.width;
        context.drawImage(this.image,rect.x,rect.y,rect.width,rect.height,cluster.foot.x-frame.footPivot.x*scale,cluster.foot.y-frame.footPivot.y*scale,rect.width*scale,rect.height*scale);drawn++;
      }
      return true;
    }catch{return drawn>0;}
    finally{if(saved)context.restore();}
  }
}

// One optional image_gen VFX decode shared by every renderer. No asset is
// represented as a Meshy model, gameplay entity or required save dependency.
export const groundFireArt=new FireArt();
