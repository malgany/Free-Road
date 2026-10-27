import type {GameMap} from './types';
import {getLocalMap,type Coordinates,type Progress} from './location';
import {validateMap} from './validation';

export interface CachedMap {key:string;savedAt:number;map:GameMap}
export interface MapStore {get(key:string):Promise<CachedMap|undefined>;put(entry:CachedMap):Promise<void>;clear():Promise<void>}
export function mapKey(center:Coordinates){return `v4:${center.lat.toFixed(3)}:${center.lon.toFixed(3)}`;}
export function snappedCenter(center:Coordinates):Coordinates{return {lat:Number(center.lat.toFixed(3)),lon:Number(center.lon.toFixed(3))};}
export class BrowserMapStore implements MapStore {
  persistent=false; private opening?:Promise<IDBDatabase|null>;
  private open(){
    return this.opening??=new Promise<IDBDatabase|null>(resolve=>{
      try{
        if(typeof indexedDB==='undefined'){resolve(null);return;}
        const req=indexedDB.open('rua-livre-mapas',1);
        req.onupgradeneeded=()=>req.result.createObjectStore('regions',{keyPath:'key'});
        req.onsuccess=()=>{this.persistent=true;resolve(req.result);};
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
      const all=store.getAll();all.onsuccess=()=>{const rows=(all.result as CachedMap[]).sort((a,b)=>b.savedAt-a.savedAt);for(const [index,old] of rows.entries())if(index>=64||Date.now()-old.savedAt>30*24*3600*1000)store.delete(old.key);};
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
  private remember(entry:CachedMap){this.memory.delete(entry.key);this.memory.set(entry.key,entry);while(this.memory.size>8)this.memory.delete(this.memory.keys().next().value!);}
  async clear(){this.memory.clear();await this.store.clear();}
}
