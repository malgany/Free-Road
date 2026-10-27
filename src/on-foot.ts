export interface FootInventory {weapon:'pistol'|'rifle';ammo:number;reserve:number;health:number;collected:string[]}
import {closest,distance,inPolygon,clamp} from './geometry';
import type {CollisionWorld} from './collision';
import type {CarState,Input,Point} from './types';
export function footBlocked(world:CollisionWorld,x:number,z:number,r=.3){const b=world.map.bounds;if(x-r<b.minX||x+r>b.maxX||z-r<b.minZ||z+r>b.maxZ)return true;for(const o of world.nearby(x,z)){if(inPolygon([x,z],o.polygon))return true;for(const ring of o.polygon)for(let i=1;i<ring.length;i++)if(distance([x,z],closest([x,z],ring[i-1],ring[i]))<r)return true;}return false;}
export function carBlocked(car:CarState,x:number,z:number){const dx=x-car.x,dz=z-car.z,c=Math.cos(car.heading),s=Math.sin(car.heading);return Math.abs(dx*c+dz*s)<1.15&&Math.abs(-dx*s+dz*c)<2.15;}
export class FootPlayer {
 active=false;x=0;z=0;y=0;vy=0;heading=0;pitch=0;speed=0;health=100;crouched=false;eye=1.65;weapon:'pistol'|'rifle'='pistol';ammo=12;reserve=48;cooldown=0;reloadTime=0;private jumpHeld=false;
 get capacity(){return this.weapon==='pistol'?12:30;}
 exit(car:CarState,world:CollisionWorld){if(Math.abs(car.speed)>1)return false;for(const side of [-1,1])for(const offset of [0,1.8,-1.8]){const x=car.x+Math.cos(car.heading)*2.1*side+Math.sin(car.heading)*offset,z=car.z+Math.sin(car.heading)*2.1*side-Math.cos(car.heading)*offset;if(!footBlocked(world,x,z)&&!carBlocked(car,x,z)){Object.assign(this,{active:true,x,z,y:0,vy:0,heading:car.heading,pitch:0,speed:0,crouched:false,eye:1.65});return true;}}return false;}
 nearCar(car:CarState,world:CollisionWorld){if(distance([this.x,this.z],[car.x,car.z])>3.8)return false;for(let t=.1;t<1;t+=.1)if(footBlocked(world,this.x+(car.x-this.x)*t,this.z+(car.z-this.z)*t,.05))return false;return true;}
 enter(){this.active=false;this.speed=0;this.reloadTime=0;}
 look(dx:number,dy:number){this.heading+=dx*.0023;this.pitch=clamp(this.pitch-dy*.0023,-1.35,1.35);}
 proxy(car:CarState):CarState{return {...car,x:this.x,z:this.z,heading:this.heading,speed:this.speed,vx:0,vz:0,impact:undefined};}
 step(input:Input,crouch:boolean,dt:number,world:CollisionWorld,car:CarState){this.cooldown=Math.max(0,this.cooldown-dt);if(this.reloadTime>0){this.reloadTime=Math.max(0,this.reloadTime-dt);if(this.reloadTime===0){const n=Math.min(this.capacity-this.ammo,this.reserve);this.ammo+=n;this.reserve-=n;}}if(!this.active)return {jump:false,land:false};this.crouched=crouch;this.eye+=( (crouch?1.02:1.65)-this.eye)*Math.min(1,dt*14);let jump=false;const oldY=this.y;if(input.brake&&!this.jumpHeld&&this.y===0&&!crouch){this.vy=4.6;jump=true;}this.jumpHeld=!!input.brake;this.vy-=14*dt;this.y=Math.max(0,this.y+this.vy*dt);if(this.y===0)this.vy=0;
 const f=Number(input.forward)-Number(input.backward),r=Number(input.right)-Number(input.left),len=Math.hypot(f,r)||1;const pace=(crouch?1.9:4.3)*(world.surfaceAt([this.x,this.z])==='water'?.35:1),dx=(Math.sin(this.heading)*f+Math.cos(this.heading)*r)/len*pace*dt,dz=(-Math.cos(this.heading)*f+Math.sin(this.heading)*r)/len*pace*dt,ox=this.x,oz=this.z;const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.15));for(let i=0;i<steps;i++){const nx=this.x+dx/steps;if(!footBlocked(world,nx,this.z)&&!carBlocked(car,nx,this.z))this.x=nx;const nz=this.z+dz/steps;if(!footBlocked(world,this.x,nz)&&!carBlocked(car,this.x,nz))this.z=nz;}this.speed=Math.hypot(this.x-ox,this.z-oz)/Math.max(dt,.001);return {jump,land:oldY>0&&this.y===0};
 }
 reload(){if(this.reloadTime||this.ammo===this.capacity||!this.reserve)return false;this.reloadTime=this.weapon==='pistol'?1.15:1.65;return true;}
 fire(){if(!this.active||this.cooldown>0||this.reloadTime>0||this.ammo<=0)return false;this.ammo--;this.cooldown=this.weapon==='pistol'?.24:.115;return true;}
 pickup(){if(this.weapon==='pistol'){this.weapon='rifle';this.ammo=30;this.reserve=60;}else this.reserve=Math.min(180,this.reserve+30);}
}
