import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Zombie} from './expedition';
import type {CarState} from './types';
import {clamp,lerpAngle} from './geometry';
const tint=(g:THREE.BufferGeometry,color:string)=>{const c=new THREE.Color(color),a=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<a.length;i+=3)a.set([c.r,c.g,c.b],i);g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;};
const box=(w:number,h:number,d:number,x:number,y:number,z:number,color:string)=>tint(new THREE.BoxGeometry(w,h,d).translate(x,y,z),color);
function merge(gs:THREE.BufferGeometry[]){const list=gs.map(g=>g.index?g.toNonIndexed():g),merged=mergeGeometries(list)!;list.forEach(g=>g.dispose());gs.forEach(g=>g.dispose());return merged;}
export interface Fallen {x:number;z:number;heading:number;age:number;force:number;variant:number}
export class ZombieHorde {
 group=new THREE.Group();body:THREE.InstancedMesh;heads:THREE.InstancedMesh;legs:THREE.InstancedMesh;arms:THREE.InstancedMesh;hands:THREE.InstancedMesh;eyes:THREE.InstancedMesh;
 fallen:Fallen[]=[];private smooth=new Map<string,{x:number;z:number;h:number}>();private root=new THREE.Group();private torso=new THREE.Object3D();private head=new THREE.Object3D();private leg=[new THREE.Object3D(),new THREE.Object3D()];private upper=[new THREE.Object3D(),new THREE.Object3D()];private fore=[new THREE.Object3D(),new THREE.Object3D()];private hand=[new THREE.Object3D(),new THREE.Object3D()];private eye=[new THREE.Object3D(),new THREE.Object3D()];
 constructor(){const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,metalness:0});const mesh=(g:THREE.BufferGeometry,n:number,m:THREE.Material=material)=>{const out=new THREE.InstancedMesh(g,m,n);out.count=0;out.frustumCulled=false;out.castShadow=true;out.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(out);return out;};
  const torso=tint(new THREE.CylinderGeometry(.24,.2,.57,7).scale(1.17,1,.72),'#798581');this.body=mesh(merge([torso,box(.045,.5,.03,0,0,.18,'#273637'),box(.17,.16,.04,-.13,.07,.17,'#b3b299'),box(.12,.12,.04,.14,-.13,.17,'#525c52'),box(.44,.04,.3,0,-.31,0,'#293338')]),44);
  const skull=tint(new THREE.SphereGeometry(.18,10,7).scale(.95,1.15,.9),'#8d9d79');this.heads=mesh(merge([skull,box(.18,.1,.16,0,-.15,.045,'#929c7e'),box(.05,.065,.07,0,-.01,.17,'#a7ab87'),box(.12,.04,.025,0,-.105,.157,'#35463a'),box(.095,.018,.026,0,-.096,.17,'#c6c0a2'),tint(new THREE.DodecahedronGeometry(.16,0).scale(1,.5,.9).translate(0,.16,-.04),'#35423d'),box(.055,.15,.12,-.15,.085,-.03,'#35423d'),box(.07,.035,.017,-.08,.023,.158,'#263b32'),box(.07,.035,.017,.08,.023,.158,'#263b32')]),44);
  this.legs=mesh(merge([tint(new THREE.CylinderGeometry(.095,.073,.62,7).translate(0,-.31,0),'#384b50'),box(.16,.1,.19,0,-.38,.01,'#55615b'),box(.2,.13,.32,0,-.65,.06,'#263539')]),88);
  this.arms=mesh(merge([tint(new THREE.CylinderGeometry(.085,.066,.34,7).translate(0,-.17,0),'#78847e'),box(.14,.08,.16,0,-.32,0,'#596858')]),176);this.hands=mesh(merge([box(.11,.15,.085,0,-.07,0,'#8f9e7a'),box(.02,.065,.085,-.043,-.16,.01,'#879370'),box(.02,.08,.085,0,-.17,.01,'#879370'),box(.02,.06,.085,.04,-.16,.01,'#879370')]),88);
  this.eyes=mesh(new THREE.SphereGeometry(.012,5,4),88,new THREE.MeshBasicMaterial({color:'#b2b881'}));this.eyes.castShadow=false;
  this.root.add(this.torso,this.head,...this.leg,...this.upper);for(let i=0;i<2;i++){this.upper[i].add(this.fore[i]);this.fore[i].position.y=-.34;this.fore[i].add(this.hand[i]);this.hand[i].position.y=-.34;this.head.add(this.eye[i]);this.eye[i].position.set(i?-.073:.073,.02,.166);}
 }
 hit(x:number,z:number,speed:number,heading:number,variant=0){this.fallen.push({x,z,heading,variant,force:clamp(speed*.16,.8,5),age:0});if(this.fallen.length>12)this.fallen.shift();}
 clear(){this.fallen=[];this.smooth.clear();}
 update(zombies:Zombie[],car:CarState,dt:number,reduced:boolean){
  for(const f of this.fallen)f.age+=dt;this.fallen=this.fallen.filter(f=>f.age<7);const living=zombies.filter(z=>!z.dead).slice(0,32),visible=[...living.map(z=>({z,f:null as Fallen|null})),...this.fallen.map(f=>({z:null as Zombie|null,f}))];const activeIds=new Set(living.map(z=>z.id));for(const key of this.smooth.keys())if(!activeIds.has(key))this.smooth.delete(key);
  this.body.count=this.heads.count=visible.length;this.legs.count=this.hands.count=this.eyes.count=visible.length*2;this.arms.count=visible.length*4;
  for(let i=0;i<visible.length;i++){const {z,f}=visible[i],variant=z?.variant??f?.variant??i%3,scale=variant===1?1.08:variant===2?.94:1;let x=z?.x??f!.x,zz=z?.z??f!.z,h=z?.heading??f!.heading,aw=z?.awareness??0,gait=z?.gait??0,moving=z?.moving??0;
   if(z){const p=this.smooth.get(z.id)??{x,z:zz,h};const blend=1-Math.exp(-14*dt);p.x+=(x-p.x)*blend;p.z+=(zz-p.z)*blend;p.h=lerpAngle(p.h,h,blend);this.smooth.set(z.id,p);x=p.x;zz=p.z;h=p.h;}
   this.root.position.set(x,0,zz);this.root.rotation.set(.07+aw*.08,h,Math.sin(gait*.5)*.025*moving);this.root.scale.setScalar(scale);if(f){const fall=clamp(f.age/.48,0,1),travel=(1-Math.exp(-f.age*3))*f.force;this.root.position.set(f.x+Math.sin(f.heading)*travel,.24+Math.sin(fall*Math.PI)*.45,f.z+Math.cos(f.heading)*travel);this.root.rotation.set(fall*Math.PI/2,f.heading,Math.sin(fall*Math.PI)*.35);this.root.scale.setScalar(scale*Math.min(1,(7-f.age)/.6));}
   this.torso.position.set(0,1.11+Math.sin(gait*2)*.02*moving,0);this.torso.rotation.x=-.1-aw*.09;this.head.position.set(.025,1.63,.07+aw*.06);this.head.rotation.set(-.08+Math.sin(gait*.5)*.045,Math.sin(gait*.3+variant)*.08,-.12+variant*.08);
   const clothing=new THREE.Color(['#8daba0','#a4917a','#7e8caa'][variant%3]);this.body.setColorAt(i,clothing);
   for(let j=0;j<2;j++){const side=j?1:-1,walk=Math.sin(gait+(j?Math.PI:0))*moving;this.leg[j].position.set(side*.13,.75,0);this.leg[j].rotation.set(walk*(j?.35:.5),0,side*.04);this.upper[j].position.set(side*.29,1.36,.025);this.upper[j].rotation.set(-.3-aw*.8-walk*.2,0,-side*.12);this.fore[j].rotation.x=-.25-aw*.3;this.hand[j].rotation.x=-.16;}
   this.root.updateMatrixWorld(true);this.body.setMatrixAt(i,this.torso.matrixWorld);this.heads.setMatrixAt(i,this.head.matrixWorld);for(let j=0;j<2;j++){this.legs.setMatrixAt(i*2+j,this.leg[j].matrixWorld);this.arms.setMatrixAt(i*4+j*2,this.upper[j].matrixWorld);this.arms.setMatrixAt(i*4+j*2+1,this.fore[j].matrixWorld);this.hands.setMatrixAt(i*2+j,this.hand[j].matrixWorld);this.eyes.setMatrixAt(i*2+j,this.eye[j].matrixWorld);}
  }
  for(const m of [this.body,this.heads,this.legs,this.arms,this.hands,this.eyes]){m.instanceMatrix.needsUpdate=true;m.castShadow=!reduced&&m!==this.eyes;}if(this.body.instanceColor)this.body.instanceColor.needsUpdate=true;
 }
}
