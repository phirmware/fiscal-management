import type { CashFlowMonth } from "../app/wealth.js";
import { formatGBP, formatGBPShort } from "../app/utils/money.js";
import { monthLabel, shortMonthLabel } from "../app/utils/month.js";
import { bandLayout, catmullRomPath, niceTicks, useScrub } from "./chartUtils.js";

const WIDTH = 480;
const HEIGHT = 240;
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;
const GRID = "rgb(var(--c-surface-border))";

/**
 * Money in vs. money out. Income rises above the baseline, Needs + Wants
 * hang below it, and the dotted line tracks what was left over each month.
 */
export function CashFlowChart({ points }: { points: CashFlowMonth[] }) {
  const layout = bandLayout(points.length, PAD_X, WIDTH);
  const { active, handlers } = useScrub(points.length, WIDTH, layout.indexAt);
  if (points.length === 0) return null;

  const maxUp = Math.max(0, ...points.map((p) => Math.max(p.income, p.net)));
  const maxDown = Math.min(0, ...points.map((p) => Math.min(-p.spending, p.net)));
  const ticks = niceTicks(maxDown, maxUp, 4);
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const yFor = (v: number) => PAD_TOP + innerH * (1 - (v - lo) / (hi - lo || 1));
  const zeroY = yFor(0);
  const barW = Math.max(4, Math.min(20, layout.step * 0.56));
  const showEvery = Math.max(1, Math.ceil(points.length / 6));
  const netLine = catmullRomPath(
    points.flatMap((p, i) => (p.hasData ? [{ x: layout.xFor(i), y: yFor(p.net) }] : [])),
  );
  const sel = points[active]!;
  const selX = layout.xFor(active);

  return (
    <div>
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-ink-muted">{monthLabel(sel.month)}</p>
          <p
            className={`mt-0.5 text-[22px] font-semibold tracking-tight stat-num ${
              sel.net < 0 ? "text-status-over" : "text-ink"
            }`}
          >
            {sel.net > 0 ? "+" : sel.net < 0 ? "−" : ""}
            {formatGBP(Math.abs(sel.net))}
          </p>
          <p className="text-[11px] text-ink-muted">
            {sel.savingsRate === null
              ? "No income recorded"
              : `${Math.round(sel.savingsRate * 100)}% of income kept`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 text-right">
          <dt className="text-[11px] text-ink-muted">In</dt>
          <dt className="text-[11px] text-ink-muted">Out</dt>
          <dd className="text-[13px] font-semibold text-status-ok stat-num">{formatGBPShort(sel.income)}</dd>
          <dd className="text-[13px] font-semibold text-ink stat-num">
            {sel.spending > 0 ? "−" : ""}
            {formatGBPShort(sel.spending)}
          </dd>
        </dl>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-3 w-full h-auto touch-pan-y select-none cursor-crosshair"
        role="img"
        aria-label={`Cash flow by month. ${monthLabel(sel.month)}: ${formatGBP(sel.income)} in, ${formatGBP(sel.spending)} out`}
        {...handlers}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke={GRID}
              strokeDasharray={t === 0 ? undefined : "2 4"}
              opacity={t === 0 ? 0.9 : 0.55}
            />
            <text x={PAD_X + 2} y={yFor(t) - 4} className="fill-ink-muted" style={{ fontSize: 10, fontWeight: 500 }}>
              {formatGBPShort(t)}
            </text>
          </g>
        ))}

        <rect
          x={selX - layout.step / 2}
          y={PAD_TOP}
          width={layout.step}
          height={innerH}
          rx={6}
          fill="rgb(var(--c-ink) / 0.05)"
        />

        {points.map((p, i) => {
          const x = layout.xFor(i) - barW / 2;
          const needsH = yFor(-p.needs) - zeroY;
          const wantsH = yFor(-p.spending) - yFor(-p.needs);
          return (
            <g key={p.month} opacity={i === active ? 1 : 0.6}>
              {p.income > 0 && (
                <rect
                  x={x}
                  y={yFor(p.income)}
                  width={barW}
                  height={Math.max(1, zeroY - yFor(p.income))}
                  rx={2}
                  fill="rgb(var(--c-status-ok) / 0.85)"
                />
              )}
              {p.needs > 0 && (
                <rect x={x} y={zeroY} width={barW} height={Math.max(1, needsH)} fill="rgb(var(--c-group-needs))" />
              )}
              {p.wants > 0 && (
                <rect
                  x={x}
                  y={zeroY + needsH}
                  width={barW}
                  height={Math.max(1, wantsH)}
                  rx={2}
                  fill="rgb(var(--c-group-wants))"
                />
              )}
            </g>
          );
        })}

        <path
          d={netLine}
          fill="none"
          stroke="rgb(var(--c-ink))"
          strokeWidth={1.75}
          strokeDasharray="1 4"
          strokeLinecap="round"
        />
        {points.map((p, i) =>
          p.hasData ? (
            <circle
              key={p.month}
              cx={layout.xFor(i)}
              cy={yFor(p.net)}
              r={i === active ? 4 : 2.5}
              fill={p.net < 0 ? "rgb(var(--c-status-over))" : "rgb(var(--c-ink))"}
              stroke="rgb(var(--c-surface-card))"
              strokeWidth={i === active ? 2 : 1}
            />
          ) : null,
        )}

        {points.map((p, i) =>
          i % showEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.month}
              x={layout.xFor(i)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className={i === active ? "fill-ink" : "fill-ink-muted"}
              style={{ fontSize: 10, fontWeight: i === active ? 600 : 500 }}
            >
              {shortMonthLabel(p.month).replace(/ (\d\d)(\d\d)$/, " ’$2")}
            </text>
          ) : null,
        )}
      </svg>

      <ul role="list" className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 px-1">
        <Legend swatch="bg-status-ok/85" label="Income" />
        <Legend swatch="bg-group-needs" label="Needs" />
        <Legend swatch="bg-group-wants" label="Wants" />
        <li className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="w-3 border-t-2 border-dotted border-ink" aria-hidden="true" />
          Left over
        </li>
      </ul>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-[11px] text-ink-soft">
      <span className={`size-2 rounded-sm ${swatch}`} aria-hidden="true" />
      {label}
    </li>
  );
}
