import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesEnvironmentRule,validEnvironmentRule} from '../dist/production-rules.js';
import {createCity} from '../dist/world.js';
test('a canonical art rule matches only its original layout instance despite repeated label and variant',()=>{
  let id=0;const world=createCity({missionId:'mission-01',random:()=>.5,nextId:()=>++id});
  const before=JSON.stringify(world),rule={theme:'demolition',kind:'building',variant:'shop',label:'DEMOLITION',x:665,y:570,w:355,h:180,height:92,entry:'env-demolition-scaffold-bay'};
  const matches=world.obstacles.filter(o=>matchesEnvironmentRule(rule,o,world));assert.equal(matches.length,1);
  assert.equal(world.obstacles.filter(o=>o.label===rule.label).length,2);
  assert.equal(matchesEnvironmentRule({...rule,x:666},matches[0],world),false);
  assert.equal(JSON.stringify(world),before);
});
test('invalid exact fields fail closed and omitted fields preserve existing broad selection',()=>{
  const rule={theme:'*',kind:'lamp',variant:'*',entry:'lamp'},object={kind:'lamp',x:20,y:30};
  assert.equal(matchesEnvironmentRule(rule,object,{theme:'harbor'}),true);
  for(const bad of [NaN,Infinity,'20',null]){assert.equal(validEnvironmentRule({...rule,x:bad}),false);assert.equal(matchesEnvironmentRule({...rule,x:bad},object,{}),false);}
  assert.equal(matchesEnvironmentRule({...rule,height:80},object,{}),false);
  assert.equal(matchesEnvironmentRule({...rule,label:'A'},object,{}),false);
});
