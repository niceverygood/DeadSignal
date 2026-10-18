import {project} from './projection.js?v=0.29.0';
// Ephemeral visual metadata: never serialized, never consumes simulation RNG.
const contacts=new WeakMap();
export function recordDamageContact(player,time,source){
 contacts.delete(player);
 if(!source||!Number.isFinite(source.x)||!Number.isFinite(source.y))return;
 const dx=source.x-player.x,dy=source.y-player.y;if(Math.hypot(dx,dy)<.001)return;
 const q=project(dx,dy),length=Math.hypot(q.x,q.y);contacts.set(player,{time,x:q.x/length,y:q.y/length});
}
export function damageContact(player,time){
 let contact;for(let p=player;p&&!contact;p=Object.getPrototypeOf(p))contact=contacts.get(p);
 if(!contact)return null;const age=time-contact.time;if(age<-.02||age>=.65)return null;
 return {...contact,age:Math.max(0,age),alpha:Math.pow(1-Math.max(0,age)/.65,1.5)};
}
export function drawDamageContact(c,game,width,height){
 const hit=damageContact(game.player,game.time);if(!hit)return false;
 const radius=Math.min(width,height)*.30,x=width/2+hit.x*radius,y=height/2+hit.y*radius,a=Math.atan2(hit.y,hit.x);
 c.save();try{c.translate(x,y);c.rotate(a);c.globalAlpha=hit.alpha*.9;c.strokeStyle='#f18a75';c.lineWidth=3;c.lineCap='round';c.beginPath();c.moveTo(-7,-13);c.lineTo(0,0);c.lineTo(-7,13);c.stroke();c.globalAlpha=hit.alpha*.3;c.lineWidth=7;c.stroke();return true;}finally{c.restore();}
}
