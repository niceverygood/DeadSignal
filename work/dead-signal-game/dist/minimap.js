import {project as worldProject} from './projection.js?v=0.29.0';

const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const size=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;

/** Fit the ground diamond into a canvas rectangle using the main camera axes. */
export function makeMinimapProjection(world,options={}){
  const rect=options&&typeof options==='object'?options:{};
  const width=size(rect.width,160),height=size(rect.height,112);
  const x=finite(rect.x,0),y=finite(rect.y,0);
  const padding=Math.min(Math.max(0,finite(rect.padding,8)),Math.max(0,(Math.min(width,height)-1)/2));
  const worldWidth=size(world?.width,1),worldHeight=size(world?.height,1);
  const raw=[[0,0],[worldWidth,0],[worldWidth,worldHeight],[0,worldHeight]].map(([wx,wy])=>worldProject(wx,wy));
  const minX=Math.min(...raw.map(p=>p.x)),maxX=Math.max(...raw.map(p=>p.x));
  const minY=Math.min(...raw.map(p=>p.y)),maxY=Math.max(...raw.map(p=>p.y));
  const rawWidth=maxX-minX,rawHeight=maxY-minY,innerWidth=width-padding*2,innerHeight=height-padding*2;
  const scale=Math.min(innerWidth/rawWidth,innerHeight/rawHeight);
  const offsetX=x+padding+(innerWidth-rawWidth*scale)/2-minX*scale;
  const offsetY=y+padding+(innerHeight-rawHeight*scale)/2-minY*scale;
  const project=(wx,wy)=>{
    const point=worldProject(finite(wx,0),finite(wy,0));
    return{x:point.x*scale+offsetX,y:point.y*scale+offsetY};
  };
  const heading=angle=>{
    const a=finite(angle,0),forward=worldProject(Math.cos(a),Math.sin(a));
    return Math.atan2(forward.y,forward.x);
  };
  return{
    project,heading,scale,
    corners:raw.map(p=>({x:p.x*scale+offsetX,y:p.y*scale+offsetY})),
    bounds:{x:minX*scale+offsetX,y:minY*scale+offsetY,width:rawWidth*scale,height:rawHeight*scale},
    viewport:{x,y,width,height,padding}
  };
}

/** Terrain cache identity excludes actors, damage, exit state and RNG state. */
export function layoutKey(world){
  return JSON.stringify([
    world?.width,world?.height,world?.theme,
    (world?.obstacles||[]).map(o=>[o.id,o.x,o.y,o.w,o.h,o.kind,!!o.destroyed]),
    (world?.roads||[]).map(r=>[r.x,r.y,r.w,r.h,r.axis])
  ]);
}
