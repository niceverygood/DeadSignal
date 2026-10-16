import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {resolveModelId,validateRegistry,allowedResource,makePlayback,togglePlayback,seekPlayback,advancePlayback,makeTextOption,preferredRigClip} from './rig-viewer-state.js?v=0.29.0';

const $=id=>document.getElementById(id);
const labels={idle:'대기',walk:'걷기',run:'달리기',windup:'공격 준비',attack:'공격',hit:'피격',death:'사망',motionreel:'전체 제작 릴'};
const labelFor=name=>Object.entries(labels).find(([key])=>name.toLowerCase().includes(key))?.[1]||name;
const base=new URL('./',location.href);
let records=[],selected=null,model=null,mixer=null,action=null,clips=[],helper=null,grid=null,floor=null;
let playback=makePlayback(),loadToken=0,loadController=null,raf=null,previousTime=null,frameRadius=1;
let textureResources=new Set(),originalMaterials=new Set(),resizeObserver=null;
let renderer,scene,camera,controls;

function showError(error){$('viewer-error').textContent=error instanceof Error?error.message:String(error);$('viewer-error').hidden=false;}
function showStage(text){$('load-state').textContent=text;$('load-state').hidden=false;}
function updatePlaybackUI(){
  $('play').textContent=playback.playing?'일시 정지':'재생';
  $('play').disabled=!action||playback.duration<=0;
  $('timeline').disabled=!action||playback.duration<=0;
  $('timeline').max=playback.duration||1;$('timeline').value=playback.time;
  $('time-output').value=`${playback.time.toFixed(2)} / ${playback.duration.toFixed(2)}초`;
  $('time-output').textContent=$('time-output').value;
}
function samplePose(){
  if(action&&mixer){action.paused=false;action.time=playback.time;mixer.update(0);action.paused=true;}
  model?.updateMatrixWorld(true);helper?.updateMatrixWorld(true);
}
function render(){if(renderer&&scene&&camera&&!document.hidden)renderer.render(scene,camera);}
function syncLoop(){
  const canPlay=playback.playing&&!!action&&!document.hidden;
  if(canPlay&&raf===null)raf=requestAnimationFrame(tick);
  else if(!canPlay){if(raf!==null)cancelAnimationFrame(raf);raf=null;previousTime=null;}
}
function tick(time){
  raf=null;
  if(!playback.playing||document.hidden){previousTime=null;return;}
  if(previousTime!==null){playback=advancePlayback(playback,(time-previousTime)/1000,!document.hidden);samplePose();updatePlaybackUI();render();}
  previousTime=time;syncLoop();
}
function collectTextures(material){for(const value of Object.values(material||{}))if(value?.isTexture)textureResources.add(value);}
function disposeTree(root,extraTextures=[]){
  if(!root)return;
  const geometries=new Set(),materials=new Set(),textures=new Set(extraTextures),skeletons=new Set(),images=new Set();
  root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}if(object.skeleton)skeletons.add(object.skeleton);});
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
  for(const texture of textures){if(texture.source?.data)images.add(texture.source.data);texture.dispose();}
  for(const skeleton of skeletons)skeleton.dispose();for(const image of images)if(typeof image.close==='function')image.close();
  root.removeFromParent();
}
function clearModel(){
  playback={...playback,playing:false};syncLoop();
  if(mixer&&model){mixer.stopAllAction();mixer.uncacheRoot(model);}
  action=null;mixer=null;clips=[];
  if(helper){helper.removeFromParent();helper.geometry.dispose();helper.material.dispose();helper=null;}
  disposeTree(model,textureResources);model=null;disposeTree(grid);grid=null;disposeTree(floor);floor=null;
  textureResources.clear();for(const material of originalMaterials)material.dispose();originalMaterials.clear();
  playback=makePlayback();updatePlaybackUI();$('clip').disabled=true;
  renderer?.renderLists.dispose();render();
}
function originalTextureMaterial(root){
  const converted=new Map();
  root.traverse(object=>{
    if(!object.isMesh)return;object.frustumCulled=false;
    const convert=old=>{
      if(converted.has(old))return converted.get(old);
      collectTextures(old);originalMaterials.add(old);
      const material=new THREE.MeshBasicMaterial({map:old.map||null,color:old.color?.clone()||new THREE.Color(0xffffff),alphaMap:old.alphaMap||null,transparent:old.transparent,opacity:old.opacity,alphaTest:old.alphaTest,side:old.side,vertexColors:old.vertexColors,depthWrite:old.depthWrite,depthTest:old.depthTest,toneMapped:false});
      converted.set(old,material);return material;
    };
    object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
  });
}
function resize(){
  if(!renderer||!camera)return;
  const rect=$('viewport').getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
  renderer.setSize(rect.width,rect.height,false);
  const aspect=rect.width/rect.height,halfHeight=frameRadius*(aspect<1?1/aspect:1)*1.12;
  camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();render();
}
function cameraView(view){
  if(!camera||!controls)return;
  const direction=view==='front'?new THREE.Vector3(0,.12,1):view==='back'?new THREE.Vector3(0,.12,-1):new THREE.Vector3(1.5,1.6,1.8);
  camera.position.copy(controls.target).add(direction.normalize().multiplyScalar(frameRadius*5));camera.up.set(0,1,0);camera.lookAt(controls.target);controls.update();
  document.querySelectorAll('[data-camera]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.camera===view)));render();
}
function fitBindPose(root){
  root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root,true),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(bounds.isEmpty()||![size.x,size.y,size.z].every(Number.isFinite)||Math.max(size.x,size.y,size.z)<=0)throw new Error('모델의 실제 바인드 범위를 계산할 수 없습니다.');
  root.position.x-=center.x;root.position.y-=bounds.min.y;root.position.z-=center.z;root.updateMatrixWorld(true);
  frameRadius=Math.max(size.x,size.y,size.z)*.82;
  controls.target.set(0,size.y*.46,0);controls.minDistance=frameRadius*.5;controls.maxDistance=frameRadius*20;
  camera.near=Math.max(.0001,frameRadius*.001);camera.far=frameRadius*100;camera.zoom=1;
  grid=new THREE.GridHelper(frameRadius*4,20,0x697753,0x3b4936);grid.position.y=0;scene.add(grid);
  floor=new THREE.Mesh(new THREE.PlaneGeometry(frameRadius*4,frameRadius*4),new THREE.MeshBasicMaterial({color:0x263024,side:THREE.DoubleSide,toneMapped:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-frameRadius*.002;scene.add(floor);
  resize();cameraView('three-quarter');
}
function selectClip(name){
  if(!mixer||!model)return;
  mixer.stopAllAction();action=null;playback=makePlayback();
  const clip=clips.find(c=>c.name===name),record=selected.clips.find(c=>c.name===name);
  if(clip&&record){
    action=mixer.clipAction(clip);action.reset();action.setLoop(record.loop?THREE.LoopRepeat:THREE.LoopOnce,record.loop?Infinity:1);action.clampWhenFinished=true;action.play();
    playback=makePlayback({duration:clip.duration,loop:record.loop});action.paused=true;
    $('current-clip').textContent=`${labelFor(clip.name)} · ${clip.name}`;$('loop-state').textContent=record.loop?'반복 재생':'1회 재생 · 마지막 포즈 유지';
  }else{$('current-clip').textContent='바인드 포즈';$('loop-state').textContent='바닥·카메라 기준이 되는 원본 포즈';}
  samplePose();updatePlaybackUI();syncLoop();render();
}
function sourcePanel(record){
  $('source-name').textContent=record.model;$('source-hash').textContent='SHA256 '+record.sha256;
  $('model-download').href=allowedResource(record.model,base,records).href;$('model-download').hidden=false;
  $('provenance').href=allowedResource(record.provenance,base,records).href;$('provenance').hidden=false;
  const preserved=record.preservation.originalBinaryPrefixExact===true||Number(record.preservation.originalBinaryBytesUnchanged)>0;
  $('preservation').textContent=preserved?'제작 기록에 기존 메시·텍스처 데이터 보존이 기록되어 있습니다. 전체 근거는 제작·보존 기록에서 확인하세요.':'원본 보존 범위는 제작·보존 기록에서 확인하세요.';
}
async function loadModel(id){
  const record=records.find(m=>m.id===id);if(!record)throw new Error('지정된 리깅 모델이 없습니다.');
  const token=++loadToken;loadController?.abort();loadController=new AbortController();clearModel();selected=record;
  $('viewer-error').hidden=true;$('current-name').textContent=record.name;$('joint-count').textContent='—';$('skin-count').textContent='—';$('texture-count').textContent='—';$('clip').replaceChildren(makeTextOption('불러오는 중',''));
  showStage(record.name+'\n실제 GLB와 원본 텍스처를 불러오는 중…');sourcePanel(record);
  $('gallery-back').href='/production-assets/review.html#'+(id==='survivor'?'survivor-shotgun':id);
  history.replaceState(null,'','?id='+encodeURIComponent(id));
  try{
    const url=allowedResource(record.model,base,records),response=await fetch(url,{signal:loadController.signal,cache:'no-cache'});if(!response.ok)throw new Error('GLB 파일을 불러오지 못했습니다. ('+response.status+')');
    const buffer=await response.arrayBuffer();if(token!==loadToken)return;
    if(!crypto.subtle)throw new Error('이 브라우저에서 원본 파일 검증 기능을 사용할 수 없습니다.');
    const digest=await crypto.subtle.digest('SHA-256',buffer),actualHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    if(actualHash!==record.sha256)throw new Error('원본 GLB 검증값이 일치하지 않습니다. 갤러리 파일을 다시 준비해 주세요.');
    const manager=new THREE.LoadingManager();manager.setURLModifier(value=>{const resource=new URL(value,base);if(resource.protocol==='blob:'&&resource.origin===location.origin)return value;throw new Error('외부 텍스처 주소는 허용되지 않습니다.');});
    const gltf=await new GLTFLoader(manager).parseAsync(buffer,new URL('./',url).href);
    if(token!==loadToken){disposeTree(gltf.scene);return;}
    const weighted=[],bones=new Set();gltf.scene.traverse(object=>{if(object.isSkinnedMesh&&object.geometry.getAttribute('skinIndex')&&object.geometry.getAttribute('skinWeight')){weighted.push(object);object.skeleton.bones.forEach(bone=>bones.add(bone));}});
    if(!weighted.length||!bones.size){disposeTree(gltf.scene);throw new Error('실제 관절·가중치 메시가 없는 파일입니다.');}
    model=gltf.scene;clips=gltf.animations;if(clips.length!==record.clips.length||clips.some(c=>!record.clips.some(r=>r.name===c.name))){disposeTree(model);model=null;throw new Error('원본 클립 목록이 검수 기록과 다릅니다.');}
    originalTextureMaterial(model);scene.add(model);fitBindPose(model);
    mixer=new THREE.AnimationMixer(model);helper=new THREE.SkeletonHelper(model);helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.85;helper.visible=$('skeleton').checked;scene.add(helper);
    $('joint-count').textContent=bones.size;$('skin-count').textContent=weighted.length;$('texture-count').textContent=record.embeddedTextures;
    $('clip').replaceChildren(makeTextOption('바인드 포즈 · 원본 기준','__bind__'),...clips.map(c=>makeTextOption(labelFor(c.name)+' · '+c.name,c.name)));$('clip').disabled=false;
    const first=preferredRigClip(clips,record.id);$('clip').value=first?.name||'__bind__';selectClip($('clip').value);$('load-state').hidden=true;
  }catch(error){if(token!==loadToken||error?.name==='AbortError')return;clearModel();showStage('실제 GLB를 표시하지 못했습니다.\n오류 내용을 확인해 주세요.');showError(error);}
}
async function initialize(){
  try{
    const requested=resolveModelId(location.search);
    renderer=new THREE.WebGLRenderer({canvas:$('rig-canvas'),antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
    scene=new THREE.Scene();scene.background=new THREE.Color(0x222a23);camera=new THREE.OrthographicCamera(-1,1,1,-1,.001,100);
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=true;controls.maxPolarAngle=Math.PI*.49;controls.addEventListener('change',render);
    const response=await fetch(new URL('rig-viewer-registry.json',base),{cache:'no-cache'});if(!response.ok)throw new Error('리깅 모델 목록을 불러오지 못했습니다.');records=validateRegistry(await response.json());
    $('asset').replaceChildren(...records.map(record=>makeTextOption(record.name,record.id)));$('asset').value=requested;$('asset').disabled=false;$('model-count').textContent=records.length+' MODELS';
    $('asset').addEventListener('change',()=>loadModel($('asset').value));$('clip').addEventListener('change',()=>selectClip($('clip').value));
    $('play').addEventListener('click',()=>{playback=togglePlayback(playback);samplePose();updatePlaybackUI();syncLoop();render();});
    $('timeline').addEventListener('input',()=>{playback=seekPlayback(playback,$('timeline').value);samplePose();updatePlaybackUI();syncLoop();render();});
    $('skeleton').addEventListener('change',()=>{if(helper)helper.visible=$('skeleton').checked;render();});
    document.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>cameraView(button.dataset.camera)));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)playback=advancePlayback(playback,0,false);updatePlaybackUI();syncLoop();if(!document.hidden)render();});
    $('rig-canvas').addEventListener('webglcontextlost',event=>{event.preventDefault();playback={...playback,playing:false};syncLoop();showError(new Error('그래픽 화면 연결이 중단되었습니다. 페이지를 새로 열어 주세요.'));});
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe($('viewport'));await loadModel(requested);
  }catch(error){showStage('리깅 검수 화면을 시작하지 못했습니다.');showError(error);}
}
window.addEventListener('pagehide',event=>{if(event.persisted){playback=advancePlayback(playback,0,false);syncLoop();updatePlaybackUI();return;}loadToken++;loadController?.abort();clearModel();resizeObserver?.disconnect();controls?.dispose();renderer?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)resize();});
initialize();
