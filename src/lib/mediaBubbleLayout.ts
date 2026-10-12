/** Preserve the complete photo while bounding the inline preview on phone and desktop. */
export function mediaBubbleWidth(width?: number, height?: number) {
  if (!width || !height || !Number.isFinite(width / height) || width <= 0 || height <= 0) return 272;
  return Math.max(96, Math.min(272, 336 * width / height));
}
