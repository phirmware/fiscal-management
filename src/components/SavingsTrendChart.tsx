import type { SavingsTrendPoint } from "../app/insights.js";
import { formatGBPCompact } from "../app/utils/money.js";
import { shortMonthLabel } from "../app/utils/month.js";

interface Props {
  points: SavingsTrendPoint[];
}

const WIDTH = 480;
const HEIGHT = 220;
const PAD_X = 12;
const PAD_TOP = 26;
const PAD_BOTTOM = 40;

const LINE_COLOR = "rgb(var(--c-group-savings))";
const POS_BAR_COLOR = "rgb(var(--c-group-savings))";
const NEG_BAR_COLOR = "rgb(var(--c-status-over))";
const GRID_COLOR = "rgb(var(--c-surface-border))";

interface Pt {
  x: number;
  y: number;
}

/**
 * Smooth line through all points using Catmull-Rom → cubic Bézier conversion.
 * Unlike the naive Q/T approach this passes *through* every data point with
 * no reflection overshoot, so the curve never wanders past the real values.
 */
function catmullRomPath(pts: Pt[]): string {
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

export function SavingsTrendChart({ points }: Props) {
  if (points.length === 0) {
    return <p className="text-xs text-ink-muted">No months in range.</p>;
  }

  const cumValues = points.map((p) => p.cumulativeTotal);
  const maxCum = Math.max(0, ...cumValues);
  const minCum = Math.min(0, ...cumValues);
  // Always include zero in the domain so the baseline is meaningful.
  const span = Math.max(1, maxCum - minCum);

  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (i: number) =>
    points.length === 1 ? PAD_X + innerW / 2 : PAD_X + (innerW * i) / (points.length - 1);
  const yFor = (v: number) => PAD_TOP + innerH * (1 - (v - minCum) / span);
  const zeroY = yFor(0);

  const linePoints: Pt[] = points.map((p, i) => ({ x: xFor(i), y: yFor(p.cumulativeTotal) }));
  const lineD = catmullRomPath(linePoints);
  const lastPt = linePoints[linePoints.length - 1]!;
  const firstPt = linePoints[0]!;
  const areaD =
    points.length > 1
      ? `${lineD} L ${lastPt.x.toFixed(1)} ${zeroY.toFixed(1)} L ${firstPt.x.toFixed(1)} ${zeroY.toFixed(1)} Z`
      : "";

  const barWidth = Math.max(6, Math.min(20, (innerW / Math.max(1, points.length)) * 0.55));
  const maxMonth = Math.max(1, ...points.map((p) => Math.abs(p.monthTotal)));
  const barZone = innerH * 0.3;

  const showEvery = Math.max(1, Math.ceil(points.length / 6));
  const lastValue = points[points.length - 1]!.cumulativeTotal;
  // Keep the last-value badge inside the canvas.
  const badgeY = Math.max(12, Math.min(HEIGHT - PAD_BOTTOM, lastPt.y - 10));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Savings trend: ${formatGBPCompact(lastValue)} cumulative`}
    >
      <defs>
        <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.3} />
          <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0.02} />
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

      {/* Zero baseline — solid, slightly stronger when negatives exist */}
      <line
        x1={PAD_X}
        y1={zeroY}
        x2={PAD_X + innerW}
        y2={zeroY}
        stroke={GRID_COLOR}
        strokeWidth={1}
        opacity={minCum < 0 ? 0.9 : 0.6}
      />

      {/* Area + line */}
      {areaD && <path d={areaD} fill="url(#trend-area)" />}
      <path d={lineD} stroke={LINE_COLOR} strokeWidth={2.5} fill="none" strokeLinecap="round" />

      {/* Monthly bars anchored at the zero line */}
      {points.map((p, i) => {
        const x = xFor(i);
        const h = (Math.abs(p.monthTotal) / maxMonth) * barZone;
        const isNeg = p.monthTotal < 0;
        const y = isNeg ? zeroY : zeroY - h;
        const colour = isNeg ? NEG_BAR_COLOR : POS_BAR_COLOR;
        const isLast = i === points.length - 1;
        return (
          <g key={p.month}>
            {p.monthTotal !== 0 && (
              <rect
                x={x - barWidth / 2}
                y={y}
                width={barWidth}
                height={Math.max(2, h)}
                rx={2}
                style={{ fill: colour }}
                opacity={0.3}
              />
            )}
            {isLast && (
              <circle cx={x} cy={yFor(p.cumulativeTotal)} r={7} fill={LINE_COLOR} opacity={0.2} />
            )}
            <circle
              cx={x}
              cy={yFor(p.cumulativeTotal)}
              r={isLast ? 4 : 2.5}
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

      {/* Latest cumulative value, pinned to the line's end */}
      <text
        x={Math.min(lastPt.x, WIDTH - 6)}
        y={badgeY}
        textAnchor="end"
        className="fill-ink"
        style={{ fontSize: 12, fontWeight: 700 }}
      >
        {formatGBPCompact(lastValue)}
      </text>

      {/* Domain labels */}
      <text
        x={PAD_X + 2}
        y={PAD_TOP - 8}
        className="fill-ink-muted"
        style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em" }}
      >
        {formatGBPCompact(maxCum)}
      </text>
      {minCum < 0 && (
        <text
          x={PAD_X + 2}
          y={PAD_TOP + innerH + 12}
          className="fill-status-over"
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          {formatGBPCompact(minCum)}
        </text>
      )}
    </svg>
  );
}
