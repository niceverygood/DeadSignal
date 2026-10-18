export const HOSPITAL_EXPEDITION_ID='last-signal-hospital-03';
// Ground-level hospital campus. Original quarantine-wing models form the wings;
// this is outdoor exploration, not an invented playable building interior.
export function createHospitalWorld({nextId,seed=0}){
  const obstacles=[],decor=[],add=(x,y,w,h,kind,extra={},hp=Infinity)=>{const o={id:nextId(),x,y,w,h,kind,hp,maxHp:hp,destroyed:false,...extra};obstacles.push(o);return o;};
  add(260,250,700,380,'building',{variant:'quarantine',height:118,label:'TRIAGE WING'});
  add(1390,310,650,360,'building',{variant:'quarantine',height:118,label:'ISOLATION'});
  add(330,1070,550,270,'building',{variant:'brick',height:110,label:'PHARMACY'});
  add(1550,1160,500,240,'building',{variant:'quarantine',height:108,label:'RESEARCH'});
  add(950,850,90,80,'building',{variant:'hospital-power',height:48,label:'COLD CHAIN POWER'});
  for(const [x,y,h]of [[1500,700,120],[1500,950,140]])add(x,y,8,h,'fence',{height:42});
  add(1120,1570,230,8,'fence',{height:42});
  for(const [x,y]of [[730,760],[1610,1010]])add(x,y,58,112,'car',{height:27,variant:'civilian'},95);
  for(const [x,y]of [[900,1000],[1450,1100]])add(x,y,30,30,'barrel',{height:25},22);
  for(const [x,y]of [[1050,1200],[1100,800],[1730,730],[1350,1440]])decor.push({x,y,kind:'lamp'});
  return {width:2400,height:1800,seed,theme:'hospital',expeditionId:HOSPITAL_EXPEDITION_ID,obstacles,decor,
    roads:[{x:1000,y:700,w:400,h:850,axis:'y'},{x:600,y:700,w:1250,h:300,axis:'x'},{x:900,y:1380,w:650,h:140,axis:'x'}],spawn:{x:1200,y:1450},exit:{x:1200,y:1460,open:false}};
}
