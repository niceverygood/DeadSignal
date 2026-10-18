import {project} from './projection.js?v=0.29.0';
import {inWater} from './sea-world.js';import {roofSupports} from './rooftop-world.js';
export const supportedGround=(world,x,y)=>(!world?.rooftop||roofSupports(world,x,y,0))&&!inWater(world,x,y);
function rectanglePath(c,r){const corners=[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]].map(([x,y])=>project(x,y));for(let i=0;i<corners.length;i++)i?c.lineTo(corners[i].x,corners[i].y):c.moveTo(corners[i].x,corners[i].y);c.closePath();}
export function clipGround(c,world){
 c.beginPath();if(world.rooftop){for(const r of world.rooftop.platforms)rectanglePath(c,r);c.clip();}
 else{rectanglePath(c,{x:0,y:0,w:world.width,h:world.height});for(const r of world.water||[])rectanglePath(c,r);c.clip('evenodd');}
}
export function drawSeaWater(c,world,time,motion=true){
 if(!world?.water)return false;c.save();
 try{for(const r of world.water){c.save();c.beginPath();rectanglePath(c,r);c.fillStyle='#102d38';c.fill();c.clip();
  c.strokeStyle='#76aab4';c.lineWidth=1.2;c.globalAlpha=.18;
  const phase=motion?time*11:0;
  for(let row=0;row<r.h/34;row++){c.beginPath();for(let col=0;col<=8;col++){const x=r.x+r.w*col/8,y=r.y+row*34+Math.sin(col*.9+row+phase*.025)*7+(phase%34),p=project(x,y);col?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);}c.stroke();}
  c.restore();c.beginPath();rectanglePath(c,r);c.strokeStyle='#5d858c';c.lineWidth=1.3;c.globalAlpha=.65;c.stroke();
 }return true;}finally{c.restore();}
}
