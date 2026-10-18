import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const qa=new URL('./',import.meta.url),read=async file=>JSON.parse(await readFile(new URL(file,qa),'utf8'));
const focus=await readFile(new URL('focused.log',qa),'utf8'),whole=await readFile(new URL('npm-test.log',qa),'utf8');
function result(log){return Object.fromEntries(['tests','pass','fail','cancelled','skipped','duration_ms'].map(key=>[key,Number(log.match(new RegExp('^# '+key+' ([0-9.]+)$','m'))?.[1])]));}
const tests={focused:result(focus),whole:result(whole),wholeFailures:[...whole.matchAll(/^not ok (.+)$/gm)].map(match=>match[1]),cpuBudgetFailure:whole.match(/Headless twenty minute simulation exceeds its CPU budget: CPU=[^'\r\n]+/)?.[0],exits:await read('test-exits.json'),verifyFirstFailure:'.gitignore historical size mismatch; verifier stopped first error before hashing, unchanged manifest not regenerated',source:(await read('source-after-whole.json')).count};
assert.equal(tests.focused.tests,18);assert.equal(tests.focused.fail,0);assert.equal(tests.whole.tests,1298);assert.equal(tests.whole.pass,1297);assert.equal(tests.whole.fail,1);assert.equal(tests.wholeFailures.length,1);
await writeFile(new URL('test-summary.json',qa),JSON.stringify(tests,null,2)+'\n');
const raw=await read('iab-raw.json'),r=raw.report??raw;
const browser={complete:r.complete,error:raw.error??r.error??null,injected:r.injected,qualityOnly:r.qualityOnly,boundedOwnedCleanup:r.boundedOwnedCleanup,fixture:r.fixture,passes:r.passes?.map(pass=>({arm:pass.arm,mode:pass.mode,samples:pass.samples?.length,finalState:pass.finalState,originalReadbackGameUnchanged:pass.originalReadbackGameUnchanged,originalReadback:pass.originalReadback})),equivalence:r.equivalence,pixels:r.pixels,performance:r.performance,cleanup:r.cleanup};
browser.raw={bytes:(await stat(new URL('iab-raw.json',qa))).size,sha256:createHash('sha256').update(await readFile(new URL('iab-raw.json',qa))).digest('hex')};
await writeFile(new URL('browser-analysis.json',qa),JSON.stringify(browser,null,2)+'\n');
console.log(JSON.stringify({tests,complete:browser.complete,error:browser.error,pixels:browser.pixels,cleanup:browser.cleanup},null,2));
