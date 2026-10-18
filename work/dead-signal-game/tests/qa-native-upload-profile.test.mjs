import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/player-rig/vendor/three.module.js';
import {createNativeUploadProfile,NATIVE_UPLOAD_PROFILE_NOTE} from '../dist/qa-native-upload-profile.js';

// The GL service below is a CPU mock. These tests prove call transparency and
// observer cleanup, never GPU execution, uploaded bytes, RAM/VRAM or actual FPS.
const observedGL=[
 'createTexture','deleteTexture','texStorage2D','texImage2D','texSubImage2D','generateMipmap',
 'compileShader','linkProgram','getProgramParameter','getShaderParameter','getProgramInfoLog','getShaderInfoLog',
 'getActiveUniform','getUniformLocation','getActiveAttrib','getAttribLocation',
 'bufferData','bufferSubData','createBuffer','createVertexArray','bindVertexArray','vertexAttribPointer','vertexAttribIPointer','enableVertexAttribArray',
 'drawElements','drawArrays','activeTexture','pixelStorei','bindTexture'
];
function fixture(){
 const calls=[],forbidden=[],results=new Map(),error=Error('original GL exception'),promise=Promise.resolve('same original promise'),proto={};
 for(const key of observedGL){const value={key};results.set(key,value);Object.defineProperty(proto,key,{configurable:true,enumerable:key==='texImage2D',writable:true,value:function(...args){calls.push({key,receiver:this,args});if(args[0]===error)throw error;return args[0]===promise?promise:value;}});}
 const gl=Object.create(proto);
 // Exercise an own data descriptor as well as inherited native methods.
 Object.defineProperty(gl,'bindTexture',{configurable:true,enumerable:true,writable:false,value:proto.bindTexture});
 const trap=name=>function(){forbidden.push(name);throw Error('unexpected '+name);};
 for(const key of ['getError','getParameter','getExtension','readPixels','createQuery','beginQuery','getQueryParameter'])gl[key]=trap(key);
 const renderer={getContext(...args){calls.push({key:'getContext',receiver:this,args});return gl;},initTexture(...args){calls.push({key:'initTexture',receiver:this,args});return results.get('createTexture');},render:trap('render'),setSize:trap('resize'),readRenderTargetPixels:trap('read'),compileAsync:trap('compileAsync')};
 const subject=new THREE.Group(),root=new THREE.Bone(),arm=new THREE.Bone();root.add(arm);arm.position.set(.25,1,.5);root.rotation.y=.2;root.updateMatrixWorld(true);
 const skeleton=new THREE.Skeleton([root,arm]);skeleton.update();
 const first=new THREE.SkinnedMesh(),second=new THREE.SkinnedMesh();first.skeleton=skeleton;second.skeleton=skeleton;subject.add(first,second);
 const rig={renderer,models:new Map([['loaded-original',{subject}]]),load:trap('load'),frame:trap('frame'),tick:trap('tick')};
 const descriptors=()=>({gl:observedGL.map(key=>Object.getOwnPropertyDescriptor(gl,key)),init:Object.getOwnPropertyDescriptor(renderer,'initTexture'),skin:Object.getOwnPropertyDescriptor(skeleton,'computeBoneTexture')});
 return {rig,renderer,gl,proto,subject,skeleton,root,arm,calls,forbidden,results,error,promise,descriptors};
}

test('setup only retrieves the existing context once and observes each original upload/draw call without extra GPU work or asset preparation',t=>{
 const f=fixture(),before=f.descriptors(),matrices=[...f.skeleton.boneMatrices],bones=[f.root.matrixWorld.toArray(),f.arm.matrixWorld.toArray()],parent=f.subject.parent,profile=createNativeUploadProfile(f.rig,{now:()=>12});t.after(()=>profile.stop());
 assert.deepEqual(f.calls,[{key:'getContext',receiver:f.renderer,args:[]}]);assert.equal(f.skeleton.boneTexture,null);assert.deepEqual([...f.skeleton.boneMatrices],matrices);assert.deepEqual([f.root.matrixWorld.toArray(),f.arm.matrixWorld.toArray()],bones);assert.equal(f.subject.parent,parent);assert.deepEqual(profile.unmeasured,[]);
 const frame=profile.beginFrame({index:4});
 for(const key of observedGL){const argument={key};assert.equal(f.gl[key](argument,7),f.results.get(key));assert.deepEqual(f.calls.at(-1),{key,receiver:f.gl,args:[argument,7]});}
 const texture={original:true};assert.equal(f.renderer.initTexture(texture),f.results.get('createTexture'));
 assert.equal(f.skeleton.computeBoneTexture(),f.skeleton,'the existing Three Skeleton method retains its return value');assert.ok(f.skeleton.boneTexture?.isDataTexture);
 const boneTexture=f.skeleton.boneTexture,report=profile.endFrame({nativeSelected:1});assert.equal(report,frame);assert.equal(report.index,4);assert.equal(report.nativeSelected,1);assert.equal('startCpu'in report,false);
 assert.equal(Object.keys(report.stages).length,observedGL.length+2);for(const key of observedGL)assert.deepEqual(report.stages['gl.'+key],{calls:1,cpuMs:0});assert.deepEqual(report.stages['texture.init'],{calls:1,cpuMs:0});assert.deepEqual(report.stages['skin.computeBoneTexture'],{calls:1,cpuMs:0},'shared Skeleton instances are observed once');assert.equal(report.frameCpuMs,0);
 const callCount=f.calls.length,stopped=profile.stop();assert.equal(stopped.samples,profile.samples);assert.equal(stopped.unmeasured,profile.unmeasured);assert.equal(stopped.note,NATIVE_UPLOAD_PROFILE_NOTE);assert.equal(f.calls.length,callCount);assert.deepEqual(f.descriptors(),before);assert.equal(f.skeleton.boneTexture,boneTexture,'stop never disposes the original skeleton texture');assert.deepEqual(f.forbidden,[]);boneTexture.dispose();
});

test('wrappers preserve receiver, argument and result identities, original throws, and exact accessor/data descriptors',t=>{
 const f=fixture(),original=f.proto.texImage2D,accessor={configurable:true,enumerable:true,get:()=>original};Object.defineProperty(f.gl,'texImage2D',accessor);Object.defineProperty(f.gl,'deleteTexture',{configurable:false,writable:false,enumerable:true,value:f.proto.deleteTexture});
 const before=f.descriptors(),profile=createNativeUploadProfile(f.rig,{now:()=>0});t.after(()=>profile.stop());assert.ok(profile.unmeasured.includes('gl.deleteTexture'));const receiver={borrowed:true},argument={identity:true};profile.beginFrame();
 assert.equal(f.gl.texImage2D.call(receiver,argument,undefined),f.results.get('texImage2D'));assert.deepEqual(f.calls.at(-1),{key:'texImage2D',receiver,args:[argument,undefined]});assert.equal(f.gl.linkProgram(f.promise),f.promise);
 assert.throws(()=>f.gl.compileShader(f.error),error=>error===f.error);assert.equal(f.calls.filter(call=>call.key==='compileShader').length,1);const sample=profile.endFrame();assert.equal(sample.stages['gl.compileShader'].calls,1,'throwing original calls still close their observation');profile.stop();assert.deepEqual(f.descriptors(),before);assert.equal(f.gl.texImage2D,original);assert.deepEqual(f.forbidden,[]);
});

test('overlapping observers execute originals once and restore independently in either stop order',()=>{
 for(const stopFirst of [0,1]){
  const f=fixture(),before=f.descriptors(),profiles=[createNativeUploadProfile(f.rig,{now:()=>0}),createNativeUploadProfile(f.rig,{now:()=>0})];
  try{assert.equal(f.calls.filter(call=>call.key==='getContext').length,2);profiles.forEach(profile=>profile.beginFrame());f.gl.drawArrays('first');profiles.forEach(profile=>profile.endFrame());assert.equal(f.calls.filter(call=>call.key==='drawArrays').length,1);for(const profile of profiles)assert.equal(profile.samples[0].stages['gl.drawArrays'].calls,1);
   const survivor=profiles[1-stopFirst];profiles[stopFirst].stop();survivor.beginFrame();f.gl.drawArrays('second');survivor.endFrame();assert.equal(f.calls.filter(call=>call.key==='drawArrays').length,2);assert.equal(survivor.samples[1].stages['gl.drawArrays'].calls,1);assert.equal(profiles[stopFirst].samples.length,1);survivor.stop();assert.deepEqual(f.descriptors(),before);
  }finally{profiles.forEach(profile=>profile.stop());}
 }
});

test('stopping preserves a later external method replacement and rejects further wrapping of its stale slot',()=>{
 const f=fixture(),before=f.descriptors(),one=createNativeUploadProfile(f.rig,{now:()=>0}),two=createNativeUploadProfile(f.rig,{now:()=>0});let replacementCalls=0;
 const replacement=function(...args){replacementCalls++;return {receiver:this,args};},descriptor={configurable:true,enumerable:true,writable:false,value:replacement};Object.defineProperty(f.gl,'texImage2D',descriptor);
 const three=createNativeUploadProfile(f.rig,{now:()=>0});try{assert.ok(three.unmeasured.includes('gl.texImage2D'));for(const profile of [one,two,three])profile.beginFrame();const argument={external:true},result=f.gl.texImage2D(argument);assert.equal(result.receiver,f.gl);assert.equal(result.args[0],argument);assert.equal(replacementCalls,1);for(const profile of [one,two,three]){profile.endFrame();assert.equal(profile.samples[0].stages['gl.texImage2D'],undefined);}
 }finally{two.stop();three.stop();one.stop();}
 assert.deepEqual(Object.getOwnPropertyDescriptor(f.gl,'texImage2D'),descriptor);assert.equal(f.gl.texImage2D,replacement);assert.deepEqual(f.descriptors().gl.filter((_,index)=>observedGL[index]!=='texImage2D'),before.gl.filter((_,index)=>observedGL[index]!=='texImage2D'));
});

test('disabled profiles perform no rig or clock access and broken clocks never change original results or exceptions',()=>{
 let reads=0;const inaccessible=new Proxy({},{get(){reads++;throw Error('disabled rig accessed');}}),disabled=createNativeUploadProfile(inaccessible,{enabled:false,now(){reads++;throw Error('disabled clock accessed');}});assert.equal(disabled.beginFrame(),null);assert.equal(disabled.endFrame(),null);assert.deepEqual(disabled.stop().samples,[]);assert.equal(disabled.stop().enabled,false);assert.equal(reads,0);
 for(const now of [()=>{throw Error('broken clock');},()=>NaN,()=>Infinity]){const f=fixture(),profile=createNativeUploadProfile(f.rig,{now});try{profile.beginFrame();assert.equal(f.gl.createTexture(),f.results.get('createTexture'));assert.throws(()=>f.gl.linkProgram(f.error),error=>error===f.error);const sample=profile.endFrame();assert.equal(sample.frameCpuMs,0);assert.deepEqual(sample.stages['gl.createTexture'],{calls:1,cpuMs:0});assert.deepEqual(sample.stages['gl.linkProgram'],{calls:1,cpuMs:0});assert.equal(f.calls.filter(call=>call.key==='createTexture').length,1);assert.equal(f.calls.filter(call=>call.key==='linkProgram').length,1);}finally{profile.stop();}}
});

test('nested CPU stage measurements overlap and cannot be added to infer frame or GPU time',()=>{
 const f=fixture();let clock=0,uploadCalls=0,initCalls=0;f.gl.texImage2D=function(texture){uploadCalls++;clock+=5;return texture;};f.renderer.initTexture=function(texture){initCalls++;clock+=2;const output=f.gl.texImage2D(texture);clock+=3;return output;};const profile=createNativeUploadProfile(f.rig,{now:()=>clock});try{profile.beginFrame();const texture={original:true};assert.equal(f.renderer.initTexture(texture),texture);const sample=profile.endFrame();assert.equal(initCalls,1);assert.equal(uploadCalls,1);assert.deepEqual(sample.stages['texture.init'],{calls:1,cpuMs:10});assert.deepEqual(sample.stages['gl.texImage2D'],{calls:1,cpuMs:5});assert.equal(sample.frameCpuMs,10);assert.ok(sample.stages['texture.init'].cpuMs+sample.stages['gl.texImage2D'].cpuMs>sample.frameCpuMs);assert.match(profile.note,/nested stages overlap and must not be added/);assert.match(profile.note,/does not measure GPU execution, presented FPS/);}finally{profile.stop();}
});

test('frame boundaries ignore unmeasured calls, reject nested frames, and discard an open sample on idempotent stop',()=>{
 const f=fixture(),before=f.descriptors(),profile=createNativeUploadProfile(f.rig,{now:()=>0});assert.equal(profile.endFrame(),null);f.gl.drawElements('outside');assert.equal(profile.samples.length,0);profile.beginFrame({abandoned:true});assert.throws(()=>profile.beginFrame(),/frame-already-open/);f.gl.drawElements('inside');const first=profile.stop(),second=profile.stop();assert.equal(first.samples,second.samples);assert.equal(first.unmeasured,second.unmeasured);assert.deepEqual(first.samples,[]);assert.equal(profile.beginFrame(),null);assert.equal(profile.endFrame(),null);assert.deepEqual(f.descriptors(),before);f.gl.drawElements('after stop');assert.equal(f.calls.filter(call=>call.key==='drawElements').length,3);assert.deepEqual(f.forbidden,[]);
});

test('missing contexts and broken loaded-subject traversal report unmeasured stages without loading, drawing or blocking cleanup',()=>{
 for(const mode of ['missing','getContext-throws','traversal-throws','no-subject']){const f=fixture();if(mode==='missing')f.renderer.getContext=()=>null;if(mode==='getContext-throws')f.renderer.getContext=()=>{throw Error('unavailable original context');};if(mode==='traversal-throws')f.subject.traverse=()=>{throw Error('unavailable loaded traversal');};if(mode==='no-subject')f.rig.models.set('missing',{subject:null});const init=f.renderer.initTexture,profile=createNativeUploadProfile(f.rig,{now:()=>0});try{if(mode==='missing'||mode==='getContext-throws')assert.ok(profile.unmeasured.includes('gl.context-unavailable'));if(mode==='traversal-throws')assert.ok(profile.unmeasured.includes('skin.subject-traversal-failed'));if(mode==='no-subject')assert.ok(profile.unmeasured.includes('skin.subject-traversal-unavailable'));profile.beginFrame();assert.equal(f.renderer.initTexture('existing'),f.results.get('createTexture'));assert.equal(profile.endFrame().stages['texture.init'].calls,1);assert.deepEqual(f.forbidden,[]);}finally{profile.stop();assert.equal(f.renderer.initTexture,init);}}
});
