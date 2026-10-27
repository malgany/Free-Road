import {project} from './importer';
import type {Coordinates} from './location';
import type {CarState,GameMap,Point} from './types';

/** Inverse of the importer's spherical azimuthal equidistant projection. */
export function unproject(p:Point,origin:Coordinates,scale=1):Coordinates {
  const x=p[0]/scale,y=-p[1]/scale,rho=Math.hypot(x,y),rad=Math.PI/180;
  if(rho<1e-8)return {...origin};
  const c=rho/6371008.8,lat0=origin.lat*rad;
  return {lat:Math.asin(Math.cos(c)*Math.sin(lat0)+y*Math.sin(c)*Math.cos(lat0)/rho)/rad,
    lon:origin.lon+Math.atan2(x*Math.sin(c),rho*Math.cos(lat0)*Math.cos(c)-y*Math.sin(lat0)*Math.sin(c))/rad};
}
/** Keep one world coordinate system as geographic windows change. */
export function rebaseMap(source:GameMap,origin:Coordinates):GameMap {
  const m=structuredClone(source),scale=m.adaptation.scale;
  const point=(p:Point):Point=>{const geo=unproject(p,m.origin,scale);return project(geo.lat,geo.lon,origin,scale);};
  const b=m.bounds,corners:Point[]=[[b.minX,b.minZ],[b.maxX,b.minZ],[b.maxX,b.maxZ],[b.minX,b.maxZ]];
  const points=corners.map(point);
  // Inscribe the slightly rotated quadrilateral: no accessible, unfetched corner.
  m.bounds={minX:Math.max(points[0][0],points[3][0]),maxX:Math.min(points[1][0],points[2][0]),minZ:Math.max(points[0][1],points[1][1]),maxZ:Math.min(points[2][1],points[3][1])};
  m.pois?.forEach(p=>p.point=point(p.point));
  if(m.terrain)for(const key of Object.keys(m.terrain) as (keyof typeof m.terrain)[])m.terrain[key]=m.terrain[key].map(p=>p.map(r=>r.map(point)));
  m.places?.forEach(p=>p.point=point(p.point));
  m.roads.forEach(r=>r.points=r.points.map(point));
  m.areas.forEach(a=>a.polygons=a.polygons.map(p=>p.map(r=>r.map(point))));
  m.corridors.forEach(c=>c.polygons=c.polygons.map(p=>p.map(r=>r.map(point))));
  m.graph.nodes=Object.fromEntries(Object.entries(m.graph.nodes).map(([key,p])=>[key,point(p)]));
  for(const rock of m.rocks){const [x,z]=point([rock.x,rock.z]);rock.x=x;rock.z=z;}
  const [x,z]=point([m.spawn.x,m.spawn.z]);m.spawn={...m.spawn,x,z};m.origin={...origin};return m;
}
export function expansionTarget(map:GameMap,s:CarState):Coordinates|null {
  const b=map.bounds,w=Math.min(b.maxX-b.minX,b.maxZ-b.minZ);
  const margin=Math.min(w*0.4,Math.max(w*0.3,Math.abs(s.speed)*6));
  const edges=[{distance:s.x-b.minX,dx:-1,dz:0},{distance:b.maxX-s.x,dx:1,dz:0},{distance:s.z-b.minZ,dx:0,dz:-1},{distance:b.maxZ-s.z,dx:0,dz:1}];
  const candidates=edges.filter(e=>e.distance<margin&&(e.dx*s.vx+e.dz*s.vz>0.25||e.distance<20));
  if(!candidates.length)return null;
  candidates.sort((a,b)=>a.distance-b.distance);const edge=candidates[0];
  const ahead=w*0.18;
  return unproject([s.x+edge.dx*ahead,s.z+edge.dz*ahead],map.origin,map.adaptation.scale);
}
