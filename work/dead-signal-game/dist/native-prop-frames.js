import {nativeFenceCells} from './production-fences.js?v=0.29.0';
import {matchesEnvironmentRule} from './production-rules.js?v=0.29.0';

// Geometry selections only: keep drawing the original atlas at its original
// resolution. Weak keys release a previous world without retaining its props.
export class NativePropFrames {
  constructor(){this.frames=new WeakMap();this.fences=new WeakMap();this.entries=new WeakMap();}
  entry(rules,object,world){
    if(!object||typeof object!=='object')return null;
    // Runtime rule catalogs are immutable; a replacement catalog has a new
    // array identity. Recheck every layout/route field used by the matcher.
    const values=[rules,world?.theme,world?.expeditionId,object.kind,object.variant,object.label,object.x,object.y,object.w,object.h,object.height];
    const cached=this.entries.get(object);
    if(cached&&values.every((value,i)=>Object.is(value,cached.values[i])))return cached.entry;
    const entry=rules.find(rule=>matchesEnvironmentRule(rule,object,world))?.entry||null;
    this.entries.set(object,{values,entry});return entry;
  }
  frame(art,entry,object){
    const record=art.get(art.manifest.environment?.[entry]);
    if(!record){this.frames.delete(object);return null;}
    const values=[art,entry,record.image,record.bodyAlpha,record.metadata,object.x,object.y,object.w,object.h,object.angle||0];
    const cached=this.frames.get(object);
    if(cached&&values.every((value,i)=>Object.is(value,cached.values[i])))return cached.selected;
    const selected=art.propFrame(entry,object);
    if(selected)this.frames.set(object,{values,selected});else this.frames.delete(object);
    return selected;
  }
  fenceSections(art,entry,object,native){
    const cached=this.fences.get(object);
    if(cached?.native===native&&cached.art===art&&cached.entry===entry)return cached.sections;
    const cells=nativeFenceCells(object,native.placement.footprint.native);
    const sections=cells?cells.map(footprint=>art.propFrame(entry,object,{footprint})).sort((a,b)=>(a?.placement.foot.y||0)-(b?.placement.foot.y||0)):[native];
    this.fences.set(object,{native,art,entry,sections});return sections;
  }
}
