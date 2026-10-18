const DEFAULT_STRING_LIMIT=256;

// Cache only the immutable ID enumeration, never readiness, loading promises,
// selected frames or actors. Object keys are weak; string keys have a fixed cap.
export class NativeCatalogIds {
 constructor({maxStringEntries=DEFAULT_STRING_LIMIT}={}){
  this.objectIds=new WeakMap();this.stringIds=new Map();
  this.maxStringEntries=Number.isFinite(maxStringEntries)?Math.max(0,Math.floor(maxStringEntries)):DEFAULT_STRING_LIMIT;
  this.stats={enumerations:0,hits:0};
 }
 get(mapping,forceEnumeration=false){
  const string=typeof mapping==='string',object=mapping!==null&&typeof mapping==='object';
  if(!forceEnumeration){
   const cached=string?this.stringIds.get(mapping):object?this.objectIds.get(mapping):undefined;
   if(cached){this.stats.hits++;return cached;}
  }
  this.stats.enumerations++;
  // Keep Object.values exceptions, key order and Set's SameValueZero/identity
  // semantics, including unusual input values. Do not deep-freeze those values.
  const ids=Object.freeze([...new Set(string?[mapping]:Object.values(mapping))]);
  if(forceEnumeration)return ids;
  if(string&&this.maxStringEntries){
   if(this.stringIds.size>=this.maxStringEntries)this.stringIds.delete(this.stringIds.keys().next().value);
   this.stringIds.set(mapping,ids);
  }else if(object&&Object.isFrozen(mapping)){
   // Frozen accessors may still return changing values or throw on a later
   // read. They must keep the original enumeration path on every invocation.
   const descriptors=Object.getOwnPropertyDescriptors(mapping);
   if(Object.values(descriptors).every(property=>!property.enumerable||Object.hasOwn(property,'value')))this.objectIds.set(mapping,ids);
  }
  return ids;
 }
}
