// Explicit QA-only memory mode exercises the real app without touching saved profiles.
const memoryStores=new WeakSet();
export const isQAMemoryStorage=storage=>!!storage&&memoryStores.has(storage);
export function createQAStorage(query,storage=()=>localStorage){
 if(query.has('qa-memory')){const values=new Map(),memory={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};memoryStores.add(memory);return memory;}
 if(!query.has('qa'))return undefined;
 return {getItem:key=>storage().getItem(key+'.qa'),setItem:(key,value)=>storage().setItem(key+'.qa',value)};
}
