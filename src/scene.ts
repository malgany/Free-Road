import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {GameMap,Polygon,CarState,Point} from './types';
import {CAMERA} from './config';
import {clamp,lerpAngle,seeded,closest,distance,capsule} from './geometry';
import {CollisionWorld} from './collision';
import {CameraZoom,CHASE_STOP} from './camera';
import {daylightAt} from './daylight';

export const TERRAIN_HEIGHT={neutral:0,grass:0.012,forest:0.024,dirt:0.036,water:0.04};
const TRAILS=2048,TRAIL_LIFE=90;

function shapeOf(p:Polygon){const shape=new THREE.Shape(p[0].map(([x,z])=>new THREE.Vector2(x,-z)));for(const h of p.slice(1))shape.holes.push(new THREE.Path(h.map(([x,z])=>new THREE.Vector2(x,-z))));return shape;}
function flat(p:Polygon,y:number){const g=new THREE.ShapeGeometry(shapeOf(p));g.rotateX(-Math.PI/2);g.translate(0,y,0);return g;}
function extrude(p:Polygon,h:number){const g=new THREE.ExtrudeGeometry(shapeOf(p),{depth:h,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);return g;}
export class GameScene {
  renderer:THREE.WebGLRenderer;scene=new THREE.Scene();perspective=new THREE.PerspectiveCamera(CAMERA.fov,1,0.04,1600);ortho=new THREE.OrthographicCamera(-70,70,70,-70,0.2,1600);
  get orthographic(){return this.zoom.orthographic;} set orthographic(value:boolean){this.zoom.select(value?'orthographic':'aerial');}
  loadGeneration=0; private visibilityTick=0; private shadowTick=0;
  cameraHeading=0;cameraPosition=new THREE.Vector3();cameraReady=false;car=new THREE.Group();body=new THREE.Group();frontWheels:THREE.Group[]=[];wheels:THREE.Mesh[]=[];
  debug=new THREE.Group();worldGroup=new THREE.Group();light:THREE.DirectionalLight;gradient:THREE.DataTexture;reduced=false;map!:GameMap;world!:CollisionWorld;
  zoom=new CameraZoom(); dayTime=0; phase='Dia'; headlightPower=0;
  ambient=new THREE.HemisphereLight('#fff8eb','#6b7974',1.1);cockpit=new THREE.Group();steering=new THREE.Group();glazing=new THREE.Group();
  headlamps:THREE.SpotLight[]=[];headMaterials:THREE.MeshStandardMaterial[]=[];reverseMaterials:THREE.MeshStandardMaterial[]=[];tailMaterials:THREE.MeshStandardMaterial[]=[];
  rearLight=new THREE.PointLight('#ff2921',0,6);sky=new THREE.Color();lastTrail:Point[]|null=null;
  trail:THREE.InstancedMesh;dust:THREE.InstancedMesh;trailAges=new Float32Array(TRAILS).fill(100);dustAges=new Float32Array(48).fill(100);trailIndex=0;dustIndex=0;effectTick=0;matrix=new THREE.Object3D();
  dustPositions=Array.from({length:48},()=>new THREE.Vector3());
  constructor(canvas:HTMLCanvasElement){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setClearColor('#e4dfc9');this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=0.95;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.gradient=new THREE.DataTexture(new Uint8Array([105,165,218,255]),4,1,THREE.RedFormat);this.gradient.minFilter=this.gradient.magFilter=THREE.NearestFilter;this.gradient.needsUpdate=true;
    this.scene.add(this.ambient);this.scene.fog=new THREE.Fog('#e4dfc9',140,320);
    this.light=new THREE.DirectionalLight('#fff8ec',1.7);this.light.position.set(-60,120,45);this.light.castShadow=true;this.light.shadow.mapSize.set(1024,1024);
    Object.assign(this.light.shadow.camera,{left:-110,right:110,top:110,bottom:-110,near:1,far:300});this.light.shadow.bias=-0.0006;this.light.shadow.normalBias=0.25;this.light.shadow.autoUpdate=false;
    this.scene.add(this.light,this.light.target,this.worldGroup,this.car,this.debug);this.debug.visible=false;
    this.createCar();this.mergeStatic(this.body);this.mergeStatic(this.cockpit);this.mergeStatic(this.steering);
    const tireG=new THREE.PlaneGeometry(0.22,1);tireG.rotateX(-Math.PI/2);
    this.trail=new THREE.InstancedMesh(tireG,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0.42,depthWrite:false}),TRAILS);this.trail.frustumCulled=false;this.trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.trail);
    this.dust=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.45,0),new THREE.MeshToonMaterial({color:'#d6be91',transparent:true,opacity:0.28,depthWrite:false}),48);this.dust.frustumCulled=false;this.scene.add(this.dust);
    this.clearEffects();
  }
  toon(color:THREE.ColorRepresentation){return new THREE.MeshToonMaterial({color,gradientMap:this.gradient});}
  batch(geometries:THREE.BufferGeometry[],material:THREE.Material,shadow=false,target=this.worldGroup,receive=true){
    if(!geometries.length){material.dispose();return;}
    const source=geometries.map(g=>g.index?g.toNonIndexed():g),g=mergeGeometries(source);source.forEach((item,i)=>{if(item!==geometries[i])item.dispose();});if(!g){geometries.forEach(g=>g.dispose());material.dispose();return;}
    const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=receive;mesh.castShadow=shadow;target.add(mesh);geometries.forEach(g=>g.dispose());
  }
  async load(map:GameMap,world:CollisionWorld,preserve=false,signal?:AbortSignal,canInstall:()=>boolean=()=>true){
    const generation=++this.loadGeneration,group=new THREE.Group(),debugGroup=new THREE.Group();
    let slice=performance.now();
    const checkpoint=async()=>{if(performance.now()-slice>5){await new Promise(r=>setTimeout(r,0));slice=performance.now();}if(generation!==this.loadGeneration||signal?.aborted)throw new DOMException('Cancelado','AbortError');};
    const batch=(geometries:THREE.BufferGeometry[],material:THREE.Material,shadow=false,receive=true)=>this.batch(geometries,material,shadow,group,receive);
    try{

    const b=map.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ;
    const ground=new THREE.Mesh(new THREE.BoxGeometry(w+2,2,d+2),this.toon('#d7cfb5'));ground.position.set((b.maxX+b.minX)/2,-1,(b.maxZ+b.minZ)/2);ground.receiveShadow=true;group.add(ground);
    const palettes={forest:'#526b43',grass:'#a9b98d',dirt:'#ceb087',water:'#76b6b2'};
    for(const kind of ['forest','grass','dirt','water'] as const)batch(map.areas.filter(a=>a.kind===kind).flatMap(a=>a.polygons.map(p=>flat(p,TERRAIN_HEIGHT[kind]))),this.toon(palettes[kind]));
    batch(map.corridors.flatMap(c=>c.polygons.map(p=>flat(p,0.05+c.layer*0.002))),this.toon('#536764'));
    batch(map.roads.filter(r=>r.surface==='dirt').flatMap(r=>r.points.slice(1).map((p,i)=>flat(capsule(r.points[i],p,r.width),0.06))),this.toon('#ceb087'));
    // Road centre markings; omit crowded junction tips. Style is synthetic, not a lane survey.
    const markings:THREE.BufferGeometry[]=[];
    for(const road of map.roads){await checkpoint();if(road.kind==='service'||road.surface==='dirt')continue;for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],len=distance(a,b),ang=Math.atan2(b[0]-a[0],b[1]-a[1]);
      for(let t=9;t<len-7;t+=11){const x=a[0]+(b[0]-a[0])*t/len,z=a[1]+(b[1]-a[1])*t/len;
        if(x<map.bounds.minX||x>map.bounds.maxX||z<map.bounds.minZ||z>map.bounds.maxZ)continue;
        if(world.index.segments([x,z]).some(s=>s.road.id!==road.id&&distance([x,z],closest([x,z],s.a,s.b))<s.road.width/2+2))continue;
        const g=new THREE.PlaneGeometry(0.16,3);g.rotateX(-Math.PI/2);g.rotateY(ang);g.translate(x,0.065,z);markings.push(g);
      }
    }}batch(markings,new THREE.MeshBasicMaterial({color:'#ced3af'}));
    const buildingColors=['#d5bb9d','#aebcba','#d2a58c','#bcc0a1','#d9cfb7','#b9abb0'];
    const sectors=new Map<string,THREE.BufferGeometry[]>();
    for(const area of map.areas.filter(a=>a.kind==='building')){await checkpoint();const idx=[...area.id].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,0)%buildingColors.length;
      for(const p of area.polygons){const g=extrude(p,area.height);g.computeBoundingBox();const center=g.boundingBox!.getCenter(new THREE.Vector3()),key=Math.floor(center.x/128)+','+Math.floor(center.z/128);
        const color=new THREE.Color(buildingColors[idx]),normal=g.getAttribute('normal'),colors=new Float32Array(normal.count*3);
        for(let i=0;i<normal.count;i++){const tint=color.clone();if(normal.getY(i)>0.5)tint.lerp(new THREE.Color('#fff7e2'),0.24);colors.set([tint.r,tint.g,tint.b],i*3);}g.setAttribute('color',new THREE.BufferAttribute(colors,3));
        const list=sectors.get(key)??[];list.push(g);sectors.set(key,list);
      }
    }
    for(const [key,geometry] of sectors){await checkpoint();const material=new THREE.MeshLambertMaterial({vertexColors:true});batch(geometry,material,true,false);const mesh=group.children.at(-1)!;mesh.userData.sector=key.split(',').map(Number);}
    const rocks:THREE.BufferGeometry[]=[];
    for(const r of map.rocks){const g=new THREE.DodecahedronGeometry(r.radius,0);g.scale(1,0.7,1);g.translate(r.x,r.radius*0.35,r.z);rocks.push(g);}batch(rocks,this.toon('#9c9e91'),true);
    // Visible perimeter follows the exact collision boundary. The line, not the decorative posts, is solid.
    const ring:Point[]=[[b.minX,b.minZ],[b.maxX,b.minZ],[b.maxX,b.maxZ],[b.minX,b.maxZ],[b.minX,b.minZ]];
    const boundary=new THREE.BufferGeometry().setFromPoints(ring.map(([x,z])=>new THREE.Vector3(x,0.2,z)));
    const line=new THREE.Line(boundary,new THREE.LineDashedMaterial({color:'#f6be64',dashSize:3,gapSize:2}));line.computeLineDistances();group.add(line);
    const edgeG:THREE.BufferGeometry[]=[];for(let i=1;i<ring.length;i++){const a=ring[i-1],p=ring[i],len=distance(a,p);for(let t=0;t<=len;t+=14){const g=new THREE.BoxGeometry(0.55,1.2,0.55);g.translate(a[0]+(p[0]-a[0])*t/len,0.6,a[1]+(p[1]-a[1])*t/len);edgeG.push(g);}}batch(edgeG,this.toon('#f2c171'));
    const debugLines:number[]=[];
    for(const o of world.obstacles)for(const ring of o.polygon)for(let i=1;i<ring.length;i++){debugLines.push(ring[i-1][0],0.3,ring[i-1][1],ring[i][0],0.3,ring[i][1]);}
    const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.Float32BufferAttribute(debugLines,3));debugGroup.add(new THREE.LineSegments(dg,new THREE.LineBasicMaterial({color:'#ff526b',depthTest:false})));
    const roadsDebug=map.roads.flatMap(r=>r.points.slice(1).flatMap((p,i)=>[r.points[i][0],0.32,r.points[i][1],p[0],0.32,p[1]]));const rdg=new THREE.BufferGeometry();rdg.setAttribute('position',new THREE.Float32BufferAttribute(roadsDebug,3));debugGroup.add(new THREE.LineSegments(rdg,new THREE.LineBasicMaterial({color:'#6df4ca',depthTest:false})));
    await checkpoint();
    if(!canInstall())throw new Error('O próximo recorte ainda não tem passagem livre para o carro.');
    this.disposeGroup(this.worldGroup);this.disposeGroup(this.debug);this.scene.remove(this.worldGroup,this.debug);
    this.worldGroup=group;this.debug=debugGroup;this.debug.visible=this.debugEnabled;this.scene.add(group,debugGroup);this.map=map;this.world=world;this.light.shadow.needsUpdate=true;
    if(!preserve){this.cameraReady=false;this.clearEffects();}
    }catch(e){this.disposeGroup(group);this.disposeGroup(debugGroup);throw e;}
  }
  aerialHeight=105;debugEnabled=false;
  disposeGroup(group:THREE.Group){group.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});group.clear();}
  mergeStatic(parent:THREE.Group){const groups=new Map<THREE.Material,THREE.Mesh[]>();for(const o of parent.children)if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&!o.material.transparent){const list=groups.get(o.material)??[];list.push(o);groups.set(o.material,list);}for(const [material,meshes] of groups){if(meshes.length<2)continue;const gs=meshes.map(m=>{m.updateMatrix();const g=m.geometry.clone().applyMatrix4(m.matrix);return g.index?g.toNonIndexed():g;});const merged=mergeGeometries(gs);gs.forEach(g=>g.dispose());if(!merged)continue;const mesh=new THREE.Mesh(merged,material);mesh.castShadow=true;parent.add(mesh);for(const old of meshes){parent.remove(old);old.geometry.dispose();}}}
  createCar(){
    const amber=this.toon('#eeaa42'),dark=this.toon('#263e43'),cream=this.toon('#f8df9b'),black=this.toon('#182b30');
    const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material,parent:THREE.Group)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;};
    this.car.add(this.body);
    box(1.72,0.27,3.55,0,0.64,0,amber,this.body);box(1.68,0.18,3.62,0,0.48,0,dark,this.body);
    box(1.65,0.35,0.96,0,0.87,-1.28,amber,this.body);box(1.57,0.06,0.91,0,1.06,-1.28,cream,this.body);
    box(1.65,0.35,0.65,0,0.87,1.43,amber,this.body);
    box(1.56,0.10,1.94,0,1.83,0.16,cream,this.body);
    for(const x of [-0.78,0.78]){
      box(0.1,0.43,1.94,x,0.94,0.16,amber,this.body);
      for(const z of [-0.8,0.32,1.1])box(0.07,0.68,0.075,x,1.48,z,cream,this.body);
      box(0.18,0.14,0.26,x*1.18,1.2,-0.65,dark,this.body);
    }
    const glass=new THREE.MeshStandardMaterial({color:'#9dcecf',transparent:true,opacity:0.15,roughness:0.25,depthWrite:false,side:THREE.DoubleSide});
    this.body.add(this.glazing);
    box(1.44,0.59,0.016,0,1.48,-0.8,glass,this.glazing);box(1.44,0.59,0.016,0,1.48,1.1,glass,this.glazing);
    for(const x of [-0.775,0.775])box(0.016,0.59,1.8,x,1.48,0.15,glass,this.glazing);
    this.body.add(this.cockpit);
    const leather=new THREE.MeshStandardMaterial({color:'#293a3f',roughness:0.9}),trim=new THREE.MeshStandardMaterial({color:'#a48156',roughness:0.7});
    box(1.47,0.08,1.8,0,0.79,0.15,black,this.cockpit);
    box(1.46,0.22,0.42,0,1.05,-0.57,leather,this.cockpit);
    box(1.43,0.035,0.04,0,1.1,-0.335,trim,this.cockpit);
    for(const x of [-0.72,0.72]){box(0.035,0.28,1.75,x,0.99,0.18,leather,this.cockpit);box(0.04,0.035,0.23,x,1.12,0.28,cream,this.cockpit);}
    for(const x of [-0.36,0.36]){box(0.55,0.12,0.6,x,0.88,0.32,leather,this.cockpit);box(0.55,0.61,0.13,x,1.14,0.61,leather,this.cockpit);box(0.27,0.16,0.1,x,1.53,0.61,leather,this.cockpit);}
    box(0.2,0.22,0.7,0,0.93,0.1,leather,this.cockpit);
    box(0.04,0.15,0.04,0,1.12,-0.05,black,this.cockpit);
    box(0.32,0.12,0.035,0.05,1.1,-0.34,new THREE.MeshBasicMaterial({color:'#416c65'}),this.cockpit);
    // Physical wheel and spokes rotate with the actual steering state.
    this.steering.position.set(-0.37,1.15,-0.22);this.steering.rotation.x=-0.25;this.cockpit.add(this.steering);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(0.205,0.022,8,32),black);this.steering.add(rim);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.045,16),trim);hub.rotation.x=Math.PI/2;this.steering.add(hub);
    for(const angle of [0,Math.PI*2/3,Math.PI*4/3]){const spoke=box(0.025,0.19,0.02,Math.sin(angle)*0.095,Math.cos(angle)*0.095,0,trim,this.steering);spoke.rotation.z=-angle;}
    for(const x of [-0.47,-0.27]){
      const dial=new THREE.Mesh(new THREE.CircleGeometry(0.065,24),new THREE.MeshBasicMaterial({color:'#b9d8b6'}));dial.position.set(x,1.14,-0.35);this.cockpit.add(dial);
      const needle=box(0.007,0.05,0.005,x,1.15,-0.344,black,this.cockpit);needle.rotation.z=-0.7;
    }
    box(0.29,0.1,0.035,0,1.65,-0.69,dark,this.cockpit);box(0.25,0.07,0.01,0,1.65,-0.665,this.toon('#8caaa6'),this.cockpit);
    for(const x of [-0.58,0.58]){
      const head=new THREE.MeshStandardMaterial({color:'#f4edd1',emissive:'#ffebbb',emissiveIntensity:0.1});this.headMaterials.push(head);box(0.34,0.2,0.06,x,0.85,-1.8,head,this.body);
      const tail=new THREE.MeshStandardMaterial({color:'#a92e24',emissive:'#ff2716',emissiveIntensity:0.1});this.tailMaterials.push(tail);box(0.28,0.14,0.06,x,0.86,1.8,tail,this.body);
      const reverse=new THREE.MeshStandardMaterial({color:'#b52c25',emissive:'#ff2921',emissiveIntensity:0});this.reverseMaterials.push(reverse);box(0.15,0.09,0.065,x*0.6,0.86,1.8,reverse,this.body);
      const lamp=new THREE.SpotLight('#fff1cf',0,80,0.45,0.55,1.5);lamp.position.set(x,0.88,-1.84);lamp.target.position.set(x,0.15,-35);lamp.castShadow=true;lamp.shadow.mapSize.set(512,512);lamp.shadow.bias=-0.0002;lamp.shadow.normalBias=0.03;this.car.add(lamp,lamp.target);this.headlamps.push(lamp);
    }
    this.rearLight.position.set(0,0.8,2.4);this.car.add(this.rearLight);
    for(const x of [-0.88,0.88])for(const z of [-1.1,1.1]){
      const pivot=new THREE.Group();pivot.position.set(x,0.42,z);this.car.add(pivot);
      const tire=new THREE.Mesh(new THREE.CylinderGeometry(0.39,0.39,0.24,12),black);tire.rotation.z=Math.PI/2;pivot.add(tire);this.wheels.push(tire);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,0.25,10),cream);hub.rotation.z=Math.PI/2;pivot.add(hub);if(z<0)this.frontWheels.push(pivot);
    }
  }
  clearEffects(){this.lastTrail=null;this.trailAges.fill(100);this.dustAges.fill(100);this.matrix.scale.setScalar(0);this.matrix.updateMatrix();for(let i=0;i<TRAILS;i++)this.trail.setMatrixAt(i,this.matrix.matrix);for(let i=0;i<48;i++)this.dust.setMatrixAt(i,this.matrix.matrix);this.trail.instanceMatrix.needsUpdate=this.dust.instanceMatrix.needsUpdate=true;}
  resize(width:number,height:number){this.renderer.setSize(width,height,false);this.perspective.aspect=width/height;this.perspective.updateProjectionMatrix();const span=height>width?80:63;Object.assign(this.ortho,{left:-span*width/height,right:span*width/height,top:span,bottom:-span});this.ortho.updateProjectionMatrix();}
  effects(s:CarState,dt:number,braking:boolean){
    if(dt<=0)return;this.effectTick+=dt;
    for(let i=0;i<TRAILS;i++)if(this.trailAges[i]<TRAIL_LIFE){this.trailAges[i]+=dt;if(this.trailAges[i]>=TRAIL_LIFE){this.matrix.scale.setScalar(0);this.matrix.updateMatrix();this.trail.setMatrixAt(i,this.matrix.matrix);}}
    for(let i=0;i<48;i++)if(this.dustAges[i]<1.4){this.dustAges[i]+=dt;const age=this.dustAges[i];this.matrix.position.copy(this.dustPositions[i]);this.matrix.position.y+=age*0.8;this.matrix.scale.setScalar(age>=1.4?0:(0.4+age)*Math.max(0,1-age/1.4));this.matrix.rotation.set(0,0,0);this.matrix.updateMatrix();this.dust.setMatrixAt(i,this.matrix.matrix);}
    const rear:Point[]=[-1,1].map(side=>[s.x+Math.cos(s.heading)*side*0.76-Math.sin(s.heading),s.z+Math.sin(s.heading)*side*0.76+Math.cos(s.heading)]);
    if(Math.abs(s.speed)>0.6&&this.lastTrail){
      for(let side=0;side<2;side++){
        let p=rear[side],last=this.lastTrail[side];
        const forest=this.world.surfaceAt([s.x,s.z])==='forest';
        if(forest){if(side===1)continue;p=[(rear[0][0]+rear[1][0])/2,(rear[0][1]+rear[1][1])/2];last=[(this.lastTrail[0][0]+this.lastTrail[1][0])/2,(this.lastTrail[0][1]+this.lastTrail[1][1])/2];}
        const len=distance(p,last),surface=forest?'forest':this.world.surfaceAt(p);
        const offroad=['grass','forest','dirt','neutral'].includes(surface);
        if(len>0.05&&len<12&&(offroad||(surface==='asphalt'&&Math.abs(s.speed)>6&&(Math.abs(s.steer)>0.14||braking)))){
          const i=this.trailIndex++%TRAILS;this.trailAges[i]=0;
          this.matrix.position.set((p[0]+last[0])/2,0.085,(p[1]+last[1])/2);this.matrix.rotation.set(0,Math.atan2(p[0]-last[0],p[1]-last[1]),0);this.matrix.scale.set(forest?2.05/0.22:offroad?1.35:1,1,len+0.06);this.matrix.updateMatrix();this.trail.setMatrixAt(i,this.matrix.matrix);
          this.trail.setColorAt(i,new THREE.Color(surface==='forest'?'#879562':surface==='grass'?'#536343':offroad?'#806443':'#202f2d'));
        }
      }
    }
    this.lastTrail=rear;
    if(!this.reduced&&this.effectTick>0.06&&Math.abs(s.speed)>5){this.effectTick=0;const surface=this.world.surfaceAt([s.x,s.z]);
      if(surface==='dirt'||surface==='neutral'){const i=this.dustIndex++%48;this.dustAges[i]=0;this.dustPositions[i].set(s.x-Math.sin(s.heading)*1.5,0.3,s.z+Math.cos(s.heading)*1.5);}
    }
    if(this.trail.instanceColor)this.trail.instanceColor.needsUpdate=true;
    this.trail.instanceMatrix.needsUpdate=true;this.dust.instanceMatrix.needsUpdate=true;
  }
  render(s:CarState,dt:number,braking:boolean,reversing=false,running=true){
    this.car.position.set(s.x,0,s.z);this.car.rotation.y=-s.heading;
    const response=1-Math.exp(-10*dt);this.body.rotation.z+=(-s.steer*s.speed*0.003-this.body.rotation.z)*response;this.body.rotation.x+=((braking?0.035:0)-this.body.rotation.x)*response;
    for(const w of this.frontWheels)w.rotation.y=-s.steer;
    this.steering.rotation.z=-s.steer*5;
    this.zoom.update(dt);
    if(!this.cameraReady){this.cameraHeading=s.heading;this.cameraPosition.set(s.x,0,s.z);this.cameraReady=true;}
    this.cameraHeading=lerpAngle(this.cameraHeading,s.heading,1-Math.exp(-CAMERA.headingResponse*dt));
    this.cameraPosition.lerp(new THREE.Vector3(s.x,0,s.z),1-Math.exp(-CAMERA.positionResponse*dt));
    const z=this.orthographic?1:this.zoom.value,aerial=clamp((z-CHASE_STOP)/(1-CHASE_STOP),0,1),inside=1-clamp(z/CHASE_STOP,0,1),blend=inside*inside*(3-2*inside);
    const heading=lerpAngle(this.cameraHeading,s.heading,blend),fx=Math.sin(heading),fz=-Math.cos(heading);
    const cam=this.orthographic?this.ortho:this.perspective;
    const behind=5+Math.pow(aerial,1.7)*53,height=2.8+Math.pow(aerial,1.6)*((this.orthographic?105:this.aerialHeight)-2.8);
    const focus=new THREE.Vector3(this.cameraPosition.x,0,this.cameraPosition.z).lerp(new THREE.Vector3(s.x,0,s.z),1-aerial);
    const outside=new THREE.Vector3(focus.x-fx*behind,height,focus.z-fz*behind);
    const eye=new THREE.Vector3(-0.37,1.47,0.23);this.car.updateMatrixWorld(true);this.body.localToWorld(eye);
    cam.position.copy(outside).lerp(eye,blend);
    const exteriorAim=new THREE.Vector3(focus.x+fx*12,1,focus.z+fz*12);
    const yaw=s.heading+this.zoom.yaw,cp=Math.cos(this.zoom.pitch);
    const interiorAim=eye.clone().add(new THREE.Vector3(Math.sin(yaw)*cp,Math.sin(this.zoom.pitch),-Math.cos(yaw)*cp).multiplyScalar(20));
    cam.lookAt(exteriorAim.lerp(interiorAim,blend));
    this.glazing.visible=blend<0.5;
    const fov=45+(1-aerial)*20+blend*12;if(Math.abs(this.perspective.fov-fov)>0.01){this.perspective.fov=fov;this.perspective.near=blend>0.5?0.08:0.2;this.perspective.updateProjectionMatrix();}
    if(cam===this.ortho&&this.ortho.zoom!==1){this.ortho.zoom=1;this.ortho.updateProjectionMatrix();}
    if(running)this.dayTime+=dt;
    const lighting=daylightAt(this.dayTime);this.phase=lighting.phase;this.headlightPower=lighting.headlights;
    this.ambient.intensity=0.22+lighting.daylight*0.88;
    this.light.intensity=lighting.daylight*1.7;this.light.color.set(lighting.phase==='Dia'?'#fff8ec':'#ffad69');
    this.shadowTick+=dt;
    if(this.shadowTick>0.05){this.shadowTick=0;const sx=Math.round(s.x*2)/2,sz=Math.round(s.z*2)/2;this.light.position.set(sx+Math.cos(lighting.angle)*120,Math.max(8,Math.sin(lighting.angle)*130),sz+35);this.light.target.position.set(sx,0,sz);this.light.shadow.needsUpdate=true;}
    this.visibilityTick+=dt;if(this.visibilityTick>0.2){this.visibilityTick=0;for(const mesh of this.worldGroup.children){const sector=mesh.userData.sector;if(sector){const d=Math.hypot(sector[0]*128+64-s.x,sector[1]*128+64-s.z);mesh.visible=d<380;mesh.castShadow=d<210;}}}
    this.sky.set('#101c32').lerp(new THREE.Color(lighting.phase==='Dia'?'#dce5d9':'#d39b83'),lighting.daylight);this.renderer.setClearColor(this.sky);(this.scene.fog as THREE.Fog).color.copy(this.sky);
    this.headlamps.forEach((l,i)=>{l.intensity=lighting.headlights*650;l.castShadow=i===0&&!this.reduced&&lighting.headlights>0.05;});
    this.headMaterials.forEach(m=>m.emissiveIntensity=0.05+lighting.headlights*3);
    this.reverseMaterials.forEach(m=>m.emissiveIntensity=reversing?2:0);this.rearLight.intensity=reversing?1.5:0;
    this.tailMaterials.forEach(m=>m.emissiveIntensity=braking?3:0.08+lighting.headlights*0.8);
    this.effects(s,running?dt:0,braking);this.renderer.render(this.scene,cam);
  }
}
