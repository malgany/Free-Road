import type {CarState,GameMap,Point} from './types';
import {CollisionWorld} from './collision';
import {distance,closest} from './geometry';
import {roadSamples,accessPoint} from './pois';
import {RoutePlanner,routeLength} from './routes';
import {daylightAt} from './daylight';
export type MissionKind='fuel'|'supplies'|'medical';
export interface Destination {id:string;name:string;kind:MissionKind;point:Point;real:boolean;route:Point[]}
export interface ExpeditionData {version:1;origin:GameMap['origin'];mapKey:string;shelter:Point;fuel:number;health:number;scrap:number;upgrade:number;completed:number;mission:Destination|null;phase:'choose'|'outbound'|'return';targets:Destination[];defeated:string[];car:{x:number;z:number;heading:number};dayTime:number}
export interface Zombie {id:string;x:number;z:number;heading:number;dead:boolean;attack:number}
export type GameEvent={kind:'collect'|'deliver'|'hurt'|'zombie'|'service'|'rescue';text:string;x?:number;z?:number;strength?:number};
export class Expedition {
 data:ExpeditionData;zombies:Zombie[]=[];private spawnTick=3;private noise=0;private lastDistance=0;private brain=0;private previousCar:Point|null=null;private spawnPoints:Point[]=[];private map!:GameMap;private world!:CollisionWorld;planner!:RoutePlanner;
 constructor(map:GameMap,world:CollisionWorld,mapKey:string,saved?:ExpeditionData){
  this.data=saved?structuredClone(saved):{version:1,origin:map.origin,mapKey,shelter:[map.spawn.x,map.spawn.z],fuel:100,health:100,scrap:0,upgrade:0,completed:0,mission:null,phase:'choose',targets:[],defeated:[],car:{...map.spawn},dayTime:0};this.attach(map,world);
  if(!saved)this.data.targets=this.destinations(map,world);
 }
 attach(map:GameMap,world:CollisionWorld){this.map=map;this.world=world;this.planner=new RoutePlanner(map);this.zombies=[];this.spawnTick=3;this.lastDistance=-1;this.previousCar=null;this.spawnPoints=roadSamples(map,world,30);}
 private destinations(map:GameMap,world:CollisionWorld){const targets:Destination[]=[],samples=roadSamples(map,world);for(const kind of ['fuel','supplies','medical'] as const){
  const pois=(map.pois??[]).filter(p=>p.kind===kind).sort((a,b)=>distance(a.point,this.data.shelter)-distance(b.point,this.data.shelter));
  const fallback=samples.map((p,i)=>({id:`outpost/${kind}/${i}`,name:kind==='fuel'?'Reserva de combustível':kind==='supplies'?'Depósito de mantimentos':'Posto de cuidados',kind,point:p,synthetic:true}));
  fallback.sort((a,b)=>Math.abs(distance(a.point,this.data.shelter)-170)-Math.abs(distance(b.point,this.data.shelter)-170));
  for(const p of [...pois,...fallback]){const point=accessPoint(p.point,map,world);if(!point||distance(point,this.data.shelter)<35||targets.some(t=>distance(t.point,point)<25))continue;const route=this.planner.route(this.data.shelter,point);if(!route||routeLength(route)>850)continue;targets.push({id:p.id,name:p.name,kind,point,real:!p.synthetic,route});break;}
 }return targets;}
 get target():Point{return this.data.phase==='outbound'&&this.data.mission?this.data.mission.point:this.data.shelter;}
 get maxHealth(){return 100+this.data.upgrade*15;}
 get immobilized(){return this.data.health<=0||this.data.fuel<=0;}
 atShelter(s:Pick<CarState,'x'|'z'|'speed'>){return distance([s.x,s.z],this.data.shelter)<16&&Math.abs(s.speed)<1;}
 choose(id:string){if(this.data.phase!=='choose')return false;const target=this.data.targets.find(t=>t.id===id);if(!target)return false;this.data.mission=structuredClone(target);this.data.phase='outbound';return true;}
 interact(s:CarState):GameEvent|null {if(Math.abs(s.speed)>1||distance([s.x,s.z],this.target)>14)return null;
  if(this.data.phase==='outbound'){this.data.phase='return';return {kind:'collect',text:'Carga recolhida. Leve-a de volta ao abrigo.'};}
  if(this.data.phase==='return'&&this.data.mission){const kind=this.data.mission.kind,bonus=daylightAt(this.data.dayTime).daylight>.3?8:0;this.data.scrap+=20+bonus;this.data.completed++;
   if(kind==='fuel')this.data.fuel=Math.min(100,this.data.fuel+45);if(kind==='medical')this.data.health=Math.min(this.maxHealth,this.data.health+35);if(kind==='supplies')this.data.scrap+=12;
   this.data.phase='choose';this.data.mission=null;return {kind:'deliver',text:`Entrega concluída · +${20+bonus+(kind==='supplies'?12:0)} peças${bonus?' · bônus diurno':''}`};}
  return null;
 }
 service(kind:'fuel'|'repair'|'upgrade',s:CarState):GameEvent|null {if(!this.atShelter(s))return null;const cost=kind==='upgrade'?40+this.data.upgrade*20:kind==='repair'?12:10;if(this.data.scrap<cost||(kind==='upgrade'&&this.data.upgrade>=3)||(kind==='fuel'&&this.data.fuel>=100)||(kind==='repair'&&this.data.health>=this.maxHealth))return null;
  this.data.scrap-=cost;if(kind==='fuel')this.data.fuel=Math.min(100,this.data.fuel+50);if(kind==='repair')this.data.health=this.maxHealth;if(kind==='upgrade'){this.data.upgrade++;this.data.health=this.maxHealth;}
  return {kind:'service',text:kind==='fuel'?'Tanque reabastecido.':kind==='repair'?'Carro reparado.':'Proteção reforçada · mais resistência e autonomia.'};
 }
 rescue(){this.data.fuel=Math.max(30,this.data.fuel);this.data.health=Math.max(50,this.data.health);this.data.scrap=Math.floor(this.data.scrap*.8);this.data.phase='choose';this.data.mission=null;this.zombies=[];return {kind:'rescue' as const,text:'Resgate concluído. A carga e 20% das peças ficaram pelo caminho.'};}
 impact(strength:number){if(strength<1.8)return;this.data.health=Math.max(0,this.data.health-strength*.45/(1+this.data.upgrade*.25));this.noise=4;}
 step(s:CarState,dt:number,dayTime:number):GameEvent[]{const events:GameEvent[]=[];this.data.dayTime=dayTime;this.data.car={x:s.x,z:s.z,heading:s.heading};const traveled=this.lastDistance<0?0:Math.max(0,s.distance-this.lastDistance);this.lastDistance=s.distance;
  this.data.fuel=Math.max(0,this.data.fuel-traveled*.023/(1+this.data.upgrade*.12)-dt*.0005);this.noise=Math.max(0,this.noise-dt);this.spawnTick+=dt;
  if(this.spawnTick>2){this.spawnTick=0;this.populate(s,dayTime);}
  const car:Point=[s.x,s.z],old=this.previousCar??car;this.previousCar=car;
  for(const z of this.zombies){if(z.dead)continue;const d=distance([z.x,z.z],closest([z.x,z.z],old,car));if(d<2.3&&Math.abs(s.speed)>3){z.dead=true;this.data.defeated.push(z.id);this.data.defeated=this.data.defeated.slice(-384);this.data.health=Math.max(0,this.data.health-2/(1+this.data.upgrade*.3));s.vx*=.86;s.vz*=.86;this.noise=3;events.push({kind:'zombie',text:'Impacto · o barulho atrai infectados',x:z.x,z:z.z,strength:Math.abs(s.speed)});}}
  this.brain+=dt;if(this.brain<.1)return events;const tick=this.brain;this.brain=0;const night=1-daylightAt(dayTime).daylight;
  const noiseRadius=25+Math.min(75,Math.abs(s.speed)*2)+(this.noise>0?65:0)+night*25;
  for(const z of this.zombies){if(z.dead)continue;z.attack-=tick;const d=distance([z.x,z.z],[s.x,s.z]);if(d>190)continue;
   
   if(distance([s.x,s.z],this.data.shelter)<36)continue;
   if(d<2.8&&z.attack<=0){z.attack=1.4;this.data.health=Math.max(0,this.data.health-1.5);events.push({kind:'hurt',text:'Infectados alcançaram o carro. Afaste-se!'});}
   if(d<noiseRadius){const angle=Math.atan2(s.x-z.x,s.z-z.z),step=(.8+night*.9)*tick;for(const offset of [0,.75,-.75,1.4,-1.4]){const nx=z.x+Math.sin(angle+offset)*step,nz=z.z+Math.cos(angle+offset)*step;if(distance([nx,nz],this.data.shelter)<32||this.world.surfaceAt([nx,nz])==='water'||this.world.hit(nx,nz,0))continue;z.x=nx;z.z=nz;z.heading=angle+offset;break;}}
  }return events;
 }
 private populate(s:CarState,time:number){const limit=daylightAt(time).daylight<.4?28:18;this.zombies=this.zombies.filter(z=>!z.dead&&distance([z.x,z.z],[s.x,s.z])<200);if(this.zombies.length>=limit)return;
  const samples=this.spawnPoints;const ids=new Set(this.zombies.map(z=>z.id));
  for(const p of samples){const d=distance(p,[s.x,s.z]);if(d<45||d>160||distance(p,this.data.shelter)<45)continue;const id=`${this.map.origin.lat.toFixed(4)}/${this.map.origin.lon.toFixed(4)}/${Math.round(p[0]/15)}/${Math.round(p[1]/15)}`;if(ids.has(id)||this.data.defeated.includes(id))continue;ids.add(id);this.zombies.push({id,x:p[0],z:p[1],heading:0,dead:false,attack:1});if(this.zombies.length>=limit)break;}
 }
}
export function validExpedition(value:unknown):value is ExpeditionData {
 const v=value as ExpeditionData;const point=(p:unknown):p is Point=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<1e7);
 const target=(t:Destination)=>t&&typeof t.name==='string'&&t.name.length<250&&typeof t.id==='string'&&t.id.length<200&&['fuel','supplies','medical'].includes(t.kind)&&typeof t.real==='boolean'&&point(t.point)&&Array.isArray(t.route)&&t.route.length>0&&t.route.length<2000&&t.route.every(point);
 return !!v&&v.version===1&&!!v.origin&&Number.isFinite(v.origin.lat)&&Math.abs(v.origin.lat)<=85&&Number.isFinite(v.origin.lon)&&Math.abs(v.origin.lon)<=180&&['davis','test','current'].includes(v.mapKey)&&point(v.shelter)&&['fuel','health','scrap','upgrade','completed','dayTime'].every(k=>Number.isFinite((v as any)[k])&&(v as any)[k]>=0)&&v.fuel<=100&&Number.isInteger(v.upgrade)&&v.upgrade<=3&&v.health<=100+15*v.upgrade&&!!v.car&&point([v.car.x,v.car.z])&&Number.isFinite(v.car.heading)&&['choose','outbound','return'].includes(v.phase)&&Array.isArray(v.targets)&&v.targets.length<=3&&v.targets.every(target)&&Array.isArray(v.defeated)&&v.defeated.length<=384&&v.defeated.every(id=>typeof id==='string'&&id.length<200)&&(v.phase==='choose'?v.mission===null:!!v.mission&&target(v.mission)&&v.targets.some(t=>t.id===v.mission!.id&&distance(t.point,v.mission!.point)<.01));
}
export class SaveSlot {private opening?:Promise<IDBDatabase|null>;private open(){return this.opening??=new Promise(resolve=>{try{const r=indexedDB.open('free-road-expedition',1);r.onupgradeneeded=()=>r.result.createObjectStore('save');r.onsuccess=()=>resolve(r.result);r.onerror=r.onblocked=()=>resolve(null);}catch{resolve(null);}});}
 async read(){const db=await this.open();if(!db)return null;return new Promise<ExpeditionData|null>(resolve=>{const r=db.transaction('save').objectStore('save').get('active');r.onsuccess=()=>resolve(validExpedition(r.result)?r.result:null);r.onerror=()=>resolve(null);});}
 async write(data:ExpeditionData){if(!validExpedition(data)||new TextEncoder().encode(JSON.stringify(data)).byteLength>65536)return false;const db=await this.open();if(!db)return false;return new Promise<boolean>(resolve=>{const tx=db.transaction('save','readwrite');tx.objectStore('save').put(structuredClone(data),'active');tx.oncomplete=()=>resolve(true);tx.onerror=tx.onabort=()=>resolve(false);});}
}
