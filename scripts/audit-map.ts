import {readFileSync,writeFileSync} from 'node:fs';
import type {GameMap} from '../src/types';import {CollisionWorld} from '../src/collision';
const m=JSON.parse(readFileSync('public/maps/davis.json','utf8')) as GameMap,w=new CollisionWorld(m),failures:unknown[]=[];
for(const r of m.roads){let total=0,blocked=0;const ids=new Set<string>();for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),h=Math.atan2(b[0]-a[0],-(b[1]-a[1]));for(let t=0;t<=len;t+=2){const x=a[0]+(b[0]-a[0])*t/len,z=a[1]+(b[1]-a[1])*t/len;if(Math.abs(x)>m.bounds.maxX-4||Math.abs(z)>m.bounds.maxZ-4)continue;total++;const hit=w.hit(x,z,h);if(hit){blocked++;ids.add(hit.id);}}}if(blocked)failures.push({road:r.id,name:r.name,kind:r.kind,layer:r.layer,blocked,total,obstacles:[...ids]});}
console.log(JSON.stringify(failures,null,2));writeFileSync('docs/clearance-report.json',JSON.stringify({samplingMetres:2,failures},null,2));
if(failures.length)process.exitCode=1;
