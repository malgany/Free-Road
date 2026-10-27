import type {CarState,Input,GameMap} from './types';
import {CAR,FIXED_STEP} from './config';
import {clamp,wrapAngle} from './geometry';
import {CollisionWorld} from './collision';
export const initialState=(spawn:GameMap['spawn']):CarState=>({...spawn,vx:0,vz:0,speed:0,steer:0,distance:0,contact:null});
export const surfaceSpeedFactor={asphalt:1,neutral:0.5,dirt:0.5,grass:0.4,forest:0.3,water:0.1};
export function stepCar(s:CarState,input:Input,dt:number,world?:CollisionWorld,sensitivity=1){
  const fx=Math.sin(s.heading),fz=-Math.cos(s.heading),rx=Math.cos(s.heading),rz=Math.sin(s.heading);
  let forward=s.vx*fx+s.vz*fz,lateral=s.vx*rx+s.vz*rz;
  const limit=CAR.maxSpeed*surfaceSpeedFactor[world?.surfaceAt([s.x,s.z])??'asphalt'];
  const opposing=input.forward&&input.backward;
  const approach=(v:number,target:number,amount:number)=>v<target?Math.min(target,v+amount):Math.max(target,v-amount);
  if(opposing||input.brake)forward=approach(forward,0,CAR.braking*dt);
  else if(input.forward)forward=forward<0?approach(forward,0,CAR.braking*dt):(forward>limit?forward:Math.min(limit,forward+CAR.acceleration*dt));
  else if(input.backward)forward=forward>0?approach(forward,0,CAR.braking*dt):(forward < -Math.min(CAR.maxReverse,limit)?forward:Math.max(-Math.min(CAR.maxReverse,limit),forward-CAR.reverseAcceleration*dt));
  else forward=approach(forward,0,(CAR.rollingResistance+Math.abs(forward)*CAR.drag)*dt);
  if(forward>limit)forward=approach(forward,limit,CAR.braking*0.55*dt);
  if(forward < -limit)forward=approach(forward,-limit,CAR.braking*0.55*dt);
  const turn=Number(input.right)-Number(input.left),target=turn*CAR.maxSteer*clamp(sensitivity,0.4,1.8)/(1+Math.abs(forward)*0.045);
  s.steer+=(target-s.steer)*(1-Math.exp(-12*dt));
  const yaw=Math.abs(forward)>0.025?forward/CAR.wheelbase*Math.tan(s.steer)*dt:0;
  lateral*=Math.exp(-CAR.grip*dt);
  // Retain small lateral inertia; heading and world velocity are separate.
  const heading=s.heading+yaw,fx2=Math.sin(heading),fz2=-Math.cos(heading);
  s.vx=fx2*forward+rx*lateral;s.vz=fz2*forward+rz*lateral;
  const x=s.x,z=s.z;
  if(world)world.move(s,s.vx*dt,s.vz*dt,heading);else{s.x+=s.vx*dt;s.z+=s.vz*dt;s.heading=heading;}
  s.heading=wrapAngle(s.heading);s.speed=s.vx*Math.sin(s.heading)-s.vz*Math.cos(s.heading);s.distance+=Math.hypot(s.x-x,s.z-z);
}
export class FixedLoop {
  accumulator=0;droppedTime=0;
  advance(dt:number,step:()=>void){const safe=clamp(dt,0,0.1);this.droppedTime+=Math.max(0,dt-safe);this.accumulator+=safe;let count=0;while(this.accumulator+1e-9>=FIXED_STEP&&count<6){step();this.accumulator-=FIXED_STEP;count++;}return clamp(this.accumulator/FIXED_STEP,0,1);}
  reset(){this.accumulator=0;}
}
