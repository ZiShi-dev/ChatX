import { afterEach, expect, it, vi } from 'vitest';
import { createOutgoingScheduler, type QueuedSend } from './outgoingScheduler';
import { retryAfterMs, retryDelay, retryableStatus } from './retry';

afterEach(()=>vi.useRealTimers());
it('prioritizes text, serializes a conversation, and bounds global concurrency', async () => {
  const pending:QueuedSend[]=[{id:'file',conversationId:'a',type:'file',createdAt:'1'},{id:'text-a',conversationId:'a',type:'text',createdAt:'2'},{id:'text-b',conversationId:'b',type:'text',createdAt:'3'}];
  const finish=new Map<string,()=>void>(); const sent:string[]=[];
  const scheduler=createOutgoingScheduler({pending:()=>pending, available:()=>true,concurrency:()=>1,send:(id)=>{sent.push(id);return new Promise<void>((resolve)=>finish.set(id,()=>{pending.splice(pending.findIndex((row)=>row.id===id),1);resolve();}));}});
  try { scheduler.wake();scheduler.wake();expect(sent).toEqual(['text-a']);finish.get('text-a')!();await Promise.resolve();await Promise.resolve();await Promise.resolve();expect(sent).toEqual(['text-a','text-b']);
    finish.get('text-b')!();await Promise.resolve();await Promise.resolve();await Promise.resolve();expect(sent).toEqual(['text-a','text-b','file']); }
  finally {scheduler.stop();finish.get('file')?.();}
});
it('does not send offline, waits for retry deadlines, and resumes on a wake',async()=>{
  vi.useFakeTimers();let available=false;let pending:QueuedSend[]=[{id:'a',conversationId:'a',type:'text',createdAt:'1',retryAt:Date.now()+2000}];
  const send=vi.fn(async()=>{pending=[];});const scheduler=createOutgoingScheduler({pending:()=>pending,available:()=>available,concurrency:()=>1,send});
  try {scheduler.wake();await vi.advanceTimersByTimeAsync(500);expect(send).not.toHaveBeenCalled();available=true;scheduler.wake();await vi.advanceTimersByTimeAsync(1499);expect(send).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(send).toHaveBeenCalledTimes(1);}finally{scheduler.stop();}
});
it('respects server Retry-After and excludes permanent HTTP failures',()=>{
  expect(retryDelay(1,5000,()=>0)).toBe(5000);expect(retryDelay(20,0,()=>0.5)).toBe(60000);
  expect(retryAfterMs('120')).toBe(120000);expect(retryAfterMs('bad')).toBe(0);
  expect(retryableStatus(429)).toBe(true);expect(retryableStatus(403)).toBe(false);expect(retryableStatus(409)).toBe(false);
});
