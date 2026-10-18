// Exact six current-engine outcomes from the preserved existing equipment test.
// Root runner only: node qa/boss-motion-20261018/reproduce-equipment-boss-outcomes.mjs [output.json]
// This does not run the test module or relax/execute its pairwise assertions.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const beforeURL=new URL('./equipment-engine-test-before.txt',import.meta.url);
const engineURL=new URL('../../work/dead-signal-game/dist/engine.js',import.meta.url);
const output=process.argv[2]?resolve(process.argv[2]):new URL('./equipment-boss-outcomes.json',import.meta.url);
const FIXTURE_SHA='877867c28ead95fc0b570880ab6721ae5285e37dcecfb228e127845b959708af';
const ENGINE_SHA='3551287930debc315d25fd6ef9c5c51e0bf41af98f22f872ea485e5a6888df79';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const caught=error=>({name:typeof error?.name==='string'?error.name:'Error',message:typeof error?.message==='string'?error.message:String(error),stack:typeof error?.stack==='string'?error.stack:''});
const report={createdAt:new Date().toISOString(),runtime:process.version,status:'observing',fixtureSHA256:FIXTURE_SHA,engineSHA256:ENGINE_SHA,
  note:'Read-only outcome diagnosis of the exact preserved test fixture. The original run arrow body, legendary loadout builder and shots helper are extracted without rewriting their simulation logic. Real engine shooting, boss damage/skills, natural death, equipment revival, XP and offered upgrade choices stay live; the existing clear-arena/isolated-spawn positioning remains exactly as in the test. No new HP, invulnerability, balance tuning, inputs or rendering is introduced. Fewer shots/time at an earlier death is recorded as an incomparable efficiency outcome, not a better victory.',
  cases:[],comparisons:[],errors:[]};
try{
 const [fixtureBytes,engineBytes]=await Promise.all([readFile(beforeURL),readFile(engineURL)]);
 assert.equal(hash(fixtureBytes),FIXTURE_SHA,'independent preserved whole equipment test');assert.equal(hash(engineBytes),ENGINE_SHA,'approved current engine remains frozen');
 const source=fixtureBytes.toString('utf8');
 const caseMarker="test('three controlled real middle-and-final boss battles improve with the fixed legendary loadout',t=>{";
 const caseIndex=source.indexOf(caseMarker);assert.ok(caseIndex>=0&&source.indexOf(caseMarker,caseIndex+1)<0,'one original target case');
 const runStart=source.indexOf('const run=(missionId,equipped)=>{',caseIndex);
 const runEnd=source.indexOf("\n  };\n  for(const missionId of ['mission-01','mission-05','mission-12'])",runStart);
 // The frozen file uses CRLF; convert only this extraction delimiter's newline,
 // then preserve the function body's original text in the resulting function.
 let arrow;
 if(runEnd>=0)arrow=source.slice(runStart+'const run='.length,runEnd+4).trim().replace(/;$/,'');
 else{
  const end=source.indexOf("\r\n  };\r\n  for(const missionId of ['mission-01','mission-05','mission-12'])",runStart);
  assert.ok(runStart>=0&&end>runStart,'exact original run arrow boundaries');arrow=source.slice(runStart+'const run='.length,end+5).trim().replace(/;$/,'');
 }
 assert.ok(arrow.startsWith('(missionId,equipped)=>{')&&arrow.endsWith('}'),'complete original arrow body');
 const helpersStart=source.indexOf('function loadout(entries){'),helpersEnd=source.indexOf('function fresh(options={}){',helpersStart);assert.ok(helpersStart>=0&&helpersEnd>helpersStart);
 const shotStart=source.indexOf('const shots=game=>'),shotEnd=source.indexOf(';',shotStart);assert.ok(shotStart>=0&&shotEnd>shotStart);
 const [{Game},{Navigation},{EQUIPMENT}]=await Promise.all([import(engineURL.href),import(new URL('./navigation.js',engineURL).href),import(new URL('./equipment.js',engineURL).href)]);
 const legendary=new Function('EQUIPMENT',source.slice(helpersStart,helpersEnd)+'\nreturn legendary;')(EQUIPMENT);
 const shots=new Function(source.slice(shotStart,shotEnd+1)+'\nreturn shots;')();
 const run=new Function('Game','Navigation','legendary','shots','assert','return ('+arrow+');')(Game,Navigation,legendary,shots,assert);
 report.extractedRunSHA256=hash(arrow);report.extractedFixtureLength=arrow.length;
 for(const missionId of ['mission-01','mission-05','mission-12']){
  for(const equipped of [false,true]){
   const entry={missionId,equipped};try{entry.outcome=run(missionId,equipped);}catch(error){entry.error=caught(error);report.errors.push({missionId,equipped,...entry.error});}report.cases.push(entry);
  }
  const bare=report.cases.find(entry=>entry.missionId===missionId&&!entry.equipped)?.outcome,equipped=report.cases.find(entry=>entry.missionId===missionId&&entry.equipped)?.outcome;
  if(bare&&equipped)report.comparisons.push({missionId,bareWon:bare.won,equippedWon:equipped.won,bareDefeats:bare.defeated.length,equippedDefeats:equipped.defeated.length,bareHP:bare.hp,equippedHP:equipped.hp,
    equippedCompletesPair:equipped.won&&equipped.mid&&equipped.defeated.length===2,hpImproved:equipped.hp>bare.hp,
    originalShotsAssertion:equipped.shots<bare.shots,originalTimeAssertion:equipped.time<bare.time,
    efficiencyComparable:bare.won&&equipped.won,
    survivalSuccessWhenBareLoses:!bare.won&&bare.hp===0&&bare.defeated.length<equipped.defeated.length&&equipped.won,
    interpretation:bare.won?'Both runs won: original strict fewer-shots and faster-completion comparisons remain meaningful.':'Bare run lost: its shorter survival/fewer fired shots must not be treated as a faster or more efficient victory.'});
 }
 report.status=report.errors.length?'error':'observed';if(report.errors.length)process.exitCode=1;
}catch(error){report.status='error';report.errors.push(caught(error));process.exitCode=1;}
await writeFile(output,JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify(report,null,2));