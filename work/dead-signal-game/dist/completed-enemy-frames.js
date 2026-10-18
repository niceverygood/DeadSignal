// Retain only observed, fully finished original native death images. Private
// copies cannot change when the twelve-slot live rig atlas is reused.
export class CompletedEnemyFrames{
 constructor({limit=12,createImage=()=>document.createElement('canvas')}={}){this.limit=Math.max(1,Math.min(12,Math.floor(limit)||12));this.createImage=createImage;this.entries=new Map();this.epoch=null;}
 observe(world,corpses=[]){if(this.epoch!==world){this.epoch=world;this.entries.clear();}const active=new Set(corpses);for(const [corpse]of this.entries)if(!active.has(corpse)||corpse.time<=0)this.entries.delete(corpse);}
 get(corpse,height){const entry=this.entries.get(corpse);if(!entry)return null;if(entry.angle!==corpse.angle||entry.height!==height){this.entries.delete(corpse);return null;}this.entries.delete(corpse);this.entries.set(corpse,entry);return entry.selected;}
 remember(corpse,selected,height){
  const animation=selected?.metadata?.animation,frame=selected?.frame;
  if(corpse.bossKey||selected?.settledDeath!==true||!selected.metadata.liveRig||animation?.loop!==false||!/death/i.test(animation.name||'')||frame?.sample!==animation.samples-1||selected.image?.width!==256||selected.image?.height!==256)return null;
  const existing=this.get(corpse,height);if(existing)return existing;
  const image=this.createImage();image.width=image.height=256;const c=image.getContext('2d');if(!c)return null;c.drawImage(selected.image,0,0);
  const copy={...selected,image,bodyAlpha:null,completedNativeDeath:true};this.entries.set(corpse,{angle:corpse.angle,height,selected:copy});while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value);return copy;
 }
}
