import { useSyncExternalStore } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { deviceMotionTier, measuredMotionTier, type MotionTier } from '../lib/motionBudget';

const listeners = new Set<() => void>();
let measured: MotionTier = 'full';
let frame = 0;
let lastSample = -Infinity;
let deferredSample: ReturnType<typeof setTimeout> | undefined;
let preference: MediaQueryList | undefined;
const rank = { static: 0, balanced: 1, full: 2 };
function snapshot(): MotionTier {
  if (document.visibilityState === 'hidden' || preference?.matches || useSettingsStore.getState().dataSaver) return 'static';
  const hardware = deviceMotionTier(navigator.hardwareConcurrency, (navigator as Navigator & { deviceMemory?: number }).deviceMemory);
  return rank[hardware] < rank[measured] ? hardware : measured;
}
function update() {
  document.documentElement.dataset.motionTier = snapshot();
  listeners.forEach(listener => listener());
}
// A bounded sample on opening/resuming; no permanent frame-monitoring loop.
function sample() {
  lastSample = performance.now();
  cancelAnimationFrame(frame);
  if (snapshot() === 'static') return;
  const times: number[] = [];
  let previous = 0;
  const started = performance.now();
  function tick(now: number) {
    if (!listeners.size || document.visibilityState === 'hidden') return;
    if (previous) times.push(now - previous);
    previous = now;
    if (times.length < 60 && now - started < 3000) frame = requestAnimationFrame(tick);
    else {
      const result = measuredMotionTier(times);
      // Stay conservative for this session instead of switching effects repeatedly.
      if (rank[result] < rank[measured]) measured = result;
      update();
    }
  }
  frame = requestAnimationFrame(tick);
}
function interaction() {
  if (performance.now() - lastSample < 30_000 || deferredSample) return;
  deferredSample = setTimeout(() => { deferredSample = undefined; sample(); }, 300);
}
function visibility() { update(); if (document.visibilityState !== 'hidden') sample(); else cancelAnimationFrame(frame); }
let stopSettings: (() => void) | undefined;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    preference.addEventListener?.('change', update);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('pointerup', interaction, { passive: true });
    stopSettings = useSettingsStore.subscribe(update);
    update(); sample();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('pointerup', interaction);
      clearTimeout(deferredSample); deferredSample = undefined;
      preference?.removeEventListener?.('change', update);
      stopSettings?.();
    }
  };
}
export function useMotionTier() { return useSyncExternalStore(subscribe, snapshot, () => 'static' as const); }
