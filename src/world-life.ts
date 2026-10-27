import {MISSION} from './mission-design';
import {ZombieHorde} from './zombie-horde';
import {makeCargo,makeShelter,propAnchor} from './cargo-props';
import * as THREE from 'three';
import type {GameMap,CarState,Point} from './types';
import type {Expedition} from './expedition';
import type {Weather} from './context-data';
import {CollisionWorld} from './collision';
import {seeded,inMulti,distance} from './geometry';

/** Small fixed pools: actors and weather do not add meshes as the player travels. */
export class WorldLife {
 horde=new ZombieHorde();group=new THREE.Group();body:THREE.InstancedMesh;heads:THREE.InstancedMesh;legs:THREE.InstancedMesh;
 marker=new THREE.Group();shelter=new THREE.Group();rain:THREE.Points;weather:Weather|null=null;
 private world?:CollisionWorld;private propKey='';private depot:THREE.Group|null=null;private cargo={fuel:makeCargo('fuel'),supplies:makeCargo('supplies'),medical:makeCargo('medical')};private roofCargo={fuel:makeCargo('fuel'),supplies:makeCargo('supplies'),medical:makeCargo('medical')};private dummy=new THREE.Object3D();private drops=new Float32Array(240*3);private time=0;
 constructor(){
  this.body=this.horde.body;this.heads=this.horde.heads;this.legs=this.horde.legs;this.group.add(this.horde.group);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(13.5,.22,4,48),new THREE.MeshBasicMaterial({color:'#f6c66d',transparent:true,opacity:.95,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.25;ring.renderOrder=4;this.marker.add(ring);
  const zone=new THREE.Mesh(new THREE.CircleGeometry(13.5,64),new THREE.MeshBasicMaterial({color:'#f6c66d',transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide}));zone.rotation.x=-Math.PI/2;zone.position.y=.10;zone.renderOrder=3;this.marker.add(zone);
  const safe=new THREE.Mesh(new THREE.TorusGeometry(9,.1,4,48),new THREE.MeshBasicMaterial({color:'#9adeb5',transparent:true,opacity:.9,depthWrite:false}));safe.rotation.x=-Math.PI/2;safe.position.y=.2;this.shelter.add(safe);
  this.group.add(this.marker,this.shelter,...Object.values(this.cargo),...Object.values(this.roofCargo));for(const g of Object.values(this.cargo))g.scale.setScalar(1.7);if(typeof document!=='undefined'){this.depot=makeShelter();this.group.add(this.depot);}
  const rand=seeded(419);for(let i=0;i<this.drops.length;i+=3){this.drops[i]=(rand()-.5)*65;this.drops[i+1]=rand()*35;this.drops[i+2]=(rand()-.5)*65;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.drops,3));this.rain=new THREE.Points(g,new THREE.PointsMaterial({color:'#d8e6e3',size:.09,transparent:true,opacity:.5,depthWrite:false}));this.rain.frustumCulled=false;this.group.add(this.rain);
 }
 configure(world:CollisionWorld){this.world=world;this.propKey='';this.horde.clear();}
 update(car:CarState,exp:Expedition|null,target:Point|null,dt:number,reduced:boolean,discovery=false,focus=car){
  this.time+=dt;const mission=exp?.data.mission;for(const [kind,g] of Object.entries(this.cargo)){g.visible=!!mission&&mission.kind===kind&&exp!.data.phase==='outbound'&&distance(mission.point,[focus.x,focus.z])<230;if(mission)g.position.set(mission.point[0],.13+(reduced?0:Math.sin(this.time*2)*.06),mission.point[1]);}for(const [kind,g] of Object.entries(this.roofCargo)){g.visible=!!mission&&mission.kind===kind&&exp!.data.phase==='return';g.rotation.y=-car.heading;g.position.set(car.x,1.88,car.z);}
  if(this.depot){this.depot.visible=!!exp&&distance(exp.data.shelter,[focus.x,focus.z])<260;if(exp&&this.world&&this.propKey!==exp.data.shelter.join(',')){this.propKey=exp.data.shelter.join(',');const p=propAnchor(this.world,exp.data.shelter);this.depot.userData.available=!!p;if(p)this.depot.position.set(p[0],0,p[1]);}this.depot.visible&&=this.depot.userData.available===true;}
 this.horde.update(exp?.zombies??[],car,dt,reduced);
  this.marker.visible=!!target&&distance(target,[focus.x,focus.z])<280; if(target){this.marker.position.set(target[0],0,target[1]);for(const child of this.marker.children)((child as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(discovery?'#89d0db':exp?.data.phase==='outbound'&&mission?MISSION[mission.kind].color:'#9adeb5');}
  this.shelter.visible=!!exp&&distance(exp.data.shelter,[focus.x,focus.z])<280;if(exp)this.shelter.position.set(exp.data.shelter[0],0,exp.data.shelter[1]);
  this.rain.visible=!!this.weather&&this.weather.rain>.02&&!reduced; if(this.rain.visible){this.rain.position.set(focus.x,0,focus.z);for(let i=0;i<this.drops.length;i+=3){this.drops[i+1]-=dt*19;if(this.drops[i+1]<0)this.drops[i+1]+=35;}this.rain.geometry.getAttribute('position').needsUpdate=true;(this.rain.material as THREE.PointsMaterial).opacity=.2+this.weather!.rain*.4;}
 }
}
/** Geometry is merged by material and spatial sector by the scene loader. */
export function cityDetails(map:GameMap,world:CollisionWorld){
 const sectors=new Map<string,{color:string;gs:THREE.BufferGeometry[];sector:number[];vegetation:boolean}>();
 const add=(g:THREE.BufferGeometry,color:string,x:number,z:number)=>{const sx=Math.floor(x/128),sz=Math.floor(z/128),key=`${sx}/${sz}/${color}`,row=sectors.get(key)??{color,gs:[],sector:[sx,sz],vegetation:['#435c43','#7b9460','#8a775c'].includes(color)};row.gs.push(g);sectors.set(key,row);};
 let count=0;
 for(const area of map.areas){if(area.kind!=='building'||count++>220)continue;for(const polygon of area.polygons){const ring=polygon[0];for(let j=1;j<ring.length;j++){const a=ring[j-1],b=ring[j],len=distance(a,b);if(len<4||len>80)continue;const dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len,angle=Math.atan2(-dz,dx);for(let t=2;t<len-1;t+=4){const x=a[0]+dx*t,z=a[1]+dz*t;for(let y=2;y<Math.min(area.height-1,10);y+=3){const g=new THREE.BoxGeometry(1.1,1.25,.14);g.rotateY(angle);g.translate(x,y,z);add(g,'#587879',x,z);}}}
  // Roof equipment makes silhouettes readable without multiplying facade materials.
  const p=ring[0],q=ring[Math.floor(ring.length/2)],x=(p[0]+q[0])/2,z=(p[1]+q[1])/2;if(inMulti([x,z],[polygon])){const g=new THREE.BoxGeometry(1.4,.5,1.4);g.translate(x,area.height+.25,z);add(g,'#b5b9a8',x,z);}
 }}
 const rnd=seeded(map.seed+19),b=map.bounds;let trees=0;const planted:Point[]=[];
 for(let n=0;n<600&&trees<65;n++){const x=b.minX+rnd()*(b.maxX-b.minX),z=b.minZ+rnd()*(b.maxZ-b.minZ),surface=world.surfaceAt([x,z]);if(!['forest','grass'].includes(surface)||world.hit(x,z,0)||world.index.nearest([x,z]).distance<9||planted.some(p=>distance(p,[x,z])<7))continue;trees++;planted.push([x,z]);
  const trunk=new THREE.CylinderGeometry(.16,.23,2.4,5);trunk.translate(x,1.2,z);add(trunk,'#8a775c',x,z);const crown=new THREE.IcosahedronGeometry(1.7+rnd(),0);crown.scale(1,1.3,1);crown.translate(x,3.2,z);add(crown,surface==='forest'?'#435c43':'#7b9460',x,z);
 }
 return [...sectors.values()];
}
