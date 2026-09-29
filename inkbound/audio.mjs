export class Sound {
 constructor(){this.ctx=null;this.enabled=true;this.music=true;this.timer=null;this.step=0;}
 init(){if(!this.ctx){try{this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=.18;this.master.connect(this.ctx.destination);}catch{return;}}this.ctx.resume();if(!this.timer)this.timer=setInterval(()=>this.ambient(),850);}
 tone(freq,duration=.2,type='sine',vol=.25,delay=0){if(!this.ctx||!this.enabled)return;const c=this.ctx,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.05);}
 play(kind){this.init();const notes={click:[440],paint:[392,523,784],card:[440,660],hit:[180,90],guard:[330,495],reward:[392,494,587,784],defeat:[220,196,147],turn:[294,220]};(notes[kind]||notes.click).forEach((n,i)=>this.tone(n,kind==='hit'?.12:.4,kind==='hit'?'triangle':'sine',.3,i*.065));}
 ambient(){if(!this.music||!this.enabled||document.hidden)return;const notes=[196,0,294,330,0,392,294,0,220,0,330,440,392,0,294,0];let f=notes[this.step++%notes.length];if(f)this.tone(f,2.5,'sine',.085);if(this.step%8===0){this.tone(98,5,'sine',.12);this.tone(147,4,'sine',.055);}}
}
