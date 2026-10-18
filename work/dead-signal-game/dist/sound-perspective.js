export function soundPerspective(source,listener){
  if(!source||!listener||![source.x,source.y,listener.x,listener.y].every(Number.isFinite))return {pan:0,gain:1};
  const dx=source.x-listener.x,dy=source.y-listener.y,distance=Math.hypot(dx,dy);
  return {pan:Math.max(-.85,Math.min(.85,(dx-dy)*Math.sqrt(3)/2/460)),gain:Math.max(.18,1/(1+distance/360))};
}
