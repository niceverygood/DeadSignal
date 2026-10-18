export const SEA_EXPEDITION_ID='last-signal-sea-05';
export const SEA_WATER=Object.freeze([{x:2030,y:35,w:335,h:780},{x:2250,y:815,w:115,h:300},{x:2030,y:1115,w:335,h:650}].map(Object.freeze));
export function validSeaWater(value){return Array.isArray(value)&&value.length===SEA_WATER.length&&value.every((r,i)=>r&&Object.keys(r).length===4&&['x','y','w','h'].every(k=>r[k]===SEA_WATER[i][k]));}
export const inWater=(world,x,y)=>!!world?.water?.some(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);
export function createSeaWorld({nextId,seed=0}){
 const obstacles=[],decor=[],add=(x,y,w,h,kind,extra={},hp=Infinity)=>obstacles.push({id:nextId(),x,y,w,h,kind,hp,maxHp:hp,destroyed:false,...extra});
 for(const [x,y,label]of [[450,400,'EXPORT / K-17'],[1450,440,'HAIFA / CULTURE'],[490,1160,'QUARANTINE HOLD']])add(x,y,360,170,'building',{variant:'container',height:90,label});
 add(1510,1230,400,240,'building',{variant:'control',height:100,label:'SEA TRANSFER CONTROL'});
 add(950,1190,90,80,'building',{variant:'power',height:48,label:'DOCK POWER'});
 for(const [x,y,w,h]of [[2030,807,220,8],[2030,1115,220,8],[2250,815,8,300],[1300,650,8,140]])add(x,y,w,h,'fence',{height:42});
 add(730,850,58,112,'car',{variant:'civilian',height:27},95);
 for(const [x,y]of [[1000,730],[1930,1300]])add(x,y,30,30,'barrel',{height:25},22);
 for(const [x,y]of [[1040,890],[1750,950],[1990,860],[2190,1050],[1120,1320]])decor.push({x,y,kind:'lamp'});
 return {width:2400,height:1800,seed,theme:'harbor',expeditionId:SEA_EXPEDITION_ID,water:SEA_WATER,obstacles,decor,
  roads:[{x:870,y:790,w:1380,h:325,axis:'x'},{x:1020,y:700,w:330,h:750,axis:'y'},{x:800,y:1300,w:650,h:140,axis:'x'}],spawn:{x:1200,y:1400},exit:{x:2190,y:975,open:false}};
}
