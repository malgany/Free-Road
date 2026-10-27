import test from 'node:test';import assert from 'node:assert/strict';
import {MapCache,mapKey,type MapStore,type CachedMap} from '../src/map-cache';
import {expansionTarget,rebaseMap,unproject} from '../src/streaming';
import {project,prepare} from '../src/importer';import {makeTestMap} from '../src/test-map';import {initialState} from '../src/vehicle';
import {CollisionWorld} from '../src/collision';
import {validateMap} from '../src/validation';

class MemoryStore implements MapStore {
  entries=new Map<string,CachedMap>();async get(key:string){return structuredClone(this.entries.get(key));}
  async put(row:CachedMap){this.entries.set(row.key,structuredClone(row));}async clear(){this.entries.clear();}
}
test('cache evita consulta repetida, inclusive em outra sessão, e entrega cópias isoladas',async()=>{
  const store=new MemoryStore();let requests=0;const loader=async()=>{requests++;return makeTestMap();};
  const first=new MapCache(store,loader),center={lat:0,lon:0};
  const a=await first.get(center);assert.equal(a.cached,false);a.map.roads=[];
  const b=await first.get(center);assert.equal(b.cached,true);assert(b.map.roads.length>0);
  const second=new MapCache(store,loader);assert.equal((await second.get(center)).cached,true);assert.equal(requests,1);
  await second.clear();assert.equal((await second.get(center)).cached,false);assert.equal(requests,2);
});
test('cache expirado, inválido e armazenamento bloqueado não impedem jogar',async()=>{
  const store=new MemoryStore(),center={lat:0,lon:0};let requests=0;const loader=async()=>{requests++;return makeTestMap();};
  await store.put({key:mapKey(center),savedAt:0,map:makeTestMap()});await new MapCache(store,loader).get(center);assert.equal(requests,1);
  const invalid=makeTestMap();invalid.spawn.x=1e8;await store.put({key:mapKey(center),savedAt:Date.now(),map:invalid});await new MapCache(store,loader).get(center);assert.equal(requests,2);
  const denied:MapStore={get:async()=>{throw Error('denied');},put:async()=>{throw Error('quota');},clear:async()=>{}};
  const fallback=new MapCache(denied,loader);await fallback.get(center);assert.equal((await fallback.get(center)).cached,true);assert.equal(requests,3);
});
test('cancelamento não instala nem salva resultado; falha de rede não envenena cache',async()=>{
  const store=new MemoryStore(),controller=new AbortController();
  const cache=new MapCache(store,async()=>{controller.abort();return makeTestMap();});
  await assert.rejects(cache.get({lat:0,lon:0},()=>{},controller.signal),{name:'AbortError'});assert.equal(store.entries.size,0);
  await assert.rejects(new MapCache(store,async()=>{throw Error('offline');}).get({lat:0,lon:0}),/offline/);assert.equal(store.entries.size,0);
});
test('projeção inversa mantém ruas, polígonos e colisões alinhados entre recortes',()=>{
  const origin={lat:-15.601,lon:-56.097},geo={lat:-15.598,lon:-56.094};
  const p=project(geo.lat,geo.lon,origin,1.15),back=unproject(p,origin,1.15);assert(Math.abs(back.lat-geo.lat)<1e-7);assert(Math.abs(back.lon-geo.lon)<1e-7);
  const source=makeTestMap();source.origin=geo;
  const map=rebaseMap(source,origin),road=source.roads[0].points[0],absolute=unproject(road,geo),expected=project(absolute.lat,absolute.lon,origin);
  assert.deepEqual(map.roads[0].points[0],expected);
  assert.deepEqual(map.graph.nodes['100@0'],expected);assert.equal(new CollisionWorld(map).hit(map.spawn.x,map.spawn.z,map.spawn.heading),null);
  assert.deepEqual(source.origin,geo);assert.notDeepEqual(map.bounds,source.bounds);
});
test('expansão antecipa borda conforme velocidade e não consulta no centro ou ao se afastar',()=>{
  const map=makeTestMap();map.bounds={minX:-400,maxX:400,minZ:-400,maxZ:400};
  const s=initialState({x:0,z:0,heading:Math.PI/2});s.vx=s.speed=55;assert.equal(expansionTarget(map,s),null);
  s.x=150;const target=expansionTarget(map,s);assert(target&&target.lon>0);
  s.vx=-55;assert.equal(expansionTarget(map,s),null);
  s.x=397;s.vx=0;assert(expansionTarget(map,s));
});
test('fragmento de edifício menor que 0,02 m² na borda não bloqueia uma expansão',()=>{
  const center={lat:38.549,lon:-121.741};
  const positions:[number,number][]=[[-10,0],[10,0],[402.393,-373.287],[410,-376.39],[410,-353.45]];
  const nodes=positions.map((p,i)=>({type:'node',id:i+1,...unproject(p,center,1.15)}));
  const map=prepare({elements:[...nodes,{type:'way',id:1,nodes:[1,2],tags:{highway:'residential'}},{type:'way',id:392698321,nodes:[3,4,5,3],tags:{building:'yes'}}]}, {name:'Regressão de borda',center,size:700,spawnNearOrigin:true});
  validateMap(map);assert.equal(map.areas.length,0);assert(map.roads.length>0);
});
