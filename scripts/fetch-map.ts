import { mkdir, writeFile } from 'node:fs/promises';
const center = {lat:38.5449, lon:-121.7405};
const size = 700;
const dLat=size/2/111320, dLon=dLat/Math.cos(center.lat*Math.PI/180);
const bbox=[center.lat-dLat,center.lon-dLon,center.lat+dLat,center.lon+dLon];
const filters=['[highway]','[building]','[natural=water]','[landuse]','[leisure=park]'];
const query=`[out:json][timeout:60];(${filters.map(f=>`way${f}(${bbox.join(',')});relation[type=multipolygon]${f}(${bbox.join(',')});`).join('')});(._;>;);out body;`;
const endpoint='https://api.openstreetmap.org/api/0.6/map.json';
const requestUrl=`${endpoint}?bbox=${[bbox[1],bbox[0],bbox[3],bbox[2]].join(',')}`;
console.log('Baixando uma única amostra pública de Davis (700 m) pela API OSM...');
const response=await fetch(requestUrl,{headers:{'User-Agent':'RuaLivrePrototype/1.0 (one-off public sample preparation; local desktop development)','Accept':'application/json'},signal:AbortSignal.timeout(60000)});
if(!response.ok) throw new Error(`OSM ${response.status}; tente novamente mais tarde, sem consultas repetidas.`);
const raw=await response.json();
if(!Array.isArray(raw.elements) || raw.remark) throw new Error('Resposta OSM incompleta: '+raw.remark);
// The bounding-box API may include only part of a relation. Complete relevant multipolygons,
// once per relation, while still preparing data offline (never during gameplay).
const extraRequests:string[]=[];
const relevant=raw.elements.filter((e:any)=>e.type==='relation'&&e.tags?.type==='multipolygon'&&(e.tags.building||e.tags.natural==='water'||e.tags.landuse||e.tags.leisure==='park'));
if(relevant.length>30)throw new Error('Muitas relações: escolha um recorte mais simples.');
for(const relation of relevant){
  const ids=new Set(raw.elements.filter((e:any)=>e.type==='way').map((e:any)=>e.id));
  if(!relation.members.some((m:any)=>m.type==='way'&&!ids.has(m.ref)))continue;
  const url=`https://api.openstreetmap.org/api/0.6/relation/${relation.id}/full.json`;
  const res=await fetch(url,{headers:{'User-Agent':'RuaLivrePrototype/1.0'},signal:AbortSignal.timeout(60000)});
  if(!res.ok)throw new Error(`Relação ${relation.id} incompleta (${res.status})`);
  const full=await res.json(),present=new Set(raw.elements.map((e:any)=>`${e.type}/${e.id}`));
  for(const e of full.elements)if(!present.has(`${e.type}/${e.id}`)){raw.elements.push(e);present.add(`${e.type}/${e.id}`);}
  extraRequests.push(url);
}
await mkdir('data/raw',{recursive:true});
await writeFile('data/raw/davis.osm.json',JSON.stringify(raw,null,2)+'\n');
await writeFile('data/raw/provenance.json',JSON.stringify({name:'Davis · Califórnia',center,size,bbox,endpoint,requestUrl,extraRequests,overpassEquivalentQuery:query,collectedAt:new Date().toISOString(),license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',url:'https://www.openstreetmap.org/copyright'},null,2)+'\n');
console.log(`Salvos ${raw.elements.length} elementos. Use npm run map:build.`);
