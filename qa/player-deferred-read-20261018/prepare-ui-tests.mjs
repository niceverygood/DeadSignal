import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const prior=await readFile(new URL('work/dead-signal-game/tests/qa-player-alpha-rows-ui.test.mjs',root),'utf8');
const source=prior.replaceAll('player-alpha-rows','player-deferred-read').replaceAll('PlayerAlphaRows','PlayerDeferredRead').replaceAll('playerAlphaRows','playerDeferredRead').replaceAll('PLAYER ALPHA ROWS','PLAYER DEFERRED READ').replaceAll('183586','187056').replaceAll('quality URL explicitly selects same-frame verification','quality URL explicitly selects same-context frozen-pose verification').replaceAll('preparation UI preserves','deferred read UI preserves').replaceAll('imports the original-only harness','imports the original/deferred/original harness');
await writeFile(new URL('work/dead-signal-game/tests/qa-player-deferred-read-ui.test.mjs',root),source);
