import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {boundedArea,readCurrentPosition,getLocalMap,type PositionProvider} from '../src/location';
import {prepare,type OSMElement} from '../src/importer';
const center={lat:38.5449,lon:-121.7405};
const fixture=JSON.parse(readFileSync('data/raw/davis.osm.json','utf8'));
const answer=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('localização solicitada usa o resultado do navegador e não inicia acompanhamento',async()=>{
  let opts:PositionOptions|undefined;
  const geo={getCurrentPosition:(success:PositionCallback,_error:PositionErrorCallback|null,options:PositionOptions)=>{opts=options;success({coords:{latitude:center.lat,longitude:center.lon,accuracy:12}} as GeolocationPosition);}} as PositionProvider;
  const result=await readCurrentPosition(geo);assert.deepEqual(result,{center,accuracy:12});assert.equal(opts?.enableHighAccuracy,true);assert.equal(opts?.timeout,20000);
});
test('negação e indisponibilidade de geolocalização oferecem alternativa',async()=>{
  await assert.rejects(()=>readCurrentPosition(undefined),/coordenadas/);
  const geo={getCurrentPosition:(_ok:PositionCallback,error:PositionErrorCallback)=>error({code:1,message:'denied'} as GeolocationPositionError)} as PositionProvider;
  await assert.rejects(()=>readCurrentPosition(geo),/negada/);
});
test('erro de rede e cancelamento não são confundidos com dados válidos',async()=>{
  const offline=async()=>{throw new TypeError('offline');};
  await assert.rejects(()=>getLocalMap(center,()=>{},offline as typeof fetch),/conectar ao OpenStreetMap/);
  const controller=new AbortController();controller.abort();const canceled=async(_url:unknown,options?:RequestInit)=>{assert(options?.signal?.aborted);throw new DOMException('Cancelado','AbortError');};
  await assert.rejects(()=>getLocalMap(center,()=>{},canceled as typeof fetch,controller.signal),e=>e instanceof DOMException&&e.name==='AbortError');
});
test('limites respeitam latitude, longitude e tamanho',()=>{
  const [west,south,east,north]=boundedArea(center,700);assert(west<center.lon&&east>center.lon&&south<center.lat&&north>center.lat);
  assert.throws(()=>boundedArea({lat:91,lon:0},700),/inválidas/);assert.throws(()=>boundedArea({lat:0,lon:179.9999},700),/linha internacional/);
});
test('área obtida sob demanda gera mapa local com origem e spawn próximos',async()=>{
  const urls:string[]=[],progress:string[]=[];const f=async(input:string|URL|Request)=>{urls.push(String(input));return answer(structuredClone(fixture));};
  const map=await getLocalMap(center,m=>progress.push(m),f as typeof fetch);
  assert.equal(urls.length,1);assert.match(urls[0],/^https:\/\/api\.openstreetmap\.org\/api\/0\.6\/map\.json\?bbox=/);
  assert.equal(map.name,'Sua região');assert.deepEqual(map.origin,center);assert(Math.hypot(map.spawn.x,map.spawn.z)<15);assert(map.roads.length>20);assert(progress.some(m=>m.includes('Preparando')));
});
test('reduz área quando o serviço rejeita o recorte denso',async()=>{
  let calls=0;const f=async()=>++calls===1?answer({},400):answer(structuredClone(fixture));
  const map=await getLocalMap(center,()=>{},f as typeof fetch);assert.equal(calls,2);assert.equal(map.provenance.size,450);
});
test('completa relação multipolígono ausente antes de gerar o mapa',async()=>{
  const raw=structuredClone(fixture),relation=raw.elements.find((e:any)=>e.type==='relation'&&e.id===6099243),ref=relation.members.find((m:any)=>m.type==='way').ref;
  const missing=raw.elements.find((e:any)=>e.type==='way'&&e.id===ref);raw.elements=raw.elements.filter((e:any)=>!(e.type==='way'&&e.id===ref));
  const urls:string[]=[];const f=async(input:string|URL|Request)=>{const url=String(input);urls.push(url);return answer(url.includes('/relation/')?{elements:[missing]}:raw);};
  const map=await getLocalMap(center,()=>{},f as typeof fetch);assert.equal(urls.length,2);assert(map.areas.some(a=>a.id==='relation/6099243'));
});
test('recorte dinâmico omite túnel e via elevada que cruza outra via',()=>{
  const nodes=[{type:'node',id:1,lat:0,lon:-.0005},{type:'node',id:2,lat:0,lon:.0005},{type:'node',id:3,lat:-.0005,lon:0},{type:'node',id:4,lat:.0005,lon:0}];
  const ways:OSMElement[]=[{type:'way',id:1,nodes:[1,2],tags:{highway:'residential'}},{type:'way',id:2,nodes:[3,4],tags:{highway:'primary',layer:'1',bridge:'yes'}},{type:'way',id:3,nodes:[1,2],tags:{highway:'primary',tunnel:'yes'}}];
  const map=prepare({elements:[...nodes,...ways]},{name:'teste',center:{lat:0,lon:0},size:700,excludeUnsupported:true,spawnNearOrigin:true});
  assert.deepEqual(map.roads.map(r=>r.id),['way/1']);assert(map.diagnostics.some(d=>d.includes('túnel')));assert(map.diagnostics.some(d=>d.includes('sobreposta')));
});
