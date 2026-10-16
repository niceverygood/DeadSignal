// District layouts share readable combat lanes while giving each route its own landmarks.
import {getMission} from './campaign.js?v=0.26.0';

export function createCity({stage=0,route='hospital',random,nextId,seed=0,missionId}){
  const mission=getMission(missionId);
  if(mission)return createCampaignCity({mission,random,nextId,seed});
  const obstacles=[],decor=[],add=(x,y,w,h,kind,hp=Infinity,extra={})=>{
    const o={id:nextId(),x,y,w,h,kind,hp,maxHp:hp,destroyed:false,...extra};obstacles.push(o);return o;
  };
  const outer=[[120,120,510,450],[1770,120,510,450],[120,1200,510,450],[1770,1200,510,450],[120,670,400,300],[1880,670,400,300],[870,120,260,350],[1320,120,260,350],[860,1370,680,290]];
  for(let i=0;i<outer.length;i++)add(...outer[i],'building',Infinity,{variant:stage===2?'station':i%3===0?'shop':'brick',height:95+(i%3)*18,label:stage===2?(i===6?'EVACUATION':i===8?'PLATFORM':'STATION'):i===4?'WORKSHOP':i===5?'SUPPLY':i%3===0?'MARKET':'APARTMENTS'});
  if(stage===0){
    add(680,600,340,190,'building',Infinity,{variant:'brick',height:118,label:'APARTMENTS'});
    add(1400,540,380,200,'building',Infinity,{variant:'shop',height:99,label:'WORKSHOP'});
    add(1450,1070,330,200,'building',Infinity,{variant:'shop',height:110,label:'MARKET'});
    add(630,1060,360,190,'building',Infinity,{variant:'brick',height:128,label:'RESIDENTIAL'});
  }else if(stage===1){
    add(680,530,370,230,'building',Infinity,{variant:route==='hospital'?'hospital':'shop',height:132,label:route==='hospital'?'HOSPITAL':'PHARMACY'});
    add(1430,570,350,230,'building',Infinity,{variant:route==='police'?'police':'shop',height:124,label:route==='police'?'CITY POLICE':'HARDWARE'});
    add(660,1130,330,190,'building',Infinity,{variant:'shop',height:100,label:'GROCERY'});
    add(1460,1130,330,220,'building',Infinity,{variant:'shop',height:107,label:'MOTOR REPAIR'});
  }
  // Keep a broad central escape lane. Props form optional choke points along its edges.
  for(const[x,y]of [[730,820],[1590,920],[1630,805],[735,970],[1150,1270],[1080,570],[1710,1190]])add(x,y,58,112,'car',95,{variant:stage===1&&route==='police'?'patrol':'civilian',height:27});
  for(const[x,y]of [[970,825],[1410,1035],[1700,910],[630,920],[1190,590],[1120,1210]])add(x,y,30,30,'barrel',22,{height:25});
  if(stage<2){add(570,810,8,210,'fence',Infinity,{height:42});add(1800,820,8,220,'fence',Infinity,{height:42});add(1020,1260,170,8,'fence',Infinity,{height:42});}
  for(let i=0;i<70;i++)decor.push({x:random()*2400,y:random()*1800,kind:'rubble',seed:random()});
  for(const[x,y]of [[660,800],[1750,810],[660,1040],[1760,1060],[1050,500],[1390,500],[1100,1270]])decor.push({x,y,kind:'lamp'});
  for(const[x,y]of [[1018,816],[1430,1025],[648,1030],[1780,814]])decor.push({x,y,kind:'hydrant'});
  for(const[x,y]of [[1010,790],[1430,1070],[980,1250],[1790,1090]])decor.push({x,y,kind:'trash',seed:random()});
  decor.push({x:1050,y:840,kind:'sign',label:stage===2?'EVACUATION':stage===1?(route==='hospital'?'HOSPITAL':'POLICE'):'KEEP MOVING'});
  const roads=stage===2?[
    {x:520,y:560,w:1360,h:770,axis:'x'},
    {x:1020,y:420,w:380,h:1110,axis:'y'}
  ]:[
    {x:540,y:790,w:1330,h:275,axis:'x'},
    {x:1010,y:480,w:390,h:960,axis:'y'},
    {x:510,y:540,w:520,h:190,axis:'x'},
    {x:1480,y:815,w:440,h:200,axis:'x'}
  ];
  return{width:2400,height:1800,obstacles,decor,roads,theme:['residential','commercial','station'][stage],exit:{x:1200,y:510,open:false},spawn:{x:1200,y:930},seed:seed+stage};
}

// Campaign layouts use the same collision/decor vocabulary as the original city.
// The centre cross is deliberately clear for the largest (r49) campaign boss;
// tighter warehouse and fence openings sit on optional side routes.
const CAMPAIGN_LAYOUTS=[
  {variant:'shop',labels:['DEMOLITION','SITE OFFICE','CONCRETE','WORKSHOP'],
    blocks:[[665,570,355,180],[1430,535,340,215],[620,1110,380,170],[1430,1120,340,190]],
    roads:[[525,785,1350,285,'x'],[1040,430,330,1000,'y'],[575,465,1220,140,'x'],[580,1270,1240,140,'x']],
    cars:[[730,780],[1590,770],[1600,1090],[740,1080]],barrels:[[930,815],[1450,1060],[1010,1200]],fences:[[560,650,8,150],[1810,1080,8,160]]},
  {variant:'brick',labels:['PUMP HOUSE','SETTLING BASIN','FILTER HOUSE','DRAIN CONTROL'],
    blocks:[[660,540,165,225],[865,560,170,185],[1390,535,185,225],[1615,570,165,180],[650,1110,385,165],[1420,1120,355,180]],
    roads:[[500,800,1400,275,'x'],[1055,420,300,1030,'y'],[580,450,1240,145,'x'],[545,1280,1280,145,'x'],[795,480,75,300,'y']],
    cars:[[735,790],[1585,780],[1630,1085]],barrels:[[950,805],[1410,1065],[1000,1195],[1775,1085]],fences:[[560,645,8,165],[1800,635,8,175]]},
  {variant:'shop',labels:['CUSTOMS','CONTAINER A','CONTAINER B','CARGO CONTROL'],
    blocks:[[625,535,415,115],[665,695,335,75],[1370,540,435,130],[1440,705,330,65],[625,1120,405,125],[1390,1120,405,155]],
    roads:[[485,805,1435,265,'x'],[1040,430,325,1000,'y'],[560,650,1280,75,'x'],[550,1275,1310,145,'x'],[560,430,85,1000,'y']],
    cars:[[720,775],[1550,780],[1640,1085],[735,1080]],barrels:[[930,815],[1450,1060],[1035,1215]],fences:[[570,555,8,210],[1800,1100,8,170]]},
  {variant:'hospital',labels:['EMERGENCY','ISOLATION WARD','PHARMACY','LABORATORY'],
    blocks:[[650,525,390,160],[840,685,200,80],[1380,550,385,190],[640,1120,240,175],[920,1120,125,135],[1400,1120,375,200]],
    roads:[[530,800,1340,280,'x'],[1050,415,320,1035,'y'],[575,435,1255,150,'x'],[545,1300,1295,130,'x'],[865,1100,75,255,'y']],
    cars:[[730,775],[1590,780],[1620,1090]],barrels:[[950,810],[1420,1060],[1010,1215]],fences:[[570,630,8,180],[1810,1100,8,175]]},
  {variant:'police',labels:['CHECKPOINT','BARRICADE','CONTROL ROOM','HOLDING AREA'],
    blocks:[[665,570,195,180],[900,600,135,150],[1380,550,180,200],[1600,575,180,175],[645,1120,385,165],[1400,1120,380,185]],
    roads:[[510,800,1390,280,'x'],[1040,420,325,1020,'y'],[585,475,1240,150,'x'],[580,1290,1230,135,'x'],[860,530,75,260,'y']],
    cars:[[745,780],[1535,780],[1625,1085],[745,1085]],barrels:[[950,810],[1440,1065],[1020,1220]],fences:[[560,635,8,165],[1810,640,8,165],[640,1320,250,8]]},
  {variant:'station',labels:['BUS DEPOT','TRANSFER HALL','PARCEL BAY','DISPATCH'],
    blocks:[[620,550,415,215],[1390,565,405,125],[1500,690,295,75],[625,1125,405,110],[650,1280,370,80],[1405,1130,385,195]],
    roads:[[490,800,1440,280,'x'],[1045,420,320,1020,'y'],[570,455,1260,140,'x'],[545,1235,1295,70,'x'],[1800,440,100,985,'y']],
    cars:[[720,775],[1540,780],[1640,1090],[720,1085]],barrels:[[935,810],[1440,1065],[1020,1250]],fences:[[555,645,8,165],[1820,1100,8,195],[1470,1345,270,8]]},
  {variant:'brick',labels:['SUBSTATION','TRANSFORMER A','TRANSFORMER B','GRID CONTROL'],
    blocks:[[650,535,180,215],[870,565,170,180],[1390,530,170,220],[1600,565,190,180],[650,1120,170,170],[855,1120,180,205],[1400,1120,380,185]],
    roads:[[510,800,1400,275,'x'],[1050,420,310,1015,'y'],[580,450,1240,140,'x'],[570,1315,1240,130,'x'],[820,470,70,900,'y']],
    cars:[[740,780],[1545,780],[1635,1085]],barrels:[[960,810],[1440,1060],[1025,1250],[1780,1090]],fences:[[560,600,8,210],[1810,605,8,205],[650,1330,185,8]]},
  {variant:'shop',labels:['REFINERY','FUEL TANKS','PUMP CONTROL','INCINERATOR'],
    blocks:[[645,520,165,240],[850,555,190,200],[1380,535,190,225],[1610,550,180,210],[650,1120,390,200],[1400,1120,165,195],[1605,1120,180,180]],
    roads:[[510,800,1395,280,'x'],[1045,420,325,1020,'y'],[580,450,1250,145,'x'],[580,1320,1260,120,'x'],[1560,475,75,850,'y']],
    cars:[[730,780],[1500,780],[1635,1085]],barrels:[[950,810],[1440,1060],[1015,1260],[1765,1080]],fences:[[560,595,8,215],[1810,610,8,205],[1430,1340,295,8]]},
  {variant:'police',labels:['ARMORY','MAGAZINE A','MAGAZINE B','QUARTERMASTER'],
    blocks:[[650,545,390,105],[650,690,390,70],[1380,545,405,105],[1380,690,405,70],[645,1120,180,190],[875,1120,165,190],[1400,1120,385,205]],
    roads:[[510,800,1395,280,'x'],[1040,420,330,1020,'y'],[570,450,1270,145,'x'],[585,650,1220,70,'x'],[570,1325,1270,115,'x']],
    cars:[[740,780],[1525,780],[1635,1090],[745,1085]],barrels:[[950,810],[1440,1065],[1020,1250]],fences:[[560,610,8,205],[1810,610,8,205],[650,1330,200,8],[1520,1345,240,8]]},
  {variant:'shop',labels:['TOW OFFICE','PRESS HOUSE','SORTING SHED','SCRAP BAILER'],
    blocks:[[635,550,235,205],[915,590,125,165],[1385,535,225,220],[1650,610,135,145],[640,1120,385,185],[1400,1120,210,190],[1650,1120,140,160]],
    roads:[[495,800,1420,280,'x'],[1045,420,325,1020,'y'],[570,460,1280,150,'x'],[575,1320,1260,125,'x'],[1605,480,75,870,'y']],
    cars:[[725,780],[1480,780],[1685,1085],[735,1085]],barrels:[[945,810],[1435,1065],[1020,1245]],fences:[[560,625,8,190],[1810,625,8,190],[1460,1340,265,8],[610,1350,210,8]]},
  {variant:'hospital',labels:['GLASSHOUSE A','GLASSHOUSE B','CULTURE LAB','QUARANTINE GARDEN'],
    blocks:[[635,535,405,95],[660,675,380,85],[1380,535,405,95],[1380,675,380,85],[640,1120,395,100],[665,1260,370,80],[1400,1120,385,205]],
    roads:[[500,800,1415,280,'x'],[1045,420,325,1020,'y'],[565,455,1280,140,'x'],[580,630,1230,70,'x'],[570,1345,1265,95,'x']],
    cars:[[735,780],[1530,780],[1640,1085]],barrels:[[950,810],[1435,1065],[1025,1240],[1760,1085]],fences:[[560,615,8,200],[1810,615,8,200],[660,1360,175,8],[1510,1345,260,8]]},
  {variant:'station',labels:['SEA WALL CONTROL','LIGHTHOUSE','WEATHER STATION','EVACUATION PIER'],
    blocks:[[640,560,400,125],[770,685,270,75],[1410,520,300,240],[1750,580,70,180],[640,1120,390,210],[1400,1120,385,125],[1530,1245,255,80]],
    roads:[[475,800,1470,280,'x'],[1040,420,330,1025,'y'],[565,435,1290,145,'x'],[570,1330,1290,125,'x'],[1820,440,110,985,'y']],
    cars:[[730,780],[1530,780],[1680,1085]],barrels:[[950,810],[1435,1065],[1020,1240]],fences:[[555,600,8,215],[1840,605,8,210],[650,1350,220,8],[1460,1345,275,8]]}
];

function createCampaignCity({mission,random,nextId,seed}){
  const layout=CAMPAIGN_LAYOUTS[mission.index],obstacles=[],decor=[];
  const add=(x,y,w,h,kind,hp=Infinity,extra={})=>{
    const obstacle={id:nextId(),x,y,w,h,kind,hp,maxHp:hp,destroyed:false,...extra};
    obstacles.push(obstacle);return obstacle;
  };
  const shift=(mission.index%3)*20;
  const outer=[[100,100,470+shift,350],[1830-shift,100,470+shift,360],[100,1240,440,420],[1860,1240,440,420],[100,660,360,300],[1940,660,360,300],[850,100,210+shift,280],[1340,100,210+shift,280],[930,1470,540,190]];
  for(let i=0;i<outer.length;i++)add(...outer[i],'building',Infinity,{variant:i===6||i===7?layout.variant:i%3===0?'shop':'brick',height:82+(i%3)*16,label:i===8?layout.labels[3]:i===6?layout.labels[0]:i===7?layout.labels[1]:i%2?'STORAGE':'SERVICE'});
  for(let i=0;i<layout.blocks.length;i++)add(...layout.blocks[i],'building',Infinity,{variant:layout.variant,height:92+(i%3)*18+(mission.index%4)*4,label:layout.labels[i%layout.labels.length]});
  for(const[x,y]of layout.cars)add(x,y,58,112,'car',95,{variant:mission.theme==='checkpoint'||mission.theme==='armory'?'patrol':'civilian',height:27});
  for(const[x,y]of layout.barrels)add(x,y,30,30,'barrel',22,{height:25});
  for(const rect of layout.fences)add(...rect,'fence',Infinity,{height:42});
  for(let i=0;i<70;i++)decor.push({x:random()*2400,y:random()*1800,kind:'rubble',seed:random()});
  for(const[x,y]of [[585,820],[1835,825],[585,1060],[1840,1075],[1070,470],[1330,470],[1090,1360]])decor.push({x,y,kind:'lamp'});
  for(const[x,y]of [[1020,805],[1380,1080],[570,1090],[1840,805]])decor.push({x,y,kind:'hydrant'});
  for(const[x,y]of [[1010,785],[1390,1100],[1040,1300],[1850,1100]])decor.push({x,y,kind:'trash',seed:random()});
  decor.push({x:1060,y:830,kind:'sign',label:layout.labels[0]});
  decor.push({x:1320,y:495,kind:'sign',label:'EVACUATION'});
  const roads=layout.roads.map(([x,y,w,h,axis])=>({x,y,w,h,axis}));
  return{width:2400,height:1800,obstacles,decor,roads,theme:mission.theme,palette:mission.mapPalette,missionId:mission.id,missionIndex:mission.index,exit:{x:1200,y:510,open:false},spawn:{x:1200,y:930},seed:seed+mission.index};
}
