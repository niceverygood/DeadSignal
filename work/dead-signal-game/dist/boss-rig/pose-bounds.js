import {Box3,Matrix4,Vector3} from '../player-rig/vendor/three.module.js';
const component=(a,i,j)=>j===0?a.getX(i):j===1?a.getY(i):j===2?a.getZ(i):a.getW(i);
// Conservative geometry bounds, not an alpha mask. Every skinned vertex is a
// convex combination of its bone-transformed bind-space positions. The union
// of those transformed bone boxes therefore contains the authored surface.
export class SkinnedPoseBounds{
 constructor(root){
  this.parts=[];this.available=true;this.error='';this.point=new Vector3();this.projection=new Matrix4();this.post=new Matrix4();this.bone=new Matrix4();this.matrix=new Matrix4();
  try{root.traverse(mesh=>{
   if(!mesh.isMesh)return;const geometry=mesh.geometry,position=geometry?.attributes.position;
   if(!position||mesh.isInstancedMesh||geometry.morphAttributes.position?.length)throw Error('unsupported-pose-bound-geometry');
   if(!mesh.isSkinnedMesh){geometry.computeBoundingBox();this.parts.push({mesh,box:geometry.boundingBox});return;}
   const indices=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
   if(!indices||!weights||indices.count!==position.count||weights.count!==position.count)throw Error('missing-pose-bound-weights');
   const boxes=new Array(mesh.skeleton.bones.length).fill(null);
   for(let i=0;i<position.count;i++){
    this.point.fromBufferAttribute(position,i).applyMatrix4(mesh.bindMatrix);let sum=0;
    for(let j=0;j<4;j++){const weight=component(weights,i,j);if(!Number.isFinite(weight)||weight<0)throw Error('invalid-pose-bound-weight');sum+=weight;if(!weight)continue;
     const index=component(indices,i,j);if(!Number.isInteger(index)||index<0||index>=boxes.length)throw Error('invalid-pose-bound-bone');
     (boxes[index]??=new Box3()).expandByPoint(this.point);
    }
    if(Math.abs(sum-1)>1e-4)throw Error('nonconvex-pose-bound-weights');
   }
   this.parts.push({mesh,boxes});
  });if(!this.parts.length)throw Error('empty-pose-bound-geometry');}
  catch(error){this.available=false;this.error=error.message;this.parts=[];}
 }
 project(camera,size,padding=2){
  if(!this.available||!camera.isOrthographicCamera||!Number.isInteger(size)||size<=0)return null;
  camera.updateMatrixWorld(true);this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  const include=(box,matrix)=>{for(let corner=0;corner<8;corner++){
   this.point.set(corner&1?box.max.x:box.min.x,corner&2?box.max.y:box.min.y,corner&4?box.max.z:box.min.z).applyMatrix4(matrix);
   const x=(this.point.x*.5+.5)*size,y=(.5-this.point.y*.5)*size;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }};
  for(const {mesh,box,boxes}of this.parts){
   if(!mesh.visible)continue;
   if(box){this.matrix.multiplyMatrices(this.projection,mesh.matrixWorld);include(box,this.matrix);continue;}
   this.post.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);this.post.premultiply(this.projection);
   for(let index=0;index<boxes.length;index++)if(boxes[index]){this.bone.fromArray(mesh.skeleton.boneMatrices,index*16);this.matrix.multiplyMatrices(this.post,this.bone);include(boxes[index],this.matrix);}
  }
  if(![left,top,right,bottom].every(Number.isFinite))return null;
  const x=Math.max(0,Math.floor(left-padding)),y=Math.max(0,Math.floor(top-padding)),endX=Math.min(size,Math.ceil(right+padding)),endY=Math.min(size,Math.ceil(bottom+padding));
  return endX>x&&endY>y?{x,y,width:endX-x,height:endY-y}:null;
 }
}
