export class RigFramePool{
 constructor(create){this.create=create;this.slots=[];}
 reserve(count){while(this.slots.length<count)this.slots.push({...this.create(),owner:null});}
 claim(index,actor){this.reserve(index+1);const slot=this.slots[index];slot.owner=actor;return slot;}
 valid(cache,actor){return !cache?.pool||cache.pool.owner===actor;}
}
