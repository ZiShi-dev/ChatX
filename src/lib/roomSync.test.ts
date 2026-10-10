import { expect, it } from 'vitest';
import { mergeRoomDelta } from './roomSync';
import type { Message } from '../types/message';
const message=(id:string,text:string,status:Message['status']='sent'):Message=>({id,conversationId:'room',senderId:'me',createdAt:id,type:'text',text,status});
it('merges old edits and deletions without dropping local pending sends or unrelated history',()=>{
  const original=[message('1','old'),message('2','keep'),message('3','pending','pending')];
  const result=mergeRoomDelta(original,[{...message('1',''),deletedForEveryone:true}],[],'room');
  expect(result.find((m)=>m.id==='1')?.deletedForEveryone).toBe(true);expect(result.find((m)=>m.id==='2')?.text).toBe('keep');expect(result.find((m)=>m.id==='3')?.status).toBe('pending');
});
it('keeps a loaded link image when the same url arrives again',()=>{
  const loaded=message('1','https://example.com/a');
  loaded.link={url:'https://example.com/a',title:'مثال',description:'وصف',image:'data:image/jpeg;base64,QQ==',preview:'loaded'};
  const again={...message('1','https://example.com/a'),link:{url:'https://example.com/a',title:'example.com',description:'',preview:'notLoaded' as const}};
  const result=mergeRoomDelta([loaded],[again],[],'room');
  expect(result.find((m)=>m.id==='1')?.link?.image).toBe('data:image/jpeg;base64,QQ==');
  expect(result.find((m)=>m.id==='1')?.link?.title).toBe('مثال');
});
