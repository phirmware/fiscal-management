import type { SavingsTrendPoint } from "../app/insights.js";
import { formatGBP } from "../app/utils/money.js";
import { shortMonthLabel } from "../app/utils/month.js";

interface Props {
  points: SavingsTrendPoint[];
}

const WIDTH = 480;
const HEIGHT = 220;
const PAD_X = 32;
const PAD_TOP = 20;
const PAD_BOTTOM = 40;

const LINE_COLOR = "rgb(var(--c-group-savings))";
const POS_BAR_COLOR = "rgb(var(--c-group-savings))";
const NEG_BAR_COLOR = "rgb(var(--c-status-over))";
const GRID_COLOR = "rgb(var(--c-surface-border))";

export function SavingsTrendChart({ points }: Props) {
  if (points.length === 0) {
    return <p className="text-xs text-ink-muted">No months in range.</p>;
  }
  const maxCum = Math.max(1, ...points.map((p) => p.cumulativeTotal));
  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (i: number) =>
    points.length === 1 ? PAD_X + innerW / 2 : PAD_X + (innerW * i) / (points.length - 1);
  const yFor = (v: number) => PAD_TOP + innerH * (1 - v / maxCum);

  // Smooth path using catmull-rom-ish curve approximation (quadratic via midpoints).
  function smoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M${pts[0]!.x} ${pts[0]!.y}`;
    let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!;
      const curr = pts[i]!;
      const midX = (prev.x + curr.x) / 2;
      d += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${midX.toFixed(1)} ${((prev.y + curr.y) / 2).toFixed(1)}`;
      d += ` T ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }
    return d;
  }

  const linePoints = points.map((p, i) => ({ x: xFor(i), y: yFor(p.cumulativeTotal) }));
  const lineD = smoothPath(linePoints);
  const lastX = linePoints[linePoints.length - 1]!.x;
  const firstX = linePoints[0]!.x;
  const baselineY = PAD_TOP + innerH;
  const areaD = `${lineD} L ${lastX.toFixed(1)} ${baselineY} L ${firstX.toFixed(1)} ${baselineY} Z`;

  const barWidth = Math.max(6, Math.min(20, (innerW / Math.max(1, points.length)) * 0.55));
  const maxMonth = Math.max(1, ...points.map((p) => Math.abs(p.monthTotal)));

  const showEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto"
      role="img"
      aria-label="Savings trend chart"
    >
      <defs>
        <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.32} />
          <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0} />
        </linearGradient>
        <linearGradient id="trend-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.85} />
          <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={1} />
        </linearGradient>
      </defs>

      {/* Horizontal grid lines */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={PAD_X}
          y1={PAD_TOP + innerH * (1 - t)}
          x2={PAD_X + innerW}
          y2={PAD_TOP + innerH * (1 - t)}
          stroke={GRID_COLOR}
          strokeWidth={1}
          strokeDasharray="2 4"
          opacity={0.5}
        />
      ))}

      {/* Area + line */}
      <path d={areaD} fill="url(#trend-area)" />
      <path d={lineD} stroke="url(#trend-line)" strokeWidth={2.5} fill="none" strokeLinecap="round" />

      {/* Bars and points */}
      {points.map((p, i) => {
        const x = xFor(i);
        const h = (Math.abs(p.monthTotal) / maxMonth) * (innerH * 0.35);
        const y = p.monthTotal >= 0 ? PAD_TOP + innerH - h : PAD_TOP + innerH;
        const colour = p.monthTotal >= 0 ? POS_BAR_COLOR : NEG_BAR_COLOR;
        const isLast = i === points.length - 1;
        return (
          <g key={p.month}>
            <rect
              x={x - barWidth / 2}
              y={y}
              width={barWidth}
              height={Math.max(2, h)}
              rx={2}
              style={{ fill: colour }}
              opacity={0.35}
            />
            {isLast && (
              <circle cx={x} cy={yFor(p.cumulativeTotal)} r={6} fill={LINE_COLOR} opacity={0.25} />
            )}
            <circle
              cx={x}
              cy={yFor(p.cumulativeTotal)}
              r={isLast ? 4 : 3}
              style={{ fill: LINE_COLOR }}
            />
            {i % showEvery === 0 && (
              <text
                x={x}
                y={HEIGHT - 14}
                textAnchor="middle"
                className="fill-ink-muted"
                style={{ fontSize: 10, fontWeight: 500 }}
              >
                {shortMonthLabel(p.month)}
              </text>
            )}
          </g>
        );
      })}

      {/* Y-axis labels */}
      <text
        x={PAD_X}
        y={PAD_TOP - 4}
        className="fill-ink-muted"
        style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em" }}
      >
        {formatGBP(maxCum)}
      </text>
      <text x={PAD_X} y={HEIGHT - 2} className="fill-ink-faint" style={{ fontSize: 10 }}>
        £0
      </text>
    </svg>
  );
}
