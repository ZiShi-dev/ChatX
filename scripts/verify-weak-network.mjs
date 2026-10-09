import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CHATX_PLAYWRIGHT_PATH||'playwright');
const base=process.env.CHATX_TEST_ORIGIN||'http://127.0.0.1:4186';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHATX_CHROME_PATH});
const alice={id:'11111111-1111-4111-8111-111111111111',username:'alice',displayName:'Alice',role:'member',bio:'',status:'online',color:'#4d7ea8'};
const bob={...alice,id:'22222222-2222-4222-8222-222222222222',username:'bob',displayName:'Bob'};
const roomId='00000000-0000-4000-8000-000000000001',fileId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const room={id:roomId,type:'global',name:'ChatX',participantIds:[alice.id,bob.id],unreadCount:0,createdAt:'2026-10-09T12:00:00Z'};
const text='رسالة محفوظة أثناء الانقطاع';
const fileBytes=Buffer.from(Array.from({length:70000},(_,i)=>i%256));
const messages=new Map(), offsets=[], errors=[];
let offline=false,lostTextAck=false,lostChunkAck=false,offset=0,fileCommitted=false,textAttempts=0;
const context=await browser.newContext({viewport:{width:360,height:640},permissions:['notifications']});
await context.addInitScript(({alice,bob,room})=>{
  if(!localStorage.getItem('chatx.auth'))localStorage.setItem('chatx.auth',JSON.stringify({activated:true,currentUser:alice,accounts:[alice,bob]}));
  if(!localStorage.getItem(`chatx.chat.v1.${alice.id}`))localStorage.setItem(`chatx.chat.v1.${alice.id}`,JSON.stringify({conversations:[room],messages:[],users:[alice,bob]}));
},{alice,bob,room});
const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
const failed=[];page.on('requestfailed',request=>{if(!request.url().includes('/api/'))failed.push(request.url());});
await page.route('**/api/**',async route=>{
  if(offline)return route.abort();
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  let body={ok:true};
  if(path==='/api/home')body={conversations:[room],users:[alice,bob]};
  if(path==='/api/profile')body={user:alice};
  if(path==='/api/notifications')body={notifications:[],unreadCount:0};
  if(path==='/api/presence')body={presence:[]};
  if(path==='/api/saved')body={saved:[],hasMore:false};
  if(path.endsWith('/sync'))body={messages:[...messages.values()],readers:[],removedIds:[],reset:true,hasMore:false,historyHasMore:false,cursor:'cccccccc-cccc-4ccc-8ccc-cccccccccccc.1'};
  if(path.endsWith('/messages')&&request.method()==='POST'){
    const data=request.postDataJSON();textAttempts++;
    assert.equal(data.text,text);messages.set(data.id,{id:data.id,conversationId:roomId,senderId:alice.id,text,createdAt:new Date().toISOString(),deleted:false});
    if(!lostTextAck){lostTextAck=true;return route.abort();} body={message:messages.get(data.id)};
  }
  if(path.includes('/uploads/')){
    if(request.method()==='POST'&&!path.endsWith('/complete')){
      const init=request.postDataJSON();assert.equal(init.size,fileBytes.length);assert.equal(init.sha256,createHash('sha256').update(fileBytes).digest('hex'));
      body={offset,completed:fileCommitted};
    }else if(request.method()==='PATCH'){
      const start=Number(url.searchParams.get('offset'));assert.equal(start,offset);
      const bytes=request.postDataBuffer();assert.deepEqual(bytes,fileBytes.subarray(offset,offset+bytes.length));offsets.push(start);offset+=bytes.length;
      if(!lostChunkAck){lostChunkAck=true;return route.abort();}body={offset,completed:false};
    }else{
      assert.equal(offset,fileBytes.length);fileCommitted=true;
      messages.set(fileId,{id:fileId,conversationId:roomId,senderId:alice.id,text:'',createdAt:new Date().toISOString(),deleted:false,type:'file',fileName:'resume.bin',fileSize:fileBytes.length});
      body={offset,completed:true,message:messages.get(fileId)};
    }
  }
  await route.fulfill({json:body});
});
const readOutgoing=()=>page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('chatx-durable-v1',2);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  const rows=await new Promise((resolve,reject)=>{const req=db.transaction('outgoing').objectStore('outgoing').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();return rows;
});
const waitFor=async(check,label)=>{for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,200));}throw new Error(label);};
try{
  await page.goto(`${base}/chat/${roomId}`);await page.getByPlaceholder('اكتب رسالة').waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
  assert.equal(await page.evaluate(()=>window.__vite_is_modern_browser),true);
  offline=true;await context.setOffline(true);
  await page.locator('.startup-screen').waitFor({state:'detached'});
  await page.getByPlaceholder('اكتب رسالة').fill(text);
  await waitFor(async()=>await page.getByRole('button',{name:'إرسال',exact:true}).isEnabled(),'Offline compose disabled: '+await page.getByPlaceholder('اكتب رسالة').inputValue());
  await page.getByRole('button',{name:'إرسال',exact:true}).click();
  await waitFor(async()=>(await readOutgoing()).some(row=>row.message.text===text),'Text was not durably saved offline');
  const fileMessage={id:fileId,conversationId:roomId,senderId:alice.id,type:'file',createdAt:new Date().toISOString(),status:'pending',prepared:true,media:{fileName:'resume.bin',fileSize:fileBytes.length,state:'cached',localPreviewUrl:`data:application/octet-stream;base64,${fileBytes.toString('base64')}`}};
  await page.evaluate(async({owner,message})=>{
    const db=await new Promise(resolve=>{const request=indexedDB.open('chatx-durable-v1',2);request.onsuccess=()=>resolve(request.result);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('outgoing','readwrite');tx.objectStore('outgoing').put({key:`${owner}:${message.id}`,owner,message});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },{owner:alice.id,message:fileMessage});
  await page.reload();
  assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),true);
  assert.deepEqual(failed,[]);
  await page.getByPlaceholder('اكتب رسالة').waitFor();await page.getByText(text,{exact:true}).first().waitFor();
  assert.equal(textAttempts,0);assert.equal(offset,0);
  offline=false;await context.setOffline(false);
  await waitFor(async()=>fileCommitted&&(await readOutgoing()).length===0,'Queue did not recover without reopening');
  assert.equal(messages.size,2);assert.ok(textAttempts>=1&&textAttempts<=2);assert.equal(offset,fileBytes.length);assert.equal(offsets[0],0);assert.equal(offsets[1],32768);
  // A second account must not dispatch the first account's durable operations.
  await page.evaluate(async({owner,other,room})=>{
    const db=await new Promise(resolve=>{const request=indexedDB.open('chatx-durable-v1',2);request.onsuccess=()=>resolve(request.result);});
    await new Promise(resolve=>{const tx=db.transaction('outgoing','readwrite');tx.objectStore('outgoing').put({key:`${owner}:secret`,owner,message:{id:'secret',senderId:owner,conversationId:room.id,type:'text',text:'alice-private-queued',createdAt:new Date().toISOString(),status:'pending'}});tx.oncomplete=resolve;});db.close();
    localStorage.setItem('chatx.auth',JSON.stringify({activated:true,currentUser:other,accounts:[other]}));
    localStorage.setItem(`chatx.chat.v1.${other.id}`,JSON.stringify({conversations:[room],messages:[],users:[other]}));
  },{owner:alice.id,other:bob,room});
  offline=true;await context.setOffline(true);await page.reload();await page.getByPlaceholder('اكتب رسالة').waitFor();
  assert.equal(await page.getByText('alice-private-queued',{exact:true}).count(),0);
  assert.equal((await readOutgoing()).filter(row=>row.owner===alice.id).length,1);
  assert.deepEqual(errors,[]);
  console.log(`PASS offline web reload, durable text/file recovery, lost acknowledgements, account isolation; ${fileBytes.length} binary bytes uploaded once, offsets ${offsets.join(',')}`);
}finally{await context.close();await browser.close();}
