const positive=value=>Number.isFinite(value)&&value>0;
const EPSILON=1e-12;
const tier=occupancy=>occupancy+EPSILON>=.8?2:occupancy+EPSILON>=.75?1:0;

function better(a,b){
  if(!b)return true;
  const quality=tier(a.occupancy),other=tier(b.occupancy);
  if(quality!==other)return quality>other;
  // Favor the fewest complete houses once the preferred coverage is met.
  if(quality&&a.count!==b.count)return a.count<b.count;
  if(!quality&&Math.abs(a.occupancy-b.occupancy)>EPSILON)return a.occupancy>b.occupancy;
  if(Math.abs(a.aspectError-b.aspectError)>EPSILON)return a.aspectError<b.aspectError;
  if(a.count!==b.count)return a.count<b.count;
  if(a.columns!==b.columns)return a.columns<b.columns;
  return a.rows<b.rows;
}

/** Connected visual house modules inside one existing collision rectangle.
 * All cells share a uniform native scale; their edges touch, so no apparent
 * internal alley is introduced. Unavoidable aspect-ratio margins stay outside
 * the block. Only the generic-brick renderer should call this helper; special
 * landmarks retain their own single native model. No collider is created.
 */
export function nativeBuildingCells(obstacle,native,maxWorldHeight=200){
  if(!obstacle||!native||Array.isArray(obstacle)||Array.isArray(native)
    ||!Number.isFinite(obstacle.x)||!Number.isFinite(obstacle.y)||!positive(obstacle.w)||!positive(obstacle.h)
    ||obstacle.destroyed===true||(obstacle.kind!==undefined&&obstacle.kind!=='building')
    ||!positive(native.width)||!positive(native.height)||!positive(native.subjectHeight)||!positive(maxWorldHeight))return null;
  const area=obstacle.w*obstacle.h;
  if(!positive(area)||!Number.isFinite(obstacle.x+obstacle.w)||!Number.isFinite(obstacle.y+obstacle.h)
    ||obstacle.x+obstacle.w<=obstacle.x||obstacle.y+obstacle.h<=obstacle.y)return null;
  let chosen=null;
  for(let columns=1;columns<=8;columns++)for(let rows=1;rows<=8;rows++){
    const scale=Math.min(obstacle.w/columns/native.width,obstacle.h/rows/native.height,maxWorldHeight/native.subjectHeight);
    const width=native.width*scale,height=native.height*scale;
    if(!positive(scale)||!positive(width)||!positive(height))continue;
    const count=columns*rows,occupancy=Math.min(1,width*height*count/area);
    const aspectError=Math.abs(Math.log((width*columns)/(height*rows))-Math.log(obstacle.w/obstacle.h));
    if(!Number.isFinite(occupancy)||!Number.isFinite(aspectError))continue;
    const candidate={columns,rows,count,scale,width,height,occupancy,aspectError};
    if(better(candidate,chosen))chosen=candidate;
  }
  if(!chosen)return null;
  const {columns,rows,scale,width,height,occupancy}=chosen;
  const bounds=Object.freeze({x:obstacle.x+(obstacle.w-width*columns)/2,y:obstacle.y+(obstacle.h-height*rows)/2,w:width*columns,h:height*rows});
  const cells=[];
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++)
    cells.push(Object.freeze({x:bounds.x+column*width,y:bounds.y+row*height,w:width,h:height}));
  return Object.freeze({columns,rows,scale,worldHeight:Math.min(maxWorldHeight,native.subjectHeight*scale),occupancy,bounds,cells:Object.freeze(cells)});
}
