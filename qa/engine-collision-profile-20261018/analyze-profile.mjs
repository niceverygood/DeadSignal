import {readFile,writeFile} from 'node:fs/promises';
const qa=new URL('./',import.meta.url),p=JSON.parse(await readFile(new URL('diagnostic.cpuprofile',qa),'utf8')),map=new Map(p.nodes.map(node=>[node.id,node])),counts=new Map();
for(let i=0;i<p.samples.length;i++)counts.set(p.samples[i],(counts.get(p.samples[i])??0)+(p.timeDeltas[i]??0));
const total=[...counts.values()].reduce((a,b)=>a+b,0),cache=new Map();
function inclusive(id){if(cache.has(id))return cache.get(id);const node=map.get(id);let ms=counts.get(id)??0;for(const child of node.children??[])ms+=inclusive(child);cache.set(id,ms);return ms;}
const nodes=p.nodes.map(node=>({name:node.callFrame.functionName,url:node.callFrame.url,line:node.callFrame.lineNumber+1,selfMs:(counts.get(node.id)??0)/1000,selfFraction:(counts.get(node.id)??0)/total,inclusiveMs:inclusive(node.id)/1000}));
const report={sampleWallMs:total/1000,self:nodes.sort((a,b)=>b.selfMs-a.selfMs).slice(0,35),inclusive:[...nodes].filter(row=>row.url.includes('dead-signal-game')).sort((a,b)=>b.inclusiveMs-a.inclusiveMs).slice(0,25),note:'V8 sampled wall attribution under diagnostic CPUprofile. Self/inclusive may contain inlined/native costs; not an unprofiled performance bracket or allocation measurement.'};await writeFile(new URL('profile-analysis.json',qa),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.self.slice(0,16),null,2));
