import type {CarState,Input} from './types';
import {CAR} from './config';
import {clamp} from './geometry';
export type Surface='asphalt'|'neutral'|'dirt'|'grass'|'forest'|'water';
export type Cue='click'|'hover'|'menu'|'back'|'start'|'camera'|'reset'|'success'|'error'|'adjust'|'mission'|'collect'|'deliver'|'hurt'|'zombie'|'service'|'rescue'|'discovery'|'weather'|'cargo'|'alert';
export const CUES:Record<Cue,[number,number,number]>={click:[520,.035,.13],hover:[760,.018,.035],menu:[390,.09,.16],back:[280,.07,.13],start:[660,.16,.16],camera:[880,.035,.1],reset:[330,.13,.14],success:[784,.12,.12],error:[180,.18,.16],adjust:[600,.025,.07],mission:[587,.14,.13],collect:[988,.12,.12],deliver:[1175,.22,.14],hurt:[146,.12,.17],zombie:[110,.08,.15],service:[740,.15,.12],rescue:[220,.25,.12],discovery:[1046,.12,.1],weather:[440,.1,.08],cargo:[350,.16,.12],alert:[125,.24,.12]};
export function drivingMix(s:CarState,input:Input,surface:Surface,running:boolean){
 const speed=Math.abs(s.speed),ratio=clamp(speed/CAR.maxSpeed,0,1),moving=clamp(speed/8,0,1);
 const braking=!!input.brake||(input.backward&&s.speed>0)||(input.forward&&s.speed<0);
 const gear=Math.min(3,Math.floor(ratio*4)),rpm=ratio*4-gear;
 const active=running?1:0;
 return {engineHz:42+gear*7+rpm*38+(input.forward?8:0),engineGain:active*(.035+ratio*.055+(input.forward?.025:0)),
  roadHz:surface==='water'?620:surface==='asphalt'?160:surface==='forest'?900:420,
  roadGain:active*moving*(surface==='water'?.14:surface==='asphalt'?.018:surface==='forest'?.075:.045),
  skidGain:active*(surface==='water'?0:moving*(braking?.1:clamp(Math.abs(s.steer)*2,0,.7)*.07)),
  reverse:running&&s.speed<-.5,water:surface==='water'};
}
/** A resting bumper cannot retrigger impacts every simulation tick. */
export class ImpactGate {private last=-Infinity;accept(strength:number,now:number){if(strength<1.8||now-this.last<.22)return false;this.last=now;return true;}}
