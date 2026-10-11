import { useMotionTier } from './useMotionTier';
export function useProfileMotion() {
  return useMotionTier() !== 'static';
}
