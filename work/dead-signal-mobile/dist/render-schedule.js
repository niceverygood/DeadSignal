// Only controls Canvas drawing. Simulation, input, saving and DOM updates keep
// their own clocks, including while a menu covers the Canvas.
export class RenderSchedule {
  constructor(){this.lastRendered=null;this.key=null;this.dirty=true;}
  invalidate(){this.dirty=true;}
  shouldRender(now,{playing=false,hidden=false,covered=false,key=''}={}){
    if(!Number.isFinite(now))return false;
    if(key!==this.key||(this.lastRendered!==null&&now<this.lastRendered)){
      this.key=key;this.dirty=true;
    }
    // Retain a pending refresh while invisible, and draw immediately on return.
    if(hidden||covered){this.dirty=true;return false;}
    if(playing||this.dirty||this.lastRendered===null||now-this.lastRendered>=100){
      this.lastRendered=now;this.dirty=false;return true;
    }
    return false;
  }
}
