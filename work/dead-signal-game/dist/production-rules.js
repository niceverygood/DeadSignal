const own=(value,key)=>!!value&&Object.hasOwn(value,key);
const numeric=['x','y','w','h','height'];
export function validEnvironmentRule(rule){
  return !!rule&&['theme','kind','variant','entry'].every(key=>typeof rule[key]==='string')
    &&/^[a-zA-Z0-9_-]+$/.test(rule.entry)
    &&(!own(rule,'label')||typeof rule.label==='string')
    &&numeric.every(key=>!own(rule,key)||Number.isFinite(rule[key]));
}
// Select existing objects by their immutable layout. Never rewrite an object
// or use generated actor IDs as persistent art selectors.
export function matchesEnvironmentRule(rule,object,world){
  if(!validEnvironmentRule(rule)||!object)return false;
  if(rule.theme!=='*'&&rule.theme!==String(world?.theme||''))return false;
  if(rule.kind!==object.kind)return false;
  if(rule.variant!=='*'&&rule.variant!==String(object.variant||''))return false;
  if(own(rule,'label')&&rule.label!==String(object.label||''))return false;
  return numeric.every(key=>!own(rule,key)||Number.isFinite(object[key])&&Math.abs(rule[key]-object[key])<1e-5);
}
