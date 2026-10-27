export interface RegionalStart<T> {map:T;demo:boolean;reason?:string}
/** One bounded attempt, then a bundled demo; cancellation never installs a late result. */
export async function regionalStart<T,P>(options:{position:()=>Promise<P>;load:(p:P,signal:AbortSignal)=>Promise<T>;demo:()=>Promise<T>;signal?:AbortSignal;timeoutMs?:number}):Promise<RegionalStart<T>>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{};
 try {
  const interruption=new Promise<never>((_,reject)=>{abort=()=>{controller.abort();reject(new DOMException('Cancelado','AbortError'));};if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{controller.abort();reject(new Error('A região demorou para responder.'));},options.timeoutMs??30000);});
  const loading=(async()=>{const p=await options.position();if(controller.signal.aborted)throw new DOMException('Cancelado','AbortError');return options.load(p,controller.signal);})();
  return {map:await Promise.race([loading,interruption]),demo:false};
 }catch(error){if(options.signal?.aborted)throw new DOMException('Cancelado','AbortError');return {map:await options.demo(),demo:true,reason:error instanceof Error?error.message:'Região indisponível.'};}
 finally{if(timer)clearTimeout(timer);options.signal?.removeEventListener('abort',abort);controller.abort();}
}
