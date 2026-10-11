import { describe, expect, it } from 'vitest';
import { deviceMotionTier, measuredMotionTier } from './motionBudget';
describe('adaptive motion budget', () => {
  it('stays conservative on unknown or constrained hardware', () => {
    expect(deviceMotionTier()).toBe('balanced');
    expect(deviceMotionTier(8, 2)).toBe('static');
    expect(deviceMotionTier(2, 8)).toBe('static');
    expect(deviceMotionTier(4, 8)).toBe('balanced');
    expect(deviceMotionTier(8, 8)).toBe('full');
  });
  it('reduces motion when measured frames are slow or frequently delayed', () => {
    expect(measuredMotionTier(Array(60).fill(16.7))).toBe('full');
    expect(measuredMotionTier(Array(60).fill(25))).toBe('balanced');
    expect(measuredMotionTier(Array(60).fill(40))).toBe('static');
    expect(measuredMotionTier([...Array(40).fill(16), ...Array(20).fill(50)])).toBe('static');
    expect(measuredMotionTier([50])).toBe('full');
  });
});
