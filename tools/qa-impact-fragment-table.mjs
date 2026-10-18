import {readFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

export const ORIGINAL_IMPACT_SHA256='a83043664f378b645bdad3c8e19a47077b3824bba629a3a6462bb6b597896dc0';
export const CANDIDATE_IMPACT_SHA256='3c84025b562192dd603866b0e3cb954908c9c0347d76f516b74ff07dcd51729c';
export const IMPACT_FRAGMENT_NOTE='Bounded sequential fresh Node processes run immutable original → SHA-pinned current candidate → immutable original. The candidate precomputes fixed6/10-fragment spread/cos/sin and hoists Math.pow(t,.65) to once per follow-through:24/40 fixed trig calls and5/9 progress pow calls move out of each respective fragment loop. Only actual public drawWeaponImpact calls and the identical lightweight scalar geometry/command-count consumer are timed. The sink uses preallocated save/restore slots, does not retain geometry, and introduces no command trace, hashing or coordinate-array allocation inside call timing. Its JavaScript overhead is included; it prevents simply discarding all coordinates but is not native Canvas. Complete command/IEEE64 hashes and input/state checks run in a separate untimed pass. Module import wall includes parse/evaluation and candidate table initialization; the32 fixed sin/cos initialization calls are not free, and their individual cost is not isolated from import overhead. Shared dependency import is reported separately. Normal unmodified Math is assumed; no monkeypatch, forcedGC, escape of source objects or changed particles/frames is used. These timings are not Canvas/GPU execution, browser/frame pacing, audible or visual quality, game performance, actual heap allocation, or FPS evidence. There is no performance pass/fail threshold.';
const rootURL=new URL('../',import.meta.url);
const impactURL=new URL('../work/dead-signal-game/dist/weapon-impact.js',import.meta.url);
const originalURL=new URL('../qa/dense-cpu-next-20261018/weapon-impact-before-fragment-table.txt',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const usage='Usage: node tools/qa-impact-fragment-table.mjs --out NEW_REPORT.json [--iterations 1..500000]\nDefault40000 calls per arm. --out is exclusively reserved before source loading/workers; existing files are never overwritten. A/B/A are separate sequential Node processes. Exit0=matching independent proof+valid unchanged inputs/state, exit1=mismatch, exit2=CLI/I/O/worker failure. No performance threshold or Canvas/GPU/FPS claim.';

export function parseImpactCLIArgs(args){
  const result={iterations:40000,out:null,worker:null,help:false},seen=new Set();
  for(let i=0;i<args.length;i++){
    const key=args[i];if(key==='--help'||key==='-h'){result.help=true;continue;}
    if(!['--iterations','--out','--worker'].includes(key))throw Error('impact-fragment-unknown-option-'+key);
    if(seen.has(key))throw Error('impact-fragment-duplicate-option-'+key);seen.add(key);
    const value=args[++i];if(!value||value.startsWith('--'))throw Error('impact-fragment-option-value-required-'+key);
    if(key==='--iterations'){if(!/^\d+$/.test(value))throw Error('impact-fragment-iterations-integer');result.iterations=Number(value);}
    else if(key==='--worker'){if(!['original','candidate'].includes(value))throw Error('impact-fragment-worker-mode');result.worker=value;}
    else result.out=value;
  }
  if(!Number.isSafeInteger(result.iterations)||result.iterations<1||result.iterations>500000)throw Error('impact-fragment-iterations-1-to-500000');
  if(result.worker&&result.out)throw Error('impact-fragment-worker-cannot-write');
  if(!result.worker&&!result.help&&!result.out)throw Error('impact-fragment-new-output-required');
  if(result.out&&!/\.json$/i.test(result.out))throw Error('impact-fragment-output-json-required');
  return result;
}

export function makeImpactRecipes(){
  const recipes=[];
  for(const weapon of ['nailgun','shotgun'])for(const shielded of [false,true])for(const lethal of [false,true])for(const hits of [1,4])for(const angle of [0,.7])for(const age of [0,.08,.2,.35,.5,.8,.99]){
    const maxLife=weapon==='shotgun'?.30:.24;
    recipes.push({kind:'weapon-impact',x:1200,y:900,z:shielded?30:22,angle,weapon,shielded,lethal,hits,life:maxLife*(1-age),maxLife});
  }
  // Unchanged public material branches remain a bounded control in the mixture.
  for(const surface of ['metal','concrete'])for(const weapon of ['nailgun','shotgun'])for(const age of [0,.08,.2,.35,.5,.8,.99])
    recipes.push({kind:'weapon-impact',surface,x:1250,y:940,z:22,angle:.7,weapon,shielded:surface==='metal',lethal:false,hits:1,life:.2*(1-age),maxLife:.2});
  return recipes;
}

// No coordinates are retained by this timed sink. State slots and the harmless
// gradient stand-in exist before timing; each arm receives a fresh identical one.
export function createImpactConsumer(){
  let depth=0,commands=0,checksum=0;
  const slots=Array.from({length:8},()=>({alpha:0,composite:null,fill:null,stroke:null,width:0}));
  function consume(tag,a=0,b=0,c=0,d=0,e=0,f=0,g=0){commands++;checksum+=tag+a+b*.5+c*.25+d*.125+e*.0625+f*.03125+g*.015625;}
  const gradient={addColorStop(position,color){consume(17,position,color.length);}};
  const c={globalAlpha:.73,globalCompositeOperation:'source-over',fillStyle:'#102030',strokeStyle:'#405060',lineWidth:1.25,
    save(){if(depth===slots.length)throw Error('impact-fragment-state-overflow');const s=slots[depth++];s.alpha=this.globalAlpha;s.composite=this.globalCompositeOperation;s.fill=this.fillStyle;s.stroke=this.strokeStyle;s.width=this.lineWidth;consume(1);},
    restore(){if(!depth)throw Error('impact-fragment-state-underflow');const s=slots[--depth];this.globalAlpha=s.alpha;this.globalCompositeOperation=s.composite;this.fillStyle=s.fill;this.strokeStyle=s.stroke;this.lineWidth=s.width;consume(2);},
    rotate(a){consume(3,a);},translate(x,y){consume(4,x,y);},beginPath(){consume(5);},
    moveTo(x,y){consume(6,x,y);},lineTo(x,y){consume(7,x,y);},
    stroke(){consume(8,this.globalAlpha,this.lineWidth,typeof this.strokeStyle==='string'?this.strokeStyle.length:0);},
    fill(){consume(9,this.globalAlpha,typeof this.fillStyle==='string'?this.fillStyle.length:0);},
    ellipse(x,y,rx,ry,rotation,start,end){consume(10,x,y,rx,ry,rotation,start,end);},
    arc(x,y,r,start,end){consume(11,x,y,r,start,end);},
    fillRect(x,y,w,h){consume(12,x,y,w,h,this.globalAlpha);},
    createRadialGradient(x0,y0,r0,x1,y1,r1){consume(16,x0,y0,r0,x1,y1,r1);return gradient;}
  };
  return{context:c,snapshot(){return{commands,checksum,depth,state:{globalAlpha:c.globalAlpha,globalCompositeOperation:c.globalCompositeOperation,fillStyle:c.fillStyle,strokeStyle:c.strokeStyle,lineWidth:c.lineWidth}};}};
}

// Separate strict command proof; numbers are hashed as IEEE64 bytes so signed
// zero is not silently normalized by JSON. No command buffer is retained.
export function impactCommandProof(draw,recipes){
  const digest=createHash('sha256'),numberBytes=Buffer.allocUnsafe(8),style={},stack=[],gradients=new WeakMap();let count=0,nextGradient=0;
  function value(v){
    if(typeof v==='number'){digest.update('number:');numberBytes.writeDoubleLE(v);digest.update(numberBytes);}
    else if(v&&typeof v==='object'){const id=gradients.get(v);if(!id)throw Error('impact-fragment-unexpected-command-object');digest.update('gradient:'+id+';');}
    else digest.update(typeof v+':'+String(v)+';');
  }
  function emit(name,args=[]){count++;digest.update(name+'(');for(const v of args)value(v);digest.update(')');}
  const c={};
  const initial={globalAlpha:.73,globalCompositeOperation:'source-over',fillStyle:'#102030',strokeStyle:'#405060',lineWidth:1.25};
  for(const [key,v]of Object.entries(initial)){style[key]=v;Object.defineProperty(c,key,{get:()=>style[key],set:next=>{style[key]=next;emit('set:'+key,[next]);}});}
  c.save=()=>{stack.push({...style});emit('save');};
  c.restore=()=>{if(!stack.length)throw Error('impact-fragment-proof-underflow');Object.assign(style,stack.pop());emit('restore');};
  for(const name of ['rotate','translate','beginPath','moveTo','lineTo','stroke','fill','ellipse','arc','fillRect'])c[name]=(...args)=>emit(name,args);
  c.createRadialGradient=(...args)=>{emit('createRadialGradient',args);const gradient={addColorStop(...stops){emit('addColorStop',stops);}};gradients.set(gradient,++nextGradient);return gradient;};
  const inputBefore=hash(JSON.stringify(recipes));let trueReturns=0;
  for(const recipe of recipes){const returned=draw(c,recipe,null);value(returned);if(returned===true)trueReturns++;if(stack.length)throw Error('impact-fragment-proof-unbalanced-call');}
  return{commands:count,commandSha256:digest.digest('hex'),returns:trueReturns,inputSha256:inputBefore,inputsUnchanged:hash(JSON.stringify(recipes))===inputBefore,stateRestored:JSON.stringify(style)===JSON.stringify(initial),depth:stack.length};
}

const moduleSpecifiers=source=>[...source.matchAll(/from\s+(['"])(\.[^'"]+)\1/g)].map(match=>new URL(match[2],impactURL).href);
const relocatedModule=source=>source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_match,_quote,specifier)=>'from '+JSON.stringify(new URL(specifier,impactURL).href)).replaceAll('import.meta.url',JSON.stringify(impactURL.href));
const cpuMs=usage=>(usage.user+usage.system)/1000;
function measureCalls(draw,recipes,iterations){
  const sink=createImpactConsumer(),inputBefore=hash(JSON.stringify(recipes));let returns=0;
  const coldCPU=process.cpuUsage(),coldStart=performance.now();const coldReturn=draw(sink.context,recipes[0],null);const coldWallMs=performance.now()-coldStart,coldCpuMs=cpuMs(process.cpuUsage(coldCPU));
  const cold=sink.snapshot();
  const steadyCPU=process.cpuUsage(),steadyStart=performance.now();
  for(let i=0;i<iterations;i++)if(draw(sink.context,recipes[i%recipes.length],null))returns++;
  const callWallMs=performance.now()-steadyStart,callCpuMs=cpuMs(process.cpuUsage(steadyCPU));
  const final=sink.snapshot(),inputsUnchanged=hash(JSON.stringify(recipes))===inputBefore;
  return{cold:{callWallMs:coldWallMs,callCpuMs:coldCpuMs,returnValue:coldReturn,...cold},steady:{calls:iterations,callWallMs,callCpuMs,returnChecksum:returns,commands:final.commands-cold.commands,scalarChecksum:final.checksum-cold.checksum},finalState:final.state,depth:final.depth,inputsUnchanged,inputSha256:inputBefore};
}

export async function runImpactWorker(mode,{iterations=40000}={}){
  if(!['original','candidate'].includes(mode))throw Error('impact-fragment-worker-mode');
  if(!Number.isSafeInteger(iterations)||iterations<1||iterations>500000)throw Error('impact-fragment-iterations-1-to-500000');
  const original=await readFile(originalURL,'utf8'),candidate=await readFile(impactURL,'utf8');
  if(hash(original)!==ORIGINAL_IMPACT_SHA256)throw Error('impact-fragment-original-sha-mismatch');
  if(hash(candidate)!==CANDIDATE_IMPACT_SHA256)throw Error('impact-fragment-candidate-sha-mismatch');
  const dependencies=[...new Set([...moduleSpecifiers(original),...moduleSpecifiers(candidate)])];
  const dependencyStart=performance.now();for(const url of dependencies)await import(url);const dependencyImportWallMs=performance.now()-dependencyStart;
  const selected=mode==='original'?original:candidate,url='data:text/javascript;base64,'+Buffer.from(relocatedModule(selected)).toString('base64');
  const importStart=performance.now(),module=await import(url),moduleImportWallMs=performance.now()-importStart;
  if(typeof module.drawWeaponImpact!=='function')throw Error('impact-fragment-public-export-missing');
  const recipes=makeImpactRecipes(),measurement=measureCalls(module.drawWeaponImpact,recipes,iterations),proof=impactCommandProof(module.drawWeaponImpact,recipes);
  return{mode,nodeVersion:process.version,v8Version:process.versions.v8,platform:process.platform,arch:process.arch,nodeFlags:[...process.execArgv],originalModuleSha256:ORIGINAL_IMPACT_SHA256,candidateModuleSha256:CANDIDATE_IMPACT_SHA256,recipeCount:recipes.length,iterations,setup:{dependencyImportWallMs,moduleImportWallMs,moduleImportScope:'Shared dependencies preloaded identically in each worker; module import includes parse/evaluation and any candidate table initialization, not an isolated32-trig timer.'},measurement,proof,valid:measurement.inputsUnchanged&&measurement.depth===0&&measurement.cold.depth===0&&measurement.steady.commands>0&&Number.isFinite(measurement.steady.scalarChecksum)&&measurement.steady.scalarChecksum!==0&&measurement.steady.returnChecksum===iterations&&proof.inputsUnchanged&&proof.stateRestored&&proof.depth===0&&proof.returns===recipes.length,note:IMPACT_FRAGMENT_NOTE};
}

export function spawnImpactWorker(mode,{iterations=40000}={}){
  return new Promise((resolveChild,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker',mode,'--iterations',String(iterations)],{cwd:fileURLToPath(rootURL),windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',overflow=false;
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>1024*1024){overflow=true;child.kill();}});child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8000);});
    child.on('error',reject);child.on('close',(code,signal)=>{if(overflow){reject(Error('impact-fragment-worker-output-limit'));return;}if(code!==0){reject(Error(`impact-fragment-worker-failed-${mode}-${code}-${signal}: ${stderr}`));return;}try{resolveChild(JSON.parse(stdout));}catch{reject(Error('impact-fragment-worker-invalid-json'));}});
  });
}
function comparable(run){
  const {cold,steady,...rest}=run.measurement,{callWallMs:cw,callCpuMs:cc,...coldProof}=cold,{callWallMs:sw,callCpuMs:sc,...steadyProof}=steady;
  return{nodeVersion:run.nodeVersion,v8Version:run.v8Version,platform:run.platform,arch:run.arch,nodeFlags:run.nodeFlags,originalModuleSha256:run.originalModuleSha256,candidateModuleSha256:run.candidateModuleSha256,recipeCount:run.recipeCount,iterations:run.iterations,measurement:{...rest,cold:coldProof,steady:steadyProof},proof:run.proof};
}
export async function compareImpactFragmentTable({iterations=40000}={},runChild=spawnImpactWorker){
  const runs=[];for(const [index,mode]of ['original','candidate','original'].entries())runs.push({arm:index===0?'A':index===1?'B':'A-repeat',...await runChild(mode,{iterations})});
  const expected=JSON.stringify(comparable(runs[0])),outputsExact=runs.every(run=>JSON.stringify(comparable(run))===expected),allValid=runs.every(run=>run.valid);
  return{diagnosticOnly:true,iterations,processOrder:'sequential fresh Node A original → B candidate → A original-repeat',outputsExact,allValid,runs,note:IMPACT_FRAGMENT_NOTE};
}

export async function runImpactCLI(args,{stdout=value=>console.log(value),stderr=value=>console.error(value),runChild=spawnImpactWorker}={}){
  let output=null;
  try{
    const options=parseImpactCLIArgs(args);if(options.help){stdout(usage);return 0;}
    // Atomic early guard: no source read/import or diagnostic work occurs before
    // exclusive creation. Failure evidence is retained in this reserved report.
    if(options.out)output=await open(resolve(options.out),'wx');
    const report=options.worker?await runImpactWorker(options.worker,options):await compareImpactFragmentTable(options,runChild),text=JSON.stringify(report,null,2)+'\n';
    if(output)await output.writeFile(text);stdout(text.trimEnd());return options.worker?0:report.outputsExact&&report.allValid?0:1;
  }catch(error){
    const failure={diagnosticOnly:true,error:error?.message??String(error),note:IMPACT_FRAGMENT_NOTE};
    if(output)try{await output.writeFile(JSON.stringify(failure,null,2)+'\n');}catch{}
    stderr(JSON.stringify({...failure,usage}));return 2;
  }finally{if(output)await output.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await runImpactCLI(process.argv.slice(2));
