import {boundsOf,closest,distance,inPolygon} from './geometry';
import type {GameMap,Point,Polygon,Road} from './types';
type Segment={road:Road;a:Point;b:Point};
type Surface={kind:'asphalt'|'grass'|'dirt'|'water'|'forest';polygon:Polygon};
export class MapIndex {
  private roads=new Map<string,Segment[]>();private surfaces=new Map<string,Surface[]>();
  private cell=32;
  constructor(map:GameMap){
    const insert=<T>(grid:Map<string,T[]>,b:{minX:number;maxX:number;minZ:number;maxZ:number},item:T)=>{
      const minX=Math.max(b.minX,map.bounds.minX-20),maxX=Math.min(b.maxX,map.bounds.maxX+20),minZ=Math.max(b.minZ,map.bounds.minZ-20),maxZ=Math.min(b.maxZ,map.bounds.maxZ+20);
      for(let x=Math.floor(minX/this.cell);x<=Math.floor(maxX/this.cell);x++)for(let z=Math.floor(minZ/this.cell);z<=Math.floor(maxZ/this.cell);z++){const key=`${x},${z}`,list=grid.get(key)??[];list.push(item);grid.set(key,list);}
    };
    for(const road of map.roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],pad=road.width/2+10;insert(this.roads,{minX:Math.min(a[0],b[0])-pad,maxX:Math.max(a[0],b[0])+pad,minZ:Math.min(a[1],b[1])-pad,maxZ:Math.max(a[1],b[1])+pad},{road,a,b});}
    // This order defines which terrain wins where polygons overlap.
    for(const corridor of map.corridors)for(const polygon of corridor.polygons)insert(this.surfaces,boundsOf([polygon]),{kind:'asphalt',polygon});
    for(const kind of ['water','dirt','forest','grass'] as const)for(const area of map.areas)if(area.kind===kind)for(const polygon of area.polygons)insert(this.surfaces,boundsOf([polygon]),{kind,polygon});
  }
  segments(p:Point){return this.roads.get(`${Math.floor(p[0]/this.cell)},${Math.floor(p[1]/this.cell)}`)??[];}
  nearest(p:Point){let best=Infinity,road:Road|undefined;for(const s of this.segments(p)){const d=distance(p,closest(p,s.a,s.b));if(d<best){best=d;road=s.road;}}return {road,distance:best};}
  surface(p:Point):Surface['kind']|'neutral'{
    for(const area of this.surfaces.get(`${Math.floor(p[0]/this.cell)},${Math.floor(p[1]/this.cell)}`)??[])if(inPolygon(p,area.polygon)){
      if(area.kind==='asphalt'&&this.segments(p).some(s=>s.road.surface==='dirt'&&distance(p,closest(p,s.a,s.b))<s.road.width/2))return 'dirt';return area.kind;
    }return 'neutral';
  }
}
