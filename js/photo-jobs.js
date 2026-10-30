// Bound decoded-photo retention without imposing a report photo-count limit.
export const SHARE_BATCH_SIZE=20;
export function checkJob(signal){if(signal?.aborted)throw new DOMException('Cancelled. No incomplete output was published.','AbortError');}
export async function yieldJob(signal){checkJob(signal);await new Promise(r=>setTimeout(r,0));checkJob(signal);}
export function photoBatches(records,size=SHARE_BATCH_SIZE){
  if(!Number.isSafeInteger(size)||size<1)throw Error('Invalid batch size.');
  const batches=[];for(let i=0;i<records.length;i+=size)batches.push({records:records.slice(i,i+size),start:i,end:Math.min(i+size,records.length),total:records.length});return batches;
}
export function photoReader(records,load,{signal,onProgress,chunkSize=8}={}){
  const by=new Map();for(const r of records){if(!by.has(r.report))by.set(r.report,[]);by.get(r.report).push(r.item);}
  let cache=new Map(),cachedReport=null,loaded=0;
  const reader=async(report,items)=>{
    const result=new Map();for(const item of items){
      checkJob(signal);
      if(cachedReport!==report||!cache.has(item.no)){
        const list=by.get(report)||items,index=list.findIndex(x=>x.no===item.no),chunk=list.slice(Math.max(0,index),Math.max(0,index)+chunkSize);
        cache.clear();cachedReport=report;onProgress?.(`Reading photos… ${loaded}/${records.length} · ${report.ref}`);await yieldJob(signal);
        try{cache=await load(report,chunk,{signal});}catch(e){if(e.name==='AbortError')throw e;throw Error(`Photo unavailable: ${report.ref} #${chunk.map(x=>x.no).join(', #')}. ${e.message} Reconnect the folder and retry.`);}checkJob(signal);
        for(const requested of chunk)if(!cache.get(requested.no)?.url)throw Error(`Photo unavailable: ${report.ref} #${requested.no}. Reconnect the folder, retry, or explicitly exclude this photo.`);
        loaded+=chunk.length;
      }
      const image=cache.get(item.no);if(!image?.url)throw Error(`Photo unavailable: ${report.ref} #${item.no}.`);result.set(item.no,image);
    }
    return result;
  };
  reader.clear=()=>{cache.clear();cachedReport=null;};return reader;
}
