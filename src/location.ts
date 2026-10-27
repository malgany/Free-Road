import {prepare,type OSMElement,type Provenance,type RawOSM} from './importer';
import {validateMap} from './validation';
import type {GameMap} from './types';

export interface Coordinates {lat:number;lon:number}
export type Progress=(message:string)=>void;
export type PositionProvider=Pick<Geolocation,'getCurrentPosition'>;

export function readCurrentPosition(geolocation:PositionProvider|undefined):Promise<{center:Coordinates;accuracy:number}>{
  if(!geolocation)return Promise.reject(new Error('Este navegador não oferece localização. Use as coordenadas ou abra o jogo no Chrome ou Edge.'));
  return new Promise((resolve,reject)=>geolocation.getCurrentPosition(
    p=>resolve({center:{lat:p.coords.latitude,lon:p.coords.longitude},accuracy:p.coords.accuracy}),
    e=>reject(new Error(e.code===1?'Permissão de localização negada. Libere a localização no navegador e no sistema, ou informe coordenadas.':e.code===3?'A localização demorou demais. Tente novamente ou informe coordenadas.':'Não foi possível determinar a localização. Confira o serviço de localização ou informe coordenadas.')),
    {enableHighAccuracy:true,timeout:20000,maximumAge:30000},
  ));
}
export function boundedArea(center:Coordinates,size:number):[number,number,number,number]{
  if(!Number.isFinite(center.lat)||!Number.isFinite(center.lon)||Math.abs(center.lat)>85||Math.abs(center.lon)>180||!Number.isFinite(size)||size<100||size>1000)throw new Error('Coordenadas inválidas ou fora da área suportada.');
  const dLat=size/2/111320,dLon=dLat/Math.cos(center.lat*Math.PI/180);
  const bbox:[number,number,number,number]=[center.lon-dLon,center.lat-dLat,center.lon+dLon,center.lat+dLat];
  if(bbox[0]<-180||bbox[2]>180)throw new Error('Este recorte cruza a linha internacional de data, ainda não suportada.');
  return bbox;
}
const OSM='https://api.openstreetmap.org/api/0.6';
async function json(fetcher:typeof fetch,url:string,signal?:AbortSignal):Promise<RawOSM>{
  let response:Response;
  try{response=await fetcher(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000),credentials:'omit',cache:'no-store'});}catch(e){if(signal?.aborted)throw new DOMException('Cancelado','AbortError');throw new Error('Não foi possível conectar ao OpenStreetMap. Confira a internet e tente novamente.');}
  if(!response.ok)throw Object.assign(new Error(`O OpenStreetMap respondeu ${response.status}. Tente novamente em instantes.`),{status:response.status});
  const raw=await response.json() as RawOSM;
  if(!Array.isArray(raw.elements)||raw.remark)throw new Error('O OpenStreetMap retornou dados incompletos para esta região.');
  return raw;
}
export async function getLocalMap(center:Coordinates,progress:Progress=()=>{},fetcher:typeof fetch=fetch,signal?:AbortSignal):Promise<GameMap>{
  let size=700,raw:RawOSM|undefined,bbox:[number,number,number,number]=boundedArea(center,size);
  for(const candidate of [700,450,250]){
    size=candidate;bbox=boundedArea(center,size);progress(`Buscando ruas em uma área de ${size} m…`);
    try{raw=await json(fetcher,`${OSM}/map.json?bbox=${bbox.join(',')}`,signal);}catch(e){if((e as {status?:number}).status===400&&candidate!==250)continue;throw e;}
    if(raw.elements.length<=24000||candidate===250)break;
    raw=undefined;
  }
  if(!raw)throw new Error('Não foi possível obter um recorte utilizável desta região.');
  if(raw.elements.length>30000)throw new Error('Esta região possui detalhes demais para o protótipo. Tente um ponto próximo.');
  const elements=raw.elements,present=new Set(elements.map(e=>`${e.type}/${e.id}`)),ways=new Map(elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
  const relevant=elements.filter(e=>e.type==='relation'&&e.tags?.type==='multipolygon'&&(e.tags.building||e.tags['building:part']||e.tags.natural||e.tags.landuse||e.tags.leisure==='park'));
  const incomplete=relevant.filter(r=>(r.members??[]).some(m=>m.type==='way'&&(!ways.has(m.ref)||ways.get(m.ref)!.nodes?.some(n=>!present.has(`node/${n}`)))));
  if(incomplete.length>12)throw new Error('Esta região contém relações complexas demais. Tente um ponto próximo.');
  if(incomplete.length)progress('Completando contornos do mapa…');
  for(const r of incomplete){
    const full=await json(fetcher,`${OSM}/relation/${r.id}/full.json`,signal);
    for(const e of full.elements)if(!present.has(`${e.type}/${e.id}`)){elements.push(e);present.add(`${e.type}/${e.id}`);}
  }
  progress('Preparando ruas e construções…');
  await new Promise<void>(resolve=>setTimeout(resolve,30)); // paint progress before the geometry work
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
  const meta:Provenance={name:'Sua região',center,size,bbox,endpoint:OSM,collectedAt:new Date().toISOString(),license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',url:'https://www.openstreetmap.org/copyright',source:'localização solicitada nesta sessão',spawnNearOrigin:true,excludeUnsupported:true,fillUnmappedBuildings:true};
  const result=prepare(raw,meta);validateMap(result);return result;
}
