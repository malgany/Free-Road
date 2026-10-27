import clipping from 'polygon-clipping';
import type {GameMap,Point,Polygon,MultiPolygon,CarState} from './types';
import {closest,distance,inPolygon,inMulti,circle,capsule,boundsOf,clamp} from './geometry';
import {CAR} from './config';
import {MapIndex} from './spatial';
interface Obstacle {id:string;polygon:Polygon;layer:number}
export class CollisionWorld {
  index:MapIndex;
  obstacles:Obstacle[]=[];grid=new Map<string,number[]>();cellSize=24;
  constructor(public map:GameMap){
    this.index=new MapIndex(map);
    const bridges=map.roads.filter(r=>r.bridge&&!r.tunnel).flatMap(r=>r.points.slice(1).map((p,i)=>capsule(r.points[i],p,r.width)));
    for(const a of map.areas.filter(a=>a.kind==='building'||a.kind==='water')){
      // Water is solid except where actual bridge deck corridors cut it. Holes remain traversable.
      const shapes=a.kind==='water'&&bridges.length?clipping.difference(a.polygons,...bridges) as MultiPolygon:a.polygons;
      for(const polygon of shapes)this.obstacles.push({id:a.id,polygon,layer:a.kind==='water'?Number.NaN:a.layer});
    }
    for(const r of map.rocks)this.obstacles.push({id:r.id,polygon:[circle([r.x,r.z],r.radius)],layer:0});
    this.obstacles.forEach((o,i)=>{const b=boundsOf([o.polygon]);for(let x=Math.floor(b.minX/this.cellSize);x<=Math.floor(b.maxX/this.cellSize);x++)for(let z=Math.floor(b.minZ/this.cellSize);z<=Math.floor(b.maxZ/this.cellSize);z++){const key=`${x},${z}`;const arr=this.grid.get(key)??[];arr.push(i);this.grid.set(key,arr);}});
  }
  layerAt(p:Point):number {
    // This planar prototype allows bridge ramps but rejects stacked road crossings on import validation.
    for(const r of this.map.roads)if(r.bridge&&r.points.slice(1).some((b,i)=>distance(p,closest(p,r.points[i],b))<=r.width/2))return r.layer;
    return 0;
  }
  nearby(x:number,z:number):Obstacle[]{const ids=new Set<number>();const reach=CAR.radius+CAR.halfSegment+0.2;for(let i=Math.floor((x-reach)/this.cellSize);i<=Math.floor((x+reach)/this.cellSize);i++)for(let j=Math.floor((z-reach)/this.cellSize);j<=Math.floor((z+reach)/this.cellSize);j++)for(const id of this.grid.get(`${i},${j}`)??[])ids.add(id);return [...ids].map(id=>this.obstacles[id]);}
  hit(x:number,z:number,heading:number):{nx:number;nz:number;depth:number;id:string}|null {
    const h=CAR.halfSegment,r=CAR.radius+0.015,dx=Math.sin(heading)*h,dz=-Math.cos(heading)*h;
    const a:Point=[x-dx,z-dz],b:Point=[x+dx,z+dz];
    const bound=this.map.bounds;
    for(const p of [a,b]){
      if(p[0]-r<bound.minX)return {nx:1,nz:0,depth:bound.minX-p[0]+r,id:'limite'};
      if(p[0]+r>bound.maxX)return {nx:-1,nz:0,depth:p[0]+r-bound.maxX,id:'limite'};
      if(p[1]-r<bound.minZ)return {nx:0,nz:1,depth:bound.minZ-p[1]+r,id:'limite'};
      if(p[1]+r>bound.maxZ)return {nx:0,nz:-1,depth:p[1]+r-bound.maxZ,id:'limite'};
    }
    const layer=this.layerAt([x,z]);
    for(const o of this.nearby(x,z)){
      if(Number.isFinite(o.layer)&&o.layer!==layer)continue;
      const insideA=inPolygon(a,o.polygon),insideB=inPolygon(b,o.polygon);
      let best=Infinity,near:Point=[0,0],onCar:Point=[0,0];
      for(const ring of o.polygon)for(let i=1;i<ring.length;i++){
        const c=ring[i-1],d=ring[i];
        const pairs:[Point,Point][]=[[a,closest(a,c,d)],[b,closest(b,c,d)],[closest(c,a,b),c],[closest(d,a,b),d]];
        for(const [p,q] of pairs){const dist=distance(p,q);if(dist<best){best=dist;near=q;onCar=p;}}
      }
      if(best<r||insideA||insideB){
        const inside=inPolygon(onCar,o.polygon);let nx=(onCar[0]-near[0])/(best||1),nz=(onCar[1]-near[1])/(best||1);
        if(best<1e-8){nx=x-near[0];nz=z-near[1];const len=Math.hypot(nx,nz)||1;nx/=len;nz/=len;}
        if(inside){nx=-nx;nz=-nz;}
        return {nx,nz,depth:inside?r+best:r-best,id:o.id};
      }
    }return null;
  }
  move(state:CarState,dx:number,dz:number,heading:number){
    const sub=Math.max(1,Math.ceil(Math.hypot(dx,dz)/0.3),Math.ceil(Math.abs(heading-state.heading)/0.06));
    let contact:string|null=null;
    for(let i=0;i<sub;i++){
      const old={x:state.x,z:state.z,heading:state.heading};state.x+=dx/sub;state.z+=dz/sub;state.heading+=(heading-state.heading)/(sub-i);
      for(let n=0;n<6;n++){
        const hit=this.hit(state.x,state.z,state.heading);if(!hit)break;contact=hit.id;
        state.x+=hit.nx*(hit.depth+0.002);state.z+=hit.nz*(hit.depth+0.002);
        const normal=state.vx*hit.nx+state.vz*hit.nz;
        if(normal<0){state.vx-=normal*hit.nx;state.vz-=normal*hit.nz;state.vx*=0.86;state.vz*=0.86;}
      }
      if(this.hit(state.x,state.z,state.heading)){state.x=old.x;state.z=old.z;state.heading=old.heading;state.vx=state.vz=0;break;}
    }state.contact=contact;
  }
  surfaceAt(p:Point){return this.index.surface(p);}
}
