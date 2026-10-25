import { useId } from "react";
import { catmullRomPath } from "./chartUtils.js";

/** Tiny trend line for hero cards. Colour follows direction unless overridden. */
export function Sparkline({
  values,
  className,
  colourVar,
}: {
  values: number[];
  className?: string;
  colourVar?: string;
}) {
  const id = useId();
  if (values.length < 2) return null;
  const W = 120;
  const H = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: 3 + (H - 6) * (1 - (v - min) / span),
  }));
  const rising = values[values.length - 1]! >= values[0]!;
  const colour = `rgb(var(${colourVar ?? (rising ? "--c-status-ok" : "--c-status-over")}))`;
  const d = catmullRomPath(pts);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity={0.28} />
          <stop offset="100%" stopColor={colour} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d} L ${W} ${H} L 0 ${H} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
