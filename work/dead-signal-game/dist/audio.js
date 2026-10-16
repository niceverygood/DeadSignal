export class AudioSystem {
  constructor(){this.enabled=true;this.volume=.35;this.ctx=null;this.last={};this.active=0;}
  unlock(){try{if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.ctx=new C();this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);}if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});}catch{}}
  setEnabled(value){this.enabled=!!value;if(this.master&&this.ctx)this.master.gain.setTargetAtTime(this.enabled?this.volume:0,this.ctx.currentTime,.03);}
  tone(freq,duration=.15,type='sine',gain=.12,slide=0,delay=0){const c=this.ctx;if(!c||this.active>=22)return;try{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(10,slide),t+duration);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.02);this.active++;o.onended=()=>{this.active--;o.disconnect();g.disconnect();};}catch{}}
  noise(duration=.12,gain=.15,cutoff=1000){const c=this.ctx;if(!c||this.active>=22)return;try{const len=Math.floor(c.sampleRate*duration),b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,1.8);const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=b;f.type='lowpass';f.frequency.value=cutoff;g.gain.value=gain;s.connect(f);f.connect(g);g.connect(this.master);s.start();this.active++;s.onended=()=>{this.active--;s.disconnect();f.disconnect();g.disconnect();};}catch{}}
  play(type,data={}){if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;const now=this.ctx.currentTime,limits={kill:.10,hit:.07,shot:.06,explosion:.08,shock:.10,scream:1};if(now-(this.last[type]??-99)<(limits[type]??.03))return;this.last[type]=now;this.master.gain.value=this.volume;
    if(type==='shot'){if(data.weapon==='nailgun'){this.noise(.045,.12,3800);this.tone(920,.045,'square',.055,170);}else{this.noise(.15,.35,2100);this.tone(125,.18,'triangle',.33,38);}}
    else if(type==='explosion'){this.noise(.48,.5,750);this.tone(90,.4,'triangle',.4,23);}
    else if(type==='lure'){this.tone(620,.15,'sine',.14,480);this.tone(740,.12,'sine',.1,620,.17);}
    else if(type==='dash')this.noise(.1,.08,2200);
    else if(type==='fire'){this.noise(.28,.22,2500);this.tone(330,.08,'triangle',.1,90);}
    else if(type==='hurt'){this.tone(180,.17,'sawtooth',.12,55);this.noise(.09,.1,1200);}
    else if(type==='kill')this.tone(95,.055,'triangle',.06,50);
    else if(type==='hit'){if(data.shielded){this.noise(.035,.08,4200);this.tone(370,.055,'triangle',.055,110);}else{this.noise(.045,.09,850);this.tone(125,.045,'triangle',.045,52);}}
    else if(type==='reload'){this.noise(.06,.09,3500);this.noise(.04,.07,2800);}
    else if(type==='loaded')this.tone(450,.05,'square',.045,230);
    else if(type==='shock'){this.noise(.1,.1,6000);this.tone(1500,.07,'sawtooth',.06,320);}
    else if(['levelup','upgrade','heal','alarmclear'].includes(type)){[440,554,660].forEach((f,i)=>this.tone(f,.22,'sine',.13,0,i*.075));}
    else if(['alarm','bosswarn','scream'].includes(type)){this.tone(350,.45,'sawtooth',.09,610);this.tone(610,.45,'sawtooth',.07,350,.47);}
    else if(type==='charge'){this.noise(.25,.3,500);this.tone(100,.3,'triangle',.18,28);}
    else if(type==='end'){const notes=data.result?.won?[330,440,554,660]:[220,180,130];notes.forEach((f,i)=>this.tone(f,.5,'triangle',.13,0,i*.15));}
  }
}
