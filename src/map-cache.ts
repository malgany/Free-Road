import type {GameMap} from './types';
import {getLocalMap,type Coordinates,type Progress} from './location';
export const CACHE_BYTES=32*1024*1024,CACHE_REGIONS=32;
export function cacheEvictions(rows:CachedMap[],now=Date.now()){
  let bytes=0,count=0;const remove:string[]=[];
  for(const row of [...rows].sort((a,b)=>b.savedAt-a.savedAt)){
    const size=new TextEncoder().encode(JSON.stringify(row)).byteLength;
    if(now-row.savedAt>30*24*3600*1000||count>=CACHE_REGIONS||bytes+size>CACHE_BYTES)remove.push(row.key);
    else{bytes+=size;count++;}
  }return remove;
}

export interface CachedMap {key:string;savedAt:number;map:GameMap}
export interface MapStore {get(key:string):Promise<CachedMap|undefined>;put(entry:CachedMap):Promise<void>;clear():Promise<void>}
export function mapKey(center:Coordinates){return `v5:${center.lat.toFixed(3)}:${center.lon.toFixed(3)}`;}
export function snappedCenter(center:Coordinates):Coordinates{return {lat:Number(center.lat.toFixed(3)),lon:Number(center.lon.toFixed(3))};}
export class BrowserMapStore implements MapStore {
  persistent=false; private opening?:Promise<IDBDatabase|null>;
  private open(){
    return this.opening??=new Promise<IDBDatabase|null>(resolve=>{
      try{
        if(typeof indexedDB==='undefined'){resolve(null);return;}
        const req=indexedDB.open('rua-livre-mapas',1);
        req.onupgradeneeded=()=>req.result.createObjectStore('regions',{keyPath:'key'});
        req.onsuccess=()=>{
          const db=req.result;this.persistent=true;
          // Enforce the current budget on old caches too, before the first read.
          const tx=db.transaction('regions','readwrite'),store=tx.objectStore('regions'),all=store.getAll();
          all.onsuccess=()=>{for(const key of cacheEvictions(all.result))store.delete(key);};
          tx.oncomplete=()=>resolve(db);tx.onerror=tx.onabort=()=>{this.persistent=false;resolve(null);};
        };
        req.onerror=req.onblocked=()=>resolve(null);
      }catch{resolve(null);}
    });
  }
  async get(key:string){const db=await this.open();if(!db)return;
    return new Promise<CachedMap|undefined>((resolve,reject)=>{const request=db.transaction('regions').objectStore('regions').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  }
  async put(entry:CachedMap){const db=await this.open();if(!db)return;
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('regions','readwrite'),store=tx.objectStore('regions');store.put(entry);
      const all=store.getAll();all.onsuccess=()=>{for(const key of cacheEvictions(all.result))store.delete(key);};
      tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>{this.persistent=false;reject(tx.error);};
    });
  }
  async clear(){const db=await this.open();if(!db)return;
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('regions','readwrite');tx.objectStore('regions').clear();tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);});
  }
}
export class MapCache {
  private memory=new Map<string,CachedMap>();
  constructor(public store:MapStore=new BrowserMapStore(),private loader=getLocalMap){}
  async get(center:Coordinates,progress:Progress=()=>{},signal?:AbortSignal){
    const snapped=snappedCenter(center),key=mapKey(snapped);
    signal?.throwIfAborted();
    let saved=this.memory.get(key);
    if(!saved){try{saved=await this.store.get(key);}catch{/* Storage may be denied; retain a session cache. */}}
    signal?.throwIfAborted();
    if(saved&&Date.now()-saved.savedAt<30*24*3600*1000){
      try{if(saved.map.schemaVersion!==1||!saved.map.roads?.length||!saved.map.areas||!Number.isFinite(saved.map.spawn.x)||saved.map.spawn.x<saved.map.bounds.minX||saved.map.spawn.x>saved.map.bounds.maxX)throw new Error('Cache inválido');this.remember(saved);progress('Trecho recuperado do cache local.');return {map:structuredClone(saved.map),cached:true};}catch{/* Ignore corrupt or obsolete records. */}
    }
    const map=await this.loader(snapped,progress,fetch,signal);signal?.throwIfAborted();
    // Decorative random rocks would relocate between windows; real OSM obstacles remain.
    map.rocks=[];
    const entry={key,savedAt:Date.now(),map};this.remember(entry);
    try{await this.store.put(entry);}catch{/* Quota/private mode: session cache still works. */}
    signal?.throwIfAborted();return {map:structuredClone(map),cached:false};
  }
  private remember(entry:CachedMap){this.memory.delete(entry.key);this.memory.set(entry.key,entry);while(this.memory.size>4)this.memory.delete(this.memory.keys().next().value!);}
  async clear(){this.memory.clear();await this.store.clear();}
}
