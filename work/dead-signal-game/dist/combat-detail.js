import {project} from './projection.js?v=0.29.0';
import {supportedGround} from './sea-art.js';
const clamp=n=>Math.max(0,Math.min(1,n));
export function organicSprayDroplet(p,index,count,out={}){
 const duration=Math.max(.001,p.maxLife),age=clamp(1-p.life/duration),seconds=age*duration;
 const angle=(p.angle||0)+(index/Math.max(1,count-1)-.5)*1.8;
 const speed=(90+(index*11%27)*4)*(p.weapon==='shotgun'?1.2:1),vx=Math.cos(angle)*speed,vy=Math.sin(angle)*speed;
 const z=Number.isFinite(p.z)?Math.max(0,p.z):22,vz=-15+(index*17%47),gravity=520,drag=3.1;
 const landing=(vz+Math.sqrt(vz*vz+2*gravity*z))/gravity;
 const t=Math.min(seconds,landing),previous=Math.min(Math.max(0,seconds-.012),landing),travel=-Math.expm1(-drag*t)/drag,oldTravel=-Math.expm1(-drag*previous)/drag;
 out.x=p.x+vx*travel;out.y=p.y+vy*travel;out.z=Math.max(0,z+vz*t-gravity*t*t*.5);
 out.tail??={};out.tail.x=p.x+vx*oldTravel;out.tail.y=p.y+vy*oldTravel;out.tail.z=Math.max(0,z+vz*previous-gravity*previous*previous*.5);
 out.age=age;out.landed=seconds>=landing;out.landing=landing;out.radius=(1.1+(index%3)*.45)*(1-age*.4);return out;
}
export function drawOrganicSpray(c,p,world=null){
 if(p.shielded||p.surface||p.kind!=='weapon-impact'||!(p.life>0))return false;
 const n=p.lethal?12:p.weapon==='shotgun'?9:5,drop={tail:{}};
 c.save();try{c.globalCompositeOperation='source-over';
 for(let i=0;i<n;i++){organicSprayDroplet(p,i,n,drop);if(drop.landed&&world&&!supportedGround(world,drop.x,drop.y))continue;const q=project(drop.x,drop.y,drop.z),tail=project(drop.tail.x,drop.tail.y,drop.tail.z),angle=Math.atan2(q.y-tail.y,q.x-tail.x);
  c.globalAlpha=Math.pow(1-drop.age,1.2)*.8;c.fillStyle=c.strokeStyle=i%3?'#903c35':'#562a28';
  if(!drop.landed&&Math.hypot(q.x-tail.x,q.y-tail.y)>.3){c.lineWidth=drop.radius*.7;c.beginPath();c.moveTo(tail.x,tail.y);c.lineTo(q.x,q.y);c.stroke();}
  c.beginPath();c.ellipse(q.x,q.y,drop.radius*(drop.landed?1.35:1),drop.landed?drop.radius*.4:.8+(i%2)*.6,drop.landed?0:angle,0,Math.PI*2);c.fill();}return true;}finally{c.restore();}
}
export function drawMolotovTrail(c,item){
 if(!item.released||item.fallElapsed!==undefined)return false;
 const progress=clamp((item.elapsed-item.release)/item.flightDuration);if(progress<=0)return false;
 c.save();try{
 for(let i=10;i>=1;i--){const t=Math.max(0,progress-i*.009),h=34*(1-t)+216*t*(1-t),q=project(item.startX+(item.targetX-item.startX)*t,item.startY+(item.targetY-item.startY)*t,h),age=i/10;c.globalCompositeOperation='source-over';c.globalAlpha=(1-age)*.16;c.fillStyle='#51483e';c.beginPath();c.ellipse(q.x,q.y-5-age*7,1+age*3,2+age*4,0,0,Math.PI*2);c.fill();c.globalCompositeOperation='lighter';c.globalAlpha=(1-age)*.55;c.strokeStyle=i%2?'#ffb64e':'#ffe1a0';c.lineWidth=.8;c.beginPath();c.moveTo(q.x,q.y-4);c.lineTo(q.x+Math.sin(item.elapsed*42+i)*2,q.y-7-age*3);c.stroke();}return true;
 }finally{c.restore();}
}
