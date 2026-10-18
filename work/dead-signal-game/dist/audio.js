import {soundPerspective} from './sound-perspective.js';

const NOISE_ENVELOPE_MAX_BYTES=1024*1024,NOISE_ENVELOPE_MAX_ENTRIES=24;
// Only immutable-by-convention decay doubles are retained. No AudioContext,
// AudioBuffer, node, source or listener reference belongs to this cache.
const noiseEnvelopes=new WeakMap();
function allocateNoiseEnvelope(owner,length){
  if(!Number.isSafeInteger(length)||length<=0||length>NOISE_ENVELOPE_MAX_BYTES/8)return null;
  const cache=noiseEnvelopes.get(owner);
  // First-arrival admission avoids repeatedly allocating and evicting curves
  // when a high sample rate or many lengths exceed this bounded working set.
  if(cache&&(cache.values.size>=NOISE_ENVELOPE_MAX_ENTRIES||cache.bytes+length*8>NOISE_ENVELOPE_MAX_BYTES))return null;
  try{return new Float64Array(length);}catch{return null;}
}
function rememberNoiseEnvelope(owner,length,envelope){
  if(!envelope)return;
  // Caching is optional: a failed allocation must not suppress the voice whose
  // original buffer and samples have already been created successfully.
  try{
    let cache=noiseEnvelopes.get(owner);
    if(!cache){cache={values:new Map(),bytes:0};noiseEnvelopes.set(owner,cache);}
    if(cache.values.has(length))return;
    const bytes=length*8;
    // A reentrant sample callback may have filled the cache since admission.
    if(cache.values.size>=NOISE_ENVELOPE_MAX_ENTRIES||cache.bytes+bytes>NOISE_ENVELOPE_MAX_BYTES)return;
    cache.values.set(length,envelope);cache.bytes+=bytes;
  }catch{/* Keep the freshly generated voice on the original path. */}
}
/** QA snapshot only; no per-voice clock or observation counter is maintained. */
export function audioNoiseEnvelopeStats(owner){
  const cache=noiseEnvelopes.get(owner);
  return Object.freeze({entries:cache?.values.size??0,bytes:cache?.bytes??0,maxEntries:NOISE_ENVELOPE_MAX_ENTRIES,maxBytes:NOISE_ENVELOPE_MAX_BYTES});
}

export class AudioSystem {
  constructor(){this.enabled=true;this.volume=.35;this.ctx=null;this.last={};this.active=0;this.voiceLimit=22;this.listener=null;this.perspective={pan:0,gain:1};this.forceFreshNoiseEnvelope=false;}
  unlock(){try{if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.ctx=new C();this.master=this.ctx.createGain();if(this.ctx.createDynamicsCompressor){this.compressor=this.ctx.createDynamicsCompressor();this.compressor.threshold.value=-12;this.compressor.knee.value=18;this.compressor.ratio.value=4;this.compressor.attack.value=.003;this.compressor.release.value=.12;this.master.connect(this.compressor);this.compressor.connect(this.ctx.destination);}else this.master.connect(this.ctx.destination);}if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});}catch{}}
  setEnabled(value){this.enabled=!!value;if(this.master&&this.ctx)this.master.gain.setTargetAtTime(this.enabled?this.volume:0,this.ctx.currentTime,.03);}
  connectVoice(gain){const c=this.ctx;if(!c.createStereoPanner){gain.connect(this.master);return null;}const panner=c.createStereoPanner();panner.pan.value=this.perspective.pan;gain.connect(panner);panner.connect(this.master);return panner;}
  tone(freq,duration=.15,type='sine',gain=.12,slide=0,delay=0){const c=this.ctx;if(!c||this.active>=this.voiceLimit)return;try{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(10,slide),t+duration);g.gain.setValueAtTime(gain*this.perspective.gain,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);const panner=this.connectVoice(g);o.start(t);o.stop(t+duration+.02);this.active++;o.onended=()=>{this.active--;o.disconnect();g.disconnect();panner?.disconnect();};}catch{}}
  noise(duration=.12,gain=.15,cutoff=1000,delay=0,filterType='lowpass'){
    const c=this.ctx;if(!c||this.active>=this.voiceLimit)return;
    try{
      // Preserve buffer creation and its invalid-length failures before any
      // optional cache work. Every voice still owns a fresh original buffer.
      const len=Math.floor(c.sampleRate*duration),b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);
      if(this.forceFreshNoiseEnvelope===true){
        for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,1.8);
      }else{
        const cached=noiseEnvelopes.get(this)?.values.get(len);
        if(cached){
          for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*cached[i];
        }else{
          const envelope=allocateNoiseEnvelope(this,len);
          if(envelope){
            for(let i=0;i<len;i++){
              // Keep the original random -> pow -> multiply evaluation order.
              // Float64 stores the same decay double before Float32 PCM rounds.
              const random=Math.random()*2-1,decay=Math.pow(1-i/len,1.8);
              d[i]=random*decay;envelope[i]=decay;
            }
            // An interrupted sample loop must never publish a partial curve.
            rememberNoiseEnvelope(this,len,envelope);
          }else{
            for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,1.8);
          }
        }
      }
      const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=b;f.type=filterType;f.frequency.value=cutoff;g.gain.value=gain*this.perspective.gain;s.connect(f);f.connect(g);const panner=this.connectVoice(g);s.start(c.currentTime+Math.max(0,delay));this.active++;s.onended=()=>{this.active--;s.disconnect();f.disconnect();g.disconnect();panner?.disconnect();};
    }catch{}
  }
  play(type,data={}){if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;const now=this.ctx.currentTime,limits={kill:.10,hit:.07,shot:.06,explosion:.08,shock:.10,scream:1};if(now-(this.last[type]??-99)<(limits[type]??.03))return;this.last[type]=now;this.voiceLimit=['shot','hit','kill','wall-hit'].includes(type)?14:22;this.master.gain.value=this.volume;this.perspective=soundPerspective(data,this.listener);
    if(type==='shot'){if(data.weapon==='nailgun'){this.noise(.045,.12,3800);this.tone(920,.045,'square',.055,170);}else{this.noise(.045,.4,5200);this.noise(.24,.24,1100);this.tone(110,.2,'triangle',.3,32);this.tone(630,.045,'square',.045,180,.055);}}
    else if(type==='explosion'){this.noise(.035,.28,4800);this.noise(.48,.5,750);this.tone(90,.4,'triangle',.4,23);this.noise(.18,.10,2100,.12);}
    else if(type==='radio'){this.tone(710,.045,'sine',.045,640);this.tone(940,.045,'sine',.035,830,.07);}
    else if(type==='lure'){this.tone(620,.15,'sine',.14,480);this.tone(740,.12,'sine',.1,620,.17);}
    else if(type==='dash')this.noise(.1,.08,2200);
    else if(type==='fire-throw'){this.noise(.16,.12,3200);this.tone(190,.18,'triangle',.09,520);}
    else if(type==='fire-fall'){this.noise(.3,.12,650);this.tone(75,.18,'triangle',.08,27);}
    else if(type==='fire'){this.noise(.04,.18,3800,0,'highpass');this.tone(2350,.085,'triangle',.055,1700,.015);this.noise(.4,.25,1200,.025);this.tone(125,.22,'triangle',.14,38,.025);}
    else if(type==='hurt'){this.tone(180,.17,'sawtooth',.12,55);this.noise(.09,.1,1200);}
    else if(type==='kill')this.tone(95,.055,'triangle',.06,50);
    else if(type==='wall-hit'){if(data.material==='metal'){this.noise(.045,.12,5200);this.tone(790,.1,'triangle',.07,190);}else{this.noise(.075,.12,1850);this.tone(150,.045,'triangle',.06,55);}}
    else if(type==='hit'){if(data.shielded){this.noise(.035,.08,4200);this.tone(370,.055,'triangle',.055,110);}else{this.noise(data.weapon==='shotgun'?.09:.045,.14,1450);this.tone(data.weapon==='shotgun'?100:175,.08,'triangle',.09,45);if(data.lethal)this.noise(.16,.11,680);}}
    else if(type==='reload')this.noise(.04,.07,data.weapon==='nailgun'?4600:2100);
    else if(type==='reload-stage'){
      if(data.stage==='retrieve')this.noise(.045,.055,1250);
      else if(data.stage==='feed'){this.noise(.035,.09,3800);this.tone(145,.055,'triangle',.045,70);}
      else if(data.stage==='seat'){this.noise(.055,.10,2400);this.tone(720,.035,'triangle',.035,320);}
      else if(data.stage==='rack'){this.noise(.04,.085,4300);this.tone(480,.045,'triangle',.035,210);}
    }
    else if(type==='loaded'){this.noise(.025,.07,data.weapon==='nailgun'?4400:2600);this.tone(data.weapon==='nailgun'?650:245,.045,'triangle',.045,data.weapon==='nailgun'?280:90);}
    else if(type==='shock'){this.noise(.1,.1,6000);this.tone(1500,.07,'sawtooth',.06,320);}
    else if(['levelup','upgrade','heal','alarmclear'].includes(type)){[440,554,660].forEach((f,i)=>this.tone(f,.22,'sine',.13,0,i*.075));}
    else if(['alarm','bosswarn','scream'].includes(type)){this.tone(350,.45,'sawtooth',.09,610);this.tone(610,.45,'sawtooth',.07,350,.47);}
    else if(type==='boss-wall'){this.noise(.12,.2,data.material==='metal'?2800:850);this.tone(data.material==='metal'?190:85,.16,'triangle',.16,32);}
    else if(type==='charge'){this.noise(.25,.3,500);this.tone(100,.3,'triangle',.18,28);}
    else if(type==='end'){const notes=data.result?.won?[330,440,554,660]:[220,180,130];notes.forEach((f,i)=>this.tone(f,.5,'triangle',.13,0,i*.15));}
  }
}
