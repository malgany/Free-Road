import * as THREE from 'three';
import {clamp} from './geometry';
/** Fixed-size pool; no scene allocations or persistent debris on impact. */
export class ImpactParticles {
 readonly count=64;mesh:THREE.InstancedMesh;
 ages=new Float32Array(this.count).fill(2);positions=Array.from({length:this.count},()=>new THREE.Vector3());velocities=Array.from({length:this.count},()=>new THREE.Vector3());
 private cursor=0;private pose=new THREE.Object3D();
 constructor(){this.mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.07,0),new THREE.MeshBasicMaterial({color:'#ffffff'}),this.count);this.mesh.frustumCulled=false;this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.clear();}
 burst(x:number,z:number,nx:number,nz:number,strength:number,reduced=false,color='#ffd88b'){
  if(strength<1.8)return;const number=reduced?4:Math.min(16,4+Math.floor(strength));
  for(let j=0;j<number;j++){const i=this.cursor++%this.count;this.mesh.setColorAt(i,new THREE.Color(color));this.ages[i]=0;this.positions[i].set(x,.7,z);const side=(j/(number-1)-.5)*2.4,force=clamp(strength*.2,2,6);this.velocities[i].set((nx-nz*side)*force,2.2+(j%4)*.65,(nz+nx*side)*force);}
  if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
 }
 update(dt:number){if(dt<=0)return;for(let i=0;i<this.count;i++){if(this.ages[i]>=.65)continue;this.ages[i]+=dt;this.velocities[i].y-=5*dt;this.positions[i].addScaledVector(this.velocities[i],dt);this.pose.position.copy(this.positions[i]);this.pose.scale.setScalar(this.ages[i]>=.65?0:1-this.ages[i]/.65);this.pose.updateMatrix();this.mesh.setMatrixAt(i,this.pose.matrix);}this.mesh.instanceMatrix.needsUpdate=true;}
 clear(){this.ages.fill(2);this.pose.scale.setScalar(0);this.pose.updateMatrix();for(let i=0;i<this.count;i++)this.mesh.setMatrixAt(i,this.pose.matrix);this.mesh.instanceMatrix.needsUpdate=true;}
}
