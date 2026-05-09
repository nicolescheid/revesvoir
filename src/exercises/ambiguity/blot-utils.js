// Shared utilities for the Threshold inkblot renderer.
// Ported from the Claude Design prototype to ES modules.

import { useState, useEffect } from 'react';

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(t) { return t * t * (3 - 2 * t); }
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
export function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }

// mulberry32 — deterministic; sampling order matters for blot reproducibility.
export function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Animated reveal hook: t∈[0,1] over `duration` ms; resets when `key` changes.
export function useReveal(duration = 3500, key = 0) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf, start;
    setT(0);
    const tick = (now) => {
      if (start == null) start = now;
      const progress = clamp((now - start) / duration, 0, 1);
      setT(progress);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration, key]);
  return t;
}

// rAF clock (ms since mount). Pauses with the tab.
export function useNow() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    let raf, start;
    const tick = (t) => {
      if (start == null) start = t;
      setNow(t - start);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return now;
}
