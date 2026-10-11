export type MotionTier = 'full' | 'balanced' | 'static';
export function deviceMotionTier(cores?: number, memory?: number): MotionTier {
  if ((cores && cores <= 2) || (memory && memory <= 2)) return 'static';
  if (!cores || cores <= 4 || (memory && memory <= 4)) return 'balanced';
  return 'full';
}
export function measuredMotionTier(frameTimes: number[]): MotionTier {
  const frames = frameTimes.filter(ms => ms > 0);
  if (frames.length < 20) return 'full';
  const average = frames.reduce((sum, ms) => sum + ms, 0) / frames.length;
  const slow = frames.filter(ms => ms > 40).length / frames.length;
  return average > 32 || slow > .25 ? 'static' : average > 22 || slow > .1 ? 'balanced' : 'full';
}
