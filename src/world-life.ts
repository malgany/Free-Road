import * as THREE from 'three';
import type {GameMap,CarState,Point} from './types';
import type {Expedition} from './expedition';
import type {Weather} from './context-data';
import {CollisionWorld} from './collision';
import {seeded,inMulti,distance} from './geometry';

/** Small fixed pools: actors and weather do not add meshes as the player travels. */
export class WorldLife {
 group=new THREE.Group();body:THREE.InstancedMesh;heads:THREE.InstancedMesh;legs:THREE.InstancedMesh;
 marker=new THREE.Group();shelter=new THREE.Group();rain:THREE.Points;weather:Weather|null=null;
 private dummy=new THREE.Object3D();private drops=new Float32Array(240*3);private time=0;
 constructor(){
  const mesh=(g:THREE.BufferGeometry,c:string,n:number)=>{const m=new THREE.InstancedMesh(g,new THREE.MeshLambertMaterial({color:c}),n);m.count=0;m.frustumCulled=false;this.group.add(m);return m;};
  this.body=mesh(new THREE.BoxGeometry(.55,.68,.3),'#60746b',32);this.heads=mesh(new THREE.BoxGeometry(.32,.35,.3),'#a8ad83',32);this.legs=mesh(new THREE.BoxGeometry(.19,.64,.2),'#3c4f50',64);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(5,.075,4,48),new THREE.MeshBasicMaterial({color:'#f6c66d',depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.18;this.marker.add(ring);
  const diamond=new THREE.Mesh(new THREE.OctahedronGeometry(.65,0),new THREE.MeshBasicMaterial({color:'#f6c66d'}));diamond.position.y=7;this.marker.add(diamond);
  const safe=new THREE.Mesh(new THREE.TorusGeometry(9,.1,4,48),new THREE.MeshBasicMaterial({color:'#9adeb5',depthWrite:false}));safe.rotation.x=-Math.PI/2;safe.position.y=.2;this.shelter.add(safe);
  this.group.add(this.marker,this.shelter);
  const rand=seeded(419);for(let i=0;i<this.drops.length;i+=3){this.drops[i]=(rand()-.5)*65;this.drops[i+1]=rand()*35;this.drops[i+2]=(rand()-.5)*65;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.drops,3));this.rain=new THREE.Points(g,new THREE.PointsMaterial({color:'#d8e6e3',size:.09,transparent:true,opacity:.5,depthWrite:false}));this.rain.frustumCulled=false;this.group.add(this.rain);
 }
 update(car:CarState,exp:Expedition|null,target:Point|null,dt:number,reduced:boolean){
  this.time+=dt;const zombies=exp?.zombies.filter(z=>!z.dead).slice(0,32)??[];this.body.count=this.heads.count=zombies.length;this.legs.count=zombies.length*2;
  for(let i=0;i<zombies.length;i++){const z=zombies[i],bob=Math.sin(this.time*5+i)*.04;this.dummy.rotation.set(0,z.heading,0);this.dummy.scale.setScalar(1);
   this.dummy.position.set(z.x,1.02+bob,z.z);this.dummy.updateMatrix();this.body.setMatrixAt(i,this.dummy.matrix);
   this.dummy.position.y=1.55+bob;this.dummy.updateMatrix();this.heads.setMatrixAt(i,this.dummy.matrix);
   for(let j=0;j<2;j++){this.dummy.position.set(z.x+Math.cos(z.heading)*(j?-.17:.17),.35,z.z-Math.sin(z.heading)*(j?-.17:.17));this.dummy.rotation.x=Math.sin(this.time*5+i+j*Math.PI)*.15;this.dummy.updateMatrix();this.legs.setMatrixAt(i*2+j,this.dummy.matrix);this.dummy.rotation.x=0;}
  }
  this.body.instanceMatrix.needsUpdate=this.heads.instanceMatrix.needsUpdate=this.legs.instanceMatrix.needsUpdate=true;
  this.marker.visible=!!target&&distance(target,[car.x,car.z])<280; if(target){this.marker.position.set(target[0],0,target[1]);this.marker.children[1].position.y=6.5+Math.sin(this.time*2)*.3;this.marker.children[1].rotation.y=this.time*.5;}
  this.shelter.visible=!!exp&&distance(exp.data.shelter,[car.x,car.z])<280;if(exp)this.shelter.position.set(exp.data.shelter[0],0,exp.data.shelter[1]);
  this.rain.visible=!!this.weather&&this.weather.rain>.02&&!reduced; if(this.rain.visible){this.rain.position.set(car.x,0,car.z);for(let i=0;i<this.drops.length;i+=3){this.drops[i+1]-=dt*19;if(this.drops[i+1]<0)this.drops[i+1]+=35;}this.rain.geometry.getAttribute('position').needsUpdate=true;(this.rain.material as THREE.PointsMaterial).opacity=.2+this.weather!.rain*.4;}
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
