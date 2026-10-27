import clipping from 'polygon-clipping';
import type {GameMap,Point,MultiPolygon} from './types';
import {distance,closest} from './geometry';

/** Illustrative houses only in road regions with practically no mapped buildings. */
export function fillMissingBuildings(map:GameMap){
  if(map.areas.filter(a=>a.kind==='building').length>=3)return;
  const b=map.bounds;let count=0;
  for(const road of map.roads){
    if(!['residential','living_street','unclassified','tertiary','secondary'].includes(road.kind))continue;
    for(let j=1;j<road.points.length&&count<48;j++){
      const a=road.points[j-1],p=road.points[j],len=distance(a,p);if(len<20)continue;
      const dx=(p[0]-a[0])/len,dz=(p[1]-a[1])/len;
      for(let along=18;along<len&&count<48;along+=54)for(const side of [-1,1]){
        if(count>=48)break;
        const x=a[0]+dx*along-dz*side*(road.width/2+12),z=a[1]+dz*along+dx*side*(road.width/2+12);
        if(x<b.minX+12||x>b.maxX-12||z<b.minZ+12||z>b.maxZ-12||Math.hypot(x-map.spawn.x,z-map.spawn.z)<15)continue;
        if(map.roads.some(r=>r.points.slice(1).some((q,i)=>distance([x,z],closest([x,z],r.points[i],q))<r.width/2+9)))continue;
        const ring:Point[]=[[-5,-4],[5,-4],[5,4],[-5,4],[-5,-4]].map(([u,v])=>[x+u*dx-v*dz,z+u*dz+v*dx]);
        const polygons:MultiPolygon=[[ring]];
        if(map.areas.some(area=>clipping.intersection(polygons,area.polygons).length))continue;
        map.areas.push({id:`illustrative/${road.id}/${j}/${along}/${side}`,kind:'building',height:3.2+(count%3)*0.6,layer:0,polygons,synthetic:true});count++;
      }
    }
    if(count>=48)break;
  }
  if(count)map.diagnostics.push(`${count} construções ilustrativas adicionadas onde não há implantações OSM suficientes; não representam imóveis reais.`);
}
