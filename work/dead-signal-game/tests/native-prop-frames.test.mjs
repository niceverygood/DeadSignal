import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ProductionArt,validateAtlasMetadata} from '../dist/production-art.js';
import {productionManifest} from '../dist/production-manifest.js';
import {NativePropFrames} from '../dist/native-prop-frames.js';
test('cached environment rules retain null matches and invalidate every layout and route selector',()=>{
 const cache=new NativePropFrames(),object={kind:'building',variant:'brick',label:'A',x:1,y:2,w:3,h:4,height:5},world={theme:'city',expeditionId:'city'};
 const rule={theme:'city',expeditionId:'city',kind:'building',variant:'brick',label:'A',x:1,y:2,w:3,h:4,height:5,entry:'native'},rules=[rule];
 assert.equal(cache.entry(rules,object,world),'native');let scans=0;rules.find=(...args)=>{scans++;return Array.prototype.find.apply(rules,args);};
 for(let i=0;i<100;i++)assert.equal(cache.entry(rules,object,world),'native');assert.equal(scans,0);
 for(const key of Object.keys(object)){const value=object[key];object[key]=typeof value==='number'?value+1:value+'changed';assert.equal(cache.entry(rules,object,world),null,key);object[key]=value;assert.equal(cache.entry(rules,object,world),'native');}
 for(const key of ['theme','expeditionId']){const value=world[key];world[key]='other';assert.equal(cache.entry(rules,object,world),null,key);world[key]=value;assert.equal(cache.entry(rules,object,world),'native');}
 assert.equal(cache.entry([{...rule,entry:'replacement'}],object,world),'replacement');
 const empty=[];assert.equal(cache.entry(empty,object,world),null);empty.find=()=>{throw Error('a cached missing mapping must not rescan');};assert.equal(cache.entry(empty,object,world),null);
});
function fixture(){
 const entry='env-common-brick',id=productionManifest.environment[entry],art=new ProductionArt({manifest:productionManifest});
 const metadata=validateAtlasMetadata(JSON.parse(fs.readFileSync(new URL(`../dist/assets/production/${id}/metadata.json`,import.meta.url))));
 const record={status:'ready',metadata,image:{original:true},bodyAlpha:null};art.records.set(id,record);
 return {art,entry,record,id,cache:new NativePropFrames(),object:{kind:'fence',x:1430,y:535,w:180,h:26,angle:0}};
}
test('native prop cache preserves exact original atlas selections, draw coordinates and mutable layout invalidation',()=>{
 const {art,entry,record,object,cache}=fixture(),before=JSON.stringify(object);
 const original=art.propFrame(entry,object),selected=cache.frame(art,entry,object);assert.deepEqual(selected,original);
 for(let i=0;i<200;i++)assert.equal(cache.frame(art,entry,object),selected);
 const calls=[],context={globalAlpha:.27,save(){},restore(){},drawImage(...args){calls.push(args);}};
 art.drawFrame(context,original);art.drawFrame(context,selected);assert.deepEqual(calls[0],calls[1]);assert.equal(JSON.stringify(object),before);
 for(const key of ['x','y','w','h','angle']){const previous=cache.frame(art,entry,object);object[key]+=.5;const next=cache.frame(art,entry,object);assert.notEqual(next,previous,key);assert.deepEqual(next,art.propFrame(entry,object));}
 const old=cache.frame(art,entry,object);record.image={replacement:true};assert.notEqual(cache.frame(art,entry,object),old);
 record.status='loading';assert.equal(cache.frame(art,entry,object),null);record.status='ready';assert.ok(cache.frame(art,entry,object));
});
test('repeated fence sections reuse original frames without new selections and rebuild when the native placement changes',()=>{
 const {art,entry,object,cache}=fixture();let native=cache.frame(art,entry,object),sections=cache.fenceSections(art,entry,object,native);assert.ok(sections.length>1);
 const original=art.propFrame.bind(art);let calls=0;art.propFrame=(...args)=>{calls++;return original(...args);};
 for(let i=0;i<100;i++)assert.equal(cache.fenceSections(art,entry,object,cache.frame(art,entry,object)),sections);assert.equal(calls,0);
 object.w+=50;native=cache.frame(art,entry,object);const updated=cache.fenceSections(art,entry,object,native);assert.notEqual(updated,sections);assert.ok(calls>1);
 const other={...object};assert.notEqual(cache.frame(art,entry,other),native,'a restored world gets separate weak keys');
});
