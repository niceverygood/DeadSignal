import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderAttribution} from '../dist/qa-render-attribution.js';

// Unwrapped original methods and a deterministic clock form the protocol and
// nested-duration oracle. This is not native Canvas/GL or timing evidence.
const descriptors=object=>Object.getOwnPropertyDescriptors(object);
const outcome=call=>{try{return{returned:call()};}catch(error){return{error};}};
function fixture(){
 let time=0,canvasReads=0;const calls=[],result={originalResult:true},image={originalAtlas:true},ctx=new Proxy({},{get(){canvasReads++;throw Error('no Canvas calls or queries');}});
 const selected={id:'walker-original',metadata:{format:'meshy-iso-sprite-atlas'},image,frame:{rect:{x:0,y:0,width:256,height:256}},placement:{x:20,y:30,width:48,height:72}};
 const art={drawFrame(...args){calls.push(['art.drawFrame',this,args]);time+=8;return true;}};
 const renderer={productionArt:art,ctx,liveEnemies:{size:256,models:new Map(),pending:new Map(),renderer:{info:{render:{frame:0}}}},liveEnemySelection:new Set(),
  makeFloor(...args){calls.push(['makeFloor',this,args]);time+=5;return result;},
  drawEnemy(...args){calls.push(['drawEnemy',this,args]);time+=6;const drawn=this.productionArt.drawFrame(this.ctx,selected);time+=7;return drawn;},
  render(...args){calls.push(['render',this,args]);time+=2;this.makeFloor(...args);time+=3;this.drawEnemy(...args);time+=4;return result;}};
 return{renderer,art,ctx,selected,calls,result,now:()=>time,advance:n=>{time+=n;},get time(){return time;},get canvasReads(){return canvasReads;}};
}
function primitive(value,seen=new Set()){
 if(value===null||['undefined','boolean','string'].includes(typeof value))return;
 if(typeof value==='number'){assert.ok(Number.isFinite(value));return;}
 assert.equal(typeof value,'object');assert.ok(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype);assert.equal(seen.has(value),false);seen.add(value);
 for(const d of Object.values(Object.getOwnPropertyDescriptors(value))){assert.ok('value'in d);primitive(d.value,seen);}seen.delete(value);
}

test('original methods run once with identical receiver, arguments, result and protocol while nested self time excludes direct child spans',()=>{
 const plain=fixture(),observed=fixture(),argument={type:'walker',id:4};let applyReads=0;
 Object.defineProperty(observed.renderer.makeFloor,'apply',{get(){applyReads++;throw Error('a direct original method never reads its apply property');}});
 const rendererBefore=descriptors(observed.renderer),artBefore=descriptors(observed.art);
 const profiler=createRenderAttribution({renderer:observed.renderer,now:observed.now});profiler.beginFrame({frame:0,arm:'A1'});
 const actual=observed.renderer.render(argument,'tail'),expected=plain.renderer.render(argument,'tail');profiler.endFrame();assert.equal(actual,observed.result);assert.equal(expected,plain.result);
 const normalize=(entries,f)=>entries.map(([name,receiver,args])=>[name,receiver===f.renderer?'renderer':receiver===f.art?'art':'foreign',args.map(value=>value===f.ctx?'ctx':value===f.selected?'selected':value)]);
 assert.deepEqual(normalize(observed.calls,observed),normalize(plain.calls,plain));assert.equal(observed.canvasReads,0);assert.equal(applyReads,0);
 const report=profiler.stop(),sample=report.samples[0];assert.equal(sample.frameWallMs,35);
 for(const [label,inclusive,self]of [['renderer.render',35,9],['renderer.makeFloor',5,5],['renderer.drawEnemy',21,13],['production.drawFrame',8,8]]){assert.equal(sample.stages[label].calls,1,label);assert.equal(sample.stages[label].inclusiveMs,inclusive,label);assert.equal(sample.stages[label].selfMs,self,label);assert.equal(sample.stages[label].thrownCalls,0);assert.equal(sample.stages[label].falseReturns,0);}
 assert.deepEqual(descriptors(observed.renderer),rendererBefore);assert.deepEqual(descriptors(observed.art),artBefore);assert.equal(report.cleanupComplete,true);primitive(report);
});

test('throw identity, false returns, promises and foreign receiver calls retain their original synchronous behavior',()=>{
 const e=fixture(),marker=Error('original marker'),promise=Promise.resolve('original asynchronous result');let behavior='throw';
 e.renderer.makeFloor=function(...args){e.calls.push(['makeFloor',this,args]);e.advance(3);if(behavior==='throw')throw marker;if(behavior==='false')return false;return promise;};
 const profiler=createRenderAttribution({renderer:e.renderer,now:e.now});profiler.beginFrame({frame:0});assert.equal(outcome(()=>e.renderer.makeFloor(1,2)).error,marker);behavior='false';assert.equal(e.renderer.makeFloor(3),false);behavior='promise';assert.equal(e.renderer.makeFloor(4),promise);const foreign={foreign:true};assert.equal(e.renderer.makeFloor.call(foreign,5),promise);profiler.endFrame();const report=profiler.stop(),stage=report.samples[0].stages['renderer.makeFloor'];assert.equal(stage.thrownCalls,1);assert.equal(stage.falseReturns,1);assert.equal(e.calls.length,4);assert.equal(e.calls.at(-1)[1],foreign);primitive(report);
});

test('same-slot recursion has finite nonoverlapping self time and bounded original calls without any extra render or Canvas work',()=>{
 const e=fixture();e.renderer.render=function(depth){e.calls.push(['recursive',this,[depth]]);e.advance(1);if(depth>0)this.render(depth-1);e.advance(2);return depth;};
 const profiler=createRenderAttribution({renderer:e.renderer,now:e.now});profiler.beginFrame({frame:0});assert.equal(e.renderer.render(3),3);profiler.endFrame();const report=profiler.stop(),stage=report.samples[0].stages['renderer.render'];assert.equal(e.calls.length,4);assert.equal(stage.calls,4);assert.equal(stage.inclusiveMs,30);assert.equal(stage.selfMs,12);assert.equal(report.samples[0].frameWallMs,12);assert.equal(e.canvasReads,0);primitive(report);
});

test('overlapping observers stop in both orders and preserve full descriptors and later external replacements',()=>{
 for(const reverse of [false,true]){
  const e=fixture(),before=descriptors(e.renderer),artBefore=descriptors(e.art),descriptor={...Object.getOwnPropertyDescriptor(e.renderer,'makeFloor'),enumerable:false,writable:false};Object.defineProperty(e.renderer,'makeFloor',descriptor);
  const initial=descriptors(e.renderer),a=createRenderAttribution({renderer:e.renderer,now:e.now}),b=createRenderAttribution({renderer:e.renderer,now:e.now});a.beginFrame({frame:0});b.beginFrame({frame:0});e.renderer.makeFloor('first');a.endFrame();b.endFrame();const first=reverse?b:a,second=reverse?a:b;first.stop();second.beginFrame({frame:1});e.renderer.makeFloor('second');second.endFrame();second.stop();assert.equal(e.calls.length,2);assert.deepEqual(descriptors(e.renderer),initial);assert.deepEqual(descriptors(e.art),artBefore);
  assert.equal(Object.getOwnPropertyDescriptor(e.renderer,'makeFloor').writable,false);assert.equal(before.render.value,e.renderer.render);
 }
 for(const attributesOnly of [false,true]){const e=fixture(),originalRender=e.renderer.render,profiler=createRenderAttribution({renderer:e.renderer,now:e.now});profiler.beginFrame({frame:0});const d=Object.getOwnPropertyDescriptor(e.renderer,'render');assert.notEqual(d.value,originalRender,'the external edit must target an installed observer wrapper');const external=attributesOnly?{...d,enumerable:!d.enumerable}:{value:function(){return'external';},configurable:true,writable:false,enumerable:true};Object.defineProperty(e.renderer,'render',external);const report=profiler.stop();assert.deepEqual(Object.getOwnPropertyDescriptor(e.renderer,'render'),external);assert.equal(report.restoration.foreignPreserved,1);assert.equal(report.cleanupComplete,false);assert.ok(report.unmeasured.includes('restore.foreign-descriptor'));assert.equal(e.renderer.render('after-stop'),attributesOnly?e.result:'external');assert.equal(profiler.report().samples.length,0,'a preserved retired wrapper must not revive its stopped observer');primitive(report);}
});

test('disabled/accessor methods and poisoned metadata are not invoked by observation or reporting',()=>{
 let reads=0,clocks=0;const renderer=new Proxy({},{get(){reads++;throw Error('disabled owner read');},getOwnPropertyDescriptor(){reads++;throw Error('disabled descriptor read');}}),meta={get frame(){reads++;throw Error('disabled meta read');}};
 const disabled=createRenderAttribution({renderer,enabled:false,now(){clocks++;throw Error('disabled clock');}});disabled.beginFrame(meta);disabled.endFrame(meta);disabled.stop();assert.equal(reads,0);assert.equal(clocks,0);
 const e=fixture();Object.defineProperty(e.renderer,'makeFloor',{get(){reads++;throw Error('method accessor');},configurable:true});Object.defineProperties(e.selected,{metadata:{get(){reads++;throw Error('classification getter');},configurable:true},id:{get(){reads++;throw Error('id getter');},configurable:true}});
 const profiler=createRenderAttribution({renderer:e.renderer,now:e.now});profiler.beginFrame({frame:0,get secret(){reads++;throw Error('metadata getter');}});assert.equal(e.art.drawFrame(e.ctx,e.selected),true);profiler.endFrame();const report=profiler.stop();assert.equal(reads,0);assert.equal(e.calls.length,1);assert.equal(e.canvasReads,0);assert.ok(report.unmeasured.some(value=>String(value).includes('makeFloor')));primitive(report);
 const truthy={valueOf(){reads++;throw Error('boolean flags never coerce');},get [Symbol.toPrimitive](){reads++;throw Error('boolean flags never read conversion hooks');}},active=fixture(),normalized=createRenderAttribution({renderer:active.renderer,now:active.now,enabled:truthy});normalized.beginFrame({frame:0});active.renderer.makeFloor();normalized.endFrame();const normalizedReport=normalized.stop();assert.equal(normalizedReport.enabled,true);assert.equal(reads,0);primitive(normalizedReport);
});

test('bounded factory classifications distinguish original NPC/player/boss sources and follow Art/context changes only at frame boundaries',()=>{
 const e=fixture(),firstArtOriginal=e.art.drawFrame,marker=Error('original factory failure');let returned=e.selected;
 e.renderer.nativeEnemyFrame=function(...args){e.calls.push(['nativeEnemyFrame',this,args]);e.advance(2);if(returned===marker)throw marker;return returned;};
 e.renderer.nativePlayerFrame=function(){e.advance(2);return{id:'survivor-original-live-rig',metadata:{format:'meshy-iso-sprite-atlas'}};};
 const profiler=createRenderAttribution({renderer:e.renderer,now:e.now});profiler.beginFrame({frame:0});
 returned={id:'native-walker',metadata:{liveRig:true}};e.renderer.nativeEnemyFrame({type:'walker'});
 returned=e.selected;e.renderer.nativeEnemyFrame({type:'runner'});
 returned={id:'unknown-source',metadata:{}};e.renderer.nativeEnemyFrame({type:'not-a-registered-type'});
 returned=null;e.renderer.nativeEnemyFrame({type:'gas'});
 returned=marker;assert.equal(outcome(()=>e.renderer.nativeEnemyFrame({type:'shield'})).error,marker);
 returned=e.selected;e.renderer.nativeEnemyFrame({type:'elite'},0,{},{});e.renderer.nativePlayerFrame();profiler.endFrame();
 const frame=profiler.report().samples[0];assert.equal(frame.selections.npc.walker.native,1);assert.equal(frame.selections.npc.runner.baked,1);assert.equal(frame.selections.npc.other.unknown,1);assert.equal(frame.selections.npc.gas.none,1);assert.equal(frame.selections.npc.shield.thrown,1);assert.equal(frame.selections.boss.elite.baked,1);assert.equal(frame.selections.player.player.native,1);assert.equal(frame.readinessBefore.types.length,7);
 const nextArt={drawFrame(...args){e.calls.push(['nextArt',this,args]);e.advance(4);return true;}},nextBefore=descriptors(nextArt);e.renderer.productionArt=nextArt;e.renderer.ctx={originalSecondContext:true};
 profiler.beginFrame({frame:1});assert.equal(e.art.drawFrame,firstArtOriginal,'the retired first-Art dispatcher is removed before observing the new Art');assert.equal(nextArt.drawFrame(e.renderer.ctx,e.selected),true);profiler.endFrame();const report=profiler.stop();assert.equal(report.samples[1].stages['production.drawFrame'].calls,1);assert.deepEqual(descriptors(nextArt),nextBefore);assert.equal(e.art.drawFrame,firstArtOriginal);assert.equal(e.canvasReads,0);primitive(report);
});

test('forty dense original frames and thirty-two outliers bound reporting without retaining source/actor/context references',()=>{
 const e=fixture(),profiler=createRenderAttribution({renderer:e.renderer,now:e.now,limit:40,maxOutliers:32});let invoked=0;
 for(let frame=0;frame<45;frame++){profiler.beginFrame({frame,arm:'A1'});for(let actor=0;actor<180;actor++){e.renderer.drawEnemy({id:actor,type:['walker','runner','shield','screamer','gas','elite','collector'][actor%7]});invoked++;}profiler.endFrame();}
 const report=profiler.stop();assert.equal(report.samples.length,40);assert.ok(report.outliers.length<=32);assert.equal(e.calls.filter(([name])=>name==='drawEnemy').length,invoked);assert.equal(e.calls.filter(([name])=>name==='art.drawFrame').length,invoked);assert.equal(e.canvasReads,0);assert.equal(report.stopped,true);primitive(report);
});

test('clock failures and clock-triggered stop cannot replace the original return or throw, or revive stopped owner references',()=>{
 for(const kind of ['throw','nan','stop']){const e=fixture();let profiler,stopping=false;const now=()=>{if(kind==='throw')throw Error('observer clock');if(kind==='nan')return NaN;if(profiler&&!stopping){stopping=true;profiler.stop();}return e.time;};profiler=createRenderAttribution({renderer:e.renderer,now});profiler.beginFrame({frame:0});assert.equal(e.renderer.makeFloor('original'),e.result);profiler.endFrame();const report=profiler.stop();assert.equal(e.calls.length,1);assert.equal(e.canvasReads,0);primitive(report);}
 for(const stopAt of [2,3,4]){const e=fixture(),before=descriptors(e.renderer);let clockCalls=0,profiler;profiler=createRenderAttribution({renderer:e.renderer,now:()=>{if(++clockCalls===stopAt)profiler.stop();return e.time;}});profiler.beginFrame({frame:0});assert.equal(e.renderer.makeFloor('original'),e.result);profiler.endFrame();const report=profiler.stop();assert.equal(report.samples.length,0,'stop at observer clock '+stopAt+' must not publish an unfinished frame');assert.equal(report.stopped,true);assert.deepEqual(descriptors(e.renderer),before);assert.equal(e.calls.length,1);primitive(report);}
});
