import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const ROOT=new URL('../',import.meta.url);
export const PLAYER_RUNTIME_MODULE_SOURCES=Object.freeze({
 'animation.js':'work/meshy-sprite-baker/src/animation.js',
 'weapon-pose.js':'work/dead-signal-game/player-rig-src/weapon-pose.js',
 'weapon-attachment.js':'work/meshy-sprite-baker/src/weapon-attachment.js',
});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Game IK extensions have a tracked source of their own. The original baker
// remains byte exact, and setup must not silently replace game behavior with it.
export async function loadPlayerRuntimeModule(name,{rootURL=ROOT}={}){
 if(typeof name!=='string'||!Object.hasOwn(PLAYER_RUNTIME_MODULE_SOURCES,name))throw new RangeError('Unknown player runtime module');
 const sourceURL=new URL(PLAYER_RUNTIME_MODULE_SOURCES[name],rootURL),data=await readFile(sourceURL);
 const source=data.toString('utf8'),compiled=source.replaceAll("from 'three'","from './vendor/three.module.js'");
 return{sourceURL,source,compiled,sha256:sha(data),bytes:data.length,compiledSHA256:sha(compiled)};
}
