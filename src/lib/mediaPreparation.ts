import { yieldToInterface } from './deviceBudget';
let tail: Promise<void> = Promise.resolve();

// Serialize image decoding and file encoding; keep network requests independent.
export function prepareMedia<T>(task: () => Promise<T>): Promise<T> {
  const run = async () => { await yieldToInterface(); return task(); };
  const result = tail.then(run, run);
  tail = result.then(() => undefined, () => undefined);
  return result;
}
