import {project} from './projection.js?v=0.29.0';
export class ImpactMarks {
 constructor(limit=48){this.limit=limit;this.items=[];this.seen=new WeakSet();this.world=null;this.time=0;}
 observe(game){
  const incoming=game.time||0;
  if(this.world!==game.world||incoming<this.time-.1){this.time=incoming;this.world=game.world;this.items=[];this.seen=new WeakSet();this.obstacles=new Map((game.world.obstacles||[]).map(o=>['wall-'+o.id,o]));}
  this.time=Math.max(this.time,incoming);const time=this.time;this.items=this.items.filter(m=>time-m.born<2.4&&!m.obstacle?.destroyed);
  for(const p of game.particles||[]){
   if(p.kind!=='weapon-impact'||this.seen.has(p)||!(p.life>0))continue;this.seen.add(p);
   if(p.surface&&!['metal','concrete'].includes(p.surface)||!p.surface&&p.shielded)continue;
   const obstacle=p.surface?this.obstacles.get(p.targetId):null;if(p.surface&&(!obstacle||obstacle.destroyed))continue;
   let face=null;if(obstacle){const distances=[Math.abs(p.x-obstacle.x),Math.abs(p.x-obstacle.x-obstacle.w),Math.abs(p.y-obstacle.y),Math.abs(p.y-obstacle.y-obstacle.h)];const index=distances.indexOf(Math.min(...distances));if(index===0||index===2)continue;face=index===1?'x':'y';}
   this.items.push({x:obstacle?Math.min(obstacle.x+obstacle.w,Math.max(obstacle.x,p.x)):p.x,y:obstacle?Math.min(obstacle.y+obstacle.h,Math.max(obstacle.y,p.y)):p.y,z:p.z||22,angle:p.angle||0,weapon:p.weapon,surface:p.surface,lethal:p.lethal,hits:p.hits||1,born:time-Math.max(0,p.maxLife-p.life),obstacle,face});
  }
  if(this.items.length>this.limit)this.items.splice(0,this.items.length-this.limit);
 }
 alpha(mark){return Math.max(0,Math.min(1,(2.4-this.time+mark.born)/.65))*.85;}
 drawGround(c,visible=()=>true){
  c.save();try{c.globalCompositeOperation='source-over';for(const m of this.items){if(m.surface||!visible(m.x,m.y,40))continue;const q=project(m.x,m.y,1),r=m.lethal?6.5:m.weapon==='shotgun'?4.8:2.8;c.save();c.translate(q.x,q.y);c.globalAlpha*=this.alpha(m);c.fillStyle='#602a28';for(let i=0;i<5;i++){c.beginPath();c.ellipse((i*7%11)-5,(i*3%5)-2,r*(i? .23:1),r*(i?.12:.45),m.angle+i*.6,0,Math.PI*2);c.fill();}c.restore();}}finally{c.restore();}
 }
 drawSurface(c,obstacle){
  if(obstacle.destroyed)return;c.save();try{c.globalCompositeOperation='source-over';for(const m of this.items){if(m.obstacle!==obstacle)continue;const q=project(m.x,m.y,m.z),t=project(m.face==='y'?1:0,m.face==='x'?1:0),r=(m.weapon==='shotgun'?4.8:2.8)*(1+Math.min(4,m.hits)*.08);c.save();c.transform(t.x,t.y,0,-1,q.x,q.y);const start=m.face==='x'?obstacle.y-m.y:obstacle.x-m.x,width=m.face==='x'?obstacle.h:obstacle.w,height=obstacle.height||({car:27,barrel:25,fence:42}[obstacle.kind]||95);c.beginPath();c.rect(start,-m.z,width,height);c.clip();c.globalAlpha*=this.alpha(m);c.strokeStyle=m.surface==='metal'?'#bdc0ad':'#aaa08d';c.lineWidth=.7;c.fillStyle='#10191b';c.beginPath();c.ellipse(0,0,r,r*.7,0,0,Math.PI*2);c.fill();c.stroke();for(let i=0;i<3;i++){const a=i*2.1+m.angle;c.beginPath();c.moveTo(Math.cos(a)*r*.7,Math.sin(a)*r*.4);c.lineTo(Math.cos(a)*r*1.7,Math.sin(a)*r*1.2);c.stroke();}c.restore();}}finally{c.restore();}
 }
}
