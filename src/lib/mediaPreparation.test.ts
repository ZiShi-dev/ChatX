import { expect, it } from 'vitest';
import { prepareMedia } from './mediaPreparation';

it('serializes media work without starting the next decoder early', async () => {
  let release!: () => void;
  const order: string[] = [];
  const first = prepareMedia(async () => { order.push('first'); await new Promise<void>((resolve) => { release = resolve; }); });
  const second = prepareMedia(async () => { order.push('second'); return 2; });
  await Promise.resolve();
  expect(order).toEqual(['first']);
  release();
  await first;
  expect(await second).toBe(2);
  expect(order).toEqual(['first', 'second']);
});

it('continues preparing attachments after a failed decoder', async () => {
  const failed = prepareMedia(async () => { throw new Error('invalid image'); });
  const next = prepareMedia(async () => 'ready');
  await expect(failed).rejects.toThrow('invalid image');
  expect(await next).toBe('ready');
});
