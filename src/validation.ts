import type {GameMap} from './types';
import {validRing,intersects,closest,distance} from './geometry';
import {CollisionWorld} from './collision';
export function validateMap(value:unknown):asserts value is GameMap {
  const m=value as GameMap;
  if(!m||m.schemaVersion!==1||!Array.isArray(m.roads)||!Array.isArray(m.areas)||!Array.isArray(m.corridors)||!Array.isArray(m.rocks)||!m.bounds||!m.spawn||!m.graph)throw new Error('Mapa inválido ou versão não suportada. Regenere com npm run map:build.');
  if(![m.spawn.x,m.spawn.z,m.spawn.heading,...Object.values(m.bounds)].every(Number.isFinite)||m.bounds.maxX<=m.bounds.minX||m.bounds.maxZ<=m.bounds.minZ)throw new Error('Limites ou ponto de partida inválidos.');
  for(const a of m.areas)for(const p of a.polygons)for(const r of p)if(!validRing(r))throw new Error(`Polígono inválido: ${a.id}`);
  for(const r of m.roads)if(r.points.length<2||r.width<2||!Number.isFinite(r.width)||r.points.some(p=>p.length!==2||!p.every(Number.isFinite)))throw new Error(`Via inválida: ${r.id}`);
  if(m.roads.some(r=>r.tunnel))throw new Error('Amostra contém túnel. Este protótipo plano requer outro recorte.');
  // A separate bridge over water is supported, but a genuine stacked road network is explicitly rejected.
  for(let i=0;i<m.roads.length;i++)for(let j=i+1;j<m.roads.length;j++){
    const a=m.roads[i],b=m.roads[j];if(a.layer===b.layer)continue;
    if(a.points.slice(1).some((p,k)=>b.points.slice(1).some((q,l)=>intersects(a.points[k],p,b.points[l],q))))throw new Error(`Cruzamento viário em níveis sobrepostos não suportado: ${a.id} / ${b.id}`);
  }
  const world=new CollisionWorld(m);
  if(world.hit(m.spawn.x,m.spawn.z,m.spawn.heading))throw new Error('Ponto de partida bloqueado. Corrija o mapa antes de jogar.');
}
export function connectivityReport(m:GameMap){
  const adjacency=new Map<string,Set<string>>();
  for(const e of m.graph.edges){for(const [a,b] of [[e.from,e.to],[e.to,e.from]]){const s=adjacency.get(a)??new Set();s.add(b);adjacency.set(a,s);}}
  const seen=new Set<string>(),sizes:number[]=[];
  for(const key of adjacency.keys()){if(seen.has(key))continue;const todo=[key];seen.add(key);let n=0;while(todo.length){const a=todo.pop()!;n++;for(const b of adjacency.get(a)??[])if(!seen.has(b)){seen.add(b);todo.push(b);}}sizes.push(n);}
  return {nodes:seen.size,edges:m.graph.edges.length,components:sizes.sort((a,b)=>b-a),junctions:[...adjacency.values()].filter(s=>s.size>2).length};
}
