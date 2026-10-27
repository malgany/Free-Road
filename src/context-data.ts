import type {Coordinates} from './location';
export interface Weather {temperature:number;rain:number;cloud:number;fog:boolean;label:string;at:number}
export interface Discovery {id:number;title:string;lat:number;lon:number;url:string}
async function request(url:string,fetcher=fetch,signal?:AbortSignal){const response=await fetcher(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000),credentials:'omit'});if(!response.ok)throw new Error('O serviço está indisponível. Tente novamente mais tarde.');return response.json();}
export class ContextData {
 private cache=new Map<string,{at:number;value:unknown}>();
 constructor(){try{const rows=JSON.parse(sessionStorage.getItem('free-road-context')??'[]');if(Array.isArray(rows))for(const [key,row] of rows.slice(-6))if(typeof key==='string'&&row?.at&&Date.now()-row.at<900000)this.cache.set(key,row);}catch{}}
 private save(key:string,value:unknown){this.cache.set(key,{at:Date.now(),value});while(this.cache.size>6)this.cache.delete(this.cache.keys().next().value!);try{const json=JSON.stringify([...this.cache]);if(new TextEncoder().encode(json).byteLength<32768)sessionStorage.setItem('free-road-context',json);}catch{}}
 async weather(center:Coordinates,signal?:AbortSignal,fetcher=fetch):Promise<Weather>{
  const lat=center.lat.toFixed(2),lon=center.lon.toFixed(2),key=`weather:${lat},${lon}`,cached=this.cache.get(key);if(cached&&Date.now()-cached.at<900000)return cached.value as Weather;
  const raw=await request(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,cloud_cover,weather_code`,fetcher,signal),c=raw.current;
  if(!c||![c.temperature_2m,c.precipitation,c.cloud_cover,c.weather_code].every(Number.isFinite))throw new Error('Clima sem dados válidos.');
  const fog=[45,48].includes(c.weather_code),rain=Math.max(0,Math.min(1,c.precipitation/4));const value={temperature:c.temperature_2m,rain,cloud:Math.max(0,Math.min(1,c.cloud_cover/100)),fog,label:fog?'Neblina':rain>.02?'Chuva':c.cloud_cover>65?'Nublado':'Céu aberto',at:Date.now()};this.save(key,value);return value;
 }
 async discoveries(center:Coordinates,signal?:AbortSignal,fetcher=fetch):Promise<Discovery[]>{
  const lat=center.lat.toFixed(3),lon=center.lon.toFixed(3),key=`wiki:${lat},${lon}`,cached=this.cache.get(key);if(cached&&Date.now()-cached.at<900000)return cached.value as Discovery[];
  const raw=await request(`https://pt.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lon}&gsradius=1000&gslimit=8&format=json&origin=*`,fetcher,signal);
  if(raw.error?.code==='cirrussearch-too-busy-error')throw new Error('A Wikipédia está ocupada. Tente novamente mais tarde.');
  if(!Array.isArray(raw.query?.geosearch))throw new Error('Não foi possível consultar os lugares próximos.');
  const value:Discovery[]=raw.query.geosearch.filter((p:any)=>Number.isSafeInteger(p.pageid)&&typeof p.title==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)).slice(0,8).map((p:any)=>({id:p.pageid,title:p.title.slice(0,180),lat:p.lat,lon:p.lon,url:`https://pt.wikipedia.org/?curid=${p.pageid}`}));this.save(key,value);return value;
 }
}
