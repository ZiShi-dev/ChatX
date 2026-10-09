import { expect, it } from 'vitest';
import { mergeRoomDelta } from './roomSync';
import type { Message } from '../types/message';
const message=(id:string,text:string,status:Message['status']='sent'):Message=>({id,conversationId:'room',senderId:'me',createdAt:id,type:'text',text,status});
it('merges old edits and deletions without dropping local pending sends or unrelated history',()=>{
  const original=[message('1','old'),message('2','keep'),message('3','pending','pending')];
  const result=mergeRoomDelta(original,[{...message('1',''),deletedForEveryone:true}],[],'room');
  expect(result.find((m)=>m.id==='1')?.deletedForEveryone).toBe(true);expect(result.find((m)=>m.id==='2')?.text).toBe('keep');expect(result.find((m)=>m.id==='3')?.status).toBe('pending');
});
