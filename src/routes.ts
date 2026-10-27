import type {GameMap,Point} from './types';
import {closest,distance} from './geometry';
export class RoutePlanner {
 private nodes=new Map<string,Point>();private edges=new Map<string,{to:string;cost:number}[]>();private segments:{a:Point;b:Point;ka:string;kb:string}[]=[];
 constructor(map:GameMap){const b=map.bounds;const inside=(p:Point)=>p[0]>=b.minX&&p[0]<=b.maxX&&p[1]>=b.minZ&&p[1]<=b.maxZ;
  for(const road of map.roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],c=road.points[i];if(!inside(a)||!inside(c))continue;const key=(p:Point)=>`${p[0].toFixed(1)},${p[1].toFixed(1)},${road.layer}`;const ka=key(a),kb=key(c);this.nodes.set(ka,a);this.nodes.set(kb,c);for(const [from,to] of [[ka,kb],[kb,ka]]){const list=this.edges.get(from)??[];list.push({to,cost:distance(a,c)});this.edges.set(from,list);}this.segments.push({a,b:c,ka,kb});}
 }
 route(from:Point,to:Point):Point[]|null {
  const snap=(p:Point)=>this.segments.map(s=>({...s,p:closest(p,s.a,s.b)})).sort((a,b)=>distance(p,a.p)-distance(p,b.p))[0];
  const a=snap(from),b=snap(to);if(!a||!b)return null;if(a.ka===b.ka&&a.kb===b.kb)return [from,to];
  const cost=new Map<string,number>([[a.ka,distance(from,a.a)],[a.kb,distance(from,a.b)]]),prev=new Map<string,string>(),open=new Set(cost.keys());
  while(open.size){let key='';let best=Infinity;for(const k of open)if(cost.get(k)!<best){key=k;best=cost.get(k)!;}open.delete(key);for(const e of this.edges.get(key)??[]){const next=best+e.cost;if(next<(cost.get(e.to)??Infinity)){cost.set(e.to,next);prev.set(e.to,key);open.add(e.to);}}}
  const ends=[b.ka,b.kb].filter(k=>cost.has(k)).sort((x,y)=>cost.get(x)!+distance(this.nodes.get(x)!,to)-cost.get(y)!-distance(this.nodes.get(y)!,to));if(!ends.length)return null;
  const path:Point[]=[to];let k:string|undefined=ends[0];let guard=0;while(k&&guard++<2000){path.push(this.nodes.get(k)!);k=prev.get(k);}path.push(from);return path.reverse();
 }
}
export const routeLength=(points:Point[])=>points.slice(1).reduce((n,p,i)=>n+distance(points[i],p),0);
