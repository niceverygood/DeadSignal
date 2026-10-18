import test from 'node:test';import assert from 'node:assert/strict';import {Game} from '../dist/engine.js';import {drawWeaponImpact,drawWeaponMuzzle} from '../dist/weapon-impact.js';
import {weaponImpactEnvelope} from '../dist/weapon-impact.js';
test('flesh contact light ends promptly while physical blood and armored ricochets remain distinct',()=>{
 const colors=[],c=new Proxy({save(){},restore(){},stroke(){colors.push(this.strokeStyle);},createRadialGradient(){return {addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 const p={kind:'weapon-impact',x:0,y:0,z:18,angle:0,weapon:'shotgun',maxLife:.3,life:.14};
 drawWeaponImpact(c,p);assert.ok(colors.length>0);assert.ok(colors.every(color=>['#903c35','#562a28'].includes(color)),'late flesh shows blood trails rather than a luminous ring');
 colors.length=0;drawWeaponImpact(c,{...p,shielded:true});assert.ok(colors.includes('#bceaff'));
 colors.length=0;drawWeaponImpact(c,{...p,life:.295});assert.ok(colors.includes('#fff7d9'),'initial flesh contact retains a strong flash');
});
test('contact gives way to a wider shock ring and fragments without losing weapon identity',()=>{
  const p={weapon:'shotgun',life:.3,maxLife:.3,hits:1};
  const start=weaponImpactEnvelope(p),mid=weaponImpactEnvelope({...p,life:.18}),end=weaponImpactEnvelope({...p,life:0});
  assert.equal(start.contact,1);assert.equal(start.ring,0);assert.equal(mid.contact,0);assert.ok(mid.ring>.5);
  assert.equal(end.contact,0);assert.equal(end.ring,0);
  const light=weaponImpactEnvelope({...p,weapon:'nailgun'});assert.ok(start.radius>light.radius);assert.ok(start.fragments>light.fragments);
  assert.ok(weaponImpactEnvelope({...p,lethal:true}).radius>start.radius);
});
test('longer shotgun follow-through expires and restores while damage and RNG stay exact',()=>{
  for(const weapon of ['shotgun','nailgun']){
    const g=new Game({seed:774,weapon}),e=g.spawnEnemy('walker',300);Object.assign(e,{hp:500,maxHp:500});
    const rng=g.random.getState();g.damageEnemy(e,10,{x:45,y:0},{x:e.x-40,y:e.y});
    const p=g.particles.find(p=>p.kind==='weapon-impact');assert.equal(p.maxLife,weapon==='shotgun'?.3:.24);
    assert.equal(e.hp,490);assert.equal(g.random.getState(),rng);assert.ok(Game.restore(g.snapshot()));
  }
});
test('pellet impacts merge per target without altering damage, knockback, or combat RNG',()=>{const g=new Game({seed:774}),e=g.spawnEnemy('walker',300);Object.assign(e,{hp:500,maxHp:500,x:1250,y:930});const random=g.random.getState();for(let i=0;i<6;i++)g.damageEnemy(e,10,{x:45,y:0},{x:1200,y:930});assert.equal(e.hp,440);assert.equal(e.vx,270);assert.equal(g.random.getState(),random);const impacts=g.particles.filter(p=>p.kind==='weapon-impact');assert.equal(impacts.length,1);assert.equal(impacts[0].hits,6);assert.ok(Game.restore(g.snapshot()));});
test('burn does not create fake bullet impacts and shield feedback remains distinct',()=>{const g=new Game({seed:774}),e=g.spawnEnemy('shield',300);Object.assign(e,{hp:500,maxHp:500,x:1250,y:930,angle:Math.PI});g.damageEnemy(e,10);assert.equal(g.particles.filter(p=>p.kind==='weapon-impact').length,0);g.damageEnemy(e,10,{x:45,y:0},{x:1200,y:930});const p=g.particles.find(p=>p.kind==='weapon-impact');assert.equal(p.shielded,true);assert.equal(g.events.filter(e=>e.type==='hit').at(-1).shielded,true);});
test('weapon effects restore canvas state and never mutate supplied actors/particles',()=>{let depth=0,strokes=0;const raw={save(){depth++;},restore(){depth--;},createRadialGradient(){return {addColorStop(){}};},stroke(){strokes++;}};const c=new Proxy(raw,{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>{o[k]=v;return true;}});const p={kind:'weapon-impact',x:1200,y:930,life:.15,maxLife:.22,angle:0,weapon:'shotgun',hits:3};const before=JSON.stringify(p);assert.equal(drawWeaponImpact(c,p),true);assert.equal(drawWeaponMuzzle(c,{point:{x:10,y:10},angle:0,weapon:'shotgun',recoil:.1}),true);assert.equal(depth,0);assert.ok(strokes>5);assert.equal(JSON.stringify(p),before);assert.equal(drawWeaponImpact(c,{...p,life:0}),false);});

test('material contact separates gold ricochets from masonry dust and restores at every age',()=>{
 for(const surface of ['metal','concrete'])for(const weapon of ['shotgun','nailgun'])for(const age of [0,.2,.5,.85]){
  let depth=0,strokes=0,fills=0;const colors=[];
  const raw={save(){depth++;},restore(){depth--;},stroke(){strokes++;colors.push(this.strokeStyle);},fill(){fills++;},fillRect(){fills++;}};
  const c=new Proxy(raw,{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>{o[k]=v;return true;}});
  const p={kind:'weapon-impact',surface,weapon,x:100,y:100,angle:.7,life:.2*(1-age),maxLife:.2,shielded:surface==='metal'};
  const before=JSON.stringify(p);assert.equal(drawWeaponImpact(c,p),true);assert.equal(depth,0);assert.equal(JSON.stringify(p),before);
  if(surface==='metal'){assert.equal(strokes,weapon==='shotgun'?12:8);assert.ok(colors.includes('#ffb34c'));assert.ok(!colors.includes('#bceaff'));}else{assert.ok(fills>=13);assert.equal(strokes,1);}
 }
});
