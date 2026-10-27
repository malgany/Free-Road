import MapWorker from './map.worker?worker&inline';
import {getLocalMap,type Coordinates,type Progress} from './location';
import type {GameMap} from './types';
let worker:Worker|null=null,sequence=0;
const jobs=new Map<number,{resolve:(map:GameMap)=>void;reject:(e:Error)=>void;cleanup:()=>void}>();
export async function loadMapInWorker(center:Coordinates,progress:Progress=()=>{},_fetcher:typeof fetch=fetch,signal?:AbortSignal):Promise<GameMap>{
  signal?.throwIfAborted();
  if(!worker){
    try{
      worker=new MapWorker();
      worker.onmessage=({data})=>{const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);job.cleanup();if(data.error)job.reject(data.aborted?new DOMException('Cancelado','AbortError'):new Error(data.error));else job.resolve(data.map);};
      worker.onerror=()=>{for(const job of jobs.values()){job.cleanup();job.reject(new Error('A preparação do mapa foi interrompida. Tente novamente.'));}jobs.clear();worker?.terminate();worker=null;};
    }catch{return getLocalMap(center,progress,_fetcher,signal);}
  }
  progress('Buscando e preparando ruas e construções…');
  return new Promise((resolve,reject)=>{const id=++sequence;
    const abort=()=>{worker?.postMessage({id,cancel:true});jobs.delete(id);reject(new DOMException('Cancelado','AbortError'));};
    jobs.set(id,{resolve,reject,cleanup:()=>signal?.removeEventListener('abort',abort)});signal?.addEventListener('abort',abort,{once:true});worker!.postMessage({id,center});
  });
}
