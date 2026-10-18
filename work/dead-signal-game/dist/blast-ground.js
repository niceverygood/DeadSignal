import {project} from './projection.js?v=0.29.0';
import {clipGround,supportedGround} from './sea-art.js';
const clamp=n=>Math.max(0,Math.min(1,n));
export function blastGroundEnvelope(p){const age=clamp(1-p.life/Math.max(.001,p.maxLife)),radius=Math.max(0,Number.isFinite(p.radius)?p.radius:80);return {age,radius:5+radius*(1-Math.pow(1-age,1.4)),pressure:Math.pow(1-age,1.6),dust:Math.sin(Math.PI*age)*.22};}
export function drawBlastGround(c,p,world){
 if(p.kind!=='shockwave'||!(p.life>0))return false;const e=blastGroundEnvelope(p),center=project(p.x,p.y,1);
 c.save();try{if(world?.rooftop||world?.water)clipGround(c,world);
 c.strokeStyle=p.color||'#ffc06b';c.globalAlpha=e.pressure;c.lineWidth=1+(1-e.age)*3;c.beginPath();c.ellipse(center.x,center.y,e.radius*Math.sqrt(1.5),e.radius/Math.sqrt(2),0,0,Math.PI*2);c.stroke();
 c.strokeStyle='#f8d6a2';c.globalAlpha=e.pressure*.35;c.lineWidth=5*(1-e.age)+1;c.beginPath();c.ellipse(center.x,center.y,e.radius*.91*Math.sqrt(1.5),e.radius*.91/Math.sqrt(2),0,0,Math.PI*2);c.stroke();
 // Eight low dust lobes on the pressure front, grounded in world coordinates.
 for(let i=0;i<8;i++){const a=i*Math.PI/4+.17,x=p.x+Math.cos(a)*e.radius*.82,y=p.y+Math.sin(a)*e.radius*.82;if(world&&!supportedGround(world,x,y))continue;const q=project(x,y,2),r=(5+e.age*14)*(1+(i%3)*.12);c.globalAlpha=e.dust;c.fillStyle=i%2?'#bca584':'#796e5b';c.beginPath();c.ellipse(q.x,q.y,r*1.4,r*.65,0,0,Math.PI*2);c.fill();}return true;
 }finally{c.restore();}
}
