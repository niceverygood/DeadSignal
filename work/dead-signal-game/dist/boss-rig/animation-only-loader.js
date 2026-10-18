import {Texture} from '../player-rig/vendor/three.module.js';
import {GLTFLoader} from '../player-rig/vendor/GLTFLoader.js';

// The secondary walk GLB contributes clips only. Its mesh/materials never
// enter the visible scene; do not decode another4096px copy of their texture.
export function createAnimationOnlyLoader(){
  const loader=new GLTFLoader();loader.skippedTextures=0;
  loader.register(()=>({name:'native-walk-animation-only',loadTexture:()=>{loader.skippedTextures++;return Promise.resolve(new Texture());}}));
  return loader;
}
