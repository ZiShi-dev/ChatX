import { it } from 'node:test';
import assert from 'node:assert/strict';
import { deliverPush } from '../src/pushDelivery.ts';
it('retries transient failures with server-directed delay and a strict attempt limit', async () => {
  const pauses: number[] = []; let attempts = 0;
  const response = await deliverPush(async () => {
    attempts++; return attempts === 1 ? new Response('', { status: 503, headers: { 'retry-after': '25' } }) : new Response('', { status: 200 });
  }, async () => true, async ms => { pauses.push(ms); });
  assert.equal(response?.status, 200); assert.equal(attempts, 2); assert.deepEqual(pauses, [25000]);
  attempts = 0;
  await deliverPush(async () => { attempts++; throw new Error('offline'); }, async () => true, async () => {});
  assert.equal(attempts, 3);
});
it('does not retry permanent failures or messages read/muted during the delay', async () => {
  let attempts = 0;
  const request = async () => { attempts++; return new Response('', { status: 400 }); };
  assert.equal((await deliverPush(request, async () => true))?.status, 400); assert.equal(attempts, 1);
  attempts = 0;
  assert.equal(await deliverPush(async () => { attempts++; return new Response('', { status: 503 }); }, async () => false, async () => {}), null);
  assert.equal(attempts, 1);
});
it('backs off quota failures for at least a minute and refreshes rejected authentication immediately', async () => {
  const pauses: number[] = []; let attempts = 0;
  await deliverPush(async () => { attempts++; return new Response('', { status: attempts === 1 ? 429 : attempts === 2 ? 401 : 200 }); }, async () => true, async ms => { pauses.push(ms); });
  assert.deepEqual(pauses, [60000, 0]);
});
