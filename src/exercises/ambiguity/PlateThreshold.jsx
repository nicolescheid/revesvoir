// PlateThreshold — turbulence-displaced ink rendered in SVG.
// Per seed: pick a body archetype (mode), sample shared character knobs
// (symmetry, density, aspect, drama, rotation), build left/right halves,
// then animate the displacement scale 2 → dispMax over the reveal.
//
// Sampling order matters: same seed must always sample knobs in the same
// order or the card changes.

import { useMemo } from 'react';
import {
  clamp, lerp, easeOutCubic, easeOutQuart,
  rng, useReveal, useNow,
} from './blot-utils.js';

export const VW = 320;
export const VH = 360;

// ── Side builders ──────────────────────────────────────────
// Each builder draws shapes for the LEFT half (cx < 160). Mirroring is
// applied externally per the symmetry score.

function buildCreatureSide(sr, opts) {
  const sn = (a, b) => a + sr() * (b - a);
  const { density, aspect, symmetry, compact } = opts;
  const out = [];
  const spineCount = 2 + Math.floor(sr() * 4);
  const startY = compact ? sn(110, 130) : sn(50, 90);
  const endY = compact ? sn(220, 250) : sn(280, 330);
  for (let i = 0; i < spineCount; i++) {
    const ty = spineCount === 1 ? 0.5 : i / (spineCount - 1);
    out.push({
      cx: 152 + (sr() - 0.5) * 16 * (1 - symmetry),
      cy: lerp(startY, endY, ty) + (sr() - 0.5) * 14,
      rx: sn(22, 54) * density,
      ry: sn(22, 48) * density / aspect,
      delay: i * 0.05,
    });
  }
  const wingCount = Math.floor(sr() * 4);
  for (let i = 0; i < wingCount; i++) {
    out.push({
      cx: sn(38, 130),
      cy: sn(startY - 10, endY + 10),
      rx: sn(12, 32) * density,
      ry: sn(12, 36) * density / aspect,
      delay: 0.10 + sr() * 0.20,
    });
  }
  const satCount = 1 + Math.floor(sr() * 5);
  for (let i = 0; i < satCount; i++) {
    out.push({
      cx: sn(34, 140), cy: sn(40, 320),
      rx: sn(3, 11), ry: sn(3, 11),
      delay: 0.20 + sr() * 0.32,
    });
  }
  return out;
}

function buildSingletonSide(sr, opts) {
  const sn = (a, b) => a + sr() * (b - a);
  const { density, aspect } = opts;
  const out = [];
  const cy = sn(155, 205);
  const rxBig = sn(36, 56) * density;
  const ryBig = sn(48, 78) * density / aspect;
  out.push({ cx: 152, cy, rx: rxBig, ry: ryBig, delay: 0 });
  const edgeCount = 2 + Math.floor(sr() * 3);
  for (let i = 0; i < edgeCount; i++) {
    out.push({
      cx: sn(110, 152),
      cy: cy + (sr() - 0.5) * ryBig * 1.4,
      rx: sn(20, 38) * density,
      ry: sn(20, 34) * density / aspect,
      delay: 0.05 + i * 0.06,
    });
  }
  const satCount = 1 + Math.floor(sr() * 3);
  for (let i = 0; i < satCount; i++) {
    const ang = sr() * Math.PI;
    const dist = (rxBig + ryBig) / 2 * (1.0 + sr() * 0.4);
    out.push({
      cx: 152 - Math.abs(Math.cos(ang)) * dist,
      cy: cy + Math.sin(ang) * dist * 0.7,
      rx: 3 + sr() * 7,
      ry: 3 + sr() * 7,
      delay: 0.30 + sr() * 0.28,
    });
  }
  return out;
}

function buildPairSide(sr, opts) {
  const sn = (a, b) => a + sr() * (b - a);
  const { density, aspect } = opts;
  const out = [];
  const stacked = sr() < 0.55;
  const bodies = stacked
    ? [{ cx: sn(95, 130), cy: sn(90, 130) }, { cx: sn(95, 130), cy: sn(225, 270) }]
    : [{ cx: sn(55, 80), cy: sn(150, 200) }, { cx: sn(115, 145), cy: sn(150, 200) }];
  for (const b of bodies) {
    const r0 = sn(22, 38) * density;
    out.push({
      cx: b.cx, cy: b.cy,
      rx: r0, ry: r0 * sn(0.85, 1.25) / aspect,
      delay: 0,
    });
    const detailCount = 2 + Math.floor(sr() * 3);
    for (let i = 0; i < detailCount; i++) {
      const ang = sr() * Math.PI * 2;
      const dist = r0 * (0.5 + sr() * 0.5);
      out.push({
        cx: b.cx + Math.cos(ang) * dist * 0.6,
        cy: b.cy + Math.sin(ang) * dist,
        rx: r0 * (0.30 + sr() * 0.35),
        ry: r0 * (0.30 + sr() * 0.35),
        delay: 0.05 + i * 0.05,
      });
    }
  }
  return out;
}

function buildConstellationSide(sr) {
  const sn = (a, b) => a + sr() * (b - a);
  const out = [];
  const count = 6 + Math.floor(sr() * 8);
  for (let i = 0; i < count; i++) {
    const big = sr() < 0.18;
    const r0 = big ? sn(7, 13) : sn(2, 6);
    out.push({
      cx: sn(34, 152),
      cy: sn(40, 320),
      rx: r0,
      ry: r0 * sn(0.7, 1.3),
      delay: sr() * 0.7,
    });
  }
  return out;
}

function buildSceneSide(sr, opts) {
  const sn = (a, b) => a + sr() * (b - a);
  const { density } = opts;
  const horizonY = sn(195, 245);
  const out = [];
  const groundCount = 2 + Math.floor(sr() * 3);
  for (let i = 0; i < groundCount; i++) {
    out.push({
      cx: 30 + (i / Math.max(1, groundCount - 1)) * 110 + (sr() - 0.5) * 18,
      cy: horizonY + sn(0, 24),
      rx: sn(34, 60) * density,
      ry: sn(12, 24) * density,
      delay: 0.05 + i * 0.04,
    });
  }
  const detailCount = 1 + Math.floor(sr() * 3);
  for (let i = 0; i < detailCount; i++) {
    out.push({
      cx: sn(40, 140),
      cy: horizonY - sn(8, 32),
      rx: sn(6, 16),
      ry: sn(18, 44),
      delay: 0.15 + i * 0.05,
    });
  }
  const skyCount = 1 + Math.floor(sr() * 2);
  for (let i = 0; i < skyCount; i++) {
    out.push({
      cx: sn(40, 140),
      cy: sn(50, horizonY - 50),
      rx: sn(18, 38),
      ry: sn(10, 20),
      delay: 0.25 + i * 0.05,
    });
  }
  return out;
}

function buildCloudSide(sr) {
  const sn = (a, b) => a + sr() * (b - a);
  const cx0 = 130, cy0 = sn(150, 210);
  const out = [];
  const count = 5 + Math.floor(sr() * 4);
  for (let i = 0; i < count; i++) {
    const ang = sn(0, Math.PI * 2);
    const dist = sn(15, 70);
    out.push({
      cx: cx0 + Math.cos(ang) * dist * 0.55,
      cy: cy0 + Math.sin(ang) * dist * 0.7,
      rx: sn(28, 50),
      ry: sn(18, 32),
      delay: sr() * 0.5,
    });
  }
  return out;
}

const SIDE_BUILDERS = {
  creature: buildCreatureSide,
  singleton: buildSingletonSide,
  pair: buildPairSide,
  constellation: buildConstellationSide,
  scene: buildSceneSide,
  cloud: buildCloudSide,
};

// ── Generator ──────────────────────────────────────────────

export function generateThreshold(seed) {
  const r = rng(seed);
  const next = (a, b) => a + r() * (b - a);

  const modeRoll = r();
  let mode;
  if (modeRoll < 0.30) mode = 'creature';
  else if (modeRoll < 0.46) mode = 'singleton';
  else if (modeRoll < 0.62) mode = 'pair';
  else if (modeRoll < 0.74) mode = 'constellation';
  else if (modeRoll < 0.86) mode = 'scene';
  else mode = 'cloud';

  const symmetry =
    mode === 'singleton' || mode === 'cloud' ? next(0.55, 1.0)
      : mode === 'scene' || mode === 'constellation' ? next(0.0, 0.45)
        : r();
  const density = next(0.7, 1.35);
  const aspect = next(0.75, 1.30);
  const drama = next(0.7, 1.6);
  const rotation = (r() - 0.5) * (mode === 'scene' ? 6 : mode === 'constellation' ? 10 : 22);
  const splatter = r() < 0.45 && mode !== 'constellation';
  const tendril = r() < 0.35 && (mode === 'creature' || mode === 'singleton');
  const compact = r() < 0.30;

  const builder = SIDE_BUILDERS[mode];
  const opts = { density, aspect, symmetry, compact };

  let leftBlobs = builder(rng(seed * 7919 + 1), opts);
  let rightBlobs;

  if (symmetry > 0.65) {
    rightBlobs = leftBlobs.map(b => ({ ...b, cx: 320 - b.cx }));
  } else if (symmetry > 0.35) {
    rightBlobs = leftBlobs.map(b => ({ ...b, cx: 320 - b.cx }));
    const fr = rng(seed * 13 + 7);
    const flourishCount = 1 + Math.floor(fr() * 3);
    for (let i = 0; i < flourishCount; i++) {
      const target = fr() < 0.5 ? leftBlobs : rightBlobs;
      const isRight = target === rightBlobs;
      target.push({
        cx: (isRight ? 170 : 40) + fr() * 110,
        cy: 50 + fr() * 270,
        rx: 6 + fr() * 18, ry: 6 + fr() * 18,
        delay: 0.30 + fr() * 0.30,
      });
    }
  } else {
    rightBlobs = builder(rng(seed * 6151 + 2), opts).map(b => ({ ...b, cx: 320 - b.cx }));
  }

  const splatters = [];
  if (splatter) {
    const spr = rng(seed * 3 + 5);
    const count = 3 + Math.floor(spr() * 9);
    for (let i = 0; i < count; i++) {
      splatters.push({
        cx: 28 + spr() * 264,
        cy: 28 + spr() * 304,
        rx: 1.4 + spr() * 4.2,
        ry: 1.4 + spr() * 4.2,
        delay: 0.42 + spr() * 0.40,
      });
    }
  }
  const tendrils = [];
  if (tendril) {
    const tr = rng(seed * 17 + 11);
    const fromRight = tr() < 0.5;
    const angle = (tr() - 0.5) * 1.0 + (fromRight ? 0.4 : Math.PI - 0.4);
    let x = 160 + Math.cos(angle) * 50;
    let y = 180 + Math.sin(angle) * 40;
    const segs = 4 + Math.floor(tr() * 5);
    for (let i = 0; i < segs; i++) {
      x += Math.cos(angle) * (10 + tr() * 8);
      y += Math.sin(angle) * (10 + tr() * 8);
      tendrils.push({
        cx: x, cy: y,
        rx: 7 - i * 0.9 + tr() * 2,
        ry: 7 - i * 0.9 + tr() * 2,
        delay: 0.3 + i * 0.05,
      });
    }
  }

  const baseFreq = `${(0.010 + r() * 0.012).toFixed(4)} ${(0.013 + r() * 0.014).toFixed(4)}`;
  const turbSeed = Math.floor(r() * 99);
  const dispMax =
    mode === 'cloud' ? (16 + r() * 10) * drama
      : mode === 'scene' ? (10 + r() * 6) * drama
        : mode === 'constellation' ? (5 + r() * 5) * drama
          : (12 + r() * 10) * drama;
  const blur =
    mode === 'cloud' ? 1.6 + r() * 1.0
      : mode === 'constellation' ? 0.5 + r() * 0.4
        : 0.9 + r() * 1.0;

  return { mode, leftBlobs, rightBlobs, splatters, tendrils, rotation, baseFreq, turbSeed, dispMax, blur };
}

// ── Renderer ───────────────────────────────────────────────

export default function PlateThreshold({ revealKey, seed = 7, ink = '#0e0a08', reducedMotion = false }) {
  const t = useReveal(reducedMotion ? 0 : 3800, revealKey);
  const now = useNow();
  const gen = useMemo(() => generateThreshold(seed), [seed]);

  // Reduced-motion: skip the reveal ramp and the breath, render at final state.
  const effectiveT = reducedMotion ? 1 : t;
  const breathRamp = reducedMotion ? 0 : clamp((effectiveT - 0.95) / 0.15, 0, 1);
  const breath = breathRamp * Math.sin(now / 1300) * 0.05;
  const dispScale = lerp(2, gen.dispMax, easeOutCubic(effectiveT)) * (1 + breath);
  const reveal = (b) => easeOutQuart(clamp((effectiveT - b.delay) / Math.max(0.001, 1 - b.delay), 0, 1));
  const all = [...gen.leftBlobs, ...gen.rightBlobs, ...gen.tendrils, ...gen.splatters];
  const filterId = `th-goo-${revealKey}-${seed}`;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency={gen.baseFreq} numOctaves="2" seed={gen.turbSeed} />
          <feDisplacementMap in="SourceGraphic" scale={dispScale} />
          <feGaussianBlur stdDeviation={gen.blur} />
          <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -6" />
        </filter>
      </defs>
      <g transform={`rotate(${gen.rotation} ${VW / 2} ${VH / 2})`} filter={`url(#${filterId})`}>
        {all.map((b, i) => {
          const e = reveal(b);
          return (
            <ellipse key={i} cx={b.cx} cy={b.cy}
              rx={b.rx * e} ry={b.ry * e} fill={ink} />
          );
        })}
      </g>
    </svg>
  );
}
