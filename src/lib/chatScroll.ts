/** Browser anchoring and composer resizing may already have advanced the scroll. */
export function advancingScrollTop(current: number, start: number, target: number, progress: number) {
  const eased = 1 - (1 - progress) ** 3;
  return Math.max(0, Math.min(target, Math.max(current, start + (target - start) * eased)));
}
