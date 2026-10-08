let tail: Promise<void> = Promise.resolve();

// Serialize image decoding and file encoding; keep network requests independent.
export function prepareMedia<T>(task: () => Promise<T>): Promise<T> {
  const result = tail.then(task, task);
  tail = result.then(() => undefined, () => undefined);
  return result;
}
