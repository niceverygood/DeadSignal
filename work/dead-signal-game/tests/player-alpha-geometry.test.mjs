import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {scanFixedPlayerAlphaGeometry} from '../dist/player-alpha-geometry.js';
import {nativeAlphaBounds as currentBounds} from '../dist/native-alpha-bounds.js';
import {bodyIdentificationContour as currentContour} from '../dist/production-art.js?v=0.29.0';

// Frozen complete original modules, not a rewritten geometry formula, provide
// the output oracle. These are CPU byte-array checks; they do not render native
// Canvas/GL pixels, measure performance or certify whole-scene raster equality.
const SIZE=256,BYTES=SIZE*SIZE*4,ROWS=SIZE*2;
const base=new URL('../../../qa/player-cpu-alpha-geometry-20261018/',import.meta.url);
const pins={
 'player-before.txt':{bytes:16124,sha:'cf5c5721485f0ca2e531136d1a845d1111260ff12a3aaecf14e23312f702dfba'},
 'bounds-before.txt':{bytes:574,sha:'3816c17f737f013f24642f3bca48dba964fa1e02d53d4e665ad9ba235c1efdcb'},
 'art-before.txt':{bytes:45528,sha:'017c977b477d6f2d37067dfea48dbafa50166661cc93274bc549ab9354250c5d'},
};
const originals={};
for(const [name,pin]of Object.entries(pins)){
 const bytes=await readFile(new URL(name,base));assert.equal(bytes.length,pin.bytes,'frozen '+name+' byte count');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha,'frozen '+name+' SHA');originals[name]=bytes.toString('utf8');
}
function moduleURL(source,relative){
 const sourceURL=new URL(relative,import.meta.url);
 const rebased=source.replace(/\bfrom\s+(['"])(\.{1,2}\/[^'"]+)\1/g,(whole,quote,specifier)=>whole.replace(quote+specifier+quote,JSON.stringify(new URL(specifier,sourceURL).href))).replaceAll('import.meta.url',JSON.stringify(sourceURL.href));
 return'data:text/javascript;base64,'+Buffer.from(rebased).toString('base64');
}
const {nativeAlphaBounds:originalBounds}=await import(moduleURL(originals['bounds-before.txt'],'../dist/native-alpha-bounds.js'));
const {bodyIdentificationContour:originalContour}=await import(moduleURL(originals['art-before.txt'],'../dist/production-art.js'));
const source=Function.prototype.toString;
function expected(rgba){const alphaBounds=originalBounds(rgba,SIZE,SIZE)||{x:SIZE,y:SIZE,width:1,height:1},coreBounds={x:alphaBounds.x,y:alphaBounds.y,width:alphaBounds.width,height:alphaBounds.height*.72};return{alphaBounds,coreBounds,bodyIdentificationContour:originalContour(rgba,SIZE,SIZE,alphaBounds,coreBounds)};}
function expectedRows(rgba){const rows=new Uint16Array(ROWS);for(let y=0;y<SIZE;y++){let left=SIZE,right=0;for(let x=0;x<SIZE;x++)if(rgba[(y*SIZE+x)*4+3]>=8){if(x<left)left=x;if(x+1>right)right=x+1;}rows[y*2]=left;rows[y*2+1]=right;}return rows;}
function bits(number){const buffer=new ArrayBuffer(8);new DataView(buffer).setFloat64(0,number,false);return Buffer.from(buffer).toString('hex');}
function exact(actual,wanted,path='geometry'){
 if(typeof wanted==='number'){assert.equal(typeof actual,'number',path);assert.equal(Object.is(actual,wanted),true,path+' Object.is');assert.equal(bits(actual),bits(wanted),path+' Float64 bits');return;}
 if(wanted===null){assert.equal(actual,null,path);return;}
 assert.equal(typeof actual,'object',path);assert.equal(Object.getPrototypeOf(actual),Object.getPrototypeOf(wanted),path+' prototype');
 assert.deepEqual(Reflect.ownKeys(actual),Reflect.ownKeys(wanted),path+' own keys');
 for(const key of Reflect.ownKeys(wanted)){const descriptor=Object.getOwnPropertyDescriptor(actual,key);assert.ok('value'in descriptor,path+'.'+String(key)+' own data');exact(descriptor.value,wanted[key],path+'.'+String(key));}
}
function assertAliases(result){const contour=result.bodyIdentificationContour;if(!contour)return;assert.equal(contour.top[0],contour.left[0]);assert.equal(contour.top[1],contour.right[0]);assert.notEqual(contour.left,contour.right);assert.notEqual(contour.left,contour.top);for(let i=0;i<contour.left.length;i++)assert.notEqual(contour.left[i],contour.right[i]);}
function runCase(rgba,rows=new Uint16Array(ROWS),label='fixture'){
 const inputBefore=new Uint8ClampedArray(rgba),wanted=expected(rgba),wantedRows=expectedRows(rgba),result=scanFixedPlayerAlphaGeometry(rgba,rows);
 exact(result,wanted,label);assertAliases(result);assert.deepEqual(rows,wantedRows,label+' all512 endpoints');assert.deepEqual(rgba,inputBefore,label+' source RGBA unchanged');return result;
}
const mask=()=>new Uint8ClampedArray(BYTES);
function alpha(rgba,x,y,value){rgba[(y*SIZE+x)*4+3]=value;}
function rectangle(rgba,x,y,width,height,value=8){for(let row=y;row<y+height;row++)for(let col=x;col<x+width;col++)alpha(rgba,col,row,value);return rgba;}
function seeded(seed){let state=seed>>>0;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;},rgba=mask();for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const at=(y*SIZE+x)*4;rgba[at]=next()>>>24;rgba[at+1]=next()>>>24;rgba[at+2]=next()>>>24;const inside=((x-127)/(.15*y+17))**2+((y-130)/112)**2<1;rgba[at+3]=inside?[0,7,8,9,128,255][next()%6]:[0,0,0,7][next()%4];}return rgba;}
function reject(rgba,rows,label){
 const nativeRows=rows instanceof Uint16Array?(()=>{try{return new Uint16Array(rows);}catch{return null;}})():null;
 const nativePixels=rgba instanceof Uint8ClampedArray?(()=>{try{return new Uint8ClampedArray(rgba);}catch{return null;}})():null;
 assert.throws(()=>scanFixedPlayerAlphaGeometry(rgba,rows),TypeError,label);
 if(nativeRows)assert.deepEqual(new Uint16Array(rows),nativeRows,label+' rejected before scratch writes');
 if(nativePixels)assert.deepEqual(new Uint8ClampedArray(rgba),nativePixels,label+' rejected before input writes');
}

test('the independent original module pins and currently imported geometry functions remain exact',()=>{
 assert.equal(source.call(currentBounds),source.call(originalBounds));assert.equal(source.call(currentContour),source.call(originalContour));
 assert.match(originals['player-before.txt'],/const bounds=nativeAlphaBounds\(pixels,SIZE,SIZE\)\|\|\{x:SIZE,y:SIZE,width:1,height:1\};/);
 assert.match(originals['player-before.txt'],/height:bounds\.height\*\.72/);
 assert.match(originals['player-before.txt'],/bodyIdentificationContour\(pixels,SIZE,SIZE,bounds,core\)/);
});

test('threshold7/8/255, empty, single x255, isolated rows and each image edge match full frozen outputs and endpoint slots',()=>{
 const rows=new Uint16Array(ROWS);rows.fill(65535);const empty=runCase(mask(),rows,'empty');exact(empty.alphaBounds,{x:256,y:256,width:1,height:1});assert.equal(empty.bodyIdentificationContour,null);
 for(const value of[0,7,8,9,255])for(const [x,y]of[[0,0],[255,0],[0,255],[255,255],[128,127]]){const rgba=mask();alpha(rgba,x,y,value);const result=runCase(rgba,rows,'single '+[value,x,y]);assert.equal(result.bodyIdentificationContour,null);if(value>=8)exact(result.alphaBounds,{x,y,width:1,height:1});}
 for(const value of[7,8,255]){runCase(rectangle(mask(),0,0,256,256,value),rows,'full '+value);runCase(rectangle(mask(),255,0,1,256,value),rows,'x255 '+value);runCase(rectangle(mask(),0,255,256,1,value),rows,'y255 '+value);}
 const noncontiguous=mask();for(const [x,y]of[[255,0],[0,1],[127,17],[255,91],[4,144],[220,255]])alpha(noncontiguous,x,y,8);runCase(noncontiguous,rows,'noncontiguous rows');
 const hollow=mask();for(let y=3;y<247;y++){alpha(hollow,y%23,y,8);alpha(hollow,255-y%19,y,255);for(let x=40;x<210;x++)alpha(hollow,x,y,7);}runCase(hollow,rows,'hollow interior retains endpoints');
});

test('every body height and .72 cutoff retains exact Float64 core height and original open contour row membership',()=>{
 const rows=new Uint16Array(ROWS);for(let height=1;height<=256;height++){
  const top=(256-height)%7,rgba=mask();for(let y=top;y<top+height;y++){alpha(rgba,19+(y%3),y,y%2?8:255);alpha(rgba,231-(y%5),y,8);}
  const result=runCase(rgba,rows,'height '+height),cutoff=Math.floor(top+height*.72),contour=result.bodyIdentificationContour;
  assert.equal(bits(result.coreBounds.height),bits(height*.72));
  if(cutoff-top>1){assert.ok(contour);assert.equal(contour.left.length,cutoff-top);assert.equal(contour.left.at(-1).y,cutoff-.5);assert.equal(contour.right.at(-1).y,cutoff-.5);}else assert.equal(contour,null);
 }
});

test('seeded opaque/threshold bodies and RGB changes preserve original geometry without mutating bytes',()=>{
 const rows=new Uint16Array(ROWS);for(const seed of[0,1,774,19253,0xffffffff]){const rgba=seeded(seed),result=runCase(rgba,rows,'seed '+seed),rgbChanged=new Uint8ClampedArray(rgba);for(let at=0;at<BYTES;at+=4){rgbChanged[at]^=255;rgbChanged[at+1]=(rgbChanged[at+1]+37)%256;rgbChanged[at+2]^=85;}exact(runCase(rgbChanged,rows,'RGB-only '+seed),result);assert.ok(result.bodyIdentificationContour?.left.length>100,'deterministic fixture exercises an actual multirow open silhouette');}
});

test('one reusable cache is fully overwritten while previous outputs remain fresh and stable',()=>{
 const rows=new Uint16Array(ROWS),full=rectangle(mask(),0,0,256,256,255),narrow=rectangle(mask(),255,13,1,90,8),sources=[full,narrow,mask(),seeded(774),mask()],results=[];
 for(const rgba of sources){rows.fill(65535);const result=runCase(rgba,rows);results.push({result,copy:structuredClone(result)});for(const prior of results){exact(prior.result,prior.copy);assertAliases(prior.result);}}
 for(let i=0;i<results.length;i++)for(let j=i+1;j<results.length;j++){assert.notEqual(results[i].result,results[j].result);assert.notEqual(results[i].result.alphaBounds,results[j].result.alphaBounds);assert.notEqual(results[i].result.coreBounds,results[j].result.coreBounds);const a=results[i].result.bodyIdentificationContour,b=results[j].result.bodyIdentificationContour;if(a&&b){assert.notEqual(a,b);assert.notEqual(a.left,b.left);assert.notEqual(a.left[0],b.left[0]);}}
});

test('genuine offset, subclass and cross-realm fixed views use intrinsic brands without reading spoof getters',()=>{
 const inputBuffer=new ArrayBuffer(BYTES+32),rgba=new Uint8ClampedArray(inputBuffer,16,BYTES);rgba.set(seeded(19253));const scratchBuffer=new ArrayBuffer(ROWS*2+32),rows=new Uint16Array(scratchBuffer,16,ROWS);const prefix=new Uint8Array(inputBuffer,0,16).slice(),suffix=new Uint8Array(inputBuffer,16+BYTES,16).slice();runCase(rgba,rows,'offset views');assert.deepEqual(new Uint8Array(inputBuffer,0,16),prefix);assert.deepEqual(new Uint8Array(inputBuffer,16+BYTES,16),suffix);
 class Pixels extends Uint8ClampedArray{}class Edges extends Uint16Array{}const subclass=new Pixels(BYTES);subclass.set(seeded(1));exact(scanFixedPlayerAlphaGeometry(subclass,new Edges(ROWS)),expected(subclass));
 const cross=vm.runInNewContext('({pixels:new Uint8ClampedArray(256*256*4),rows:new Uint16Array(512)})');cross.pixels.set(seeded(774));exact(scanFixedPlayerAlphaGeometry(cross.pixels,cross.rows),expected(cross.pixels));
 const guarded=seeded(774),scratch=new Uint16Array(ROWS),wanted=expected(guarded);let getters=0;
 for(const target of[guarded,scratch])for(const key of['length','byteLength','byteOffset','buffer'])Object.defineProperty(target,key,{configurable:true,get(){getters++;throw Error('untrusted own '+key);}});
 exact(scanFixedPlayerAlphaGeometry(guarded,scratch),wanted);assert.equal(getters,0,'only intrinsic typed-view fields are consumed');
});

test('wrong types, lengths, proxies and spoofed native brands reject before scratch or input writes',()=>{
 const rgba=seeded(1),rows=new Uint16Array(ROWS);rows.fill(48123);
 for(const invalid of[null,undefined,[],new Uint8Array(BYTES),new Uint16Array(BYTES),new Uint8ClampedArray(BYTES-1),new Uint8ClampedArray(BYTES+1),Object.create(Uint8ClampedArray.prototype)])reject(invalid,rows,'invalid pixels');
 for(const invalid of[null,undefined,[],new Uint8Array(ROWS*2),new Int16Array(ROWS),new Uint16Array(ROWS-1),new Uint16Array(ROWS+1),Object.create(Uint16Array.prototype)])reject(rgba,invalid,'invalid scratch');
 let traps=0;const trap=()=>{traps++;throw Error('proxy trap must not be needed');};for(const value of[rgba,rows]){const proxy=new Proxy(value,{get:trap,getPrototypeOf:trap,getOwnPropertyDescriptor:trap});assert.throws(()=>value===rgba?scanFixedPlayerAlphaGeometry(proxy,rows):scanFixedPlayerAlphaGeometry(rgba,proxy),TypeError);}
 const revoked=Proxy.revocable(rgba,{});revoked.revoke();assert.throws(()=>scanFixedPlayerAlphaGeometry(revoked.proxy,rows),TypeError);assert.equal(traps,0);
 const spoof={};Object.defineProperty(spoof,Symbol.toStringTag,{get:trap});assert.throws(()=>scanFixedPlayerAlphaGeometry(spoof,rows),TypeError);assert.equal(traps,0);assert.ok(rows.every(value=>value===48123));
});

test('shared, resizable, detached and same-buffer views are outside the fixed owned-byte contract',()=>{
 const rgba=seeded(774),rows=new Uint16Array(ROWS);rows.fill(32123);assert.equal(typeof SharedArrayBuffer,'function');
 reject(new Uint8ClampedArray(new SharedArrayBuffer(BYTES)),rows,'shared input');reject(rgba,new Uint16Array(new SharedArrayBuffer(ROWS*2)),'shared scratch');
 const resizableInput=new ArrayBuffer(BYTES,{maxByteLength:BYTES+16}),resizableScratch=new ArrayBuffer(ROWS*2,{maxByteLength:ROWS*2+16});assert.equal(resizableInput.resizable,true,'Node22 resizable buffer fixture');assert.equal(resizableScratch.resizable,true);
 reject(new Uint8ClampedArray(resizableInput,0,BYTES),rows,'fixed view on resizable input');reject(rgba,new Uint16Array(resizableScratch,0,ROWS),'fixed view on resizable scratch');
 const detachedInput=new ArrayBuffer(BYTES),detachedPixels=new Uint8ClampedArray(detachedInput);structuredClone(detachedInput,{transfer:[detachedInput]});assert.equal(detachedInput.byteLength,0);reject(detachedPixels,rows,'detached input');
 const detachedScratch=new ArrayBuffer(ROWS*2),detachedRows=new Uint16Array(detachedScratch);structuredClone(detachedScratch,{transfer:[detachedScratch]});assert.equal(detachedScratch.byteLength,0);reject(rgba,detachedRows,'detached scratch');
 const overlapping=seeded(774),overlapRows=new Uint16Array(overlapping.buffer,0,ROWS),overlapBefore=overlapping.slice();assert.throws(()=>scanFixedPlayerAlphaGeometry(overlapping,overlapRows),TypeError);assert.deepEqual(overlapping,overlapBefore);
 const sharedOwner=new ArrayBuffer(BYTES+ROWS*2),disjointPixels=new Uint8ClampedArray(sharedOwner,0,BYTES),disjointRows=new Uint16Array(sharedOwner,BYTES,ROWS);disjointPixels.set(rgba);disjointRows.fill(54321);reject(disjointPixels,disjointRows,'same-buffer disjoint views conservatively rejected');
});
