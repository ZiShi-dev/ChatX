export function constrainedDevice() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return (typeof memory === 'number' && memory <= 2) || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2);
}
export function yieldToInterface() {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return scheduler?.yield ? scheduler.yield() : new Promise<void>(resolve => setTimeout(resolve, 0));
}
