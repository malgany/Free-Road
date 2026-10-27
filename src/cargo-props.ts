import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {MissionKind} from './expedition';
import {MISSION} from './mission-design';
import type {Point} from './types';
import type {CollisionWorld} from './collision';
export const cargoMaterial=(color:string,metalness=.15)=>new THREE.MeshStandardMaterial({color,roughness:.72,metalness});
function box(parent:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
export function makeCargo(kind:MissionKind){const g=new THREE.Group(),paint=cargoMaterial(MISSION[kind].color),dark=cargoMaterial('#26333a'),strap=cargoMaterial('#554b3f'),ivory=cargoMaterial('#e5e1c9');
 if(kind==='fuel'){for(const x of [-.3,.3]){box(g,.43,.68,.26,x,.4,0,paint);box(g,.25,.075,.09,x,.8,0,dark);for(const dx of [-.12,.12])box(g,.06,.14,.09,x+dx,.73,0,dark);const cap=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.07,8),dark);cap.position.set(x+.14,.78,0);g.add(cap);for(const angle of [-.6,.6]){const cross=box(g,.025,.42,.025,x,.4,.145,strap);cross.rotation.z=angle;}}}
 else if(kind==='medical'){box(g,.82,.53,.42,0,.31,0,paint);box(g,.82,.07,.44,0,.51,0,dark);box(g,.3,.05,.07,0,.68,0,dark);for(const x of [-.13,.13])box(g,.045,.13,.07,x,.61,0,dark);box(g,.3,.065,.02,0,.29,.22,ivory);box(g,.065,.3,.02,0,.29,.23,ivory);for(const x of [-.29,.29])box(g,.06,.08,.02,x,.45,.24,ivory);}
 else{for(const [x,y,z] of [[-.28,.22,.08],[.28,.22,.08],[0,.61,-.05]]){box(g,.5,.38,.52,x,y,z,paint);for(const dx of [-.17,.17])box(g,.035,.41,.54,x+dx,y,z,strap);box(g,.23,.12,.02,x,y,z+.27,ivory);}}
 return compactProps(g); }
function label(text:string,color='#d4d7bc'){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d')!;c.fillStyle='#17282b';c.fillRect(0,0,512,128);c.fillStyle=color;c.font='bold 56px sans-serif';c.textAlign='center';c.fillText(text,256,84);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return new THREE.Mesh(new THREE.PlaneGeometry(3.2,.8),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));}
export function makeShelter(){const g=new THREE.Group(),metal=cargoMaterial('#66746b'),frame=cargoMaterial('#27393b',.5),canvas=cargoMaterial('#aaac89'),warm=new THREE.MeshBasicMaterial({color:'#e4c58a'});
 box(g,4.5,2.5,2.4,0,1.25,0,metal);for(let x=-2;x<=2;x+=.35)box(g,.04,2.4,.03,x,1.25,1.22,frame);box(g,1,2.05,.08,.7,1.03,1.27,frame);box(g,.54,.45,.09,.7,1.5,1.32,cargoMaterial('#b0bda9'));box(g,4.8,.12,4.2,0,2.65,.8,canvas);
 for(const x of [-2.25,2.25])box(g,.09,2.65,.09,x,1.32,2.7,frame);const sign=label('ABRIGO / 01','#bbd6a6');sign.position.set(0,2.08,2.75);g.add(sign);box(g,3.5,.045,.08,0,2.5,2.6,warm);for(const x of [-1.5,-.8]){const supplies=makeCargo('supplies');supplies.position.set(x,0,1.8);g.add(supplies);}const medical=makeCargo('medical');medical.position.set(1.5,.1,1.8);g.add(medical);return compactProps(g); }
export function propAnchor(world:CollisionWorld,p:Point,radius=2.8):Point|null {for(const r of [10,15,21,28])for(let i=0;i<8;i++){const q:Point=[p[0]+Math.cos(i*Math.PI/4)*r,p[1]+Math.sin(i*Math.PI/4)*r];const points:Point[]=[q,[q[0]-radius,q[1]-radius],[q[0]+radius,q[1]+radius],[q[0]-radius,q[1]+radius],[q[0]+radius,q[1]-radius]];if(points.every(v=>!world.hit(v[0],v[1],0)&&!['water','asphalt'].includes(world.surfaceAt(v))))return q;}return null;}

/** Merge static props by shader properties, preserving per-vertex paint and textured signs. */
export function compactProps(root:THREE.Group){
 root.updateMatrixWorld(true);const buckets=new Map<string,{material:THREE.MeshStandardMaterial;parts:THREE.BufferGeometry[]}>(),old:THREE.Mesh[]=[];const inverse=root.matrixWorld.clone().invert();
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||!(o.material instanceof THREE.MeshStandardMaterial)||o.material.map||o.material.transparent)return;
  const m=o.material,key=[m.roughness,m.metalness,m.emissive.getHex(),m.side].join('/');let row=buckets.get(key);if(!row){const material=m.clone();material.color.set('#ffffff');material.vertexColors=true;row={material,parts:[]};buckets.set(key,row);}
  const clone=o.geometry.clone(),g=clone.index?clone.toNonIndexed():clone;if(g!==clone)clone.dispose();g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));const color=g.getAttribute('color'),colors=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<colors.length/3;i++)colors.set([m.color.r*(color?.getX(i)??1),m.color.g*(color?.getY(i)??1),m.color.b*(color?.getZ(i)??1)],i*3);g.setAttribute('color',new THREE.BufferAttribute(colors,3));row.parts.push(g);old.push(o);
 });
 for(const row of buckets.values()){const g=mergeGeometries(row.parts);if(!g)throw new Error('Geometria de carga incompatível');const mesh=new THREE.Mesh(g,row.material);mesh.castShadow=true;root.add(mesh);row.parts.forEach(p=>p.dispose());}
 const disposed=new Set<THREE.Material>();for(const mesh of old){mesh.removeFromParent();mesh.geometry.dispose();if(!disposed.has(mesh.material as THREE.Material)){(mesh.material as THREE.Material).dispose();disposed.add(mesh.material as THREE.Material);}}return root;
}
