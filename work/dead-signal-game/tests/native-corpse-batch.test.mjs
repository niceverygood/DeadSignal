import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../dist/renderer.js';
import {selectLiveEnemies,selectLiveCorpses} from '../dist/live-enemy-selection.js';

test('fresh death poses share the living atlas and retain the total twelve-pose budget',()=>{
 const game={state:'playing',time:4,player:{x:0,y:0},enemies:Array.from({length:9},(_,id)=>({id,type:'walker',x:40+id,y:0})),corpses:Array.from({length:8},(_,seed)=>({seed,type:'walker',x:50+seed,y:0,duration:12,time:11.5}))};
 const trace=[],r=Object.create(Renderer.prototype);r.liveEnemySelection=selectLiveEnemies(game);r.liveCorpseSelection=selectLiveCorpses(game,12-r.liveEnemySelection.size);
 r.liveEnemies={beginBatch:n=>trace.push(['begin',n]),endBatch:()=>trace.push(['end'])};
 r.nativeEnemyFrame=(e,time,g)=>{assert.equal(g,game);assert.equal(time,4);trace.push(['alive',e]);r.enemyLiveFrames=(r.enemyLiveFrames||0)+1;};
 r.nativeCorpseFrame=(c,g,now)=>{assert.equal(g,game);assert.equal(now,8);trace.push(['death',c]);r.enemyLiveFrames++;r.enemyLiveCorpseFrames=(r.enemyLiveCorpseFrames||0)+1;};
 const before=JSON.stringify(game);r.prepareNativeEnemyBatch(game,4,8);
 assert.equal(trace[0][1],12);assert.equal(trace.filter(x=>x[0]==='alive').length,9);assert.equal(trace.filter(x=>x[0]==='death').length,3);assert.deepEqual(trace.at(-1),['end']);assert.equal(r.enemyLiveFrames,0);assert.equal(r.enemyLiveCorpseFrames,0);assert.equal(JSON.stringify(game),before);
 // Corpse-only frames must also batch, while victory keeps its existing
 // wall-clock final death continuation outside the playing prepass.
 trace.length=0;r.liveEnemySelection=new Set();r.prepareNativeEnemyBatch(game,4,8);assert.equal(trace[0][1],3);
 trace.length=0;game.state='victory';r.prepareNativeEnemyBatch(game,4,8);assert.equal(trace.length,0);
});

test('atlas failures release batch state and reset budgets for the original fallback draw',()=>{
 const r=Object.create(Renderer.prototype),trace=[];r.liveEnemySelection=new Set([{}]);r.liveCorpseSelection=new Set([{}]);r.liveEnemies={beginBatch:()=>{},endBatch:()=>trace.push('end')};
 r.nativeEnemyFrame=()=>{r.enemyLiveFrames=1;throw Error('render failure');};r.productionDataset=d=>trace.push(d.productionEnemyRigError);r.enemyLiveCorpseFrames=2;
 r.prepareNativeEnemyBatch({state:'playing'},0,0);assert.deepEqual(trace,['end','render failure']);assert.equal(r.enemyLiveFrames,0);assert.equal(r.enemyLiveCorpseFrames,0);
});
