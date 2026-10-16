import {getBoss} from './campaign.js?v=0.26.0';

const INK='#142b34';
const num=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const paletteCache=new WeakMap();
const PROFILES={
  charge:{mid:[44,80,21],final:[53,102,32]},
  slam:{mid:[48,84,23],final:[59,113,34]},
  summon:{mid:[39,89,21],final:[48,129,29]},
  spit:{mid:[37,83,22],final:[47,111,32]},
  shield:{mid:[43,86,23],final:[59,109,35]},
  leap:{mid:[40,77,20],final:[57,106,30]},
  beam:{mid:[44,92,23],final:[53,130,31]},
  fire:{mid:[40,88,23],final:[54,114,35]},
  mine:{mid:[43,86,23],final:[54,109,33]},
  pull:{mid:[48,90,23],final:[62,120,33]},
  spread:{mid:[46,91,25],final:[65,132,38]},
  storm:{mid:[44,96,23],final:[59,131,34]},
};

function shade(hex,amount){
  if(typeof hex!=='string'||!/^#[\da-f]{6}$/i.test(hex))return hex;
  const rgb=[1,3,5].map(at=>clamp(parseInt(hex.slice(at,at+2),16)+amount,0,255).toString(16).padStart(2,'0'));
  return '#'+rgb.join('');
}
function colors(boss){
  if(paletteCache.has(boss))return paletteCache.get(boss);
  const body=boss.palette?.body||'#687b71',accent=boss.palette?.accent||'#d9b66a',skin=boss.palette?.skin||'#b9b193';
  const value={body,accent,skin,dark:shade(body,-24),light:shade(body,24),metal:'#80938b',glass:'#244957',paper:'#d7d1b5'};
  paletteCache.set(boss,value);return value;
}
function poly(c,points,fill,stroke=INK,width=1.8,closed=true){
  c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);if(closed)c.closePath();
  if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}
}
function line(c,x1,y1,x2,y2,color,width=1.5){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function ellipse(c,x,y,rx,ry,fill,stroke=INK,width=1.6){
  c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}
}
function box(c,x,y,w,h,fill,stroke=INK,width=1.6){c.fillStyle=fill;c.fillRect(x,y,w,h);if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.strokeRect(x,y,w,h);}}
function rivets(c,x,y,count,spacing,color){for(let i=0;i<count;i++)ellipse(c,x+i*spacing,y,1.1,1.1,color,null);}
function helmet(c,x,y,w,p,visor=true){
  poly(c,[[x-w,y+1],[x-w*.8,y-8],[x-w*.25,y-12],[x+w*.5,y-10],[x+w,y-3],[x+w,y+2]],p.metal,INK,2);
  line(c,x-w-2,y+2,x+w+3,y+2,p.accent,2.7);
  if(visor)poly(c,[[x-w*.65,y+3],[x+w*.8,y+3],[x+w*.65,y+10],[x-w*.45,y+9]],p.glass,p.metal,1.1);
}
function spool(c,x,y,r,p){ellipse(c,x,y,r,r*.85,p.dark,p.metal,2);ellipse(c,x,y,r*.57,r*.48,p.accent,INK,1.5);ellipse(c,x,y,2.1,2.1,p.metal);}
function coil(c,x,y,height,p){
  line(c,x,y,x,y-height,p.metal,3.2);
  for(let at=4;at<height;at+=5)ellipse(c,x,y-at,6.5,2,p.accent,INK,1);
  ellipse(c,x,y-height-3,4,3,p.paper,INK,1.3);
}
function hand(c,x,y,p,r=4){ellipse(c,x,y,r,r*1.1,p.skin,INK,1.2);line(c,x-r*.5,y+1,x+r*.6,y+1,shade(p.skin,-25),.8);}
function drawHead(c,key,y,side,final,p){
  const r=final?10:7;ellipse(c,side*3,y,r,r+1,p.skin,INK,1.8);
  if(['hardhat','fire-helmet','riot-helmet','visor-helmet','protective-visor','eod-helmet'].includes(key)){
    helmet(c,side*2,y,final?13:key==='eod-helmet'?12:10,p,!['hardhat','fire-helmet'].includes(key));
    if(key==='hardhat'||key==='fire-helmet'){poly(c,[[-11,y-4],[-8,y-14],[7,y-14],[12,y-4]],p.accent,INK,1.6);line(c,0,y-13,0,y-4,p.paper,2);}
    if(key==='eod-helmet'){for(const x of [-13,12])box(c,x-4,y-8,8,23,p.body,INK,1.9);}
  }else if(key==='pressure-helmet'){
    ellipse(c,0,y-1,15,16,p.metal,INK,2.2);ellipse(c,side*3,y,9,10,p.glass,p.accent,1.8);for(const x of [-9,10])ellipse(c,x,y+9,2,2,p.paper,INK,.7);
  }else if(['welding-mask','parcel-mask','ammo-crate','furnace-grille','crusher-jaw'].includes(key)){
    const w=final?15:11;box(c,-w,y-15,w*2,29,p.metal,INK,2.3);
    box(c,-w+4,y-9,w*2-8,key==='furnace-grille'?17:7,p.glass,p.accent,1.3);
    if(key==='furnace-grille')for(const x of [-7,0,7])line(c,x,y-8,x,y+7,p.accent,2.4);
    else if(key==='crusher-jaw'){poly(c,[[-16,y+2],[-12,y+17],[12,y+17],[17,y+2]],p.dark,p.metal,2.3);for(let x=-10;x<12;x+=6)poly(c,[[x,y+3],[x+3,y+10],[x+5,y+3]],p.accent,INK,1);}
    else if(key==='parcel-mask'){line(c,-14,y+10,14,y+10,p.accent,2.3);line(c,0,y-14,0,y+10,p.accent,2);}
    else if(key==='ammo-crate'){rivets(c,-11,y+7,5,5,p.accent);line(c,-14,y-13,14,y-13,p.paper,2);}
  }else if(key==='lamp-lens'){
    ellipse(c,side*3,y,16,17,p.dark,p.metal,2.6);ellipse(c,side*3,y,12,12,p.accent,p.paper,1.7);ellipse(c,side*3,y,7,7,p.glass,p.paper,1.1);ellipse(c,side*3,y,3,3,p.paper,null);
    line(c,side*3-11,y,side*3+11,y,p.metal,.9);line(c,side*3,y-11,side*3,y+11,p.metal,.9);
  }else if(['cap','captain-hat','truck-cap','nurse-cap','bike-helmet'].includes(key)){
    if(key==='bike-helmet'){helmet(c,side*3,y,10,p,false);for(const x of [-5,1,7])line(c,x,y-8,x+2,y-3,p.dark,2);}
    else{poly(c,[[-11,y-3],[-7,y-12],[8,y-12],[12,y-3]],key==='nurse-cap'?p.paper:p.dark,INK,1.8);poly(c,[[-10,y-3],[side*17,y-2],[side*14,y+2],[-8,y+1]],p.metal,INK,1.3);if(key==='captain-hat'){ellipse(c,0,y-7,3,3,p.accent,INK,.7);line(c,-10,y-2,11,y-2,p.accent,2);}if(key==='nurse-cap'){line(c,0,y-10,0,y-4,p.accent,1.8);line(c,-3,y-7,3,y-7,p.accent,1.8);}}
  }else if(['gas-mask','filter-mask'].includes(key)){
    poly(c,[[-10,y-10],[9,y-10],[13,y+7],[0,y+12],[-11,y+5]],p.dark,INK,2);
    for(const x of [-4,7])ellipse(c,x,y-3,3.5,3.5,p.glass,p.paper,1);ellipse(c,side*3,y+7,5,5,p.metal,p.accent,1.2);
  }else if(['surgical-hood','rain-hood'].includes(key)){
    poly(c,[[-13,y+7],[-14,y-8],[-4,y-18],[9,y-16],[17,y-2],[13,y+10],[7,y+4],[7,y-7],[-4,y-8],[-7,y+3]],p.body,INK,2);
    if(key==='surgical-hood')box(c,-4,y+1,14,9,p.accent,INK,1.3);else line(c,-7,y-1,7,y-1,p.accent,1.4);
  }else if(key==='insulator-crown'){
    box(c,-13,y-5,28,10,p.glass,p.accent,1.2);for(const x of [-12,-6,0,6,12]){line(c,x,y-9,x,y-22,p.metal,2);for(const at of [-21,-17,-13])ellipse(c,x,y+at,3.5,1.3,p.accent,INK,.6);}
  }else if(key==='flower-crown'){
    for(let i=0;i<7;i++){const a=Math.PI+i*Math.PI/6,x=Math.cos(a)*16,yy=y+Math.sin(a)*16;poly(c,[[x-4,yy],[x,yy-10],[x+4,yy],[x,yy+5]],p.body,INK,1.2);ellipse(c,x,yy-1,2.3,3,p.accent,INK,.7);}
    ellipse(c,side*4,y+1,5,6,p.skin,INK,1.3);
  }
}

/** Bounds in the same upright projected coordinates used by the shared figure. */
export function bossBodyBounds(boss,e={}){
  const role=boss?.role==='final'?'final':'mid',profile=(PROFILES[boss?.family]||PROFILES.charge)[role];
  const reference=role==='final'?49:27;
  const scale=clamp(num(e.r,num(boss?.stats?.r,reference))/reference,.72,1.65);
  return{left:-profile[0]*scale,right:profile[0]*scale,top:-profile[1]*scale,bottom:16*scale,coreLeft:-profile[2]*scale,coreRight:profile[2]*scale,coreTop:-profile[1]*scale,coreBottom:0,scale};
}

/** Draw a local, upright full figure with its feet at (0,0); never advances play. */
export function drawBossBody(c,boss,e={},time=0,{shadow=true,effects=true,scale=null}={}){
  if(!c||!boss)return false;
  const p=colors(boss),final=boss.role==='final',family=boss.family||'charge',appearance=boss.appearance||{};
  const bounds=bossBodyBounds(boss,e),factor=Number.isFinite(scale)&&scale>0?scale:bounds.scale;
  const angle=num(e.angle,.35),dx=(Math.cos(angle)-Math.sin(angle))*Math.sqrt(3)/2,dy=(Math.cos(angle)+Math.sin(angle))*.5;
  const directionLength=Math.hypot(dx,dy)||1,dir={x:dx/directionLength,y:dy/directionLength},side=dir.x<0?-1:1;
  const gait=Math.sin(num(e.walkPhase,time*5))*(final?3.4:2.6),windup=e.attackState==='windup';
  const shoulder=final?-61:-43,waist=final?-25:-20,headY=shoulder-12,half=final?24:16;
  c.save();c.scale(factor,factor);c.lineJoin='round';c.lineCap='round';
  if(shadow)ellipse(c,3,3,final?39:26,final?12:8,'rgba(4,13,17,.5)',null);

  // Every family has a different back silhouette before the shared torso.
  if(family==='summon'){
    if(final){
      box(c,-18,-105,36,43,p.dark,p.metal,2.1);
      for(let y=-100;y<-66;y+=9){box(c,-13,y,26,6,p.body,INK,1);rivets(c,-10,y+3,4,6,p.accent);}
      for(const x of [-20,0,20]){line(c,x,-91,x,-119+(x===0?-3:6),p.metal,2.5);ellipse(c,x,-120+(x===0?-3:6),3,3,p.accent);}
      for(const x of [-26,25]){line(c,x,-83,x,-37,p.metal,3);line(c,x,-38,x+side*9,-38,p.metal,4);}
    }else{box(c,-23,-66,43,37,p.dark,p.metal,2);for(let x=-18;x<20;x+=7)line(c,x,-62,x,-33,p.metal,1.6);}
  }else if(family==='spit'||family==='fire'){
    const tankColor=family==='fire'?p.accent:p.light;
    for(const x of final?[-24,23]:[-side*16]){box(c,x-7,shoulder-4,14,final?43:29,tankColor,INK,2);ellipse(c,x,shoulder-4,7,4,p.metal);ellipse(c,x,shoulder+(final?39:25),7,3,p.dark);line(c,x-7,shoulder+8,x+7,shoulder+8,p.dark,3);}
    if(final&&family==='spit')for(const x of [-29,-15,15,29]){line(c,x*.55,-56,x,-89,p.metal,3.7);ellipse(c,x,-90,4,5,p.accent,INK,1.2);}
    if(!final&&family==='spit')for(const x of [-14,10]){box(c,x-5,-63,10,19,p.light,INK,1.2);box(c,x-3,-58,6,11,p.accent,null);line(c,x,-44,x+side*8,-24,p.metal,1.2);}
    if(final&&family==='fire'){box(c,-18,-99,36,38,p.dark,p.metal,2.5);for(const x of [-14,14])box(c,x-4,-109,8,24,p.metal,INK,2);}
  }else if(family==='beam'){
    line(c,-side*18,shoulder,-side*18,final?-119:-79,p.metal,5);
    if(final){
      for(const [x,y]of [[-24,-76],[0,-88],[24,-73]])coil(c,x,y,final?31:20,p);
      box(c,-24,-90,48,30,p.body,INK,2);for(const x of [-18,-6,6,18])line(c,x,-86,x,-65,p.metal,1.2);
    }else{box(c,-side*20-10,-70,20,40,p.dark,p.metal,2);for(const y of [-61,-51,-41])line(c,-side*20-7,y,-side*20+7,y,p.accent,1.4);}
  }else if(family==='storm'){
    if(final){
      poly(c,[[-22,-65],[-16,-116],[16,-116],[23,-65]],p.body,p.metal,2.4);for(const y of [-108,-90,-72])box(c,-17,y,34,9,p.paper,INK,1);box(c,-19,-119,38,18,p.dark,p.metal,2);ellipse(c,0,-112,9,7,p.accent,p.paper,1.2);poly(c,[[-22,-120],[0,-128],[23,-120]],p.metal,INK,1.8);
    }else{line(c,-side*19,-42,-side*19,-90,p.metal,3);for(const x of [-1,1]){line(c,-side*19,-87,-side*19+x*10,-83,p.metal,1.4);ellipse(c,-side*19+x*10,-82,4,2,p.accent,INK,1);}}
  }else if(family==='mine'){
    if(final){poly(c,[[-35,-64],[-28,-93],[25,-93],[34,-63],[23,-40],[-22,-40]],p.dark,p.metal,2.5);for(const x of [-19,0,19])spool(c,x,-76,9,p);}
    else{box(c,-side*18-8,-49,16,28,p.dark,INK,2);poly(c,[[-side*18-10,-52],[-side*18+10,-52],[-side*18+7,-44],[-side*18-7,-44]],p.metal);}
  }else if(family==='pull'){
    spool(c,-side*(final?29:19),final?-62:-44,final?17:12,p);
    if(final){box(c,-35,-109,70,15,p.dark,p.metal,3);for(const x of [-31,31])box(c,x-4,-94,8,53,p.metal,INK,2);line(c,-30,-80,30,-80,p.accent,3);}
  }else if(family==='spread'){
    const count=final?9:0,radius=43,cy=-68;
    for(let i=0;i<count;i++){const a=Math.PI+i*Math.PI/(count-1),x=Math.cos(a)*radius,y=cy+Math.sin(a)*radius;
      poly(c,[[x*.6,cy+(y-cy)*.55],[x-7,y-7],[x,y-16],[x+7,y-7],[x*.7,cy+(y-cy)*.7]],i%2?p.light:p.body,INK,1.7);
      ellipse(c,x,y-7,4,5,p.accent,INK,1.1);
    }
    if(!final){box(c,-side*19-8,-63,16,35,p.body,p.metal,2);ellipse(c,-side*19,-63,8,4,p.accent,INK,1.3);line(c,-side*19,-58,-side*19,-33,p.accent,1.5);}
  }else if(family==='leap'){
    for(const sign of final?[-1,1]:[]){
      const outer=final?46:27;
      poly(c,[[sign*12,shoulder-4],[sign*outer,shoulder-20],[sign*(outer+5),shoulder-5],[sign*(outer-3),shoulder+14],[sign*15,shoulder+6]],p.dark,p.metal,2);
      line(c,sign*outer,shoulder-15,sign*(outer-2),shoulder+9,p.accent,1.5);
    }
    if(!final){box(c,-23,-66,35,34,p.body,p.accent,2.4);box(c,-20,-63,29,10,p.dark,INK,1);for(const x of [-19,13])spool(c,x,-32,9,p);}
  }else if(family==='charge'&&final){
    poly(c,[[-36,-74],[-29,-85],[-18,-78],[-22,-55],[-36,-53]],p.metal,INK,2);
    poly(c,[[24,-75],[31,-87],[43,-77],[36,-55],[25,-54]],p.metal,INK,2);
    for(const x of [-24,24])line(c,x,-49,x*.7,-97,p.metal,4);line(c,-17,-96,17,-96,p.accent,3);
  }else if(family==='charge'){
    line(c,-side*18,-45,-side*18,-70,p.metal,2);ellipse(c,-side*18,-73,4,5,p.accent,INK,1.1);
  }else if(family==='slam'){
    if(final){box(c,-20,-101,40,53,p.dark,p.metal,2.2);ellipse(c,0,-101,20,8,p.metal,INK,2);for(const x of [-29,27]){line(c,x,-49,x,-94,p.metal,6);line(c,x,-94,x+side*7,-97,p.accent,4);}}
    else for(const x of [-19,16]){line(c,x,-37,x,-68,p.metal,4);line(c,x,-68,x+side*8,-70,p.metal,4);}
  }else if(family==='shield'){
    box(c,-side*19-6,shoulder-5,12,25,p.dark,p.metal,1.7);ellipse(c,-side*19,shoulder-1,2.3,2.3,p.accent,INK,.7);
    if(final)for(const x of [-23,0,23]){box(c,x-6,-80,12,14,p.metal,INK,1.3);ellipse(c,x,-80,5,4,x===0?p.accent:'#c07669',INK,1.2);}
  }

  // Extra mechanical limbs belong to the catalog, rather than a color swap.
  const extraArms=clamp(Math.floor(num(appearance.arms,2))-2,0,4),extraLegs=clamp(Math.floor(num(appearance.legs,2))-2,0,2);
  for(let i=0;i<extraArms;i++){
    const sign=i%2?1:-1,row=Math.floor(i/2),start=shoulder+9+row*13,extent=half+17+row*8;
    poly(c,[[sign*(half-4),start],[sign*extent,start-9],[sign*(extent+3),start+8],[sign*(extent-5),waist+3+row*2],[sign*(extent-12),waist-1],[sign*(extent-9),start+8],[sign*(half-3),start+10]],p.dark,p.metal,2.1);
    if(['slam','charge','pull'].includes(family))box(c,sign*(extent-3)-6,waist-2,12,13,p.metal,INK,1.5);
    else if(['beam','storm'].includes(family))line(c,sign*(extent-4),waist+2,sign*(extent+4),start-14,p.accent,2.7);
    else if(family==='summon')poly(c,[[sign*extent,start],[sign*(extent+15),start+3],[sign*extent,start+15]],p.accent,INK,1.3);
  }
  for(let i=0;i<extraLegs;i++){
    const sign=i?1:-1;poly(c,[[sign*half*.7,waist-4],[sign*(half+9),-16],[sign*(half+13),-3],[sign*(half+6),1],[sign*(half+2),-12],[sign*half*.4,waist]],p.dark,p.metal,2);
    if(family==='summon'||family==='pull')spool(c,sign*(half+8),-5,7,p);
  }

  // Long legs, boots and knee protection remain anatomical, without gore.
  const longLegs=family==='leap',legTop=longLegs?waist-8:waist;
  poly(c,[[-half*.62,legTop],[-half*.77,-11],[-half*.9+gait,-3],[-half*.48+gait,0],[-2,-11],[0,legTop]],p.dark,INK,2);
  poly(c,[[3,legTop],[half*.61,-12],[half*.88-gait,-3],[half*1.2-gait,-1],[half*.81,-13],[half*.52,legTop-1]],p.body,INK,2);
  poly(c,[[-half*.95+gait,-5],[-half*.42+gait,-5],[-half*.26+gait,1],[-half*1.06+gait,2]],p.metal,INK,1.6);
  poly(c,[[half*.8-gait,-5],[half*1.25-gait,-4],[half*1.45-gait,2],[half*.69-gait,2]],p.metal,INK,1.6);
  if(longLegs){for(const x of [-half*.6,half*.68]){box(c,x-3,-23,6,16,p.accent,INK,1.1);ellipse(c,x,-21,4,4,p.metal,INK,1.1);}}

  let torso=[[-half,shoulder],[-half*.55,shoulder-5],[half*.55,shoulder-3],[half,shoulder+10],[half*.65,waist],[-half*.67,waist],[-half-3,shoulder+14]];
  if(family==='fire'&&final)torso=[[-29,-72],[26,-72],[34,-52],[29,-24],[-26,-24],[-33,-48]];
  if(family==='spit'&&!final)torso=[[-18,-48],[10,-48],[18,-38],[14,-12],[4,-15],[-2,-11],[-17,-16],[-22,-33]];
  if(family==='leap')torso=[[-half-3,shoulder+4],[-half*.2,shoulder-10],[half*.85,shoulder-3],[half+3,shoulder+10],[half*.6,waist],[-half*.8,waist-2]];
  poly(c,torso,family==='spit'&&!final?p.paper:p.body,INK,2.2);
  poly(c,[[-half*.45,shoulder+2],[half*.47,shoulder+3],[half*.35,waist-2],[-half*.41,waist-1]],p.light,null);
  line(c,2,shoulder+2,3,waist,p.dark,1.7);line(c,-half*.67,waist,half*.65,waist,p.dark,3);
  if(['shield','charge','slam'].includes(family)){for(let at=shoulder+8;at<waist-3;at+=8)line(c,-half*.7,at,half*.7,at,p.metal,2);}
  if(family==='spit'&&!final){line(c,-7,-45,-1,-31,p.dark,2);line(c,6,-45,1,-31,p.dark,2);box(c,3,-29,8,8,p.body,INK,1);line(c,7,-31,7,-22,p.accent,2);line(c,3,-26,11,-26,p.accent,2);}
  if(family==='mine'){for(const x of final?[-21,-7,8,23]:[-13,0,12]){box(c,x-5,waist-8,10,11,p.dark,p.metal,1.2);ellipse(c,x,waist-3,2.8,2.8,p.accent,INK,.8);}}
  if(family==='fire')for(const at of [shoulder+13,waist-7])line(c,-half*.75,at,half*.7,at,p.accent,3);

  // Unequal arms and occupation-specific equipment create recognizable shapes.
  const lifted=windup?6:0;
  poly(c,[[-side*half,shoulder+4],[-side*(half+12),shoulder+12-lifted],[-side*(half+15),waist-5-lifted],[-side*(half+7),waist-2],[-side*(half+4),shoulder+18]],p.dark,INK,2);
  poly(c,[[side*half,shoulder+6],[side*(half+9),shoulder+14-lifted],[dir.x*(final?35:25),waist-5+dir.y*8-lifted],[dir.x*(final?30:21),waist+1+dir.y*8-lifted],[side*(half-2),shoulder+17]],p.body,INK,2);
  hand(c,-side*(half+12),waist-3-lifted,p,final?5:3.8);
  const handX=dir.x*(final?33:23),handY=waist-2+dir.y*8-lifted;hand(c,handX,handY,p,final?5.4:4);

  if(family==='charge'){
    drawHead(c,appearance.head||'hardhat',headY,side,final,p);
    if(final){poly(c,[[-35,-44],[32,-45],[43,-18],[0,-10],[-42,-19]],p.metal,INK,2.7);poly(c,[[-26,-35],[25,-36],[31,-22],[-30,-21]],p.dark,INK,1.6);line(c,-26,-24,27,-25,p.accent,4);rivets(c,-24,-34,6,9,p.paper);}
    else{line(c,side*27,-41,side*24,-17,p.metal,2.7);poly(c,[[side*27,-48],[side*42,-24],[side*12,-24]],p.accent,INK,2.2);poly(c,[[side*27,-40],[side*35,-27],[side*19,-27]],p.dark,p.paper,1);}
  }else if(family==='slam'){
    drawHead(c,appearance.head||'gas-mask',headY,side,final,p);
    if(final){
      poly(c,[[side*20,-63],[side*42,-58],[side*46,-34],[side*32,-23],[side*22,-38]],p.metal,INK,2.5);
      line(c,side*33,-55,side*38,-30,p.accent,5);ellipse(c,side*35,-37,7,7,p.dark,p.metal,2);
      poly(c,[[side*31,-30],[side*55,-28],[side*51,-7],[side*32,-8]],p.body,INK,2.6);line(c,side*34,-11,side*49,-11,p.accent,3);
    }else{const x=handX+side*5;ellipse(c,x,handY-5,18,19,p.metal,INK,2.6);ellipse(c,x,handY-5,13,14,p.dark,p.accent,1.7);for(const offset of [-7,0,7])line(c,x-11,handY-5+offset,x+11,handY-5+offset,p.metal,1.3);}
  }else if(family==='summon'){
    drawHead(c,appearance.head||'cap',headY,side,final,p);
    const x=handX+side*5,y=handY-2;
    if(final){line(c,x,y,x,y-33,p.metal,2.1);poly(c,[[x,y-33],[x+side*16,y-29],[x,y-15]],p.accent,INK,1.5);}
    else{line(c,x,y-10,x,y+1,p.metal,3);poly(c,[[x,y],[x+side*8,y+6],[x+side*6,y+15],[x-side*4,y+15],[x-side*7,y+8]],null,p.metal,3.2,false);}
    if(final){box(c,-8,-62,16,25,p.dark,p.accent,1.4);for(const y of [-58,-51,-44])line(c,-5,y,5,y,p.metal,1.1);}
  }else if(family==='spit'){
    drawHead(c,appearance.head||'nurse-cap',headY,side,final,p);
    if(final){ellipse(c,side*12,headY+5,5,6,p.dark,p.accent,1.4);line(c,side*10,headY+7,side*18,-39,p.metal,3);}
    else{const x=side*30;line(c,x,2,x,-75,p.metal,2.6);line(c,x-10,-73,x+5,-73,p.metal,2);box(c,x-9,-68,10,18,p.paper,INK,1.3);box(c,x-7,-64,6,12,p.accent,null);line(c,x-4,-50,handX,handY,p.metal,1.2);line(c,x-6,2,x+6,2,p.metal,2);}
  }else if(family==='shield'){
    drawHead(c,appearance.head||'riot-helmet',headY,side,final,p);
    if(final){for(const x of [-36,12]){poly(c,[[x,-71],[x+24,-71],[x+31,-17],[x+4,-10]],p.metal,INK,3);box(c,x+5,-62,13,9,p.glass,p.accent,1.3);line(c,x+5,-45,x+22,-45,p.accent,3);rivets(c,x+5,-22,3,6,p.paper);}}
    else{const x=side>0?9:-35;poly(c,[[x,-49],[x+23,-45],[x+28,-9],[x+3,-5]],p.metal,INK,2.5);box(c,x+5,-40,13,8,p.glass,p.paper,1.1);line(c,x+5,-23,x+22,-22,p.accent,3);}
  }else if(family==='leap'){
    drawHead(c,appearance.head||'bike-helmet',headY,side,final,p);
    if(final)for(const sign of [-1,1]){poly(c,[[sign*24,-48],[sign*46,-28],[sign*49,-15],[sign*42,-20],[sign*31,-36]],p.metal,INK,2);}
  }else if(family==='beam'){
    drawHead(c,appearance.head||'protective-visor',headY,side,final,p);
    if(!final){line(c,handX,handY,handX+side*17,handY-35,p.metal,3);line(c,handX+side*17,handY-35,handX+side*21,handY-42,p.accent,1.6);}
  }else if(family==='fire'){
    drawHead(c,appearance.head||'fire-helmet',headY,side,final,p);
    poly(c,[[handX-4,handY-7],[handX+side*19,handY-12],[handX+side*28,handY-8],[handX+side*28,handY-1],[handX,handY+1]],p.dark,p.metal,2.1);
    line(c,handX,handY-5,handX+side*24,handY-6,p.accent,2);
  }else if(family==='mine'){
    drawHead(c,appearance.head||'eod-helmet',headY,side,final,p);
    if(final){const x=side*34;spool(c,x,-30,14,p);box(c,x-10,-32,20,5,p.dark,p.accent,1.3);}
    else{const x=handX+side*5;box(c,x-8,handY-8,16,15,p.dark,p.accent,1.7);line(c,x-5,handY-10,x+5,handY-10,p.metal,2);box(c,x-2,handY-5,4,10,p.metal,INK,.8);}
  }else if(family==='pull'){
    drawHead(c,appearance.head||'truck-cap',headY,side,final,p);
    const x=handX+side*(final?14:9),y=handY+(final?9:5);line(c,handX,handY,x,y-15,p.metal,3.2);poly(c,[[x,y-15],[x+side*9,y-9],[x+side*9,y+1],[x,y+6],[x-side*7,y+1]],null,p.metal,3.8,false);
    line(c,-side*18,waist-2,handX,handY,p.accent,1.7);
  }else if(family==='spread'){
    drawHead(c,appearance.head||'filter-mask',headY,side,final,p);
    for(const x of final?[-17,0,17]:[-9,9]){ellipse(c,x,shoulder+15,final?7:5,final?8:6,p.accent,INK,1.4);line(c,x,shoulder+20,x,waist-4,p.metal,1.5);}
    if(final){for(const sign of [-1,1]){const x=sign*38,y=waist-5;poly(c,[[x,y],[x+sign*18,y-20],[x+sign*23,y-9],[x+sign*20,y+4],[x+sign*11,y+13]],p.body,p.accent,1.6);for(const offset of [-10,0,10])line(c,x,y,x+sign*18,y+offset,p.metal,.9);}}
    else{line(c,handX,handY,handX+side*18,handY-19,p.metal,3);box(c,handX+side*18-4,handY-22,8,6,p.accent,INK,1.2);line(c,handX,handY,-side*14,waist-4,p.dark,1.5);}
  }else if(family==='storm'){
    drawHead(c,appearance.head||'rain-hood',headY,side,final,p);
    for(const sign of [-1,1]){const x=sign*(half+8);box(c,x-6,shoulder+12,12,17,p.dark,p.metal,1.7);line(c,x,shoulder+15,x,shoulder+26,p.accent,2);}
    if(final)poly(c,[[-15,-48],[0,-58],[16,-47],[0,-34]],p.dark,p.accent,2.2);
    else{const x=handX+side*4,y=handY-13;line(c,handX,handY,x,y,p.metal,2.2);for(let i=0;i<3;i++){const a=i*Math.PI*2/3;line(c,x,y,x+Math.cos(a)*8,y+Math.sin(a)*5,p.metal,1);ellipse(c,x+Math.cos(a)*8,y+Math.sin(a)*5,3,2,p.accent,INK,.8);}}
  }

  if(effects&&num(e.hitFlash)>0){c.save();c.globalAlpha*=clamp(e.hitFlash/.12,0,1)*.45;poly(c,torso,'#f1e1b5',null);c.restore();}
  if(effects&&num(e.burn)>0)for(let i=0;i<3;i++){
    const x=(i-1)*11,y=waist-4-i*5,wave=Math.sin(time*17+i)*2;
    poly(c,[[x-5,y+3],[x-5,y-5],[x+wave,y-20],[x+5,y-1]],'#ce7638',null);poly(c,[[x-2,y+2],[x+wave*.5,y-11],[x+2,y]],'#f0c768',null);
  }
  c.restore();return true;
}

/** Static catalog art, using exactly the same silhouette as its live boss. */
export function renderBossPortrait(canvas,bossKey){
  if(!canvas?.getContext)return false;
  const c=canvas.getContext('2d',{alpha:true});if(!c)return false;
  const boss=getBoss(bossKey);
  if(!boss){c.save();c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,num(canvas.width,1),num(canvas.height,1));c.restore();return false;}
  const rect=canvas.getBoundingClientRect?.();
  const width=Math.max(1,num(rect?.width,num(canvas.clientWidth,num(canvas.width,180))));
  const height=Math.max(1,num(rect?.height,num(canvas.clientHeight,num(canvas.height,180))));
  const dpr=clamp(num(globalThis.devicePixelRatio,num(globalThis.window?.devicePixelRatio,1)),1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);
  const p=colors(boss),bounds=bossBodyBounds(boss),padding=12;
  const fit=Math.max(.05,Math.min((width-padding*2)/(bounds.right-bounds.left),(height-padding*2)/(bounds.bottom-bounds.top)));
  c.save();c.lineCap='round';c.lineJoin='round';
  const background=c.createRadialGradient(width*.5,height*.55,0,width*.5,height*.55,Math.max(width,height)*.58);
  background.addColorStop(0,'rgba(50,72,69,.42)');background.addColorStop(1,'rgba(16,30,35,0)');
  c.fillStyle=background;c.fillRect(0,0,width,height);
  c.translate(width*.5,padding-bounds.top*fit);c.scale(fit,fit);
  ellipse(c,3,3,boss.role==='final'?39:26,boss.role==='final'?12:8,'rgba(4,13,17,.5)',null);
  drawBossBody(c,boss,{r:boss.stats.r,angle:.35,walkPhase:0,attackState:'walk',hp:boss.stats.hp,maxHp:boss.stats.hp},0,{shadow:false,effects:false});
  c.restore();return true;
}
