const hash=n=>{const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
// Cached ground-only fuel/scorch; original flame sprites remain separate.
export class FireGround {
 constructor(createCanvas=()=>document.createElement('canvas'),limit=16){this.createCanvas=createCanvas;this.limit=limit;this.cache=new Map();this.burns=new Map();this.world=null;}
 footprint(fire){
  const key=[fire.x,fire.y,fire.r].join(':');if(this.cache.has(key))return this.cache.get(key);
  const seed=fire.x*.31+fire.y*.73+fire.r,make=()=>{const image=this.createCanvas();image.width=320;image.height=200;const c=image.getContext('2d');c.setTransform(150,0,0,86.60254,160,100);return {image,c};},scorch=make(),light=make();
  for(const {c} of [scorch,light]){c.beginPath();for(let i=0;i<32;i++){const a=i*Math.PI/16,r=.72+hash(seed+i)*.24,x=Math.cos(a)*r,y=Math.sin(a)*r;i?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();c.clip();}
  const dark=scorch.c.createRadialGradient(0,0,.08,0,0,1);dark.addColorStop(0,'rgba(12,17,19,.34)');dark.addColorStop(.62,'rgba(22,18,15,.29)');dark.addColorStop(1,'rgba(22,18,15,0)');scorch.c.fillStyle=dark;scorch.c.fillRect(-1,-1,2,2);
  for(let i=0;i<14;i++){const a=hash(seed+i+80)*Math.PI*2,d=Math.sqrt(hash(seed+i+120))*.72,x=Math.cos(a)*d,y=Math.sin(a)*d,r=.1+hash(seed+i+160)*.19;for(const [layer,inner,outer]of [[scorch,'rgba(14,18,20,.24)','rgba(14,18,20,0)'],[light,'rgba(255,129,38,.24)','rgba(230,71,20,0)']]){const g=layer.c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,inner);g.addColorStop(1,outer);layer.c.fillStyle=g;layer.c.fillRect(x-r,y-r,r*2,r*2);}}
  const result={scorch:scorch.image,light:light.image};this.cache.set(key,result);if(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value);return result;
 }
 observe(game){
  if(this.world!==game.world){this.world=game.world;this.burns.clear();}
  const active=new Set(),time=game.time||0;
  for(const fire of game.fires||[]){const key=[fire.x,fire.y,fire.r].join(':');active.add(key);let mark=this.burns.get(key);if(!mark){mark={x:fire.x,y:fire.y,r:fire.r,ended:null};this.burns.set(key,mark);}mark.ended=null;}
  for(const [key,mark]of this.burns){if(!active.has(key)&&mark.ended===null)mark.ended=time;if(mark.ended!==null&&time-mark.ended>=10)this.burns.delete(key);}
  while(this.burns.size>12)this.burns.delete(this.burns.keys().next().value);
 }
 drawResidues(c,project,visible=()=>true,time=0){for(const mark of this.burns.values())if(mark.ended!==null&&visible(mark.x,mark.y,mark.r)){const alpha=Math.max(0,1-(time-mark.ended)/10),p=project(mark.x,mark.y),r=mark.r,w=r*Math.sqrt(1.5)*320/150,h=r/Math.sqrt(2)*200/86.60254;c.save();c.globalAlpha*=alpha*alpha*(3-2*alpha);c.drawImage(this.footprint(mark).scorch,p.x-w/2,p.y-h/2,w,h);c.restore();}}
 draw(c,fire,p,age,{motion=true,heat=1}={}){
  const image=this.footprint(fire),r=fire.r,w=r*Math.sqrt(1.5)*320/150,h=r/Math.sqrt(2)*200/86.60254;
  c.drawImage(image.scorch,p.x-w/2,p.y-h/2,w,h);c.save();c.globalAlpha*=heat*(motion?.78+.22*Math.sin(age*11+fire.x*.03)**2:1);c.drawImage(image.light,p.x-w/2,p.y-h/2,w,h);c.restore();
 }
}
