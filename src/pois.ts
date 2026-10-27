import type {GameMap,Point,WorldPOI} from './types';
import {closest,distance} from './geometry';
import type {CollisionWorld} from './collision';
export const POI_LABELS={fuel:'Posto',supplies:'Mercado',medical:'Saúde',park:'Parque',landmark:'Marco',parking:'Estacionamento'};
export function poiKind(t:Record<string,string>):WorldPOI['kind']|undefined {
 if(t.amenity==='fuel')return 'fuel';if(['hospital','clinic','pharmacy'].includes(t.amenity))return 'medical';
 if(['supermarket','convenience','grocery'].includes(t.shop))return 'supplies';if(t.leisure==='park')return 'park';
 if(t.amenity==='parking')return 'parking';if(t.historic||['museum','attraction','viewpoint'].includes(t.tourism))return 'landmark';
}
export function accessPoint(p:Point,map:GameMap,world:CollisionWorld):Point|null {
 const options=map.roads.filter(r=>r.layer===0&&!r.tunnel).flatMap(r=>r.points.slice(1).map((q,i)=>closest(p,r.points[i],q))).sort((a,b)=>distance(a,p)-distance(b,p));
 const b=map.bounds;return options.find(q=>q[0]>b.minX+15&&q[0]<b.maxX-15&&q[1]>b.minZ+15&&q[1]<b.maxZ-15&&!world.hit(q[0],q[1],0)&&!world.hit(q[0],q[1],Math.PI/2))??null;
}
export function roadSamples(map:GameMap,world:CollisionWorld,spacing=35){
 const points:Point[]=[];for(const r of map.roads){if(r.layer!==0||r.tunnel)continue;for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],len=distance(a,b);for(let d=spacing/2;d<len;d+=spacing){const t=d/len,p:Point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(p[0]<map.bounds.minX+20||p[0]>map.bounds.maxX-20||p[1]<map.bounds.minZ+20||p[1]>map.bounds.maxZ-20||world.hit(...p,0)||world.hit(...p,Math.PI/2))continue;if(!points.some(q=>distance(p,q)<20))points.push(p);}}}return points;
}
