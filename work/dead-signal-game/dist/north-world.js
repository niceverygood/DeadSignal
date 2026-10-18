export const NORTH_EXPEDITION_ID='last-signal-north-04';
export function createNorthWorld({nextId,seed=0}){
 const obstacles=[],decor=[],add=(x,y,w,h,kind,extra={},hp=Infinity)=>obstacles.push({id:nextId(),x,y,w,h,kind,hp,maxHp:hp,destroyed:false,...extra});
 add(300,330,650,340,'building',{variant:'guardhouse',height:100,label:'QUARANTINE CONTROL'});
 add(1430,400,570,280,'building',{variant:'bunker',height:96,label:'K-17 ARCHIVE'});
 add(300,1450,550,230,'building',{variant:'brick',height:112,label:'FREIGHT OFFICE'});
 add(1500,1150,500,250,'building',{variant:'bunker',height:96,label:'SEA TRANSFER'});
 add(900,1150,90,80,'building',{variant:'power',height:48,label:'TOW POWER'});
 for(const [x,y,w,h]of [[1450,1040,8,280],[1430,730,8,75],[1000,1500,300,8]])add(x,y,w,h,'fence',{height:42});
 add(700,920,58,112,'car',{variant:'civilian',height:27},95);
 for(const [x,y]of [[900,1000],[1930,1080]])add(x,y,30,30,'barrel',{height:25},22);
 for(const [x,y]of [[920,1360],[1140,1090],[1310,810],[1750,820],[1810,1000]])decor.push({x,y,kind:'lamp'});
 return {width:2400,height:1800,seed,theme:'checkpoint',expeditionId:NORTH_EXPEDITION_ID,obstacles,decor,
  roads:[{x:820,y:1240,w:520,h:180,axis:'x'},{x:1100,y:780,w:240,h:650,axis:'y'},{x:1080,y:800,w:850,h:220,axis:'x'}],spawn:{x:900,y:1400},exit:{x:1840,y:1010,open:false}};
}
