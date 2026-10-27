import clipping from 'polygon-clipping';
import {capsule} from './geometry';
import type {GameMap,MultiPolygon} from './types';
export type TerrainKind='neutral'|'grass'|'forest'|'dirt'|'water'|'sidewalk';
export type TerrainMesh=Record<TerrainKind,MultiPolygon>;
/** Disjoint surfaces: a pixel can never belong to two ground meshes. */
export function buildTerrain(map:GameMap):TerrainMesh {
 const b=map.bounds,rect:MultiPolygon=[[[[b.minX,b.minZ],[b.maxX,b.minZ],[b.maxX,b.maxZ],[b.minX,b.maxZ],[b.minX,b.minZ]]]];
 const result:TerrainMesh={neutral:[],grass:[],forest:[],dirt:[],water:[],sidewalk:[]};
 const roadParts=map.corridors.map(c=>c.polygons).filter(p=>p.length);
 let occupied:MultiPolygon=roadParts.length?clipping.union(roadParts[0],...roadParts.slice(1)) as MultiPolygon:[];
 for(const kind of ['water','dirt','forest','grass'] as const){
  const parts=map.areas.filter(a=>a.kind===kind).map(a=>a.polygons).filter(p=>p.length);if(!parts.length)continue;
  const merged=clipping.intersection(clipping.union(parts[0],...parts.slice(1)),rect) as MultiPolygon;
  result[kind]=occupied.length?clipping.difference(merged,occupied) as MultiPolygon:merged;
  if(merged.length)occupied=occupied.length?clipping.union(occupied,merged) as MultiPolygon:merged;
 }
 const shoulders=map.roads.filter(r=>r.layer===0&&['residential','tertiary','living_street'].includes(r.kind)).flatMap(r=>r.points.slice(1).map((p,i)=>[capsule(r.points[i],p,r.width+2.4)] as MultiPolygon));
 if(shoulders.length){const joined=clipping.intersection(clipping.union(shoulders[0],...shoulders.slice(1)),rect) as MultiPolygon;result.sidewalk=occupied.length?clipping.difference(joined,occupied) as MultiPolygon:joined;if(result.sidewalk.length)occupied=occupied.length?clipping.union(occupied,result.sidewalk) as MultiPolygon:result.sidewalk;}
 result.neutral=occupied.length?clipping.difference(rect,occupied) as MultiPolygon:rect;
 return result;
}
