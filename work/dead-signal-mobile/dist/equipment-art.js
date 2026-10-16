import {getEquipment} from './equipment.js?v=0.26.0';

const INK='#142b34',METAL='#8b9c91',PAPER='#d7d6bd',GOLD='#d0ad65';
const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;
function path(c,points,fill,stroke=INK,width=2,close=true){
  c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);if(close)c.closePath();
  if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}
}
function line(c,x1,y1,x2,y2,color,width=1.5){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function ellipse(c,x,y,rx,ry,fill,stroke=INK,width=1.7){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function box(c,x,y,w,h,fill,stroke=INK,width=1.6){c.fillStyle=fill;c.fillRect(x,y,w,h);if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.strokeRect(x,y,w,h);}}
function bolts(c,points,color=PAPER){for(const [x,y]of points){ellipse(c,x,y,1.6,1.6,color,INK,.7);line(c,x-.7,y,x+.7,y,INK,.6);}}

function blackout(c){
  path(c,[[-43,27],[30,23],[44,34],[36,46],[-32,50],[-46,40]],'#46584e',INK,2.3);
  path(c,[[-46,40],[36,35],[36,46],[-32,50]],'#293f43',INK,1.6);
  const round=(x,y,angle,scale)=>{
    c.save();c.translate(x,y);c.rotate(angle);c.scale(scale,scale);
    path(c,[[-11,-16],[-8,-34],[0,-48],[9,-34],[12,-15]],'#263a43',INK,2.4);
    path(c,[[-4,-38],[0,-47],[5,-34],[5,-16],[-4,-16]],'#516c71',null);
    path(c,[[-12,-16],[12,-16],[13,29],[-11,32]],'#ad8850',INK,2.2);
    path(c,[[-6,-14],[0,-14],[1,30],[-6,31]],'#d2b371',null);
    box(c,7,-14,5,42,'#755f3d',null);box(c,-13,24,27,9,'#c1a16a',INK,1.7);
    for(const at of [-9,-3,17])line(c,-10,at,11,at,at<0?'#43575b':'#e1c785',1.3);
    path(c,[[-10,1],[10,1],[10,10],[-10,10]],'#263b40',INK,1.1);line(c,-8,5,8,5,'#708783',1.1);
    c.restore();
  };
  round(-25,9,-.24,.73);round(25,8,.21,.72);round(0,-2,-.03,1);
  bolts(c,[[-37,37],[31,33],[-25,45],[30,42]],'#aaad86');
}
function magazine(c){
  const cyan='#a7d5da';
  path(c,[[-14,-9],[-9,-43],[14,-47],[24,-37],[17,-2]],'#536d71',INK,2.4);
  path(c,[[-8,-39],[11,-42],[13,-25],[-10,-21]],'#78958d',INK,1.4);line(c,-5,-35,10,-37,PAPER,1.5);
  box(c,-7,-23,17,16,'#233e48',INK,1.6);for(const x of [-3,3,9])line(c,x,-22,x-2,-9,cyan,1.3);
  ellipse(c,0,13,39,33,'#263e49',INK,2.8);ellipse(c,-4,9,32,29,'#597b7e',INK,2.1);
  ellipse(c,-5,8,26,23,'#2b4954',METAL,2);ellipse(c,-5,8,17,15,'#48636c',cyan,1.5);
  for(let i=0;i<10;i++){const a=i*Math.PI/5;line(c,-5+Math.cos(a)*29,8+Math.sin(a)*25,-5+Math.cos(a)*24,8+Math.sin(a)*20,METAL,2.4);}
  path(c,[[-2,-8],[-16,9],[-6,9],[-9,24],[6,4],[-3,4],[5,-8]],cyan,INK,1.4);
  path(c,[[30,-8],[43,-2],[46,14],[40,31],[32,28]],'#465c64',INK,2);for(const y of [1,8,15,22])line(c,34,y,42,y+2,GOLD,2.1);
  bolts(c,[[-28,-4],[-27,25],[11,-7],[13,27]],PAPER);
}
function armor(c){
  const cloth='#afbfaa',shade='#6c8577',tape='#d6b779';
  path(c,[[-18,2],[-21,27],[-28,42],[-17,46],[-9,26],[-2,4]],shade,INK,2.2);
  path(c,[[3,4],[10,27],[15,45],[28,42],[20,22],[18,3]],cloth,INK,2.2);
  path(c,[[-30,40],[-18,40],[-13,48],[-30,48]],'#3c5353',INK,2);path(c,[[14,40],[28,39],[33,47],[16,49]],'#3c5353',INK,2);
  path(c,[[-18,-27],[-33,-18],[-39,10],[-30,16],[-23,-5],[-11,-19]],shade,INK,2.3);
  path(c,[[17,-27],[31,-18],[38,10],[28,16],[21,-4],[11,-18]],cloth,INK,2.3);
  ellipse(c,-34,15,6,7,'#435c56',INK,1.8);ellipse(c,33,15,6,7,'#526b5f',INK,1.8);
  path(c,[[-19,-30],[15,-31],[24,-13],[20,10],[-19,10],[-25,-12]],cloth,INK,2.4);
  path(c,[[-17,-29],[-3,-26],[-5,9],[-18,9],[-23,-11]],'#8fa892',null);
  line(c,2,-25,2,9,'#415d57',2);line(c,-20,4,20,4,tape,4);
  for(const sign of [-1,1]){line(c,sign*23,-16,sign*32,-12,tape,3);line(c,sign*16,27,sign*23,26,tape,3);}
  path(c,[[-14,-31],[-17,-42],[-9,-53],[6,-54],[17,-44],[17,-32],[10,-25],[-6,-25]],'#b8c5ac',INK,2.4);
  path(c,[[-10,-43],[7,-45],[13,-38],[10,-30],[-6,-29],[-13,-34]],'#294954',METAL,1.5);
  line(c,-8,-39,6,-40,'#9ac3bb',1.4);box(c,-5,-28,13,7,'#55776a',INK,1.4);
  ellipse(c,-13,-29,4,4,METAL,INK,1.1);ellipse(c,16,-29,4,4,METAL,INK,1.1);
  path(c,[[-15,-17],[-5,-17],[-5,-6],[-15,-6]],tape,INK,1.1);path(c,[[-10,-15],[-14,-9],[-6,-9]],'#485c49',null);
  box(c,7,-13,10,10,'#8a9e87',INK,1.2);line(c,12,-11,12,-5,PAPER,1.2);line(c,9,-8,15,-8,PAPER,1.2);
}
function barrier(c){
  const blue='#a5cddd';
  ellipse(c,0,39,35,11,'#2d4855',INK,2.4);ellipse(c,-2,34,31,9,METAL,INK,2);
  path(c,[[-28,33],[-25,13],[-18,8],[-12,28]],'#4b7380',INK,2.4);path(c,[[25,33],[27,13],[19,6],[12,28]],'#78959b',INK,2.4);
  line(c,-24,29,-19,14,blue,2.6);line(c,21,28,21,13,blue,2.6);
  ellipse(c,0,30,15,8,'#244b60',PAPER,1.5);ellipse(c,0,28,10,5,blue,INK,1.1);
  c.save();c.globalAlpha=.21;path(c,[[0,-51],[35,-31],[35,4],[17,22],[0,30],[-19,21],[-35,4],[-35,-31]],'#83bdd3',null);c.restore();
  path(c,[[0,-51],[35,-31],[35,4],[17,22],[0,30],[-19,21],[-35,4],[-35,-31]],null,blue,2.6);
  path(c,[[0,-39],[25,-25],[25,1],[0,20],[-25,1],[-25,-25]],null,'#5f9bb7',1.3);
  line(c,0,-37,0,17,'#6799aa',.9);line(c,-23,-23,23,1,'#6799aa',.9);line(c,23,-23,-23,1,'#6799aa',.9);
  for(const [x,y]of [[0,-51],[-35,-31],[35,-31],[-35,4],[35,4],[0,30]])ellipse(c,x,y,2.8,2.8,'#d1e5e2',INK,.9);
  bolts(c,[[-23,36],[21,36]],PAPER);
}
function survival(c){
  const green='#b6d49c';
  path(c,[[-25,-36],[-15,-48],[19,-48],[29,-35],[29,31],[17,43],[-19,43],[-29,31],[-29,-29]],'#6e8873',INK,2.6);
  path(c,[[18,-44],[28,-34],[28,30],[17,40],[12,34],[13,-34]],'#435f59',INK,1.5);
  path(c,[[-19,-34],[-11,-40],[12,-40],[18,-32],[18,28],[10,34],[-14,34],[-21,28]],'#b1c6a1',INK,1.9);
  box(c,-14,-31,25,8,'#334e46',INK,1.2);for(const x of [-9,-3,3])box(c,x,-29,3,4,green,null);
  ellipse(c,-1,2,18,22,'#456e5a',INK,1.8);ellipse(c,-3,0,14,18,green,'#78977c',1.2);
  path(c,[[-7,-11],[2,-11],[2,-3],[10,-3],[10,5],[2,5],[2,13],[-7,13],[-7,5],[-15,5],[-15,-3],[-7,-3]],'#e1e2c5',INK,1.2);
  for(const x of [-33,34]){box(c,x-4,-17,8,31,'#324f4b',METAL,1.4);box(c,x-2,-11,4,18,green,null);box(c,x-5,-20,10,4,METAL,INK,1.1);box(c,x-5,13,10,4,METAL,INK,1.1);}
  line(c,-12,28,9,28,'#4b6e57',1.5);bolts(c,[[-22,-30],[20,-30],[-21,29],[21,29]],PAPER);
}
function magnet(c){
  const copper='#bf8d5f',cyan='#83b8b8';
  c.save();c.globalAlpha=.52;
  for(const radius of [29,39,49]){c.beginPath();c.ellipse(1,-3,radius,radius*.68,0,Math.PI*1.12,Math.PI*1.89);c.strokeStyle=cyan;c.lineWidth=1.1;c.stroke();}
  c.restore();
  path(c,[[-33,-31],[-17,-33],[-14,10],[-7,19],[6,20],[15,11],[17,-32],[33,-29],[31,16],[21,36],[4,44],[-17,40],[-31,21]],'#556b64',INK,2.8);
  path(c,[[-16,-23],[-14,10],[-7,19],[6,20],[15,11],[16,-24],[23,-23],[22,17],[13,29],[-10,29],[-23,15],[-24,-22]],'#8b9d8a',INK,1.6);
  for(const x of [-33,16])for(const at of [-18,-12,-6,0,6]){line(c,x,at,x+17,at+3,copper,3.3);line(c,x+1,at-1,x+16,at+1,'#d3b079',.8);}
  path(c,[[-34,-34],[-18,-35],[-17,-20],[-33,-18]],'#c19d80',INK,1.8);path(c,[[17,-34],[34,-32],[33,-16],[17,-19]],'#aec7c4',INK,1.8);
  line(c,-33,-27,-18,-28,PAPER,2);line(c,18,-26,33,-24,PAPER,2);
  box(c,-12,29,25,10,'#324b48',INK,1.4);box(c,-5,31,11,5,copper,INK,.9);bolts(c,[[-20,26],[20,24]],PAPER);
  path(c,[[37,-48],[46,-47],[51,-39],[44,-34],[35,-38]],METAL,INK,1.4);line(c,38,-45,45,-38,PAPER,1.2);
  path(c,[[-49,-43],[-41,-48],[-35,-44],[-37,-34],[-47,-35]],'#a5ac8f',INK,1.4);ellipse(c,-42,-41,2.8,2.6,'#3b5655',INK,.8);
}
const ART={'blackout-rounds':blackout,'storm-magazine':magazine,'quarantine-armor':armor,'barrier-field':barrier,'survival-core':survival,'magnetic-recovery':magnet};
const ACCENTS={'blackout-rounds':GOLD,'storm-magazine':'#8dc6d0','quarantine-armor':'#b6c6a0','barrier-field':'#85b9d2','survival-core':'#a4c788','magnetic-recovery':'#bf986e'};

/** Static shop illustration. Unknown IDs erase stale art without resizing it. */
export function renderEquipmentPortrait(canvas,itemId){
  if(!canvas?.getContext)return false;
  const c=canvas.getContext('2d',{alpha:true});if(!c)return false;
  const item=getEquipment(itemId),draw=ART[itemId];
  if(!item||!draw){c.save();c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,positive(canvas.width,1),positive(canvas.height,1));c.restore();return false;}
  const rect=canvas.getBoundingClientRect?.(),width=positive(rect?.width,positive(canvas.clientWidth,positive(canvas.width,160))),height=positive(rect?.height,positive(canvas.clientHeight,positive(canvas.height,128)));
  const dpr=Math.max(1,Math.min(2,positive(globalThis.devicePixelRatio,positive(globalThis.window?.devicePixelRatio,1))));
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);
  c.save();c.lineCap='round';c.lineJoin='round';
  const backdrop=c.createRadialGradient(width*.5,height*.48,0,width*.5,height*.48,Math.max(width,height)*.5);
  backdrop.addColorStop(0,'rgba(64,87,78,.22)');backdrop.addColorStop(1,'rgba(16,30,35,0)');c.fillStyle=backdrop;c.fillRect(0,0,width,height);
  const fit=Math.max(.01,Math.min(Math.max(1,width-16)/120,Math.max(1,height-12)/118));
  c.translate(width/2,height/2);c.scale(fit,fit);
  ellipse(c,2,46,43,8,'rgba(4,13,17,.4)',null);
  c.save();c.globalAlpha=.3;line(c,-34,53,34,53,ACCENTS[itemId],1);c.restore();
  draw(c);c.restore();return true;
}
