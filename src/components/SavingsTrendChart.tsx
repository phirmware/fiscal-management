import type { SavingsTrendPoint } from "../app/insights.js";
import { formatGBP } from "../app/utils/money.js";
import { shortMonthLabel } from "../app/utils/month.js";

interface Props {
  points: SavingsTrendPoint[];
}

const WIDTH = 480;
const HEIGHT = 200;
const PAD_X = 28;
const PAD_TOP = 16;
const PAD_BOTTOM = 36;

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

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)} ${yFor(p.cumulativeTotal).toFixed(1)}`)
    .join(" ");

  const areaD = `${pathD} L${xFor(points.length - 1).toFixed(1)} ${(PAD_TOP + innerH).toFixed(1)} L${xFor(0).toFixed(1)} ${(PAD_TOP + innerH).toFixed(1)} Z`;

  const barWidth = Math.max(4, Math.min(24, (innerW / Math.max(1, points.length)) * 0.5));
  const maxMonth = Math.max(1, ...points.map((p) => Math.abs(p.monthTotal)));

  const showEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto"
      role="img"
      aria-label="Savings trend chart"
    >
      <path d={areaD} fill="#05966915" />
      <path d={pathD} stroke="#059669" strokeWidth={2} fill="none" />

      {points.map((p, i) => {
        const x = xFor(i);
        const h = (Math.abs(p.monthTotal) / maxMonth) * (innerH * 0.4);
        const y = p.monthTotal >= 0 ? PAD_TOP + innerH - h : PAD_TOP + innerH;
        const colour = p.monthTotal >= 0 ? "#05966960" : "#dc262660";
        return (
          <g key={p.month}>
            <rect x={x - barWidth / 2} y={y} width={barWidth} height={Math.max(1, h)} fill={colour} />
            <circle cx={x} cy={yFor(p.cumulativeTotal)} r={3} fill="#059669" />
            {i % showEvery === 0 && (
              <text
                x={x}
                y={HEIGHT - 18}
                textAnchor="middle"
                className="fill-ink-muted"
                style={{ fontSize: 10 }}
              >
                {shortMonthLabel(p.month)}
              </text>
            )}
          </g>
        );
      })}

      <text x={PAD_X} y={12} className="fill-ink-muted" style={{ fontSize: 10 }}>
        {formatGBP(maxCum)}
      </text>
      <text x={PAD_X} y={HEIGHT - 4} className="fill-ink-muted" style={{ fontSize: 10 }}>
        £0
      </text>
    </svg>
  );
}
