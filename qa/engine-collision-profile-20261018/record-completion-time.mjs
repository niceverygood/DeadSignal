import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const qa=new URL('./',import.meta.url),from='2026-10-18T08:19:27Z',to='2026-10-18T08:19:58Z',before=await readFile(new URL('continuation-before.txt',qa)),journalURL=new URL('../../WINDOWS_CONTINUATION.txt',qa),journal=await readFile(journalURL);assert.ok(journal.subarray(0,before.length).equals(before));
for(const file of ['decision.json','CONTINUATION_STATUS_KO.txt']){const url=new URL(file,qa),text=await readFile(url,'utf8');assert.equal(text.split(from).length,2);await writeFile(url,text.replace(from,to));}
const tail=journal.subarray(before.length).toString('utf8');assert.equal(tail.split(from).length,2);const after=Buffer.concat([before,Buffer.from(tail.replace(from,to))]);await writeFile(journalURL,after);assert.ok(after.subarray(0,before.length).equals(before));console.log('Completion time recorded from final trusted clock; prior journal prefix unchanged.');
