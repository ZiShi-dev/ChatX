import { hashSession, readCookie } from './session.ts';

/** Bounded per-process protection; five people sharing a connection fit these bursts. */
export function createRequestBudget(now:()=>number) {
  const buckets = new Map<string,{count:number;expires:number}>();
  const consume = (key:string,limit:number) => {
    const at=now();
    let bucket=buckets.get(key);
    if(!bucket || bucket.expires<=at) {
      if(buckets.size>=2048)for(const [id,value] of buckets)if(value.expires<=at)buckets.delete(id);
      if(buckets.size>=2048)buckets.delete(buckets.keys().next().value!);
      bucket={count:0,expires:at+60000};buckets.set(key,bucket);
    }
    return ++bucket.count>limit ? Math.max(1,Math.ceil((bucket.expires-at)/1000)) : 0;
  };
  return (request:Request,ip:string) => {
    const general=consume('ip:'+ip,1200);if(general)return general;
    const path=new URL(request.url).pathname;
    if(path.startsWith('/api/auth/google'))return consume('auth:'+ip,30);
    if(path==='/api/links/preview')return consume('link:'+ip,40);
    if(path==='/api/owner/erase' || path==='/api/owner/groups/erase') {
      const token=readCookie(request.headers.get('cookie'),'chatx_session');
      const limited=consume('owner:'+(token?hashSession(token):ip),10);
      if(limited)return limited;
    }
    if(['POST','PATCH','DELETE'].includes(request.method)) {
      const token=readCookie(request.headers.get('cookie'),'chatx_session');
      return consume('write:'+(token?hashSession(token):ip),300);
    }
    return 0;
  };
}
