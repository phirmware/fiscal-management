import { useCallback, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface Pt {
  x: number;
  y: number;
}

/**
 * Smooth line through all points using Catmull-Rom → cubic Bézier conversion.
 * Unlike the naive Q/T approach this passes *through* every data point with
 * no reflection overshoot, so the curve never wanders past the real values.
 */
export function catmullRomPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Round-number gridlines covering [min, max], always including zero. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const span = hi - lo || 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= target) ?? mag * 10;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.5; v += step) {
    ticks.push(Math.round(v * 100) / 100);
    if (v >= hi) break;
  }
  return ticks;
}

/** Evenly spaced bands: column centres for `count` bars across [padX, width − padX]. */
export function bandLayout(count: number, padX: number, width: number) {
  const inner = width - padX * 2;
  const step = inner / Math.max(1, count);
  return {
    step,
    xFor: (i: number) => padX + step * (i + 0.5),
    indexAt: (x: number) => Math.max(0, Math.min(count - 1, Math.floor((x - padX) / step))),
  };
}

/**
 * Tap-or-drag scrubbing across the columns of an SVG chart. `indexAt` maps a
 * viewBox x-coordinate to a column. Defaults to the last column so the
 * readout always shows something.
 */
export function useScrub(count: number, width: number, indexAt: (x: number) => number) {
  const [index, setIndex] = useState<number | null>(null);
  const active = index === null || index >= count ? count - 1 : index;

  const locate = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setIndex(indexAt(((e.clientX - rect.left) / rect.width) * width));
    },
    [indexAt, width],
  );

  return {
    active,
    handlers: {
      onPointerDown: locate,
      onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => {
        // Mouse: follow hover. Touch: only while the finger is down.
        if (e.pointerType === "mouse" || e.buttons > 0) locate(e);
      },
      onPointerLeave: (e: ReactPointerEvent<SVGSVGElement>) => {
        if (e.pointerType === "mouse") setIndex(null);
      },
    },
  };
}
