import type { MonthlyNetWorth } from "../app/wealth.js";
import { ASSET_CLASSES, ASSET_CLASS_META } from "../app/wealth.js";
import { formatGBP, formatGBPShort } from "../app/utils/money.js";
import { monthLabel, shortMonthLabel } from "../app/utils/month.js";
import { bandLayout, catmullRomPath, niceTicks, useScrub } from "./chartUtils.js";

const WIDTH = 480;
const HEIGHT = 230;
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;
const GRID = "rgb(var(--c-surface-border))";
const LINE = "rgb(var(--c-ink))";

/**
 * Month-end balance sheet: stacked asset classes above zero, debts below,
 * with the net worth line threaded through. Tap or drag to inspect a month.
 */
export function NetWorthChart({ points }: { points: MonthlyNetWorth[] }) {
  const layout = bandLayout(points.length, PAD_X, WIDTH);
  const { active, handlers } = useScrub(points.length, WIDTH, layout.indexAt);
  if (points.length === 0) return null;

  const withData = points.filter((p) => p.hasData);
  const maxUp = Math.max(0, ...withData.map((p) => Math.max(p.assets, p.netWorth)));
  const maxDown = Math.min(0, ...withData.map((p) => Math.min(-p.liabilities, p.netWorth)));
  const ticks = niceTicks(maxDown, maxUp, 4);
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const yFor = (v: number) => PAD_TOP + innerH * (1 - (v - lo) / (hi - lo || 1));
  const zeroY = yFor(0);
  const barW = Math.max(4, Math.min(22, layout.step * 0.62));
  const showEvery = Math.max(1, Math.ceil(points.length / 6));

  const line = catmullRomPath(
    points.flatMap((p, i) => (p.hasData ? [{ x: layout.xFor(i), y: yFor(p.netWorth) }] : [])),
  );
  const sel = points[active]!;
  const selX = layout.xFor(active);

  return (
    <div>
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-ink-muted">{monthLabel(sel.month)}</p>
          <p className="mt-0.5 text-[22px] font-semibold tracking-tight text-ink stat-num">
            {sel.hasData ? (sel.netWorth < 0 ? "−" : "") + formatGBP(Math.abs(sel.netWorth)) : "No data"}
          </p>
        </div>
        {sel.hasData && (
          <dl className="grid grid-cols-2 gap-x-4 text-right">
            <dt className="text-[11px] text-ink-muted">Assets</dt>
            <dt className="text-[11px] text-ink-muted">Debts</dt>
            <dd className="text-[13px] font-semibold text-ink stat-num">{formatGBPShort(sel.assets)}</dd>
            <dd className="text-[13px] font-semibold text-debt stat-num">
              {sel.liabilities > 0 ? "−" : ""}
              {formatGBPShort(sel.liabilities)}
            </dd>
          </dl>
        )}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-3 w-full h-auto touch-pan-y select-none cursor-crosshair"
        role="img"
        aria-label={`Net worth by month. ${monthLabel(sel.month)}: ${formatGBP(sel.netWorth)}`}
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
            <text
              x={PAD_X + 2}
              y={yFor(t) - 4}
              className="fill-ink-muted"
              style={{ fontSize: 10, fontWeight: 500 }}
            >
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
          if (!p.hasData) return null;
          const x = layout.xFor(i) - barW / 2;
          let acc = 0;
          const dim = i === active ? 1 : 0.62;
          return (
            <g key={p.month} opacity={dim}>
              {ASSET_CLASSES.map((k) => {
                const v = p.byClass[k];
                if (v <= 0) return null;
                const y0 = yFor(acc);
                acc += v;
                const y1 = yFor(acc);
                return (
                  <rect
                    key={k}
                    x={x}
                    y={y1}
                    width={barW}
                    height={Math.max(1, y0 - y1)}
                    fill={`rgb(var(${ASSET_CLASS_META[k].colourVar}))`}
                  />
                );
              })}
              {p.liabilities > 0 && (
                <rect
                  x={x}
                  y={zeroY}
                  width={barW}
                  height={Math.max(1, yFor(-p.liabilities) - zeroY)}
                  fill="rgb(var(--c-debt) / 0.75)"
                />
              )}
            </g>
          );
        })}

        <path d={line} fill="none" stroke={LINE} strokeWidth={2} strokeLinecap="round" />
        {sel.hasData && (
          <>
            <circle cx={selX} cy={yFor(sel.netWorth)} r={7} fill={LINE} opacity={0.15} />
            <circle
              cx={selX}
              cy={yFor(sel.netWorth)}
              r={3.5}
              fill="rgb(var(--c-surface-card))"
              stroke={LINE}
              strokeWidth={2}
            />
          </>
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
        {ASSET_CLASSES.filter((k) => withData.some((p) => p.byClass[k] > 0)).map((k) => (
          <li key={k} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span
              className="size-2 rounded-sm"
              style={{ background: `rgb(var(${ASSET_CLASS_META[k].colourVar}))` }}
              aria-hidden="true"
            />
            {ASSET_CLASS_META[k].label}
          </li>
        ))}
        {withData.some((p) => p.liabilities > 0) && (
          <li className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className="size-2 rounded-sm bg-debt/75" aria-hidden="true" />
            Debts
          </li>
        )}
        <li className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="w-3 h-0.5 rounded-full bg-ink" aria-hidden="true" />
          Net worth
        </li>
      </ul>
    </div>
  );
}
