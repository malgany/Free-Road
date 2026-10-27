import type {GameMap,Point} from './types';
import {distance} from './geometry';
export function nearbyRegion(map:GameMap,p:Point){
  let best=Infinity,name='';
  for(const place of map.places??[]){const radius=['city','town','village'].includes(place.kind)?8000:place.kind==='suburb'?2000:700;const d=distance(p,place.point);const priority=radius===8000?3:radius===2000?1:0;const score=priority+d/radius;if(d<radius&&score<best){best=score;name=place.name;}}
  return name;
}
export class StableName {
  value='';private pending='';private since=0;
  update(name:string,now:number){if(name!==this.pending){this.pending=name;this.since=now;}if(this.value!==name&&now-this.since>=800){this.value=name;return true;}return false;}
}
