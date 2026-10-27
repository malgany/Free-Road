import type {Point,Ring,Polygon,MultiPolygon} from './types';
export const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export const wrapAngle=(x:number)=>Math.atan2(Math.sin(x),Math.cos(x));
export const lerpAngle=(a:number,b:number,t:number)=>a+wrapAngle(b-a)*t;
export const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function closest(p:Point,a:Point,b:Point):Point {
  const dx=b[0]-a[0], dz=b[1]-a[1], d=dx*dx+dz*dz;
  const t=d?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/d,0,1):0;
  return [a[0]+dx*t,a[1]+dz*t];
}
export function pointInRing(p:Point,r:Ring):boolean {
  let inside=false;
  for(let i=0,j=r.length-1;i<r.length;j=i++) {
    const a=r[i],b=r[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  } return inside;
}
export const inPolygon=(p:Point,poly:Polygon)=>pointInRing(p,poly[0]) && !poly.slice(1).some(h=>pointInRing(p,h));
export const inMulti=(p:Point,m:MultiPolygon)=>m.some(poly=>inPolygon(p,poly));
export function ringArea(r:Ring):number {return r.reduce((s,a,i)=>{const b=r[(i+1)%r.length];return s+a[0]*b[1]-b[0]*a[1]},0)/2;}
export function cross(a:Point,b:Point,c:Point):number {return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
export function intersects(a:Point,b:Point,c:Point,d:Point):boolean {
  return cross(a,b,c)*cross(a,b,d)<-1e-10 && cross(c,d,a)*cross(c,d,b)<-1e-10;
}
export function validRing(r:Ring):boolean {
  if(r.length<4 || distance(r[0],r[r.length-1])>0.001 || Math.abs(ringArea(r))<0.02 || r.some(p=>p.some(v=>!Number.isFinite(v)))) return false;
  for(let i=1;i<r.length;i++) for(let j=i+2;j<r.length;j++) if(intersects(r[i-1],r[i],r[j-1],r[j])) return false;
  return true;
}
export function circle(p:Point,r:number,n=20):Ring {return Array.from({length:n+1},(_,i)=>[p[0]+Math.cos(i/n*Math.PI*2)*r,p[1]+Math.sin(i/n*Math.PI*2)*r]);}
export function capsule(a:Point,b:Point,width:number):Polygon {
  const angle=Math.atan2(b[1]-a[1],b[0]-a[0]); const r=width/2; const ring:Ring=[];
  for(let i=0;i<=10;i++){const t=angle-Math.PI/2+i/10*Math.PI;ring.push([b[0]+Math.cos(t)*r,b[1]+Math.sin(t)*r]);}
  for(let i=0;i<=10;i++){const t=angle+Math.PI/2+i/10*Math.PI;ring.push([a[0]+Math.cos(t)*r,a[1]+Math.sin(t)*r]);}
  ring.push(ring[0]);return [ring];
}
export function seeded(seed:number) {return ()=>{seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
export function boundsOf(polygons:MultiPolygon){const all=polygons.flat(2);return {minX:Math.min(...all.map(p=>p[0])),maxX:Math.max(...all.map(p=>p[0])),minZ:Math.min(...all.map(p=>p[1])),maxZ:Math.max(...all.map(p=>p[1]))};}
