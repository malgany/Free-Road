import {getLocalMap} from './location';
const controllers=new Map<number,AbortController>();
self.onmessage=async(event)=>{
  const {id,center,cancel}=event.data;
  if(cancel){controllers.get(id)?.abort();return;}
  const controller=new AbortController();controllers.set(id,controller);
  try{const map=await getLocalMap(center,()=>{},fetch,controller.signal);self.postMessage({id,map});}
  catch(e){self.postMessage({id,error:e instanceof Error?e.message:String(e),aborted:controller.signal.aborted});}
  finally{controllers.delete(id);}
};
