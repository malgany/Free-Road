import * as Tone from 'tone';
import {CUES,drivingMix,type Cue,type Surface} from './audio-model';
import type {CarState,Input} from './types';
import {clamp} from './geometry';

export class GameAudio {
 volume=.55;muted=false;ready=false;failed=false;
 private opening?:Promise<void>;private nodes:Tone.ToneAudioNode[]=[];
 private master!:Tone.Gain;private driving!:Tone.Gain;private engine!:Tone.Oscillator;private harmonic!:Tone.Oscillator;
 private engineGain!:Tone.Gain;private roadGain!:Tone.Gain;private skidGain!:Tone.Gain;private roadFilter!:Tone.Filter;
 private ui!:Tone.Synth;private reverse!:Tone.Synth;private thud!:Tone.MembraneSynth;private crunch!:Tone.NoiseSynth;private meter!:Tone.Meter;
 private crunchAt=-Infinity;private elapsed=0;private reverseAt=-Infinity;private cueAt=-Infinity;private previousSurface:Surface|undefined;
 constructor(){try{const saved=JSON.parse(localStorage.getItem('free-road-audio')??'null');if(saved){if(typeof saved.volume==='number'&&Number.isFinite(saved.volume))this.volume=clamp(saved.volume,0,1);this.muted=saved.muted===true;}}catch{}}
 async unlock(){
  if(this.ready){try{await Tone.start();}catch{this.failed=true;}return;}
  if(this.opening)return this.opening;
  this.opening=(async()=>{try{
   await Tone.start();
   const keep=<T extends Tone.ToneAudioNode>(node:T)=>{this.nodes.push(node);return node;};
   const limiter=keep(new Tone.Limiter(-6)).toDestination();this.master=keep(new Tone.Gain(this.muted?0:this.volume)).connect(limiter);
   this.meter=keep(new Tone.Meter({normalRange:true,smoothing:.7}));this.master.connect(this.meter);
   this.driving=keep(new Tone.Gain(0)).connect(this.master);
   const filter=keep(new Tone.Filter(330,'lowpass')).connect(this.driving);
   this.engineGain=keep(new Tone.Gain(0)).connect(filter);
   this.engine=keep(new Tone.Oscillator(45,'sawtooth')).connect(this.engineGain).start();
   const harmonicGain=keep(new Tone.Gain(.3)).connect(this.engineGain);
   this.harmonic=keep(new Tone.Oscillator(90,'triangle')).connect(harmonicGain).start();
   this.roadGain=keep(new Tone.Gain(0)).connect(this.driving);this.roadFilter=keep(new Tone.Filter(250,'bandpass')).connect(this.roadGain);
   keep(new Tone.Noise('pink')).connect(this.roadFilter).start();
   this.skidGain=keep(new Tone.Gain(0)).connect(this.driving);
   const skidFilter=keep(new Tone.Filter(1800,'bandpass')).connect(this.skidGain);keep(new Tone.Noise('white')).connect(skidFilter).start();
   this.ui=keep(new Tone.Synth({oscillator:{type:'sine'},envelope:{attack:.003,decay:.03,sustain:0,release:.06}})).connect(this.master);
   this.reverse=keep(new Tone.Synth({oscillator:{type:'sine'},envelope:{attack:.008,decay:.05,sustain:.1,release:.06}})).connect(this.driving);
   this.thud=keep(new Tone.MembraneSynth({pitchDecay:.025,octaves:3,envelope:{attack:.002,decay:.16,sustain:0,release:.12}})).connect(this.driving);
   this.crunch=keep(new Tone.NoiseSynth({noise:{type:'brown'},envelope:{attack:.001,decay:.12,sustain:0,release:.04}})).connect(this.driving);
   this.ready=true;this.failed=false;
  }catch{this.failed=true;for(const node of this.nodes)node.dispose();this.nodes=[];}finally{this.opening=undefined;}})();
  return this.opening;
 }
 set(volume=this.volume,muted=this.muted){this.volume=clamp(volume,0,1);this.muted=muted;try{localStorage.setItem('free-road-audio',JSON.stringify({volume:this.volume,muted}));}catch{}this.applyMaster();}
 private applyMaster(){if(this.ready)this.master.gain.rampTo(this.muted||document.hidden?0:this.volume,.04);}
 cue(kind:Cue){if(!this.ready||this.muted||document.hidden)return;const now=Tone.now();if(now-this.cueAt<(kind==='hover'?.09:.035))return;this.cueAt=now;const [hz,duration,velocity]=CUES[kind];this.ui.triggerAttackRelease(hz,duration,now,velocity);}
 impact(strength:number){if(!this.ready||this.muted||document.hidden)return;const velocity=clamp(strength/30,.15,.7),now=Tone.now();this.thud.triggerAttackRelease(55,.08,now,velocity);this.crunchAt=Math.max(now,this.crunchAt+.001);this.crunch.triggerAttackRelease(.065,this.crunchAt,velocity*.5);}
 silence(){if(this.ready){this.driving.gain.rampTo(0,.035);this.applyMaster();}this.previousSurface=undefined;}
 update(s:CarState,input:Input,surface:Surface,running:boolean,dt:number){
  if(!this.ready)return;this.elapsed+=dt;if(this.elapsed<.05)return;this.elapsed=0;
  const active=running&&!document.hidden;const mix=drivingMix(s,input,surface,active);
  this.driving.gain.rampTo(active?1:0,.05);this.applyMaster();
  this.engine.frequency.rampTo(mix.engineHz,.1);this.harmonic.frequency.rampTo(mix.engineHz*2,.1);
  this.engineGain.gain.rampTo(mix.engineGain,.09);this.roadFilter.frequency.rampTo(mix.roadHz,.12);this.roadGain.gain.rampTo(mix.roadGain,.1);this.skidGain.gain.rampTo(mix.skidGain,.08);
  const now=Tone.now();if(mix.reverse&&now-this.reverseAt>.85&&!this.muted){this.reverseAt=now;this.reverse.triggerAttackRelease(480,.09,now,.08);}
  if(active&&this.previousSurface!==undefined&&surface!==this.previousSurface&&surface==='water'&&!this.muted){this.crunchAt=Math.max(now,this.crunchAt+.001);this.crunch.triggerAttackRelease(.16,this.crunchAt,.15);}
  this.previousSurface=active?surface:undefined;
 }
 level(){if(!this.ready)return 0;const value=this.meter.getValue();return typeof value==='number'?clamp(value,0,1):0;}
 dispose(){for(const node of this.nodes)node.dispose();this.nodes=[];this.ready=false;}
}
